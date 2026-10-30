import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { PERMISSIONS, type BuiltinBotKey } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { getPublicUser } from '../lib/users';
import { onlineUserIds } from '../realtime/presence';
import { staffWith } from '../modules/auth';
import { deleteMessage, type HydratedMessage } from '../modules/messages';
import { channelMembers, channels, events, messages, reminders, userProfiles, users } from '../db/schema';
import { askClaude, type AiBotConfig } from './ai';
import { advance, findTracks, getMusic, setMusic } from './music';
import { botCanUse, botDm, botPoll, botSay, cfg, parseArgs, renderTemplate, type BotRow } from './runtime';

export interface CommandContext {
  ctx: AppContext;
  bot: BotRow;
  message: HydratedMessage;
  channel: typeof channels.$inferSelect;
  invokerId: string;
  args: string[];
  rawArgs: string;
  reply: (content: string) => Promise<unknown>;
}

interface BuiltinDef {
  username: string;
  displayName: string;
  color: string;
  description: string;
  config: Record<string, unknown>;
  commands: { name: string; description: string; usage: string }[];
}

export const BUILTIN_DEFS: Record<BuiltinBotKey, BuiltinDef> = {
  welcome: {
    username: 'recepcao',
    displayName: 'Recepção',
    color: '#3fb68b',
    description: 'Recebe novos membros com uma mensagem personalizada assim que são aprovados.',
    config: { channelMode: 'all', channelId: null, dm: true, message: 'Boas-vindas, {user.mention}! 🎉 Que bom ter você na {community}. Dê uma olhada nas regras e apresente-se quando quiser.' },
    commands: [],
  },
  moderation: {
    username: 'guardiao',
    displayName: 'Guardião',
    color: '#e5484d',
    description: 'Detecta spam, flood, mensagens repetidas, palavras e links bloqueados. Aplica silenciamento temporário automático.',
    config: { channelMode: 'all', permissions: [PERMISSIONS.MANAGE_MESSAGES], deleteSpam: true, timeoutOnSpam: true },
    commands: [
      { name: 'limpar', description: 'Apaga as últimas N mensagens do canal (moderadores)', usage: '/limpar 20' },
      { name: 'lento', description: 'Define o modo lento do canal em segundos (moderadores)', usage: '/lento 10' },
    ],
  },
  notifications: {
    username: 'arauto',
    displayName: 'Arauto',
    color: '#e0a43c',
    description: 'Anuncia eventos criados e avisa quando estão para começar.',
    config: { channelMode: 'all', channelId: null, eventCreated: true, eventStarting: true },
    commands: [{ name: 'eventos', description: 'Lista os próximos eventos', usage: '/eventos' }],
  },
  music: {
    username: 'melodia',
    displayName: 'Melodia',
    color: '#d16ba5',
    description: 'Toca playlists de áudio autorizado (arquivos enviados à comunidade) sincronizadas nas salas de voz.',
    config: { channelMode: 'all' },
    commands: [
      { name: 'tocar', description: 'Adiciona uma música à fila', usage: '/tocar nome da faixa' },
      { name: 'fila', description: 'Mostra a fila', usage: '/fila' },
      { name: 'pular', description: 'Pula a faixa atual', usage: '/pular' },
      { name: 'pausar', description: 'Pausa a reprodução', usage: '/pausar' },
      { name: 'continuar', description: 'Retoma a reprodução', usage: '/continuar' },
      { name: 'parar', description: 'Para e limpa a fila', usage: '/parar' },
      { name: 'musicas', description: 'Lista as faixas disponíveis', usage: '/musicas [busca]' },
    ],
  },
  polls: {
    username: 'enquetes',
    displayName: 'Enquetes',
    color: '#5b8def',
    description: 'Cria votações em tempo real com resultados ao vivo.',
    config: { channelMode: 'all' },
    commands: [{ name: 'enquete', description: 'Cria uma enquete', usage: '/enquete "Pergunta?" "Opção A" "Opção B"' }],
  },
  stats: {
    username: 'painel',
    displayName: 'Painel',
    color: '#7c6cf2',
    description: 'Apresenta estatísticas e rankings da comunidade, e a lista de comandos.',
    config: { channelMode: 'all' },
    commands: [
      { name: 'ajuda', description: 'Lista os comandos disponíveis neste canal', usage: '/ajuda' },
      { name: 'stats', description: 'Estatísticas da comunidade', usage: '/stats' },
      { name: 'ranking', description: 'Membros mais ativos', usage: '/ranking' },
      { name: 'perfil', description: 'Nível e XP de um membro', usage: '/perfil @usuario' },
    ],
  },
  games: {
    username: 'arcade',
    displayName: 'Arcade',
    color: '#f76b15',
    description: 'Minijogos: dados, cara ou coroa, pedra-papel-tesoura, adivinhação e bola 8.',
    config: { channelMode: 'all' },
    commands: [
      { name: 'dado', description: 'Rola dados (ex.: 2d6)', usage: '/dado 2d6' },
      { name: 'moeda', description: 'Cara ou coroa', usage: '/moeda' },
      { name: 'ppt', description: 'Pedra, papel ou tesoura', usage: '/ppt pedra' },
      { name: 'adivinhe', description: 'Começa um jogo de adivinhar o número (1–100)', usage: '/adivinhe' },
      { name: 'chute', description: 'Dá um palpite no jogo de adivinhação', usage: '/chute 42' },
      { name: '8ball', description: 'A bola 8 responde', usage: '/8ball vai chover amanhã?' },
    ],
  },
  ai: {
    username: 'oraculo',
    displayName: 'Oráculo',
    color: '#00a2c7',
    description: 'Responde perguntas usando a API do Claude configurada pelo proprietário.',
    config: { channelMode: 'all', model: '', effort: 'medium', systemPrompt: '', dailyLimitPerUser: 30 },
    commands: [{ name: 'ia', description: 'Pergunte algo ao assistente', usage: '/ia como funciona o fórum?' }],
  },
  tickets: {
    username: 'suporte',
    displayName: 'Suporte',
    color: '#30a46c',
    description: 'Abre atendimentos privados entre um membro e a administração.',
    config: { channelMode: 'all', permissions: ['create_tickets'] },
    commands: [
      { name: 'ticket', description: 'Abre um atendimento privado com a administração', usage: '/ticket assunto' },
      { name: 'fechar', description: 'Fecha o ticket atual', usage: '/fechar' },
    ],
  },
  reminders: {
    username: 'lembretes',
    displayName: 'Lembretes',
    color: '#8e4ec6',
    description: 'Cria lembretes e notificações agendadas.',
    config: { channelMode: 'all' },
    commands: [
      { name: 'lembrar', description: 'Cria um lembrete (10m, 2h, 1d, 18:30 ou amanhã 09:00)', usage: '/lembrar 30m tomar água' },
      { name: 'lembretes', description: 'Lista seus lembretes pendentes', usage: '/lembretes' },
    ],
  },
};

