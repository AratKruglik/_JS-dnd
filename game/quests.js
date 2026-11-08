import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inTransaction } from './db.js';
import { getHonor } from './honor.js';
import { applyHonorRule, toneFor } from './honor-rules.js';
import { runQuestCheck } from './quest-runner.js';
import { QUESTS, getQuest } from '../quests/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HINT_KINDS = ['npc_speech', 'legal_doc', 'illegal_doc', 'master_leak'];
const now = () => new Date().toISOString();

export const defaultPlayerDir = () => process.env.JSDND_PLAYER_DIR ?? resolve(repoRoot, 'player');

function requireQuest(questId) {
  const quest = getQuest(questId);
  if (!quest) throw new Error(`Unknown quest "${questId}". Known quests: ${QUESTS.map((q) => q.id).join(', ')}.`);
  return quest;
}

// A tamper reset starts a new epoch: solves and hints from earlier epochs no longer count.
const epochOf = (db, saveId) =>
  db.prepare('SELECT COUNT(*) AS n FROM resets WHERE save_id = ?').get(saveId).n;

// Fingerprint of the player's file, or null when it cannot be read.
function fileHash(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
}

const hintsUsed = (db, saveId, questId, epoch) =>
  db
    .prepare('SELECT COUNT(*) AS n FROM quest_hints WHERE save_id = ? AND quest_id = ? AND epoch = ?')
    .get(saveId, questId, epoch).n;

export function startQuest(questId, { playerDir = defaultPlayerDir() } = {}) {
  const quest = requireQuest(questId);
  mkdirSync(playerDir, { recursive: true });
  const file = join(playerDir, `${quest.id}.js`);
  const created = !existsSync(file);
  if (created) writeFileSync(file, quest.stub);
  return { questId: quest.id, file, created, brief: quest.brief };
}

// Step 1. Always records an attempt. Honor never changes here.
export function checkQuest(db, saveId, questId, { playerDir = defaultPlayerDir(), timeoutMs } = {}) {
  const quest = requireQuest(questId);
  const playerPath = join(playerDir, `${quest.id}.js`);
  // Hash first: this is the code the check is about to run. Step 2 must read the same bytes.
  const sha = fileHash(playerPath);
  const result = runQuestCheck(quest.id, playerPath, { timeoutMs: timeoutMs ?? quest.timeoutMs });
  const attempt = db
    .prepare(
      'INSERT INTO quest_attempts (save_id, quest_id, created_at, status, expected, got, message, complexity, file_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(saveId, quest.id, now(), result.status, result.expected, result.got, result.message, quest.complexity, sha);
  const passed = result.status === 'pass';
  return {
    attemptId: Number(attempt.lastInsertRowid),
    ...result,
    next: passed ? 'judge' : 'retry',
    ...(passed ? { tone: toneFor(getHonor(db, saveId)) } : {}),
  };
}

// Step 2. The Master reads the file and reports a verdict; this records it and moves honor.
export function judgeQuest(db, saveId, questId, verdict, note = null, { playerDir = defaultPlayerDir() } = {}) {
  if (verdict !== 'clean' && verdict !== 'cheated') throw new Error(`Verdict must be clean or cheated, got "${verdict}".`);
  const quest = requireQuest(questId);

  return inTransaction(db, () => {
    const attempt = db
      .prepare('SELECT * FROM quest_attempts WHERE save_id = ? AND quest_id = ? ORDER BY id DESC LIMIT 1')
      .get(saveId, quest.id);
    if (!attempt || attempt.status !== 'pass') {
      throw new Error(`No passing attempt to judge for "${quest.id}". Run the check first.`);
    }
    if (db.prepare('SELECT 1 FROM quest_judgments WHERE attempt_id = ?').get(attempt.id)) {
      throw new Error(`The latest attempt for "${quest.id}" is already judged.`);
    }
    const epoch = epochOf(db, saveId);
    if (db.prepare('SELECT 1 FROM quest_solves WHERE save_id = ? AND quest_id = ? AND epoch = ?').get(saveId, quest.id, epoch)) {
      throw new Error(`Quest "${quest.id}" is already solved.`);
    }
    // Attempts from before migration 3 have no fingerprint and are not checked.
    if (attempt.file_sha256 !== null && fileHash(join(playerDir, `${quest.id}.js`)) !== attempt.file_sha256) {
      throw new Error(`The file for "${quest.id}" changed after the check. Run the check again before judging.`);
    }

    db.prepare('INSERT INTO quest_judgments (attempt_id, created_at, verdict, note) VALUES (?, ?, ?, ?)').run(
      attempt.id,
      now(),
      verdict,
      note,
    );

    if (verdict === 'cheated') {
      return { solved: false, honor: applyHonorRule(db, saveId, 'cheat', note ?? `cheated on ${quest.id}`) };
    }
    const hints = hintsUsed(db, saveId, quest.id, epoch);
    db.prepare(
      'INSERT INTO quest_solves (save_id, quest_id, attempt_id, solved_at, epoch, hints_used, complexity) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(saveId, quest.id, attempt.id, now(), epoch, hints, quest.complexity);
    const honor = applyHonorRule(db, saveId, hints === 0 ? 'clean_solve_no_hints' : 'clean_solve', `solved ${quest.id}`);
    return { solved: true, honor };
  });
}

export function logHint(db, saveId, questId, kind, note = null) {
  if (!HINT_KINDS.includes(kind)) throw new Error(`Unknown hint kind "${kind}". Use one of: ${HINT_KINDS.join(', ')}.`);
  const quest = requireQuest(questId);
  return inTransaction(db, () => {
    const epoch = epochOf(db, saveId);
    db.prepare('INSERT INTO quest_hints (save_id, quest_id, created_at, epoch, kind, note) VALUES (?, ?, ?, ?, ?, ?)').run(
      saveId,
      quest.id,
      now(),
      epoch,
      kind,
      note,
    );
    if (kind === 'illegal_doc') applyHonorRule(db, saveId, 'illegal_link', note ?? `illegal link on ${quest.id}`);
    if (kind === 'master_leak') applyHonorRule(db, saveId, 'master_leak', note ?? `leak trick on ${quest.id}`);
    return { hintsUsed: hintsUsed(db, saveId, quest.id, epoch) };
  });
}

export function getProgress(db, saveId) {
  const epoch = epochOf(db, saveId);
  const solvedIds = new Set(
    db
      .prepare('SELECT quest_id FROM quest_solves WHERE save_id = ? AND epoch = ?')
      .all(saveId, epoch)
      .map((r) => r.quest_id),
  );
  return {
    epoch,
    solved: QUESTS.filter((q) => solvedIds.has(q.id)).map((q) => q.id),
    remaining: QUESTS.filter((q) => !solvedIds.has(q.id)).map((q) => q.id),
    total: QUESTS.length,
  };
}
