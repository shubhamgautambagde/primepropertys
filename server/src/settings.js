import { hasPermission, isValidEmail } from './auth.js';

// Site settings (autopilot slice 3). Only four non-secret keys are
// ever stored — the allowlist is the security mechanism. Any other
// key (smtp_password, api_key, payment secret, otp secret, ...)
// is refused, so secrets can never land in this table. Secrets
// belong in environment variables on the server.

export const SETTING_KEYS = ['site_name', 'support_email', 'contact_number', 'default_country'];
const MAX_LEN = { site_name: 200, support_email: 200, contact_number: 50, default_country: 100 };

function err(status, code, message) {
  return { status, error: { code, message } };
}

function canManage(db, user) {
  return !!user && hasPermission(db, user, 'settings:manage');
}

function readAll(db) {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM site_settings').all()) {
    if (SETTING_KEYS.includes(row.key)) out[row.key] = row.value;
  }
  for (const k of SETTING_KEYS) if (!(k in out)) out[k] = '';
  return out;
}

export function getSettings(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: settings:manage');
  return {
    status: 200,
    body: {
      ok: true,
      data: {
        settings: readAll(db),
        // Provider status only — never a secret value. The server
        // reads EMAIL_BACKEND ('console' prints links to the log;
        // anything else answers 503 until a provider exists).
        providers: { email_backend: process.env.EMAIL_BACKEND || 'not-configured' },
      },
    },
  };
}

export function putSettings(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: settings:manage');
  const b = body && typeof body === 'object' ? body : {};
  const updates = {};
  for (const key of Object.keys(b)) {
    if (!SETTING_KEYS.includes(key)) {
      return err(400, 'INVALID_PARAMETER', `Setting "${key}" is not a stored setting (only ${SETTING_KEYS.join(', ')} are stored; secrets are never stored here)`);
    }
    const v = typeof b[key] === 'string' ? b[key].trim() : '';
    if (v.length > MAX_LEN[key]) return err(400, 'INVALID_PARAMETER', `${key} exceeds ${MAX_LEN[key]} characters`);
    updates[key] = v;
  }
  if (updates.support_email !== undefined && updates.support_email !== '' && !isValidEmail(updates.support_email)) {
    return err(400, 'INVALID_PARAMETER', 'support_email is not a valid email address');
  }
  if (!Object.keys(updates).length) return err(400, 'INVALID_PARAMETER', 'Nothing to update');
  db.exec('BEGIN');
  try {
    const stmt = db.prepare(`INSERT INTO site_settings (key, value, updated_by, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value,
        updated_by = excluded.updated_by, updated_at = datetime('now')`);
    for (const [key, value] of Object.entries(updates)) stmt.run(key, value, user.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { status: 200, body: { ok: true, data: { settings: readAll(db) } } };
}
