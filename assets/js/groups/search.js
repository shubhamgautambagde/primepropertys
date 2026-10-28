/* PrimePropertys — section behaviour: search (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
document.querySelectorAll('.js-remove').forEach(function(b){b.addEventListener('click',function(){var c=b.closest('.prop-row, .card, tr'); if(c) c.remove();});});
document.querySelectorAll('.alert-toggle').forEach(function(b){b.addEventListener('click',function(){b.textContent = b.textContent.indexOf('On')!==-1 ? 'Alerts: Off' : 'Alerts: On'; b.classList.toggle('outline');});});

/* Stage H, Phase 2 — live listings on search-results.html only (guarded by
   #pp-live-results). When the API answers, real published properties
   replace nothing fake: the demo lead text is updated to the real total
   and live cards are rendered. When the API is unreachable, the demo
   content stays untouched and an honest notice is shown. When the API
   answers with zero properties, an honest empty message is shown. */
document.addEventListener('DOMContentLoaded', function () {
  var grid = document.getElementById('pp-live-results');
  if (!grid || !window.PP || !window.PP.listProperties) return;
  var notice = document.getElementById('pp-live-notice');
  function inr(n) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n); }
    catch (e) { return 'Rs ' + n; }
  }
  function text(tag, str, style) {
    var el = document.createElement(tag);
    el.textContent = str == null ? '' : String(str);
    if (style) el.setAttribute('style', style);
    return el;
  }
  window.PP.listProperties({ limit: 20 }).then(function (r) {
    if (!r.ok) {
      if (notice) { notice.textContent = 'Live listings load nahi ho pa rahi hain — ye page demo preview dikh raha hai.'; notice.style.color = '#f87171'; }
      return;
    }
    var items = (r.data && r.data.data) || [];
    var total = (r.data && r.data.pagination && r.data.pagination.total) || 0;
    if (!items.length) {
      if (notice) { notice.textContent = 'Abhi koi published property nahi hai.'; notice.style.color = '#94a3b8'; }
      return;
    }
    var lead = document.querySelector('p.lead');
    if (lead) lead.textContent = total + ' published properties (live data).';
    items.forEach(function (p) {
      if (!Number.isInteger(p.id)) return;
      var specs = [];
      if (p.bedrooms) specs.push(p.bedrooms + ' BHK');
      if (p.bathrooms) specs.push(p.bathrooms + ' bath');
      if (p.area_sqft) specs.push(p.area_sqft + ' sqft');
      var card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('style', 'padding:16px');
      card.appendChild(text('h3', p.title, 'margin-top:0'));
      card.appendChild(text('p', p.property_type + ' • ' + p.city + (p.locality ? ', ' + p.locality : '')));
      if (specs.length) card.appendChild(text('p', specs.join(' • ')));
      var price = document.createElement('p');
      var strong = document.createElement('strong');
      strong.textContent = inr(p.price_inr);
      price.appendChild(strong);
      price.appendChild(document.createTextNode(' (' + p.listing_type + ')'));
      card.appendChild(price);
      var pl = document.createElement('p');
      var a = document.createElement('a');
      a.setAttribute('href', '../property-engine/make-enquiry.html?property_id=' + p.id);
      a.textContent = 'Enquire →';
      pl.appendChild(a);
      card.appendChild(pl);
      grid.appendChild(card);
    });
  });
});
