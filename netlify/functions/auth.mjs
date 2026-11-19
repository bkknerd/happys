// Staff sign-in for the editor at /admin.
//
// Decap opens this page in a popup when someone clicks "Staff sign in".
// The popup asks for the shared staff password. If it matches, the popup hands
// Decap a GitHub token so the editor can save changes, then closes.
//
// Two environment variables, set in Netlify (Site configuration → Environment variables):
//   ADMIN_PASSWORD  the staff password
//   GITHUB_TOKEN    a fine-grained GitHub token with Contents: read and write on bkknerd/happys
//
// Neither value lives in this repo, because the repo is public.

import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest();
const same = (a, b) => timingSafeEqual(sha(a), sha(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
};

const page = (body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>happy’s · staff sign in</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Hanken+Grotesk:wght@500;700&display=swap");
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font:500 16px/1.5 "Hanken Grotesk","Helvetica Neue",Arial,sans-serif;padding:24px}
form,.box{position:relative;width:100%;max-width:340px;background:#000;border:1.5px solid #fff;border-radius:16px;box-shadow:5px 5px 0 #f5c518;padding:24px}
h1{font:800 34px/.95 "Bricolage Grotesque","Arial Black",sans-serif;letter-spacing:-.04em;text-transform:lowercase;margin:0 0 16px}
label{display:block;font-weight:700;margin-bottom:6px}
input{width:100%;font:inherit;padding:11px 12px;border:1.5px solid #fff;border-radius:10px;background:#fff;color:#000}
input:focus{outline:3px solid #e8472b;outline-offset:2px}
button{margin-top:14px;width:100%;font:700 16px "Hanken Grotesk",sans-serif;padding:12px;border:1.5px solid #1d1410;border-radius:99px;background:#f5c518;color:#1d1410;cursor:pointer}
button:hover{background:#fff;color:#000}
.err{color:#ff8a7a;font-weight:700;margin:0 0 12px}
p{margin:0}
.smile{position:absolute;top:-34px;right:-22px;width:68px;height:auto;transform:rotate(12deg);pointer-events:none}
</style></head><body>${body}</body></html>`;

const form = (msg = '') => page(`
<form method="post" autocomplete="off">
  <svg class="smile" viewBox="4 0 92 127" aria-hidden="true"><g fill="#1d1410" stroke="#1d1410" stroke-width="6" stroke-linejoin="round"><circle cx="50" cy="44" r="40"/><path d="M23.0 64 C23.0 79.0 24.8 89.0 23.7 97.3 A7.7 7.7 0 0 0 35.3 97.3 C34.2 89.0 36.0 79.0 36.0 64 Z"/><path d="M39.0 64 C39.0 86.4 41.2 101.3 39.9 113.8 A9.2 9.2 0 0 0 54.1 113.8 C52.8 101.3 55.0 86.4 55.0 64 Z"/><path d="M58.0 64 C58.0 80.3 59.5 91.2 58.6 100.3 A6.7 6.7 0 0 0 68.4 100.3 C67.5 91.2 69.0 80.3 69.0 64 Z"/><path d="M72.0 58 C72.0 70.3 73.3 78.5 72.5 85.3 A5.7 5.7 0 0 0 80.5 85.3 C79.7 78.5 81.0 70.3 81.0 58 Z"/></g><g fill="#f5c518"><circle cx="50" cy="44" r="40"/><path d="M23.0 64 C23.0 79.0 24.8 89.0 23.7 97.3 A7.7 7.7 0 0 0 35.3 97.3 C34.2 89.0 36.0 79.0 36.0 64 Z"/><path d="M39.0 64 C39.0 86.4 41.2 101.3 39.9 113.8 A9.2 9.2 0 0 0 54.1 113.8 C52.8 101.3 55.0 86.4 55.0 64 Z"/><path d="M58.0 64 C58.0 80.3 59.5 91.2 58.6 100.3 A6.7 6.7 0 0 0 68.4 100.3 C67.5 91.2 69.0 80.3 69.0 64 Z"/><path d="M72.0 58 C72.0 70.3 73.3 78.5 72.5 85.3 A5.7 5.7 0 0 0 80.5 85.3 C79.7 78.5 81.0 70.3 81.0 58 Z"/></g><ellipse cx="38" cy="31" rx="5.6" ry="9.2" fill="#1d1410"/><ellipse cx="60.5" cy="31" rx="5.6" ry="9.2" fill="#1d1410"/><path d="M53.2 33 Q60.5 24 67.8 33" fill="none" stroke="#1d1410" stroke-width="4" stroke-linecap="round"/><path d="M25.5 48 Q49 71 73.5 48" fill="none" stroke="#1d1410" stroke-width="4" stroke-linecap="round"/><path d="M23.4 50.6 l4.2-5 M71.4 45.6 l4.2 5" fill="none" stroke="#1d1410" stroke-width="4" stroke-linecap="round"/></svg>
  <h1>staff sign in</h1>
  ${msg ? `<p class="err" role="alert">${msg}</p>` : ''}
  <label for="pw">Password</label>
  <input id="pw" name="password" type="password" required autofocus>
  <button type="submit">Sign in</button>
</form>`);

// The handshake Decap expects from an auth popup. The token only goes to a window on this same site.
const done = (status, payload) => page(`
<div class="box"><svg class="smile" viewBox="4 0 92 127" aria-hidden="true"><g fill="#1d1410" stroke="#1d1410" stroke-width="6" stroke-linejoin="round"><circle cx="50" cy="44" r="40"/><path d="M23.0 64 C23.0 79.0 24.8 89.0 23.7 97.3 A7.7 7.7 0 0 0 35.3 97.3 C34.2 89.0 36.0 79.0 36.0 64 Z"/><path d="M39.0 64 C39.0 86.4 41.2 101.3 39.9 113.8 A9.2 9.2 0 0 0 54.1 113.8 C52.8 101.3 55.0 86.4 55.0 64 Z"/><path d="M58.0 64 C58.0 80.3 59.5 91.2 58.6 100.3 A6.7 6.7 0 0 0 68.4 100.3 C67.5 91.2 69.0 80.3 69.0 64 Z"/><path d="M72.0 58 C72.0 70.3 73.3 78.5 72.5 85.3 A5.7 5.7 0 0 0 80.5 85.3 C79.7 78.5 81.0 70.3 81.0 58 Z"/></g><g fill="#f5c518"><circle cx="50" cy="44" r="40"/><path d="M23.0 64 C23.0 79.0 24.8 89.0 23.7 97.3 A7.7 7.7 0 0 0 35.3 97.3 C34.2 89.0 36.0 79.0 36.0 64 Z"/><path d="M39.0 64 C39.0 86.4 41.2 101.3 39.9 113.8 A9.2 9.2 0 0 0 54.1 113.8 C52.8 101.3 55.0 86.4 55.0 64 Z"/><path d="M58.0 64 C58.0 80.3 59.5 91.2 58.6 100.3 A6.7 6.7 0 0 0 68.4 100.3 C67.5 91.2 69.0 80.3 69.0 64 Z"/><path d="M72.0 58 C72.0 70.3 73.3 78.5 72.5 85.3 A5.7 5.7 0 0 0 80.5 85.3 C79.7 78.5 81.0 70.3 81.0 58 Z"/></g><ellipse cx="38" cy="31" rx="5.6" ry="9.2" fill="#1d1410"/><ellipse cx="60.5" cy="31" rx="5.6" ry="9.2" fill="#1d1410"/><path d="M53.2 33 Q60.5 24 67.8 33" fill="none" stroke="#1d1410" stroke-width="4" stroke-linecap="round"/><path d="M25.5 48 Q49 71 73.5 48" fill="none" stroke="#1d1410" stroke-width="4" stroke-linecap="round"/><path d="M23.4 50.6 l4.2-5 M71.4 45.6 l4.2 5" fill="none" stroke="#1d1410" stroke-width="4" stroke-linecap="round"/></svg><h1>${status === 'success' ? 'you’re in' : 'not set up'}</h1>
<p>${status === 'success' ? 'Taking you to the editor…' : 'Staff sign-in isn’t switched on yet. Ask Mike.'}</p></div>
<script>
(function () {
  var msg = 'authorization:github:${status}:' + ${JSON.stringify(JSON.stringify(payload))};
  if (!window.opener) return;
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || e.data !== 'authorizing:github') return;
    window.opener.postMessage(msg, location.origin);
    ${status === 'success' ? 'setTimeout(function () { window.close(); }, 300);' : ''}
  });
  window.opener.postMessage('authorizing:github', location.origin);
})();
</script>`);

export default async (req) => {
  const password = process.env.ADMIN_PASSWORD;
  const token = process.env.GITHUB_TOKEN;

  if (!password || !token) {
    return new Response(done('error', { message: 'Staff sign-in is not configured.' }), { status: 503, headers: HEADERS });
  }

  if (req.method === 'POST') {
    const data = await req.formData().catch(() => null);
    const given = data ? String(data.get('password') || '') : '';
    if (given && same(given.trim(), password)) {
      return new Response(done('success', { token, provider: 'github' }), { headers: HEADERS });
    }
    await sleep(1200); // slows down guessing
    return new Response(form('That password didn’t work.'), { status: 401, headers: HEADERS });
  }

  return new Response(form(), { headers: HEADERS });
};

export const config = { path: '/admin/auth' };
