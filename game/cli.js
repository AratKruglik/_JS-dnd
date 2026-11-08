import { openGameDb } from './db.js';
import { createSave, createHero, getHero } from './hero.js';
import { addHonorEvent, getHonor } from './honor.js';
import { rollAndLog } from './rolls.js';
import { startFight, logFightStep, endFight, getFightLog, assertLegacyFight } from './fights.js';
import { checkDice } from './integrity.js';
import { applyTamperReset } from './reset.js';
import { applyHonorRule } from './honor-rules.js';
import { classifyLink } from './links.js';
import { startQuest, checkQuest, judgeQuest, logHint, getProgress } from './quests.js';
import { QUESTS } from '../quests/index.js';
import { createHeroFromChoices } from './hero.js';
import {
  ABILITIES,
  ALIASES,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  STANDARD_CLASSES,
  STANDARD_RACES,
} from './rules.js';
import { readFileSync } from 'node:fs';
import { setSetting, fillWorld, worldStatus, getSetting, look, go, talk } from './world.js';
import { lintVoice } from './voice.js';
import { warnNpc, beginFight, heroAttack, fleeFight, getFightState } from './combat-engine.js';
import { proposeMove, checkMove } from './moves.js';
import { SKELETON } from '../world/skeleton.js';
import { touchWindow, currentStamina } from './stamina.js';
import { buildEnding } from './ending.js';

const USAGE = `Commands:
  init
  rules races | rules classes | rules pointbuy
  hero create --name <n> --race <r> --class <c> --scores <6 numbers like 15,14,13,12,10,8>
              [--bonuses STR=2,DEX=1] [--race-desc "<t>"] [--class-desc "<t>"]
  hero show
  world setting --source <offered|customized|written> --name <n> --desc <d> --voice <v>
  world skeleton | world status | world show
  world fill --data '<json>'   (or --data - to read the JSON from stdin, safe for apostrophes)
  look | go <exit> | talk <npcSlot> | voice lint "<text>"
  roll <spec> [--context "<text>"]
  honor add <delta> <kind> "<reason>" | honor event <kind> ["<note>"] | honor show
  fight start "<reason>" | fight log <fightId> <actor> <action> ["<detail>"] [--roll <rollId>]
  fight end <fightId> <won|lost|fled|abandoned> | fight show <fightId>
  npc warn <slot> ["<reason>"]
  fight begin --npc <slot> --tier <weak|normal|tough> --aggressor <hero|npc> [--quest <id>]
  fight attack | fight flee | fight state
  move propose --data -   (problem JSON on stdin) | move check <moveId>
  quest list | quest start <id> | quest check <id> | quest progress
  quest judge <id> <clean|cheated> ["<note>"]
  quest hint <id> <npc_speech|legal_doc|illegal_doc|master_leak> ["<note>"]
  link check <url> | link use <questId> <url>
  stamina show
  integrity check`;

// Play actions that stop while the hero is collapsed from tiredness. Read-only commands keep working.
const BLOCKED_WHEN_COLLAPSED = new Set([
  'go', 'talk', 'roll', 'honor add', 'honor event', 'fight start', 'fight log', 'fight end', 'npc warn', 'fight begin', 'fight attack', 'fight flee', 'move propose', 'move check',
  'quest start', 'quest check', 'quest judge', 'quest hint', 'link use',
]);

// One line of compact JSON per answer keeps token use low for the Master.
const out = (value) => console.log(JSON.stringify(value));

function fail(message, code = 1) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(code);
}

// Our own tiny parser: values like -5 or "- crit" are plain values, not options.
const VALUE_OPTIONS = new Set([
  '--context', '--roll', '--name', '--race', '--class', '--scores', '--bonuses',
  '--race-desc', '--class-desc', '--source', '--desc', '--voice', '--data',
  '--npc', '--tier', '--aggressor', '--quest',
]);

// Which options each command accepts. Anything else is rejected, never silently ignored.
const ALLOWED_FLAGS = {
  roll: ['context'],
  'fight log': ['roll'],
  'hero create': ['name', 'race', 'class', 'scores', 'bonuses', 'race-desc', 'class-desc'],
  'world setting': ['source', 'name', 'desc', 'voice'],
  'world fill': ['data'],
  'fight begin': ['npc', 'tier', 'aggressor', 'quest'],
  'move propose': ['data'],
};

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

