import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './env.js';
import { createSeed } from './seed.js';
import { pruneSessions } from './auth.js';

const DB_FILE = path.join(config.dataDir, 'db.json');
const UPLOAD_DIR = path.join(config.dataDir, 'uploads');

let db = null;

function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function normalize(data) {
  const seed = createSeed();
  return {
    meta: { ...seed.meta, ...(data.meta || {}) },
    users: Array.isArray(data.users) ? data.users : seed.users,
    sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
    employees: Array.isArray(data.employees) ? data.employees : seed.employees,
    incidents: Array.isArray(data.incidents) ? data.incidents : seed.incidents,
    notices: Array.isArray(data.notices) ? data.notices : seed.notices,
  };
}

export function initStore() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const backup = `${DB_FILE}.corrupt-${Date.now()}`;
      fs.copyFileSync(DB_FILE, backup);
      console.error(`[store] Database is not valid JSON. Backup written to ${backup}.`);
      console.error(`[store] Starting from seed data. Original error: ${error.message}`);
      parsed = createSeed();
    }
    db = normalize(parsed);
    if (pruneSessions(db)) writeDb();
  } else {
    db = createSeed();
    writeDb();
    console.log(`[store] Seeded a new database at ${DB_FILE}`);
  }
  return db;
}

export function getDb() {
  if (!db) initStore();
  return db;
}

function writeDb() {
  ensureDirs();
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temp, DB_FILE);
}

export function saveDb() {
  if (!db) return;
  writeDb();
}

export function newId(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}-${id}` : id;
}

export function uploadDir() {
  ensureDirs();
  return UPLOAD_DIR;
}

export function dataFile() {
  return DB_FILE;
}
