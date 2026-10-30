import { useEffect, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cx } from '../lib/format';

type Kind = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  title: string;
  body?: string;
  kind: Kind;
}

let seq = 0;
const subs = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
const emit = () => subs.forEach((s) => s(toasts));

export function toast(title: string, kind: Kind = 'info', body?: string) {
  const t = { id: ++seq, title, body, kind };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, kind === 'error' ? 6000 : 4000);
}
export const toastError = (err: unknown) => toast((err as Error)?.message ?? 'Algo deu errado', 'error');

export function Toaster() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    subs.add(setList);
    return () => void subs.delete(setList);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="sheet-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-elevated px-4 py-3 shadow-panel">
          {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : t.kind === 'error' ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" /> : <Info className="mt-0.5 size-4 shrink-0 text-accent" />}
          <div className="min-w-0 flex-1">
            <p className={cx('text-[14px] font-semibold', t.kind === 'error' && 'text-danger')}>{t.title}</p>
            {t.body && <p className="mt-0.5 line-clamp-3 text-[13px] text-muted">{t.body}</p>}
          </div>
          <button className="text-faint hover:text-fg" aria-label="Fechar" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
