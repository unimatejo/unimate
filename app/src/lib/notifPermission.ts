import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getPref, setPref } from './prefs';
import { supabase } from './supabase';
import { t } from './i18n';
import { enableWebPush, registerNativePush, webPushState } from './webpush';

/**
 * Notification permission, asked ONCE: a friendly screen during onboarding explains why, and only its "turn on"
 * button shows the system prompt. Whatever the answer, it is never asked again by itself
 * (Settings › Permissions shows a note with a button to the phone's settings if they are off).
 */
export type NotifStatus = 'granted' | 'denied' | 'ask' | 'install' | 'unavailable';

const DONE = 'notif_intro_done';
// the gate listens, so answering the screen lets the app continue at once
const listeners = new Set<() => void>();

export async function notifStatus(): Promise<NotifStatus> {
  if (Platform.OS === 'web') return webPushState();
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'denied';
  } catch { return 'unavailable'; }
}

/** The onboarding screen is still due on this device (not answered yet, and the system can still ask). */
export function useNotifIntroDue(signedIn: boolean): boolean | null {
  const [due, setDue] = useState<boolean | null>(null);
  useEffect(() => {
    if (!signedIn) { setDue(null); return; }
    const done = () => setDue(false);
    listeners.add(done);
    if (getPref(DONE) === '1') { setDue(false); return () => { listeners.delete(done); }; }
    let live = true;
    notifStatus().then((s) => { if (live && getPref(DONE) !== '1') setDue(s === 'ask' || s === 'install'); }, () => { if (live) setDue(false); });
    return () => { live = false; listeners.delete(done); };
  }, [signedIn]);
  return due;
}

export function markNotifIntroDone() { setPref(DONE, '1'); listeners.forEach((f) => f()); }

/** The "turn on" button: the system prompt, then every important reminder on by default. Returns whether it's on. */
export async function turnOnNotifications(userId?: string): Promise<boolean> {
  markNotifIntroDone();
  let ok = false;
  if (Platform.OS === 'web') {
    try { ok = await enableWebPush(); } catch { ok = false; }
  } else {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('lectures', { name: t('المحاضرات'), importance: Notifications.AndroidImportance.HIGH }).catch(() => {});
      await Notifications.setNotificationChannelAsync('messages', { name: t('الرسائل والتفاعلات'), importance: Notifications.AndroidImportance.HIGH, sound: 'default' }).catch(() => {});
    }
    ok = (await Notifications.requestPermissionsAsync()).granted;
    if (ok) await registerNativePush().catch(() => {});
  }
  if (ok && userId) {
    // lectures, exams and the evening summary start switched on; the student can change each one later
    await supabase.from('notification_prefs').upsert({ user_id: userId, lectures: true, exams: true, nightly_summary: true, messages: true }, { onConflict: 'user_id' }).then(() => {}, () => {});
  }
  return ok;
}
