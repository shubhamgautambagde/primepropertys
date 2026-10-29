/* PrimePropertys — section behaviour: engine (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
document.querySelectorAll('.gallery-filter').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.gallery-filter').forEach(function(x){x.classList.remove('active')});b.classList.add('active');var c=b.getAttribute('data-cat');document.querySelectorAll('.gallery-item').forEach(function(el){el.style.display=(!c||el.getAttribute('data-cat')===c)?'':'none'})})});
var copyBtn=document.getElementById('copyLink');if(copyBtn){copyBtn.addEventListener('click',function(){var t=document.getElementById('shareLink');if(t){t.select();try{document.execCommand('copy')}catch(e){}}var m=document.getElementById('copyMsg');if(m){m.classList.add('show')}})};

/* Priority 1 — live property detail (guarded by #pp-live-detail, only on
   property-details.html). Renders GET /api/properties/:id when
   ?property_id= is present. Published listings are public; a draft is
   visible only to its owner or a properties:view_any holder when logged
   in — everyone else gets 404 from the API, and this page says so
   instead of inventing a listing. When no id is given, or the fetch
   fails, the demo preview below stays visible and the notice says
   plainly that it is not the requested listing. */
document.addEventListener('DOMContentLoaded', function () {
  var box = document.getElementById('pp-live-detail');
  if (!box || !window.PP || !window.PP.getProperty) return;
  var notice = document.getElementById('pp-live-detail-notice');
  var body = document.getElementById('pp-live-detail-body');
  var params = new URLSearchParams(window.location.search);
  var id = parseInt(params.get('property_id') || '', 10);
  if (!id || id <= 0) {
    if (notice) notice.textContent = 'Koi property chuni nahi gayi — search results se kisi listing par View Details dabayein (?property_id= ke saath). Neeche demo preview hai, koi real listing nahi.';
    return;
  }
  function inr(n) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n); }
    catch (e) { return 'Rs ' + n; }
  }
  function text(tag, str) {
    var el = document.createElement(tag);
    el.textContent = str == null ? '' : String(str);
    return el;
  }
  window.PP.getProperty(id).then(function (r) {
    if (!r.ok || !r.data) {
      if (notice) notice.textContent = 'Property not found (404). Draft ya unpublished listing public nahi hoti — sirf uska owner (login karke) ya properties:view_any wala user use dekh sakta hai. Neeche demo preview hai, requested listing nahi.';
      return;
    }
    var d = r.data;
    if (notice) notice.textContent = d.status === 'published'
      ? 'Live property (database se):'
      : 'Ye listing abhi public nahi hai (status: ' + d.status + ') — aap ise isliye dekh pa rahe hain kyunki aap owner hain ya view permission rakhte hain.';
    if (body) {
      body.textContent = '';
      body.appendChild(text('h2', d.title));
      body.appendChild(text('p', (d.property_type || '') + ' • ' + (d.listing_type || '') + ' • ' + (d.city || '') + (d.locality ? ', ' + d.locality : '')));
      var price = document.createElement('p');
      var strong = document.createElement('strong');
      strong.textContent = inr(d.price_inr || 0);
      price.appendChild(strong);
      body.appendChild(price);
      var specs = [];
      if (d.bedrooms !== null && d.bedrooms !== undefined) specs.push(d.bedrooms + ' BHK');
      if (d.bathrooms !== null && d.bathrooms !== undefined) specs.push(d.bathrooms + ' Bath');
      if (d.area_sqft) specs.push(d.area_sqft + ' sqft');
      if (d.facing) specs.push('Facing: ' + d.facing);
      if (d.furnishing_status) specs.push('Furnishing: ' + d.furnishing_status);
      if (d.possession_status) specs.push('Possession: ' + d.possession_status);
      if (specs.length) body.appendChild(text('p', specs.join(' • ')));
      if (d.description) body.appendChild(text('p', d.description));
      if (d.amenities) {
        try {
          var am = JSON.parse(d.amenities);
          if (am.length) body.appendChild(text('p', 'Amenities: ' + am.join(', ')));
        } catch (e) { /* ignore unparseable amenities */ }
      }
      (d.images || []).forEach(function (img) {
        if (!img || !img.url) return;
        var im = document.createElement('img');
        im.setAttribute('src', img.url);
        im.setAttribute('alt', img.alt_text || d.title || 'Property photo');
        im.setAttribute('style', 'max-width:100%;margin:8px 0');
        body.appendChild(im);
      });
      var pl = document.createElement('p');
      var a = document.createElement('a');
      a.setAttribute('href', 'make-enquiry.html?property_id=' + d.id);
      a.textContent = 'Make Enquiry →';
      pl.appendChild(a);
      body.appendChild(pl);
    }
    try { document.title = (d.title || 'Property') + ' — PrimePropertys'; } catch (e) { /* ignore */ }
    // Hide the demo preview siblings so the live listing is the page,
    // not a second (fake) listing underneath it.
    try {
      var parent = box.parentElement;
      if (parent) Array.prototype.forEach.call(parent.children, function (child) {
        if (child !== box) child.style.display = 'none';
      });
    } catch (e) { /* demo stays visible if hiding fails */ }
  });
});

