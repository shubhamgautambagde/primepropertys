/* PrimePropertys — navigation. Part of the shared bundle (see tools/build.py).
   Safe when .nav-toggle or .main-nav is absent: every lookup is guarded. */
document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav
  // Priority 4 accessibility: the toggle now exposes its state, so
  // assistive tech can tell whether the menu is open. Previously it
  // was only aria-label="Menu" with no expanded state.
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    if (!nav.id) nav.id = 'main-nav';
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Active nav link
  var here = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach(function (a) {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });
});

/* Stage H, Phase 4 — header session state (runs on every page).
   (a) The static headers' "Sign In" links point at contact.html; point
   them at the real login page. The correct relative prefix is derived
   from the header's own index.html link, so it works at any depth and
   under any hosting subpath.
   (b) When a session exists, show the user's name and a real Logout
   action in .header-actions (or the header row as fallback). */
document.addEventListener('DOMContentLoaded', function () {
  var homeLink = document.querySelector('a.logo, .main-nav a[href$="index.html"]');
  var prefix = '';
  if (homeLink) {
    var href = homeLink.getAttribute('href') || 'index.html';
    prefix = href.replace(/index\.html$/, '');
  }
  document.querySelectorAll('a').forEach(function (a) {
    if (a.textContent.trim() === 'Sign In') a.setAttribute('href', prefix + 'login.html');
  });
  if (!window.PP || !window.PP.me) return;
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) return;
    var actions = document.querySelector('.header-actions') || document.querySelector('.header-row') || document.querySelector('header');
    if (!actions) return;
    var chip = document.createElement('span');
    chip.textContent = (m.data.user.full_name || m.data.user.email) + ' (' + m.data.user.role + ')';
    chip.style.fontWeight = '600';
    chip.style.marginLeft = '12px';
    actions.appendChild(chip);
    var out = document.createElement('button');
    out.textContent = 'Logout';
    out.style.marginLeft = '8px';
    out.style.cursor = 'pointer';
    out.addEventListener('click', function () {
      window.PP.logout().then(function () { window.location.href = prefix + 'index.html'; });
    });
    actions.appendChild(out);
  });
});
/* PrimePropertys — tabs and toggles (home search tabs, pricing billing/audience).
   Part of the shared bundle (see tools/build.py). querySelectorAll is safe
   when a control is absent: it simply matches nothing. */
document.addEventListener('DOMContentLoaded', function () {
  // Home search tabs
  document.querySelectorAll('.search-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.search-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var note = document.getElementById('search-note');
      if (note) note.textContent = 'Showing ' + tab.textContent.trim() + ' properties across India.';
    });
  });

  // Pricing: Monthly / Yearly toggle
  document.querySelectorAll('[data-billing]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-billing]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var mode = btn.getAttribute('data-billing');
      document.querySelectorAll('.billing-note').forEach(function (n) {
        n.textContent = n.getAttribute('data-' + mode) || n.textContent;
      });
    });
  });

  // Pricing: audience tabs
  document.querySelectorAll('[data-audience]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-audience]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var note = document.getElementById('audience-note');
      if (note) note.textContent = 'Plans for ' + btn.textContent.trim() + ' — same transparent pricing, tailored features.';
    });
  });
});
/* PrimePropertys — accordion: one open at a time per container.
   Part of the shared bundle (see tools/build.py). */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.acc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.acc-item');
      var container = btn.closest('.accordion') || document;
      container.querySelectorAll('.acc-item').forEach(function (i) { if (i !== item) i.classList.remove('open'); });
      if (item) item.classList.toggle('open');
    });
  });
});
/* PrimePropertys — client-side list filtering (FAQ / Help search, Careers).
   Part of the shared bundle (see tools/build.py). Every input lookup is
   guarded, so pages without these controls are unaffected. */
