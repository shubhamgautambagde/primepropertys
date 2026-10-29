import { hasPermission } from './auth.js';
import { loadProperty, canViewProperty } from './properties.js';

// Priority 3 — Analytics, SEO, Saved Searches/Alerts, Price History,
// Reminders, Recommendations.
//
// Every number here comes from a real database row created by the app
// itself. Nothing is estimated, backfilled or fabricated:
// * analytics_events exist only from the Priority 3 migration onward;
//   earlier activity has no event rows and is reported as such, not
//   reconstructed.
// * Subscription "revenue" is the sum of payments with status
//   'verified' that are linked to a subscription. Unverified or
//   unlinked payments are never counted as revenue, and no gateway
//   charge is ever implied (there is no gateway).
// * SEO sitemap URLs are live published properties plus static .html
//   files that actually exist under the static root. Draft and
//   deleted properties are excluded. No search-engine indexing status
//   is reported anywhere: the app receives none.
// * PDF export is NOT implemented: this codebase has no PDF library
//   and a hand-rolled PDF writer would be unverified output. CSV
//   export is implemented; PDF is documented as blocked.

function err(status, code, message) {
  return { status, error: { code, message } };
}

function isStaff(user) {
  return ['Super Admin', 'Admin', 'Support'].includes(user.role);
}

