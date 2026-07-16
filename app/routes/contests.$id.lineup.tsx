import { useState } from 'react';
import { redirect, useLoaderData } from 'react-router';
import { authenticatedUser } from '../services/auth.server';
import { contestForUser } from '../services/contest.server';
import type { Route } from './+types/contests.$id.lineup';

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { cloudflare } = context as { cloudflare: { env: Env } };
  const user = await authenticatedUser(request, cloudflare.env);
  if (!user) throw redirect('/sign-in');
  const contest = await contestForUser(cloudflare.env.DB, user.id, params.id);
  if (!contest) throw new Response('Contest not found.', { status: 404 });
  if (new Date(contest.lineupLockAt) <= new Date())
    throw redirect(`/contests/${contest.id}`);
  return contest;
}

export default function LineupEditor() {
  const contest = useLoaderData<typeof loader>();
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
