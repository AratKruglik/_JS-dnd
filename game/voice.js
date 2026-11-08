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

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ');

export function lintVoice(text) {
  if (typeof text !== 'string') return { ok: true, hits: [] };
  const flat = normalize(text);
  const hits = BANNED_PHRASES.filter((phrase) => flat.includes(phrase));
  return { ok: hits.length === 0, hits };
}
