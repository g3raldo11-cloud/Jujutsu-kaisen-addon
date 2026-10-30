import { eq, sql } from 'drizzle-orm';
import { BUILTIN_BOTS, PERMISSIONS } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import { botCommands, bots, channels, userProfiles, users } from '../db/schema';
import type { HydratedMessage } from '../modules/messages';
import { runBotScript, normalizeActions } from './sandbox';
import { BUILTIN_DEFS, builtinHandler, onEventCreated, onMemberApproved, postModerate, preModerate, type CommandContext } from './builtin';
import { botCanUse, botReact, botSay, cfg, commandsOf, invalidateBots, loadBots, parseArgs, renderTemplate, saveBotStorage, setBotError, type BotRow } from './runtime';
import { advance, getMusic } from './music';

/** Creates the built-in bots (and their bot user accounts) if missing. Idempotent. */
export async function ensureBuiltinBots(ctx: AppContext) {
  const existing = await ctx.db.select({ kind: bots.kind, id: bots.id }).from(bots);
  for (const key of BUILTIN_BOTS) {
    const def = BUILTIN_DEFS[key];
    let bot = existing.find((b) => b.kind === key);
    if (!bot) {
      let username = def.username;
      for (let i = 2; ; i++) {
        const [taken] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${username}`);
        if (!taken) break;
        username = `${def.username}${i}`;
      }
      const [u] = await ctx.db.insert(users).values({ username, isBot: true, status: 'approved', emailVerifiedAt: new Date() }).returning();
      await ctx.db.insert(userProfiles).values({ userId: u.id, displayName: def.displayName, profileColor: def.color, bio: def.description });
      [bot] = await ctx.db.insert(bots).values({ userId: u.id, kind: key, description: def.description, config: def.config, enabled: true }).returning({ kind: bots.kind, id: bots.id });
    }
    for (const c of def.commands) {
      await ctx.db
        .insert(botCommands)
        .values({ botId: bot.id, name: c.name, description: c.description, usage: c.usage, builtin: true })
        .onConflictDoUpdate({ target: [botCommands.botId, botCommands.name], set: { description: c.description, usage: c.usage, builtin: true } });
    }
  }
  invalidateBots();
}

const byKind = async (ctx: AppContext, kind: string) => (await loadBots(ctx)).find((b) => b.kind === kind && b.enabled);

/** Executes "/command args" typed in a channel, routing it to the bot that owns the command. */
async function dispatchCommand(ctx: AppContext, message: HydratedMessage, channel: typeof channels.$inferSelect) {
  const match = message.content.match(/^\/([a-z0-9_\-çãáéíóúâêô]{1,32})(?:\s+([\s\S]*))?$/i);
  if (!match || !message.authorId) return;
  const name = match[1].toLowerCase();
  const rawArgs = (match[2] ?? '').trim();
  const all = (await loadBots(ctx)).filter((b) => b.enabled);
  const cmds = await commandsOf(ctx, all.map((b) => b.id));

  const reply = (bot: BotRow) => (content: string) => botSay(ctx, bot, channel.id, content, { threadId: message.threadId, replyToId: BigInt(message.id) });

  if (name === 'ajuda' || name === 'help') {
    const helper = all.find((b) => b.kind === 'stats') ?? all[0];
    if (!helper) return;
    const lines: string[] = ['🤖 **Comandos disponíveis aqui**'];
    for (const b of all) {
      if (!(await botCanUse(ctx, b, channel.id))) continue;
      const list = cmds.filter((c) => c.botId === b.id && c.enabled);
      if (list.length) lines.push(`**${b.displayName}** — ${list.map((c) => `\`/${c.name}\``).join(' ')}`);
    }
    return reply(helper)(lines.length > 1 ? lines.join('\n') : 'Nenhum bot está autorizado neste canal.');
  }

  const cmd = cmds.find((c) => c.name === name && c.enabled);
  if (!cmd) return;
  const bot = all.find((b) => b.id === cmd.botId)!;
  if (!(await botCanUse(ctx, bot, channel.id))) return;

  // Per-user command rate limit.
  const rl = `bot:rl:${message.authorId}`;
  const n = await ctx.redis.incr(rl);
  if (n === 1) await ctx.redis.expire(rl, 30);
  if (n > 15) return;

  const author = await ctx.db
    .select({ username: users.username, displayName: userProfiles.displayName })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, message.authorId));
  const args = parseArgs(rawArgs);

  try {
    if (bot.kind !== 'custom') {
      const handler = builtinHandler(bot.kind, name);
      if (handler) {
        const c: CommandContext = { ctx, bot, message, channel, invokerId: message.authorId, args, rawArgs, reply: reply(bot) };
        await handler(c);
      }
      return;
    }
    if (bot.script) {
      const r = await runBotScript(
        bot.script,
        'onCommand',
        {
          name,
          args,
          text: rawArgs,
          user: { id: message.authorId, username: author[0]?.username, displayName: author[0]?.displayName ?? author[0]?.username },
          channel: { id: channel.id, name: channel.name, type: channel.type },
          config: (cfg(bot).vars as Record<string, unknown>) ?? {},
        },
        (bot.storage as Record<string, unknown>) ?? {},
      );
      if (!r.ok) {
        await setBotError(ctx, bot.id, r.error ?? 'erro desconhecido');
        return;
      }
      await saveBotStorage(ctx, bot.id, r.storage);
      await setBotError(ctx, bot.id, null);
      for (const act of normalizeActions(r.result)) {
        if (act.type === 'reply' && act.content) await reply(bot)(act.content);
        if (act.type === 'react' && act.emoji) await botReact(ctx, bot, message, act.emoji);
      }
      if (r.result !== null) return;
    }
    if (cmd.response) {
      const s = await ctx.settings.get();
      const text = renderTemplate(cmd.response, {
        user: author[0]?.displayName ?? author[0]?.username ?? '',
        'user.mention': `@${author[0]?.username ?? ''}`,
        args: rawArgs,
        ...Object.fromEntries(args.map((a, i) => [`arg${i + 1}`, a])),
        channel: channel.name,
        community: s.communityName,
        date: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        time: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
      });
      await reply(bot)(text);
    }
  } catch (err) {
    ctx.log.error({ err, bot: bot.id, command: name }, 'bot command failed');
    await setBotError(ctx, bot.id, String((err as Error)?.message ?? err));
  }
}

/** Custom bots that opted into message events (sandboxed, throttled per bot). */
async function dispatchMessageListeners(ctx: AppContext, message: HydratedMessage, channel: typeof channels.$inferSelect) {
  const listeners = (await loadBots(ctx)).filter((b) => b.enabled && b.kind === 'custom' && b.script && cfg(b).listenMessages);
  for (const bot of listeners) {
    if (bot.userId === message.authorId || !(await botCanUse(ctx, bot, channel.id))) continue;
    const key = `bot:listen:${bot.id}`;
    const n = await ctx.redis.incr(key);
    if (n === 1) await ctx.redis.expire(key, 60);
    if (n > 30) continue;
    const r = await runBotScript(bot.script!, 'onMessage', { content: message.content, authorId: message.authorId, channel: { id: channel.id, name: channel.name } }, (bot.storage as Record<string, unknown>) ?? {});
    if (!r.ok) {
      await setBotError(ctx, bot.id, r.error ?? 'erro');
      continue;
    }
    await saveBotStorage(ctx, bot.id, r.storage);
    for (const act of normalizeActions(r.result)) {
      if (act.type === 'reply' && act.content) await botSay(ctx, bot, channel.id, act.content, { threadId: message.threadId });
      if (act.type === 'react' && act.emoji) await botReact(ctx, bot, message, act.emoji);
    }
  }
}

export async function registerBots(ctx: AppContext) {
  await ensureBuiltinBots(ctx);

  ctx.bus.on('message.created', async ({ message, channel }) => {
    if (!channel || !message.authorId) return;
    const all = await loadBots(ctx);
    if (all.some((b) => b.userId === message.authorId)) return; // bots never trigger bots
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      // Bots only read private conversations they are part of (e.g. the welcome DM).
      const member = all.find((b) => b.enabled && message.content.startsWith('/'));
      if (!member) return;
      const memberIds = await ctx.pool.query<{ user_id: string }>('select user_id from channel_members where channel_id = $1', [channel.id]);
      if (!all.some((b) => memberIds.rows.some((r) => r.user_id === b.userId))) return;
    }
    const mod = await byKind(ctx, 'moderation');
    if (mod) await postModerate(ctx, mod, message, channel).catch((err) => ctx.log.error({ err }, 'automod failed'));
    if (message.content.startsWith('/')) await dispatchCommand(ctx, message, channel);
    else await dispatchMessageListeners(ctx, message, channel);
  });

  ctx.bus.on('member.approved', async ({ userId }) => {
    const w = await byKind(ctx, 'welcome');
    if (w) await onMemberApproved(ctx, w, userId);
    for (const bot of (await loadBots(ctx)).filter((b) => b.enabled && b.kind === 'custom' && b.script)) {
      const r = await runBotScript(bot.script!, 'onMemberJoin', { userId }, (bot.storage as Record<string, unknown>) ?? {});
      if (!r.ok) continue;
      await saveBotStorage(ctx, bot.id, r.storage);
      const channelId = (cfg(bot).joinChannelId as string) ?? null;
      if (channelId) for (const act of normalizeActions(r.result)) if (act.type === 'reply' && act.content) await botSay(ctx, bot, channelId, act.content);
    }
  });

  ctx.bus.on('event.created', async ({ event }) => {
    const n = await byKind(ctx, 'notifications');
    if (n) await onEventCreated(ctx, n, event);
  });
  ctx.bus.on('event.starting', async ({ event, minutes }) => {
    const n = await byKind(ctx, 'notifications');
    if (n) await onEventCreated(ctx, n, event, minutes);
  });

  // Music: clients report the end of a track; the first report advances the shared queue.
  ctx.realtime.io?.on('connection', (socket) => {
    socket.on('music:ended', async (p: { channelId?: string; fileId?: string }) => {
      if (typeof p?.channelId !== 'string' || !socket.rooms.has(`voice:${p.channelId}`)) return;
      const s = await getMusic(ctx, p.channelId);
      if (s.current?.fileId !== p.fileId) return;
      if (!(await ctx.redis.set(`music:adv:${p.channelId}:${p.fileId}:${s.current!.startedAt}`, '1', 'EX', 30, 'NX'))) return;
      await advance(ctx, p.channelId);
    });
  });

  // Automatic messages configured per bot (every N minutes, single runner via Redis lock).
  const auto = setInterval(async () => {
    try {
      if (!(await ctx.redis.set('bots:auto:lock', '1', 'EX', 50, 'NX'))) return;
      for (const bot of (await loadBots(ctx, true)).filter((b) => b.enabled)) {
        for (const [i, m] of (cfg(bot).autoMessages ?? []).entries()) {
          if (!m.channelId || !m.content || !m.everyMinutes || m.everyMinutes < 5) continue;
          const k = `bots:auto:${bot.id}:${i}`;
          if (await ctx.redis.set(k, '1', 'EX', m.everyMinutes * 60, 'NX')) {
            const s = await ctx.settings.get();
            await botSay(ctx, bot, m.channelId, renderTemplate(m.content, { community: s.communityName, date: new Date().toLocaleDateString('pt-BR') }));
          }
        }
      }
    } catch (err) {
      ctx.log.error({ err }, 'bot auto messages failed');
    }
  }, 60_000);
  auto.unref();
}

export { preModerate, PERMISSIONS };
