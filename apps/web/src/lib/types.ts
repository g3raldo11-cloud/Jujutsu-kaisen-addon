import type { ChannelType, Permission, PlatformSettings, Preferences } from '@ouroboros/shared';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarFileId: string | null;
  profileColor: string;
  bio: string;
  pronouns: string;
  customStatus: string;
  isBot: boolean;
  isOwner: boolean;
  roleIds: string[];
  level: number;
  xp: number;
  createdAt: string;
  presence?: string;
}

export interface Me {
  user: PublicUser & { email: string; status: string; emailVerified: boolean; totpEnabled: boolean; suspendedUntil: string | null; statusReason: string | null };
  state: 'ok' | 'unverified' | 'pending' | 'rejected' | 'suspended' | 'banned';
  request: { status: string; createdAt: string } | null;
  permissions: Permission[];
  isStaff: boolean;
  preferences: Preferences;
  presence: string;
}

export interface Channel {
  id: string;
  spaceId: string | null;
  categoryId: string | null;
  type: ChannelType;
  name: string;
  topic: string;
  position: number;
  isPrivate: boolean;
  isTemporary: boolean;
  passwordProtected: boolean;
  slowmodeSeconds: number;
  userLimit: number;
  settings: Record<string, any>;
  lastMessageAt: string | null;
  permissions: Permission[];
  unread: number;
  mentions: number;
  lastReadMessageId: string | null;
  unlocked: boolean;
}

export interface Space {
  id: string;
  name: string;
  description: string;
  iconFileId: string | null;
  position: number;
}
export interface Category {
  id: string;
  spaceId: string;
  name: string;
  position: number;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  category: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface Poll {
  id: string;
  question: string;
  options: { id: string; label: string; votes: number; voters: string[] }[];
  myVotes?: string[];
  totalVoters: number;
  multiple: boolean;
  anonymous: boolean;
  closesAt: string | null;
  closed: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  threadId: string | null;
  authorId: string | null;
  type: string;
  content: string;
  deleted: boolean;
  replyTo: { id: string; authorId: string | null; content: string; deleted: boolean } | null;
  mentionIds: string[];
  mentionsEveryone: boolean;
  metadata: Record<string, any>;
  editedAt: string | null;
  pinnedAt: string | null;
  createdAt: string;
  attachments: Attachment[];
  reactions: { emoji: string; count: number; me: boolean; userIds: string[] }[];
  thread: { id: string; title: string; messageCount: number; lastMessageAt: string | null } | null;
  poll: Poll | null;
  pending?: boolean;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  hoist: boolean;
  permissions: Permission[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, any>;
  readAt: string | null;
  createdAt: string;
}

export interface VoiceParticipant {
  socketId: string;
  userId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  serverMuted: boolean;
  allowed: { speak: boolean; video: boolean; screen: boolean };
  joinedAt: number;
}

export interface BotInfo {
  id: string;
  userId: string;
  kind: string;
  username: string;
  displayName: string;
  avatarFileId: string | null;
  profileColor: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
  commands: { id: string; name: string; description: string; usage: string; enabled: boolean; response?: string | null; builtin: boolean }[];
  channelIds: string[];
  channelMode?: string;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group_dm';
  name: string;
  lastMessageAt: string | null;
  createdAt: string;
  ownerId: string | null;
  memberIds: string[];
}

export type PublicSettings = Pick<PlatformSettings, 'communityName' | 'tagline' | 'description' | 'rules' | 'registrationOpen' | 'maintenance' | 'appearance' | 'personalization' | 'gamification'> & {
  uploads: { maxFileSizeMb: number; maxAvatarSizeMb: number; allowedCategories: string[] };
};
