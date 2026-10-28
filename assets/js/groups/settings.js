/* PrimePropertys — section behaviour: system-settings (runs after
   the shared bundle; guards optional elements; do not edit pages
   directly, edit this file and run tools/build.py).
   All 28 settings forms hold the same four fields, so they all
   read/write the same site settings row. Reset restores the last
   saved values (it never submits). */
document.addEventListener('DOMContentLoaded', function () {
  var form = document.querySelector('form[data-api="settings"]');
  if (!form || !window.PP || !window.PP.me) return;
  function fill(settings) {
    form.querySelectorAll('[data-api-field]').forEach(function (el) {
      var k = el.getAttribute('data-api-field');
      if (settings[k] !== undefined && settings[k] !== null) el.value = settings[k];
    });
  }
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) return;
    window.PP.get('/api/settings').then(function (r) {
      if (!r.ok || !r.data || !r.data.data) return;
      var settings = (r.data.data.settings) || {};
      fill(settings);
      form.querySelectorAll('[data-settings-reset]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          window.PP.get('/api/settings').then(function (r2) {
            if (r2.ok && r2.data && r2.data.data) fill(r2.data.data.settings || {});
          });
        });
      });
    });
  });
});
