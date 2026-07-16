CREATE TABLE tournaments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  field_available_at TEXT
);

CREATE TABLE tournament_golfers (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  golfer_id TEXT NOT NULL,
  golfer_name TEXT NOT NULL,
  PRIMARY KEY (tournament_id, golfer_id)
);

CREATE TABLE contests (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  name TEXT NOT NULL,
  lineup_lock_at TEXT NOT NULL,
  tournament_time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX contests_owner_user_id ON contests(owner_user_id);

CREATE TABLE tiers (
  id TEXT PRIMARY KEY NOT NULL,
  contest_id TEXT NOT NULL REFERENCES contests(id),
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (contest_id, position),
  UNIQUE (contest_id, name)
);

CREATE TABLE tier_golfers (
  tier_id TEXT NOT NULL REFERENCES tiers(id),
  golfer_id TEXT NOT NULL,
  golfer_name TEXT NOT NULL,
  PRIMARY KEY (tier_id, golfer_id)
);
