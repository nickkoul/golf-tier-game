import { redirect, useLoaderData } from 'react-router';
import { authenticatedUser } from '../services/auth.server';
import { ownerContests } from '../services/contest.server';
import type { Route } from './+types/home';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'Golf Tiers | My Contests' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { cloudflare } = context as { cloudflare: { env: Env } };
  const user = await authenticatedUser(request, cloudflare.env);
  if (!user) throw redirect('/sign-in');
  return { contests: await ownerContests(cloudflare.env.DB, user.id) };
}

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const contests = data?.contests ?? [];
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Golf Tiers home">
          <span>GOLF</span>
          <strong>TIERS</strong>
        </a>
        <a className="account-link button button-primary" href="/contests/new">
          Create contest <span aria-hidden="true">&rarr;</span>
        </a>
      </header>

      <main className="contests-main">
        <section
          className="contests-heading"
          aria-labelledby="contests-heading"
        >
          <p className="eyebrow">Your game</p>
          <h1 id="contests-heading">My Contests</h1>
          <p>Every Contest you create starts here.</p>
        </section>
        {contests.length === 0 ? (
          <section className="contests-empty" aria-labelledby="empty-heading">
            <p className="eyebrow">Nothing on the tee yet</p>
            <h2 id="empty-heading">No Contests yet</h2>
            <p>
              Choose an upcoming Tournament and build the board for your group.
            </p>
            <a className="button button-primary" href="/contests/new">
              Create contest
            </a>
          </section>
        ) : (
          <section className="contest-list" aria-label="Your Contests">
            {contests.map((contest) => (
              <a
                className="contest-card"
                href={`/contests/${contest.id}`}
                key={contest.id}
              >
                <p className="eyebrow">Private Contest</p>
                <h2>{contest.name}</h2>
                <p>
                  Lineup Lock: {new Date(contest.lineupLockAt).toLocaleString()}
                </p>
              </a>
            ))}
          </section>
        )}
      </main>

      <footer className="site-footer">
        Golf Tiers <span aria-hidden="true">/</span> Pick your field. Own the
        weekend.
      </footer>
    </div>
  );
}
