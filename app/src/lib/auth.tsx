import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { reportError } from './errors';
import { getPref, setPref } from './prefs';
import { clearMediaCache, supabase } from './supabase';
import type { Profile, University } from './types';

WebBrowser.maybeCompleteAuthSession();

type Ctx = {
  session: Session | null;
  profile: Profile | null;
  university: University | null;
  loading: boolean;
  /** true when the profile couldn't be loaded (network); the old profile is kept */
  profileError: boolean;
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
  const [profileError, setProfileError] = useState(false);
  const uidRef = useRef<string | undefined>(undefined);

  const loadProfile = useCallback(async (uid?: string) => {
    uidRef.current = uid;
    if (!uid) { setProfile(null); setUniversity(null); setProfileError(false); return; }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, university:universities(*), college:colleges(id, name_ar, name_en), major:majors(id, name_ar, name_en)')
        .eq('id', uid)
        .maybeSingle();
      if (uidRef.current !== uid) return; // a newer sign-in started meanwhile
      if (error) throw error;
      setProfileError(false);
      // a missing row means the account was removed: keep null so the gate can sign out
      setProfile((data as Profile) ?? null);
      setUniversity((data?.university as University) ?? null);
    } catch (e) {
      // keep the previous profile on network errors instead of wiping it
      reportError(e);
      if (uidRef.current === uid) setProfileError(true);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data }) => { setSession(data.session); await loadProfile(data.session?.user.id); })
      .catch((e) => { reportError(e); setProfileError(true); })
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // a token refresh doesn't change who is signed in
      if (event === 'TOKEN_REFRESHED' && s?.user.id === uidRef.current) return;
      loadProfile(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: Ctx = {
    session, profile, university, loading, profileError,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      try { await supabase.auth.signOut(); } catch (e) { reportError(e); await supabase.auth.signOut({ scope: 'local' }).catch(() => {}); }
      clearMediaCache();
      setProfile(null); setUniversity(null); setSession(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** University domain check before we send a code: only university emails can join. */
export async function universityForEmail(email: string): Promise<University | null> {
  const dom = email.trim().toLowerCase().split('@')[1];
  if (!dom) return null;
  const { data, error } = await supabase.from('universities').select('*').eq('is_active', true);
  if (error) throw error; // network problem, not a wrong email
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
  if (Platform.OS === 'web') {
    // the web version leaves the page for Microsoft and comes back to /callback, which finishes sign-in
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'azure', options: { redirectTo, scopes: `openid email profile offline_access ${extraScopes}`.trim(), queryParams: { prompt: extraScopes ? 'consent' : 'select_account' } } });
    return error ? { error } : { error: new Error('redirecting') };
  }
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
  if (Platform.OS === 'web') {
    // the web version leaves for Microsoft; /callback finishes the import when it comes back
    setPref('teams_import', String(Date.now()));
    const r = await signInWithMicrosoft('User.Read Team.ReadBasic.All');
    return { error: r.error?.message === 'redirecting' ? 'redirecting' : 'consent' };
  }
  const r = await signInWithMicrosoft('User.Read Team.ReadBasic.All');
  if ('error' in r && r.error) return { error: r.error.message === 'cancelled' ? 'cancelled' : 'consent' };
  const token = (r as { data?: { session?: { provider_token?: string | null } | null } }).data?.session?.provider_token;
  return importTeamsWithToken(token);
}

/** Read the student's Teams classes with a Microsoft token and turn them into courses and sections. */
export async function importTeamsWithToken(token?: string | null): Promise<{ count: number } | { error: string }> {
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

/** True once, right after coming back from a web Teams import started in the last 10 minutes. */
export function takePendingTeamsImport(): boolean {
  const at = Number(getPref('teams_import') || 0);
  if (!at) return false;
  setPref('teams_import', '');
  return Date.now() - at < 10 * 60 * 1000;
}
