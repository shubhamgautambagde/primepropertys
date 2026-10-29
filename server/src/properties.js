import { validatePropertyInput, validateImageUrl } from './validate.js';
import { hasPermission } from './auth.js';

// Property write/read handlers for Stage F. Every handler returns
// { status, body } on success or { status, error: { code, message } }.
// Visibility rule (from Stage E): drafts are visible only to their owner
// or to users with properties:view_any; everyone else gets 404 so draft
// existence is never leaked. Published properties are public, but writes
// still require ownership or the matching *_any permission.

function err(status, code, message) {
  return { status, error: { code, message } };
}

function load(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').get(id) || null;
}

function withImages(db, prop) {
  // Phase E: uploaded images appear alongside URL images, served
  // through the gated /api/uploads/:id/file route. Documents are
  // never mixed into images.
  prop.images = db.prepare(
    `SELECT id, url, alt_text, sort_order FROM property_images WHERE property_id = ?
     UNION ALL
     SELECT id, '/api/uploads/' || id || '/file', original_filename, sort_order FROM uploads
       WHERE property_id = ? AND kind = 'image'
     ORDER BY sort_order, id`,
  ).all(prop.id, prop.id);
  return prop;
}

function canView(db, user, prop) {
  if (prop.status === 'published') return true;
  if (!user) return false;
  return prop.owner_id === user.id || hasPermission(db, user, 'properties:view_any');
}

function canEdit(db, user, prop) {
  if (!user) return false;
  if (prop.owner_id === user.id && hasPermission(db, user, 'properties:edit_own')) return true;
  return hasPermission(db, user, 'properties:edit_any');
}

function canDelete(db, user, prop) {
  if (!user) return false;
  if (prop.owner_id === user.id && hasPermission(db, user, 'properties:delete_own')) return true;
  return hasPermission(db, user, 'properties:delete_any');
}

function parsePage(url) {
  const q = url.searchParams;
  const limitRaw = q.get('limit');
  const offsetRaw = q.get('offset');
  const limit = limitRaw === null ? 20 : Number(limitRaw);
  const offset = offsetRaw === null ? 0 : Number(offsetRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

export function createProperty(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'properties:create')) return err(403, 'FORBIDDEN', 'Missing permission: properties:create');
  const v = validatePropertyInput(body, false);
  if (!v.ok) return err(400, 'INVALID_PARAMETER', v.errors.join('; '));
  const c = v.clean;
  // Wizard fields (migration 017): the create call accepts them so
  // the wizard can create a draft carrying every earlier step's
  // answers in one request. Flags default to 0, the rest to NULL.
  const wizCols = ['facing', 'property_age', 'possession_status', 'furnishing_status',
    'floor_number', 'total_floors', 'unit_number', 'approval_by', 'balconies',
    'servant_room', 'is_corner', 'is_gated', 'has_lift', 'has_reserved_parking',
    'open_parking', 'covered_parking', 'builtup_area_sqft', 'carpet_area_sqft',
    'plot_area_sqft', 'area_unit', 'price_per_sqft_inr', 'price_negotiable',
    'maintenance_monthly_inr', 'deposit', 'ownership', 'transaction_type',
    'amenities', 'video_url', 'video_url_2', 'tour_360_url', 'floor_plan_title',
    'floor_plan_title_2', 'owner_name', 'owner_type', 'owner_phone', 'owner_email',
    'contact_phone_calls', 'contact_whatsapp', 'contact_email', 'contact_site_visits',
    'contact_time', 'response_language', 'hide_number', 'pincode', 'address_line',
    'project_name', 'super_builtup_area_sqft', 'terrace_area_sqft', 'garden_area_sqft',
    'dimensions', 'area_notes', 'availability'];
  const wizFlags = new Set(['is_corner', 'is_gated', 'has_lift', 'has_reserved_parking',
    'contact_phone_calls', 'contact_whatsapp', 'contact_email', 'contact_site_visits', 'hide_number']);
  const info = db.prepare(`INSERT INTO properties
    (owner_id, title, description, property_type, listing_type, price_inr, city, locality, area_sqft, bedrooms, bathrooms, status, ${wizCols.join(', ')})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ${wizCols.map(() => '?').join(', ')})`).run(
    user.id, c.title, c.description || '', c.property_type, c.listing_type, c.price_inr,
    c.city, c.locality || '', c.area_sqft ?? null, c.bedrooms ?? null, c.bathrooms ?? null,
    ...wizCols.map((k) => (c[k] ?? (wizFlags.has(k) ? 0 : null))));
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(info.lastInsertRowid));
  prop.images = [];
  return { status: 201, body: prop };
}

