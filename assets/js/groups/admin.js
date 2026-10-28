/* PrimePropertys — section behaviour: admin (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
// Admin: filter any table on the page from the toolbar search box.
document.addEventListener('DOMContentLoaded', function () {
  var box = document.querySelector('.admin-filter');
  if (box) box.addEventListener('input', function () {
    var q = box.value.trim().toLowerCase();
    document.querySelectorAll('table.data tbody tr').forEach(function (r) {
      r.style.display = (!q || r.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  });
  // Matrix: clicking a cell cycles its access level label.
  document.querySelectorAll('.matrix-cell').forEach(function (c) {
    c.addEventListener('click', function () {
      var levels = ['Full', 'View', 'Edit', 'None'];
      var cur = levels.indexOf(c.textContent.trim());
      c.textContent = levels[(cur + 1) % levels.length];
    });
  });
});

/* Stage H, Phase 4 — super-admin dashboard live summary (guarded by
   #pp-live-admin). Counts come from the real API; each call is handled
   on its own so a 403 on one (e.g. a non-admin visitor) does not hide
   the others. Anonymous visitors get an honest login notice. */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-admin');
  if (!root || !window.PP || !window.PP.me) return;
  var notice = document.getElementById('pp-live-admin-notice');
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) {
      if (notice) {
        notice.textContent = 'Is dashboard ke liye login zaroori hai. ';
        var a = document.createElement('a');
        a.href = '../../login.html';
        a.textContent = 'Login karein →';
        notice.appendChild(a);
      }
      return;
    }
    var box = document.getElementById('pp-live-admin-summary');
    if (!box) return;
    var h = document.createElement('h3');
    h.textContent = 'Live Summary (real data)';
    box.appendChild(h);
    function line(text) {
      var p = document.createElement('p');
      p.textContent = text;
      box.appendChild(p);
    }
    window.PP.get('/api/contact?limit=1').then(function (r) {
      line(r.ok ? 'Contact messages: ' + ((r.data && r.data.pagination && r.data.pagination.total) || 0) : 'Contact messages: admin access required.');
    });
    window.PP.get('/api/leads?limit=1').then(function (r) {
      line(r.ok ? 'Leads: ' + ((r.data && r.data.pagination && r.data.pagination.total) || (r.data && r.data.data && r.data.data.length) || 0) : 'Leads: load nahi ho pa rahe hain.');
    });
    window.PP.notifications().then(function (r) {
      line(r.ok ? 'Your unread notifications: ' + (r.data.unread_count || 0) : 'Notifications: load nahi ho pa rahi hain.');
    });
    window.PP.get('/api/contact?limit=5').then(function (r) {
      if (!r.ok || !r.data || !r.data.data || !r.data.data.length) return;
      var sub = document.createElement('h4');
      sub.textContent = 'Recent contact messages';
      box.appendChild(sub);
      r.data.data.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('style', 'padding:14px;margin:10px 0');
        var t = document.createElement('strong');
        t.textContent = (c.full_name || 'Anonymous') + ' — ' + (c.subject || '');
        card.appendChild(t);
        var meta = document.createElement('p');
        meta.textContent = (c.message || '').slice(0, 200);
        card.appendChild(meta);
        box.appendChild(card);
      });
    });
  });
});

