import { hasPermission } from './auth.js';
import { logAudit } from './rbac.js';

// Priority 2 — Builder Projects + Units. Builders manage only their
// own projects; Admin/Super Admin (projects:view_any / verify) see
// and verify any project. Status flow: draft -> pending (submit) ->
// approved/rejected (verify) -> published (publish) -> approved
// (unpublish) / archived. Units: available/reserved/sold, set only
// by the project owner or a verifier.

function err(status, code, message) {
  return { status, error: { code, message } };
}
function load(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM builder_projects WHERE id = ?').get(id) || null;
}
function canManage(db, user, p) {
  if (!user) return false;
  if (p.builder_id === user.id && hasPermission(db, user, 'projects:manage_own')) return true;
  return hasPermission(db, user, 'projects:view_any');
}
function canSee(db, user, p) {
  if (p.status === 'published') return true;
  if (!user) return false;
  return canManage(db, user, p);
}
function parsePage(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}
function withChildren(db, p) {
  p.locations = db.prepare('SELECT * FROM project_locations WHERE project_id = ?').all(p.id);
  p.towers = db.prepare('SELECT * FROM project_towers WHERE project_id = ?').all(p.id);
  p.units = db.prepare('SELECT * FROM project_units WHERE project_id = ? ORDER BY id').all(p.id);
  p.unit_counts = {
    total: p.units.length,
    available: p.units.filter((u) => u.status === 'available').length,
    reserved: p.units.filter((u) => u.status === 'reserved').length,
    sold: p.units.filter((u) => u.status === 'sold').length,
  };
  p.milestones = db.prepare('SELECT * FROM project_milestones WHERE project_id = ? ORDER BY id').all(p.id);
  p.amenities = db.prepare('SELECT * FROM project_amenities WHERE project_id = ?').all(p.id);
  p.documents = db.prepare('SELECT * FROM project_documents WHERE project_id = ?').all(p.id);
  p.offers = db.prepare('SELECT * FROM project_offers WHERE project_id = ?').all(p.id);
  return p;
}

