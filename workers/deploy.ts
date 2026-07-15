// @ts-expect-error React Router generates this build manifest without declarations.
import * as build from '../build/server/index.js';
import { persistVerificationRequest } from '../app/services/verification.server';
import { createRequestHandler } from 'react-router';

const requestHandler = createRequestHandler(build, 'production');

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/api/verification') {
      return persistVerificationRequest(
        request,
        env.DB,
        env.VERIFICATION_TOKEN,
      );
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env & { VERIFICATION_TOKEN: string }>;
