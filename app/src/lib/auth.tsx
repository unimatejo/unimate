import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import type { Profile, University } from './types';

WebBrowser.maybeCompleteAuthSession();

type Ctx = {
  session: Session | null;
  profile: Profile | null;
  university: University | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [university, setUniversity] = useState<University | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid?: string) => {
    if (!uid) { setProfile(null); setUniversity(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('*, university:universities(*), college:colleges(id,name_ar), major:majors(id,name_ar)')
      .eq('id', uid)
      .single();
    setProfile((data as Profile) ?? null);
    setUniversity((data?.university as University) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      loadProfile(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: Ctx = {
    session, profile, university, loading,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** University domain check before we send a code: only university emails can join. */
export async function universityForEmail(email: string): Promise<University | null> {
  const dom = email.trim().toLowerCase().split('@')[1];
  if (!dom) return null;
  const { data } = await supabase.from('universities').select('*').eq('is_active', true);
  return (data ?? []).find((u: University) =>
    u.email_domains.some((d) => dom === d || dom.endsWith('.' + d))
  ) ?? null;
}

export async function sendEmailCode(email: string) {
  // The email carries both a sign-in link (opens the app at /callback) and, once our SMTP template is live, a 6-digit code.
  return supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: Linking.createURL('callback') },
  });
}

export async function verifyEmailCode(email: string, token: string) {
  return supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
}

/** Sign in with the university's Microsoft 365 account (Azure / Entra ID through Supabase). */
export async function signInWithMicrosoft(extraScopes = '') {
  const redirectTo = Linking.createURL('callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: { redirectTo, scopes: `openid email profile offline_access ${extraScopes}`.trim(), skipBrowserRedirect: true, queryParams: { prompt: extraScopes ? 'consent' : 'select_account' } },
  });
  if (error || !data?.url) return { error: error ?? new Error('no url') };
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return { error: new Error('cancelled') };
  const code = new URL(res.url).searchParams.get('code');
  if (!code) return { error: new Error('no code') };
  return supabase.auth.exchangeCodeForSession(code);
}

/**
 * Bring the student's courses in from their Microsoft Teams classes (one team per course section).
 * Runs as a separate consent so sign-in still works if a university blocks the Teams permission.
 */
export async function importTeamsCourses(): Promise<{ count: number } | { error: string }> {
  const r = await signInWithMicrosoft('User.Read Team.ReadBasic.All');
  if ('error' in r && r.error) return { error: r.error.message === 'cancelled' ? 'cancelled' : 'consent' };
  const token = (r as { data?: { session?: { provider_token?: string | null } | null } }).data?.session?.provider_token;
  if (!token) return { error: 'consent' };
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams?$select=id,displayName,description', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { error: res.status === 403 ? 'consent' : 'network' };
    const body = await res.json();
    const { data, error } = await supabase.rpc('import_teams', { teams: body.value ?? [] });
    if (error) return { error: 'network' };
    return { count: (data as number) ?? 0 };
  } catch {
    return { error: 'network' };
  }
}
