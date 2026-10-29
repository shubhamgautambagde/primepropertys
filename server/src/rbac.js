import { hasPermission } from './auth.js';

// Priority 2 — Advanced RBAC: custom roles on top of the fixed roles,
// admin audit log, and session revocation. Built-in roles are never
// edited here; custom roles only ADD permissions (listPermissions in
// auth.js unions them). 2FA is NOT implemented: the existing auth
// has no TOTP secret storage, enrolment or recovery flow, and adding
// one ad-hoc would be unsafe — see CHANGELOG (Priority 2, Module 4).

function err(status, code, message) {
  return { status, error: { code, message } };
}

export function logAudit(db, actorId, action, targetType, targetId, details) {
  try {
    db.prepare(`INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?)`).run(actorId || null, action, targetType || '', targetId || null, details || '');
  } catch { /* audit logging must never break the action it records */ }
}

function parsePage(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

function permIds(db, names) {
  const rows = [];
  for (const name of names) {
    const row = db.prepare('SELECT id FROM permissions WHERE name = ?').get(name);
    if (!row) return null;
    rows.push(row.id);
  }
  return rows;
}

export function createCustomRole(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'roles:manage')) return err(403, 'FORBIDDEN', 'Missing permission: roles:manage');
  const b = body && typeof body === 'object' ? body : {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const permissions = Array.isArray(b.permissions) ? b.permissions : [];
  if (!name || name.length > 80) return err(400, 'INVALID_PARAMETER', 'name is required (up to 80 characters)');
  if (permissions.some((p) => typeof p !== 'string')) return err(400, 'INVALID_PARAMETER', 'permissions must be an array of permission names');
  const ids = permIds(db, permissions);
  if (ids === null) return err(400, 'INVALID_PARAMETER', 'One or more permission names do not exist');
  if (db.prepare('SELECT id FROM custom_roles WHERE name = ?').get(name)) return err(409, 'ROLE_EXISTS', 'A custom role with this name already exists');
  const info = db.prepare('INSERT INTO custom_roles (name, description, created_by) VALUES (?, ?, ?)')
    .run(name, typeof b.description === 'string' ? b.description.slice(0, 500) : '', user.id);
  const roleId = Number(info.lastInsertRowid);
  for (const pid of ids) db.prepare('INSERT OR IGNORE INTO custom_role_permissions VALUES (?, ?)').run(roleId, pid);
  logAudit(db, user.id, 'role.create', 'custom_role', roleId, name);
  return { status: 201, body: getCustomRole(db, user, String(roleId)).body };
}

export function listCustomRoles(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'roles:manage')) return err(403, 'FORBIDDEN', 'Missing permission: roles:manage');
  const rows = db.prepare('SELECT * FROM custom_roles ORDER BY name').all();
  for (const r of rows) {
    r.permissions = db.prepare(`SELECT p.name FROM custom_role_permissions crp
      JOIN permissions p ON p.id = crp.permission_id WHERE crp.custom_role_id = ? ORDER BY p.name`).all(r.id).map((x) => x.name);
    r.users = db.prepare('SELECT user_id FROM user_custom_roles WHERE custom_role_id = ?').all(r.id).map((x) => x.user_id);
  }
  return { status: 200, body: { data: rows } };
}

export function getCustomRole(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'roles:manage')) return err(403, 'FORBIDDEN', 'Missing permission: roles:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Role not found');
  const row = db.prepare('SELECT * FROM custom_roles WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Role not found');
  row.permissions = db.prepare(`SELECT p.name FROM custom_role_permissions crp
    JOIN permissions p ON p.id = crp.permission_id WHERE crp.custom_role_id = ? ORDER BY p.name`).all(id).map((x) => x.name);
  row.users = db.prepare('SELECT user_id FROM user_custom_roles WHERE custom_role_id = ?').all(id).map((x) => x.user_id);
  return { status: 200, body: row };
}

export function updateCustomRole(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'roles:manage')) return err(403, 'FORBIDDEN', 'Missing permission: roles:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Role not found');
  const row = db.prepare('SELECT * FROM custom_roles WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Role not found');
  const b = body && typeof body === 'object' ? body : {};
  if (b.permissions !== undefined) {
    if (!Array.isArray(b.permissions)) return err(400, 'INVALID_PARAMETER', 'permissions must be an array');
    const ids = permIds(db, b.permissions);
    if (ids === null) return err(400, 'INVALID_PARAMETER', 'One or more permission names do not exist');
    db.prepare('DELETE FROM custom_role_permissions WHERE custom_role_id = ?').run(id);
    for (const pid of ids) db.prepare('INSERT OR IGNORE INTO custom_role_permissions VALUES (?, ?)').run(id, pid);
  }
  if (b.description !== undefined) {
    db.prepare('UPDATE custom_roles SET description = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(typeof b.description === 'string' ? b.description.slice(0, 500) : '', id);
  }
  logAudit(db, user.id, 'role.update', 'custom_role', id, row.name);
  return getCustomRole(db, user, String(id));
}

export function deleteCustomRole(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'roles:manage')) return err(403, 'FORBIDDEN', 'Missing permission: roles:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Role not found');
  const row = db.prepare('SELECT * FROM custom_roles WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Role not found');
  db.prepare('DELETE FROM custom_roles WHERE id = ?').run(id);
  logAudit(db, user.id, 'role.delete', 'custom_role', id, row.name);
  return { status: 200, body: { ok: true } };
}

export function assignCustomRole(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'roles:manage')) return err(403, 'FORBIDDEN', 'Missing permission: roles:manage');
  const b = body && typeof body === 'object' ? body : {};
  const userId = Number(b.user_id);
  const roleId = Number(b.custom_role_id);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(roleId) || roleId <= 0) {
    return err(400, 'INVALID_PARAMETER', 'user_id and custom_role_id are required');
  }
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) return err(404, 'NOT_FOUND', 'User not found');
  if (!db.prepare('SELECT id FROM custom_roles WHERE id = ?').get(roleId)) return err(404, 'NOT_FOUND', 'Custom role not found');
  db.prepare('INSERT OR IGNORE INTO user_custom_roles VALUES (?, ?)').run(userId, roleId);
  logAudit(db, user.id, 'role.assign', 'user', userId, `custom_role:${roleId}`);
  return { status: 200, body: { ok: true } };
}

export function unassignCustomRole(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'roles:manage')) return err(403, 'FORBIDDEN', 'Missing permission: roles:manage');
  const b = body && typeof body === 'object' ? body : {};
  db.prepare('DELETE FROM user_custom_roles WHERE user_id = ? AND custom_role_id = ?')
    .run(Number(b.user_id), Number(b.custom_role_id));
  logAudit(db, user.id, 'role.unassign', 'user', Number(b.user_id), `custom_role:${b.custom_role_id}`);
  return { status: 200, body: { ok: true } };
}

export function listAuditLog(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'audit:view')) return err(403, 'FORBIDDEN', 'Missing permission: audit:view');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const total = db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').get().n;
  const rows = db.prepare('SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function listSessions(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const rows = db.prepare(`SELECT id, user_id, ip_address, user_agent, created_at, expires_at
    FROM sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY created_at DESC`).all(user.id);
  return { status: 200, body: { data: rows } };
}

export function revokeSession(db, user, token, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Session not found');
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Session not found');
  if (row.user_id !== user.id && !hasPermission(db, user, 'users:manage')) {
    return err(403, 'FORBIDDEN', 'You cannot revoke another user\'s session');
  }
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  logAudit(db, user.id, 'session.revoke', 'session', id, `user:${row.user_id}`);
  return { status: 200, body: { ok: true } };
}
