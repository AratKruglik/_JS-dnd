// The front door of every script command. It does one thing before anything else: check that
// game/dice.js and game/rolls.js are exactly as sealed. It imports only modules that do not depend on
// those two files, then loads the real command line (game/cli-main.js) once the check passes. That
// way a missing file or a file with a syntax error is tampering (exit 2), not a crash.
import { checkDice } from './integrity.js';
import { openGameDb } from './db.js';
import { getHero } from './hero.js';
import { applyTamperReset } from './reset.js';

const out = (value) => console.log(JSON.stringify(value));

function fail(message, code = 1) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(code);
}

try {
  const check = checkDice();
  if (!check.ok) {
    if (check.reason === 'seal-missing') {
      fail('Dice seal file is missing or broken. The install is broken: restore game/dice.sha256 from the repo.');
    }
    const db = openGameDb();
    const save = db.prepare('SELECT id FROM saves ORDER BY id LIMIT 1').get();
    let reset = false;
    if (save && getHero(db, save.id)) {
      reset = applyTamperReset(db, save.id, { expected: check.expected, found: check.found }).applied;
    }
    out({
      ok: false,
      tamper: true,
      reason: check.reason,
      reset,
      message: 'The dice were tampered with. Restore game/dice.js and game/rolls.js to continue.',
    });
    process.exit(2);
  }
  await import('./cli-main.js');
} catch (error) {
  fail(error.message);
}
