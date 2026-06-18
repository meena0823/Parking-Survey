import { useCallback, useEffect, useRef, useState } from 'react';
import { createNotification, notificationExists } from '../lib/database';
import type { SurveyProject, SurveySlot } from '../lib/types';

export type ReminderType = 'upcoming_slot' | 'slot_not_started' | 'slot_ending_soon';

export interface ReminderAlert {
  type: ReminderType;
  slot: SurveySlot;
  /** Whole seconds until the event (positive = in future). */
  secondsUntil: number;
}

function toTimestamp(surveyDate: string, timeStr: string): Date {
  return new Date(`${surveyDate}T${timeStr}`);
}

/**
 * Provides timing-based slot reminder alerts for the Team Head.
 * Checks every 30 s; manages dedup via refs so alerts don't repeat within
 * the same session.
 */
export function useSlotReminders(
  project: SurveyProject | null,
  slots: SurveySlot[],
  teamHeadId: string | null,
) {
  const [alert, setAlert] = useState<ReminderAlert | null>(null);

  // Track which (slotId:type) alerts have already fired this session
  const firedRef = useRef<Set<string>>(new Set());
  // Track last fired time for "slot_not_started" repeats (every 2 min)
  const lastNotStartedRef = useRef<Map<string, number>>(new Map());

  const check = useCallback(() => {
    if (!project || project.status !== 'active') return;

    const now = Date.now();
    const activeSlot = slots.find(s => s.status === 'active');
    const pendingSlots = [...slots]
      .filter(s => s.status === 'pending')
      .sort((a, b) => a.slot_number - b.slot_number);
    const nextPending = pendingSlots[0] ?? null;

    // ── 1. UPCOMING SLOT (1 min before planned start) ─────────────────────
    if (!activeSlot && nextPending) {
      const plannedStart = toTimestamp(project.survey_date, nextPending.start_time);
      const secUntil = Math.floor((plannedStart.getTime() - now) / 1000);
      const key = `${nextPending.id}:upcoming_slot`;
      // Fire when 30–90 s before start
      if (secUntil >= 0 && secUntil <= 90 && !firedRef.current.has(key)) {
        firedRef.current.add(key);
        setAlert({ type: 'upcoming_slot', slot: nextPending, secondsUntil: secUntil });
        if (teamHeadId) {
          notificationExists(project.id, 'upcoming_slot', nextPending.id, 5 * 60 * 1000)
            .then(exists => {
              if (!exists) {
                createNotification({
                  project_id: project.id,
                  team_head_id: teamHeadId,
                  type: 'upcoming_slot',
                  title: `Slot ${nextPending.slot_number} starts in ~1 minute`,
                  message: `Planned: ${nextPending.start_time.slice(0, 5)} – ${nextPending.end_time.slice(0, 5)}`,
                  slot_id: nextPending.id,
                });
              }
            });
        }
        return;
      }
    }

    // ── 2. SLOT NOT STARTED (past planned start, no active slot) ──────────
    if (!activeSlot && nextPending) {
      const plannedStart = toTimestamp(project.survey_date, nextPending.start_time);
      const msLate = now - plannedStart.getTime();
      if (msLate > 0) {
        const lastTime = lastNotStartedRef.current.get(nextPending.id) ?? 0;
        const msSinceLast = now - lastTime;
        // Repeat every 2 min
        if (msSinceLast >= 2 * 60 * 1000) {
          lastNotStartedRef.current.set(nextPending.id, now);
          setAlert({
            type: 'slot_not_started',
            slot: nextPending,
            secondsUntil: -Math.floor(msLate / 1000),
          });
          if (teamHeadId) {
            notificationExists(project.id, 'slot_not_started', nextPending.id, 2 * 60 * 1000)
              .then(exists => {
                if (!exists) {
                  createNotification({
                    project_id: project.id,
                    team_head_id: teamHeadId,
                    type: 'slot_not_started',
                    title: `Slot ${nextPending.slot_number} has not started`,
                    message: `Planned start was ${nextPending.start_time.slice(0, 5)}. Start the slot now.`,
                    slot_id: nextPending.id,
                  });
                }
              });
          }
          return;
        }
      }
    }

    // ── 3. SLOT ENDING SOON (1 min before planned end) ─────────────────────
    if (activeSlot) {
      const plannedEnd = toTimestamp(project.survey_date, activeSlot.end_time);
      const secUntil = Math.floor((plannedEnd.getTime() - now) / 1000);
      const key = `${activeSlot.id}:slot_ending_soon`;
      if (secUntil >= 0 && secUntil <= 90 && !firedRef.current.has(key)) {
        firedRef.current.add(key);
        setAlert({ type: 'slot_ending_soon', slot: activeSlot, secondsUntil: secUntil });
        if (teamHeadId) {
          notificationExists(project.id, 'slot_ending_soon', activeSlot.id, 5 * 60 * 1000)
            .then(exists => {
              if (!exists) {
                createNotification({
                  project_id: project.id,
                  team_head_id: teamHeadId,
                  type: 'slot_ending_soon',
                  title: `Slot ${activeSlot.slot_number} ending in ~1 minute`,
                  message: `Planned end: ${activeSlot.end_time.slice(0, 5)}. Complete, extend, or continue.`,
                  slot_id: activeSlot.id,
                });
              }
            });
        }
        return;
      }
    }
  }, [project, slots, teamHeadId]);

  useEffect(() => {
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [check]);

  // When the active slot changes, clear ended-soon alerts for old slots
  useEffect(() => {
    setAlert(prev => {
      if (!prev) return null;
      const slot = slots.find(s => s.id === prev.slot.id);
      if (!slot || slot.status === 'completed' || slot.status === 'cancelled') return null;
      return prev;
    });
  }, [slots]);

  const dismissAlert = useCallback(() => setAlert(null), []);

  const remindLater = useCallback(() => {
    if (alert?.type === 'upcoming_slot' || alert?.type === 'slot_ending_soon') {
      // Remove from fired set so it can fire again soon
      firedRef.current.delete(`${alert.slot.id}:${alert.type}`);
    }
    setAlert(null);
  }, [alert]);

  return { alert, dismissAlert, remindLater };
}
