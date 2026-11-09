import { pack as enPack } from './locales/en.js';
import { pack as ukPack } from './locales/uk.js';

// Phrases that make a Dungeon Master sound like a chatbot. The list for each language lives in its
// locale file. English phrases are checked in every language, because a chatbot slips them in anywhere.
export const BANNED_PHRASES = enPack.bannedPhrases;
const PACKS = { en: enPack, uk: ukPack };

// Case, spacing, and every apostrophe and quote variant (', curly quotes, the Ukrainian ʼ) are flattened.
const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/\s+/g, ' ');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole words only, in any alphabet, so "as an aide" never trips "as an ai" and a Ukrainian phrase
// inside a longer Ukrainian word never trips either.
const matcher = (phrase) => ({
  phrase,
  pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(normalize(phrase))}(?![\\p{L}\\p{N}])`, 'u'),
});

const MATCHERS = Object.fromEntries(
  Object.keys(PACKS).map((lang) => {
    const phrases = lang === 'en' ? enPack.bannedPhrases : [...PACKS[lang].bannedPhrases, ...enPack.bannedPhrases];
    return [lang, phrases.map(matcher)];
  }),
);

export function lintVoice(text, lang = 'en') {
  if (typeof text !== 'string') return { ok: true, hits: [] };
  const flat = normalize(text);
  const hits = (MATCHERS[lang] ?? MATCHERS.en).filter(({ pattern }) => pattern.test(flat)).map(({ phrase }) => phrase);
  return { ok: hits.length === 0, hits };
}
