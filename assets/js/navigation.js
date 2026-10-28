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

/* Stage H, Phase 4 — header session state (runs on every page).
   (a) The static headers' "Sign In" links point at contact.html; point
   them at the real login page. The correct relative prefix is derived
   from the header's own index.html link, so it works at any depth and
   under any hosting subpath.
   (b) When a session exists, show the user's name and a real Logout
   action in .header-actions (or the header row as fallback). */
document.addEventListener('DOMContentLoaded', function () {
  var homeLink = document.querySelector('a.logo, .main-nav a[href$="index.html"]');
  var prefix = '';
  if (homeLink) {
    var href = homeLink.getAttribute('href') || 'index.html';
    prefix = href.replace(/index\.html$/, '');
  }
  document.querySelectorAll('a').forEach(function (a) {
    if (a.textContent.trim() === 'Sign In') a.setAttribute('href', prefix + 'login.html');
  });
  if (!window.PP || !window.PP.me) return;
  window.PP.me().then(function (m) {
    if (!m.ok || !m.data || !m.data.user) return;
    var actions = document.querySelector('.header-actions') || document.querySelector('.header-row') || document.querySelector('header');
    if (!actions) return;
    var chip = document.createElement('span');
    chip.textContent = (m.data.user.full_name || m.data.user.email) + ' (' + m.data.user.role + ')';
    chip.style.fontWeight = '600';
    chip.style.marginLeft = '12px';
    actions.appendChild(chip);
    var out = document.createElement('button');
    out.textContent = 'Logout';
    out.style.marginLeft = '8px';
    out.style.cursor = 'pointer';
    out.addEventListener('click', function () {
      window.PP.logout().then(function () { window.location.href = prefix + 'index.html'; });
    });
    actions.appendChild(out);
  });
});
