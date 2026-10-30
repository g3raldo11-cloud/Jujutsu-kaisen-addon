import { sql } from 'drizzle-orm';
import { buildApp, type BuiltApp } from '../src/app';
import { hashPassword } from '../src/lib/crypto';
import { accessRequests, userProfiles, users } from '../src/db/schema';

export type Res = { status: number; body: any; headers: Record<string, any> };

/** Minimal browser-like client over fastify.inject: keeps cookies and sends the CSRF header. */
export class Client {
  cookies: Record<string, string> = {};
  constructor(private built: BuiltApp) {}

  private store(setCookie: string | string[] | undefined) {
    for (const c of ([] as string[]).concat(setCookie ?? [])) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=Thu, 01 Jan 1970/i.test(a));
      if (expired || value === '') delete this.cookies[name];
      else this.cookies[name] = value;
    }
  }

  cookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async req(method: string, url: string, payload?: unknown, opts: { csrf?: boolean; headers?: Record<string, string> } = {}): Promise<Res> {
    if (!this.cookies.ouroboros_csrf) this.store((await this.built.app.inject({ method: 'GET', url: '/api/auth/csrf' })).headers['set-cookie'] as string[]);
    const headers: Record<string, string> = { cookie: this.cookieHeader(), ...(opts.headers ?? {}) };
    if (opts.csrf !== false && method !== 'GET') headers['x-csrf-token'] = this.cookies.ouroboros_csrf;
    const res = await this.built.app.inject({ method: method as never, url, payload: payload as never, headers });
    this.store(res.headers['set-cookie'] as string[]);
    let body: any = res.body;
    try {
      body = JSON.parse(res.body);
    } catch {
      /* not json */
    }
    return { status: res.statusCode, body, headers: res.headers };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body: unknown = {}) => this.req('POST', url, body);
  patch = (url: string, body: unknown = {}) => this.req('PATCH', url, body);
  put = (url: string, body: unknown = {}) => this.req('PUT', url, body);
  del = (url: string, body?: unknown) => this.req('DELETE', url, body);
}

let shared: BuiltApp | null = null;
export async function getApp() {
  shared ??= await buildApp();
  return shared;
}

export const PASSWORD = 'Senha-forte-123';
let counter = 0;
export const uniq = (p = 'u') => `${p}${Date.now().toString(36).slice(-4)}${++counter}`;

export async function ensureOwner(built: BuiltApp) {
  const [o] = await built.ctx.db.select().from(users).where(sql`${users.isOwner} = true`);
  if (!o) {
    const [u] = await built.ctx.db
      .insert(users)
      .values({ username: 'dono', email: 'dono@example.com', passwordHash: await hashPassword(PASSWORD), status: 'approved', isOwner: true, emailVerifiedAt: new Date() })
      .returning();
    await built.ctx.db.insert(userProfiles).values({ userId: u.id, displayName: 'Dono' });
    await built.ctx.db.insert(accessRequests).values({ userId: u.id, status: 'approved' });
  }
  const c = new Client(built);
  const r = await c.post('/api/auth/login', { login: 'dono', password: PASSWORD });
  if (r.status !== 200) throw new Error(`owner login failed: ${JSON.stringify(r.body)}`);
  return c;
}

/** Extracts the latest token link sent to an address. */
export function tokenFromMail(built: BuiltApp, to: string, path: string) {
  const mail = [...built.ctx.mailer.outbox].reverse().find((m) => m.to === to && m.text.includes(path));
  const m = mail?.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  return m?.[1] ?? null;
}

export async function register(built: BuiltApp, username = uniq(), introduction = 'Oi!') {
  const c = new Client(built);
  const email = `${username}@example.com`;
  const r = await c.post('/api/auth/register', { username, email, password: PASSWORD, introduction, acceptTerms: true });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  return { c, username, email };
}

export async function verify(built: BuiltApp, email: string) {
  const token = tokenFromMail(built, email, '/verify-email');
  const c = new Client(built);
  return c.post('/api/auth/verify-email', { token });
}

/** Registers, verifies, gets approved by the owner and logs in. */
export async function member(built: BuiltApp, owner: Client, username = uniq()) {
  const { email } = await register(built, username);
  await verify(built, email);
  const [u] = await built.ctx.db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
  const r = await owner.post(`/api/admin/requests/${u.id}/approve`, {});
  if (r.status !== 200) throw new Error(`approve failed: ${JSON.stringify(r.body)}`);
  const c = new Client(built);
  const l = await c.post('/api/auth/login', { login: username, password: PASSWORD });
  if (l.status !== 200) throw new Error(`login failed: ${JSON.stringify(l.body)}`);
  return { c, id: u.id as string, username, email };
}

export async function channelByName(c: Client, name: string) {
  const s = await c.get('/api/structure');
  return s.body.channels.find((x: any) => x.name === name);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
