import { useEffect, useState } from 'react';
import { getSlots, getEnumerators, getCaptures, getCounts } from '../lib/database';
import type { SurveyProject, SurveySlot, Enumerator, VehicleCapture, VehicleCount } from '../lib/types';
import { VEHICLE_CATEGORIES } from '../lib/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { BarChart3, Car, Camera, Clock, Users, ArrowLeft } from 'lucide-react';

interface Props { project: SurveyProject | null; onBack?: () => void; }

export default function ResultsPage({ project, onBack }: Props) {
  const [slots, setSlots] = useState<SurveySlot[]>([]);
  const [enumerators, setEnumerators] = useState<Enumerator[]>([]);
  const [captures, setCaptures] = useState<VehicleCapture[]>([]);
  const [, setCounts] = useState<VehicleCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!project) return;
    const projectId = project.id;
    async function load() {
      setLoading(true);
      const [s, e, c, vc] = await Promise.all([getSlots(projectId), getEnumerators(projectId), getCaptures(projectId), getCounts(projectId)]);
      setSlots(s); setEnumerators(e); setCaptures(c); setCounts(vc); setLoading(false);
    }
    load();
  }, [project]);

  if (!project) return <div className="max-w-7xl mx-auto"><div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">Select a project to view results</p></div></div>;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  const totalVehicles = captures.length;
  const surveyHours = project.survey_duration_hours;
  const summaryCards = [
    { label: 'Total Vehicles', value: totalVehicles, icon: Car, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Images', value: captures.filter(c => c.image_url).length, icon: Camera, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Survey Hours', value: `${surveyHours}h`, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Enumerators', value: enumerators.length, icon: Users, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  const vehicleTypeData = VEHICLE_CATEGORIES.map(cat => ({ name: cat.label, value: captures.filter(c => c.vehicle_type === cat.key).length, color: cat.color })).filter(d => d.value > 0);
  const slotWiseData = slots.map(s => {
    const sc = captures.filter(c => c.slot_id === s.id);
    const entry: Record<string, any> = { slot: `S${s.slot_number}`, total: sc.length };
    VEHICLE_CATEGORIES.forEach(cat => { entry[cat.key] = sc.filter(c => c.vehicle_type === cat.key).length; });
    return entry;
  });
  const enumeratorData = enumerators.map(e => ({ name: e.name.split(' ')[0], captures: captures.filter(c => c.enumerator_id === e.id).length, verified: captures.filter(c => c.enumerator_id === e.id && c.is_verified).length }));
  const hourlyData: Array<{ hour: string; count: number }> = [];
  const [startH] = project.start_time.split(':').map(Number);
  for (let h = 0; h < surveyHours; h++) {
    const hour = startH + h;
    const hourSlots = slots.filter(s => { const [sh] = s.start_time.split(':').map(Number); return sh === hour; });
    hourlyData.push({ hour: `${String(hour).padStart(2, '0')}:00`, count: captures.filter(c => hourSlots.some(s => s.id === c.slot_id)).length });
  }
  const peakHour = hourlyData.reduce((max, h) => h.count > max.count ? h : max, { hour: 'N/A', count: 0 });
  const avgVolume = totalVehicles > 0 ? Math.round(totalVehicles / surveyHours) : 0;
  const compositionData = VEHICLE_CATEGORIES.map(cat => ({ name: cat.label, percentage: totalVehicles > 0 ? ((captures.filter(c => c.vehicle_type === cat.key).length / totalVehicles) * 100).toFixed(1) : '0', color: cat.color, count: captures.filter(c => c.vehicle_type === cat.key).length }));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Survey Results</h1><p className="text-sm text-slate-500">{project.project_name} - {project.survey_date}</p></div>
        {onBack && <button onClick={onBack} className="text-slate-500 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></button>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{summaryCards.map(s => (<div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5"><div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center mb-3`}><s.icon className={`w-5 h-5 ${s.color}`} /></div><p className="text-2xl font-bold text-slate-900">{s.value}</p><p className="text-sm text-slate-500">{s.label}</p></div>))}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 text-center"><p className="text-lg font-bold text-blue-700">{peakHour.hour}</p><p className="text-xs text-blue-600">Peak Hour</p></div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center"><p className="text-lg font-bold text-emerald-700">{peakHour.count}</p><p className="text-xs text-emerald-600">Peak Volume</p></div>
        <div className="bg-amber-50 rounded-xl p-4 text-center"><p className="text-lg font-bold text-amber-700">{avgVolume}</p><p className="text-xs text-amber-600">Avg Volume/Hr</p></div>
        <div className="bg-rose-50 rounded-xl p-4 text-center"><p className="text-lg font-bold text-rose-700">{slots.length}</p><p className="text-xs text-rose-600">Total Slots</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-900 mb-4">Vehicle Composition</h3>
          <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={vehicleTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}>{vehicleTypeData.map((_, idx) => <Cell key={idx} fill={vehicleTypeData[idx].color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-900 mb-4">Hourly Distribution</h3>
          <ResponsiveContainer width="100%" height={280}><AreaChart data={hourlyData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="hour" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="count" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} /></AreaChart></ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-900 mb-4">Slot-wise Vehicle Breakdown</h3>
        <ResponsiveContainer width="100%" height={320}><BarChart data={slotWiseData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="slot" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />{VEHICLE_CATEGORIES.map(cat => <Bar key={cat.key} dataKey={cat.key} stackId="a" fill={cat.color} name={cat.label} />)}</BarChart></ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-900 mb-4">Enumerator-wise Captures</h3>
        <ResponsiveContainer width="100%" height={240}><BarChart data={enumeratorData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="captures" fill="#3B82F6" name="Total Captures" radius={[4, 4, 0, 0]} /><Bar dataKey="verified" fill="#10B981" name="Verified" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900">Slot-wise Counts</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-2 text-left font-medium text-slate-600">Slot</th><th className="px-4 py-2 text-left font-medium text-slate-600">Time</th><th className="px-4 py-2 text-right font-medium text-slate-600">Count</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{slots.map(s => (<tr key={s.id} className="hover:bg-slate-50"><td className="px-4 py-2 font-medium text-slate-900">S{s.slot_number}</td><td className="px-4 py-2 text-slate-600">{s.start_time} - {s.end_time}</td><td className="px-4 py-2 text-right font-bold text-slate-900">{captures.filter(c => c.slot_id === s.id).length}</td></tr>))}</tbody></table></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900">Vehicle-wise Counts</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-2 text-left font-medium text-slate-600">Type</th><th className="px-4 py-2 text-right font-medium text-slate-600">Count</th><th className="px-4 py-2 text-right font-medium text-slate-600">Share</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{compositionData.map(v => (<tr key={v.name} className="hover:bg-slate-50"><td className="px-4 py-2 flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: v.color }} /><span className="font-medium text-slate-900">{v.name}</span></td><td className="px-4 py-2 text-right font-bold text-slate-900">{v.count}</td><td className="px-4 py-2 text-right text-slate-600">{v.percentage}%</td></tr>))}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