/* Support tickets — live ticket lists (complaints + support
   pages) and the ticket details workspace. Tables carry
   the pp-live-ticket-table id; demo rows are replaced by
   live rows, and anonymous visitors get an honest login row.
   The subject links to the details page, which also hosts
   the assign dropdown (populated here, submitted by the
   forms.js ticket-assign case). */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function loginNotice(el) {
    if (!el) return;
    el.textContent = 'Is page ke liye login zaroori hai. ';
    var a = document.createElement('a');
    a.href = '../../login.html';
    a.textContent = 'Login karein →';
    el.appendChild(a);
  }
  function authed() {
    return window.PP.me().then(function (m) {
      return (m.ok && m.data && m.data.user) ? m.data.user : null;
    });
  }
  var STATUS_PILL = { open: 'amber', in_progress: 'blue', resolved: 'green', closed: '' };
  var PRIO_PILL = { low: '', medium: 'amber', high: 'red' };
  function pill(text, cls) {
    var s = document.createElement('span');
    s.className = 'pill ' + (cls || '');
    s.textContent = text;
    return s;
  }
  function noticeRow(table, text) {
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.textContent = '';
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', '5');
    td.textContent = text;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  document.querySelectorAll('table#pp-live-ticket-table').forEach(function (table) {
    authed().then(function (u) {
      if (!u) { noticeRow(table, 'Is page ke liye login zaroori hai. Login karke dobara aayein.'); return; }
      window.PP.get('/api/tickets?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(table, (r.error && r.error.message) || 'Tickets load nahi ho pa rahi hain.'); return; }
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        tbody.textContent = '';
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(table, 'No tickets yet.'); return; }
        items.forEach(function (t) {
          if (!t || !Number.isInteger(t.id)) return;
          var tr = document.createElement('tr');
          var c0 = document.createElement('td');
          c0.textContent = '#T-' + t.id;
          tr.appendChild(c0);
          var c1 = document.createElement('td');
          var a = document.createElement('a');
          a.setAttribute('href', 'ticket-details.html?ticket_id=' + t.id);
          a.textContent = t.subject || ('Ticket #' + t.id);
          c1.appendChild(a);
          tr.appendChild(c1);
          var c2 = document.createElement('td');
          c2.textContent = t.requester_name || '';
          tr.appendChild(c2);
          var c3 = document.createElement('td');
          c3.appendChild(pill(t.priority, PRIO_PILL[t.priority]));
          tr.appendChild(c3);
          var c4 = document.createElement('td');
          c4.appendChild(pill(t.status, STATUS_PILL[t.status]));
          tr.appendChild(c4);
          tbody.appendChild(tr);
        });
      });
    });
  });
  /* Ticket details workspace: detail + replies + status actions. */
  if (document.getElementById('pp-live-ticket-details')) {
    var params = new URLSearchParams(window.location.search);
    var ticketId = parseInt(params.get('ticket_id') || '', 10);
    var box = document.getElementById('pp-live-ticket-details-body');
    var notice = document.getElementById('pp-live-ticket-details-notice');
    if (!ticketId) {
      if (notice) notice.textContent = 'Koi ticket chuna nahi gaya hai. Ticket list se kisi ticket par click karke aayein.';
      return;
    }
    authed().then(function (u) {
      if (!u) { loginNotice(notice); return; }
      window.PP.get('/api/users').then(function (r) {
        var sel = document.getElementById('pp-ticket-assign-agent');
        if (!sel) return;
        sel.textContent = '';
        var items = (r.ok && r.data && r.data.data) || [];
        if (!items.length) {
          var o0 = document.createElement('option');
          o0.value = '';
          o0.textContent = 'User list needs admin/support access';
          sel.appendChild(o0);
          return;
        }
        var def = document.createElement('option');
        def.value = '';
        def.textContent = 'Select a user';
        sel.appendChild(def);
        items.forEach(function (x) {
          var o = document.createElement('option');
          o.value = x.id;
          o.textContent = (x.full_name || x.email) + ' (' + x.role + ')';
          sel.appendChild(o);
        });
      });
      function load() {
        window.PP.get('/api/tickets/' + ticketId).then(function (r) {
          if (!r.ok || !r.data) {
            if (box) box.textContent = (r.error && r.error.message) || 'Ticket load nahi ho pa rahi hai.';
            return;
          }
          render(r.data);
        });
      }
      function render(t) {
        box.textContent = '';
        var h = document.createElement('h3');
        h.textContent = '#T-' + t.id + ' — ' + t.subject;
        box.appendChild(h);
        var meta = document.createElement('p');
        meta.textContent = 'Raised by: ' + (t.requester_name || '') +
          ' • Priority: ' + t.priority + ' • Status: ' + t.status +
          ' • Assigned to: ' + (t.assignee_name || 'unassigned');
        box.appendChild(meta);
        var msg = document.createElement('p');
        msg.textContent = t.message;
        box.appendChild(msg);
        var rh = document.createElement('h3');
        rh.textContent = 'Replies';
        box.appendChild(rh);
        if (!(t.replies || []).length) box.appendChild(document.createTextNode('No replies yet.'));
        (t.replies || []).forEach(function (rp) {
          var p = document.createElement('p');
          p.textContent = (rp.author_name || '') + ': ' + rp.message;
          box.appendChild(p);
        });
        var note = document.createElement('p');
        box.appendChild(note);
        [['in_progress', 'Start progress'], ['resolved', 'Resolve'], ['closed', 'Close'], ['in_progress', 'Reopen']].forEach(function (pair) {
          var btn = document.createElement('button');
          btn.className = 'btn small outline';
          btn.textContent = pair[1];
          btn.addEventListener('click', function () {
            window.PP.request('/api/tickets/' + ticketId, { method: 'PATCH', body: { status: pair[0] } }).then(function (rr) {
              if (rr.ok) load();
              else note.textContent = (rr.error && rr.error.message) || 'Status change nahi ho pa raha hai.';
            });
          });
          box.appendChild(btn);
          box.appendChild(document.createTextNode(' '));
        });
      }
      load();
    });
  }
});
