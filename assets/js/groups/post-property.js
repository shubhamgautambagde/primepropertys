/* PrimePropertys — section behaviour: post-property wizard (runs
   after the shared bundle; guards optional elements; do not edit
   pages directly, edit this file and run tools/build.py).
   How the draft works (read before changing it):
   - Steps before the description step have no server draft yet:
     the create call needs title + property_type + listing_type +
     price + city, and those only all exist once the description
     step is reached. Those steps keep answers in sessionStorage
     (key pp-wizard) and a notice says so; nothing claims a server
     save before the draft exists.
   - The description step creates the draft (POST /api/properties)
     from the accumulated answers + its own title/description,
     stores the id (sessionStorage pp-wizard-draft + ?draft_id=),
     and every later step PATCHes that draft.
   - Drafts stay drafts: publishing needs properties:publish_any
     (admin approval). The submit step never claims a publish.
   - Binary upload (photos, floor plans, documents) is not
     implemented: those steps save nothing and say so. Images can
     be added later as URLs from Edit Property.
   - Choice cards carry data-choice-key / data-choice-value (added
     in the page markup) and now carry the user's actual choice:
     Lease, PG, Office, Shop and Warehouse are NOT silently remapped
     to rent/Commercial any more. The server enum (validate.js, plus
     the CHECK constraint in migration 001) does not include them, so
     a draft create with one of those values fails with an explicit
     error naming the unsupported choice, and no draft is created
     under a different type (Priority 1 decision — extending the enum
     would need a properties-table rebuild, which is a product
     decision, not a silent repair). Category (residential /
     commercial / land / project) IS persisted on the draft since
     migration 019. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  var SESSION_KEY = 'pp-wizard';
  var DRAFT_KEY = 'pp-wizard-draft';
  var WIZARD_ORDER = ['post-property-start.html', 'select-purpose.html', 'select-property-category.html',
    'select-property-type.html', 'property-location.html', 'property-basic-details.html',
    'property-area-details.html', 'property-area-details2.html', 'property-pricing.html',
    'amenities.html', 'property-description.html', 'property-photos.html', 'property-photos2.html',
    'property-video.html', 'property-video2.html', 'floor-plan-upload.html', 'floor-plan-upload2.html',
    '360-upload.html', 'property-documents.html', 'owner-details.html', 'contact-preferences.html',
    'listing-preview.html', 'listing-quality-score.html', 'duplicate-check.html',
    'verification.html', 'submit-property.html', 'submission-success.html'];
  function inr(paise) {
    if (paise === null || paise === undefined) return '—';
    return 'Rs ' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function inrInt(rupees) {
    if (rupees === null || rupees === undefined) return '—';
    return 'Rs ' + Number(rupees).toLocaleString('en-IN');
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('en-IN'); } catch (e) { return s || ''; }
  }
  function loadSession() {
    try { return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveSession(obj) {
    try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj)); } catch (e) { /* private mode */ }
  }
  function draftId() {
    var params = new URLSearchParams(window.location.search);
    var id = parseInt(params.get('draft_id') || params.get('property_id') || '', 10);
    if (id && id > 0) return id;
    var stored = parseInt(window.sessionStorage.getItem(DRAFT_KEY) || '', 10);
    return stored && stored > 0 ? stored : 0;
  }
  function setDraftId(id) {
    try { window.sessionStorage.setItem(DRAFT_KEY, String(id)); } catch (e) { /* private mode */ }
  }
  function withDraft(href) {
    var id = draftId();
    if (!id) return href;
    if (href.indexOf('?') !== -1) return href;
    return href + '?draft_id=' + id;
  }
  function noteBox(form, text, isError) {
    var msg = form.querySelector('.form-success') || form.parentElement.querySelector('.form-success');
    if (msg) {
      msg.classList.add('show');
      msg.textContent = text;
      return;
    }
    var p = document.createElement('p');
    p.textContent = text;
    form.parentElement.insertBefore(p, form.nextSibling);
  }
  function showFormNote(form, text, isError) {
    noteBox(form, text, isError);
  }
  function collectFields(form) {
    var out = {};
    form.querySelectorAll('[data-api-field]').forEach(function (el) {
      var k = el.getAttribute('data-api-field');
      if (el.type === 'checkbox') out[k] = el.checked ? 1 : 0;
      else if (el.type === 'radio') { if (el.checked) out[k] = el.value; }
      else out[k] = (el.value || '').trim();
    });
    form.querySelectorAll('[data-amenity]').forEach(function (el) {
      if (el.checked) {
        out.amenities = out.amenities || [];
        out.amenities.push(el.getAttribute('data-amenity'));
      }
    });
    // Radio groups by name (corner/gated/lift/park): Yes -> 1, No -> 0.
    ['corner', 'gated', 'lift', 'park'].forEach(function (name) {
      var checked = form.querySelector('input[type="radio"][name="' + name + '"]:checked');
      if (checked) {
        var map = { corner: 'is_corner', gated: 'is_gated', lift: 'has_lift', park: 'has_reserved_parking' };
        out[map[name]] = (checked.parentElement.textContent || '').trim().toLowerCase().indexOf('yes') === 0 ? 1 : 0;
      }
    });
    // Numbers: blank -> absent, otherwise integer (invalid -> error marker).
    var intFields = ['price_inr', 'area_sqft', 'bedrooms', 'bathrooms', 'floor_number', 'total_floors',
      'balconies', 'servant_room', 'open_parking', 'covered_parking', 'builtup_area_sqft',
      'carpet_area_sqft', 'plot_area_sqft', 'super_builtup_area_sqft', 'terrace_area_sqft',
      'garden_area_sqft', 'price_per_sqft_inr', 'maintenance_monthly_inr'];
    intFields.forEach(function (k) {
      if (out[k] === undefined || out[k] === '') { delete out[k]; return; }
      var n = parseInt(String(out[k]).replace(/[^0-9-]/g, ''), 10);
      if (isNaN(n)) out['__bad_' + k] = true;
      else out[k] = n;
    });
    return out;
  }
  function cleanForApi(fields) {
    var out = {};
    Object.keys(fields).forEach(function (k) {
      if (k.indexOf('__bad_') === 0) return;
      if (fields[k] === '' || fields[k] === undefined || fields[k] === null) return;
      out[k] = fields[k];
    });
    return out;
  }
  function currentPage() {
    return window.location.pathname.split('/').pop() || '';
  }
  // --- Choice cards: click selects, stores the choice. ---
  var choices = document.querySelectorAll('.choice[data-choice-key]');
  function saveChoice(card) {
    var session = loadSession();
    session[card.getAttribute('data-choice-key')] = card.getAttribute('data-choice-value');
    saveSession(session);
  }
  window.PP.wizardSaveChoice = saveChoice;
  choices.forEach(function (card) {
    card.addEventListener('click', function () {
      choices.forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      saveChoice(card);
    });
  });
  // --- Link rewriting: carry ?draft_id= across wizard pages. ---
  (function rewriteLinks() {
    var id = draftId();
    if (!id) return;
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.indexOf('?') !== -1 || href.indexOf('#') === 0 || href.indexOf('://') !== -1) return;
      var file = href.split('/').pop();
      if (WIZARD_ORDER.indexOf(file) !== -1) a.setAttribute('href', href + '?draft_id=' + id);
    });
  })();
  // --- Pre-draft honesty notice on step pages. ---
  var stepForm = document.querySelector('form[data-api="wizard-step"]');
  if (stepForm && !draftId()) {
    var h1 = document.querySelector('h1');
    if (h1) {
      var p = document.createElement('p');
      p.textContent = 'Abhi tak ke jawab isi browser me save hain — server par draft description step par banega, jab title, price, city aur property type sab mil jayenge.';
      h1.parentElement.insertBefore(p, h1.nextSibling);
    }
  }
  // --- Prefill step forms from the session (pre-draft) or the draft. ---
  if (stepForm) {
    var session = loadSession();
    var id = draftId();
    function fill(values) {
      stepForm.querySelectorAll('[data-api-field]').forEach(function (el) {
        var k = el.getAttribute('data-api-field');
        if (values[k] === undefined || values[k] === null) return;
        if (el.type === 'checkbox') el.checked = !!values[k];
        else el.value = values[k];
      });
      stepForm.querySelectorAll('[data-amenity]').forEach(function (el) {
        var list = values.amenities || [];
        el.checked = list.indexOf(el.getAttribute('data-amenity')) !== -1;
      });
    }
    if (id) {
      window.PP.me().then(function (m) {
        if (!m.ok || !m.data || !m.data.user) return;
        window.PP.get('/api/properties/' + id).then(function (r) {
          if (r.ok && r.data) {
            var d = r.data.data || r.data;
            var vals = {};
            Object.keys(d).forEach(function (k) { if (d[k] !== null) vals[k] = d[k]; });
            try { vals.amenities = d.amenities ? JSON.parse(d.amenities) : []; } catch (e) { vals.amenities = []; }
            fill(vals);
          }
        });
      });
    } else {
      fill(session);
    }
  }
  // --- Core save: called by forms.js (Enter-submit) and by Continue links. ---
  function saveStep(form, navigateTo, done) {
    var step = form.getAttribute('data-step') || '';
    var fields = cleanForApi(collectFields(form));
    var bad = Object.keys(collectFields(form)).filter(function (k) { return k.indexOf('__bad_') === 0; });
    if (bad.length) {
      showFormNote(form, 'Number wale fields me sirf number bharein: ' + bad.map(function (k) { return k.replace('__bad_', ''); }).join(', ') + '.', true);
      if (done) done(false);
      return;
    }
    var id = draftId();
    if (id) {
      window.PP.me().then(function (m) {
        if (!m.ok || !m.data || !m.data.user) {
          showFormNote(form, 'Is step ke liye login zaroori hai. Login karke dobara aayein.', true);
          if (done) done(false);
          return;
        }
        window.PP.request('/api/properties/' + id, { method: 'PATCH', body: fields }).then(function (r) {
          if (!r.ok) {
            showFormNote(form, (r.error && r.error.message) || 'Step save nahi ho pa raha hai.', true);
            if (done) done(false);
            return;
          }
          if (navigateTo) window.location.href = withDraft(navigateTo);
          else showFormNote(form, 'Step saved (draft ' + id + ').');
          if (done) done(true);
        });
      });
      return;
    }
    // Pre-draft: keep answers in the session.
    var merged = loadSession();
    Object.keys(fields).forEach(function (k) { merged[k] = fields[k]; });
    saveSession(merged);
    if (step === 'description') {
      // First point where every required create field can exist.
      var missing = [];
      if (!merged.listing_type) missing.push('purpose (Sell/Rent/Lease)');
      if (!merged.property_type) missing.push('property type');
      if (!merged.title) missing.push('title');
      if (!merged.price_inr) missing.push('price');
      if (!merged.city) missing.push('city');
      if (missing.length) {
        showFormNote(form, 'Draft abhi nahi ban sakta — ye steps adhoore hain: ' + missing.join(', ') + '. Pehle un steps par wapas jakar bharein.', true);
        if (done) done(false);
        return;
      }
      window.PP.me().then(function (m) {
        if (!m.ok || !m.data || !m.data.user) {
          showFormNote(form, 'Draft banane ke liye login zaroori hai. Login karke dobara aayein.', true);
          if (done) done(false);
          return;
        }
        window.PP.post('/api/properties', merged).then(function (r) {
          if (!r.ok) {
            showFormNote(form, (r.error && r.error.message) || 'Draft nahi ban pa raha hai.', true);
            if (done) done(false);
            return;
          }
          var newId = r.data && (r.data.id || (r.data.data && r.data.data.id));
          if (!newId) {
            showFormNote(form, 'Draft bana par uska id nahi mila — dobara try karein.', true);
            if (done) done(false);
            return;
          }
          setDraftId(newId);
          if (navigateTo) window.location.href = navigateTo + (navigateTo.indexOf('?') !== -1 ? '' : '?draft_id=' + newId);
          else showFormNote(form, 'Draft ban gaya (ID ' + newId + ').');
          if (done) done(true);
        });
      });
      return;
    }
    if (navigateTo) window.location.href = navigateTo;
    else showFormNote(form, 'Jawab browser me save ho gaya (draft abhi server par nahi bana hai).');
    if (done) done(true);
  }
  window.PP.wizardSaveStep = function (form) { saveStep(form, null, null); };
  // Continue links on step pages: save first, then navigate.
  if (stepForm || choices.length) {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var text = (a.textContent || '').trim();
      if (text.indexOf('Continue') !== 0) return;
      var href = a.getAttribute('href');
      if (!href) return;
      a.addEventListener('click', function (e) {
        if (!stepForm && !choices.length) return;
        e.preventDefault();
        if (!stepForm) { window.location.href = href; return; }
        saveStep(stepForm, href, function (ok) {
          if (!ok) { /* error note already shown; stay on the page */ }
        });
      });
    });
  }
  // --- Edit property (Save Changes button). ---
  window.PP.wizardSaveEdit = function (form) {
    var params = new URLSearchParams(window.location.search);
    var pid = parseInt(params.get('property_id') || params.get('draft_id') || '', 10);
    if (!pid || pid <= 0) {
      showFormNote(form, 'Koi listing chuni nahi gayi. My Listings se kisi listing par Edit dabayein.', true);
      return;
    }
    var fields = cleanForApi(collectFields(form));
    var statusSelect = fields.status_select;
    delete fields.status_select;
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) {
        showFormNote(form, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', true);
        return;
      }
      window.PP.request('/api/properties/' + pid, { method: 'PATCH', body: fields }).then(function (r) {
        if (!r.ok) {
          showFormNote(form, (r.error && r.error.message) || 'Listing update nahi ho pa rahi hai.', true);
          return;
        }
        var current = (r.data && r.data.data && r.data.data.status) || (r.data && r.data.status) || '';
        var target = null;
        if (statusSelect === 'Live') target = 'publish';
        else if (statusSelect === 'Paused' || statusSelect === 'Under Review') target = 'unpublish';
        if (!target) {
          showFormNote(form, 'Listing updated (title, price, description saved; availability is not stored as a field).');
          return;
        }
        window.PP.post('/api/properties/' + pid + '/' + target, {}).then(function (r2) {
          if (!r2.ok) {
            showFormNote(form, 'Listing updated, par status change nahi ho pa raha hai: ' + ((r2.error && r2.error.message) || 'unknown') + ' (publish ke liye admin approval chahiye).', true);
            return;
          }
          showFormNote(form, 'Listing updated aur status ' + (target === 'publish' ? 'Live' : 'draft') + ' kar diya gaya (availability is not stored as a field).');
        });
      });
    });
  };
  // Edit-page prefill.
  var editForm = document.querySelector('form[data-api="wizard-edit"]');
  if (editForm) {
    var eparams = new URLSearchParams(window.location.search);
    var epid = parseInt(eparams.get('property_id') || eparams.get('draft_id') || '', 10);
    if (epid && epid > 0) {
      window.PP.me().then(function (m) {
        if (!m.ok || !m.data || !m.data.user) return;
        window.PP.get('/api/properties/' + epid).then(function (r) {
          if (!r.ok || !r.data) return;
          var d = r.data.data || r.data;
          editForm.querySelectorAll('[data-api-field]').forEach(function (el) {
            var k = el.getAttribute('data-api-field');
            if (k === 'status_select') return;
            if (d[k] !== undefined && d[k] !== null) el.value = d[k];
          });
        });
      });
    }
  }
  // --- Verification (OTP has no provider): honest note, then submit step. ---
  window.PP.wizardVerify = function (form) {
    var confirm = form.querySelector('[data-api-field="confirm_terms"]') || document.querySelector('[data-api-field="confirm_terms"]');
    if (confirm && !confirm.checked) {
      showFormNote(form, 'Aage badhne ke liye confirmation checkbox tick karein.', true);
      return;
    }
    var id = draftId();
    showFormNote(form, 'OTP verify nahi hua — koi OTP provider configure nahi hai. Draft review ke liye aage badh raha hai (publish ke liye admin approval chahiye).');
    setTimeout(function () {
      window.location.href = withDraft('submit-property.html');
    }, 1200);
    if (!id) showFormNote(form, 'Koi draft nahi mila — pehle description step par draft banayein.', true);
  };
  // --- Submit: terms required; draft stays draft (review). ---
  window.PP.wizardSubmitProperty = function (form) {
    // The terms checkbox sits outside the submit form in the markup.
    var terms = form.querySelector('[data-api-field="terms"]') || document.querySelector('[data-api-field="terms"]');
    if (terms && !terms.checked) {
      showFormNote(form, 'Submit karne ke liye Terms & Conditions accept karein.', true);
      return;
    }
    var id = draftId();
    if (!id) {
      showFormNote(form, 'Koi draft nahi mila — pehle description step par draft banayein.', true);
      return;
    }
    showFormNote(form, 'Listing review ke liye submit ho gayi (draft ID ' + id + '). Ye abhi publish nahi hui hai — admin approval ke baad publish hogi.');
    setTimeout(function () {
      window.location.href = 'submission-success.html?draft_id=' + id;
    }, 1200);
  };
  // --- Completeness score (honest: % of scored fields filled). ---
  var SCORED = ['title', 'description', 'price_inr', 'city', 'locality', 'area_sqft', 'bedrooms',
    'bathrooms', 'property_type', 'listing_type', 'facing', 'furnishing_status', 'possession_status',
    'amenities', 'video_url', 'tour_360_url', 'owner_name', 'owner_phone', 'pincode', 'project_name'];
  function completeness(d) {
    var filled = 0;
    var missing = [];
    SCORED.forEach(function (k) {
      var v = d[k];
      var ok = v !== null && v !== undefined && v !== '' && v !== 0;
      if (k === 'amenities') { try { ok = !!v && JSON.parse(v).length > 0; } catch (e) { ok = false; } }
      if (ok) filled++;
      else missing.push(k);
    });
    return { score: Math.round((filled / SCORED.length) * 100), missing: missing };
  }
  function loadPropertyForPage() {
    var id = draftId();
    if (!id) return Promise.resolve(null);
    return window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) return null;
      return window.PP.get('/api/properties/' + id).then(function (r) {
        if (!r.ok || !r.data) return null;
        return r.data.data || r.data;
      });
    });
  }
  function host(table) {
    return table.querySelector('tbody') || table;
  }
  function clearRows(table) {
    var rows = host(table).querySelectorAll('tr');
    var start = table.querySelector('tbody') ? 0 : 1;
    for (var i = rows.length - 1; i >= start; i--) rows[i].remove();
  }
  function noticeRow(table, text, cols) {
    clearRows(table);
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', String(cols));
    td.textContent = text;
    tr.appendChild(td);
    host(table).appendChild(tr);
  }
  function row(cells) {
    var tr = document.createElement('tr');
    cells.forEach(function (c) {
      var td = document.createElement('td');
      if (typeof c === 'string') td.textContent = c;
      else td.appendChild(c);
      tr.appendChild(td);
    });
    return tr;
  }
  // Drafts table.
  var draftsTable = document.getElementById('pp-live-drafts-table');
  if (draftsTable) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { noticeRow(draftsTable, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', 4); return; }
      window.PP.get('/api/properties/mine?status=draft&limit=100').then(function (r) {
        if (!r.ok) { noticeRow(draftsTable, (r.error && r.error.message) || 'Drafts load nahi ho pa rahe hain.', 4); return; }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(draftsTable, 'No drafts yet.', 4); return; }
        clearRows(draftsTable);
        var h = host(draftsTable);
        items.forEach(function (p) {
          if (!p || !Number.isInteger(p.id)) return;
          var comp = completeness(p);
          var a = document.createElement('a');
          a.setAttribute('href', 'listing-preview.html?draft_id=' + p.id);
          a.textContent = 'Preview';
          var a2 = document.createElement('a');
          a2.setAttribute('href', 'edit-property.html?property_id=' + p.id);
          a2.textContent = 'Edit';
          var actions = document.createElement('span');
          actions.appendChild(a);
          actions.appendChild(document.createTextNode(' · '));
          actions.appendChild(a2);
          h.appendChild(row([p.title + ' — ' + (p.locality || p.city || ''), comp.score + '% complete', fmtDate(p.updated_at || p.created_at), actions]));
        });
      });
    });
  }
  // My listings table (leads counted client-side from one list call).
  var myTable = document.getElementById('pp-live-my-listings-table');
  if (myTable) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { noticeRow(myTable, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', 6); return; }
      Promise.all([
        window.PP.get('/api/properties/mine?limit=100'),
        window.PP.get('/api/leads?limit=100')
      ]).then(function (rs) {
        var r = rs[0];
        if (!r.ok) { noticeRow(myTable, (r.error && r.error.message) || 'Listings load nahi ho pa rahe hain.', 6); return; }
        var counts = {};
        if (rs[1].ok && rs[1].data && rs[1].data.data) {
          rs[1].data.data.forEach(function (l) {
            if (l && l.property_id) counts[l.property_id] = (counts[l.property_id] || 0) + 1;
          });
        }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(myTable, 'No listings yet.', 6); return; }
        clearRows(myTable);
        var h = host(myTable);
        items.forEach(function (p) {
          if (!p || !Number.isInteger(p.id)) return;
          var a = document.createElement('a');
          a.setAttribute('href', 'listing-preview.html?property_id=' + p.id);
          a.textContent = 'Preview';
          var a2 = document.createElement('a');
          a2.setAttribute('href', 'edit-property.html?property_id=' + p.id);
          a2.textContent = 'Edit';
          var actions = document.createElement('span');
          actions.appendChild(a);
          actions.appendChild(document.createTextNode(' · '));
          actions.appendChild(a2);
          // Views: the list endpoint exposes no per-property view
          // counts, so this stays a dash rather than an invented 0.
          h.appendChild(row([p.title + ' — ' + (p.locality || p.city || ''), inrInt(p.price_inr), p.status, '—', String(counts[p.id] || 0), actions]));
        });
      });
    });
  }
  // Preview / success / performance renders.
  function renderPropertyInto(boxId, make) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var notice = document.getElementById(boxId + '-notice');
    var body = document.getElementById(boxId + '-body');
    loadPropertyForPage().then(function (d) {
      if (!d) {
        if (notice) notice.textContent = 'Koi listing chuni nahi gayi. My Listings se kisi listing par Preview dabayein.';
        return;
      }
      if (body) make(d, body);
    });
  }
  renderPropertyInto('pp-live-preview', function (d, body) {
    var h = document.createElement('h3');
    h.textContent = d.title;
    body.appendChild(h);
    var meta = document.createElement('p');
    meta.textContent = (d.locality ? d.locality + ', ' : '') + d.city + ' • ' + d.property_type + ' • ' +
      (d.listing_type === 'rent' ? 'For Rent' : 'For Sale') + ' • ' + inrInt(d.price_inr) +
      ' • ' + (d.bedrooms !== null ? d.bedrooms + ' Bed' : '') + ' ' +
      (d.bathrooms !== null ? d.bathrooms + ' Bath' : '') + ' ' +
      (d.area_sqft !== null ? d.area_sqft + ' sq.ft' : '');
    body.appendChild(meta);
    if (d.description) {
      var desc = document.createElement('p');
      desc.textContent = d.description;
      body.appendChild(desc);
    }
    var extra = document.createElement('p');
    var parts = [];
    if (d.facing) parts.push('Facing: ' + d.facing);
    if (d.furnishing_status) parts.push('Furnishing: ' + d.furnishing_status);
    if (d.possession_status) parts.push('Possession: ' + d.possession_status);
    if (d.amenities) { try { var am = JSON.parse(d.amenities); if (am.length) parts.push('Amenities: ' + am.join(', ')); } catch (e) { /* ignore */ } }
    if (d.owner_name) parts.push('Owner: ' + d.owner_name);
    extra.textContent = parts.join(' • ') || ('Status: ' + d.status);
    body.appendChild(extra);
    var media = document.createElement('p');
    var imgs = (d.images && d.images.length) || 0;
    media.textContent = 'Media: ' + imgs + ' photo(s)' + (d.video_url ? ' • 1 video' : '') + (d.tour_360_url ? ' • 1 360° tour' : '');
    body.appendChild(media);
  });
  renderPropertyInto('pp-live-success', function (d, body) {
    var h = document.createElement('h3');
    h.textContent = d.title + ' — review ke liye submit ho gaya';
    body.appendChild(h);
    var p = document.createElement('p');
    p.textContent = 'Draft ID: ' + d.id + ' • Price: ' + inrInt(d.price_inr) + ' • Status: ' + d.status +
      ' (publish nahi hua hai — admin approval ke baad publish hoga).';
    body.appendChild(p);
  });
  renderPropertyInto('pp-live-performance', function (d, body) {
    var h = document.createElement('h3');
    h.textContent = d.title;
    body.appendChild(h);
    window.PP.get('/api/leads?property_id=' + d.id + '&limit=100').then(function (r) {
      var leads = (r.ok && r.data && r.data.pagination) ? r.data.pagination.total : 0;
      var p = document.createElement('p');
      // Views stay a dash: no per-property view count is exposed.
      p.textContent = 'Status: ' + d.status + ' • Views: — • Leads: ' + leads;
      body.appendChild(p);
    });
  });
  // Quality score (auto-render + form case).
  function renderQuality() {
    var box = document.getElementById('pp-live-quality');
    if (!box) return;
    var notice = document.getElementById('pp-live-quality-notice');
    var body = document.getElementById('pp-live-quality-body');
    loadPropertyForPage().then(function (d) {
      if (!d) {
        if (notice) notice.textContent = 'Koi listing chuni nahi gayi. My Listings se kisi listing par Preview dabayein.';
        return;
      }
      var comp = completeness(d);
      if (body) {
        body.textContent = '';
        var h = document.createElement('h3');
        h.textContent = 'Score: ' + comp.score + ' / 100';
        body.appendChild(h);
        var p = document.createElement('p');
        p.textContent = comp.missing.length
          ? 'Ye completeness score hai (bhare hue fields ka %): missing — ' + comp.missing.join(', ') + '.'
          : 'Ye completeness score hai (bhare hue fields ka %): sab scored fields bhare hue hain.';
        body.appendChild(p);
      }
    });
  }
  renderQuality();
  window.PP.wizardQuality = function (form) { renderQuality(); };
  // Duplicate check (auto-render + form case).
  function renderDuplicate() {
    var box = document.getElementById('pp-live-duplicate');
    if (!box) return;
    var notice = document.getElementById('pp-live-duplicate-notice');
    var body = document.getElementById('pp-live-duplicate-body');
    loadPropertyForPage().then(function (d) {
      if (!d) {
        if (notice) notice.textContent = 'Koi listing chuni nahi gayi. My Listings se kisi listing par Preview dabayein.';
        return;
      }
      Promise.all([
        window.PP.get('/api/properties/mine?limit=100'),
        window.PP.get('/api/properties?city=' + encodeURIComponent(d.city) + '&property_type=' + encodeURIComponent(d.property_type) + '&limit=100')
      ]).then(function (rs) {
        var matches = [];
        function check(list, source) {
          (list || []).forEach(function (p) {
            if (!p || p.id === d.id) return;
            var priceOk = d.price_inr && p.price_inr && Math.abs(p.price_inr - d.price_inr) / d.price_inr <= 0.10;
            var areaOk = d.area_sqft && p.area_sqft && Math.abs(p.area_sqft - d.area_sqft) / d.area_sqft <= 0.10;
            if (p.city === d.city && p.property_type === d.property_type && (priceOk || areaOk)) {
              matches.push({ p: p, source: source });
            }
          });
        }
        if (rs[0].ok && rs[0].data) check(rs[0].data.data, 'aapki listing');
        if (rs[1].ok && rs[1].data) check(rs[1].data.data, 'published listing');
        if (!body) return;
        body.textContent = '';
        var h = document.createElement('h3');
        h.textContent = matches.length ? 'Possible duplicates mile: ' + matches.length : 'No duplicate found';
        body.appendChild(h);
        matches.forEach(function (mm) {
          var p = document.createElement('p');
          p.textContent = mm.p.title + ' — ' + inrInt(mm.p.price_inr) + ' (' + mm.source + ')';
          body.appendChild(p);
        });
        var note = document.createElement('p');
        note.textContent = 'Checked against: same city + same property type + price within ±10% (ya area within ±10%).';
        body.appendChild(note);
      });
    });
  }
  renderDuplicate();
  window.PP.wizardDuplicate = function (form) { renderDuplicate(); };
  // Upload steps: honest notice where no picker is wired yet
  // (floor plans, 360, verification, report screenshots). Photos and
  // Documents pages get the real picker handler appended below, so
  // they do not also get the "not implemented" notice.
  var wiredUploadPage = ['property-photos.html', 'property-photos2.html', 'property-documents.html'].indexOf(currentPage()) !== -1;
  if (!wiredUploadPage) { document.querySelectorAll('form[data-api="wizard-upload-notice"]').forEach(function () {
    var box = document.querySelector('.upload-box');
    if (box) {
      var p = document.createElement('p');
      p.textContent = 'Photo/document upload abhi implement nahi hai — binary upload ke liye backend support chahiye. Draft banne ke baad Edit Property se image URLs add ki ja sakti hain.';
      box.parentElement.insertBefore(p, box.nextSibling);
    }
  });
  }
  // Start page: resume an in-progress draft.
  if (currentPage() === 'post-property-start.html') {
    var id = draftId();
    if (id) {
      var h1 = document.querySelector('h1');
      if (h1) {
        var p = document.createElement('p');
        var a = document.createElement('a');
        a.setAttribute('href', 'listing-preview.html?draft_id=' + id);
        a.textContent = 'Adhoora draft resume karein (ID ' + id + ')';
        p.appendChild(a);
        h1.parentElement.insertBefore(p, h1.nextSibling);
      }
    }
  }
});

