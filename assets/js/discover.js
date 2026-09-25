/* Discover, reading what the app's Discover tab reads.
 *
 * `DiscoveryRepositoryImpl.decksByTagGlobalPage` is the thing being ported, and it
 * is two public reads, both CORS-open and both unauthenticated:
 *
 *   Pubky Nexus     /v0/stream/resources answers "which URIs carry the loopky-deck
 *                   label". That is all it answers. A deck manifest is a generic
 *                   resource to the indexer, so there is no title in here.
 *
 *   The homeserver  the manifest itself, over plain HTTPS. A deck's pubky:// address
 *                   names a homeserver and a path, and the homeserver takes the pubky
 *                   in a `pubky-host` header rather than in the URL. Title, card
 *                   count, topics and cover all live here, and this fetch is what the
 *                   app calls `deckRepository.fetchRemote`.
 *
 * A label proves nothing on its own: anyone may tag any URI with `loopky-deck`, so
 * the app verifies before it will draw a deck, and so does this. The URI has to be
 * shaped like a deck manifest, the deck's own author has to be among the taggers, and
 * the manifest has to fetch and parse. A forged entry is then useless rather than
 * merely unlikely, and a deck whose author has deleted it stops appearing.
 *
 * Everything below was written by a stranger. Nothing is ever put in innerHTML.
 */

var NEXUS = 'https://nexus.pubky.app';

/* The public homeserver, which is where every account on the network today lives.
 * The app resolves each author's own homeserver through pkarr, which needs a
 * signed-packet parse and a second resolution that a page this size should not carry.
 * A deck hosted elsewhere fails this fetch and is left out, the same as one that was
 * deleted; if that ever stops being a rounding error, this is the line to fix. */
var HOMESERVER = 'https://homeserver.pubky.app';

var DECK_TAG = 'loopky-deck';
var FOLLOW_TAG = 'loopky-followed';
var DECK_URI_RE = /^pubky:\/\/([a-z0-9]{52})(\/pub\/loopky\/decks\/([^/\s]+)\/manifest\.json)$/;

/* Subjects per indexer request. 50 is the endpoint's ceiling. */
var WINDOW = 50;

/* Pages to ask for before giving up on there being more. The app caps its refill
   loop the same way, so a wedged indexer cannot spin here. */
var MAX_REQUESTS = 6;

/* Manifest fetches in flight at once. The grid renders as they land, so this is
   about not opening fifty sockets on a phone rather than about total time. */
var FETCH_CONCURRENCY = 6;

function getJson(url, headers) {
  return fetch(url, { mode: 'cors', credentials: 'omit', headers: headers || undefined })
    .then(function (r) {
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      return r.json();
    });
}

function isReserved(label) {
  return label.toLowerCase().indexOf('loopky-') === 0;
}

/* An emoji, or the app's own fallback. Some decks carry a mangled cover character;
   anything plain-ASCII is not the emoji it claims to be. */
function coverEmoji(raw) {
  if (!raw) return '📚';
  return /^[\x00-\x7F]+$/.test(raw) ? '📚' : raw;
}

function webCover(url) {
  return typeof url === 'string' && url.indexOf('https://') === 0 ? url : null;
}

/* ---------------- the indexer: which URIs claim to be decks ---------------- */

/**
 * One page of subjects carrying [DECK_TAG].
 *
 * Sorted by timeline rather than by tagger count, because `skip` is an offset into
 * the indexer's sorted set and the tagger-count ordering shifts under paging.
 */
function taggedSubjects(skip) {
  var url = NEXUS + '/v0/stream/resources?app=loopky&tags=' + DECK_TAG +
    '&sorting=timeline&limit=' + WINDOW + '&skip=' + skip;
  return getJson(url).then(function (list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (r) {
      var tags = r.tags || [];
      var mine = null;
      var follows = 0;
      var topics = [];
      for (var i = 0; i < tags.length; i++) {
        if (tags[i].label === DECK_TAG) mine = tags[i];
        else if (tags[i].label === FOLLOW_TAG) follows = tags[i].taggers_count || 0;
        else if (!isReserved(tags[i].label)) topics.push(tags[i].label);
      }
      return {
        uri: (r.details && r.details.uri) || '',
        /* The taggers of this label, not of the subject: the resource-level list
           spans every label on it. */
        taggers: (mine && mine.taggers) || [],
        follows: follows,
        topics: topics,
        at: (r.details && r.details.indexed_at) || 0,
      };
    });
  }).catch(function () { return []; });
}

