// Rules for this repo's own code. The player's quest files use eslint.player.config.js.
export const rules = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always'],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
};

// Modules whose output a player reads. Their words live in game/locales/*.js and quests/text/*.js.
export const playerFacing = [
  'game/child-check.js',
  'game/ending-page.js',
  'game/ending-stats.js',
  'game/stamina.js',
  'game/statusline.js',
  'game/style-check.js',
  'quests/array-sum.js',
  'quests/dice-roll.js',
  'quests/messages.js',
  'quests/string-shout.js',
  'quests/style.js',
];

// Two English words in a row in a string or template is prose. SQL and markup are not prose, and the
// text of a thrown Error goes to the Master, not the player: game/ending.js and game/world.js carry
// that kind of text, so they are not listed. It catches prose, not a single word.
const PROSE = '^(?![^]*[<>{}=;])(?!\\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\\b)[^]*[A-Za-z]{2,}[ \\t]+[A-Za-z]{2,}';
const NOT_AN_ERROR =
  ':not(NewExpression[callee.name="Error"] > *, NewExpression[callee.name="Error"] > TemplateLiteral > *)';
const GUARD_MESSAGE = 'Player-facing text belongs in the language catalogs (game/locales, quests/text), not here.';

export default [
  { ignores: ['node_modules/**', 'data/**', 'player/**', '.dev/**', 'game/dice.js', 'game/rolls.js'] },
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules },
  {
    files: playerFacing,
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${PROSE}/]${NOT_AN_ERROR}`, message: GUARD_MESSAGE },
        { selector: `TemplateElement[value.cooked=/${PROSE}/]${NOT_AN_ERROR}`, message: GUARD_MESSAGE },
      ],
    },
  },
];
