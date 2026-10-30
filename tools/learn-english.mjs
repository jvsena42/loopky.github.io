/* The "learn English" pages: one per language that has English decks, written in that
 * language, plus an English hub at /learn-english/ that lists them all.
 *
 * Search engines only see what is in the markup. The deck page answers every deck
 * through a query string and carries noindex, so a deck teaching English to Hausa or
 * Bengali speakers was invisible to someone searching in Hausa or Bengali. These
 * pages are the indexable version: the deck's own title and description, which its
 * author wrote in the learner's language, on a page with that language's lang,
 * canonical and hreflang.
 *
 * The decks come from tools/learn-english-decks.json, a snapshot of the author's
 * manifests that tools/fetch-decks.mjs refreshes. The build reads the snapshot,
 * never the network, so it is repeatable and tools/check.mjs can hold it to the
 * committed output. The few words the page adds around the decks live in LANGS
 * below; everything else on the page is the author's.
 */

/* The account that publishes the English decks. */
export const AUTHOR = '1kzgu8sshfqyaqqbm8hkxww18juw6mms8rszs1e8hrg8sy4uasio';

export const DECKS_FILE = 'tools/learn-english-decks.json';
export const HUB = 'learn-english/';

/* One entry per language a deck is written for, in the hub's order: Africa, then
 * Asia, then the rest. `front` is the deck's front_lang without its region, which is
 * how the snapshot is matched to a page. `dir` is the path segment and `code` the
 * hreflang. The strings are short on purpose, and `cards` keeps {n} where the
 * number goes, since word order differs. A language here with no deck in the
 * snapshot is not built.
 */
