import en from './en.js';
import uk from './uk.js';

const TEXTS = { en, uk };

// A quest's title, brief, starter file, and quest specific style directions in a language. A missing
// entry falls back to English, and the catalog tests make sure none is missing.
export const questText = (id, lang) => TEXTS[lang]?.quests?.[id] ?? TEXTS.en.quests[id];

export const generalStyle = (lang) => TEXTS[lang]?.general ?? TEXTS.en.general;
