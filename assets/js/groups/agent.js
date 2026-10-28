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
