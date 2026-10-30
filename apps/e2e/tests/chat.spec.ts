import { expect, test } from '@playwright/test';
import { approvedMember, openChannel, ownerSession } from './helpers';

test('mensagens, menções, reações e digitação em tempo real entre dois membros', async ({ browser }) => {
  const owner = await ownerSession(browser);
  const a = await approvedMember(browser, owner.page.request, 'ana');
  const b = await approvedMember(browser, owner.page.request, 'beto');

  await openChannel(a.page, 'geral');
  await openChannel(b.page, 'geral');

  const composerA = a.page.getByLabel('Mensagem');
  await composerA.fill(`Olá @${b.username}, tudo certo?`);
  await expect(b.page.getByText(/está digitando/)).toBeVisible();
  await composerA.press('Enter');

  const msgOnB = b.page.locator('[id^="m"]').filter({ hasText: 'tudo certo?' }).last();
  await expect(msgOnB).toBeVisible();
  await expect(msgOnB.locator('.mention')).toBeVisible();

  // B reacts; A sees the reaction live.
  await msgOnB.hover();
  await msgOnB.getByRole('button', { name: 'Reagir' }).click();
  await b.page.getByRole('button', { name: '🔥' }).first().click();
  const msgOnA = a.page.locator('[id^="m"]').filter({ hasText: 'tudo certo?' }).last();
  await expect(msgOnA.getByRole('button', { name: /🔥/ })).toBeVisible();

  // Edit with history.
  await msgOnA.hover();
  await msgOnA.getByRole('button', { name: 'Editar' }).click();
  const edit = a.page.locator('textarea').filter({ hasText: 'tudo certo?' });
  await edit.fill('Mensagem editada pelo teste');
  await edit.press('Enter');
  await expect(b.page.getByText('Mensagem editada pelo teste')).toBeVisible();
  await expect(b.page.getByText('(editada)').last()).toBeVisible();

  // A bot command answered in real time.
  await composerA.fill('/dado 2d6');
  await composerA.press('Enter');
  await expect(b.page.getByText(/2d6: \d+ \+ \d+/)).toBeVisible();

  await Promise.all([a.ctx.close(), b.ctx.close(), owner.ctx.close()]);
});
