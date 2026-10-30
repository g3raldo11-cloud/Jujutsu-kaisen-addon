import { io, type Socket } from 'socket.io-client';
import type { SoundEvent } from '@ouroboros/shared';
import { timelineKey, useStore } from './store';
import { playSound } from './sounds';
import { queryClient } from './query';
import type { Message, Notification, VoiceParticipant } from './types';
import { toast } from '../components/toast';

let socket: Socket | null = null;
export const getSocket = () => socket;

const soundFor: Record<string, SoundEvent> = {
  mention: 'mention',
  message: 'message',
  friend_request: 'friend_request',
  call: 'call_invite',
  admin: 'admin',
  access_request: 'admin',
  report: 'admin',
};

function desktopNotify(n: Notification) {
  const me = useStore.getState().me;
  const prefs = me?.preferences.notifications ?? {};
  if (prefs.desktop === false || me?.presence === 'dnd') return;
  if (prefs.mentionsOnly && n.type === 'message') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notif = new Notification(n.title, { body: n.body, tag: n.id, icon: '/icon-192.png' });
  notif.onclick = () => {
    window.focus();
    if (n.link) window.history.pushState({}, '', n.link.replace(/^\/app/, '/app'));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
}

export function connectSocket() {
  if (socket) return socket;
  const s = io({ path: '/socket.io', transports: ['websocket', 'polling'], withCredentials: true });
  socket = s;
  const st = useStore;

  s.on('connect', () => st.setState({ connected: true }));
  s.on('disconnect', () => st.setState({ connected: false }));
  s.on('connect_error', (err) => {
    st.setState({ connected: false });
    if (['UNAUTHORIZED', 'FORBIDDEN', 'MAINTENANCE'].includes(err.message)) window.dispatchEvent(new CustomEvent('ouroboros:session-check'));
  });
  s.io.on('reconnect', () => {
    // Resync anything we may have missed while offline.
    void st.getState().loadStructure();
    void st.getState().loadMembers();
    queryClient.invalidateQueries();
  });

  s.on('message:new', (m: Message) => {
    const state = st.getState();
    state.addMessage(m);
    const me = state.me?.user.id;
    if (m.authorId && m.authorId !== me) {
      const viewing = window.location.pathname.includes(m.channelId) && document.visibilityState === 'visible';
      if (!viewing && !m.threadId) {
        const c = state.channels[m.channelId];
        if (c) state.setChannelUnread(m.channelId, c.unread + 1, c.mentions + (m.mentionIds.includes(me!) || m.mentionsEveryone ? 1 : 0));
      }
      const typing = state.typing[m.channelId];
      if (typing?.[m.authorId]) {
        const next = { ...typing };
        delete next[m.authorId];
        st.setState({ typing: { ...state.typing, [m.channelId]: next } });
      }
      const isDm = m.channelId && !state.channels[m.channelId]?.spaceId;
      if (viewing && !isDm) {
        /* reading it already */
      } else if (m.mentionIds.includes(me!)) {
        /* sound comes with the mention notification */
      } else if (isDm && !viewing) playSound('message');
    }
    if (!st.getState().channels[m.channelId]) void st.getState().loadConversations();
    else st.setState((x) => ({ channels: { ...x.channels, [m.channelId]: { ...x.channels[m.channelId], lastMessageAt: m.createdAt } } }));
  });
  s.on('message:updated', (m: Message) => st.getState().updateMessage(m));
  s.on('message:deleted', (p: { id: string; channelId: string; threadId: string | null }) => st.getState().removeMessage(p.id, p.channelId, p.threadId));
  s.on('reaction:add', (p: { messageId: string; channelId: string; emoji: string; userId: string }) => st.getState().patchReaction(p.channelId, p.messageId, p.emoji, p.userId, true));
  s.on('reaction:remove', (p: { messageId: string; channelId: string; emoji: string; userId: string }) => st.getState().patchReaction(p.channelId, p.messageId, p.emoji, p.userId, false));

  s.on('typing', (p: { channelId: string; threadId: string | null; userId: string }) => {
    const key = timelineKey(p.channelId, p.threadId);
    st.setState((x) => ({ typing: { ...x.typing, [key]: { ...(x.typing[key] ?? {}), [p.userId]: Date.now() + 6000 } } }));
  });

  s.on('presence:update', (p: { userId: string; presence: string }) => st.setState((x) => ({ presence: { ...x.presence, [p.userId]: p.presence } })));
  s.on('member:joined', (u) => {
    st.getState().upsertUsers([u]);
    playSound('member_join');
  });
  s.on('member:updated', (u) => (u?.username ? st.getState().upsertUsers([u]) : st.getState().loadMembers()));
  s.on('member:left', () => {
    void st.getState().loadMembers();
    playSound('member_leave');
  });
  s.on('roles:updated', () => void st.getState().loadRoles());
  s.on('bots:updated', () => void st.getState().loadBots());
  s.on('emojis:updated', () => void st.getState().loadEmojis());
  s.on('structure:updated', () => void st.getState().loadStructure());
  s.on('channel:deleted', () => void st.getState().loadStructure());
  s.on('conversations:updated', () => void st.getState().loadConversations());
  s.on('friends:updated', () => queryClient.invalidateQueries({ queryKey: ['friends'] }));
  s.on('events:updated', () => queryClient.invalidateQueries({ queryKey: ['events'] }));
  s.on('me:refresh', () => window.dispatchEvent(new CustomEvent('ouroboros:session-check')));
  s.on('settings:updated', (c) => st.setState((x) => ({ community: { ...x.community!, ...c } })));
  s.on('access-request:new', () => queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] }));
  s.on('access-request:updated', () => queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] }));
  s.on('report:new', () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] }));
  s.on('audit:new', () => queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] }));
  s.on('forum:post', (p) => queryClient.invalidateQueries({ queryKey: ['forum', p.channelId] }));
  s.on('forum:post-updated', (p) => {
    queryClient.invalidateQueries({ queryKey: ['forum', p.channelId] });
    queryClient.invalidateQueries({ queryKey: ['post', p.id] });
  });
  s.on('forum:post-deleted', (p) => queryClient.invalidateQueries({ queryKey: ['forum', p.channelId] }));
  s.on('forum:comment', (c) => queryClient.invalidateQueries({ queryKey: ['post', c.postId] }));
  s.on('forum:comment-updated', (c) => queryClient.invalidateQueries({ queryKey: ['post', c.postId] }));
  s.on('file:new', (f) => queryClient.invalidateQueries({ queryKey: ['files', f.channelId] }));
  s.on('file:deleted', (f) => queryClient.invalidateQueries({ queryKey: ['files', f.channelId] }));
  s.on('folder:changed', (f) => queryClient.invalidateQueries({ queryKey: ['files', f.channelId] }));
  s.on('changelog:new', () => queryClient.invalidateQueries({ queryKey: ['changelog'] }));
  s.on('voice:participants', (p: { channelId: string; participants: VoiceParticipant[] }) => st.setState((x) => ({ voice: { ...x.voice, [p.channelId]: p.participants } })));
  s.on('call:incoming', (p: { channelId: string; from: { displayName: string } }) => {
    playSound('call_invite');
    window.dispatchEvent(new CustomEvent('ouroboros:incoming-call', { detail: p }));
  });
  s.on('announcement', (a: { title: string; body: string }) => toast(`📢 ${a.title}`, 'info', a.body));
  s.on('level:up', (p: { level: number }) => toast(`Você subiu para o nível ${p.level}!`, 'success'));

  s.on('notification:new', (n: Notification) => {
    st.setState((x) => ({ unreadNotifications: x.unreadNotifications + 1 }));
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    const ev = soundFor[n.type];
    if (ev && !(n.type === 'message' && window.location.pathname.includes(n.data?.channelId ?? '§'))) playSound(ev);
    desktopNotify(n);
    if (['approval', 'admin', 'achievement', 'reminder', 'event', 'invite'].includes(n.type)) toast(n.title, 'info', n.body);
  });

  // Expire typing indicators.
  setInterval(() => {
    const now = Date.now();
    const t = st.getState().typing;
    let changed = false;
    const next: typeof t = {};
    for (const [k, v] of Object.entries(t)) {
      const live = Object.fromEntries(Object.entries(v).filter(([, exp]) => exp > now));
      if (Object.keys(live).length !== Object.keys(v).length) changed = true;
      next[k] = live;
    }
    if (changed) st.setState({ typing: next });
  }, 1500);

  // Idle detection (5 minutes without input).
  let idleTimer: ReturnType<typeof setTimeout>;
  let idle = false;
  const activity = () => {
    if (idle) {
      idle = false;
      s.emit('presence:idle', false);
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idle = true;
      s.emit('presence:idle', true);
    }, 5 * 60_000);
  };
  for (const ev of ['mousemove', 'keydown', 'touchstart']) window.addEventListener(ev, activity, { passive: true });
  activity();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
