/* PrimePropertys — section behaviour: agent (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
/* Stage H, Phase 4 — agent dashboard live data (guarded by #pp-live-agent).
   Leads visible to this agent (on their properties or assigned to them)
   come from the real API. Anonymous visitors get an honest login notice. */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-agent');
  if (!root || !window.PP || !window.PP.me) return;
  var notice = document.getElementById('pp-live-agent-notice');
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
    var lead = document.querySelector('p.lead');
    if (lead && lead.textContent.indexOf('Good morning') === 0) {
      lead.textContent = 'Good morning, ' + (m.data.user.full_name || m.data.user.email) + '! Here is what is happening with your business today.';
    }
    window.PP.get('/api/leads?limit=20').then(function (r) {
      var box = document.getElementById('pp-live-agent-leads');
      if (!box) return;
      if (!r.ok) { box.textContent = 'Leads load nahi ho pa rahi hain.'; return; }
      var items = (r.data && r.data.data) || [];
      var h = document.createElement('h3');
      h.textContent = 'Your Leads (live): ' + items.length;
      box.appendChild(h);
      if (!items.length) { box.appendChild(document.createTextNode('No leads yet.')); return; }
      items.forEach(function (l) {
        if (!l || !Number.isInteger(l.id)) return;
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('style', 'padding:14px;margin:10px 0');
        var t = document.createElement('strong');
        t.textContent = l.full_name || ('Lead #' + l.id);
        card.appendChild(t);
        var meta = document.createElement('p');
        meta.textContent = 'Enquired about ' + (l.property_title || ('property #' + l.property_id)) + ' — status: ' + l.status;
        card.appendChild(meta);
        box.appendChild(card);
      });
    });
  });
});

/* Stage CRM, Phase 2 — agent's site visits (guarded by
   #pp-live-agent-visits). Shows the agent's visible leads with status
   site_visit; visibility is enforced server-side. */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-agent-visits');
  if (!root || !window.PP || !window.PP.me) return;
  window.PP.me().then(function (m) {
    var notice = document.getElementById('pp-live-agent-visits-notice');
    if (!m.ok || !m.data || !m.data.user) {
      if (notice) {
        notice.textContent = 'Is page ke liye login zaroori hai. ';
        var a = document.createElement('a');
        a.href = '../../login.html';
        a.textContent = 'Login karein →';
        notice.appendChild(a);
      }
      return;
    }
    window.PP.get('/api/leads?status=site_visit&limit=50').then(function (r) {
      var box = document.getElementById('pp-live-agent-visits-list');
      if (!box) return;
      if (!r.ok) { box.textContent = 'Site visits load nahi ho pa rahe hain.'; return; }
      var items = (r.data && r.data.data) || [];
      var h = document.createElement('h3');
      h.textContent = 'Your Site Visits (live): ' + items.length;
      box.appendChild(h);
      if (!items.length) { box.appendChild(document.createTextNode('No site visits yet.')); return; }
      items.forEach(function (l) {
        if (!l || !Number.isInteger(l.id)) return;
        var c = document.createElement('div');
        c.className = 'card';
        c.setAttribute('style', 'padding:14px;margin:10px 0');
        var t = document.createElement('strong');
        t.textContent = l.full_name || ('Lead #' + l.id);
        c.appendChild(t);
        var meta = document.createElement('p');
        meta.textContent = (l.property_title || ('property #' + l.property_id)) + ' • ' + (l.phone || '');
        c.appendChild(meta);
        box.appendChild(c);
      });
    });
  });
});

