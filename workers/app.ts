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
  contestForUser,
  createContest,
  inviteParticipant,
  leaveContest,
  ownerContest,
  ownerContests,
  removeParticipant,
  removeLineup,
  respondToInvitation,
  revokeInvitation,
  submitLineup,
} from '../app/services/contest.server';
import { refreshActiveTournaments } from '../app/services/standings.server';
import { createRequestHandler } from 'react-router';

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

async function deliverInvitation(
  request: Request,
  env: Env & { RESEND_API_KEY?: string; EMAIL_FROM?: string },
  email: string,
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
  const link = new URL('/invitations', request.url);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: 'You are invited to a Golf Tiers Contest',
      html: `<p>You have been invited to a Golf Tiers Contest.</p><p><a href="${link.href}">Sign in with ${email} to accept or decline</a></p>`,
    }),
  });
  if (!response.ok)
    console.log(JSON.stringify({ event: 'invitation_email_failed' }));
}

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
    if (
      url.pathname.startsWith('/api/invitations/') &&
      url.pathname.endsWith('/response')
    ) {
      const user = await authenticatedUser(request, env);
      if (!user)
        return Response.json(
          { error: 'Authentication required.' },
          { status: 401 },
        );
      const result = await respondToInvitation(
        env.DB,
        user,
        url.pathname.slice('/api/invitations/'.length, -'/response'.length),
        await request.json().catch(() => null),
      );
      return 'error' in result
        ? Response.json(result, { status: result.status })
        : Response.json(result);
    }
    const contestPath = url.pathname.match(
      /^\/api\/contests\/([^/]+)(?:\/(.*))?$/,
    );
    if (contestPath) {
      const user = await authenticatedUser(request, env);
      if (!user)
        return Response.json(
          { error: 'Authentication required.' },
          { status: 401 },
        );
      const [, contestId, action] = contestPath;
      if (action === 'invitations' && request.method === 'POST') {
        const result = await inviteParticipant(
          env.DB,
          user.id,
          contestId,
          await request.json().catch(() => null),
        );
        if ('error' in result)
          return Response.json(result, {
            status:
              'status' in result && typeof result.status === 'number'
                ? result.status
                : 400,
          });
        await deliverInvitation(request, env, result.invitation.email);
        return Response.json(result.invitation, { status: 201 });
      }
      if (action?.startsWith('invitations/') && request.method === 'DELETE') {
        const result = await revokeInvitation(
          env.DB,
          user.id,
          contestId,
          action.slice('invitations/'.length),
        );
        return 'error' in result
          ? Response.json(result, {
              status:
                'status' in result && typeof result.status === 'number'
                  ? result.status
                  : 400,
            })
          : new Response(null, { status: 204 });
      }
      if (action === 'participation' && request.method === 'DELETE') {
        const result = await leaveContest(env.DB, user.id, contestId);
        return 'error' in result
          ? Response.json(result, {
              status:
                'status' in result && typeof result.status === 'number'
                  ? result.status
                  : 400,
            })
          : new Response(null, { status: 204 });
      }
      if (action === 'lineup' && request.method === 'PUT') {
        const result = await submitLineup(
          env.DB,
          user.id,
          contestId,
          await request.json().catch(() => null),
        );
        return 'error' in result
          ? Response.json(result, {
              status:
                'status' in result && typeof result.status === 'number'
                  ? result.status
                  : 400,
            })
          : Response.json(result.lineup);
      }
      if (action === 'lineup' && request.method === 'DELETE') {
        const result = await removeLineup(env.DB, user.id, contestId);
        return 'error' in result
          ? Response.json(result, {
              status:
                'status' in result && typeof result.status === 'number'
                  ? result.status
                  : 400,
            })
          : new Response(null, { status: 204 });
      }
      if (action?.startsWith('participants/') && request.method === 'DELETE') {
        const result = await removeParticipant(
          env.DB,
          user.id,
          contestId,
          action.slice('participants/'.length),
        );
        return 'error' in result
          ? Response.json(result, {
              status:
                'status' in result && typeof result.status === 'number'
                  ? result.status
                  : 400,
            })
          : new Response(null, { status: 204 });
      }
      if (!action && request.method === 'GET') {
        const contest = await contestForUser(env.DB, user.id, contestId);
        return contest
          ? Response.json(contest)
          : Response.json({ error: 'Contest not found.' }, { status: 404 });
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
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(refreshActiveTournaments(env.DB));
  },
} satisfies ExportedHandler<
  Env & {
    VERIFICATION_TOKEN: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    AUTH_EMAIL_DELIVERY?: string;
  }
>;
