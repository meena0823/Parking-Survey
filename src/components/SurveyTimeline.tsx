import type { SurveyProject, SurveySlot } from '../lib/types';

interface Props {
  project: SurveyProject;
  slots: SurveySlot[];
  compact?: boolean;
}

function fmt(t: string) {
  return t.slice(0, 5);
}

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const slotDot = (status: SurveySlot['status']) => {
  if (status === 'active') return 'bg-blue-500 ring-2 ring-blue-200 animate-pulse';
  if (status === 'completed') return 'bg-emerald-500';
  if (status === 'cancelled') return 'bg-red-400';
  return 'bg-slate-300';
};

const slotIcon = (status: SurveySlot['status']) => {
  if (status === 'active') return '🟢';
  if (status === 'completed') return '⚫';
  if (status === 'cancelled') return '❌';
  return '○';
};

const slotBorder = (status: SurveySlot['status']) => {
  if (status === 'active') return 'border-blue-300 bg-blue-50';
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50/60';
  if (status === 'cancelled') return 'border-red-200 bg-red-50';
  return 'border-slate-200 bg-white';
};

export default function SurveyTimeline({ slots, compact = false }: Props) {
  const ordered = [...slots].sort((a, b) => a.slot_number - b.slot_number);

  if (ordered.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">No slots yet</p>;
  }

  return (
    <div className={`space-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      {ordered.map((slot, idx) => {
        const breakMins = slot.break_after_minutes;
        const hasBreak = breakMins > 0 && idx < ordered.length - 1;
        const breakStart = fmt(slot.end_time);
        const breakEnd = addMinutes(slot.end_time, breakMins);

        return (
          <div key={slot.id}>
            {/* Slot row */}
            <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${slotBorder(slot.status)}`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${slotDot(slot.status)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-800">
                    {slotIcon(slot.status)} Slot {slot.slot_number}
                  </span>
                  {slot.status === 'active' && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium uppercase tracking-wide">
                      Active
                    </span>
                  )}
                  {slot.status === 'completed' && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-medium">
                      Done
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  {fmt(slot.start_time)} – {fmt(slot.end_time)}
                  {slot.actual_started_at && (
                    <span className="ml-1 text-slate-400">
                      · started {new Date(slot.actual_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Break interval row */}
            {hasBreak && (
              <div className="flex items-center gap-3 px-3 py-1.5 ml-1">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-px h-2 bg-amber-300" />
                  <div className="w-px h-2 bg-amber-300" />
                </div>
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 flex-1">
                  <span className="text-amber-500">⏳</span>
                  <span className="font-medium text-[11px]">Break Interval</span>
                  <span className="text-[10px] text-amber-600 ml-auto">
                    {breakStart} – {breakEnd} ({breakMins}m)
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
