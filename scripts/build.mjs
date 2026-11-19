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
const SKIP = new Set(['dist', 'analytics', 'node_modules', 'scripts', '.git', '.netlify', 'package.json', 'package-lock.json', 'README.md', '.gitignore', 'netlify.toml']);
const SITE = 'https://happysnc.com/';

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of await readdir(root)) {
  if (!SKIP.has(name)) await cp(join(root, name), join(out, name), { recursive: true });
}

const PAGES = [
  { file: 'index.html', content: ['general', 'hours', 'menu', 'photos', 'events', 'reviews', 'flyers', 'closure'], check: (d) => d.querySelectorAll('#menugrid .cat').length },
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

// 4. Analytics: Google Tag Manager or GA4, set at /admin → Contact, hero & the rest → Analytics.
// With a GTM container, GA4 lives inside GTM so nothing is counted twice.
const general = JSON.parse(await readFile(join(root, 'content', 'general.json'), 'utf8'));
const GTM = String(general.analytics?.gtm_id || '').trim();
const GA = String(general.analytics?.ga4_id || '').trim();
if (GTM && !/^GTM-[A-Z0-9]+$/.test(GTM)) throw new Error(`content/general.json: "${GTM}" is not a Tag Manager ID (it should look like GTM-AB12CD3)`);
if (GA && !/^G-[A-Z0-9]+$/.test(GA)) throw new Error(`content/general.json: "${GA}" is not a GA4 Measurement ID (it should look like G-AB12CD34EF)`);
if (GTM || GA) {
  // Page views and enhanced measurement come from GA itself. The listener adds the actions that matter for a bar:
  // calls, directions, Instagram, email, event-booking clicks, menu filters, sign-ups, event inquiries, and which sections get seen.
  // With GTM each one is a dataLayer event ({event:'call_click', ...}); with GA4 alone it goes straight to gtag.
  const loader = GTM
    ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM}');</script>
<script>function hpEv(n,p){var o={event:n};for(var k in p||{})o[k]=p[k];window.dataLayer.push(o)}</script>`
    : `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}');
function hpEv(n,p){gtag('event',n,p||{})}</script>`;
  const tag = `${loader}
<script>
(function(){
  function send(n,p){try{hpEv(n,p)}catch(e){}}
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a,button');if(!a)return;
    var h=a.getAttribute('href')||'';
    if(h.indexOf('tel:')===0)send('call_click',{link_url:h});
    else if(h.indexOf('mailto:')===0)send('email_click');
    else if(a.hasAttribute('data-maps')||/google\\.[^/]+\\/maps/.test(h))send('get_directions');
    else if(h.indexOf('instagram.com')>-1)send('instagram_click');
    else if(/events\\.html/.test(h))send('book_event_click',{link_text:(a.textContent||'').trim().slice(0,60)});
    else if(a.closest('#chips'))send('menu_filter',{category:(a.textContent||'').trim().toLowerCase()});
  },true);
  document.addEventListener('submit',function(e){
    var f=e.target,n=f.getAttribute('name');
    if(n==='newsletter')send('sign_up',{method:'newsletter'});
    else if(n==='event-inquiry'&&(!f.checkValidity||f.checkValidity()))send('generate_lead',{form_name:'event-inquiry'});
  },true);
  function watch(){if(!('IntersectionObserver' in window))return;
    var seen={},io=new IntersectionObserver(function(es){es.forEach(function(x){var id=x.target.id;if(x.isIntersecting&&!seen[id]){seen[id]=1;send('view_section',{section:id});io.unobserve(x.target)}})},{rootMargin:'0px 0px -40% 0px'});
    ['menu','events','reviews','visit'].forEach(function(id){var el=document.getElementById(id);if(el)io.observe(el)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
})();
</script>
`;
  const noscript = GTM ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n` : '';
  for (const file of ['index.html', 'events.html', '404.html']) {
    const p = join(out, file);
    let html = await readFile(p, 'utf8');
    html = html.replace(/<head>\s*/i, (m) => m + tag);
    if (noscript) html = html.replace(/<body[^>]*>\s*/i, (m) => m + noscript);
    await writeFile(p, html);
  }
  report.push(GTM ? 'GTM ' + GTM : 'GA ' + GA);
}

console.log('built dist/: ' + report.join(', '));
