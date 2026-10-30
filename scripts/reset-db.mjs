/**
 * Deletes the local SQLite database + generated media, then reseeds demo data.
 * Usage: npm run db:reset
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = process.env.SOCIALMK_DATA_DIR
  ? path.resolve(process.env.SOCIALMK_DATA_DIR)
  : path.join(root, 'apps/api/data');

if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`removed ${path.relative(root, dataDir)}`);
}

const result = spawnSync('npm', ['run', 'seed'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
