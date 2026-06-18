import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { TeamHead, UserRole } from '../lib/types';
import { getTeamHead, createTeamHead } from '../lib/database';

interface AuthState {
  user: User | null;
  session: Session | null;
  teamHead: TeamHead | null;
  role: UserRole | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, organization?: string, phone?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  adminSignIn: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [teamHead, setTeamHead] = useState<TeamHead | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadTeamHead(s.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadTeamHead(s.user.id);
      else { setTeamHead(null); setRole(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadTeamHead(userId: string) {
    const th = await getTeamHead(userId);
    if (th) { setTeamHead(th); setRole('team_head'); }
    setLoading(false);
  }

  async function signUp(email: string, password: string, fullName: string, organization?: string, phone?: string) {
    setLoading(true);
    const { data: authData, error } = await supabase.auth.signUp({ email, password });
    if (error) { setLoading(false); throw error; }
    if (authData.user) {
      const th = await createTeamHead(authData.user.id, fullName, organization, phone);
      if (th) { setTeamHead(th); setRole('team_head'); }
    }
    setLoading(false);
  }

  async function signIn(email: string, password: string) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); throw error; }
  }

  async function adminSignIn(email: string, password: string) {
    setLoading(true);
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); throw error; }
    if (authData.user) {
      const { data } = await supabase.from('admin_users').select('*').eq('user_id', authData.user.id).maybeSingle();
      if (data) setRole('admin');
      else { await supabase.auth.signOut(); throw new Error('Not an admin user'); }
    }
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTeamHead(null); setRole(null);
  }

  return (
    <AuthContext.Provider value={{ user, session, teamHead, role, loading, signUp, signIn, signOut, adminSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
