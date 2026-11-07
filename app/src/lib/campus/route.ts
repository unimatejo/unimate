import { t } from '@/lib/i18n';

import { centroid, inside, M_LAT, mLng, type CampusData, type LL } from './data';

/**
 * Walking routes on the campus paths (OSM footways, steps and the service roads people walk on), computed on the phone:
 * small gaps where a drawn path stops just short of another are closed, both ends may join the network at any of the
 * few nearest paths (a building is reached from whichever side is shortest, at the wall facing the path), A* finds
 * the shortest walk, and the line becomes "turn right in 40 m" steps.
 * No path near either end (a campus OSM barely knows) → a straight line, flagged so the screen can say so.
 */
export type Step = { at: number; text: string; turn: 'start' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'back' | 'arrive' };
export type Route = { line: LL[]; meters: number; minutes: number; steps: Step[]; straight: boolean; cum: number[] };

type Graph = {
  pts: LL[]; adj: { to: number; w: number }[][]; segs: [number, number][]; lat0: number;
  grid: Map<string, number[]>;  // path segments by grid cell
  walls: Map<string, number[]>; // buildings by grid cell (a walk off the paths must not cut through one)
  rings: LL[][];
};
const graphs = new WeakMap<CampusData, Graph>();
const COST: Record<string, number> = { foot: 1, steps: 1.25, road: 1.12 };
/** walking off the mapped paths (across a square, up to a door) counts a little more than on them */
const OFF = 1.3;
/** a path that stops this close to another one joins it: a gap in the drawing (or a short walk across open ground) */
const JOIN = 6, BRIDGE = 25;
/** open ground straight to the destination: only when nothing stands in the way, it's close, and the paths go well
 * round (it counts 1.6× its length, so the mapped paths win unless they are a real detour) */
const DIRECT = 200, DIRECT_COST = 1.6;
const CELL = 40; // metres per grid cell for the nearby-path lookups

/** Metres on a flat local projection (fine at campus size). */
const xy = (g: { lat0: number }, p: LL): [number, number] => [p[0] * mLng(g.lat0), p[1] * M_LAT];
const metres = (g: { lat0: number }, a: LL, b: LL) => { const [ax, ay] = xy(g, a), [bx, by] = xy(g, b); return Math.hypot(ax - bx, ay - by); };

/** The closest point on segment a-b to p (and how far, in metres). */
function closest(g: { lat0: number }, a: LL, b: LL, p: LL): { q: LL; d: number } {
  const kx = mLng(g.lat0), ky = M_LAT;
  const [ax, ay] = xy(g, a), [bx, by] = xy(g, b), [px, py] = xy(g, p);
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  const qx = ax + u * dx, qy = ay + u * dy;
  return { q: [qx / kx, qy / ky], d: Math.hypot(px - qx, py - qy) };
}

/** Segments with any part within r metres of p (from the grid). */
function nearby(g: Graph, p: LL, r: number): number[] {
  const [x, y] = xy(g, p), out = new Set<number>();
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
    for (let j = Math.floor((y - r) / CELL); j <= Math.floor((y + r) / CELL); j++)
      for (const s of g.grid.get(`${i},${j}`) ?? []) out.add(s);
  return [...out];
}

const cells = (g: { lat0: number }, a: LL, b: LL, pad = 0) => {
  const [ax, ay] = xy(g, a), [bx, by] = xy(g, b), out: string[] = [];
  for (let i = Math.floor((Math.min(ax, bx) - pad) / CELL); i <= Math.floor((Math.max(ax, bx) + pad) / CELL); i++)
    for (let j = Math.floor((Math.min(ay, by) - pad) / CELL); j <= Math.floor((Math.max(ay, by) + pad) / CELL); j++) out.push(`${i},${j}`);
  return out;
};
const cross = (p: LL, q: LL, r: LL, s2: LL) => {
  const o = (a: LL, b: LL, c: LL) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return o(p, q, r) * o(p, q, s2) < 0 && o(r, s2, p) * o(r, s2, q) < 0;
};

/** Walking straight from a to b doesn't go through any building (except the ones listed: where I am, where I'm going). */
function clear(g: Graph, a: LL, b: LL, except: LL[][] = []): boolean {
  const seen = new Set<number>();
  for (const k of cells(g, a, b)) for (const i of g.walls.get(k) ?? []) {
    if (seen.has(i)) continue;
    seen.add(i);
    const ring = g.rings[i];
    if (except.includes(ring)) continue;
    for (let j = 1; j < ring.length; j++) if (cross(a, b, ring[j - 1], ring[j])) return false;
  }
  return true;
}

