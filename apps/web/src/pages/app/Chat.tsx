import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarClock, Clapperboard, Mic, Paperclip, Plus, SendHorizontal, Smile, Square, Sticker, X } from 'lucide-react';
import { fileUrl, get, post, upload, type UploadedFile } from '../../lib/api';
import { timelineKey, useStore } from '../../lib/store';
import { getSocket } from '../../lib/socket';
import { cx, dayLabel, formatBytes } from '../../lib/format';
import { useT } from '../../lib/i18n';
import type { Channel, Message, PublicUser } from '../../lib/types';
import { Avatar, EmptyState, Field, MenuItem, Modal, Popover, Spinner } from '../../components/ui';
import { EmojiPicker } from '../../components/EmojiPicker';
import { toast, toastError } from '../../components/toast';
import { MessageItem } from './Message';
import { MessageSquare } from 'lucide-react';

const GROUP_MS = 6 * 60_000;

/** A scrollable message timeline (main channel or a thread). */
export function Timeline({ channel, threadId, onThread, header }: { channel: Channel; threadId?: string | null; onThread: (m: Message) => void; header?: React.ReactNode }) {
  const key = timelineKey(channel.id, threadId);
  const tl = useStore((s) => s.timelines[key]);
  const users = useStore((s) => s.users);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);
  const location = useLocation();
  const meId = useStore((s) => s.me?.user.id);
  const [firstUnread] = useState(channel.lastReadMessageId);
  const perms = channel.permissions;
  const canManage = perms.includes('manage_messages');

  const load = useCallback(
    async (opts: { before?: string; around?: string } = {}) => {
      const qs = new URLSearchParams({ limit: '50' });
      if (opts.before) qs.set('before', opts.before);
      if (opts.around) qs.set('around', opts.around);
      if (threadId) qs.set('threadId', threadId);
      const r = await get<{ messages: Message[]; users: PublicUser[] }>(`/channels/${channel.id}/messages?${qs}`);
      useStore.getState().upsertUsers(r.users);
      if (opts.around) useStore.getState().setTimeline(key, { items: r.messages, hasMore: true, loaded: true });
      else useStore.getState().prependMessages(key, r.messages, r.messages.length === 50);
    },
    [channel.id, threadId, key],
  );

  useEffect(() => {
    const target = location.hash.match(/^#m(\d+)$/)?.[1];
    if (target) {
      void load({ around: target }).then(() => {
        stick.current = false;
        setHighlight(target);
        requestAnimationFrame(() => document.getElementById(`m${target}`)?.scrollIntoView({ block: 'center' }));
        setTimeout(() => setHighlight(null), 2500);
      });
    } else if (!tl?.loaded) {
      void load().catch((e) => toastError(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, location.hash]);

  // Keep the view pinned to the bottom unless the reader scrolled up; keep position when older messages load.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current && loadingMore) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      setLoadingMore(false);
    } else if (stick.current) el.scrollTop = el.scrollHeight;
    prevHeight.current = 0;
  }, [tl?.items, loadingMore]);

  // Mark as read when the newest message is visible.
  const last = tl?.items[tl.items.length - 1];
  useEffect(() => {
    if (!last || last.pending || threadId) return;
    if (document.visibilityState !== 'visible') return;
    const t = setTimeout(() => {
      void post(`/channels/${channel.id}/read`, { messageId: last.id }).catch(() => {});
      useStore.getState().setChannelUnread(channel.id, 0, 0);
    }, 400);
    return () => clearTimeout(t);
  }, [last?.id, channel.id, threadId, last]);

  const onScroll = () => {
    const el = scroller.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 200 && tl?.hasMore && !loadingMore && tl.items.length) {
      setLoadingMore(true);
      prevHeight.current = el.scrollHeight;
      void load({ before: tl.items[0].id }).catch(() => setLoadingMore(false));
    }
  };

  const items = tl?.items ?? [];
  const lastOwn = useMemo(() => [...items].reverse().find((m) => m.authorId === meId && !m.deleted && m.type === 'default'), [items, meId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pb-4" role="log" aria-live="polite">
        {tl?.loaded && !tl.hasMore && (header ?? <ChannelIntro channel={channel} />)}
        {loadingMore && (
          <div className="flex justify-center py-3">
            <Spinner />
          </div>
        )}
        {!tl?.loaded && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {items.map((m, i) => {
          const prev = items[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const compact = !!prev && !newDay && prev.authorId === m.authorId && !m.replyTo && prev.type !== 'system' && m.type !== 'system' && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_MS;
          const unreadMark = firstUnread && prev && BigInt(prev.id) <= BigInt(firstUnread) && BigInt(m.id) > BigInt(firstUnread) && m.authorId !== meId;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="my-4 flex items-center gap-3 px-4" role="separator">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-[12px] font-semibold text-faint first-letter:uppercase">{dayLabel(m.createdAt)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              {unreadMark && (
                <div className="my-2 flex items-center gap-2 px-4">
                  <span className="h-px flex-1 bg-danger/60" />
                  <span className="text-[11.5px] font-bold text-danger">novas</span>
                </div>
              )}
              <MessageItem
                m={m}
                compact={compact}
                canManage={canManage}
                canReact={perms.includes('add_reactions')}
                canReply={perms.includes('reply_messages')}
                onReply={setReplyTo}
                onThread={onThread}
                highlight={highlight === m.id}
                editing={editing === m.id}
                setEditing={setEditing}
                inThread={!!threadId}
              />
            </Fragment>
          );
        })}
      </div>
      <TypingBar keyId={key} users={users} />
      <Composer channel={channel} threadId={threadId ?? null} replyTo={replyTo} clearReply={() => setReplyTo(null)} onEditLast={() => lastOwn && setEditing(lastOwn.id)} onSent={() => (stick.current = true)} />
    </div>
  );
}

