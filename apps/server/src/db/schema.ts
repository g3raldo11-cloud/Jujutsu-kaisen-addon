import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const msgId = (name: string) => bigint(name, { mode: 'bigint' });

export const userStatus = pgEnum('user_status', ['pending', 'approved', 'rejected', 'suspended', 'banned']);
export const channelType = pgEnum('channel_type', [
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
  'dm',
  'group_dm',
  'ticket',
]);

// ───────────────────────────── Users & auth ─────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    email: text('email'),
    passwordHash: text('password_hash'),
    status: userStatus('status').notNull().default('pending'),
    isOwner: boolean('is_owner').notNull().default(false),
    isBot: boolean('is_bot').notNull().default(false),
    emailVerifiedAt: ts('email_verified_at'),
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    suspendedUntil: ts('suspended_until'),
    statusReason: text('status_reason'),
    mutedUntil: ts('muted_until'),
    lastLoginAt: ts('last_login_at'),
    lastAccessAttemptAt: ts('last_access_attempt_at'),
    lastSeenAt: ts('last_seen_at'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_lower_idx').on(sql`lower(${t.username})`),
    uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
    uniqueIndex('users_single_owner_idx').on(t.isOwner).where(sql`${t.isOwner} = true`),
    index('users_status_idx').on(t.status),
  ],
);

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  bio: text('bio').notNull().default(''),
  pronouns: text('pronouns').notNull().default(''),
  avatarFileId: uuid('avatar_file_id'),
  profileColor: text('profile_color').notNull().default('#7c6cf2'),
  customStatus: text('custom_status').notNull().default(''),
  presence: text('presence').notNull().default('online'),
  preferences: jsonb('preferences').notNull().default({}),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  messageCount: integer('message_count').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const accessRequests = pgTable(
  'access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    introduction: text('introduction').notNull().default(''),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | blocked
    decidedById: uuid('decided_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('access_requests_user_idx').on(t.userId), index('access_requests_status_idx').on(t.status, t.createdAt)],
);

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#8b93a7'),
  position: integer('position').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  hoist: boolean('hoist').notNull().default(false),
  createdAt: createdAt(),
});

export const permissions = pgTable('permissions', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  description: text('description').notNull(),
  scope: text('scope').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission')
      .notNull()
      .references(() => permissions.key, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('user_roles_role_idx').on(t.roleId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('sessions_token_idx').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // verify_email | reset_password
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('auth_tokens_hash_idx').on(t.tokenHash), index('auth_tokens_user_idx').on(t.userId, t.type)],
);

// ───────────────────────────── Structure ─────────────────────────────

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  iconFileId: uuid('icon_file_id'),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
});

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('categories_space_idx').on(t.spaceId)],
);

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    type: channelType('type').notNull(),
    name: text('name').notNull().default(''),
    topic: text('topic').notNull().default(''),
    position: integer('position').notNull().default(0),
    isPrivate: boolean('is_private').notNull().default(false),
    isTemporary: boolean('is_temporary').notNull().default(false),
    passwordHash: text('password_hash'),
    slowmodeSeconds: integer('slowmode_seconds').notNull().default(0),
    userLimit: integer('user_limit').notNull().default(0),
    settings: jsonb('settings').notNull().default({}),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    lastMessageAt: ts('last_message_at'),
    createdAt: createdAt(),
  },
  (t) => [index('channels_space_idx').on(t.spaceId, t.position), index('channels_type_idx').on(t.type)],
);

export const channelMembers = pgTable(
  'channel_members',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isManager: boolean('is_manager').notNull().default(false),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] }), index('channel_members_user_idx').on(t.userId)],
);

export const channelUserStates = pgTable(
  'channel_user_states',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: msgId('last_read_message_id'),
    lastReadAt: ts('last_read_at'),
    notificationLevel: text('notification_level').notNull().default('default'), // default | all | mentions | none
    mutedUntil: ts('muted_until'),
    unlockedAt: ts('unlocked_at'),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

export const channelOverwrites = pgTable(
  'channel_overwrites',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(), // role | user
    targetId: uuid('target_id').notNull(),
    allow: text('allow').array().notNull().default(sql`'{}'::text[]`),
    deny: text('deny').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.targetType, t.targetId] })],
);

// ───────────────────────────── Messaging ─────────────────────────────

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    rootMessageId: msgId('root_message_id').notNull(),
    title: text('title').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    messageCount: integer('message_count').notNull().default(0),
    lastMessageAt: ts('last_message_at'),
    archivedAt: ts('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('threads_root_idx').on(t.rootMessageId), index('threads_channel_idx').on(t.channelId)],
);

