import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, '..', '..');

function pages() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'tools' || e.name === 'server') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk(siteRoot);
  return out;
}

function unlabeled(t, tag) {
  const spans = [...t.matchAll(/<label\b.*?<\/label>/gs)].map((m) => [m.index, m.index + m[0].length]);
  const fors = new Set([...t.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
  const bad = [];
  for (const m of t.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
    const attrs = m[1];
    if (tag === 'input') {
      const tm = attrs.match(/type="([^"]+)"/);
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(((tm && tm[1]) || 'text').toLowerCase())) continue;
    }
    if (attrs.includes('aria-label=') || attrs.includes('aria-labelledby=')) continue;
    const idm = attrs.match(/id="([^"]+)"/);
    if (idm && fors.has(idm[1])) continue;
    if (spans.some(([s, e]) => s <= m.index && m.index < e)) continue;
    bad.push(attrs.slice(0, 80));
  }
  return bad;
}

test('every page: lang, exactly one h1, main landmark, skip link', () => {
  const all = pages();
  assert.ok(all.length >= 650, `expected 650+ pages, got ${all.length}`);
  const problems = [];
  for (const p of all) {
    const t = readFileSync(p, 'utf-8');
    if (!/<html[^>]*\slang=/.test(t)) problems.push(`${p}: no lang`);
    const h1 = (t.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) problems.push(`${p}: ${h1} h1`);
    if (!t.includes('<main')) problems.push(`${p}: no <main>`);
    if (!t.includes('class="skip-link"')) problems.push(`${p}: no skip link`);
    if (!t.includes('id="main-content"')) problems.push(`${p}: main without id`);
  }
  assert.deepEqual(problems, []);
});

test('every image has an alt attribute', () => {
  const problems = [];
  for (const p of pages()) {
    const t = readFileSync(p, 'utf-8');
    for (const m of t.matchAll(/<img\b([^>]*)>/g)) {
      if (!m[1].includes('alt=')) problems.push(`${p}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every labelable control has a name (label or aria-label)', () => {
  const problems = [];
  for (const p of pages()) {
    const t = readFileSync(p, 'utf-8');
    for (const tag of ['input', 'select', 'textarea']) {
      for (const a of unlabeled(t, tag)) problems.push(`${p} <${tag}>: ${a}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('no empty links or buttons', () => {
  const problems = [];
  for (const p of pages()) {
    const t = readFileSync(p, 'utf-8');
    for (const m of t.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)) {
      if (!m[2].replace(/<[^>]+>/g, '').trim() && !m[1].includes('aria-label=')) problems.push(`${p}: empty link`);
    }
    for (const m of t.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)) {
      if (!m[2].replace(/<[^>]+>/g, '').trim() && !m[1].includes('aria-label=')) problems.push(`${p}: empty button`);
    }
  }
  assert.deepEqual(problems, []);
});

test('shared CSS defines focus-visible and skip-link styles', () => {
  const css = readFileSync(join(siteRoot, 'assets', 'css', 'base.css'), 'utf-8');
  assert.match(css, /:focus-visible\s*\{[^}]*outline/);
  assert.match(css, /\.skip-link\s*\{/);
  assert.match(css, /\.skip-link:focus/);
});