const fmtDate = (d: Date) => d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Parses "10m", "2h", "1d", "18:30", "amanhã 09:00" into a date. Returns [date, rest]. */
export function parseWhen(args: string[], now = new Date()): [Date | null, string] {
  const [first, second, ...rest] = args;
  if (!first) return [null, ''];
  const dur = first.match(/^(\d{1,4})(s|seg|m|min|h|d)$/i);
  if (dur) {
    const n = Number(dur[1]);
    const unit = dur[2].toLowerCase();
    const ms = unit.startsWith('s') ? n * 1000 : unit.startsWith('m') ? n * 60_000 : unit === 'h' ? n * 3600_000 : n * 86400_000;
    return [new Date(now.getTime() + ms), [second, ...rest].filter(Boolean).join(' ')];
  }
  const tomorrow = /^amanh[ãa]$/i.test(first);
  const timeStr = tomorrow ? second : first;
  const tm = timeStr?.match(/^(\d{1,2})[:h](\d{2})$/);
  if (tm) {
    // Times are interpreted in the community's timezone (America/Sao_Paulo, UTC-3).
    const offsetMs = 3 * 3600_000;
    const local = new Date(now.getTime() - offsetMs);
    local.setUTCHours(Number(tm[1]), Number(tm[2]), 0, 0);
    let d = new Date(local.getTime() + offsetMs);
    if (tomorrow) d = new Date(d.getTime() + 86400_000);
    else if (d <= now) d = new Date(d.getTime() + 86400_000);
    const text = (tomorrow ? rest : [second, ...rest]).filter(Boolean).join(' ');
    return [d, text];
  }
  return [null, ''];
}

