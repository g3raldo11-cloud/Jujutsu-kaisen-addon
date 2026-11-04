import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { channelByName, Client, ensureOwner, getApp, member, uniq } from './helpers';
import { auditLogs } from '../src/db/schema';
import type { BuiltApp } from '../src/app';

let app: BuiltApp;
let owner: Client;
let alice: Awaited<ReturnType<typeof member>>;
let bob: Awaited<ReturnType<typeof member>>;
let general: any;

beforeAll(async () => {
  app = await getApp();
  owner = await ensureOwner(app);
  alice = await member(app, owner, uniq('alice'));
  bob = await member(app, owner, uniq('bob'));
  general = await channelByName(alice.c, 'geral');
});
afterAll(async () => {
  await app.close();
});

describe('mensagens', () => {
  it('envia, lista, responde, menciona e notifica', async () => {
    const m1 = await alice.c.post(`/api/channels/${general.id}/messages`, { content: 'Olá pessoal!' });
    expect(m1.status).toBe(201);
    const m2 = await bob.c.post(`/api/channels/${general.id}/messages`, { content: `Oi @${alice.username}!`, replyToId: m1.body.id });
    expect(m2.status).toBe(201);
    expect(m2.body.replyTo.id).toBe(m1.body.id);
    expect(m2.body.mentionIds).toContain(alice.id);

    const list = await alice.c.get(`/api/channels/${general.id}/messages?limit=10`);
    expect(list.body.messages.map((m: any) => m.id)).toEqual(expect.arrayContaining([m1.body.id, m2.body.id]));
    expect(list.body.users.some((u: any) => u.id === bob.id)).toBe(true);

    const notes = await alice.c.get('/api/notifications');
    expect(notes.body.notifications.some((n: any) => n.type === 'mention')).toBe(true);
  });

  it('reações, fixação (apenas moderação) e edição com histórico', async () => {
    const m = await alice.c.post(`/api/channels/${general.id}/messages`, { content: 'versão 1' });
    expect((await bob.c.put(`/api/messages/${m.body.id}/reactions/${encodeURIComponent('🔥')}`)).status).toBe(200);
    expect((await bob.c.put(`/api/messages/${m.body.id}/reactions/${encodeURIComponent('<script>')}`)).status).toBe(400);
    expect((await bob.c.put(`/api/messages/${m.body.id}/pin`)).status).toBe(403);
    expect((await owner.put(`/api/messages/${m.body.id}/pin`)).status).toBe(200);
    expect((await bob.c.patch(`/api/messages/${m.body.id}`, { content: 'hack' })).status).toBe(403);
    const ed = await alice.c.patch(`/api/messages/${m.body.id}`, { content: 'versão 2' });
    expect(ed.body.content).toBe('versão 2');
    expect(ed.body.editedAt).toBeTruthy();
    const hist = await alice.c.get(`/api/messages/${m.body.id}/edits`);
    expect(hist.body[0].previousContent).toBe('versão 1');
    const list = await alice.c.get(`/api/channels/${general.id}/messages?around=${m.body.id}&limit=5`);
    const found = list.body.messages.find((x: any) => x.id === m.body.id);
    expect(found.reactions[0]).toMatchObject({ emoji: '🔥', count: 1 });
    expect(found.pinnedAt).toBeTruthy();
  });

  it('exclusão: autor apaga a sua; moderador apaga de outros e fica auditado', async () => {
    const m = await alice.c.post(`/api/channels/${general.id}/messages`, { content: 'apague-me' });
    expect((await bob.c.del(`/api/messages/${m.body.id}`)).status).toBe(403);
    expect((await owner.del(`/api/messages/${m.body.id}`)).status).toBe(200);
    const logs = await app.ctx.db.select().from(auditLogs).where(eq(auditLogs.targetId, m.body.id));
    expect(logs[0].action).toBe('message.delete');
    const list = await alice.c.get(`/api/channels/${general.id}/messages?around=${m.body.id}&limit=3`);
    const d = list.body.messages.find((x: any) => x.id === m.body.id);
    expect(d.deleted).toBe(true);
    expect(d.content).toBe('');
  });

  it('threads', async () => {
    const root = await alice.c.post(`/api/channels/${general.id}/messages`, { content: 'Tema para thread' });
    const t = await bob.c.post(`/api/messages/${root.body.id}/thread`, { title: 'Debate' });
    expect(t.status).toBe(200);
    const r = await bob.c.post(`/api/channels/${general.id}/messages`, { content: 'na thread', threadId: t.body.id });
    expect(r.status).toBe(201);
    const inThread = await alice.c.get(`/api/channels/${general.id}/messages?threadId=${t.body.id}`);
    expect(inThread.body.messages).toHaveLength(1);
    const main = await alice.c.get(`/api/channels/${general.id}/messages?limit=50`);
    expect(main.body.messages.some((m: any) => m.id === r.body.id)).toBe(false);
    expect(main.body.messages.find((m: any) => m.id === root.body.id).thread.messageCount).toBe(1);
  });

  it('canal de anúncios: membros leem mas não escrevem', async () => {
    const ann = await channelByName(alice.c, 'anuncios');
    expect(ann.permissions).toContain('view_channel');
    expect(ann.permissions).not.toContain('send_messages');
    expect((await alice.c.post(`/api/channels/${ann.id}/messages`, { content: 'x' })).status).toBe(403);
    expect((await owner.post(`/api/channels/${ann.id}/messages`, { content: 'Comunicado' })).status).toBe(201);
  });

  it('canais privados só são visíveis para os membros escolhidos', async () => {
    const space = (await owner.get('/api/structure')).body.spaces[0];
    const priv = await owner.post('/api/channels', { spaceId: space.id, type: 'text', name: 'secreto', isPrivate: true, memberIds: [alice.id] });
    expect(priv.status).toBe(200);
    expect(await channelByName(alice.c, 'secreto')).toBeTruthy();
    expect(await channelByName(bob.c, 'secreto')).toBeUndefined();
    expect((await bob.c.get(`/api/channels/${priv.body.id}/messages`)).status).toBe(404);
    await alice.c.post(`/api/channels/${priv.body.id}/messages`, { content: 'palavra-ultrassecreta' });
    const search = await bob.c.get('/api/search?q=ultrassecreta&type=messages');
    expect(search.body.messages).toHaveLength(0);
    const search2 = await alice.c.get('/api/search?q=ultrassecreta&type=messages');
    expect(search2.body.messages).toHaveLength(1);
  });

  it('permissões por canal (overwrites) negam envio para um cargo', async () => {
    const space = (await owner.get('/api/structure')).body.spaces[0];
    const roles = (await owner.get('/api/roles')).body;
    const memberRole = roles.find((r: any) => r.isDefault);
    const ch = await owner.post('/api/channels', {
      spaceId: space.id,
      type: 'text',
      name: 'somente-leitura',
      overwrites: [{ targetType: 'role', targetId: memberRole.id, allow: [], deny: ['send_messages', 'add_reactions'] }],
    });
    const seen = await channelByName(bob.c, 'somente-leitura');
    expect(seen.permissions).toContain('view_channel');
    expect(seen.permissions).not.toContain('send_messages');
    expect((await bob.c.post(`/api/channels/${ch.body.id}/messages`, { content: 'x' })).status).toBe(403);
  });

  it('salas com senha exigem desbloqueio', async () => {
    const space = (await owner.get('/api/structure')).body.spaces[0];
    const ch = await owner.post('/api/channels', { spaceId: space.id, type: 'text', name: 'cofre', password: 'abre-te-sesamo' });
    expect((await bob.c.get(`/api/channels/${ch.body.id}/messages`)).body.error.code).toBe('CHANNEL_LOCKED');
    expect((await bob.c.post(`/api/channels/${ch.body.id}/unlock`, { password: 'errada' })).status).toBe(400);
    expect((await bob.c.post(`/api/channels/${ch.body.id}/unlock`, { password: 'abre-te-sesamo' })).status).toBe(200);
    expect((await bob.c.get(`/api/channels/${ch.body.id}/messages`)).status).toBe(200);
  });

  it('modo lento e silenciamento temporário', async () => {
    const space = (await owner.get('/api/structure')).body.spaces[0];
    const ch = await owner.post('/api/channels', { spaceId: space.id, type: 'text', name: 'devagar', slowmodeSeconds: 30 });
    expect((await bob.c.post(`/api/channels/${ch.body.id}/messages`, { content: '1' })).status).toBe(201);
    const second = await bob.c.post(`/api/channels/${ch.body.id}/messages`, { content: '2' });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('SLOWMODE');

    const carl = await member(app, owner, uniq('carl'));
    await owner.post(`/api/admin/members/${carl.id}/timeout`, { minutes: 10, reason: 'calma' });
    expect((await carl.c.post(`/api/channels/${general.id}/messages`, { content: 'oi' })).status).toBe(403);
    await owner.del(`/api/admin/members/${carl.id}/timeout`);
    expect((await carl.c.post(`/api/channels/${general.id}/messages`, { content: 'oi' })).status).toBe(201);
  });

  it('palavras e links bloqueados são recusados antes de publicar', async () => {
    await owner.patch('/api/admin/settings', { moderation: { blockedWords: ['proibidão'] } });
    expect((await bob.c.post(`/api/channels/${general.id}/messages`, { content: 'isso é proibidão mesmo' })).body.error.code).toBe('BLOCKED_CONTENT');
    expect((await bob.c.post(`/api/channels/${general.id}/messages`, { content: 'veja https://grabify.link/abc' })).body.error.code).toBe('BLOCKED_CONTENT');
    expect((await bob.c.post(`/api/channels/${general.id}/messages`, { content: 'link ok https://example.com' })).status).toBe(201);
  });

  it('enquetes em tempo real', async () => {
    const p = await alice.c.post(`/api/channels/${general.id}/polls`, { question: 'Pizza ou sushi?', options: ['Pizza', 'Sushi'] });
    expect(p.status).toBe(201);
    const list = await alice.c.get(`/api/channels/${general.id}/messages?limit=5`);
    const poll = list.body.messages.find((m: any) => m.id === p.body.id).poll;
    expect((await bob.c.post(`/api/polls/${poll.id}/vote`, { optionIds: ['2'] })).status).toBe(200);
    expect((await bob.c.post(`/api/polls/${poll.id}/vote`, { optionIds: ['1', '2'] })).status).toBe(400);
    const after = await alice.c.get(`/api/channels/${general.id}/messages?limit=5`);
    const p2 = after.body.messages.find((m: any) => m.id === p.body.id).poll;
    expect(p2.options.find((o: any) => o.id === '2').votes).toBe(1);
  });

  it('mensagens agendadas são enviadas pelo agendador', async () => {
    const when = new Date(Date.now() + 61_000).toISOString();
    const s = await alice.c.post(`/api/channels/${general.id}/messages`, { content: 'mensagem do futuro', scheduledFor: when });
    expect(s.status).toBe(202);
    const { scheduledMessages } = await import('../src/db/schema');
    await app.ctx.db.update(scheduledMessages).set({ sendAt: new Date(Date.now() - 1000) }).where(eq(scheduledMessages.id, s.body.scheduled.id));
    const { runDueJobs } = await import('../src/lib/scheduler');
    await runDueJobs(app.ctx);
    const list = await alice.c.get(`/api/channels/${general.id}/messages?limit=5`);
    expect(list.body.messages.some((m: any) => m.content === 'mensagem do futuro')).toBe(true);
  });
});

