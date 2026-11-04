export const USER_STATUSES = ['pending', 'approved', 'rejected', 'suspended', 'banned'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  suspended: 'Suspenso',
  banned: 'Banido',
};

export const CHANNEL_TYPES = [
  'text',
  'voice',
  'video',
  'forum',
  'announcement',
  'files',
  'gallery',
  'events',
  'support',
  'admin',
  'stage',
] as const;
export type CommunityChannelType = (typeof CHANNEL_TYPES)[number];
export type ChannelType = CommunityChannelType | 'dm' | 'group_dm' | 'ticket';

export const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  text: 'Texto',
  voice: 'Voz',
  video: 'Vídeo',
  forum: 'Fórum',
  announcement: 'Anúncios',
  files: 'Arquivos',
  gallery: 'Galeria',
  events: 'Eventos',
  support: 'Suporte',
  admin: 'Área administrativa',
  stage: 'Transmissão',
  dm: 'Mensagem direta',
  group_dm: 'Grupo privado',
  ticket: 'Ticket',
};

/** Channel types whose main content is a message timeline. */
export const MESSAGE_CHANNEL_TYPES: ChannelType[] = ['text', 'announcement', 'support', 'admin', 'dm', 'group_dm', 'ticket', 'voice', 'video', 'stage'];
/** Channel types that host a real-time call. */
export const CALL_CHANNEL_TYPES: ChannelType[] = ['voice', 'video', 'stage', 'dm', 'group_dm'];

export const PRESENCE_MODES = ['online', 'idle', 'dnd', 'invisible'] as const;
export type PresenceMode = (typeof PRESENCE_MODES)[number];

export const NOTIFICATION_TYPES = [
  'message',
  'mention',
  'invite',
  'friend_request',
  'approval',
  'access_request',
  'event',
  'update',
  'admin',
  'call',
  'report',
  'reminder',
  'achievement',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SOUND_EVENTS = ['message', 'mention', 'member_join', 'member_leave', 'friend_request', 'call_invite', 'admin'] as const;
export type SoundEvent = (typeof SOUND_EVENTS)[number];

export const SOUND_EVENT_LABELS: Record<SoundEvent, string> = {
  message: 'Nova mensagem',
  mention: 'Menção',
  member_join: 'Entrada de membro',
  member_leave: 'Saída de membro',
  friend_request: 'Solicitação de amizade',
  call_invite: 'Convite para chamada',
  admin: 'Notificação administrativa',
};

export const REPORT_TARGETS = ['message', 'user', 'forum_post', 'forum_comment'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const FILE_CATEGORIES = ['image', 'video', 'audio', 'document', 'pdf', 'archive', 'other'] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const BUILTIN_BOTS = ['welcome', 'moderation', 'notifications', 'music', 'polls', 'stats', 'games', 'ai', 'tickets', 'reminders'] as const;
export type BuiltinBotKey = (typeof BUILTIN_BOTS)[number];
