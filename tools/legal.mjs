/* The privacy policy, the terms of service and the support page.
 *
 * Three English pages, built from the Markdown in tools/legal/. privacy.md and
 * terms.md are copies of PRIVACY.md and TERMS.md in the app repository, which stay
 * the source: each page links back to its file and carries its "Last updated" date,
 * and tools/sync-legal.mjs refreshes the copies and reports when they have drifted.
 * support.md is written here.
 *
 * They are not translated. Legal text in a language nobody reviewed is worse than
 * English that says it is English, so each page says so.
 *
 * tools/build-guides.mjs writes the pages and lists them in the sitemap.
 */

import { readFileSync } from 'node:fs';
import { LEGAL } from './guides.mjs';
import { stampFor } from './stamp-assets.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const PLAY = 'https://play.google.com/store/apps/details?id=com.github.jvsena42.loopky';
const TESTFLIGHT = 'https://testflight.apple.com/join/n2TzwMTu';
const GH = 'https://github.com/jvsena42/loopky';
/* Where the Markdown says the site lives. Links there become relative ones, so they
   follow the site wherever tools/set-site-url.mjs moves it. */
const WRITTEN_SITE = 'https://loopky.app';

/* `source` is the file in the app repository a page is a copy of. */
export const META = {
  privacy: {
    crumb: 'Privacy',
    title: 'Privacy policy · Loopky',
    desc: 'What happens to your information when you use Loopky: no Loopky servers, no analytics, and your decks on a Pubky homeserver you hold the key to.',
    source: 'PRIVACY.md',
  },
  terms: {
    crumb: 'Terms',
    title: 'Terms of service · Loopky',
    desc: 'The terms for the Loopky apps, command line tool and agent plugin: MIT licensed with no warranty, no Loopky servers, and published decks are public.',
    source: 'TERMS.md',
  },
  support: {
    crumb: 'Support',
    title: 'Support · Loopky',
    desc: 'Help with Loopky happens in the public issue tracker on GitHub. What to put in an issue, fixes for common problems, and loopky doctor for the command line tool.',
    source: null,
  },
};

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/* "30 August 2026" as 2026-08-30, for the sitemap and the structured data. */
function isoDate(written) {
  const m = /^(\d{1,2}) (\w+) (\d{4})$/.exec(written);
  const month = m ? MONTHS.indexOf(m[2]) + 1 : 0;
  if (!month) throw new Error(`cannot read the date "${written}"`);
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/* Only what the three files use: code, links, bold and emphasis. The text is escaped
   first, so nothing in a file can add markup of its own. */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const local = href === WRITTEN_SITE || href.startsWith(WRITTEN_SITE + '/');
      return `<a href="${local ? '../' + href.slice(WRITTEN_SITE.length + 1) : href}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/* Sub-headings, numbered lists, quotes, code fences and nested lists. The policies
   are edited in the app repository by someone not looking at this parser, so one of
   these fails the build at the sync that brings it in rather than rendering as text. */
const UNSUPPORTED = /^(#{3,} |\d+\. |> |```|\s+[-*] |\* )/;

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/* Headings, paragraphs, flat lists and tables. Anything else in a source file is a
   reason to extend this rather than to let it through as a paragraph. */
