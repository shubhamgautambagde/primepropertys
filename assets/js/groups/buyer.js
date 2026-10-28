/* PrimePropertys — section behaviour: buyer (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
function inr(n){return 'Rs ' + Math.round(n).toLocaleString('en-IN');}
/* Stage I: calculator results are built with DOM nodes, never
   injected as HTML — the values are numbers, but the brief
   requires DOM construction for rendered output, so the pattern
   cannot regress if an input ever stops being numeric. */
function setCalc(el, strongText, restText){
  if(!el) return;
  el.style.display='block'; el.textContent='';
  var s=document.createElement('strong'); s.textContent=strongText; el.appendChild(s);
  el.appendChild(document.createElement('br'));
  el.appendChild(document.createTextNode(restText));
}
function calcROI(){
  var p=+document.getElementById('roiPrice').value||0, rent=+document.getElementById('roiRent').value||0,
      stamp=+document.getElementById('roiStamp').value||0, other=+document.getElementById('roiOther').value||0,
      yrs=+document.getElementById('roiYears').value||20, appr=+document.getElementById('roiAppr').value||6,
      growth=+document.getElementById('roiGrowth').value||5;
  var total=p+stamp+other, future=p*Math.pow(1+appr/100,yrs),
      rentSum=0, r=rent*12; for(var i=0;i<yrs;i++){ rentSum+=r; r*=1+growth/100; }
  var expenses=other*yrs*0.2, net=future-p+rentSum-expenses, roi=total?net/total*100:0;
  setCalc(document.getElementById('roiResult'),
    'Estimated ROI: '+roi.toFixed(2)+'% over '+yrs+' years',
    'Total investment '+inr(total)+' | Future value '+inr(future)+' | Total rent '+inr(rentSum)+' | Net profit '+inr(net)+' | Gross yield '+((rent*12/p*100)||0).toFixed(2)+'%');
}
function calcYield(){
  var p=+document.getElementById('yPrice').value||0, rent=+document.getElementById('yRent').value||0, exp=+document.getElementById('yExp').value||0;
  var gross=p?rent*12/p*100:0, net=p?(rent*12-exp)/p*100:0, el=document.getElementById('yieldResult');
  setCalc(el,
    'Gross yield '+gross.toFixed(2)+'% | Net yield '+net.toFixed(2)+'%','Annual rent '+inr(rent*12)+' | Annual expenses '+inr(exp));
}
function calcAppr(){
  var p=+document.getElementById('aPrice').value||0, rate=+document.getElementById('aRate').value||0, yrs=+document.getElementById('aYears').value||0;
  var future=p*Math.pow(1+rate/100,yrs), el=document.getElementById('appResult');
  setCalc(el,
    'Future value: '+inr(future),'Gain '+inr(future-p)+' over '+yrs+' years at '+rate+'% p.a.');
}

/* Stage H, Phase 3 — buyer dashboard live data (guarded by #pp-live-buyer).
   Saved properties and recently viewed come from the real API. When no
   session exists, an honest login notice is shown instead of demo data. */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-buyer');
  if (!root || !window.PP || !window.PP.me) return;
  var notice = document.getElementById('pp-live-buyer-notice');
  function inr(n) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n); }
    catch (e) { return 'Rs ' + n; }
  }
  function renderList(el, items, emptyText) {
    if (!el) return;
    if (!items.length) { el.textContent = emptyText; return; }
    var h = document.createElement('h3');
    h.textContent = el.id === 'pp-live-saved' ? 'Your Saved Properties (live)' : 'Recently Viewed (live)';
    el.appendChild(h);
    items.forEach(function (p) {
      if (!p || !Number.isInteger(p.id)) return;
      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('style', 'padding:14px;margin:10px 0');
      var t = document.createElement('strong');
      t.textContent = p.title || ('Property #' + p.id);
      card.appendChild(t);
      var meta = document.createElement('p');
      meta.textContent = (p.property_type || '') + ' • ' + (p.city || '') + (p.locality ? ', ' + p.locality : '') + ' • ' + inr(p.price_inr || 0);
      card.appendChild(meta);
      var a = document.createElement('a');
      a.setAttribute('href', '../property-engine/make-enquiry.html?property_id=' + p.id);
      a.textContent = 'Enquire →';
      card.appendChild(a);
      el.appendChild(card);
    });
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
    var lead = document.querySelector('.portal-head p.lead');
    if (lead) lead.textContent = 'Welcome back, ' + (m.data.user.full_name || m.data.user.email) + '! Find, connect and own your dream property all in one place.';
    window.PP.savedList().then(function (r) {
      renderList(document.getElementById('pp-live-saved'), (r.ok && r.data && r.data.data) || [], 'No saved properties yet.');
    });
    window.PP.get('/api/recently-viewed').then(function (r) {
      renderList(document.getElementById('pp-live-recent'), (r.ok && r.data && r.data.data) || [], 'No recently viewed properties yet.');
    });
  });
});

