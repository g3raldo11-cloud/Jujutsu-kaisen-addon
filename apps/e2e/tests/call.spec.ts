import { expect, test } from '@playwright/test';
import { approvedMember, openChannel, ownerSession } from './helpers';

test('chamada de voz com dois participantes, câmera e compartilhamento de tela', async ({ browser }) => {
  const owner = await ownerSession(browser);
  const a = await approvedMember(browser, owner.page.request, 'cami');
  const b = await approvedMember(browser, owner.page.request, 'davi');

  await openChannel(a.page, 'Sala de vídeo');
  await openChannel(b.page, 'Sala de vídeo');

  await a.page.getByRole('button', { name: /Entrar com áudio/ }).click();
  await expect(a.page.getByRole('button', { name: 'Sair da chamada' }).last()).toBeVisible();
  await b.page.getByRole('button', { name: /Entrar com áudio/ }).click();

  // Both sides see each other, and the peer connection reaches "connected".
  await expect(a.page.getByText(b.page ? new RegExp(`${b.username}|davi`, 'i') : /davi/i).first()).toBeVisible();
  await expect
    .poll(async () => a.page.evaluate(() => (window as any).__ouroborosCall.state.peers.map((p: any) => p.conn)), { timeout: 20_000 })
    .toContain('connected');
  await expect
    .poll(async () => b.page.evaluate(() => (window as any).__ouroborosCall.state.peers.map((p: any) => p.conn)), { timeout: 20_000 })
    .toContain('connected');

  // Camera on A → B receives a video stream from A.
  await a.page.getByRole('button', { name: 'Ligar câmera' }).click();
  await expect
    .poll(async () => b.page.evaluate(() => (window as any).__ouroborosCall.state.peers.some((p: any) => !!p.cameraStream && p.info.video)), { timeout: 20_000 })
    .toBe(true);

  // Screen share from A → B shows the screen tile.
  await a.page.getByRole('button', { name: 'Compartilhar tela' }).click();
  await expect(b.page.getByText(/^Tela de /).first()).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => b.page.evaluate(() => (window as any).__ouroborosCall.state.peers.some((p: any) => !!p.screenStream && p.info.screen)), { timeout: 20_000 })
    .toBe(true);

  // Mute is reflected on the other side.
  await a.page.getByRole('button', { name: /Silenciar/ }).last().click();
  await expect
    .poll(async () => b.page.evaluate(() => (window as any).__ouroborosCall.state.peers.some((p: any) => p.info.muted)), { timeout: 10_000 })
    .toBe(true);

  // Leaving ends the peer on the other side.
  await a.page.getByRole('button', { name: 'Sair da chamada' }).last().click();
  await expect.poll(async () => b.page.evaluate(() => (window as any).__ouroborosCall.state.peers.length), { timeout: 10_000 }).toBe(0);

  await Promise.all([a.ctx.close(), b.ctx.close(), owner.ctx.close()]);
});
