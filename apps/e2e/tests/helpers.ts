import fs from 'node:fs';
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const OWNER = { username: 'dono', password: 'Senha-do-dono-123' };
export const PASSWORD = 'Senha-membro-456';
let n = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36).slice(-5)}${++n}`;

/** Latest link of a given kind e-mailed to an address (server mirrors captured mail to a JSONL file in tests). */
export function mailLink(to: string, path: '/verify-email' | '/reset-password') {
  const lines = fs.existsSync('/tmp/ouroboros-e2e-mail.jsonl') ? fs.readFileSync('/tmp/ouroboros-e2e-mail.jsonl', 'utf8').trim().split('\n') : [];
  for (const line of lines.reverse()) {
    const m = JSON.parse(line);
    if (m.to !== to) continue;
    const link = m.text.match(new RegExp(`https?://[^\\s]+${path}\\?token=[A-Za-z0-9_-]+`));
    if (link) return new URL(link[0]).pathname + new URL(link[0]).search;
  }
  return null;
}

async function csrf(req: APIRequestContext) {
  await req.get('/api/auth/csrf');
  const state = await req.storageState();
  return state.cookies.find((c) => c.name === 'ouroboros_csrf')?.value ?? '';
}

export async function apiPost(req: APIRequestContext, url: string, data: unknown) {
  const res = await req.post(url, { data, headers: { 'x-csrf-token': await csrf(req) } });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

export async function loginPage(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário ou e-mail').fill(username);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Fast setup through the real API: register, verify e-mail, owner approves, then a logged-in page. */
export async function approvedMember(browser: Browser, ownerReq: APIRequestContext, prefix = 'membro') {
  const username = uniq(prefix);
  const email = `${username}@ouroboros.test`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const reg = await apiPost(page.request, '/api/auth/register', { username, email, password: PASSWORD, introduction: 'Criado pelo teste', acceptTerms: true });
  expect(reg.status).toBe(201);
  const link = mailLink(email, '/verify-email');
  expect(link).toBeTruthy();
  const token = new URL(`http://x${link}`).searchParams.get('token');
  expect((await apiPost(page.request, '/api/auth/verify-email', { token })).status).toBe(200);
  const reqs = await ownerReq.get('/api/admin/requests?status=pending');
  const r = (await reqs.json()).find((x: any) => x.username === username);
  expect((await apiPost(ownerReq, `/api/admin/requests/${r.userId}/approve`, {})).status).toBe(200);
  await loginPage(page, username, PASSWORD);
  await page.waitForURL(/\/app/);
  return { page, ctx, username, email, userId: r.userId as string };
}

export async function ownerSession(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginPage(page, OWNER.username, OWNER.password);
  await page.waitForURL(/\/app/);
  return { ctx, page };
}

export async function openChannel(page: Page, name: string) {
  await page.getByRole('link', { name, exact: false }).first().click();
  await expect(page.locator('header h1')).toContainText(name);
}