export function updateProperty(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canEdit(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot edit this property');
  const v = validatePropertyInput(body, true);
  if (!v.ok) return err(400, 'INVALID_PARAMETER', v.errors.join('; '));
  const c = v.clean;
  if (Object.keys(c).length === 0) return err(400, 'INVALID_PARAMETER', 'No updatable fields provided');
  const sets = Object.keys(c).map((k) => `${k} = ?`).join(', ');
  // Editing a published property as a non-publisher sends it back to draft
  // for re-approval; publishers editing keep it published.
  const revert = prop.status === 'published' && !hasPermission(db, user, 'properties:publish_any');
  db.prepare(`UPDATE properties SET ${sets}${revert ? ", status = 'draft'" : ''}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(c), prop.id);
  return { status: 200, body: withImages(db, db.prepare('SELECT * FROM properties WHERE id = ?').get(prop.id)) };
}

export function publishProperty(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!hasPermission(db, user, 'properties:publish_any')) return err(403, 'FORBIDDEN', 'Missing permission: properties:publish_any');
  db.prepare(`UPDATE properties SET status = 'published', updated_at = datetime('now') WHERE id = ?`).run(prop.id);
  return { status: 200, body: withImages(db, db.prepare('SELECT * FROM properties WHERE id = ?').get(prop.id)) };
}

export function unpublishProperty(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  const isOwner = prop.owner_id === user.id;
  if (!isOwner && !hasPermission(db, user, 'properties:publish_any')) return err(403, 'FORBIDDEN', 'You cannot unpublish this property');
  db.prepare(`UPDATE properties SET status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(prop.id);
  return { status: 200, body: withImages(db, db.prepare('SELECT * FROM properties WHERE id = ?').get(prop.id)) };
}

export function deleteProperty(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canDelete(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot delete this property');
  db.prepare(`UPDATE properties SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(prop.id);
  return { status: 200, body: { ok: true } };
}

export function addImage(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canEdit(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot add images to this property');
  const urlErr = validateImageUrl(body.url);
  if (urlErr) return err(400, 'INVALID_PARAMETER', urlErr);
  if (body.alt_text !== undefined && (typeof body.alt_text !== 'string' || body.alt_text.length > 200)) {
    return err(400, 'INVALID_PARAMETER', 'alt_text must be text up to 200 characters');
  }
  const max = db.prepare('SELECT MAX(sort_order) AS m FROM property_images WHERE property_id = ?').get(prop.id).m;
  const info = db.prepare('INSERT INTO property_images (property_id, url, alt_text, sort_order) VALUES (?, ?, ?, ?)')
    .run(prop.id, body.url, body.alt_text || '', max === null ? 0 : max + 1);
  return { status: 201, body: db.prepare('SELECT * FROM property_images WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function deleteImage(db, user, idText, imageIdText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canEdit(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot delete images of this property');
  const imageId = Number(imageIdText);
  const img = db.prepare('SELECT * FROM property_images WHERE id = ? AND property_id = ?').get(imageId, prop.id);
  if (!img) return err(404, 'NOT_FOUND', 'Image not found');
  db.prepare('DELETE FROM property_images WHERE id = ?').run(imageId);
  return { status: 200, body: { ok: true } };
}

export function listMine(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const status = url.searchParams.get('status');
  const where = ['owner_id = ?', 'deleted_at IS NULL'];
  const params = [user.id];
  if (status) {
    if (!['draft', 'published', 'sold', 'rented'].includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('status = ?');
    params.push(status);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM properties ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM properties ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function saveProperty(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  const info = db.prepare('INSERT OR IGNORE INTO saved_properties (user_id, property_id) VALUES (?, ?)').run(user.id, prop.id);
  return { status: info.changes ? 201 : 200, body: { ok: true, already_saved: !info.changes } };
}

export function unsaveProperty(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  db.prepare('DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?').run(user.id, prop.id);
  return { status: 200, body: { ok: true } };
}

export function listSaved(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM saved_properties s JOIN properties p ON p.id = s.property_id
    WHERE s.user_id = ? AND p.deleted_at IS NULL AND (p.status = 'published' OR p.owner_id = ?)`).get(user.id, user.id).n;
  const rows = db.prepare(`SELECT p.* FROM saved_properties s JOIN properties p ON p.id = s.property_id
    WHERE s.user_id = ? AND p.deleted_at IS NULL AND (p.status = 'published' OR p.owner_id = ?)
    ORDER BY s.created_at DESC, p.id DESC LIMIT ? OFFSET ?`).all(user.id, user.id, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function recordView(db, user, propId) {
  if (!user) return;
  db.prepare(`INSERT INTO property_views (user_id, property_id, viewed_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id, property_id) DO UPDATE SET viewed_at = datetime('now')`).run(user.id, propId);
}

export function listRecent(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page || page.limit > 50) return err(400, 'INVALID_PARAMETER', 'limit must be 1-50 and offset must be >= 0');
  const rows = db.prepare(`SELECT p.*, v.viewed_at FROM property_views v JOIN properties p ON p.id = v.property_id
    WHERE v.user_id = ? AND p.deleted_at IS NULL AND (p.status = 'published' OR p.owner_id = ?)
    ORDER BY v.viewed_at DESC, p.id DESC LIMIT ? OFFSET ?`).all(user.id, user.id, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { limit: page.limit, offset: page.offset, total: rows.length } } };
}

export function similarProperties(db, user, idText) {
  const prop = load(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  const rows = db.prepare(`SELECT * FROM properties
    WHERE id != ? AND city = ? AND property_type = ? AND status = 'published' AND deleted_at IS NULL
    ORDER BY id DESC LIMIT 6`).all(prop.id, prop.city, prop.property_type);
  return { status: 200, body: { data: rows } };
}

export { load as loadProperty, canView as canViewProperty };
