/* PrimePropertys — tabs and toggles (home search tabs, pricing billing/audience).
   Part of the shared bundle (see tools/build.py). querySelectorAll is safe
   when a control is absent: it simply matches nothing. */
document.addEventListener('DOMContentLoaded', function () {
  // Home search tabs
  document.querySelectorAll('.search-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.search-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var note = document.getElementById('search-note');
      if (note) note.textContent = 'Showing ' + tab.textContent.trim() + ' properties across India.';
    });
  });

  // Pricing: Monthly / Yearly toggle
  document.querySelectorAll('[data-billing]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-billing]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var mode = btn.getAttribute('data-billing');
      document.querySelectorAll('.billing-note').forEach(function (n) {
        n.textContent = n.getAttribute('data-' + mode) || n.textContent;
      });
    });
  });

  // Pricing: audience tabs
  document.querySelectorAll('[data-audience]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-audience]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var note = document.getElementById('audience-note');
      if (note) note.textContent = 'Plans for ' + btn.textContent.trim() + ' — same transparent pricing, tailored features.';
    });
  });
});
