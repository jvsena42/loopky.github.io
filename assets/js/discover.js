/* Discover, ported from the app's Discover tab.
 *
 * Everything here is a public read from the Pubky Nexus indexer, the same one the
 * app talks to. Two sources, because neither is complete on its own:
 *
 *   /v0/stream/resources  every published deck manifest and its topics.
 *   /v0/stream/posts      the announcement post, which is the only place on the
 *                         web a deck's title and cover live. A manifest sits on a
 *                         homeserver behind a pubky:// address a browser cannot open.
 *
 * A deck shows up here only when both agree, so nothing renders untitled.
 * Every value below was written by a stranger. Nothing is ever put in innerHTML.
 */

var NEXUS = 'https://nexus.pubky.app';
var DECK_TAG = 'loopky-deck';
var FOLLOW_TAG = 'loopky-followed';
var MANIFEST_RE = /pubky:\/\/([a-z0-9]{52})\/pub\/loopky\/decks\/([^/\s]+)\/manifest\.json/;
var HEADLINE_RE = /^(\S+)\s+(?:I published a new deck on Loopky|Now following the Loopky deck|Cloned the Loopky deck)\s*:?\s*(.+)$/;

/* Which headline wins when the same deck is announced more than once. The author's
   own "I published" post is the one that carries the untruncated title. */
var KIND_RANK = { published: 3, cloned: 2, followed: 1 };

function getJson(url) {
  return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
    if (!r.ok) throw new Error(url + ' -> ' + r.status);
    return r.json();
  });
}

function isReserved(label) {
  return label.toLowerCase().indexOf('loopky-') === 0;
}

/* An emoji, or the app's own fallback. Some older posts carry a mangled first
   character; anything plain-ASCII is not the cover emoji it claims to be. */
function coverEmoji(raw) {
  if (!raw) return '📚';
  return /^[\x00-\x7F]+$/.test(raw) ? '📚' : raw;
}

function parseAnnouncement(post) {
  var d = post && post.details;
  if (!d || typeof d.content !== 'string') return null;

  var m = MANIFEST_RE.exec(d.content);
  if (!m) return null;

  var lines = d.content.split('\n');
  var h = HEADLINE_RE.exec(lines[0]);
  if (!h) return null;

  var kind = lines[0].indexOf('I published') !== -1 ? 'published'
    : lines[0].indexOf('Cloned') !== -1 ? 'cloned' : 'followed';

  /* Quoted is the current format. The older one left the title bare, so the
     trailing credit has to come off by hand. */
  var title = h[2].trim();
  var quoted = /^"(.+)"/.exec(title);
  if (quoted) {
    title = quoted[1];
  } else {
    title = title.replace(/\s+into my library$/, '').replace(/\s+by\s+\S+$/, '');
  }
  title = title.trim();
  if (!title) return null;

  /* The cover travels as the first https link in the body. */
  var cover = null;
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf('https://') === 0 && line.indexOf(' ') === -1) { cover = line; break; }
  }

  return {
    uri: m[0],
    author: m[1],
    deckId: m[2],
    title: title,
    emoji: coverEmoji(h[1]),
    cover: cover,
    kind: kind,
    postUrl: d.author && d.id ? 'https://pubky.app/post/' + d.author + '/' + d.id : null,
    at: d.indexed_at || 0,
    tags: (post.tags || []).map(function (t) { return t.label; }).filter(function (l) { return !isReserved(l); })
  };
}

function parseResource(res) {
  var uri = res && res.details && res.details.uri;
  if (!uri || !MANIFEST_RE.test(uri)) return null;
  var tags = res.tags || [];
  var follows = 0;
  var topics = [];
  for (var i = 0; i < tags.length; i++) {
    if (tags[i].label === FOLLOW_TAG) follows = tags[i].taggers_count || 0;
    else if (!isReserved(tags[i].label)) topics.push(tags[i].label);
  }
  return { uri: uri, follows: follows, topics: topics, at: res.details.indexed_at || 0 };
}

/* Display names, one request per author, resolved after the grid is already up. */
var nameCache = {};
function resolveNames(pubkys, onEach) {
  pubkys.forEach(function (p) {
    if (p in nameCache) { onEach(p, nameCache[p]); return; }
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

/* Announcements, two pages of them. Posts are a shared timeline, so pages past
   the second are mostly other apps' traffic. */
function loadAnnouncements() {
  var pages = [0, 30].map(function (skip) {
    return getJson(NEXUS + '/v0/stream/posts?tags=' + DECK_TAG +
      '&sorting=timeline&limit=30&skip=' + skip).catch(function () { return []; });
  });
  return Promise.all(pages).then(function (results) {
    var out = [];
    results.forEach(function (page) {
      if (Array.isArray(page)) page.forEach(function (p) {
        var a = parseAnnouncement(p);
        if (a) out.push(a);
      });
    });
    return out;
  });
}

function loadResources() {
  return getJson(NEXUS + '/v0/stream/resources?app=loopky&tags=' + DECK_TAG +
    '&sorting=taggers_count&limit=50&skip=0')
    .then(function (list) {
      var map = {};
      if (Array.isArray(list)) list.forEach(function (r) {
        var p = parseResource(r);
        if (p) map[p.uri] = p;
      });
      return map;
    })
    .catch(function () { return {}; });
}

/* One deck per manifest URI, topics off the manifest record where there is one. */
function loadDecks() {
  return Promise.all([loadAnnouncements(), loadResources()]).then(function (both) {
    var announcements = both[0];
    var resources = both[1];
    var byUri = {};

    announcements.forEach(function (a) {
      var seen = byUri[a.uri];
      if (!seen) { byUri[a.uri] = a; return; }
      if (KIND_RANK[a.kind] > KIND_RANK[seen.kind]) {
        a.cover = a.cover || seen.cover;
        a.tags = a.tags.length ? a.tags : seen.tags;
        byUri[a.uri] = a;
      } else if (!seen.cover && a.cover) {
        seen.cover = a.cover;
      }
    });

    var decks = Object.keys(byUri).map(function (uri) {
      var d = byUri[uri];
      var r = resources[uri];
      return {
        uri: uri,
        title: d.title,
        emoji: d.emoji,
        cover: d.cover && d.cover.indexOf('https://') === 0 ? d.cover : null,
        author: d.author,
        postUrl: d.postUrl,
        follows: r ? r.follows : 0,
        at: Math.max(d.at, r ? r.at : 0),
        topics: (r && r.topics.length ? r.topics : d.tags).slice(0, 4)
      };
    });

    /* Followed first, then decks that brought a picture, then the newest. */
    decks.sort(function (a, b) {
      return (b.follows - a.follows) ||
        ((b.cover ? 1 : 0) - (a.cover ? 1 : 0)) ||
        (b.at - a.at);
    });
    return decks;
  });
}
