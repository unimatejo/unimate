/** Tiny global toast: toast('Saved ✓') or toast.error('...'). Shown by <ToastHost/> in the root layout. */
type Item = { id: number; text: string; kind: 'ok' | 'error' };
type L = (items: Item[]) => void;
let items: Item[] = [];
const listeners = new Set<L>();
let seq = 0;
function emit() { listeners.forEach((l) => l(items)); }
function push(text: string, kind: Item['kind']) {
  const id = ++seq;
  items = [...items.filter((x) => x.text !== text), { id, text, kind }].slice(-3);
  emit();
  setTimeout(() => { items = items.filter((x) => x.id !== id); emit(); }, kind === 'error' ? 3800 : 2400);
}
export function toast(text: string) { push(text, 'ok'); }
toast.error = (text: string) => push(text, 'error');
export function subscribeToasts(l: L) { listeners.add(l); l(items); return () => { listeners.delete(l); }; }
export type ToastItem = Item;
