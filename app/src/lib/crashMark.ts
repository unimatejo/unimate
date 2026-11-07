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

/** False when this step crashed the app on this phone in the last week. */
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
