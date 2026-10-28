/* PrimePropertys — section behaviour: owner (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
/* Stage H, Phase 3 — owner dashboard live data (guarded by #pp-live-owner).
   The owner's own listings (including drafts) come from the real API.
   When no session exists, an honest login notice is shown instead of
   demo data. The demo greeting is replaced with the real user's name
   only when a session exists. */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-owner');
  if (!root || !window.PP || !window.PP.me) return;
  var notice = document.getElementById('pp-live-owner-notice');
  function inr(n) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n); }
    catch (e) { return 'Rs ' + n; }
  }
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
    var name = m.data.user.full_name || m.data.user.email;
    var h1 = document.querySelector('h1');
    if (h1 && h1.textContent.indexOf('Welcome back') === 0) h1.textContent = 'Welcome back, ' + name + '!';
    window.PP.get('/api/properties/mine').then(function (r) {
      var box = document.getElementById('pp-live-mine');
      if (!box) return;
      if (!r.ok) {
        box.textContent = 'Your listings load nahi ho pa rahi hain.';
        return;
      }
      var items = (r.data && r.data.data) || [];
      var counts = {};
      items.forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });
      var h = document.createElement('h3');
      h.textContent = 'Your Listings (live): ' + items.length + ' total';
      box.appendChild(h);
      if (!items.length) { box.appendChild(document.createTextNode('No listings yet.')); return; }
      items.forEach(function (p) {
        if (!p || !Number.isInteger(p.id)) return;
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('style', 'padding:14px;margin:10px 0');
        var t = document.createElement('strong');
        t.textContent = p.title || ('Property #' + p.id);
        card.appendChild(t);
        var meta = document.createElement('p');
        meta.textContent = (p.property_type || '') + ' • ' + (p.city || '') + ' • ' + inr(p.price_inr || 0) + ' • Status: ' + p.status;
        card.appendChild(meta);
        box.appendChild(card);
      });
    });
  });
});

