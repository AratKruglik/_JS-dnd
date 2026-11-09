import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillDir = join(root, '.claude', 'skills', 'play');
const part = (name) => readFileSync(join(skillDir, name), 'utf8');
const skill = part('SKILL.md');
const onboardingFile = part('onboarding.md');
const combatFile = part('combat.md');
const play = [skill, onboardingFile, combatFile, part('stamina.md'), part('vitals.md'), part('ending.md')].join('\n');
const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');

test('the play skill has a header, only runs when the player types /play, and loads the state up front', () => {
  assert.match(skill, /^---\nname: play\ndescription: .+\n/);
  assert.match(skill, /\ndisable-model-invocation: true\n/);
  assert.match(skill, /\nallowed-tools: Bash\(node game\/cli\.js \*\)\n/);
  assert.ok(skill.includes('!`node game/cli.js resume`'));
});

test('the play skill points to every reference file it splits out', () => {
  for (const name of ['onboarding.md', 'combat.md', 'stamina.md', 'vitals.md', 'ending.md']) {
    assert.ok(skill.includes(`.claude/skills/play/${name}`), `SKILL.md never points to ${name}`);
  }
});

test('play.md walks onboarding in order and ends by looking around', () => {
  const onboarding = onboardingFile;
  const steps = [
    'node game/cli.js rules races',
    'node game/cli.js rules classes',
    'node game/cli.js rules pointbuy',
    'node game/cli.js hero create',
    'node game/cli.js world setting',
    'node game/cli.js world skeleton',
    'node game/cli.js world fill',
    'node game/cli.js look',
  ];
  let last = -1;
  for (const step of steps) {
    const at = onboarding.indexOf(step);
    assert.ok(at > last, `"${step}" is missing or out of order in Onboarding`);
    last = at;
  }
});

test('play.md keeps all state in scripts and says so', () => {
  assert.match(play, /never keep game state in files/i);
  assert.doesNotMatch(play, /(write|save|store) (it |the state |notes )?(to|in) (a |the )?(file|\.json|\.md)/i);
});

test('every "node game/cli.js <command>" in play.md exists in the CLI usage', () => {
  const probe = spawnSync('node', [join(root, 'game', 'cli.js')], { encoding: 'utf8' });
  const usage = JSON.parse(probe.stderr.trim()).error;
  const needsSub = new Set([
    'hero',
    'rules',
    'world',
    'quest',
    'link',
    'honor',
    'fight',
    'integrity',
    'voice',
    'npc',
    'move',
  ]);
  const seen = new Set();
  for (const match of play.matchAll(/node game\/cli\.js ([a-z]+)(?: ([a-z]+))?/g)) {
    const [, command, sub] = match;
    const phrase = needsSub.has(command) ? `${command} ${sub}` : command;
    seen.add(phrase);
    if (command === 'ending') continue; // hidden on purpose, see the Ending test below
    assert.ok(usage.includes(phrase), `play.md uses "${phrase}" but the CLI usage does not list it`);
  }
  for (const required of [
    'resume',
    'look',
    'go',
    'talk',
    'roll',
    'quest check',
    'quest judge',
    'honor event',
    'link use',
    'voice lint',
  ]) {
    assert.ok(seen.has(required), `play.md never mentions "${required}"`);
  }
});

test('play.md covers tone, choice prompts, the dice rule, and the exit code for tampering', () => {
  assert.match(play, /gentle/);
  assert.match(play, /roast/);
  assert.match(play, /choice prompt/i);
  assert.match(play, /2 to 4 options/);
  assert.match(play, /exits? (with )?code 2/i);
  assert.match(play, /game\/dice\.js/);
});

test('play.md has no em-dash or en-dash', () => {
  assert.equal(play.includes(String.fromCharCode(0x2014)) || play.includes(String.fromCharCode(0x2013)), false);
});

test('CLAUDE.md points playing to /play and developing to the rest', () => {
  assert.match(claudeMd, /\/play/);
  assert.match(claudeMd, /Dungeon Master/);
});

