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
```

## The Discover section is live

It reads the [Pubky Nexus](https://nexus.pubky.app) indexer straight from the browser,
the same public API the app uses. Two endpoints, because neither is complete alone:

- `/v0/stream/resources?app=loopky&tags=loopky-deck` lists every published deck
  manifest with its topics and its follower count.
- `/v0/stream/posts?tags=loopky-deck` carries the announcement post, which is where a
  deck's title and cover actually live. The manifest itself sits on a homeserver behind
  a `pubky://` address, and a browser has no way to open one.

A deck appears only when both sources agree on it, so nothing ever renders untitled.
Everything read back was written by a stranger, so no network value reaches `innerHTML`.

If the indexer is unreachable the section says so and the rest of the page is unaffected.

## Language

English is the default. The picker covers the same languages as the app: English,
Português, Español, Français, Deutsch, Italiano, 日本語, 한국어, Tiếng Việt,
简体中文, 繁體中文.

The choice comes from `?lang=`, then `localStorage`, then the browser. Every language
has its own `hreflang` and its own entry in `sitemap.xml`.

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
asset and `hreflang` the page references exists, and refuses an em dash in anything a
visitor reads. Adding a string means adding it to all eleven dictionaries, and
forgetting one is the mistake this repo invites: the page falls back to English
silently, so nothing looks broken. That is the check worth having.

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
`assets/css/style.css`.