/* Stage H, Phase 4 — investor dashboard + saved / recently-viewed /
   notifications pages. Each block is guarded by its own container, so it
   runs only on its page. All data comes from the real API; anonymous
   visitors get an honest login notice instead of demo data. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function inr(n) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n); }
    catch (e) { return 'Rs ' + n; }
  }
  function loginNotice(el) {
    if (!el) return;
    el.textContent = 'Is page ke liye login zaroori hai. ';
    var a = document.createElement('a');
    a.href = '../../login.html';
    a.textContent = 'Login karein →';
    el.appendChild(a);
  }
  function propCard(p) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('style', 'padding:14px;margin:10px 0');
    var t = document.createElement('strong');
    t.textContent = p.title || ('Property #' + p.id);
    card.appendChild(t);
    var meta = document.createElement('p');
    meta.textContent = (p.property_type || '') + ' • ' + (p.city || '') + (p.locality ? ', ' + p.locality : '') + ' • ' + inr(p.price_inr || 0);
    card.appendChild(meta);
    var a = document.createElement('a');
    a.setAttribute('href', '../property-engine/make-enquiry.html?property_id=' + p.id);
    a.textContent = 'Enquire →';
    card.appendChild(a);
    return card;
  }
  function propList(box, items, heading, emptyText) {
    if (!box) return;
    var h = document.createElement('h3');
    h.textContent = heading;
    box.appendChild(h);
    if (!items.length) { box.appendChild(document.createTextNode(emptyText)); return; }
    items.forEach(function (p) {
      if (p && Number.isInteger(p.id)) box.appendChild(propCard(p));
    });
  }
  var inv = document.getElementById('pp-live-investor');
  if (inv) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginNotice(document.getElementById('pp-live-investor-notice')); return; }
      window.PP.savedList().then(function (r) {
        propList(document.getElementById('pp-live-investor-saved'), (r.ok && r.data && r.data.data) || [], 'Your Saved Properties (live)', 'No saved properties yet.');
      });
      window.PP.get('/api/recently-viewed').then(function (r) {
        propList(document.getElementById('pp-live-investor-recent'), (r.ok && r.data && r.data.data) || [], 'Recently Viewed (live)', 'No recently viewed properties yet.');
      });
    });
  }
  var savedPage = document.getElementById('pp-live-saved-page');
  if (savedPage) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginNotice(document.getElementById('pp-live-saved-page-notice')); return; }
      window.PP.savedList().then(function (r) {
        propList(document.getElementById('pp-live-saved-list'), (r.ok && r.data && r.data.data) || [], 'Your Saved Properties (live)', 'No saved properties yet.');
      });
    });
  }
  var recentPage = document.getElementById('pp-live-recent-page');
  if (recentPage) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginNotice(document.getElementById('pp-live-recent-page-notice')); return; }
      window.PP.get('/api/recently-viewed').then(function (r) {
        propList(document.getElementById('pp-live-recent-list'), (r.ok && r.data && r.data.data) || [], 'Recently Viewed (live)', 'No recently viewed properties yet.');
      });
    });
  }
  var notifPage = document.getElementById('pp-live-notifications');
  if (notifPage) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginNotice(document.getElementById('pp-live-notifications-notice')); return; }
      window.PP.notifications().then(function (r) {
        var box = document.getElementById('pp-live-notifications-list');
        if (!box) return;
        if (!r.ok) { box.textContent = 'Notifications load nahi ho pa rahi hain.'; return; }
        var items = (r.data && r.data.data) || [];
        var h = document.createElement('h3');
        h.textContent = 'Your Notifications (live): ' + (r.data && r.data.unread_count != null ? r.data.unread_count : 0) + ' unread';
        box.appendChild(h);
        if (!items.length) { box.appendChild(document.createTextNode('No notifications yet.')); return; }
        items.forEach(function (n) {
          if (!n || !Number.isInteger(n.id)) return;
          var card = document.createElement('div');
          card.className = 'card';
          card.setAttribute('style', 'padding:14px;margin:10px 0');
          var t = document.createElement('strong');
          t.textContent = n.title || ('Notification #' + n.id);
          card.appendChild(t);
          var meta = document.createElement('p');
          meta.textContent = n.body || '';
          card.appendChild(meta);
          if (!n.read_at) {
            var btn = document.createElement('button');
            btn.textContent = 'Mark read';
            btn.addEventListener('click', function () {
              window.PP.post('/api/notifications/' + n.id + '/read', {}).then(function (rr) {
                if (rr.ok) { btn.textContent = 'Read ✓'; btn.disabled = true; }
              });
            });
            card.appendChild(btn);
          }
          box.appendChild(card);
        });
      });
    });
  }
});

/* Stage H, Phase 5 — buyer "My Enquiries" page (guarded by
   #pp-live-my-enquiries). Only enquiries sent while logged in are
   listed; anonymous enquiries are never matched by email, so one user
   cannot read another's enquiries by registering with their email. */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('pp-live-my-enquiries');
  if (!root || !window.PP || !window.PP.me) return;
  window.PP.me().then(function (m) {
    var notice = document.getElementById('pp-live-my-enquiries-notice');
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
    window.PP.get('/api/inquiries/mine').then(function (r) {
      var box = document.getElementById('pp-live-my-enquiries-list');
      if (!box) return;
      if (!r.ok) { box.textContent = 'Enquiries load nahi ho pa rahi hain.'; return; }
      var items = (r.data && r.data.data) || [];
      var h = document.createElement('h3');
      h.textContent = 'Your Enquiries (live): ' + items.length;
      box.appendChild(h);
      if (!items.length) { box.appendChild(document.createTextNode('No enquiries sent from this account yet.')); return; }
      items.forEach(function (q) {
        if (!q || !Number.isInteger(q.id)) return;
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('style', 'padding:14px;margin:10px 0');
        var t = document.createElement('strong');
        t.textContent = q.property_title || ('Property #' + q.property_id);
        card.appendChild(t);
        var meta = document.createElement('p');
        meta.textContent = 'Status: ' + q.status + (q.created_at ? ' • ' + q.created_at : '');
        card.appendChild(meta);
        if (q.message) {
          var msg = document.createElement('p');
          msg.textContent = q.message.slice(0, 300);
          card.appendChild(msg);
        }
        box.appendChild(card);
      });
    });
  });
});

