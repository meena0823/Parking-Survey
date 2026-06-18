import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getProjects } from '../lib/database';
import type { SurveyProject } from '../lib/types';
import { FolderOpen, MapPin, Calendar, Clock, ArrowRight, Plus } from 'lucide-react';

interface Props { onNavigate: (view: string, data?: any) => void; }

export default function ProjectsList({ onNavigate }: Props) {
  const { teamHead } = useAuth();
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'active' | 'completed'>('all');

  useEffect(() => {
    if (!teamHead) { setLoading(false); return; }
    const teamHeadId = teamHead.id;
    async function load() { const p = await getProjects(teamHeadId); setProjects(p); setLoading(false); }
    load();
  }, [teamHead]);

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Survey Projects</h1>
        <button onClick={() => onNavigate('create-project')} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md"><Plus className="w-4 h-4" /> New Project</button>
      </div>
      <div className="flex items-center gap-2">
        {(['all', 'draft', 'active', 'completed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)} <span className="ml-1 text-xs">({f === 'all' ? projects.length : projects.filter(p => p.status === f).length})</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500 mb-1">No projects found</p><p className="text-sm text-slate-400">Create a new survey project to get started</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <button key={p.id} onClick={() => onNavigate('project-detail', p)} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group">
              <div className="flex items-start justify-between mb-3">
                <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : p.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2 line-clamp-1">{p.project_name}</h3>
              <div className="space-y-1.5 text-sm text-slate-500">
                <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /><span className="truncate">{p.location_name || 'No location'}</span></div>
                <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /><span>{p.survey_date}</span></div>
                <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /><span>{p.start_time} - {p.end_time} ({p.survey_duration_hours}h)</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Room: <span className="font-mono font-bold text-slate-600">{p.room_code}</span></span>
                <span>{p.num_slots || 0} slots</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
