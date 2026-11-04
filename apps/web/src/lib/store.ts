import { create } from 'zustand';
import type { BotInfo, Category, Channel, Conversation, Me, Message, PublicSettings, PublicUser, Role, Space, VoiceParticipant } from './types';
import { get } from './api';

export const timelineKey = (channelId: string, threadId?: string | null) => (threadId ? `${channelId}:${threadId}` : channelId);

interface Timeline {
  items: Message[];
  hasMore: boolean;
  loaded: boolean;
}

interface State {
  me: Me | null;
  community: PublicSettings | null;
  spaces: Space[];
  categories: Category[];
  channels: Record<string, Channel>;
  users: Record<string, PublicUser>;
  presence: Record<string, string>;
  roles: Role[];
  bots: BotInfo[];
  conversations: Conversation[];
  timelines: Record<string, Timeline>;
  typing: Record<string, Record<string, number>>;
  voice: Record<string, VoiceParticipant[]>;
  unreadNotifications: number;
  emojis: { id: string; name: string; fileId: string; kind: string }[];
  connected: boolean;

  setMe(me: Me | null): void;
  setCommunity(c: PublicSettings): void;
  loadStructure(): Promise<void>;
  loadMembers(): Promise<void>;
  loadRoles(): Promise<void>;
  loadBots(): Promise<void>;
  loadConversations(): Promise<void>;
  loadEmojis(): Promise<void>;
  upsertUsers(list: PublicUser[]): void;
  setTimeline(key: string, t: Partial<Timeline>): void;
  prependMessages(key: string, list: Message[], hasMore: boolean): void;
  addMessage(m: Message): void;
  updateMessage(m: Message): void;
  removeMessage(id: string, channelId: string, threadId: string | null): void;
  patchReaction(channelId: string, messageId: string, emoji: string, userId: string, add: boolean): void;
  setChannelUnread(channelId: string, unread: number, mentions?: number): void;
}

function mapMessages(key: string, timelines: Record<string, Timeline>, fn: (items: Message[]) => Message[]) {
  const t = timelines[key];
  if (!t) return timelines;
  return { ...timelines, [key]: { ...t, items: fn(t.items) } };
}

