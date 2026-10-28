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