function graphOf(d: CampusData): Graph {
  const hit = graphs.get(d);
  if (hit) return hit;
  const ids = new Map<string, number>();
  const g: Graph = { pts: [], adj: [], segs: [], lat0: d.center[1], grid: new Map(), walls: new Map(), rings: d.buildings.map((b) => b.c) };
  g.rings.forEach((ring, i) => {
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    for (const k of cells(g, [Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)])) (g.walls.get(k) ?? g.walls.set(k, []).get(k)!).push(i);
  });
  const id = (p: LL) => {
    const k = `${p[0]},${p[1]}`;
    let i = ids.get(k);
    if (i === undefined) { i = g.pts.length; ids.set(k, i); g.pts.push(p); g.adj.push([]); }
    return i;
  };
  const edge = (a: number, b: number, c: number) => {
    const w = metres(g, g.pts[a], g.pts[b]) * c;
    g.adj[a].push({ to: b, w }); g.adj[b].push({ to: a, w });
  };
  const addSeg = (a: number, b: number) => {
    const s = g.segs.length;
    g.segs.push([a, b]);
    for (const k of cells(g, g.pts[a], g.pts[b])) (g.grid.get(k) ?? g.grid.set(k, []).get(k)!).push(s);
  };
  for (const p of d.paths) {
    const c = COST[p.t] ?? 1.1;
    for (let i = 1; i < p.c.length; i++) {
      const a = id(p.c[i - 1]), b = id(p.c[i]);
      if (a === b) continue;
      edge(a, b, c); addSeg(a, b);
    }
  }
  // close the gaps: a path end that stops just short of another path joins it where it is closest (a few metres:
  // a gap in the drawing; up to 25 m: a short walk across open ground, as long as no building is in the way)
  const ends = g.adj.map((e, i) => (e.length === 1 ? i : -1)).filter((i) => i >= 0);
  for (const e of ends) {
    let best: { s: number; q: LL; d: number } | null = null;
    for (const s of nearby(g, g.pts[e], BRIDGE)) {
      const [a, b] = g.segs[s];
      if (a === e || b === e || g.adj[e].some((x) => x.to === a || x.to === b)) continue;
      const c = closest(g, g.pts[a], g.pts[b], g.pts[e]);
      if (c.d <= BRIDGE && (!best || c.d < best.d) && (c.d <= JOIN || clear(g, g.pts[e], c.q))) best = { s, ...c };
    }
    if (!best) continue;
    const [a, b] = g.segs[best.s];
    const q = id(best.q);
    if (q !== a && q !== b) { edge(q, a, 1); edge(q, b, 1); }
    if (q !== e) edge(e, q, OFF);
  }
  graphs.set(d, g);
  return g;
}

/** Where a walk can join the paths: the few closest path points to a spot (or to a building's outline). */
type Access = { seg: number; q: LL; w: number; end: LL };
function access(g: Graph, p: LL, outline: LL[] | null, reach = 250): Access[] {
  // standing inside a building: walking out of it is fine
  const home = outline ? [outline] : g.rings.filter((r) => inside(p, r));
  const all: Access[] = [];
  for (const s of nearby(g, p, reach + (outline ? 150 : 0))) {
    const [a, b] = g.segs[s];
    let best: { q: LL; end: LL; d: number } | null = null;
    if (outline) {
      // the path point nearest the walls, and the spot on the wall facing it (a door is usually on the path side)
      for (const v of outline) { const c = closest(g, g.pts[a], g.pts[b], v); if (!best || c.d < best.d) best = { q: c.q, end: v, d: c.d }; }
      for (const v of [g.pts[a], g.pts[b]]) { const w = door(outline, v); const dd = metres(g, v, w); if (!best || dd < best.d) best = { q: v, end: w, d: dd }; }
      if (best) { best.end = door(outline, best.q); best.d = metres(g, best.q, best.end); }
    } else {
      const c = closest(g, g.pts[a], g.pts[b], p);
      best = { q: c.q, end: p, d: c.d };
    }
    if (best && best.d <= reach) all.push({ seg: s, q: best.q, w: best.d * OFF, end: best.end });
  }
  if (!all.length) return [];
  all.sort((x, y) => x.w - y.w);
  // the nearest ways on that don't walk through another building; another side of the building, another path, as
  // long as it isn't much further (when walls block every one, the nearest stays: better a route than none)
  const open = all.filter((x) => clear(g, outline ? x.end : p, x.q, home));
  const pick = open.length ? open : all.slice(0, 1);
  const cap = pick[0].w + 30 * OFF;
  return pick.filter((x) => x.w <= cap).slice(0, 8);
}

