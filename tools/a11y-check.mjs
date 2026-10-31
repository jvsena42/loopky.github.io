/* Accessibility checks, read from the browser's own accessibility tree.
 *
 *   node tools/a11y-check.mjs
 *
 * The accessibility tree is what a screen reader reads, and what a browser agent
 * (computer use, Chrome DevTools MCP, Playwright) reads instead of the pixels. A
 * button with no name, an emoji read out as text or two buttons called "Copy" look
 * fine in a screenshot and are guesswork in the tree, which is how each of those
 * shipped. check.mjs catches what the markup alone shows; this catches what only
 * exists once the page has run: the buttons app.js builds, the names it gives them,
 * the deck page's card table, and what Discover shows while the network answers.
 *
 * No dependencies. It starts the runner's Chrome with a DevTools port and speaks the
 * DevTools protocol over Node's own WebSocket, so `Accessibility.getFullAXTree` is
 * Chrome's tree, not an estimate of it. Skipped with a note when no Chrome is
 * installed, like layout-check.mjs.
 *
 * Each page is checked:
 *   - with JavaScript: names, roles, headings, landmarks, language, and colour
 *     contrast in the light and the dark theme;
 *   - without JavaScript: that a reader still gets a heading and real content, and
 *     that the share pages show the note explaining where their data is.
 *
 * Contrast is held against WCAG AA (4.5:1, or 3:1 for large text). The palette is the
 * app's, from LoopkyColors.kt, and a few of its pairs sit below that; they are listed
 * in KNOWN_LOW_CONTRAST with where each is drawn, so this fails on a new low-contrast
 * pair and not on a known one, and says when a known one stops being drawn. Fix a pair
 * and its line goes; never add one to get CI green without saying why.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* A real deck and its author, the same ones layout-check.mjs measures. If the network
   cannot be read the pages show their error state, which is still checked. */
const AUTHOR = '3jubjyq4fkh4dq38exrpuo8we6xta8a6rhxnjjzyoo7j4r3f4rjo';
const PAGES = [
  { path: '', lang: 'en' },
  { path: 'ja/', lang: 'ja' },
  { path: 'de/', lang: 'de' },
  { path: `deck/?author=${AUTHOR}&id=viageming2026a`, lang: 'en', share: true, settle: '#link-card:not([data-state="loading"])' },
  { path: `profile/?pubky=${AUTHOR}`, lang: 'en', share: true, settle: '#link-card:not([data-state="loading"])' },
  { path: `recap/?pubky=${AUTHOR}&year=2026`, lang: 'en', share: true, settle: '#recap:not([data-state="loading"])' },
  { path: 'ai-flashcards/', lang: 'en' },
  { path: 'faq/', lang: 'en' },
  { path: 'compare/', lang: 'en' },
  { path: 'zh-hant/teachers/', lang: 'zh-Hant' },
  { path: 'learn-english/', lang: 'en' },
  { path: 'learn-english/ar/', lang: 'ar' },
  { path: 'privacy/', lang: 'en' },
  { path: 'support/', lang: 'en' },
];

/* Colour pairs already on the site below AA, as "text on background", with where each
   one is. All come from the palette as it stood when this check was added. */
const KNOWN_LOW_CONTRAST = new Map([
  ['rgb(255, 255, 255) on rgb(255, 92, 0)', 'light: white on the orange buttons (--on-accent on --accent), 3.0:1'],
  ['rgb(255, 255, 255) on rgb(255, 107, 44)', 'dark: white on the orange buttons, 2.8:1'],
  ['rgb(255, 92, 0) on rgb(255, 255, 255)', 'both: orange on white, the inverted store button in the bottom band and the eyebrow on a link card, 3.1:1'],
  ['rgb(255, 92, 0) on rgb(255, 244, 234)', 'light: orange eyebrows ("AI flashcard maker") on the peach sections, 2.9:1'],
  ['rgb(139, 139, 153) on rgb(255, 255, 255)', 'light: --fg-muted on white cards, 3.4:1'],
  ['rgb(139, 139, 153) on rgb(255, 251, 245)', 'light: --fg-muted on the page, the Discover status and table notes, 3.3:1'],
  ['rgb(139, 139, 153) on rgb(255, 244, 234)', 'light: --fg-muted on the peach sections, 3.1:1'],
  ['rgb(122, 76, 255) on rgb(233, 224, 255)', 'light: purple deck tags (#language) on their lavender chip, 3.9:1'],
  ['rgb(129, 125, 136) on rgb(26, 19, 38)', 'light: the footer note on the dark footer, 4.48:1'],
  ['rgb(136, 132, 142) on rgb(38, 32, 50)', 'dark: the footer note on the footer, 4.3:1'],
]);
const knownSeen = new Set();

