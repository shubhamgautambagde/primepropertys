/* PrimePropertys — navigation. Part of the shared bundle (see tools/build.py).
   Safe when .nav-toggle or .main-nav is absent: every lookup is guarded. */
document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) toggle.addEventListener('click', function () { nav.classList.toggle('open'); });

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
    box.style.color = isError ? '#f87171' : '#4ade80';
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
