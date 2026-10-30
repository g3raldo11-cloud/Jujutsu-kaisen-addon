import { memo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  CornerUpLeft,
  Copy,
  Download,
  FileText,
  Flag,
  History,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { del, fileUrl, get, patch, post, put } from '../../lib/api';
import { useStore } from '../../lib/store';
import { cx, dateTime, formatBytes, time } from '../../lib/format';
import type { Attachment, Message } from '../../lib/types';
import { Avatar, MenuItem, Modal, Popover, UserName } from '../../components/ui';
import { Markdown, isJumboEmoji } from '../../components/Markdown';
import { EmojiPicker } from '../../components/EmojiPicker';
import { toast, toastError } from '../../components/toast';
import { ProfilePopover } from './Profile';
import { ReportModal } from './Report';

interface Props {
  m: Message;
  compact: boolean;
  canManage: boolean;
  canReact: boolean;
  canReply: boolean;
  onReply: (m: Message) => void;
  onThread: (m: Message) => void;
  highlight?: boolean;
  editing: boolean;
  setEditing: (id: string | null) => void;
  inThread?: boolean;
}

export const MessageItem = memo(function MessageItem({ m, compact, canManage, canReact, canReply, onReply, onThread, highlight, editing, setEditing, inThread }: Props) {
  const author = useStore((s) => (m.authorId ? s.users[m.authorId] : undefined));
  const replyAuthor = useStore((s) => (m.replyTo?.authorId ? s.users[m.replyTo.authorId] : undefined));
  const meId = useStore((s) => s.me?.user.id)!;
  const isDm = useStore((s) => !s.channels[m.channelId]?.spaceId);
  const mentioned = m.mentionIds.includes(meId) || m.mentionsEveryone;
  const mine = m.authorId === meId;
  const nameRef = useRef<HTMLButtonElement>(null);
  const [profile, setProfile] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);
  const reactRef = useRef<HTMLButtonElement>(null);
  const [picker, setPicker] = useState(false);
  const [report, setReport] = useState(false);
  const [history, setHistory] = useState(false);
  const [floating, setFloating] = useState<{ id: number; emoji: string }[]>([]);

  const react = async (emoji: string) => {
    setPicker(false);
    const existing = m.reactions.find((r) => r.emoji === emoji);
    try {
      if (existing?.me) await del(`/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`);
      else {
        setFloating((f) => [...f, { id: Date.now(), emoji }]);
        setTimeout(() => setFloating((f) => f.slice(1)), 1400);
        await put(`/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`);
      }
    } catch (e) {
      toastError(e);
    }
  };

  if (m.type === 'system') {
    return (
      <div className="flex items-center gap-3 px-4 py-1.5 pl-[72px] text-[13.5px] text-muted">
        <span>{m.content}</span>
        <span className="text-[12px] text-faint">{time(m.createdAt)}</span>
      </div>
    );
  }

  return (
    <div
      id={`m${m.id}`}
      className={cx(
        'group relative px-4 transition-colors hover:bg-hover/40',
        compact ? 'py-0.5' : 'mt-3 pt-1 pb-0.5',
        mentioned && 'border-l-2 border-accent bg-mention',
        highlight && 'bg-accent-soft',
        m.pending && 'opacity-60',
      )}
    >
      {m.replyTo && (
        <div className="mb-0.5 ml-[52px] flex items-center gap-1.5 text-[13px] text-muted">
          <CornerUpLeft className="size-3.5 shrink-0 text-faint" />
          <Avatar user={replyAuthor} size={16} presence={false} />
          <span className="font-semibold">{replyAuthor?.displayName ?? 'membro'}</span>
          <a href={`#m${m.replyTo.id}`} className="truncate hover:text-fg">
            {m.replyTo.deleted ? <i>mensagem apagada</i> : m.replyTo.content || 'anexo'}
          </a>
        </div>
      )}
      <div className="flex gap-3">
        <div className="w-10 shrink-0">
          {!compact ? (
            <button ref={nameRef} onClick={() => setProfile(true)} aria-label="Ver perfil">
              <Avatar user={author} size={40} presence={false} />
            </button>
          ) : (
            <span className="block pt-1 text-right text-[11px] text-faint opacity-0 group-hover:opacity-100">{time(m.createdAt)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="flex items-baseline gap-2">
              <button onClick={() => setProfile(true)} className="hover:underline">
                <UserName user={author} className="text-[15px]" />
              </button>
              <time className="text-[12px] text-faint" dateTime={m.createdAt} title={dateTime(m.createdAt)}>
                {time(m.createdAt)}
              </time>
              {m.pinnedAt && <Pin className="size-3 text-accent" aria-label="Fixada" />}
            </div>
          )}
          {m.deleted ? (
            <p className="text-[14.5px] text-faint italic">mensagem apagada</p>
          ) : editing ? (
            <EditBox m={m} onDone={() => setEditing(null)} />
          ) : (
            <>
              {m.content && m.type !== 'poll' && (
                <div className={cx('text-[15px] leading-[1.45]', isJumboEmoji(m.content) && 'text-[34px] leading-tight')}>
                  <Markdown text={m.content} />
                  {m.editedAt && (
                    <button onClick={() => setHistory(true)} className="ml-1 text-[11px] text-faint hover:underline" title={`Editada em ${dateTime(m.editedAt)}`}>
                      (editada)
                    </button>
                  )}
                </div>
              )}
              {m.metadata.gifUrl && <img src={m.metadata.gifUrl} alt="GIF" className="mt-1 max-h-60 rounded-lg" loading="lazy" referrerPolicy="no-referrer" />}
              {m.metadata.stickerId && <Sticker id={m.metadata.stickerId} />}
              {m.attachments.length > 0 && <Attachments list={m.attachments} voice={m.type === 'voice'} />}
              {m.poll && <PollCard m={m} />}
            </>
          )}
          {m.reactions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {m.reactions.map((r) => (
                <ReactionChip key={r.emoji} r={r} onClick={() => canReact && void react(r.emoji)} />
              ))}
            </div>
          )}
          {m.thread && !inThread && (
            <button onClick={() => onThread(m)} className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] hover:border-accent">
              <MessageSquareText className="size-3.5 text-accent" />
              <span className="font-semibold">{m.thread.title}</span>
              <span className="text-muted">{m.thread.messageCount} {m.thread.messageCount === 1 ? 'resposta' : 'respostas'}</span>
            </button>
          )}
        </div>
      </div>
      {floating.map((f) => (
        <span key={f.id} className="float-up pointer-events-none absolute right-24 bottom-4 text-[26px]" aria-hidden>
          {f.emoji}
        </span>
      ))}

      {!m.deleted && !m.pending && !editing && (
        <div className="absolute -top-4 right-4 hidden items-center rounded-lg border border-line bg-elevated shadow-panel group-focus-within:flex group-hover:flex">
          {canReact && (
            <button ref={reactRef} className="icon-btn" title="Reagir" onClick={() => setPicker(true)}>
              <SmilePlus className="size-4" />
            </button>
          )}
          {canReply && (
            <button className="icon-btn" title="Responder" onClick={() => onReply(m)}>
              <CornerUpLeft className="size-4" />
            </button>
          )}
          {canReply && !inThread && !m.threadId && (
            <button className="icon-btn" title="Criar thread" onClick={() => onThread(m)}>
              <MessageSquareText className="size-4" />
            </button>
          )}
          {mine && m.type !== 'poll' && (
            <button className="icon-btn" title="Editar" onClick={() => setEditing(m.id)}>
              <Pencil className="size-4" />
            </button>
          )}
          <button ref={moreRef} className="icon-btn" title="Mais" onClick={() => setMore(true)}>
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      )}
      <Popover anchor={reactRef.current} open={picker} onClose={() => setPicker(false)} placement="bottom-end">
        <EmojiPicker onPick={(e) => void react(e)} />
      </Popover>
      <Popover anchor={moreRef.current} open={more} onClose={() => setMore(false)} placement="bottom-end">
        <div className="w-52 p-1.5" onClick={() => setMore(false)}>
          <MenuItem icon={<Copy />} onClick={() => void navigator.clipboard.writeText(m.content)}>
            Copiar texto
          </MenuItem>
          <MenuItem
            icon={<Bookmark />}
            onClick={async () => {
              await put('/favorites', { targetType: 'message', targetId: m.id });
              toast('Salva em Favoritos', 'success');
            }}
          >
            Favoritar
          </MenuItem>
          {(canManage || isDm) && (
            <MenuItem icon={m.pinnedAt ? <PinOff /> : <Pin />} onClick={() => void (m.pinnedAt ? del(`/messages/${m.id}/pin`) : put(`/messages/${m.id}/pin`)).catch(toastError)}>
              {m.pinnedAt ? 'Desafixar' : 'Fixar'}
            </MenuItem>
          )}
          {canManage && !mine && m.type !== 'poll' && (
            <MenuItem icon={<Pencil />} onClick={() => setEditing(m.id)}>
              Editar (moderação)
            </MenuItem>
          )}
          {m.editedAt && (
            <MenuItem icon={<History />} onClick={() => setHistory(true)}>
              Histórico de edições
            </MenuItem>
          )}
          {!mine && (
            <MenuItem icon={<Flag />} onClick={() => setReport(true)}>
              Denunciar
            </MenuItem>
          )}
          {(mine || canManage) && (
            <MenuItem icon={<Trash2 />} danger onClick={() => void del(`/messages/${m.id}`).catch(toastError)}>
              Excluir
            </MenuItem>
          )}
        </div>
      </Popover>
      {m.authorId && <ProfilePopover userId={m.authorId} anchor={nameRef.current} open={profile} onClose={() => setProfile(false)} />}
      {report && <ReportModal open onClose={() => setReport(false)} targetType="message" targetId={m.id} />}
      {history && <EditHistory id={m.id} onClose={() => setHistory(false)} />}
    </div>
  );
});

