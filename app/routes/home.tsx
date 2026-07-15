import { standingsPreview, tournamentPreview } from '../fixtures/home';
import type { Route } from './+types/home';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'Golf Tiers | Genesis Invitational' }];
}

export default function Home() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Golf Tiers home">
          <span>GOLF</span>
          <strong>TIERS</strong>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a className="is-current" href="#standings">
            My Contests
          </a>
          <a href="#how-it-works">How It Works</a>
        </nav>
        <a className="account-link button button-primary" href="#sign-in">
          Sign in <span aria-hidden="true">&rarr;</span>
        </a>
      </header>

      <main>
        <section className="event-masthead" aria-labelledby="event-title">
          <div className="event-kicker">
            <span className="status-dot live-dot" /> Live contest
          </div>
          <div className="event-summary">
            <div>
              <p className="eyebrow">{tournamentPreview.contestName}</p>
              <h1 id="event-title">{tournamentPreview.name}</h1>
              <p className="event-details">
                {tournamentPreview.course}, {tournamentPreview.location}{' '}
                <span aria-hidden="true">/</span> {tournamentPreview.dateRange}
              </p>
            </div>
            <div className="lock-status">
              <span>Lineup Lock</span>
              <strong>Locked</strong>
              <small>{tournamentPreview.lockTime}</small>
            </div>
          </div>
        </section>

        <nav className="contest-nav" aria-label="Contest navigation">
          <a className="is-selected" href="#standings">
            Standings
          </a>
          <a href="#lineup">My Lineup</a>
          <a href="#contest">Contest Details</a>
        </nav>

        <section
          className="standings-section"
          id="standings"
          aria-labelledby="standings-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your contest</p>
              <h2 id="standings-heading">Standings</h2>
            </div>
            <p className="update-time">Updated just now</p>
          </div>

          <div
            className="standings-table"
            role="table"
            aria-label="Contest standings"
          >
            <div className="standings-row standings-header" role="row">
              <span role="columnheader">Pos</span>
              <span role="columnheader">Entrant</span>
              <span role="columnheader">Fantasy Points</span>
              <span role="columnheader">Lineup</span>
            </div>
            {standingsPreview.map((standing) => (
              <div className="standings-row" role="row" key={standing.entrant}>
                <span className="position" role="cell">
                  {standing.position}
                </span>
                <span className="entrant" role="cell">
                  <span className="avatar" aria-hidden="true">
                    {standing.initials}
                  </span>
                  <span>
                    <strong>{standing.entrant}</strong>
                    <small>
                      {standing.movement === 0
                        ? 'No change'
                        : `${standing.movement > 0 ? '+' : ''}${standing.movement} today`}
                    </small>
                  </span>
                </span>
                <span className="points" role="cell">
                  {standing.fantasyPoints}
                </span>
                <span className="lineup-status" role="cell">
                  <span className="status-dot status-mark" />{' '}
                  {standing.selectedGolfers}/6
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        Golf Tiers <span aria-hidden="true">/</span> Pick your field. Own the
        weekend.
      </footer>
    </div>
  );
}
