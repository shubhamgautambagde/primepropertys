import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../src/auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-p2-'));
const dbPath = join(tmp, 'p2.db');
let proc;
let base;

function cookieOf(res) {
  const set = res.headers.get('set-cookie');
  return set ? set.split(';')[0] : '';
}
async function api(path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function register(email, role) {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password: 'Secret123', full_name: 'Test ' + role, role } });
  const body = await r.json();
  return { cookie: cookieOf(r), user: body.user, status: r.status };
}
function db() { return new DatabaseSync(dbPath); }

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8973', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8973';
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const d = db();
  d.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)')
    .run('admin@example.com', hashPassword('Admin1234'), 'Admin', 'Super Admin');
  d.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { cookie: cookieOf(r), body: await r.json(), status: r.status };
}

let adminCookie;
test('setup: admin login works', async () => {
  const l = await login('admin@example.com', 'Admin1234');
  assert.equal(l.status, 200);
  adminCookie = l.cookie;
  assert.ok(l.body.permissions.includes('users:manage'));
});

test('builder projects: create, draft hidden, verify flow, units, enquiries', async () => {
  const builder = await register('builder1@example.com', 'Builder');
  const stranger = await register('stranger1@example.com', 'Buyer');
  const create = await api('/api/builder-projects', { method: 'POST', cookie: builder.cookie,
    body: { name: 'Sunrise Heights', city: 'Nagpur', project_type: 'residential', locality: 'Katol Road' } });
  assert.equal(create.status, 201);
  const project = await create.json();
  assert.equal(project.status, 'draft');
  const hidden = await api(`/api/builder-projects/${project.id}`, { cookie: stranger.cookie });
  assert.equal(hidden.status, 404);
  const badUnit = await api(`/api/builder-projects/${project.id}/units`, { method: 'POST', cookie: stranger.cookie, body: { unit_number: 'A-101' } });
  assert.equal(badUnit.status, 404);
  const submit = await api(`/api/builder-projects/${project.id}/submit`, { method: 'POST', cookie: builder.cookie });
  assert.equal(submit.status, 200);
  assert.equal((await submit.json()).status, 'pending');
  const pubTooEarly = await api(`/api/builder-projects/${project.id}/publish`, { method: 'POST', cookie: builder.cookie });
  assert.equal(pubTooEarly.status, 400);
  const verify = await api(`/api/builder-projects/${project.id}/verify`, { method: 'POST', cookie: adminCookie, body: { approve: true } });
  assert.equal((await verify.json()).status, 'approved');
  const pub = await api(`/api/builder-projects/${project.id}/publish`, { method: 'POST', cookie: builder.cookie });
  assert.equal((await pub.json()).status, 'published');
  const unit = await api(`/api/builder-projects/${project.id}/units`, { method: 'POST', cookie: builder.cookie,
    body: { unit_number: 'A-101', unit_type: '2BHK', price_inr: 5000000, bedrooms: 2 } });
  assert.equal(unit.status, 201);
  const unitId = (await unit.json()).id;
  const sold = await api(`/api/builder-projects/${project.id}/units/${unitId}/status`, { method: 'PATCH', cookie: builder.cookie, body: { status: 'sold' } });
  assert.equal((await sold.json()).status, 'sold');
  const mile = await api(`/api/builder-projects/${project.id}/milestones`, { method: 'POST', cookie: builder.cookie, body: { title: 'Foundation', progress_pct: 40 } });
  assert.equal(mile.status, 201);
  const enq = await api(`/api/builder-projects/${project.id}/enquiries`, { method: 'POST', body: { full_name: 'Enquirer', phone: '9876543210' } });
  assert.equal(enq.status, 201);
  const enqs = await api(`/api/builder-projects/${project.id}/enquiries`, { cookie: builder.cookie });
  assert.equal((await enqs.json()).data.length, 1);
  const search = await api('/api/builder-projects?city=Nagpur&status=published');
  assert.equal((await search.json()).pagination.total, 1);
});

