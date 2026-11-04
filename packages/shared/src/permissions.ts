/**
 * Permission keys. Roles grant a set of these; channels may override them
 * per role or per member. The owner implicitly holds every permission.
 */
export const PERMISSIONS = {
  // Channel-scoped
  VIEW_CHANNEL: 'view_channel',
  SEND_MESSAGES: 'send_messages',
  REPLY_MESSAGES: 'reply_messages',
  ATTACH_FILES: 'attach_files',
  ADD_REACTIONS: 'add_reactions',
  CREATE_POSTS: 'create_posts',
  CONNECT_VOICE: 'connect_voice',
  SPEAK: 'speak',
  VIDEO: 'video',
  SCREEN_SHARE: 'screen_share',
  MANAGE_MESSAGES: 'manage_messages',
  MENTION_EVERYONE: 'mention_everyone',
  MUTE_MEMBERS: 'mute_members',
  // Global
  MANAGE_CHANNELS: 'manage_channels',
  MANAGE_ROLES: 'manage_roles',
  MANAGE_MEMBERS: 'manage_members',
  BAN_MEMBERS: 'ban_members',
  MODERATE_MEMBERS: 'moderate_members',
  VIEW_AUDIT_LOG: 'view_audit_log',
  VIEW_REPORTS: 'view_reports',
  MANAGE_BOTS: 'manage_bots',
  MANAGE_EVENTS: 'manage_events',
  MANAGE_FILES: 'manage_files',
  MANAGE_EMOJIS: 'manage_emojis',
  MANAGE_SETTINGS: 'manage_settings',
  ADMINISTRATOR: 'administrator',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Permissions that can be overridden per channel. */
export const CHANNEL_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.REPLY_MESSAGES,
  PERMISSIONS.ATTACH_FILES,
  PERMISSIONS.ADD_REACTIONS,
  PERMISSIONS.CREATE_POSTS,
  PERMISSIONS.CONNECT_VOICE,
  PERMISSIONS.SPEAK,
  PERMISSIONS.VIDEO,
  PERMISSIONS.SCREEN_SHARE,
  PERMISSIONS.MANAGE_MESSAGES,
  PERMISSIONS.MENTION_EVERYONE,
  PERMISSIONS.MUTE_MEMBERS,
];

/** Permissions that only the owner may grant to a role. */
export const OWNER_ONLY_GRANTS: Permission[] = [PERMISSIONS.ADMINISTRATOR, PERMISSIONS.MANAGE_ROLES, PERMISSIONS.MANAGE_SETTINGS];

/** Default permissions for the base "Membro" role. */
export const DEFAULT_MEMBER_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.REPLY_MESSAGES,
  PERMISSIONS.ATTACH_FILES,
  PERMISSIONS.ADD_REACTIONS,
  PERMISSIONS.CREATE_POSTS,
  PERMISSIONS.CONNECT_VOICE,
  PERMISSIONS.SPEAK,
  PERMISSIONS.VIDEO,
  PERMISSIONS.SCREEN_SHARE,
];

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string; scope: 'channel' | 'global' }> = {
  view_channel: { label: 'Visualizar', description: 'Ver o canal e seu histórico', scope: 'channel' },
  send_messages: { label: 'Enviar mensagens', description: 'Enviar mensagens no canal', scope: 'channel' },
  reply_messages: { label: 'Responder', description: 'Responder mensagens e participar de threads', scope: 'channel' },
  attach_files: { label: 'Anexar arquivos', description: 'Enviar imagens, vídeos e arquivos', scope: 'channel' },
  add_reactions: { label: 'Reagir', description: 'Adicionar reações às mensagens', scope: 'channel' },
  create_posts: { label: 'Criar publicações', description: 'Criar tópicos em fóruns e itens em galerias', scope: 'channel' },
  connect_voice: { label: 'Participar de chamadas', description: 'Entrar em salas de voz e vídeo', scope: 'channel' },
  speak: { label: 'Falar', description: 'Transmitir áudio em chamadas', scope: 'channel' },
  video: { label: 'Câmera', description: 'Transmitir vídeo da câmera', scope: 'channel' },
  screen_share: { label: 'Compartilhar tela', description: 'Compartilhar tela, janela ou aba', scope: 'channel' },
  manage_messages: { label: 'Gerenciar mensagens', description: 'Fixar, editar ou excluir mensagens de outros', scope: 'channel' },
  mention_everyone: { label: 'Mencionar todos', description: 'Usar @todos para notificar o canal inteiro', scope: 'channel' },
  mute_members: { label: 'Silenciar participantes', description: 'Silenciar outras pessoas em chamadas', scope: 'channel' },
  manage_channels: { label: 'Gerenciar canais', description: 'Criar, editar e excluir espaços, categorias e canais', scope: 'global' },
  manage_roles: { label: 'Gerenciar cargos', description: 'Criar cargos e alterar permissões', scope: 'global' },
  manage_members: { label: 'Gerenciar membros', description: 'Aprovar e rejeitar solicitações de acesso', scope: 'global' },
  ban_members: { label: 'Banir membros', description: 'Suspender, banir, restaurar e remover membros', scope: 'global' },
  moderate_members: { label: 'Moderar membros', description: 'Advertir e silenciar temporariamente', scope: 'global' },
  view_audit_log: { label: 'Ver auditoria', description: 'Consultar logs administrativos', scope: 'global' },
  view_reports: { label: 'Ver denúncias', description: 'Visualizar e resolver denúncias', scope: 'global' },
  manage_bots: { label: 'Gerenciar bots', description: 'Adicionar, configurar e remover bots', scope: 'global' },
  manage_events: { label: 'Gerenciar eventos', description: 'Criar e editar eventos da comunidade', scope: 'global' },
  manage_files: { label: 'Gerenciar arquivos', description: 'Excluir arquivos de outros membros', scope: 'global' },
  manage_emojis: { label: 'Gerenciar emojis', description: 'Adicionar emojis e stickers personalizados', scope: 'global' },
  manage_settings: { label: 'Configurações', description: 'Alterar configurações da plataforma', scope: 'global' },
  administrator: { label: 'Administrador', description: 'Todas as permissões (exceto funções do proprietário)', scope: 'global' },
};
