import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command:
      'PLAYWRIGHT=1 AUTH_EMAIL_DELIVERY=local npx wrangler d1 migrations apply DB --local && PLAYWRIGHT=1 AUTH_EMAIL_DELIVERY=local npm run dev -- --force --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/sign-in',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://127.0.0.1:4173' },
});
