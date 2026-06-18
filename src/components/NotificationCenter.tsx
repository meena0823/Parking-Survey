import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/database';
import type { SurveyNotification } from '../lib/types';
import { Bell, X, CheckCheck } from 'lucide-react';

interface Props {
  projectId: string;
}

const typeIcon: Record<SurveyNotification['type'], string> = {
  upcoming_slot: '🔔',
  slot_not_started: '⚠️',
  slot_ending_soon: '⏰',
  survey_completed: '✅',
  survey_paused: '⏸️',
  survey_resumed: '▶️',
};

const typeBg: Record<SurveyNotification['type'], string> = {
  upcoming_slot: 'bg-blue-50 border-blue-200',
  slot_not_started: 'bg-amber-50 border-amber-200',
  slot_ending_soon: 'bg-orange-50 border-orange-200',
  survey_completed: 'bg-emerald-50 border-emerald-200',
  survey_paused: 'bg-slate-50 border-slate-200',
  survey_resumed: 'bg-green-50 border-green-200',
};

export default function NotificationCenter({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<SurveyNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.is_read).length;

  async function load() {
    const data = await getNotifications(projectId);
    setNotifications(data);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  // Realtime: listen for new notifications
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'survey_notifications', filter: `project_id=eq.${projectId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleMarkAll() {
    await markAllNotificationsRead(projectId);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function handleMarkOne(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                  onClick={() => !n.is_read && handleMarkOne(n.id)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base mt-0.5 flex-shrink-0">{typeIcon[n.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug ${n.is_read ? 'text-slate-600' : 'text-slate-900'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  {/* type badge */}
                  <div className={`mt-1.5 ml-7 inline-block border rounded px-1.5 py-0.5 text-[10px] ${typeBg[n.type]}`}>
                    {n.type.replace(/_/g, ' ')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
