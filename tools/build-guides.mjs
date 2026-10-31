/* Builds the guide pages, the translated home pages and the sitemap.
 *
 * Guides come from tools/guides/{code}.json. Home pages in the ten other languages
 * (/pt-br/, /ja/ ...) come from index.html with the dictionaries in
 * assets/js/i18n.js applied here, at build time, so a crawler reads Portuguese on
 * the Portuguese page rather than English that a script replaces later.
 *
 *   node tools/build-guides.mjs          write the pages and sitemap.xml
 *   node tools/build-guides.mjs --check  exit 1 if anything written is stale
 *
 * The words live in one JSON file per language, the layout (which screenshot, which
 * icon) lives here, so a translation can never move a picture and a layout change
 * reaches all eleven languages at once. The output is committed and served as it is;
 * tools/check.mjs runs the --check half, so a JSON edit without a rebuild fails CI.
 *
 * Every string is plain text and is escaped on the way in. Nothing in a dictionary
 * can add markup.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { SLUGS, LOCALES, LEGAL, guidePath, hreflangs } from './guides.mjs';
import { legalPage, legalLastmod } from './legal.mjs';
import { stampFor } from './stamp-assets.mjs';
import { AUTHOR, DECKS_FILE, HUB, learnPath, decksFor, builtLangs } from './learn-english.mjs';
import { FEATURED_FILE } from './fetch-featured.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* Each page's lastmod is the day its content last changed, kept in
   tools/lastmod.json beside a hash of the page. A hand-bumped constant sat at
   2026-09-28 for every page through weeks of edits, which tells a crawler with
   a queue of discovered pages that none of them is worth recrawling. The hash
   leaves out the date itself and the stylesheet stamp, so restamping the CSS is
   not a content change. */
const LASTMOD_FILE = 'tools/lastmod.json';
const DATE_TOKEN = '__LASTMOD__';
const today = () => new Date().toISOString().slice(0, 10);
const contentHash = (html) => createHash('sha256')
  .update(html.replace(/\?v=[0-9a-f]+/g, '')).digest('hex').slice(0, 16);

const PLAY = 'https://play.google.com/store/apps/details?id=com.github.jvsena42.loopky';
const TESTFLIGHT = 'https://testflight.apple.com/join/n2TzwMTu';
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M22.02 13.3 18.1 15.52l-3.52-3.5 3.55-3.52 3.89 2.2a1.49 1.49 0 0 1 0 2.6ZM1.34.92a1.49 1.49 0 0 0-.11.57v21.02c0 .22.04.42.12.6l11.16-11.09L1.34.92Zm12.2 10.07 3.26-3.24L3.45.2A1.47 1.47 0 0 0 2.5.02l11.04 10.97Zm0 2.07-11 10.93c.3.04.61-.02.9-.18l13.33-7.54-3.23-3.21Z"/></svg>';
const APPLE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z"/></svg>';
const GH = 'https://github.com/jvsena42/loopky';
const SLOGAN = 'Learn anything, remember everything.';

/* The canonical link on the home page is where the site lives today. */
const SITE = /<link rel="canonical" href="([^"]+)"/.exec(read('index.html'))[1];

/* The same prompt the home page shows, and the home page's dictionaries, read from
   the one place they are written. */
const { AI_PROMPT, I18N, IDEAS, aiPrompt, AI_APPS, aiAppUrl } = new Function(read('assets/js/i18n.js') + '\nreturn { AI_PROMPT, I18N, IDEAS, aiPrompt, AI_APPS, aiAppUrl };')();

/* ---------------------------------------------------------------- layout */

/* Pictures are language-free: which screenshot each block gets, and the icon on
   each feature card, in the same order as the dictionary's arrays. */
const P = (img) => ({ img: `guides/${img}.webp`, w: 540, h: 1200, kind: 'phone' });
const T = (img) => ({ img: `guides/${img}.webp`, w: 1280, h: 800, kind: 'tablet' });
const HOME_PHONE = { img: 'shot-today.webp', w: 540, h: 1200, kind: 'phone' };
const DISCOVER_PHONE = { img: 'shot-discover.webp', w: 540, h: 1200, kind: 'phone' };

const TERM_IMPORT = [
  ['c', '# Bring a whole Anki deck across'],
  ['p', 'loopky import deck.apkg --dry-run --json'],
  ['p', 'loopky import deck.apkg --title "Pharmacology"'],
  ['c', '# Or build one from a spreadsheet'],
  ['p', 'loopky deck create --title "Verbs" --from-file cards.tsv'],
  ['p', 'loopky deck list --json'],
];
const TERM_AI = [
  ['c', '# Your AI agent runs these for you'],
  ['p', 'loopky login'],
  ['p', 'loopky deck create --title "Spanish verbs" \\'],
  ['', '    --from-file cards.tsv --dry-run --json'],
  ['p', 'loopky deck create --title "Spanish verbs" \\'],
  ['', '    --tag spanish --from-file cards.tsv \\'],
  ['', '    --front-lang es-ES --back-lang en-US --listen --speak'],
  ['c', '# Open Loopky on your phone and start studying'],
];

