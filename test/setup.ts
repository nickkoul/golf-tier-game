import { env } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import migration from '../migrations/0001_create_verification_requests.sql?raw';
import identityMigration from '../migrations/0002_create_identity.sql?raw';

beforeAll(async () => {
  await env.DB.prepare(migration).run();
  await env.DB.prepare(identityMigration).run();
});
