import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getProjects, getEnumerators, getCaptures, getSlots } from '../lib/database';
import type { SurveyProject, SurveySlot } from '../lib/types';
import { FolderOpen, Users, Camera, Clock, Plus, MapPin, ArrowRight, BarChart3, Radio } from 'lucide-react';
import { getBreakStatus } from '../lib/slotWorkflow';

interface Props { onNavigate: (view: string, data?: any) => void; }

interface ActiveSurveyStatus {
  project: SurveyProject;
  slots: SurveySlot[];
  activeSlot: SurveySlot | null;
}

function fmt(t: string) { return t.slice(0, 5); }

export default function TeamHeadDashboard({ onNavigate }: Props) {
  const { teamHead } = useAuth();
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [totalEnumerators, setTotalEnumerators] = useState(0);
  const [totalEnumeratorCapacity, setTotalEnumeratorCapacity] = useState(0);
  const [totalCaptures, setTotalCaptures] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeSurveys, setActiveSurveys] = useState<ActiveSurveyStatus[]>([]);

  useEffect(() => {
    if (!teamHead) return;
    const teamHeadId = teamHead.id;
    async function load() {
      setLoading(true);
      const projs = await getProjects(teamHeadId);
      setProjects(projs);
      let enums = 0, caps = 0;
      const maxEnums = projs.reduce((sum, p) => sum + (p.num_enumerators || 0), 0);
      const actives: ActiveSurveyStatus[] = [];
      for (const p of projs) {
        enums += (await getEnumerators(p.id)).length;
        caps += (await getCaptures(p.id)).length;
        if (p.status === 'active') {
          const slots = await getSlots(p.id);
          actives.push({ project: p, slots, activeSlot: slots.find(s => s.status === 'active') ?? null });
        }
      }
      setActiveSurveys(actives);
      setTotalEnumerators(enums); setTotalEnumeratorCapacity(maxEnums); setTotalCaptures(caps); setLoading(false);
    }
    load();
  }, [teamHead]);

  const activeProjects = projects.filter(p => p.status === 'active').length;
  const stats = [
    { label: 'Total Projects', value: projects.length, icon: FolderOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Surveys', value: activeProjects, icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Enumerators (Current/Max)', value: `${totalEnumerators}/${totalEnumeratorCapacity}`, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Images Captured', value: totalCaptures, icon: Camera, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Welcome back, {teamHead?.full_name?.split(' ')[0] || 'Team Head'}</h1><p className="text-slate-500 mt-1">Here's an overview of your survey operations</p></div>
        <button onClick={() => onNavigate('create-project')} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all shadow-md shadow-blue-500/25 whitespace-nowrap"><Plus className="w-4 h-4" /> New Survey Project</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (<div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"><div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center mb-3`}><s.icon className={`w-5 h-5 ${s.color}`} /></div><p className="text-2xl font-bold text-slate-900">{s.value}</p><p className="text-sm text-slate-500 mt-1">{s.label}</p></div>))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Recent Projects</h2><button onClick={() => onNavigate('projects')} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button></div>
        {projects.length === 0 ? <div className="px-5 py-12 text-center"><FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500 mb-1">No projects yet</p><p className="text-sm text-slate-400">Create your first survey project to get started</p></div> : (
          <div className="divide-y divide-slate-100">{projects.slice(0, 5).map(p => (
            <button key={p.id} onClick={() => onNavigate('project-detail', p)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.status === 'active' ? 'bg-emerald-100 text-emerald-600' : p.status === 'completed' ? 'bg-slate-100 text-slate-600' : p.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}><MapPin className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0"><p className="font-medium text-slate-900 truncate">{p.project_name}</p><p className="text-sm text-slate-500">{p.location_name || 'No location'} - {p.survey_date}</p></div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : p.status === 'completed' ? 'bg-slate-100 text-slate-600' : p.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            </button>
          ))}</div>
        )}
      </div>
      {/* Active surveys live status */}
      {activeSurveys.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Active Survey Status</h2>
          {activeSurveys.map(({ project: p, slots, activeSlot }) => {
            const breakInfo = getBreakStatus(p, slots);
            const nextPending = slots.filter(s => s.status === 'pending').sort((a, b) => a.slot_number - b.slot_number)[0] ?? null;
            const completedCount = slots.filter(s => s.status === 'completed').length;

            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">{p.project_name}</p>
                    <p className="text-xs text-slate-500">{p.location_name || 'No location'} · {p.survey_date}</p>
                  </div>
                  <button
                    onClick={() => onNavigate('project-detail', p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Radio className="w-3 h-3" /> Open
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  {/* Current status */}
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Current</p>
                    {activeSlot ? (
                      <>
                        <p className="text-sm font-bold text-blue-700">🟢 Slot {activeSlot.slot_number}</p>
                        <p className="text-[10px] text-slate-500">{fmt(activeSlot.start_time)}–{fmt(activeSlot.end_time)}</p>
                      </>
                    ) : breakInfo.isBreak ? (
                      <>
                        <p className="text-sm font-bold text-amber-700">🟡 Break</p>
                        <p className="text-[10px] text-slate-500">Between slots</p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-slate-500">Waiting</p>
                    )}
                  </div>

                  {/* Next slot */}
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Next Slot</p>
                    {nextPending ? (
                      <>
                        <p className="text-sm font-bold text-slate-800">Slot {nextPending.slot_number}</p>
                        <p className="text-[10px] text-slate-500">{fmt(nextPending.start_time)}</p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-slate-500">—</p>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Progress</p>
                    <p className="text-sm font-bold text-slate-800">{completedCount}/{slots.length}</p>
                    <p className="text-[10px] text-slate-500">slots done</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => onNavigate('create-project')} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow text-left group"><Plus className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" /><h3 className="font-semibold text-slate-900">Create New Survey</h3><p className="text-sm text-slate-500 mt-1">Set up a new traffic survey project</p></button>
        <button onClick={() => onNavigate('reports')} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow text-left group"><BarChart3 className="w-8 h-8 text-amber-500 mb-3 group-hover:scale-110 transition-transform" /><h3 className="font-semibold text-slate-900">Generate Reports</h3><p className="text-sm text-slate-500 mt-1">Download PDF analysis reports</p></button>
      </div>
    </div>
  );
}
