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

// Phone copy of the hero photo: the slice a phone actually shows (the 60% center framing used on phones),
// written next to the original as name-phone.webp.
const PHONE_MAX = 600;
const PHONE = `(max-width: ${PHONE_MAX}px)`;
async function phoneCrop(src) {
  if (/^(https?:)?\/\//.test(src)) return '';
  try {
    const { default: sharp } = await import('sharp');
    const file = join(root, src.replace(/^\//, ''));
    const img = sharp(file);
    const { width, height } = await img.metadata();
    const w = Math.min(width, Math.round(height * 0.75));
    if (!width || !height || w >= width * 0.9) return '';
    const left = Math.round((width - w) * 0.6);
    const outSrc = src.replace(/\.[a-z0-9]+$/i, '') + '-phone.webp';
    await mkdir(dirname(join(out, outSrc.replace(/^\//, ''))), { recursive: true });
    await sharp(file).extract({ left, top: 0, width: w, height }).webp({ quality: 72 }).toFile(join(out, outSrc.replace(/^\//, '')));
    return outSrc;
  } catch (e) {
    console.warn('hero phone crop skipped:', e.message);
    return '';
  }
}

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

  // 3b. The hero photo is the biggest thing on a phone screen. Preload it so it starts downloading
  // right away, and give phones a cut-down copy of just the part they show.
  const heroImg = doc.querySelector('.hero-photo img');
  const heroSrc = heroImg?.getAttribute('src') || '';
  if (heroSrc) {
    const css = doc.querySelector('link[rel=stylesheet]');
    const preload = (href, media) => {
      const pre = doc.createElement('link');
      pre.setAttribute('rel', 'preload');
      pre.setAttribute('as', 'image');
      pre.setAttribute('href', href);
      pre.setAttribute('fetchpriority', 'high');
      if (media) pre.setAttribute('media', media);
      css ? css.before(pre) : doc.head.append(pre);
    };
    const phone = await phoneCrop(heroSrc);
    if (phone) {
      preload(phone, PHONE);
      preload(heroSrc, `(min-width: ${PHONE_MAX + 1}px)`);
      const source = doc.createElement('source');
      source.setAttribute('media', PHONE);
      source.setAttribute('srcset', phone);
      source.setAttribute('data-for', heroSrc);
      heroImg.before(source);
    } else {
      preload(heroSrc);
    }
  }

  // 3c. The stylesheet is small (about 7 KB sent compressed), so it goes inside the page instead of
  // being a separate request the browser has to wait for before it can draw anything.
  const sheet = doc.querySelector('link[rel=stylesheet][href="css/site.css"]');
  if (sheet) {
    const cssText = (await readFile(join(root, 'css', 'site.css'), 'utf8')).replace(/url\(\.\.\//g, 'url(');
    const inline = doc.createElement('style');
    inline.textContent = cssText;
    sheet.replaceWith(inline);
  }

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
    // gtag.js waits until the page has loaded, so it doesn't compete with the hero photo on a slow phone connection.
    // The page view and any early clicks queue in dataLayer and are sent as soon as it arrives.
    : `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}');
function hpEv(n,p){gtag('event',n,p||{})}
(function(){function go(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${GA}';document.head.appendChild(s)}
if(document.readyState==='complete')go();else addEventListener('load',function(){setTimeout(go,0)})})();</script>`;
  const tag = `${loader}
<script>
(function(){
  function send(n,p){try{hpEv(n,p)}catch(e){}}
  // Where on the page a link sits: nav, footer, or the id of its section (hero, events, visit...).
  function where(a){if(a.closest('header,nav'))return 'nav';if(a.closest('footer'))return 'footer';var s=a.closest('section[id],[id^="pe-"]');return s?s.id:'page'}
  function txt(a){return (a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60)}
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a,button');if(!a)return;
    var h=a.getAttribute('href')||'',p={link_location:where(a),link_text:txt(a)};
    if(h.indexOf('tel:')===0){p.link_url=h;send('call_click',p)}
    else if(h.indexOf('mailto:')===0)send('email_click',p);
    else if(a.hasAttribute('data-maps')||/google\\.[^/]+\\/maps/.test(h))send('get_directions',p);
    else if(h.indexOf('instagram.com')>-1)send('instagram_click',p);
    else if(/share\\.google|google\\.com\\/maps\\/place|g\\.page/.test(h))send('google_profile_click',p);
    else if(h.indexOf('yelp.com')>-1)send('yelp_click',p);
    else if(h.indexOf('facebook.com')>-1)send('facebook_click',p);
    else if(/#events$/.test(h)){p.source_page=location.pathname;send('events_nav_click',p)}
    else if(/events\\.html/.test(h)){p.source_page=location.pathname;send('book_event_click',p)}
    else if(a.closest('#chips'))send('menu_filter',{category:txt(a).toLowerCase()});
  },true);
  // sign_up and generate_lead are sent by the forms themselves, only after Netlify confirms the send.
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
