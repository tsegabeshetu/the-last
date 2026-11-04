import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    console.warn('[env] Could not load .env:', error.message);
  }
}

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  dataDir: process.env.DATA_DIR
    ? path.resolve(ROOT, process.env.DATA_DIR)
    : path.join(ROOT, 'data'),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS) || 7,
  trustProxy: bool(process.env.TRUST_PROXY, false),
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, false),
  demoMode: bool(process.env.DEMO_MODE, true),
  fetan: {
    apiKey: process.env.FETAN_AI_API_KEY || '',
    baseUrl: (process.env.FETAN_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.FETAN_AI_MODEL || 'gpt-4o-mini',
  },
};
