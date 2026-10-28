/* PrimePropertys — forms. Part of the shared bundle (see tools/build.py).
   No backend is connected yet (Stage H). This handler therefore NEVER
   claims a save/send that did not happen, and NEVER clears the user's
   input on a failed save. When a .form-success message is shown, a
   "Demo preview" note is appended once so the message cannot be read
   as a completed operation. Client-side tool forms (onsubmit="return
   false", e.g. calculators) keep their own behaviour and are skipped. */
document.addEventListener('DOMContentLoaded', function () {
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
});
