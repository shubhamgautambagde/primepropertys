/* PrimePropertys — section behaviour: builder (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
var ps=document.getElementById('pageSearch');
  if(ps){ps.addEventListener('input',function(){var q=ps.value.trim().toLowerCase();
    document.querySelectorAll('.filter-row').forEach(function(r){r.style.display=(!q||r.textContent.toLowerCase().indexOf(q)!==-1)?'':'none';});});}
  document.querySelectorAll('[data-approve]').forEach(function(b){b.addEventListener('click',function(){var s=b.closest('tr');if(s){var st=s.querySelector('.status');if(st){st.textContent=b.getAttribute('data-approve');st.className='status '+(b.getAttribute('data-approve')==='Approved'?'ok':'bad');}}});});

/* Stage H, Phase 4 — builder dashboard live data (guarded by #pp-live-builder).
   The builder's own listings (including drafts) come from the real API. */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-builder');
  if (!root || !window.PP || !window.PP.me) return;
  var notice = document.getElementById('pp-live-builder-notice');
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
    window.PP.get('/api/properties/mine').then(function (r) {
      var box = document.getElementById('pp-live-builder-mine');
      if (!box) return;
      if (!r.ok) { box.textContent = 'Your listings load nahi ho pa rahi hain.'; return; }
      var items = (r.data && r.data.data) || [];
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

/* Priority 2 — live builder projects + staff tasks (guarded containers).
   My Projects shows the logged-in builder's own projects; staff tasks
   show tasks visible to the logged-in user. Demo rows stay untouched
   below; these live lists are the real data. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function card(title, meta) {
    var c = document.createElement('div');
    c.className = 'card';
    c.setAttribute('style', 'padding:12px;margin:10px 0');
    var t = document.createElement('strong');
    t.textContent = title;
    c.appendChild(t);
    var p = document.createElement('p');
    p.textContent = meta;
    c.appendChild(p);
    return c;
  }
  var proj = document.getElementById('pp-builder-projects');
  if (proj) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { proj.textContent = 'Apne projects dekhne ke liye login karein.'; return; }
      window.PP.listBuilderProjects('mine=1&limit=100').then(function (r) {
        proj.textContent = '';
        if (!r.ok) { proj.textContent = 'Projects load nahi ho pa rahe hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Your Projects (live): ' + items.length;
        proj.appendChild(h);
        if (!items.length) { proj.appendChild(document.createTextNode('No projects yet.')); return; }
        items.forEach(function (p) {
          proj.appendChild(card(p.name, (p.city || '') + ' • ' + (p.project_type || '') + ' • Status: ' + p.status + ' • Units: ' + ((p.unit_counts && p.unit_counts.total) || 0)));
        });
      });
    });
  }
  var tasks = document.getElementById('pp-staff-tasks');
  if (tasks) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { tasks.textContent = 'Tasks dekhne ke liye login karein.'; return; }
      window.PP.listTasks('limit=100').then(function (r) {
        tasks.textContent = '';
        if (!r.ok) { tasks.textContent = 'Tasks load nahi ho pa rahi hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Your Tasks (live): ' + items.length;
        tasks.appendChild(h);
        if (!items.length) { tasks.appendChild(document.createTextNode('No tasks assigned to you.')); return; }
        items.forEach(function (t) {
          tasks.appendChild(card(t.title, 'Status: ' + t.status + ' • Priority: ' + t.priority + (t.due_date ? ' • Due: ' + t.due_date : '')));
        });
      });
    });
  }
});
