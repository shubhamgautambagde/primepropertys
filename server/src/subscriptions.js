import { hasPermission } from './auth.js';
import { logAudit } from './rbac.js';

// Priority 2 — Subscriptions + Coupons + Promotions.
// Prices are the public prices on pricing.html (see migration 025);
// admins create/edit plans via the API, and no price is invented.
// A paid subscription is 'pending' until staff activate it against
// a VERIFIED payment record for the same user and at least the
// plan price. A payment webhook is a documented stub: it answers
// 501 and never activates anything (no provider is configured).
// FREE plans activate immediately. Listing-limit enforcement is
// via the entitlement endpoint (counts + limits); property creation
// itself is not retroactively blocked for users with no subscription
// (legacy behaviour, documented in CHANGELOG) — the entitlement
// check is what a future create-time gate should call.

function err(status, code, message) {
  return { status, error: { code, message } };
}
function parsePage(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}
function planPrice(plan, period) {
  return period === 'yearly' && plan.yearly_price_paise !== null ? plan.yearly_price_paise : plan.price_paise;
}
function addMonths(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}
export function effectiveStatus(sub) {
  if (sub.status === 'active' && sub.ends_at && new Date(sub.ends_at) < new Date()) return 'expired';
  return sub.status;
}

export function listPlans(db, user, url) {
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const onlyActive = url.searchParams.get('active') !== '0';
  const clause = onlyActive ? 'WHERE is_active = 1' : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM subscription_plans ${clause}`).get().n;
  const rows = db.prepare(`SELECT * FROM subscription_plans ${clause} ORDER BY price_paise LIMIT ? OFFSET ?`).all(page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function createPlan(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'subscriptions:manage')) return err(403, 'FORBIDDEN', 'Missing permission: subscriptions:manage');
  const b = body && typeof body === 'object' ? body : {};
  const name = typeof b.name === 'string' ? b.name.trim().toUpperCase() : '';
  if (!name || name.length > 80) return err(400, 'INVALID_PARAMETER', 'name is required (up to 80 characters)');
  const price = Number(b.price_paise);
  if (!Number.isInteger(price) || price < 0) return err(400, 'INVALID_PARAMETER', 'price_paise must be an integer >= 0');
  try {
    const info = db.prepare(`INSERT INTO subscription_plans
      (name, description, price_paise, yearly_price_paise, listing_limit, photos_per_listing, featured_credits, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(name,
      typeof b.description === 'string' ? b.description.slice(0, 1000) : '',
      price, Number.isInteger(b.yearly_price_paise) ? b.yearly_price_paise : null,
      b.listing_limit === null ? null : (Number.isInteger(b.listing_limit) ? b.listing_limit : null),
      Number.isInteger(b.photos_per_listing) ? b.photos_per_listing : null,
      Number.isInteger(b.featured_credits) ? b.featured_credits : 0, user.id);
    logAudit(db, user.id, 'plan.create', 'subscription_plan', Number(info.lastInsertRowid), name);
    return { status: 201, body: db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(Number(info.lastInsertRowid)) };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err(409, 'PLAN_EXISTS', 'A plan with this name already exists');
    throw e;
  }
}

export function updatePlan(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'subscriptions:manage')) return err(403, 'FORBIDDEN', 'Missing permission: subscriptions:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Plan not found');
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id);
  if (!plan) return err(404, 'NOT_FOUND', 'Plan not found');
  const b = body && typeof body === 'object' ? body : {};
  const updates = {};
  if (b.description !== undefined) updates.description = typeof b.description === 'string' ? b.description.slice(0, 1000) : '';
  if (b.price_paise !== undefined) {
    if (!Number.isInteger(b.price_paise) || b.price_paise < 0) return err(400, 'INVALID_PARAMETER', 'price_paise must be an integer >= 0');
    updates.price_paise = b.price_paise;
  }
  if (b.yearly_price_paise !== undefined) updates.yearly_price_paise = b.yearly_price_paise;
  if (b.listing_limit !== undefined) updates.listing_limit = b.listing_limit;
  if (b.photos_per_listing !== undefined) updates.photos_per_listing = b.photos_per_listing;
  if (b.featured_credits !== undefined) updates.featured_credits = b.featured_credits;
  if (b.is_active !== undefined) updates.is_active = b.is_active ? 1 : 0;
  if (!Object.keys(updates).length) return err(400, 'INVALID_PARAMETER', 'No updatable fields provided');
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE subscription_plans SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(updates), id);
  logAudit(db, user.id, 'plan.update', 'subscription_plan', id, plan.name);
  return { status: 200, body: db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id) };
}

