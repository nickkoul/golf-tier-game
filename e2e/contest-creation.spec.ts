import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

function executeLocalSql(command: string) {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'DB', '--local', '--command', command],
    {
      stdio: 'ignore',
    },
  );
}

test('a Contest Owner creates an immutable Contest from a future Tournament field', async ({
  page,
}) => {
  const tournamentId = randomUUID();
  const token = randomUUID();
  const email = `owner-${randomUUID()}@example.com`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const fieldAvailableAt = new Date().toISOString();
  const name = `Example Invitational ${tournamentId}`;
  executeLocalSql(
    `INSERT INTO tournaments (id, name, starts_at, time_zone, source, field_available_at) VALUES ('${tournamentId}', '${name}', '${startsAt}', 'America/New_York', 'espn', '${fieldAvailableAt}')`,
  );
  executeLocalSql(
    `INSERT INTO tournament_golfers (tournament_id, golfer_id, golfer_name) VALUES ('${tournamentId}', 'avery-${tournamentId}', 'Avery Ace'), ('${tournamentId}', 'blair-${tournamentId}', 'Blair Birdie')`,
  );
  executeLocalSql(
    `INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES ('${tokenHash}', '${email}', '${startsAt}')`,
  );

  await page.goto(`/verify?token=${token}`);
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'My Contests' }),
  ).toBeVisible();
  await expect(page.getByText('No Contests yet')).toBeVisible();
  await page.goto('/contests/new');

  await page.getByLabel('Tournament').selectOption(tournamentId);
  await expect(
    page.getByText(`Your Contest will be named ${name}.`),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create private Contest' }),
  ).toBeDisabled();

  await page.getByLabel('Avery Ace').check();
  await page.getByRole('button', { name: 'Add Tier' }).click();
  const secondTier = page.getByRole('group', { name: 'Tier 2' });
  await expect(
    page.getByText('Every Tier needs at least one Golfer.'),
  ).toBeVisible();
  await secondTier.getByLabel('Tier name (optional)').fill('Tier 1');
  await secondTier.getByLabel('Avery Ace').check();
  await expect(page.getByText('Tier names must be unique.')).toBeVisible();
  await expect(
    page.getByText('A Golfer can appear in only one Tier.'),
  ).toBeVisible();
  await secondTier.getByLabel('Tier name').fill('Contenders');
  await secondTier.getByLabel('Avery Ace').uncheck();
  await secondTier.getByLabel('Blair Birdie').check();
  await expect(
    page.getByRole('button', { name: 'Create private Contest' }),
  ).toBeEnabled();

  await page.getByRole('button', { name: 'Create private Contest' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('Your field is set.')).toBeVisible();
  await expect(page.getByText('Tier 1')).toBeVisible();
  await expect(page.getByText('Contenders')).toBeVisible();
  const contestId = page.url().split('/').pop()!;

  const inviteeEmail = `invitee-${randomUUID()}@example.com`;
  await page.getByLabel('Email address').last().fill(inviteeEmail);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(inviteeEmail)).toBeVisible();
  await page.getByRole('button', { name: 'Resend invitation' }).click();
  await expect(page.getByText(inviteeEmail)).toBeVisible();
  await page.getByRole('button', { name: 'Revoke invitation' }).click();
  await expect(page.getByText(inviteeEmail)).not.toBeVisible();
  const participantId = randomUUID();
  executeLocalSql(
    `INSERT INTO users (id, email, display_name, created_at) VALUES ('${participantId}', 'participant-${participantId}@example.com', 'Pat Participant', '${new Date().toISOString()}')`,
  );
  executeLocalSql(
    `INSERT INTO participants (contest_id, user_id, joined_at) VALUES ('${contestId}', '${participantId}', '${new Date().toISOString()}')`,
  );
  await page.reload();
  await expect(page.getByText('Pat Participant')).toBeVisible();
  await page.getByRole('button', { name: 'Remove Participant' }).click();
  await expect(page.getByText('Pat Participant')).not.toBeVisible();
});
