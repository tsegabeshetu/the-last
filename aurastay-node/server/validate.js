import { badRequest } from './http-error.js';
import { CATEGORIES, NOTICE_SOURCES, SEVERITIES, STATUSES, agencyFor, severityFor } from '../shared/domain.js';

export function text(value, label, { min = 1, max = 255, required = true } = {}) {
  if (value == null || value === '') {
    if (!required) return null;
    throw badRequest(`${label} is required.`);
  }
  if (typeof value !== 'string') throw badRequest(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(`${label} must be at least ${min} characters.`);
  if (trimmed.length > max) throw badRequest(`${label} must be at most ${max} characters.`);
  return trimmed;
}

export function optionalText(value, label, options = {}) {
  if (value == null || value === '') return null;
  return text(value, label, { ...options, required: false });
}

export function pick(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw badRequest(`${label} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

export function numberInRange(value, label, min, max) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw badRequest(`${label} must be a number between ${min} and ${max}.`);
  }
  return number;
}

export function email(value) {
  const address = text(value, 'Email', { min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw badRequest('Enter a valid email address.');
  return address;
}

export function phone(value) {
  const number = text(value, 'Contact phone', { min: 3, max: 24 });
  if (!/^\+?[0-9 ()-]{3,24}$/.test(number)) throw badRequest('Enter a valid phone number.');
  return number;
}

export function asBool(value) {
  if (value === true || value === 'true' || value === 'on' || value === '1') return true;
  return false;
}

export function listFrom(value, { max = 20, itemMax = 100 } = {}) {
  if (value == null || value === '') return [];
  let list = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        list = JSON.parse(trimmed);
      } catch {
        throw badRequest('Skills must be a list.');
      }
    } else {
      list = trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(list)) throw badRequest('Skills must be a list.');
  const cleaned = [];
  for (const item of list) {
    if (typeof item !== 'string') throw badRequest('Each skill must be text.');
    const skill = item.trim();
    if (!skill) continue;
    if (skill.length > itemMax) throw badRequest(`Each skill must be at most ${itemMax} characters.`);
    if (!cleaned.includes(skill)) cleaned.push(skill);
    if (cleaned.length > max) throw badRequest(`At most ${max} skills are allowed.`);
  }
  return cleaned;
}

export function incidentInput(body) {
  const category = pick(body.category, CATEGORIES, 'Category');
  const issue = text(body.title || body.issue, 'Incident type', { min: 3, max: 120 });
  const description = text(body.description, 'Description', { min: 5, max: 2000 });
  const latitude = numberInRange(body.latitude, 'Latitude', -90, 90);
  const longitude = numberInRange(body.longitude, 'Longitude', -180, 180);
  return {
    title: issue,
    description,
    category,
    agency: agencyFor(category, issue),
    severity: severityFor(category, issue, body.severity),
    latitude,
    longitude,
  };
}

export function statusValue(value) {
  return pick(value, STATUSES, 'Status');
}

export function severityValue(value) {
  return pick(value, SEVERITIES, 'Severity');
}

export function noticeSource(value) {
  return pick(value, NOTICE_SOURCES, 'Source');
}
