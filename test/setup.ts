import { env } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import migration from '../migrations/0001_create_verification_requests.sql?raw';

beforeAll(async () => {
  await env.DB.prepare(migration).run();
});