type Handler = (c: CommandContext) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  // ── Moderation ──
  'moderation:limpar': async (c) => {
    const a = await c.ctx.perms.getUser(c.invokerId);
    const { perms } = await c.ctx.perms.channelPermsById(a!, c.channel.id);
    if (!perms.has(PERMISSIONS.MANAGE_MESSAGES)) return c.reply('Apenas moderadores podem usar /limpar.');
    const n = Math.min(100, Math.max(1, Number(c.args[0]) || 10));
    const rows = await c.ctx.db
      .select()
      .from(messages)
      .where(and(eq(messages.channelId, c.channel.id), isNull(messages.deletedAt), isNull(messages.threadId), lt(messages.id, BigInt(c.message.id))))
      .orderBy(desc(messages.id))
      .limit(n);
    for (const m of rows) await deleteMessage(c.ctx, m, c.invokerId, { audit: true });
    const [cmd] = await c.ctx.db.select().from(messages).where(eq(messages.id, BigInt(c.message.id)));
    if (cmd) await deleteMessage(c.ctx, cmd, c.invokerId, { audit: false });
    return c.reply(`🧹 ${rows.length} mensagens removidas.`);
  },
  'moderation:lento': async (c) => {
    const a = await c.ctx.perms.getUser(c.invokerId);
    if (!c.ctx.perms.has(a!, PERMISSIONS.MANAGE_CHANNELS)) return c.reply('Apenas quem gerencia canais pode alterar o modo lento.');
    const s = Math.min(21600, Math.max(0, Number(c.args[0]) || 0));
    await c.ctx.db.update(channels).set({ slowmodeSeconds: s }).where(eq(channels.id, c.channel.id));
    await audit(c.ctx, { actorId: c.invokerId, action: 'channel.slowmode', targetType: 'channel', targetId: c.channel.id, metadata: { seconds: s } });
    c.ctx.realtime.toMembers('structure:updated', {});
    return c.reply(s ? `🐢 Modo lento: ${s}s entre mensagens.` : 'Modo lento desativado.');
  },

  // ── Notifications ──
  'notifications:eventos': async (c) => {
    const rows = await c.ctx.db.select().from(events).where(and(isNull(events.cancelledAt), gte(events.startsAt, new Date()))).orderBy(asc(events.startsAt)).limit(5);
    if (!rows.length) return c.reply('Nenhum evento agendado.');
    return c.reply(['📅 **Próximos eventos**', ...rows.map((e) => `• **${e.title}** — ${fmtDate(e.startsAt)}${e.location ? ` · ${e.location}` : ''}`)].join('\n'));
  },

  // ── Music ──
  'music:tocar': async (c) => {
    if (!['voice', 'video', 'stage'].includes(c.channel.type)) return c.reply('Use /tocar no chat de uma sala de voz.');
    if (!c.rawArgs) return c.reply('Diga o nome da faixa: /tocar nome');
    const a = await c.ctx.perms.getUser(c.invokerId);
    const tracks = await findTracks(c.ctx, await c.ctx.perms.visibleChannelIds(a!), c.rawArgs);
    if (!tracks.length) return c.reply('Nenhuma faixa encontrada. Envie arquivos de áudio no canal de arquivos para montar a playlist.');
    const t = tracks[0];
    const s = await getMusic(c.ctx, c.channel.id);
    s.queue.push({ fileId: t.id, name: t.name, requestedBy: c.invokerId });
    if (s.queue.length > 100) s.queue = s.queue.slice(0, 100);
    if (!s.current) {
      await setMusic(c.ctx, s);
      await advance(c.ctx, c.channel.id);
      return c.reply(`▶️ Tocando agora: **${t.name}**`);
    }
    await setMusic(c.ctx, s);
    return c.reply(`➕ Na fila (#${s.queue.length}): **${t.name}**`);
  },
  'music:fila': async (c) => {
    const s = await getMusic(c.ctx, c.channel.id);
    if (!s.current) return c.reply('Nada tocando.');
    return c.reply([`🎵 Agora: **${s.current.name}**${s.pausedAt ? ' (pausado)' : ''}`, ...s.queue.slice(0, 10).map((q, i) => `${i + 1}. ${q.name}`)].join('\n'));
  },
  'music:pular': async (c) => {
    const s = await advance(c.ctx, c.channel.id);
    return c.reply(s.current ? `⏭️ Agora: **${s.current.name}**` : '⏹️ Fila vazia.');
  },
  'music:pausar': async (c) => {
    const s = await getMusic(c.ctx, c.channel.id);
    if (!s.current || s.pausedAt) return;
    s.pausedAt = Date.now();
    await setMusic(c.ctx, s);
    return c.reply('⏸️ Pausado.');
  },
  'music:continuar': async (c) => {
    const s = await getMusic(c.ctx, c.channel.id);
    if (!s.current || !s.pausedAt) return;
    s.current.startedAt += Date.now() - s.pausedAt;
    s.pausedAt = null;
    await setMusic(c.ctx, s);
    return c.reply('▶️ Continuando.');
  },
  'music:parar': async (c) => {
    await setMusic(c.ctx, { channelId: c.channel.id, current: null, pausedAt: null, queue: [] });
    return c.reply('⏹️ Reprodução encerrada.');
  },
  'music:musicas': async (c) => {
    const a = await c.ctx.perms.getUser(c.invokerId);
    const tracks = await findTracks(c.ctx, await c.ctx.perms.visibleChannelIds(a!), c.rawArgs || undefined);
    if (!tracks.length) return c.reply('Nenhuma faixa disponível ainda.');
    return c.reply(['🎶 **Faixas disponíveis**', ...tracks.slice(0, 15).map((t) => `• ${t.name}`)].join('\n'));
  },

  // ── Polls ──
  'polls:enquete': async (c) => {
    const [question, ...options] = c.args;
    if (!question || options.length < 2) return c.reply('Uso: /enquete "Pergunta?" "Opção A" "Opção B" (até 10 opções)');
    if (options.length > 10) return c.reply('No máximo 10 opções.');
    return botPoll(c.ctx, c.bot, c.channel.id, question.slice(0, 300), options.map((o) => o.slice(0, 100)));
  },

  // ── Stats ──
  'stats:stats': async (c) => {
    const [{ members }] = await c.ctx.db.select({ members: sql<number>`count(*)::int` }).from(users).where(and(eq(users.status, 'approved'), eq(users.isBot, false)));
    const [{ msgs }] = await c.ctx.db.select({ msgs: sql<number>`count(*)::int` }).from(messages).where(isNull(messages.deletedAt));
    const [{ today }] = await c.ctx.db.select({ today: sql<number>`count(*)::int` }).from(messages).where(gte(messages.createdAt, new Date(Date.now() - 86400_000)));
    const online = (await onlineUserIds(c.ctx)).size;
    return c.reply(`📊 **${(await c.ctx.settings.get()).communityName}**\n👥 ${members} membros · 🟢 ${online} online\n💬 ${msgs} mensagens (${today} nas últimas 24h)`);
  },
  'stats:ranking': async (c) => {
    const rows = await c.ctx.db
      .select({ username: users.username, displayName: userProfiles.displayName, xp: userProfiles.xp, level: userProfiles.level })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(eq(users.status, 'approved'), eq(users.isBot, false)))
      .orderBy(desc(userProfiles.xp))
      .limit(10);
    const medals = ['🥇', '🥈', '🥉'];
    return c.reply(['🏆 **Ranking de participação**', ...rows.map((r, i) => `${medals[i] ?? `${i + 1}.`} ${r.displayName ?? r.username} — nível ${r.level} (${r.xp} XP)`)].join('\n'));
  },
  'stats:perfil': async (c) => {
    const name = (c.args[0] ?? '').replace(/^@/, '').toLowerCase();
    const [u] = name
      ? await c.ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${name}`)
      : [{ id: c.invokerId }];
    if (!u) return c.reply('Membro não encontrado.');
    const p = await getPublicUser(c.ctx, u.id);
    if (!p) return c.reply('Membro não encontrado.');
    return c.reply(`🪪 **${p.displayName}** (@${p.username}) — nível ${p.level}, ${p.xp} XP`);
  },

  // ── Games ──
  'games:dado': async (c) => {
    const m = (c.args[0] ?? '1d6').toLowerCase().match(/^(\d{1,2})?d(\d{1,4})$/);
    if (!m) return c.reply('Uso: /dado 2d6');
    const n = Math.min(20, Math.max(1, Number(m[1] ?? 1)));
    const faces = Math.min(1000, Math.max(2, Number(m[2])));
    const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * faces));
    return c.reply(`🎲 ${n}d${faces}: ${rolls.join(' + ')}${n > 1 ? ` = **${rolls.reduce((a, b) => a + b, 0)}**` : ''}`);
  },
  'games:moeda': async (c) => c.reply(Math.random() < 0.5 ? '🪙 **Cara!**' : '🪙 **Coroa!**'),
  'games:ppt': async (c) => {
    const opts = ['pedra', 'papel', 'tesoura'];
    const me = (c.args[0] ?? '').toLowerCase();
    if (!opts.includes(me)) return c.reply('Uso: /ppt pedra | papel | tesoura');
    const bot = opts[Math.floor(Math.random() * 3)];
    const win = (me === 'pedra' && bot === 'tesoura') || (me === 'papel' && bot === 'pedra') || (me === 'tesoura' && bot === 'papel');
    const icon: Record<string, string> = { pedra: '🪨', papel: '📄', tesoura: '✂️' };
    return c.reply(`${icon[me]} vs ${icon[bot]} — ${me === bot ? 'Empate!' : win ? 'Você venceu! 🎉' : 'Eu venci! 😎'}`);
  },
  'games:adivinhe': async (c) => {
    const key = `game:guess:${c.channel.id}`;
    const n = 1 + Math.floor(Math.random() * 100);
    await c.ctx.redis.set(key, JSON.stringify({ n, tries: 0 }), 'EX', 1800);
    return c.reply('🔢 Pensei em um número de 1 a 100. Use /chute N para adivinhar!');
  },
  'games:chute': async (c) => {
    const key = `game:guess:${c.channel.id}`;
    const raw = await c.ctx.redis.get(key);
    if (!raw) return c.reply('Nenhum jogo em andamento. Comece com /adivinhe.');
    const g = JSON.parse(raw) as { n: number; tries: number };
    const guess = Number(c.args[0]);
    if (!Number.isInteger(guess)) return c.reply('Uso: /chute 42');
    g.tries++;
    if (guess === g.n) {
      await c.ctx.redis.del(key);
      const u = await getPublicUser(c.ctx, c.invokerId);
      return c.reply(`🎉 **${u?.displayName}** acertou! Era ${g.n} (${g.tries} tentativa${g.tries > 1 ? 's' : ''}).`);
    }
    await c.ctx.redis.set(key, JSON.stringify(g), 'EX', 1800);
    return c.reply(guess < g.n ? `⬆️ Maior que ${guess}.` : `⬇️ Menor que ${guess}.`);
  },
  'games:8ball': async (c) => {
    const answers = ['Com certeza.', 'Sem dúvida.', 'Pode contar com isso.', 'Provavelmente sim.', 'Os sinais apontam que sim.', 'Pergunte de novo mais tarde.', 'Melhor não dizer agora.', 'Não conte com isso.', 'Minhas fontes dizem que não.', 'Muito duvidoso.'];
    if (!c.rawArgs) return c.reply('Faça uma pergunta: /8ball vou passar na prova?');
    return c.reply(`🎱 ${answers[Math.floor(Math.random() * answers.length)]}`);
  },

  // ── AI ──
  'ai:ia': async (c) => {
    if (!c.rawArgs) return c.reply('Faça uma pergunta: /ia sua pergunta');
    const conf = cfg(c.bot) as AiBotConfig;
    const limit = conf.dailyLimitPerUser ?? 30;
    const dayKey = `ai:quota:${c.invokerId}:${new Date().toISOString().slice(0, 10)}`;
    const used = await c.ctx.redis.incr(dayKey);
    await c.ctx.redis.expire(dayKey, 90000);
    if (limit > 0 && used > limit) return c.reply(`Você atingiu o limite diário de ${limit} perguntas.`);
    const u = await getPublicUser(c.ctx, c.invokerId);
    c.ctx.realtime.toChannel(c.channel.id, 'typing', { channelId: c.channel.id, threadId: c.message.threadId, userId: c.bot.userId });
    const answer = await askClaude(c.ctx, conf, c.rawArgs.slice(0, 4000), u?.username ?? 'membro');
    return c.reply(answer.ok ? answer.text : `⚠️ ${answer.error}`);
  },

  // ── Tickets ──
  'tickets:ticket': async (c) => {
    const subject = c.rawArgs.slice(0, 80) || 'Atendimento';
    const open = await c.ctx.pool.query<{ n: number }>(
      `select count(*)::int as n from channels c join channel_members m on m.channel_id = c.id
        where c.type = 'ticket' and m.user_id = $1 and coalesce((c.settings->>'closed')::boolean, false) = false`,
      [c.invokerId],
    );
    if ((open.rows[0]?.n ?? 0) >= 3) return c.reply('Você já tem 3 tickets abertos. Feche um antes de abrir outro.');
    const u = await getPublicUser(c.ctx, c.invokerId);
    const [{ n }] = await c.ctx.db.select({ n: sql<number>`count(*)::int` }).from(channels).where(eq(channels.type, 'ticket'));
    const [t] = await c.ctx.db
      .insert(channels)
      .values({ type: 'ticket', name: `ticket-${n + 1}-${u?.username ?? 'membro'}`, topic: subject, createdById: c.invokerId, settings: { closed: false, subject, openedBy: c.invokerId } })
      .returning();
    await c.ctx.db.insert(channelMembers).values([{ channelId: t.id, userId: c.invokerId }, { channelId: t.id, userId: c.bot.userId }]);
    c.ctx.perms.invalidateUser(c.invokerId);
    await c.ctx.realtime.resyncUser(c.invokerId);
    const staff = await staffWith(c.ctx, PERMISSIONS.MANAGE_MEMBERS);
    for (const s of staff) await c.ctx.realtime.resyncUser(s);
    c.ctx.realtime.toUsers([c.invokerId, ...staff], 'structure:updated', {});
    await notify(c.ctx, staff, { type: 'admin', title: `Novo ticket: ${subject}`, body: `Aberto por ${u?.displayName}`, link: `/app/c/${t.id}` });
    await notify(c.ctx, [c.invokerId], { type: 'admin', title: 'Ticket aberto', body: subject, link: `/app/c/${t.id}` });
    await botSay(c.ctx, c.bot, t.id, `🎫 **${subject}**\nOlá, ${u?.displayName}! A administração foi avisada e responderá por aqui. Só você e a equipe veem este canal. Use /fechar quando terminar.`);
    return c.reply(`🎫 Ticket aberto. Apenas você e a administração têm acesso.`);
  },
  'tickets:fechar': async (c) => {
    if (c.channel.type !== 'ticket') return c.reply('Use /fechar dentro de um ticket.');
    const settings = (c.channel.settings ?? {}) as { closed?: boolean; openedBy?: string };
    const a = await c.ctx.perms.getUser(c.invokerId);
    if (settings.openedBy !== c.invokerId && !c.ctx.perms.has(a!, PERMISSIONS.MANAGE_MEMBERS)) return c.reply('Apenas quem abriu ou a administração pode fechar.');
    await c.ctx.db.update(channels).set({ settings: { ...settings, closed: true, closedAt: new Date().toISOString(), closedBy: c.invokerId } }).where(eq(channels.id, c.channel.id));
    await audit(c.ctx, { actorId: c.invokerId, action: 'ticket.close', targetType: 'channel', targetId: c.channel.id });
    c.ctx.realtime.toChannel(c.channel.id, 'structure:updated', {});
    return c.reply('🔒 Ticket fechado. O histórico permanece disponível para consulta.');
  },

  // ── Reminders ──
  'reminders:lembrar': async (c) => {
    const [when, text] = parseWhen(c.args);
    if (!when || !text) return c.reply('Uso: /lembrar 30m texto · /lembrar 18:30 texto · /lembrar amanhã 09:00 texto');
    if (when.getTime() > Date.now() + 365 * 86400_000) return c.reply('No máximo 1 ano à frente.');
    const [{ n }] = await c.ctx.db.select({ n: sql<number>`count(*)::int` }).from(reminders).where(and(eq(reminders.userId, c.invokerId), isNull(reminders.sentAt)));
    if (n >= 50) return c.reply('Você já tem 50 lembretes pendentes.');
    await c.ctx.db.insert(reminders).values({ userId: c.invokerId, channelId: c.channel.id, content: text.slice(0, 500), remindAt: when });
    return c.reply(`⏰ Combinado! Vou lembrar você em ${fmtDate(when)}.`);
  },
  'reminders:lembretes': async (c) => {
    const rows = await c.ctx.db.select().from(reminders).where(and(eq(reminders.userId, c.invokerId), isNull(reminders.sentAt))).orderBy(asc(reminders.remindAt)).limit(10);
    if (!rows.length) return c.reply('Você não tem lembretes pendentes.');
    return c.reply(['⏰ **Seus lembretes**', ...rows.map((r) => `• ${fmtDate(r.remindAt)} — ${r.content}`)].join('\n'));
  },
};

export function builtinHandler(kind: string, command: string): Handler | undefined {
  return handlers[`${kind}:${command}`];
}

// ───────────── Event-driven behaviour ─────────────

export async function onMemberApproved(ctx: AppContext, bot: BotRow, userId: string) {
  const c = cfg(bot) as { channelId?: string | null; dm?: boolean; message?: string };
  const u = await getPublicUser(ctx, userId);
  if (!u) return;
  const s = await ctx.settings.get();
  const text = renderTemplate(c.message || BUILTIN_DEFS.welcome.config.message as string, {
    user: u.displayName,
    'user.mention': `@${u.username}`,
    'user.name': u.username,
    community: s.communityName,
  });
  let channelId = c.channelId ?? null;
  if (!channelId) {
    const [first] = await ctx.db.select({ id: channels.id }).from(channels).where(eq(channels.type, 'text')).orderBy(asc(channels.position)).limit(1);
    channelId = first?.id ?? null;
  }
  if (channelId && (await botCanUse(ctx, bot, channelId))) await botSay(ctx, bot, channelId, text);
  if (c.dm) {
    const dm = await botDm(ctx, bot, userId);
    await botSay(ctx, bot, dm, `${text}\n\nEste é um canal direto com a Recepção. Dica: digite /ajuda em qualquer canal para ver os comandos dos bots.`);
  }
}

export async function onEventCreated(ctx: AppContext, bot: BotRow, ev: typeof events.$inferSelect, starting?: number) {
  const c = cfg(bot) as { channelId?: string | null; eventCreated?: boolean; eventStarting?: boolean };
  if (starting === undefined && c.eventCreated === false) return;
  if (starting !== undefined && (c.eventStarting === false || ![0, 15].includes(starting))) return;
  let channelId = c.channelId ?? null;
  if (!channelId) {
    const [ann] = await ctx.db.select({ id: channels.id }).from(channels).where(eq(channels.type, 'events')).orderBy(asc(channels.position)).limit(1);
    channelId = ann?.id ?? null;
  }
  if (!channelId) return;
  const where = ev.channelId ? ` em <#${ev.channelId}>` : ev.location ? ` · ${ev.location}` : '';
  const text =
    starting === undefined
      ? `📅 Novo evento: **${ev.title}** — ${fmtDate(ev.startsAt)}${where}\nConfirme presença na agenda.`
      : starting === 0
        ? `🔔 **${ev.title}** está começando agora${where}!`
        : `⏳ **${ev.title}** começa em ${starting} minutos${where}.`;
  await botSay(ctx, bot, channelId, text);
}