export function createProject(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'projects:create')) return err(403, 'FORBIDDEN', 'Missing permission: projects:create');
  const b = body && typeof body === 'object' ? body : {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const city = typeof b.city === 'string' ? b.city.trim() : '';
  if (!name || name.length > 200) return err(400, 'INVALID_PARAMETER', 'name is required (up to 200 characters)');
  if (!city) return err(400, 'INVALID_PARAMETER', 'city is required');
  const type = b.project_type || 'residential';
  if (!['residential', 'commercial', 'mixed', 'land'].includes(type)) return err(400, 'INVALID_PARAMETER', 'project_type must be residential, commercial, mixed or land');
  const info = db.prepare(`INSERT INTO builder_projects
    (builder_id, name, description, project_type, city, locality, address, rera_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(user.id, name,
    typeof b.description === 'string' ? b.description.slice(0, 5000) : '',
    type, city, typeof b.locality === 'string' ? b.locality.slice(0, 200) : '',
    typeof b.address === 'string' ? b.address.slice(0, 500) : '',
    typeof b.rera_number === 'string' ? b.rera_number.slice(0, 100) : null);
  const p = db.prepare('SELECT * FROM builder_projects WHERE id = ?').get(Number(info.lastInsertRowid));
  if (b.location && typeof b.location === 'object') {
    db.prepare('INSERT INTO project_locations (project_id, address, city, locality, pincode, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, b.location.address || '', b.location.city || city, b.location.locality || '', b.location.pincode || null,
        typeof b.location.latitude === 'number' ? b.location.latitude : null,
        typeof b.location.longitude === 'number' ? b.location.longitude : null);
  }
  logAudit(db, user.id, 'project.create', 'builder_project', p.id, name);
  return { status: 201, body: withChildren(db, p) };
}

export function listProjects(db, user, url) {
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const q = url.searchParams;
  const where = [];
  const params = [];
  // Visibility: published is public; everything else needs ownership/manage.
  if (!user || !hasPermission(db, user, 'projects:view_any')) {
    where.push('(status = ? OR builder_id = ?)');
    params.push('published', user ? user.id : -1);
  }
  if (q.get('city')) { where.push('city = ?'); params.push(q.get('city')); }
  if (q.get('project_type')) { where.push('project_type = ?'); params.push(q.get('project_type')); }
  if (q.get('status')) {
    if (!['draft', 'pending', 'approved', 'rejected', 'published', 'archived'].includes(q.get('status'))) {
      return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    }
    where.push('status = ?'); params.push(q.get('status'));
  }
  if (q.get('min_price')) {
    const n = Number(q.get('min_price'));
    if (!Number.isFinite(n) || n < 0) return err(400, 'INVALID_PARAMETER', 'min_price must be a number >= 0');
    where.push('EXISTS (SELECT 1 FROM project_units u WHERE u.project_id = builder_projects.id AND u.price_inr >= ?)');
    params.push(n);
  }
  if (q.get('max_price')) {
    const n = Number(q.get('max_price'));
    if (!Number.isFinite(n) || n < 0) return err(400, 'INVALID_PARAMETER', 'max_price must be a number >= 0');
    where.push('EXISTS (SELECT 1 FROM project_units u WHERE u.project_id = builder_projects.id AND u.price_inr <= ?)');
    params.push(n);
  }
  if (q.get('mine') === '1') {
    if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
    where.push('builder_id = ?'); params.push(user.id);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM builder_projects ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM builder_projects ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  for (const r of rows) {
    r.unit_counts = {
      total: db.prepare('SELECT COUNT(*) AS n FROM project_units WHERE project_id = ?').get(r.id).n,
      available: db.prepare("SELECT COUNT(*) AS n FROM project_units WHERE project_id = ? AND status = 'available'").get(r.id).n,
    };
  }
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getProject(db, user, idText) {
  const p = load(db, idText);
  if (!p || !canSee(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  return { status: 200, body: withChildren(db, p) };
}

export function updateProject(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canSee(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  if (!canManage(db, user, p)) return err(403, 'FORBIDDEN', 'You cannot edit this project');
  if (p.status === 'published' || p.status === 'archived') return err(400, 'INVALID_PARAMETER', 'Published or archived projects cannot be edited directly');
  const b = body && typeof body === 'object' ? body : {};
  const allowed = ['name', 'description', 'project_type', 'city', 'locality', 'address', 'rera_number'];
  const updates = {};
  for (const k of allowed) if (b[k] !== undefined) updates[k] = typeof b[k] === 'string' ? b[k].slice(0, 5000) : b[k];
  if (updates.project_type && !['residential', 'commercial', 'mixed', 'land'].includes(updates.project_type)) {
    return err(400, 'INVALID_PARAMETER', 'project_type must be residential, commercial, mixed or land');
  }
  if (!Object.keys(updates).length) return err(400, 'INVALID_PARAMETER', 'No updatable fields provided');
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE builder_projects SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(updates), p.id);
  return { status: 200, body: withChildren(db, db.prepare('SELECT * FROM builder_projects WHERE id = ?').get(p.id)) };
}

function setStatus(db, user, idText, from, to, needVerify, reason) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canSee(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  if (needVerify) {
    if (!hasPermission(db, user, 'projects:verify')) return err(403, 'FORBIDDEN', 'Missing permission: projects:verify');
  } else if (!canManage(db, user, p)) return err(403, 'FORBIDDEN', 'You cannot change this project');
  if (!from.includes(p.status)) return err(400, 'INVALID_PARAMETER', `Cannot move project from ${p.status} to ${to}`);
  db.prepare(`UPDATE builder_projects SET status = ?, rejection_reason = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(to, to === 'rejected' ? (reason || null) : null, p.id);
  logAudit(db, user.id, `project.${to}`, 'builder_project', p.id, p.name);
  return { status: 200, body: withChildren(db, db.prepare('SELECT * FROM builder_projects WHERE id = ?').get(p.id)) };
}
export function submitProject(db, user, idText) { return setStatus(db, user, idText, ['draft', 'rejected'], 'pending', false); }
export function verifyProject(db, user, idText, body) {
  const approve = body && body.approve !== false;
  return setStatus(db, user, idText, ['pending'], approve ? 'approved' : 'rejected', true,
    body && typeof body.reason === 'string' ? body.reason.slice(0, 500) : null);
}
export function publishProject(db, user, idText) { return setStatus(db, user, idText, ['approved'], 'published', false); }
export function unpublishProject(db, user, idText) { return setStatus(db, user, idText, ['published'], 'approved', false); }
export function archiveProject(db, user, idText) { return setStatus(db, user, idText, ['draft', 'approved', 'published', 'rejected'], 'archived', false); }

export function addTower(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  if (!b.name || typeof b.name !== 'string') return err(400, 'INVALID_PARAMETER', 'name is required');
  const info = db.prepare('INSERT INTO project_towers (project_id, name, floors) VALUES (?, ?, ?)')
    .run(p.id, b.name.slice(0, 200), Number.isInteger(b.floors) ? b.floors : null);
  return { status: 201, body: db.prepare('SELECT * FROM project_towers WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function addUnit(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  if (!b.unit_number || typeof b.unit_number !== 'string') return err(400, 'INVALID_PARAMETER', 'unit_number is required');
  if (b.tower_id !== undefined && b.tower_id !== null) {
    const t = db.prepare('SELECT id FROM project_towers WHERE id = ? AND project_id = ?').get(Number(b.tower_id), p.id);
    if (!t) return err(400, 'INVALID_PARAMETER', 'tower_id does not belong to this project');
  }
  const info = db.prepare(`INSERT INTO project_units
    (project_id, tower_id, unit_number, unit_type, price_inr, area_sqft, bedrooms)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(p.id, b.tower_id ? Number(b.tower_id) : null,
    b.unit_number.slice(0, 100), typeof b.unit_type === 'string' ? b.unit_type.slice(0, 100) : '',
    Number.isInteger(b.price_inr) && b.price_inr > 0 ? b.price_inr : null,
    Number.isInteger(b.area_sqft) && b.area_sqft > 0 ? b.area_sqft : null,
    Number.isInteger(b.bedrooms) && b.bedrooms >= 0 ? b.bedrooms : null);
  return { status: 201, body: db.prepare('SELECT * FROM project_units WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function setUnitStatus(db, user, projectIdText, unitIdText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, projectIdText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const u = db.prepare('SELECT * FROM project_units WHERE id = ? AND project_id = ?').get(Number(unitIdText), p.id);
  if (!u) return err(404, 'NOT_FOUND', 'Unit not found');
  const status = body && body.status;
  if (!['available', 'reserved', 'sold'].includes(status)) return err(400, 'INVALID_PARAMETER', 'status must be available, reserved or sold');
  db.prepare(`UPDATE project_units SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, u.id);
  return { status: 200, body: db.prepare('SELECT * FROM project_units WHERE id = ?').get(u.id) };
}

export function addMilestone(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  if (!b.title || typeof b.title !== 'string') return err(400, 'INVALID_PARAMETER', 'title is required');
  const pct = b.progress_pct === undefined ? 0 : Number(b.progress_pct);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return err(400, 'INVALID_PARAMETER', 'progress_pct must be an integer 0-100');
  const info = db.prepare(`INSERT INTO project_milestones (project_id, title, description, progress_pct, due_date)
    VALUES (?, ?, ?, ?, ?)`).run(p.id, b.title.slice(0, 200),
    typeof b.description === 'string' ? b.description.slice(0, 2000) : '', pct,
    typeof b.due_date === 'string' ? b.due_date.slice(0, 30) : null);
  return { status: 201, body: db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function addAmenity(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  if (!b.name || typeof b.name !== 'string') return err(400, 'INVALID_PARAMETER', 'name is required');
  const info = db.prepare('INSERT INTO project_amenities (project_id, name) VALUES (?, ?)').run(p.id, b.name.slice(0, 200));
  return { status: 201, body: db.prepare('SELECT * FROM project_amenities WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function addDocument(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  if (!b.title || typeof b.title !== 'string') return err(400, 'INVALID_PARAMETER', 'title is required');
  const url = typeof b.document_url === 'string' ? b.document_url.trim() : '';
  if (url && !/^https?:\/\//.test(url)) return err(400, 'INVALID_PARAMETER', 'document_url must be an http(s) URL');
  const info = db.prepare('INSERT INTO project_documents (project_id, title, document_url) VALUES (?, ?, ?)')
    .run(p.id, b.title.slice(0, 200), url);
  return { status: 201, body: db.prepare('SELECT * FROM project_documents WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function addOffer(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  if (!b.title || typeof b.title !== 'string') return err(400, 'INVALID_PARAMETER', 'title is required');
  const info = db.prepare(`INSERT INTO project_offers (project_id, title, description, discount_text, starts_at, ends_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(p.id, b.title.slice(0, 200),
    typeof b.description === 'string' ? b.description.slice(0, 2000) : '',
    typeof b.discount_text === 'string' ? b.discount_text.slice(0, 200) : '',
    typeof b.starts_at === 'string' ? b.starts_at.slice(0, 30) : null,
    typeof b.ends_at === 'string' ? b.ends_at.slice(0, 30) : null);
  return { status: 201, body: db.prepare('SELECT * FROM project_offers WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function createEnquiry(db, user, idText, body) {
  const p = load(db, idText);
  if (!p || p.status !== 'published') return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  if (!fullName || !phone) return err(400, 'INVALID_PARAMETER', 'full_name and phone are required');
  const info = db.prepare(`INSERT INTO project_enquiries (project_id, user_id, full_name, phone, email, message)
    VALUES (?, ?, ?, ?, ?, ?)`).run(p.id, user ? user.id : null, fullName.slice(0, 200), phone.slice(0, 50),
    typeof b.email === 'string' ? b.email.slice(0, 200) : null,
    typeof b.message === 'string' ? b.message.slice(0, 5000) : '');
  const row = db.prepare('SELECT * FROM project_enquiries WHERE id = ?').get(Number(info.lastInsertRowid));
  db.prepare(`INSERT INTO project_crm_activities (project_id, actor_id, activity_type, notes)
    VALUES (?, ?, 'enquiry', ?)`).run(p.id, user ? user.id : null, `Enquiry from ${fullName}`);
  return { status: 201, body: row };
}

export function listEnquiries(db, user, idText, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const total = db.prepare('SELECT COUNT(*) AS n FROM project_enquiries WHERE project_id = ?').get(p.id).n;
  const rows = db.prepare('SELECT * FROM project_enquiries WHERE project_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(p.id, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function addActivity(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !canManage(db, user, p)) return err(404, 'NOT_FOUND', 'Project not found');
  const b = body && typeof body === 'object' ? body : {};
  if (!b.activity_type || typeof b.activity_type !== 'string') return err(400, 'INVALID_PARAMETER', 'activity_type is required');
  const info = db.prepare('INSERT INTO project_crm_activities (project_id, actor_id, activity_type, notes) VALUES (?, ?, ?, ?)')
    .run(p.id, user.id, b.activity_type.slice(0, 100), typeof b.notes === 'string' ? b.notes.slice(0, 2000) : '');
  return { status: 201, body: db.prepare('SELECT * FROM project_crm_activities WHERE id = ?').get(Number(info.lastInsertRowid)) };
}
