/* Holds assets/js/recap-core.js to tools/recap-fixture.json.
 *
 * The app computes the same recap in Kotlin and asserts the same file
 * (YearRecapFixtureJvmTest in jvsena42/loopky), so a rule that drifts on one side fails
 * here or there. The fixture is a byte-for-byte copy: update both, together.
 *
 *   node tools/recap.test.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const recap = require('../assets/js/recap-core.js');
const fixture = JSON.parse(readFileSync(new URL('./recap-fixture.json', import.meta.url), 'utf8'));

let failed = 0;
function test(name, body) {
  try {
    body();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${e.message}`);
  }
}

const DAY = 86400000;
const Y2026 = Date.UTC(2026, 0, 1);
const Y2027 = Date.UTC(2027, 0, 1);
const MID = Y2026 + 150 * DAY;
const state = (reviewedAt, intervalDays = 3) => ({
  dueAt: reviewedAt + (intervalDays === 0 ? 600000 : intervalDays * DAY),
  intervalDays,
});
const deck = (over) => ({
  id: 'd1', owned: true, title: 'Deck', coverEmoji: null, createdAt: 1000, cardCount: 0,
  frontLang: null, backLang: null, tags: [], states: [], ...over,
});
const run = (decks, thresholdDays = 7) => recap.compute({ year: 2026, thresholdDays, decks });

test('matches the fixture the app is held to', () => {
  const { year: _year, ...actual } = recap.compute(fixture);
  assert.deepEqual(actual, fixture.expected);
});

test('year starts are midnight UTC, the same instants the app uses', () => {
  assert.equal(recap.yearStart(2026), 1767225600000);
  assert.equal(recap.yearStart(2027), 1798761600000);
});

test('the last review is read back out of the due date, lapses included', () => {
  assert.equal(recap.lastReviewedAt(state(MID, 7)), MID);
  assert.equal(recap.lastReviewedAt(state(MID, 0)), MID);
});

test('a card counts in the year its last review fell in', () => {
  const r = run([deck({ states: [state(Y2026), state(Y2027 - 1), state(Y2026 - 1), state(Y2027)] })]);
  assert.equal(r.cardsStudied, 2);
});

test('ties for the top deck break by title in code-unit order', () => {
  const r = run([
    deck({ id: 'a', title: 'Zoology', states: [state(MID), state(MID)] }),
    deck({ id: 'b', title: 'Algebra', states: [state(MID), state(MID)] }),
    deck({ id: 'c', title: 'Émile', states: [state(MID), state(MID)] }),
  ]);
  /* localeCompare would put Émile before Zoology; code units put it last. */
  assert.equal(r.topDeck.title, 'Algebra');
});

test('topics leave out reserved labels and the ones a language pair adds', () => {
  const r = run([deck({
    frontLang: 'es-ES', backLang: 'en-US',
    tags: ['language', 'spanish', 'english', 'verbs', 'loopky-deck'],
    states: [state(MID)],
  })]);
  assert.deepEqual(r.topics, ['verbs']);
  assert.deepEqual(r.languages, ['en', 'es']);
});

test('created counts owned decks only', () => {
  const r = run([
    deck({ id: 'mine', createdAt: MID, cardCount: 12 }),
    deck({ id: 'theirs', owned: false, createdAt: MID, cardCount: 50 }),
  ]);
  assert.equal(r.decksCreated, 1);
  assert.equal(r.cardsCreated, 12);
  assert.equal(r.isEmpty, false);
});

test('a year with nothing in it is empty', () => {
  assert.equal(run([deck({})]).isEmpty, true);
});

test('the mastery threshold is the longest interval, clamped like the app clamps it', () => {
  assert.equal(recap.thresholdDays(undefined), 7);
  assert.equal(recap.thresholdDays({ first_hard_days: 10, first_good_days: 3, first_easy_days: 7 }), 10);
  assert.equal(recap.thresholdDays({ first_easy_days: 9999 }), 365);
  assert.equal(recap.thresholdDays({ first_hard_days: 0, first_good_days: 0, first_easy_days: 0 }), 1);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
