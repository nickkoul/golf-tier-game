CREATE TABLE lineups (
  id TEXT PRIMARY KEY NOT NULL,
  contest_id TEXT NOT NULL REFERENCES contests(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (contest_id, user_id)
);

CREATE TABLE lineup_selections (
  lineup_id TEXT NOT NULL REFERENCES lineups(id),
  tier_id TEXT NOT NULL REFERENCES tiers(id),
  golfer_id TEXT NOT NULL,
  PRIMARY KEY (lineup_id, tier_id)
);

CREATE INDEX lineups_contest_id ON lineups(contest_id);
