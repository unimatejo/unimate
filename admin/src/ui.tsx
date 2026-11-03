import type { ReactNode } from 'react';

export function Top({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="top">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <div className="grow" />
      {children}
    </div>
  );
}

export function Av({ name, url }: { name?: string | null; url?: string | null }) {
  return url ? <img className="av" src={url} alt="" /> : <span className="av">{(name ?? '؟').trim().charAt(0)}</span>;
}

export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="row" style={{ marginBottom: 10 }}><div className="grow" /><button className="btn soft sm" onClick={onClose}>إغلاق</button></div>
        {children}
      </aside>
    </>
  );
}

export function State({ loading, error, empty, children }: { loading: boolean; error: string | null; empty?: boolean; children: ReactNode }) {
  if (error) return <div className="panel err">صار خطأ: {error}</div>;
  if (loading) return <div className="panel muted">بيحمّل…</div>;
  if (empty) return <div className="panel muted">ما في إشي هون.</div>;
  return <>{children}</>;
}

const STATUS: Record<string, [string, string]> = {
  active: ['فعّال', 'green'], suspended: ['موقوف مؤقتاً', 'orange'], banned: ['محظور', 'red'],
  open: ['مفتوح', 'red'], reviewing: ['قيد المراجعة', 'orange'], resolved: ['انحل', 'green'], dismissed: ['مرفوض', ''],
  pending: ['بانتظار الموافقة', 'orange'], approved: ['مقبول', 'green'], rejected: ['مرفوض', ''],
  answered: ['انرد عليه', 'green'], closed: ['مسكّر', ''], draft: ['مسودة', 'orange'], verified: ['موثّق', 'green'],
};
export function Status({ s }: { s: string }) {
  const [l, c] = STATUS[s] ?? [s, ''];
  return <span className={`tag ${c}`}>{l}</span>;
}
