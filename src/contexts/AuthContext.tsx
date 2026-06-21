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
      if (s?.user) loadTeamHeadOrCreate('INITIAL_SESSION', s.user);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadTeamHeadOrCreate(_event, s.user);
      else { setTeamHead(null); setRole(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  /**
   * Looks up the team_head record for a user.
   * If none exists AND the auth event is SIGNED_IN AND the user's auth metadata
   * contains full_name + role='team_head' (stored during signUp), it creates the
   * record now. This handles the email-confirmation round-trip: the user confirms
   * their email, Supabase fires SIGNED_IN, and we create the team_head row here
   * with a live authenticated session — satisfying the RLS INSERT policy.
   */
  async function loadTeamHeadOrCreate(event: string, user: User) {
    console.log(
      '[loadTeamHeadOrCreate] ▶ START',
      '\n  → event             :', event,
      '\n  → user.id           :', user.id,
      '\n  → user.email        :', user.email,
      '\n  → user.user_metadata:', JSON.stringify(user.user_metadata),
    );

    // ── 1. Check if the row already exists ───────────────────────────────────
    const th = await getTeamHead(user.id);
    if (th) {
      console.log('[loadTeamHeadOrCreate] ✔ FOUND existing team_head row:', th.id);
      setTeamHead(th);
      setRole('team_head');
      setLoading(false);
      return;
    }
    console.log('[loadTeamHeadOrCreate] ✘ No team_head row found for user:', user.id);

    // ── 2. Decide whether to auto-create ─────────────────────────────────────
    // We intentionally do NOT restrict by event type. The INITIAL_SESSION event
    // fires when the user opens the app after confirming their email in another
    // tab — that is the most common confirmation flow and must be handled here.
    // The only safety guard is meta.role === 'team_head', which is written only
    // by our own signUp() call, so it cannot accidentally fire for admin users.
    const meta = user.user_metadata as Record<string, unknown> | undefined;

    const hasFullName  = typeof meta?.full_name === 'string' && (meta.full_name as string).trim() !== '';
    const hasRoleFlag  = meta?.role === 'team_head';
    const hasSession   = !!(await supabase.auth.getSession()).data.session;
    const willCreate   = hasFullName && hasRoleFlag && hasSession;

    console.log(
      '[loadTeamHeadOrCreate] auto-create decision',
      '\n  → meta.full_name present    :', hasFullName,
      '\n  → meta.role === "team_head" :', hasRoleFlag,
      '\n  → active session exists     :', hasSession,
      '\n  → WILL call createTeamHead  :', willCreate,
    );

    if (!hasFullName || !hasRoleFlag) {
      // ── Path A: metadata is missing (user registered before the fix was
      // deployed, when signUp() did not pass options.data). The team_head row
      // cannot be created automatically because we have no name to insert.
      // The user must be deleted from Supabase Auth → Dashboard → Authentication
      // → Users, and then re-register so that metadata is stored correctly.
      console.warn(
        '[loadTeamHeadOrCreate] ⚠ SKIPPED — metadata incomplete.',
        '\n  Cause : This auth user was registered before the metadata fix was deployed.',
        '\n  Fix   : Delete this auth user in Supabase Dashboard → Authentication → Users',
        '\n          and ask the user to sign up again.',
        '\n  user.id :', user.id,
        '\n  email   :', user.email,
        '\n  meta    :', JSON.stringify(meta),
      );
      setLoading(false);
      return;
    }

    if (!hasSession) {
      // ── Path B: metadata is present but the session is gone.
      // This should never happen (onAuthStateChange passes the session) but
      // log it clearly if it does.
      console.error(
        '[loadTeamHeadOrCreate] ✖ SKIPPED — metadata is correct but NO active session.',
        '\n  This means the Supabase client has no JWT to authenticate the INSERT.',
        '\n  The INSERT would fail RLS (auth.uid() === null).',
        '\n  event:', event, '| user.id:', user.id,
      );
      setLoading(false);
      return;
    }

    // ── Path C: happy path — create the row now ───────────────────────────────
    console.log('[loadTeamHeadOrCreate] ▶ Calling createTeamHead for user:', user.id);
    try {
      const newTh = await createTeamHead(
        user.id,
        meta!.full_name as string,
        typeof meta!.organization === 'string' ? meta!.organization : undefined,
        typeof meta!.phone === 'string' ? meta!.phone : undefined,
      );
      if (newTh) {
        console.log('[loadTeamHeadOrCreate] ✔ team_head row created successfully:', newTh.id);
        setTeamHead(newTh);
        setRole('team_head');
      } else {
        console.error('[loadTeamHeadOrCreate] ✖ createTeamHead returned null without throwing — unexpected.');
      }
    } catch (err: any) {
      console.error(
        '[loadTeamHeadOrCreate] ✖ createTeamHead THREW an error',
        '\n  → message :', err.message,
        '\n  → code    :', err.code,
        '\n  → hint    :', err.hint,
        '\n  → details :', err.details,
        '\n  → full    :', JSON.stringify(err),
      );
    }

    setLoading(false);
  }

  async function signUp(email: string, password: string, fullName: string, organization?: string, phone?: string) {
    setLoading(true);

    // Store registration details in user_metadata so they survive the email-
    // confirmation round-trip and loadTeamHeadOrCreate can recreate the row.
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          organization: organization ?? null,
          phone: phone ?? null,
          role: 'team_head',
        },
      },
    });

    if (error) {
      console.error('[signUp] supabase.auth.signUp error:', error.message, '| status:', error.status);
      setLoading(false);
      throw error;
    }

    if (!authData.user) {
      setLoading(false);
      throw new Error('Sign up failed — no user returned by Supabase.');
    }

    console.log(
      '[signUp] ✔ Auth user created',
      '\n  → user.id            :', authData.user.id,
      '\n  → user.email         :', authData.user.email,
      '\n  → session present    :', !!authData.session,
      '\n  → session user_id    :', authData.session?.user?.id ?? 'N/A',
      '\n  → access_token start :', authData.session?.access_token?.slice(0, 24) ?? 'NONE',
      '\n  → user_metadata      :', JSON.stringify(authData.user.user_metadata),
    );

    // When Supabase requires email confirmation, authData.session is null.
    // The team_head row will be created by loadTeamHeadOrCreate when the user
    // clicks the confirmation link and SIGNED_IN fires with a live session.
    if (!authData.session) {
      console.warn('[signUp] ⚠ No session after signUp — email confirmation is required. team_head row will be created after confirmation.');
      setLoading(false);
      throw new Error(
        'Account created! Please check your email and click the confirmation link to complete sign-up.',
      );
    }

    // Email confirmation is disabled — session is already active.
    // Create the team_head profile row now while the session is live.
    console.log('[signUp] Session is active — proceeding to createTeamHead immediately.');
    try {
      const th = await createTeamHead(authData.user.id, fullName, organization, phone);
      if (th) {
        setTeamHead(th);
        setRole('team_head');
      }
    } catch (err: any) {
      console.error(
        '[signUp] ✖ createTeamHead FAILED',
        '\n  → message :', err.message,
        '\n  → code    :', err.code,
        '\n  → hint    :', err.hint,
        '\n  → details :', err.details,
        '\n  → full    :', JSON.stringify(err),
      );
      setLoading(false);
      throw new Error(`Account created but profile could not be saved: ${err.message}`);
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
