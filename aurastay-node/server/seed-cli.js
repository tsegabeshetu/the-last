/**
 * Rebuild data/db.json from the fictional seed data.
 * Usage: npm run seed -- --force
 *
 * Without --force this refuses to overwrite an existing database so real
 * submissions are never silently destroyed.
 */
import fs from 'node:fs';
import { config } from './env.js';
import { dataFile } from './store.js';
import { createSeed } from './seed.js';

const force = process.argv.includes('--force');
const file = dataFile();

if (fs.existsSync(file) && !force) {
  console.error(`Refusing to overwrite ${file}. Re-run with --force to reset the demo database.`);
  process.exit(1);
}

fs.mkdirSync(config.dataDir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(createSeed(), null, 2), 'utf8');
console.log(`Seeded ${file}`);
