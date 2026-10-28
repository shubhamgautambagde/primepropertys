/* PrimePropertys — section behaviour: crm (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
// Portal: table search (front-end only)

document.addEventListener('DOMContentLoaded', function () {
  var s = document.getElementById('portalSearch');
  if (s) s.addEventListener('input', function () {
    var q = s.value.trim().toLowerCase();
    document.querySelectorAll('.data-table tbody tr').forEach(function (r) {
      r.style.display = (!q || r.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  });
});

/* Stage CRM — live CRM pages (each block guarded by its own container).
   All data comes from the real API; anonymous visitors get an honest
   login notice instead of demo data. */
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
  function card(title, meta) {
    var c = document.createElement('div');
    c.className = 'card';
    c.setAttribute('style', 'padding:14px;margin:10px 0');
    var t = document.createElement('strong');
    t.textContent = title;
    c.appendChild(t);
    if (meta) {
      var p = document.createElement('p');
      p.textContent = meta;
      c.appendChild(p);
    }
    return c;
  }
  function authed() {
    return window.PP.me().then(function (m) {
      return (m.ok && m.data && m.data.user) ? m.data.user : null;
    });
  }
  /* Assignee dropdowns (lead assignment page): real users from the API.
     Non-admins get a 403 here, and the dropdown simply stays empty. */
  document.querySelectorAll('select[name="assigned-to"]').forEach(function (sel) {
    window.PP.get('/api/users').then(function (r) {
      if (!r.ok || !r.data || !r.data.data) return;
      r.data.data.forEach(function (u) {
        var o = document.createElement('option');
        o.value = u.id;
        o.textContent = (u.full_name || u.email) + ' (' + u.role + ')';
        sel.appendChild(o);
      });
    });
  });
  /* All leads list. */
  if (document.getElementById('pp-live-all-leads')) {
    authed().then(function (u) {
      if (!u) { loginNotice(document.getElementById('pp-live-all-leads-notice')); return; }
      window.PP.get('/api/leads?limit=50').then(function (r) {
        var box = document.getElementById('pp-live-all-leads-list');
        if (!box) return;
        if (!r.ok) { box.textContent = 'Leads load nahi ho pa rahi hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Leads (live): ' + items.length;
        box.appendChild(h);
        if (!items.length) { box.appendChild(document.createTextNode('No leads yet.')); return; }
        items.forEach(function (l) {
          if (!l || !Number.isInteger(l.id)) return;
          var c = card(l.full_name || ('Lead #' + l.id),
            (l.property_title || ('property #' + l.property_id)) + ' • status: ' + l.status + (l.assigned_to ? ' • assigned to user ' + l.assigned_to : ''));
          var a = document.createElement('a');
          a.setAttribute('href', 'lead-details.html?lead_id=' + l.id);
          a.textContent = 'Open details →';
          c.appendChild(a);
          box.appendChild(c);
        });
      });
    });
  }
  /* Follow-ups across visible leads, with Done buttons. */
  if (document.getElementById('pp-live-followups')) {
    authed().then(function (u) {
      if (!u) { loginNotice(document.getElementById('pp-live-followups-notice')); return; }
      window.PP.get('/api/followups?limit=50').then(function (r) {
        var box = document.getElementById('pp-live-followups-list');
        if (!box) return;
        if (!r.ok) { box.textContent = 'Follow-ups load nahi ho pa rahe hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Follow-ups (live): ' + items.length;
        box.appendChild(h);
        if (!items.length) { box.appendChild(document.createTextNode('No follow-ups yet.')); return; }
        items.forEach(function (f) {
          if (!f || !Number.isInteger(f.id)) return;
          var c = card((f.lead_name || 'Lead') + ' — ' + (f.property_title || ''),
            'Due: ' + f.due_at + (f.note ? ' • ' + f.note : '') + ' • Lead status: ' + f.lead_status + (f.done_at ? ' • Done' : ' • Pending'));
          if (!f.done_at) {
            var btn = document.createElement('button');
            btn.textContent = 'Mark done';
            btn.addEventListener('click', function () {
              window.PP.post('/api/leads/' + f.inquiry_id + '/followups/' + f.id + '/done', {}).then(function (rr) {
                if (rr.ok) { btn.textContent = 'Done ✓'; btn.disabled = true; }
              });
            });
            c.appendChild(btn);
          }
          box.appendChild(c);
        });
      });
    });
  }
  /* Lead details workspace: detail + status + note + follow-up +
     activities + follow-ups, driven by ?lead_id=. */
  var details = document.getElementById('pp-live-lead-details');
  if (details) {
    var leadId = parseInt(new URLSearchParams(window.location.search).get('lead_id') || '', 10);
    var notice = document.getElementById('pp-live-lead-details-notice');
    var body = document.getElementById('pp-live-lead-details-body');
    if (!leadId || leadId <= 0) {
      if (notice) notice.textContent = 'Kisi lead ki details dekhne ke liye lead_id chahiye — All Leads page se kisi lead ko kholein.';
      return;
    }
    authed().then(function (u) {
      if (!u) { loginNotice(notice); return; }
      var STATUSES = ['new', 'contacted', 'interested', 'site_visit', 'negotiation', 'closed', 'lost'];
      function note(text, isError) {
        var p = document.createElement('p');
        p.textContent = text;
        p.style.fontWeight = '600';
        p.style.color = isError ? '#f87171' : '#4ade80';
        body.appendChild(p);
      }
      function refreshLists() {
        window.PP.get('/api/leads/' + leadId + '/activities').then(function (r) {
          var old = document.getElementById('pp-activities');
          if (old) old.remove();
          var wrap = document.createElement('div');
          wrap.id = 'pp-activities';
          var h = document.createElement('h4');
          h.textContent = 'Timeline (live)';
          wrap.appendChild(h);
          ((r.ok && r.data && r.data.data) || []).forEach(function (a) {
            wrap.appendChild(card(a.action || 'activity', (a.note || '') + (a.created_at ? ' • ' + a.created_at : '')));
          });
          body.appendChild(wrap);
        });
        window.PP.get('/api/leads/' + leadId + '/followups').then(function (r) {
          var old = document.getElementById('pp-followups');
          if (old) old.remove();
          var wrap = document.createElement('div');
          wrap.id = 'pp-followups';
          var h = document.createElement('h4');
          h.textContent = 'Follow-ups (live)';
          wrap.appendChild(h);
          ((r.ok && r.data && r.data.data) || []).forEach(function (f) {
            var c = card('Due: ' + f.due_at, (f.note || '') + (f.done_at ? ' • Done' : ' • Pending'));
            if (!f.done_at) {
              var btn = document.createElement('button');
              btn.textContent = 'Mark done';
              btn.addEventListener('click', function () {
                window.PP.post('/api/leads/' + leadId + '/followups/' + f.id + '/done', {}).then(function (rr) {
                  if (rr.ok) refreshLists();
                });
              });
              c.appendChild(btn);
            }
            wrap.appendChild(c);
          });
          body.appendChild(wrap);
        });
      }
      window.PP.get('/api/leads/' + leadId).then(function (r) {
        if (!r.ok) {
          if (notice) notice.textContent = (r.error && r.error.message) || 'Lead load nahi ho pa raha hai.';
          return;
        }
        var l = r.data;
        body.appendChild(card(l.full_name || ('Lead #' + l.id),
          (l.property_title || '') + (l.property_city ? ', ' + l.property_city : '') + ' • status: ' + l.status + ' • ' + (l.phone || '') + (l.email ? ' • ' + l.email : '')));
        /* Status form */
        var sf = document.createElement('form');
        var sel = document.createElement('select');
        STATUSES.forEach(function (s) {
          var o = document.createElement('option');
          o.value = s;
          o.textContent = s;
          if (s === l.status) o.selected = true;
          sel.appendChild(o);
        });
        var sb = document.createElement('button');
        sb.type = 'submit';
        sb.textContent = 'Update status';
        sf.appendChild(sel);
        sf.appendChild(sb);
        sf.addEventListener('submit', function (e) {
          e.preventDefault();
          fetch('/api/leads/' + leadId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: sel.value }) })
            .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
            .then(function (x) {
              if (x.ok) { note('Status updated to ' + sel.value + '.'); refreshLists(); }
              else note((x.j.error && x.j.error.message) || 'Status update failed.', true);
            });
        });
        body.appendChild(sf);
        /* Note form */
        var nf = document.createElement('form');
        var ta = document.createElement('textarea');
        ta.placeholder = 'Add a note...';
        ta.required = true;
        var nb = document.createElement('button');
        nb.type = 'submit';
        nb.textContent = 'Add note';
        nf.appendChild(ta);
        nf.appendChild(nb);
        nf.addEventListener('submit', function (e) {
          e.preventDefault();
          window.PP.post('/api/leads/' + leadId + '/notes', { note: ta.value }).then(function (x) {
            if (x.ok) { note('Note saved.'); ta.value = ''; refreshLists(); }
            else note((x.error && x.error.message) || 'Note save failed.', true);
          });
        });
        body.appendChild(nf);
        /* Follow-up form */
        var ff = document.createElement('form');
        var dt = document.createElement('input');
        dt.type = 'datetime-local';
        dt.required = true;
        var fn = document.createElement('input');
        fn.placeholder = 'Follow-up note (optional)';
        var fb = document.createElement('button');
        fb.type = 'submit';
        fb.textContent = 'Schedule follow-up';
        ff.appendChild(dt);
        ff.appendChild(fn);
        ff.appendChild(fb);
        ff.addEventListener('submit', function (e) {
          e.preventDefault();
          window.PP.post('/api/leads/' + leadId + '/followups', { due_at: dt.value, note: fn.value }).then(function (x) {
            if (x.ok) { note('Follow-up scheduled.'); dt.value = ''; fn.value = ''; refreshLists(); }
            else note((x.error && x.error.message) || 'Follow-up failed.', true);
          });
        });
        body.appendChild(ff);
        refreshLists();
      });
    });
  }
});

