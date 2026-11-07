import { Platform, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { clearCache, readCache, writeCache } from './cache';
import { reportError } from './errors';
import { getPref, setPref } from './prefs';
import { toast } from './toast';
import { t } from './i18n';
import { clearMediaCache, supabase } from './supabase';
import { dropWebPush } from './webpush';
import type { Profile, University } from './types';

const keptKey = (uid: string) => `profile:${uid}`;

/**
 * No internet and the sign-in's short-lived token has run out: Supabase can't renew it, so it reports no session. The
 * sign-in saved on this phone still says who this is, enough to open the app offline (campus map, timetable); the
 * token is renewed on its own as soon as there's a connection, and nothing on the server accepts the old one meanwhile.
 */
function savedSession(): Session | null {
  try {
    const ref = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
    const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) ?? 'null') as Session | null;
    return s?.user?.id && s.refresh_token ? s : null;
  } catch { return null; }
}

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

  // the last profile this phone saw: the app opens at once with it, and works without internet (the campus map)
  const applyKept = useCallback((uid: string) => {
    const k = readCache<{ profile: Profile; university: University | null }>(keptKey(uid));
    if (k?.profile) { setProfile(k.profile); setUniversity(k.university); }
    return !!k?.profile;
  }, []);

  const loadProfile = useCallback(async (uid?: string) => {
    uidRef.current = uid;
    if (!uid) { setProfile(null); setUniversity(null); setProfileError(false); return; }
    try {
      // a weak connection shouldn't lock anyone out: try up to 3 times before showing the error screen
      let data: Record<string, any> | null = null;  
      let error: { message?: string; code?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        ({ data, error } = await supabase
          .from('profiles')
          .select('*, university:universities!profiles_university_id_fkey(*), college:colleges!profiles_college_id_fkey(id, name_ar, name_en), major:majors!profiles_major_id_fkey(id, name_ar, name_en)')
          .eq('id', uid)
          .maybeSingle());
        if (!error || uidRef.current !== uid) break;
        // the saved sign-in is no longer valid: get a fresh one once, then try again
        if (/jwt|token|PGRST30/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) {
          const { error: re } = await supabase.auth.refreshSession();
          // refused (not just no connection): back to the sign-in screen
          if (re && re.name !== 'AuthRetryableFetchError' && re.status !== 0) { await supabase.auth.signOut().catch(() => {}); return; }
        }
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
      if (uidRef.current !== uid) return; // a newer sign-in started meanwhile
      if (error) throw error;
      setProfileError(false);
      // a missing row means the account was removed: keep null so the gate can sign out
      // signed back in within 30 days of asking to delete: keep the account
      if (data?.deletion_requested_at) {
        supabase.rpc('cancel_account_deletion').then(({ data: back }) => {
          if (back) Alert.alert(t('رجع حسابك ✓'), t('كنت طالب حذف حسابك، وبما إنك رجعت سجلت دخول، لغينا الحذف وكل إشي إلك زي ما هو.'));
        });
        data.deletion_requested_at = null;
      }
      // Instagram / Snapchat live in a private table now: only the owner (and who they allow) can read them
      if (data) {
        const { data: soc } = await supabase.rpc('profile_socials', { p_user: uid });
        const s0 = (soc as { instagram: string | null; snapchat: string | null }[] | null)?.[0];
        data.instagram = s0?.instagram ?? null; data.snapchat = s0?.snapchat ?? null;
      }
      setProfile((data as Profile) ?? null);
      setUniversity((data?.university as University) ?? null);
      if (data) writeCache(keptKey(uid), { profile: data, university: data.university ?? null });
    } catch (e) {
      // keep the previous profile on network errors instead of wiping it; without internet the kept one is enough
      reportError(e);
      if (uidRef.current === uid && !applyKept(uid)) setProfileError(true);
    }
  }, [applyKept]);

  useEffect(() => {
    // No connection (or a campus signal that barely works): Supabase keeps trying to renew the sign-in for a long
    // time before it answers. After 3 s the app opens with the sign-in and profile saved on this phone, and takes
    // the real answer whenever it comes.
    let settled = false;
    const early = setTimeout(() => {
      const saved = savedSession();
      if (settled || !saved || !applyKept(saved.user.id)) return;
      settled = true;
      setSession(saved);
      setLoading(false);
    }, 3000);
    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        const offline = !data.session && error?.name === 'AuthRetryableFetchError';
        const session = data.session ?? (offline ? savedSession() : null);
        if (settled && offline) return; // already open from the saved sign-in
        settled = true;
        setSession(session);
        const uid = session?.user.id;
        // seen before on this phone: open now with it, and bring it up to date in the background
        if (uid && applyKept(uid)) { setLoading(false); void loadProfile(uid); return; }
        await loadProfile(uid);
      })
      .catch((e) => { reportError(e); if (!settled) setProfileError(true); })
      .finally(() => { clearTimeout(early); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // the first answer is getSession's above (it also covers opening offline with an expired token)
      if (event === 'INITIAL_SESSION') return;
      setSession(s);
      // a token refresh doesn't change who is signed in
      if (event === 'TOKEN_REFRESHED' && s?.user.id === uidRef.current) return;
      loadProfile(s?.user.id);
    });
    return () => { clearTimeout(early); sub.subscription.unsubscribe(); };
  }, [loadProfile, applyKept]);

  const value: Ctx = {
    session, profile, university, loading, profileError,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      await dropWebPush();
      try { await supabase.auth.signOut(); } catch (e) { reportError(e); await supabase.auth.signOut({ scope: 'local' }).catch(() => {}); }
      clearMediaCache(); clearCache();
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

const TEAMS_SCOPES = 'User.Read Team.ReadBasic.All';

/** Sign in with the university's Microsoft 365 account (Azure / Entra ID through Supabase). */
async function signInWithMicrosoft(extraScopes = '') {
  const redirectTo = Linking.createURL('callback');
  const scopes = `openid email profile offline_access ${extraScopes}`.trim();
  if (Platform.OS === 'web') {
    // the web version leaves the page for Microsoft and comes back to /callback, which finishes sign-in
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'azure', options: { redirectTo, scopes, queryParams: { prompt: 'select_account' } } });
    return error ? { error } : { error: new Error('redirecting') };
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: { redirectTo, scopes, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) return { error: error ?? new Error('no url') };
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return { error: new Error('cancelled') };
  const q = new URL(res.url).searchParams;
  const code = q.get('code');
  if (!code) return { error: new Error(q.get('error') ? 'consent' : 'no code') };
  return supabase.auth.exchangeCodeForSession(code);
}