function parsePage(url) {
  const limitRaw = url.searchParams.get('limit');
  const offsetRaw = url.searchParams.get('offset');
  const limit = limitRaw === null ? 20 : Number(limitRaw);
  const offset = offsetRaw === null ? 0 : Number(offsetRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

function rangeOf(url) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if ((from && !validDate(from)) || (to && !validDate(to))) return null;
  if (from && to && from > to) return null;
  return { from: from || '1970-01-01', to: to || '2999-12-31' };
}

function rangeClause(column, range, params) {
  // created_at is 'YYYY-MM-DD HH:MM:SS', so a date range compares
  // correctly as strings: from 00:00:00 through to 23:59:59.
  params.push(`${range.from} 00:00:00`, `${range.to} 23:59:59`);
  return `${column} BETWEEN ? AND ?`;
}

export function recordEvent(db, eventType, propertyId, userId, meta) {
  try {
    db.prepare(`INSERT INTO analytics_events (event_type, property_id, user_id, meta)
      VALUES (?, ?, ?, ?)`).run(eventType, propertyId || null, userId || null,
      JSON.stringify(meta || {}));
  } catch {
    // Analytics must never break a property list/detail response.
  }
}

/* ---------------- Analytics ---------------- */

export function analyticsSummary(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'analytics:view')) return err(403, 'FORBIDDEN', 'Missing permission: analytics:view');
  const range = rangeOf(url);
  if (!range) return err(400, 'INVALID_PARAMETER', 'from/to must be YYYY-MM-DD dates with from <= to');
  const staff = isStaff(user);
  const scope = staff ? 'all' : 'own';

  // Property scope for non-staff: only their own listings.
  const propScope = staff ? '' : ' AND owner_id = ?';
  const propParams = staff ? [] : [user.id];

  const views = (() => {
    const params = [];
    let clause = `event_type = 'property_view' AND ${rangeClause('created_at', range, params)}`;
    if (!staff) {
      clause += ` AND property_id IN (SELECT id FROM properties WHERE owner_id = ?)`;
      params.push(user.id);
    }
    const row = db.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT property_id) AS uniq
      FROM analytics_events WHERE ${clause}`).get(...params);
    return { events: row.n, unique_properties: row.uniq };
  })();

  const searchRows = (() => {
    const params = [];
    const clause = `event_type = 'property_search' AND ${rangeClause('created_at', range, params)}`;
    return db.prepare(`SELECT meta FROM analytics_events WHERE ${clause}`).all(...params);
  })();
  const cityCounts = new Map();
  for (const r of searchRows) {
    try {
      const m = JSON.parse(r.meta || '{}');
      if (m.city) cityCounts.set(m.city, (cityCounts.get(m.city) || 0) + 1);
    } catch { /* ignore malformed meta */ }
  }
  const topSearchCities = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([city, count]) => ({ city, count }));

  const properties = (() => {
    const params = [...propParams];
    const clause = `deleted_at IS NULL${propScope}`;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM properties WHERE ${clause}`).get(...params).n;
    const published = db.prepare(`SELECT COUNT(*) AS n FROM properties WHERE ${clause} AND status = 'published'`).get(...params).n;
    return { total, published };
  })();

  const inquiries = (() => {
    const params = [];
    let where = rangeClause('created_at', range, params);
    if (!staff) {
      where += ` AND (property_id IN (SELECT id FROM properties WHERE owner_id = ?) OR assigned_to = ?)`;
      params.push(user.id, user.id);
    }
    const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM inquiries WHERE ${where} GROUP BY status`).all(...params);
    const byStatus = {};
    let total = 0;
    for (const r of rows) { byStatus[r.status] = r.n; total += r.n; }
    const closed = byStatus.closed || 0;
    return {
      total, by_status: byStatus,
      // Conversion = closed inquiries / all inquiries in range. NULL,
      // not 0, when there are no inquiries: there is nothing to convert.
      conversion_closed_rate: total ? closed / total : null,
    };
  })();

  const agents = (() => {
    const params = [];
    let where = rangeClause('i.created_at', range, params);
    if (!staff) { where += ' AND i.assigned_to = ?'; params.push(user.id); }
    const rows = db.prepare(`SELECT u.id AS user_id, u.full_name, COUNT(*) AS assigned,
        SUM(CASE WHEN i.status = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM inquiries i LEFT JOIN users u ON u.id = i.assigned_to
      WHERE i.assigned_to IS NOT NULL AND ${where}
      GROUP BY i.assigned_to ORDER BY assigned DESC`).all(...params);
    return rows.map((r) => ({
      user_id: r.user_id, full_name: r.full_name, assigned: r.assigned, closed: r.closed,
      closed_rate: r.assigned ? r.closed / r.assigned : null,
    }));
  })();

  const builders = (() => {
    const params = staff ? [] : [user.id];
    const where = staff ? '' : ' WHERE builder_id = ?';
    const rows = db.prepare(`SELECT bp.builder_id, u.full_name,
        COUNT(*) AS projects,
        SUM(CASE WHEN bp.status = 'published' THEN 1 ELSE 0 END) AS published_projects,
        (SELECT COUNT(*) FROM project_units pu WHERE pu.project_id IN
          (SELECT id FROM builder_projects WHERE builder_id = bp.builder_id) AND pu.status = 'available') AS units_available,
        (SELECT COUNT(*) FROM project_units pu WHERE pu.project_id IN
          (SELECT id FROM builder_projects WHERE builder_id = bp.builder_id) AND pu.status = 'sold') AS units_sold
      FROM builder_projects bp LEFT JOIN users u ON u.id = bp.builder_id ${where}
      GROUP BY bp.builder_id ORDER BY projects DESC`).all(...params);
    return rows;
  })();

  const visits = (() => {
    const params = [];
    let where = rangeClause('created_at', range, params);
    if (!staff) {
      where += ` AND (user_id = ? OR property_id IN (SELECT id FROM properties WHERE owner_id = ?))`;
      params.push(user.id, user.id);
    }
    const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM site_visits WHERE ${where} GROUP BY status`).all(...params);
    const byStatus = {};
    let total = 0;
    for (const r of rows) { byStatus[r.status] = r.n; total += r.n; }
    return {
      total, by_status: byStatus,
      completion_rate: total ? (byStatus.completed || 0) / total : null,
    };
  })();

  const revenue = (() => {
    const params = [];
    const where = `status = 'verified' AND subscription_id IS NOT NULL AND ${rangeClause('verified_at', range, params)}`;
    const row = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_paise), 0) AS sum_paise
      FROM payments WHERE ${where}`).get(...params);
    return {
      verified_linked_payments: row.n, total_paise: row.sum_paise,
      note: 'Verified payments linked to a subscription only. Unverified and unlinked payments are excluded; no gateway revenue is implied.',
    };
  })();

  const promotions = (() => {
    const active = db.prepare(`SELECT COUNT(*) AS n FROM property_promotions WHERE status = 'active'`).get().n;
    const featured = db.prepare(`SELECT COUNT(*) AS n FROM properties WHERE featured = 1 AND deleted_at IS NULL`).get().n;
    return { active_promotions: active, featured_properties: featured };
  })();

  const sources = (() => {
    const params = [];
    let where = rangeClause('created_at', range, params);
    if (!staff) {
      where += ` AND (property_id IN (SELECT id FROM properties WHERE owner_id = ?) OR assigned_to = ?)`;
      params.push(user.id, user.id);
    }
    const rows = db.prepare(`SELECT source, COUNT(*) AS n FROM inquiries WHERE ${where} GROUP BY source ORDER BY n DESC`).all(...params);
    return rows;
  })();

  return {
    status: 200,
    body: {
      range, scope,
      formulas: {
        conversion_closed_rate: 'closed inquiries / all inquiries in range (null when none)',
        visit_completion_rate: 'completed visits / all visits in range (null when none)',
        revenue_paise: 'SUM(amount_paise) over payments with status verified, linked to a subscription, verified in range',
        property_views: 'COUNT of analytics_events property_view rows in range (recorded from Priority 3 onward only)',
      },
      property_views: views,
      searches: { events: searchRows.length, top_cities: topSearchCities },
      properties, inquiries, agents, builders, visits, revenue, promotions, lead_sources: sources,
      limitations: 'Events before the Priority 3 migration have no analytics_events rows and are not reconstructed. Anonymous property views are counted in analytics_events; the legacy property_views table (per-user latest view) is not an event stream and is not summed here.',
    },
  };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function analyticsExportCsv(db, user, url) {
  const summary = analyticsSummary(db, user, url);
  if (summary.error) return summary;
  const b = summary.body;
  const lines = [['metric', 'value']];
  lines.push(['scope', b.scope]);
  lines.push(['property_view_events', b.property_views.events]);
  lines.push(['property_view_unique_properties', b.property_views.unique_properties]);
  lines.push(['search_events', b.searches.events]);
  lines.push(['properties_total', b.properties.total]);
  lines.push(['properties_published', b.properties.published]);
  lines.push(['inquiries_total', b.inquiries.total]);
  lines.push(['inquiries_conversion_closed_rate', b.inquiries.conversion_closed_rate ?? '']);
  lines.push(['visits_total', b.visits.total]);
  lines.push(['visits_completion_rate', b.visits.completion_rate ?? '']);
  lines.push(['verified_linked_payments', b.revenue.verified_linked_payments]);
  lines.push(['verified_linked_revenue_paise', b.revenue.total_paise]);
  lines.push(['active_promotions', b.promotions.active_promotions]);
  lines.push(['featured_properties', b.promotions.featured_properties]);
  for (const [status, n] of Object.entries(b.inquiries.by_status)) lines.push([`inquiries_status_${status}`, n]);
  for (const s of b.lead_sources) lines.push([`lead_source_${s.source}`, s.n]);
  return { status: 200, csv: lines.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n' };
}

/* ---------------- Saved searches + alerts ---------------- */

const SEARCH_FILTER_KEYS = ['city', 'locality', 'property_type', 'listing_type',
  'min_price', 'max_price', 'bedrooms_min', 'area_min', 'possession_status'];

function validateFilters(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'filters must be an object' };
  }
  const clean = {};
  for (const key of Object.keys(raw)) {
    if (!SEARCH_FILTER_KEYS.includes(key)) return { ok: false, error: `Unknown filter: ${key}` };
  }
  for (const key of ['city', 'locality', 'property_type', 'listing_type', 'possession_status']) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      if (typeof raw[key] !== 'string' || raw[key].length > 100) return { ok: false, error: `${key} must be text up to 100 characters` };
      clean[key] = raw[key].trim();
    }
  }
  for (const key of ['min_price', 'max_price', 'bedrooms_min', 'area_min']) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      if (!Number.isInteger(raw[key]) || raw[key] < 0) return { ok: false, error: `${key} must be a non-negative integer` };
      clean[key] = raw[key];
    }
  }
  if (clean.min_price !== undefined && clean.max_price !== undefined && clean.min_price > clean.max_price) {
    return { ok: false, error: 'min_price must not exceed max_price' };
  }
  return { ok: true, clean };
}

export function createSavedSearch(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  if (b.name !== undefined && (typeof b.name !== 'string' || b.name.length > 100)) {
    return err(400, 'INVALID_PARAMETER', 'name must be text up to 100 characters');
  }
  const v = validateFilters(b.filters || {});
  if (!v.ok) return err(400, 'INVALID_PARAMETER', v.error);
  const info = db.prepare(`INSERT INTO saved_searches (user_id, name, filters_json, notify_in_app)
    VALUES (?, ?, ?, ?)`).run(user.id, b.name || '', JSON.stringify(v.clean), b.notify_in_app === false ? 0 : 1);
  return { status: 201, body: db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function listSavedSearches(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const rows = db.prepare('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY id DESC').all(user.id);
  return { status: 200, body: { data: rows } };
}

export function deleteSavedSearch(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  const row = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id);
  if (!row || row.user_id !== user.id) return err(404, 'NOT_FOUND', 'Saved search not found');
  db.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
  return { status: 200, body: { ok: true } };
}

function filtersMatch(filters, prop) {
  if (filters.city && prop.city !== filters.city) return false;
  if (filters.locality && prop.locality !== filters.locality) return false;
  if (filters.property_type && prop.property_type !== filters.property_type) return false;
  if (filters.listing_type && prop.listing_type !== filters.listing_type) return false;
  if (filters.min_price !== undefined && prop.price_inr < filters.min_price) return false;
  if (filters.max_price !== undefined && prop.price_inr > filters.max_price) return false;
  if (filters.bedrooms_min !== undefined && (prop.bedrooms === null || prop.bedrooms < filters.bedrooms_min)) return false;
  if (filters.area_min !== undefined && (prop.area_sqft === null || prop.area_sqft < filters.area_min)) return false;
  if (filters.possession_status && prop.possession_status !== filters.possession_status) return false;
  return true;
}

export function matchSavedSearch(db, user, idText, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const id = Number(idText);
  const row = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id);
  if (!row || row.user_id !== user.id) return err(404, 'NOT_FOUND', 'Saved search not found');
  const filters = JSON.parse(row.filters_json || '{}');
  // Server-side filtering with pagination over the filtered set: the
  // full listing table is never sent to the browser.
  const where = ['status = ?', 'deleted_at IS NULL'];
  const params = ['published'];
  if (filters.city) { where.push('city = ?'); params.push(filters.city); }
  if (filters.locality) { where.push('locality = ?'); params.push(filters.locality); }
  if (filters.property_type) { where.push('property_type = ?'); params.push(filters.property_type); }
  if (filters.listing_type) { where.push('listing_type = ?'); params.push(filters.listing_type); }
  if (filters.min_price !== undefined) { where.push('price_inr >= ?'); params.push(filters.min_price); }
  if (filters.max_price !== undefined) { where.push('price_inr <= ?'); params.push(filters.max_price); }
  if (filters.bedrooms_min !== undefined) { where.push('bedrooms >= ?'); params.push(filters.bedrooms_min); }
  if (filters.area_min !== undefined) { where.push('area_sqft >= ?'); params.push(filters.area_min); }
  if (filters.possession_status) { where.push('possession_status = ?'); params.push(filters.possession_status); }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM properties ${clause}`).get(...params).n;
  const data = db.prepare(`SELECT * FROM properties ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data, pagination: { ...page, total }, filters } };
}

// Called when a property is published. Creates one in-app notification
// per matching saved search (deduplicated by the UNIQUE constraint).
// Email/SMS delivery is NOT attempted: no provider is configured, and
// the notification itself says in-app only.
export function createAlertsForProperty(db, prop) {
  if (!prop || prop.status !== 'published') return 0;
  const searches = db.prepare('SELECT * FROM saved_searches WHERE notify_in_app = 1').all();
  let created = 0;
  for (const s of searches) {
    let filters;
    try { filters = JSON.parse(s.filters_json || '{}'); } catch { continue; }
    if (!filtersMatch(filters, prop)) continue;
    const info = db.prepare(`INSERT OR IGNORE INTO search_alerts
      (saved_search_id, property_id, user_id) VALUES (?, ?, ?)`).run(s.id, prop.id, s.user_id);
    if (info.changes) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, body, link)
        VALUES (?, 'search_alert', ?, ?, ?)`).run(s.user_id,
        `New property matches your saved search${s.name ? ` "${s.name}"` : ''}`,
        `${prop.title} — ${prop.city}${prop.locality ? `, ${prop.locality}` : ''} (in-app alert only; email/SMS delivery is not configured)`,
        `sections/property-engine/property-details.html?property_id=${prop.id}`);
      created += 1;
    }
  }
  return created;
}