const LAYOUT = {
  'anki-alternative': {
    hero: P('phone-decks'), icons: ['📥', '🧩', '🔗', '💻'],
    sections: [T('tablet-decks'), { terminal: TERM_IMPORT }, P('phone-paste')],
    tableAfter: 0,
  },
  'language-learning': {
    hero: P('phone-study'), icons: ['🔊', '🎙️', '⌨️', '🔁'],
    sections: [P('phone-answer'), P('phone-paste'), T('tablet-discover')],
  },
  'medical-students': {
    hero: T('tablet-deck'), icons: ['🖼️', '⏱️', '🤖', '👥'],
    sections: [P('phone-answer'), T('tablet-answer')],
  },
  'teachers': {
    hero: P('phone-deck'), icons: ['🔗', '👀', '🗣️', '🚫'],
    sections: [P('phone-paste'), T('tablet-profile')],
  },
  'ai-flashcards': {
    hero: { terminal: TERM_AI }, icons: ['📂', '👀', '🔒', '☁️'],
    sections: [P('phone-deck'), { link: `${GH}/tree/main/cli` }],
    prompt: true,
  },
  'spaced-repetition': {
    hero: P('phone-answer'), icons: ['📉', '📅', '🧠'],
    sections: [HOME_PHONE, P('phone-deck')],
  },
  'compare': {
    hero: T('tablet-home'), icons: ['🦊', '📚', '🎮'],
    sections: [T('tablet-decks')],
  },
  'faq': {
    hero: DISCOVER_PHONE, icons: [],
    sections: [],
  },
};

const ICO_TINTS = ['ico-orange', 'ico-purple', 'ico-blue', 'ico-green', 'ico-pink', 'ico-amber'];

/* ---------------------------------------------------------------- helpers */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dicts = Object.fromEntries(LOCALES.map((l) => {
  const file = `tools/guides/${l.code}.json`;
  return [l.code, existsSync(new URL(file, root)) ? JSON.parse(read(file)) : null];
}));

/* A language whose file is missing is left out rather than built half English. */
export const BUILT = LOCALES.filter((l) => dicts[l.code]);

const url = (locale, slug) => SITE + guidePath(locale, slug);

