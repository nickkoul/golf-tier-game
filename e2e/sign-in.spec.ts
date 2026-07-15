import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

test('a visitor can request a passwordless sign-in link', async ({ page }) => {
  await page.goto('/sign-in');

  await expect(
    page.getByRole('heading', { name: 'Make Sunday interesting.' }),
  ).toBeVisible();
  await page.getByLabel('Email address').fill('golfer@example.com');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Sign-in email is temporarily unavailable. Try again later.',
  );

  const token = randomUUID();
  const email = `golfer-${randomUUID()}@example.com`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiry = new Date(Date.now() + 60_000).toISOString();
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
      '--command',
      `INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES ('${tokenHash}', '${email}', '${expiry}')`,
    ],
    { stdio: 'ignore' },
  );

  await page.goto(`/verify?token=${token}`);
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel('Display name').fill('Mina Golfer');
  await page.getByRole('button', { name: 'Save display name' }).click();
  await expect(page.getByRole('status')).toHaveText('Display name saved.');
  await expect(page.getByLabel('Display name')).toHaveValue('Mina Golfer');
});
