import express from 'express';
import { getDb, saveDb, newId } from '../store.js';
import { broadcast, subscribe } from '../events.js';
import { rateLimit } from '../rate-limit.js';
import { requireStaff } from '../middleware.js';
import { notFound } from '../http-error.js';
import { incidentInput, statusValue } from '../validate.js';
import { CATEGORIES, STATUSES } from '../../shared/domain.js';

const router = express.Router();

export function listIncidents({ category, status, limit = 200 } = {}) {
  const db = getDb();
  let rows = [...db.incidents];
  if (category && CATEGORIES.includes(category)) {
    rows = rows.filter((incident) => incident.category === category);
  }
  if (status && STATUSES.includes(status)) {
    rows = rows.filter((incident) => incident.status === status);
  }
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows.slice(0, Math.min(Number(limit) || 200, 500));
}

router.get('/', (req, res) => {
  res.json({
    incidents: listIncidents({
      category: req.query.category,
      status: req.query.status,
      limit: req.query.limit,
    }),
  });
});

router.get('/stream', (req, res) => {
  subscribe(req, res, { incidents: listIncidents() });
});

router.post(
  '/',
  rateLimit({ scope: 'incident-create', windowMs: 60_000, max: 15 }),
  (req, res, next) => {
    try {
      const input = incidentInput(req.body || {});
      const db = getDb();
      const incident = {
        id: newId('inc'),
        ...input,
        status: 'Reported',
        votes: 0,
        created_at: new Date().toISOString(),
      };
      db.incidents.push(incident);
      saveDb();
      const incidents = listIncidents();
      broadcast('incidents', { incidents });
      res.status(201).json({ incident });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id',
  rateLimit({ scope: 'incident-update', windowMs: 60_000, max: 40 }),
  (req, res, next) => {
    try {
      const db = getDb();
      const incident = db.incidents.find((candidate) => candidate.id === req.params.id);
      if (!incident) throw notFound('Incident not found.');

      let changed = false;

      if (req.body?.status !== undefined) {
        if (!req.user || !['admin', 'member'].includes(req.user.role)) {
          return res.status(401).json({
            error: { message: 'Sign in as staff to dispatch or resolve a demo report.' },
          });
        }
        incident.status = statusValue(req.body.status);
        changed = true;
      }

      if (req.body?.vote === true) {
        incident.votes = Math.max(0, Number(incident.votes) || 0) + 1;
        changed = true;
      }

      if (!changed) {
        return res.status(400).json({ error: { message: 'Nothing to update.' } });
      }

      saveDb();
      const incidents = listIncidents();
      broadcast('incidents', { incidents });
      res.json({ incident });
    } catch (error) {
      next(error);
    }
  },
);

// Explicitly require staff for the status-only helper route used by the UI.
router.post('/:id/dispatch', requireStaff, (req, res, next) => {
  try {
    const db = getDb();
    const incident = db.incidents.find((candidate) => candidate.id === req.params.id);
    if (!incident) throw notFound('Incident not found.');
    incident.status = incident.status === 'Reported' ? 'Dispatched' : 'Resolved';
    saveDb();
    const incidents = listIncidents();
    broadcast('incidents', { incidents });
    res.json({ incident });
  } catch (error) {
    next(error);
  }
});

export default router;
