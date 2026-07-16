CREATE TABLE invitations (
  id TEXT PRIMARY KEY NOT NULL,
  contest_id TEXT NOT NULL REFERENCES contests(id),
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  responded_at TEXT,
  response TEXT CHECK (response IN ('accepted', 'declined'))
);

CREATE INDEX invitations_contest_id ON invitations(contest_id);
CREATE INDEX invitations_email ON invitations(email);

CREATE TABLE participants (
  contest_id TEXT NOT NULL REFERENCES contests(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (contest_id, user_id)
);

CREATE INDEX participants_user_id ON participants(user_id);