test('play.md recalls the setting on resume and skips steps that are already done', () => {
  assert.match(skill, /recall the world from `setting`/);
  assert.match(skill, /skip any step that is already done/i);
  assert.match(onboardingFile, /skip any step that is already done/i);
  assert.match(onboardingFile, /replaces the hero/i);
});

test('play.md sends the world on stdin as a heredoc so apostrophes are safe', () => {
  assert.match(play, /node game\/cli\.js world fill --data - <<'EOF'/);
  assert.match(play, /apostrophe/i);
});

test('the README try section does not tell a reader to touch the real save', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /hero new/);
  assert.match(readme, /throwaway/i);
  assert.match(readme, /JSDND_GAME_DB/);
});

test('play.md teaches warnings, tiers, the fight loop, and advanced moves', () => {
  assert.match(play, /## Combat/);
  for (const command of [
    'node game/cli.js npc warn',
    'node game/cli.js fight begin',
    'node game/cli.js fight attack',
    'node game/cli.js fight flee',
    'node game/cli.js fight state',
    'node game/cli.js move check',
  ]) {
    assert.ok(play.includes(command), `play.md never mentions "${command}"`);
  }
  assert.match(play, /weak\|normal\|tough/);
  assert.doesNotMatch(play, /not built yet/i);
});

test('play.md has a subagent write the move problem so the tests and answer stay off the Master screen', () => {
  const combat = combatFile;
  assert.match(combat, /subagent_type: "move-smith"/);
  assert.match(combat, /never (write|send|show|type)[^.]*(tests|reference)/i);
});

test('move-smith runs on sonnet with only Bash, writes a valid problem, and never reports the answer', () => {
  const smith = readFileSync(join(root, '.claude', 'agents', 'move-smith.md'), 'utf8');
  assert.match(smith, /^---\nname: move-smith\ndescription: .+\n/);
  assert.match(smith, /\nmodel: sonnet\n/);
  assert.match(smith, /\ntools: Bash\n/);
  assert.match(smith, /\nomitClaudeMd: true\n/);
  assert.ok(smith.includes("node game/cli.js move propose --data - <<'EOF'"));
  assert.match(smith, /3 to 12/);
  assert.match(smith, /difficulty/);
  assert.match(smith, /export function solve/);
  assert.match(smith, /never the tests/i);
  assert.equal(smith.includes(String.fromCharCode(0x2014)) || smith.includes(String.fromCharCode(0x2013)), false);
});

test('play.md makes the Master judge a passed move file and log cheating', () => {
  const combat = combatFile;
  assert.match(combat, /player\/move-<moveId>\.js/);
  assert.ok(combat.includes('node game/cli.js honor event cheat'));
});

test('play.md says a beaten NPC is knocked out and warnings reset when a fight ends', () => {
  const combat = combatFile;
  assert.match(combat, /knocked out/i);
  assert.match(combat, /solves another quest/i);
  assert.match(combat, /warnings (are cleared|reset|start over)/i);
  assert.doesNotMatch(combat, /winning a fight is a kill/i);
});

test('play.md teaches stamina: show, tiredness narration, and the collapse line', () => {
  assert.match(play, /## Stamina/);
  const stamina = play.slice(play.indexOf('## Stamina'));
  assert.ok(stamina.includes('node game/cli.js stamina show'));
  assert.match(stamina, /60%/);
  assert.match(stamina, /mental/);
  assert.match(stamina, /collapsed/i);
  assert.match(stamina, /location/i);
  assert.match(stamina, /hours/i);
  assert.match(stamina, /never (tell|mention)[^.]*(number|percent)/i);
});

test('the README marks the stamina rows as built but not live-checked', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const bar = readme.split('\n').find((l) => l.includes('Stamina bar from the real 5hr limit'));
  assert.match(bar, /In progress/);
  assert.match(bar, /live/i);
  const penalties = readme.split('\n').find((l) => l.includes('Tiredness penalties'));
  assert.match(penalties, /Done/);
});

test('play.md says the world has seven NPCs including the final boss', () => {
  assert.match(play, /7 NPC slots/);
  assert.match(play, /all seven NPCs/);
  assert.match(play, /final boss/i);
});

test('play.md has an Ending section for the boss and the hidden page, and the README keeps the command hidden', () => {
  assert.match(play, /## Ending/);
  const ending = play.slice(play.indexOf('## Ending'));
  assert.ok(ending.includes('node game/cli.js ending build'));
  assert.match(ending, /endingUnlocked/);
  assert.match(ending, /final boss/i);
  assert.match(ending, /every quest/i);
  assert.match(ending, /never[^.]*(before|earlier)/i);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /ending build/);
  assert.match(
    readme.split('\n').find((l) => l.includes('Hidden ending stats page')),
    /Done/,
  );
});

test('play.md hands over the style directions and runs the warn, fix, or decline flow', () => {
  const quests = play.slice(play.indexOf('## Quests'), play.indexOf('## Combat'));
  assert.match(quests, /style\.general/);
  assert.match(quests, /style\.specific/);
  assert.match(quests, /style\.ok/);
  assert.match(quests, /style\.ran/);
  assert.ok(quests.includes('node game/cli.js quest style-decline'));
  assert.match(quests, /choice prompt/i);
  assert.match(quests, /fix/i);
  assert.match(quests, /a little honor/i);
});

test('play.md says quests open in order and where the file path comes from', () => {
  const quests = play.slice(play.indexOf('## Quests'), play.indexOf('## Combat'));
  assert.match(quests, /open in order/i);
  assert.match(quests, /not open yet/i);
  assert.match(quests, /`file`/);
});

test('play.md tells the Master how to take back a solve it later finds was cheated', () => {
  const quests = play.slice(play.indexOf('## Quests'), play.indexOf('## Combat'));
  assert.ok(quests.includes('node game/cli.js quest revoke'));
  assert.match(quests, /after a solve/i);
});

test('every --flag play.md mentions next to a command is a real option in the CLI usage', () => {
  const probe = spawnSync('node', [join(root, 'game', 'cli.js')], { encoding: 'utf8' });
  const usage = JSON.parse(probe.stderr.trim()).error;
  const flags = new Set();
  for (const line of play.split('\n')) {
    if (!line.includes('node game/cli.js')) continue;
    for (const match of line.matchAll(/--[a-z][a-z-]*/g)) flags.add(match[0]);
  }
  assert.ok(flags.size >= 8, `only ${flags.size} flags found`);
  for (const flag of flags) assert.ok(usage.includes(flag), `play.md uses ${flag} but the usage does not list it`);
});

test('play.md says a revoke also takes back the bonus the solve paid', () => {
  const quests = play.slice(play.indexOf('## Quests'), play.indexOf('## Combat'));
  assert.match(quests, /takes back the bonus/i);
});

test('the skill settles the language at the start, before onboarding, and asks only when none is chosen', () => {
  const start = skill.slice(skill.indexOf('## Start'), skill.indexOf('## Playing'));
  assert.match(start, /language.{0,20}null/i);
  assert.ok(start.includes('node game/cli.js lang set'));
  assert.ok(start.indexOf('lang set') < start.indexOf('onboarding.md'));
});

test('play.md has a Language section with the rules the Master must follow', () => {
  assert.match(play, /## Language/);
  const language = play.slice(
    play.indexOf('## Language'),
    play.indexOf('## Ground rules') > play.indexOf('## Language') ? play.indexOf('## Ground rules') : undefined,
  );
  assert.match(language, /pack/i);
  assert.match(language, /only that language/i);
  assert.match(language, /never mix/i);
  assert.match(language, /code, file names, and commands stay (in )?English/i);
  assert.match(language, /quote[^.]*exactly|exactly as/i);
  assert.match(language, /script errors/i);
  assert.match(language, /stored (world )?text/i);
  assert.match(language, /first (use|time)[^.]*quest/i);
});

test('play.md tells the Master to show races and classes by display name and pass the typed words on', () => {
  const onboarding = onboardingFile;
  assert.match(onboarding, /`display`/);
  assert.match(onboarding, /both languages/i);
  assert.match(onboarding, /raceDisplay/);
});

test('play.md tells the Master how health, gold, rest, and items work, with real commands', () => {
  const start = play.indexOf('## Health, gold, and items');
  const end = play.indexOf('## Ending');
  assert.ok(start >= 0 && end > start, 'the Health, gold, and items section is missing or misplaced');
  const section = play.slice(start, end);
  for (const command of [
    'node game/cli.js rest',
    'node game/cli.js item list',
    'node game/cli.js item name',
    'node game/cli.js hero show',
  ]) {
    assert.ok(section.includes(command), `${command} is not explained`);
  }
  assert.match(section, /never (invent|change)/i);
  assert.match(section, /name it once/i);
  assert.match(section, /voice of the setting/);
});

test('every game command named in play.md exists in the CLI usage text', () => {
  const usage = readFileSync(join(root, 'game', 'cli-main.js'), 'utf8');
  for (const command of ['rest', 'item list', 'item name']) assert.ok(usage.includes(command), command);
});

// ---- world-smith: an Opus subagent that writes the whole world, so the player session can stay on Sonnet
const agentFile = (name) => readFileSync(join(root, '.claude', 'agents', name), 'utf8');
const commandsIn = (text) =>
  [...text.matchAll(/node game\/cli\.js ([a-z]+)(?: ([a-z-]+))?/g)].map((m) => [m[1], m[2]].filter(Boolean).join(' '));

test('world-smith runs on Opus with only Bash and without CLAUDE.md, and says what it is for', () => {
  const smith = agentFile('world-smith.md');
  assert.match(smith, /^---\nname: world-smith\ndescription: .+\nmodel: opus\ntools: Bash\nomitClaudeMd: true\n---\n/);
  assert.match(smith, /six places/);
  assert.match(smith, /seven characters/);
});

test('world-smith runs only the five read and write commands it needs, and submits on stdin', () => {
  const smith = agentFile('world-smith.md');
  assert.deepEqual([...new Set(commandsIn(smith))].sort(), [
    'hero show',
    'lang show',
    'world fill',
    'world show',
    'world skeleton',
  ]);
  assert.ok(smith.includes('node game/cli.js world fill --data - <<'));
  assert.doesNotMatch(smith, /node game\/cli\.js world setting/);
});

test('world-smith obeys the language pack, retries at most three times, and reports only the names', () => {
  const smith = agentFile('world-smith.md');
  assert.match(smith, /save language/i);
  assert.match(smith, /banned phrase/i);
  assert.match(smith, /at most three times/i);
  assert.match(smith, /never change the setting/i);
  assert.match(smith, /`L1: \.\.\.`, `N1: \.\.\.`/);
  assert.match(smith, /Plain text only/);
});

test('onboarding hands the world to world-smith, keeps writing it yourself as the fallback, then checks it', () => {
  const step = onboardingFile.slice(onboardingFile.indexOf('7. World'), onboardingFile.indexOf('8. Open the story'));
  assert.ok(step.includes('subagent_type: "world-smith"'));
  assert.match(step, /If the call fails/i);
  const delegate = step.indexOf('world-smith');
  const fallback = step.indexOf('node game/cli.js world skeleton');
  assert.ok(delegate >= 0 && fallback > delegate, 'the fallback must come after the delegation');
  assert.ok(step.includes('node game/cli.js world fill --data - <<'));
  assert.ok(step.includes('node game/cli.js world status'));
});

test('the skill chains log calls with a semicolon, never with &&, and reads both lines of output', () => {
  assert.doesNotMatch(play, /&&/);
  assert.match(skill, /separated by `;`/);
  assert.match(skill, /Read both lines/);
});

test('move-smith keeps skipping CLAUDE.md', () => {
  assert.match(agentFile('move-smith.md'), /^omitClaudeMd: true$/m);
});
