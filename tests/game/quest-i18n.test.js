import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQuestCheck } from '../../game/quest-runner.js';
import { runMoveTests } from '../../game/move-runner.js';
import { startQuest, checkQuest } from '../../game/quests.js';
import { checkStyle } from '../../game/style-check.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setLanguage } from '../../game/i18n.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { QUESTS } from '../../quests/index.js';
import { questText, generalStyle } from '../../quests/text/index.js';
import en from '../../game/locales/en.js';
import uk from '../../game/locales/uk.js';
import { freshDb } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const solution = (id, kind) => join(root, 'tests', 'quests', 'solutions', `${id}.${kind}.js`);
const dir = mkdtempSync(join(tmpdir(), 'jsdnd-qi18n-'));
let n = 0;
const player = (code) => {
  const path = join(dir, `player-${n++}.js`);
  writeFileSync(path, code);
  return path;
};
const check = (id, code, lang, extra = {}) => runQuestCheck(id, player(code), { timeoutMs: 15000, lang, ...extra });
// The test quest that awaits the player's answer() lets a never-settling promise reach the handler.
const echo = (code, lang) =>
  runQuestCheck('echo', player(code), {
    timeoutMs: 15000,
    lang,
    questsModule: join(root, 'tests', 'fixtures', 'quests', 'index.js'),
  });
const MOVE_TESTS = [
  { args: [1, 2], expected: 3 },
  { args: [2, 2], expected: 4 },
  { args: [10, -3], expected: 7 },
];
const move = (code, lang) => runMoveTests(player(code), MOVE_TESTS, { lang });

// ---- English stays byte identical to what the game printed before the languages existed
test('English check results are exactly what they were before', () => {
  const pass = (id) => runQuestCheck(id, solution(id, 'reference'), { timeoutMs: 15000 });
  assert.deepEqual(pass('dice-roll'), { status: 'pass', expected: 'a fair die', got: 'a fair die', message: '' });
  assert.deepEqual(pass('string-shout'), { status: 'pass', expected: 'loud text', got: 'loud text', message: '' });
  assert.deepEqual(pass('array-sum'), {
    status: 'pass',
    expected: 'the right totals',
    got: 'the right totals',
    message: '',
  });

  const wrong = (id) => runQuestCheck(id, solution(id, 'wrong'), { timeoutMs: 15000 });
  assert.deepEqual(wrong('dice-roll'), {
    status: 'fail',
    expected: 'rollDie(6, () => 0) gives 1',
    got: 'rollDie(6, () => 0) gave 0',
    message: '',
  });
  assert.equal(wrong('array-sum').expected, 'sumEven([1,2,3,4]) gives 6');
  assert.equal(wrong('array-sum').got, 'sumEven([1,2,3,4]) gave 4');
  assert.match(wrong('string-shout').expected, /^shout\("  hi there "\) gives "HI THERE!"$/);

  const missing = check('dice-roll', 'export const other = 1;');
  assert.deepEqual([missing.expected, missing.got], ['an exported function rollDie', 'rollDie is undefined']);
  const never = check(
    'dice-roll',
    'export function rollDie(s, r = Math.random) { return Math.floor(r() * (s - 1)) + 1; }',
  );
  assert.deepEqual(
    [never.expected, never.got],
    ['rollDie(6, () => 0.999999) gives 6', 'rollDie(6, () => 0.999999) gave 5'],
  );
  const range = check(
    'dice-roll',
    'export function rollDie(s, r = Math.random) { return r === Math.random ? 99 : Math.floor(r() * s) + 1; }',
  );
  assert.equal(range.expected, 'rollDie(6) gives a whole number from 1 to 6');
  assert.equal(range.got, 'rollDie(6) gave 99');
});

test('English runner messages are exactly what they were before', () => {
  assert.match(runQuestCheck('dice-roll', join(dir, 'nope.js')).message, /^Player file not found: .*nope\.js$/);
  assert.equal(check('dice-roll', "throw new Error('boom');").message, 'boom');
  assert.equal(
    check('dice-roll', 'process.exit(0);').message,
    'Your code stopped the program before the check could finish.',
  );
  assert.equal(
    check('string-shout', 'export function shout() { while (true) {} }', undefined, { timeoutMs: 400 }).message,
    'Your code ran longer than 0.4 seconds and was stopped.',
  );
  assert.equal(
    echo('export function answer() { return new Promise(() => {}); }').message,
    'Your code never finished: a promise it returned never settled, so the check had no answer to read.',
  );
  assert.equal(
    check('array-sum', "console.log('x'.repeat(2000000)); export function sumEven() { return 0; }").message,
    'Your code printed too much output.',
  );
  assert.equal(check('array-sum', "import 'node:nope';").status, 'error');
});

