/* PrimePropertys — section behaviour: marketing (runs after the shared
   bundle; guards optional elements; do not edit pages directly, edit
   this file and run tools/build.py).
   Ad campaigns only: platform metrics (impressions, clicks, spend,
   platform leads/conversions) do not exist — no ad platform is
   connected — so list columns for them show a dash, never a number. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function inr(paise) {
    return 'Rs ' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('en-IN'); } catch (e) { return s || ''; }
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
  var campaignTable = document.getElementById('pp-live-campaign-table');
  function renderCampaigns(search, status) {
    if (!campaignTable) return;
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { noticeRow(campaignTable, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', 8); return; }
      var q = '/api/campaigns?limit=100';
      if (status) q += '&status=' + encodeURIComponent(status);
      window.PP.get(q).then(function (r) {
        if (!r.ok) { noticeRow(campaignTable, (r.error && r.error.message) || 'Campaigns load nahi ho pa rahe hain.', 8); return; }
        var items = (r.data && r.data.data) || [];
        if (search) {
          var s = search.toLowerCase();
          items = items.filter(function (c) {
            return (c.name || '').toLowerCase().indexOf(s) !== -1 || (c.type || '').toLowerCase().indexOf(s) !== -1;
          });
        }
        if (!items.length) { noticeRow(campaignTable, 'No campaigns yet.', 8); return; }
        clearRows(campaignTable);
        var h = host(campaignTable);
        items.forEach(function (c) {
          if (!c || !Number.isInteger(c.id)) return;
          var a = document.createElement('a');
          a.setAttribute('href', 'campaign-details.html?campaign_id=' + c.id);
          a.textContent = c.name;
          // Budget is real; Spent / Performance / Leads / Conversions
          // are ad-platform metrics that do not exist yet.
          h.appendChild(row([a, c.type || '—', c.status, inr(c.total_budget_paise), '—', '—', '—', '—']));
        });
      });
    });
  }
  if (campaignTable) renderCampaigns('', '');
  window.PP.applyCampaignFilter = function (form) {
    var searchEl = form.querySelector('input[name="campaign"]');
    var statusEl = form.querySelector('select');
    var status = statusEl ? statusEl.value.trim() : '';
    if (status === 'All Status' || status === 'All') status = '';
    // List-page filter labels (Active/Completed/Scheduled/Paused) map
    // directly to campaign statuses; anything else is ignored.
    var known = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'];
    if (status && known.indexOf(status.toLowerCase()) === -1) status = status.toLowerCase();
    renderCampaigns(searchEl ? searchEl.value.trim() : '', status);
  };
  var detailsBox = document.getElementById('pp-live-campaign-details');
  if (detailsBox) {
    var notice = document.getElementById('pp-live-campaign-details-notice');
    var body = document.getElementById('pp-live-campaign-details-body');
    var params = new URLSearchParams(window.location.search);
    var cid = parseInt(params.get('campaign_id') || '', 10);
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) {
        if (notice) notice.textContent = 'Is page ke liye login zaroori hai. Login karke dobara aayein.';
        return;
      }
      if (!cid || cid <= 0) {
        if (notice) notice.textContent = 'Koi campaign chuna nahi gaya. Campaigns list se kisi campaign par dabayein.';
        return;
      }
      window.PP.get('/api/campaigns/' + cid).then(function (r) {
        if (!r.ok) {
          if (notice) notice.textContent = (r.error && r.error.message) || 'Campaign load nahi ho pa raha hai.';
          return;
        }
        var c = r.data && r.data.data;
        if (!c || !body) return;
        var h = document.createElement('h3');
        h.textContent = c.name;
        body.appendChild(h);
        var meta = document.createElement('p');
        meta.textContent = 'Type: ' + (c.type || '—') + ' • Objective: ' + (c.objective || '—') + ' • Channels: ' + (c.channels || '—') +
          ' • Daily budget: ' + inr(c.daily_budget_paise) + ' • Total budget: ' + inr(c.total_budget_paise) +
          ' • Status: ' + c.status + ' • Created: ' + fmtDate(c.created_at);
        body.appendChild(meta);
        if (c.description) {
          var d = document.createElement('p');
          d.textContent = c.description;
          body.appendChild(d);
        }
        var note = document.createElement('p');
        note.textContent = 'Ad-platform metrics (impressions, clicks, spend, platform leads) is campaign se judhe nahi hain — koi ad platform connect nahi hai.';
        body.appendChild(note);
        var edit = document.createElement('a');
        edit.setAttribute('href', 'edit-campaign.html?campaign_id=' + c.id);
        edit.textContent = 'Edit campaign';
        body.appendChild(edit);
        var actions = { active: 'Activate', paused: 'Pause', completed: 'Mark completed', cancelled: 'Cancel campaign' };
        Object.keys(actions).forEach(function (next) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = actions[next];
          btn.style.marginLeft = '8px';
          btn.addEventListener('click', function () {
            window.PP.request('/api/campaigns/' + c.id, { method: 'PATCH', body: { status: next } }).then(function (r2) {
              if (!r2.ok) {
                if (notice) notice.textContent = (r2.error && r2.error.message) || 'Status change nahi ho pa raha hai.';
                return;
              }
              window.location.reload();
            });
          });
          body.appendChild(btn);
        });
      });
    });
  }
  var editForm = document.querySelector('form[data-api="campaign-edit"]');
  if (editForm) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) return;
      var cid = parseInt(new URLSearchParams(window.location.search).get('campaign_id') || '', 10);
      if (!cid || cid <= 0) return;
      window.PP.get('/api/campaigns/' + cid).then(function (r) {
        if (!r.ok || !r.data || !r.data.data) return;
        var c = r.data.data;
        editForm.querySelectorAll('[data-api-field]').forEach(function (el) {
          var k = el.getAttribute('data-api-field');
          if (k === 'daily_budget_rupees') el.value = c.daily_budget_paise / 100;
          else if (k === 'total_budget_rupees') el.value = c.total_budget_paise / 100;
          else if (c[k] !== undefined && c[k] !== null) el.value = c[k];
        });
      });
    });
  }
});