const PORT = 9333;
const HTTP_PORT = 8898;
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
  console.log('note: no Chrome found, skipping the accessibility check (set CHROME_BIN to run it)');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'loopky-a11y-'));
const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'],
  { cwd: root, stdio: 'ignore' });
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });
function cleanup() {
  server.kill();
  browser.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ }
}
process.on('exit', cleanup);

/* ---------------------------------------------------------------- DevTools */

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not open its DevTools port');
}

const ws = new WebSocket(await connect());
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
let seq = 0;
const waiting = new Map();
const listeners = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) {
    const { ok, bad } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) bad(new Error(msg.error.message)); else ok(msg.result);
  } else if (msg.method) {
    listeners.slice().forEach((l) => l(msg));
  }
};
const send = (method, params = {}) => new Promise((ok, bad) => {
  const id = ++seq;
  waiting.set(id, { ok, bad });
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method, ms) => new Promise((ok) => {
  const timer = setTimeout(() => { listeners.splice(listeners.indexOf(l), 1); ok(null); }, ms);
  const l = (msg) => {
    if (msg.method !== method) return;
    clearTimeout(timer);
    listeners.splice(listeners.indexOf(l), 1);
    ok(msg.params);
  };
  listeners.push(l);
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Accessibility.enable');

async function open(path, { js, settle }) {
  await send('Emulation.setScriptExecutionDisabled', { value: !js });
  const loaded = once('Page.loadEventFired', 20000);
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/${path}` });
  await loaded;
  if (!js) return;
  /* A share page is drawn once its read settles; give it the time the network takes,
     and check whatever state it is in after that. */
  if (settle) {
    for (let i = 0; i < 60; i++) {
      if (await evaluate(`!!document.querySelector(${JSON.stringify(settle)})`)) break;
      await sleep(250);
    }
  }
  await sleep(600);
}

/* ---------------------------------------------------------------- the checks */

const problems = [];
const fail = (page, msg) => problems.push(`${page || '/'}: ${msg}`);

/* Roles a person or an agent acts on, which therefore need a name. */
const NAMED = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio',
  'switch', 'slider', 'tab', 'menuitem', 'option', 'listbox', 'image', 'img', 'dialog']);
/* Text that is only emoji, symbols and punctuation. Read aloud it is "books" or
   "construction crane" in the middle of a sentence; it belongs behind aria-hidden. */
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}\s]+$/u;

async function checkTree(page) {
  const { nodes } = await send('Accessibility.getFullAXTree');
  const live = nodes.filter((n) => !n.ignored);
  const role = (n) => n.role?.value;
  const name = (n) => (n.name?.value ?? '').trim();

  for (const n of live) {
    const r = role(n);
    if (NAMED.has(r) && !name(n)) {
      fail(page, `${/^[aeiou]/.test(r) ? 'an' : 'a'} ${r} has no accessible name`);
    }
    if (r === 'StaticText' && EMOJI_ONLY.test(name(n))) {
      fail(page, `the emoji "${name(n)}" is read out as text; put it behind aria-hidden="true"`);
    }
  }

  /* Two buttons with one name are one button to whoever cannot see where they sit. */
  const buttons = {};
  for (const n of live.filter((x) => role(x) === 'button')) {
    const k = name(n);
    if (k) buttons[k] = (buttons[k] || 0) + 1;
  }
  for (const [k, count] of Object.entries(buttons)) {
    if (count > 1) fail(page, `${count} buttons are named "${k}"; give each a name that says what it does`);
  }

  const headings = live.filter((n) => role(n) === 'heading')
    .map((n) => ({ level: n.properties?.find((p) => p.name === 'level')?.value?.value, text: name(n) }));
  const h1 = headings.filter((h) => h.level === 1);
  if (h1.length !== 1) fail(page, `has ${h1.length} level-one headings; a page has exactly one`);
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      fail(page, `heading "${headings[i].text}" jumps from level ${headings[i - 1].level} to ${headings[i].level}`);
    }
  }
  if (!live.some((n) => role(n) === 'main')) fail(page, 'has no main landmark');
}

async function checkDocument(page, lang) {
  const doc = await evaluate(`({
    lang: document.documentElement.lang,
    title: document.title.trim(),
    skip: (function () {
      var a = document.querySelector('a.skip');
      if (!a) return 'none';
      var id = (a.getAttribute('href') || '').replace(/^#/, '');
      return document.getElementById(id) ? 'ok' : 'broken';
    })(),
  })`);
  if (doc.lang !== lang) fail(page, `<html lang="${doc.lang}">, but the page is in ${lang}`);
  if (!doc.title) fail(page, 'has no <title>');
  if (doc.skip === 'broken') fail(page, 'the skip link points at an id that is not on the page');
}

/* Every element that draws text, its colour and the first opaque background behind
   it. An element over a picture or a gradient is skipped: its background is not one
   colour, and the check would be guessing. */
const CONTRAST = `(function () {
  /* rgb(), rgba(), and color(srgb r g b / a), which is how Chrome reports a colour
     made with color-mix(): channels from 0 to 1 instead of 0 to 255. */
  function rgba(s) {
    var m = (s.match(/[\\d.]+/g) || [0, 0, 0, 0]).map(Number);
    if (/^color\\(srgb/.test(s)) m = m.slice(0, 3).map(function (v) { return v * 255; }).concat(m.slice(3));
    return m.concat([1]).slice(0, 4);
  }
  function lum(c) {
    var a = c.slice(0, 3).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function over(top, under) {
    var a = top[3];
    return [0, 1, 2].map(function (i) { return Math.round(top[i] * a + under[i] * (1 - a)); }).concat([1]);
  }
  function background(el) {
    var layers = [];
    for (var e = el; e; e = e.parentElement) {
      var s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') return null;
      var c = rgba(s.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    var out = [255, 255, 255, 1];
    for (var i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return out;
  }
  var seen = {}, out = [];
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (var t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    var el = t.parentElement;
    if (!el || el.closest('[aria-hidden="true"], .sr-only, [hidden], noscript, script, style')) continue;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    var s = getComputedStyle(el);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
    var bg = background(el);
    if (!bg) continue;
    var fg = over(rgba(s.color), bg);
    var l1 = lum(fg), l2 = lum(bg);
    var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    var size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    var large = size >= 24 || (bold && size >= 18.66);
    if (ratio >= (large ? 3 : 4.5)) continue;
    var key = 'rgb(' + fg.slice(0, 3).join(', ') + ') on rgb(' + bg.slice(0, 3).join(', ') + ')';
    if (seen[key]) continue;
    seen[key] = true;
    out.push({ pair: key, ratio: Math.round(ratio * 100) / 100, text: t.textContent.trim().slice(0, 40) });
  }
  return out;
})()`;

async function checkContrast(page) {
  /* The theme switch animates its colours; measured mid-way, a button reads as a
     shade between two themes. */
  await evaluate(`(function () {
    var s = document.createElement('style');
    s.id = 'a11y-still';
    s.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(s);
  })()`);
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.setAttribute('data-theme', '${theme}')`);
    await sleep(150);
    for (const c of await evaluate(CONTRAST)) {
      if (KNOWN_LOW_CONTRAST.has(c.pair)) { knownSeen.add(c.pair); continue; }
      fail(page, `${theme} theme: "${c.text}" is ${c.pair}, a contrast of ${c.ratio}:1, below WCAG AA`);
    }
  }
  await evaluate(`document.documentElement.removeAttribute('data-theme')`);
}

/* Without JavaScript: a heading, some words, and on the share pages the note. */
async function checkNoScript(page, share) {
  const r = await evaluate(`({
    h1: (document.querySelector('h1') || {}).textContent || '',
    text: ((document.querySelector('main') || {}).innerText || '').replace(/\\s+/g, '').length,
    note: (function () { var n = document.getElementById('agent-note'); return !!n && !!n.offsetHeight; })(),
    tiles: document.querySelectorAll('#disc-grid a.deck').length,
    discover: !!document.getElementById('disc-grid'),
  })`);
  if (!r.h1.trim()) fail(page, 'without JavaScript there is no level-one heading');
  if (r.text < 300) fail(page, `without JavaScript <main> has ${r.text} characters of text`);
  if (share && !r.note) fail(page, 'without JavaScript the note on reading this page is not shown');
  if (r.discover && r.tiles < 6) fail(page, `without JavaScript Discover shows ${r.tiles} decks`);
}

/* ---------------------------------------------------------------- run */

try {
  await sleep(300);
  for (const p of PAGES) {
    const label = p.path.split('?')[0];
    await open(p.path, { js: false });
    await checkNoScript(label, p.share);
    await open(p.path, { js: true, settle: p.settle });
    await checkDocument(label, p.lang);
    await checkTree(label);
    await checkContrast(label);
    console.log(`  checked ${label || '/'}`);
  }
} catch (e) {
  console.error('FAIL: the accessibility check could not run:', e.message);
  process.exit(1);
}

ws.close();
/* A known pair that no page draws any more has been fixed, or has moved; either way
   its line should go, so the list stays a list of real debts. */
for (const [pair, where] of KNOWN_LOW_CONTRAST) {
  if (!knownSeen.has(pair)) console.log(`note: ${pair} (${where}) is no longer drawn; remove it from KNOWN_LOW_CONTRAST`);
}
if (problems.length) {
  console.error('\n' + problems.map((p) => `FAIL: ${p}`).join('\n'));
  console.error(`\n${problems.length} accessibility problem${problems.length === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(`\nOK. ${PAGES.length} pages, with and without JavaScript, light and dark.`);
process.exit(0);