document.addEventListener('DOMContentLoaded', function () {
  // FAQ / Help search filtering
  function bindFilter(inputId, selector) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      document.querySelectorAll(selector).forEach(function (el) {
        el.style.display = (!q || el.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
      });
    });
  }
  bindFilter('faqSearch', '.acc-item');
  bindFilter('helpSearch', '.topic-card, .acc-item');

  // Careers filtering
  var jobSearch = document.getElementById('jobSearch');
  var jobDept = document.getElementById('jobDept');
  var jobLoc = document.getElementById('jobLoc');
  function filterJobs() {
    var q = jobSearch ? jobSearch.value.trim().toLowerCase() : '';
    var d = jobDept ? jobDept.value : '';
    var l = jobLoc ? jobLoc.value : '';
    document.querySelectorAll('.job-card').forEach(function (job) {
      var ok = (!q || job.textContent.toLowerCase().indexOf(q) !== -1) &&
               (!d || job.getAttribute('data-dept') === d) &&
               (!l || job.getAttribute('data-location') === l);
      job.style.display = ok ? '' : 'none';
    });
  }
  if (jobSearch) jobSearch.addEventListener('input', filterJobs);
  if (jobDept) jobDept.addEventListener('change', filterJobs);
  if (jobLoc) jobLoc.addEventListener('change', filterJobs);
});
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
/* PrimePropertys — forms. Part of the shared bundle (see tools/build.py).
   Stage H: forms marked with data-api submit to the real API (window.PP)
   and report the true result. A real success shows the page's own success
   message with NO demo note, and the form is reset only because the data
   was actually saved. A failure keeps the user's input and shows an honest
   error — never a fake success. Forms without data-api keep the Stage B
   demo behaviour: a "Demo preview" note is appended once so the message
   cannot be read as a completed operation. Client-side tool forms
   (onsubmit="return false", e.g. calculators) keep their own behaviour
   and are skipped. */
