# loopky.github.io

The landing page for [Loopky](https://github.com/jvsena42/loopky), a flashcards app
with spaced repetition. Static HTML, CSS and JavaScript. No build step: GitHub Pages
serves this repository as it is.

## What is here

```
index.html            the landing page
deck/index.html       where a shared deck link lands
profile/index.html    where a shared profile link lands
.well-known/assetlinks.json  lets Android open those links in the app
assets/css/style.css  the app's own palette, from LoopkyColors.kt
assets/js/i18n.js     copy in the 11 languages the app ships
assets/js/discover.js the live Discover feed, and the deck and profile reads
assets/js/app.js      language switching, filtering, rendering
assets/js/link.js     the deck and profile pages
assets/img/           icon, screenshots, share image
anki-alternative/ language-learning/ medical-students/ teachers/
ai-flashcards/ spaced-repetition/ compare/ faq/
                      the English guide pages, one per kind of learner
llms.txt              a summary of Loopky for language models
llms-full.txt         every guide as plain text, for language models
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

## Guides, search and AI assistants

The home page is one page in eleven languages, which gives a search engine one
page to rank for everything. The guides give it one page per question people
actually type: *Anki alternative*, *flashcards for language learning*,
*flashcards for medical students*, *flashcards for teachers*, *AI flashcard
maker*, *what is spaced repetition*, and a FAQ. The home page links to all of
them from its **Made for how you learn** section.

They are English only and plain HTML: no script, no language picker, nothing a
crawler has to run. Each carries its own canonical, Open Graph card, and JSON-LD
(`Article` or `WebPage`, `BreadcrumbList`, and `FAQPage` for the questions at the
bottom), and each is in `sitemap.xml`. The home page's JSON-LD describes the
organisation, the site and the app (`MobileApplication`, with a feature list and
the audiences it is for).

**Every claim in a guide was checked against the app repository**, including
the ones that make Loopky look worse: fixed intervals rather than FSRS or SM-2,
no audio or LaTeX from Anki, decks are public. Assistants quote these pages, and
a wrong answer quoted with confidence costs more than an honest limit. Keep
them true when the app changes.

For language models there is `llms.txt` (the [llms.txt](https://llmstxt.org)
convention: a summary, key facts, and links) and `llms-full.txt` (every guide as
plain text). `robots.txt` names the AI crawlers as welcome. The home page also
ships the English topic list and AI prompt in its markup rather than only
painting them from script, so a reader that runs no JavaScript still sees them.

`tools/check.mjs` holds all of this in place: each guide is stamped, listed in
the sitemap, indexable, has one `<h1>`, a title and a description; every JSON-LD
block parses; every loopky.app address in the two llms files exists; and the
prompt and topic list in the markup match `i18n.js`.

## Shared links

The app shares a deck as `https://loopky.app/deck/?author={pubky}&id={deckId}` and a
person as `https://loopky.app/profile/?pubky={pubky}`, rather than the bare
`pubky://` address it used to. Nothing on the web linkifies `pubky://`, pubky.app's
markdown included, so the old link was text a reader had to copy. An `https` link is
clickable everywhere, and it does the right thing on both sides of the install:

- **Loopky installed, on Android.** The app declares these paths as verified App
  Links, and Android checks `.well-known/assetlinks.json` before it agrees. With
  that in place the tap opens the deck in the app and this site is never loaded.
- **Loopky not installed.** The link lands here, on the landing site with the deck
  or the person on top: the same top bar, language picker and theme switch, the
  deck's cover, title, card count, topics and description read live off the
  author's homeserver, and the Google Play button. A profile lists that person's
  decks, from a shallow listing of their deck directory, each tile linking to its
  own deck page. A deck that has been deleted says so and keeps the whole landing
  page under it, and a link with no usable pubky or deck id in it is sent straight
  to the home page, since it names nothing to show.

On an Android browser the page adds an **Open in Loopky** button. It is an
`intent://` link wrapping the `pubky://` address with the package named and Google
Play as the fallback, so one tap opens the app if it is there and the store if it
is not. That button matters where App Links do not fire, which is mostly in-app
browsers. Elsewhere there is no Loopky to open (the iOS app is not out and the
desktop only has the CLI), so the button is not drawn and Google Play is the
primary action.

**Query parameters, not paths**, because Pages is static. `/deck/{pubky}/{id}`
would exist only as a `404.html` fallback, served with a 404 status that link
preview bots and crawlers take at its word. `/deck/` is a real file and answers
200 whatever follows the `?`.

**The preview card is generic, and cannot be anything else here.** A link preview
reads the page's Open Graph tags without running its script, and on a static host
every deck gets the same file. Per-deck titles and covers in a preview need
something that renders at request time. Both pages carry `noindex` and stay out of
the sitemap for the same reason: each is a template that answers for every deck.

### assetlinks.json

It lists two certificates today: the upload key and the debug key. **The Play App
Signing certificate still has to be added**, from Play Console under *Test and
release › App integrity › App signing key certificate* (the *Deep links* page
there shows the whole statement). A Play-installed app is signed with that key,
not the upload key, so until its SHA-256 is in the list, Android will refuse to
verify the domain for anyone who installed from the store and every link will
open the browser. That failure is silent: the browser shows this web page, which
looks like it works. On a device,
`adb shell pm get-app-links com.github.jvsena42.loopky` shows whether `loopky.app`
reads `verified`.

The deploy uses `upload-pages-artifact@v3`, which keeps dot-directories in the
artifact. v4 drops them unless the step sets `include-hidden-files: true`, and
`tools/check.mjs` fails on that combination, because the result would be every App
Link quietly turning back into a web page.

**There is no `apple-app-site-association` yet.** Universal Links need the Apple
Team ID in it, and the iOS project has none set
(`iosApp/Configuration/Config.xcconfig` in the app repository leaves `TEAM_ID`
empty). Once there is one, the file goes at
`.well-known/apple-app-site-association` with an `applinks` entry for `/deck/*`
and `/profile/*`, beside the app's associated-domains entitlement.

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

It covers `index.html`, `deck/index.html`, `profile/index.html` and the guide pages. Run it after touching any file under `assets/`; an unchanged file keeps its stamp, so
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
that order and the choice lives in `localStorage` under `loopky.theme`. It wears the
same pill as the language picker beside it and names the state it is in, because the
first version was an icon on its own and people walked past it. Under 420px the
label goes and the icon stands alone, which is where it was always easy to find: the
nav links are gone at that width and it sits next to the brand. No choice
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
stylesheet against each other, validates `assetlinks.json`, and refuses an em dash in anything a visitor reads. It covers the deck and profile pages as well as the home page.

```shell
node tools/layout-check.mjs
```

That one loads the real pages (home, a real deck, its author's profile, every guide) in headless Chrome at four widths and fails if it scrolls
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