function ChannelIntro({ channel }: { channel: Channel }) {
  const t = useT();
  return (
    <div className="px-4 pt-10 pb-4">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <MessageSquare className="size-6" />
      </div>
      <h2 className="text-[26px] font-semibold">{channel.spaceId ? `Boas-vindas a #${channel.name}` : t('Mensagens diretas')}</h2>
      <p className="mt-1 text-[14.5px] text-muted">{channel.topic || (channel.spaceId ? 'Este é o começo do canal.' : 'O começo da conversa. Só os participantes veem estas mensagens.')}</p>
    </div>
  );
}

function TypingBar({ keyId, users }: { keyId: string; users: Record<string, PublicUser> }) {
  const typing = useStore((s) => s.typing[keyId]);
  const names = Object.keys(typing ?? {})
    .map((id) => users[id]?.displayName)
    .filter(Boolean);
  return (
    <div className="h-5 px-4 text-[12.5px] text-muted" aria-live="polite">
      {names.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </span>
          <strong>{names.slice(0, 3).join(', ')}</strong> {names.length > 1 ? 'estão digitando…' : 'está digitando…'}
        </span>
      )}
    </div>
  );
}

interface Pending {
  id: string;
  file: File;
  progress: number;
  done?: UploadedFile;
  error?: string;
}

