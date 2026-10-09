---
name: pubky
description: How this site reads Pubky data (Nexus, homeservers, pubky:// URIs, deck manifests, profiles) and the rules that keep it safe. Use before changing assets/js/discover.js or assets/js/link.js, the deck or profile pages, or anything that fetches from nexus.pubky.app or homeserver.pubky.app, and when a question is about the Pubky stack (pkarr, homeservers, Pubky Ring, Paykit, Pubky Noise).
---

# Pubky on loopky.app

The site never writes to Pubky. It reads two public, CORS-open, unauthenticated
sources from the browser, and it treats everything it reads as written by a stranger.
`README.md` ("The Discover section is live" and "Shared links") explains why each
rule below exists. Read it before changing behaviour.

## The two sources

| Source | Base URL | What it answers |
|---|---|---|
| Pubky Nexus (the indexer) | `https://nexus.pubky.app` | Which URIs carry the `loopky-deck` label (`/v0/stream/resources`), profiles (`/v0/user/{pubky}`), avatars as web images (`/static/avatar/{pubky}`) |
| The homeserver | `https://homeserver.pubky.app` | The deck manifest itself, and a shallow listing of a person's decks |

The homeserver takes the account in a **`pubky-host` header**, not in the URL:

```js
fetch(HOMESERVER + '/pub/loopky/decks/' + encodeURIComponent(id) + '/manifest.json',
  { mode: 'cors', credentials: 'omit', headers: { 'pubky-host': pubky } })
```

A person's deck ids come from `/pub/loopky/decks/?shallow=true&limit=N` with the same
header. The site uses the one public homeserver for every account. The app resolves each
author's own homeserver through pkarr, which a static page cannot do cheaply. See the
comment above `HOMESERVER` in `assets/js/discover.js`.

## Shapes

- A pubky is 52 characters of z-base-32: `/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/`.
- A deck URI: `pubky://{pubky}/pub/loopky/decks/{deckId}/manifest.json` (`DECK_URI_RE`).
- Shared links: `/deck/?author={pubky}&id={deckId}` and `/profile/?pubky={pubky}`.
  These use query parameters, not paths, because Pages is static.

## Rules that are load-bearing

1. **A label proves nothing.** Anyone can tag any URI `loopky-deck`. A deck shows only
   when the URI parses as a deck manifest, the deck's author is among the label's
   taggers, and the manifest fetches and parses. A manifest whose `author_pubky` names
   someone else is refused (`deckFromManifest`).
2. **Nexus `skip` advances by the window asked for**, never by how many came back. Only
   an empty page means the end. Page by timeline, not by tagger count.
3. **No network value reaches `innerHTML`.** Build nodes and set `textContent`.
4. **Covers are `https://` URLs only.** An emoji or `pubky://` file cover has nothing for
   the web to show.
5. **An unnamed profile's name is the key itself.** Treat a name that matches the pubky
   pattern as no name.
6. **Failures stay local.** If Nexus or a homeserver is unreachable, that section says so
   and offers a retry. The rest of the page still works.

## Checking against the live network

Cloud sessions may block `*.pubky.app` and `pubky.org` at the network proxy. A 403 on
CONNECT means the environment's network policy, not the service. In that case say so
and don't guess what the live data looks like. Run `node tools/check.mjs` before
pushing.

## The wider stack, for design questions

- **pkarr**: a public key published as signed DNS records on the Mainline DHT. It points
  to the account's homeserver.
- **Homeserver**: per-account storage. `/pub/...` is world-readable. An account writes
  only to its own homeserver.
- **Pubky Ring**: the key manager. It approves apps through capability-based auth.
- **Paykit**: payment-method discovery under `/pub/paykit.app/v0/`, plus an interactive
  layer over Pubky Noise. Its docs say it is **not production-ready**.
- **Pubky Noise**: Noise channels keyed from Pubky identities. The endpoint is published
  at `/pub/paykit.app/v0/noise`.

Docs: https://docs.pubky.org. Confirm the current spec there before relying on Paykit
or Noise details, because they are still changing.
