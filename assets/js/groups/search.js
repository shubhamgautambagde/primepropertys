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
  /* Priority 1: bedrooms / possession / area / locality filters are
     now server-side (see listProperties in server/src/server.js), so
     the API total is the filtered total and pagination is correct.
     Previously these were client-side over at most 100 rows. */
  var apiParams = { limit: 20 };
  ['city', 'locality', 'property_type', 'listing_type', 'min_price', 'max_price',
   'bedrooms', 'bedrooms_min', 'area_min', 'area_max', 'possession_status'].forEach(function (k) {
    if (urlParams.get(k)) apiParams[k] = urlParams.get(k);
  });
  var hasFilter = Object.keys(apiParams).some(function (k) { return k !== 'limit'; });
  window.PP.listProperties(apiParams).then(function (r) {
    if (!r.ok) {
      if (notice) { notice.textContent = 'Live listings load nahi ho pa rahi hain — ye page demo preview dikh raha hai.'; notice.style.color = '#f87171'; }
      return;
    }
    var items = (r.data && r.data.data) || [];
    var total = (r.data && r.data.pagination && r.data.pagination.total) || 0;
    if (!items.length) {
      if (notice) { notice.textContent = hasFilter ? 'Is filter se koi published property nahi mili.' : 'Abhi koi published property nahi hai.'; notice.style.color = '#94a3b8'; }
      return;
    }
    var lead = document.querySelector('p.lead');
    if (lead) lead.textContent = (hasFilter ? total + ' properties match your filters (live data).' : total + ' published properties (live data).');
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
      a.setAttribute('href', '../property-engine/property-details.html?property_id=' + p.id);
      a.textContent = 'View Details →';
      pl.appendChild(a);
      pl.appendChild(document.createTextNode(' · '));
      var a2 = document.createElement('a');
      a2.setAttribute('href', '../property-engine/make-enquiry.html?property_id=' + p.id);
      a2.textContent = 'Enquire →';
      pl.appendChild(a2);
      card.appendChild(pl);
      grid.appendChild(card);
    });
  });
});

/* Priority 3 — saved searches/alerts + recommendations (guarded by
   #pp-saved-searches / #pp-recommendations). Values come from the API
   only; demo cards below stay demo and are never presented as live. */
document.addEventListener('DOMContentLoaded', function () {
  function text(tag, str) {
    var el = document.createElement(tag);
    el.textContent = str == null ? '' : String(str);
    return el;
  }
  var savedBox = document.getElementById('pp-saved-searches');
  if (savedBox && window.PP && window.PP.get) {
    savedBox.textContent = 'Loading your saved searches…';
    window.PP.get('/api/saved-searches').then(function (r) {
      savedBox.textContent = '';
      if (!r.ok || !r.data) {
        savedBox.textContent = 'Saved searches load nahi ho pa rahi hain (login chahiye).';
        return;
      }
      var rows = r.data.data || [];
      savedBox.appendChild(text('h3', 'Your saved searches (live)'));
      if (!rows.length) savedBox.appendChild(text('p', 'Koi saved search nahi hai.'));
      rows.forEach(function (s) {
        savedBox.appendChild(text('p', (s.name || 'Unnamed') + ' — ' + (s.filters_json || '{}') + (s.notify_in_app ? ' · in-app alerts on' : ' · alerts off')));
      });
      return window.PP.get('/api/search-alerts');
    }).then(function (r) {
      if (!r || !r.ok || !r.data) return;
      savedBox.appendChild(text('h3', 'Search alerts (in-app only)'));
      var rows = r.data.data || [];
      if (!rows.length) savedBox.appendChild(text('p', 'Koi alert nahi hai. Email/SMS delivery configure nahi hai, isliye alerts sirf in-app milte hain.'));
      rows.forEach(function (a) {
        savedBox.appendChild(text('p', (a.title || '') + ' — ' + (a.city || '') + ' · ₹' + (a.price_inr || '')));
      });
    });
  }
  var recBox = document.getElementById('pp-recommendations');
  if (recBox && window.PP && window.PP.get) {
    var params = new URLSearchParams(window.location.search);
    var id = parseInt(params.get('property_id') || '', 10);
    if (!id || id <= 0) {
      recBox.textContent = 'Recommendations dekhne ke liye kisi property par View Details dabayein (?property_id= ke saath).';
      return;
    }
    recBox.textContent = 'Loading recommendations…';
    window.PP.get('/api/properties/' + id + '/recommendations').then(function (r) {
      recBox.textContent = '';
      if (!r.ok || !r.data) {
        recBox.textContent = 'Recommendations load nahi ho pa rahi hain.';
        return;
      }
      var rows = r.data.data || [];
      if (!rows.length) recBox.appendChild(text('p', 'Is property ke liye koi matching recommendation nahi mili.'));
      rows.forEach(function (p) {
        var card = document.createElement('div');
        card.className = 'card';
        card.appendChild(text('h3', p.title || ''));
        card.appendChild(text('p', (p.city || '') + ' · ₹' + (p.price_inr || '') + ' · Matching attributes: ' + (p.match_attributes || 0) + ' (' + (p.match_reasons || []).join(', ') + ')'));
        var a = document.createElement('a');
        a.setAttribute('href', '../property-engine/property-details.html?property_id=' + p.id);
        a.textContent = 'View Details →';
        card.appendChild(a);
        recBox.appendChild(card);
      });
      recBox.appendChild(text('p', 'Ranked by matching attributes only — ye koi measured similarity score nahi hai.'));
    });
  }
});
