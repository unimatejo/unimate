import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// public half of the VAPID key pair (the private half is a secret of the `push` edge function)
const VAPID = 'BMW-Dn_W4v-60lD-Uf-dWuaw5m2hZg2hKuuyVpTgxZoecrI757q2IXvd0McOjSgc93stLBgHsylHGEKM6nDDOtA';

type WebPushState = 'granted' | 'denied' | 'ask' | 'install' | 'unavailable';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const isIos = () => isWeb && /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () => isWeb && ((navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);

/** Where this browser stands with message notifications. 'install' = iPhone Safari: add to the home screen first. */
export function webPushState(): WebPushState {
  if (!isWeb) return 'unavailable';
  if (isIos() && !installed()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unavailable';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'ask';
}

const key = () => {
  const s = (VAPID + '='.repeat((4 - (VAPID.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

async function subscribe() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() }));
  const j = sub.toJSON();
  const { error } = await supabase.rpc('register_push', { p_token: j.endpoint, p_platform: 'web', p_keys: j.keys });
  if (error) throw error;
}

/** Ask the browser (must run from a tap) and sign this device up. */
export async function enableWebPush(): Promise<boolean> {
  if (webPushState() !== 'ask' && webPushState() !== 'granted') return false;
  const p = await Notification.requestPermission();
  if (p !== 'granted') return false;
  await subscribe();
  return true;
}

// ---------- Android app (Firebase) ----------
async function nativeToken(): Promise<string | null> {
  if (Platform.OS !== 'android') return null; // iPhone app needs an Apple developer account first
  try { return (await Notifications.getDevicePushTokenAsync()).data as string; } catch { return null; }
}

/** Android app: sign this phone up for push if notifications are already allowed (never asks by itself). */
export async function registerNativePush() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('messages', { name: 'الرسائل والتفاعلات', importance: Notifications.AndroidImportance.HIGH, sound: 'default' }).catch(() => {});
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  const tok = await nativeToken();
  if (tok) await supabase.rpc('register_push', { p_token: tok, p_platform: 'android', p_keys: null });
}

function openFrom(r: Notifications.NotificationResponse | null) {
  const url = r?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) setTimeout(() => router.push(url as never), 300);
}

/** On sign-out: this device stops getting the old account's messages. */
export async function dropWebPush() {
  if (Platform.OS === 'android') {
    const tok = await nativeToken();
    if (tok) await supabase.rpc('unregister_push', { p_token: tok }).then(() => {}, () => {});
    return;
  }
  if (!isWeb || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await supabase.rpc('unregister_push', { p_token: sub.endpoint });
    await sub.unsubscribe();
  } catch { /* nothing to undo */ }
}

/** Signed in: keep this browser's subscription fresh, and open the right screen when a notification is tapped. */
export function useWebPush(userId?: string) {
  // iPhone: no remote push yet, but a tapped lecture reminder (a local notification) still opens its screen
  useEffect(() => {
    if (Platform.OS !== 'ios' || !userId) return;
    Notifications.getLastNotificationResponseAsync().then(openFrom, () => {});
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, [userId]);
  useEffect(() => {
    if (Platform.OS !== 'android' || !userId) return;
    registerNativePush().catch(() => {});
    Notifications.getLastNotificationResponseAsync().then(openFrom, () => {});
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, [userId]);
  useEffect(() => {
    if (!isWeb || !userId || !('serviceWorker' in navigator)) return;
    if (webPushState() === 'granted') subscribe().catch(() => {});
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'open' && typeof e.data.url === 'string') router.push(e.data.url); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [userId]);
}
