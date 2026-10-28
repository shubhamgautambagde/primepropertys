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
