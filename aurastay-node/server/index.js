import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './env.js';
import { initStore, saveDb, uploadDir, dataFile } from './store.js';
import { attachUser, sameOrigin } from './middleware.js';
import authRoutes from './routes/auth.js';
import incidentRoutes from './routes/incidents.js';
import noticeRoutes from './routes/notices.js';
import employeeRoutes from './routes/employees.js';
import fetanRoutes from './routes/fetan.js';
import statsRoutes from './routes/stats.js';
import { HttpError } from './http-error.js';
import { closeAll } from './events.js';

initStore();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
      "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(attachUser);
app.use(sameOrigin);
// Serves your index.html from your local public folder 
app.use(express.static(path.join(import.meta.dirname, '../public')));

// Serves the full suite of UI layouts, styles, and single-page routing scripts
app.use('/frontend', express.static(path.join(import.meta.dirname, '../../aec/frontend')));
// The AEC pages reference assets relative to the site root (assets/img/... and
// vendor/leaflet/...), so expose the frontend folder at the root as well.
app.use(express.static(path.join(import.meta.dirname, '../../aec/frontend')));

if (!config.isProduction) {
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api')) {
        console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`);
      }
    });
    next();
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'AURASTAY',
    demo: config.demoMode,
    aiConfigured: Boolean(config.fetan.apiKey),
    registration: config.allowRegistration,
    time: new Date().toISOString(),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    demoMode: config.demoMode,
    aiConfigured: Boolean(config.fetan.apiKey),
    allowRegistration: config.allowRegistration,
    appName: 'AURASTAY',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/fetan', fetanRoutes);
app.use('/api/stats', statsRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { message: 'API route not found.' } });
});

const publicDir = path.join(config.root, 'public');
const leafletDir = path.join(config.root, 'node_modules', 'leaflet', 'dist');

app.use(
  '/uploads',
  express.static(uploadDir(), {
    index: false,
    dotfiles: 'deny',
    maxAge: '7d',
    immutable: true,
  }),
);

app.use(
  '/vendor/leaflet',
  express.static(leafletDir, { index: false, maxAge: '30d' }),
);

app.use(
  '/shared',
  express.static(path.join(config.root, 'shared'), { index: false, maxAge: '1h' }),
);

app.use(
  express.static(publicDir, {
    index: false,
    dotfiles: 'deny',
    maxAge: config.isProduction ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { message: 'API route not found.' } });
  }
  if (path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  let status = 500;
  let message = 'Something went wrong. Please try again.';

  if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
  } else if (error?.name === 'MulterError') {
    status = 400;
    message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Photo must be smaller than 5 MB.'
        : 'The upload could not be accepted.';
  } else if (error?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON.';
  } else if (error?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large.';
  }

  if (status >= 500) console.error('[api]', error);
  if (res.headersSent) return;
  res.status(status).json({ error: { message } });
});

const server = app.listen(config.port, config.host, () => {
  const shownHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log('');
  console.log('  AURASTAY — JavaScript frontend + Express backend');
  console.log(`  Local:   http://${shownHost}:${config.port}`);
  console.log(`  Data:    ${dataFile()}`);
  console.log(`  Demo AI: ${config.fetan.apiKey ? 'live model configured' : 'built-in guide only'}`);
  console.log('');
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down…`);
  closeAll();
  saveDb();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});