document.addEventListener('DOMContentLoaded', function () {
  /* Role dashboards, relative to the site root (login/register pages
     live at the root). Seller has no dedicated dashboard section, so
     sellers land on the home page after login. */
  var DASHBOARDS = {
    Buyer: 'sections/buyer-portal/buyer-dashboard.html',
    Owner: 'sections/owner-portal/owner-dashboard.html',
    Agent: 'sections/agent-portal/agent-dashboard.html',
    Builder: 'sections/builder-portal/builder-dashboard.html',
    Investor: 'sections/investor-portal/investor-dashboard.html',
    Admin: 'sections/super-admin/super-admin-dashboard.html',
    'Super Admin': 'sections/super-admin/super-admin-dashboard.html',
    Support: 'sections/super-admin/super-admin-dashboard.html'
  };
  function goToDashboard() {
    if (!window.PP || !window.PP.me) return;
    window.PP.me().then(function (m) {
      var role = (m.data && m.data.user && m.data.user.role) || '';
      window.location.href = DASHBOARDS[role] || 'index.html';
    });
  }
  var authStatus = document.getElementById('pp-auth-status');
  if (authStatus && window.PP && window.PP.me) {
    window.PP.me().then(function (m) {
      if (m.ok && m.data && m.data.user) {
        var u = m.data.user;
        authStatus.textContent = 'Logged in as ' + (u.full_name || u.email) + ' (' + u.role + ').';
        var a = document.createElement('a');
        a.href = DASHBOARDS[u.role] || 'index.html';
        a.textContent = ' Go to dashboard →';
        authStatus.appendChild(a);
      }
    });
  }
  function showNote(form, text, isError) {
    var box = form.querySelector('.pp-form-msg');
    if (!box) {
      box = document.createElement('div');
      box.className = 'pp-form-msg';
      box.style.marginTop = '10px';
      box.style.fontWeight = '600';
      form.appendChild(box);
    }
    box.textContent = text;
    // Priority 4 accessibility: errors are announced (role=alert) and
    // success is a live status, so screen-reader users get the same
    // result sighted users see. Colours are the dark variants: the old
    // #f87171/#4ade80 measured 2.77:1 / 1.74:1 on white (WCAG AA fail);
    // #B91C1C/#166534 measure 6.47:1 / 7.13:1 on white.
    box.setAttribute('role', isError ? 'alert' : 'status');
    box.style.color = isError ? '#B91C1C' : '#166534';
    return box;
  }
  function field(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }
  function showSuccess(form, text) {
    var msg = form.querySelector('.form-success') || form.parentElement.querySelector('.form-success');
    if (msg) {
      msg.classList.add('show');
      msg.textContent = text;
    } else {
      showNote(form, text, false);
    }
  }
  function collectMapped(form) {
    var out = {};
    form.querySelectorAll('[data-api-field]').forEach(function (el) {
      out[el.getAttribute('data-api-field')] = (el.value || '').trim();
    });
    if (!out.full_name) out.full_name = field(form, 'full-name');
    if (!out.phone) out.phone = field(form, 'mobile-number');
    if (!out.email) out.email = field(form, 'email') || field(form, 'email-address');
    if (!out.message) {
      var ta = form.querySelector('textarea');
      out.message = ta ? ta.value.trim() : '';
    }
    return out;
  }
  document.querySelectorAll('form').forEach(function (form) {
    if (form.hasAttribute('onsubmit')) return;
    if (form.getAttribute('data-api') === 'inquiry') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.submitInquiry) {
          showNote(form, 'Form wiring load nahi hui — kuch bhi save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var propertyId = parseInt(params.get('property_id') || form.getAttribute('data-property-id') || '', 10);
        if (!propertyId || propertyId <= 0) {
          showNote(form, 'Is enquiry ke liye koi property chuni nahi gayi hai. Kisi property listing se Enquire dabakar aayein — tabhi ye form submit hoga.', true);
          return;
        }
        var f = collectMapped(form);
        var message = f.message || '';
        var dateEl = form.querySelector('input[type="date"][name="date"]');
        var timeEl = form.querySelector('input[type="time"]');
        if (dateEl && dateEl.value) {
          message = 'Site visit requested on ' + dateEl.value + (timeEl && timeEl.value ? ' at ' + timeEl.value : '') + '. ' + message;
        }
        var payload = { property_id: propertyId, full_name: f.full_name, phone: f.phone, message: message };
        if (f.email) payload.email = f.email;
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.submitInquiry(payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            var text = 'Thank you! Your enquiry has been received.';
            if (r.data && r.data.is_duplicate) text += ' (Note: ye enquiry pehle bhi darj hai.)';
            showSuccess(form, text);
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Enquiry save nahi hui. Please try again later.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'contact') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.submitContact) {
          showNote(form, 'Form wiring load nahi hui — kuch bhi save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.submitContact({
          full_name: field(form, 'full-name'),
          email: field(form, 'email-address'),
          phone: field(form, 'mobile-number'),
          subject: field(form, 'field'),
          message: field(form, 'message-here')
        }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            var msg = form.querySelector('.form-success') || form.parentElement.querySelector('.form-success');
            if (msg) {
              msg.classList.add('show');
              msg.textContent = 'Thank you! Your message has been received.';
            } else {
              showNote(form, 'Thank you! Your message has been received.', false);
            }
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Message save nahi hua. Please try again later.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'assign') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — assign nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var leadId = parseInt(field(form, 'lead-id'), 10);
        var assignee = parseInt(field(form, 'assigned-to'), 10);
        if (!leadId || leadId <= 0 || !assignee || assignee <= 0) {
          showNote(form, 'Lead ID aur agent dono chunein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/leads/' + leadId + '/assign', { assigned_to: assignee }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Lead assigned successfully.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Assign failed. Please try again.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'transfer') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — transfer nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var leadId = parseInt(field(form, 'lead-id'), 10);
        var assignee = parseInt(field(form, 'assigned-to'), 10);
        if (!leadId || leadId <= 0 || !assignee || assignee <= 0) {
          showNote(form, 'Lead ID aur agent dono chunein.', true);
          return;
        }
        var reason = field(form, 'reason');
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/leads/' + leadId + '/assign', { assigned_to: assignee }).then(function (r) {
          if (!r.ok) {
            if (btn) btn.disabled = false;
            showNote(form, (r.error && r.error.message) || 'Transfer failed. Please try again.', true);
            return;
          }
          if (!reason) {
            if (btn) btn.disabled = false;
            showSuccess(form, 'Lead transferred successfully.');
            form.reset();
            return;
          }
          window.PP.post('/api/leads/' + leadId + '/notes', { note: 'Transfer reason: ' + reason }).then(function (n) {
            if (btn) btn.disabled = false;
            if (n.ok) showSuccess(form, 'Lead transferred successfully (reason saved).');
            else showSuccess(form, 'Lead transferred, but the reason note could not be saved: ' + ((n.error && n.error.message) || 'unknown error') + '.');
            form.reset();
          });
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'visit-request') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — visit request nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        var propertyId = parseInt(payload.property_id || '', 10);
        if (!propertyId || propertyId <= 0) {
          showNote(form, 'Koi property chunein.', true);
          return;
        }
        if (!payload.scheduled_at) {
          showNote(form, 'Visit ki date aur time chunein.', true);
          return;
        }
        payload.property_id = propertyId;
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/site-visits', payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Visit request bhej di gayi hai. List dekhne ke liye page reload karein.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Visit request nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'visit-feedback') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.request) {
          showNote(form, 'Form wiring load nahi hui — feedback save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var visitId = parseInt(params.get('visit_id') || '', 10);
        if (!visitId || visitId <= 0) {
          showNote(form, 'Is feedback ke liye koi visit chuni nahi gayi hai. Visit details se aayein (?visit_id= ke saath).', true);
          return;
        }
        var ratingEl = form.querySelector('input[name="rating-1-5"]');
        var feedbackEl = form.querySelector('input[name="feedback"], textarea[name="feedback"]');
        var payload = {};
        var rating = ratingEl ? parseInt((ratingEl.value || '').trim(), 10) : NaN;
        if (rating >= 1 && rating <= 5) payload.rating = rating;
        var feedback = feedbackEl ? (feedbackEl.value || '').trim() : '';
        if (feedback) payload.feedback = feedback;
        if (!payload.rating && !payload.feedback) {
          showNote(form, 'Rating (1-5) ya feedback me se kam se kam ek bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.request('/api/site-visits/' + visitId, { method: 'PATCH', body: payload }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Feedback save ho gaya hai. Dhanyavaad!');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Feedback save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'visit-assign') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post || !window.PP.request) {
          showNote(form, 'Form wiring load nahi hui — assignment nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        var visitId = parseInt(payload.visit_id || '', 10);
        var assignee = parseInt(payload.assigned_to || '', 10);
        if (!visitId || visitId <= 0 || !assignee || assignee <= 0) {
          showNote(form, 'Visit aur agent dono chunein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/site-visits/' + visitId + '/assign', { assigned_to: assignee }).then(function (r) {
          if (!r.ok) {
            if (btn) btn.disabled = false;
            showNote(form, (r.error && r.error.message) || 'Assignment nahi ho pa raha hai.', true);
            return;
          }
          if (!payload.scheduled_at) {
            if (btn) btn.disabled = false;
            showSuccess(form, 'Agent assigned successfully.');
            form.reset();
            return;
          }
          window.PP.request('/api/site-visits/' + visitId, { method: 'PATCH', body: { scheduled_at: payload.scheduled_at } }).then(function (n) {
            if (btn) btn.disabled = false;
            if (n.ok) showSuccess(form, 'Agent assigned successfully (date/time bhi update ho gaya).');
            else showSuccess(form, 'Agent assigned, but the date/time could not be updated: ' + ((n.error && n.error.message) || 'unknown error') + '.');
            form.reset();
          });
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'ticket') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — ticket create nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!payload.subject || !payload.message) {
          showNote(form, 'Subject aur message dono bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/tickets', payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Ticket raise ho gaya hai. Support team jald jawab degi.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Ticket create nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'ticket-reply') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — reply save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var ticketId = parseInt(params.get('ticket_id') || '', 10);
        if (!ticketId || ticketId <= 0) {
          showNote(form, 'Is reply ke liye koi ticket chuna nahi gaya hai. Ticket details se aayein (?ticket_id= ke saath).', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!payload.message) {
          showNote(form, 'Reply message bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/tickets/' + ticketId + '/replies', payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Reply save ho gaya hai. Thread dekhne ke liye page reload karein.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Reply save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'ticket-assign') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — assignment nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var ticketId = parseInt(params.get('ticket_id') || '', 10);
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        var assignee = parseInt(payload.assigned_to || '', 10);
        if (!ticketId || ticketId <= 0 || !assignee || assignee <= 0) {
          showNote(form, 'Ticket aur user dono chunein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/tickets/' + ticketId + '/assign', { assigned_to: assignee }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Ticket assigned successfully. Detail dekhne ke liye page reload karein.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Assignment nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'service-request') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — request submit nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        var urg = (payload.urgency || '').toLowerCase();
        if (urg.indexOf('high') !== -1) payload.urgency = 'high';
        else if (urg.indexOf('low') !== -1) payload.urgency = 'low';
        else payload.urgency = 'normal';
        if (!payload.category || !payload.issue_type || !payload.address || !payload.preferred_date || !payload.time_slot || !payload.description) {
          showNote(form, 'Category, issue type, address, date, time slot aur description sab bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/service-requests', payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Service request submitted! Your request ID is HSR-' + (r.data && r.data.id) + '.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Request submit nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'service-assign') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — assignment nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var requestId = parseInt(params.get('request_id') || '', 10);
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        var assignee = parseInt(payload.assigned_to || '', 10);
        if (!requestId || requestId <= 0 || !assignee || assignee <= 0) {
          showNote(form, 'Request aur user dono chunein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/service-requests/' + requestId + '/assign', { assigned_to: assignee }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Technician assigned successfully. Detail dekhne ke liye page reload karein.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Assignment nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'service-schedule') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.request) {
          showNote(form, 'Form wiring load nahi hui — schedule save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var requestId = parseInt(params.get('request_id') || '', 10);
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!requestId || requestId <= 0 || !payload.scheduled_at) {
          showNote(form, 'Request aur visit ki date/time dono chunein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.request('/api/service-requests/' + requestId, { method: 'PATCH', body: { scheduled_at: payload.scheduled_at } }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Visit scheduled successfully. Detail dekhne ke liye page reload karein.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Schedule save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'service-track') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = form.querySelector('input');
        var raw = input ? (input.value || '') : '';
        var groups = raw.match(/\d+/g);
        var id = groups ? parseInt(groups[groups.length - 1], 10) : NaN;
        if (!id || id <= 0) {
          showNote(form, 'Ek numeric request ID daalein, jaise HSR-12.', true);
          return;
        }
        window.location.href = 'complaint-tracking.html?request_id=' + id;
      });
      return;
    }
    if (form.getAttribute('data-api') === 'newsletter') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — subscription save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!payload.email || payload.email.indexOf('@') === -1) {
          showNote(form, 'Ek valid email address daalein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/newsletter/subscribe', payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            if (r.data && r.data.already_subscribed) {
              showSuccess(form, 'You are already subscribed.');
            } else {
              showSuccess(form, 'Subscribed successfully.');
            }
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Subscription save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'payment-checkout') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — payment record save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var raw = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          raw[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        var methodText = (raw.method || '').toLowerCase();
        var method = 'other';
        if (methodText.indexOf('upi') !== -1) method = 'upi';
        else if (methodText.indexOf('net banking') !== -1) method = 'netbanking';
        else if (methodText.indexOf('wallet') !== -1) method = 'wallet';
        else if (methodText.indexOf('emi') !== -1) method = 'emi';
        else if (methodText.indexOf('card') !== -1) method = 'card';
        var payload = {
          description: form.getAttribute('data-description') || 'Payment',
          amount_paise: parseInt(form.getAttribute('data-amount-paise') || '', 10),
          method: method,
          billing: {
            full_name: raw.billing_full_name || '',
            company: raw.billing_company || '',
            address: raw.billing_address || '',
            city: '',
            pincode: '',
            gstin: raw.billing_gstin || ''
          }
        };
        if (!payload.amount_paise || payload.amount_paise <= 0) {
          showNote(form, 'Is checkout page par amount set nahi hai — payment record save nahi hua.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/payments', payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Payment recorded as pending (ID PAY-' + (r.data && r.data.data && r.data.data.id) + '). Koi gateway charge nahi hua hai — staff verification ke baad ye confirm hoga.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Payment record save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'billing-profile') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.request) {
          showNote(form, 'Form wiring load nahi hui — billing profile save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!payload.full_name) {
          showNote(form, 'Billing name bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.request('/api/billing-profile', { method: 'PUT', body: payload }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Billing profile saved.');
          } else {
            showNote(form, (r.error && r.error.message) || 'Billing profile save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'refund-request') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — refund request save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var raw = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          raw[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        var paymentId = parseInt(raw.payment_id || '', 10);
        var rupees = parseFloat(raw.refund_amount_rupees || '');
        var reason = (raw.reason || '') + (raw.description ? ' — ' + raw.description : '');
        if (!paymentId || paymentId <= 0 || !rupees || rupees <= 0 || !reason || !raw.refund_to) {
          showNote(form, 'Payment, reason, amount aur refund-to sab chunein/bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/payments/' + paymentId + '/refund-request', {
          reason: reason.slice(0, 500),
          refund_amount_paise: Math.round(rupees * 100),
          refund_to: raw.refund_to
        }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Refund request submitted. Ise Refund Status page par track karein.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Refund request save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'campaign-create' || form.getAttribute('data-api') === 'campaign-edit') {
      var isEdit = form.getAttribute('data-api') === 'campaign-edit';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post || !window.PP.request) {
          showNote(form, 'Form wiring load nahi hui — campaign save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        function num(v) {
          var n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
          return isNaN(n) ? 0 : n;
        }
        var raw = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          raw[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!raw.name) {
          showNote(form, 'Campaign name bharein.', true);
          return;
        }
        var payload = {
          name: raw.name,
          objective: raw.objective || '',
          type: raw.type || '',
          description: raw.description || '',
          daily_budget_rupees: num(raw.daily_budget_rupees),
          total_budget_rupees: num(raw.total_budget_rupees),
          channels: raw.channels || ''
        };
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        function done(r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            var id = r.data && r.data.data && r.data.data.id;
            showSuccess(form, 'Campaign saved as draft (ID ' + id + '). Ad-platform metrics tabhi dikhenge jab koi ad platform connect hoga.');
            if (!isEdit) form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Campaign save nahi ho pa raha hai.', true);
          }
        }
        if (isEdit) {
          var cid = parseInt(new URLSearchParams(window.location.search).get('campaign_id') || '', 10);
          if (!cid || cid <= 0) {
            if (btn) btn.disabled = false;
            showNote(form, 'Koi campaign chuna nahi gaya. Campaigns list se kisi campaign par Edit dabayein.', true);
            return;
          }
          window.PP.request('/api/campaigns/' + cid, { method: 'PATCH', body: payload }).then(done);
        } else {
          window.PP.post('/api/campaigns', payload).then(done);
        }
      });
      return;
    }
    if (form.getAttribute('data-api') === 'campaign-filter') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (window.PP && window.PP.applyCampaignFilter) {
          window.PP.applyCampaignFilter(form);
        } else {
          showNote(form, 'Filter wiring load nahi hui — page reload karke dobara try karein.', true);
        }
      });
      return;
    }
    if (form.getAttribute('data-api') === 'template') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — template save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var raw = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          raw[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!raw.name) {
          showNote(form, 'Template name bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.post('/api/message-templates', {
          channel: form.getAttribute('data-channel') || 'email',
          name: raw.name,
          subject: raw.subject || '',
          body: raw.body || ''
        }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Template saved (ID ' + (r.data && r.data.data && r.data.data.id) + ').');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Template save nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'sms-message' || form.getAttribute('data-api') === 'whatsapp-message') {
      var channel = form.getAttribute('data-api') === 'sms-message' ? 'sms' : 'whatsapp';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — message queue nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var raw = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          raw[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!raw.recipient || !raw.body) {
          showNote(form, 'Recipient aur message dono bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        var payload = { channel: channel, recipient: raw.recipient, body: raw.body };
        var tid = form.getAttribute('data-template-id');
        if (tid) payload.template_id = parseInt(tid, 10);
        window.PP.post('/api/queued-messages', payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Message queued (ID ' + (r.data && r.data.data && r.data.data.id) + ') — NOT sent: koi SMS/WhatsApp provider configure nahi hai. Notification Logs me iski status queued dikhegi.');
            form.reset();
          } else {
            showNote(form, (r.error && r.error.message) || 'Message queue nahi ho pa raha hai.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'settings') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.request) {
          showNote(form, 'Form wiring load nahi hui — settings save nahi hue. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {};
        form.querySelectorAll('[data-api-field]').forEach(function (el) {
          payload[el.getAttribute('data-api-field')] = (el.value || '').trim();
        });
        if (!payload.site_name) {
          showNote(form, 'Site / Service Name bharein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.request('/api/settings', { method: 'PUT', body: payload }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) {
            showSuccess(form, 'Settings saved.');
          } else {
            showNote(form, (r.error && r.error.message) || 'Settings save nahi ho pa rahe hain.', true);
          }
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'wizard-step' || form.getAttribute('data-api') === 'wizard-edit' ||
        form.getAttribute('data-api') === 'wizard-verification' || form.getAttribute('data-api') === 'wizard-submit' ||
        form.getAttribute('data-api') === 'wizard-quality' || form.getAttribute('data-api') === 'wizard-duplicate') {
      var wapi = form.getAttribute('data-api');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var hook = { 'wizard-step': 'wizardSaveStep', 'wizard-edit': 'wizardSaveEdit',
          'wizard-verification': 'wizardVerify', 'wizard-submit': 'wizardSubmitProperty',
          'wizard-quality': 'wizardQuality', 'wizard-duplicate': 'wizardDuplicate' }[wapi];
        if (window.PP && window.PP[hook]) {
          window.PP[hook](form);
        } else {
          showNote(form, 'Wizard wiring load nahi hui — kuch save nahi hua. Page reload karke dobara try karein.', true);
        }
      });
      return;
    }
    if (form.getAttribute('data-api') === 'wizard-choice') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var selected = document.querySelector('.choice.selected[data-choice-key]');
        if (selected && window.PP && window.PP.wizardSaveChoice) {
          window.PP.wizardSaveChoice(selected);
          showNote(form, 'Choice saved.');
        } else {
          showNote(form, 'Koi choice select nahi hai — pehle kisi card par click karein.', true);
        }
      });
      return;
    }
    if (form.getAttribute('data-api') === 'wizard-upload-notice') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        showNote(form, 'Photo/document upload abhi implement nahi hai — binary upload ke liye backend support chahiye. Draft banne ke baad Edit Property se image URLs add ki ja sakti hain.', true);
      });
      return;
    }
    if (form.getAttribute('data-api') === 'report-problem' || form.getAttribute('data-api') === 'emergency-support') {
      var isEmergency = form.getAttribute('data-api') === 'emergency-support';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — report save nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var f = collectMapped(form);
        var subject, message;
        if (isEmergency) {
          if (!f.emergency_type || !f.emergency_location || !f.emergency_phone) {
            showNote(form, 'Emergency type, location aur phone number — teeno zaroori hain.', true);
            return;
          }
          subject = 'Emergency: ' + f.emergency_type;
          message = 'Location: ' + f.emergency_location + '\nPhone: ' + f.emergency_phone;
        } else {
          if (!f.report_category || !f.report_description) {
            showNote(form, 'Category aur issue description — dono zaroori hain.', true);
            return;
          }
          subject = 'Report: ' + f.report_category;
          message = f.report_description;
          if (f.report_url) message += '\n\nPage/URL: ' + f.report_url;
          if (f.report_name || f.report_email || f.report_phone) message += '\nReported by: ' + (f.report_name || '') + ' <' + (f.report_email || '') + '>' + (f.report_phone ? ' Phone: ' + f.report_phone : '');
          if (message.length > 2000) {
            showNote(form, 'Description bahut lambi hai — 2000 characters ke andar likhein (abhi ' + message.length + ' hai).', true);
            return;
          }
          var fileInput = form.querySelector('input[type="file"]');
          if (fileInput && fileInput.files && fileInput.files.length) {
            showNote(form, 'Note: screenshots upload nahi ho sakte (binary upload implement nahi hai) — report bina screenshots ke jayegi.', true);
          }
        }
        window.PP.post('/api/tickets', { subject: subject, message: message }).then(function (r) {
          if (!r.ok) {
            showNote(form, (r.error && r.error.message) || 'Report save nahi ho pa raha hai. (Tickets ke liye login zaroori hai.)', true);
            return;
          }
          var id = (r.data && r.data.id) || r.id || '?';
          showSuccess(form, (isEmergency ? 'Emergency help ticket #' + id + ' ban gaya.' : 'Report ticket #' + id + ' ban gaya.') + ' Staff jald respond karega.');
          form.reset();
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'faq-search') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = (collectMapped(form).query || '').trim().toLowerCase();
        var items = document.querySelectorAll('.acc-item');
        var shown = 0;
        items.forEach(function (it) {
          var match = !q || (it.textContent || '').toLowerCase().indexOf(q) !== -1;
          it.style.display = match ? '' : 'none';
          if (match) shown++;
        });
        showNote(form, q ? shown + ' questions match kar rahe hain.' : 'Saare questions wapas dikh rahe hain.');
      });
      return;
    }
    if (form.getAttribute('data-api') === 'section-search') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = (collectMapped(form).query || '').trim().toLowerCase();
        var scope = document.querySelector('main') || document;
        var rows = scope.querySelectorAll('table tbody tr');
        var targets = rows.length ? rows : scope.querySelectorAll('.card');
        var shown = 0;
        targets.forEach(function (el) {
          if (el.contains(form)) return;
          var match = !q || (el.textContent || '').toLowerCase().indexOf(q) !== -1;
          el.style.display = match ? '' : 'none';
          if (match) shown++;
        });
        showNote(form, q ? shown + ' rows dikh rahe hain.' : 'Saare rows wapas dikh rahe hain.');
      });
      return;
    }
    if (form.getAttribute('data-api') === 'site-search') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var target = form.getAttribute('data-search-target');
        if (!target) {
          showNote(form, 'Search target set nahi hai — kuch search nahi hua.', true);
          return;
        }
        var f = collectMapped(form);
        var params = {};
        function parseRupees(text) {
          if (!text) return null;
          var m = text.match(/([\d.]+)\s*(Lakh|Crore|Cr)/);
          if (!m) return null;
          var n = parseFloat(m[1]);
          if (m[2] === 'Lakh') return Math.round(n * 100000);
          return Math.round(n * 10000000);
        }
        function mapType(v) {
          if (!v) return null;
          if (v === 'Apartment' || v === 'Villa' || v === 'Plot' || v === 'Plot / Land') return v === 'Plot / Land' ? 'Plot' : v;
          if (v === 'Office' || v === 'Office Space' || v === 'Commercial') return 'Commercial';
          return null;
        }
        if (f.city) params.city = f.city;
        if (f.search_purpose === 'Buy') params.listing_type = 'sale';
        else if (f.search_purpose === 'Rent') params.listing_type = 'rent';
        else if (f.search_purpose === 'Commercial') params.property_type = 'Commercial';
        var pt = mapType(f.search_type);
        if (pt) params.property_type = pt;
        if (f.search_min) { var mn = parseRupees(f.search_min); if (mn !== null) params.min_price = mn; }
        if (f.search_max) {
          if (f.search_max.indexOf('Crore+') === -1 && f.search_max.indexOf('Cr+') === -1) {
            var mx = parseRupees(f.search_max);
            if (mx !== null) params.max_price = mx;
          }
        }
        if (f.search_budget) {
          var b = f.search_budget;
          if (b.indexOf('Under') === 0) { var um = parseRupees(b); if (um !== null) params.max_price = um; }
          else if (b.indexOf('Above') === 0) { var am = parseRupees(b); if (am !== null) params.min_price = am; }
          else if (b.indexOf('–') !== -1 || b.indexOf('-') !== -1) {
            var parts = b.split(/–|-/);
            var pmin = parseRupees(parts[0]), pmax = parseRupees(parts[1]);
            if (pmin !== null) params.min_price = pmin;
            if (pmax !== null) params.max_price = pmax;
          } else { var single = parseRupees(b); if (single !== null) params.max_price = single; }
        }
        if (f.search_bhk) {
          if (f.search_bhk === '4+ BHK') params.bedrooms_min = 4;
          else { var bhk = parseInt(f.search_bhk, 10); if (!isNaN(bhk)) params.bedrooms = bhk; }
        }
        if (f.search_area) {
          var aparts = f.search_area.split(/–|-/);
          var amin = parseInt(aparts[0], 10), amax = parseInt(aparts[1], 10);
          if (!isNaN(amin)) params.area_min = amin;
          if (!isNaN(amax)) params.area_max = amax;
        }
        if (f.search_possession && f.search_possession !== 'Any') params.possession_status = f.search_possession;
        var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
        if (f.search_roi) {
          showNote(form, 'Note: ROI se filter nahi ho sakta (koi ROI field nahi hai) — city aur budget par search ho raha hai.');
          setTimeout(function () { window.location.href = target + (q ? '?' + q : ''); }, 1200);
          return;
        }
        window.location.href = target + (q ? '?' + q : '');
      });
      return;
    }
    if (form.getAttribute('data-api') === 'change-password') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.post) {
          showNote(form, 'Form wiring load nahi hui — password change nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var f = collectMapped(form);
        if (!f.current_password || !f.new_password) {
          showNote(form, 'Current aur new password — dono zaroori hain.', true);
          return;
        }
        if (f.confirm_password && f.confirm_password !== f.new_password) {
          showNote(form, 'New password aur confirm password match nahi kar rahe.', true);
          return;
        }
        window.PP.post('/api/auth/change-password', { current_password: f.current_password, new_password: f.new_password }).then(function (r) {
          if (!r.ok) {
            showNote(form, (r.error && r.error.message) || 'Password change nahi ho pa raha hai.', true);
            return;
          }
          var msg = 'Password change ho gaya (doosri sessions logout ho gayi hain).';
          if (/Two-Factor|2FA/.test(form.textContent || '')) {
            msg += ' Is page ke 2FA/notification toggles save nahi hote — unke liye abhi koi backend nahi hai.';
          }
          showSuccess(form, msg);
          form.reset();
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'calc-roi' || form.getAttribute('data-api') === 'calc-yield' || form.getAttribute('data-api') === 'calc-appr') {
      var fn = { 'calc-roi': 'calcROI', 'calc-yield': 'calcYield', 'calc-appr': 'calcAppr' }[form.getAttribute('data-api')];
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (typeof window[fn] === 'function') window[fn]();
        else showNote(form, 'Calculator load nahi hua — page reload karke dobara try karein.', true);
      });
      return;
    }
    if (form.getAttribute('data-api') === 'login') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.login) {
          showNote(form, 'Form wiring load nahi hui — login nahi hua. Page reload karke dobara try karein.', true);
          return;
        }
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.login(field(form, 'email'), field(form, 'password')).then(function (r) {
          if (btn) btn.disabled = false;
          if (!r.ok) {
            showNote(form, (r.error && r.error.message) || 'Login failed. Please try again.', true);
            return;
          }
          showSuccess(form, 'Login successful! Redirecting to your dashboard...');
          goToDashboard();
        });
      });
      return;
    }
    if (form.getAttribute('data-api') === 'register') {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.PP || !window.PP.register) {
          showNote(form, 'Form wiring load nahi hui — account nahi bana. Page reload karke dobara try karein.', true);
          return;
        }
        var payload = {
          full_name: field(form, 'full-name'),
          email: field(form, 'email'),
          password: field(form, 'password'),
          role: field(form, 'role')
        };
        var phone = field(form, 'mobile-number');
        if (phone) payload.phone = phone;
        var btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) btn.disabled = true;
        window.PP.register(payload).then(function (r) {
          if (btn) btn.disabled = false;
          if (!r.ok) {
            showNote(form, (r.error && r.error.message) || 'Account nahi bana. Please try again.', true);
            return;
          }
          showSuccess(form, 'Account created! Redirecting to your dashboard...');
          goToDashboard();
        });
      });
      return;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form-success') || form.parentElement.querySelector('.form-success');
      if (msg) {
        msg.classList.add('show');
        if (!msg.querySelector('.demo-note')) {
          var note = document.createElement('small');
          note.className = 'demo-note';
          note.textContent = ' Demo preview — no data was saved yet. This form is not connected to the server yet.';
          msg.appendChild(note);
        }
      }
    });
  });
});
/* PrimePropertys — core: small shared bits with no module of their own.
   Part of the shared bundle (see tools/build.py). */
document.addEventListener('DOMContentLoaded', function () {
  // Footer year, only if a year span is present
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
