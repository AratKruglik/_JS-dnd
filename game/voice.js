// Phrases that make a Dungeon Master sound like a chatbot. The anti-goal in the spec is
// sloppy AI language, so the world gate rejects text that contains any of these.
// Multi-word only, so ordinary fantasy words (tapestry, delve, certainly) never trip it.
export const BANNED_PHRASES = [
  'as an ai',
  'as a language model',
  "i'd be happy to",
  'i would be happy to',
  'great question',
  'delve into',
  "it's important to note",
  'it is important to note',
  'i hope this helps',
  'feel free to',
  'let me know if',
  'in conclusion',
  'i apologize for',
  'please note that',
  'rest assured',
];

const normalize = (text) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole words only, so "as an aide" or "as an airship" never trips "as an ai".
const MATCHERS = BANNED_PHRASES.map((phrase) => ({
  phrase,
  pattern: new RegExp(`(?<![a-z0-9])${escapeRegex(phrase)}(?![a-z0-9])`),
}));

export function lintVoice(text) {
  if (typeof text !== 'string') return { ok: true, hits: [] };
  const flat = normalize(text);
  const hits = MATCHERS.filter(({ pattern }) => pattern.test(flat)).map(({ phrase }) => phrase);
  return { ok: hits.length === 0, hits };
}
