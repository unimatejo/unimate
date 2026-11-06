// One university at a time: turn its raw OpenStreetMap / Wikimapia rows (`osm_stage`) into `buildings` and `places`.
// By default it is a dry run: nothing is written, and the answer is the report (before → after, what would be added,
// what was left out and why, what is still missing). With { apply: true } it inserts exactly what the dry run
// proposed (new rows only: nothing existing is changed or removed) and then rebuilds the university's 3D file.
//
// A row belongs to the campus when it is inside the campus outline (from the 3D file), or, with no outline, near the
// buildings we already know there; never when it is inside another university's outline. Duplicates are dropped
// against what is already in the tables (same OSM id, same name close by, or same kind within a few metres) and against
// each other. Arabic and English names are kept apart (name_ar / name_en).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

type LL = [number, number]; // [lng, lat]
type Stage = { id: number; osm: string; k: string; name_ar: string | null; name_en: string | null; lat: number; lng: number; tags: Record<string, unknown> | null };
type Uni = { id: string; slug: string; name_ar: string; center_lat: number; center_lng: number };
type Campus = { campus: LL[] | null; center: LL; buildings?: { c: LL[]; b: string | null; n: string | null; k: string; ap?: 1 }[] };

const M_LAT = 111320;
const mLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * mLng(a.lat), (a.lat - b.lat) * M_LAT);
function inside(p: LL, ring: LL[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const AR = /[؀-ۿ]/;
const plain = (x: string) => x.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/^(ال)/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// raw OSM kinds → the place kinds the app shows (anything not listed is not a campus place: hotels, schools, fuel…)
const KIND: Record<string, string> = {
  cafe: 'cafeteria', caffee: 'cafeteria', food_court: 'cafeteria', ice_cream: 'cafeteria', 'shop:coffee': 'cafeteria', internet_cafe: 'cafeteria',
  restaurant: 'restaurant', fast_food: 'restaurant', 'shop:kiosk': 'kiosk', 'shop:supermarket': 'shop', 'shop:convenience': 'shop', 'shop:general': 'shop',
  'shop:mobile_phone': 'shop', 'shop:computer': 'shop', 'shop:electronics': 'shop', 'shop:gift': 'shop', 'shop:bakery': 'shop', 'shop:pastry': 'shop',
  'shop:confectionery': 'shop', 'shop:beverages': 'shop', 'shop:water': 'shop', 'shop:optician': 'shop', 'shop:yes': 'shop',
  'shop:stationery': 'print', 'shop:copyshop': 'print', 'shop:printer_ink': 'print', 'shop:books': 'print',
  parking: 'parking', bicycle_parking: 'parking', bus_stop: 'bus', bus_station: 'bus', platform: 'bus', gate: 'gate', lift_gate: 'gate',
  place_of_worship: 'mosque', library: 'library', bank: 'bank', bureau_de_change: 'bank', payment_centre: 'bank', atm: 'atm',
  clinic: 'clinic', doctors: 'clinic', dentist: 'clinic', hospital: 'clinic', pharmacy: 'pharmacy',
  pitch: 'sports', sports_centre: 'sports', stadium: 'sports', fitness_centre: 'sports', swimming_pool: 'sports', park: 'garden', garden: 'garden',
  theatre: 'service', conference_centre: 'service', events_venue: 'service', post_office: 'service', office: 'service', museum: 'service', locker: 'service',
};
// what a name says it is, for rows that carry only a name (Wikimapia, plain "building")
const WORDS: [RegExp, string][] = [
  [/موقف|مواقف|parking/i, 'parking'], [/باص|حافلات|مجمع السفريات|bus/i, 'bus'], [/بوابة|بوابه|باب |gate/i, 'gate'], [/مسجد|مصلى|جامع |mosque/i, 'mosque'],
  [/مكتبة|مكتبه|library/i, 'library'], [/كافتيريا|كافيتيريا|كافيه|مقهى|cafe|cafeteria/i, 'cafeteria'], [/مطعم|restaurant/i, 'restaurant'], [/كشك|kiosk/i, 'kiosk'],
  [/ملعب|ملاعب|صالة رياض|مسبح|stadium|pitch|gym/i, 'sports'], [/حديقة|حديقه|غابة|ساحة|garden|park/i, 'garden'], [/عيادة|مركز صحي|clinic/i, 'clinic'], [/بنك|bank/i, 'bank'],
  [/كلية|كليه|مبنى|مبني|مجمع|عمادة|عماده|رئاسة|رئاسه|مختبر|مختبرات|مدرج|قاعة|قاعات|دائرة|مركز|معهد|قسم|faculty|school of|college|building|hall|center|centre|institute|department|dean/i, 'building'],
];
// not a campus place, even with a campus-sounding name
const NOT = /فندق|hotel|motel|شقق|apartment|سكن|مدرسة|مدارس|school(?! of)|روضة|kindergarten|محطة وقود|fuel|police|شرطة|مول|mall/i;

// names that are not a place's name: phone numbers, links, chatter, someone's office
const JUNK = (x: string) => /\d{5,}|\d{3}[\s-]\d{3}|https?:|www\.|\.com|@/i.test(x) || x.split(/\s+/).length > 9 || x.length > 80 || /^مكتب\s/.test(x.trim());

function classify(r: Stage): { kind: string | null; why?: string } {
  const name = r.name_ar || r.name_en || '';
  if (NOT.test(name)) return { kind: null, why: 'مش من الحرم (فندق، سكن، مدرسة…)' };
  if (name && JUNK(name)) return { kind: null, why: 'اسم مش صالح (رقم، رابط، كلام طويل، مكتب شخص)' };
  if (r.k === 'building' || r.k === 'named' || r.k === 'wm') {
    if (!name) return { kind: null, why: 'بدون اسم' };
    for (const [re, k] of WORDS) if (re.test(name)) return { kind: k };
    return r.k === 'building' ? { kind: 'building' } : { kind: null, why: 'ما عرفنا نوعه من اسمه' };
  }
  const k = KIND[r.k];
  if (!k) return { kind: null, why: `نوع مش للحرم (${r.k})` };
  return { kind: k };
}

const KIND_AR: Record<string, string> = {
  bus: 'موقف باص', kiosk: 'كشك', atm: 'صراف آلي', gate: 'بوابة', parking: 'موقف سيارات', cafeteria: 'كافتيريا', mosque: 'مسجد',
};

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('no', { status: 401 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { university_id, apply } = await req.json().catch(() => ({})) as { university_id?: string; apply?: boolean };
  if (!university_id) return json({ error: 'university_id' }, 400);

  const { data: uni } = await db.from('universities').select('id, slug, name_ar, center_lat, center_lng').eq('id', university_id).maybeSingle() as { data: Uni | null };
  if (!uni?.center_lat) return json({ error: 'no campus point' }, 400);
  const c = { lat: uni.center_lat, lng: uni.center_lng };

  // this campus, and the outlines of the universities next to it (a row inside theirs is theirs)
  const file = async (id: string): Promise<Campus | null> => {
    const { data } = await db.storage.from('campus').download(`${id}.json`);
    return data ? (JSON.parse(await data.text()) as Campus) : null;
  };
  const { data: all } = await db.from('universities').select('id, name_ar, center_lat, center_lng').not('center_lat', 'is', null);
  const near = (all ?? []).filter((u) => u.id !== uni.id && dist(c, { lat: u.center_lat, lng: u.center_lng }) < 5000);
  const mine = await file(uni.id);
  const others = (await Promise.all(near.map(async (u) => ({ u, f: await file(u.id) })))).filter((x) => x.f?.campus);

  const [{ data: stage }, { data: bs }, { data: ps }] = await Promise.all([
    db.from('osm_stage').select('id, osm, k, name_ar, name_en, lat, lng, tags').eq('uni', uni.slug),
    db.from('buildings').select('id, name_ar, name_en, lat, lng, osm_id').eq('university_id', uni.id),
    db.from('places').select('id, kind, name_ar, name_en, lat, lng, osm_id, state').eq('university_id', uni.id),
  ]);
  const B = (bs ?? []) as { id: string; name_ar: string; name_en: string | null; lat: number | null; lng: number | null; osm_id: string | null }[];
  const P = (ps ?? []) as { id: string; kind: string; name_ar: string; name_en: string | null; lat: number; lng: number; osm_id: string | null; state: string }[];
  const before = { buildings: B.length, places: P.filter((p) => p.state === 'approved').length };

  const known = B.filter((b) => b.lat != null && dist(c, b as { lat: number; lng: number }) < 1500) as { lat: number; lng: number }[];
  const reach = Math.max(250, ...known.map((x) => dist(c, x) + 60));
  const outline = mine?.campus ?? null;
  const onCampus = (p: { lat: number; lng: number }) => (outline ? inside([p.lng, p.lat], outline) : dist(c, p) < reach);
  const theirs = (p: { lat: number; lng: number }) => others.find((o) => inside([p.lng, p.lat], o.f!.campus!))?.u.name_ar ?? null;
  // the 3D outlines: a name that lands inside one already named by us is that building, not a new one
  const shapes = (mine?.buildings ?? []).filter((x) => x.k !== 'part' && !x.ap);
  const shapeAt = (p: { lat: number; lng: number }) => shapes.find((x) => inside([p.lng, p.lat], x.c)) ?? null;
  const takenShapes = new Set<object>();
  const osmNum = (s: string | null) => String(s ?? '').replace(/\D/g, '');
  const haveOsm = new Set([...B.map((b) => osmNum(b.osm_id)), ...P.map((p) => osmNum(p.osm_id))].filter(Boolean));

  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const newB: { name_ar: string; name_en: string | null; lat: number; lng: number; osm_id: string }[] = [];
  const newP: { kind: string; name_ar: string; name_en: string | null; lat: number; lng: number; osm_id: string }[] = [];

  // OSM outlines first, Wikimapia last: when both describe the same thing, the OSM one stays
  const rows = ((stage ?? []) as Stage[]).sort((a, b) => Number(a.osm.startsWith('wm')) - Number(b.osm.startsWith('wm')));
  for (const r of rows) {
    const p = { lat: r.lat, lng: r.lng };
    const { kind, why } = classify(r);
    if (!kind) { skip(why!); continue; }
    const other = theirs(p);
    if (other) { skip(`داخل حرم جامعة تانية (${other})`); continue; }
    if (!onCampus(p)) { skip('برّا الحرم'); continue; }
    if (haveOsm.has(osmNum(r.osm))) { skip('موجود من قبل (نفس رقم OSM)'); continue; }
    // names: Arabic in name_ar, English in name_en; a Latin-only name fills both (name_ar can't be empty)
    const ar = [r.name_ar, (r.tags?.['name:ar'] as string | undefined)].find((x) => x && AR.test(x)) ?? null;
    const en = [r.name_en, (r.tags?.['name:en'] as string | undefined), r.name_ar].find((x) => x && !AR.test(x)) ?? null;
    // «كلية الزراعة - الجامعة الأردنية» → «كلية الزراعة»; extra spaces out
    const tidy = (x: string | null) => {
      if (!x) return null;
      const parts = x.replace(/\s+/g, ' ').trim().split(/\s*[،,\-–|/]\s*/);
      while (parts.length > 1 && [uni.name_ar, uni.slug].some((u) => plain(parts[parts.length - 1]).includes(plain(u)) || plain(u).includes(plain(parts[parts.length - 1])))) parts.pop();
      return parts.join(' - ').trim() || null;
    };
    const label = tidy(ar) ?? tidy(en);
    const n = label ? plain(label) : '';
    if (kind === 'building') {
      if (!label) { skip('بدون اسم'); continue; }
      const shape = shapeAt(p);
      if (shape?.b) { skip('نفس المبنى موجود عنا باسم تاني'); continue; }
      // Wikimapia names only count when they name a real building drawn in OSM
      if (r.osm.startsWith('wm') && !shape) { skip('اسم من ويكيمابيا بدون مبنى مرسوم'); continue; }
      if (shape && takenShapes.has(shape)) { skip('مكرر'); continue; }
      if (shape) takenShapes.add(shape);
      const dup = [...B.filter((b) => b.lat != null), ...newB].some((b) => (plain(b.name_ar) === n || (b.name_en && plain(b.name_en) === plain(en ?? '#'))) && dist(b as { lat: number; lng: number }, p) < 150)
        || newB.some((b) => dist(b, p) < 12);
      if (dup) { skip('مكرر'); continue; }
      newB.push({ name_ar: label, name_en: ar ? tidy(en) : null, lat: r.lat, lng: r.lng, osm_id: r.osm });
    } else {
      const dup = [...P, ...newP].some((x) => (x.kind === kind && dist(x, p) < 25) || (n && plain(x.name_ar) === n && dist(x, p) < 60));
      if (dup) { skip('مكرر'); continue; }
      if (!label && !['bus', 'kiosk', 'atm', 'gate', 'parking', 'cafeteria', 'mosque'].includes(kind)) { skip('بدون اسم'); continue; }
      newP.push({ kind, name_ar: label ?? KIND_AR[kind] ?? 'خدمة', name_en: ar ? tidy(en) : null, lat: r.lat, lng: r.lng, osm_id: r.osm });
    }
  }

  // already in the tables but outside this campus or inside another university's: listed for a person to decide
  const misplaced = [
    ...B.filter((b) => b.lat != null).map((b) => ({ t: 'building', id: b.id, name: b.name_ar, other: theirs(b as { lat: number; lng: number }), out: !onCampus(b as { lat: number; lng: number }) })),
    ...P.filter((x) => x.state === 'approved').map((x) => ({ t: x.kind, id: x.id, name: x.name_ar, other: theirs(x), out: !onCampus(x) })),
  ].filter((x) => x.other || x.out);

  let applied = null as null | { buildings: number; places: number };
  if (apply) {
    const ib = newB.length ? await db.from('buildings').insert(newB.map((b) => ({ ...b, university_id: uni.id })), { count: 'exact' }) : { count: 0, error: null };
    const ip = newP.length ? await db.from('places').insert(newP.map((x) => ({ ...x, university_id: uni.id, state: 'approved' })), { count: 'exact' }) : { count: 0, error: null };
    if (ib.error || ip.error) return json({ error: (ib.error ?? ip.error)!.message }, 500);
    applied = { buildings: ib.count ?? 0, places: ip.count ?? 0 };
    // the 3D file picks up the new buildings (their outlines, heights and names) on its next build: start it now
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/campus-osm`, { method: 'POST', headers: { 'x-push-secret': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ university_id: uni.id }) }).catch(() => null);
  }

  const byKind: Record<string, number> = {};
  for (const x of newP) byKind[x.kind] = (byKind[x.kind] ?? 0) + 1;
  return json({
    university: uni.name_ar, slug: uni.slug, mode: apply ? 'applied' : 'dry-run', outline: !!outline, stage_rows: rows.length,
    before, after: { buildings: before.buildings + newB.length, places: before.places + newP.length },
    add: { buildings: newB.map((b) => b.name_ar), places: byKind, place_names: newP.filter((x) => x.name_ar !== KIND_AR[x.kind]).map((x) => `${x.name_ar} (${x.kind})`) },
    skipped, misplaced: misplaced.slice(0, 200), misplaced_count: misplaced.length, applied,
  });
});