function img(block, alt, prefix, eager) {
  const cls = block.kind === 'tablet' ? 'shot shot-tablet' : 'shot';
  return `<img class="${cls}" src="${prefix}assets/img/${block.img}" width="${block.w}" height="${block.h}" ` +
    `alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

function terminal(lines, hero) {
  const body = lines.map(([k, t]) => k === 'p'
    ? `<span class="p">$</span> ${esc(t)}`
    : k === 'c' ? `<span class="c">${esc(t)}</span>` : esc(t)).join('\n');
  return `<div class="cli-box${hero ? ' cli-hero' : ''}" aria-hidden="true"><div class="cli-bar"><span>loopky</span></div><pre><code>${body}</code></pre></div>`;
}

function table(t, extraClass = '') {
  const head = t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const rows = t.rows.map((r) => '<tr>' + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('\n          ');
  return `<div class="card dtable-wrap${extraClass}">
        <table class="dtable">
          <thead><tr>${head}</tr></thead>
          <tbody>
          ${rows}
          </tbody>
        </table>
      </div>`;
}

/* ---------------------------------------------------------------- page */

/* The prompt's Copy button, only on a page that shows the prompt. */
const COPY_SCRIPT = `
/* The prompt's Copy button. Without a clipboard, it selects the prompt instead. */
(function () {
  var btn = document.getElementById('copy-prompt');
  var code = document.querySelector('#ai-prompt code');
  if (!btn || !code) return;
  var label = btn.textContent;
  var select = function () {
    var r = document.createRange();
    r.selectNodeContents(code);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  };
  var copy = function (fallback) {
    var done = function () {
      btn.textContent = btn.getAttribute('data-copied');
      setTimeout(function () { btn.textContent = label; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code.textContent).then(done, fallback);
    } else if (fallback) {
      fallback();
    }
  };
  btn.addEventListener('click', function () { copy(select); });
  /* An agent link copies the prompt as it opens, for the ones that open empty. */
  document.querySelectorAll('.ai-app').forEach(function (a) {
    a.addEventListener('click', function () { copy(null); });
  });
})();
`;

function page(locale, slug) {
  const d = dicts[locale.code];
  const en = dicts.en;
  const ui = d.ui;
  const p = d.pages[slug];
  /* The home page's words for the prompt box, so both boxes read the same. */
  const tr = (key) => I18N[locale.code]?.[key] ?? I18N.en[key];
  const L = LAYOUT[slug];
  const prefix = locale.dir ? '../../' : '../';
  /* One level up is this language's home page: /pt-br/ from /pt-br/{slug}/. */
  const home = '../';
  const self = url(locale, slug);
  const css = `${prefix}assets/css/style.css?v=${stampFor('assets/css/style.css')}`;

  const alternates = [
    ...BUILT.flatMap((l) => hreflangs(l).map((h) => `<link rel="alternate" hreflang="${h}" href="${url(l, slug)}">`)),
    `<link rel="alternate" hreflang="x-default" href="${url(LOCALES[0], slug)}">`,
  ].join('\n');

  const options = BUILT.map((l) =>
    `<option value="${prefix}${guidePath(l, slug)}" data-lang="${l.code}"${l === locale ? ' selected' : ''}>${esc(l.name)}</option>`)
    .join('\n          ');

  const graph = [
    {
      '@type': slug === 'faq' ? 'WebPage' : 'Article',
      '@id': self + '#page',
      headline: p.h1, name: p.title, description: p.desc, url: self,
      inLanguage: locale.code,
      datePublished: '2026-09-26', dateModified: DATE_TOKEN,
      image: SITE + 'assets/img/og.png',
      author: { '@type': 'Person', name: 'João Victor Sena', url: 'https://github.com/jvsena42' },
      publisher: { '@id': SITE + '#org' },
      isPartOf: { '@id': SITE + '#website' },
      about: { '@id': SITE + '#app' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Loopky', item: SITE + (locale.dir ? locale.dir + '/' : '') },
        { '@type': 'ListItem', position: 2, name: p.crumb, item: self },
      ],
    },
  ];
  if (p.faq?.length) {
    graph.push({
      '@type': 'FAQPage', '@id': self + '#faq',
      mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  }
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');

  /* Blocks alternate background from the first one after the hero. */
  let alt = false;
  const blocks = [];
  const open = () => { const c = alt ? 'section section-alt' : 'section'; alt = !alt; return c; };

  if (p.features?.length) {
    blocks.push(`<section class="${open()}">
  <div class="wrap">
    <div class="grid-feat${p.features.length === 4 ? ' n4' : ''}">
${p.features.map((f, i) => `      <article class="card feat">
        <span class="ico ${ICO_TINTS[i % ICO_TINTS.length]}" aria-hidden="true">${L.icons[i] ?? '✨'}</span>
        <h2 class="h3">${esc(f.t)}</h2>
        <p>${esc(f.d)}</p>
      </article>`).join('\n')}
    </div>
  </div>
</section>`);
  }

  if (L.prompt) {
    blocks.push(`<section class="${open()}">
  <div class="wrap split">
    <div class="split-copy">
      <h2>${esc(p.promptH)}</h2>
      <p>${esc(p.promptP)}</p>
    </div>
    <div class="split-art">
      <div class="cli-box">
        <div class="cli-bar">
          <span>${esc(tr('cli.promptlabel'))}</span>
          <button type="button" class="btn btn-sm" id="copy-prompt" data-copied="${esc(tr('cli.copied'))}">${esc(tr('cli.copy'))}</button>
        </div>
        <pre id="ai-prompt"><code>${esc(AI_PROMPT)}</code></pre>
        <div class="cli-open">
          <span>${esc(tr('cli.open'))}</span>
${AI_APPS.map(([id, name]) => `          <a class="ai-app" data-ai="${id}" href="${esc(aiAppUrl(id, AI_PROMPT))}" target="_blank" rel="noopener" title="${esc(name)}"><img src="${prefix}assets/img/ai/${id}.svg" alt="${esc(name)}" width="22" height="22"></a>`).join('\n')}
        </div>
        <p class="cli-openhint">${esc(tr('cli.openhint'))}</p>
      </div>
    </div>
  </div>
</section>`);
  }

  (p.sections ?? []).forEach((s, i) => {
    const art = L.sections[i] ?? {};
    const picture = art.terminal ? terminal(art.terminal, false)
      : art.img ? img(art, s.alt ?? '', prefix, false) : '';
    const points = s.points?.length
      ? `\n      <ul class="ticks">\n${s.points.map((x) => `        <li>${esc(x)}</li>`).join('\n')}\n      </ul>` : '';
    const tbl = s.table === 'intervals' ? '\n      ' + table(ui.intervals) : '';
    const link = art.link && s.link ? `\n      <p><a class="textlink" href="${art.link}">${esc(s.link)}</a></p>` : '';
    const layout = picture ? `split${i % 2 ? ' split-rev' : ''}` : 'split split-solo';
    blocks.push(`<section class="${open()}">
  <div class="wrap ${layout}">
    <div class="split-copy">
      <h2>${esc(s.h)}</h2>
      <p>${esc(s.p)}</p>${points}${tbl}${link}
    </div>${picture ? `\n    <div class="split-art">\n      ${picture}\n    </div>` : ''}
  </div>
</section>`);

    if (p.table && L.tableAfter === i) blocks.push(tableBlock());
  });
  function tableBlock() {
    return `<section class="${open()}">
  <div class="wrap">
    <h2>${esc(p.table.h)}</h2>
    ${table(p.table)}${p.table.note ? `\n    <p class="fineprint table-note">${esc(p.table.note)}</p>` : ''}
  </div>
</section>`;
  }
  if (p.table && L.tableAfter === undefined) {
    /* The comparison leads with its table: it is the point of the page. */
    blocks.splice(slug === 'compare' ? 1 : blocks.length, 0, tableBlock());
  }

  if (p.faq?.length) {
    blocks.push(`<section class="${open()}" id="questions">
  <div class="wrap">
    <h2>${esc(ui.faq)}</h2>
    <div class="faqlist">
${p.faq.map(([q, a], i) => `      <details class="card"${i === 0 ? ' open' : ''}>
        <summary>${esc(q)}</summary>
        <p>${esc(a)}</p>
      </details>`).join('\n')}
    </div>
  </div>
</section>`);
  }

  const heroArt = L.hero.terminal ? terminal(L.hero.terminal, true) : img(L.hero, p.heroAlt, prefix, true);
  const wide = L.hero.kind === 'tablet' || L.hero.terminal;

  const others = SLUGS.filter((s) => s !== slug).map((s) =>
    `      <a class="card" href="${prefix}${guidePath(locale, s)}">${esc(d.pages[s].card)}<span>${esc(d.pages[s].blurb)}</span></a>`)
    .join('\n');

  return `<!doctype html>
<html lang="${locale.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#FF5C00" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D0B11" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${self}">
${alternates}
<link rel="icon" href="${prefix}assets/img/logo.png" type="image/png">
<link rel="apple-touch-icon" href="${prefix}assets/img/logo.png">
<link rel="alternate" type="text/plain" title="Loopky for LLMs" href="${prefix}llms.txt">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Loopky">
<meta property="og:locale" content="${locale.og}">
<meta property="og:url" content="${self}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:image" content="${SITE}assets/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="600">
<meta property="og:image:alt" content="${esc(ui.ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${SITE}assets/img/og.png">
<meta name="twitter:image:alt" content="${esc(ui.ogAlt)}">

<script>
/* The theme a visitor picked on the home page, before the first paint. */
(function () {
  try {
    var t = localStorage.getItem('loopky.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage can be off */ }
})();
</script>

<link rel="stylesheet" href="${css}">

<script type="application/ld+json">
${ld}
</script>
</head>
<body>

<a class="skip" href="#main">${esc(ui.skip)}</a>

<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="${home}">
      <img src="${prefix}assets/img/logo.png" width="34" height="34" alt="Loopky">
      <span>Loopky</span>
    </a>
    <div class="topright">
      <label class="lang">
        <span class="sr-only">${esc(ui.lang)}</span>
        <select id="lang-select">
          ${options}
        </select>
      </label>
      <a class="btn btn-sm" href="${PLAY}">${esc(ui.get)}</a>
    </div>
  </div>
</header>

<main id="main">

<section class="ghero">
  <div class="wrap ghero-in${wide ? ' ghero-wide' : ''}">
    <div class="ghero-copy">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="${home}">Loopky</a></li>
          <li aria-current="page">${esc(p.crumb)}</li>
        </ol>
      </nav>
      <p class="eyebrow">${esc(p.eyebrow)}</p>
      <h1>${esc(p.h1)}</h1>
      <p class="lead">${esc(p.lead)}</p>
      <div class="cta-row">
        <a class="btn btn-lg" href="${PLAY}">${PLAY_ICON}<span>${esc(ui.play)}</span></a>
        <a class="btn btn-lg btn-ios" href="${TESTFLIGHT}">${APPLE_ICON}<span>${esc(ui.ios)}</span></a>
      </div>
      <p class="fineprint">${esc(ui.free)}</p>
    </div>
    <div class="ghero-art">
      ${heroArt}
    </div>
  </div>
</section>

${blocks.join('\n\n')}

<section class="section cta-band">
  <div class="wrap cta-in">
    <h2>${SLOGAN}</h2>
    <p>${esc(ui.ctaSub)}</p>
    <div class="cta-row center">
      <a class="btn btn-lg btn-invert" href="${PLAY}">${PLAY_ICON}<span>${esc(ui.play)}</span></a>
      <a class="btn btn-lg btn-invert btn-ios" href="${TESTFLIGHT}">${APPLE_ICON}<span>${esc(ui.ios)}</span></a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2>${esc(ui.more)}</h2>
    <nav class="guide-links" aria-label="${esc(ui.more)}">
${others}
    </nav>
  </div>
</section>

</main>

<footer class="footer">
  <div class="wrap footer-in">
    <p class="foot-brand">
      <img src="${prefix}assets/img/logo.png" width="22" height="22" alt="">
      <span>Loopky</span>
    </p>
    <nav class="footlinks">
      <a href="${home}">${esc(ui.home)}</a>
      <a href="${PLAY}">Google Play</a>
      <a href="${TESTFLIGHT}">TestFlight</a>
      <a href="${GH}">${esc(ui.source)}</a>
      <a href="${prefix}${learnHref(locale)}">${esc(tr('foot.learn'))}</a>
      <a href="${prefix}privacy/">${esc(ui.privacy)}</a>
      <a href="${prefix}terms/">${esc(ui.terms)}</a>
      <a href="${prefix}support/">${esc(ui.support)}</a>
      <a href="${prefix}llms.txt">llms.txt</a>
    </nav>
    <p class="foot-note">${esc(ui.note)}</p>
  </div>
</footer>

<script>
/* The picker goes to this guide in the chosen language, and remembers the choice for
   the home page, which reads the same key. */
(function () {
  var sel = document.getElementById('lang-select');
  if (!sel) return;
  sel.addEventListener('change', function () {
    var opt = sel.options[sel.selectedIndex];
    try { localStorage.setItem('loopky.lang', opt.getAttribute('data-lang')); } catch (e) { /* storage can be off */ }
    location.href = opt.value;
  });
})();
${L.prompt ? COPY_SCRIPT : ''}</script>
</body>
</html>
`;
}

/* ---------------------------------------------------------------- home pages */

const homeUrl = (l) => SITE + (l.dir ? l.dir + '/' : '');

/* The hreflang block every home page carries, the English one included. */
export const HOME_ALTERNATES = [
  `<link rel="alternate" hreflang="x-default" href="${SITE}">`,
  ...LOCALES.flatMap((l) => hreflangs(l).map((h) => `<link rel="alternate" hreflang="${h}" href="${homeUrl(l)}">`)),
].join('\n');

/* ---------------------------------------------------------------- featured decks */

/* Discover is live, so without JavaScript it used to be an empty section, and a
   browser agent that looked before the network answered saw the same. The grid now
   ships a snapshot of the top decks (tools/featured-decks.json, refreshed by
   tools/fetch-featured.mjs), drawn the way app.js draws a tile, and app.js swaps in
   the live list when it lands. */
const featured = JSON.parse(read(FEATURED_FILE));

/* app.js's tintClass, so a tile keeps its colour when the live grid replaces it. */
const tint = (key) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 100000;
  return 'tint-' + (h % 6);
};

function featuredTiles(code) {
  const dict = I18N[code] || I18N.en;
  const t = (k) => (typeof dict[k] === 'string' ? dict[k] : I18N.en[k]);
  return featured.decks.map((d) => {
    const count = typeof d.cards === 'number'
      ? esc(t(d.cards === 1 ? 'disc.cards.one' : 'disc.cards.other').replace('{n}', d.cards)) + ' · '
      : '';
    const tags = d.topics.length
      ? `<div class="deck-tags">${d.topics.map((x) => `<span class="deck-tag">#${esc(x)}</span>`).join('')}</div>`
      : '';
    return `
      <a class="deck" href="deck/?author=${esc(d.author)}&amp;id=${esc(encodeURIComponent(d.id))}">` +
      `<div class="deck-cover-emoji ${tint(d.author + '/' + d.id)}" aria-hidden="true">${esc(d.emoji)}</div>` +
      `<div class="deck-body"><h3 class="deck-title">${esc(d.title)}</h3>` +
      `<p class="deck-meta">${count}<b>${esc(d.author_name || t('disc.anon'))}</b></p>${tags}</div></a>`;
  }).join('') + '\n    ';
}

const withFeatured = (html, code) =>
  html.replace(/(<!-- featured -->)[\s\S]*?(<!-- \/featured -->)/, (_, a, b) => a + featuredTiles(code) + b);

function homePage(locale) {
  const master = withFeatured(read('index.html'), locale.code);
  const dict = I18N[locale.code];
  const t = (key) => {
    const v = dict[key] !== undefined ? dict[key] : I18N.en[key];
    return typeof v === 'string' ? v : null;
  };
  let html = master;

  /* Attributes first (meta content, placeholders, aria-labels), then text. */
  html = html.replace(/<[^>]*\bdata-i18n-attr="([\w-]+)"[^>]*>/g, (tag, attr) => {
    const key = /\bdata-i18n="([^"]+)"/.exec(tag)[1];
    const v = t(key);
    return v === null ? tag : tag.replace(new RegExp(`(\\s${attr}=")[^"]*"`), (_, a) => a + esc(v) + '"');
  });
  html = html.replace(/(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g,
    (whole, open, tag, key, text, close) => {
      if (/data-i18n-attr=/.test(open)) return whole;
      const v = t(key);
      return v === null ? whole : open + esc(v) + close;
    });
  html = html.replace(/(<ul class="pillrow" id="uses-list">)[\s\S]*?(\n\s*<\/ul>)/,
    (_, a, b) => a + '\n' + dict['uses.list'].map((u) => `        <li>${esc(u)}</li>`).join('\n') + b);
  /* The full prompt carries the first idea's request, in this language. */
  html = html.replace(/(<pre id="ai-prompt"><code>)[\s\S]*?(<\/code><\/pre>)/,
    (_, a, b) => a + esc(aiPrompt(t(`idea.${IDEAS[0]}.p`))) + b);
  /* And so do the links that open it in Claude, ChatGPT and Cursor. */
  html = html.replace(/(<a class="ai-app" data-ai="([\w-]+)" href=")[^"]*"/g,
    (_, a, id) => a + esc(aiAppUrl(id, aiPrompt(t(`idea.${IDEAS[0]}.p`)))) + '"');

  html = html
    .replace('<html lang="en" data-home="en">', `<html lang="${locale.code}" data-home="${locale.code}">`)
    .replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${homeUrl(locale)}">`)
    .replace(/<meta property="og:url" content="[^"]+">/, `<meta property="og:url" content="${homeUrl(locale)}">`)
    .replace(/<meta property="og:locale" content="[^"]+">/, `<meta property="og:locale" content="${locale.og}">`)
    .replace(/<option value="([^"]+)">/g, (o, v) => v === locale.code ? `<option value="${v}" selected>` : o)
    .replace('<body>', '<body data-root="../">');

  html = html.replace('<a href="learn-english/" data-learn', `<a href="${learnHref(locale)}" data-learn`);

  /* One folder down: every local address climbs back to the root, except the guide
     links, which should land on this language's guides right beside it. */
  html = html.replace(/\b(src|href)="(?!https?:|#|mailto:|data:|\/)([^"]*)"/g, (whole, attr, path) =>
    SLUGS.some((s) => path.startsWith(s + '/')) ? whole : `${attr}="../${path}"`);
  return html;
}

