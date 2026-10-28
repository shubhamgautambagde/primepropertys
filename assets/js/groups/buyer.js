/* PrimePropertys — section behaviour: buyer (runs after the shared bundle; guards optional elements; do not edit pages directly, edit this file and run tools/build.py) */
function inr(n){return 'Rs ' + Math.round(n).toLocaleString('en-IN');}
function calcROI(){
  var p=+document.getElementById('roiPrice').value||0, rent=+document.getElementById('roiRent').value||0,
      stamp=+document.getElementById('roiStamp').value||0, other=+document.getElementById('roiOther').value||0,
      yrs=+document.getElementById('roiYears').value||20, appr=+document.getElementById('roiAppr').value||6,
      growth=+document.getElementById('roiGrowth').value||5;
  var total=p+stamp+other, future=p*Math.pow(1+appr/100,yrs),
      rentSum=0, r=rent*12; for(var i=0;i<yrs;i++){ rentSum+=r; r*=1+growth/100; }
  var expenses=other*yrs*0.2, net=future-p+rentSum-expenses, roi=total?net/total*100:0;
  var el=document.getElementById('roiResult'); if(el){el.style.display='block';
    el.innerHTML='<strong>Estimated ROI: '+roi.toFixed(2)+'% over '+yrs+' years</strong><br>Total investment '+inr(total)+' | Future value '+inr(future)+' | Total rent '+inr(rentSum)+' | Net profit '+inr(net)+' | Gross yield '+((rent*12/p*100)||0).toFixed(2)+'%';}
}
function calcYield(){
  var p=+document.getElementById('yPrice').value||0, rent=+document.getElementById('yRent').value||0, exp=+document.getElementById('yExp').value||0;
  var gross=p?rent*12/p*100:0, net=p?(rent*12-exp)/p*100:0, el=document.getElementById('yieldResult');
  if(el){el.style.display='block'; el.innerHTML='<strong>Gross yield '+gross.toFixed(2)+'% | Net yield '+net.toFixed(2)+'%</strong><br>Annual rent '+inr(rent*12)+' | Annual expenses '+inr(exp);}
}
function calcAppr(){
  var p=+document.getElementById('aPrice').value||0, rate=+document.getElementById('aRate').value||0, yrs=+document.getElementById('aYears').value||0;
  var future=p*Math.pow(1+rate/100,yrs), el=document.getElementById('appResult');
  if(el){el.style.display='block'; el.innerHTML='<strong>Future value: '+inr(future)+'</strong><br>Gain '+inr(future-p)+' over '+yrs+' years at '+rate+'% p.a.';}
}
