# loopky.github.io

The landing page for [Loopky](https://github.com/jvsena42/loopky), a flashcards app
with spaced repetition. Static HTML, CSS and JavaScript. No build step: GitHub Pages
serves this repository as it is.

## What is here

```
index.html            the whole page
assets/css/style.css  the app's own palette, from LoopkyColors.kt
assets/js/i18n.js     copy in the 11 languages the app ships
assets/js/discover.js the live Discover feed
assets/js/app.js      language switching, filtering, rendering
assets/img/           icon, screenshots, share image
tools/check.mjs       the pre-flight CI runs
tools/layout-check.mjs  fails if the page scrolls sideways
tools/stamp-assets.mjs  content hashes on the asset URLs
tools/set-site-url.mjs  moves every published URL at once
```

## The Discover section is live

It is a port of `DiscoveryRepositoryImpl.decksByTagGlobalPage`, the app's global
browse, and it reads what that reads. Two public sources, both CORS-open and both
unauthenticated:

- **[Pubky Nexus](https://nexus.pubky.app)** answers which URIs carry the
  `loopky-deck` label, via `/v0/stream/resources`. That is all it answers: a deck
  manifest is a generic resource to the indexer, so there is no title in there.
- **The homeserver** serves the manifest itself over plain HTTPS. A deck's `pubky://`
  address names a homeserver and a path, and the homeserver takes the pubky in a
  `pubky-host` header rather than in the URL. Title, card count, topics and cover all
  live here. This is the app's `deckRepository.fetchRemote`, and the reason the page
  can show a real card count next to a real title.

Three details are carried over from the app because each one is load-bearing:

- **`skip` advances by the window asked for, never by what came back.** It is an
  offset into the indexer's raw sorted set, and Nexus drops a subject whose details no
  longer resolve, so a page is routinely shorter than the limit with more behind it.
  Only an empty page means the end.
- **Paging is sorted by timeline, not by tagger count.** The tagger-count ordering
  shifts under paging.
- **A label proves nothing.** Anyone may tag any URI `loopky-deck`, so the URI has to
  parse as a deck manifest, the deck's own author has to be among that label's
  taggers, and the manifest has to fetch and parse. A forged entry is then useless
  rather than merely unlikely.

That last check is also what keeps deleted decks out. The first version of this
section read deck announcements from the post index instead, which was wrong three
ways at once: it found 15 of the 37 published decks, it had covers for 7 of them, and
five of the decks it showed had been deleted by their authors, because a post outlives
the deck it announces. Reading manifests gives all 36 that resolve, 33 covers, and a
card count for every one.

Decks are fetched six at a time and the grid fills as they land. Everything read back
was written by a stranger, so no network value reaches `innerHTML`. If the indexer is
unreachable the section says so, offers a retry, and the rest of the page is
unaffected.

**A deck without a picture has none to find.** A cover reaches the web only when its
author published one as an `https://` URL; an emoji cover, or a picture imported as a
blob from an `.apkg`, never leaves the homeserver. Those decks get their emoji on a
tint picked from the deck's own address, so a grid of them reads as a design rather
than as images that failed to load.

**One homeserver is hardcoded.** The app resolves each author's own through pkarr,
which needs a signed-packet parse and a second resolution this page should not carry.
Every account on the network today is on the public homeserver; a deck hosted
elsewhere is left out, the same as one that was deleted. If that stops being a
rounding error, `HOMESERVER` in `assets/js/discover.js` is the line to fix.

## Caching

Pages serves the page and its assets with the same `max-age=600` and no
fingerprinting, and a browser expires each on its own clock. A deploy that adds a
string can therefore leave a returning visitor holding the new markup next to a
ten-minute-old `i18n.js`, which is how `feat.cli.t` once got painted into a card
where its title belonged.

Two things settle it, and both are wanted. The asset URLs carry a hash of their own
contents, so new markup names a script the cache has never seen:

```shell
node tools/stamp-assets.mjs
```

Run it after touching any file under `assets/`; an unchanged file keeps its stamp, so
it is safe to run always, and `tools/check.mjs` fails when a stamp and its file
disagree. And a key that resolves nowhere now leaves the markup's own English
standing rather than painting its name, so the worst case is an untranslated card
rather than a broken one.

## Language

English is the default. The picker covers the same languages as the app: English,
Português, Español, Français, Deutsch, Italiano, 日本語, 한국어, Tiếng Việt,
简体中文, 繁體中文.

The choice comes from `?lang=`, then `localStorage`, then the browser. Every language
has its own `hreflang` and its own entry in `sitemap.xml`.

The slogan is the exception and stays English everywhere. `strings.xml` declares
`brand_tagline` as `translatable="false"` and the app shows the English line in every
locale, so `hero.title` and `cta.title` are one `SLOGAN` constant rather than eleven
strings. `tools/check.mjs` fails if any locale translates it.

## Light and dark

The top bar carries a switch with three states: system, light, dark. It cycles in
that order and the choice lives in `localStorage` under `loopky.theme`. No choice
stored means no `data-theme` attribute on `<html>`, and the page follows the
system, including when the system turns dark at sunset. A two-way switch has no way
back to that once it has been touched, which is why there are three.

An inline script in the `<head>` puts a stored choice on `<html>` before the first
paint. Without it the page draws the system theme and then flips in front of the
visitor.

The dark palette is therefore spelled twice in `assets/css/style.css`: once under
`@media (prefers-color-scheme: dark)` for the system, once under
`:root[data-theme="dark"]` for the choice. CSS cannot share one block between a
media query and an attribute, so `tools/check.mjs` compares the two and fails when
only one was edited. The media query is scoped to
`:root:not([data-theme="light"])`, so a visitor who picked light stays there on a
machine set to dark.

`color-scheme` follows along, which is what makes the native parts the browser
paints itself, the language dropdown and the scrollbars, match the page. The two
`theme-color` meta tags are keyed to the system in the markup; an explicit choice
flips one to `all` and the other to `not all`, so the address bar follows too.

## Working on it

```shell
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Before pushing, run the same check CI runs. It
needs nothing but Node:

```shell
node tools/check.mjs
```

It parses every script, holds the eleven dictionaries against each other and against
the page, confirms the AI prompt still names real CLI commands, checks that every
asset and `hreflang` the page references exists, holds the two dark palettes in the
stylesheet against each other, and refuses an em dash in anything a visitor reads.

```shell
node tools/layout-check.mjs
```

That one loads the real page in headless Chrome at four widths and fails if it scrolls
sideways. It exists because a wrapper around the topic chips once stretched that row
to 1679px at every viewport and took the page's width with it, and no screenshot
showed it: a cropped screenshot of an overflowing page looks exactly like a cropped
screenshot of a correct one. It skips with a note when no Chrome is installed. Adding a string means adding it to all eleven dictionaries, and
forgetting one is the mistake this repo invites: the page falls back to English
silently, so nothing looks broken. That is the check worth having.

## Where this serves

<https://loopky.app/>

The domain is a custom one, set three places that have to agree:

- `CNAME` at the repository root, holding the bare domain and nothing else. It is
  part of the published artifact, which is how GitHub learns the domain when the
  deploy is a workflow rather than a branch.
- DNS: four `A` and four `AAAA` records on the apex pointing at GitHub Pages, and
  `www` as a `CNAME` to `jvsena42.github.io.` so GitHub can redirect it to the apex.
  A `CAA` record narrows certificate issuance to Let's Encrypt, which is the CA Pages
  uses.
- Every absolute URL the page publishes about itself.

Only that last one lives in these files, and everything the browser loads is a
relative path, so the page itself works under any prefix untouched. What cares is the
part search engines read: the canonical link, the Open Graph and Twitter cards, the
eleven `hreflang` alternates, the JSON-LD, the sitemap and `robots.txt`. One command
moves them together:

```shell
node tools/set-site-url.mjs https://loopky.app/
```

`tools/check.mjs` fails if those addresses drift apart, which is what a half-applied
move looks like.

`.app` is on the HSTS preload list, so browsers refuse plain HTTP for it and there is
no insecure fallback while a certificate is being issued. A domain change means the
site is unreachable until Pages has one, usually minutes.

## CI and deploying

`.github/workflows/pages.yml` runs `tools/check.mjs` on every push and pull request,
then deploys `main` to Pages. It also asks the indexer the two questions the Discover
section asks, and logs what came back. That one is a warning, never a failure: the
network being down is not a reason to block a deploy.

The deploy job turns Pages on itself the first time, via `enablement: true`, so the
repository needs no click in Settings. If you would rather serve the branch directly,
set **Settings → Pages → Source** to **Deploy from a branch** (`main`, `/`) and delete
the `deploy` job. The `check` job is worth keeping either way.

## Colours

Taken from `androidApp/.../ui/theme/LoopkyColors.kt` in the app repository, light
palette and dark, as CSS custom properties. A change there wants the same change in
`assets/css/style.css`, and a change to a dark token wants it in both of the two dark
blocks. See [Light and dark](#light-and-dark).
