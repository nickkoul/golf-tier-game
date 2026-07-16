import { persistVerificationRequest } from '../app/services/verification.server';
import {
  authenticatedUser,
  requestSignInLink,
  sessionCookie,
  updateDisplayName,
  verifySignInLink,
} from '../app/services/auth.server';
import {
  availableTournaments,
  createContest,
  ownerContest,
  ownerContests,
} from '../app/services/contest.server';
import { createRequestHandler } from 'react-router';

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/verification') {
      return persistVerificationRequest(
        request,
        env.DB,
        env.VERIFICATION_TOKEN,
      );
    }

    if (url.pathname === '/api/auth/request')
      return requestSignInLink(request, env);
    if (url.pathname === '/api/profile') return updateDisplayName(request, env);
    if (url.pathname === '/api/tournaments') {
      const user = await authenticatedUser(request, env);
      return user
        ? Response.json(await availableTournaments(env.DB))
        : Response.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (url.pathname === '/api/contests') {
      const user = await authenticatedUser(request, env);
      if (!user)
        return Response.json(
          { error: 'Authentication required.' },
          { status: 401 },
        );
      if (request.method === 'GET')
        return Response.json(await ownerContests(env.DB, user.id));
      if (request.method === 'POST') {
        const result = await createContest(
          env.DB,
          user.id,
          await request.json().catch(() => null),
        );
        return 'error' in result
          ? Response.json({ error: result.error }, { status: result.status })
          : Response.json(result.contest, { status: 201 });
      }
    }
    if (url.pathname.startsWith('/api/contests/')) {
      const user = await authenticatedUser(request, env);
      if (!user)
        return Response.json(
          { error: 'Authentication required.' },
          { status: 401 },
        );
      const contest = await ownerContest(
        env.DB,
        user.id,
        url.pathname.slice('/api/contests/'.length),
      );
      return contest
        ? Response.json(contest)
        : Response.json({ error: 'Contest not found.' }, { status: 404 });
    }
    if (url.pathname === '/api/private') {
      const user = await authenticatedUser(request, env);
      return user
        ? Response.json({
            user: { email: user.email, displayName: user.displayName },
          })
        : Response.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (url.pathname === '/verify') {
      const token = await verifySignInLink(url.searchParams.get('token'), env);
      return token
        ? new Response(null, {
            status: 302,
            headers: {
              location: '/profile',
              'set-cookie': sessionCookie(token),
            },
          })
        : Response.redirect(
            new URL('/sign-in?error=invalid-link', request.url),
            302,
          );
    }
    if (
      url.pathname === '/profile' &&
      !(await authenticatedUser(request, env))
    ) {
      return new Response(null, {
        status: 302,
        headers: { location: '/sign-in' },
      });
    }
    if (url.pathname === '/' && !(await authenticatedUser(request, env))) {
      return new Response(null, {
        status: 302,
        headers: { location: '/sign-in' },
      });
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<
  Env & {
    VERIFICATION_TOKEN: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    AUTH_EMAIL_DELIVERY?: string;
  }
>;