// New commands reject extra arguments instead of silently dropping them.
function arity(args, min, max, usage) {
  if (args.length < min || args.length > max) {
    throw new Error(`Wrong number of arguments. Expected: ${usage}`);
  }
}

// --data '<json>' or --data - (read the JSON from stdin, safe for apostrophes).
function readJsonFlag(value) {
  if (value === undefined || value === '') throw new Error('Missing --data.');
  try {
    return JSON.parse(value === '-' ? readFileSync(0, 'utf8') : value);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('--data must be valid JSON.');
    throw error;
  }
}

// "15,14,13,12,10,8" -> [15, 14, 13, 12, 10, 8]
function parseScores(text) {
  if (text === undefined) throw new Error('Missing --scores. Give six numbers in order STR,DEX,CON,INT,WIS,CHA.');
  return String(text).split(',').map((part) => toInt(part.trim(), 'score'));
}

// "STR=2,DEX=-1" -> { STR: 2, DEX: -1 }
function parseBonuses(text) {
  if (text === undefined) return undefined;
  const bonuses = {};
  for (const part of String(text).split(',')) {
    const pieces = part.split('=');
    if (pieces.length !== 2) throw new Error(`Bonuses look like STR=2,DEX=-1, got "${part}".`);
    bonuses[pieces[0].trim().toUpperCase()] = toInt(pieces[1].trim(), `${pieces[0].trim()} bonus`);
  }
  return bonuses;
}

