// English text the player reads. Keys are flat and dotted. A plural entry is { one, other }.
// {name} style placeholders are filled by t() in game/i18n.js. No em-dash or en-dash anywhere.
export default {
  'language.changed': 'The language is now {name}.',
};

// What the Master is told about this language (the `lang show` pack grows here in later tasks).
export const pack = {
  // JS terms the player meets, as { term, english }. English needs none.
  glossary: [],
  // How the Master roasts when honor is below zero. The rule is the owner's, the rest keeps it safe.
  roast: {
    rule: "Savage, swearing, merciless about the code, never about the person's life.",
    fairGame: [
      'the code in the file',
      'hardcoded answers and shortcuts',
      'sloppy structure and bad names',
      'a mistake the player keeps repeating',
    ],
    neverAllowed: [
      "the person's real life, family, body, health, or background",
      'slurs or hate of any kind',
      'threats of real harm',
    ],
    tone: "A furious veteran code reviewer in the setting's voice: vivid, funny, specific to the actual code. Always say what is actually wrong or right.",
  },
  // Short style notes for the Master's voice in this language.
  voiceTips: [
    'Speak as the world, not as an assistant.',
    'Short sentences. No openings and no summaries.',
    'Never offer more help and never explain what you just did.',
    'Keep code, file names, and commands exactly as they are.',
  ],
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

// Display names and the other names a player may type for each race and class. The key (elf, wizard)
// is stable and is what the database stores. Matching ignores case and spacing.
export const names = {
  races: {
    human: { name: 'Human', aliases: [] },
    elf: { name: 'Elf', aliases: [] },
    dwarf: { name: 'Dwarf', aliases: [] },
    halfling: { name: 'Halfling', aliases: ['hobbit'] },
    gnome: { name: 'Gnome', aliases: [] },
    'half-elf': { name: 'Half-elf', aliases: ['half elf'] },
    'half-orc': { name: 'Half-orc', aliases: ['half orc'] },
    tiefling: { name: 'Tiefling', aliases: [] },
    dragonborn: { name: 'Dragonborn', aliases: [] },
  },
  classes: {
    barbarian: { name: 'Barbarian', aliases: [] },
    bard: { name: 'Bard', aliases: [] },
    cleric: { name: 'Cleric', aliases: [] },
    druid: { name: 'Druid', aliases: [] },
    fighter: { name: 'Fighter', aliases: [] },
    monk: { name: 'Monk', aliases: [] },
    paladin: { name: 'Paladin', aliases: [] },
    ranger: { name: 'Ranger', aliases: [] },
    rogue: { name: 'Rogue', aliases: [] },
    sorcerer: { name: 'Sorcerer', aliases: [] },
    warlock: { name: 'Warlock', aliases: [] },
    wizard: { name: 'Wizard', aliases: ['magician', 'mage'] },
  },
};
