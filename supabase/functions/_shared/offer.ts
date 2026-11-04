// Unsubscribe links are signed with a key derived from the service key, so no extra secret is needed.
export async function sign(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('unimate-unsub:' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
export const FN_BASE = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
