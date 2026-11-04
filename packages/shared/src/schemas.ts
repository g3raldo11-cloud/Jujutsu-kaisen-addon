import { z } from 'zod';
import { CHANNEL_TYPES, PRESENCE_MODES, REPORT_TARGETS, SOUND_EVENTS } from './enums';
import { ALL_PERMISSIONS, type Permission } from './permissions';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'O nome de usuário precisa ter pelo menos 3 caracteres')
  .max(32, 'O nome de usuário pode ter no máximo 32 caracteres')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Use apenas letras, números, ponto e sublinhado');

export const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido').max(254);

export const passwordSchema = z
  .string()
  .min(10, 'A senha precisa ter pelo menos 10 caracteres')
  .max(128, 'A senha pode ter no máximo 128 caracteres')
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9\W_]/.test(p), 'Use letras e pelo menos um número ou símbolo');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  introduction: z.string().trim().max(1000).optional().default(''),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar as regras da comunidade' }) }),
});

export const loginSchema = z.object({
  login: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
});

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });

const permissionSchema = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);
export const permissionListSchema = z.array(permissionSchema).max(64);

export const roleSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#8b93a7'),
  permissions: permissionListSchema.default([]),
  hoist: z.boolean().default(false),
});

export const spaceSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional().default(''),
  iconFileId: z.string().uuid().nullable().optional(),
});

export const categorySchema = z.object({
  spaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});

export const channelOverwriteSchema = z.object({
  targetType: z.enum(['role', 'user']),
  targetId: z.string().uuid(),
  allow: permissionListSchema.default([]),
  deny: permissionListSchema.default([]),
});

export const channelSchema = z.object({
  spaceId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(CHANNEL_TYPES),
  name: z
    .string()
    .trim()
    .min(1)
    .max(60),
  topic: z.string().trim().max(500).optional().default(''),
  isPrivate: z.boolean().default(false),
  memberIds: z.array(z.string().uuid()).max(500).optional().default([]),
  slowmodeSeconds: z.number().int().min(0).max(21600).default(0),
  isTemporary: z.boolean().default(false),
  password: z.string().min(4).max(64).optional(),
  userLimit: z.number().int().min(0).max(99).default(0),
  overwrites: z.array(channelOverwriteSchema).max(50).optional(),
});

export const channelUpdateSchema = channelSchema.partial().omit({ spaceId: true, type: true }).extend({
  password: z.string().min(4).max(64).nullable().optional(),
});

export const messageSchema = z.object({
  content: z.string().max(4000).default(''),
  replyToId: z.string().regex(/^\d+$/).nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  stickerId: z.string().uuid().nullable().optional(),
  gifUrl: z.string().url().max(500).nullable().optional(),
  isVoiceMessage: z.boolean().optional().default(false),
  nonce: z.string().max(64).optional(),
  scheduledFor: z.string().datetime().optional(),
});

export const editMessageSchema = z.object({ content: z.string().min(1).max(4000) });

export const forumPostSchema = z.object({
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(1).max(20000),
  tags: z.array(z.string().trim().min(1).max(24)).max(5).default([]),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
});

export const forumCommentSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  parentId: z.string().uuid().nullable().optional(),
});

export const eventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).default(''),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  channelId: z.string().uuid().nullable().optional(),
  location: z.string().trim().max(200).optional().default(''),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  recurrenceUntil: z.string().datetime().nullable().optional(),
  reminderMinutes: z.array(z.number().int().min(0).max(10080)).max(5).default([15]),
  capacity: z.number().int().min(0).max(10000).default(0),
});

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1).max(64),
  reason: z.enum(['spam', 'harassment', 'hate', 'nsfw', 'violence', 'impersonation', 'other']),
  details: z.string().trim().max(2000).default(''),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(500).optional(),
  profileColor: hexColor.optional(),
  avatarFileId: z.string().uuid().nullable().optional(),
  pronouns: z.string().trim().max(30).optional(),
  customStatus: z.string().trim().max(100).optional(),
});

