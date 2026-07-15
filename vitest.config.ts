import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    reactRouter(),
    cloudflareTest({
      miniflare: {
        bindings: {
          AUTH_EMAIL_DELIVERY: 'local',
          VERIFICATION_TOKEN: 'test-verification-token',
        },
      },
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    pool: 'workers',
    setupFiles: ['./test/setup.ts'],
  },
});
