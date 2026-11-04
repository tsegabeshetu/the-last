import express from 'express';
import { getDb } from '../store.js';
import { buildOrgTree, getHierarchyDepth } from '../../shared/domain.js';

const router = express.Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const employees = [...db.employees].sort((a, b) => a.name.localeCompare(b.name));
  const incidents = db.incidents;
  const notices = db.notices;
  const departments = {};
  for (const employee of employees) {
    const key = employee.department || 'Unassigned';
    departments[key] = (departments[key] || 0) + 1;
  }
  res.json({
    employees: {
      total: employees.length,
      depth: getHierarchyDepth(buildOrgTree(employees)),
      topLevel: employees.filter((employee) => !employee.manager_id).length,
      departments: Object.entries(departments)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      recent: [...employees]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 6),
    },
    incidents: {
      total: incidents.length,
      open: incidents.filter((incident) => incident.status !== 'Resolved').length,
      resolved: incidents.filter((incident) => incident.status === 'Resolved').length,
      byCategory: {
        critical: incidents.filter((incident) => incident.category === 'critical').length,
        infrastructure: incidents.filter((incident) => incident.category === 'infrastructure').length,
        community: incidents.filter((incident) => incident.category === 'community').length,
      },
    },
    notices: {
      news: notices.filter((notice) => notice.kind === 'news').length,
      missing: notices.filter((notice) => notice.kind === 'missing').length,
      examples: notices.filter((notice) => notice.is_example).length,
    },
    users: db.users.length,
  });
});

export default router;
