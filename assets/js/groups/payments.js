/* PrimePropertys — section behaviour: payments (runs after the shared
   bundle; guards optional elements; do not edit pages directly, edit
   this file and run tools/build.py).
   Offline payment records only: no gateway is configured, so lists
   show pending/verified states honestly and invoice numbers are
   derived (INV-<payment id>). */
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
    var h = host(table);
    var rows = h.querySelectorAll('tr');
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
  function loginRow(table, cols) {
    noticeRow(table, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', cols);
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
  function renderList(table, cols, makeRow) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { loginRow(table, cols); return; }
      window.PP.get('/api/payments?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(table, (r.error && r.error.message) || 'Payments load nahi ho pa rahe hain.', cols); return; }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(table, 'No payments yet.', cols); return; }
        clearRows(table);
        var h = host(table);
        items.forEach(function (p) {
          if (!p || !Number.isInteger(p.id)) return;
          h.appendChild(makeRow(p));
        });
      });
    });
  }
  var payTable = document.getElementById('pp-live-payment-table');
  if (payTable) {
    renderList(payTable, 6, function (p) {
      return row(['PAY-' + p.id, fmtDate(p.created_at), p.description, p.method, inr(p.amount_paise), p.status]);
    });
  }
  var invTable = document.getElementById('pp-live-invoice-table');
  if (invTable) {
    renderList(invTable, 6, function (p) {
      var a = document.createElement('a');
      a.setAttribute('href', 'invoice-details.html?payment_id=' + p.id);
      a.textContent = 'View';
      return row(['INV-' + p.id, p.description, fmtDate(p.created_at), inr(p.amount_paise), p.status, a]);
    });
  }
  var invItems = document.getElementById('pp-live-invoice-items');
  if (invItems) {
    var notice = document.getElementById('pp-live-invoice-details-notice');
    var body = document.getElementById('pp-live-invoice-details-body');
    var params = new URLSearchParams(window.location.search);
    var pid = parseInt(params.get('payment_id') || '', 10);
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) {
        if (notice) notice.textContent = 'Is page ke liye login zaroori hai. Login karke dobara aayein.';
        return;
      }
      if (!pid || pid <= 0) {
        if (notice) notice.textContent = 'Koi payment chuna nahi gaya. Invoice List se kisi invoice par View dabayein.';
        return;
      }
      window.PP.get('/api/payments/' + pid).then(function (r) {
        if (!r.ok) {
          if (notice) notice.textContent = (r.error && r.error.message) || 'Invoice load nahi ho pa raha hai.';
          return;
        }
        var p = r.data && r.data.data;
        if (!p) return;
        if (body) {
          var h = document.createElement('h3');
          h.textContent = 'Invoice INV-' + p.id + ' — ' + p.description;
          body.appendChild(h);
          var meta = document.createElement('p');
          meta.textContent = 'Date: ' + fmtDate(p.created_at) + ' • Method: ' + p.method + ' • Status: ' + p.status + ' • Total: ' + inr(p.amount_paise);
          body.appendChild(meta);
          var note = document.createElement('p');
          note.textContent = p.status === 'verified'
            ? 'Ye payment staff se verified hai.'
            : 'Ye payment abhi ' + p.status + ' hai — koi gateway charge claim nahi kiya gaya hai.';
          body.appendChild(note);
        }
        var table = invItems;
        clearRows(table);
        host(table).appendChild(row([p.description, '1', inr(p.amount_paise), inr(p.amount_paise)]));
      });
    });
  }
  var refundBox = document.getElementById('pp-live-refund-status');
  if (refundBox) {
    var rnotice = document.getElementById('pp-live-refund-status-notice');
    var rbody = document.getElementById('pp-live-refund-status-body');
    var rparams = new URLSearchParams(window.location.search);
    var rpid = parseInt(rparams.get('payment_id') || '', 10);
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) {
        if (rnotice) rnotice.textContent = 'Is page ke liye login zaroori hai. Login karke dobara aayein.';
        return;
      }
      function showRefund(p) {
        if (!rbody) return;
        var h = document.createElement('h3');
        h.textContent = 'Refund — PAY-' + p.id + ' (' + p.description + ')';
        rbody.appendChild(h);
        var meta = document.createElement('p');
        meta.textContent = 'Status: ' + p.status +
          (p.refund_amount_paise ? ' • Refund amount: ' + inr(p.refund_amount_paise) : '') +
          (p.refund_to ? ' • Refund to: ' + p.refund_to : '') +
          (p.refund_reason ? ' • Reason: ' + p.refund_reason : '');
        rbody.appendChild(meta);
      }
      if (rpid && rpid > 0) {
        window.PP.get('/api/payments/' + rpid).then(function (r) {
          if (!r.ok) { if (rnotice) rnotice.textContent = (r.error && r.error.message) || 'Refund status load nahi ho pa raha hai.'; return; }
          showRefund(r.data.data);
        });
        return;
      }
      window.PP.get('/api/payments?limit=100').then(function (r) {
        if (!r.ok) { if (rnotice) rnotice.textContent = (r.error && r.error.message) || 'Refund status load nahi ho pa raha hai.'; return; }
        var items = ((r.data && r.data.data) || []).filter(function (p) {
          return p.status === 'refund_requested' || p.status === 'refunded';
        });
        if (!items.length) {
          if (rnotice) rnotice.textContent = 'Koi refund request nahi mila. Kisi payment ka refund dekhne ke liye uska payment_id kholein.';
          return;
        }
        items.forEach(showRefund);
      });
    });
  }
  var refundSelect = document.getElementById('pp-live-refund-payment');
  if (refundSelect) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) return;
      window.PP.get('/api/payments?limit=100').then(function (r) {
        if (!r.ok) return;
        var items = ((r.data && r.data.data) || []).filter(function (p) {
          return p.status === 'pending' || p.status === 'verified';
        });
        refundSelect.textContent = '';
        if (!items.length) {
          var o0 = document.createElement('option');
          o0.value = '';
          o0.textContent = 'No refundable payment found';
          refundSelect.appendChild(o0);
          return;
        }
        var o = document.createElement('option');
        o.value = '';
        o.textContent = 'Select a payment…';
        refundSelect.appendChild(o);
        items.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = String(p.id);
          opt.textContent = 'PAY-' + p.id + ' — ' + inr(p.amount_paise) + ' — ' + p.description;
          refundSelect.appendChild(opt);
        });
      });
    });
  }
  var billingForm = document.querySelector('form[data-api="billing-profile"]');
  if (billingForm) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) return;
      window.PP.get('/api/billing-profile').then(function (r) {
        if (!r.ok || !r.data || !r.data.data) return;
        var d = r.data.data;
        billingForm.querySelectorAll('[data-api-field]').forEach(function (el) {
          var k = el.getAttribute('data-api-field');
          if (d[k] !== undefined && d[k] !== null) el.value = d[k];
        });
      });
    });
  }
});
