/* PrimePropertys — section behaviour: services (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
// Home service requests: my-requests list + stats, and the
// complaint-tracking detail workspace. Demo rows are replaced
// by live rows; anonymous visitors get an honest login notice.
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
  var PILL = { requested: 'amber', assigned: 'blue', scheduled: 'blue', in_progress: 'amber', completed: 'green', cancelled: '' };
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('en-IN'); } catch (e) { return s || ''; }
  }
  function fmtDateTime(s) {
    try { return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s || ''; }
  }
  function noticeRow(table, text, cols) {
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.textContent = '';
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', String(cols));
    td.textContent = text;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  /* My service requests: stats cards + table. */
  if (document.getElementById('pp-live-service-requests')) {
    authed().then(function (u) {
      if (!u) { loginNotice(document.getElementById('pp-live-service-requests-notice')); return; }
      window.PP.get('/api/service-requests/stats').then(function (r) {
        if (!r.ok || !r.data) return;
        var nums = document.querySelectorAll('.grid.grid-4 .card .price');
        var vals = [r.data.total, r.data.in_progress, r.data.resolved, r.data.closed];
        nums.forEach(function (el, i) { if (vals[i] != null) el.textContent = vals[i]; });
      });
    });
  }
  var table = document.getElementById('pp-live-service-table');
  if (table) {
    authed().then(function (u) {
      if (!u) { noticeRow(table, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', 7); return; }
      window.PP.get('/api/service-requests?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(table, (r.error && r.error.message) || 'Requests load nahi ho pa rahi hain.', 7); return; }
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        tbody.textContent = '';
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(table, 'No service requests yet.', 7); return; }
        items.forEach(function (s) {
          if (!s || !Number.isInteger(s.id)) return;
          var tr = document.createElement('tr');
          var c0 = document.createElement('td');
          c0.textContent = 'HSR-' + s.id;
          tr.appendChild(c0);
          var c1 = document.createElement('td');
          var b = document.createElement('strong');
          b.textContent = s.category || '';
          c1.appendChild(b);
          c1.appendChild(document.createElement('br'));
          var sm = document.createElement('small');
          sm.textContent = s.issue_type || '';
          c1.appendChild(sm);
          tr.appendChild(c1);
          var c2 = document.createElement('td');
          c2.textContent = s.address || '';
          tr.appendChild(c2);
          var c3 = document.createElement('td');
          var pill = document.createElement('span');
          pill.className = 'pill ' + (PILL[s.status] || '');
          pill.textContent = s.status;
          c3.appendChild(pill);
          tr.appendChild(c3);
          var c4 = document.createElement('td');
          c4.textContent = fmtDate(s.created_at);
          tr.appendChild(c4);
          var c5 = document.createElement('td');
          c5.textContent = s.scheduled_at ? fmtDateTime(s.scheduled_at) : ('Preferred: ' + (s.preferred_date || '') + ' ' + (s.time_slot || ''));
          tr.appendChild(c5);
          var c6 = document.createElement('td');
          var a = document.createElement('a');
          a.className = 'btn small outline';
          a.setAttribute('href', 'complaint-tracking.html?request_id=' + s.id);
          a.textContent = 'View';
          c6.appendChild(a);
          tr.appendChild(c6);
          tbody.appendChild(tr);
        });
      });
    });
  }
  /* Complaint tracking: detail + timeline + staff actions. */
  if (document.getElementById('pp-live-service-details')) {
    var params = new URLSearchParams(window.location.search);
    var requestId = parseInt(params.get('request_id') || '', 10);
    var box = document.getElementById('pp-live-service-details-body');
    var notice = document.getElementById('pp-live-service-details-notice');
    if (!requestId) {
      if (notice) notice.textContent = 'Koi request chuni nahi gayi hai. My Service Requests se kisi request par click karke aayein, ya neeche ID daalkar track karein.';
      return;
    }
    authed().then(function (u) {
      if (!u) { loginNotice(notice); return; }
      window.PP.get('/api/users').then(function (r) {
        var sel = document.getElementById('pp-service-assign-agent');
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
        window.PP.get('/api/service-requests/' + requestId).then(function (r) {
          if (!r.ok || !r.data) {
            if (box) box.textContent = (r.error && r.error.message) || 'Request load nahi ho pa rahi hai.';
            return;
          }
          render(r.data);
        });
      }
      function step(text, done) {
        var li = document.createElement('li');
        if (done) li.className = 'done';
        var bb = document.createElement('b');
        bb.textContent = text;
        li.appendChild(bb);
        return li;
      }
      function render(s) {
        box.textContent = '';
        var h = document.createElement('h3');
        h.textContent = 'HSR-' + s.id + ' — ' + s.category + ' • ' + s.issue_type;
        box.appendChild(h);
        var meta = document.createElement('p');
        meta.textContent = 'Property: ' + (s.address || '') + ' • Urgency: ' + s.urgency +
          ' • Status: ' + s.status + ' • Assigned to: ' + (s.assignee_name || 'unassigned') +
          ' • Preferred: ' + (s.preferred_date || '') + ' ' + (s.time_slot || '');
        box.appendChild(meta);
        var desc = document.createElement('p');
        desc.textContent = s.description || '';
        box.appendChild(desc);
        var tl = document.createElement('ul');
        tl.className = 'timeline';
        tl.appendChild(step('Request Raised — ' + fmtDateTime(s.created_at), true));
        tl.appendChild(step('Assigned to Technician' + (s.assigned_at ? ' — ' + (s.assignee_name || '') + ', ' + fmtDateTime(s.assigned_at) : ''), !!s.assigned_at));
        tl.appendChild(step('Visit Scheduled' + (s.scheduled_at ? ' — ' + fmtDateTime(s.scheduled_at) : ' (preferred: ' + (s.preferred_date || '') + ' ' + (s.time_slot || '') + ')'), !!s.scheduled_at));
        tl.appendChild(step('Resolved' + (s.completed_at ? ' — ' + fmtDateTime(s.completed_at) : ''), !!s.completed_at));
        if (s.status === 'cancelled') tl.appendChild(step('Cancelled', true));
        box.appendChild(tl);
        var note = document.createElement('p');
        box.appendChild(note);
        [['in_progress', 'Start progress'], ['completed', 'Complete'], ['cancelled', 'Cancel']].forEach(function (pair) {
          var btn = document.createElement('button');
          btn.className = 'btn small outline';
          btn.textContent = pair[1];
          btn.addEventListener('click', function () {
            window.PP.request('/api/service-requests/' + requestId, { method: 'PATCH', body: { status: pair[0] } }).then(function (rr) {
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
