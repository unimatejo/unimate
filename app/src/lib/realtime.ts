/**
 * A unique topic for a channel that only listens to database changes (postgres_changes).
 * supabase-js hands back the SAME channel object for a repeated topic, so a second screen using
 * `unread-<me>` would try to add callbacks to an already-subscribed channel and throw.
 * Broadcast/presence channels must keep their shared topic, so don't use this for those.
 */
let n = 0;
export const rtTopic = (base: string) => `${base}:${Date.now().toString(36)}${(n++).toString(36)}`;
