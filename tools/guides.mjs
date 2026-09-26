/* The guide pages: which exist, and in which languages.
 *
 * English lives at /{slug}/ and every other language at /{dir}/{slug}/, so each
 * language is a real page a search engine can index on its own, with its own
 * hreflang. The words come from tools/guides/{code}.json and
 * tools/build-guides.mjs turns them into HTML.
 */

export const SLUGS = [
  'anki-alternative', 'language-learning', 'medical-students', 'teachers',
  'ai-flashcards', 'spaced-repetition', 'compare', 'faq',
];

/* The same eleven the app and the home page ship. `dir` is the path segment,
   lowercased because URLs are case sensitive and people type them. */
export const LOCALES = [
  { code: 'en', dir: '', og: 'en_US', name: 'English' },
  { code: 'pt-BR', dir: 'pt-br', og: 'pt_BR', name: 'Português' },
  { code: 'es', dir: 'es', og: 'es_ES', name: 'Español' },
  { code: 'fr', dir: 'fr', og: 'fr_FR', name: 'Français' },
  { code: 'de', dir: 'de', og: 'de_DE', name: 'Deutsch' },
  { code: 'it', dir: 'it', og: 'it_IT', name: 'Italiano' },
  { code: 'ja', dir: 'ja', og: 'ja_JP', name: '日本語' },
  { code: 'ko', dir: 'ko', og: 'ko_KR', name: '한국어' },
  { code: 'vi', dir: 'vi', og: 'vi_VN', name: 'Tiếng Việt' },
  { code: 'zh-Hans', dir: 'zh-hans', og: 'zh_CN', name: '简体中文' },
  { code: 'zh-Hant', dir: 'zh-hant', og: 'zh_TW', name: '繁體中文' },
];

/* Site-relative path of one guide in one language, with the trailing slash. */
export const guidePath = (locale, slug) => (locale.dir ? locale.dir + '/' : '') + slug + '/';

/* The home page in every language but English, which is index.html itself. */
export const HOME_FILES = LOCALES.filter((l) => l.dir).map((l) => l.dir + '/index.html');

/* Every guide file, English first. */
export const GUIDE_FILES = LOCALES.flatMap((l) => SLUGS.map((s) => guidePath(l, s) + 'index.html'));
