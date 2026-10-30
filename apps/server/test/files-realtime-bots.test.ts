import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { io as ioc, type Socket } from 'socket.io-client';
import { channelByName, Client, ensureOwner, getApp, member, PASSWORD, register, sleep, uniq, verify } from './helpers';
import { bots, reminders, users } from '../src/db/schema';
import type { BuiltApp } from '../src/app';

let app: BuiltApp;
let owner: Client;
let alice: Awaited<ReturnType<typeof member>>;
let bob: Awaited<ReturnType<typeof member>>;
let general: any;
let baseUrl: string;

// 1x1 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201e2a4e1d40000000049454e44ae426082', 'hex');

function multipart(fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) {
  const boundary = '----enclave' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(c: Client, file: { name: string; type: string; data: Buffer }, fields: Record<string, string> = {}) {
  const mp = multipart(fields, file);
  return c.req('POST', '/api/files', mp.payload, { headers: { 'content-type': mp.contentType } });
}

function connect(c: Client): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(baseUrl, { transports: ['websocket'], extraHeaders: { cookie: c.cookieHeader() }, reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
}
const once = <T = any>(s: Socket, ev: string, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), ms);
    s.once(ev, (d: T) => {
      clearTimeout(t);
      resolve(d);
    });
  });

beforeAll(async () => {
  app = await getApp();
  await app.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.app.server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
  owner = await ensureOwner(app);
  alice = await member(app, owner, uniq('alice'));
  bob = await member(app, owner, uniq('bob'));
  general = await channelByName(alice.c, 'geral');
});
afterAll(async () => {
  await app.close();
});