/* ---------------------------------------------------------------- learn English */

const snapshot = JSON.parse(read(DECKS_FILE));
const LEARN = builtLangs(snapshot);
const learnUrl = (l) => SITE + (l ? learnPath(l) : HUB);
/* Where a page in one of the site's own languages sends someone who wants English:
   their language's page when it has one, the hub otherwise. */
const learnHref = (locale) => {
  const own = LEARN.find((l) => l.code === locale.code);
  return own ? learnPath(own) : HUB;
};
const deckUrl = (id) => `${SITE}deck/?author=${AUTHOR}&id=${encodeURIComponent(id)}`;

/* A dash between two things is a hyphen and one between clauses a comma: the site
   writes neither dash, and the decks' own descriptions sometimes do. */
const undash = (s) => String(s).replace(/(\S)[–—](\S)/g, '$1-$2').replace(/\s*[–—]\s*/g, ', ');

/* Thousands separated the way each language writes them; Arabic and Urdu keep the
   Western digits their deck titles use. */
const count = (l, n) => {
  const tag = l.rtl ? `${l.code}-u-nu-latn` : l.code;
  return l.cards.replace('{n}', new Intl.NumberFormat(tag).format(n));
};

/* The hub and every language's page point at one another. The hub is English, so it
   answers for English and for anyone whose language has no page. */
