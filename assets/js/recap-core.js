/* The yearly recap, computed from what an account has published.
 *
 * This is `YearRecap.from` in the app (shared/.../domain/model/YearRecap.kt), written a
 * second time so the page can draw the same numbers the phone does. Three rules exist
 * only to keep the two equal, and each is easy to break without noticing:
 *
 *   States, not cards.  A review state whose card was since deleted still counts. The
 *                       app could tell the difference, this page cannot afford to (it
 *                       would mean fetching every card), so neither does.
 *   UTC.                The year runs from 1 January 00:00 UTC. A local boundary would
 *                       put a card graded on New Year's Eve in different years here and
 *                       on the phone.
 *   Code-unit order.    Ties are broken with `<`, never localeCompare, because that is
 *                       what Kotlin's compareBy does.
 *
 * tools/recap-fixture.json is the same file the app's YearRecapFixtureJvmTest reads.
 * tools/recap.test.mjs holds this file to it. Change a rule in both repos or in neither.
 *
 * No DOM in here: the test loads this file under Node.
 */
var loopkyRecap = (function () {
  'use strict';

  var DAY_MS = 86400000;
  var AGAIN_DELAY_MS = 600000;
  var MAX_TOPICS = 3;
  var POLYGLOT_LANGUAGES = 3;
  var UMBRELLA = 'language';

  /* `LanguageTags.NAMES` in the app, entry for entry. Declaring a language pair tags a
     deck with these, and the recap leaves them out of its topics. */
  var LANGUAGE_NAMES = {
    af: 'afrikaans', ar: 'arabic', bg: 'bulgarian', bn: 'bengali', bs: 'bosnian',
    ca: 'catalan', cs: 'czech', cy: 'welsh', da: 'danish', de: 'german', el: 'greek',
    en: 'english', es: 'spanish', et: 'estonian', eu: 'basque', fa: 'persian',
    fi: 'finnish', fil: 'filipino', fr: 'french', ga: 'irish', gl: 'galician',
    gu: 'gujarati', he: 'hebrew', hi: 'hindi', hr: 'croatian', hu: 'hungarian',
    hy: 'armenian', id: 'indonesian', in: 'indonesian', is: 'icelandic', it: 'italian',
    iw: 'hebrew', ja: 'japanese', ji: 'yiddish', jv: 'javanese', ka: 'georgian',
    kk: 'kazakh', km: 'khmer', kn: 'kannada', ko: 'korean', lo: 'lao', lt: 'lithuanian',
    lv: 'latvian', mk: 'macedonian', ml: 'malayalam', mn: 'mongolian', mr: 'marathi',
    ms: 'malay', my: 'burmese', nb: 'norwegian', ne: 'nepali', nl: 'dutch',
    nn: 'norwegian', no: 'norwegian', pa: 'punjabi', pl: 'polish', pt: 'portuguese',
    ro: 'romanian', ru: 'russian', si: 'sinhala', sk: 'slovak', sl: 'slovenian',
    sq: 'albanian', sr: 'serbian', su: 'sundanese', sv: 'swedish', sw: 'swahili',
    ta: 'tamil', te: 'telugu', th: 'thai', tl: 'filipino', tr: 'turkish', uk: 'ukrainian',
    ur: 'urdu', uz: 'uzbek', vi: 'vietnamese', yi: 'yiddish', zh: 'chinese', zu: 'zulu'
  };

  function baseSubtag(tag) {
    return String(tag).split('-')[0].trim().toLowerCase();
  }

  function distinct(list) {
    var seen = {};
    return list.filter(function (v) {
      if (Object.prototype.hasOwnProperty.call(seen, v)) return false;
      seen[v] = true;
      return true;
    });
  }

  /* The labels a declared pair puts on a deck: the umbrella, then each language's name. */
  function languageTags(frontLang, backLang) {
    var names = distinct(distinct([frontLang, backLang]
      .filter(function (l) { return typeof l === 'string'; })
      .map(baseSubtag)
      .filter(function (l) { return l !== ''; }))
      .map(function (l) {
        return Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, l) ? LANGUAGE_NAMES[l] : l;
      }));
    return names.length ? [UMBRELLA].concat(names) : [];
  }

  function isReserved(label) {
    return String(label).trim().toLowerCase().indexOf('loopky-') === 0;
  }

  /* When a state was last graded. Not stored: read back out of how the scheduler
     builds a due date, `now + interval` or `now + 10 minutes` for a lapse. */
  function lastReviewedAt(state) {
    return state.intervalDays === 0
      ? state.dueAt - AGAIN_DELAY_MS
      : state.dueAt - state.intervalDays * DAY_MS;
  }

  function yearStart(year) {
    return Date.UTC(year, 0, 1);
  }

  function byCodeUnit(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /* Commonest first, then by code unit. */
  function ranked(values) {
    var counts = {};
    var order = [];
    values.forEach(function (v) {
      if (!Object.prototype.hasOwnProperty.call(counts, v)) { counts[v] = 0; order.push(v); }
      counts[v]++;
    });
    return order.sort(function (a, b) { return (counts[b] - counts[a]) || byCodeUnit(a, b); });
  }

  function distinctById(decks) {
    var seen = {};
    return decks.filter(function (d) {
      if (Object.prototype.hasOwnProperty.call(seen, d.id)) return false;
      seen[d.id] = true;
      return true;
    });
  }

  /**
   * [input] is `{ year, thresholdDays, decks }`, each deck
   * `{ id, owned, title, coverEmoji, createdAt, cardCount, frontLang, backLang, tags,
   *    states: [{ dueAt, intervalDays }] }`. Owned decks come first, as the app lists them.
   */
  function compute(input) {
    var from = yearStart(input.year);
    var to = yearStart(input.year + 1);
    var owned = input.decks.filter(function (d) { return d.owned; });
    var followed = input.decks.filter(function (d) { return !d.owned; });

    var studied = [];
    distinctById(owned.concat(followed)).forEach(function (deck) {
      var inYear = (deck.states || []).filter(function (s) {
        var at = lastReviewedAt(s);
        return at >= from && at < to;
      });
      if (inYear.length) studied.push({ deck: deck, states: inYear });
    });
    var created = distinctById(owned).filter(function (d) {
      return d.createdAt >= from && d.createdAt < to;
    });

    var cardsStudied = 0;
    var cardsMastered = 0;
    var languageList = [];
    var topicList = [];
    studied.forEach(function (s) {
      cardsStudied += s.states.length;
      cardsMastered += s.states.filter(function (st) {
        return st.intervalDays >= input.thresholdDays;
      }).length;
      /* A blank tag is no language: a manifest can carry "front_lang": "". */
      languageList = languageList.concat(distinct([s.deck.frontLang, s.deck.backLang]
        .filter(function (l) { return typeof l === 'string'; })
        .map(baseSubtag)
        .filter(function (l) { return l !== ''; })));
      var derived = languageTags(s.deck.frontLang, s.deck.backLang);
      topicList = topicList.concat(distinct((s.deck.tags || []).filter(function (t) {
        return !isReserved(t) && derived.indexOf(t) === -1;
      })));
    });
    var cardsCreated = created.reduce(function (sum, d) { return sum + (d.cardCount || 0); }, 0);
    var languages = ranked(languageList);

    var top = studied.slice().sort(function (a, b) {
      return (b.states.length - a.states.length) ||
        byCodeUnit(a.deck.title, b.deck.title) ||
        byCodeUnit(a.deck.id, b.deck.id);
    })[0];

    var persona = 'Explorer';
    if (languages.length >= POLYGLOT_LANGUAGES) persona = 'Polyglot';
    else if (cardsCreated > 0 && cardsCreated >= cardsStudied) persona = 'Creator';
    else if (cardsStudied > 0 && cardsMastered * 2 >= cardsStudied) persona = 'Master';

    return {
      year: input.year,
      cardsStudied: cardsStudied,
      cardsMastered: cardsMastered,
      decksStudied: studied.length,
      /* Which deck [topDeck] is, for a caller that wants to link to it. Kept beside the
         summary rather than in it: the summary is what the app's own recap carries. */
      topDeckId: top ? top.deck.id : null,
      topDeck: top ? {
        title: top.deck.title,
        coverEmoji: top.deck.coverEmoji || null,
        cardsStudied: top.states.length,
      } : null,
      decksCreated: created.length,
      cardsCreated: cardsCreated,
      languages: languages,
      topics: ranked(topicList).slice(0, MAX_TOPICS),
      persona: persona,
      isEmpty: cardsStudied === 0 && created.length === 0,
    };
  }

  /* `StudySettings.maturityThresholdDays`: the longest of the three intervals, each
     clamped to the range the app accepts. [study] is the record's `study` section. */
  function thresholdDays(study) {
    function days(value, fallback) {
      var n = typeof value === 'number' && isFinite(value) ? Math.floor(value) : fallback;
      return Math.min(365, Math.max(1, n));
    }
    var s = study || {};
    return Math.max(1, days(s.first_hard_days, 1), days(s.first_good_days, 3), days(s.first_easy_days, 7));
  }

  return {
    compute: compute,
    thresholdDays: thresholdDays,
    lastReviewedAt: lastReviewedAt,
    yearStart: yearStart,
    languageTags: languageTags,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = loopkyRecap;
