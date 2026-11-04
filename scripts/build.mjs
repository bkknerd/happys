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
const SITE = 'https://happysnc.com/';

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of await readdir(root)) {
  if (!SKIP.has(name)) await cp(join(root, name), join(out, name), { recursive: true });
}

const PAGES = [
  { file: 'index.html', content: ['general', 'hours', 'menu', 'photos', 'events', 'reviews'], check: (d) => d.querySelectorAll('#menugrid .cat').length },
  { file: 'events.html', content: ['private-events', 'general'], check: (d) => d.querySelectorAll('#pe-crit li').length && d.querySelector('form[name="event-inquiry"]') ? 1 : 0 },
];

async function readContent(names) {
  const data = {};
  for (const f of names) {
    try { data[f] = JSON.parse(await readFile(join(root, 'content', f + '.json'), 'utf8')); }
    catch (e) { throw new Error(`content/${f}.json could not be read: ${e.message}`); }
  }
  return data;
}

const report = [];
for (const page of PAGES) {
  // 1. Bake the content into the page and drop the now-unneeded fetch preloads.
  const data = await readContent(page.content);
  let html = await readFile(join(root, page.file), 'utf8');
  html = html.replace(/<link rel="preload" href="content\/[^"]+" as="fetch" crossorigin>\n?/g, '');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const marker = '<script>\n/* Everything on this page';
  if (!html.includes(marker)) throw new Error(`${page.file}: could not find the page script to bake content into`);
  html = html.replace(marker, `<script id="content-data" type="application/json">${json}</script>\n${marker}`);

  // 2. Run the page's own renderer in a headless DOM.
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(html, {
    url: SITE + (page.file === 'index.html' ? '' : page.file),
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

  if (errors.length) throw new Error(`${page.file}: page script errors while pre-rendering:\n` + errors.join('\n'));
  if (doc.documentElement.classList.contains('no-content')) throw new Error(`${page.file}: content did not render`);
  if (!page.check(doc)) throw new Error(`${page.file}: rendered without its main content`);

  // 3. Leave nothing build-time-specific in the markup: today's row, fold state and date limits are set in the browser.
  doc.querySelectorAll('#hours tr.today').forEach((r) => r.classList.remove('today'));
  doc.querySelectorAll('.cat.closed').forEach((c) => c.classList.remove('closed'));
  doc.querySelectorAll('input[type=date][min]').forEach((i) => i.removeAttribute('min'));

  const outHtml = dom.serialize();
  dom.window.close();
  await writeFile(join(out, page.file), outHtml);
  report.push(`${page.file} ${(outHtml.length / 1024).toFixed(0)} KB`);
}

console.log('built dist/: ' + report.join(', '));
