/* PrimePropertys — core: small shared bits with no module of their own.
   Part of the shared bundle (see tools/build.py). */
document.addEventListener('DOMContentLoaded', function () {
  // Footer year, only if a year span is present
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
