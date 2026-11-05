import { supabase } from './supabase';

/**
 * A unique topic for a channel that only listens to database changes (postgres_changes).
 * supabase-js hands back the SAME channel object for a repeated topic, so a second screen using
 * `unread-<me>` would try to add callbacks to an already-subscribed channel and throw.
 * Broadcast/presence channels must keep their shared topic, so don't use this for those.
 */
let n = 0;
export const rtTopic = (base: string) => `${base}:${Date.now().toString(36)}${(n++).toString(36)}`;

/**
 * A broadcast / presence channel on a shared topic (everyone must join the same name).
 * If a previous screen's copy of that topic is still around (fast remount, sign-in switch),
 * drop it first, so we never add callbacks to an already-subscribed channel.
 */
export function sharedChannel(name: string, opts?: Parameters<typeof supabase.channel>[1]) {
  for (const c of supabase.getChannels()) if (c.topic === `realtime:${name}`) supabase.removeChannel(c);
  return supabase.channel(name, opts);
}
