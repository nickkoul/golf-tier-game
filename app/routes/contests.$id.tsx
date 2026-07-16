import { redirect, useLoaderData } from 'react-router';
import { useState } from 'react';
import { authenticatedUser } from '../services/auth.server';
import { contestForUser, contestManagement } from '../services/contest.server';
import type { Route } from './+types/contests.$id';

function timeInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { cloudflare } = context as { cloudflare: { env: Env } };
  const user = await authenticatedUser(request, cloudflare.env);
  if (!user) throw redirect('/sign-in');
  const contest = await contestForUser(cloudflare.env.DB, user.id, params.id);
  if (!contest) throw new Response('Contest not found.', { status: 404 });
  return {
    contest,
    management: contest.isOwner
      ? await contestManagement(cloudflare.env.DB, user.id, params.id)
      : null,
  };
}

export default function ContestDetail() {
  const { contest, management } = useLoaderData<typeof loader>();
  const beforeLineupLock = new Date(contest.lineupLockAt) > new Date();
  return (
    <main className="contest-page">
      <a
        className="wordmark auth-wordmark"
        href="/"
        aria-label="Golf Tiers home"
      >
        <span>GOLF</span>
        <strong>TIERS</strong>
      </a>
      <header className="contest-heading">
        <p className="eyebrow">Private Contest</p>
        <h1>{contest.name}</h1>
        <p>
          Lineup Lock: {new Date(contest.lineupLockAt).toLocaleString()} (your
          local time) /{' '}
          {timeInZone(contest.lineupLockAt, contest.tournamentTimeZone)} (
          {contest.tournamentTimeZone})
        </p>
      </header>
      <section aria-labelledby="tier-board-heading">
        <p className="eyebrow">Immutable Tier Board</p>
        <h2 id="tier-board-heading">Your field is set.</h2>
        <ol className="tier-list">
          {contest.tiers.map((tier) => (
            <li key={tier.name}>
              <strong>{tier.name}</strong>
              <span>
                {tier.golfers.map((golfer) => golfer.name).join(', ')}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {beforeLineupLock && (
        <>
          <section aria-labelledby="participants-heading">
            <p className="eyebrow">Contest runway</p>
            <h2 id="participants-heading">Participants</h2>
            <ul className="participant-list">
              {contest.participants.map((participant) => (
                <li key={participant.displayName}>
                  <span>{participant.displayName}</span>
                  <strong>
                    {participant.entered ? 'Entered' : 'Not entered'}
                  </strong>
                </li>
              ))}
            </ul>
          </section>
          <a
            className="button button-primary"
            href={`/contests/${contest.id}/lineup`}
          >
            {contest.lineup.length ? 'Edit your Lineup' : 'Enter your Lineup'}
          </a>
        </>
      )}
      {management && (
        <ContestOwnerControls contestId={contest.id} management={management} />
      )}
      {!contest.isOwner && <LeaveContest contestId={contest.id} />}
    </main>
  );
}

function ContestOwnerControls({
  contestId,
  management,
}: {
  contestId: string;
  management: NonNullable<Awaited<ReturnType<typeof contestManagement>>>;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/contests/${contestId}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setMessage(
      response.ok
        ? `Invitation sent to ${email}.`
        : ((await response.json()) as { error: string }).error,
    );
    if (response.ok) window.location.reload();
  }
  async function remove(path: string) {
    const response = await fetch(`/api/contests/${contestId}/${path}`, {
      method: 'DELETE',
    });
    if (response.ok) window.location.reload();
  }
  async function resend(invitationEmail: string) {
    const response = await fetch(`/api/contests/${contestId}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: invitationEmail }),
    });
    if (response.ok) window.location.reload();
  }
  return (
    <section aria-labelledby="participants-heading">
      <p className="eyebrow">Contest access</p>
      <h2 id="participants-heading">Invite Participants</h2>
      <form onSubmit={invite} className="auth-form">
        <label htmlFor="invite-email">Email address</label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button className="button button-primary" type="submit">
          Send invitation
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <h3>Pending invitations</h3>
      <ul>
        {management.invitations.map((invitation) => (
          <li key={invitation.id}>
            {invitation.email}{' '}
            <button type="button" onClick={() => resend(invitation.email)}>
              Resend invitation
            </button>{' '}
            <button
              type="button"
              onClick={() => remove(`invitations/${invitation.id}`)}
            >
              Revoke invitation
            </button>
          </li>
        ))}
      </ul>
      <h3>Participants</h3>
      <ul>
        {management.participants.map((participant) => (
          <li key={participant.id}>
            {participant.displayName || participant.email}{' '}
            <button
              type="button"
              onClick={() => remove(`participants/${participant.id}`)}
            >
              Remove Participant
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LeaveContest({ contestId }: { contestId: string }) {
  async function leave() {
    const response = await fetch(`/api/contests/${contestId}/participation`, {
      method: 'DELETE',
    });
    if (response.ok) window.location.assign('/');
  }
  return (
    <button className="button" type="button" onClick={leave}>
      Leave Contest
    </button>
  );
}