/* Portal my-lists — agent assigned-leads pages. Both read the
   agent's own assigned leads (assigned_to = current user).
   Budget shows a dash: inquiries carry no buyer budget
   field (the same documented limit as lead scoring).
   The by-source page groups the first 100 assigned leads
   client-side; conversion is closed / total per source. */
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
  function myAssignedLeads() {
    return window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) return null;
      return window.PP.get('/api/leads?assigned_to=' + m.data.user.id + '&limit=100').then(function (r) {
        if (!r.ok) return { error: (r.error && r.error.message) || 'Leads load nahi ho pa rahe hain.' };
        return { items: (r.data && r.data.data) || [], user: m.data.user };
      });
    });
  }
  var leadTable = document.getElementById('pp-live-assigned-leads-table');
  if (leadTable) {
    myAssignedLeads().then(function (res) {
      if (!res) { noticeRow(leadTable, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', 5); return; }
      if (res.error) { noticeRow(leadTable, res.error, 5); return; }
      var items = res.items;
      if (!items.length) { noticeRow(leadTable, 'No assigned leads yet.', 5); return; }
      clearRows(leadTable);
      var h = host(leadTable);
      items.forEach(function (l) {
        if (!l || !Number.isInteger(l.id)) return;
        var tr = document.createElement('tr');
        var c0 = document.createElement('td');
        c0.textContent = l.full_name || ('Lead #' + l.id);
        tr.appendChild(c0);
        var c1 = document.createElement('td');
        c1.textContent = (l.property_title || ('property #' + l.property_id)) + (l.property_city ? ', ' + l.property_city : '');
        tr.appendChild(c1);
        var c2 = document.createElement('td');
        c2.textContent = '—';
        tr.appendChild(c2);
        var c3 = document.createElement('td');
        c3.textContent = l.status;
        tr.appendChild(c3);
        var c4 = document.createElement('td');
        c4.textContent = 'You';
        tr.appendChild(c4);
        h.appendChild(tr);
      });
    });
  }
  var sourceTable = document.getElementById('pp-live-assigned-source-table');
  if (sourceTable) {
    myAssignedLeads().then(function (res) {
      if (!res) { noticeRow(sourceTable, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', 4); return; }
      if (res.error) { noticeRow(sourceTable, res.error, 4); return; }
      var groups = {};
      res.items.forEach(function (l) {
        var s = l.source || 'unknown';
        if (!groups[s]) groups[s] = { total: 0, closed: 0 };
        groups[s].total++;
        if (l.status === 'closed') groups[s].closed++;
      });
      var names = Object.keys(groups);
      if (!names.length) { noticeRow(sourceTable, 'No assigned leads yet.', 4); return; }
      clearRows(sourceTable);
      var h = host(sourceTable);
      names.forEach(function (s) {
        var g = groups[s];
        var tr = document.createElement('tr');
        var c0 = document.createElement('td');
        c0.textContent = s;
        tr.appendChild(c0);
        var c1 = document.createElement('td');
        c1.textContent = String(g.total);
        tr.appendChild(c1);
        var c2 = document.createElement('td');
        c2.textContent = String(g.closed);
        tr.appendChild(c2);
        var c3 = document.createElement('td');
        c3.textContent = (g.total ? Math.round(g.closed / g.total * 100) : 0) + '%';
        tr.appendChild(c3);
        h.appendChild(tr);
      });
    });
  }
});

/* Payments — agent payments page (guarded by
   #pp-live-agent-payments-table). Offline records only. */
document.addEventListener('DOMContentLoaded', function () {
  var table = document.getElementById('pp-live-agent-payments-table');
  if (!table || !window.PP || !window.PP.me) return;
  function host() { return table.querySelector('tbody') || table; }
  function clearRows() {
    var rows = host().querySelectorAll('tr');
    var start = table.querySelector('tbody') ? 0 : 1;
    for (var i = rows.length - 1; i >= start; i--) rows[i].remove();
  }
  function noticeRow(text) {
    clearRows();
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', '4');
    td.textContent = text;
    tr.appendChild(td);
    host().appendChild(tr);
  }
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) { noticeRow('Is page ke liye login zaroori hai. Login karke dobara aayein.'); return; }
    window.PP.get('/api/payments?limit=100').then(function (r) {
      if (!r.ok) { noticeRow((r.error && r.error.message) || 'Payments load nahi ho pa rahe hain.'); return; }
      var items = (r.data && r.data.data) || [];
      if (!items.length) { noticeRow('No payments yet.'); return; }
      clearRows();
      var h = host();
      items.forEach(function (p) {
        if (!p || !Number.isInteger(p.id)) return;
        var tr = document.createElement('tr');
        [new Date(p.created_at).toLocaleDateString('en-IN'), p.description,
         'Rs ' + (p.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
         p.status].forEach(function (txt) {
          var td = document.createElement('td');
          td.textContent = txt;
          tr.appendChild(td);
        });
        h.appendChild(tr);
      });
    });
  });
});
