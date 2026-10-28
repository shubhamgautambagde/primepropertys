/* PrimePropertys — section behaviour: search (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
document.querySelectorAll('.js-remove').forEach(function(b){b.addEventListener('click',function(){var c=b.closest('.prop-row, .card, tr'); if(c) c.remove();});});
document.querySelectorAll('.alert-toggle').forEach(function(b){b.addEventListener('click',function(){b.textContent = b.textContent.indexOf('On')!==-1 ? 'Alerts: Off' : 'Alerts: On'; b.classList.toggle('outline');});});
