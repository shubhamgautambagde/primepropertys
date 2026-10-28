/* PrimePropertys — validation helpers (library, for Stage H form wiring).
   These are pure functions with no DOM side effects, so they are safe to
   load on every page and to unit-test in Node. They do NOT replace the
   browser's built-in required/type validation, and they are not yet wired
   to any form's submit handler — server-side validation in Stage D/H
   remains the authority. All helpers return true/false, never throw on
   missing or non-string input. */
function isRequired(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}
function isValidEmail(value) {
  if (!isRequired(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());
}
function isValidPhoneIN(value) {
  if (!isRequired(value)) return false;
  var digits = String(value).replace(/[\s\-+]/g, '');
  if (digits.indexOf('91') === 0) digits = digits.slice(2);
  return /^[6-9][0-9]{9}$/.test(digits);
}
function isValidPrice(value) {
  var n = Number(value);
  return isFinite(n) && n > 0;
}
function isValidAreaSqFt(value) {
  var n = Number(value);
  return isFinite(n) && n > 0 && n <= 1000000;
}