export function createSubscription(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const planId = Number(b.plan_id);
  const period = b.billing_period || 'monthly';
  if (!['monthly', 'yearly'].includes(period)) return err(400, 'INVALID_PARAMETER', 'billing_period must be monthly or yearly');
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').get(planId);
  if (!plan) return err(404, 'NOT_FOUND', 'Plan not found or inactive');
  const active = db.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ? AND status = 'active'`).get(user.id);
  if (active) return err(409, 'SUBSCRIPTION_ACTIVE', 'You already have an active subscription; upgrade, downgrade or cancel it first');
  const status = planPrice(plan, period) === 0 ? 'active' : 'pending';
  const now = new Date().toISOString();
  const info = db.prepare(`INSERT INTO user_subscriptions (user_id, plan_id, billing_period, status, starts_at, ends_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(user.id, plan.id, period, status, status === 'active' ? now : null,
    status === 'active' ? addMonths(now, period === 'yearly' ? 12 : 1) : null);
  const sub = db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(Number(info.lastInsertRowid));
  return { status: 201, body: sub };
}

export function listMySubscriptions(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const rows = db.prepare(`SELECT s.*, p.name AS plan_name, p.price_paise, p.yearly_price_paise,
    p.listing_limit, p.photos_per_listing, p.featured_credits
    FROM user_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = ? ORDER BY s.id DESC`).all(user.id);
  for (const r of rows) r.effective_status = effectiveStatus(r);
  return { status: 200, body: { data: rows } };
}

export function getSubscription(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Subscription not found');
  const sub = db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id);
  if (!sub) return err(404, 'NOT_FOUND', 'Subscription not found');
  if (sub.user_id !== user.id && !hasPermission(db, user, 'subscriptions:manage')) return err(404, 'NOT_FOUND', 'Subscription not found');
  sub.plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(sub.plan_id);
  sub.effective_status = effectiveStatus(sub);
  return { status: 200, body: sub };
}

export function activateSubscription(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'subscriptions:manage') && !hasPermission(db, user, 'payments:manage')) {
    return err(403, 'FORBIDDEN', 'Missing permission: subscriptions:manage or payments:manage');
  }
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Subscription not found');
  const sub = db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id);
  if (!sub) return err(404, 'NOT_FOUND', 'Subscription not found');
  if (sub.status !== 'pending') return err(400, 'INVALID_PARAMETER', `Cannot activate a subscription in status ${sub.status}`);
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(sub.plan_id);
  const price = planPrice(plan, sub.billing_period);
  if (price === 0) {
    const now = new Date().toISOString();
    db.prepare(`UPDATE user_subscriptions SET status = 'active', starts_at = ?, ends_at = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(now, addMonths(now, sub.billing_period === 'yearly' ? 12 : 1), id);
    return { status: 200, body: db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id) };
  }
  const b = body && typeof body === 'object' ? body : {};
  const paymentId = Number(b.payment_id);
  if (!Number.isInteger(paymentId)) return err(400, 'INVALID_PARAMETER', 'payment_id of a verified payment is required');
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!pay || pay.user_id !== sub.user_id || pay.status !== 'verified' || pay.amount_paise < price) {
    return err(400, 'INVALID_PARAMETER', 'payment_id must be a verified payment for this user of at least the plan price');
  }
  const now = new Date().toISOString();
  db.prepare(`UPDATE user_subscriptions SET status = 'active', starts_at = ?, ends_at = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(now, addMonths(now, sub.billing_period === 'yearly' ? 12 : 1), id);
  db.prepare('UPDATE payments SET subscription_id = ? WHERE id = ?').run(id, paymentId);
  logAudit(db, user.id, 'subscription.activate', 'user_subscription', id, `payment:${paymentId}`);
  return { status: 200, body: db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id) };
}

export function changePlan(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Subscription not found');
  const sub = db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id);
  if (!sub) return err(404, 'NOT_FOUND', 'Subscription not found');
  if (sub.user_id !== user.id && !hasPermission(db, user, 'subscriptions:manage')) return err(404, 'NOT_FOUND', 'Subscription not found');
  if (!['active', 'pending'].includes(sub.status)) return err(400, 'INVALID_PARAMETER', `Cannot change plan of a subscription in status ${sub.status}`);
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').get(Number(body && body.plan_id));
  if (!plan) return err(404, 'NOT_FOUND', 'Plan not found or inactive');
  const price = planPrice(plan, sub.billing_period);
  const status = price === 0 ? 'active' : 'pending';
  db.prepare(`UPDATE user_subscriptions SET plan_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?`).run(plan.id, status, id);
  logAudit(db, user.id, 'subscription.change_plan', 'user_subscription', id, plan.name);
  return { status: 200, body: db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id) };
}