export const LANGS = [
  { front: 'sw', code: 'sw', dir: 'sw', og: 'sw_KE', name: 'Kiswahili', en: 'Swahili',
    crumb: 'Jifunze Kiingereza', start: 'Anza kujifunza', cards: 'Kadi {n}',
    free: 'Bure. Bila matangazo.', other: 'Lugha nyingine' },
  { front: 'ha', code: 'ha', dir: 'ha', og: 'ha_NG', name: 'Hausa', en: 'Hausa',
    crumb: 'Koyi Turanci', start: 'Fara koyo', cards: 'Katuna {n}',
    free: 'Kyauta. Babu talla.', other: 'Wasu harsuna' },
  { front: 'yo', code: 'yo', dir: 'yo', og: 'yo_NG', name: 'Yorùbá', en: 'Yoruba',
    crumb: 'Kọ́ èdè Gẹ̀ẹ́sì', start: 'Bẹ̀rẹ̀ ẹ̀kọ́', cards: 'Káàdì {n}',
    free: 'Ọ̀fẹ́. Kò sí ìpolówó.', other: 'Àwọn èdè míràn' },
  { front: 'ig', code: 'ig', dir: 'ig', og: 'ig_NG', name: 'Igbo', en: 'Igbo',
    crumb: 'Mụta Bekee', start: 'Malite ịmụ', cards: 'Kaadị {n}',
    free: "N'efu. Enweghị mgbasa ozi.", other: 'Asụsụ ndị ọzọ' },
  { front: 'am', code: 'am', dir: 'am', og: 'am_ET', name: 'አማርኛ', en: 'Amharic',
    crumb: 'እንግሊዝኛ ይማሩ', start: 'መማር ይጀምሩ', cards: '{n} ካርዶች',
    free: 'ነፃ። ማስታወቂያ የለም።', other: 'ሌሎች ቋንቋዎች' },
  { front: 'om', code: 'om', dir: 'om', og: 'om_ET', name: 'Afaan Oromoo', en: 'Oromo',
    crumb: 'Afaan Ingiliffaa baradhu', start: 'Barachuu jalqabi', cards: 'Kaardii {n}',
    free: 'Bilisa. Beeksisa hin qabu.', other: 'Afaanota biroo' },
  { front: 'zu', code: 'zu', dir: 'zu', og: 'zu_ZA', name: 'isiZulu', en: 'Zulu',
    crumb: 'Funda isiNgisi', start: 'Qala ukufunda', cards: 'Amakhadi angu-{n}',
    free: 'Mahhala. Azikho izikhangiso.', other: 'Ezinye izilimi' },
  { front: 'ar', code: 'ar', dir: 'ar', og: 'ar_AR', name: 'العربية', en: 'Arabic', rtl: true,
    crumb: 'تعلّم الإنجليزية', start: 'ابدأ التعلّم', cards: '{n} بطاقة',
    free: 'مجاني. بلا إعلانات.', other: 'لغات أخرى' },
  { front: 'hi', code: 'hi', dir: 'hi', og: 'hi_IN', name: 'हिन्दी', en: 'Hindi',
    crumb: 'अंग्रेज़ी सीखें', start: 'सीखना शुरू करें', cards: '{n} कार्ड',
    free: 'मुफ़्त। कोई विज्ञापन नहीं।', other: 'दूसरी भाषाएँ' },
  { front: 'ur', code: 'ur', dir: 'ur', og: 'ur_PK', name: 'اردو', en: 'Urdu', rtl: true,
    crumb: 'انگریزی سیکھیں', start: 'سیکھنا شروع کریں', cards: '{n} کارڈز',
    free: 'مفت۔ کوئی اشتہار نہیں۔', other: 'دوسری زبانیں' },
  { front: 'bn', code: 'bn', dir: 'bn', og: 'bn_BD', name: 'বাংলা', en: 'Bengali',
    crumb: 'ইংরেজি শিখুন', start: 'শেখা শুরু করুন', cards: '{n}টি কার্ড',
    free: 'বিনামূল্যে। কোনো বিজ্ঞাপন নেই।', other: 'অন্যান্য ভাষা' },
  { front: 'id', code: 'id', dir: 'id', og: 'id_ID', name: 'Bahasa Indonesia', en: 'Indonesian',
    crumb: 'Belajar bahasa Inggris', start: 'Mulai belajar', cards: '{n} kartu',
    free: 'Gratis. Tanpa iklan.', other: 'Bahasa lain' },
  { front: 'th', code: 'th', dir: 'th', og: 'th_TH', name: 'ไทย', en: 'Thai',
    crumb: 'เรียนภาษาอังกฤษ', start: 'เริ่มเรียน', cards: '{n} การ์ด',
    free: 'ฟรี ไม่มีโฆษณา', other: 'ภาษาอื่น' },
  { front: 'vi', code: 'vi', dir: 'vi', og: 'vi_VN', name: 'Tiếng Việt', en: 'Vietnamese',
    crumb: 'Học tiếng Anh', start: 'Bắt đầu học', cards: '{n} thẻ',
    free: 'Miễn phí. Không quảng cáo.', other: 'Ngôn ngữ khác' },
  { front: 'zh', code: 'zh-Hans', dir: 'zh-hans', og: 'zh_CN', name: '简体中文', en: 'Chinese',
    crumb: '学英语', start: '开始学习', cards: '{n} 张卡片',
    free: '免费，无广告。', other: '其他语言' },
  { front: 'ja', code: 'ja', dir: 'ja', og: 'ja_JP', name: '日本語', en: 'Japanese',
    crumb: '英語を学ぶ', start: '学習をはじめる', cards: 'カード {n} 枚',
    free: '無料、広告なし。', other: 'ほかの言語' },
  { front: 'ko', code: 'ko', dir: 'ko', og: 'ko_KR', name: '한국어', en: 'Korean',
    crumb: '영어 공부', start: '학습 시작하기', cards: '카드 {n}장',
    free: '무료, 광고 없음.', other: '다른 언어' },
  { front: 'ru', code: 'ru', dir: 'ru', og: 'ru_RU', name: 'Русский', en: 'Russian',
    crumb: 'Учить английский', start: 'Начать учить', cards: 'Карточек: {n}',
    free: 'Бесплатно. Без рекламы.', other: 'Другие языки' },
  { front: 'uk', code: 'uk', dir: 'uk', og: 'uk_UA', name: 'Українська', en: 'Ukrainian',
    crumb: 'Вивчати англійську', start: 'Почати вчити', cards: 'Карток: {n}',
    free: 'Безкоштовно. Без реклами.', other: 'Інші мови' },
];

/* Site-relative path of one language's page, with the trailing slash. */
export const learnPath = (lang) => HUB + lang.dir + '/';

/* Every page these produce, the hub first. Only languages with a deck in the
   snapshot are built, so the list is read from it rather than from LANGS alone. */
export function learnFiles(snapshot) {
  return [HUB + 'index.html', ...builtLangs(snapshot).map((l) => learnPath(l) + 'index.html')];
}

/* The front language of a deck, region dropped: "sw-KE" is "sw". */
const frontOf = (deck) => String(deck.front_lang || '').split('-')[0].toLowerCase();

export const decksFor = (snapshot, lang) => snapshot.decks
  .filter((d) => frontOf(d) === lang.front && /^en\b/i.test(d.back_lang || ''))
  /* The big deck leads the page; ties keep the snapshot's order. */
  .sort((a, b) => b.card_count - a.card_count);

export const builtLangs = (snapshot) => LANGS.filter((l) => decksFor(snapshot, l).length);