test('English move results are exactly what they were before', () => {
  assert.deepEqual(move('export function solve(a, b) { return a + b; }'), {
    status: 'pass',
    expected: 'every test passes',
    got: 'every test passes',
    message: '',
  });
  const wrong = move('export function solve(a, b) { return a - b; }');
  assert.deepEqual([wrong.expected, wrong.got], ['solve(1, 2) gives 3', 'solve(1, 2) gave -1']);
  assert.equal(move('export const x = 1;').message, 'Your file must export a function named solve.');
  assert.equal(move("export function solve() { throw new Error('nope'); }").message, 'solve threw: nope');
});

// ---- the same checks in Ukrainian
test('Ukrainian check results say the same thing in Ukrainian, with the call left as code', () => {
  const wrong = runQuestCheck('dice-roll', solution('dice-roll', 'wrong'), { timeoutMs: 15000, lang: 'uk' });
  assert.deepEqual(wrong, {
    status: 'fail',
    expected: '`rollDie(6, () => 0)` дає 1',
    got: '`rollDie(6, () => 0)` дала 0',
    message: '',
  });
  const missing = check('string-shout', 'export const other = 1;', 'uk');
  assert.deepEqual([missing.expected, missing.got], ['експортована функція `shout`', '`shout` має тип undefined']);
  const pass = runQuestCheck('array-sum', solution('array-sum', 'reference'), { timeoutMs: 15000, lang: 'uk' });
  assert.deepEqual([pass.status, pass.expected, pass.got], ['pass', 'правильні суми', 'правильні суми']);
  const range = check(
    'dice-roll',
    'export function rollDie(s, r = Math.random) { return r === Math.random ? 99 : Math.floor(r() * s) + 1; }',
    'uk',
  );
  assert.equal(range.expected, '`rollDie(6)` дає ціле число від 1 до 6');
});

test('Ukrainian runner and move messages are Ukrainian, and a player error text is kept as it is', () => {
  assert.match(
    runQuestCheck('dice-roll', join(dir, 'nope.js'), { lang: 'uk' }).message,
    /^Файл гравця не знайдено: .*nope\.js$/,
  );
  assert.equal(check('dice-roll', "throw new Error('boom');", 'uk').message, 'boom');
  assert.match(check('dice-roll', 'process.exit(0);', 'uk').message, /зупинив програму/);
  assert.match(
    check('string-shout', 'export function shout() { while (true) {} }', 'uk', { timeoutMs: 400 }).message,
    /^Твій код працював довше за 0\.4 с/,
  );
  assert.match(
    echo('export function answer() { return new Promise(() => {}); }', 'uk').message,
    /обіцянка \(promise\)/,
  );
  assert.match(move('export const x = 1;', 'uk').message, /`solve`/);
  assert.equal(
    move("export function solve() { throw new Error('nope'); }", 'uk').message,
    '`solve` викинула помилку: nope',
  );
  assert.deepEqual(move('export function solve(a, b) { return a + b; }', 'uk').expected, 'усі тести пройдено');
});

// ---- the quest text
test('every quest has text in both languages, and the code part of a starter file is the same in both', () => {
  for (const quest of QUESTS) {
    const english = questText(quest.id, 'en');
    const ukrainian = questText(quest.id, 'uk');
    for (const text of [english, ukrainian]) {
      assert.ok(text.title.length > 0 && text.brief.length > 0);
      assert.match(text.stub, /export function/);
      assert.ok(Array.isArray(text.specific));
    }
    const codeOf = (stub) =>
      stub
        .split('\n')
        .filter((line) => line.trim() && !line.trim().startsWith('//'))
        .join('\n');
    assert.equal(
      codeOf(ukrainian.stub),
      codeOf(english.stub),
      `${quest.id}: the code in the two starter files differs`,
    );
    assert.notEqual(ukrainian.title, english.title);
  }
});

test('the general style directions are nine in both languages', () => {
  assert.equal(generalStyle('en').length, 9);
  assert.equal(generalStyle('uk').length, 9);
});

