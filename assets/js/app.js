(function () {
  'use strict';

  var SUPPORTED = ['en', 'pt-BR', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'vi', 'zh-Hans', 'zh-Hant'];
  var STORE_KEY = 'loopky.lang';
  var lang = 'en';

  /* ---------------- language ---------------- */

  /* Browser tags are messy: pt-pt, zh-TW, zh-Hans-CN. Script beats region for
     Chinese, because Hant and Hans are not interchangeable. */
  function normalize(tag) {
    if (!tag) return null;
    var t = String(tag).replace('_', '-');
    var low = t.toLowerCase();
    if (low.indexOf('zh') === 0) {
      if (/hant|tw|hk|mo/.test(low)) return 'zh-Hant';
      return 'zh-Hans';
    }
    if (low.indexOf('pt') === 0) return 'pt-BR';
    for (var i = 0; i < SUPPORTED.length; i++) {
      if (SUPPORTED[i].toLowerCase() === low) return SUPPORTED[i];
    }
    var base = low.split('-')[0];
    for (var j = 0; j < SUPPORTED.length; j++) {
      if (SUPPORTED[j].toLowerCase().split('-')[0] === base) return SUPPORTED[j];
    }
    return null;
  }

  function pickLang() {
    var q = new URLSearchParams(location.search).get('lang');
    var fromUrl = normalize(q);
    if (fromUrl) return fromUrl;
    try {
      var saved = normalize(localStorage.getItem(STORE_KEY));
      if (saved) return saved;
    } catch (e) { /* storage can be off */ }
    var list = navigator.languages || [navigator.language];
    for (var i = 0; i < list.length; i++) {
      var hit = normalize(list[i]);
      if (hit) return hit;
    }
    return 'en';
  }

  function t(key) {
    var dict = I18N[lang] || I18N.en;
    var v = dict[key];
    if (v === undefined) v = I18N.en[key];
    return v === undefined ? key : v;
  }

  function applyLang(next) {
    lang = SUPPORTED.indexOf(next) === -1 ? 'en' : next;
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var attr = el.getAttribute('data-i18n-attr');
      var value = t(key);
      if (typeof value !== 'string') return;
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });

    var sel = document.getElementById('lang-select');
    if (sel) sel.value = lang;

    renderUses();
    renderDiscover();
  }

  function renderUses() {
    var ul = document.getElementById('uses-list');
    if (!ul) return;
    ul.textContent = '';
    (t('uses.list') || []).forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
  }

  /* ---------------- discover ---------------- */

  var PAGE = 8;
  var decks = null;
  var failed = false;
  var selected = [];
  var query = '';
  var shown = PAGE;

  var grid = document.getElementById('disc-grid');
  var chipbox = document.getElementById('disc-chips');
  var status = document.getElementById('disc-status');
  var moreBtn = document.getElementById('disc-more');
  var search = document.getElementById('disc-search');

  /* A label that is only an emoji is a real tag in the app and stays on the cards,
     but it makes a poor filter, so it is kept out of the chip row. */
  function isWordTag(tag) {
    return /[\p{L}\p{N}]/u.test(tag);
  }

  function topicCounts(list) {
    var counts = {};
    list.forEach(function (d) {
      d.topics.forEach(function (tag) {
        if (isWordTag(tag)) counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
  }

  function matches(d) {
    for (var i = 0; i < selected.length; i++) {
      if (d.topics.indexOf(selected[i]) === -1) return false;
    }
    if (!query) return true;
    var hay = (d.title + ' ' + d.topics.join(' ') + ' ' + (d.authorName || '')).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function skeleton() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 4; i++) {
      var card = document.createElement('div');
      card.className = 'deck skel';
      var cover = document.createElement('div');
      cover.className = 'deck-cover-emoji';
      var body = document.createElement('div');
      body.className = 'deck-body';
      var b1 = document.createElement('span'); b1.className = 'bar w70';
      var b2 = document.createElement('span'); b2.className = 'bar w45';
      body.appendChild(b1); body.appendChild(b2);
      card.appendChild(cover); card.appendChild(body);
      frag.appendChild(card);
    }
    return frag;
  }

  function deckCard(d) {
    var a = document.createElement('a');
    a.className = 'deck';
    a.href = d.postUrl || 'https://play.google.com/store/apps/details?id=com.github.jvsena42.loopky';
    a.target = '_blank';
    a.rel = 'noopener nofollow';

    if (d.cover) {
      var img = document.createElement('img');
      img.className = 'deck-cover';
      img.src = d.cover;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      /* A cover is a URL on someone else's host. When it 404s, fall back to the emoji. */
      img.onerror = function () {
        var box = document.createElement('div');
        box.className = 'deck-cover-emoji';
        box.textContent = d.emoji;
        if (img.parentNode) img.parentNode.replaceChild(box, img);
      };
      a.appendChild(img);
    } else {
      var box = document.createElement('div');
      box.className = 'deck-cover-emoji';
      box.textContent = d.emoji;
      a.appendChild(box);
    }

    var body = document.createElement('div');
    body.className = 'deck-body';

    var h3 = document.createElement('h3');
    h3.className = 'deck-title';
    h3.textContent = d.title;
    body.appendChild(h3);

    var meta = document.createElement('p');
    meta.className = 'deck-meta';
    var who = document.createElement('b');
    who.textContent = d.authorName || t('disc.anon');
    meta.appendChild(who);
    if (d.follows > 0) {
      meta.appendChild(document.createTextNode(' · ' + d.follows + ' ' + t('disc.followers')));
    }
    body.appendChild(meta);

    if (d.topics.length) {
      var tags = document.createElement('div');
      tags.className = 'deck-tags';
      d.topics.slice(0, 3).forEach(function (tag) {
        var s = document.createElement('span');
        s.className = 'deck-tag';
        s.textContent = '#' + tag;
        tags.appendChild(s);
      });
      body.appendChild(tags);
    }

    a.appendChild(body);
    return a;
  }

  function renderChips() {
    if (!chipbox || !decks) return;
    chipbox.textContent = '';

    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'chip';
    all.textContent = t('disc.all');
    all.setAttribute('aria-pressed', selected.length === 0 ? 'true' : 'false');
    all.addEventListener('click', function () { selected = []; shown = PAGE; renderDiscover(); });
    chipbox.appendChild(all);

    topicCounts(decks).slice(0, 14).forEach(function (tag) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = '#' + tag;
      var on = selected.indexOf(tag) !== -1;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () {
        /* Tapping a selected topic drops it, the way the app's filter works. */
        var at = selected.indexOf(tag);
        if (at === -1) selected.push(tag); else selected.splice(at, 1);
        shown = PAGE;
        renderDiscover();
      });
      chipbox.appendChild(b);
    });
  }

  function renderDiscover() {
    if (!grid) return;

    if (failed) {
      grid.textContent = '';
      status.hidden = false;
      status.textContent = t('disc.error') + ' ';
      var again = document.createElement('button');
      again.type = 'button';
      again.className = 'chip chip-clear';
      again.textContent = t('disc.retry');
      again.addEventListener('click', function () {
        failed = false;
        decks = null;
        startDiscover();
      });
      status.appendChild(again);
      if (chipbox) chipbox.textContent = '';
      if (moreBtn) moreBtn.hidden = true;
      return;
    }
    if (decks === null) {
      status.hidden = false;
      status.textContent = t('disc.loading');
      grid.textContent = '';
      grid.appendChild(skeleton());
      return;
    }

    renderChips();

    var hits = decks.filter(matches);
    grid.textContent = '';

    if (!hits.length) {
      status.hidden = false;
      status.textContent = t('disc.empty');
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    status.hidden = false;
    status.textContent = hits.length === 1
      ? t('disc.one')
      : t('disc.count').replace('{n}', hits.length);

    hits.slice(0, shown).forEach(function (d) { grid.appendChild(deckCard(d)); });
    if (moreBtn) moreBtn.hidden = hits.length <= shown;
  }

  function startDiscover() {
    if (!grid) return;
    renderDiscover();

    loadDecks().then(function (list) {
      if (!list.length) { failed = true; renderDiscover(); return; }
      decks = list;
      renderDiscover();

      var authors = [];
      list.forEach(function (d) {
        if (authors.indexOf(d.author) === -1) authors.push(d.author);
      });
      resolveNames(authors, function (pubky, name) {
        var touched = false;
        decks.forEach(function (d) {
          if (d.author === pubky) { d.authorName = name; touched = true; }
        });
        if (touched) renderDiscover();
      });
    }).catch(function () {
      failed = true;
      renderDiscover();
    });
  }

  /* ---------------- wiring ---------------- */

  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var code = document.querySelector('#ai-prompt code');
    if (code) code.textContent = AI_PROMPT;

    var copy = document.getElementById('copy-prompt');
    if (copy) {
      copy.addEventListener('click', function () {
        var done = function () {
          copy.textContent = t('cli.copied');
          setTimeout(function () { copy.textContent = t('cli.copy'); }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(AI_PROMPT).then(done, selectPrompt);
        } else {
          selectPrompt();
        }
      });
    }

    function selectPrompt() {
      var pre = document.getElementById('ai-prompt');
      if (!pre) return;
      var range = document.createRange();
      range.selectNodeContents(pre);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    var sel = document.getElementById('lang-select');
    if (sel) {
      sel.addEventListener('change', function () {
        try { localStorage.setItem(STORE_KEY, sel.value); } catch (e) { /* storage can be off */ }
        applyLang(sel.value);
      });
    }

    if (search) {
      search.addEventListener('input', debounce(function () {
        query = search.value.trim().toLowerCase();
        shown = PAGE;
        renderDiscover();
      }, 160));
    }

    if (moreBtn) {
      moreBtn.addEventListener('click', function () { shown += PAGE; renderDiscover(); });
    }

    applyLang(pickLang());
    startDiscover();
  });
})();