const LEARN_ALTERNATES = [
  `<link rel="alternate" hreflang="x-default" href="${learnUrl()}">`,
  `<link rel="alternate" hreflang="en" href="${learnUrl()}">`,
  ...LEARN.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${learnUrl(l)}">`),
].join('\n');

function learnShell({ lang, dir, title, desc, self, og, prefix, ld, body, crumbs, cta }) {
  return `<!doctype html>
<html lang="${lang}"${dir ? ` dir="${dir}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#FF5C00" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D0B11" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${self}">
${LEARN_ALTERNATES}
<link rel="icon" href="${prefix}assets/img/logo.png" type="image/png">
<link rel="apple-touch-icon" href="${prefix}assets/img/logo.png">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Loopky">
<meta property="og:locale" content="${og}">
<meta property="og:url" content="${self}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}assets/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="600">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}assets/img/og.png">

<script>
/* The theme a visitor picked on the home page, before the first paint. */
(function () {
  try {
    var t = localStorage.getItem('loopky.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage can be off */ }
})();
</script>

<link rel="stylesheet" href="${prefix}assets/css/style.css?v=${stampFor('assets/css/style.css')}">

<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': ld }, null, 2).replace(/</g, '\\u003c')}
</script>
</head>
<body>

<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="${prefix}">
      <img src="${prefix}assets/img/logo.png" width="34" height="34" alt="Loopky">
      <span>Loopky</span>
    </a>
    <div class="topright">
      <a class="btn btn-sm" href="${PLAY}">Google Play</a>
    </div>
  </div>
</header>

<main id="main">

<section class="ghero">
  <div class="wrap ghero-in">
    <div class="ghero-copy">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol>
${crumbs.map(([name, href]) => href
    ? `          <li><a href="${href}">${esc(name)}</a></li>`
    : `          <li aria-current="page">${esc(name)}</li>`).join('\n')}
        </ol>
      </nav>
${cta}
    </div>
    <div class="ghero-art">
      ${img(P('phone-study'), '', prefix, true)}
    </div>
  </div>
</section>

${body}

</main>

<footer class="footer">
  <div class="wrap footer-in">
    <p class="foot-brand">
      <img src="${prefix}assets/img/logo.png" width="22" height="22" alt="">
      <span>Loopky</span>
    </p>
    <nav class="footlinks">
      <a href="${prefix}">loopky.app</a>
      <a href="${PLAY}">Google Play</a>
      <a href="${TESTFLIGHT}">TestFlight</a>
      <a href="${prefix}privacy/">Privacy</a>
      <a href="${prefix}terms/">Terms</a>
      <a href="${prefix}support/">Support</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;
}

/* One deck as structured data: what it teaches, in which language, for free. */
const deckLd = (deck, lang) => ({
  '@type': 'LearningResource',
  name: undash(deck.title),
  description: undash(deck.description),
  url: deckUrl(deck.id),
  inLanguage: [lang, 'en'],
  learningResourceType: 'Flashcards',
  teaches: 'English',
  isAccessibleForFree: true,
  provider: { '@id': SITE + '#org' },
});

function learnPage(l) {
  const decks = decksFor(snapshot, l);
  const [lead, ...rest] = decks;
  const self = learnUrl(l);
  const prefix = '../../';
  const title = `${undash(lead.title)} · Loopky`;
  const cta = `      <p class="eyebrow">${esc(l.crumb)}</p>
      <h1>${esc(undash(lead.title))}</h1>
      <p class="lead">${esc(undash(lead.description))}</p>
      <p class="fineprint">${esc(count(l, lead.card_count))}</p>
      <div class="cta-row">
        <a class="btn btn-lg" href="${esc(deckUrl(lead.id))}"><span>${esc(l.start)}</span></a>
        <a class="btn btn-lg btn-ios" href="${PLAY}">${PLAY_ICON}<span>Google Play</span></a>
      </div>
      <p class="fineprint">${esc(l.free)}</p>`;

  const more = rest.length ? `<section class="section section-alt">
  <div class="wrap">
    <div class="grid-feat">
${rest.map((d) => `      <article class="card feat">
        <h2 class="h3">${esc(undash(d.title))}</h2>
        <p>${esc(undash(d.description))}</p>
        <p class="fineprint">${esc(count(l, d.card_count))}</p>
        <p><a class="textlink" href="${esc(deckUrl(d.id))}">${esc(l.start)}</a></p>
      </article>`).join('\n')}
    </div>
  </div>
</section>

` : '';

  const others = `<section class="section">
  <div class="wrap">
    <h2>${esc(l.other)}</h2>
    <nav class="guide-links" aria-label="${esc(l.other)}">
${LEARN.filter((o) => o !== l).map((o) =>
    `      <a class="card" href="../${o.dir}/" hreflang="${o.code}" lang="${o.code}" dir="${o.rtl ? 'rtl' : 'ltr'}">${esc(o.name)}<span>${esc(o.crumb)}</span></a>`).join('\n')}
      <a class="card" href="../" hreflang="en" lang="en" dir="ltr">English<span>All languages</span></a>
    </nav>
  </div>
</section>`;

  const ld = [
    {
      '@type': 'WebPage', '@id': self + '#page', url: self, name: title,
      description: undash(lead.description), inLanguage: l.code,
      isPartOf: { '@id': SITE + '#website' }, about: { '@id': SITE + '#app' },
      mainEntity: { '@type': 'ItemList', itemListElement: decks.map((d, i) => ({ '@type': 'ListItem', position: i + 1, item: deckLd(d, l.code) })) },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Loopky', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Learn English', item: learnUrl() },
        { '@type': 'ListItem', position: 3, name: l.crumb, item: self },
      ],
    },
  ];

  return learnShell({
    lang: l.code, dir: l.rtl ? 'rtl' : '', title, desc: undash(lead.description), self, og: l.og,
    prefix, ld, cta, body: more + others,
    crumbs: [['Loopky', prefix], ['Learn English', '../'], [l.crumb]],
  });
}

