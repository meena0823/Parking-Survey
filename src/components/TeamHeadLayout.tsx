import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, FolderOpen, Map, BarChart3, FileText, LogOut, Car, Menu, X, ChevronDown } from 'lucide-react';

type TeamHeadView = 'dashboard' | 'projects' | 'create-project' | 'project-detail' | 'monitoring' | 'results' | 'reports';

interface LayoutProps { currentView: TeamHeadView; onViewChange: (view: TeamHeadView) => void; children: React.ReactNode; }

const navItems: { key: TeamHeadView; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'projects', label: 'Projects', icon: FolderOpen },
  { key: 'create-project', label: 'New Survey', icon: Map },
  { key: 'monitoring', label: 'Live Monitor', icon: BarChart3 },
  { key: 'results', label: 'Results', icon: BarChart3 },
  { key: 'reports', label: 'Reports', icon: FileText },
];

export default function TeamHeadLayout({ currentView, onViewChange, children }: LayoutProps) {
  const { teamHead, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col`}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center"><Car className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-base font-bold">SurveyFlow</h1><p className="text-xs text-slate-400">Team Head Portal</p></div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <button key={item.key} onClick={() => { onViewChange(item.key); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${currentView === item.key ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
              <item.icon className="w-5 h-5" />{item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="relative">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-all">
              <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-xs font-bold">{teamHead?.full_name?.charAt(0) || 'T'}</div>
              <div className="text-left flex-1"><p className="text-sm font-medium text-white truncate">{teamHead?.full_name || 'Team Head'}</p><p className="text-xs text-slate-400 truncate">{teamHead?.organization || 'Survey Manager'}</p></div>
              <ChevronDown className="w-4 h-4" />
            </button>
            {userMenuOpen && (<div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 rounded-lg border border-slate-700 shadow-xl overflow-hidden">
              <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors"><LogOut className="w-4 h-4" /> Sign Out</button>
            </div>)}
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600 hover:text-slate-900"><Menu className="w-6 h-6" /></button>
          <h1 className="text-lg font-bold text-slate-900">SurveyFlow</h1>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
