/* The pages a shared link lands on: /deck/?author=…&id=… and /profile/?pubky=….
 *
 * The app shares these instead of a bare pubky:// address because nothing on the web
 * linkifies that scheme. With Loopky installed, Android opens the link in the app and
 * this page is never seen (assetlinks.json is what lets it). Without it, this page is
 * the landing site with the deck or the person on top, and a way to get the app.
 *
 * Everything shown here was written by a stranger. Nothing is ever put in innerHTML.
 */
(function () {
  'use strict';

  var PACKAGE = 'com.github.jvsena42.loopky';
  var DECKS_ON_PROFILE = 24;

  var page = document.body.getAttribute('data-page');
  var root = document.body.getAttribute('data-root') || '';
  var params = new URLSearchParams(location.search);

  function tf(key, fallback) {
    return window.loopkyT ? window.loopkyT(key, fallback) : fallback;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* On Android an intent:// link opens Loopky when it is installed and falls through
     to Google Play when it is not, so one button does both. Anywhere else there is no
     Loopky to open: iOS has no build yet and the desktop only has the CLI. */
  var isAndroid = /Android/i.test(navigator.userAgent);

  function openHref(pubkyUri) {
    var rest = pubkyUri.replace(/^pubky:\/\//, '');
    return 'intent://' + rest + '#Intent;scheme=pubky;package=' + PACKAGE +
      ';S.browser_fallback_url=' + encodeURIComponent(window.loopkyPlayUrl) + ';end';
  }

  function cardCount(n) {
    var s = n === 1 ? tf('disc.cards.one', '{n} card') : tf('disc.cards.other', '{n} cards');
    return s.replace('{n}', n);
  }

  function emojiBox(key, emoji) {
    var box = el('div', 'deck-cover-emoji linkcard-emoji ' + window.loopkyTint(key), emoji);
    box.setAttribute('aria-hidden', 'true');
    return box;
  }

  /* ---------------- state ---------------- */

  /* loading | ready | missing | error */
  var state = 'loading';
  var deck = null;
  var profile = null;
  var profileDecks = null;
  var pubky = null;
  var deckId = null;

  var card = document.getElementById('link-card');
  var cover = document.getElementById('link-cover');
  var body = document.getElementById('link-body');
  var openBtn = document.getElementById('link-open');
  var playBtn = document.getElementById('link-play');
  var hint = document.getElementById('link-hint');

  /* ---------------- painting ---------------- */

  function paintStatus(message, retry) {
    var p = el('p', 'link-status', message);
    p.setAttribute('role', 'status');
    if (retry) {
      p.appendChild(document.createTextNode(' '));
      var again = el('button', 'chip chip-clear', tf('disc.retry', 'Try again'));
      again.type = 'button';
      again.addEventListener('click', function () { state = 'loading'; paint(); load(); });
      p.appendChild(again);
    }
    body.appendChild(p);
  }

  function paintOpen(uri) {
    var canOpen = isAndroid && state !== 'missing' && !!uri;
    openBtn.hidden = !canOpen;
    if (canOpen) openBtn.href = openHref(uri);
    /* Only one filled button: Open when it can do something, Google Play otherwise. */
    playBtn.classList.toggle('btn-ghost', canOpen);
    hint.textContent = isAndroid
      ? tf('link.hint', 'Opens in the app if you have it, or takes you to Google Play if you do not.')
      : tf('link.elsewhere', 'Loopky is on Android for now. Open this link on an Android phone to see it in the app.');
    hint.hidden = state === 'missing';
  }

  function paintDeck() {
    card.setAttribute('data-state', state);
    cover.textContent = '';
    body.textContent = '';
    body.appendChild(el('p', 'eyebrow', tf('link.deck.eyebrow', 'Shared deck')));

    if (state !== 'ready') {
      cover.appendChild(emojiBox(pubky + '/' + deckId, '📚'));
      body.appendChild(el('h1', 'linkcard-title', state === 'loading'
        ? tf('link.loading', 'Loading…')
        : tf('link.deck.gone', 'Deck not found')));
      if (state === 'missing') {
        paintStatus(tf('link.deck.missing', 'This deck is not there any more. Its author may have deleted it.'));
      } else if (state === 'error') {
        paintStatus(tf('disc.error', 'Could not reach the network right now.'), true);
      }
      paintOpen(state === 'error' ? deckUriFor(pubky, deckId) : null);
      return;
    }

    document.title = deck.title + ' · Loopky';

    if (deck.cover) {
      var img = el('img', 'deck-cover linkcard-img');
      img.src = deck.cover;
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () {
        if (img.parentNode) img.parentNode.replaceChild(emojiBox(deck.key, deck.emoji), img);
      };
      cover.appendChild(img);
    } else {
      cover.appendChild(emojiBox(deck.key, deck.emoji));
    }

    body.appendChild(el('h1', 'linkcard-title', deck.title));

    var meta = el('p', 'deck-meta linkcard-meta');
    if (typeof deck.cards === 'number') {
      meta.appendChild(document.createTextNode(cardCount(deck.cards) + ' · '));
    }
    var who = el('a', null, (profile && profile.name) || tf('disc.anon', 'Someone on Loopky'));
    who.href = root + 'profile/?pubky=' + encodeURIComponent(deck.author);
    meta.appendChild(who);
    body.appendChild(meta);

    if (deck.allTopics.length) {
      var tags = el('div', 'deck-tags');
      deck.allTopics.slice(0, 8).forEach(function (t) { tags.appendChild(el('span', 'deck-tag', '#' + t)); });
      body.appendChild(tags);
    }

    if (deck.description) body.appendChild(el('p', 'linkcard-desc', deck.description));

    paintOpen(deck.uri);
  }

  function paintProfile() {
    card.setAttribute('data-state', state);
    cover.textContent = '';
    body.textContent = '';
    body.appendChild(el('p', 'eyebrow', tf('link.profile.eyebrow', 'Loopky profile')));

    var name = profile && profile.name;
    if (name) document.title = name + ' · Loopky';

    var stage = emojiBox(pubky, '');
    var initial = el('span', 'avatar avatar-initial', (name || '?').charAt(0).toUpperCase());
    stage.appendChild(initial);
    if (profile && profile.hasImage) {
      var img = el('img', 'avatar');
      img.src = avatarUrl(pubky);
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onload = function () { if (initial.parentNode) initial.parentNode.removeChild(initial); };
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
      stage.appendChild(img);
    }
    cover.appendChild(stage);

    body.appendChild(el('h1', 'linkcard-title', state === 'loading'
      ? tf('link.loading', 'Loading…')
      : (name || tf('disc.anon', 'Someone on Loopky'))));
    if (profile && profile.bio) body.appendChild(el('p', 'linkcard-desc', profile.bio));
    body.appendChild(el('p', 'link-key', pubky));

    /* A profile always exists as an address, even when the indexer has never heard of
       it, so the way into the app stays open whatever came back. */
    paintOpen('pubky://' + pubky);
    paintProfileDecks();
  }

  function paintProfileDecks() {
    var section = document.getElementById('link-decks');
    var grid = document.getElementById('link-decks-grid');
    var status = document.getElementById('link-decks-status');
    if (!section || !grid) return;
    grid.textContent = '';
    if (profileDecks === null) {
      section.hidden = state === 'loading';
      status.hidden = false;
      status.textContent = tf('link.loading', 'Loading…');
      return;
    }
    section.hidden = false;
    if (profileDecks === 'error') {
      status.hidden = false;
      status.textContent = tf('disc.error', 'Could not reach the network right now.');
      return;
    }
    if (!profileDecks.length) {
      status.hidden = false;
      status.textContent = tf('link.decks.none', 'No published decks yet.');
      return;
    }
    status.hidden = true;
    profileDecks.forEach(function (d) {
      if (profile && profile.name) d.authorName = profile.name;
      grid.appendChild(window.loopkyDeckCard(d));
    });
  }

  function paint() {
    if (page === 'deck') paintDeck(); else paintProfile();
  }

  /* ---------------- loading ---------------- */

  function deckUriFor(author, id) {
    return 'pubky://' + author + '/pub/loopky/decks/' + id + '/manifest.json';
  }

  function load() {
    if (page === 'deck') {
      fetchDeck(pubky, deckId).then(function (d) {
        deck = d;
        state = d ? 'ready' : 'missing';
        paint();
      }, function () {
        state = 'error';
        paint();
      });
      fetchProfile(pubky).then(function (p) {
        profile = p;
        if (state === 'ready') paint();
      });
      return;
    }

    fetchProfile(pubky).then(function (p) {
      profile = p;
      state = 'ready';
      paint();
    });
    listDeckIds(pubky, DECKS_ON_PROFILE).then(function (ids) {
      var found = [];
      return pooled(ids, FETCH_CONCURRENCY, function (id) {
        return fetchDeck(pubky, id).catch(function () { return null; });
      }, function (id, d) {
        if (d) found.push(d);
      }).then(function () {
        profileDecks = found.sort(function (a, b) { return (b.cards || 0) - (a.cards || 0); });
        paintProfileDecks();
      });
    }).catch(function () {
      profileDecks = 'error';
      paintProfileDecks();
    });
  }

  /* ---------------- start ---------------- */

  pubky = (params.get(page === 'deck' ? 'author' : 'pubky') || '').trim();
  deckId = (params.get('id') || '').trim();
  var valid = PUBKY_RE.test(pubky) && (page !== 'deck' || DECK_ID_RE.test(deckId));

  /* A link with nothing usable in it names no deck and no person, so there is nothing
     to put above the landing page. Send the visitor to the landing page itself. */
  if (!valid) {
    location.replace(root || '/');
    return;
  }

  document.addEventListener('loopky:lang', paint);
  load();
})();
