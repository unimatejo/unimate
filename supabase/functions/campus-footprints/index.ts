// Building footprints from Microsoft's Global ML Building Footprints (from satellite imagery, CDLA Permissive 2.0),
// for the campuses OpenStreetMap hasn't drawn. One call reads one level-9 tile of Jordan as it downloads (gzip,
// one GeoJSON feature per line), keeps the footprints inside each campus box in that tile, and writes one small file
// per university to Storage (campus/fp/<university>.json). campus-osm adds them where OSM has no building.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

type LL = [number, number];
const LINKS = 'https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv';
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('no', { status: 401 });
  const { quadkey } = await req.json().catch(() => ({})) as { quadkey?: string };
  if (!quadkey || !/^[0-3]{9}$/.test(quadkey)) return Response.json({ error: 'quadkey' }, { status: 400 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // the campus boxes (from the last campus-osm build: the main campus and any branch) that touch this tile
  const { data: maps } = await db.from('campus_maps').select('university_id, bbox, stats').not('bbox', 'is', null);
  const boxes = (maps ?? []).flatMap((m) => ((m.stats?.boxes as number[][] | undefined) ?? [m.bbox as number[]]).map((b) => ({ id: m.university_id as string, b })))
    .filter((m) => m.b?.length === 4);
  const links = await (await fetch(LINKS)).text();
  const row = links.split('\n').find((l) => l.startsWith(`Jordan,${quadkey},`));
  if (!row) return Response.json({ error: 'no tile' }, { status: 404 });
  const url = row.split(',')[2];

  const out = new Map<string, { c: LL[]; h: number }[]>();
  const r = await fetch(url);
  if (!r.ok || !r.body) return Response.json({ error: `tile ${r.status}` }, { status: 502 });
  const lines = r.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream());
  let buf = '', seen = 0;
  const take = (line: string) => {
    if (!line) return;
    seen++;
    // cheap test on the first point before parsing the whole line
    const m = line.match(/\[\[\[(-?[\d.]+),\s*(-?[\d.]+)/);
    if (!m) return;
    const x = +m[1], y = +m[2];
    const hit = boxes.filter((bx) => x >= bx.b[0] && x <= bx.b[2] && y >= bx.b[1] && y <= bx.b[3]);
    if (!hit.length) return;
    const f = JSON.parse(line) as { geometry: { type: string; coordinates: number[][][] }; properties?: { height?: number } };
    if (f.geometry.type !== 'Polygon') return;
    const c = f.geometry.coordinates[0].map(([a, b]) => [r6(a), r6(b)] as LL);
    const h = f.properties?.height && f.properties.height > 0 ? Math.round(f.properties.height * 10) / 10 : -1;
    for (const id of new Set(hit.map((bx) => bx.id))) { const l = out.get(id) ?? []; l.push({ c, h }); out.set(id, l); }
  };
  for await (const chunk of lines) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  take(buf);

  const res: Record<string, number> = {};
  // a campus on the edge of two tiles gets both: each tile is kept as its own part, so running one again replaces it
  for (const [id, fps] of out) {
    const { data: old } = await db.storage.from('campus').download(`fp/${id}.json`);
    const prev = old ? (JSON.parse(await old.text()) as { parts?: Record<string, unknown[]> }).parts ?? {} : {};
    const parts = { ...prev, [quadkey]: fps };
    const body = JSON.stringify({ v: 2, source: 'Microsoft Global ML Building Footprints (CDLA Permissive 2.0)', at: new Date().toISOString(), parts });
    const up = await db.storage.from('campus').upload(`fp/${id}.json`, new Blob([body], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    res[id] = up.error ? -1 : fps.length;
  }
  return Response.json({ quadkey, lines: seen, universities: res });
});
