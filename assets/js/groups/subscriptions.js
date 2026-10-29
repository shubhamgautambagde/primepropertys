/* PrimePropertys — section behaviour: subscriptions (runs after the shared
   bundle; guards optional elements; do not edit pages directly, edit this
   file and run tools/build.py).
   Priority 2: plan prices are the public prices on pricing.html; a paid
   subscription stays pending until staff activate it against a verified
   payment — this page never claims a payment happened. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function inrPaise(p) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((p || 0) / 100); }
    catch (e) { return 'Rs ' + ((p || 0) / 100); }
  }
  var plans = document.getElementById('pp-subscription-plans');
  if (plans) {
    window.PP.listPlans().then(function (r) {
      plans.textContent = '';
      if (!r.ok) { plans.textContent = 'Plans load nahi ho pa rahe hain.'; return; }
      var items = (r.data && r.data.data) || [];
      var h = document.createElement('h3');
      h.textContent = 'Subscription Plans (live, pricing.html prices): ' + items.length;
      plans.appendChild(h);
      items.forEach(function (p) {
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('style', 'padding:12px;margin:10px 0');
        var t = document.createElement('strong');
        t.textContent = p.name + ' — ' + inrPaise(p.price_paise) + '/month';
        card.appendChild(t);
        var meta = document.createElement('p');
        meta.textContent = 'Listings: ' + (p.listing_limit === null ? 'Unlimited' : p.listing_limit) +
          ' • Photos per listing: ' + (p.photos_per_listing === null ? '-' : p.photos_per_listing) +
          ' • Featured credits: ' + p.featured_credits;
        card.appendChild(meta);
        plans.appendChild(card);
      });
    });
  }
  var mine = document.getElementById('pp-my-subscription');
  if (mine) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { mine.textContent = 'Apni subscription dekhne ke liye login karein.'; return; }
      window.PP.mySubscriptions().then(function (r) {
        mine.textContent = '';
        if (!r.ok) { mine.textContent = 'Subscription load nahi ho pa rahi hai.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Your Subscriptions (live): ' + items.length;
        mine.appendChild(h);
        if (!items.length) { mine.appendChild(document.createTextNode('No subscription yet.')); return; }
        items.forEach(function (s) {
          var card = document.createElement('div');
          card.className = 'card';
          card.setAttribute('style', 'padding:12px;margin:10px 0');
          var t = document.createElement('strong');
          t.textContent = s.plan_name + ' (' + s.billing_period + ') — ' + (s.effective_status || s.status);
          card.appendChild(t);
          var p = document.createElement('p');
          p.textContent = (s.starts_at ? 'From: ' + s.starts_at : 'Not started (pending activation)') + (s.ends_at ? ' • Until: ' + s.ends_at : '');
          card.appendChild(p);
          mine.appendChild(card);
        });
      });
      window.PP.entitlement().then(function (r) {
        if (!r.ok || !r.data) return;
        var p = document.createElement('p');
        p.textContent = 'Entitlement: listings used ' + r.data.listings_used +
          (r.data.listing_limit === null ? ' (no plan limit set)' : ' / ' + r.data.listing_limit) +
          ' • Featured remaining: ' + r.data.featured_remaining;
        mine.appendChild(p);
      });
    });
  }
});
