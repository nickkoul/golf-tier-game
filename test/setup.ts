import { env } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import migration from '../migrations/0001_create_verification_requests.sql?raw';
import identityMigration from '../migrations/0002_create_identity.sql?raw';
import contestMigration from '../migrations/0003_create_contests.sql?raw';
import tournamentSourceMigration from '../migrations/0004_add_tournament_source.sql?raw';
import invitationMigration from '../migrations/0005_create_contest_invitations.sql?raw';
import lineupMigration from '../migrations/0006_create_lineups.sql?raw';

beforeAll(async () => {
  await env.DB.prepare(migration).run();
  await env.DB.prepare(identityMigration).run();
  await env.DB.prepare(contestMigration).run();
  await env.DB.prepare(tournamentSourceMigration).run();
  await env.DB.prepare(invitationMigration).run();
  await env.DB.prepare(lineupMigration).run();
});