export const preferencesSchema = z.object({
  theme: z.enum(['dark', 'light', 'custom', 'system']).optional(),
  customTheme: z
    .object({ accent: hexColor, background: hexColor, surface: hexColor, text: hexColor })
    .partial()
    .optional(),
  accentColor: hexColor.optional(),
  locale: z.enum(['pt-BR', 'en']).optional(),
  reducedMotion: z.boolean().optional(),
  compactMode: z.boolean().optional(),
  sounds: z
    .object({
      enabled: z.boolean(),
      volume: z.number().min(0).max(1),
      events: z.record(z.enum(SOUND_EVENTS), z.boolean()),
      presets: z.record(z.enum(SOUND_EVENTS), z.enum(['sino', 'gota', 'pulso', 'acorde', 'grave'])),
    })
    .partial()
    .optional(),
  notifications: z
    .object({
      desktop: z.boolean(),
      mentionsOnly: z.boolean(),
      email: z.boolean(),
    })
    .partial()
    .optional(),
  privacy: z
    .object({
      allowDms: z.enum(['everyone', 'friends', 'none']),
      allowFriendRequests: z.boolean(),
      showActivity: z.boolean(),
      readReceipts: z.boolean(),
    })
    .partial()
    .optional(),
  voice: z
    .object({
      inputDeviceId: z.string().max(200),
      outputDeviceId: z.string().max(200),
      videoDeviceId: z.string().max(200),
      mode: z.enum(['vad', 'ptt']),
      pttKey: z.string().max(30),
      noiseSuppression: z.boolean(),
      echoCancellation: z.boolean(),
      autoGainControl: z.boolean(),
      vadThreshold: z.number().min(0).max(1),
    })
    .partial()
    .optional(),
  presence: z.enum(PRESENCE_MODES).optional(),
});

export const platformSettingsSchema = z.object({
  communityName: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(4000),
  rules: z.string().trim().max(8000),
  registrationOpen: z.boolean(),
  maintenance: z.object({ enabled: z.boolean(), message: z.string().max(500) }),
  uploads: z.object({
    maxFileSizeMb: z.number().int().min(1).max(2048),
    maxAvatarSizeMb: z.number().int().min(1).max(50),
    userQuotaMb: z.number().int().min(10).max(1_000_000),
    allowedCategories: z.array(z.enum(['image', 'video', 'audio', 'document', 'pdf', 'archive'])),
  }),
  appearance: z.object({
    accentColor: hexColor,
    defaultTheme: z.enum(['dark', 'light']),
    logoFileId: z.string().uuid().nullable(),
  }),
  personalization: z.object({
    allowAvatars: z.boolean(),
    allowDisplayNames: z.boolean(),
    allowProfileColors: z.boolean(),
    allowCustomThemes: z.boolean(),
    allowCustomStatus: z.boolean(),
  }),
  notifications: z.object({
    emailOnAccessRequest: z.boolean(),
    emailOnApproval: z.boolean(),
  }),
  moderation: z.object({
    blockedWords: z.array(z.string().max(60)).max(500),
    blockedDomains: z.array(z.string().max(120)).max(1000),
    maxMentionsPerMessage: z.number().int().min(1).max(100),
    spamMessagesPer10s: z.number().int().min(2).max(100),
    autoTimeoutMinutes: z.number().int().min(0).max(10080),
  }),
  retention: z.object({
    messageDays: z.number().int().min(0).max(36500),
    auditLogDays: z.number().int().min(30).max(36500),
    deletedFileDays: z.number().int().min(0).max(3650),
  }),
  security: z.object({ requireOwnerMfa: z.boolean(), sessionDays: z.number().int().min(1).max(365) }),
  gamification: z.object({ enabled: z.boolean(), xpPerMessage: z.number().int().min(0).max(100) }),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  communityName: 'Ouroboros',
  tagline: 'Uma comunidade privada, por convite e aprovação.',
  description:
    'Um espaço reservado para conversas, projetos e encontros. Cada novo membro é aprovado manualmente pela administração.',
  rules: '1. Respeite todos os membros.\n2. Nada de spam ou divulgação não autorizada.\n3. O que é dito aqui, fica aqui.',
  registrationOpen: true,
  maintenance: { enabled: false, message: 'Estamos em manutenção. Voltamos em breve.' },
  uploads: {
    maxFileSizeMb: 50,
    maxAvatarSizeMb: 5,
    userQuotaMb: 2048,
    allowedCategories: ['image', 'video', 'audio', 'document', 'pdf', 'archive'],
  },
  appearance: { accentColor: '#7c6cf2', defaultTheme: 'dark', logoFileId: null },
  personalization: {
    allowAvatars: true,
    allowDisplayNames: true,
    allowProfileColors: true,
    allowCustomThemes: true,
    allowCustomStatus: true,
  },
  notifications: { emailOnAccessRequest: true, emailOnApproval: true },
  moderation: {
    blockedWords: [],
    blockedDomains: ['grabify.link', 'iplogger.org', 'iplogger.com', '2no.co', 'yip.su'],
    maxMentionsPerMessage: 10,
    spamMessagesPer10s: 8,
    autoTimeoutMinutes: 10,
  },
  retention: { messageDays: 0, auditLogDays: 365, deletedFileDays: 30 },
  security: { requireOwnerMfa: false, sessionDays: 30 },
  gamification: { enabled: true, xpPerMessage: 5 },
};

export type Preferences = z.infer<typeof preferencesSchema>;
