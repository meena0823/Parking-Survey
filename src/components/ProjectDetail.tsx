import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  getSlots, getEnumerators, getCaptures, getRoomForProject, updateProject, updateSlot, updateRoom,
  getSlotCompletions, bulkUpdateSlotStatus,
} from '../lib/database';
import type { SurveyProject, SurveySlot, Enumerator, SurveyRoom, VehicleCapture, SlotCompletion } from '../lib/types';
import { VEHICLE_CATEGORIES } from '../lib/types';
import {
  ArrowLeft, Clock, Users, Camera, Play, Copy, Check, Radio, Wifi, Battery,
  Map as MapIcon, BarChart3, MessageSquare, ChevronLeft, ChevronRight,
  AlertTriangle, Pencil, X, Bell, Timer, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getBreakStatus, getCompletionSummary, getCurrentSlot } from '../lib/slotWorkflow';
import SurveyTimeline from './SurveyTimeline';
import NotificationCenter from './NotificationCenter';
import { useSlotReminders } from '../hooks/useSlotReminders';

interface Props { project: SurveyProject; onBack: () => void; onNavigate: (view: string, data?: any) => void; }

function fmt(time: string) { return time.slice(0, 5); }
function fmtTs(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function ProjectDetail({ project, onBack, onNavigate }: Props) {
  const { teamHead } = useAuth();
  const actorName = teamHead?.full_name ?? 'Team Head';

  // ── core data ──────────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<SurveySlot[]>([]);
  const [enumerators, setEnumerators] = useState<Enumerator[]>([]);
  const [captures, setCaptures] = useState<VehicleCapture[]>([]);
  const [slotCompletions, setSlotCompletions] = useState<SlotCompletion[]>([]);
  const [room, setRoom] = useState<SurveyRoom | null>(null);
  const [loading, setLoading] = useState(true);

  // local project status so TH sees instant feedback after End Survey
  const [projectStatus, setProjectStatus] = useState<SurveyProject['status']>(project.status);

  // ── UI states ───────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [surveyStarted, setSurveyStarted] = useState(false);
  const [enumeratorIdx, setEnumeratorIdx] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('right');
  const [controlsLoading, setControlsLoading] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);

  // break period countdown (refreshed every second)
  const [breakSecondsLeft, setBreakSecondsLeft] = useState<number | null>(null);

  // modals
  const [pendingStartSlot, setPendingStartSlot] = useState<SurveySlot | null>(null);
  const [showForceCompleteModal, setShowForceCompleteModal] = useState(false);
  const [completionReason, setCompletionReason] = useState('');
  const [showEditTimingModal, setShowEditTimingModal] = useState(false);
  const [editSlotStart, setEditSlotStart] = useState('');
  const [editSlotEnd, setEditSlotEnd] = useState('');
  const [showEndSurveyModal, setShowEndSurveyModal] = useState(false);
  const [endSurveyText, setEndSurveyText] = useState('');

  // ── load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [s, e, c, r, completions] = await Promise.all([
        getSlots(project.id),
        getEnumerators(project.id),
        getCaptures(project.id),
        getRoomForProject(project.id),
        getSlotCompletions(project.id),
      ]);
      setSlots(s); setEnumerators(e); setCaptures(c); setRoom(r); setSlotCompletions(completions);
      console.log('[ProjectDetail] Loaded project=%s  slots=%d  statuses=[%s]',
        project.id, s.length, s.map((sl: import('../lib/types').SurveySlot) => sl.status).join(', '));
      setLoading(false);
    }
    load();
  }, [project.id]);

  // ── realtime subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`project-detail-${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_slots', filter: `project_id=eq.${project.id}` },
        async () => setSlots(await getSlots(project.id)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_completions', filter: `project_id=eq.${project.id}` },
        async () => setSlotCompletions(await getSlotCompletions(project.id)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enumerators', filter: `project_id=eq.${project.id}` },
        async () => setEnumerators(await getEnumerators(project.id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]);

  // ── break period countdown ──────────────────────────────────────────────────
  const breakInfo = useMemo(() => getBreakStatus(project, slots), [project, slots]);

  useEffect(() => {
    if (!breakInfo.isBreak || breakInfo.breakEndsAt === null) {
      setBreakSecondsLeft(null);
      return;
    }
    const tick = () => {
      const secs = Math.floor((breakInfo.breakEndsAt!.getTime() - Date.now()) / 1000);
      setBreakSecondsLeft(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [breakInfo.isBreak, breakInfo.breakEndsAt?.getTime()]);

  // ── slot reminders ──────────────────────────────────────────────────────────
  const { alert: reminderAlert, dismissAlert, remindLater } = useSlotReminders(
    projectStatus === 'active' ? project : null,
    slots,
    teamHead?.id ?? null,
  );

  // ── survey start (initial) ──────────────────────────────────────────────────
  async function startSurvey() {
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) { clearInterval(interval); setCountdown(null); startSurveyForReal(); return null; }
        return prev - 1;
      });
    }, 1000);
  }

  async function startSurveyForReal() {
    await updateProject(project.id, { status: 'active' });
    if (room) await updateRoom(room.id, { started_at: new Date().toISOString() });
    setSurveyStarted(true);
    setProjectStatus('active');
    setSlots(await getSlots(project.id));
  }

  // ── slot lifecycle controls ─────────────────────────────────────────────────
  async function startSlotManually(slot: SurveySlot) {
    setControlsLoading(true);
    try {
      const alreadyActive = slots.find(s => s.status === 'active');
      if (alreadyActive) {
        await updateSlot(alreadyActive.id, {
          status: 'completed',
          actual_completed_at: new Date().toISOString(),
          completed_by: actorName,
        });
      }
      await updateSlot(slot.id, {
        status: 'active',
        actual_started_at: new Date().toISOString(),
        started_by: actorName,
      });
      setSlots(await getSlots(project.id));
      setPendingStartSlot(null);
    } finally {
      setControlsLoading(false);
    }
  }

  async function forceCompleteCurrentSlot() {
    const active = slots.find(s => s.status === 'active');
    if (!active) return;
    setControlsLoading(true);
    try {
      await updateSlot(active.id, {
        status: 'completed',
        actual_completed_at: new Date().toISOString(),
        completed_by: actorName,
        completion_reason: completionReason.trim() || undefined,
      });
      setSlots(await getSlots(project.id));
      setShowForceCompleteModal(false);
      setCompletionReason('');
    } finally {
      setControlsLoading(false);
    }
  }

  async function saveSlotTiming() {
    const active = slots.find(s => s.status === 'active');
    if (!active) return;
    setControlsLoading(true);
    try {
      await updateSlot(active.id, { start_time: editSlotStart, end_time: editSlotEnd });
      setSlots(await getSlots(project.id));
      setShowEditTimingModal(false);
    } finally {
      setControlsLoading(false);
    }
  }

  async function endSurvey() {
    if (endSurveyText !== 'END SURVEY') return;
    setControlsLoading(true);
    try {
      const toCancel = slots.filter(s => s.status === 'pending' || s.status === 'active');
      if (toCancel.length > 0) {
        await bulkUpdateSlotStatus(project.id, toCancel.map(s => ({ slotId: s.id, status: 'cancelled' as SurveySlot['status'] })));
      }
      await updateProject(project.id, { status: 'cancelled' });
      if (room) await updateRoom(room.id, { completed_at: new Date().toISOString() });
      setProjectStatus('cancelled');
      setSlots(await getSlots(project.id));
      setShowEndSurveyModal(false);
      setEndSurveyText('');
    } finally {
      setControlsLoading(false);
    }
  }

  function copyRoomCode() {
    navigator.clipboard.writeText(project.room_code); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── derived state ───────────────────────────────────────────────────────────
  const totalCaptures = captures.length;
  const activeSlot = slots.find(s => s.status === 'active') ?? null;
  const currentSlot = useMemo(() => getCurrentSlot(slots), [slots]);
  const pendingSlots = useMemo(() =>
    slots.filter(s => s.status === 'pending').sort((a, b) => a.slot_number - b.slot_number),
    [slots]
  );
  const nextPendingSlot = pendingSlots[0] ?? null;
  const completedCount = slots.filter(s => s.status === 'completed').length;
  const progress = slots.length > 0 ? (completedCount / slots.length) * 100 : 0;
  const activeCompletion = activeSlot ? getCompletionSummary(activeSlot.id, enumerators, slotCompletions) : null;

  // Is an upcoming slot start early possible?
  const isEarlyStart = !activeSlot && nextPendingSlot && (() => {
    const planned = new Date(`${project.survey_date}T${nextPendingSlot.start_time}`);
    return Date.now() < planned.getTime();
  })();

  const selectedEnumerator = enumerators[enumeratorIdx] ?? null;
  const enumeratorCaptures = selectedEnumerator ? captures.filter(c => c.enumerator_id === selectedEnumerator.id) : [];
  const enumeratorTotal = enumeratorCaptures.length;
  const vehicleSummary = VEHICLE_CATEGORIES.map(cat => ({ ...cat, count: enumeratorCaptures.filter(c => c.vehicle_type === cat.key).length }));

  function prevEnumerator() { if (enumeratorIdx <= 0) return; setSlideDir('left'); setEnumeratorIdx(i => i - 1); }
  function nextEnumerator() { if (enumeratorIdx >= enumerators.length - 1) return; setSlideDir('right'); setEnumeratorIdx(i => i + 1); }

  const slotStatusStyle = (status: SurveySlot['status']) => ({
    border: status === 'active' ? 'border-blue-300 bg-blue-50'
      : status === 'completed' ? 'border-emerald-300 bg-emerald-50'
      : status === 'cancelled' ? 'border-red-200 bg-red-50'
      : 'border-slate-200 bg-white',
    dot: status === 'active' ? 'bg-blue-500'
      : status === 'completed' ? 'bg-emerald-500'
      : status === 'cancelled' ? 'bg-red-400'
      : 'bg-slate-200',
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Countdown overlay ── */}
      {countdown !== null && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white text-xl mb-4">Survey starts in...</p>
            <p className="text-8xl font-bold text-blue-400 animate-pulse">{countdown}</p>
          </div>
        </div>
      )}

      {/* ── Reminder Alert Modal ── */}
      {reminderAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm">
            {reminderAlert.type === 'upcoming_slot' && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Bell className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Upcoming Slot Alert</h3>
                    <p className="text-xs text-slate-500">Slot {reminderAlert.slot.slot_number} starts soon</p>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                  <p className="text-sm font-medium text-blue-900">Slot {reminderAlert.slot.slot_number} starts in ~1 minute</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Scheduled: {fmt(reminderAlert.slot.start_time)} – {fmt(reminderAlert.slot.end_time)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={remindLater} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    Remind Later
                  </button>
                  <button
                    onClick={() => { dismissAlert(); setPendingStartSlot(reminderAlert.slot); }}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Start Slot
                  </button>
                </div>
              </>
            )}

            {reminderAlert.type === 'slot_not_started' && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Slot Start Time Reached</h3>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  Slot {reminderAlert.slot.slot_number} has not been started. Planned start: {fmt(reminderAlert.slot.start_time)}.
                </p>
                <div className="flex gap-2">
                  <button onClick={dismissAlert} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    Dismiss
                  </button>
                  <button
                    onClick={() => { dismissAlert(); setPendingStartSlot(reminderAlert.slot); }}
                    className="flex-1 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors"
                  >
                    Start Now
                  </button>
                </div>
              </>
            )}

            {reminderAlert.type === 'slot_ending_soon' && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                    <Timer className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Slot Ending Soon</h3>
                    <p className="text-xs text-slate-500">~1 minute remaining</p>
                  </div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
                  <p className="text-sm font-medium text-orange-900">Slot {reminderAlert.slot.slot_number} ends at {fmt(reminderAlert.slot.end_time)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={remindLater} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    Continue
                  </button>
                  <button
                    onClick={() => { dismissAlert(); setShowForceCompleteModal(true); }}
                    className="flex-1 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 transition-colors"
                  >
                    Complete Slot
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm Start Slot modal ── */}
      {pendingStartSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPendingStartSlot(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 text-lg mb-1">Start Slot {pendingStartSlot.slot_number}?</h3>
            <p className="text-sm text-slate-500">
              Planned: {fmt(pendingStartSlot.start_time)} – {fmt(pendingStartSlot.end_time)}
            </p>
            <p className="text-sm text-slate-500 mt-1">Actual start will be recorded as now.</p>
            {/* Early start indicator */}
            {(() => {
              const planned = new Date(`${project.survey_date}T${pendingStartSlot.start_time}`);
              const early = Date.now() < planned.getTime();
              return early ? (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  Starting early — planned start is {fmt(pendingStartSlot.start_time)}. Both planned and actual times will be recorded in reports.
                </div>
              ) : null;
            })()}
            {activeSlot && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                Slot {activeSlot.slot_number} is currently active and will be marked completed automatically.
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setPendingStartSlot(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => startSlotManually(pendingStartSlot)} disabled={controlsLoading} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {controlsLoading ? 'Starting…' : 'Start Slot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Force Complete modal ── */}
      {showForceCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForceCompleteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 text-lg mb-1">Force Complete Slot {activeSlot?.slot_number}?</h3>
            <p className="text-sm text-slate-500 mb-4">The next slot will NOT start automatically.</p>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              rows={3}
              value={completionReason}
              onChange={e => setCompletionReason(e.target.value)}
              placeholder="e.g. Survey area cleared, enumerator done early…"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowForceCompleteModal(false); setCompletionReason(''); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={forceCompleteCurrentSlot} disabled={controlsLoading} className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {controlsLoading ? 'Completing…' : 'Force Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Timing modal ── */}
      {showEditTimingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowEditTimingModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 text-lg mb-4">Edit Slot {activeSlot?.slot_number} Timing</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                <input type="time" value={editSlotStart} onChange={e => setEditSlotStart(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                <input type="time" value={editSlotEnd} onChange={e => setEditSlotEnd(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">Enumerators will see the updated timing immediately.</p>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowEditTimingModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={saveSlotTiming} disabled={controlsLoading || !editSlotStart || !editSlotEnd} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {controlsLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Survey modal ── */}
      {showEndSurveyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowEndSurveyModal(false); setEndSurveyText(''); }} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <h3 className="font-semibold text-slate-900 text-lg">End Survey?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-2">This will permanently end the survey:</p>
            <ul className="text-sm text-slate-600 space-y-1 mb-4 list-disc list-inside">
              <li>All pending &amp; active slots will be cancelled</li>
              <li>All captures will be disabled</li>
              <li>Enumerators will see "Survey ended" message</li>
              <li>Reports will be available for export</li>
            </ul>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type <span className="font-mono text-red-600">END SURVEY</span> to confirm</label>
            <input
              type="text"
              value={endSurveyText}
              onChange={e => setEndSurveyText(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500 font-mono"
              placeholder="END SURVEY"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowEndSurveyModal(false); setEndSurveyText(''); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={endSurvey} disabled={endSurveyText !== 'END SURVEY' || controlsLoading} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                {controlsLoading ? 'Ending…' : 'End Survey'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-700 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{project.project_name}</h1>
            <p className="text-sm text-slate-500">{project.location_name || 'No location'} · {project.survey_date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification bell (only during active survey) */}
          {projectStatus === 'active' && (
            <NotificationCenter projectId={project.id} />
          )}
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
            projectStatus === 'active' ? 'bg-emerald-100 text-emerald-700'
            : projectStatus === 'completed' ? 'bg-slate-100 text-slate-600'
            : projectStatus === 'cancelled' ? 'bg-red-100 text-red-700'
            : 'bg-blue-100 text-blue-700'
          }`}>
            {projectStatus.charAt(0).toUpperCase() + projectStatus.slice(1)}
          </span>
          {projectStatus === 'draft' && enumerators.length > 0 && (
            <button onClick={startSurvey} disabled={surveyStarted} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-medium hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-500/25 disabled:opacity-50">
              <Play className="w-4 h-4" /> Start Survey
            </button>
          )}
        </div>
      </div>

      {/* ── Room code banner ── */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-100">Share this room code with enumerators</p>
            <p className="text-3xl font-bold tracking-widest mt-1 font-mono">{project.room_code}</p>
          </div>
          <button onClick={copyRoomCode} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          BREAK PERIOD BANNER (no active slot + completed + pending)
      ════════════════════════════════════════════════════════════════════════ */}
      {projectStatus === 'active' && breakInfo.isBreak && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-500 text-lg">⏳</span>
                <p className="font-semibold text-amber-900">Break Interval</p>
              </div>
              <p className="text-sm text-amber-800">
                Next: <span className="font-medium">Slot {breakInfo.nextPendingSlot?.slot_number}</span>
                {breakInfo.nextPendingSlot && (
                  <span className="ml-1 text-amber-700">
                    — starts at {fmt(breakInfo.nextPendingSlot.start_time)}
                  </span>
                )}
              </p>
              {breakInfo.lastCompletedSlot?.break_after_minutes !== undefined &&
                breakInfo.lastCompletedSlot.break_after_minutes > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Planned break: {breakInfo.lastCompletedSlot.break_after_minutes} minutes
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {breakSecondsLeft !== null && (
                <div className="text-center">
                  <p className="text-xs text-amber-600 mb-0.5">Starts in</p>
                  <p className={`text-2xl font-bold font-mono ${breakSecondsLeft < 0 ? 'text-red-600' : 'text-amber-900'}`}>
                    {breakSecondsLeft < 0 ? (
                      <span className="text-sm font-semibold text-red-600">Overdue by {formatCountdown(-breakSecondsLeft)}</span>
                    ) : formatCountdown(breakSecondsLeft)}
                  </p>
                </div>
              )}
              {breakInfo.nextPendingSlot && (
                <button
                  onClick={() => setPendingStartSlot(breakInfo.nextPendingSlot)}
                  disabled={controlsLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {isEarlyStart ? 'Start Early' : 'Start Slot'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><Clock className="w-4 h-4" /> Current Slot</div>
          <p className="text-lg font-bold text-slate-900">{activeSlot ? `🟢 Slot ${activeSlot.slot_number}` : breakInfo.isBreak ? '🟡 Break' : currentSlot ? `○ Slot ${currentSlot.slot_number}` : '⚫ None'}</p>
          {activeSlot && <p className="text-xs text-emerald-600 mt-0.5">{fmt(activeSlot.start_time)}–{fmt(activeSlot.end_time)}</p>}
          {breakInfo.isBreak && breakInfo.nextPendingSlot && (
            <p className="text-xs text-amber-600 mt-0.5">Next: Slot {breakInfo.nextPendingSlot.slot_number}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Timer className="w-4 h-4" />
            {breakInfo.isBreak ? 'Break Countdown' : 'Next Slot'}
          </div>
          {breakInfo.isBreak && breakSecondsLeft !== null ? (
            <p className={`text-lg font-bold font-mono ${breakSecondsLeft < 0 ? 'text-red-600' : 'text-amber-700'}`}>
              {breakSecondsLeft >= 0 ? formatCountdown(breakSecondsLeft) : 'Overdue'}
            </p>
          ) : (
            <p className="text-lg font-bold text-slate-900">
              {nextPendingSlot ? `Slot ${nextPendingSlot.slot_number}` : '—'}
            </p>
          )}
          {!breakInfo.isBreak && nextPendingSlot && (
            <p className="text-xs text-slate-500 mt-0.5">{fmt(nextPendingSlot.start_time)}–{fmt(nextPendingSlot.end_time)}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><Users className="w-4 h-4" /> Enumerators</div>
          <p className="text-lg font-bold text-slate-900">{enumerators.length}/{project.num_enumerators}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><Camera className="w-4 h-4" /> Captures</div>
          <p className="text-lg font-bold text-slate-900">{totalCaptures}</p>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {projectStatus === 'active' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-700">Survey Progress</p>
            <p className="text-sm text-slate-500">{completedCount}/{slots.length} slots completed</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SURVEY CONTROLS (only when active)
      ═══════════════════════════════════════════════════════════════════════ */}
      {projectStatus === 'active' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

          {/* header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Survey Controls</h3>
            {activeSlot ? (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Slot {activeSlot.slot_number} Active
              </span>
            ) : breakInfo.isBreak ? (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                ⏳ Break Period
              </span>
            ) : (
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">
                Waiting for Team Head
              </span>
            )}
          </div>

          {/* Active slot info + controls */}
          {activeSlot && (
            <div className="px-5 py-4 border-b border-slate-100 bg-emerald-50/60">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    Slot {activeSlot.slot_number} — {fmt(activeSlot.start_time)} to {fmt(activeSlot.end_time)}
                  </p>
                  {activeSlot.actual_started_at && (
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Started {fmtTs(activeSlot.actual_started_at)}{activeSlot.started_by ? ` by ${activeSlot.started_by}` : ''}
                    </p>
                  )}
                  {activeCompletion && (
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Enumerators done: {activeCompletion.completed}/{activeCompletion.total}
                    </p>
                  )}
                  {activeSlot.break_after_minutes > 0 && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      ⏳ {activeSlot.break_after_minutes}m break follows this slot
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setEditSlotStart(fmt(activeSlot.start_time)); setEditSlotEnd(fmt(activeSlot.end_time)); setShowEditTimingModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Timing
                  </button>
                  <button
                    onClick={() => setShowForceCompleteModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-300 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Force Complete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No active slot — waiting message */}
          {!activeSlot && !breakInfo.isBreak && (
            <div className="px-5 py-4 border-b border-slate-100 bg-amber-50/50">
              <p className="text-sm font-medium text-amber-800">No Active Slot</p>
              <p className="text-xs text-amber-700 mt-0.5">Select a pending slot below to start capturing.</p>
            </div>
          )}

          {/* Pending slots list */}
          {/* ── No slots at all (setup failed) ── */}
          {slots.length === 0 && (
            <div className="px-5 py-4 border-b border-slate-100 bg-red-50 border-l-4 border-l-red-400">
              <p className="text-sm font-semibold text-red-800">No time slots found</p>
              <p className="text-xs text-red-700 mt-1">
                This project has no survey slots. This usually means the database migration for
                <code className="mx-1 font-mono bg-red-100 px-1 rounded">break_after_minutes</code>
                was not applied to Supabase, causing the slot insert to fail silently during project
                creation. Apply migration <strong>009_plate_recognizer_fields.sql</strong> (or the
                break-interval migration) in the Supabase dashboard, then recreate the project.
              </p>
            </div>
          )}

          {pendingSlots.length > 0 ? (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pending Slots</p>
              <div className="space-y-2">
                {pendingSlots.map(slot => {
                  const plannedStart = new Date(`${project.survey_date}T${slot.start_time}`);
                  const isEarly = Date.now() < plannedStart.getTime();
                  return (
                    <div key={slot.id} className="flex items-center justify-between px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Slot {slot.slot_number}</p>
                        <p className="text-xs text-slate-500">{fmt(slot.start_time)} – {fmt(slot.end_time)}</p>
                        {slot.break_after_minutes > 0 && (
                          <p className="text-[10px] text-amber-600">⏳ {slot.break_after_minutes}m break after</p>
                        )}
                      </div>
                      <button
                        onClick={() => setPendingStartSlot(slot)}
                        disabled={!!activeSlot || controlsLoading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          isEarly
                            ? 'bg-blue-50 border border-blue-300 text-blue-700 hover:bg-blue-100'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        <Play className="w-3 h-3" />
                        {isEarly ? 'Start Early' : 'Start Slot'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // Guard with slots.length > 0 to avoid showing this when slots simply
            // weren't created (vacuous truth: [].every(...) is always true in JS).
            slots.length > 0 && slots.every(s => s.status === 'completed' || s.status === 'cancelled') && (
              <div className="px-5 py-4 border-b border-slate-100 text-center text-sm text-slate-500">
                All slots are completed or cancelled.
              </div>
            )
          )}

          {/* End Survey (danger zone) */}
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Danger zone</p>
            </div>
            <button
              onClick={() => setShowEndSurveyModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" /> End Survey
            </button>
          </div>
        </div>
      )}

      {/* ── Cancelled notice ── */}
      {projectStatus === 'cancelled' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-800">Survey Ended</p>
              <p className="text-sm text-red-700 mt-0.5">This survey was ended by the Team Head. All remaining slots were cancelled. Reports are available for export.</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SURVEY TIMELINE
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between"
          onClick={() => setShowTimeline(v => !v)}
        >
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Survey Timeline
            <span className="text-xs font-normal text-slate-400 ml-1">
              {slots.filter(s => s.status === 'completed').length}/{slots.length} complete
            </span>
          </h3>
          {showTimeline ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showTimeline && (
          <div className="p-5">
            <SurveyTimeline project={project} slots={slots} />
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Active</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Cancelled</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Pending</span>
              <span className="flex items-center gap-1 text-amber-500">⏳ Break Interval</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Enumerators + Vehicle Counts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Users className="w-4 h-4" /> Enumerators</h3>
            <span className="text-sm text-slate-500">{enumerators.filter(e => e.is_online).length} online</span>
          </div>
          {enumerators.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-500 text-sm">No enumerators joined yet. Share room code: <span className="font-mono font-bold">{project.room_code}</span></div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {enumerators.map(e => (
                <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${e.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{e.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{e.name}</p>
                    <p className="text-xs text-slate-500">{e.enumerator_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wifi className={`w-3 h-3 ${e.is_online ? 'text-emerald-500' : 'text-slate-300'}`} />
                    <Battery className="w-3 h-3 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Vehicle Counts</h3>
              {enumerators.length > 0 && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={prevEnumerator} disabled={enumeratorIdx <= 0} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Previous enumerator"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-slate-500 min-w-[4.5rem] text-center">{enumeratorIdx + 1} / {enumerators.length}</span>
                  <button type="button" onClick={nextEnumerator} disabled={enumeratorIdx >= enumerators.length - 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Next enumerator"><ChevronRight className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            {selectedEnumerator && <p className="text-sm text-slate-500 mt-1 truncate">{selectedEnumerator.name}<span className="text-slate-400"> · Enumerator {enumeratorIdx + 1}</span></p>}
          </div>
          {enumerators.length === 0 ? (
            <div className="p-5 text-center text-slate-500 text-sm">No enumerators yet</div>
          ) : (
            <div className="overflow-hidden">
              <div key={`${selectedEnumerator?.id}-${enumeratorIdx}-${slideDir}`} className={`p-5 space-y-3 ${slideDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left'}`}>
                {vehicleSummary.map(v => (
                  <div key={v.key} className="flex items-center gap-3">
                    <div className="w-20 text-sm font-medium text-slate-700">{v.label}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${enumeratorTotal > 0 ? (v.count / enumeratorTotal) * 100 : 0}%`, backgroundColor: v.color, minWidth: v.count > 0 ? '8px' : '0' }} />
                    </div>
                    <div className="w-10 text-right text-sm font-bold text-slate-900">{v.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Slot completion status (when a slot is active) ── */}
      {activeSlot && slotCompletions.filter(c => c.slot_id === activeSlot.id).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Slot {activeSlot.slot_number} — Enumerator Status</h3>
            <span className="text-sm text-slate-500">
              {slotCompletions.filter(c => c.slot_id === activeSlot.id && c.status === 'completed').length}/{enumerators.length} done
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {enumerators.map(e => {
              const comp = slotCompletions.find(c => c.slot_id === activeSlot.id && c.enumerator_id === e.id);
              const isDone = comp?.status === 'completed';
              return (
                <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{e.name}</p>
                    <p className="text-xs text-slate-500">{e.enumerator_code}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${isDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {isDone ? '✅ Completed' : '⏳ Pending'}
                    </p>
                    {comp?.completed_at && <p className="text-xs text-slate-400">{fmtTs(comp.completed_at)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button onClick={() => onNavigate('monitoring', project)} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow text-left"><Radio className="w-6 h-6 text-blue-500 mb-2" /><p className="font-medium text-slate-900 text-sm">Live Monitor</p><p className="text-xs text-slate-500">Real-time tracking</p></button>
        <button onClick={() => onNavigate('results', project)} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow text-left"><BarChart3 className="w-6 h-6 text-emerald-500 mb-2" /><p className="font-medium text-slate-900 text-sm">Results</p><p className="text-xs text-slate-500">Analytics dashboard</p></button>
        <button onClick={() => onNavigate('reports', project)} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow text-left"><MapIcon className="w-6 h-6 text-amber-500 mb-2" /><p className="font-medium text-slate-900 text-sm">Reports</p><p className="text-xs text-slate-500">Generate PDF/CSV</p></button>
        <button className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow text-left"><MessageSquare className="w-6 h-6 text-rose-500 mb-2" /><p className="font-medium text-slate-900 text-sm">Chat</p><p className="text-xs text-slate-500">Communicate</p></button>
      </div>

      {/* unused icon suppression */}
      <span className="hidden"><X className="w-0" /><Bell className="w-0" /></span>
    </div>
  );
}
