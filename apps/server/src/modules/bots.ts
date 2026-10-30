import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { audit } from '../lib/audit';
import { randomToken, safeEqual, sha256 } from '../lib/crypto';
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import { body, defined, hasKeys, uuidParam } from '../lib/http';
import { botCommands, botPermissions, bots, files, userProfiles, users } from '../db/schema';
import { botAuthorizedChannels, botSay, invalidateBots, loadBots } from '../bots/runtime';
import { normalizeActions, runBotScript, SANDBOX_LIMITS } from '../bots/sandbox';
import { getMusic } from '../bots/music';
import { requireChannel } from './structure';

const BOT_PERMISSION_KEYS = [PERMISSIONS.MANAGE_MESSAGES, PERMISSIONS.MENTION_EVERYONE, 'admin_channels', 'create_tickets'] as const;

const configSchema = z
  .object({
    channelMode: z.enum(['all', 'selected']).optional(),
    permissions: z.array(z.enum(BOT_PERMISSION_KEYS)).max(10).optional(),
    autoMessages: z
      .array(z.object({ channelId: z.string().uuid(), content: z.string().min(1).max(2000), everyMinutes: z.number().int().min(5).max(10080) }))
      .max(10)
      .optional(),
    listenMessages: z.boolean().optional(),
    joinChannelId: z.string().uuid().nullable().optional(),
    vars: z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
    // Built-in specific
    channelId: z.string().uuid().nullable().optional(),
    message: z.string().max(2000).optional(),
    dm: z.boolean().optional(),
    eventCreated: z.boolean().optional(),
    eventStarting: z.boolean().optional(),
    deleteSpam: z.boolean().optional(),
    timeoutOnSpam: z.boolean().optional(),
    model: z.string().max(80).optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
    systemPrompt: z.string().max(4000).optional(),
    dailyLimitPerUser: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

const commandSchema = z.object({
  name: z.string().regex(/^[a-z0-9_-]{1,32}$/, 'Use letras minúsculas, números, _ e -'),
  description: z.string().max(200).default(''),
  usage: z.string().max(200).default(''),
  response: z.string().max(2000).nullable().optional(),
  enabled: z.boolean().default(true),
});

const RESERVED = new Set(['ajuda', 'help']);

export async function botRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;
  const manage = { preHandler: g.perm(P.MANAGE_BOTS) };

  async function serialize(withSecrets: boolean) {
    const list = await loadBots(ctx, true);
    const cmds = await ctx.db.select().from(botCommands);
    const perms = await ctx.db.select().from(botPermissions);
    const profiles = await ctx.db.select().from(userProfiles);
    return list.map((b) => ({
      id: b.id,
      userId: b.userId,
      kind: b.kind,
      username: b.username,
      displayName: b.displayName,
      avatarFileId: profiles.find((p) => p.userId === b.userId)?.avatarFileId ?? null,
      profileColor: profiles.find((p) => p.userId === b.userId)?.profileColor ?? '#7c6cf2',
      description: b.description,
      enabled: b.enabled,
      builtin: b.kind !== 'custom',
      commands: cmds.filter((c) => c.botId === b.id),
      channelIds: perms.filter((p) => p.botId === b.id).map((p) => p.channelId),
      ...(withSecrets
        ? { config: b.config, script: b.script, lastError: b.lastError, lastRunAt: b.lastRunAt, hasWebhook: !!b.webhookTokenHash, storageBytes: JSON.stringify(b.storage ?? {}).length }
        : { channelMode: (b.config as { channelMode?: string })?.channelMode ?? 'all' }),
    }));
  }

  app.get('/api/bots', { preHandler: g.approved }, async () => (await serialize(false)).filter((b) => b.enabled));
  app.get('/api/admin/bots', manage, async () => ({ bots: await serialize(true), limits: SANDBOX_LIMITS }));

  app.post('/api/admin/bots', manage, async (req) => {
    const input = body(
      req,
      z.object({
        username: z.string().regex(/^[a-zA-Z0-9_.]{3,32}$/),
        displayName: z.string().trim().min(1).max(40),
        description: z.string().max(500).default(''),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7c6cf2'),
      }),
    );
    const [taken] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${input.username.toLowerCase()}`);
    if (taken) throw badRequest('Nome de usuário já em uso');
    const bot = await ctx.db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({ username: input.username, isBot: true, status: 'approved', emailVerifiedAt: new Date() }).returning();
      await tx.insert(userProfiles).values({ userId: u.id, displayName: input.displayName, bio: input.description, profileColor: input.color });
      const [b] = await tx
        .insert(bots)
        .values({ userId: u.id, kind: 'custom', description: input.description, config: { channelMode: 'selected', permissions: [] }, createdById: req.authz!.id })
        .returning();
      return b;
    });
    invalidateBots();
    await audit(ctx, { actorId: req.authz!.id, action: 'bot.create', targetType: 'bot', targetId: bot.id, ip: req.ip, metadata: { username: input.username } });
    ctx.realtime.toMembers('bots:updated', {});
    return bot;
  });

  app.patch('/api/admin/bots/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(
      req,
      z.object({
        enabled: z.boolean().optional(),
        description: z.string().max(500).optional(),
        displayName: z.string().trim().min(1).max(40).optional(),
        avatarFileId: z.string().uuid().nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        config: configSchema.optional(),
        script: z.string().max(20000).nullable().optional(),
        channelIds: z.array(z.string().uuid()).max(500).optional(),
      }),
    );
    const [b] = await ctx.db.select().from(bots).where(eq(bots.id, id));
    if (!b) throw notFound();
    if (input.script !== undefined && b.kind !== 'custom') throw badRequest('Bots nativos não aceitam script');
    const actor = (await ctx.perms.getUser(req.authz!.id))!;
    // Only the owner may give a bot elevated powers.
    if (input.config?.permissions?.length && !actor.isOwner) {
      const current = ((b.config as { permissions?: string[] }).permissions ?? []);
      if (input.config.permissions.some((p) => !current.includes(p))) throw forbidden('Apenas o proprietário pode conceder permissões elevadas a bots');
    }
    if (input.avatarFileId) {
      const [f] = await ctx.db.select().from(files).where(eq(files.id, input.avatarFileId));
      if (!f || f.category !== 'image' || f.purpose !== 'avatar') throw badRequest('Avatar inválido');
    }
    const botPatch = defined({
      enabled: input.enabled,
      description: input.description,
      config: input.config ? { ...(b.config as object), ...input.config } : undefined,
      script: input.script,
      lastError: input.script !== undefined ? null : undefined,
    });
    if (hasKeys(botPatch)) await ctx.db.update(bots).set(botPatch).where(eq(bots.id, id));
    const profilePatch = defined({ displayName: input.displayName, avatarFileId: input.avatarFileId, profileColor: input.color, bio: input.description });
    if (hasKeys(profilePatch)) await ctx.db.update(userProfiles).set(profilePatch).where(eq(userProfiles.userId, b.userId));
    if (input.channelIds) {
      await ctx.db.delete(botPermissions).where(eq(botPermissions.botId, id));
      if (input.channelIds.length) await ctx.db.insert(botPermissions).values(input.channelIds.map((channelId) => ({ botId: id, channelId })));
    }
    invalidateBots();
    await audit(ctx, { actorId: req.authz!.id, action: 'bot.update', targetType: 'bot', targetId: id, ip: req.ip, metadata: { ...input, script: input.script === undefined ? undefined : `${input.script?.length ?? 0} chars` } });
    ctx.realtime.toMembers('bots:updated', {});
    ctx.realtime.toMembers('member:updated', { id: b.userId });
    return { ok: true };
  });

  app.delete('/api/admin/bots/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const [b] = await ctx.db.select().from(bots).where(eq(bots.id, id));
    if (!b) throw notFound();
    if (b.kind !== 'custom') throw badRequest('Bots nativos podem ser desativados, mas não removidos');
    await ctx.db.delete(users).where(eq(users.id, b.userId));
    invalidateBots();
    await audit(ctx, { actorId: req.authz!.id, action: 'bot.delete', targetType: 'bot', targetId: id, ip: req.ip });
    ctx.realtime.toMembers('bots:updated', {});
    return { ok: true };
  });

  // ── Commands ──
  app.post('/api/admin/bots/:id/commands', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(req, commandSchema);
    const [b] = await ctx.db.select().from(bots).where(eq(bots.id, id));
    if (!b) throw notFound();
    if (b.kind !== 'custom') throw badRequest('Comandos de bots nativos são fixos');
    if (RESERVED.has(input.name)) throw badRequest('Nome de comando reservado');
    const clash = await ctx.db.select().from(botCommands).where(and(eq(botCommands.name, input.name), eq(botCommands.enabled, true)));
    if (clash.some((c) => c.botId !== id)) throw badRequest('Outro bot já usa este comando');
    const [c] = await ctx.db.insert(botCommands).values({ botId: id, ...input, response: input.response ?? null }).onConflictDoNothing().returning();
    if (!c) throw badRequest('Este bot já tem esse comando');
    invalidateBots();
    await audit(ctx, { actorId: req.authz!.id, action: 'bot.command_create', targetType: 'bot', targetId: id, ip: req.ip, metadata: { name: input.name } });
    return c;
  });

  app.patch('/api/admin/bots/:id/commands/:cmdId', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const cmdId = uuidParam(req, 'cmdId');
    const input = body(req, commandSchema.partial());
    const [c] = await ctx.db.select().from(botCommands).where(and(eq(botCommands.id, cmdId), eq(botCommands.botId, id)));
    if (!c) throw notFound();
    if (c.builtin && Object.keys(input).some((k) => k !== 'enabled')) throw badRequest('Comandos nativos só podem ser ativados ou desativados');
    const [u] = await ctx.db.update(botCommands).set(input).where(eq(botCommands.id, cmdId)).returning();
    invalidateBots();
    return u;
  });

  app.delete('/api/admin/bots/:id/commands/:cmdId', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const cmdId = uuidParam(req, 'cmdId');
    const [c] = await ctx.db.select().from(botCommands).where(and(eq(botCommands.id, cmdId), eq(botCommands.botId, id)));
    if (!c) throw notFound();
    if (c.builtin) throw badRequest('Comandos nativos não podem ser removidos');
    await ctx.db.delete(botCommands).where(eq(botCommands.id, cmdId));
    invalidateBots();
    return { ok: true };
  });

  /** Dry-run a script in the sandbox (no messages are sent, storage is not saved). */
  app.post('/api/admin/bots/:id/test', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(req, z.object({ script: z.string().max(20000).optional(), handler: z.enum(['onCommand', 'onMessage', 'onMemberJoin']).default('onCommand'), input: z.record(z.unknown()).default({}) }));
    const [b] = await ctx.db.select().from(bots).where(eq(bots.id, id));
    if (!b || b.kind !== 'custom') throw notFound();
    const script = input.script ?? b.script ?? '';
    const r = await runBotScript(script, input.handler, input.input, (b.storage as Record<string, unknown>) ?? {});
    return { ...r, actions: r.ok ? normalizeActions(r.result) : [] };
  });

  // ── Incoming webhooks ──
  app.post('/api/admin/bots/:id/webhook', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const { channelId } = body(req, z.object({ channelId: z.string().uuid() }));
    const [b] = await ctx.db.select().from(bots).where(eq(bots.id, id));
    if (!b) throw notFound();
    const token = randomToken(32);
    await ctx.db.update(bots).set({ webhookTokenHash: sha256(token), config: { ...(b.config as object), webhookChannelId: channelId } }).where(eq(bots.id, id));
    invalidateBots();
    await audit(ctx, { actorId: req.authz!.id, action: 'bot.webhook_rotate', targetType: 'bot', targetId: id, ip: req.ip, metadata: { channelId } });
    return { url: `${ctx.config.APP_URL.replace(/\/$/, '')}/api/hooks/bots/${id}/${token}`, note: 'Guarde esta URL: ela não será exibida novamente.' };
  });

  app.delete('/api/admin/bots/:id/webhook', manage, async (req) => {
    const id = uuidParam(req, 'id');
    await ctx.db.update(bots).set({ webhookTokenHash: null }).where(eq(bots.id, id));
    invalidateBots();
    return { ok: true };
  });

  app.post('/api/hooks/bots/:id/:token', { config: { rateLimit: { max: 30, timeWindow: 60_000 } } }, async (req) => {
    const id = uuidParam(req, 'id');
    const token = (req.params as { token: string }).token;
    const { content } = body(req, z.object({ content: z.string().trim().min(1).max(4000) }));
    const bot = (await loadBots(ctx, true)).find((b) => b.id === id);
    if (!bot || !bot.webhookTokenHash || !safeEqual(sha256(token), bot.webhookTokenHash) || !bot.enabled) throw unauthorized('Webhook inválido');
    const channelId = (bot.config as { webhookChannelId?: string }).webhookChannelId;
    if (!channelId) throw badRequest('Webhook sem canal');
    const msg = await botSay(ctx, bot, channelId, content, { metadata: { webhook: true } });
    if (!msg) throw forbidden('O bot não está autorizado neste canal');
    return { ok: true, id: msg.id };
  });

  // ── Music state for clients joining a room ──
  app.get('/api/channels/:id/music', { preHandler: g.approved }, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    return { ...(await getMusic(ctx, channelId)), serverTime: Date.now() };
  });

  void botAuthorizedChannels;
}
