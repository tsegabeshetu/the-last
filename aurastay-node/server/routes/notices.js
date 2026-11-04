import express from 'express';
import multer from 'multer';
import { getDb, saveDb, newId } from '../store.js';
import { requireAuth } from '../middleware.js';
import { rateLimit } from '../rate-limit.js';
import { badRequest, forbidden, notFound } from '../http-error.js';
import { asBool, noticeSource, phone, text } from '../validate.js';
import { MAX_UPLOAD_BYTES, imageUrl, removeImage, storeImage } from '../uploads.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(badRequest('Choose a JPG, PNG or WebP photo.'));
    }
    callback(null, true);
  },
});

function withUrl(notice) {
  return {
    id: notice.id,
    kind: notice.kind,
    user_id: notice.user_id,
    title: notice.title,
    body: notice.body,
    source: notice.source,
    location: notice.location,
    contact: notice.contact,
    photo_url: imageUrl(notice.photo_path),
    consent: notice.consent,
    is_example: notice.is_example,
    created_at: notice.created_at,
  };
}

export function listNotices({ kind, source, q, limit = 200 } = {}) {
  const db = getDb();
  let rows = [...db.notices];
  if (kind === 'news' || kind === 'missing') rows = rows.filter((notice) => notice.kind === kind);
  if (source && source !== 'all') rows = rows.filter((notice) => notice.source === source);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((notice) =>
      `${notice.title} ${notice.location} ${notice.body}`.toLowerCase().includes(needle),
    );
  }
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows.slice(0, Math.min(Number(limit) || 200, 500)).map(withUrl);
}

router.get('/', (req, res) => {
  res.json({
    notices: listNotices({
      kind: req.query.kind,
      source: req.query.source,
      q: req.query.q,
      limit: req.query.limit,
    }),
  });
});

router.get('/:id', (req, res, next) => {
  try {
    const notice = getDb().notices.find((candidate) => candidate.id === req.params.id);
    if (!notice) throw notFound('Notice not found.');
    res.json({ notice: withUrl(notice) });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/news',
  requireAuth,
  rateLimit({ scope: 'news-create', windowMs: 60 * 60_000, max: 10 }),
  upload.single('photo'),
  (req, res, next) => {
    let stored = null;
    try {
      const title = text(req.body?.title, 'Headline', { min: 3, max: 140 });
      const body = text(req.body?.body, 'News details', { min: 10, max: 3000 });
      const location = text(req.body?.location, 'Region / location', { min: 2, max: 160 });
      const source = noticeSource(req.body?.source);
      if (!asBool(req.body?.consent)) {
        throw badRequest('Confirm that you have permission to publish this notice.');
      }
      if (req.file) stored = storeImage(req.file);

      const notice = {
        id: newId('news'),
        kind: 'news',
        user_id: req.user.id,
        title,
        body,
        source,
        location,
        contact: null,
        photo_path: stored?.filename || null,
        consent: true,
        is_example: false,
        created_at: new Date().toISOString(),
      };
      const db = getDb();
      db.notices.push(notice);
      saveDb();
      res.status(201).json({ notice: withUrl(notice) });
    } catch (error) {
      if (stored) removeImage(stored.filename);
      next(error);
    }
  },
);

router.post(
  '/missing',
  rateLimit({ scope: 'missing-create', windowMs: 60 * 60_000, max: 5 }),
  upload.single('photo'),
  (req, res, next) => {
    let stored = null;
    try {
      const title = text(req.body?.title, 'Full name', { min: 3, max: 140 });
      const body = text(req.body?.body, 'Details', { min: 10, max: 3000 });
      const location = text(req.body?.location, 'Last seen location', { min: 2, max: 160 });
      const contact = phone(req.body?.contact);
      if (!asBool(req.body?.consent)) {
        throw badRequest('Confirm that you are authorized to share this person’s details.');
      }
      if (!req.file) throw badRequest('Attach a photo to the missing-person notice.');
      stored = storeImage(req.file);

      const notice = {
        id: newId('missing'),
        kind: 'missing',
        user_id: null,
        title,
        body,
        source: 'Community',
        location,
        contact,
        photo_path: stored.filename,
        consent: true,
        is_example: false,
        created_at: new Date().toISOString(),
      };
      const db = getDb();
      db.notices.push(notice);
      saveDb();
      res.status(201).json({ notice: withUrl(notice) });
    } catch (error) {
      if (stored) removeImage(stored.filename);
      next(error);
    }
  },
);

router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const notice = db.notices.find((candidate) => candidate.id === req.params.id);
    if (!notice) throw notFound('Notice not found.');
    const isOwner = notice.user_id && notice.user_id === req.user.id;
    if (req.user.role !== 'admin' && !isOwner) {
      throw forbidden('You can only remove notices you submitted.');
    }
    if (notice.photo_path) removeImage(notice.photo_path);
    db.notices = db.notices.filter((candidate) => candidate.id !== notice.id);
    saveDb();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