/* Portal my-lists — buyer "My Site Visits" page (guarded by
   #pp-live-my-visits-table). Visits come from the real API
   (visibility-scoped: the buyer sees only their own).
   Agent shows a dash: visits carry no agent until one is
   assigned (see the visit-booking slice). */
document.addEventListener('DOMContentLoaded', function () {
  var table = document.getElementById('pp-live-my-visits-table');
  if (!table || !window.PP || !window.PP.me) return;
  function host() {
    return table.querySelector('tbody') || table;
  }
  function clearRows() {
    var h = host();
    var rows = h.querySelectorAll('tr');
    var start = table.querySelector('tbody') ? 0 : 1;
    for (var i = rows.length - 1; i >= start; i--) rows[i].remove();
  }
  function noticeRow(text) {
    clearRows();
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', '4');
    td.textContent = text;
    tr.appendChild(td);
    host().appendChild(tr);
  }
  function fmt(s) {
    try { return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s || ''; }
  }
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) { noticeRow('Is page ke liye login zaroori hai. Login karke dobara aayein.'); return; }
    window.PP.get('/api/site-visits?limit=100').then(function (r) {
      if (!r.ok) { noticeRow((r.error && r.error.message) || 'Visits load nahi ho pa rahi hain.'); return; }
      var items = (r.data && r.data.data) || [];
      if (!items.length) { noticeRow('No site visits yet.'); return; }
      clearRows();
      var h = host();
      items.forEach(function (v) {
        if (!v || !Number.isInteger(v.id)) return;
        var tr = document.createElement('tr');
        var c0 = document.createElement('td');
        c0.textContent = (v.property_title || ('property #' + v.property_id)) + (v.property_city ? ', ' + v.property_city : '');
        tr.appendChild(c0);
        var c1 = document.createElement('td');
        c1.textContent = fmt(v.scheduled_at);
        tr.appendChild(c1);
        var c2 = document.createElement('td');
        c2.textContent = '—';
        tr.appendChild(c2);
        var c3 = document.createElement('td');
        var tag = document.createElement('span');
        tag.className = 'tag ' + (v.status === 'completed' ? 'green' : (v.status === 'confirmed' ? 'blue' : ''));
        tag.textContent = v.status;
        c3.appendChild(tag);
        tr.appendChild(c3);
        h.appendChild(tr);
      });
    });
  });
});

/* Payments — buyer payment-history page (guarded by
   #pp-live-buyer-payments-table). Offline records only. */
document.addEventListener('DOMContentLoaded', function () {
  var table = document.getElementById('pp-live-buyer-payments-table');
  if (!table || !window.PP || !window.PP.me) return;
  function host() { return table.querySelector('tbody') || table; }
  function clearRows() {
    var rows = host().querySelectorAll('tr');
    var start = table.querySelector('tbody') ? 0 : 1;
    for (var i = rows.length - 1; i >= start; i--) rows[i].remove();
  }
  function noticeRow(text) {
    clearRows();
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', '4');
    td.textContent = text;
    tr.appendChild(td);
    host().appendChild(tr);
  }
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) { noticeRow('Is page ke liye login zaroori hai. Login karke dobara aayein.'); return; }
    window.PP.get('/api/payments?limit=100').then(function (r) {
      if (!r.ok) { noticeRow((r.error && r.error.message) || 'Payments load nahi ho pa rahe hain.'); return; }
      var items = (r.data && r.data.data) || [];
      if (!items.length) { noticeRow('No payments yet.'); return; }
      clearRows();
      var h = host();
      items.forEach(function (p) {
        if (!p || !Number.isInteger(p.id)) return;
        var tr = document.createElement('tr');
        [new Date(p.created_at).toLocaleDateString('en-IN'), p.description,
         'Rs ' + (p.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
         p.status].forEach(function (txt) {
          var td = document.createElement('td');
          td.textContent = txt;
          tr.appendChild(td);
        });
        h.appendChild(tr);
      });
    });
  });
});
