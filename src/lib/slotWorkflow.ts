import type { Enumerator, SlotCompletion, SurveyProject, SurveySlot } from './types';

/**
 * Returns the first slot that is not yet completed or cancelled.
 * Used to determine the "current" slot shown to both Team Head and Enumerators.
 */
export function getCurrentSlot(slots: SurveySlot[]): SurveySlot | null {
  const ordered = [...slots].sort((a, b) => a.slot_number - b.slot_number);
  return ordered.find(s => s.status !== 'completed' && s.status !== 'cancelled') ?? null;
}

/** Returns the first pending slot in slot_number order. */
export function getNextPendingSlot(slots: SurveySlot[]): SurveySlot | null {
  return [...slots]
    .sort((a, b) => a.slot_number - b.slot_number)
    .find(s => s.status === 'pending') ?? null;
}

/** Returns the most recently completed slot (highest slot_number among completed). */
export function getLastCompletedSlot(slots: SurveySlot[]): SurveySlot | null {
  const completed = slots.filter(s => s.status === 'completed');
  if (completed.length === 0) return null;
  return completed.reduce((prev, cur) => cur.slot_number > prev.slot_number ? cur : prev);
}

export interface BreakStatus {
  isBreak: boolean;
  lastCompletedSlot: SurveySlot | null;
  nextPendingSlot: SurveySlot | null;
  /** ISO timestamp when the break ends (= planned start_time of next slot on survey_date). */
  breakEndsAt: Date | null;
  /** Seconds remaining until next slot starts (negative = overdue). */
  secondsUntilNextSlot: number | null;
}

/**
 * Determines if the survey is currently in a break period.
 * A break is in effect when there is no active slot, at least one completed slot,
 * and at least one pending slot still to run.
 */
export function getBreakStatus(project: SurveyProject, slots: SurveySlot[]): BreakStatus {
  const activeSlot = slots.find(s => s.status === 'active') ?? null;
  const lastCompleted = getLastCompletedSlot(slots);
  const nextPending = getNextPendingSlot(slots);
  const isBreak = !activeSlot && !!lastCompleted && !!nextPending;

  let breakEndsAt: Date | null = null;
  let secondsUntilNextSlot: number | null = null;

  if (isBreak && nextPending) {
    breakEndsAt = new Date(`${project.survey_date}T${nextPending.start_time}`);
    secondsUntilNextSlot = Math.floor((breakEndsAt.getTime() - Date.now()) / 1000);
  }

  return { isBreak, lastCompletedSlot: lastCompleted, nextPendingSlot: nextPending, breakEndsAt, secondsUntilNextSlot };
}

export function getCompletionSummary(
  slotId: string,
  enumerators: Enumerator[],
  completions: SlotCompletion[]
): { completed: number; total: number; allDone: boolean } {
  const enumeratorIds = new Set(enumerators.map(e => e.id));
  const completed = completions.filter(
    c => c.slot_id === slotId && c.status === 'completed' && enumeratorIds.has(c.enumerator_id)
  ).length;
  const total = enumerators.length;
  return { completed, total, allDone: total > 0 && completed >= total };
}

export function getPendingCompletionRows(
  projectId: string,
  slotId: string,
  enumerators: Enumerator[],
  completions: SlotCompletion[]
): Array<Omit<SlotCompletion, 'id' | 'created_at'>> {
  const existing = new Set(
    completions.filter(c => c.slot_id === slotId).map(c => `${c.slot_id}:${c.enumerator_id}`)
  );
  return enumerators
    .filter(e => !existing.has(`${slotId}:${e.id}`))
    .map(e => ({
      project_id: projectId,
      slot_id: slotId,
      enumerator_id: e.id,
      status: 'pending' as const,
      completed_at: null,
    }));
}
