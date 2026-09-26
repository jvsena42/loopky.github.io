/* Builds the guide pages and the sitemap from tools/guides/{code}.json.
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
import { SLUGS, LOCALES, guidePath } from './guides.mjs';
import { stampFor } from './stamp-assets.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* Bump when the guides' content changes, so the sitemap says so. */
const LASTMOD = '2026-09-26';

const PLAY = 'https://play.google.com/store/apps/details?id=com.github.jvsena42.loopky';
const GH = 'https://github.com/jvsena42/loopky';
const SLOGAN = 'Learn anything, remember everything.';

/* The canonical link on the home page is where the site lives today. */
const SITE = /<link rel="canonical" href="([^"]+)"/.exec(read('index.html'))[1];

/* The same prompt the home page shows, read from the one place it is written. */
const AI_PROMPT = new Function(read('assets/js/i18n.js') + '\nreturn AI_PROMPT;')();

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
    hero: { terminal: TERM_AI }, icons: ['📝', '🧪', '🔒', '🧾'],
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

function page(locale, slug) {
  const d = dicts[locale.code];
  const en = dicts.en;
  const ui = d.ui;
  const p = d.pages[slug];
  const L = LAYOUT[slug];
  const prefix = locale.dir ? '../../' : '../';
  const home = locale.dir ? `${prefix}?lang=${locale.code}` : prefix;
  const self = url(locale, slug);
  const css = `${prefix}assets/css/style.css?v=${stampFor('assets/css/style.css')}`;

  const alternates = [
    ...BUILT.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${url(l, slug)}">`),
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
      datePublished: '2026-09-26', dateModified: LASTMOD,
      image: SITE + 'assets/img/og.png',
      author: { '@type': 'Person', name: 'João Victor Sena', url: 'https://github.com/jvsena42' },
      publisher: { '@id': SITE + '#org' },
      isPartOf: { '@id': SITE + '#website' },
      about: { '@id': SITE + '#app' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Loopky', item: locale.dir ? `${SITE}?lang=${locale.code}` : SITE },
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
      <div class="cli-box"><div class="cli-bar"><span>Prompt</span></div><pre><code>${esc(AI_PROMPT)}</code></pre></div>
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
        <a class="btn btn-lg" href="${PLAY}">${esc(ui.play)}</a>
        <span class="soon">${esc(ui.ios)}</span>
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
      <a class="btn btn-lg btn-invert" href="${PLAY}">${esc(ui.play)}</a>
      <span class="soon soon-invert">${esc(ui.ios)}</span>
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
      <a href="${GH}">${esc(ui.source)}</a>
      <a href="${GH}/blob/main/PRIVACY.md">${esc(ui.privacy)}</a>
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
</script>
</body>
</html>
`;
}

/* ---------------------------------------------------------------- sitemap */

const HOME_LANGS = LOCALES.map((l) => l.code);

function sitemap() {
  const homeAlts = ['  <xhtml:link rel="alternate" hreflang="x-default" href="' + SITE + '"/>',
    ...HOME_LANGS.map((c) => `  <xhtml:link rel="alternate" hreflang="${c}" href="${SITE}?lang=${c}"/>`)]
    .map((l) => '  ' + l).join('\n');
  const entry = (loc, alts, freq, prio) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
${alts}
  </url>`;
  const homes = [
    entry(SITE, homeAlts, 'weekly', '1.0'),
    ...HOME_LANGS.map((c) => entry(`${SITE}?lang=${c}`, homeAlts, 'weekly', '0.8')),
  ];
  const guides = SLUGS.flatMap((slug) => {
    const alts = [
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${url(LOCALES[0], slug)}"/>`,
      ...BUILT.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${url(l, slug)}"/>`),
    ].join('\n');
    return BUILT.map((l) => entry(url(l, slug), alts, 'monthly', l.code === 'en' ? '0.8' : '0.7'));
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...homes, ...guides].join('\n')}
</urlset>
`;
}

/* ---------------------------------------------------------------- run */

export function build() {
  const out = new Map();
  for (const l of BUILT) for (const s of SLUGS) out.set(guidePath(l, s) + 'index.html', page(l, s));
  out.set('sitemap.xml', sitemap());
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
