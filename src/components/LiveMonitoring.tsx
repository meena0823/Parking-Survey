import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getSlots, getEnumerators, getCaptures, getRoomForProject, getMessages, sendMessage, getTeamHead, getSlotCompletions } from '../lib/database';
import type { SurveyProject, SurveySlot, Enumerator, VehicleCapture, ChatMessage, SlotCompletion } from '../lib/types';
import { VEHICLE_CATEGORIES } from '../lib/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { Radio, Users, Camera, MapPin, Wifi, Send, Battery, AlertTriangle, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentSlot } from '../lib/slotWorkflow';

interface Props { project: SurveyProject | null; onBack?: () => void; }

export default function LiveMonitoring({ project, onBack }: Props) {
  const [slots, setSlots] = useState<SurveySlot[]>([]);
  const [enumerators, setEnumerators] = useState<Enumerator[]>([]);
  const [captures, setCaptures] = useState<VehicleCapture[]>([]);
  const [slotCompletions, setSlotCompletions] = useState<SlotCompletion[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [enumeratorIdx, setEnumeratorIdx] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('right');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) return;
    const projectId = project.id;
    async function load() {
      setLoading(true);
      const [s, e, c, completions] = await Promise.all([
        getSlots(projectId),
        getEnumerators(projectId),
        getCaptures(projectId),
        getSlotCompletions(projectId),
      ]);
      setSlots(s); setEnumerators(e); setCaptures(c); setSlotCompletions(completions); setLoading(false);
    }
    load();
    const channel = supabase
      .channel(`monitoring-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_slots', filter: `project_id=eq.${projectId}` },
        async () => setSlots(await getSlots(projectId)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_captures', filter: `project_id=eq.${projectId}` },
        (payload) => setCaptures(prev => [...prev, payload.new as VehicleCapture]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'enumerators', filter: `project_id=eq.${projectId}` },
        (payload) => setEnumerators(prev => prev.map(e => e.id === payload.new.id ? payload.new as Enumerator : e)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_completions', filter: `project_id=eq.${projectId}` },
        async () => setSlotCompletions(await getSlotCompletions(projectId)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const currentSlot = getCurrentSlot(slots);
  const completedSlots = slots.filter(s => s.status === 'completed').length;
  const progress = slots.length > 0 ? (completedSlots / slots.length) * 100 : 0;
  const currentCompletionRows = currentSlot ? slotCompletions.filter(c => c.slot_id === currentSlot.id) : [];

  const selectedEnumerator = enumerators[enumeratorIdx] ?? null;
  const enumeratorCaptures = selectedEnumerator
    ? captures.filter(c => c.enumerator_id === selectedEnumerator.id)
    : captures;

  const vehicleTypeData = VEHICLE_CATEGORIES.map(cat => ({
    name: cat.label,
    count: enumeratorCaptures.filter(c => c.vehicle_type === cat.key).length,
    color: cat.color,
  }));
  const slotProgressData = slots.slice(0, 20).map(s => ({
    name: `S${s.slot_number}`,
    count: enumeratorCaptures.filter(c => c.slot_id === s.id).length,
  }));
  const enumeratorCaptureData = enumerators.map(e => ({
    name: e.name.split(' ')[0],
    count: captures.filter(c => c.enumerator_id === e.id).length,
  }));

  function prevEnumerator() {
    if (enumeratorIdx <= 0) return;
    setSlideDir('left');
    setEnumeratorIdx(i => i - 1);
  }

  function nextEnumerator() {
    if (enumeratorIdx >= enumerators.length - 1) return;
    setSlideDir('right');
    setEnumeratorIdx(i => i + 1);
  }

  async function handleSendMessage() {
    if (!chatInput.trim() || !project) return;
    const room = await getRoomForProject(project.id);
    if (!room) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const th = await getTeamHead(user.id);
    if (!th) return;
    await sendMessage({ room_id: room.id, sender_type: 'team_head', sender_id: th.id, message: chatInput.trim(), is_emergency: false });
    setChatInput('');
    const msgs = await getMessages(room.id);
    setMessages(msgs);
  }

  if (!project) return <div className="max-w-7xl mx-auto"><div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><Radio className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">Select a project to monitor</p></div></div>;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="text-slate-500 hover:text-slate-700"><MessageSquare className="w-5 h-5" /></button>}
          <div><h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Radio className="w-6 h-6 text-emerald-500 animate-pulse" /> Live Monitor</h1><p className="text-sm text-slate-500">{project.project_name}</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /><span className="text-sm text-emerald-600 font-medium">Live</span></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500 mb-1">Current Slot</p><p className="text-lg font-bold text-blue-600">{currentSlot ? `Slot ${currentSlot.slot_number}` : 'None'}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500 mb-1">Online Enumerators</p><p className="text-lg font-bold text-emerald-600">{enumerators.filter(e => e.is_online).length}/{enumerators.length}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500 mb-1">Total Captures</p><p className="text-lg font-bold text-slate-900">{captures.length}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500 mb-1">Progress</p><p className="text-lg font-bold text-slate-900">{Math.round(progress)}%</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900 flex items-center gap-2"><MapPin className="w-4 h-4" /> Survey Area Map</h3></div>
          <div className="h-80 bg-gradient-to-br from-slate-100 to-slate-50 relative flex items-center justify-center">
            <div className="text-center"><MapPin className="w-12 h-12 text-blue-400 mx-auto mb-2" /><p className="text-sm text-slate-500">Interactive Map View</p><p className="text-xs text-slate-400">Google Maps integration required</p></div>
            {enumerators.filter(e => e.gps_lat && e.gps_lng).map(e => (
              <div key={e.id} className="absolute group"><div className={`w-3 h-3 rounded-full ${e.is_online ? 'bg-emerald-500' : 'bg-slate-400'} ring-2 ring-white shadow`} /><div className="hidden group-hover:block absolute -top-8 bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">{e.name}</div></div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900 flex items-center gap-2"><Users className="w-4 h-4" /> Enumerators</h3></div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {enumerators.map(e => (
              <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${e.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{e.name.charAt(0)}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{e.name}</p><div className="flex items-center gap-2 text-xs text-slate-500"><Wifi className={`w-3 h-3 ${e.is_online ? 'text-emerald-500' : 'text-slate-300'}`} /><Battery className="w-3 h-3 text-slate-400" /><Camera className="w-3 h-3 text-slate-400" /></div></div>
                <div className="text-right"><p className="text-xs font-medium text-slate-700">{captures.filter(c => c.enumerator_id === e.id).length}</p><p className="text-[10px] text-slate-400">captures</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {enumerators.length > 0 && (
          <div className="lg:col-span-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={prevEnumerator}
              disabled={enumeratorIdx <= 0}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous enumerator"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center min-w-[200px]">
              <p className="text-sm font-semibold text-slate-900">
                {selectedEnumerator?.name ?? `Enumerator ${enumeratorIdx + 1}`}
              </p>
              <p className="text-xs text-slate-500">
                Vehicle counts · Enumerator {enumeratorIdx + 1} of {enumerators.length}
              </p>
            </div>
            <button
              type="button"
              onClick={nextEnumerator}
              disabled={enumeratorIdx >= enumerators.length - 1}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next enumerator"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
        <div
          key={`vehicle-${selectedEnumerator?.id}-${enumeratorIdx}-${slideDir}`}
          className={`bg-white rounded-xl border border-slate-200 p-5 ${slideDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left'}`}
        >
          <h3 className="font-semibold text-slate-900 mb-4">Vehicle Type Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={vehicleTypeData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" radius={[4, 4, 0, 0]}>{vehicleTypeData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}</Bar></BarChart>
          </ResponsiveContainer>
        </div>
        <div
          key={`slot-${selectedEnumerator?.id}-${enumeratorIdx}-${slideDir}`}
          className={`bg-white rounded-xl border border-slate-200 p-5 ${slideDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left'}`}
        >
          <h3 className="font-semibold text-slate-900 mb-4">Captures per Slot</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={slotProgressData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="count" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.2} /></AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {currentSlot && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Slot {currentSlot.slot_number} Completion Status</h3>
            <span className="text-sm text-slate-500">
              Completed: {currentCompletionRows.filter(c => c.status === 'completed').length}/{enumerators.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {enumerators.map(e => {
              const completion = currentCompletionRows.find(c => c.enumerator_id === e.id);
              const isDone = completion?.status === 'completed';
              return (
                <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{e.name}</p>
                    <p className="text-xs text-slate-500">{e.enumerator_code}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${isDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {isDone ? 'Completed' : 'Pending'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {completion?.completed_at
                        ? new Date(completion.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Enumerator Captures Comparison</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={enumeratorCaptureData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} /><Tooltip /><Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-80">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Chat</h3>
            <button className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Emergency</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? <p className="text-xs text-slate-400 text-center mt-8">No messages yet</p> : messages.map(m => (
              <div key={m.id} className={`text-xs p-2 rounded-lg ${m.sender_type === 'team_head' ? 'bg-blue-50 ml-4' : 'bg-slate-50 mr-4'}`}><p className="font-medium text-slate-700">{m.sender_type === 'team_head' ? 'You' : 'Enumerator'}</p><p className="text-slate-600">{m.message}</p></div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Type a message..." />
            <button onClick={handleSendMessage} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"><Send className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
