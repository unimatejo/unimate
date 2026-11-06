import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Team (admin) sign-in: a personal email, a password and a 6-digit code from an authenticator app.
 * The database gives a team account admin powers only after the code (session level aal2).
 */

type TeamStatus = { team: boolean; admin: boolean; aal: 'aal1' | 'aal2' };

/** How this session signed in, from its token (password, otp, oauth, totp…). */
function signInMethods(session: Session): string[] {
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(globalThis.atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as { amr?: { method: string }[] };
    return (claims.amr ?? []).map((a) => a.method);
  } catch { return []; }
}

/** A password sign-in is only ever a team sign-in; university accounts use a code or Microsoft. */
export const isPasswordSession = (session: Session | null) =>
  !!session && signInMethods(session).some((m) => m === 'password' || m === 'recovery');

/**
 * For the app gate: is the signed-in account a team account, and has it entered its code?
 * University sign-ins never wait for this (answered at once); password sign-ins are checked with the server.
 */
export function useTeamStatus(session: Session | null): TeamStatus | null {
  const [s, setS] = useState<TeamStatus | null>(null);
  useEffect(() => {
    if (!session) { setS(null); return; }
    if (!isPasswordSession(session)) { setS({ team: false, admin: false, aal: 'aal1' }); return; }
    let live = true;
    supabase.rpc('my_team_status').then(({ data }) => { if (live && data) setS(data as TeamStatus); }, () => {});
    return () => { live = false; };
  }, [session]);
  return s;
}

export async function teamSignIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
}

/** "First time / forgot password": an email with a link to set a new one (sent only if the account exists). */
export async function teamResetLink(email: string) {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: Linking.createURL('team-password') });
}

/** What the sign-in needs next: the code from the app, or setting the app up the first time. */
export async function nextStep(): Promise<'done' | 'code' | 'enroll'> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === 'aal2') return 'done';
  return data?.nextLevel === 'aal2' ? 'code' : 'enroll';
}

/** First time: a new authenticator entry. Returns the QR code (SVG) and the key to type by hand. */
export async function startEnroll() {
  // a half-finished setup from before would block a new one
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `UniMate ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) throw error ?? new Error('enroll failed');
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Checks a 6-digit code (for the first setup pass the new factor's id; otherwise the verified one is used). */
export async function verifyCode(code: string, factorId?: string) {
  let id = factorId;
  if (!id) {
    const { data } = await supabase.auth.mfa.listFactors();
    id = data?.totp?.[0]?.id;
    if (!id) throw new Error('no factor');
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() });
  if (error) throw error;
}
