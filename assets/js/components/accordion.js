/* PrimePropertys — accordion: one open at a time per container.
   Part of the shared bundle (see tools/build.py). */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.acc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.acc-item');
      var container = btn.closest('.accordion') || document;
      container.querySelectorAll('.acc-item').forEach(function (i) { if (i !== item) i.classList.remove('open'); });
      if (item) item.classList.toggle('open');
    });
  });
});
