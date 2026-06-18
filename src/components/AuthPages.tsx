import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { findEnumeratorByMobile, createEnumerator, updateEnumerator, getEnumerators } from '../lib/database';
import type { Enumerator } from '../lib/types';
import { Car, ArrowLeft, Eye, EyeOff, AlertCircle, Shield, UserCheck } from 'lucide-react';

interface TeamHeadAuthProps { onBack: () => void; onSuccess: () => void; }

export function TeamHeadAuth({ onBack, onSuccess }: TeamHeadAuthProps) {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
  
    console.log("EMAIL:", email);
    console.log("PASSWORD:", password);
    console.log("FULLNAME:", fullName);
  
    setError('');
    setLoading(true);
  
    try {
      if (isSignUp) {
        await signUp(
          email,
          password,
          fullName,
          organization || undefined,
          phone || undefined
        );
      } else {
        await signIn(email, password);
      }
  
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-xl flex items-center justify-center"><Car className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-xl font-bold text-slate-900">{isSignUp ? 'Create Account' : 'Team Head Login'}</h1><p className="text-sm text-slate-500">{isSignUp ? 'Set up your survey workspace' : 'Access your survey dashboard'}</p></div>
          </div>
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4"><AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /><p className="text-sm text-red-600">{error}</p></div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (<>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label><input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm" required placeholder="John Doe" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Organization</label><input type="text" value={organization} onChange={e => setOrganization(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm" placeholder="Company" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm" placeholder="+91..." /></div>
              </div></>)}
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm" required placeholder="you@example.com" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm pr-10" required minLength={6} placeholder="Min 6 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 shadow-md shadow-blue-500/25">{loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}</button>
          </form>
          <div className="mt-4 text-center"><button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-sm text-blue-600 hover:text-blue-700 font-medium">{isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}</button></div>
        </div>
      </div>
    </div>
  );
}

interface EnumeratorJoinProps { onBack: () => void; onJoined: (enumeratorId: string, projectId: string) => void; }

type JoinStep =
  | { kind: 'lookup' }
  | { kind: 'returning'; enumerator: Enumerator; projectId: string }
  | { kind: 'new'; projectId: string; maxEnumerators: number };

