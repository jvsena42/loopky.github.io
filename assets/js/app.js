(function () {
  'use strict';

  var SUPPORTED = ['en', 'pt-BR', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'vi', 'zh-Hans', 'zh-Hant'];
  var STORE_KEY = 'loopky.lang';
  var lang = 'en';

  /* The same key the inline script in index.html reads before the first paint. */
  var THEME_KEY = 'loopky.theme';
  var THEMES = ['system', 'light', 'dark'];
  var theme = 'system';

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

  /* Undefined for an unknown key, never the key itself. index.html and i18n.js are
     separate requests with separate ten-minute caches, so a deploy that adds a
     string can leave a returning visitor holding new markup and the old dictionary
     for a few minutes, and the page used to paint "feat.cli.t" into the card. The
     markup already ships the English, so the fix is to leave it standing. */
  function t(key) {
    var dict = I18N[lang] || I18N.en;
    var v = dict[key];
    if (v === undefined) v = I18N.en[key];
    return v;
  }

  /* For strings the scripts build rather than the markup carrying them: there is no
     authored English to leave standing, so each names its own floor. */
  function tf(key, fallback) {
    var v = t(key);
    return typeof v === 'string' ? v : fallback;
  }

  function applyLang(next) {
    lang = SUPPORTED.indexOf(next) === -1 ? 'en' : next;
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var attr = el.getAttribute('data-i18n-attr');
      var value = t(key);
      /* Not a string means unknown: keep what the markup shipped with. */
      if (typeof value !== 'string') return;
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });

    var sel = document.getElementById('lang-select');
    if (sel) sel.value = lang;

    labelTheme();
    linkGuides();
    renderUses();
    paintIdea();
    renderDiscover();
    /* The deck and profile pages build their copy from data, so they listen for this
       and paint again rather than carrying data-i18n on nodes that change. */
    document.dispatchEvent(new CustomEvent('loopky:lang'));
  }

  /* Every guide exists in every language, at /{lang}/{slug}/ with the tag lowercased,
     and English at /{slug}/. The markup ships the English address for crawlers. */
  function linkGuides() {
    var root = document.body.getAttribute('data-root') || '';
    document.querySelectorAll('[data-guide]').forEach(function (a) {
      a.setAttribute('href', root + langDir(lang) + a.getAttribute('data-guide') + '/');
    });
  }

  /* The folder a language lives in: '' for English, 'pt-br/' for pt-BR. */
  function langDir(code) {
    return code === 'en' ? '' : code.toLowerCase() + '/';
  }

  /* The home page exists once per language, /pt-br/, /ja/ and so on, built with its
     words already in place. `data-home` names the language a copy was built in. */
  var HOME = document.documentElement.getAttribute('data-home');
  function goHome(code) {
    var root = document.body.getAttribute('data-root') || '';
    location.href = root + langDir(code) + location.hash;
  }

  function renderUses() {
    var ul = document.getElementById('uses-list');
    if (!ul) return;
    var items = t('uses.list');
    if (!Array.isArray(items)) return;
    ul.textContent = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
  }

  /* ---------------- theme ---------------- */

  /* Three states, not two. A visitor who has not chosen should keep following the
     system, including when it turns dark at sunset, and a two-way switch has no way
     back to that once it has been touched. */

  function readTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (THEMES.indexOf(saved) !== -1) return saved;
    } catch (e) { /* storage can be off */ }
    return 'system';
  }

  /* The address bar and the task switcher take their colour from these, and the two
     in the markup are keyed to the system. An explicit choice turns one on and the
     other off; going back to system hands them to the media queries again. */
  function paintThemeColor() {
    var light = document.getElementById('tc-light');
    var dark = document.getElementById('tc-dark');
    if (!light || !dark) return;
    if (theme === 'system') {
      light.media = '(prefers-color-scheme: light)';
      dark.media = '(prefers-color-scheme: dark)';
    } else {
      light.media = theme === 'light' ? 'all' : 'not all';
      dark.media = theme === 'dark' ? 'all' : 'not all';
    }
  }

  /* Spelled out rather than built from the state, so tools/check.mjs can see which
     keys the page asks for. */
  function themeName() {
    if (theme === 'light') return tf('theme.light', 'Light');
    if (theme === 'dark') return tf('theme.dark', 'Dark');
    return tf('theme.system', 'System');
  }

  function labelTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var name = themeName();
    btn.setAttribute('data-state', theme);
    /* The label carries the state on its own. The aria-label puts the word "Theme"
       in front of it, which the icon does for a sighted visitor. */
    btn.setAttribute('aria-label', tf('a11y.theme', 'Theme') + ': ' + name);
    btn.setAttribute('title', tf('a11y.theme', 'Theme') + ': ' + name);
    var label = document.getElementById('theme-label');
    if (label) label.textContent = name;
  }

  function applyTheme(next) {
    theme = THEMES.indexOf(next) === -1 ? 'system' : next;
    var root = document.documentElement;
    /* No attribute is the system state, which is what the stylesheet expects. */
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    paintThemeColor();
    labelTheme();
  }

  /* ---------------- discover ---------------- */

  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.github.jvsena42.loopky';
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

  /* Stable per deck, so a tint does not change under the reader between renders. */
  function tintClass(key) {
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 100000;
    return 'tint-' + (h % 6);
  }

  function emojiCover(d) {
    var box = document.createElement('div');
    box.className = 'deck-cover-emoji ' + tintClass(d.key || d.uri);
    box.textContent = d.emoji;
    return box;
  }

  /* The same address the app shares, so a tile opens the deck in Loopky when the app
     is installed and shows it on the web when it is not. `data-root` is the way back
     to the site root from a page one directory down. */
  function deckHref(d) {
    var root = document.body.getAttribute('data-root') || '';
    return root + 'deck/?author=' + encodeURIComponent(d.author) + '&id=' + encodeURIComponent(d.id);
  }

  function deckCard(d) {
    var a = document.createElement('a');
    a.className = 'deck';
    a.href = deckHref(d);

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
        if (img.parentNode) img.parentNode.replaceChild(emojiCover(d), img);
      };
      a.appendChild(img);
    } else {
      a.appendChild(emojiCover(d));
    }

    var body = document.createElement('div');
    body.className = 'deck-body';

    var h3 = document.createElement('h3');
    h3.className = 'deck-title';
    h3.textContent = d.title;
    body.appendChild(h3);

    /* "395 cards · Trícia", the same subtitle the app's own tile carries. */
    var meta = document.createElement('p');
    meta.className = 'deck-meta';
    if (typeof d.cards === 'number') {
      var count = d.cards === 1
        ? tf('disc.cards.one', '{n} card')
        : tf('disc.cards.other', '{n} cards');
      meta.appendChild(document.createTextNode(count.replace('{n}', d.cards) + ' · '));
    }
    var who = document.createElement('b');
    who.textContent = d.authorName || tf('disc.anon', 'Someone on Loopky');
    meta.appendChild(who);
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
    all.textContent = tf('disc.all', 'All');
    all.setAttribute('aria-pressed', selected.length === 0 ? 'true' : 'false');
    all.addEventListener('click', function () { selected = []; shown = PAGE; renderDiscover(); });
    chipbox.appendChild(all);

    /* Wrapped chips cost vertical space, and on a phone fourteen of them is eight
       rows between the search box and the first deck. The busiest topics carry most
       of the value and the search box covers the rest. */
    var room = window.matchMedia('(max-width: 640px)').matches ? 6 : 14;
    topicCounts(decks).slice(0, room).forEach(function (tag) {
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
      status.textContent = tf('disc.error', 'Could not reach the network right now.') + ' ';
      var again = document.createElement('button');
      again.type = 'button';
      again.className = 'chip chip-clear';
      again.textContent = tf('disc.retry', 'Try again');
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
      status.textContent = tf('disc.loading', 'Loading decks…');
      grid.textContent = '';
      grid.appendChild(skeleton());
      return;
    }

    renderChips();

    var hits = decks.filter(matches);
    grid.textContent = '';

    if (!hits.length) {
      status.hidden = false;
      status.textContent = tf('disc.empty', 'No deck matches that yet. Try another topic.');
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    status.hidden = false;
    status.textContent = hits.length === 1
      ? tf('disc.one', '1 deck')
      : tf('disc.count', '{n} decks').replace('{n}', hits.length);

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

  /* ---------------- the AI prompt ---------------- */

  /* The idea chosen above the request box. Picking one, or switching language,
     replaces what is in the box; typing in it only repaints the full prompt. */
  var idea = IDEAS[0];

  function currentPrompt() {
    var ask = document.getElementById('ai-ask');
    var text = ask && ask.value.trim();
    return text ? aiPrompt(text) : AI_PROMPT;
  }

  function paintPrompt() {
    var code = document.querySelector('#ai-prompt code');
    var text = currentPrompt();
    if (code) code.textContent = text;
    /* The Claude, ChatGPT and Cursor links open with this same prompt typed in. */
    document.querySelectorAll('.ai-app[data-ai]').forEach(function (a) {
      var href = aiAppUrl(a.getAttribute('data-ai'), text);
      if (href) a.href = href;
    });
  }

  function paintIdea() {
    document.querySelectorAll('#ideas [data-idea]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-idea') === idea ? 'true' : 'false');
    });
    var ask = document.getElementById('ai-ask');
    if (ask) {
      ask.setAttribute('data-i18n', 'idea.' + idea + '.p');
      ask.value = tf('idea.' + idea + '.p', '');
      fitAsk();
    }
    paintPrompt();
  }

  /* The request box grows with its text, so a whole idea reads without scrolling. */
  function fitAsk() {
    var ask = document.getElementById('ai-ask');
    if (!ask || !ask.offsetParent) return;
    ask.style.height = 'auto';
    ask.style.height = ask.scrollHeight + 2 + 'px';
  }

  /* ---------------- shared with the deck and profile pages ---------------- */

  window.loopkyT = tf;
  window.loopkyDeckCard = deckCard;
  window.loopkyTint = tintClass;
  window.loopkyPlayUrl = PLAY_URL;

  /* ---------------- wiring ---------------- */

  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var ask = document.getElementById('ai-ask');
    if (ask) ask.addEventListener('input', function () { fitAsk(); paintPrompt(); });

    var ideas = document.getElementById('ideas');
    if (ideas) {
      ideas.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-idea]');
        if (!btn) return;
        idea = btn.getAttribute('data-idea');
        paintIdea();
      });
    }

    var copy = document.getElementById('copy-prompt');
    function copyPrompt(fallback) {
      var done = function () {
        if (!copy) return;
        copy.textContent = tf('cli.copied', 'Copied');
        setTimeout(function () { copy.textContent = tf('cli.copy', 'Copy'); }, 1800);
      };
      var text = currentPrompt();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else if (fallback) {
        fallback();
      }
    }
    if (copy) copy.addEventListener('click', function () { copyPrompt(selectPrompt); });

    /* An agent link copies the prompt as it opens, for the ones that open empty. */
    document.querySelectorAll('.ai-app').forEach(function (a) {
      a.addEventListener('click', function () { copyPrompt(null); });
    });

    /* Each plugin command gets its own copy button, since each one is pasted on its
       own. Built here so the eleven home pages need no extra markup. */
    var SVG_NS = 'http://www.w3.org/2000/svg';
    function icon(paths, width) {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', width);
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      paths.forEach(function (d) {
        var el = document.createElementNS(SVG_NS, 'path');
        el.setAttribute('d', d);
        svg.appendChild(el);
      });
      return svg;
    }
    var COPY_PATHS = ['M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z', 'M5 15V5a2 2 0 0 1 2-2h10'];
    var DONE_PATHS = ['M5 12.5l4.5 4.5L19 7.5'];
    document.querySelectorAll('.cli-plugin pre').forEach(function (pre) {
      var code = pre.querySelector('code') || pre;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cmd-copy';
      btn.appendChild(icon(COPY_PATHS, '2'));
      btn.setAttribute('aria-label', tf('cli.copy', 'Copy'));
      btn.title = tf('cli.copy', 'Copy');
      var timer;
      function done() {
        btn.replaceChildren(icon(DONE_PATHS, '2.4'));
        btn.classList.add('is-done');
        btn.setAttribute('aria-label', tf('cli.copied', 'Copied'));
        btn.title = tf('cli.copied', 'Copied');
        clearTimeout(timer);
        timer = setTimeout(function () {
          btn.replaceChildren(icon(COPY_PATHS, '2'));
          btn.classList.remove('is-done');
          btn.setAttribute('aria-label', tf('cli.copy', 'Copy'));
          btn.title = tf('cli.copy', 'Copy');
        }, 1800);
      }
      function select() {
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      btn.addEventListener('click', function () {
        var text = code.textContent.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, select);
        } else {
          select();
        }
      });
      pre.appendChild(btn);
    });

    function selectPrompt() {
      var pre = document.getElementById('ai-prompt');
      if (!pre) return;
      var details = pre.closest('details');
      if (details) details.open = true;
      var range = document.createRange();
      range.selectNodeContents(pre);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    var themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage can be off */ }
        applyTheme(next);
      });
    }

    var sel = document.getElementById('lang-select');
    if (sel) {
      sel.addEventListener('change', function () {
        try { localStorage.setItem(STORE_KEY, sel.value); } catch (e) { /* storage can be off */ }
        /* A home page moves to its copy in that language; the deck and profile
           pages have one copy and repaint in place. */
        if (HOME) { goHome(sel.value); return; }
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

    applyTheme(readTheme());
    /* The English home page is the default for search engines and for anyone whose
       browser or earlier choice says English. Everyone else, and an old ?lang= link,
       goes to their own language's page. A translated page stays in its language. */
    if (HOME === 'en') {
      var wanted = pickLang();
      if (wanted !== 'en') { location.replace(langDir(wanted) + location.hash); return; }
    }
    applyLang(HOME || pickLang());
    startDiscover();
  });
})();
