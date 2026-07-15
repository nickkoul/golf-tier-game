import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'build' },
  server: { hmr: { overlay: process.env.PLAYWRIGHT !== '1' } },
  plugins: [cloudflare(), reactRouter()],
});