function parse(markdown) {
  const out = { h1: null, updated: null, html: [] };
  const lines = markdown.split('\n');
  let i = 0;
  const rest = (test) => {
    const taken = [];
    while (i < lines.length && test(lines[i])) taken.push(lines[i++]);
    return taken;
  };
  const prose = (l) => l.trim() && !/^(#{1,2} |- |\||---$)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim() === '---') { i++; continue; }
    if (line.startsWith('# ')) { out.h1 = line.slice(2).trim(); i++; continue; }
    if (line.startsWith('## ')) {
      const text = line.slice(3).trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.html.push(`<h2 id="${id}">${inline(text)}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const [head, , ...rows] = rest((l) => l.startsWith('|'));
      out.html.push(`<div class="card dtable-wrap">
        <table class="dtable">
          <thead><tr>${cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead>
          <tbody>
          ${rows.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('\n          ')}
          </tbody>
        </table>
      </div>`);
      continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        const first = lines[i++].slice(2);
        items.push([first, ...rest((l) => l.startsWith('  ') && l.trim())].map((l) => l.trim()).join(' '));
      }
      out.html.push('<ul>\n' + items.map((x) => `        <li>${inline(x)}</li>`).join('\n') + '\n      </ul>');
      continue;
    }
    if (UNSUPPORTED.test(line)) throw new Error(`tools/legal.mjs does not read this Markdown: ${line.trim()}`);
    const text = rest(prose).map((l) => l.trim()).join(' ');
    const updated = /^\*\*Last updated:\*\* (.+)$/.exec(text);
    if (updated) out.updated = updated[1];
    else out.html.push(`<p>${inline(text)}</p>`);
  }
  if (!out.h1 || !out.updated) throw new Error('a legal page needs a "# " title and a "**Last updated:**" line');
  return out;
}

const docs = Object.fromEntries(LEGAL.map((slug) => {
  const doc = parse(read(`tools/legal/${slug}.md`));
  return [slug, { ...doc, iso: isoDate(doc.updated) }];
}));

/* The day each page last changed, for the sitemap. */
export const legalLastmod = (slug) => docs[slug].iso;

export function legalPage(slug, SITE) {
  const m = META[slug];
  const doc = docs[slug];
  const self = SITE + slug + '/';
  const css = `../assets/css/style.css?v=${stampFor('assets/css/style.css')}`;
  const source = m.source
    ? ` It is published from <a href="${GH}/blob/main/${m.source}">${m.source}</a> in the Loopky repository, which is the source and holds every earlier version.`
    : '';

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': self + '#page',
        headline: doc.h1, name: m.title, description: m.desc, url: self,
        inLanguage: 'en',
        /* No datePublished: the files carry only the day they last changed. */
        dateModified: doc.iso,
        author: { '@type': 'Person', name: 'João Victor Sena', url: 'https://github.com/jvsena42' },
        publisher: { '@id': SITE + '#org' },
        isPartOf: { '@id': SITE + '#website' },
        about: { '@id': SITE + '#app' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Loopky', item: SITE },
          { '@type': 'ListItem', position: 2, name: m.crumb, item: self },
        ],
      },
    ],
  }, null, 2).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.desc)}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#FF5C00" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D0B11" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${self}">
<link rel="icon" href="../assets/img/logo.png" type="image/png">
<link rel="apple-touch-icon" href="../assets/img/logo.png">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Loopky">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="${self}">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.desc)}">
<meta property="og:image" content="${SITE}assets/img/og.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(m.title)}">
<meta name="twitter:description" content="${esc(m.desc)}">

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

<a class="skip" href="#main">Skip to content</a>

<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="../">
      <img src="../assets/img/logo.png" width="34" height="34" alt="Loopky">
      <span>Loopky</span>
    </a>
    <div class="topright">
      <a class="btn btn-sm" href="${PLAY}">Get the app</a>
    </div>
  </div>
</header>

<main id="main">

<section class="section">
  <div class="wrap">
    <article class="prose">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="../">Loopky</a></li>
          <li aria-current="page">${esc(m.crumb)}</li>
        </ol>
      </nav>
      <h1>${esc(doc.h1)}</h1>
      <p class="fineprint prose-meta">Last updated ${esc(doc.updated)}. This page is in English only.${source}</p>
      ${doc.html.join('\n      ')}
    </article>
  </div>
</section>

</main>

<footer class="footer">
  <div class="wrap footer-in">
    <p class="foot-brand">
      <img src="../assets/img/logo.png" width="22" height="22" alt="">
      <span>Loopky</span>
    </p>
    <nav class="footlinks">
      <a href="../">Home</a>
      <a href="${PLAY}">Google Play</a>
      <a href="${TESTFLIGHT}">TestFlight</a>
      <a href="${GH}">Source code</a>
      <a href="../faq/">FAQ</a>
      <a href="../privacy/">Privacy</a>
      <a href="../terms/">Terms</a>
      <a href="../support/">Support</a>
    </nav>
    <p class="foot-note">Built on Pubky. MIT licensed.</p>
  </div>
</footer>

</body>
</html>
`;
}
