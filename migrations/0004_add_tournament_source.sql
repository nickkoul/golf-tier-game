ALTER TABLE tournaments ADD COLUMN source TEXT NOT NULL DEFAULT 'espn' CHECK (source = 'espn');