function ReactionChip({ r, onClick }: { r: Message['reactions'][number]; onClick: () => void }) {
  const users = useStore((s) => s.users);
  const custom = useStore((s) => (r.emoji.startsWith(':') ? s.emojis.find((e) => `:${e.name}:` === r.emoji) : null));
  const names = r.userIds.map((id) => users[id]?.displayName).filter(Boolean).join(', ');
  return (
    <button
      key={`${r.emoji}-${r.count}`}
      onClick={onClick}
      title={names}
      className={cx('react-pop flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px]', r.me ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-surface text-muted hover:border-line-strong')}
    >
      {custom ? <img src={fileUrl(custom.fileId)} alt={r.emoji} className="size-4" /> : <span className="text-[15px] leading-none">{r.emoji}</span>}
      <span className="font-semibold">{r.count}</span>
    </button>
  );
}

function EditBox({ m, onDone }: { m: Message; onDone: () => void }) {
  const [text, setText] = useState(m.content);
  const save = async () => {
    if (!text.trim()) return;
    try {
      await patch(`/messages/${m.id}`, { content: text });
      onDone();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="mt-1">
      <textarea
        autoFocus
        className="field min-h-16 resize-y"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
      />
      <p className="mt-1 text-[12px] text-faint">
        Esc para cancelar · Enter para salvar
      </p>
    </div>
  );
}

function EditHistory({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['edits', id], queryFn: () => get<any[]>(`/messages/${id}/edits`) });
  return (
    <Modal open onClose={onClose} title="Histórico de edições">
      {q.data?.length === 0 && <p className="text-muted">Sem versões anteriores.</p>}
      <ol className="space-y-3">
        {q.data?.map((e) => (
          <li key={e.id} className="rounded-lg border border-line p-3">
            <p className="mb-1 text-[12px] text-faint">{dateTime(e.editedAt)}</p>
            <Markdown text={e.previousContent} className="text-[14px]" />
          </li>
        ))}
      </ol>
    </Modal>
  );
}

function Sticker({ id }: { id: string }) {
  const s = useStore((st) => st.emojis.find((e) => e.id === id));
  if (!s) return null;
  return <img src={fileUrl(s.fileId)} alt={s.name} title={s.name} className="mt-1 size-36 object-contain" />;
}

export function Attachments({ list, voice }: { list: Attachment[]; voice?: boolean }) {
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const images = list.filter((a) => a.category === 'image');
  const others = list.filter((a) => a.category !== 'image');
  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className={cx('grid max-w-lg gap-1.5', images.length > 1 && 'grid-cols-2')}>
          {images.map((a) => (
            <button key={a.id} onClick={() => setLightbox(a)} className="overflow-hidden rounded-lg border border-line bg-surface">
              <img src={fileUrl(a.id)} alt={a.name} loading="lazy" className="max-h-80 w-full object-cover" style={a.width && a.height && images.length === 1 ? { aspectRatio: `${a.width}/${a.height}`, maxWidth: Math.min(a.width, 480) } : undefined} />
            </button>
          ))}
        </div>
      )}
      {others.map((a) =>
        a.category === 'video' ? (
          <video key={a.id} src={fileUrl(a.id)} controls preload="metadata" className="max-h-80 max-w-lg rounded-lg border border-line bg-black" />
        ) : a.category === 'audio' ? (
          <div key={a.id} className="flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="text-[13px] text-muted">{voice ? '🎙️ Mensagem de voz' : a.name}</span>
            <audio src={fileUrl(a.id)} controls preload="metadata" className="h-8 min-w-0 flex-1" />
          </div>
        ) : (
          <a key={a.id} href={fileUrl(a.id, true)} className="flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 hover:border-line-strong">
            <FileText className="size-8 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-info">{a.name}</span>
              <span className="text-[12px] text-faint">{formatBytes(a.size)}</span>
            </span>
            <Download className="size-4 text-muted" />
          </a>
        ),
      )}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-6" onClick={() => setLightbox(null)}>
          <img src={fileUrl(lightbox.id)} alt={lightbox.name} className="max-h-full max-w-full rounded-lg object-contain" />
          <div className="absolute top-4 right-4 flex gap-2">
            <a href={fileUrl(lightbox.id, true)} onClick={(e) => e.stopPropagation()} className="icon-btn bg-black/50 text-white" aria-label="Baixar">
              <Download className="size-5" />
            </a>
            <button className="icon-btn bg-black/50 text-white" aria-label="Fechar">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PollCard({ m }: { m: Message }) {
  const p = m.poll!;
  const [mine, setMine] = useState<string[]>(p.myVotes ?? []);
  const users = useStore((s) => s.users);
  const total = p.options.reduce((n, o) => n + o.votes, 0);
  const vote = async (id: string) => {
    const next = p.multiple ? (mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]) : mine.includes(id) ? [] : [id];
    setMine(next);
    try {
      await post(`/polls/${p.id}/vote`, { optionIds: next });
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="mt-1.5 max-w-md rounded-xl border border-line bg-surface p-3.5">
      <p className="mb-0.5 font-display text-[16px] font-semibold">{p.question}</p>
      <p className="mb-3 text-[12.5px] text-faint">
        {p.multiple ? 'Várias escolhas' : 'Uma escolha'} · {p.totalVoters} {p.totalVoters === 1 ? 'voto' : 'votos'}
        {p.closed ? ' · encerrada' : p.closesAt ? ` · encerra ${dateTime(p.closesAt)}` : ''}
      </p>
      <div className="space-y-1.5">
        {p.options.map((o) => {
          const pct = total ? Math.round((o.votes / total) * 100) : 0;
          const chosen = mine.includes(o.id);
          return (
            <button
              key={o.id}
              disabled={p.closed}
              onClick={() => void vote(o.id)}
              title={o.voters.map((v) => users[v]?.displayName).filter(Boolean).join(', ')}
              className={cx('relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-[14px]', chosen ? 'border-accent' : 'border-line hover:border-line-strong')}
            >
              <span className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-500" style={{ width: `${pct}%` }} />
              <span className="relative flex justify-between gap-2">
                <span className={cx(chosen && 'font-semibold')}>{o.label}</span>
                <span className="text-muted">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
