import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Crown, Loader2, X } from 'lucide-react';
import { fileUrl } from '../lib/api';
import { cx, initials } from '../lib/format';
import { useStore } from '../lib/store';
import type { PublicUser } from '../lib/types';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} aria-label="Carregando" />;
}

const PRESENCE_COLOR: Record<string, string> = { online: 'bg-success', idle: 'bg-warning', dnd: 'bg-danger', offline: 'bg-faint', invisible: 'bg-faint' };
export const PRESENCE_LABEL: Record<string, string> = { online: 'Disponível', idle: 'Ausente', dnd: 'Não perturbe', offline: 'Offline', invisible: 'Invisível' };

export function Avatar({ user, size = 36, presence, className }: { user?: Partial<PublicUser> | null; size?: number; presence?: string | false; className?: string }) {
  const livePresence = useStore((s) => (user?.id ? s.presence[user.id] : undefined));
  const p = presence === false ? null : presence ?? livePresence;
  const name = user?.displayName || user?.username || '?';
  return (
    <span className={cx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {user?.avatarFileId ? (
        <img src={fileUrl(user.avatarFileId)} alt="" className="size-full rounded-full object-cover" loading="lazy" />
      ) : (
        <span
          className="flex size-full items-center justify-center rounded-full font-display font-semibold text-white/95"
          style={{ background: user?.profileColor ?? '#4a5a52', fontSize: size * 0.38 }}
          aria-hidden
        >
          {initials(name)}
        </span>
      )}
      {p && !user?.isBot && (
        <span
          className={cx('absolute -right-0.5 -bottom-0.5 rounded-full border-[2.5px] border-surface', PRESENCE_COLOR[p] ?? 'bg-faint')}
          style={{ width: Math.max(10, size * 0.32), height: Math.max(10, size * 0.32) }}
          title={PRESENCE_LABEL[p]}
        />
      )}
    </span>
  );
}

export function UserName({ user, className }: { user?: Partial<PublicUser> | null; className?: string }) {
  const roles = useStore((s) => s.roles);
  if (!user) return <span className={cx('text-faint italic', className)}>membro removido</span>;
  const top = roles.filter((r) => user.roleIds?.includes(r.id) && !r.isDefault).sort((a, b) => b.position - a.position)[0];
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold', className)} style={{ color: top?.color }}>
      {user.displayName || user.username}
      {user.isOwner && <Crown className="size-3.5 text-accent" aria-label="Proprietário" />}
      {user.isBot && (
        <span className="inline-flex items-center gap-0.5 rounded bg-accent-soft px-1 text-[10px] font-bold text-accent">
          <Bot className="size-3" /> BOT
        </span>
      )}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean | 'xl'; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'sheet-in flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface-2 shadow-panel sm:rounded-2xl',
          wide === 'xl' ? 'sm:max-w-5xl' : wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="text-[18px] font-semibold">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Popover anchored to an element, flipped to stay inside the viewport. */
export function Popover({ anchor, open, onClose, children, placement = 'bottom-start' }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode; placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const p = ref.current.getBoundingClientRect();
    let top = placement.startsWith('top') ? a.top - p.height - 6 : placement === 'right-start' ? a.top : a.bottom + 6;
    let left = placement.endsWith('end') ? a.right - p.width : placement === 'right-start' ? a.right + 8 : a.left;
    if (top + p.height > window.innerHeight - 8) top = Math.max(8, a.top - p.height - 6);
    if (top < 8) top = 8;
    left = Math.min(Math.max(8, left), window.innerWidth - p.width - 8);
    setPos({ top, left });
  }, [open, anchor, placement]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open, anchor, onClose]);
  if (!open) return null;
  return createPortal(
    <div ref={ref} className="sheet-in fixed z-[60] rounded-xl border border-line bg-elevated shadow-panel" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[14px] hover:bg-hover disabled:opacity-40', danger ? 'text-danger' : 'text-fg')}
    >
      {icon && <span className="text-muted [&>svg]:size-4">{icon}</span>}
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-start justify-between gap-4 py-2', disabled && 'cursor-not-allowed opacity-50')}>
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-line bg-surface text-accent [&>svg]:size-5">{icon}</div>}
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-[14px] text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      {children}
      {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : hint ? <p className="mt-1 text-[12.5px] text-faint">{hint}</p> : null}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; badge?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[14px] font-medium transition-colors', value === it.value ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
        >
          {it.label}
          {!!it.badge && <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Badge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <span className={cx('min-w-[18px] rounded-full bg-danger px-1.5 text-center text-[11px] leading-[18px] font-bold text-white', className)}>{n > 99 ? '99+' : n}</span>;
}

export function ConfirmButton({ onConfirm, children, className, confirmLabel = 'Confirmar', disabled }: { onConfirm: () => void; children: ReactNode; className?: string; confirmLabel?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button disabled={disabled} className={cx(className, armed && '!bg-danger !text-white')} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : children}
    </button>
  );
}
