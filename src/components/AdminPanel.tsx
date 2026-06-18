import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, FolderOpen, Camera, HardDrive, BarChart3, Shield, Search, LogOut } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function AdminPanel() {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'team_heads' | 'projects' | 'storage'>('overview');
  const [teamHeads, setTeamHeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalTeamHeads: 0, activeSurveys: 0, completedSurveys: 0, totalEnumerators: 0, totalImages: 0, totalCaptures: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: th } = await supabase.from('team_heads').select('*');
      const { data: sp } = await supabase.from('survey_projects').select('*');
      const { data: en } = await supabase.from('enumerators').select('*');
      const { data: vc } = await supabase.from('vehicle_captures').select('*');
      setTeamHeads(th || []); setProjects(sp || []);
      setStats({
        totalTeamHeads: (th || []).length,
        activeSurveys: (sp || []).filter((p: any) => p.status === 'active').length,
        completedSurveys: (sp || []).filter((p: any) => p.status === 'completed').length,
        totalEnumerators: (en || []).length,
        totalImages: (vc || []).filter((c: any) => c.image_url).length,
        totalCaptures: (vc || []).length,
      });
      setLoading(false);
    }
    load();
  }, []);

  const statCards = [
    { label: 'Team Heads', value: stats.totalTeamHeads, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Surveys', value: stats.activeSurveys, icon: FolderOpen, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Completed', value: stats.completedSurveys, icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Enumerators', value: stats.totalEnumerators, icon: Users, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Total Captures', value: stats.totalCaptures, icon: Camera, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Images Stored', value: stats.totalImages, icon: HardDrive, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  const projectStatusData = [
    { name: 'Draft', count: projects.filter((p: any) => p.status === 'draft').length, fill: '#3B82F6' },
    { name: 'Active', count: projects.filter((p: any) => p.status === 'active').length, fill: '#10B981' },
    { name: 'Completed', count: projects.filter((p: any) => p.status === 'completed').length, fill: '#6B7280' },
  ];

  const filteredTeamHeads = teamHeads.filter((th: any) => th.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || th.organization?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredProjects = projects.filter((p: any) => p.project_name.toLowerCase().includes(searchQuery.toLowerCase()) || p.client_name?.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
          <div className="w-9 h-9 bg-gradient-to-br from-slate-600 to-zinc-600 rounded-lg flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-base font-bold">SurveyFlow</h1><p className="text-xs text-slate-400">Admin Panel</p></div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {([ { key: 'overview' as const, label: 'Overview', icon: BarChart3 }, { key: 'team_heads' as const, label: 'Team Heads', icon: Users }, { key: 'projects' as const, label: 'Projects', icon: FolderOpen }, { key: 'storage' as const, label: 'Storage', icon: HardDrive } ]).map(item => (
            <button key={item.key} onClick={() => setActiveTab(item.key)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === item.key ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}><item.icon className="w-5 h-5" />{item.label}</button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-slate-800 transition-colors"><LogOut className="w-4 h-4" /> Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 lg:p-8">
        {activeTab === 'overview' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Admin Overview</h1>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {statCards.map(s => (<div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5"><div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center mb-3`}><s.icon className={`w-5 h-5 ${s.color}`} /></div><p className="text-2xl font-bold text-slate-900">{s.value}</p><p className="text-sm text-slate-500">{s.label}</p></div>))}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Project Status Distribution</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={projectStatusData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" radius={[4, 4, 0, 0]}>{projectStatusData.map((_, idx) => <Cell key={idx} fill={projectStatusData[idx].fill} />)}</Bar></BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {activeTab === 'team_heads' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-slate-900">Team Heads</h1>
              <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-300" placeholder="Search..." /></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left font-medium text-slate-600">Name</th><th className="px-5 py-3 text-left font-medium text-slate-600">Organization</th><th className="px-5 py-3 text-left font-medium text-slate-600">Phone</th><th className="px-5 py-3 text-left font-medium text-slate-600">Joined</th><th className="px-5 py-3 text-left font-medium text-slate-600">Projects</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{filteredTeamHeads.map((th: any) => (<tr key={th.id} className="hover:bg-slate-50"><td className="px-5 py-3 font-medium text-slate-900">{th.full_name}</td><td className="px-5 py-3 text-slate-600">{th.organization || 'N/A'}</td><td className="px-5 py-3 text-slate-600">{th.phone || 'N/A'}</td><td className="px-5 py-3 text-slate-600">{new Date(th.created_at).toLocaleDateString()}</td><td className="px-5 py-3 text-slate-900 font-bold">{projects.filter((p: any) => p.team_head_id === th.id).length}</td></tr>))}</tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'projects' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">All Projects</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((p: any) => (<div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5"><div className="flex items-start justify-between mb-2"><h3 className="font-semibold text-slate-900 line-clamp-1">{p.project_name}</h3><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : p.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>{p.status}</span></div><div className="text-sm text-slate-500 space-y-1"><p>{p.client_name || 'No client'}</p><p>{p.location_name || 'No location'} - {p.survey_date}</p><p>{p.survey_duration_hours}h / {p.survey_interval_minutes}min intervals</p></div></div>))}
            </div>
          </div>
        )}
        {activeTab === 'storage' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Storage Overview</h1>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5"><HardDrive className="w-8 h-8 text-slate-500 mb-3" /><p className="text-2xl font-bold text-slate-900">{stats.totalImages}</p><p className="text-sm text-slate-500">Total Images</p></div>
              <div className="bg-white rounded-xl border border-slate-200 p-5"><Camera className="w-8 h-8 text-emerald-500 mb-3" /><p className="text-2xl font-bold text-slate-900">{stats.totalCaptures}</p><p className="text-sm text-slate-500">Total Captures</p></div>
              <div className="bg-white rounded-xl border border-slate-200 p-5"><FolderOpen className="w-8 h-8 text-blue-500 mb-3" /><p className="text-2xl font-bold text-slate-900">{projects.length}</p><p className="text-sm text-slate-500">Projects with Data</p></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
