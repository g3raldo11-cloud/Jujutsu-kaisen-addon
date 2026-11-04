import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Flag, MessageSquare, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { del, get, post, put } from '../../lib/api';
import { useStore } from '../../lib/store';
import { dateTime } from '../../lib/format';
import { Avatar, PRESENCE_LABEL, Popover, Spinner, UserName } from '../../components/ui';
import { toast, toastError } from '../../components/toast';
import { ReportButton } from './Report';

function useProfile(userId: string, enabled = true) {
  return useQuery({ queryKey: ['profile', userId], queryFn: () => get(`/users/${userId}`), enabled });
}

function ProfileBody({ userId, compact, onAction }: { userId: string; compact?: boolean; onAction?: () => void }) {
  const q = useProfile(userId);
  const meId = useStore((s) => s.me?.user.id);
  const roles = useStore((s) => s.roles);
  const navigate = useNavigate();
  if (q.isLoading) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (!q.data) return <p className="p-6 text-muted">Perfil indisponível.</p>;
  const u = q.data;
  const isMe = u.id === meId;
  const progress = Math.min(100, Math.round(((u.xp - ((u.level - 1) ** 2) * 50) / Math.max(1, u.nextLevelXp - ((u.level - 1) ** 2) * 50)) * 100));
  const openDm = async () => {
    try {
      const r = await post('/conversations/dm', { userId: u.id });
      await useStore.getState().loadConversations();
      await useStore.getState().loadStructure();
      onAction?.();
      navigate(`/app/c/${r.id}`);
    } catch (e) {
      toastError(e);
    }
  };
  const friend = async () => {
    try {
      if (!u.friendship) await post('/friends/requests', { userId: u.id });
      else if (u.friendship.status === 'pending' && !u.friendship.outgoing) await post(`/friends/requests/${u.friendship.id}/accept`);
      else await del(`/friends/${u.friendship.id}`);
      void q.refetch();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div>
      <div className="h-20 rounded-t-xl" style={{ background: `linear-gradient(135deg, ${u.profileColor}, color-mix(in srgb, ${u.profileColor} 40%, var(--surface)))` }} />
      <div className="px-4 pb-4">
        <div className="-mt-9 mb-2 flex items-end justify-between">
          <span className="rounded-full border-4 border-elevated">
            <Avatar user={u} size={72} presence={u.presence} />
          </span>
          {!isMe && !u.isBot && (
            <div className="flex gap-1.5">
              <button className="btn-outline !px-2.5 !py-1.5" title="Mensagem" onClick={() => void openDm()}>
                <MessageSquare className="size-4" />
              </button>
              <button className="btn-outline !px-2.5 !py-1.5" title="Amizade" onClick={() => void friend()}>
                {!u.friendship ? <UserPlus className="size-4" /> : u.friendship.status === 'accepted' ? <UserMinus className="size-4" /> : u.friendship.outgoing ? <UserMinus className="size-4" /> : <UserCheck className="size-4" />}
              </button>
            </div>
          )}
        </div>
        <UserName user={u} className="text-[19px]" />
        <p className="text-[13.5px] text-muted">
          @{u.username}
          {u.pronouns && ` · ${u.pronouns}`}
        </p>
        {u.customStatus && <p className="mt-1 text-[13.5px]">{u.customStatus}</p>}
        {!u.isBot && <p className="mt-1 text-[12.5px] text-faint">{PRESENCE_LABEL[u.presence] ?? 'Offline'}</p>}
        {u.bio && <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line">{u.bio}</p>}
        {u.roleIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {roles
              .filter((r) => u.roleIds.includes(r.id))
              .map((r) => (
                <span key={r.id} className="chip" style={{ borderColor: r.color, color: r.color }}>
                  {r.name}
                </span>
              ))}
          </div>
        )}
        {!u.isBot && (
          <div className="mt-4">
            <div className="flex justify-between text-[12.5px] text-muted">
              <span>Nível {u.level}</span>
              <span>{u.xp} XP</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {u.achievements?.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[12.5px] font-semibold text-faint">Distintivos</p>
            <div className="flex flex-wrap gap-1.5">
              {u.achievements.slice(0, compact ? 8 : 50).map((a: any) => (
                <span key={a.key} title={`${a.title} — ${a.description}`} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]">
                  <span>{a.icon}</span>
                  {!compact && a.title}
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="mt-4 text-[12px] text-faint">Membro desde {dateTime(u.createdAt)}</p>
        {!isMe && !u.isBot && (
          <div className="mt-3 flex gap-2 border-t border-line pt-3">
            <ReportButton targetType="user" targetId={u.id} className="btn-ghost !px-2 !py-1 text-[13px] text-muted">
              <Flag className="size-3.5" /> Denunciar
            </ReportButton>
            <button
              className="btn-ghost !px-2 !py-1 text-[13px] text-muted"
              onClick={async () => {
                await put(`/blocks/${u.id}`);
                toast('Usuário bloqueado. Vocês não poderão trocar mensagens privadas.', 'success');
                void q.refetch();
              }}
            >
              <Ban className="size-3.5" /> Bloquear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProfilePopover({ userId, anchor, open, onClose }: { userId: string; anchor: HTMLElement | null; open: boolean; onClose: () => void }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-start">
      <div className="w-[300px]">{open && <ProfileBody userId={userId} compact onAction={onClose} />}</div>
    </Popover>
  );
}

export function ProfilePage() {
  const { userId } = useParams();
  const meId = useStore((s) => s.me?.user.id);
  const id = userId ?? meId!;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto my-8 max-w-lg rounded-xl border border-line bg-elevated">
        <ProfileBody userId={id} />
      </div>
    </div>
  );
}
