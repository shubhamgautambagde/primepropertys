/* PrimePropertys — section behaviour: engine (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
document.querySelectorAll('.gallery-filter').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.gallery-filter').forEach(function(x){x.classList.remove('active')});b.classList.add('active');var c=b.getAttribute('data-cat');document.querySelectorAll('.gallery-item').forEach(function(el){el.style.display=(!c||el.getAttribute('data-cat')===c)?'':'none'})})});
var copyBtn=document.getElementById('copyLink');if(copyBtn){copyBtn.addEventListener('click',function(){var t=document.getElementById('shareLink');if(t){t.select();try{document.execCommand('copy')}catch(e){}}var m=document.getElementById('copyMsg');if(m){m.classList.add('show')}})};

/* Detail slice — live property detail rendering on
   property-details.html only (guarded by #pp-live-property).
   Reads ?property_id= (or ?id=), fetches the real record, and
   renders it above the demo content, which stays untouched below.
   No record = honest notice, never demo data presented as the
   property. Action links (Contact Owner/Agent, Make Enquiry,
   Request Callback, Request Site Visit) gain the property_id so
   the already-wired enquiry flows open with context. The Report
   link is left alone: reports are tickets without a property
   link, and appending an id would imply otherwise. Save uses the
   existing POST/DELETE /api/properties/:id/save endpoints. */
document.addEventListener('DOMContentLoaded', function () {
  var box = document.getElementById('pp-live-property');
  if (!box || !window.PP || !window.PP.getProperty) return;
  var notice = document.getElementById('pp-live-property-notice');
  var body = document.getElementById('pp-live-property-body');
  var params = new URLSearchParams(window.location.search);
  var id = parseInt(params.get('property_id') || params.get('id') || '', 10);
  if (!id || id <= 0) {
    notice.textContent = 'Koi property select nahi hui — search results ya saved list se kisi property ke View Details par click karke aayein.';
    return;
  }
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
  ['contact-owner.html', 'contact-agent.html', 'make-enquiry.html', 'request-callback.html', 'request-site-visit.html'].forEach(function (page) {
    document.querySelectorAll('a[href="' + page + '"]').forEach(function (a) {
      a.setAttribute('href', page + '?property_id=' + id);
    });
  });
  window.PP.getProperty(id).then(function (r) {
    if (!r.ok || !r.data) {
      notice.textContent = 'Ye property nahi mili ya abhi publish nahi hui hai.';
      notice.style.color = '#f87171';
      return;
    }
    var p = r.data;
    notice.textContent = 'Live data — neeche demo preview hai, ye record asli hai.';
    var specs = [];
    if (p.bedrooms) specs.push(p.bedrooms + ' BHK');
    if (p.bathrooms) specs.push(p.bathrooms + ' bath');
    if (p.area_sqft) specs.push(p.area_sqft + ' sqft');
    if (p.facing) specs.push('Facing: ' + p.facing);
    if (p.furnishing_status) specs.push(p.furnishing_status);
    if (p.possession_status) specs.push(p.possession_status);
    body.appendChild(text('h3', p.title, 'margin-top:0'));
    body.appendChild(text('p', p.property_type + ' • ' + p.city + (p.locality ? ', ' + p.locality : '') + ' • ' + p.listing_type));
    if (specs.length) body.appendChild(text('p', specs.join(' • ')));
    var price = document.createElement('p');
    var strong = document.createElement('strong');
    strong.textContent = inr(p.price_inr);
    price.appendChild(strong);
    price.appendChild(document.createTextNode(' • Status: ' + p.status));
    body.appendChild(price);
    if (p.description) body.appendChild(text('p', p.description));
    var amenities = null;
    try { amenities = p.amenities ? JSON.parse(p.amenities) : null; } catch (e) { amenities = null; }
    if (amenities && amenities.length) body.appendChild(text('p', 'Amenities: ' + amenities.join(', ')));
    if (p.images && p.images.length) {
      p.images.forEach(function (img) {
        if (!img.url) return;
        var im = document.createElement('img');
        im.setAttribute('src', img.url);
        im.setAttribute('alt', img.alt_text || p.title || 'Property image');
        im.setAttribute('style', 'max-width:100%;margin:8px 0');
        body.appendChild(im);
      });
    }
    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn outline';
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save Property';
    var saveNote = document.createElement('p');
    saveBtn.addEventListener('click', function () {
      window.PP.post('/api/properties/' + id + '/save', {}).then(function (rr) {
        if (rr.ok) { saveBtn.textContent = 'Saved ✓'; saveNote.textContent = 'Saved properties me add ho gaya.'; }
        else saveNote.textContent = (rr.error && rr.error.message) || 'Save nahi ho pa raha hai. (Save ke liye login zaroori hai.)';
      });
    });
    body.appendChild(saveBtn);
    body.appendChild(saveNote);
  });
});