export function listSearchAlerts(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const rows = db.prepare(`SELECT a.*, p.title, p.city, p.locality, p.price_inr, p.property_type, p.status AS property_status
    FROM search_alerts a JOIN properties p ON p.id = a.property_id
    WHERE a.user_id = ? AND p.deleted_at IS NULL
    ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`).all(user.id, page.limit, page.offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM search_alerts a JOIN properties p ON p.id = a.property_id
    WHERE a.user_id = ? AND p.deleted_at IS NULL`).get(user.id).n;
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

/* ---------------- Price history ---------------- */

export function listPriceHistory(db, user, idText) {
  const prop = loadProperty(db, idText);
  if (!prop || !canViewProperty(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  const rows = db.prepare(`SELECT h.*, u.full_name AS actor_name
    FROM property_price_history h LEFT JOIN users u ON u.id = h.actor_id
    WHERE h.property_id = ? ORDER BY h.created_at DESC, h.id DESC`).all(prop.id);
  return { status: 200, body: { property_id: prop.id, current_price_inr: prop.price_inr, data: rows } };
}

/* ---------------- Reminders (computed on read, never pushed) ---------------- */

export function listReminders(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const staff = isStaff(user);
  const visits = (() => {
    const clause = staff
      ? `status IN ('requested','confirmed') AND scheduled_at <= datetime('now', '+7 days')`
      : `status IN ('requested','confirmed') AND scheduled_at <= datetime('now', '+7 days')
         AND (user_id = ? OR property_id IN (SELECT id FROM properties WHERE owner_id = ?))`;
    const params = staff ? [] : [user.id, user.id];
    return db.prepare(`SELECT id, property_id, user_id, scheduled_at, status
      FROM site_visits WHERE ${clause} ORDER BY scheduled_at ASC LIMIT 50`).all(...params);
  })();
  const followups = (() => {
    const clause = staff
      ? `done_at IS NULL AND due_at <= datetime('now', '+7 days')`
      : `done_at IS NULL AND due_at <= datetime('now', '+7 days')
         AND (created_by = ? OR inquiry_id IN (SELECT id FROM inquiries WHERE assigned_to = ?))`;
    const params = staff ? [] : [user.id, user.id];
    return db.prepare(`SELECT id, inquiry_id, due_at, note
      FROM lead_followups WHERE ${clause} ORDER BY due_at ASC LIMIT 50`).all(...params);
  })();
  const tasks = (() => {
    const clause = hasPermission(db, user, 'tasks:view_any')
      ? `status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date <= date('now', '+7 days')`
      : `status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date <= date('now', '+7 days')
         AND (creator_id = ? OR assignee_id = ?)`;
    const params = hasPermission(db, user, 'tasks:view_any') ? [] : [user.id, user.id];
    return db.prepare(`SELECT id, title, due_date, priority, status
      FROM staff_tasks WHERE ${clause} ORDER BY due_date ASC LIMIT 50`).all(...params);
  })();
  const subscriptions = (() => {
    const clause = hasPermission(db, user, 'subscriptions:manage')
      ? `status = 'active' AND ends_at IS NOT NULL AND ends_at <= datetime('now', '+30 days')`
      : `status = 'active' AND ends_at IS NOT NULL AND ends_at <= datetime('now', '+30 days') AND user_id = ?`;
    const params = hasPermission(db, user, 'subscriptions:manage') ? [] : [user.id];
    return db.prepare(`SELECT id, user_id, plan_id, ends_at
      FROM user_subscriptions WHERE ${clause} ORDER BY ends_at ASC LIMIT 50`).all(...params);
  })();
  const overdue = (rows, dateKey) => rows.filter((r) => r[dateKey] && r[dateKey] < new Date().toISOString().slice(0, 10));
  return {
    status: 200,
    body: {
      note: 'Reminders are computed from real rows when this endpoint is read. They are not pushed anywhere: email/SMS/WhatsApp delivery is not configured.',
      visits: { total: visits.length, overdue: overdue(visits, 'scheduled_at').length, data: visits },
      lead_followups: { total: followups.length, overdue: overdue(followups, 'due_at').length, data: followups },
      tasks: { total: tasks.length, overdue: overdue(tasks, 'due_date').length, data: tasks },
      subscriptions_expiring: { total: subscriptions.length, data: subscriptions },
    },
  };
}

/* ---------------- Recommendations ---------------- */

export function recommendations(db, user, idText, url) {
  const prop = loadProperty(db, idText);
  if (!prop || !canViewProperty(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  const page = parsePage(url);
  if (!page || page.limit > 20) return err(400, 'INVALID_PARAMETER', 'limit must be 1-20 and offset must be >= 0');
  const rows = db.prepare(`SELECT * FROM properties
    WHERE id != ? AND status = 'published' AND deleted_at IS NULL
    AND (city = ? OR property_type = ?)
    ORDER BY id DESC LIMIT 100`).all(prop.id, prop.city, prop.property_type);
  const scored = rows.map((r) => {
    const reasons = [];
    if (r.city === prop.city) reasons.push('same_city');
    if (r.property_type === prop.property_type) reasons.push('same_type');
    if (r.listing_type === prop.listing_type) reasons.push('same_listing_type');
    if (r.bedrooms !== null && prop.bedrooms !== null && r.bedrooms === prop.bedrooms) reasons.push('same_bedrooms');
    if (prop.price_inr > 0 && r.price_inr >= prop.price_inr * 0.75 && r.price_inr <= prop.price_inr * 1.25) reasons.push('price_within_25pct');
    return { ...r, match_reasons: reasons, match_count: reasons.length };
  }).filter((r) => r.match_count > 0)
    .sort((a, b) => b.match_count - a.match_count || b.id - a.id);
  const total = scored.length;
  const data = scored.slice(page.offset, page.offset + page.limit)
    .map(({ match_count, ...rest }) => ({ ...rest, match_attributes: match_count }));
  return {
    status: 200,
    body: {
      data, pagination: { ...page, total },
      note: 'Ranked by how many stated attributes match (city, type, listing type, bedrooms, price within 25%). match_attributes is a count of matching attributes, not a measured similarity score.',
    },
  };
}

/* ---------------- SEO ---------------- */

export function getSeoMetadata(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const path = url.searchParams.get('path');
  const rows = path
    ? db.prepare('SELECT * FROM seo_metadata WHERE path = ?').all(path)
    : db.prepare('SELECT * FROM seo_metadata ORDER BY path').all();
  return { status: 200, body: { data: rows } };
}

export function saveSeoMetadata(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'seo:manage')) return err(403, 'FORBIDDEN', 'Missing permission: seo:manage');
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.path !== 'string' || !b.path.startsWith('/') || b.path.length > 500) {
    return err(400, 'INVALID_PARAMETER', 'path must start with / and be up to 500 characters');
  }
  if (b.title !== undefined && (typeof b.title !== 'string' || b.title.length > 200)) {
    return err(400, 'INVALID_PARAMETER', 'title must be text up to 200 characters');
  }
  if (b.description !== undefined && (typeof b.description !== 'string' || b.description.length > 500)) {
    return err(400, 'INVALID_PARAMETER', 'description must be text up to 500 characters');
  }
  if (b.canonical_url !== undefined && b.canonical_url !== '' &&
      (typeof b.canonical_url !== 'string' || !/^https?:\/\//.test(b.canonical_url))) {
    return err(400, 'INVALID_PARAMETER', 'canonical_url must be an http(s) URL or empty');
  }
  if (b.robots !== undefined && !['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'].includes(b.robots)) {
    return err(400, 'INVALID_PARAMETER', 'robots must be one of index,follow / noindex,follow / index,nofollow / noindex,nofollow');
  }
  db.prepare(`INSERT INTO seo_metadata (path, title, description, canonical_url, robots, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(path) DO UPDATE SET title = excluded.title, description = excluded.description,
      canonical_url = excluded.canonical_url, robots = excluded.robots,
      updated_by = excluded.updated_by, updated_at = datetime('now')`).run(
    b.path, b.title || '', b.description || '', b.canonical_url || '', b.robots || 'index,follow', user.id);
  return { status: 200, body: db.prepare('SELECT * FROM seo_metadata WHERE path = ?').get(b.path) };
}

export function listSeoRedirects(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  return { status: 200, body: { data: db.prepare('SELECT * FROM seo_redirects ORDER BY from_path').all() } };
}

export function createSeoRedirect(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'seo:manage')) return err(403, 'FORBIDDEN', 'Missing permission: seo:manage');
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.from_path !== 'string' || !b.from_path.startsWith('/') ||
      typeof b.to_path !== 'string' || !b.to_path.startsWith('/')) {
    return err(400, 'INVALID_PARAMETER', 'from_path and to_path must both start with /');
  }
  if (b.from_path === b.to_path) return err(400, 'INVALID_PARAMETER', 'from_path and to_path must differ');
  if (b.status_code !== undefined && ![301, 302].includes(b.status_code)) {
    return err(400, 'INVALID_PARAMETER', 'status_code must be 301 or 302');
  }
  const info = db.prepare(`INSERT INTO seo_redirects (from_path, to_path, status_code, created_by)
    VALUES (?, ?, ?, ?)`).run(b.from_path, b.to_path, b.status_code || 301, user.id);
  return { status: 201, body: db.prepare('SELECT * FROM seo_redirects WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function deleteSeoRedirect(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'seo:manage')) return err(403, 'FORBIDDEN', 'Missing permission: seo:manage');
  const row = db.prepare('SELECT * FROM seo_redirects WHERE id = ?').get(Number(idText));
  if (!row) return err(404, 'NOT_FOUND', 'Redirect not found');
  db.prepare('DELETE FROM seo_redirects WHERE id = ?').run(row.id);
  return { status: 200, body: { ok: true } };
}

export function seoDuplicates(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'seo:manage')) return err(403, 'FORBIDDEN', 'Missing permission: seo:manage');
  const byTitle = db.prepare(`SELECT title, COUNT(*) AS n, GROUP_CONCAT(path) AS paths
    FROM seo_metadata WHERE title != '' GROUP BY title HAVING n > 1`).all();
  const byDesc = db.prepare(`SELECT description, COUNT(*) AS n, GROUP_CONCAT(path) AS paths
    FROM seo_metadata WHERE description != '' GROUP BY description HAVING n > 1`).all();
  return {
    status: 200,
    body: {
      note: 'Duplicates are detected only among stored SEO records. Pages without a stored record are not checked and are not claimed to be unique.',
      duplicate_titles: byTitle, duplicate_descriptions: byDesc,
    },
  };
}

export function seoRobots(db, user, body) {
  if (body && typeof body === 'object' && body.directives !== undefined) {
    if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
    if (!hasPermission(db, user, 'seo:manage')) return err(403, 'FORBIDDEN', 'Missing permission: seo:manage');
    if (typeof body.directives !== 'string' || body.directives.length > 2000) {
      return err(400, 'INVALID_PARAMETER', 'directives must be text up to 2000 characters');
    }
    db.prepare(`INSERT INTO seo_settings (key, value) VALUES ('robots_directives', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(body.directives);
    return { status: 200, body: { directives: body.directives, source: 'stored_override' } };
  }
  const row = db.prepare(`SELECT value FROM seo_settings WHERE key = 'robots_directives'`).get();
  return { status: 200, body: { directives: row ? row.value : null, source: row ? 'stored_override' : 'not_set' } };
}
