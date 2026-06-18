import { useState } from 'react';
import { Car, Users, Shield, ChevronRight, MapPin, Camera, BarChart3, FileText } from 'lucide-react';

interface LandingPageProps {
  onTeamHeadLogin: () => void;
  onEnumeratorJoin: () => void;
  onAdminLogin: () => void;
}

export default function LandingPage({ onTeamHeadLogin, onEnumeratorJoin, onAdminLogin }: LandingPageProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const features = [
    { icon: MapPin, title: 'Real-Time GPS Tracking', desc: 'Monitor enumerator locations live on an interactive map' },
    { icon: Camera, title: 'AI Image Collection', desc: 'Capture and classify vehicles with intelligent automation' },
    { icon: BarChart3, title: 'Live Analytics', desc: 'Real-time vehicle count charts and progress tracking' },
    { icon: FileText, title: 'Auto Report Generation', desc: 'Generate professional PDF reports instantly' },
  ];

  const roles = [
    { icon: Users, title: 'Team Head', subtitle: 'Create & manage surveys', desc: 'Full control over survey projects, enumerator management, and live monitoring dashboard.', action: onTeamHeadLogin, color: 'from-blue-600 to-cyan-600', hoverBg: 'hover:bg-blue-50', borderHover: 'hover:border-blue-300' },
    { icon: Car, title: 'Enumerator', subtitle: 'Join & conduct surveys', desc: 'Join active survey rooms, capture vehicle images, and submit counts in real-time.', action: onEnumeratorJoin, color: 'from-emerald-600 to-teal-600', hoverBg: 'hover:bg-emerald-50', borderHover: 'hover:border-emerald-300' },
    { icon: Shield, title: 'Admin', subtitle: 'System management', desc: 'Global oversight of all surveys, users, storage, and system analytics.', action: onAdminLogin, color: 'from-slate-600 to-zinc-600', hoverBg: 'hover:bg-slate-50', borderHover: 'hover:border-slate-300' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Car className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">SurveyFlow</h1>
            </div>
            <p className="text-xl sm:text-2xl text-slate-300 font-light mb-2">Traffic & Parking Survey Management System</p>
            <p className="text-slate-400 max-w-2xl mx-auto text-base sm:text-lg">
              Coordinate field vehicle surveys with real-time monitoring, AI-assisted image collection, and automated report generation.
            </p>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {roles.map((r, idx) => (
            <button key={r.title} onClick={r.action} onMouseEnter={() => setHoveredCard(idx)} onMouseLeave={() => setHoveredCard(null)}
              className={`bg-white rounded-2xl p-8 text-left shadow-lg border border-slate-200 transition-all duration-300 ${r.borderHover} ${r.hoverBg} hover:shadow-xl hover:-translate-y-1 group`}>
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${r.color} flex items-center justify-center mb-5 shadow-md transition-transform duration-300 ${hoveredCard === idx ? 'scale-110' : ''}`}>
                <r.icon className="w-7 h-7 text-white" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-slate-900">{r.title}</h3>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </div>
              <p className="text-sm font-medium text-slate-500 mb-3">{r.subtitle}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{r.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Everything you need for field surveys</h2>
          <p className="text-slate-500 max-w-xl mx-auto">From project setup to final report, SurveyFlow covers the entire survey lifecycle.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(f => (
            <div key={f.title} className="bg-white rounded-xl p-6 border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-200">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4"><f.icon className="w-5 h-5 text-slate-700" /></div>
              <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-slate-400">
          SurveyFlow - Traffic & Parking Survey Management System
        </div>
      </footer>
    </div>
  );
}
