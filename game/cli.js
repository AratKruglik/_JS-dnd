import { openGameDb } from './db.js';
import { createSave, createHero, getHero } from './hero.js';
import { addHonorEvent, getHonor } from './honor.js';
import { rollAndLog } from './rolls.js';
import { startFight, logFightStep, endFight, getFightLog } from './fights.js';
import { checkDice } from './integrity.js';
import { applyTamperReset } from './reset.js';

const USAGE = `Commands:
  init
  hero new <name> <race> <class> | hero show
  roll <spec> [--context "<text>"]
  honor add <delta> <kind> "<reason>" | honor show
  fight start "<reason>" | fight log <fightId> <actor> <action> ["<detail>"] [--roll <rollId>]
  fight end <fightId> <won|lost|fled|abandoned> | fight show <fightId>
  integrity check`;

// One line of compact JSON per answer keeps token use low for the Master.
const out = (value) => console.log(JSON.stringify(value));

function fail(message, code = 1) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(code);
}

// Our own tiny parser: values like -5 or "- crit" are plain values, not options.
const VALUE_OPTIONS = new Set(['--context', '--roll']);

function parseCli(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_OPTIONS.has(arg)) {
      if (i + 1 >= argv.length) throw new Error(`Option ${arg} needs a value.`);
      flags[arg.slice(2)] = argv[++i];
    } else if (arg.startsWith('--') && arg.length > 2) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function toInt(value, name) {
  if (!/^-?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a whole number, got "${value}".`);
  }
  return Number(value);
}

function main() {
  const { flags, positionals } = parseCli(process.argv.slice(2));
  const [command, sub, ...rest] = positionals;
  if (!command) fail(USAGE);

  // The dice check runs before every command.
  const check = checkDice();
  if (!check.ok) {
    if (check.reason === 'seal-missing') {
      fail('Dice seal file is missing. The install is broken: restore game/dice.sha256 from the repo.');
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
      message: 'The dice were tampered with. Restore game/dice.js to continue.',
    });
    process.exit(2);
  }

  const db = openGameDb();
  const firstSave = () => db.prepare('SELECT id FROM saves ORDER BY id LIMIT 1').get();
  const currentSaveId = () => {
    const save = firstSave();
    if (!save) fail('No save yet. Run: node game/cli.js init');
    return save.id;
  };
  const need = (value, name) => {
    if (value === undefined || value === '') fail(`Missing ${name}.\n${USAGE}`);
    return value;
  };

  switch (command) {
    case 'init': {
      const saveId = firstSave()?.id ?? createSave(db, { name: 'Save 1' });
      out({ ok: true, saveId });
      break;
    }
    case 'hero': {
      if (sub === 'new') {
        const [name, race, heroClass] = rest;
        const heroId = createHero(db, currentSaveId(), {
          name: need(name, 'name'),
          race: need(race, 'race'),
          heroClass: need(heroClass, 'class'),
        });
        out({ ok: true, heroId });
      } else if (sub === 'show') {
        const hero = getHero(db, currentSaveId());
        if (!hero) fail('No hero yet. Run: node game/cli.js hero new <name> <race> <class>');
        out({ ok: true, hero });
      } else fail(USAGE);
      break;
    }
    case 'roll': {
      const rolled = rollAndLog(db, currentSaveId(), need(sub, 'dice spec'), flags.context ?? null);
      out({ ok: true, id: rolled.id, spec: rolled.spec, results: rolled.results, total: rolled.total });
      break;
    }
    case 'honor': {
      if (sub === 'add') {
        const [delta, kind, reason] = rest;
        const honor = addHonorEvent(db, currentSaveId(), {
          delta: toInt(need(delta, 'delta'), 'delta'),
          kind: need(kind, 'kind'),
          reason: need(reason, 'reason'),
        });
        out({ ok: true, honor });
      } else if (sub === 'show') {
        out({ ok: true, honor: getHonor(db, currentSaveId()) });
      } else fail(USAGE);
      break;
    }
    case 'fight': {
      if (sub === 'start') {
        out({ ok: true, fightId: startFight(db, currentSaveId(), { triggerReason: need(rest[0], 'reason') }) });
      } else if (sub === 'log') {
        const [fightId, actor, action, detail] = rest;
        const seq = logFightStep(db, toInt(need(fightId, 'fightId'), 'fightId'), {
          actor: need(actor, 'actor'),
          action: need(action, 'action'),
          rollId: flags.roll === undefined ? null : toInt(flags.roll, 'roll'),
          detail: detail ?? null,
        });
        out({ ok: true, seq });
      } else if (sub === 'end') {
        endFight(db, toInt(need(rest[0], 'fightId'), 'fightId'), need(rest[1], 'outcome'));
        out({ ok: true });
      } else if (sub === 'show') {
        out({ ok: true, log: getFightLog(db, toInt(need(rest[0], 'fightId'), 'fightId')) });
      } else fail(USAGE);
      break;
    }
    case 'integrity': {
      if (sub === 'check') out({ ok: true });
      else fail(USAGE);
      break;
    }
    default:
      fail(USAGE);
  }
}

try {
  main();
} catch (error) {
  fail(error.message);
}
