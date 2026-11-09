import en, { pack as enPack } from './locales/en.js';
import uk, { pack as ukPack } from './locales/uk.js';

export const LANGUAGES = ['en', 'uk'];
export const DEFAULT_LANGUAGE = 'en';

// What the Master is told about a language: glossary, roast rules, banned phrases, voice tips.
const PACKS = { en: enPack, uk: ukPack };
export const packFor = (lang) => {
  if (!PACKS[lang]) throw new RangeError(`Unknown language "${lang}".`);
  return PACKS[lang];
};

// Each language's name in its own language, so a player can find theirs.
export const LANGUAGE_NAMES = { en: 'English', uk: 'Українська' };

const strict = () => process.env.JSDND_I18N_STRICT === '1';

// A translator over a set of catalogs: { en: { key: 'text' | { one, few, many, other } } }.
// A missing key falls back to English and tells the missing handler, so a test can see it. A player
// never gets a crash for a missing key or placeholder. With JSDND_I18N_STRICT=1 (the tests set it)
// both throw instead.
export function createTranslator(catalogs) {
  let onMissing = null;

  function t(lang, key, params = {}) {
    if (!LANGUAGES.includes(lang))
      throw new RangeError(`Unknown language "${lang}". Use one of: ${LANGUAGES.join(', ')}.`);
    let entry = catalogs[lang]?.[key];
    if (entry === undefined) {
      onMissing?.({ lang, key });
      if (strict()) throw new Error(`Missing translation for "${key}" in ${lang}.`);
      entry = catalogs[DEFAULT_LANGUAGE]?.[key];
      if (entry === undefined) {
        if (strict()) throw new Error(`Missing translation for "${key}" in ${DEFAULT_LANGUAGE}.`);
        return key;
      }
    }
    let text = entry;
    if (typeof entry === 'object') {
      if (!Number.isFinite(params.count)) {
        if (strict()) throw new Error(`"${key}" is a plural entry and needs a numeric count.`);
        return entry.other ?? key;
      }
      const category = new Intl.PluralRules(lang).select(params.count);
      text = entry[category] ?? entry.other;
    }
    return text.replace(/\{(\w+)\}/g, (whole, name) => {
      if (Object.hasOwn(params, name)) return String(params[name]);
      if (strict()) throw new Error(`"${key}" needs the placeholder {${name}}.`);
      return whole;
    });
  }

  return {
    t,
    setMissingHandler(handler) {
      onMissing = handler;
    },
  };
}

const translator = createTranslator({ en, uk });
export const t = translator.t;
export const setMissingHandler = translator.setMissingHandler;

// The language lives in the game database, per save. Null means the player has not chosen yet.
export function getLanguage(db, saveId) {
  const row = db.prepare('SELECT language FROM saves WHERE id = ?').get(saveId);
  return row?.language ?? null;
}

export function setLanguage(db, saveId, lang) {
  if (!LANGUAGES.includes(lang))
    throw new RangeError(`Unknown language "${lang}". Use one of: ${LANGUAGES.join(', ')}.`);
  const result = db.prepare('UPDATE saves SET language = ? WHERE id = ?').run(lang, saveId);
  if (result.changes === 0) throw new Error(`There is no save ${saveId}.`);
}

// Until a language is chosen the game behaves as English.
export const effectiveLanguage = (db, saveId) => getLanguage(db, saveId) ?? DEFAULT_LANGUAGE;
