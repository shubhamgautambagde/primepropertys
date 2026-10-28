/* PrimePropertys — section behaviour: admin (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
// Admin: filter any table on the page from the toolbar search box.
document.addEventListener('DOMContentLoaded', function () {
  var box = document.querySelector('.admin-filter');
  if (box) box.addEventListener('input', function () {
    var q = box.value.trim().toLowerCase();
    document.querySelectorAll('table.data tbody tr').forEach(function (r) {
      r.style.display = (!q || r.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  });
  // Matrix: clicking a cell cycles its access level label.
  document.querySelectorAll('.matrix-cell').forEach(function (c) {
    c.addEventListener('click', function () {
      var levels = ['Full', 'View', 'Edit', 'None'];
      var cur = levels.indexOf(c.textContent.trim());
      c.textContent = levels[(cur + 1) % levels.length];
    });
  });
});
