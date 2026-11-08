// English text the player reads. Keys are flat and dotted. A plural entry is { one, other }.
// {name} style placeholders are filled by t() in game/i18n.js. No em-dash or en-dash anywhere.
export default {
  'language.changed': 'The language is now {name}.',
};

// What the Master is told about this language (the `lang show` pack grows here in later tasks).
export const pack = {
  // Phrases that make a Dungeon Master sound like a chatbot. The anti-goal in the spec is sloppy AI
  // language, so the world gate rejects text that contains any of these. Multi-word only, so ordinary
  // fantasy words (tapestry, delve, certainly) never trip it.
  bannedPhrases: [
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
  ],
};
