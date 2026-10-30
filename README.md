# happy’s — site + CMS

The site is static, with no build step. Every word, price, hour and photo lives in `content/*.json`, and the owner edits those through Decap CMS at `/admin`.

```
index.html          the page (design + code, rarely touched)
content/            everything the owner can change
  general.json      contact, top of the page, storefront photo, email signup, the walk up, footer
  hours.json        open days and times
  menu.json         menu sections and items
  photos.json       the "lately at happy's" strip
  events.json       event cards, the monthly music lineup and poster
  reviews.json      rating, tags, quotes
images/uploads/     photos (new uploads from the CMS land here too)
admin/              the CMS (index.html + config.yml)
netlify.toml        hosting settings (headers, /admin redirect)
404.html            "wrong door" page
robots.txt, sitemap.xml, favicon.svg
```

## Going live (one time, about 20 minutes)

### 1. GitHub
Create an empty repo, for example `happys-site`, with no README. Then, from inside this folder:

```
git remote add origin https://github.com/YOUR-USER/happys-site.git
git push -u origin main
```

(This folder is already a git repo with one commit on `main`.)

### 2. Point the CMS at the repo
Open `admin/config.yml` and change `repo: OWNER/happys-site` to your real `user/happys-site`. Commit and push.

### 3. Netlify
- **Add new site → Import an existing project → GitHub →** pick the repo.
- Leave the build command blank. The publish directory is `.`, and `netlify.toml` already sets that.
- Deploy.

### 4. Turn on the email signup
- In Netlify, open **Forms** and click **Enable form detection**. Then trigger one more deploy (Deploys → Trigger deploy) so Netlify picks up the `newsletter` form.
- Under **Forms → Form notifications**, add an email notification to the owner's address. Without one, signups only pile up in the Netlify dashboard.
- Spam is filtered with a hidden honeypot field.

### 5. CMS sign-in
- On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
  - Homepage URL: `https://happysnc.com`
  - Authorization callback URL: `https://api.netlify.com/auth/done`
- In Netlify, go to **Site configuration → Access & security → OAuth → Install provider → GitHub**, and paste the Client ID and Secret.

### 6. Domain
In Netlify, go to **Domain management → Add a domain** and add `happysnc.com`, then follow the DNS steps. HTTPS turns on by itself.

### 7. Give the owner access
Add the owner's GitHub account as a collaborator on the repo. They sign in at `happysnc.com/admin` with **Login with GitHub**.

Each save in the CMS commits to the repo, and Netlify redeploys in under a minute.

## Editing on your own machine

```
npx decap-server        # in this folder, leave it running
npx serve .             # or any static server, in a second terminal
```

Open `http://localhost:3000/admin` and click **Login**. Changes write straight to the files here; that's what the `local_backend: true` line in the config does.

Opening `index.html` by double-clicking won't work: the page loads its content with `fetch`, which needs a server. The email signup only works on Netlify.

## Notes

- **Hours:** list only the days you're open; any day left out shows as "closed". Write times like `4pm`, `12am` or `11:30pm`. The week, the footer, today's highlight and the Google schema all come from this one list.
- **Music lineup:** each month, go to Events → live music, replace the rows and upload the new poster. Past dates cross themselves out and the next show is marked. Upcoming shows also go into the page's search data as events.
- **Colors** are picked by name (yellow, pink, blue, orange, lavender, mint), so cards always stay on-brand.
- **Photos:** square, at least 900px wide. Five fills the row.
- **Events:** delete every card and the section and its nav link disappear.
- **Search tags** (`<title>`, description, share tags) live in the `<head>` of `index.html`, not in the CMS, so link previews work even for crawlers that don't run JavaScript.
- **Decap version** is pinned to 3.17.3 in `admin/index.html`. Bump it on purpose, not by accident.
- **Why not Git Gateway / Netlify Identity:** Netlify Identity is supported again (Feb 2026), but Git Gateway, the piece Decap needs to use it, is still deprecated. The GitHub backend avoids it. The trade-off is that each editor needs a GitHub account.
