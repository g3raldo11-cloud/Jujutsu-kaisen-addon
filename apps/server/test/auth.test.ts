import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import { Client, ensureOwner, getApp, member, PASSWORD, register, tokenFromMail, uniq, verify } from './helpers';
import { auditLogs, users } from '../src/db/schema';
import type { BuiltApp } from '../src/app';

let app: BuiltApp;
let owner: Client;

beforeAll(async () => {
  app = await getApp();
  owner = await ensureOwner(app);
});
afterAll(async () => {
  await app.close();
});

describe('cadastro e aprovação', () => {
  it('cadastro cria conta pendente e exige confirmação de e-mail', async () => {
    const { username, email } = await register(app, uniq('ana'), 'Sou a Ana, amiga do João');
    const [u] = await app.ctx.db.select().from(users).where(eq(users.username, username));
    expect(u.status).toBe('pending');
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);

    const c = new Client(app);
    await c.post('/api/auth/login', { login: username, password: PASSWORD });
    const me = await c.get('/api/auth/me');
    expect(me.body.state).toBe('unverified');

    const v = await verify(app, email);
    expect(v.status).toBe(200);
    const me2 = await c.get('/api/auth/me');
    expect(me2.body.state).toBe('pending');
    expect(me2.body.permissions).toEqual([]);
  });

  it('o administrador é notificado e vê a solicitação com os dados exigidos', async () => {
    const { username, email } = await register(app, uniq('bia'), 'Apresentação voluntária');
    await verify(app, email);
    const notes = await owner.get('/api/notifications');
    expect(notes.body.notifications.some((n: any) => n.type === 'access_request' && n.body.includes(username))).toBe(true);
    const list = await owner.get('/api/admin/requests?status=pending');
    const r = list.body.find((x: any) => x.username === username);
    expect(r).toMatchObject({ email, introduction: 'Apresentação voluntária', status: 'pending', emailVerified: true });
    expect(r.createdAt).toBeTruthy();
    expect('lastAccessAttemptAt' in r).toBe(true);
  });

  it('usuário pendente não acessa nenhuma API privada (validação no servidor)', async () => {
    const { username, email } = await register(app, uniq('pend'));
    await verify(app, email);
    const c = new Client(app);
    const login = await c.post('/api/auth/login', { login: username, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.state).toBe('pending');
    const general = (await owner.get('/api/structure')).body.channels.find((x: any) => x.name === 'geral');
    for (const url of ['/api/structure', '/api/members', `/api/channels/${general.id}/messages`, '/api/conversations', '/api/search?q=oi', '/api/events', '/api/files/mine', '/api/rtc/ice-servers']) {
      const r = await c.get(url);
      expect(r.status, url).toBe(403);
      expect(r.body.error.code).toBe('ACCOUNT_PENDING');
    }
    const send = await c.post(`/api/channels/${general.id}/messages`, { content: 'oi' });
    expect(send.status).toBe(403);
    const [u] = await app.ctx.db.select().from(users).where(eq(users.username, username));
    expect(u.lastAccessAttemptAt).not.toBeNull();
  });

  it('aceitar libera acesso; rejeitar e bloquear impedem login', async () => {
    const m = await member(app, owner, uniq('ok'));
    expect((await m.c.get('/api/structure')).status).toBe(200);
    const me = await m.c.get('/api/auth/me');
    expect(me.body.state).toBe('ok');

    const rej = await register(app, uniq('rej'));
    await verify(app, rej.email);
    const [ru] = await app.ctx.db.select().from(users).where(eq(users.username, rej.username));
    expect((await owner.post(`/api/admin/requests/${ru.id}/reject`, { note: 'não conhecemos' })).status).toBe(200);
    const l = await new Client(app).post('/api/auth/login', { login: rej.username, password: PASSWORD });
    expect(l.status).toBe(403);
    expect(l.body.error.code).toBe('ACCOUNT_REJECTED');

    const blk = await register(app, uniq('blk'));
    await verify(app, blk.email);
    const [bu] = await app.ctx.db.select().from(users).where(eq(users.username, blk.username));
    expect((await owner.post(`/api/admin/requests/${bu.id}/block`, {})).status).toBe(200);
    const l2 = await new Client(app).post('/api/auth/login', { login: blk.username, password: PASSWORD });
    expect(l2.body.error.code).toBe('ACCOUNT_BANNED');

    const logs = await app.ctx.db.select().from(auditLogs).where(eq(auditLogs.targetId, bu.id));
    expect(logs.some((x) => x.action === 'request.blocked')).toBe(true);
  });

  it('membros comuns não podem aprovar ninguém', async () => {
    const m = await member(app, owner, uniq('mm'));
    const other = await register(app, uniq('x'));
    await verify(app, other.email);
    const [u] = await app.ctx.db.select().from(users).where(eq(users.username, other.username));
    const r = await m.c.post(`/api/admin/requests/${u.id}/approve`, {});
    expect(r.status).toBe(403);
    expect((await m.c.get('/api/admin/requests')).status).toBe(403);
  });

  it('e-mail já cadastrado responde igual (sem enumeração) e avisa o dono do e-mail', async () => {
    const { email } = await register(app, uniq('dup'));
    const c = new Client(app);
    const r = await c.post('/api/auth/register', { username: uniq('dup2'), email, password: PASSWORD, acceptTerms: true });
    expect(r.status).toBe(201);
    expect(app.ctx.mailer.outbox.some((m) => m.to === email && m.subject.includes('Tentativa de cadastro'))).toBe(true);
  });
});