/**
 * Every subject the indexer will hand over, paged.
 *
 * `skip` advances by the window **asked for**, never by what came back. Nexus drops
 * a subject whose details no longer resolve, so a page is routinely shorter than the
 * limit with more behind it, and advancing by the length received would re-read those
 * positions forever. Only an empty page means the end.
 */
function loadSubjects() {
  var byUri = {};
  var skip = 0;
  var requests = 0;

  function more() {
    if (requests >= MAX_REQUESTS) return Promise.resolve(byUri);
    requests++;
    var at = skip;
    skip += WINDOW;
    return taggedSubjects(at).then(function (page) {
      if (!page.length) return byUri;
      page.forEach(function (s) { if (s.uri && !byUri[s.uri]) byUri[s.uri] = s; });
      return more();
    });
  }
  return more();
}

/* ---------------- the homeserver: what the deck actually is ---------------- */

/* z-base-32, the alphabet a pubky is spelled in. */
var PUBKY_RE = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/;

/* One path segment, the shape the app writes. `.` and `..` would climb out of the
   deck directory, so they are refused even though the characters are allowed. */
var DECK_ID_RE = /^(?!\.{1,2}$)[A-Za-z0-9._~-]{1,128}$/;

/* The manifest as a deck, or null when it is not one. [pubky] is the account whose
   homeserver answered, so a manifest naming someone else as its author is refused. */
function deckFromManifest(pubky, id, d) {
  if (!d || typeof d.title !== 'string' || !d.title.trim()) return null;
  if (d.author_pubky && d.author_pubky !== pubky) return null;
  var topics = (Array.isArray(d.tags) ? d.tags : []).filter(function (t) {
    return typeof t === 'string' && !isReserved(t);
  });
  return {
    /* Author-scoped, not the deck id alone: two authors can publish the same id. */
    key: pubky + '/' + id,
    id: id,
    uri: 'pubky://' + pubky + '/pub/loopky/decks/' + id + '/manifest.json',
    author: pubky,
    title: d.title.trim(),
    description: typeof d.description === 'string' ? d.description.trim() : '',
    cards: typeof d.card_count === 'number' ? d.card_count : null,
    emoji: coverEmoji(d.cover_emoji),
    cover: webCover(d.cover_image_ref && d.cover_image_ref.url),
    /* Off the manifest, which is the author's own list. The indexer's is cut at five
       and can carry anything a stranger attached. */
    allTopics: topics,
    topics: topics.slice(0, 4),
    follows: 0,
    at: 0,
  };
}

/**
 * One deck straight off its author's homeserver. Resolves to null when the
 * homeserver says there is no such deck and rejects when it could not be asked, so a
 * caller can tell a deleted deck from a dropped connection.
 */
function fetchDeck(pubky, id) {
  var url = HOMESERVER + '/pub/loopky/decks/' + encodeURIComponent(id) + '/manifest.json';
  return fetch(url, { mode: 'cors', credentials: 'omit', headers: { 'pubky-host': pubky } })
    .then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      return r.json().then(
        function (d) { return deckFromManifest(pubky, id, d); },
        function () { return null; });
    });
}

/**
 * The ids of the decks under one account, from a shallow directory listing. This is
 * every deck the author has, including ones nobody tagged, which is what a profile
 * wants and what the indexer cannot answer.
 */
function listDeckIds(pubky, limit) {
  var url = HOMESERVER + '/pub/loopky/decks/?shallow=true&limit=' + (limit || 50);
  return fetch(url, { mode: 'cors', credentials: 'omit', headers: { 'pubky-host': pubky } })
    .then(function (r) {
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      return r.text();
    })
    .then(function (text) {
      if (!text) return [];
      var prefix = 'pubky://' + pubky + '/pub/loopky/decks/';
      return text.split('\n').map(function (line) {
        line = line.trim();
        if (line.indexOf(prefix) !== 0) return null;
        var id = line.slice(prefix.length).replace(/\/$/, '');
        return DECK_ID_RE.test(id) ? id : null;
      }).filter(Boolean);
    });
}

