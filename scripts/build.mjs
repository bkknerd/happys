// Deploy-time build for happy's.
// Copies the site into dist/, then pre-renders index.html with the content from /content baked in,
// so the first paint is complete and every crawler sees the menu, hours, events and schema.
// The page script still runs in the browser and re-renders over it (same content, fresh "today").
import { readFile, writeFile, rm, mkdir, cp, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const SKIP = new Set(['dist', 'node_modules', 'scripts', '.git', '.netlify', 'package.json', 'package-lock.json', 'README.md', '.gitignore', 'netlify.toml']);
const FILES = ['general', 'hours', 'menu', 'photos', 'events', 'reviews'];
const SITE = 'https://happysnc.com/';

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of await readdir(root)) {
  if (!SKIP.has(name)) await cp(join(root, name), join(out, name), { recursive: true });
}

// 1. Read every content file. A broken file fails the deploy instead of shipping a blank page.
const data = {};
for (const f of FILES) {
  const file = join(root, 'content', f + '.json');
  try { data[f] = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { throw new Error(`content/${f}.json could not be read: ${e.message}`); }
}

// 2. Bake the content into the page and drop the now-unneeded fetch preloads.
let html = await readFile(join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="preload" href="content\/[^"]+" as="fetch" crossorigin>\n?/g, '');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
html = html.replace('<script>\n/* Everything on this page', `<script id="content-data" type="application/json">${json}</script>\n<script>\n/* Everything on this page`);
if (!html.includes('id="content-data"')) throw new Error('could not find the page script to bake content into');

// 3. Run the page's own renderer in a headless DOM.
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));
const dom = new JSDOM(html, {
  url: SITE,
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    w.__PRERENDER__ = true;
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLDialogElement && (w.HTMLDialogElement.prototype.showModal ||= function () {});
  },
});
const doc = dom.window.document;
await new Promise((r) => setTimeout(r, 50)); // let the content promise resolve

if (errors.length) throw new Error('page script errors while pre-rendering:\n' + errors.join('\n'));
if (doc.documentElement.classList.contains('no-content')) throw new Error('content did not render');
const cats = doc.querySelectorAll('#menugrid .cat').length;
if (!cats) throw new Error('menu rendered empty');

// 4. Leave nothing build-time-specific in the markup: today's row and fold state are set in the browser.
doc.querySelectorAll('#hours tr.today').forEach((r) => r.classList.remove('today'));
doc.querySelectorAll('.cat.closed').forEach((c) => c.classList.remove('closed'));

const rows = doc.querySelectorAll('.lineup li').length;
const outHtml = dom.serialize();
dom.window.close();
await writeFile(join(out, 'index.html'), outHtml);

console.log(`built dist/: ${cats} menu sections, ${rows} lineup rows, ${(outHtml.length / 1024).toFixed(0)} KB index.html`);
