import { persistVerificationRequest } from '../app/services/verification.server';
import { createRequestHandler } from 'react-router';

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

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
