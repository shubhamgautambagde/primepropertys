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