test('reviews: pending hidden, approve, aggregation, verified flag, report, delete guard', async () => {
  const owner = await register('owner1@example.com', 'Owner');
  const reviewer = await register('reviewer1@example.com', 'Buyer');
  const prop = await api('/api/properties', { method: 'POST', cookie: owner.cookie,
    body: { title: 'Review House', property_type: 'House', listing_type: 'sale', price_inr: 9000000, city: 'Nagpur' } });
  const propId = (await prop.json()).id;
  const pub = await api(`/api/properties/${propId}/publish`, { method: 'POST', cookie: adminCookie });
  assert.equal(pub.status, 200);
  const rev = await api(`/api/properties/${propId}/reviews`, { method: 'POST', cookie: reviewer.cookie, body: { rating: 5, text: 'Great place' } });
  assert.equal(rev.status, 201);
  const revBody = await rev.json();
  const revId = revBody.id;
  assert.equal(revBody.verified, 0);
  const pubList = await api(`/api/properties/${propId}/reviews`);
  assert.equal((await pubList.json()).data.length, 0);
  const dup = await api(`/api/properties/${propId}/reviews`, { method: 'POST', cookie: reviewer.cookie, body: { rating: 4, text: 'Again' } });
  assert.equal(dup.status, 409);
  const mod = await api(`/api/reviews/${revId}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'approved' } });
  assert.equal((await mod.json()).status, 'approved');
  const after = await api(`/api/properties/${propId}/reviews`);
  const afterBody = await after.json();
  assert.equal(afterBody.data.length, 1);
  assert.equal(afterBody.aggregation.approved_count, 1);
  assert.equal(afterBody.aggregation.average_rating, 5);
  // Verified: a second reviewer with a completed visit gets verified=1.
  const reviewer2 = await register('reviewer2@example.com', 'Buyer');
  const d = db();
  d.prepare('INSERT INTO site_visits (property_id, user_id, scheduled_at, status) VALUES (?, ?, ?, ?)')
    .run(propId, reviewer2.user.id, '2026-10-20T10:00:00Z', 'completed');
  d.close();
  const rev2 = await api(`/api/properties/${propId}/reviews`, { method: 'POST', cookie: reviewer2.cookie, body: { rating: 4, text: 'Visited and liked it' } });
  assert.equal((await rev2.json()).verified, 1);
  const rep = await api(`/api/reviews/${revId}/report`, { method: 'POST', cookie: reviewer2.cookie, body: { reason: 'Spam' } });
  assert.equal(rep.status, 201);
  const repDup = await api(`/api/reviews/${revId}/report`, { method: 'POST', cookie: reviewer2.cookie, body: { reason: 'Spam again' } });
  assert.equal(repDup.status, 409);
  const strangerDel = await api(`/api/reviews/${revId}`, { method: 'DELETE', cookie: reviewer2.cookie });
  assert.equal(strangerDel.status, 403);
});

test('tasks: create, assignee status, assignee cannot retitle, stranger hidden, overdue, stats', async () => {
  const creator = await register('creator1@example.com', 'Agent');
  const assignee = await register('assignee1@example.com', 'Agent');
  const stranger = await register('stranger2@example.com', 'Buyer');
  const t = await api('/api/tasks', { method: 'POST', cookie: creator.cookie,
    body: { title: 'Follow up lead', assignee_id: assignee.user.id, due_date: '2020-01-01', priority: 'high' } });
  assert.equal(t.status, 201);
  const taskId = (await t.json()).id;
  const hidden = await api(`/api/tasks/${taskId}`, { cookie: stranger.cookie });
  assert.equal(hidden.status, 404);
  const retitle = await api(`/api/tasks/${taskId}`, { method: 'PATCH', cookie: assignee.cookie, body: { title: 'Hacked title' } });
  assert.equal(retitle.status, 403);
  const progress = await api(`/api/tasks/${taskId}`, { method: 'PATCH', cookie: assignee.cookie, body: { status: 'in_progress' } });
  assert.equal((await progress.json()).status, 'in_progress');
  const comment = await api(`/api/tasks/${taskId}/comments`, { method: 'POST', cookie: assignee.cookie, body: { body: 'Called the client' } });
  assert.equal(comment.status, 201);
  const overdue = await api('/api/tasks?overdue=1', { cookie: creator.cookie });
  assert.equal((await overdue.json()).data.length, 1);
  const stats = await api('/api/tasks/stats', { cookie: creator.cookie });
  const statsBody = await stats.json();
  assert.equal(statsBody.overdue, 1);
  assert.equal(statsBody.by_status.in_progress, 1);
  const done = await api(`/api/tasks/${taskId}`, { method: 'PATCH', cookie: assignee.cookie, body: { status: 'done' } });
  assert.equal((await done.json()).status, 'done');
});

test('rbac: custom role grants permission, audit log, session revoke', async () => {
  const user = await register('mod1@example.com', 'Buyer');
  const role = await api('/api/custom-roles', { method: 'POST', cookie: adminCookie, body: { name: 'Review Moderators', permissions: ['reviews:moderate'] } });
  assert.equal(role.status, 201);
  const roleId = (await role.json()).id;
  const assign = await api('/api/custom-roles/assign', { method: 'POST', cookie: adminCookie, body: { user_id: user.user.id, custom_role_id: roleId } });
  assert.equal(assign.status, 200);
  const me = await api('/api/auth/me', { cookie: user.cookie });
  assert.ok((await me.json()).permissions.includes('reviews:moderate'));
  const audit = await api('/api/admin-audit-log', { cookie: adminCookie });
  assert.equal(audit.status, 200);
  assert.ok((await audit.json()).data.some((r) => r.action === 'role.create'));
  const forbidden = await api('/api/custom-roles', { method: 'POST', cookie: user.cookie, body: { name: 'Nope', permissions: [] } });
  assert.equal(forbidden.status, 403);
  const sessions = await api('/api/auth/sessions', { cookie: user.cookie });
  const sessBody = await sessions.json();
  assert.ok(sessBody.data.length >= 1);
  const revoke = await api(`/api/auth/sessions/${sessBody.data[0].id}`, { method: 'DELETE', cookie: user.cookie });
  assert.equal(revoke.status, 200);
  const meAfter = await api('/api/auth/me', { cookie: user.cookie });
  assert.equal(meAfter.status, 401);
});

test('subscriptions: seeded plans, free active, paid pending until verified payment, feature credits, coupon, webhook stub', async () => {
  const plans = await api('/api/subscription-plans');
  const plansBody = await plans.json();
  const byName = Object.fromEntries(plansBody.data.map((p) => [p.name, p]));
  assert.equal(byName.FREE.price_paise, 0);
  assert.equal(byName.BASIC.price_paise, 49900);
  assert.equal(byName.PRO.price_paise, 119900);
  assert.equal(byName.PREMIUM.price_paise, 249900);
  assert.equal(byName.PRO.listing_limit, 20);
  assert.equal(byName.PRO.featured_credits, 1);
  const user = await register('sub1@example.com', 'Owner');
  const free = await api('/api/subscriptions', { method: 'POST', cookie: user.cookie, body: { plan_id: byName.FREE.id } });
  assert.equal((await free.json()).status, 'active');
  const cancelFree = await api(`/api/subscriptions/${(await api('/api/subscriptions/mine', { cookie: user.cookie }).then((r) => r.json())).data[0].id}/cancel`, { method: 'POST', cookie: user.cookie });
  assert.equal(cancelFree.status, 200);
  const pro = await api('/api/subscriptions', { method: 'POST', cookie: user.cookie, body: { plan_id: byName.PRO.id } });
  const proBody = await pro.json();
  assert.equal(proBody.status, 'pending');
  const noPay = await api(`/api/subscriptions/${proBody.id}/activate`, { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(noPay.status, 400);
  const pay = await api('/api/payments', { method: 'POST', cookie: user.cookie, body: { description: 'PRO subscription', amount_paise: 119900, method: 'upi' } });
  const payId = (await pay.json()).data.id;
  const verifyPay = await api(`/api/payments/${payId}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'verified' } });
  assert.equal((await verifyPay.json()).data.status, 'verified');
  const act = await api(`/api/subscriptions/${proBody.id}/activate`, { method: 'POST', cookie: adminCookie, body: { payment_id: payId } });
  assert.equal((await act.json()).status, 'active');
  const ent = await api('/api/subscriptions/entitlement', { cookie: user.cookie });
  const entBody = await ent.json();
  assert.equal(entBody.plan, 'PRO');
  assert.equal(entBody.featured_remaining, 1);
  const invoices = await api(`/api/subscriptions/${proBody.id}/invoices`, { cookie: user.cookie });
  assert.equal((await invoices.json()).data.length, 1);
  // Feature a published property, then exhaust the single PRO credit.
  const prop = await api('/api/properties', { method: 'POST', cookie: user.cookie,
    body: { title: 'Feature House', property_type: 'House', listing_type: 'sale', price_inr: 8000000, city: 'Nagpur' } });
  const propId = (await prop.json()).id;
  await api(`/api/properties/${propId}/publish`, { method: 'POST', cookie: adminCookie });
  const feat = await api(`/api/properties/${propId}/feature`, { method: 'POST', cookie: user.cookie });
  assert.equal(feat.status, 201);
  const prop2 = await api('/api/properties', { method: 'POST', cookie: user.cookie,
    body: { title: 'Feature House 2', property_type: 'House', listing_type: 'sale', price_inr: 8000000, city: 'Nagpur' } });
  const prop2Id = (await prop2.json()).id;
  await api(`/api/properties/${prop2Id}/publish`, { method: 'POST', cookie: adminCookie });
  const feat2 = await api(`/api/properties/${prop2Id}/feature`, { method: 'POST', cookie: user.cookie });
  assert.equal(feat2.status, 400);
  // Coupon: 10% off PRO, per-user limit 1.
  const coupon = await api('/api/coupons', { method: 'POST', cookie: adminCookie,
    body: { code: 'PRO10', discount_type: 'percent', discount_value: 10, per_user_limit: 1, eligible_plan_ids: [byName.PRO.id] } });
  assert.equal(coupon.status, 201);
  const applied = await api('/api/coupons/apply', { method: 'POST', cookie: user.cookie, body: { code: 'PRO10', plan_id: byName.PRO.id } });
  const appliedBody = await applied.json();
  assert.equal(appliedBody.discount_paise, 11990);
  assert.equal(appliedBody.final_price_paise, 107910);
  const redeem = await api('/api/coupons/redeem', { method: 'POST', cookie: user.cookie, body: { code: 'PRO10', plan_id: byName.PRO.id, subscription_id: proBody.id } });
  assert.equal(redeem.status, 201);
  const redeemAgain = await api('/api/coupons/apply', { method: 'POST', cookie: user.cookie, body: { code: 'PRO10', plan_id: byName.PRO.id } });
  assert.equal(redeemAgain.status, 400);
  // Webhook stub never activates anything.
  const hook = await api('/api/webhooks/payment', { method: 'POST', body: { provider: 'test', event_id: 'evt_1' } });
  assert.equal(hook.status, 501);
});

