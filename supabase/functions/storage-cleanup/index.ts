// Daily (pg_cron → private.storage_cleanup_fire): deletes files in stories / posts / chat that no row points to
// any more and that are older than 30 days (public.storage_orphans). ?dry=1 only counts.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('no', { status: 401 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await db.rpc('storage_orphans');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { bucket_id: string; name: string; size: number }[];
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const byBucket: Record<string, string[]> = {};
  for (const r of rows) (byBucket[r.bucket_id] ??= []).push(r.name);
  let removed = 0;
  if (!dry) {
    for (const [bucket, names] of Object.entries(byBucket)) {
      for (let i = 0; i < names.length; i += 100) {
        const { data: gone } = await db.storage.from(bucket).remove(names.slice(i, i + 100));
        removed += gone?.length ?? 0;
      }
    }
    if (removed) await db.from('admin_audit_log').insert({ admin_id: null, action: 'storage_cleanup', target_type: 'system', meta: { removed, bytes: rows.reduce((a, r) => a + (r.size ?? 0), 0) } });
  }
  return Response.json({ dry, found: rows.length, removed, buckets: Object.fromEntries(Object.entries(byBucket).map(([b, n]) => [b, n.length])) });
});
