import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { useEffect, useState } from 'react';
import { authenticatedUser } from '../services/auth.server';
import {
  availableTournaments,
  createContest,
} from '../services/contest.server';
import type { Route } from './+types/contests.new';

type BoardTier = { id: string; name: string; golferIds: string[] };

function newTier(): BoardTier {
  return { id: crypto.randomUUID(), name: '', golferIds: [] };
}

function boardErrors(tiers: BoardTier[]) {
  const names = new Set<string>();
  const golfers = new Set<string>();
  let duplicateNames = false;
  let duplicateGolfers = false;
  for (const tier of tiers) {
    const name = tier.name.trim().toLocaleLowerCase();
    if (name && names.has(name)) duplicateNames = true;
    names.add(name);
    for (const golferId of tier.golferIds) {
      if (golfers.has(golferId)) duplicateGolfers = true;
      golfers.add(golferId);
    }
  }
  return {
    emptyTiers: tiers.some((tier) => tier.golferIds.length === 0),
    duplicateNames,
    duplicateGolfers,
    valid:
      tiers.length > 0 &&
      tiers.every((tier) => tier.name.trim() && tier.golferIds.length > 0) &&
      !duplicateNames &&
      !duplicateGolfers,
  };
}

function timeInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { cloudflare } = context as { cloudflare: { env: Env } };
  const user = await authenticatedUser(request, cloudflare.env);
  if (!user) throw redirect('/sign-in');
  return availableTournaments(cloudflare.env.DB);
}

export async function action({ request, context }: Route.ActionArgs) {
  const { cloudflare } = context as { cloudflare: { env: Env } };
  const user = await authenticatedUser(request, cloudflare.env);
  if (!user) throw redirect('/sign-in');
  const formData = await request.formData();
  const result = await createContest(cloudflare.env.DB, user.id, {
    tournamentId: formData.get('tournamentId'),
    tiers: JSON.parse(String(formData.get('board') ?? 'null')),
  });
  if ('error' in result) return { error: result.error };
  throw redirect(`/contests/${result.contest.id}`);
}

export default function NewContest() {
  const tournaments = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? '');
  const [tiers, setTiers] = useState<BoardTier[]>([newTier()]);
  const selectedTournament = tournaments.find(({ id }) => id === tournamentId);
  const errors = boardErrors(tiers);
  const canCreate = Boolean(selectedTournament && errors.valid);

  useEffect(() => {
    const golferIds = new Set(
      selectedTournament?.golfers.map((golfer) => golfer.id),
    );
    setTiers((current) =>
      current.map((tier) => ({
        ...tier,
        golferIds: tier.golferIds.filter((id) => golferIds.has(id)),
      })),
    );
  }, [selectedTournament]);

  function updateTier(id: string, update: Partial<BoardTier>) {
    setTiers((current) =>
      current.map((tier) => (tier.id === id ? { ...tier, ...update } : tier)),
    );
  }

  function moveTier(index: number, direction: -1 | 1) {
    setTiers((current) => {
      const next = [...current];
      const target = index + direction;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

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
        <p className="eyebrow">New private contest</p>
        <h1>Create your board.</h1>
        <p>Choose the event, then shape the choices everyone will play.</p>
      </header>
      <Form method="post" className="contest-form">
        <section aria-labelledby="tournament-heading">
          <p className="eyebrow">1 / Tournament</p>
          <h2 id="tournament-heading">Choose an upcoming field</h2>
          {tournaments.length === 0 ? (
            <p className="form-error" role="alert">
              No upcoming Tournaments have an available field.
            </p>
          ) : (
            <label className="tournament-picker">
              Tournament
              <select
                name="tournamentId"
                value={tournamentId}
                onChange={(event) => setTournamentId(event.target.value)}
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedTournament && (
            <p className="tournament-facts">
              Your Contest will be named{' '}
              <strong>{selectedTournament.name}</strong>. Lineup Lock is{' '}
              {new Date(selectedTournament.startsAt).toLocaleString()} (your
              local time) /{' '}
              {timeInZone(
                selectedTournament.startsAt,
                selectedTournament.timeZone,
              )}{' '}
              ({selectedTournament.timeZone}).
            </p>
          )}
        </section>

        <section aria-labelledby="board-heading">
          <p className="eyebrow">2 / Tier Board</p>
          <h2 id="board-heading">Build the field</h2>
          {errors.emptyTiers && (
            <p className="form-error">Every Tier needs at least one Golfer.</p>
          )}
          {errors.duplicateNames && (
            <p className="form-error">Tier names must be unique.</p>
          )}
          {errors.duplicateGolfers && (
            <p className="form-error">A Golfer can appear in only one Tier.</p>
          )}
          {tiers.map((tier, index) => (
            <fieldset className="tier-editor" key={tier.id}>
              <legend>Tier {index + 1}</legend>
              <div className="tier-controls">
                <label>
                  Tier name
                  <input
                    value={tier.name}
                    onChange={(event) =>
                      updateTier(tier.id, { name: event.target.value })
                    }
                    required
                  />
                </label>
                <button
                  type="button"
                  onClick={() => moveTier(index, -1)}
                  disabled={index === 0}
                >
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => moveTier(index, 1)}
                  disabled={index === tiers.length - 1}
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTiers((current) =>
                      current.filter(({ id }) => id !== tier.id),
                    )
                  }
                  disabled={tiers.length === 1}
                >
                  Remove
                </button>
              </div>
              <div
                className="golfer-options"
                aria-label={`${tier.name || `Tier ${index + 1}`} Golfers`}
              >
                {selectedTournament?.golfers.map((golfer) => (
                  <label key={golfer.id}>
                    <input
                      type="checkbox"
                      checked={tier.golferIds.includes(golfer.id)}
                      onChange={(event) =>
                        updateTier(tier.id, {
                          golferIds: event.target.checked
                            ? [...tier.golferIds, golfer.id]
                            : tier.golferIds.filter((id) => id !== golfer.id),
                        })
                      }
                    />
                    {golfer.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className="button"
            onClick={() => setTiers((current) => [...current, newTier()])}
          >
            Add Tier
          </button>
        </section>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        <input
          type="hidden"
          name="board"
          value={JSON.stringify(
            tiers.map(({ name, golferIds }) => ({ name, golferIds })),
          )}
        />
        <button
          className="button button-primary create-contest"
          type="submit"
          disabled={!canCreate || navigation.state !== 'idle'}
        >
          Create private Contest
        </button>
      </Form>
    </main>
  );
}
