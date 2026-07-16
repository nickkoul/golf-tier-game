import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const token = 'golf-tiers-demo-sign-in';
const tokenHash = createHash('sha256').update(token).digest('hex');
const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
const availableAt = new Date().toISOString();
const tournamentId = 'golf-tiers-demo-tournament';

run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local']);
run('npx', [
  'wrangler',
  'd1',
  'execute',
  'DB',
  '--local',
  '--command',
  `INSERT INTO tournaments (id, name, starts_at, time_zone, source, field_available_at) VALUES ('${tournamentId}', 'Golf Tiers Demo Invitational', '${startsAt}', 'America/New_York', 'espn', '${availableAt}') ON CONFLICT(id) DO UPDATE SET starts_at = excluded.starts_at, field_available_at = excluded.field_available_at; DELETE FROM tournament_golfers WHERE tournament_id = '${tournamentId}'; INSERT INTO tournament_golfers (tournament_id, golfer_id, golfer_name) VALUES ('${tournamentId}', 'avery-ace', 'Avery Ace'), ('${tournamentId}', 'blair-birdie', 'Blair Birdie'), ('${tournamentId}', 'cameron-chip', 'Cameron Chip'), ('${tournamentId}', 'dana-drive', 'Dana Drive'), ('${tournamentId}', 'elliot-eagle', 'Elliot Eagle'), ('${tournamentId}', 'frankie-fairway', 'Frankie Fairway'), ('${tournamentId}', 'gale-green', 'Gale Green'), ('${tournamentId}', 'harper-hook', 'Harper Hook'), ('${tournamentId}', 'indigo-iron', 'Indigo Iron'), ('${tournamentId}', 'jordan-jam', 'Jordan Jam'), ('${tournamentId}', 'kai-kick', 'Kai Kick'), ('${tournamentId}', 'logan-lag', 'Logan Lag'), ('${tournamentId}', 'morgan-mash', 'Morgan Mash'), ('${tournamentId}', 'noel-niblick', 'Noel Niblick'), ('${tournamentId}', 'oakley-approach', 'Oakley Approach'), ('${tournamentId}', 'parker-putt', 'Parker Putt'), ('${tournamentId}', 'quinn-quarry', 'Quinn Quarry'), ('${tournamentId}', 'riley-rough', 'Riley Rough'), ('${tournamentId}', 'sasha-sand', 'Sasha Sand'), ('${tournamentId}', 'taylor-tee', 'Taylor Tee'), ('${tournamentId}', 'uma-up-and-down', 'Uma Up and Down'), ('${tournamentId}', 'val-victory', 'Val Victory'); INSERT INTO sign_in_links (token_hash, email, expires_at, used_at) VALUES ('${tokenHash}', 'demo@golftiers.local', '${expiresAt}', NULL) ON CONFLICT(token_hash) DO UPDATE SET expires_at = excluded.expires_at, used_at = NULL;`,
]);

console.log(`\nOpen http://localhost:5173/verify?token=${token}\n`);
if (!process.argv.includes('--seed-only')) run('npm', ['run', 'dev']);