export const messages = pgTable(
  'messages',
  {
    id: msgId('id').primaryKey().generatedAlwaysAsIdentity(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull().default('default'), // default | system | voice | poll | bot
    content: text('content').notNull().default(''),
    replyToId: msgId('reply_to_id'),
    mentionIds: uuid('mention_ids').array().notNull().default(sql`'{}'::uuid[]`),
    mentionsEveryone: boolean('mentions_everyone').notNull().default(false),
    metadata: jsonb('metadata').notNull().default({}),
    editedAt: ts('edited_at'),
    deletedAt: ts('deleted_at'),
    pinnedAt: ts('pinned_at'),
    pinnedById: uuid('pinned_by_id'),
    createdAt: createdAt(),
    search: tsvector('search').generatedAlwaysAs(sql`to_tsvector('simple', coalesce(content, ''))`),
  },
  (t) => [
    index('messages_channel_idx').on(t.channelId, t.id),
    index('messages_thread_idx').on(t.threadId, t.id),
    index('messages_author_idx').on(t.authorId),
    index('messages_search_idx').using('gin', t.search),
    index('messages_pinned_idx').on(t.channelId).where(sql`${t.pinnedAt} is not null`),
  ],
);

export const messageEdits = pgTable(
  'message_edits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: msgId('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    previousContent: text('previous_content').notNull(),
    editedById: uuid('edited_by_id').references(() => users.id, { onDelete: 'set null' }),
    editedAt: createdAt(),
  },
  (t) => [index('message_edits_msg_idx').on(t.messageId)],
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    messageId: msgId('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.fileId] }), index('message_attachments_file_idx').on(t.fileId)],
);

export const reactions = pgTable(
  'reactions',
  {
    messageId: msgId('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

export const scheduledMessages = pgTable(
  'scheduled_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    sendAt: ts('send_at').notNull(),
    sentAt: ts('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [index('scheduled_messages_due_idx').on(t.sendAt).where(sql`${t.sentAt} is null`)],
);

export const polls = pgTable('polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: msgId('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  options: jsonb('options').notNull(), // [{ id, label }]
  multiple: boolean('multiple').notNull().default(false),
  anonymous: boolean('anonymous').notNull().default(false),
  closesAt: ts('closes_at'),
  closedAt: ts('closed_at'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const pollVotes = pgTable(
  'poll_votes',
  {
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    optionId: text('option_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId, t.optionId] })],
);

// ───────────────────────────── Social ─────────────────────────────

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // pending | accepted
    createdAt: createdAt(),
    acceptedAt: ts('accepted_at'),
  },
  (t) => [
    uniqueIndex('friendships_pair_idx').on(sql`least(${t.requesterId}, ${t.addresseeId})`, sql`greatest(${t.requesterId}, ${t.addresseeId})`),
    index('friendships_addressee_idx').on(t.addresseeId),
  ],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

// ───────────────────────────── Calls ─────────────────────────────

export const voiceRooms = pgTable(
  'voice_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('channel'), // channel | dm | temporary | event | stage
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('voice_rooms_channel_idx').on(t.channelId)],
);

export const calls = pgTable(
  'calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => voiceRooms.id, { onDelete: 'cascade' }),
    startedById: uuid('started_by_id').references(() => users.id, { onDelete: 'set null' }),
    startedAt: createdAt(),
    endedAt: ts('ended_at'),
    peakParticipants: integer('peak_participants').notNull().default(1),
  },
  (t) => [index('calls_room_idx').on(t.roomId, t.startedAt)],
);

export const callParticipants = pgTable(
  'call_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    callId: uuid('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: createdAt(),
    leftAt: ts('left_at'),
  },
  (t) => [index('call_participants_call_idx').on(t.callId), index('call_participants_user_idx').on(t.userId)],
);

// ───────────────────────────── Bots ─────────────────────────────

export const bots = pgTable(
  'bots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // builtin key or 'custom'
    description: text('description').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config').notNull().default({}),
    script: text('script'),
    webhookTokenHash: text('webhook_token_hash'),
    storage: jsonb('storage').notNull().default({}),
    lastError: text('last_error'),
    lastRunAt: ts('last_run_at'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('bots_user_idx').on(t.userId), index('bots_kind_idx').on(t.kind)],
);

export const botCommands = pgTable(
  'bot_commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    botId: uuid('bot_id')
      .notNull()
      .references(() => bots.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    usage: text('usage').notNull().default(''),
    response: text('response'), // template for declarative commands
    enabled: boolean('enabled').notNull().default(true),
    builtin: boolean('builtin').notNull().default(false),
  },
  (t) => [uniqueIndex('bot_commands_name_idx').on(t.botId, t.name)],
);

export const botPermissions = pgTable(
  'bot_permissions',
  {
    botId: uuid('bot_id')
      .notNull()
      .references(() => bots.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [primaryKey({ columns: [t.botId, t.channelId] })],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    remindAt: ts('remind_at').notNull(),
    sentAt: ts('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [index('reminders_due_idx').on(t.remindAt).where(sql`${t.sentAt} is null`)],
);

// ───────────────────────────── Forum ─────────────────────────────

export const forumPosts = pgTable(
  'forum_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    attachmentIds: uuid('attachment_ids').array().notNull().default(sql`'{}'::uuid[]`),
    pinnedAt: ts('pinned_at'),
    lockedAt: ts('locked_at'),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    editedAt: ts('edited_at'),
    deletedAt: ts('deleted_at'),
    lastActivityAt: ts('last_activity_at').notNull().defaultNow(),
    createdAt: createdAt(),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(content, '')), 'B')`,
    ),
  },
  (t) => [
    index('forum_posts_channel_idx').on(t.channelId, t.lastActivityAt),
    index('forum_posts_search_idx').using('gin', t.search),
    index('forum_posts_tags_idx').using('gin', t.tags),
  ],
);

export const forumComments = pgTable(
  'forum_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => forumPosts.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    likeCount: integer('like_count').notNull().default(0),
    editedAt: ts('edited_at'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('forum_comments_post_idx').on(t.postId, t.createdAt)],
);

export const forumLikes = pgTable(
  'forum_likes',
  {
    targetType: text('target_type').notNull(), // post | comment
    targetId: uuid('target_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull().default('❤'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.targetType, t.targetId, t.userId, t.emoji] })],
);

export const forumEdits = pgTable(
  'forum_edits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    previousTitle: text('previous_title'),
    previousContent: text('previous_content').notNull(),
    editedById: uuid('edited_by_id').references(() => users.id, { onDelete: 'set null' }),
    editedAt: createdAt(),
  },
  (t) => [index('forum_edits_target_idx').on(t.targetType, t.targetId)],
);

// ───────────────────────────── Moderation ─────────────────────────────

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    details: text('details').notNull().default(''),
    snapshot: jsonb('snapshot').notNull().default({}),
    status: text('status').notNull().default('open'), // open | resolved | dismissed
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: ts('resolved_at'),
    resolutionNote: text('resolution_note'),
    createdAt: createdAt(),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt)],
);

export const warnings = pgTable(
  'warnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    moderatorId: uuid('moderator_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('warnings_user_idx').on(t.userId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    link: text('link'),
    data: jsonb('data').notNull().default({}),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

// ───────────────────────────── Events ─────────────────────────────

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at'),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    location: text('location').notNull().default(''),
    recurrence: text('recurrence').notNull().default('none'),
    recurrenceUntil: ts('recurrence_until'),
    reminderMinutes: integer('reminder_minutes').array().notNull().default(sql`'{15}'::int[]`),
    capacity: integer('capacity').notNull().default(0),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: ts('cancelled_at'),
    createdAt: createdAt(),
  },
  (t) => [index('events_starts_idx').on(t.startsAt)],
);

export const eventParticipants = pgTable(
  'event_participants',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('going'), // going | interested
    remindedFor: text('reminded_for').array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

// ───────────────────────────── Files ─────────────────────────────

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('folders_channel_idx').on(t.channelId, t.parentId)],
);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    category: text('category').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    purpose: text('purpose').notNull().default('attachment'), // attachment | library | avatar | emoji | sticker | branding | music
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    description: text('description').notNull().default(''),
    width: integer('width'),
    height: integer('height'),
    isPublicAsset: boolean('is_public_asset').notNull().default(false),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('files_owner_idx').on(t.ownerId),
    index('files_channel_idx').on(t.channelId, t.folderId),
    index('files_name_idx').on(sql`lower(${t.originalName})`),
  ],
);

export const customEmojis = pgTable(
  'custom_emojis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('emoji'), // emoji | sticker
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('custom_emojis_name_idx').on(t.kind, t.name)],
);

// ───────────────────────────── Platform ─────────────────────────────

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: msgId('id').primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_created_idx').on(t.createdAt),
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
    index('audit_logs_action_idx').on(t.action, t.createdAt),
  ],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const changelogEntries = pgTable('changelog_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  publishedAt: createdAt(),
});

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    content: text('content').notNull().default(''),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('notes_user_idx').on(t.userId, t.updatedAt)],
);

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(), // message | channel | forum_post | file
    targetId: text('target_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const achievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    awardedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const whiteboardStrokes = pgTable(
  'whiteboard_strokes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    data: jsonb('data').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('whiteboard_channel_idx').on(t.channelId, t.createdAt)],
);