function main() {
  const { flags, positionals } = parseCli(process.argv.slice(2));
  const [command, sub, ...rest] = positionals;
  if (!command) fail(USAGE);

  const flagKey = `${command} ${sub}`;
  const allowed = ALLOWED_FLAGS[flagKey] ?? ALLOWED_FLAGS[command] ?? [];
  for (const flag of Object.keys(flags)) {
    if (!allowed.includes(flag)) throw new Error(`Option --${flag} does not belong to "${command}${sub ? ` ${sub}` : ''}".`);
  }

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
  // Stamina: every command keeps the fallback estimate window alive, and a collapsed hero cannot act.
  const save = firstSave();
  if (save) touchWindow(db, save.id);
  const stamina = save ? currentStamina(db, save.id) : null;
  const tiredness = stamina ? { attack: stamina.attack, ac: stamina.ac } : undefined;
  const actionKey = ['go', 'talk', 'roll'].includes(command) ? command : flagKey;
  if (stamina?.collapsed && BLOCKED_WHEN_COLLAPSED.has(actionKey)) {
    const spot = db
      .prepare('SELECT wl.name FROM world_locations wl JOIN heroes h ON h.save_id = wl.save_id AND h.location_slot = wl.slot WHERE h.save_id = ?')
      .get(save.id);
    const location = spot?.name ?? 'the spot where they stood';
    console.error(
      JSON.stringify({
        ok: false,
        collapsed: true,
        location,
        hours: stamina.hours,
        error: `you're completely tired. you fell on the spot where you were standing at ${location} for ${stamina.hours} hour(s)`,
      }),
    );
    process.exit(1);
  }
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
        if (!hero) fail('No hero yet. Run: node game/cli.js hero create --name <n> --race <r> --class <c> --scores <six numbers>');
        out({ ok: true, hero });
      } else if (sub === 'create') {
        arity(rest, 0, 0, 'hero create --name <n> --race <r> --class <c> --scores <six numbers>');
        const saveId = currentSaveId();
        const heroId = createHeroFromChoices(db, saveId, {
          name: flags.name,
          race: flags.race,
          heroClass: flags.class,
          scores: parseScores(flags.scores),
          bonuses: parseBonuses(flags.bonuses),
          raceDescription: flags['race-desc'],
          classDescription: flags['class-desc'],
        });
        out({ ok: true, heroId, hero: getHero(db, saveId) });
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
      } else if (sub === 'event') {
        arity(rest, 1, 2, 'honor event <kind> ["<note>"]');
        out({ ok: true, honor: applyHonorRule(db, currentSaveId(), rest[0], rest[1]) });
      } else if (sub === 'show') {
        out({ ok: true, honor: getHonor(db, currentSaveId()) });
      } else fail(USAGE);
      break;
    }
    case 'quest': {
      const timeoutMs = process.env.JSDND_QUEST_TIMEOUT_MS ? Number(process.env.JSDND_QUEST_TIMEOUT_MS) : undefined;
      if (sub === 'list') {
        arity(rest, 0, 0, 'quest list');
        const { solved } = getProgress(db, currentSaveId());
        out({
          ok: true,
          quests: QUESTS.map((q) => ({
            id: q.id,
            title: q.title,
            rung: q.rung,
            complexity: q.complexity,
            solved: solved.includes(q.id),
          })),
        });
      } else if (sub === 'start') {
        arity(rest, 1, 1, 'quest start <id>');
        out({ ok: true, ...startQuest(rest[0]) });
      } else if (sub === 'check') {
        arity(rest, 1, 1, 'quest check <id>');
        out({ ok: true, ...checkQuest(db, currentSaveId(), rest[0], { timeoutMs }) });
      } else if (sub === 'judge') {
        arity(rest, 2, 3, 'quest judge <id> <clean|cheated> ["<note>"]');
        out({ ok: true, ...judgeQuest(db, currentSaveId(), rest[0], rest[1], rest[2]) });
      } else if (sub === 'hint') {
        arity(rest, 2, 3, 'quest hint <id> <kind> ["<note>"]');
        out({ ok: true, ...logHint(db, currentSaveId(), rest[0], rest[1], rest[2]) });
      } else if (sub === 'progress') {
        arity(rest, 0, 0, 'quest progress');
        out({ ok: true, ...getProgress(db, currentSaveId()) });
      } else fail(USAGE);
      break;
    }
    case 'link': {
      if (sub === 'check') {
        arity(rest, 1, 1, 'link check <url>');
        out({ ok: true, ...classifyLink(rest[0]) });
      } else if (sub === 'use') {
        arity(rest, 2, 2, 'link use <questId> <url>');
        const link = classifyLink(rest[1]);
        const saveId = currentSaveId();
        const { hintsUsed } = logHint(db, saveId, rest[0], link.legal ? 'legal_doc' : 'illegal_doc', rest[1]);
        out({ ok: true, ...link, hintsUsed, honor: getHonor(db, saveId) });
      } else fail(USAGE);
      break;
    }
    case 'fight': {
      if (sub === 'start') {
        out({ ok: true, fightId: startFight(db, currentSaveId(), { triggerReason: need(rest[0], 'reason') }) });
      } else if (sub === 'log') {
        const [fightId, actor, action, detail] = rest;
        assertLegacyFight(db, toInt(need(fightId, 'fightId'), 'fightId'));
        const seq = logFightStep(db, toInt(need(fightId, 'fightId'), 'fightId'), {
          actor: need(actor, 'actor'),
          action: need(action, 'action'),
          rollId: flags.roll === undefined ? null : toInt(flags.roll, 'roll'),
          detail: detail ?? null,
        });
        out({ ok: true, seq });
      } else if (sub === 'end') {
        const endId = toInt(need(rest[0], 'fightId'), 'fightId');
        assertLegacyFight(db, endId);
        endFight(db, endId, need(rest[1], 'outcome'));
        out({ ok: true });
      } else if (sub === 'show') {
        out({ ok: true, log: getFightLog(db, toInt(need(rest[0], 'fightId'), 'fightId')) });
      } else if (sub === 'begin') {
        arity(rest, 0, 0, 'fight begin --npc <slot> --tier <weak|normal|tough> --aggressor <hero|npc> [--quest <id>]');
        out({
          ok: true,
          fight: beginFight(db, currentSaveId(), {
            npcSlot: need(flags.npc, '--npc'),
            tier: need(flags.tier, '--tier'),
            aggressor: need(flags.aggressor, '--aggressor'),
            questId: flags.quest ?? null,
            modifiers: tiredness,
          }),
        });
      } else if (sub === 'attack') {
        arity(rest, 0, 0, 'fight attack');
        out({ ok: true, fight: heroAttack(db, currentSaveId(), { modifiers: tiredness }) });
      } else if (sub === 'flee') {
        arity(rest, 0, 0, 'fight flee');
        out({ ok: true, fight: fleeFight(db, currentSaveId()) });
      } else if (sub === 'state') {
        arity(rest, 0, 0, 'fight state');
        out({ ok: true, fight: getFightState(db, currentSaveId()) });
      } else fail(USAGE);
      break;
    }
    case 'npc': {
      if (sub !== 'warn') fail(USAGE);
      arity(rest, 1, 2, 'npc warn <slot> ["<reason>"]');
      out({ ok: true, ...warnNpc(db, currentSaveId(), rest[0], rest[1]) });
      break;
    }
    case 'move': {
      if (sub === 'propose') {
        arity(rest, 0, 0, "move propose --data - (JSON on stdin)");
        out({ ok: true, ...proposeMove(db, currentSaveId(), readJsonFlag(flags.data)) });
      } else if (sub === 'check') {
        arity(rest, 1, 1, 'move check <moveId>');
        const timeoutMs = process.env.JSDND_QUEST_TIMEOUT_MS ? Number(process.env.JSDND_QUEST_TIMEOUT_MS) : undefined;
        out({ ok: true, ...checkMove(db, currentSaveId(), toInt(rest[0], 'moveId'), { timeoutMs, modifiers: tiredness }) });
      } else fail(USAGE);
      break;
    }
    // Not in USAGE on purpose: the Master reveals this at the end of the campaign.
    case 'ending': {
      if (sub !== 'build') fail(USAGE);
      arity(rest, 0, 0, 'ending build');
      out({ ok: true, ...buildEnding(db, currentSaveId()) });
      break;
    }
    case 'stamina': {
      if (sub !== 'show') fail(USAGE);
      arity(rest, 0, 0, 'stamina show');
      if (!stamina) fail('No save yet. Run: node game/cli.js init');
      out({
        ok: true,
        usedPercent: Math.round(stamina.usedPercent * 10) / 10,
        left: Math.round(100 - stamina.usedPercent),
        band: stamina.band,
        attack: stamina.attack,
        ac: stamina.ac,
        mental: stamina.mental,
        collapsed: stamina.collapsed,
        estimated: stamina.estimated,
        hours: stamina.hours,
      });
      break;
    }
    case 'rules': {
      arity(rest, 0, 0, 'rules races | rules classes | rules pointbuy');
      if (sub === 'races') {
        out({
          ok: true,
          races: Object.entries(STANDARD_RACES).map(([name, bonuses]) => ({ name, bonuses })),
          aliases: ALIASES,
        });
      } else if (sub === 'classes') {
        out({ ok: true, classes: STANDARD_CLASSES, aliases: ALIASES });
      } else if (sub === 'pointbuy') {
        out({ ok: true, budget: POINT_BUY_BUDGET, min: 8, max: 15, costs: POINT_BUY_COSTS, abilities: ABILITIES });
      } else fail(USAGE);
      break;
    }
    case 'world': {
      arity(rest, 0, 0, 'world setting | world skeleton | world fill | world status');
      if (sub === 'setting') {
        setSetting(db, currentSaveId(), {
          source: flags.source,
          name: flags.name,
          description: flags.desc,
          voice: flags.voice,
        });
        out({ ok: true });
      } else if (sub === 'skeleton') {
        out({ ok: true, ...SKELETON });
      } else if (sub === 'fill') {
        out({ ok: true, ...fillWorld(db, currentSaveId(), readJsonFlag(flags.data)) });
      } else if (sub === 'status') {
        out({ ok: true, ...worldStatus(db, currentSaveId()) });
      } else if (sub === 'show') {
        const setting = getSetting(db, currentSaveId());
        if (!setting) fail('No setting yet. Run: node game/cli.js world setting --source ... --name ... --desc ... --voice ...');
        out({ ok: true, setting });
      } else fail(USAGE);
      break;
    }
    case 'look': {
      arity(positionals.slice(1), 0, 0, 'look');
      out({ ok: true, ...look(db, currentSaveId()), stamina: { band: stamina.band, collapsed: stamina.collapsed } });
      break;
    }
    case 'go': {
      arity(positionals.slice(1), 1, 1, 'go <exit>');
      out({ ok: true, ...go(db, currentSaveId(), sub) });
      break;
    }
    case 'talk': {
      arity(positionals.slice(1), 1, 1, 'talk <npcSlot>');
      out({ ok: true, ...talk(db, currentSaveId(), sub) });
      break;
    }
    case 'voice': {
      if (sub !== 'lint') fail(USAGE);
      arity(rest, 1, 1, 'voice lint "<text>"');
      const { ok: clean, hits } = lintVoice(rest[0]);
      out({ ok: true, lint: clean, hits });
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
