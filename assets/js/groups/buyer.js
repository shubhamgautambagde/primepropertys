/* PrimePropertys — section behaviour: buyer (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
function inr(n){return 'Rs ' + Math.round(n).toLocaleString('en-IN');}
function calcROI(){
  var p=+document.getElementById('roiPrice').value||0, rent=+document.getElementById('roiRent').value||0,
      stamp=+document.getElementById('roiStamp').value||0, other=+document.getElementById('roiOther').value||0,
      yrs=+document.getElementById('roiYears').value||20, appr=+document.getElementById('roiAppr').value||6,
      growth=+document.getElementById('roiGrowth').value||5;
  var total=p+stamp+other, future=p*Math.pow(1+appr/100,yrs),
      rentSum=0, r=rent*12; for(var i=0;i<yrs;i++){ rentSum+=r; r*=1+growth/100; }
  var expenses=other*yrs*0.2, net=future-p+rentSum-expenses, roi=total?net/total*100:0;
  var el=document.getElementById('roiResult'); if(el){el.style.display='block';
    el.innerHTML='<strong>Estimated ROI: '+roi.toFixed(2)+'% over '+yrs+' years</strong><br>Total investment '+inr(total)+' | Future value '+inr(future)+' | Total rent '+inr(rentSum)+' | Net profit '+inr(net)+' | Gross yield '+((rent*12/p*100)||0).toFixed(2)+'%';}
}
function calcYield(){
  var p=+document.getElementById('yPrice').value||0, rent=+document.getElementById('yRent').value||0, exp=+document.getElementById('yExp').value||0;
  var gross=p?rent*12/p*100:0, net=p?(rent*12-exp)/p*100:0, el=document.getElementById('yieldResult');
  if(el){el.style.display='block'; el.innerHTML='<strong>Gross yield '+gross.toFixed(2)+'% | Net yield '+net.toFixed(2)+'%</strong><br>Annual rent '+inr(rent*12)+' | Annual expenses '+inr(exp);}
}
function calcAppr(){
  var p=+document.getElementById('aPrice').value||0, rate=+document.getElementById('aRate').value||0, yrs=+document.getElementById('aYears').value||0;
  var future=p*Math.pow(1+rate/100,yrs), el=document.getElementById('appResult');
  if(el){el.style.display='block'; el.innerHTML='<strong>Future value: '+inr(future)+'</strong><br>Gain '+inr(future-p)+' over '+yrs+' years at '+rate+'% p.a.';}
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