describe('mensagens privadas e amizades', () => {
  it('DMs são privadas — nem o proprietário lê', async () => {
    const dm = await alice.c.post('/api/conversations/dm', { userId: bob.id });
    expect(dm.status).toBe(200);
    await alice.c.post(`/api/channels/${dm.body.id}/messages`, { content: 'segredo entre nós' });
    expect((await bob.c.get(`/api/channels/${dm.body.id}/messages`)).body.messages[0].content).toBe('segredo entre nós');
    expect((await owner.get(`/api/channels/${dm.body.id}/messages`)).status).toBe(404);
    const again = await bob.c.post('/api/conversations/dm', { userId: alice.id });
    expect(again.body.id).toBe(dm.body.id);
  });

  it('amizade: solicitar, aceitar, remover e bloquear', async () => {
    const d = await member(app, owner, uniq('dan'));
    const req = await d.c.post('/api/friends/requests', { username: alice.username });
    expect(req.body.status).toBe('pending');
    const inc = await alice.c.get('/api/friends');
    const r = inc.body.incoming.find((x: any) => x.userId === d.id);
    expect((await alice.c.post(`/api/friends/requests/${r.id}/accept`)).status).toBe(200);
    expect((await d.c.get('/api/friends')).body.friends.some((f: any) => f.userId === alice.id)).toBe(true);

    expect((await alice.c.put(`/api/blocks/${d.id}`)).status).toBe(200);
    expect((await d.c.get('/api/friends')).body.friends).toHaveLength(0);
    const dm = await d.c.post('/api/conversations/dm', { userId: alice.id });
    expect(dm.status).toBe(403);
  });

  it('respeita a preferência "só amigos" para DMs', async () => {
    const e = await member(app, owner, uniq('eve'));
    await e.c.patch('/api/me/preferences', { privacy: { allowDms: 'friends' } });
    expect((await bob.c.post('/api/conversations/dm', { userId: e.id })).status).toBe(403);
  });

  it('grupos privados', async () => {
    const g = await alice.c.post('/api/conversations/group', { name: 'Projeto X', memberIds: [bob.id] });
    expect(g.status).toBe(200);
    expect((await bob.c.post(`/api/channels/${g.body.id}/messages`, { content: 'oi grupo' })).status).toBe(201);
    const conv = await bob.c.get('/api/conversations');
    expect(conv.body.conversations.some((c: any) => c.id === g.body.id && c.type === 'group_dm')).toBe(true);
    expect((await owner.get(`/api/channels/${g.body.id}/messages`)).status).toBe(404);
  });
});