export function cancelSubscription(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Subscription not found');
  const sub = db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id);
  if (!sub) return err(404, 'NOT_FOUND', 'Subscription not found');
  if (sub.user_id !== user.id && !hasPermission(db, user, 'subscriptions:manage')) return err(404, 'NOT_FOUND', 'Subscription not found');
  if (sub.status === 'cancelled' || sub.status === 'expired') return err(400, 'INVALID_PARAMETER', `Subscription is already ${sub.status}`);
  db.prepare(`UPDATE user_subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(id);
  return { status: 200, body: db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id) };
}

export function expireSubscription(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'subscriptions:manage')) return err(403, 'FORBIDDEN', 'Missing permission: subscriptions:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Subscription not found');
  const sub = db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id);
  if (!sub) return err(404, 'NOT_FOUND', 'Subscription not found');
  db.prepare(`UPDATE user_subscriptions SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).run(id);
  return { status: 200, body: db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id) };
}

export function entitlement(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const sub = db.prepare(`SELECT s.*, p.name AS plan_name, p.listing_limit, p.photos_per_listing, p.featured_credits
    FROM user_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = ? AND s.status = 'active' ORDER BY s.id DESC`).get(user.id);
  const listings = db.prepare(`SELECT COUNT(*) AS n FROM properties WHERE owner_id = ? AND deleted_at IS NULL AND status IN ('draft','published')`).get(user.id).n;
  const featuredUsed = sub ? db.prepare(`SELECT COUNT(*) AS n FROM property_promotions
    WHERE user_id = ? AND subscription_id = ? AND status = 'active' AND package = 'featured'`).get(user.id, sub.id).n : 0;
  if (!sub) {
    return { status: 200, body: { subscription: null, plan: null, listings_used: listings,
      listing_limit: null, listings_remaining: null, featured_credits: 0, featured_used: 0,
      note: 'No active subscription: property creation is not blocked (legacy behaviour). Assign a plan to enforce limits.' } };
  }
  const eff = effectiveStatus(sub);
  return { status: 200, body: { subscription: { ...sub, effective_status: eff }, plan: sub.plan_name,
    listings_used: listings, listing_limit: sub.listing_limit,
    listings_remaining: sub.listing_limit === null ? null : Math.max(0, sub.listing_limit - listings),
    featured_credits: sub.featured_credits, featured_used: featuredUsed,
    featured_remaining: Math.max(0, sub.featured_credits - featuredUsed) } };
}