function learnHub() {
  const self = learnUrl();
  const prefix = '../';
  const title = 'Learn English with free flashcards in your own language · Loopky';
  const desc = `Free English flashcard decks written for speakers of ${LEARN.length} languages, ` +
    'including Swahili, Hausa, Yoruba, Igbo, Amharic, Zulu, Arabic, Hindi, Urdu, Bengali, Indonesian and Thai. ' +
    'The most useful words and phrases, with audio and pronunciation practice.';
  const cta = `      <p class="eyebrow">Learn English</p>
      <h1>Learn English in your own language</h1>
      <p class="lead">${esc(desc)}</p>
      <div class="cta-row">
        <a class="btn btn-lg" href="${PLAY}">${PLAY_ICON}<span>Get it on Google Play</span></a>
        <a class="btn btn-lg btn-ios" href="${TESTFLIGHT}">${APPLE_ICON}<span>iOS beta on TestFlight</span></a>
      </div>
      <p class="fineprint">Free. No ads. Open source.</p>`;
  const body = `<section class="section section-alt">
  <div class="wrap">
    <h2>Choose your language</h2>
    <nav class="guide-links" aria-label="Choose your language">
${LEARN.map((l) => `      <a class="card" href="${l.dir}/" hreflang="${l.code}"><bdi lang="${l.code}">${esc(l.name)}</bdi><span>${esc(l.en)}</span></a>`).join('\n')}
    </nav>
  </div>
</section>`;
  const ld = [
    {
      '@type': 'CollectionPage', '@id': self + '#page', url: self, name: title, description: desc,
      inLanguage: 'en', isPartOf: { '@id': SITE + '#website' }, about: { '@id': SITE + '#app' },
      hasPart: LEARN.map((l) => ({ '@type': 'WebPage', url: learnUrl(l), name: l.crumb, inLanguage: l.code })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Loopky', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Learn English', item: self },
      ],
    },
  ];
  return learnShell({
    lang: 'en', dir: '', title, desc, self, og: 'en_US', prefix, ld, cta, body,
    crumbs: [['Loopky', prefix], ['Learn English']],
  });
}