export function EnumeratorJoin({ onBack, onJoined }: EnumeratorJoinProps) {
  const [step, setStep] = useState<JoinStep>({ kind: 'lookup' });
  const [roomCode, setRoomCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Step 1: validate room code + look up mobile ───────────
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: room, error: roomError } = await supabase
        .from('survey_rooms')
        .select('*, survey_projects(*)')
        .eq('room_code', roomCode.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (roomError || !room) { setError('Invalid or inactive room code.'); return; }
      const project = room.survey_projects as any;
      if (!project) { setError('Survey project not found.'); return; }

      // Check for existing enumerator with the same mobile in this project
      const existing = await findEnumeratorByMobile(project.id, mobile.trim());
      if (existing) {
        setStep({ kind: 'returning', enumerator: existing, projectId: project.id });
      } else {
        const currentEnumerators = await getEnumerators(project.id);
        if (currentEnumerators.length >= project.num_enumerators) {
          setError('Maximum enumerator limit reached for this project.');
          return;
        }
        setStep({ kind: 'new', projectId: project.id, maxEnumerators: project.num_enumerators });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to look up room');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2a: returning enumerator confirms rejoin ─────────
  async function handleRejoin() {
    if (step.kind !== 'returning') return;
    setError('');
    setLoading(true);
    try {
      const updated = await updateEnumerator(step.enumerator.id, { is_online: true });
      if (!updated) { setError('Failed to rejoin survey.'); return; }
      onJoined(updated.id, step.projectId);
    } catch (err: any) {
      setError(err.message || 'Failed to rejoin');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2b: new enumerator registers ─────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== 'new') return;
    setError('');
    setLoading(true);
    try {
      const currentEnumerators = await getEnumerators(step.projectId);
      if (currentEnumerators.length >= step.maxEnumerators) {
        setError('Maximum enumerator limit reached for this project.');
        return;
      }

      const enumCode = `ENUM-${Date.now().toString(36).toUpperCase()}`;
      const newEnum = await createEnumerator({
        project_id:       step.projectId,
        name:             name.trim(),
        mobile:           mobile.trim(),
        email:            email.trim() || null,
        enumerator_code:  enumCode,
        assigned_lat:     null,
        assigned_lng:     null,
        gps_lat:          null,
        gps_lng:          null,
        gps_accuracy:     null,
        is_online:        true,
        battery_level:    null,
        network_status:   'unknown',
        camera_permission: false,
        last_heartbeat:   null,
      });
      if (!newEnum) { setError('Failed to join survey. Please try again.'); return; }
      onJoined(newEnum.id, step.projectId);
    } catch (err: any) {
      setError(err.message || 'Failed to join');
    } finally {
      setLoading(false);
    }
  }

  function resetToLookup() {
    setStep({ kind: 'lookup' });
    setError('');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={step.kind === 'lookup' ? onBack : resetToLookup}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {step.kind === 'lookup' ? 'Back' : 'Change details'}
        </button>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center">
              {step.kind === 'returning' ? <UserCheck className="w-5 h-5 text-white" /> : <Car className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {step.kind === 'lookup' ? 'Join Survey' : step.kind === 'returning' ? 'Welcome Back' : 'New Enumerator'}
              </h1>
              <p className="text-sm text-slate-500">
                {step.kind === 'lookup' ? 'Enter room code and your mobile number' : step.kind === 'returning' ? 'Continue your existing session' : 'Complete your registration'}
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* ── Step 1: Room code + mobile lookup ── */}
          {step.kind === 'lookup' && (
            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Room Code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm tracking-widest font-mono text-center text-lg"
                  required
                  placeholder="ABC123"
                  maxLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number</label>
                <input
                  type="tel"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                  required
                  placeholder="+91..."
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-medium hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 shadow-md shadow-emerald-500/25"
              >
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}

          {/* ── Step 2a: Returning enumerator ── */}
          {step.kind === 'returning' && (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl font-bold text-emerald-700">
                    {step.enumerator.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <p className="font-semibold text-slate-900">{step.enumerator.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">{step.enumerator.mobile}</p>
                <p className="text-xs text-emerald-600 font-mono mt-1">{step.enumerator.enumerator_code}</p>
              </div>
              <p className="text-sm text-slate-600 text-center">
                Found your existing account. Tap below to rejoin the survey and continue from where you left off.
              </p>
              <button
                onClick={handleRejoin}
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-medium hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 shadow-md shadow-emerald-500/25"
              >
                {loading ? 'Rejoining…' : 'Rejoin Survey'}
              </button>
            </div>
          )}

          {/* ── Step 2b: New enumerator registration ── */}
          {step.kind === 'new' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                No account found for <span className="font-mono font-medium">{mobile}</span>. Complete your details to join.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                  required
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-medium hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 shadow-md shadow-emerald-500/25"
              >
                {loading ? 'Joining…' : 'Join Survey'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

interface AdminAuthProps { onBack: () => void; onSuccess: () => void; }

export function AdminAuth({ onBack, onSuccess }: AdminAuthProps) {
  const { adminSignIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await adminSignIn(email, password); onSuccess(); } catch (err: any) { setError(err.message || 'Admin login failed'); } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-zinc-700 rounded-xl flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-xl font-bold text-slate-900">Admin Login</h1><p className="text-sm text-slate-500">System administration access</p></div>
          </div>
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4"><AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /><p className="text-sm text-red-600">{error}</p></div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-sm" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-sm pr-10" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-gradient-to-r from-slate-700 to-zinc-700 text-white rounded-lg font-medium hover:from-slate-800 hover:to-zinc-800 transition-all disabled:opacity-50">{loading ? 'Signing in...' : 'Admin Sign In'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
