import { getPref, setPref } from './prefs';
import { reportError } from './errors';

/**
 * Native work that can take the whole app down (a video encoder, say) can't be caught from JavaScript. Before such a
 * step a mark is saved; if the app starts again with the mark still there, the step crashed: it's reported with its
 * name, and turned off on this phone for a week so the student's next try goes through (the step is skipped).
 */
const MARK = 'crash_mark';
const OFF = (step: string) => `crash_off:${step}`;
const WEEK = 7 * 86_400_000;

export async function guarded<T>(step: string, run: () => Promise<T>): Promise<T> {
  setPref(MARK, step);
  try { return await run(); } finally { setPref(MARK, ''); }
}

/** Turn a step off on this phone for a week (it crashed, or hung). */
export function disable(step: string) { setPref(OFF(step), String(Date.now())); }

/** False when this step crashed or hung on this phone in the last week. */
export function allowed(step: string) {
  const at = Number(getPref(OFF(step)) || 0);
  return !at || Date.now() - at > WEEK;
}

/** At startup: a mark left behind means the last run died inside that step. */
export function checkCrashMarks() {
  const step = getPref(MARK);
  if (!step) return;
  setPref(MARK, '');
  setPref(OFF(step), String(Date.now()));
  // a moment later, once the session is back, so the report reaches the team's error log
  setTimeout(() => { reportError(new Error(`native crash during ${step}; skipped on this phone for a week`), true); }, 8000);
}

// ---------- steps of a flow (posting a story): if the app is killed halfway (it hung), the next start says where ----------
const TRAIL = 'trail';
type Trail = { flow: string; steps: [string, number][] };

/** Note a step of a flow; `done` ends it. */
export function step(flow: string, name: string) {
  let tr: Trail = { flow, steps: [] };
  try { const cur = JSON.parse(getPref(TRAIL) || 'null') as Trail | null; if (cur?.flow === flow) tr = cur; } catch { /* a fresh trail */ }
  tr.steps = [...tr.steps, [name, Date.now()] as [string, number]].slice(-25);
  setPref(TRAIL, name === 'done' ? '' : JSON.stringify(tr));
}

/** At startup: a flow left unfinished is reported with its steps and how long each took. */
export function checkTrail() {
  let tr: Trail | null = null;
  try { tr = JSON.parse(getPref(TRAIL) || 'null') as Trail | null; } catch { tr = null; }
  setPref(TRAIL, '');
  if (!tr?.steps.length) return;
  const t0 = tr.steps[0][1];
  const text = tr.steps.map(([n, at]) => `${n}+${((at - t0) / 1000).toFixed(1)}s`).join(' > ');
  setTimeout(() => { reportError(new Error(`${tr!.flow} stopped unfinished: ${text}`)); }, 8000);
}