/* Stage CRM, Phase 2 — site-visit leads + visit calendar (guarded by
   their containers). Site-visit leads are real leads with status
   site_visit; the calendar groups real follow-ups by due date. */
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
  function card(title, meta) {
    var c = document.createElement('div');
    c.className = 'card';
    c.setAttribute('style', 'padding:14px;margin:10px 0');
    var t = document.createElement('strong');
    t.textContent = title;
    c.appendChild(t);
    if (meta) {
      var p = document.createElement('p');
      p.textContent = meta;
      c.appendChild(p);
    }
    return c;
  }
  function authed() {
    return window.PP.me().then(function (m) {
      return (m.ok && m.data && m.data.user) ? m.data.user : null;
    });
  }
  if (document.getElementById('pp-live-visit-leads')) {
    authed().then(function (u) {
      if (!u) { loginNotice(document.getElementById('pp-live-visit-leads-notice')); return; }
      window.PP.get('/api/leads?status=site_visit&limit=50').then(function (r) {
        var box = document.getElementById('pp-live-visit-leads-list');
        if (!box) return;
        if (!r.ok) { box.textContent = 'Site visit leads load nahi ho pa rahe hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Site Visit Leads (live): ' + items.length;
        box.appendChild(h);
        if (!items.length) { box.appendChild(document.createTextNode('No site visit leads yet.')); return; }
        items.forEach(function (l) {
          if (!l || !Number.isInteger(l.id)) return;
          var c = card(l.full_name || ('Lead #' + l.id),
            (l.property_title || ('property #' + l.property_id)) + ' • ' + (l.phone || '') + (l.assigned_to ? ' • assigned to user ' + l.assigned_to : ''));
          var a = document.createElement('a');
          a.setAttribute('href', 'lead-details.html?lead_id=' + l.id);
          a.textContent = 'Open details →';
          c.appendChild(a);
          box.appendChild(c);
        });
      });
    });
  }
  if (document.getElementById('pp-live-visit-calendar')) {
    authed().then(function (u) {
      if (!u) { loginNotice(document.getElementById('pp-live-visit-calendar-notice')); return; }
      window.PP.get('/api/followups?limit=100').then(function (r) {
        var box = document.getElementById('pp-live-visit-calendar-list');
        if (!box) return;
        if (!r.ok) { box.textContent = 'Follow-ups load nahi ho pa rahe hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Follow-ups by due date (live): ' + items.length;
        box.appendChild(h);
        if (!items.length) { box.appendChild(document.createTextNode('No follow-ups yet.')); return; }
        var groups = {};
        items.forEach(function (f) {
          var day = (f.due_at || '').slice(0, 10) || 'No date';
          (groups[day] = groups[day] || []).push(f);
        });
        Object.keys(groups).sort().forEach(function (day) {
          var dh = document.createElement('h4');
          dh.textContent = day;
          box.appendChild(dh);
          groups[day].forEach(function (f) {
            box.appendChild(card((f.lead_name || 'Lead') + ' — ' + (f.property_title || ''),
              'Due: ' + f.due_at + (f.note ? ' • ' + f.note : '') + (f.done_at ? ' • Done' : ' • Pending')));
          });
        });
      });
    });
  }
});