describe('fórum', () => {
  it('tópicos, comentários, curtidas, tags, ordenação e histórico de edição', async () => {
    const forum = await channelByName(alice.c, 'discussoes');
    const p = await alice.c.post(`/api/channels/${forum.id}/posts`, { title: 'Qual o melhor editor?', content: 'Vamos debater', tags: ['Ferramentas'] });
    expect(p.status).toBe(200);
    expect(p.body.tags).toEqual(['ferramentas']);
    await bob.c.put(`/api/posts/${p.body.id}/reactions/${encodeURIComponent('❤')}`);
    const c = await bob.c.post(`/api/posts/${p.body.id}/comments`, { content: 'Vim!' });
    expect(c.status).toBe(200);
    await alice.c.patch(`/api/posts/${p.body.id}`, { content: 'Vamos debater com respeito' });
    const view = await bob.c.get(`/api/posts/${p.body.id}`);
    expect(view.body.post.likeCount).toBe(1);
    expect(view.body.comments).toHaveLength(1);
    expect((await bob.c.get(`/api/posts/${p.body.id}/edits`)).body[0].previousContent).toBe('Vamos debater');
    const byTag = await bob.c.get(`/api/channels/${forum.id}/posts?tag=ferramentas&sort=top`);
    expect(byTag.body.posts[0].id).toBe(p.body.id);
    const search = await bob.c.get(`/api/channels/${forum.id}/posts?q=editor`);
    expect(search.body.posts).toHaveLength(1);
    const popular = await bob.c.get('/api/forum/popular');
    expect(popular.body.posts.some((x: any) => x.id === p.body.id)).toBe(true);
    expect((await bob.c.patch(`/api/posts/${p.body.id}`, { pinned: true })).status).toBe(403);
    expect((await owner.patch(`/api/posts/${p.body.id}`, { locked: true })).status).toBe(200);
    expect((await bob.c.post(`/api/posts/${p.body.id}/comments`, { content: 'depois de trancar' })).status).toBe(400);
  });
});

