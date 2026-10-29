/* PrimePropertys — API client. Part of the shared bundle (see tools/build.py).
   Stage H: pages served by the Node server talk to /api on the same origin.
   Pages opened anywhere else (file preview, GitHub Pages) have no API: every
   request then fails honestly and the caller shows an error — never a fake
   success. Set window.PP_API_BASE before this bundle loads to point at a
   different API origin. Sessions use same-origin cookies (HttpOnly). */
(function () {
  var base = (typeof window.PP_API_BASE === 'string' ? window.PP_API_BASE : '').replace(/\/$/, '');
  function request(path, opts) {
    opts = opts || {};
    if (typeof fetch === 'undefined') {
      return Promise.resolve({ ok: false, status: 0, error: { code: 'NO_FETCH', message: 'This browser cannot reach the server.' } });
    }
    return fetch(base + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          return { ok: false, status: res.status, error: (data && data.error) || { code: 'BAD_RESPONSE', message: 'Server se sahi jawab nahi mila.' } };
        }
        return { ok: true, status: res.status, data: data };
      });
    }).catch(function () {
      return { ok: false, status: 0, error: { code: 'API_UNREACHABLE', message: 'Server se connect nahi ho pa raha hai. Please try again later.' } };
    });
  }
  function get(path) { return request(path, { method: 'GET' }); }
  function post(path, body) { return request(path, { method: 'POST', body: body }); }
  window.PP = window.PP || {};
  window.PP.apiBase = base;
  window.PP.request = request;
  window.PP.get = get;
  window.PP.post = post;
  window.PP.me = function () { return get('/api/auth/me'); };
  window.PP.login = function (email, password) { return post('/api/auth/login', { email: email, password: password }); };
  window.PP.register = function (fields) { return post('/api/auth/register', fields); };
  window.PP.logout = function () { return post('/api/auth/logout', {}); };
  window.PP.listProperties = function (params) {
    var q = [];
    if (params) Object.keys(params).forEach(function (k) { if (params[k] !== undefined && params[k] !== '') q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); });
    return get('/api/properties' + (q.length ? '?' + q.join('&') : ''));
  };
  window.PP.getProperty = function (id) { return get('/api/properties/' + encodeURIComponent(id)); };
  window.PP.submitInquiry = function (fields) { return post('/api/inquiries', fields); };
  window.PP.submitContact = function (fields) { return post('/api/contact', fields); };
  window.PP.savedList = function () { return get('/api/saved'); };
  window.PP.notifications = function () { return get('/api/notifications'); };
  /* Priority 2 helpers (same honest-request pattern as above). */
  window.PP.listBuilderProjects = function (params) { return get('/api/builder-projects' + (params ? '?' + params : '')); };
  window.PP.listReviews = function (propertyId) { return get('/api/properties/' + encodeURIComponent(propertyId) + '/reviews'); };
  window.PP.listTasks = function (params) { return get('/api/tasks' + (params ? '?' + params : '')); };
  window.PP.listPlans = function () { return get('/api/subscription-plans'); };
  window.PP.mySubscriptions = function () { return get('/api/subscriptions/mine'); };
  window.PP.entitlement = function () { return get('/api/subscriptions/entitlement'); };
  window.PP.listConversations = function () { return get('/api/conversations'); };
  window.PP.listCustomRoles = function () { return get('/api/custom-roles'); };
  window.PP.listAuditLog = function () { return get('/api/admin-audit-log'); };
  /* Priority 3 helpers (same honest-request pattern as above). */
  window.PP.analyticsSummary = function () { return get('/api/analytics/summary'); };
  window.PP.listSavedSearches = function () { return get('/api/saved-searches'); };
  window.PP.listSearchAlerts = function () { return get('/api/search-alerts'); };
  window.PP.listPriceHistory = function (propertyId) { return get('/api/properties/' + encodeURIComponent(propertyId) + '/price-history'); };
  window.PP.recommendations = function (propertyId) { return get('/api/properties/' + encodeURIComponent(propertyId) + '/recommendations'); };
  window.PP.aiGenerations = function () { return get('/api/ai/generations'); };
  window.PP.aiGenerate = function (fields) { return post('/api/ai/generate', fields); };
})();