/* Portal my-lists — owner pages (guarded by table ids). All
   data comes from the real API. Views shows a dash: the
   property list endpoint does not expose per-property view
   counts. Leads per property are counted from the owner's
   own-property leads list. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function host(table) {
    return table.querySelector('tbody') || table;
  }
  function clearRows(table) {
    var h = host(table);
    var rows = h.querySelectorAll('tr');
    var start = table.querySelector('tbody') ? 0 : 1;
    for (var i = rows.length - 1; i >= start; i--) rows[i].remove();
  }
  function noticeRow(table, text, cols) {
    clearRows(table);
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', String(cols));
    td.textContent = text;
    tr.appendChild(td);
    host(table).appendChild(tr);
  }
  function badge(text, cls) {
    var s = document.createElement('span');
    s.className = 'badge ' + (cls || '');
    s.textContent = text;
    return s;
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('en-IN'); } catch (e) { return s || ''; }
  }
  function fmtTime(s) {
    try { return new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function inr(n) { return 'Rs ' + Math.round(n || 0).toLocaleString('en-IN'); }
  function loginRow(table, cols) {
    noticeRow(table, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', cols);
  }
  var propTable = document.getElementById('pp-live-my-properties-table');
  if (propTable) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginRow(propTable, 6); return; }
      window.PP.get('/api/properties/mine?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(propTable, (r.error && r.error.message) || 'Properties load nahi ho pa rahi hain.', 6); return; }
        var items = (r.data && r.data.data) || [];
        window.PP.get('/api/leads?limit=100').then(function (lr) {
          var counts = {};
          if (lr.ok && lr.data && lr.data.data) {
            lr.data.data.forEach(function (l) { counts[l.property_id] = (counts[l.property_id] || 0) + 1; });
          }
          if (!items.length) { noticeRow(propTable, 'No properties yet.', 6); return; }
          clearRows(propTable);
          var h = host(propTable);
          var cls = { published: 'green', draft: 'amber', sold: 'blue', rented: 'blue' };
          items.forEach(function (p) {
            if (!p || !Number.isInteger(p.id)) return;
            var tr = document.createElement('tr');
            var c0 = document.createElement('td');
            var b = document.createElement('strong');
            b.textContent = p.title || ('Property #' + p.id);
            c0.appendChild(b);
            c0.appendChild(document.createElement('br'));
            var sm = document.createElement('small');
            sm.textContent = p.city || '';
            c0.appendChild(sm);
            tr.appendChild(c0);
            var c1 = document.createElement('td');
            c1.textContent = inr(p.price_inr);
            tr.appendChild(c1);
            var c2 = document.createElement('td');
            c2.textContent = '—';
            tr.appendChild(c2);
            var c3 = document.createElement('td');
            c3.textContent = String(counts[p.id] || 0);
            tr.appendChild(c3);
            var c4 = document.createElement('td');
            c4.appendChild(badge(p.status, cls[p.status]));
            tr.appendChild(c4);
            var c5 = document.createElement('td');
            var a = document.createElement('a');
            a.className = 'btn small outline';
            a.setAttribute('href', 'property-leads.html');
            a.textContent = 'Leads';
            c5.appendChild(a);
            tr.appendChild(c5);
            h.appendChild(tr);
          });
        });
      });
    });
  }
  var visitTable = document.getElementById('pp-live-owner-visits-table');
  if (visitTable) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginRow(visitTable, 6); return; }
      window.PP.get('/api/site-visits?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(visitTable, (r.error && r.error.message) || 'Visits load nahi ho pa rahi hain.', 6); return; }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(visitTable, 'No site visits yet.', 6); return; }
        clearRows(visitTable);
        var h = host(visitTable);
        var cls = { requested: 'amber', confirmed: 'blue', completed: 'green' };
        items.forEach(function (v) {
          if (!v || !Number.isInteger(v.id)) return;
          var tr = document.createElement('tr');
          var c0 = document.createElement('td');
          c0.textContent = v.requester_name || '';
          tr.appendChild(c0);
          var c1 = document.createElement('td');
          c1.textContent = (v.property_title || ('property #' + v.property_id)) + (v.property_city ? ', ' + v.property_city : '');
          tr.appendChild(c1);
          var c2 = document.createElement('td');
          c2.textContent = fmtDate(v.scheduled_at);
          tr.appendChild(c2);
          var c3 = document.createElement('td');
          c3.textContent = fmtTime(v.scheduled_at);
          tr.appendChild(c3);
          var c4 = document.createElement('td');
          c4.appendChild(badge(v.status, cls[v.status]));
          tr.appendChild(c4);
          tr.appendChild(document.createElement('td'));
          h.appendChild(tr);
        });
      });
    });
  }
  var leadTable = document.getElementById('pp-live-property-leads-table');
  if (leadTable) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginRow(leadTable, 5); return; }
      window.PP.get('/api/leads?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(leadTable, (r.error && r.error.message) || 'Leads load nahi ho pa rahe hain.', 5); return; }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(leadTable, 'No leads yet.', 5); return; }
        clearRows(leadTable);
        var h = host(leadTable);
        var cls = { new: 'blue', contacted: 'blue', interested: 'amber', site_visit: 'amber', negotiation: 'amber', closed: 'green' };
        items.forEach(function (l) {
          if (!l || !Number.isInteger(l.id)) return;
          var tr = document.createElement('tr');
          var c0 = document.createElement('td');
          var b = document.createElement('strong');
          b.textContent = l.full_name || ('Lead #' + l.id);
          c0.appendChild(b);
          tr.appendChild(c0);
          var c1 = document.createElement('td');
          c1.textContent = (l.property_title || ('property #' + l.property_id)) + (l.property_city ? ', ' + l.property_city : '');
          tr.appendChild(c1);
          var c2 = document.createElement('td');
          c2.appendChild(badge(l.status, cls[l.status]));
          tr.appendChild(c2);
          var c3 = document.createElement('td');
          c3.textContent = fmtDate(l.created_at);
          tr.appendChild(c3);
          var c4 = document.createElement('td');
          var a = document.createElement('a');
          a.setAttribute('href', 'lead-details.html?lead_id=' + l.id);
          a.textContent = 'View details →';
          c4.appendChild(a);
          tr.appendChild(c4);
          h.appendChild(tr);
        });
      });
    });
  }
});

/* Payments — owner payments + invoices pages (guarded by table ids).
   Invoice numbers are derived (INV-<payment id>). */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function host(table) { return table.querySelector('tbody') || table; }
  function clearRows(table) {
    var rows = host(table).querySelectorAll('tr');
    var start = table.querySelector('tbody') ? 0 : 1;
    for (var i = rows.length - 1; i >= start; i--) rows[i].remove();
  }
  function noticeRow(table, text, cols) {
    clearRows(table);
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', String(cols));
    td.textContent = text;
    tr.appendChild(td);
    host(table).appendChild(tr);
  }
  function inr(paise) {
    return 'Rs ' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('en-IN'); } catch (e) { return s || ''; }
  }
  function render(table, cols, makeRow) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { noticeRow(table, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', cols); return; }
      window.PP.get('/api/payments?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(table, (r.error && r.error.message) || 'Payments load nahi ho pa rahe hain.', cols); return; }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(table, 'No payments yet.', cols); return; }
        clearRows(table);
        var h = host(table);
        items.forEach(function (p) {
          if (!p || !Number.isInteger(p.id)) return;
          var tr = document.createElement('tr');
          makeRow(p).forEach(function (txt) {
            var td = document.createElement('td');
            td.textContent = txt;
            tr.appendChild(td);
          });
          h.appendChild(tr);
        });
      });
    });
  }
  var payTable = document.getElementById('pp-live-owner-payments-table');
  if (payTable) {
    render(payTable, 4, function (p) { return [fmtDate(p.created_at), p.description, inr(p.amount_paise), p.status]; });
  }
  var invTable = document.getElementById('pp-live-owner-invoices-table');
  if (invTable) {
    render(invTable, 4, function (p) { return ['INV-' + p.id, fmtDate(p.created_at), p.description, inr(p.amount_paise)]; });
  }
});