export function Composer({ channel, threadId, replyTo, clearReply, onEditLast, onSent }: { channel: Channel; threadId: string | null; replyTo: Message | null; clearReply: () => void; onEditLast: () => void; onSent: () => void }) {
  const t = useT();
  const users = useStore((s) => s.users);
  const bots = useStore((s) => s.bots);
  const stickers = useStore((s) => s.emojis.filter((e) => e.kind === 'sticker'));
  const meId = useStore((s) => s.me?.user.id)!;
  const draftKey = `ouroboros:draft:${timelineKey(channel.id, threadId)}`;
  const [text, setText] = useState(() => sessionStorage.getItem(draftKey) ?? '');
  const [files, setFiles] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(0);
  const [recording, setRecording] = useState<{ rec: MediaRecorder; started: number } | null>(null);
  const [, force] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLButtonElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const [emoji, setEmoji] = useState(false);
  const [plus, setPlus] = useState(false);
  const [gif, setGif] = useState(false);
  const [sticker, setSticker] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [suggest, setSuggest] = useState<{ kind: '@' | '/'; q: string; start: number } | null>(null);
  const [sIdx, setSIdx] = useState(0);
  const lastTyping = useRef(0);
  const perms = channel.permissions;
  const canSend = perms.includes('send_messages') && !(channel.type === 'ticket' && channel.settings?.closed);
  const canAttach = perms.includes('attach_files');
  const gifs = useQuery({ queryKey: ['gifs-enabled'], queryFn: () => get<{ enabled: boolean }>('/gifs/enabled'), staleTime: Infinity });

  useEffect(() => sessionStorage.setItem(draftKey, text), [text, draftKey]);
  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);
  useEffect(() => {
    if (!slow) return;
    const tm = setInterval(() => setSlow((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tm);
  }, [slow]);
  useEffect(() => {
    if (!recording) return;
    const tm = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(tm);
  }, [recording]);

  // Autosize.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const suggestions = useMemo(() => {
    if (!suggest) return [];
    if (suggest.kind === '@') {
      const q = suggest.q.toLowerCase();
      const list = Object.values(users).filter((u) => !u.isBot && (u.username.toLowerCase().startsWith(q) || u.displayName.toLowerCase().startsWith(q)));
      const special = perms.includes('mention_everyone') && 'todos'.startsWith(q) ? [{ value: 'todos', label: '@todos', sub: 'Notifica todo o canal' }] : [];
      return [...special, ...list.slice(0, 8).map((u) => ({ value: u.username, label: u.displayName, sub: `@${u.username}`, user: u }))];
    }
    const q = suggest.q.toLowerCase();
    const cmds = bots
      .filter((b) => b.enabled && (!channel.spaceId || b.channelMode === 'all' || b.channelIds.includes(channel.id)))
      .flatMap((b) => b.commands.filter((c) => c.enabled).map((c) => ({ value: c.name, label: `/${c.name}`, sub: `${c.description || c.usage} — ${b.displayName}` })));
    return [{ value: 'ajuda', label: '/ajuda', sub: 'Lista os comandos disponíveis' }, ...cmds].filter((c) => c.value.startsWith(q)).slice(0, 8);
  }, [suggest, users, bots, perms, channel]);

  const onChange = (v: string, caret: number) => {
    setText(v);
    const before = v.slice(0, caret);
    const at = before.match(/(?:^|\s)@([a-zA-Z0-9_.]{0,32})$/);
    const cmd = v.startsWith('/') && !v.includes(' ') ? v.slice(1) : null;
    if (at) setSuggest({ kind: '@', q: at[1], start: caret - at[1].length - 1 });
    else if (cmd !== null) setSuggest({ kind: '/', q: cmd, start: 0 });
    else setSuggest(null);
    setSIdx(0);
    if (v && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      getSocket()?.emit('typing', { channelId: channel.id, threadId });
    }
  };

  const pick = (value: string) => {
    if (!suggest) return;
    const insert = suggest.kind === '@' ? `@${value} ` : `/${value} `;
    const caret = area.current?.selectionStart ?? text.length;
    const next = text.slice(0, suggest.start) + insert + text.slice(caret);
    setText(next);
    setSuggest(null);
    requestAnimationFrame(() => {
      area.current?.focus();
      const pos = suggest.start + insert.length;
      area.current?.setSelectionRange(pos, pos);
    });
  };

  const addFiles = (list: FileList | File[]) => {
    if (!canAttach) return toast('Você não pode anexar arquivos neste canal', 'error');
    const arr = Array.from(list).slice(0, 10 - files.length);
    for (const file of arr) {
      const id = Math.random().toString(36).slice(2);
      setFiles((f) => [...f, { id, file, progress: 0 }]);
      upload(file, {}, (p) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, progress: p } : x))))
        .then((done) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, done, progress: 1 } : x))))
        .catch((e) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, error: e.message } : x))));
    }
  };

  const send = async (extra: { gifUrl?: string; stickerId?: string; attachmentIds?: string[]; isVoiceMessage?: boolean; scheduledFor?: string } = {}) => {
    const content = text.trim();
    const ready = files.filter((f) => f.done).map((f) => f.done!.id);
    if (files.some((f) => !f.done && !f.error)) return toast('Aguarde o envio dos anexos terminar', 'info');
    const attachmentIds = extra.attachmentIds ?? ready;
    if (!content && !attachmentIds.length && !extra.gifUrl && !extra.stickerId) return;
    setBusy(true);
    const nonce = `${Date.now()}-${Math.random()}`;
    if (!extra.scheduledFor && content && !attachmentIds.length) {
      // Optimistic echo.
      useStore.getState().addMessage({
        id: `tmp-${nonce}`, channelId: channel.id, threadId, authorId: meId, type: 'default', content, deleted: false, replyTo: replyTo ? { id: replyTo.id, authorId: replyTo.authorId, content: replyTo.content, deleted: false } : null,
        mentionIds: [], mentionsEveryone: false, metadata: { nonce }, editedAt: null, pinnedAt: null, createdAt: new Date().toISOString(), attachments: [], reactions: [], thread: null, poll: null, pending: true,
      });
    }
    try {
      const { attachmentIds: _ignored, ...rest } = extra;
      const r = await post(`/channels/${channel.id}/messages`, { content, replyToId: replyTo?.id ?? null, threadId, attachmentIds, nonce, ...rest });
      if (extra.scheduledFor) toast('Mensagem agendada', 'success', new Date(extra.scheduledFor).toLocaleString('pt-BR'));
      else if (r?.id) useStore.getState().addMessage(r);
      setText('');
      setFiles([]);
      clearReply();
      sessionStorage.removeItem(draftKey);
      if (channel.slowmodeSeconds && !perms.includes('manage_messages')) setSlow(channel.slowmodeSeconds);
      onSent();
    } catch (e) {
      useStore.setState((s) => {
        const k = timelineKey(channel.id, threadId);
        const tl = s.timelines[k];
        return tl ? { timelines: { ...s.timelines, [k]: { ...tl, items: tl.items.filter((m) => m.metadata?.nonce !== nonce) } } } : {};
      });
      toastError(e);
    } finally {
      setBusy(false);
      area.current?.focus();
    }
  };

  const startRecording = async () => {
    if (!canAttach) return toast('Você não pode enviar áudio neste canal', 'error');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if ((rec as any)._cancel) return;
        const type = rec.mimeType.split(';')[0] || 'audio/webm';
        const file = new File(chunks, `mensagem-de-voz.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type });
        try {
          const up = await upload(file);
          await send({ attachmentIds: [up.id], isVoiceMessage: true });
        } catch (e) {
          toastError(e);
        }
      };
      rec.start(250);
      setRecording({ rec, started: Date.now() });
    } catch {
      toast('Permita o acesso ao microfone para gravar', 'error');
    }
  };
  const stopRecording = (cancel = false) => {
    if (!recording) return;
    (recording.rec as any)._cancel = cancel;
    recording.rec.stop();
    setRecording(null);
  };

  if (!canSend)
    return (
      <div className="mx-4 mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-[14px] text-muted">
        {channel.type === 'ticket' && channel.settings?.closed ? 'Este ticket foi fechado.' : channel.type === 'announcement' ? 'Somente a administração publica neste canal.' : 'Você não tem permissão para enviar mensagens aqui.'}
      </div>
    );

  return (
    <div
      className="relative mx-4 mb-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {suggest && suggestions.length > 0 && (
        <div className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-panel">
          {suggestions.map((s, i) => (
            <button key={s.value} onMouseDown={(e) => (e.preventDefault(), pick(s.value))} className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left', i === sIdx ? 'bg-hover' : '')}>
              {'user' in s && s.user && <Avatar user={s.user} size={22} />}
              <span className="text-[14px] font-medium">{s.label}</span>
              <span className="truncate text-[12.5px] text-faint">{s.sub}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-line bg-elevated focus-within:border-line-strong">
        {replyTo && (
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[13px] text-muted">
            <span className="truncate">
              Respondendo a <strong className="text-fg">{users[replyTo.authorId ?? '']?.displayName ?? 'membro'}</strong>
            </span>
            <button onClick={clearReply} aria-label="Cancelar resposta">
              <X className="size-4" />
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-line p-2">
            {files.map((f) => (
              <div key={f.id} className="relative w-36 shrink-0 rounded-lg border border-line bg-surface p-2">
                {f.file.type.startsWith('image/') ? <img src={URL.createObjectURL(f.file)} alt="" className="h-20 w-full rounded object-cover" /> : <div className="flex h-20 items-center justify-center text-[12px] text-muted">{f.file.type || 'arquivo'}</div>}
                <p className="mt-1 truncate text-[12px]">{f.file.name}</p>
                <p className={cx('text-[11px]', f.error ? 'text-danger' : 'text-faint')}>{f.error ?? (f.done ? formatBytes(f.file.size) : `${Math.round(f.progress * 100)}%`)}</p>
                {!f.done && !f.error && <div className="absolute inset-x-2 bottom-1 h-0.5 rounded bg-accent" style={{ width: `${f.progress * 100}%` }} />}
                <button className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label="Remover anexo">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {recording ? (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="size-2.5 animate-pulse rounded-full bg-danger" />
            <span className="flex-1 text-[14px]">Gravando… {Math.floor((Date.now() - recording.started) / 1000)}s</span>
            <button className="btn-ghost !py-1.5" onClick={() => stopRecording(true)}>
              Descartar
            </button>
            <button className="btn-primary !py-1.5" onClick={() => stopRecording(false)}>
              <Square className="size-3.5" /> Enviar áudio
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-1 px-2 py-1.5">
            <button ref={plusRef} className="icon-btn mb-0.5" title="Mais opções" onClick={() => setPlus(true)}>
              <Plus className="size-5" />
            </button>
            <textarea
              ref={area}
              rows={1}
              value={text}
              disabled={busy && false}
              placeholder={slow ? `Modo lento: aguarde ${slow}s` : `${t('Enviar mensagem em')} ${channel.spaceId ? `#${channel.name}` : 'conversa'}`}
              className="max-h-60 min-h-[38px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-faint"
              onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
              onPaste={(e) => {
                const fl = Array.from(e.clipboardData.files);
                if (fl.length) {
                  e.preventDefault();
                  addFiles(fl);
                }
              }}
              onKeyDown={(e) => {
                if (suggest && suggestions.length) {
                  if (e.key === 'ArrowDown') return e.preventDefault(), setSIdx((i) => (i + 1) % suggestions.length);
                  if (e.key === 'ArrowUp') return e.preventDefault(), setSIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                  if (e.key === 'Tab' || (e.key === 'Enter' && suggest.kind === '@')) return e.preventDefault(), pick(suggestions[sIdx].value);
                  if (e.key === 'Escape') return setSuggest(null);
                }
                if (e.key === 'ArrowUp' && !text) {
                  e.preventDefault();
                  onEditLast();
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!slow) void send();
                }
                if (e.key === 'Escape' && replyTo) clearReply();
              }}
              aria-label="Mensagem"
            />
            <button ref={emojiRef} className="icon-btn mb-0.5" title="Emoji" onClick={() => setEmoji(true)}>
              <Smile className="size-5" />
            </button>
            {text.trim() || files.length ? (
              <button className="icon-btn mb-0.5 text-accent" title="Enviar" disabled={busy || !!slow} onClick={() => void send()}>
                <SendHorizontal className="size-5" />
              </button>
            ) : (
              <button className="icon-btn mb-0.5" title="Gravar mensagem de voz" onClick={() => void startRecording()}>
                <Mic className="size-5" />
              </button>
            )}
          </div>
        )}
      </div>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && (addFiles(e.target.files), (e.target.value = ''))} />
      <Popover anchor={emojiRef.current} open={emoji} onClose={() => setEmoji(false)} placement="top-end">
        <EmojiPicker
          onPick={(e) => {
            const pos = area.current?.selectionStart ?? text.length;
            setText(text.slice(0, pos) + e + text.slice(pos));
            setEmoji(false);
            area.current?.focus();
          }}
        />
      </Popover>
      <Popover anchor={plusRef.current} open={plus} onClose={() => setPlus(false)} placement="top-start">
        <div className="w-56 p-1.5" onClick={() => setPlus(false)}>
          <MenuItem icon={<Paperclip />} disabled={!canAttach} onClick={() => fileInput.current?.click()}>
            Enviar arquivo
          </MenuItem>
          <MenuItem icon={<BarChart3 />} onClick={() => setPollOpen(true)}>
            Criar enquete
          </MenuItem>
          {gifs.data?.enabled && (
            <MenuItem icon={<Clapperboard />} onClick={() => setGif(true)}>
              Enviar GIF
            </MenuItem>
          )}
          {stickers.length > 0 && (
            <MenuItem icon={<Sticker />} onClick={() => setSticker(true)}>
              Enviar sticker
            </MenuItem>
          )}
          <MenuItem icon={<CalendarClock />} disabled={!text.trim()} onClick={() => setSchedule(true)}>
            Agendar mensagem
          </MenuItem>
        </div>
      </Popover>
      {gif && <GifPicker onClose={() => setGif(false)} onPick={(url) => (setGif(false), void send({ gifUrl: url }))} />}
      {sticker && (
        <Modal open onClose={() => setSticker(false)} title="Stickers">
          <div className="grid grid-cols-4 gap-2">
            {stickers.map((s) => (
              <button key={s.id} className="rounded-lg p-2 hover:bg-hover" onClick={() => (setSticker(false), void send({ stickerId: s.id }))}>
                <img src={fileUrl(s.fileId)} alt={s.name} className="aspect-square w-full object-contain" />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {schedule && <ScheduleModal onClose={() => setSchedule(false)} onPick={(iso) => (setSchedule(false), void send({ scheduledFor: iso }))} />}
      {pollOpen && <PollModal channelId={channel.id} onClose={() => setPollOpen(false)} />}
    </div>
  );
}

function GifPicker({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const tm = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(tm);
  }, [q]);
  const r = useQuery({ queryKey: ['gifs', debounced], queryFn: () => get(`/gifs/search?q=${encodeURIComponent(debounced)}`), enabled: debounced.length > 1 });
  return (
    <Modal open onClose={onClose} title="GIFs" wide>
      <input className="field mb-3" placeholder="Buscar GIFs" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
      {r.isFetching && <Spinner />}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {r.data?.results?.map((g: any) => (
          <button key={g.id} onClick={() => onPick(g.url)} className="overflow-hidden rounded-lg bg-surface">
            <img src={g.preview} alt={g.description} className="aspect-square w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-faint">Busca fornecida pelo Tenor. As buscas passam pelo servidor da comunidade.</p>
    </Modal>
  );
}

function ScheduleModal({ onClose, onPick }: { onClose: () => void; onPick: (iso: string) => void }) {
  const def = new Date(Date.now() + 3600_000);
  def.setMinutes(0, 0, 0);
  const local = new Date(def.getTime() - def.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [v, setV] = useState(local);
  return (
    <Modal
      open
      onClose={onClose}
      title="Agendar mensagem"
      footer={
        <button className="btn-primary" onClick={() => onPick(new Date(v).toISOString())}>
          Agendar
        </button>
      }
    >
      <Field label="Enviar em" hint="A mensagem é enviada pelo servidor, mesmo que você esteja offline.">
        <input type="datetime-local" className="field" value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function PollModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [hours, setHours] = useState(24);
  return (
    <Modal
      open
      onClose={onClose}
      title="Nova enquete"
      footer={
        <button
          className="btn-primary"
          disabled={!question.trim() || options.filter((o) => o.trim()).length < 2}
          onClick={async () => {
            try {
              await post(`/channels/${channelId}/polls`, { question, options: options.filter((o) => o.trim()), multiple, anonymous, durationHours: hours });
              onClose();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          Publicar enquete
        </button>
      }
    >
      <Field label="Pergunta">
        <input className="field" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} autoFocus />
      </Field>
      <label className="label">Opções</label>
      {options.map((o, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <input className="field" value={o} placeholder={`Opção ${i + 1}`} maxLength={100} onChange={(e) => setOptions((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
          {options.length > 2 && (
            <button className="icon-btn" onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} aria-label="Remover opção">
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      {options.length < 10 && (
        <button className="btn-ghost mb-3 !px-2 text-[13px]" onClick={() => setOptions((x) => [...x, ''])}>
          <Plus className="size-4" /> Adicionar opção
        </button>
      )}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 py-1 text-[14px]">
          <input type="checkbox" className="accent-[var(--accent)]" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Permitir várias escolhas
        </label>
        <label className="flex items-center gap-2 py-1 text-[14px]">
          <input type="checkbox" className="accent-[var(--accent)]" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Votos anônimos
        </label>
      </div>
      <Field label="Duração (horas)" hint="0 = sem prazo">
        <input type="number" className="field" min={0} max={720} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
      </Field>
    </Modal>
  );
}

export { EmptyState };
