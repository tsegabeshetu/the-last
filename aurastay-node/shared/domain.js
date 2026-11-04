/**
 * Shared domain rules for AURASTAY.
 *
 * This file is plain JavaScript with no Node or browser dependencies so the
 * exact same rules run in the Express API and in the browser bundle.
 */

export const CATEGORIES = ['critical', 'infrastructure', 'community'];

export const AGENCIES = [
  'Fire & Rescue',
  'Police',
  'EEPCO',
  'Water & Sewerage',
  'Municipal Services',
];

export const SEVERITIES = ['Critical', 'Major', 'Moderate'];
export const STATUSES = ['Reported', 'Dispatched', 'Resolved'];
export const NOTICE_SOURCES = ['Police', 'Fire & Rescue', 'Electric Power', 'Community'];

export const DEPARTMENTS = [
  'Executive',
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'Finance',
  'Human Resources',
  'Operations',
  'Legal',
  'Customer Success',
  'Data & Analytics',
  'IT & Infrastructure',
  'Research & Development',
];

export const ISSUES = {
  critical: ['Fire disaster', 'GBV / assault', 'Personal safety'],
  infrastructure: ['Power line / pole', 'Burst water main', 'Sewage leak', 'Dangerous pothole'],
  community: ['Unlit street', 'Uncollected waste', 'Public park hazard', 'Neighborhood concern'],
};

/** Route a report to the agency that would own it in the demo. */
export function agencyFor(category, issue) {
  if (category === 'critical') return issue === 'Fire disaster' ? 'Fire & Rescue' : 'Police';
  if (category === 'infrastructure') {
    if (issue === 'Power line / pole') return 'EEPCO';
    if (issue === 'Sewage leak' || issue === 'Burst water main') return 'Water & Sewerage';
    return 'Municipal Services';
  }
  return 'Municipal Services';
}

/** Critical reports are always Critical severity in the demo. */
export function severityFor(category, issue, requested) {
  if (category === 'critical') return 'Critical';
  return SEVERITIES.includes(requested) ? requested : 'Major';
}

/** Build the SMS failover preview. It is never sent by the app. */
export function makeSms(lat, lng, title) {
  return `AURASTAY DEMO | ${title} | GPS ${Number(lat).toFixed(6)},${Number(lng).toFixed(6)} | SIMULATION ONLY — NOT SENT`;
}

export function getInitials(name = '') {
  return String(name)
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Build a manager → reports tree from a flat employee list. */
export function buildOrgTree(employees) {
  const map = new Map();
  const roots = [];
  for (const employee of employees) map.set(employee.id, { ...employee, children: [] });
  for (const employee of employees) {
    const node = map.get(employee.id);
    if (employee.manager_id && map.has(employee.manager_id)) {
      map.get(employee.manager_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function getHierarchyDepth(nodes) {
  if (!nodes || nodes.length === 0) return 0;
  return 1 + Math.max(...nodes.map((node) => getHierarchyDepth(node.children)));
}

export function isCategory(value) {
  return CATEGORIES.includes(value);
}