// ───────────── Automatic moderation ─────────────

function urlsIn(text: string) {
  const out: string[] = [];
  for (const m of text.matchAll(/\bhttps?:\/\/([^\s/?#]+)[^\s]*/gi)) out.push(m[1].toLowerCase().replace(/^www\./, ''));
  return out;
}

/** Synchronous checks done before a message is stored. Returns a reason when the message must be refused. */
export async function preModerate(ctx: AppContext, content: string): Promise<string | null> {
  const s = await ctx.settings.get();
  const lower = content.toLowerCase();
  const word = s.moderation.blockedWords.find((w) => w && new RegExp(`(^|[^\\p{L}\\p{N}])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(lower));
  if (word) return 'Sua mensagem contém um termo bloqueado pela moderação.';
  const domains = urlsIn(content);
  const bad = domains.find((d) => s.moderation.blockedDomains.some((b) => d === b.toLowerCase() || d.endsWith(`.${b.toLowerCase()}`)));
  if (bad) return `Links para ${bad} são bloqueados por segurança.`;
  return null;
}

/** Flood / repetition detection after a message is posted. */
export async function postModerate(ctx: AppContext, bot: BotRow, message: HydratedMessage, channel: typeof channels.$inferSelect) {
  const authorId = message.authorId;
  if (!authorId || channel.type === 'dm' || channel.type === 'group_dm') return;
  const a = await ctx.perms.getUser(authorId);
  if (!a || a.isBot || a.isOwner) return;
  const { perms } = await ctx.perms.channelPermsById(a, channel.id);
  if (perms.has(PERMISSIONS.MANAGE_MESSAGES)) return;
  const s = await ctx.settings.get();
  const c = cfg(bot) as { deleteSpam?: boolean; timeoutOnSpam?: boolean };

  const rateKey = `mod:rate:${authorId}`;
  const n = await ctx.redis.incr(rateKey);
  if (n === 1) await ctx.redis.pexpire(rateKey, 10_000);
  const fingerprint = message.content.trim().toLowerCase().slice(0, 200);
  let repeated = false;
  if (fingerprint.length >= 3) {
    const dupKey = `mod:dup:${authorId}`;
    await ctx.redis.lpush(dupKey, fingerprint);
    await ctx.redis.ltrim(dupKey, 0, 4);
    await ctx.redis.expire(dupKey, 60);
    const last = await ctx.redis.lrange(dupKey, 0, 4);
    repeated = last.filter((x) => x === fingerprint).length >= 4;
  }
  const flood = n > s.moderation.spamMessagesPer10s;
  if (!flood && !repeated) return;

  if (c.deleteSpam !== false) {
    const [m] = await ctx.db.select().from(messages).where(eq(messages.id, BigInt(message.id)));
    if (m && !m.deletedAt) await deleteMessage(ctx, m, bot.userId, { audit: false });
  }
  const lockKey = `mod:acted:${authorId}`;
  if (!(await ctx.redis.set(lockKey, '1', 'EX', 60, 'NX'))) return;
  const reason = flood ? 'excesso de mensagens (flood)' : 'mensagens repetidas (spam)';
  if (c.timeoutOnSpam !== false && s.moderation.autoTimeoutMinutes > 0) {
    const until = new Date(Date.now() + s.moderation.autoTimeoutMinutes * 60_000);
    await ctx.db.update(users).set({ mutedUntil: until }).where(eq(users.id, authorId));
    ctx.perms.invalidateUser(authorId);
    await notify(ctx, [authorId], { type: 'admin', title: 'Você foi silenciado automaticamente', body: `Motivo: ${reason}. Duração: ${s.moderation.autoTimeoutMinutes} min.` });
  }
  await audit(ctx, { actorId: bot.userId, action: 'automod.spam', targetType: 'user', targetId: authorId, metadata: { reason, channelId: channel.id } });
  const staff = await staffWith(ctx, PERMISSIONS.VIEW_REPORTS);
  const u = await getPublicUser(ctx, authorId);
  await notify(ctx, staff, { type: 'report', title: 'Moderação automática', body: `${u?.displayName}: ${reason} em #${channel.name}`, link: `/app/c/${channel.id}` });
}

export { inArray, parseArgs };