describe('arquivos', () => {
  it('aceita imagem válida e serve apenas com autorização', async () => {
    const up = await upload(alice.c, { name: 'foto.png', type: 'image/png', data: PNG });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ mimeType: 'image/png', category: 'image', width: 1, height: 1 });
    // Not attached yet: only the owner can read it
    expect((await bob.c.get(`/api/files/${up.body.id}`)).status).toBe(404);
    const msg = await alice.c.post(`/api/channels/${general.id}/messages`, { content: '', attachmentIds: [up.body.id] });
    expect(msg.status).toBe(201);
    const dl = await bob.c.get(`/api/files/${up.body.id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    // Anonymous access is never allowed
    expect((await new Client(app).get(`/api/files/${up.body.id}`)).status).toBe(401);
    // Attachments can't be reused by someone else
    expect((await bob.c.post(`/api/channels/${general.id}/messages`, { attachmentIds: [up.body.id] })).status).toBe(400);
  });

  it('rejeita conteúdo disfarçado (validação pelo conteúdo, não pela extensão)', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
    const r = await upload(alice.c, { name: 'gato.png', type: 'image/png', data: exe });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('FILE_TYPE');
    const html = await upload(alice.c, { name: 'pagina.html', type: 'text/html', data: Buffer.from('<script>alert(1)</script>') });
    expect(html.status).toBe(400);
    const svg = await upload(alice.c, { name: 'x.svg', type: 'image/svg+xml', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
    expect(svg.status).toBe(400);
  });

  it('respeita o limite de tamanho configurado', async () => {
    await owner.patch('/api/admin/settings', { uploads: { maxFileSizeMb: 1 } });
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1.5 * 1024 * 1024, 32)]);
    const r = await upload(alice.c, { name: 'grande.pdf', type: 'application/pdf', data: big });
    expect(r.status).toBe(413);
    await owner.patch('/api/admin/settings', { uploads: { maxFileSizeMb: 50 } });
  });

  it('suporta requisições parciais (Range) para áudio e vídeo', async () => {
    const txt = await upload(alice.c, { name: 'notas.txt', type: 'text/plain', data: Buffer.from('0123456789abcdef') });
    expect(txt.status).toBe(201);
    const r = await alice.c.req('GET', `/api/files/${txt.body.id}`, undefined, { headers: { range: 'bytes=2-5' } });
    expect(r.status).toBe(206);
    expect(String(r.body)).toBe('2345');
    expect(r.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('anexos de DM não vazam para quem não participa', async () => {
    const dm = await alice.c.post('/api/conversations/dm', { userId: bob.id });
    const up = await upload(alice.c, { name: 'privado.png', type: 'image/png', data: PNG });
    await alice.c.post(`/api/channels/${dm.body.id}/messages`, { attachmentIds: [up.body.id] });
    expect((await bob.c.get(`/api/files/${up.body.id}`)).status).toBe(200);
    expect((await owner.get(`/api/files/${up.body.id}`)).status).toBe(404);
  });

  it('biblioteca do canal com pastas', async () => {
    const filesCh = await channelByName(alice.c, 'arquivos');
    const folder = await alice.c.post(`/api/channels/${filesCh.id}/folders`, { name: 'Projetos' });
    expect(folder.status).toBe(200);
    const up = await upload(alice.c, { name: 'plano.txt', type: 'text/plain', data: Buffer.from('plano') }, { purpose: 'library', channelId: filesCh.id, folderId: folder.body.id });
    expect(up.status).toBe(201);
    const list = await bob.c.get(`/api/channels/${filesCh.id}/files?folderId=${folder.body.id}`);
    expect(list.body.files.map((f: any) => f.id)).toContain(up.body.id);
    expect((await bob.c.get(`/api/files/${up.body.id}`)).status).toBe(200);
    expect((await bob.c.del(`/api/files/${up.body.id}`)).status).toBe(403);
  });
});

describe('tempo real', () => {
  it('somente membros aprovados conectam no WebSocket', async () => {
    const { username, email } = await register(app, uniq('ws'));
    await verify(app, email);
    const pend = new Client(app);
    await pend.post('/api/auth/login', { login: username, password: PASSWORD });
    await expect(connect(pend)).rejects.toThrow(/FORBIDDEN/);
    await expect(connect(new Client(app))).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('entrega mensagens, digitação e presença em tempo real', async () => {
    const sa = await connect(alice.c);
    const sb = await connect(bob.c);
    await sleep(100);
    const got = once(sb, 'message:new');
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: 'ao vivo!' });
    expect((await got).content).toBe('ao vivo!');
    const typing = once(sb, 'typing');
    sa.emit('typing', { channelId: general.id });
    expect((await typing).userId).toBe(alice.id);
    const members = await bob.c.get('/api/members');
    expect(members.body.find((m: any) => m.id === alice.id).presence).toBe('online');
    sa.close();
    sb.close();
  });

  it('usuário banido é desconectado imediatamente', async () => {
    const t = await member(app, owner, uniq('ban'));
    const s = await connect(t.c);
    const disc = once(s, 'disconnect');
    await owner.post(`/api/admin/members/${t.id}/ban`, { reason: 'teste' });
    await disc;
    expect(s.connected).toBe(false);
  });

  it('sinalização WebRTC: entrada na sala, troca de SDP/ICE e estado de mídia', async () => {
    const voice = await channelByName(alice.c, 'Sala de voz');
    const sa = await connect(alice.c);
    const sb = await connect(bob.c);
    const ja: any = await sa.emitWithAck('voice:join', { channelId: voice.id });
    expect(ja.ok).toBe(true);
    expect(ja.iceServers[0].urls[0]).toMatch(/^stun:/);
    const peerJoined = once(sa, 'voice:peer-joined');
    const jb: any = await sb.emitWithAck('voice:join', { channelId: voice.id });
    expect(jb.ok).toBe(true);
    expect(jb.participants.map((p: any) => p.userId)).toContain(alice.id);
    const pj: any = await peerJoined;
    expect(pj.participant.userId).toBe(bob.id);

    const offer = once(sa, 'voice:signal');
    sb.emit('voice:signal', { channelId: voice.id, to: ja.self.socketId, data: { description: { type: 'offer', sdp: 'v=0' } } });
    const o: any = await offer;
    expect(o.from).toBe(jb.self.socketId);
    expect(o.data.description.type).toBe('offer');

    const st = once(sa, 'voice:state');
    sb.emit('voice:state', { channelId: voice.id, video: true, screen: true, muted: false });
    const s: any = await st;
    expect(s.participant).toMatchObject({ video: true, screen: true, muted: false });

    const left = once(sa, 'voice:peer-left');
    await sb.emitWithAck('voice:leave', { channelId: voice.id });
    expect(((await left) as any).userId).toBe(bob.id);
    sa.close();
    sb.close();
  });

  it('sem permissão de compartilhar tela, o estado "screen" é recusado pelo servidor', async () => {
    const space = (await owner.get('/api/structure')).body.spaces[0];
    const roles = (await owner.get('/api/roles')).body;
    const memberRole = roles.find((r: any) => r.isDefault);
    const ch = await owner.post('/api/channels', {
      spaceId: space.id,
      type: 'video',
      name: 'Palco restrito',
      overwrites: [{ targetType: 'role', targetId: memberRole.id, allow: [], deny: ['screen_share', 'video'] }],
    });
    const sb = await connect(bob.c);
    const j: any = await sb.emitWithAck('voice:join', { channelId: ch.body.id });
    expect(j.ok).toBe(true);
    expect(j.self.allowed).toMatchObject({ screen: false, video: false, speak: true });
    const sa = await connect(alice.c);
    await sa.emitWithAck('voice:join', { channelId: ch.body.id });
    const st = once(sa, 'voice:state');
    sb.emit('voice:state', { channelId: ch.body.id, screen: true, video: true });
    const s: any = await st;
    expect(s.participant.screen).toBe(false);
    expect(s.participant.video).toBe(false);
    sa.close();
    sb.close();
  });

  it('não entra em sala de voz sem permissão de conexão', async () => {
    const space = (await owner.get('/api/structure')).body.spaces[0];
    const roles = (await owner.get('/api/roles')).body;
    const memberRole = roles.find((r: any) => r.isDefault);
    const ch = await owner.post('/api/channels', {
      spaceId: space.id,
      type: 'voice',
      name: 'Sala fechada',
      overwrites: [{ targetType: 'role', targetId: memberRole.id, allow: [], deny: ['connect_voice'] }],
    });
    const sb = await connect(bob.c);
    const j: any = await sb.emitWithAck('voice:join', { channelId: ch.body.id });
    expect(j.ok).toBe(false);
    sb.close();
  });

  it('salas temporárias criadas por membros', async () => {
    const space = (await owner.get('/api/structure')).body.spaces[0];
    expect((await bob.c.post('/api/channels', { spaceId: space.id, type: 'text', name: 'nao-pode' })).status).toBe(403);
    const t = await bob.c.post('/api/channels', { spaceId: space.id, type: 'voice', name: 'Sala do Bob', isTemporary: true });
    expect(t.status).toBe(200);
    expect(t.body.isTemporary).toBe(true);
  });
});

describe('bots', () => {
  const waitBotReply = async (c: Client, channelId: string, botUsername: string, contains?: string) => {
    for (let i = 0; i < 30; i++) {
      const list = await c.get(`/api/channels/${channelId}/messages?limit=10`);
      const botUser = list.body.users.find((u: any) => u.username === botUsername);
      const m = botUser && list.body.messages.reverse().find((x: any) => x.authorId === botUser.id && (!contains || x.content.includes(contains)));
      if (m) return m;
      await sleep(100);
    }
    throw new Error(`no reply from ${botUsername}`);
  };

  it('bots nativos existem e estão listados', async () => {
    const list = await alice.c.get('/api/bots');
    const kinds = list.body.map((b: any) => b.kind).sort();
    expect(kinds).toEqual(['ai', 'games', 'moderation', 'music', 'notifications', 'polls', 'reminders', 'stats', 'tickets', 'welcome']);
  });

  it('jogos, estatísticas e ajuda respondem a comandos', async () => {
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: '/dado 2d6' });
    const d = await waitBotReply(alice.c, general.id, 'arcade', '2d6');
    expect(d.content).toMatch(/2d6: \d+ \+ \d+ = \*\*\d+\*\*/);
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: '/ajuda' });
    const h = await waitBotReply(alice.c, general.id, 'painel', 'Comandos');
    expect(h.content).toContain('/enquete');
  });

  it('bot de enquetes cria votação', async () => {
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: '/enquete "Melhor dia?" "Sábado" "Domingo"' });
    const p = await waitBotReply(alice.c, general.id, 'enquetes', 'Melhor dia');
    expect(p.poll.options.map((o: any) => o.label)).toEqual(['Sábado', 'Domingo']);
  });

  it('bot de lembretes agenda uma notificação', async () => {
    await bob.c.post(`/api/channels/${general.id}/messages`, { content: '/lembrar 10m beber água' });
    await waitBotReply(bob.c, general.id, 'lembretes', 'Combinado');
    const [r] = await app.ctx.db.select().from(reminders).where(eq(reminders.userId, bob.id));
    expect(r.content).toBe('beber água');
    await app.ctx.db.update(reminders).set({ remindAt: new Date(Date.now() - 1000) }).where(eq(reminders.id, r.id));
    const { runDueJobs } = await import('../src/lib/scheduler');
    await runDueJobs(app.ctx);
    const n = await bob.c.get('/api/notifications');
    expect(n.body.notifications.some((x: any) => x.type === 'reminder' && x.body === 'beber água')).toBe(true);
  });

  it('bot de tickets abre um canal privado com a administração', async () => {
    const support = await channelByName(bob.c, 'suporte');
    await bob.c.post(`/api/channels/${support.id}/messages`, { content: '/ticket Problema com meu perfil' });
    await waitBotReply(bob.c, support.id, 'suporte', 'Ticket aberto');
    const s = await bob.c.get('/api/structure');
    const ticket = s.body.channels.find((c: any) => c.type === 'ticket');
    expect(ticket).toBeTruthy();
    expect((await owner.get(`/api/channels/${ticket.id}/messages`)).status).toBe(200);
    expect((await alice.c.get(`/api/channels/${ticket.id}/messages`)).status).toBe(404);
    await bob.c.post(`/api/channels/${ticket.id}/messages`, { content: '/fechar' });
    await waitBotReply(bob.c, ticket.id, 'suporte', 'fechado');
    expect((await bob.c.post(`/api/channels/${ticket.id}/messages`, { content: 'mais algo' })).status).toBe(403);
  });

  it('bot de IA informa quando não está configurado (sem expor segredos)', async () => {
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: '/ia qual o sentido da vida?' });
    const r = await waitBotReply(alice.c, general.id, 'oraculo');
    expect(r.content).toContain('não foi configurado');
  });

  it('bot de boas-vindas cumprimenta quem é aprovado', async () => {
    const n = await member(app, owner, uniq('novo'));
    const w = await waitBotReply(n.c, general.id, 'recepcao', `@${n.username}`);
    expect(w.content).toContain('Boas-vindas');
    const conv = await n.c.get('/api/conversations');
    expect(conv.body.conversations.length).toBe(1);
  });

  it('moderação automática silencia flood', async () => {
    const f = await member(app, owner, uniq('flood'));
    await owner.patch('/api/admin/settings', { moderation: { spamMessagesPer10s: 3, autoTimeoutMinutes: 5 } });
    for (let i = 0; i < 5; i++) await f.c.post(`/api/channels/${general.id}/messages`, { content: `spam ${i}` });
    await sleep(500);
    const [u] = await app.ctx.db.select().from(users).where(eq(users.id, f.id));
    expect(u.mutedUntil!.getTime()).toBeGreaterThan(Date.now());
    app.ctx.perms.invalidateUser(f.id);
    expect((await f.c.post(`/api/channels/${general.id}/messages`, { content: 'de novo' })).status).toBe(403);
    await owner.patch('/api/admin/settings', { moderation: { spamMessagesPer10s: 8 } });
  });

  it('bot personalizado: comando declarativo e script em sandbox', async () => {
    const created = await owner.post('/api/admin/bots', { username: uniq('robo'), displayName: 'Robô' });
    expect(created.status).toBe(200);
    const id = created.body.id;
    expect((await alice.c.post('/api/admin/bots', { username: uniq('x'), displayName: 'x' })).status).toBe(403);
    await owner.post(`/api/admin/bots/${id}/commands`, { name: 'oi', response: 'Olá, {user}! Você disse: {args}' });
    await owner.post(`/api/admin/bots/${id}/commands`, { name: 'contador' });
    await owner.patch(`/api/admin/bots/${id}`, {
      channelIds: [general.id],
      script: 'function onCommand(c){ if(c.name!=="contador") return null; storage.n=(storage.n||0)+1; return "Contagem: "+storage.n; }',
    });
    const botUser = (await owner.get('/api/admin/bots')).body.bots.find((b: any) => b.id === id).username;
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: '/oi tudo bem' });
    const r1 = await waitBotReply(alice.c, general.id, botUser, 'Olá');
    expect(r1.content).toContain('Você disse: tudo bem');
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: '/contador' });
    await waitBotReply(alice.c, general.id, botUser, 'Contagem: 1');
    await alice.c.post(`/api/channels/${general.id}/messages`, { content: '/contador' });
    await waitBotReply(alice.c, general.id, botUser, 'Contagem: 2');

    // Not authorized in other channels
    const off = await channelByName(alice.c, 'off-topic');
    await alice.c.post(`/api/channels/${off.id}/messages`, { content: '/oi' });
    await sleep(400);
    const list = await alice.c.get(`/api/channels/${off.id}/messages?limit=5`);
    expect(list.body.users.some((u: any) => u.username === botUser)).toBe(false);

    // Sandbox limits surface as errors, not crashes
    const t = await owner.post(`/api/admin/bots/${id}/test`, { script: 'function onCommand(){ while(true){} }' });
    expect(t.body.ok).toBe(false);
    expect(t.body.error).toMatch(/interrupted/);
    const t2 = await owner.post(`/api/admin/bots/${id}/test`, { script: 'function onCommand(){ return typeof require + typeof process }' });
    expect(t2.body.result).toBe('undefinedundefined');
  });

  it('webhook de entrada publica como o bot no canal autorizado', async () => {
    const created = await owner.post('/api/admin/bots', { username: uniq('hook'), displayName: 'Integração' });
    await owner.patch(`/api/admin/bots/${created.body.id}`, { channelIds: [general.id] });
    const w = await owner.post(`/api/admin/bots/${created.body.id}/webhook`, { channelId: general.id });
    const path = new URL(w.body.url).pathname;
    const anon = new Client(app);
    const r = await anon.req('POST', path, { content: 'Deploy concluído ✅' }, { csrf: false });
    expect(r.status).toBe(200);
    const bad = await anon.req('POST', path.replace(/[^/]+$/, 'x'.repeat(43)), { content: 'invasão' }, { csrf: false });
    expect(bad.status).toBe(401);
    const [b] = await app.ctx.db.select().from(bots).where(eq(bots.id, created.body.id));
    expect(b.webhookTokenHash).toHaveLength(64);
  });
});
