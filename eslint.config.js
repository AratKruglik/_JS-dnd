// Rules for this repo's own code. The player's quest files use eslint.player.config.js.
export const rules = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always'],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
};

export default [
  { ignores: ['node_modules/**', 'data/**', 'player/**', '.dev/**', 'game/dice.js'] },
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules },
];