/**
 * One Microsoft sign-in that also brings the student's courses from Teams.
 * If the university doesn't allow the Teams permission, it quietly signs in without it.
 */
export async function signInWithMicrosoftAndCourses() {
  if (Platform.OS === 'web') {
    setPref('ms_teams_login', String(Date.now())); // /callback finishes the import, or retries without Teams
    setPref('teams_import', String(Date.now()));
    return signInWithMicrosoft(TEAMS_SCOPES);
  }
  let r = await signInWithMicrosoft(TEAMS_SCOPES);
  if ('error' in r && r.error?.message === 'consent') r = await signInWithMicrosoft();
  const token = (r as { data?: { session?: { provider_token?: string | null } | null } }).data?.session?.provider_token;
  if (token) { importTeamsInBackground(token); importMsPhoto(token); importMsRole(token); }
  return r;
}

/**
 * First Microsoft sign-in: use the university profile photo as the avatar (only if they have none, and only once —
 * if they remove it later, it stays removed).
 */
export async function importMsPhoto(token?: string | null) {
  if (!token) return;
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/photos/360x360/$value', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return; // no photo on the account
    const { data: claimed } = await supabase.rpc('ms_photo_claim');
    if (!claimed) return;
    const buf = await res.arrayBuffer();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id; if (!uid) return;
    const path = `${uid}/ms-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('avatars').upload(path, buf, { contentType: res.headers.get('content-type') ?? 'image/jpeg', upsert: true });
    if (error) return;
    const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', uid);
  } catch { /* the photo is a nice-to-have */ }
}

/** Doctors, deans and presidents are recognised from their Microsoft job title (checked on the server). */
export function importMsRole(token?: string | null) {
  if (!token) return;
  supabase.functions.invoke('ms-role', { body: { token } }).catch(() => { /* the title can also come from the staff list */ });
}

/** Import Teams courses without making the student wait; tell them when it's done. */
export function importTeamsInBackground(token: string) {
  importTeamsWithToken(token).then((res) => {
    if ('count' in res && res.count > 0) toast(t('انضافت {0} مواد من Teams لجدولك ✓', [res.count]));
  }).catch(() => {});
}

/** Web: the Teams-permission sign-in came back refused, so sign in again without it (once). */
export function retryMicrosoftWithoutTeams(): boolean {
  const at = Number(getPref('ms_teams_login') || 0);
  setPref('ms_teams_login', '');
  if (!at || Date.now() - at > 10 * 60 * 1000) return false;
  setPref('teams_import', '');
  signInWithMicrosoft();
  return true;
}

/**
 * Bring the student's courses in from their Microsoft Teams classes (one team per course section).
 * Runs as a separate consent so sign-in still works if a university blocks the Teams permission.
 */
export async function importTeamsCourses(): Promise<{ count: number } | { error: string }> {
  if (Platform.OS === 'web') {
    // the web version leaves for Microsoft; /callback finishes the import when it comes back
    setPref('teams_import', String(Date.now()));
    const r = await signInWithMicrosoft(TEAMS_SCOPES);
    return { error: r.error?.message === 'redirecting' ? 'redirecting' : 'consent' };
  }
  const r = await signInWithMicrosoft(TEAMS_SCOPES);
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
