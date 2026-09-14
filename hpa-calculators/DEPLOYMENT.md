# Deploying to GitHub Pages

The calculators are plain HTML, CSS and JavaScript. No build step, no
dependencies, no server. Any static host will serve them; these are the steps
for GitHub Pages.

## 1. Create the repository

At github.com create a new repository, for example `hpa-calculators`.

On a free plan it **must be public** for Pages to serve it. Pages on a private
repository needs a paid plan.

## 2. Push

From inside this folder:

```bash
git init
git add .
git commit -m "HPA calculators"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/hpa-calculators.git
git push -u origin main
```

## 3. Turn Pages on

In the repository: **Settings → Pages → Build and deployment**.

- Source: **Deploy from a branch**
- Branch: **main**, folder **/ (root)**
- Save

A minute or two later the calculators are live:

```
https://YOUR-ORG.github.io/hpa-calculators/calculators/engine-displacement/
```

Open `preview.html` on the live site to see all seven embedded at once. It is
the quickest way to confirm a deploy worked.

## 4. Custom domain, optional

To serve from `calculators.hpacademy.com` instead:

1. At your DNS provider add a **CNAME** record for `calculators` pointing at
   `YOUR-ORG.github.io`
2. In **Settings → Pages → Custom domain**, enter the domain and save
3. Wait for the certificate, then tick **Enforce HTTPS**

Do this before setting up the embed if you can. The origin is written into the
parent script, and changing it later means editing the site template again.

## 5. Embed them

See [EMBEDDING.md](EMBEDDING.md).

## Updating later

Edit, commit, push. Pages redeploys on its own, usually within a minute.

Bump `shared/version.js` when you do. The build number prints in the footer
and on every printed sheet, so a support question can be tied to an exact
version.

## What is in here

| Path | |
| --- | --- |
| `calculators/` | One folder per calculator, each self-contained |
| `shared/` | Design tokens, stylesheet, and the small modules every calculator uses |
| `preview.html` | All seven embedded at once, for checking a deploy |
| `test/` | Verification suite, see below |
| `EMBEDDING.md` | Putting a calculator on a Silverstripe page |

### About the test folder

`test/` and the `cases*.json` files beside each calculator hold the
verification suite: 96 parity checks that pin the arithmetic against the
original spreadsheets, 263 structure checks, and 59 runtime checks that drive
a real browser.

They are served publicly along with everything else, which is harmless: about
35 KB, nothing links to them, and they contain no secrets. Keeping them in the
repository is worth far more than the bytes, because they are what makes a
change to the physics safe to attempt.

To run them you need Node and Playwright:

```bash
npm install -g playwright && playwright install chromium
node test/all.mjs
```

If you would rather not serve them, delete `test/` and `calculators/*/cases*.json`
before pushing. Nothing else references them.

## Why `.nojekyll`

GitHub Pages runs Jekyll over a repository by default, which ignores files and
folders beginning with an underscore. Nothing here starts with one, so the file
is precautionary rather than load-bearing, but it costs nothing and removes a
whole class of surprise later.
