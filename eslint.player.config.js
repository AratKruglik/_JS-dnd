// The style rules applied to a player's quest solution. Same as the repo rules, plus no console.log.
import { rules } from './eslint.config.js';

export default [
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { ...rules, 'no-console': 'error' },
  },
];
