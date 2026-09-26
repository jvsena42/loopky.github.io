/* Loads the real page in a headless browser and fails if it scrolls sideways.
 *
 *   node tools/layout-check.mjs
 *
 * This exists because a wrapper div around the topic chips once stretched the row to
 * 1679px at every viewport and took the whole page's width with it, and none of the
 * screenshots showed it: a cropped screenshot of an overflowing page looks exactly
 * like a cropped screenshot of a correct one. A number does not.
 *
 * The page is loaded in an iframe per viewport width, so one browser run covers every
 * breakpoint, and each iframe's own width drives the media queries inside it. Skipped
 * with a note when no Chrome is installed, so `check.mjs` stays useful without one.
 */

import { cpSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUIDES } from './stamp-assets.mjs';

const WIDTHS = [390, 600, 900, 1440];

/* A real deck and its author, so the pages are measured with a title, a cover, a
   description and a deck grid in them. If the deck is ever deleted the page shows
   its not-found state instead, which is still worth measuring. */
const AUTHOR = '3jubjyq4fkh4dq38exrpuo8we6xta8a6rhxnjjzyoo7j4r3f4rjo';
const PAGES = [
  'index.html',
  `deck/?author=${AUTHOR}&id=viageming2026a`,
  `profile/?pubky=${AUTHOR}`,
  /* Translated home pages: the longest words and the no-space script. */
  'de/', 'ja/', 'pt-br/',
  /* Every guide in English, plus the two languages most likely to break a layout:
     Japanese (no spaces to wrap at) and German (long compounds). */
  ...GUIDES.filter((g) => !/^(?:[a-z-]+\/){2}/.test(g) || /^(?:ja|de)\//.test(g))
    .map((g) => g.replace('index.html', '')),
];
/* One chip of slack: a sub-pixel layout width rounds up and is not a broken page. */
const TOLERANCE = 1;
const PORT = 8899;

const root = new URL('../', import.meta.url).pathname;

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable']) {
    const which = spawnSync('which', [name], { encoding: 'utf8' });
    if (which.status === 0) return which.stdout.trim();
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('note: no Chrome found, skipping the layout check (set CHROME_BIN to run it)');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'loopky-layout-'));
let server;

function cleanup() {
  if (server) server.kill();
  rmSync(dir, { recursive: true, force: true });
}
process.on('exit', cleanup);

try {
  /* The whole site, since guides live in a directory per language. */
  cpSync(root, dir, { recursive: true, filter: (src) => !src.includes('/.git') });

  writeFileSync(join(dir, 'probe.html'), `<!doctype html>
<meta charset="utf-8">
<body style="margin:0">
<script>
var WIDTHS = ${JSON.stringify(WIDTHS)};
var PAGES = ${JSON.stringify(PAGES)};
PAGES.forEach(function (page) {
  WIDTHS.forEach(function (w) {
    var f = document.createElement('iframe');
    f.src = page;
    f.width = w; f.height = 900;
    f.style.cssText = 'border:0;display:block';
    f.dataset.w = w;
    f.dataset.page = page.split('?')[0];
    document.body.appendChild(f);
  });
});
setTimeout(function () {
  var out = [];
  document.querySelectorAll('iframe').forEach(function (f) {
    try {
      var d = f.contentDocument.documentElement;
      out.push({ page: f.dataset.page, width: Number(f.dataset.w), overflow: d.scrollWidth - d.clientWidth });
    } catch (e) {
      out.push({ page: f.dataset.page, width: Number(f.dataset.w), error: String(e) });
    }
  });
  var el = document.createElement('div');
  el.id = 'result';
  el.textContent = JSON.stringify(out);
  document.body.appendChild(el);
}, 9000);
</script>
</body>`);

  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: dir, stdio: 'ignore' });
  /* Or node waits on it forever after the report is printed. */
  server.unref();

  /* Give the server a moment, then let Chrome run long enough for the decks to load. */
  spawnSync('sleep', ['1']);

  const run = spawnSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=25000',
    '--window-size=1600,1000',
    '--dump-dom', `http://127.0.0.1:${PORT}/probe.html`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });

  const m = /<div id="result">([^<]*)<\/div>/.exec(run.stdout || '');
  if (!m) {
    console.error('FAIL: the layout probe did not report. Chrome may have failed to start.');
    process.exit(1);
  }

  const results = JSON.parse(m[1]);
  const bad = results.filter((r) => r.error || r.overflow > TOLERANCE);

  for (const r of results) {
    const note = r.error ? `error: ${r.error}`
      : r.overflow > TOLERANCE ? `overflows by ${r.overflow}px`
        : 'ok';
    console.log(`  ${r.page.padEnd(20)} ${String(r.width).padStart(5)}px  ${note}`);
  }

  if (bad.length) {
    console.error('\nFAIL: the page scrolls sideways. Something inside a grid or flex ' +
      'container is sizing to its content; the usual fix is min-width: 0 on the item.');
    process.exit(1);
  }
  console.log(`\nOK. No horizontal overflow on ${PAGES.length} pages at ${WIDTHS.length} widths.`);
  process.exit(0);
} catch (e) {
  console.error('FAIL: layout check could not run:', e.message);
  process.exit(1);
}
