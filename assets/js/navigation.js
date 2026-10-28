/* PrimePropertys — navigation. Part of the shared bundle (see tools/build.py).
   Safe when .nav-toggle or .main-nav is absent: every lookup is guarded. */
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
});
