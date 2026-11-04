import express from 'express';
import { config } from '../env.js';
import { getDb, saveDb, newId } from '../store.js';
import {
  hashPassword,
  verifyPassword,
  publicUser,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
} from '../auth.js';
import { requireAuth, requireAdmin } from '../middleware.js';
import { rateLimit } from '../rate-limit.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../http-error.js';
import { text, email as emailValue } from '../validate.js';

const router = express.Router();

function findUserByEmail(db, email) {
  return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

router.post(
  '/login',
  rateLimit({ scope: 'login', windowMs: 10 * 60_000, max: 20 }),
  (req, res, next) => {
    try {
      const email = emailValue(req.body?.email);
      const password = text(req.body?.password, 'Password', { min: 1, max: 200 });
      const db = getDb();
      const user = findUserByEmail(db, email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        throw unauthorized('Email or password is incorrect.');
      }
      const token = createSession(user.id);
      setSessionCookie(res, token);
      res.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/logout', (req, res) => {
  destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/password', requireAuth, (req, res, next) => {
  try {
    const currentPassword = text(req.body?.currentPassword, 'Current password', { min: 1, max: 200 });
    const newPassword = text(req.body?.newPassword, 'New password', { min: 8, max: 200 });
    if (!verifyPassword(currentPassword, req.user.password_hash)) {
      throw badRequest('Current password is incorrect.');
    }
    req.user.password_hash = hashPassword(newPassword);
    const db = getDb();
    for (const [token, session] of Object.entries(db.sessions)) {
      if (session.userId === req.user.id && token !== req.sessionToken) delete db.sessions[token];
    }
    saveDb();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/users', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({
    users: db.users.map((user) => ({
      ...publicUser(user),
      last_login: user.last_login || null,
    })),
  });
});

router.post('/users', requireAdmin, (req, res, next) => {
  try {
    const name = text(req.body?.name, 'Name', { min: 1, max: 120 });
    const email = emailValue(req.body?.email);
    const password = text(req.body?.password, 'Password', { min: 8, max: 200 });
    const role = req.body?.role === 'admin' ? 'admin' : 'member';
    const db = getDb();
    if (findUserByEmail(db, email)) throw conflict('An account with that email already exists.');
    const user = {
      id: newId('user'),
      name,
      email,
      role,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    saveDb();
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:id', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.users.find((candidate) => candidate.id === req.params.id);
    if (!user) throw notFound('Account not found.');
    if (user.id === req.user.id) throw forbidden('You cannot delete your own account.');
    const admins = db.users.filter((candidate) => candidate.role === 'admin');
    if (user.role === 'admin' && admins.length <= 1) {
      throw forbidden('At least one admin account must remain.');
    }
    db.users = db.users.filter((candidate) => candidate.id !== user.id);
    for (const [token, session] of Object.entries(db.sessions)) {
      if (session.userId === user.id) delete db.sessions[token];
    }
    for (const notice of db.notices) {
      if (notice.user_id === user.id) notice.user_id = null;
    }
    saveDb();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/register',
  rateLimit({ scope: 'register', windowMs: 60 * 60_000, max: 5 }),
  (req, res, next) => {
    try {
      if (!config.allowRegistration) {
        throw forbidden('Self-service registration is disabled. Ask an admin for an account.');
      }
      const name = text(req.body?.name, 'Name', { min: 1, max: 120 });
      const email = emailValue(req.body?.email);
      const password = text(req.body?.password, 'Password', { min: 8, max: 200 });
      const db = getDb();
      if (findUserByEmail(db, email)) throw conflict('An account with that email already exists.');
      const user = {
        id: newId('user'),
        name,
        email,
        role: 'member',
        password_hash: hashPassword(password),
        created_at: new Date().toISOString(),
      };
      db.users.push(user);
      saveDb();
      const token = createSession(user.id);
      setSessionCookie(res, token);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
