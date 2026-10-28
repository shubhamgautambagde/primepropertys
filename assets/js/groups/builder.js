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
