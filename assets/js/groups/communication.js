/* PrimePropertys — section behaviour: communication (runs after the
   shared bundle; guards optional elements; do not edit pages
   directly, edit this file and run tools/build.py).
   Templates are live rows; queued SMS/WhatsApp messages are stored
   as QUEUED and never claimed as sent — no provider is configured. */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.PP || !window.PP.me) return;
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('en-IN'); } catch (e) { return s || ''; }
  }
  function centerFor(channel) {
    return { sms: 'sms-center.html', whatsapp: 'whatsapp-center.html', email: 'email-center.html', notification: 'notification-center.html' }[channel] || 'email-center.html';
  }
  var cardsBox = document.getElementById('pp-live-template-cards');
  if (cardsBox) {
    var channel = cardsBox.getAttribute('data-channel') || 'email';
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) {
        var p0 = document.createElement('p');
        p0.textContent = 'Is page ke liye login zaroori hai. Login karke dobara aayein.';
        cardsBox.appendChild(p0);
        return;
      }
      window.PP.get('/api/message-templates?channel=' + encodeURIComponent(channel) + '&limit=100').then(function (r) {
        if (!r.ok) {
          var p1 = document.createElement('p');
          p1.textContent = (r.error && r.error.message) || 'Templates load nahi ho pa rahe hain.';
          cardsBox.appendChild(p1);
          return;
        }
        var items = (r.data && r.data.data) || [];
        cardsBox.textContent = '';
        if (!items.length) {
          var p2 = document.createElement('p');
          p2.textContent = 'No templates yet. Upar wale form se pehla template banayein.';
          cardsBox.appendChild(p2);
          return;
        }
        items.forEach(function (t) {
          if (!t || !Number.isInteger(t.id)) return;
          var card = document.createElement('div');
          card.className = 'card';
          var h = document.createElement('h3');
          h.textContent = t.name;
          card.appendChild(h);
          var body = document.createElement('p');
          body.textContent = (t.subject ? t.subject + ' — ' : '') + (t.body || '');
          card.appendChild(body);
          var a = document.createElement('a');
          a.className = 'btn small';
          a.setAttribute('href', centerFor(t.channel) + '?template_id=' + t.id);
          a.textContent = 'Use Template';
          card.appendChild(a);
          cardsBox.appendChild(card);
        });
      });
    });
  }
  // Center pages: prefill compose forms (SMS/WhatsApp) or show the
  // selected template (email/notification, which have no compose form).
  var params = new URLSearchParams(window.location.search);
  var tid = parseInt(params.get('template_id') || '', 10);
  if (tid && tid > 0) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) return;
      window.PP.get('/api/message-templates/' + tid).then(function (r) {
        if (!r.ok || !r.data || !r.data.data) return;
        var t = r.data.data;
        document.querySelectorAll('form[data-api="sms-message"], form[data-api="whatsapp-message"]').forEach(function (form) {
          form.setAttribute('data-template-id', String(t.id));
          form.querySelectorAll('[data-api-field="body"]').forEach(function (el) { el.value = t.body || ''; });
        });
        var selBox = document.getElementById('pp-live-selected-template-body');
        var selNotice = document.getElementById('pp-live-selected-template-notice');
        if (selBox) {
          var h = document.createElement('h3');
          h.textContent = 'Selected template: ' + t.name;
          selBox.appendChild(h);
          var p = document.createElement('p');
          p.textContent = (t.subject ? t.subject + ' — ' : '') + (t.body || '');
          selBox.appendChild(p);
          var note = document.createElement('p');
          note.textContent = 'Is channel ke liye compose form nahi hai aur koi provider configure nahi hai — isliye ye template yahan sirf dikhaya gaya hai, bheja nahi gaya.';
          selBox.appendChild(note);
          if (selNotice) selNotice.textContent = '';
        }
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
      td.textContent = c;
      tr.appendChild(td);
    });
    return tr;
  }
  function renderMessages(table, cols, makeRow) {
    window.PP.me().then(function (m) {
      if (!m.ok || !m.data || !m.data.user) { noticeRow(table, 'Is page ke liye login zaroori hai. Login karke dobara aayein.', cols); return; }
      window.PP.get('/api/queued-messages?limit=100').then(function (r) {
        if (!r.ok) { noticeRow(table, (r.error && r.error.message) || 'Messages load nahi ho pa rahe hain.', cols); return; }
        var items = (r.data && r.data.data) || [];
        if (!items.length) { noticeRow(table, 'No messages yet.', cols); return; }
        clearRows(table);
        var h = host(table);
        items.forEach(function (msg) {
          if (!msg || !Number.isInteger(msg.id)) return;
          h.appendChild(row(makeRow(msg)));
        });
      });
    });
  }
  var logTable = document.getElementById('pp-live-message-log-table');
  if (logTable) {
    // Columns: Notification | Channel | Recipient | Sent | Status.
    // Sent is a dash: queued messages were never sent.
    renderMessages(logTable, 5, function (msg) {
      return [msg.body, msg.channel, msg.recipient, '—', msg.status];
    });
  }
  var notifTable = document.getElementById('pp-live-notification-table');
  if (notifTable) {
    renderMessages(notifTable, 3, function (msg) {
      return [msg.body, fmtDate(msg.created_at), msg.status];
    });
  }
});