export function featureProperty(db, user, propertyIdText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(propertyIdText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Property not found');
  const prop = db.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!prop || prop.status !== 'published') return err(404, 'NOT_FOUND', 'Property not found');
  const canEdit = prop.owner_id === user.id || hasPermission(db, user, 'properties:edit_any');
  if (!canEdit) return err(403, 'FORBIDDEN', 'You cannot feature this property');
  const sub = db.prepare(`SELECT s.*, p.featured_credits FROM user_subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id WHERE s.user_id = ? AND s.status = 'active' ORDER BY s.id DESC`).get(user.id);
  if (!sub || effectiveStatus(sub) !== 'active') return err(400, 'INVALID_PARAMETER', 'An active subscription with featured credits is required');
  const used = db.prepare(`SELECT COUNT(*) AS n FROM property_promotions
    WHERE user_id = ? AND subscription_id = ? AND status = 'active' AND package = 'featured'`).get(user.id, sub.id).n;
  if (used >= sub.featured_credits) return err(400, 'INVALID_PARAMETER', 'No featured credits remaining on this subscription');
  if (prop.featured) return err(409, 'ALREADY_FEATURED', 'This property is already featured');
  const now = new Date().toISOString();
  db.prepare('UPDATE properties SET featured = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  const info = db.prepare(`INSERT INTO property_promotions (property_id, user_id, subscription_id, package, starts_at, ends_at)
    VALUES (?, ?, ?, 'featured', ?, ?)`).run(id, user.id, sub.id, now, addMonths(now, 1));
  return { status: 201, body: db.prepare('SELECT * FROM property_promotions WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function unfeatureProperty(db, user, propertyIdText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(propertyIdText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Property not found');
  const prop = db.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!prop) return err(404, 'NOT_FOUND', 'Property not found');
  if (prop.owner_id !== user.id && !hasPermission(db, user, 'properties:edit_any')) return err(403, 'FORBIDDEN', 'You cannot unfeature this property');
  db.prepare('UPDATE properties SET featured = 0, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  db.prepare(`UPDATE property_promotions SET status = 'cancelled', updated_at = datetime('now')
    WHERE property_id = ? AND status = 'active' AND package = 'featured'`).run(id);
  return { status: 200, body: { ok: true } };
}

export function subscriptionInvoices(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Subscription not found');
  const sub = db.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(id);
  if (!sub) return err(404, 'NOT_FOUND', 'Subscription not found');
  if (sub.user_id !== user.id && !hasPermission(db, user, 'subscriptions:manage')) return err(404, 'NOT_FOUND', 'Subscription not found');
  const rows = db.prepare('SELECT * FROM payments WHERE subscription_id = ? ORDER BY id DESC').all(id);
  return { status: 200, body: { data: rows } };
}

export function createCoupon(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'coupons:manage')) return err(403, 'FORBIDDEN', 'Missing permission: coupons:manage');
  const b = body && typeof body === 'object' ? body : {};
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
  if (!code || code.length > 50) return err(400, 'INVALID_PARAMETER', 'code is required (up to 50 characters)');
  if (!['percent', 'fixed'].includes(b.discount_type)) return err(400, 'INVALID_PARAMETER', 'discount_type must be percent or fixed');
  const value = Number(b.discount_value);
  if (!Number.isInteger(value) || value <= 0) return err(400, 'INVALID_PARAMETER', 'discount_value must be a positive integer');
  if (b.discount_type === 'percent' && value > 100) return err(400, 'INVALID_PARAMETER', 'percent discount cannot exceed 100');
  try {
    const info = db.prepare(`INSERT INTO coupons
      (code, discount_type, discount_value, starts_at, ends_at, usage_limit, per_user_limit, eligible_plan_ids, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(code, b.discount_type, value,
      typeof b.starts_at === 'string' ? b.starts_at : null,
      typeof b.ends_at === 'string' ? b.ends_at : null,
      Number.isInteger(b.usage_limit) ? b.usage_limit : null,
      Number.isInteger(b.per_user_limit) ? b.per_user_limit : 1,
      Array.isArray(b.eligible_plan_ids) ? b.eligible_plan_ids.map(Number).filter(Number.isInteger).join(',') : '',
      user.id);
    logAudit(db, user.id, 'coupon.create', 'coupon', Number(info.lastInsertRowid), code);
    return { status: 201, body: db.prepare('SELECT * FROM coupons WHERE id = ?').get(Number(info.lastInsertRowid)) };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err(409, 'COUPON_EXISTS', 'A coupon with this code already exists');
    throw e;
  }
}

export function applyCoupon(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').get(Number(b.plan_id));
  if (!plan) return err(404, 'NOT_FOUND', 'Plan not found or inactive');
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(code);
  if (!coupon) return err(404, 'NOT_FOUND', 'Coupon not found or inactive');
  const now = new Date().toISOString();
  if (coupon.starts_at && coupon.starts_at > now) return err(400, 'INVALID_PARAMETER', 'Coupon is not yet valid');
  if (coupon.ends_at && coupon.ends_at < now) return err(400, 'INVALID_PARAMETER', 'Coupon has expired');
  if (coupon.eligible_plan_ids) {
    const ids = coupon.eligible_plan_ids.split(',').map(Number);
    if (!ids.includes(plan.id)) return err(400, 'INVALID_PARAMETER', 'Coupon is not eligible for this plan');
  }
  const totalUsed = db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ?').get(coupon.id).n;
  if (coupon.usage_limit !== null && totalUsed >= coupon.usage_limit) return err(400, 'INVALID_PARAMETER', 'Coupon usage limit reached');
  const userUsed = db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?').get(coupon.id, user.id).n;
  if (userUsed >= coupon.per_user_limit) return err(400, 'INVALID_PARAMETER', 'Coupon per-user limit reached');
  const price = planPrice(plan, b.billing_period === 'yearly' ? 'yearly' : 'monthly');
  const discount = coupon.discount_type === 'percent' ? Math.floor(price * coupon.discount_value / 100) : Math.min(coupon.discount_value, price);
  return { status: 200, body: { coupon, plan_id: plan.id, original_price_paise: price, discount_paise: discount, final_price_paise: price - discount } };
}

export function redeemCoupon(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const check = applyCoupon(db, user, body);
  if (check.error) return check;
  const info = db.prepare(`INSERT INTO coupon_redemptions (coupon_id, user_id, subscription_id, discount_applied_paise)
    VALUES (?, ?, ?, ?)`).run(check.body.coupon.id, user.id,
    Number.isInteger(body.subscription_id) ? body.subscription_id : null, check.body.discount_paise);
  return { status: 201, body: { ...check.body, redemption_id: Number(info.lastInsertRowid) } };
}