/** Shortest walk from any start access to any end access (A*, distance to the target as the guide). */
function astar(g: Graph, start: LL, from: Access[], to: Access[], aim: LL, slack: number, direct: { w: number; end: LL } | null): { line: LL[]; end: LL } | null {
  const n = g.pts.length, S = n, T = n + 1; // the start and the target; the access points follow
  const extraPts: LL[] = [];
  const extra = new Map<number, { to: number; w: number }[]>();
  const add = (x: number, y: number, w: number, both = true) => {
    (extra.get(x) ?? extra.set(x, []).get(x)!).push({ to: y, w });
    if (both) (extra.get(y) ?? extra.set(y, []).get(y)!).push({ to: x, w });
  };
  const node = (p: LL) => { extraPts.push(p); return n + 1 + extraPts.length; };
  const P = (i: number): LL => (i < n ? g.pts[i] : i === S ? start : i === T ? aim : extraPts[i - n - 2]);
  const onSeg = (v: number, seg: number) => { const [a, b] = g.segs[seg]; add(v, a, metres(g, P(v), g.pts[a])); add(v, b, metres(g, P(v), g.pts[b])); };
  const ins = from.map((f) => { const v = node(f.q); onSeg(v, f.seg); add(S, v, f.w, false); return { v, seg: f.seg }; });
  const outs = to.map((t) => { const v = node(t.q); onSeg(v, t.seg); add(v, T, t.w, false); return { v, seg: t.seg, end: t.end }; });
  if (direct) add(S, T, direct.w, false);
  // both ends on the same piece of path: straight along it
  for (const i of ins) for (const o of outs) if (i.seg === o.seg) add(i.v, o.v, metres(g, P(i.v), P(o.v)));
  // the guide never overestimates: straight-line distance to the target, less the building's size
  const h = (v: number) => (v === T ? 0 : Math.max(0, metres(g, P(v), aim) - slack));
  const dist = new Map<number, number>([[S, 0]]), prev = new Map<number, number>();
  const heap: [number, number][] = [[h(S), S]];
  const push = (f: number, v: number) => {
    heap.push([f, v]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const done = new Set<number>();
  while (heap.length) {
    const [, v] = pop();
    if (done.has(v)) continue;
    if (v === T) break;
    done.add(v);
    const gv = dist.get(v)!;
    for (const e of [...(v < n ? g.adj[v] : []), ...(extra.get(v) ?? [])]) {
      const nd = gv + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, v); push(nd + h(e.to), e.to); }
    }
  }
  if (!dist.has(T)) return null;
  const last = prev.get(T)!;
  if (last === S) return { line: [], end: direct!.end };
  const end = outs.find((o) => o.v === last)!.end;
  const line: LL[] = [];
  for (let v: number | undefined = last; v !== undefined && v !== S; v = prev.get(v)) line.push(P(v));
  return { line: line.reverse(), end };
}

const bearing = (a: LL, b: LL) => (Math.atan2((b[0] - a[0]) * mLng(a[1]), (b[1] - a[1]) * M_LAT) * 180) / Math.PI;

/** Distance (m) along the line at each vertex. */
function cumulative(line: LL[]) {
  const c = [0];
  for (let i = 1; i < line.length; i++) c.push(c[i - 1] + Math.hypot((line[i][0] - line[i - 1][0]) * mLng(line[i][1]), (line[i][1] - line[i - 1][1]) * M_LAT));
  return c;
}