/* Stage CRM, Phase 3 — reports from GET /api/leads/stats (guarded by
   each page's container; one fetch serves whichever report page is
   open). All numbers are computed from existing inquiries — nothing
   is invented, and visibility is enforced server-side. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  var PAGES = {
    'pp-live-reports': 'reports',
    'pp-live-funnel': 'funnel',
    'pp-live-source': 'source',
    'pp-live-property': 'property',
    'pp-live-team': 'team',
    'pp-live-agent': 'agent'
  };
  var found = null;
  Object.keys(PAGES).forEach(function (id) {
    if (document.getElementById(id)) found = id;
  });
  if (!found) return;
  var mode = PAGES[found];
  function loginNotice() {
    var el = document.getElementById(found + '-notice');
    if (!el) return;
    el.textContent = 'Is page ke liye login zaroori hai. ';
    var a = document.createElement('a');
    a.href = '../../login.html';
    a.textContent = 'Login karein →';
    el.appendChild(a);
  }
  function row(title, value) {
    var p = document.createElement('p');
    p.textContent = title + ': ' + value;
    return p;
  }
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) { loginNotice(); return; }
    window.PP.get('/api/leads/stats').then(function (r) {
      var box = document.getElementById(found + '-body');
      if (!box) return;
      if (!r.ok) { box.textContent = 'Reports load nahi ho pa rahe hain.'; return; }
      var s = r.data;
      var h = document.createElement('h3');
      h.textContent = 'Live Report: ' + s.total + ' leads (visible to you)';
      box.appendChild(h);
      if (mode === 'reports' || mode === 'funnel') {
        var max = 1;
        s.funnel.forEach(function (f) { if (f.count > max) max = f.count; });
        s.funnel.forEach(function (f) {
          var wrap = document.createElement('div');
          wrap.setAttribute('style', 'margin:8px 0');
          var label = document.createElement('div');
          label.textContent = f.status + ': ' + f.count;
          var bar = document.createElement('div');
          bar.setAttribute('style', 'height:18px;background:#2563EB;border-radius:6px;width:' + Math.max(2, Math.round(f.count / max * 100)) + '%');
          wrap.appendChild(label);
          wrap.appendChild(bar);
          box.appendChild(wrap);
        });
      }
      if (mode === 'reports' || mode === 'source') {
        var sh = document.createElement('h4');
        sh.textContent = 'By source';
        box.appendChild(sh);
        (s.by_source || []).forEach(function (x) {
          box.appendChild(row(x.source, x.n + (s.total ? ' (' + Math.round(x.n / s.total * 100) + '%)' : '')));
        });
      }
      if (mode === 'reports' || mode === 'property') {
        var ph = document.createElement('h4');
        ph.textContent = 'Top properties';
        box.appendChild(ph);
        (s.by_property || []).forEach(function (x) {
          box.appendChild(row(x.property_title || ('property #' + x.property_id), x.n));
        });
      }
      if (mode === 'team' || mode === 'agent') {
        var closedBy = {};
        (s.by_assignee_closed || []).forEach(function (x) { closedBy[x.assigned_to] = x.closed; });
        var ah = document.createElement('h4');
        ah.textContent = 'By assignee (leads • closures • conversion)';
        box.appendChild(ah);
        (s.by_assignee || []).forEach(function (x) {
          var closed = closedBy[x.assigned_to] || 0;
          var conv = x.n ? Math.round(closed / x.n * 100) : 0;
          box.appendChild(row(x.name, x.n + ' • ' + closed + ' • ' + conv + '%'));
        });
      }
    });
  });
});

/* Stage CRM, Phase 4 — status-filtered lead lists, CRM dashboard,
   export download, lead timeline. All from existing endpoints; no new
   backend needed. Each block is guarded by its own container. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function loginNotice(cid) {
    var el = document.getElementById(cid + '-notice');
    if (!el) return;
    el.textContent = 'Is page ke liye login zaroori hai. ';
    var a = document.createElement('a');
    a.href = '../../login.html';
    a.textContent = 'Login karein →';
    el.appendChild(a);
  }
  function card(title, meta, link) {
    var c = document.createElement('div');
    c.className = 'card';
    c.setAttribute('style', 'padding:14px;margin:10px 0');
    var t = document.createElement('strong');
    t.textContent = title;
    c.appendChild(t);
    if (meta) {
      var p = document.createElement('p');
      p.textContent = meta;
      c.appendChild(p);
    }
    if (link) {
      var a = document.createElement('a');
      a.setAttribute('href', link.href);
      a.textContent = link.text;
      c.appendChild(a);
    }
    return c;
  }
  function authed() {
    return window.PP.me().then(function (m) {
      return (m.ok && m.data && m.data.user) ? m.data.user : null;
    });
  }
  /* Status-filtered lists: container id suffix = lead status. */
  var STATUS_PAGES = {
    'pp-live-leads-new': 'new',
    'pp-live-leads-contacted': 'contacted',
    'pp-live-leads-interested': 'interested',
    'pp-live-leads-negotiation': 'negotiation',
    'pp-live-leads-closed': 'closed',
    'pp-live-leads-lost': 'lost'
  };
  Object.keys(STATUS_PAGES).forEach(function (cid) {
    if (!document.getElementById(cid)) return;
    var status = STATUS_PAGES[cid];
    authed().then(function (u) {
      if (!u) { loginNotice(cid); return; }
      window.PP.get('/api/leads?status=' + status + '&limit=50').then(function (r) {
        var box = document.getElementById(cid + '-body');
        if (!box) return;
        if (!r.ok) { box.textContent = 'Leads load nahi ho pa rahe hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = status + ' leads (live): ' + items.length;
        box.appendChild(h);
        if (!items.length) { box.appendChild(document.createTextNode('No leads in this stage yet.')); return; }
        items.forEach(function (l) {
          if (!l || !Number.isInteger(l.id)) return;
          box.appendChild(card(l.full_name || ('Lead #' + l.id),
            (l.property_title || ('property #' + l.property_id)) + ' • ' + (l.phone || ''),
            { href: 'lead-details.html?lead_id=' + l.id, text: 'Open details →' }));
        });
      });
    });
  });
  /* CRM dashboard: stats summary. */
  if (document.getElementById('pp-live-crm-dashboard')) {
    authed().then(function (u) {
      if (!u) { loginNotice('pp-live-crm-dashboard'); return; }
      window.PP.get('/api/leads/stats').then(function (r) {
        var box = document.getElementById('pp-live-crm-dashboard-body');
        if (!box) return;
        if (!r.ok) { box.textContent = 'Dashboard load nahi ho pa raha hai.'; return; }
        var s = r.data;
        var h = document.createElement('h3');
        h.textContent = 'Overview (live): ' + s.total + ' leads visible to you';
        box.appendChild(h);
        Object.keys(s.by_status || {}).forEach(function (st) {
          var p = document.createElement('p');
          p.textContent = st + ': ' + s.by_status[st];
          box.appendChild(p);
        });
      });
    });
  }
  /* CRM export: real CSV download (raw fetch — the shared client
     parses JSON, and CSV is not JSON). Export is admin-gated
     server-side; others get an honest message. */
  if (document.getElementById('pp-live-crm-export')) {
    authed().then(function (u) {
      var box = document.getElementById('pp-live-crm-export-body');
      if (!box) return;
      if (!u) { loginNotice('pp-live-crm-export'); return; }
      var btn = document.createElement('button');
      btn.textContent = 'Download leads CSV (live)';
      var msg = document.createElement('p');
      msg.style.fontWeight = '600';
      btn.addEventListener('click', function () {
        fetch((window.PP.apiBase || '') + '/api/leads/export', { credentials: 'same-origin' }).then(function (res) {
          if (!res.ok) {
            msg.textContent = res.status === 403 ? 'Export ke liye admin permission chahiye.' : 'Export download nahi ho pa raha hai.';
            return null;
          }
          return res.text();
        }).then(function (csv) {
          if (csv == null) return;
          var blob = new Blob([csv], { type: 'text/csv' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'leads.csv';
          a.click();
          URL.revokeObjectURL(a.href);
          msg.textContent = 'CSV downloaded.';
        });
      });
      box.appendChild(btn);
      box.appendChild(msg);
    });
  }
  /* Lead timeline: activities for ?lead_id=. */
  if (document.getElementById('pp-live-lead-timeline')) {
    var leadId = parseInt(new URLSearchParams(window.location.search).get('lead_id') || '', 10);
    var notice = document.getElementById('pp-live-lead-timeline-notice');
    if (!leadId || leadId <= 0) {
      if (notice) notice.textContent = 'Kisi lead ki timeline dekhne ke liye lead_id chahiye — All Leads page se kisi lead ko kholein, phir timeline dekhein.';
      return;
    }
    authed().then(function (u) {
      if (!u) { loginNotice('pp-live-lead-timeline'); return; }
      window.PP.get('/api/leads/' + leadId + '/activities').then(function (r) {
        var box = document.getElementById('pp-live-lead-timeline-body');
        if (!box) return;
        if (!r.ok) { box.textContent = (r.error && r.error.message) || 'Timeline load nahi ho pa rahi hai.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Timeline for lead #' + leadId + ' (live): ' + items.length + ' events';
        box.appendChild(h);
        items.forEach(function (a) {
          box.appendChild(card(a.action || 'activity', (a.note || '') + (a.created_at ? ' • ' + a.created_at : '')));
        });
      });
    });
  }
});

/* CRM Stage, Phase 5 — lead tags. Same visibility rule as notes:
   anyone who can see the lead can tag it. Tag names are free-form;
   the server dedupes them case-insensitively. DOM construction only
   (tag names are user input, never injected as HTML). */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-lead-tags');
  if (!root || !window.PP || !window.PP.me) return;
  var notice = document.getElementById('pp-live-lead-tags-notice');
  var box = document.getElementById('pp-live-lead-tags-body');
  var leadId = parseInt(new URLSearchParams(window.location.search).get('lead_id') || '', 10);
  if (!leadId || leadId <= 0) {
    if (notice) notice.textContent = 'Kisi lead ko tag karne ke liye lead_id chahiye — All Leads page se kisi lead ko kholein, phir tags dekhein.';
    return;
  }
  window.PP.me().then(function (m) {
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
    var msg = document.createElement('p');
    msg.style.fontWeight = '600';
    var input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('placeholder', 'Naya tag, jaise 3BHK ya Hot Lead');
    input.setAttribute('maxlength', '50');
    var addBtn = document.createElement('button');
    addBtn.textContent = 'Tag lagayein';
    addBtn.addEventListener('click', function () {
      var name = input.value.trim();
      if (!name) { msg.textContent = 'Pehle tag ka naam likhein.'; return; }
      window.PP.post('/api/leads/' + leadId + '/tags', { name: name }).then(function (r) {
        if (!r.ok) { msg.textContent = (r.error && r.error.message) || 'Tag lag nahi pa raha hai.'; return; }
        input.value = '';
        msg.textContent = 'Tag lag gaya.';
        render();
      });
    });
    box.appendChild(input);
    box.appendChild(addBtn);
    box.appendChild(msg);
    var mineBox = document.createElement('div');
    var allBox = document.createElement('div');
    box.appendChild(mineBox);
    box.appendChild(allBox);
    function chip(text, onClick) {
      var b = document.createElement('button');
      b.textContent = text;
      b.setAttribute('style', 'margin:4px;padding:6px 10px');
      if (onClick) b.addEventListener('click', onClick);
      return b;
    }
    function render() {
      window.PP.get('/api/leads/' + leadId + '/tags').then(function (r) {
        mineBox.textContent = '';
        var h = document.createElement('h3');
        h.textContent = 'Is lead ke tags (live)';
        mineBox.appendChild(h);
        if (!r.ok) { mineBox.appendChild(document.createTextNode((r.error && r.error.message) || 'Tags load nahi ho pa rahe hain.')); return; }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { mineBox.appendChild(document.createTextNode('Abhi koi tag nahi hai.')); return; }
        items.forEach(function (t) {
          var wrap = document.createElement('span');
          wrap.appendChild(chip(t.name, null));
          wrap.appendChild(chip('✕ hatayein', function () {
            fetch((window.PP.apiBase || '') + '/api/leads/' + leadId + '/tags/' + t.id, { method: 'DELETE', credentials: 'same-origin' }).then(function () { render(); });
          }));
          mineBox.appendChild(wrap);
        });
      });
      window.PP.get('/api/tags').then(function (r) {
        allBox.textContent = '';
        var h = document.createElement('h3');
        h.textContent = 'Maujooda tags (ek click me lagayein)';
        allBox.appendChild(h);
        if (!r.ok) return;
        var items = (r.data && r.data.data) || [];
        items.forEach(function (t) {
          allBox.appendChild(chip(t.name, function () {
            window.PP.post('/api/leads/' + leadId + '/tags', { name: t.name }).then(function () { render(); });
          }));
        });
      });
    }
    render();
  });
});
