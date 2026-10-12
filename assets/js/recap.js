/* The page a shared recap lands on: /recap/?pubky=…&year=….
 *
 * The app shares this link from its own recap screen. Nothing travels in the link but
 * who and which year: the numbers are worked out here, from the same public records
 * the phone read, by assets/js/recap-core.js. So a link cannot be edited into a bigger
 * year than the account had.
 *
 * It is not an App Link on purpose. Someone holding the app already has their recap in
 * it; this page is for the friend who was sent one, and what it wants from them is at
 * the bottom.
 *
 * What it reads, all of it unauthenticated and all of it from the one public
 * homeserver discover.js names:
 *
 *   /pub/loopky/decks/                 the account's own decks (a shallow listing)
 *   /pub/loopky/subscriptions/         the decks it follows, one record each
 *   …/decks/{id}/manifest.json         title, created_at, languages, topics
 *   /pub/loopky/srs/                   every review-state chunk, listed once
 *   /pub/loopky/settings.json          the intervals, for where "mastered" sits
 *
 * Everything shown here was written by a stranger. Nothing is ever put in innerHTML.
 */
(function () {
  'use strict';

  var LIST_PAGE = 500;
  var MAX_LIST_PAGES = 20;
  var FIRST_YEAR = 2024;

  var root = document.body.getAttribute('data-root') || '';
  var params = new URLSearchParams(location.search);
  var pubky = params.get('pubky') || '';
  var year = parseInt(params.get('year') || '', 10);

  if (!PUBKY_RE.test(pubky) || !(year >= FIRST_YEAR && year <= 2100)) {
    location.replace(root || '/');
    return;
  }

  function tf(key, fallback) {
    return window.loopkyT ? window.loopkyT(key, fallback) : fallback;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* ---------------- the homeserver ---------------- */

  /* Null for a 404, which here is an ordinary answer: an account with no settings
     record, or one that follows nothing, simply has no such path. */
  function read(owner, path, asJson) {
    return fetch(HOMESERVER + path, { mode: 'cors', credentials: 'omit', headers: { 'pubky-host': owner } })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(path + ' -> ' + r.status);
        return asJson ? r.json() : r.text();
      });
  }

  /* Every entry under [dir], paged. The cursor is the last address of the page before,
     whole. A full page that adds nothing new is a server ignoring the cursor, and the
     loop stops there rather than spinning. */
  function listAll(owner, dir, shallow) {
    var seen = {};
    var all = [];
    var pages = 0;

    function page(cursor) {
      if (pages >= MAX_LIST_PAGES) return Promise.resolve(all);
      pages++;
      var query = '?limit=' + LIST_PAGE + (shallow ? '&shallow=true' : '') +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      return read(owner, dir + query, false).then(function (text) {
        var lines = (text || '').split('\n').map(function (l) { return l.trim(); })
          .filter(function (l) { return l.indexOf('pubky://') === 0; });
        var fresh = lines.filter(function (l) { return !seen[l]; });
        fresh.forEach(function (l) { seen[l] = true; all.push(l); });
        if (lines.length < LIST_PAGE || !fresh.length) return all;
        return page(lines[lines.length - 1]);
      });
    }
    return page(null);
  }

  /* The manifest as the recap needs it, or null when it is not a deck. */
  function manifest(author, id, owned) {
    return read(author, '/pub/loopky/decks/' + encodeURIComponent(id) + '/manifest.json', true)
      .then(function (d) {
        if (!d || typeof d.title !== 'string' || !d.title.trim()) return null;
        if (d.author_pubky && d.author_pubky !== author) return null;
        return {
          id: id,
          author: author,
          owned: owned,
          title: d.title.trim(),
          coverEmoji: typeof d.cover_emoji === 'string' && d.cover_emoji ? d.cover_emoji : null,
          createdAt: typeof d.created_at === 'number' ? d.created_at : 0,
          cardCount: typeof d.card_count === 'number' ? d.card_count : 0,
          frontLang: typeof d.front_lang === 'string' && d.front_lang ? d.front_lang : null,
          backLang: typeof d.back_lang === 'string' && d.back_lang ? d.back_lang : null,
          tags: (Array.isArray(d.tags) ? d.tags : []).filter(function (t) { return typeof t === 'string'; }),
          states: [],
        };
      })
      /* A deck that will not load is left out, as the app leaves out a followed deck
         whose author is unreachable. The account's own listing failing is different,
         and is not caught here. */
      .catch(function () { return null; });
  }

  var OWN_DECK_RE = /\/pub\/loopky\/decks\/([^/]+)\/?$/;
  var SUBSCRIPTION_RE = /\/pub\/loopky\/subscriptions\/([a-z0-9]{52})\/([^/]+)\.json$/;
  var SRS_RE = /\/pub\/loopky\/srs\/([a-z0-9]{52})\/([^/]+)\/[^/]+\.json$/;

  function loadRecap() {
    return Promise.all([
      listAll(pubky, '/pub/loopky/decks/', true),
      listAll(pubky, '/pub/loopky/subscriptions/', false),
      listAll(pubky, '/pub/loopky/srs/', false),
      read(pubky, '/pub/loopky/settings.json', true).catch(function () { return null; }),
    ]).then(function (found) {
      var wanted = [];
      found[0].forEach(function (line) {
        var m = OWN_DECK_RE.exec(line);
        if (m && DECK_ID_RE.test(m[1])) wanted.push({ author: pubky, id: m[1], owned: true });
      });
      found[1].forEach(function (line) {
        var m = SUBSCRIPTION_RE.exec(line);
        if (m && PUBKY_RE.test(m[1]) && DECK_ID_RE.test(m[2])) wanted.push({ author: m[1], id: m[2], owned: false });
      });

      var decks = [];
      return pooled(wanted, FETCH_CONCURRENCY, function (w) {
        return manifest(w.author, w.id, w.owned);
      }, function (w, deck) {
        if (deck) decks.push(deck);
      }).then(function () {
        /* pooled settles out of order; the recap's tie-breaks do not depend on it, but
           "owned first" does, so put it back. */
        decks.sort(function (a, b) {
          return (a.owned === b.owned ? 0 : a.owned ? -1 : 1) ||
            wanted.findIndex(function (w) { return w.author === a.author && w.id === a.id; }) -
            wanted.findIndex(function (w) { return w.author === b.author && w.id === b.id; });
        });
        var byKey = {};
        decks.forEach(function (d) { byKey[d.author + '/' + d.id] = d; });

        /* Review state for a deck no longer owned or followed is still on the
           homeserver. The app never loads it, so it is skipped here too. */
        var chunks = found[2].map(function (line) {
          var m = SRS_RE.exec(line);
          var deck = m && byKey[m[1] + '/' + m[2]];
          return deck ? { deck: deck, path: line.slice(line.indexOf('/pub/')) } : null;
        }).filter(Boolean);

        return pooled(chunks, FETCH_CONCURRENCY, function (c) {
          return read(pubky, c.path, true);
        }, function (c, chunk) {
          ((chunk && chunk.states) || []).forEach(function (s) {
            if (typeof s.due_at === 'number' && typeof s.interval_days === 'number') {
              c.deck.states.push({ dueAt: s.due_at, intervalDays: s.interval_days });
            }
          });
        }).then(function () {
          var result = loopkyRecap.compute({
            year: year,
            thresholdDays: loopkyRecap.thresholdDays(found[3] && found[3].study),
            decks: decks,
          });
          var top = decks.filter(function (d) { return d.id === result.topDeckId; })[0];
          if (!top) return result;
          /* The deck again, as the tile wants it: cover, card count, topics. One more
             read, and the tile is left out if it fails. */
          return fetchDeck(top.author, top.id).catch(function () { return null; }).then(function (tile) {
            result.topDeckTile = tile;
            return result;
          });
        });
      });
    });
  }

  /* ---------------- painting ---------------- */

  /* loading | ready | empty | error */
  var state = 'loading';
  var recap = null;
  var profile = null;

  var section = document.getElementById('recap');
  var title = document.getElementById('recap-title');
  var status = document.getElementById('recap-status');
  var who = document.getElementById('recap-who');
  var grid = document.getElementById('recap-grid');
  var extra = document.getElementById('recap-extra');

  function clear(node) { while (node.firstChild) node.removeChild(node.lastChild); }

  /* Spelled out key by key rather than built from a stem: tools/check.mjs finds the
     strings a script uses by reading its tf() calls, and cannot follow a concatenation. */
  function labels(recap) {
    function pick(n, one, other) { return n === 1 ? one : other; }
    return {
      cards: pick(recap.cardsStudied, tf('recap.cards.one', 'card studied'), tf('recap.cards.other', 'cards studied')),
      mastered: pick(recap.cardsMastered, tf('recap.mastered.one', 'card mastered'), tf('recap.mastered.other', 'cards mastered')),
      decks: pick(recap.decksStudied, tf('recap.decks.one', 'deck studied'), tf('recap.decks.other', 'decks studied')),
      created: pick(recap.decksCreated, tf('recap.created.one', 'deck created'), tf('recap.created.other', 'decks created')),
      written: pick(recap.cardsCreated, tf('recap.written.one', 'card written'), tf('recap.written.other', 'cards written')),
    };
  }

  function personaWords(persona) {
    if (persona === 'Polyglot') {
      return [tf('recap.persona.Polyglot', 'The Polyglot'), tf('recap.persona.Polyglot.body', 'Your decks span several languages.')];
    }
    if (persona === 'Creator') {
      return [tf('recap.persona.Creator', 'The Creator'), tf('recap.persona.Creator.body', 'You wrote more cards than you studied.')];
    }
    if (persona === 'Master') {
      return [tf('recap.persona.Master', 'The Master'), tf('recap.persona.Master.body', 'At least half of what you studied is mastered.')];
    }
    return [tf('recap.persona.Explorer', 'The Explorer'), tf('recap.persona.Explorer.body', 'Always something new on your list.')];
  }

  function stat(n, label, emoji) {
    var card = el('div', 'recap-stat');
    if (emoji) card.appendChild(el('span', 'recap-stat-emoji', emoji)).setAttribute('aria-hidden', 'true');
    var shown = n.toLocaleString(document.documentElement.lang || undefined);
    /* Five digits and their separator do not fit a tile at the size four do. */
    card.appendChild(el('strong', 'recap-stat-n' + (shown.length > 4 ? ' is-long' : ''), shown));
    card.appendChild(el('span', 'recap-stat-label', label));
    return card;
  }

  function pills(heading, labels) {
    var group = el('div', 'recap-group');
    group.appendChild(el('h2', 'recap-group-title', heading));
    var row = el('div', 'recap-pills');
    labels.forEach(function (l) { row.appendChild(el('span', 'recap-pill', l)); });
    group.appendChild(row);
    return group;
  }

  /* The language's name in the reader's own language, where the browser knows it. */
  function languageName(code) {
    try {
      var names = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' });
      var name = names.of(code);
      if (name && name !== code) return name.charAt(0).toLocaleUpperCase() + name.slice(1);
    } catch (e) { /* an unknown subtag just shows as itself */ }
    return code;
  }

  var PERSONA_EMOJI = { Polyglot: '🌍', Creator: '✍️', Master: '🏆', Explorer: '🧭' };

  function paintTitle() {
    /* The heading starts as the translated "loading" line. From here on its words are
       this script's, and the language picker must not put the placeholder back. */
    title.removeAttribute('data-i18n');
    var name = profile && profile.name;
    title.textContent = (name ? tf('recap.title', '{name} in {year}') : tf('recap.title.anon', '{year} on Loopky'))
      .replace('{name}', name || '').replace('{year}', year);
    clear(who);
    if (state === 'loading' || state === 'error') return;
    if (profile && profile.hasImage) {
      var img = el('img', 'recap-avatar');
      img.alt = '';
      img.width = 44; img.height = 44;
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
      img.src = avatarUrl(pubky);
      who.appendChild(img);
    }
    /* A name when the account has one. An account without one is shown by the start of
       its key, which is all anyone has to call it. */
    var link = el('a', 'recap-profile', name || pubky.slice(0, 8) + '…');
    link.href = root + 'profile/?pubky=' + encodeURIComponent(pubky);
    who.appendChild(link);
  }

  function paint() {
    section.setAttribute('data-state', state);
    clear(status); clear(grid); clear(extra);
    paintTitle();

    if (state === 'loading') {
      status.textContent = tf('recap.loading', 'Putting the year together…');
      return;
    }
    if (state === 'error') {
      status.appendChild(document.createTextNode(tf('recap.error', 'Could not load this recap right now.') + ' '));
      var again = el('button', 'chip recap-retry', tf('disc.retry', 'Try again'));
      again.type = 'button';
      again.addEventListener('click', load);
      status.appendChild(again);
      return;
    }
    if (state === 'empty') {
      title.textContent = tf('recap.empty.title', 'Nothing to recap yet');
      status.textContent = tf('recap.empty.body', 'No cards studied and no decks created in {year}.')
        .replace('{year}', year);
      return;
    }

    var label = labels(recap);
    grid.appendChild(stat(recap.cardsStudied, label.cards, '📚'));
    if (recap.cardsMastered > 0) grid.appendChild(stat(recap.cardsMastered, label.mastered, '🏆'));
    grid.appendChild(stat(recap.decksStudied, label.decks, '🗂️'));
    if (recap.decksCreated > 0) {
      grid.appendChild(stat(recap.decksCreated, label.created, '✨'));
      grid.appendChild(stat(recap.cardsCreated, label.written, '✍️'));
    }

    var persona = el('div', 'recap-persona');
    persona.appendChild(el('span', 'recap-persona-emoji', PERSONA_EMOJI[recap.persona] || '🧭'))
      .setAttribute('aria-hidden', 'true');
    var words = el('div', 'recap-persona-words');
    var personaCopy = personaWords(recap.persona);
    words.appendChild(el('h2', 'recap-persona-title', personaCopy[0]));
    words.appendChild(el('p', 'recap-persona-body', personaCopy[1]));
    persona.appendChild(words);
    extra.appendChild(persona);

    if (recap.topDeckTile) {
      /* The same tile Discover draws, cover and all, linking to the deck's own page. */
      var tile = recap.topDeckTile;
      if (tile.author === pubky && profile && profile.name) tile.authorName = profile.name;
      var group = el('div', 'recap-group');
      group.appendChild(el('h2', 'recap-group-title', tf('recap.top', 'Most studied')));
      var holder = el('div', 'recap-topdeck');
      holder.appendChild(window.loopkyDeckCard(tile));
      group.appendChild(holder);
      extra.appendChild(group);
      if (tile.author !== pubky) {
        resolveNames([tile.author], function (author, name) {
          tile.authorName = name;
          var who = holder.querySelector('.deck-meta b');
          if (who) who.textContent = name;
        });
      }
    } else if (recap.topDeck) {
      var top = (recap.topDeck.coverEmoji ? recap.topDeck.coverEmoji + ' ' : '') + recap.topDeck.title;
      extra.appendChild(pills(tf('recap.top', 'Most studied'), [top]));
    }
    if (recap.languages.length) {
      extra.appendChild(pills(tf('recap.languages', 'Languages'), recap.languages.map(languageName)));
    }
    if (recap.topics.length) {
      extra.appendChild(pills(tf('recap.topics', 'Topics'), recap.topics.map(function (t) { return '#' + t; })));
    }
  }

  function load() {
    state = 'loading';
    paint();
    loadRecap().then(function (r) {
      recap = r;
      state = r.isEmpty ? 'empty' : 'ready';
      paint();
    }, function () {
      state = 'error';
      paint();
    });
  }

  /* Who this is. The indexer first, since it also says whether there is a picture to
     show; then the account's own profile record, which has the name the moment it is
     written while the indexer may be minutes behind or not following this account. */
  function loadProfile() {
    return fetchProfile(pubky).then(function (indexed) {
      if (indexed && indexed.name) return indexed;
      return read(pubky, '/pub/pubky.app/profile.json', true).then(function (own) {
        var name = own && typeof own.name === 'string' && !PUBKY_RE.test(own.name) ? own.name.trim() : '';
        return {
          name: name,
          hasImage: (indexed && indexed.hasImage) || !!(own && typeof own.image === 'string' && own.image),
        };
      }).catch(function () { return indexed; });
    });
  }

  loadProfile().then(function (p) { profile = p; paint(); });
  document.addEventListener('loopky:lang', paint);
  load();
})();
