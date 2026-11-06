import { t } from '@/lib/i18n';

import { centroid, M_LAT, mLng, type CampusData, type LL } from './data';

/**
 * Walking routes on the campus paths (OSM footways, steps and the service roads people walk on), computed on the phone:
 * snap both ends onto the nearest path, A* across the network, then turn the line into "turn right in 40 m" steps.
 * No path near either end (a campus OSM barely knows) → a straight line, flagged so the screen can say so.
 */
export type Step = { at: number; text: string; turn: 'start' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'back' | 'arrive' };
export type Route = { line: LL[]; meters: number; minutes: number; steps: Step[]; straight: boolean; cum: number[] };

type Graph = { pts: LL[]; adj: { to: number; w: number }[][]; segs: [number, number][]; lat0: number };
const graphs = new WeakMap<CampusData, Graph>();
const COST: Record<string, number> = { foot: 1, steps: 1.25, road: 1.12 };

function graphOf(d: CampusData): Graph {
  const hit = graphs.get(d);
  if (hit) return hit;
  const lat0 = d.center[1];
  const kx = mLng(lat0), ky = M_LAT;
  const ids = new Map<string, number>();
  const pts: LL[] = [], adj: { to: number; w: number }[][] = [], segs: [number, number][] = [];
  const id = (p: LL) => {
    const k = `${p[0]},${p[1]}`;
    let i = ids.get(k);
    if (i === undefined) { i = pts.length; ids.set(k, i); pts.push(p); adj.push([]); }
    return i;
  };
  for (const p of d.paths) {
    const c = COST[p.t] ?? 1.1;
    for (let i = 1; i < p.c.length; i++) {
      const a = id(p.c[i - 1]), b = id(p.c[i]);
      if (a === b) continue;
      const w = Math.hypot((pts[a][0] - pts[b][0]) * kx, (pts[a][1] - pts[b][1]) * ky) * c;
      adj[a].push({ to: b, w }); adj[b].push({ to: a, w }); segs.push([a, b]);
    }
  }
  const g = { pts, adj, segs, lat0 };
  graphs.set(d, g);
  return g;
}

/** The closest point on any path segment: which segment, where on it, and how far (m). */
function snap(g: Graph, p: LL) {
  const kx = mLng(g.lat0), ky = M_LAT;
  let best = { seg: -1, q: p as LL, d: Infinity };
  for (let s = 0; s < g.segs.length; s++) {
    const [a, b] = g.segs[s];
    const ax = g.pts[a][0] * kx, ay = g.pts[a][1] * ky, bx = g.pts[b][0] * kx, by = g.pts[b][1] * ky, px = p[0] * kx, py = p[1] * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    const qx = ax + u * dx, qy = ay + u * dy, dd = Math.hypot(px - qx, py - qy);
    if (dd < best.d) best = { seg: s, q: [qx / kx, qy / ky], d: dd };
  }
  return best;
}

function astar(g: Graph, from: { seg: number; q: LL }, to: { seg: number; q: LL }): LL[] | null {
  const kx = mLng(g.lat0), ky = M_LAT;
  const n = g.pts.length, S = n, T = n + 1; // two temporary nodes on the snapped segments
  const P = (i: number): LL => (i === S ? from.q : i === T ? to.q : g.pts[i]);
  const len = (a: LL, b: LL) => Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky);
  const extra = new Map<number, { to: number; w: number }[]>();
  const link = (x: number, seg: number) => {
    const [a, b] = g.segs[seg];
    for (const y of [a, b]) {
      const w = len(P(x), P(y));
      (extra.get(x) ?? extra.set(x, []).get(x)!).push({ to: y, w });
      (extra.get(y) ?? extra.set(y, []).get(y)!).push({ to: x, w });
    }
  };
  link(S, from.seg); link(T, to.seg);
  if (from.seg === to.seg) { const w = len(from.q, to.q); extra.get(S)!.push({ to: T, w }); }
  const dist = new Map<number, number>([[S, 0]]), prev = new Map<number, number>();
  // a small binary heap on f = g + straight distance to the end
  const heap: [number, number][] = [[len(from.q, to.q), S]];
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
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, v); push(nd + len(P(e.to), to.q), e.to); }
    }
  }
  if (!dist.has(T)) return null;
  const out: LL[] = [];
  for (let v: number | undefined = T; v !== undefined; v = prev.get(v)) out.push(P(v));
  return out.reverse();
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
    const text = turn === 'back' ? t('ارجع لورا') : turn === 'right' ? t('لِف يمين') : turn === 'left' ? t('لِف شمال') : turn === 'slight-right' ? t('ميّل يمين') : t('ميّل شمال');
    steps.push({ at: cum[i], text, turn });
    lastAt = cum[i];
  }
  steps.push({ at: cum[cum.length - 1], text: t('وصلت {0}', [dest]), turn: 'arrive' });
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
  const target = outline ? centroid(outline) : to;
  let line: LL[] | null = null;
  if (d && d.paths.length) {
    const g = graphOf(d);
    const a = snap(g, from), b = snap(g, target);
    if (a.d < 250 && b.d < 250) {
      line = astar(g, a, b);
      if (line) {
        line = [from, ...line];
        line.push(outline ? door(outline, line[line.length - 1]) : to);
      }
    }
  }
  const straight = !line;
  if (!line) line = [from, outline ? door(outline, from) : to];
  const cum = cumulative(line);
  const meters = Math.round(cum[cum.length - 1]);
  return { line, meters, minutes: Math.max(1, Math.round(meters / 75)), steps: stepsOf(line, cum, dest), straight, cum };
}

/** Where I am along the route now: metres left, the next step and how far it is, and whether I wandered off. */
export function progress(r: Route, me: LL) {
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
  return { left, minutes: Math.max(1, Math.round(left / 75)), next, toNext: Math.max(0, Math.round(next.at - along)), off: bd > 35, arrived: left < 12 };
}