const withoutAllowedLatin = (text) =>
  text
    .replace(/`[^`]*`/g, '')
    .replace(/\{\w+\}/g, '')
    .replace(/\([A-Za-z][A-Za-z .,'/-]*\)/g, '');

test('Ukrainian quest titles, briefs, and style directions carry no stray Latin letters', () => {
  const texts = [...generalStyle('uk')];
  for (const quest of QUESTS) {
    const text = questText(quest.id, 'uk');
    texts.push(text.title, text.brief, ...text.specific);
  }
  for (const text of texts) assert.doesNotMatch(withoutAllowedLatin(text), /[A-Za-z]/, text);
});

test('no quest text has an em-dash or an en-dash', () => {
  const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
  for (const lang of ['en', 'uk']) {
    const texts = [...generalStyle(lang)];
    for (const quest of QUESTS) {
      const text = questText(quest.id, lang);
      texts.push(text.title, text.brief, text.stub, ...text.specific);
    }
    for (const text of texts) for (const dash of dashes) assert.ok(!text.includes(dash), `${lang}: ${text}`);
  }
});

// ---- every message key the code uses exists in both catalogs
test('every check.* and style.* key used in the source exists in both catalogs', () => {
  const files = [
    ...['quests', 'game'].flatMap((folder) =>
      readdirSync(join(root, folder))
        .filter((f) => f.endsWith('.js'))
        .map((f) => join(root, folder, f)),
    ),
  ];
  const used = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/'((?:check|style)\.[A-Za-z.]+)'/g)) used.add(match[1]);
  }
  assert.ok(used.size >= 15, `only ${used.size} keys found`);
  for (const key of used) {
    assert.ok(key in en, `en has no ${key}`);
    assert.ok(key in uk, `uk has no ${key}`);
  }
});

// ---- startQuest, checkQuest, and the stored attempts follow the save's language
function worldSave(language) {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'rogue',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  if (language) setLanguage(db, saveId, language);
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-qi18n-world-'));
  return { db, saveId, playerDir, opts: { playerDir, timeoutMs: 15000 } };
}

test('quest start gives the title, brief, stub, and style in the language of the save, and never overwrites the file', () => {
  for (const language of ['en', 'uk']) {
    const { db, saveId, playerDir } = worldSave(language);
    const started = startQuest('dice-roll', { playerDir, db, saveId });
    const text = questText('dice-roll', language);
    assert.deepEqual([started.title, started.brief], [text.title, text.brief]);
    assert.equal(readFileSync(started.file, 'utf8'), text.stub);
    assert.deepEqual(started.style, { general: generalStyle(language), specific: text.specific });
    writeFileSync(started.file, '// my work\n');
    assert.equal(startQuest('dice-roll', { playerDir, db, saveId }).created, false);
    assert.equal(readFileSync(started.file, 'utf8'), '// my work\n');
  }
});

test('an unset language starts quests in English', () => {
  const { db, saveId, playerDir } = worldSave(null);
  assert.equal(startQuest('dice-roll', { playerDir, db, saveId }).title, questText('dice-roll', 'en').title);
});

test('attempts store the text in the language of the moment, and a later switch leaves them alone', () => {
  const { db, saveId, playerDir, opts } = worldSave('uk');
  writeFileSync(join(playerDir, 'dice-roll.js'), readFileSync(solution('dice-roll', 'wrong'), 'utf8'));
  const first = checkQuest(db, saveId, 'dice-roll', opts);
  assert.equal(first.expected, '`rollDie(6, () => 0)` дає 1');
  setLanguage(db, saveId, 'en');
  const second = checkQuest(db, saveId, 'dice-roll', opts);
  assert.equal(second.expected, 'rollDie(6, () => 0) gives 1');
  const stored = db
    .prepare('SELECT expected FROM quest_attempts ORDER BY id')
    .all()
    .map((r) => r.expected);
  assert.deepEqual(stored, ['`rollDie(6, () => 0)` дає 1', 'rollDie(6, () => 0) gives 1']);
});

// ---- style problems
const MESSY = "var x = 1;\nexport const same = x == 1;\nconsole.log('hi');\n";
const installed = existsSync(join(root, 'node_modules', '.bin', 'prettier'));
const options = { skip: installed ? false : 'run npm install to enable the style checks' };

test('style problems are in English as ESLint says them, and in Ukrainian by rule', options, () => {
  const english = checkStyle(player(MESSY)).problems.join('\n');
  assert.match(english, /line 1: Unexpected var, use let or const instead\. \(no-var\)/);
  assert.match(english, /line 2: Expected '===' and instead saw '=='\. \(eqeqeq\)/);

  const ukrainian = checkStyle(player(MESSY), { lang: 'uk' }).problems.join('\n');
  assert.match(ukrainian, /рядок 1: .*`var`.* \(no-var\)/);
  assert.match(ukrainian, /рядок 2: .*`===`.* \(eqeqeq\)/);
  assert.match(ukrainian, /рядок 3: .*`console\.log`.* \(no-console\)/);
});

test(
  'a formatting problem and a parse error are reported in the language, the parse error with the linter text',
  options,
  () => {
    const formatting = checkStyle(player('export const greeting = "hello"\n'), { lang: 'uk' }).problems;
    assert.match(formatting[0], /^форматування: рядок 1 має виглядати так: "export const greeting = 'hello';"$/);
    const parse = checkStyle(player('export function ( {'), { lang: 'uk' }).problems;
    assert.match(parse.join('\n'), /Parsing error/);
  },
);

test('a missing style tool is reported in the language', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'jsdnd-notools-'));
  assert.match(
    checkStyle(player('export const a = 1;\n'), { root: emptyRoot }).message,
    /Style tools are not installed/,
  );
  assert.match(
    checkStyle(player('export const a = 1;\n'), { root: emptyRoot, lang: 'uk' }).message,
    /Інструменти стилю не встановлено/,
  );
});