/**
 * One deck, read from its author's homeserver, or null for anything that fails a
 * check. This is `verifiedDeck` plus `fetchRemote`, in one step.
 */
function verifiedDeck(subject) {
  var m = DECK_URI_RE.exec(subject.uri);
  if (!m) return Promise.resolve(null);
  var pubky = m[1];

  /* An empty tagger list means the indexer capped it, not that nobody tagged it, so
     only reject when the taggers are visible and the author is not among them. */
  if (subject.taggers.length && subject.taggers.indexOf(pubky) === -1) {
    return Promise.resolve(null);
  }

  return getJson(HOMESERVER + m[2], { 'pubky-host': pubky })
    .then(function (d) {
      var deck = deckFromManifest(pubky, m[3], d);
      if (!deck) return null;
      deck.follows = subject.follows;
      deck.at = subject.at;
      return deck;
    })
    .catch(function () { return null; });
}

/* ---------------- put together ---------------- */

/** Run [work] over [items] a few at a time, calling [onEach] as each settles. */
function pooled(items, limit, work, onEach) {
  var next = 0;
  function run() {
    if (next >= items.length) return Promise.resolve();
    var item = items[next++];
    return work(item).then(function (result) { onEach(item, result); }).then(run);
  }
  var lanes = [];
  for (var i = 0; i < Math.min(limit, items.length); i++) lanes.push(run());
  return Promise.all(lanes);
}

function rank(a, b) {
  return (b.follows - a.follows) ||
    ((b.cover ? 1 : 0) - (a.cover ? 1 : 0)) ||
    ((b.cards || 0) - (a.cards || 0)) ||
    (b.at - a.at);
}

/**
 * Every deck on the network.
 *
 * [onPartial] is called with the decks verified so far, each time a batch lands, so
 * the grid fills as the manifests arrive rather than after the slowest one. The
 * returned promise settles when every subject has been tried.
 */
function loadDecks(onPartial) {
  return loadSubjects().then(function (byUri) {
    var subjects = Object.keys(byUri).map(function (u) { return byUri[u]; });
    var decks = {};
    var settled = 0;

    function snapshot() {
      return Object.keys(decks).map(function (k) { return decks[k]; }).sort(rank);
    }

    return pooled(subjects, FETCH_CONCURRENCY, verifiedDeck, function (subject, deck) {
      settled++;
      if (deck && !decks[deck.key]) decks[deck.key] = deck;
      /* One render per lane-width of results, not one per result. */
      if (onPartial && settled % FETCH_CONCURRENCY === 0) onPartial(snapshot());
    }).then(snapshot);
  });
}

/* ---------------- author names ---------------- */

var nameCache = {};
function resolveNames(pubkys, onEach) {
  pubkys.forEach(function (p) {
    if (p in nameCache) { if (nameCache[p]) onEach(p, nameCache[p]); return; }
    nameCache[p] = null;
    getJson(NEXUS + '/v0/user/' + encodeURIComponent(p))
      .then(function (u) {
        var name = u && u.details && u.details.name;
        /* An unnamed pubky.app profile answers with the key itself, which is not a
           name and does not fit in a card. */
        if (name && !/^[a-z0-9]{52}$/.test(name)) { nameCache[p] = name; onEach(p, name); }
      })
      .catch(function () { /* an unresolved author is just an unnamed one */ });
  });
}

/* A pubky.app profile, or null when there is none to read. An unnamed profile
   answers with the key itself as its name, which is not a name. */
function fetchProfile(pubky) {
  return getJson(NEXUS + '/v0/user/' + encodeURIComponent(pubky))
    .then(function (u) {
      var d = (u && u.details) || {};
      var name = typeof d.name === 'string' && !PUBKY_RE.test(d.name) ? d.name.trim() : '';
      var bio = typeof d.bio === 'string' ? d.bio.trim() : '';
      return { name: name, bio: bio, hasImage: typeof d.image === 'string' && !!d.image };
    })
    .catch(function () { return null; });
}

/* Nexus serves every indexed profile picture as a web image, which the homeserver's
   own pubky:// file record is not. */
function avatarUrl(pubky) {
  return NEXUS + '/static/avatar/' + encodeURIComponent(pubky);
}