/* Priority 1 — real binary upload for the wizard Photos / Documents
   steps only (other upload steps keep their honest notice). Each
   "Choose Files" button gets a file picker that POSTs one file at a
   time as multipart/form-data to /api/properties/:id/uploads with
   kind=image (photos) or kind=document (documents). Requires a
   draft (?draft_id= or sessionStorage pp-wizard-draft); without one
   it says so and uploads nothing. Files are validated server-side
   (signature, MIME, 10 MB, permissions); this picker never accepts
   an external URL as a substitute. */
document.addEventListener('DOMContentLoaded', function () {
  var page = (window.location.pathname.split('/').pop() || '');
  var kind = null;
  if (page === 'property-photos.html' || page === 'property-photos2.html') kind = 'image';
  else if (page === 'property-documents.html') kind = 'document';
  if (!kind) return;
  var params = new URLSearchParams(window.location.search);
  var id = parseInt(params.get('draft_id') || params.get('property_id') || '', 10);
  if (!id || id <= 0) {
    try { id = parseInt(window.sessionStorage.getItem('pp-wizard-draft') || '', 10) || 0; } catch (e) { id = 0; }
  }
  document.querySelectorAll('.upload-box button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!id || id <= 0) {
        var warn = document.createElement('p');
        warn.textContent = 'Pehle description step par draft banayein — bina draft ke upload nahi ho sakta.';
        btn.parentElement.appendChild(warn);
        return;
      }
      var input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', kind === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : '.pdf,image/jpeg,image/png,image/webp,image/gif');
      input.setAttribute('multiple', 'multiple');
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        var note = document.createElement('p');
        btn.parentElement.appendChild(note);
        function uploadNext(i) {
          if (i >= files.length) return;
          var fd = new FormData();
          fd.append('kind', kind);
          fd.append('file', files[i]);
          note.textContent = 'Upload ho raha hai: ' + files[i].name + ' (' + (i + 1) + '/' + files.length + ')…';
          fetch('/api/properties/' + id + '/uploads', { method: 'POST', credentials: 'same-origin', body: fd }).then(function (res) {
            return res.text().then(function (text) {
              var data = null;
              try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
              if (!res.ok) {
                note.textContent = 'Upload fail ho gaya (' + files[i].name + '): ' + ((data && data.error && data.error.message) || 'unknown error');
                return;
              }
              note.textContent = 'Upload ho gaya: ' + (files[i].name) + ' — ' + (kind === 'image' ? 'photo listing me dikhegi (publish hone par public).' : 'document private rahega (sirf owner/admin dekh sakte hain).');
              uploadNext(i + 1);
            });
          }).catch(function () {
            note.textContent = 'Server se connect nahi ho pa raha hai — upload nahi hua.';
          });
        }
        uploadNext(0);
      });
      input.click();
    });
  });
});
