import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AtSign, Bell, CalendarDays, CheckCheck, MessageSquare, Phone, Shield, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { del, get, post } from '../../lib/api';
import { useStore } from '../../lib/store';
import { cx, timeAgo } from '../../lib/format';
import { EmptyState, Popover, Spinner } from '../../components/ui';
import type { Notification } from '../../lib/types';

const ICON: Record<string, typeof Bell> = {
  mention: AtSign,
  message: MessageSquare,
  friend_request: UserPlus,
  invite: UserPlus,
  call: Phone,
  event: CalendarDays,
  admin: Shield,
  access_request: Shield,
  report: Shield,
  achievement: Sparkles,
  update: Sparkles,
};

export function NotificationsPopover({ anchor, open, onClose }: { anchor: HTMLElement | null; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => get<{ notifications: Notification[]; unread: number }>('/notifications'), enabled: open });
  const markAll = async () => {
    await post('/notifications/read', {});
    useStore.setState({ unreadNotifications: 0 });
    void q.refetch();
  };
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="top-start">
      <div className="flex w-[min(380px,calc(100vw-16px))] flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-[15px] font-semibold">Notificações</h3>
          <div className="flex gap-1">
            <button className="icon-btn" title="Marcar todas como lidas" onClick={() => void markAll()}>
              <CheckCheck className="size-4" />
            </button>
            <button
              className="icon-btn"
              title="Limpar todas"
              onClick={async () => {
                await del('/notifications');
                useStore.setState({ unreadNotifications: 0 });
                void q.refetch();
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {q.isLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {q.data?.notifications.length === 0 && <EmptyState icon={<Bell />} title="Tudo em dia">Menções, convites e avisos aparecem aqui.</EmptyState>}
          {q.data?.notifications.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <button
                key={n.id}
                onClick={async () => {
                  if (!n.readAt) {
                    await post('/notifications/read', { ids: [n.id] });
                    useStore.setState((s) => ({ unreadNotifications: Math.max(0, s.unreadNotifications - 1) }));
                  }
                  onClose();
                  if (n.link) navigate(n.link);
                }}
                className={cx('flex w-full gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover', !n.readAt && 'bg-accent-soft/50')}
              >
                <Icon className={cx('mt-0.5 size-4 shrink-0', n.readAt ? 'text-faint' : 'text-accent')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{n.title}</span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{n.body}</span>}
                  <span className="mt-1 block text-[12px] text-faint">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
}
