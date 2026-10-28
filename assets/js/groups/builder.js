/* PrimePropertys — section behaviour: builder (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
var ps=document.getElementById('pageSearch');
  if(ps){ps.addEventListener('input',function(){var q=ps.value.trim().toLowerCase();
    document.querySelectorAll('.filter-row').forEach(function(r){r.style.display=(!q||r.textContent.toLowerCase().indexOf(q)!==-1)?'':'none';});});}
  document.querySelectorAll('[data-approve]').forEach(function(b){b.addEventListener('click',function(){var s=b.closest('tr');if(s){var st=s.querySelector('.status');if(st){st.textContent=b.getAttribute('data-approve');st.className='status '+(b.getAttribute('data-approve')==='Approved'?'ok':'bad');}}});});
