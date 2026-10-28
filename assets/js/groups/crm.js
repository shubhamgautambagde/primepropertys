/* PrimePropertys — section behaviour: crm (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
// Portal: table search (front-end only)

document.addEventListener('DOMContentLoaded', function () {
  var s = document.getElementById('portalSearch');
  if (s) s.addEventListener('input', function () {
    var q = s.value.trim().toLowerCase();
    document.querySelectorAll('.data-table tbody tr').forEach(function (r) {
      r.style.display = (!q || r.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  });
});
