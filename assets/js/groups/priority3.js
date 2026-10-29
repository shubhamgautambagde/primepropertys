/* PrimePropertys — section behaviour: priority3 (runs after the shared bundle;
   guards optional elements; do not edit pages directly, edit this file and run
   tools/build.py). Live renderers for the Analytics dashboard, the AI
   description generator page and the SEO broken-links page. Every value
   shown comes from the API; when the server is unreachable or the user
   lacks permission, the box says so instead of showing demo numbers.
   AI text is never presented as published: generations stay 'generated'
   until a human approves them, and this page does not apply them. */
document.addEventListener('DOMContentLoaded', function () {
  function text(tag, str) {
    var el = document.createElement(tag);
    el.textContent = str == null ? '' : String(str);
    return el;
  }
  function inrPaise(paise) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((paise || 0) / 100); }
    catch (e) { return 'Rs ' + (paise || 0) / 100; }
  }

  var analyticsBox = document.getElementById('pp-analytics');
  if (analyticsBox && window.PP && window.PP.get) {
    analyticsBox.textContent = 'Loading live analytics…';
    window.PP.get('/api/analytics/summary').then(function (r) {
      analyticsBox.textContent = '';
      if (!r.ok || !r.data) {
        analyticsBox.textContent = 'Analytics load nahi ho pa rahi hain' +
          (r.error ? ' (' + (r.error.code || 'error') + '). Login karein; analytics:view permission chahiye.' : '.');
        return;
      }
      var d = r.data;
      analyticsBox.appendChild(text('h3', 'Live analytics (scope: ' + d.scope + ')'));
      analyticsBox.appendChild(text('p', 'Property views (events, Priority 3 se): ' + d.property_views.events +
        ' · Search events: ' + d.searches.events +
        ' · Published properties: ' + d.properties.published + ' / ' + d.properties.total));
      analyticsBox.appendChild(text('p', 'Inquiries: ' + d.inquiries.total +
        ' · Closed conversion: ' + (d.inquiries.conversion_closed_rate === null ? '— (koi inquiry nahi)' : (d.inquiries.conversion_closed_rate * 100).toFixed(1) + '%') +
        ' · Visits: ' + d.visits.total));
      analyticsBox.appendChild(text('p', 'Verified subscription-linked revenue: ' + inrPaise(d.revenue.total_paise) +
        ' (' + d.revenue.verified_linked_payments + ' verified payments). Unverified payments isme nahi gine jaate.'));
      analyticsBox.appendChild(text('p', 'Note: ' + (d.limitations || '')));
    });
  }

  var aiBox = document.getElementById('pp-ai');
  if (aiBox && window.PP && window.PP.get) {
    aiBox.textContent = '';
    aiBox.appendChild(text('h3', 'AI generations (live)'));
    var note = text('p', 'AI provider configure nahi hai to generation 503 AI_NOT_CONFIGURED dega — koi fake AI text nahi dikhaya jayega. Generated text publish nahi hota jab tak aap use approve karke apply na karein.');
    aiBox.appendChild(note);
    var form = document.createElement('form');
    var kindSel = document.createElement('select');
    ['description', 'title', 'seo'].forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = k; kindSel.appendChild(o);
    });
    var facts = document.createElement('textarea');
    facts.placeholder = 'Listing facts (ya property_id ke saath khaali chhodein)';
    facts.setAttribute('aria-label', 'Listing facts');
    var propInput = document.createElement('input');
    propInput.placeholder = 'Property ID (optional)';
    propInput.setAttribute('aria-label', 'Property ID');
    var btn = document.createElement('button');
    btn.type = 'submit'; btn.className = 'btn'; btn.textContent = 'Generate (human review ke liye)';
    var out = document.createElement('div');
    form.appendChild(kindSel); form.appendChild(facts); form.appendChild(propInput); form.appendChild(btn);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      out.textContent = 'Generating…';
      var body = { kind: kindSel.value, facts: facts.value };
      if (propInput.value.trim()) body.property_id = parseInt(propInput.value.trim(), 10);
      window.PP.post('/api/ai/generate', body).then(function (r) {
        if (!r.ok || !r.data) {
          out.textContent = 'Generation failed: ' + (r.error ? (r.error.code + ' — ' + r.error.message) : 'unknown error');
          return;
        }
        out.textContent = 'Generated (status: ' + r.data.status + ', approval pending): ' + r.data.output_text;
      });
    });
    aiBox.appendChild(form); aiBox.appendChild(out);
    window.PP.get('/api/ai/generations').then(function (r) {
      if (!r.ok || !r.data || !r.data.data) return;
      var list = document.createElement('ul');
      r.data.data.slice(0, 10).forEach(function (g) {
        var li = document.createElement('li');
        li.textContent = g.kind + ' · ' + g.status + ' · ' + (g.output_text || '').slice(0, 120);
        list.appendChild(li);
      });
      aiBox.appendChild(list);
    });
  }

  var seoBox = document.getElementById('pp-seo');
  if (seoBox && window.PP && window.PP.get) {
    seoBox.textContent = 'Loading live broken-link checks…';
    window.PP.get('/api/seo/broken-links').then(function (r) {
      seoBox.textContent = '';
      if (!r.ok || !r.data) {
        seoBox.textContent = 'Broken-link checks load nahi ho pa rahi hain' +
          (r.error ? ' (' + (r.error.code || 'error') + '). seo:manage permission chahiye.' : '.');
        return;
      }
      seoBox.appendChild(text('h3', 'Pages with broken internal links (actually checked)'));
      if (!r.data.data || !r.data.data.length) {
        seoBox.appendChild(text('p', 'Koi checked page me broken internal link nahi mila. Sirf wahi pages yahan aate hain jinka link-check chalaya gaya hai.'));
        return;
      }
      r.data.data.forEach(function (row) {
        seoBox.appendChild(text('p', row.path + ' — ' + row.broken_count + ' broken / ' + row.checked_links + ' checked'));
      });
    });
  }
});
