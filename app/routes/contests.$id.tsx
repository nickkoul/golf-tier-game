import { redirect, useLoaderData } from 'react-router';
import { useEffect, useState } from 'react';
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
  const editing = new URL(request.url).searchParams.has('lineup');
  if (editing && new Date(contest.lineupLockAt) <= new Date())
    throw redirect(`/contests/${contest.id}`);
  return {
    contest,
    editing,
    management:
      contest.isOwner && !editing
        ? await contestManagement(cloudflare.env.DB, user.id, params.id)
        : null,
  };
}

export default function ContestDetail() {
  const { contest, editing, management } = useLoaderData<typeof loader>();
  if (editing) return <LineupEditor contest={contest} />;
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
      {beforeLineupLock && (
        <section aria-labelledby="tier-board-heading">
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
      )}
      {beforeLineupLock && (
        <>
          <section aria-labelledby="participants-heading">
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
            href={`/contests/${contest.id}?lineup=edit`}
          >
            {contest.lineup.length ? 'Edit your Lineup' : 'Enter your Lineup'}
          </a>
        </>
      )}
      {!beforeLineupLock && contest.standings && (
        <Standings standings={contest.standings} />
      )}
      {management && (
        <ContestOwnerControls contestId={contest.id} management={management} />
      )}
      {!contest.isOwner && <LeaveContest contestId={contest.id} />}
    </main>
  );
}

function Standings({
  standings,
}: {
  standings: NonNullable<
    NonNullable<Awaited<ReturnType<typeof contestForUser>>>['standings']
  >;
}) {
  useEffect(() => {
    const interval = window.setInterval(() => window.location.reload(), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  if (standings.status === 'cancelled')
    return (
      <section>
        <h2>Contest Cancellation</h2>
        <p>This Tournament ended without Final Standings.</p>
      </section>
    );
  return (
    <section aria-labelledby="standings-heading" className="standings-section">
      <p className="eyebrow">
        {standings.status === 'final'
          ? 'Final Standings'
          : 'Provisional Standings'}
      </p>
      <h2 id="standings-heading">Standings</h2>
      <ol className="standings-table">
        {standings.entrants.map((entrant) => (
          <li
            key={`${entrant.displayName}-${entrant.golfers.map((golfer) => golfer.name).join()}`}
          >
            <details>
              <summary className="standings-row">
                <strong>
                  {entrant.position ? `${entrant.position}.` : '-'}
                </strong>
                <span>{entrant.displayName}</span>
                <strong>
                  {entrant.fantasyPoints ?? 'Scoring Unavailable'}
                </strong>
              </summary>
              <ul>
                {entrant.golfers.map((golfer) => (
                  <li key={golfer.name}>
                    <strong>{golfer.name}</strong>:{' '}
                    {golfer.fantasyPoints ?? 'Scoring Unavailable'} pts,{' '}
                    {golfer.position ?? '-'}, {golfer.scoreToPar ?? '-'}, Round{' '}
                    {golfer.currentRound ?? '-'}, through{' '}
                    {golfer.throughStatus ?? '-'}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LineupEditor({
  contest,
}: {
  contest: NonNullable<Awaited<ReturnType<typeof contestForUser>>>;
}) {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(
      contest.lineup.map(({ tierId, golferId }) => [tierId, golferId]),
    ),
  );
  const [message, setMessage] = useState('');
  const complete = contest.tiers.every((tier) => selections[tier.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete) return;
    const response = await fetch(`/api/contests/${contest.id}/lineup`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selections: contest.tiers.map((tier) => ({
          tierId: tier.id,
          golferId: selections[tier.id],
        })),
      }),
    });
    if (response.ok) window.location.assign(`/contests/${contest.id}`);
    else setMessage(((await response.json()) as { error: string }).error);
  }

  async function remove() {
    const response = await fetch(`/api/contests/${contest.id}/lineup`, {
      method: 'DELETE',
    });
    if (response.ok) window.location.assign(`/contests/${contest.id}`);
    else setMessage(((await response.json()) as { error: string }).error);
  }

  return (
    <main className="contest-page lineup-editor-page">
      <a className="wordmark auth-wordmark" href={`/contests/${contest.id}`}>
        <span>GOLF</span>
        <strong>TIERS</strong>
      </a>
      <header className="contest-heading">
        <p className="eyebrow">Your private Lineup</p>
        <h1>{contest.name}</h1>
        <p>Select one eligible Golfer from every Tier before Lineup Lock.</p>
      </header>
      <form className="lineup-form" onSubmit={submit}>
        {contest.tiers.map((tier, position) => (
          <fieldset key={tier.id} className="lineup-tier">
            <legend>
              {position + 1}. {tier.name}
            </legend>
            {tier.golfers.map((golfer) => (
              <label key={golfer.id}>
                <input
                  type="radio"
                  name={tier.id}
                  checked={selections[tier.id] === golfer.id}
                  onChange={() =>
                    setSelections((current) => ({
                      ...current,
                      [tier.id]: golfer.id,
                    }))
                  }
                />
                {golfer.name}
              </label>
            ))}
          </fieldset>
        ))}
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        <footer className="lineup-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={!complete}
          >
            Submit Lineup
          </button>
          {contest.lineup.length > 0 && (
            <button className="button" type="button" onClick={remove}>
              Remove Lineup
            </button>
          )}
        </footer>
      </form>
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
    <section aria-labelledby="contest-access-heading">
      <h2 id="contest-access-heading">Invite Participants</h2>
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