/* Priority 2 — approved property reviews (guarded by #pp-property-reviews,
   only when ?property_id= is present). Only APPROVED reviews render;
   pending reviews are moderator-only and never appear here. */
document.addEventListener('DOMContentLoaded', function () {
  var box = document.getElementById('pp-property-reviews');
  if (!box || !window.PP || !window.PP.listReviews) return;
  var params = new URLSearchParams(window.location.search);
  var id = parseInt(params.get('property_id') || '', 10);
  if (!id || id <= 0) { box.textContent = 'Reviews dekhne ke liye kisi property par View Details dabayein (?property_id= ke saath).'; return; }
  window.PP.listReviews(id).then(function (r) {
    box.textContent = '';
    if (!r.ok || !r.data) { box.textContent = 'Reviews load nahi ho pa rahi hain.'; return; }
    var agg = r.data.aggregation || {};
    var h = document.createElement('h3');
    h.textContent = 'Reviews' + (agg.approved_count ? ' — ' + agg.approved_count + ' approved, average ' + agg.average_rating + '/5' : ' — no approved reviews yet');
    box.appendChild(h);
    var items = r.data.data || [];
    if (!items.length) { box.appendChild(document.createTextNode('No approved reviews yet. Reviews moderation ke baad yahan dikhengi.')); return; }
    items.forEach(function (rev) {
      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('style', 'padding:12px;margin:10px 0');
      var t = document.createElement('strong');
      t.textContent = (rev.rating || '') + '/5' + (rev.verified ? ' • Verified visit' : '');
      card.appendChild(t);
      var p = document.createElement('p');
      p.textContent = rev.text || '';
      card.appendChild(p);
      box.appendChild(card);
    });
  });
});

/* Priority 3 — property price history (guarded by #pp-price-history).
   Append-only history from the API: only real recorded changes appear,
   with the actor and timestamp. No history is fabricated for edits
   that predated the history table. */
document.addEventListener('DOMContentLoaded', function () {
  var box = document.getElementById('pp-price-history');
  if (!box || !window.PP || !window.PP.get) return;
  var params = new URLSearchParams(window.location.search);
  var id = parseInt(params.get('property_id') || '', 10);
  if (!id || id <= 0) {
    box.textContent = 'Price history dekhne ke liye kisi property par View Details dabayein (?property_id= ke saath).';
    return;
  }
  box.textContent = 'Loading price history…';
  window.PP.get('/api/properties/' + id + '/price-history').then(function (r) {
    box.textContent = '';
    if (!r.ok || !r.data) {
      box.textContent = 'Price history load nahi ho pa rahi hai (draft listings sirf owner ko dikhti hain).';
      return;
    }
    var h = document.createElement('h3');
    h.textContent = 'Price history (recorded changes only)';
    box.appendChild(h);
    var rows = r.data.data || [];
    if (!rows.length) {
      var p = document.createElement('p');
      p.textContent = 'Is property ke liye koi recorded price change nahi hai. Purani edits ka history banaya nahi gaya hai.';
      box.appendChild(p);
      return;
    }
    rows.forEach(function (row) {
      var p = document.createElement('p');
      p.textContent = '₹' + row.old_price_inr + ' → ₹' + row.new_price_inr + ' · ' + (row.actor_name || 'unknown') + ' · ' + (row.created_at || '');
      box.appendChild(p);
    });
  });
});