test('chat: membership enforced, unread, mark read, preferences gate notifications, no phone exposure', async () => {
  const a = await register('chat-a@example.com', 'Buyer');
  const b = await register('chat-b@example.com', 'Agent');
  const stranger = await register('chat-c@example.com', 'Buyer');
  const conv = await api('/api/conversations', { method: 'POST', cookie: a.cookie, body: { member_ids: [b.user.id], title: 'About a listing' } });
  assert.equal(conv.status, 201);
  const convId = (await conv.json()).id;
  const hidden = await api(`/api/conversations/${convId}/messages`, { cookie: stranger.cookie });
  assert.equal(hidden.status, 404);
  const msg = await api(`/api/conversations/${convId}/messages`, { method: 'POST', cookie: a.cookie, body: { body: 'Hello, is this available?' } });
  assert.equal(msg.status, 201);
  const listB = await api('/api/conversations', { cookie: b.cookie });
  const listBBody = await listB.json();
  assert.equal(listBBody.data[0].unread_count, 1);
  assert.ok(!('phone' in listBBody.data[0].members[0]) && !('email' in listBBody.data[0].members[0]));
  const notifsBefore = await api('/api/notifications', { cookie: b.cookie });
  const notifCount = (await notifsBefore.json()).data.length;
  assert.ok(notifCount >= 1);
  const read = await api(`/api/conversations/${convId}/read`, { method: 'POST', cookie: b.cookie });
  assert.equal(read.status, 200);
  const listAfter = await api('/api/conversations', { cookie: b.cookie });
  assert.equal((await listAfter.json()).data[0].unread_count, 0);
  const dup = await api('/api/conversations', { method: 'POST', cookie: a.cookie, body: { member_ids: [b.user.id] } });
  assert.equal(dup.status, 200);
  assert.equal((await dup.json()).id, convId);
  // Turn off message alerts: next message still arrives, but no new notification.
  const pref = await api('/api/notification-preferences', { method: 'PUT', cookie: b.cookie, body: { message_alerts: false } });
  assert.equal((await pref.json()).message_alerts, 0);
  await api(`/api/conversations/${convId}/messages`, { method: 'POST', cookie: a.cookie, body: { body: 'Second message' } });
  const notifsAfter = await api('/api/notifications', { cookie: b.cookie });
  assert.equal((await notifsAfter.json()).data.length, notifCount);
});
