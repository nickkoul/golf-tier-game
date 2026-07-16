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
  await expect(
    page.getByRole('link', { name: 'Enter your Lineup' }),
  ).toBeVisible();
  const contestId = page.url().split('/').pop()!;

  await page.goto('/');
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.goto(`/contests/${contestId}`);

  await page.goto(`/contests/${contestId}?lineup=edit`);
  await expect(
    page.getByRole('button', { name: 'Submit Lineup' }),
  ).toBeDisabled();
  await page.getByLabel('Avery Ace').check();
  await page.getByLabel('Blair Birdie').check();
  await page.getByRole('button', { name: 'Submit Lineup' }).click();
  await expect(page.getByText('Entered')).toBeVisible();

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
  await expect(
    page.getByText('Pat Participant', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove Participant' }).click();
  await expect(
    page.getByText('Pat Participant', { exact: true }),
  ).not.toBeVisible();
});

test('a Participant sees pre-lock entered status without another Lineup selections', async ({
  browser,
}) => {
  const contestId = randomUUID();
  const ownerId = randomUUID();
  const participantId = randomUUID();
  const tournamentId = randomUUID();
  const sessionToken = randomUUID();
  const sessionHash = createHash('sha256').update(sessionToken).digest('hex');
  const lineupId = randomUUID();
  const tierId = randomUUID();
  const now = new Date().toISOString();
  const lockAt = new Date(Date.now() + 86_400_000).toISOString();
  executeLocalSql(
    `INSERT INTO users (id, email, display_name, created_at) VALUES ('${ownerId}', 'owner-${ownerId}@example.com', 'Owner One', '${now}'), ('${participantId}', 'participant-${participantId}@example.com', 'Participant Two', '${now}')`,
  );
  executeLocalSql(
    `INSERT INTO tournaments (id, name, starts_at, time_zone, source) VALUES ('${tournamentId}', 'Privacy Invitational', '${lockAt}', 'America/New_York', 'espn')`,
  );
  executeLocalSql(
    `INSERT INTO contests (id, owner_user_id, tournament_id, name, lineup_lock_at, tournament_time_zone, created_at) VALUES ('${contestId}', '${ownerId}', '${tournamentId}', 'Privacy Invitational', '${lockAt}', 'America/New_York', '${now}')`,
  );
  executeLocalSql(
    `INSERT INTO tiers (id, contest_id, position, name) VALUES ('${tierId}', '${contestId}', 0, 'Tier 1')`,
  );
  executeLocalSql(
    `INSERT INTO tier_golfers (tier_id, golfer_id, golfer_name) VALUES ('${tierId}', 'private-pick', 'Private Pick')`,
  );
  executeLocalSql(
    `INSERT INTO participants (contest_id, user_id, joined_at) VALUES ('${contestId}', '${participantId}', '${now}')`,
  );
  executeLocalSql(
    `INSERT INTO lineups (id, contest_id, user_id, created_at) VALUES ('${lineupId}', '${contestId}', '${ownerId}', '${now}')`,
  );
  executeLocalSql(
    `INSERT INTO lineup_selections (lineup_id, tier_id, golfer_id) VALUES ('${lineupId}', '${tierId}', 'private-pick')`,
  );
  executeLocalSql(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ('${sessionHash}', '${participantId}', '${lockAt}', '${now}')`,
  );

  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'golf_tiers_session',
      value: sessionToken,
      url: 'http://127.0.0.1:4173',
    },
  ]);
  const page = await context.newPage();
  await page.goto(`/contests/${contestId}`);

  await expect(page.getByText('Owner One')).toBeVisible();
  await expect(page.getByText('Participant Two')).toBeVisible();
  await expect(page.getByText('Entered', { exact: true })).toBeVisible();
  await expect(page.getByText('Not entered', { exact: true })).toBeVisible();
  await expect(page.locator('input[type="radio"]')).toHaveCount(0);
  await expect(
    page.evaluate(async (id) => {
      const response = await fetch(`/api/contests/${id}`);
      return (await response.json()) as { lineup: unknown[] };
    }, contestId),
  ).resolves.toMatchObject({ lineup: [] });
  await context.close();
});
