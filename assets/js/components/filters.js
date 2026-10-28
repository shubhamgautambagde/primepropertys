/* PrimePropertys — client-side list filtering (FAQ / Help search, Careers).
   Part of the shared bundle (see tools/build.py). Every input lookup is
   guarded, so pages without these controls are unaffected. */
document.addEventListener('DOMContentLoaded', function () {
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
});