describe('denúncias e moderação', () => {
  it('membro denuncia, staff resolve aplicando advertência e remoção', async () => {
    const m = await bob.c.post(`/api/channels/${general.id}/messages`, { content: 'conteúdo ofensivo' });
    expect((await alice.c.post('/api/reports', { targetType: 'message', targetId: m.body.id, reason: 'harassment', details: 'ofensa' })).status).toBe(200);
    expect((await alice.c.post('/api/reports', { targetType: 'message', targetId: m.body.id, reason: 'harassment' })).status).toBe(409);
    const list = await owner.get('/api/admin/reports');
    const r = list.body.reports.find((x: any) => x.targetId === m.body.id);
    expect(r.snapshot.content).toBe('conteúdo ofensivo');
    expect((await owner.post(`/api/admin/reports/${r.id}/resolve`, { status: 'resolved', actions: ['delete_content', 'warn'], note: 'Advertido' })).status).toBe(200);
    const after = await alice.c.get(`/api/channels/${general.id}/messages?around=${m.body.id}&limit=3`);
    expect(after.body.messages.find((x: any) => x.id === m.body.id).deleted).toBe(true);
    const w = await owner.get(`/api/admin/members/${bob.id}/warnings`);
    expect(w.body).toHaveLength(1);
  });
});

