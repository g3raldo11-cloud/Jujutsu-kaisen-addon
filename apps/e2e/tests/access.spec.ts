import { expect, test } from '@playwright/test';
import { mailLink, ownerSession, PASSWORD, uniq } from './helpers';

test('visitante pede acesso, confirma o e-mail e só entra depois da aprovação do proprietário', async ({ browser, page }) => {
  const username = uniq('visita');
  const email = `${username}@ouroboros.test`;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ouroboros' })).toBeVisible();
  await page.getByRole('link', { name: 'Pedir acesso' }).click();

  await page.getByLabel('Nome de usuário').fill(username);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByLabel(/Apresentação/).fill('Sou amiga da administração.');
  await page.getByLabel(/regras da comunidade/).check();
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeVisible();

  // Before confirming the e-mail: logged in, but every private API is refused by the server.
  await page.goto('/login');
  await page.getByLabel('Usuário ou e-mail').fill(username);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/gate/);
  await expect(page.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeVisible();
  const blocked = await page.evaluate(async () => (await fetch('/api/structure')).status);
  expect(blocked).toBe(403);

  const link = mailLink(email, '/verify-email');
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();

  await page.goto('/gate');
  await expect(page.getByRole('heading', { name: 'Pedido em análise' })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch('/api/members')).status)).toBe(403);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/gate/);

  // The owner sees the request with the required details and approves it.
  const owner = await ownerSession(browser);
  await owner.page.goto('/admin/requests');
  const card = owner.page.locator('article, li, tr, div').filter({ hasText: username }).filter({ hasText: email }).last();
  await expect(card).toBeVisible();
  await expect(card).toContainText('Sou amiga da administração.');
  await card.getByRole('button', { name: /Aceitar/ }).click();
  await expect(owner.page.getByText(username)).toHaveCount(0, { timeout: 10_000 });

  await page.goto('/app');
  await expect(page).toHaveURL(/\/app/);
  expect(await page.evaluate(async () => (await fetch('/api/structure')).status)).toBe(200);
  await owner.ctx.close();
});

test('solicitação rejeitada não acessa as áreas privadas', async ({ browser, page }) => {
  const username = uniq('recusa');
  const email = `${username}@ouroboros.test`;
  await page.goto('/register');
  await page.getByLabel('Nome de usuário').fill(username);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByLabel(/regras da comunidade/).check();
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await page.goto(mailLink(email, '/verify-email')!);
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();

  const owner = await ownerSession(browser);
  await owner.page.goto('/admin/requests');
  const card = owner.page.locator('article, li, tr, div').filter({ hasText: username }).filter({ hasText: email }).last();
  await card.getByRole('button', { name: /Rejeitar/ }).click();
  const dialog = owner.page.getByRole('dialog');
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: /Rejeitar/ }).click();
  await expect(owner.page.getByText(email)).toHaveCount(0, { timeout: 10_000 });

  await page.goto('/login');
  await page.getByLabel('Usuário ou e-mail').fill(username);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('recusada');
  await owner.ctx.close();
});
