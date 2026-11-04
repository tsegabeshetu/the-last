import express from 'express';
import multer from 'multer';
import { getDb, saveDb, newId } from '../store.js';
import { requireAdmin } from '../middleware.js';
import { badRequest, notFound } from '../http-error.js';
import { listFrom, optionalText, pick, text } from '../validate.js';
import { MAX_UPLOAD_BYTES, removeImage, storeImage } from '../uploads.js';
import { DEPARTMENTS } from '../../shared/domain.js';

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

function list() {
  const db = getDb();
  return [...db.employees].sort((a, b) => a.name.localeCompare(b.name));
}

function getEmployee(id) {
  return getDb().employees.find((employee) => employee.id === id);
}

function assertManager(managerId, employeeId) {
  if (!managerId) return null;
  const db = getDb();
  const manager = db.employees.find((employee) => employee.id === managerId);
  if (!manager) throw badRequest('Selected manager does not exist.');
  if (employeeId && managerId === employeeId) throw badRequest('An employee cannot report to themselves.');
  // Walk up the chain to prevent cycles.
  let cursor = manager;
  const seen = new Set();
  while (cursor) {
    if (cursor.id === employeeId) throw badRequest('That reporting line would create a cycle.');
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    cursor = cursor.manager_id ? getEmployee(cursor.manager_id) : null;
  }
  return managerId;
}

function photoFromRequest(req, existing = null) {
  if (req.file) {
    const stored = storeImage(req.file);
    if (existing && existing.startsWith('/uploads/')) removeImage(existing.split('/').pop());
    return stored.url;
  }
  if (req.body?.remove_photo === 'true' || req.body?.remove_photo === true) {
    if (existing && existing.startsWith('/uploads/')) removeImage(existing.split('/').pop());
    return null;
  }
  const provided = optionalText(req.body?.photo_url, 'Photo URL', { max: 2048 });
  if (provided) {
    if (!/^https?:\/\//i.test(provided) && !provided.startsWith('/uploads/')) {
      throw badRequest('Photo URL must be an https URL or an uploaded file.');
    }
    return provided;
  }
  return existing;
}

function fieldsFromRequest(req, existing = {}) {
  const name = text(req.body?.name, 'Name', { min: 1, max: 255 });
  const title = text(req.body?.title, 'Job title', { min: 1, max: 255 });
  const department = req.body?.department
    ? pick(req.body.department, DEPARTMENTS, 'Department')
    : null;
  const bio = optionalText(req.body?.bio, 'Bio', { max: 2000 });
  const skills = listFrom(req.body?.skills);
  const managerId = assertManager(
    optionalText(req.body?.manager_id, 'Manager', { max: 100 }),
    existing.id || null,
  );
  return { name, title, department, bio, skills, manager_id: managerId };
}

router.get('/', (_req, res) => {
  res.json({ employees: list() });
});

router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const employee = getEmployee(req.params.id);
    if (!employee) throw notFound('Employee not found.');
    const manager = employee.manager_id
      ? db.employees.find((candidate) => candidate.id === employee.manager_id) || null
      : null;
    const directReports = db.employees
      .filter((candidate) => candidate.manager_id === employee.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ employee, manager, directReports });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAdmin, upload.single('photo'), (req, res, next) => {
  try {
    const fields = fieldsFromRequest(req);
    const photo = photoFromRequest(req);
    const now = new Date().toISOString();
    const employee = {
      id: newId('emp'),
      ...fields,
      photo_url: photo,
      created_at: now,
      updated_at: now,
    };
    const db = getDb();
    db.employees.push(employee);
    saveDb();
    res.status(201).json({ employee });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAdmin, upload.single('photo'), (req, res, next) => {
  try {
    const employee = getEmployee(req.params.id);
    if (!employee) throw notFound('Employee not found.');
    const fields = fieldsFromRequest(req, employee);
    const photo = photoFromRequest(req, employee.photo_url || null);
    Object.assign(employee, fields, { photo_url: photo, updated_at: new Date().toISOString() });
    saveDb();
    res.json({ employee });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const employee = getEmployee(req.params.id);
    if (!employee) throw notFound('Employee not found.');
    for (const report of db.employees) {
      if (report.manager_id === employee.id) report.manager_id = employee.manager_id || null;
    }
    if (employee.photo_url && employee.photo_url.startsWith('/uploads/')) {
      removeImage(employee.photo_url.split('/').pop());
    }
    db.employees = db.employees.filter((candidate) => candidate.id !== employee.id);
    saveDb();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