function stepsOf(line: LL[], cum: number[], dest: string): Step[] {
  const steps: Step[] = [{ at: 0, text: t('امشِ باتجاه {0}', [dest]), turn: 'start' }];
  let lastAt = 0;
  for (let i = 1; i < line.length - 1; i++) {
    if (cum[i] - lastAt < 12 || cum[cum.length - 1] - cum[i] < 10) continue; // ignore zig-zags of a few metres
    // compare the direction 10 m before and after this point, so a curved path isn't a dozen turns
    let a = i - 1; while (a > 0 && cum[i] - cum[a] < 10) a--;
    let b = i + 1; while (b < line.length - 1 && cum[b] - cum[i] < 10) b++;
    let d = bearing(line[i], line[b]) - bearing(line[a], line[i]);
    d = ((d + 540) % 360) - 180;
    const ad = Math.abs(d);
    if (ad < 30) continue;
    const right = d > 0;
    const turn: Step['turn'] = ad > 150 ? 'back' : ad < 55 ? (right ? 'slight-right' : 'slight-left') : right ? 'right' : 'left';
    const text = turn === 'back' ? t('استدر إلى الخلف') : turn === 'right' ? t('انعطف إلى اليمين') : turn === 'left' ? t('انعطف إلى اليسار') : turn === 'slight-right' ? t('انعطف قليلًا إلى اليمين') : t('انعطف قليلًا إلى اليسار');
    steps.push({ at: cum[i], text, turn });
    lastAt = cum[i];
  }
  steps.push({ at: cum[cum.length - 1], text: t('وصلت إلى {0}', [dest]), turn: 'arrive' });
  return steps;
}

/** The nearest point on a building's outline to where the path ends: the route stops at the wall, not inside. */
function door(ring: LL[], near: LL): LL {
  const kx = mLng(near[1]), ky = M_LAT;
  let best: LL = ring[0], bd = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky, L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, (((near[0] - a[0]) * kx) * dx + ((near[1] - a[1]) * ky) * dy) / L)) : 0;
    const q: LL = [a[0] + (u * dx) / kx, a[1] + (u * dy) / ky];
    const d = Math.hypot((q[0] - near[0]) * kx, (q[1] - near[1]) * ky);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** From where I am to a place (or a building outline when we have it). */
export function walkRoute(d: CampusData | null, from: LL, to: LL, dest: string, outline?: LL[] | null): Route {
  let line: LL[] | null = null;
  if (d && d.paths.length) {
    const g = graphOf(d);
    const aim = outline ? centroid(outline) : to;
    const slack = outline ? Math.max(...outline.map((v) => metres(g, v, aim))) : 0;
    const a = access(g, from, null), b = access(g, to, outline ?? null);
    // straight across open ground when it's near and nothing stands in the way
    const end = outline ? door(outline, from) : to;
    const crow = metres(g, from, end);
    const direct = crow <= DIRECT && clear(g, from, end, [...g.rings.filter((r) => inside(from, r)), ...(outline ? [outline] : [])]) ? { w: crow * DIRECT_COST, end } : null;
    const r = (a.length && b.length) || direct ? astar(g, from, a, b, aim, slack, direct) : null;
    if (r) line = [from, ...r.line, r.end];
  }
  const straight = !line;
  if (!line) line = [from, outline ? door(outline, from) : to];
  // drop repeated points (an access on a path's own corner)
  line = line.filter((p, i) => i === 0 || p[0] !== line![i - 1][0] || p[1] !== line![i - 1][1]);
  if (line.length < 2) line = [from, from]; // already there
  const cum = cumulative(line);
  const meters = Math.round(cum[cum.length - 1]);
  return { line, meters, minutes: Math.max(1, Math.round(meters / 75)), steps: stepsOf(line, cum, dest), straight, cum };
}

/**
 * Where I am along the route now: metres left, the next step and how far it is, and whether I wandered off. `acc` is
 * the phone's own accuracy (m): a vague fix (indoors, between tall buildings) isn't taken for wandering off.
 */
export function progress(r: Route, me: LL, acc = 0) {
  const kx = mLng(me[1]), ky = M_LAT;
  let bestI = 0, bestU = 0, bd = Infinity;
  for (let i = 1; i < r.line.length; i++) {
    const a = r.line[i - 1], b = r.line[i];
    const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky, L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, (((me[0] - a[0]) * kx) * dx + ((me[1] - a[1]) * ky) * dy) / L)) : 0;
    const d = Math.hypot((a[0] + (u * dx) / kx - me[0]) * kx, (a[1] + (u * dy) / ky - me[1]) * ky);
    if (d < bd) { bd = d; bestI = i; bestU = u; }
  }
  const along = r.cum[bestI - 1] + (r.cum[bestI] - r.cum[bestI - 1]) * bestU;
  const left = Math.max(0, Math.round(r.meters - along));
  const next = r.steps.find((s) => s.at > along + 3) ?? r.steps[r.steps.length - 1];
  return { left, minutes: Math.max(1, Math.round(left / 75)), next, toNext: Math.max(0, Math.round(next.at - along)), off: bd > Math.max(35, acc * 1.5), arrived: left < Math.max(12, Math.min(acc, 25)) };
}