/* ---------------------------------------------------------------- sitemap */

function sitemap(lastmodOf) {
  const homeAlts = [`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}"/>`,
    ...LOCALES.flatMap((l) => hreflangs(l).map((h) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${homeUrl(l)}"/>`))]
    .join('\n');
  const entry = (loc, alts, freq, prio, lastmod) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
${alts}
  </url>`;
  const homes = LOCALES.map((l) => entry(homeUrl(l), homeAlts, 'weekly', l.dir ? '0.9' : '1.0',
    lastmodOf((l.dir ? l.dir + '/' : '') + 'index.html')));
  const guides = SLUGS.flatMap((slug) => {
    const alts = [
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${url(LOCALES[0], slug)}"/>`,
      ...BUILT.flatMap((l) => hreflangs(l).map((h) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${url(l, slug)}"/>`)),
    ].join('\n');
    return BUILT.map((l) => entry(url(l, slug), alts, 'monthly', l.code === 'en' ? '0.8' : '0.7',
      lastmodOf(guidePath(l, slug) + 'index.html')));
  });
  /* English only, so each is its own single alternate. */
  const legal = LEGAL.map((slug) => {
    const loc = SITE + slug + '/';
    const alts = ['x-default', 'en'].map((h) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${loc}"/>`).join('\n');
    return entry(loc, alts, 'yearly', '0.3', legalLastmod(slug));
  });
  const learnAlts = LEARN_ALTERNATES.split('\n')
    .map((l) => '    ' + l.replace('<link ', '<xhtml:link ').replace(/>$/, '/>')).join('\n');
  const learn = [null, ...LEARN].map((l) => entry(learnUrl(l), learnAlts, 'monthly', l ? '0.7' : '0.8',
    lastmodOf((l ? learnPath(l) : HUB) + 'index.html')));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...homes, ...guides, ...learn, ...legal].join('\n')}
</urlset>
`;
}

/* ---------------------------------------------------------------- run */

export function build() {
  const pages = new Map();
  for (const l of BUILT) for (const s of SLUGS) pages.set(guidePath(l, s) + 'index.html', page(l, s));
  for (const l of LOCALES.filter((x) => x.dir)) pages.set(l.dir + '/index.html', homePage(l));
  pages.set(HUB + 'index.html', learnHub());
  for (const l of LEARN) pages.set(learnPath(l) + 'index.html', learnPage(l));

  /* index.html is written by hand, apart from the featured decks in Discover, so it
     is dated from the file as it stands with those filled in. */
  const index = withFeatured(read('index.html'), 'en');
  const known = existsSync(new URL(LASTMOD_FILE, root)) ? JSON.parse(read(LASTMOD_FILE)) : {};
  const dates = {};
  for (const [file, html] of [['index.html', index], ...pages]) {
    const hash = contentHash(html);
    dates[file] = known[file]?.hash === hash ? known[file] : { hash, date: today() };
  }

  const out = new Map();
  out.set('index.html', index);
  for (const [file, html] of pages) out.set(file, html.replaceAll(DATE_TOKEN, dates[file].date));
  for (const slug of LEGAL) out.set(slug + '/index.html', legalPage(slug, SITE));
  out.set('sitemap.xml', sitemap((file) => dates[file].date));
  out.set(LASTMOD_FILE, JSON.stringify(dates, null, 2) + '\n');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [file, html] of build()) {
    const path = new URL(file, root);
    const now = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (now === html) continue;
    if (check) { stale.push(file); continue; }
    mkdirSync(dirname(path.pathname), { recursive: true });
    writeFileSync(path, html);
  }
  if (check && stale.length) {
    console.error(`stale: ${stale.join(', ')}\nRun: node tools/build-guides.mjs`);
    process.exit(1);
  }
  const missing = LOCALES.filter((l) => !dicts[l.code]).map((l) => l.code);
  console.log(`${check ? 'Checked' : 'Built'} ${BUILT.length} languages × ${SLUGS.length} guides` +
    (missing.length ? ` (no dictionary yet: ${missing.join(', ')})` : '') + '.');
}
