// English text the player reads. Keys are flat and dotted. A plural entry is { one, other }.
// {name} style placeholders are filled by t() in game/i18n.js. No em-dash or en-dash anywhere.
export default {
  'language.changed': 'The language is now {name}.',

  // The starter file of a combat move.
  'move.stub.title': 'Combat move: {title}',
  'move.stub.export': 'Export a function named solve.',
  'move.stub.code': 'your code here',

  // What a quest check says. {call} is code and stays as written. The English wording is exactly what
  // the game printed before there were two languages.
  'check.timeout.message': 'Your code ran longer than {seconds} seconds and was stopped.',
  'check.tooMuchOutput.message': 'Your code printed too much output.',
  'check.noResult.message': 'Your code stopped the program before the check could finish.',
  'check.unreadable.message': 'The check produced an unreadable result.',
  'check.fileNotFound.message': 'Player file not found: {path}',
  'check.neverSettled.message':
    'Your code never finished: a promise it returned never settled, so the check had no answer to read.',
  'check.unknownQuest.message': 'Unknown quest "{questId}".',
  'check.missingSolve.message': 'Your file must export a function named solve.',
  'check.solveThrew.message': 'solve threw: {message}',
  'check.raw.message': '{message}',
  'check.missingExport.expected': 'an exported function {name}',
  'check.missingExport.got': '{name} is {type}',
  'check.wrongResult.expected': '{call} gives {wanted}',
  'check.wrongResult.got': '{call} gave {gave}',
  'check.outOfRange.expected': '{call} gives a whole number from 1 to {max}',
  'check.outOfRange.got': '{call} gave {gave}',
  'check.allFaces.expected': '600 rolls of rollDie(6) show all six faces',
  'check.allFaces.got': 'faces seen: {faces}',
  'check.pass.fairDie': 'a fair die',
  'check.pass.loud': 'loud text',
  'check.pass.totals': 'the right totals',
  'check.pass.everyTest': 'every test passes',

  // The stamina bar and the collapse line, printed by scripts with no Master in between.
  // The hero line above the stamina bar.
  'hero.line': '{name} Lv{level} | HP {hp}/{maxHp} | {gold} gold | {items} | {location}',
  'hero.items': { one: '{count} item', other: '{count} items' },

  'stamina.bar': 'STAMINA {bar} {left}% left | resets in {reset}',
  'stamina.barEstimated': 'STAMINA ~{bar} ~{left}% left (est.) | resets in {reset}',
  'stamina.unknown': 'STAMINA unknown',
  'stamina.duration': '{hours}h{minutes}m',
  'stamina.collapse': {
    one: "you're completely tired. you fell on the spot where you were standing at {location} for {count} hour",
    other: "you're completely tired. you fell on the spot where you were standing at {location} for {count} hours",
  },

  // The ending page.
  'ending.title': '{name}: the end of the road',
  'ending.theHero': 'The hero',
  'ending.subtitle': '{who} in {world}',
  'ending.duration': '{hours}h {minutes}m',
  'ending.tasksOf': '{solved} of {total}',
  'ending.stat.time': 'Time played (estimated)',
  'ending.stat.tasks': 'Tasks solved',
  'ending.stat.enemies': 'Enemies defeated',
  'ending.stat.fights': 'Fights fought',
  'ending.stat.falls': 'Falls',
  'ending.honor.heading': 'Honor over time',
  'ending.honor.note': 'Dashed red lines mark a fall.',
  'ending.fall': 'A fall: the dice were tampered with',
  'ending.complexity.heading': 'Complexity you took on',
  'ending.complexity.chart': 'Cumulative quest complexity over time',
  'ending.complexity.total': '{total} total',
  'ending.quests.heading': 'Quests',
  'ending.col.quest': 'Quest',
  'ending.col.rung': 'Rung',
  'ending.col.complexity': 'Complexity',
  'ending.col.hints': 'Hints',
  'ending.col.solved': 'Solved',
  'ending.empty': 'No data yet',

  // The code style check. English shows the linter's own text, these keys exist for the other languages.
  'style.line': 'line {line}: {message}',
  'style.formatting': 'formatting: line {line} should read "{text}"',
  'style.notInstalled': 'Style tools are not installed. Run npm install in the game folder.',
  'style.couldNotRun': 'The style check could not run.',
  'style.badLinterResult': 'The style check could not read the linter result.',
  'style.rule.no-var': 'Unexpected var, use let or const instead.',
  'style.rule.prefer-const': "'{name}' is never reassigned. Use 'const' instead.",
  'style.rule.eqeqeq': "Expected '{expected}' and instead saw '{actual}'.",
  'style.rule.no-console': 'Unexpected console statement.',
  'style.rule.no-eval': 'eval can be harmful.',
  'style.rule.no-implied-eval': 'Implied eval. Consider passing a function instead of a string.',
  'style.rule.no-new-func': 'The Function constructor is eval.',
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