export const useStore = create<State>((set, getState) => ({
  me: null,
  community: null,
  spaces: [],
  categories: [],
  channels: {},
  users: {},
  presence: {},
  roles: [],
  bots: [],
  conversations: [],
  timelines: {},
  typing: {},
  voice: {},
  unreadNotifications: 0,
  emojis: [],
  connected: false,

  setMe: (me) => set({ me }),
  setCommunity: (community) => set({ community }),

  async loadStructure() {
    const s = await get<{ spaces: Space[]; categories: Category[]; channels: Channel[] }>('/structure');
    set({ spaces: s.spaces, categories: s.categories, channels: Object.fromEntries(s.channels.map((c) => [c.id, c])) });
  },
  async loadMembers() {
    const list = await get<PublicUser[]>('/members');
    set((st) => ({
      users: { ...st.users, ...Object.fromEntries(list.map((u) => [u.id, u])) },
      presence: Object.fromEntries(list.map((u) => [u.id, u.presence ?? 'offline'])),
    }));
  },
  async loadRoles() {
    set({ roles: await get<Role[]>('/roles') });
  },
  async loadBots() {
    set({ bots: await get<BotInfo[]>('/bots') });
  },
  async loadConversations() {
    const r = await get<{ conversations: Conversation[]; users: PublicUser[] }>('/conversations');
    getState().upsertUsers(r.users);
    set({ conversations: r.conversations });
  },
  async loadEmojis() {
    set({ emojis: await get('/emojis') });
  },
  upsertUsers(list) {
    if (!list.length) return;
    set((st) => ({ users: { ...st.users, ...Object.fromEntries(list.map((u) => [u.id, { ...st.users[u.id], ...u }])) } }));
  },
  setTimeline(key, t) {
    set((st) => ({ timelines: { ...st.timelines, [key]: { items: [], hasMore: true, loaded: false, ...st.timelines[key], ...t } } }));
  },
  prependMessages(key, list, hasMore) {
    set((st) => {
      const cur = st.timelines[key]?.items ?? [];
      const ids = new Set(cur.map((m) => m.id));
      return { timelines: { ...st.timelines, [key]: { items: [...list.filter((m) => !ids.has(m.id)), ...cur], hasMore, loaded: true } } };
    });
  },
  addMessage(m) {
    const key = timelineKey(m.channelId, m.threadId);
    set((st) => {
      const t = st.timelines[key];
      if (!t) return {};
      // Replace an optimistic copy (same nonce) or append.
      const nonce = m.metadata?.nonce;
      const items = t.items.filter((x) => x.id !== m.id && !(nonce && x.pending && x.metadata?.nonce === nonce));
      return { timelines: { ...st.timelines, [key]: { ...t, items: [...items, m] } } };
    });
    if (m.threadId) {
      // Bump the root message's reply counter in the main timeline.
      set((st) => ({
        timelines: mapMessages(m.channelId, st.timelines, (items) =>
          items.map((x) => (x.thread?.id === m.threadId ? { ...x, thread: { ...x.thread!, messageCount: x.thread!.messageCount + 1, lastMessageAt: m.createdAt } } : x)),
        ),
      }));
    }
  },
  updateMessage(m) {
    const key = timelineKey(m.channelId, m.threadId);
    set((st) => ({
      timelines: mapMessages(key, st.timelines, (items) => items.map((x) => (x.id === m.id ? { ...m, poll: m.poll ? { ...m.poll, myVotes: m.poll.myVotes ?? x.poll?.myVotes } : null } : x))),
    }));
  },
  removeMessage(id, channelId, threadId) {
    const key = timelineKey(channelId, threadId);
    set((st) => ({
      timelines: mapMessages(key, st.timelines, (items) => items.map((x) => (x.id === id ? { ...x, deleted: true, content: '', attachments: [], reactions: [] } : x))),
    }));
  },
  patchReaction(channelId, messageId, emoji, userId, add) {
    const meId = getState().me?.user.id;
    const apply = (items: Message[]) =>
      items.map((m) => {
        if (m.id !== messageId) return m;
        const list = [...m.reactions];
        const i = list.findIndex((r) => r.emoji === emoji);
        if (add) {
          if (i >= 0) {
            if (list[i].userIds.includes(userId)) return m;
            list[i] = { ...list[i], count: list[i].count + 1, me: list[i].me || userId === meId, userIds: [...list[i].userIds, userId] };
          } else list.push({ emoji, count: 1, me: userId === meId, userIds: [userId] });
        } else if (i >= 0) {
          if (!list[i].userIds.includes(userId) && !(userId === meId && list[i].me)) return m;
          const count = list[i].count - 1;
          if (count <= 0) list.splice(i, 1);
          else list[i] = { ...list[i], count, me: userId === meId ? false : list[i].me, userIds: list[i].userIds.filter((u) => u !== userId) };
        }
        return { ...m, reactions: list };
      });
    set((st) => {
      const next = { ...st.timelines };
      for (const key of Object.keys(next)) if (key.startsWith(channelId)) next[key] = { ...next[key], items: apply(next[key].items) };
      return { timelines: next };
    });
  },
  setChannelUnread(channelId, unread, mentions) {
    set((st) => {
      const c = st.channels[channelId];
      if (!c) return {};
      return { channels: { ...st.channels, [channelId]: { ...c, unread, mentions: mentions ?? c.mentions } } };
    });
  },
}));

export const can = (perm: string) => !!useStore.getState().me?.permissions.includes(perm as never);
export const useCan = (perm: string) => useStore((s) => !!s.me?.permissions.includes(perm as never));