describe('eventos', () => {
  it('cria evento recorrente, inscreve e exporta ICS', async () => {
    const start = new Date(Date.now() + 2 * 86400_000).toISOString();
    const ev = await owner.post('/api/events', { title: 'Noite de jogos', startsAt: start, recurrence: 'weekly', reminderMinutes: [15], capacity: 2 });
    expect(ev.status).toBe(200);
    expect((await alice.c.post('/api/events', { title: 'x', startsAt: start })).status).toBe(403);
    expect((await alice.c.put(`/api/events/${ev.body.id}/rsvp`, { status: 'going' })).status).toBe(200);
    expect((await bob.c.put(`/api/events/${ev.body.id}/rsvp`, { status: 'going' })).status).toBe(400); // capacity: owner + alice
    const list = await alice.c.get(`/api/events?to=${new Date(Date.now() + 30 * 86400_000).toISOString()}`);
    const occ = list.body.events.filter((e: any) => e.id === ev.body.id);
    expect(occ.length).toBeGreaterThanOrEqual(4);
    expect(occ[0].myStatus).toBe('going');
    const ics = await alice.c.get('/api/events/calendar.ics');
    expect(ics.body).toContain('BEGIN:VCALENDAR');
    expect(ics.body).toContain('RRULE:FREQ=WEEKLY');
  });
});

describe('administração', () => {
  it('estatísticas, logs administrativos e configurações', async () => {
    const st = await owner.get('/api/admin/stats');
    expect(st.status).toBe(200);
    expect(st.body.members).toBeGreaterThanOrEqual(3);
    expect(st.body).toHaveProperty('pendingRequests');
    expect(st.body).toHaveProperty('activeBots');
    const audit = await owner.get('/api/admin/audit?limit=200');
    expect(audit.body.entries.some((e: any) => e.action === 'request.approved')).toBe(true);
    expect((await alice.c.get('/api/admin/audit')).status).toBe(403);
    const set = await owner.patch('/api/admin/settings', { communityName: 'Círculo', uploads: { maxFileSizeMb: 25 } });
    expect(set.body.communityName).toBe('Círculo');
    expect((await new Client(app).get('/api/public/community')).body.communityName).toBe('Círculo');
    expect((await alice.c.patch('/api/admin/settings', { communityName: 'hack' })).status).toBe(403);
  });

  it('remoção de membro apaga a conta e mantém as mensagens sem autor', async () => {
    const z = await member(app, owner, uniq('zed'));
    const m = await z.c.post(`/api/channels/${general.id}/messages`, { content: 'mensagem que fica' });
    expect((await owner.del(`/api/admin/members/${z.id}`)).status).toBe(200);
    expect((await z.c.get('/api/auth/me')).status).toBe(401);
    const list = await alice.c.get(`/api/channels/${general.id}/messages?around=${m.body.id}&limit=3`);
    expect(list.body.messages.find((x: any) => x.id === m.body.id).authorId).toBeNull();
  });
});
