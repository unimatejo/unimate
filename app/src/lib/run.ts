import { reportError } from './errors';
import { t } from './i18n';
import { toast } from './toast';

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Run a Supabase call and never fail silently: returns { ok, data, error }, reports the error,
 * and (unless quiet) shows a clear message to the user.
 */
export async function run<T>(p: PromiseLike<Res<T>>, opts: { quiet?: boolean; msg?: string } = {}): Promise<{ ok: boolean; data: T | null; error: Res<T>['error'] }> {
  try {
    const { data, error } = await p;
    if (error) {
      // anti-spam limit (0048): not a bug, just slow down
      if (isRateLimited(error)) { if (!opts.quiet) toast.error(friendly(error)); return { ok: false, data: null, error }; }
      reportError(new Error(`${error.code ?? ''} ${error.message}`));
      if (!opts.quiet) toast.error(opts.msg ?? friendly(error));
      return { ok: false, data: null, error };
    }
    return { ok: true, data, error: null };
  } catch (e) {
    reportError(e);
    if (!opts.quiet) toast.error(opts.msg ?? t('تأكد من الإنترنت وجرّب كمان مرة.'));
    return { ok: false, data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export const isRateLimited = (e: { message?: string } | null | undefined) => /rate_limited/.test(e?.message ?? '');

/** An error whose message was written for students (it is safe to show as it is). */
export class UserError extends Error {}

/** What to tell the student about any error: our own messages as they are, everything else in plain words. */
export function userMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  return friendly(e && typeof e === 'object' ? e as { message?: string; code?: string } : { message: String(e) });
}

export function friendly(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? '';
  if (isRateLimited(e)) return t('استنى شوي، بعتت كثير بوقت قصير.');
  if (/username_not_allowed|name_not_allowed|bad_alias/.test(m)) return t('هالاسم فيه كلمة مش مسموحة. جرّب اسم ثاني.');
  if (/fetch|network|Failed to fetch|timeout/i.test(m)) return t('تأكد من الإنترنت وجرّب كمان مرة.');
  if (e?.code === '23505') return t('موجود من قبل.');
  if (e?.code === '42501' || /row-level security|permission/i.test(m)) return t('ما عندك صلاحية لهالإشي.');
  return t('صار خطأ، جرّب كمان مرة.');
}

/**
 * Optimistic toggle with rollback: apply the change on screen right away, undo it if the server says no.
 * Returns false while a previous request is still running (prevents double taps).
 */
const inflight = new Set<string>();
export async function optimistic(key: string, apply: () => void, revert: () => void, request: () => PromiseLike<Res<unknown>>): Promise<boolean> {
  if (inflight.has(key)) return false;
  inflight.add(key);
  apply();
  try {
    const r = await run(request());
    if (!r.ok) revert();
    return r.ok;
  } finally { inflight.delete(key); }
}
