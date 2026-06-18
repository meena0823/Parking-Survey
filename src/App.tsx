import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SurveyProvider } from './contexts/SurveyContext';
import { getProject, getEnumeratorById, updateEnumerator } from './lib/database';
import LandingPage from './components/LandingPage';
import { TeamHeadAuth, EnumeratorJoin, AdminAuth } from './components/AuthPages';
import TeamHeadLayout from './components/TeamHeadLayout';
import TeamHeadDashboard from './components/TeamHeadDashboard';
import SurveyProjectForm from './components/SurveyProjectForm';
import ProjectsList from './components/ProjectsList';
import ProjectDetail from './components/ProjectDetail';
import LiveMonitoring from './components/LiveMonitoring';
import ResultsPage from './components/ResultsPage';
import ReportGenerator from './components/ReportGenerator';
import EnumeratorInterface from './components/EnumeratorInterface';
import AdminPanel from './components/AdminPanel';
import type { SurveyProject } from './lib/types';

// ── Enumerator session helpers (localStorage) ────────────────
const ENUM_SESSION_KEY = 'parksense_enum_session';

function saveEnumeratorSession(enumeratorId: string, projectId: string) {
  try {
    localStorage.setItem(ENUM_SESSION_KEY, JSON.stringify({ enumeratorId, projectId }));
  } catch {}
}

