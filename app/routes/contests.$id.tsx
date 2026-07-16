import { redirect, useLoaderData } from 'react-router';
import { authenticatedUser } from '../services/auth.server';
import { ownerContest } from '../services/contest.server';
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
  const contest = await ownerContest(cloudflare.env.DB, user.id, params.id);
  if (!contest) throw new Response('Contest not found.', { status: 404 });
  return contest;
}

export default function ContestDetail() {
  const contest = useLoaderData<typeof loader>();
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
    </main>
  );
}