describe('segurança da autenticação', () => {
  it('rejeita requisições sem token CSRF', async () => {
    const c = new Client(app);
    const r = await c.req('POST', '/api/auth/login', { login: 'dono', password: PASSWORD }, { csrf: false });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF');
  });

  it('bloqueia a conta após tentativas repetidas (força bruta)', async () => {
    const m = await member(app, owner, uniq('bf'));
    const c = new Client(app);
    for (let i = 0; i < 5; i++) expect((await c.post('/api/auth/login', { login: m.username, password: 'errada-123456' })).status).toBe(401);
    const locked = await c.post('/api/auth/login', { login: m.username, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('recuperação de senha é de uso único e revoga as sessões', async () => {
    const m = await member(app, owner, uniq('rs'));
    expect((await m.c.get('/api/structure')).status).toBe(200);
    await new Client(app).post('/api/auth/forgot-password', { email: m.email });
    const token = tokenFromMail(app, m.email, '/reset-password');
    expect(token).toBeTruthy();
    const r = await new Client(app).post('/api/auth/reset-password', { token, password: 'Nova-senha-456' });
    expect(r.status).toBe(200);
    expect((await m.c.get('/api/structure')).status).toBe(401);
    const again = await new Client(app).post('/api/auth/reset-password', { token, password: 'Outra-senha-789' });
    expect(again.status).toBe(400);
    expect((await new Client(app).post('/api/auth/login', { login: m.username, password: 'Nova-senha-456' })).status).toBe(200);
  });

  it('sessões podem ser listadas e revogadas', async () => {
    const m = await member(app, owner, uniq('ss'));
    const second = new Client(app);
    await second.post('/api/auth/login', { login: m.username, password: PASSWORD });
    const list = await m.c.get('/api/auth/sessions');
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    const other = list.body.find((s: any) => !s.current);
    expect((await m.c.del(`/api/auth/sessions/${other.id}`)).status).toBe(200);
    expect((await second.get('/api/auth/me')).status).toBe(401);
    expect((await m.c.get('/api/auth/me')).status).toBe(200);
  });

  it('autenticação em dois fatores (TOTP) é exigida no login quando ativada', async () => {
    const m = await member(app, owner, uniq('tf'));
    const setup = await m.c.post('/api/auth/totp/setup');
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.body.secret) });
    expect((await m.c.post('/api/auth/totp/enable', { code: totp.generate() })).status).toBe(200);
    const c = new Client(app);
    const r1 = await c.post('/api/auth/login', { login: m.username, password: PASSWORD });
    expect(r1.body.error.code).toBe('TOTP_REQUIRED');
    const r2 = await c.post('/api/auth/login', { login: m.username, password: PASSWORD, totp: '000000' === totp.generate() ? '111111' : '000000' });
    expect(r2.status).toBe(401);
    const r3 = await c.post('/api/auth/login', { login: m.username, password: PASSWORD, totp: totp.generate() });
    expect(r3.status).toBe(200);
    const [u] = await app.ctx.db.select().from(users).where(eq(users.id, m.id));
    expect(u.totpSecret).toMatch(/^v1\./); // stored encrypted
  });
});

describe('privilégios', () => {
  it('ninguém eleva os próprios privilégios', async () => {
    const roles = (await owner.get('/api/roles')).body;
    const adminRole = roles.find((r: any) => r.name === 'Administrador');
    const modRole = roles.find((r: any) => r.name === 'Moderador');
    const admin = await member(app, owner, uniq('adm'));
    expect((await owner.put(`/api/admin/members/${admin.id}/roles`, { roleIds: [adminRole.id] })).status).toBe(200);

    // Cannot change own roles
    expect((await admin.c.put(`/api/admin/members/${admin.id}/roles`, { roleIds: [adminRole.id, modRole.id] })).status).toBe(403);
    // Admin role lacks MANAGE_ROLES; cannot create roles with ADMINISTRATOR
    expect((await admin.c.post('/api/roles', { name: 'Deus', permissions: ['administrator'] })).status).toBe(403);
    // Cannot act on the owner
    const [o] = await app.ctx.db.select().from(users).where(sql`${users.isOwner} = true`);
    expect((await admin.c.post(`/api/admin/members/${o.id}/ban`, { reason: 'x' })).status).toBe(403);
    // Cannot moderate someone with an equal role
    const admin2 = await member(app, owner, uniq('adm'));
    await owner.put(`/api/admin/members/${admin2.id}/roles`, { roleIds: [adminRole.id] });
    expect((await admin.c.post(`/api/admin/members/${admin2.id}/suspend`, { hours: 1 })).status).toBe(403);
    // But can moderate a regular member
    const plain = await member(app, owner, uniq('pl'));
    expect((await admin.c.post(`/api/admin/members/${plain.id}/suspend`, { hours: 1, reason: 'teste' })).status).toBe(200);
    expect((await plain.c.get('/api/structure')).status).toBe(401);
  });

  it('o banco garante um único proprietário', async () => {
    await expect(
      app.ctx.db.insert(users).values({ username: uniq('o2'), email: `${uniq('o2')}@x.com`, isOwner: true, status: 'approved' }),
    ).rejects.toThrow();
  });

  it('suspensão expira automaticamente', async () => {
    const m = await member(app, owner, uniq('sp'));
    await owner.post(`/api/admin/members/${m.id}/suspend`, { hours: 1 });
    expect((await new Client(app).post('/api/auth/login', { login: m.username, password: PASSWORD })).body.error.code).toBe('ACCOUNT_SUSPENDED');
    await app.ctx.db.update(users).set({ suspendedUntil: new Date(Date.now() - 1000) }).where(eq(users.id, m.id));
    app.ctx.perms.invalidateUser(m.id);
    const c = new Client(app);
    expect((await c.post('/api/auth/login', { login: m.username, password: PASSWORD })).status).toBe(200);
    expect((await c.get('/api/structure')).status).toBe(200);
  });

  it('modo manutenção bloqueia membros mas não o proprietário', async () => {
    const m = await member(app, owner, uniq('mt'));
    expect((await owner.patch('/api/admin/settings', { maintenance: { enabled: true, message: 'Volto já' } })).status).toBe(200);
    const r = await m.c.get('/api/structure');
    expect(r.status).toBe(503);
    expect(r.body.error.message).toBe('Volto já');
    expect((await owner.get('/api/structure')).status).toBe(200);
    await owner.patch('/api/admin/settings', { maintenance: { enabled: false } });
    expect((await m.c.get('/api/structure')).status).toBe(200);
  });
});
