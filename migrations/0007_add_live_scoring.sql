ALTER TABLE tournaments ADD COLUMN espn_event_id TEXT;

CREATE TABLE tournament_refreshes (
  tournament_id TEXT PRIMARY KEY NOT NULL REFERENCES tournaments(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'complete', 'cancelled')),
  last_success_at TEXT NOT NULL,
  source_payload TEXT NOT NULL
);

CREATE TABLE golfer_scores (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  golfer_id TEXT NOT NULL,
  golfer_name TEXT NOT NULL,
  fantasy_points REAL,
  position TEXT,
  score_to_par TEXT,
  current_round INTEGER,
  through_status TEXT,
  source_payload TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, golfer_id)
);

CREATE INDEX golfer_scores_tournament_id ON golfer_scores(tournament_id);