function loadEnumeratorSession(): { enumeratorId: string; projectId: string } | null {
  try {
    const raw = localStorage.getItem(ENUM_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearEnumeratorSession() {
  try { localStorage.removeItem(ENUM_SESSION_KEY); } catch {}
}
// ─────────────────────────────────────────────────────────────

type AppView = 'landing' | 'team-head-auth' | 'enumerator-join' | 'admin-auth' | 'team-head-app' | 'enumerator-app' | 'admin-app';
type TeamHeadView = 'dashboard' | 'projects' | 'create-project' | 'project-detail' | 'monitoring' | 'results' | 'reports';

function AppContent() {
  const { user, teamHead, role, loading } = useAuth();
  const [view, setView] = useState<AppView>('landing');
  const [teamHeadView, setTeamHeadView] = useState<TeamHeadView>('dashboard');
  const [selectedProject, setSelectedProject] = useState<SurveyProject | null>(null);
  const [enumeratorId, setEnumeratorId] = useState<string | null>(null);
  const [enumeratorProject, setEnumeratorProject] = useState<SurveyProject | null>(null);
  // Separate loading flag for enumerator session restore so the main auth
  // loading spinner doesn't flash while we fetch from Supabase.
  const [enumRestoring, setEnumRestoring] = useState(true);

  // ── Restore enumerator session from localStorage on mount ──
  useEffect(() => {
    async function tryRestoreEnumeratorSession() {
      const saved = loadEnumeratorSession();
      if (!saved) { setEnumRestoring(false); return; }

      try {
        const [enumerator, project] = await Promise.all([
          getEnumeratorById(saved.enumeratorId),
          getProject(saved.projectId),
        ]);

        if (enumerator && project) {
          // Mark back as online on restore
          await updateEnumerator(enumerator.id, { is_online: true });
          setEnumeratorId(enumerator.id);
          setEnumeratorProject(project);
          setView('enumerator-app');
        } else {
          // Saved session is stale (enumerator or project deleted)
          clearEnumeratorSession();
        }
      } catch {
        clearEnumeratorSession();
      } finally {
        setEnumRestoring(false);
      }
    }

    tryRestoreEnumeratorSession();
  }, []);

  // ── Auto-navigate for authenticated team heads / admins ────
  useEffect(() => {
    if (loading || enumRestoring) return;
    if (user && teamHead && role === 'team_head') setView('team-head-app');
    else if (user && role === 'admin') setView('admin-app');
    else if (!user && (view === 'team-head-app' || view === 'admin-app')) {
      setView('landing');
    }
    // Keep enumerator flows untouched; only bounce auth-based apps to landing.
  }, [user, teamHead, role, loading, enumRestoring, view]);

  function handleTeamHeadNavigate(viewStr: string, data?: any) {
    if (data && viewStr === 'project-detail') { setSelectedProject(data as SurveyProject); setTeamHeadView('project-detail'); }
    else if (viewStr === 'monitoring') { if (data) setSelectedProject(data as SurveyProject); setTeamHeadView('monitoring'); }
    else if (viewStr === 'results') { if (data) setSelectedProject(data as SurveyProject); setTeamHeadView('results'); }
    else if (viewStr === 'reports') { if (data) setSelectedProject(data as SurveyProject); setTeamHeadView('reports'); }
    else setTeamHeadView(viewStr as TeamHeadView);
  }

  async function handleEnumeratorJoined(enumId: string, projectId: string) {
    const p = await getProject(projectId);
    if (p) {
      saveEnumeratorSession(enumId, projectId);
      setEnumeratorId(enumId);
      setEnumeratorProject(p);
      setView('enumerator-app');
    }
  }

  async function handleEnumeratorLogout() {
    if (enumeratorId) {
      try { await updateEnumerator(enumeratorId, { is_online: false }); } catch {}
    }
    clearEnumeratorSession();
    setEnumeratorId(null);
    setEnumeratorProject(null);
    setView('landing');
  }

  if (loading || enumRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (view === 'landing') return <LandingPage onTeamHeadLogin={() => setView('team-head-auth')} onEnumeratorJoin={() => setView('enumerator-join')} onAdminLogin={() => setView('admin-auth')} />;
  if (view === 'team-head-auth') return <TeamHeadAuth onBack={() => setView('landing')} onSuccess={() => setView('team-head-app')} />;
  if (view === 'enumerator-join') return <EnumeratorJoin onBack={() => setView('landing')} onJoined={handleEnumeratorJoined} />;
  if (view === 'admin-auth') return <AdminAuth onBack={() => setView('landing')} onSuccess={() => setView('admin-app')} />;

  if (view === 'team-head-app') {
    return (
      <SurveyProvider>
        <TeamHeadLayout currentView={teamHeadView} onViewChange={setTeamHeadView}>
          {teamHeadView === 'dashboard' && <TeamHeadDashboard onNavigate={handleTeamHeadNavigate} />}
          {teamHeadView === 'projects' && <ProjectsList onNavigate={handleTeamHeadNavigate} />}
          {teamHeadView === 'create-project' && <SurveyProjectForm onBack={() => setTeamHeadView('dashboard')} onCreated={(p) => { setSelectedProject(p); setTeamHeadView('project-detail'); }} />}
          {teamHeadView === 'project-detail' && selectedProject && <ProjectDetail project={selectedProject} onBack={() => setTeamHeadView('projects')} onNavigate={handleTeamHeadNavigate} />}
          {teamHeadView === 'monitoring' && <LiveMonitoring project={selectedProject} onBack={() => setTeamHeadView('project-detail')} />}
          {teamHeadView === 'results' && <ResultsPage project={selectedProject} onBack={() => setTeamHeadView('project-detail')} />}
          {teamHeadView === 'reports' && <ReportGenerator project={selectedProject} onBack={() => setTeamHeadView('project-detail')} />}
        </TeamHeadLayout>
      </SurveyProvider>
    );
  }

  if (view === 'enumerator-app' && enumeratorId && enumeratorProject) {
    return <EnumeratorInterface enumeratorId={enumeratorId} project={enumeratorProject} onLogout={handleEnumeratorLogout} />;
  }
  if (view === 'admin-app') return <AdminPanel />;

  return <LandingPage onTeamHeadLogin={() => setView('team-head-auth')} onEnumeratorJoin={() => setView('enumerator-join')} onAdminLogin={() => setView('admin-auth')} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
