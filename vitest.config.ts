import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: { VERIFICATION_TOKEN: 'test-verification-token' },
      },
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    pool: 'workers',
    setupFiles: ['./test/setup.ts'],
  },
});
