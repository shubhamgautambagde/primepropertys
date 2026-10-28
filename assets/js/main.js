// PrimePropertys — shared behaviour. No backend: forms show an inline success message.
document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) toggle.addEventListener('click', function () { nav.classList.toggle('open'); });

  // Active nav link
  var here = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach(function (a) {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  // Home search tabs
  document.querySelectorAll('.search-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.search-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var note = document.getElementById('search-note');
      if (note) note.textContent = 'Showing ' + tab.textContent.trim() + ' properties across India.';
    });
  });

  // Accordion: one open at a time per container
  document.querySelectorAll('.acc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.acc-item');
      var container = btn.closest('.accordion') || document;
      container.querySelectorAll('.acc-item').forEach(function (i) { if (i !== item) i.classList.remove('open'); });
      item.classList.toggle('open');
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

  // FAQ / Help search filtering
  function bindFilter(inputId, selector) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      document.querySelectorAll(selector).forEach(function (el) {
        el.style.display = (!q || el.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
      });
    });
  }
  bindFilter('faqSearch', '.acc-item');
  bindFilter('helpSearch', '.topic-card, .acc-item');

  // Careers filtering
  var jobSearch = document.getElementById('jobSearch');
  var jobDept = document.getElementById('jobDept');
  var jobLoc = document.getElementById('jobLoc');
  function filterJobs() {
    var q = jobSearch ? jobSearch.value.trim().toLowerCase() : '';
    var d = jobDept ? jobDept.value : '';
    var l = jobLoc ? jobLoc.value : '';
    document.querySelectorAll('.job-card').forEach(function (job) {
      var ok = (!q || job.textContent.toLowerCase().indexOf(q) !== -1) &&
               (!d || job.getAttribute('data-dept') === d) &&
               (!l || job.getAttribute('data-location') === l);
      job.style.display = ok ? '' : 'none';
    });
  }
  if (jobSearch) jobSearch.addEventListener('input', filterJobs);
  if (jobDept) jobDept.addEventListener('change', filterJobs);
  if (jobLoc) jobLoc.addEventListener('change', filterJobs);

  // Forms: no backend is connected yet (Stage H). Never claim a save/send
  // that did not happen, and never clear the user's input on a failed save.
  // Client-side tool forms (onsubmit="return false") keep their own behaviour.
  document.querySelectorAll('form').forEach(function (form) {
    if (form.hasAttribute('onsubmit')) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form-success') || form.parentElement.querySelector('.form-success');
      if (msg) {
        msg.classList.add('show');
        if (!msg.querySelector('.demo-note')) {
          var note = document.createElement('small');
          note.className = 'demo-note';
          note.textContent = ' Demo preview — no data was saved yet. This form will be connected to a real server in Stage H.';
          msg.appendChild(note);
        }
      }
    });
  });

  // Footer year, only if a year span is present
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
