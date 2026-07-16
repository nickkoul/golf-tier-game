import { useLoaderData } from 'react-router';
import { authenticatedUser } from '../services/auth.server';
import { invitationsForUser } from '../services/contest.server';
import type { Route } from './+types/invitations';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { cloudflare } = context as { cloudflare: { env: Env } };
  const user = await authenticatedUser(request, cloudflare.env);
  if (!user) throw new Response('Authentication required.', { status: 401 });
  return invitationsForUser(cloudflare.env.DB, user.email);
}

export default function Invitations() {
  const invitations = useLoaderData<typeof loader>();
  async function respond(id: string, response: 'accept' | 'decline') {
    const result = await fetch(`/api/invitations/${id}/response`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response }),
    });
    if (result.ok)
      window.location.assign(response === 'accept' ? '/' : '/invitations');
  }
  return (
    <main className="contest-page">
      <h1>Your Invitations</h1>
      {invitations.length === 0 ? (
        <p>You have no active Invitations.</p>
      ) : (
        <ul>
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              <h2>{invitation.contestName}</h2>
              <p>Expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
              <button
                className="button button-primary"
                onClick={() => respond(invitation.id, 'accept')}
              >
                Accept invitation
              </button>{' '}
              <button
                className="button"
                onClick={() => respond(invitation.id, 'decline')}
              >
                Decline invitation
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
