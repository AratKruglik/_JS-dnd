import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inTransaction } from './db.js';
import { addHonorEvent, getHonor } from './honor.js';
import { applyHonorRule, toneFor } from './honor-rules.js';
import { healForSolve } from './vitals.js';
import { runQuestCheck } from './quest-runner.js';
import { QUESTS, getQuest } from '../quests/index.js';
import { questText, generalStyle } from '../quests/text/index.js';
import { DEFAULT_LANGUAGE, effectiveLanguage } from './i18n.js';
import { checkStyle } from './style-check.js';
import { getHero } from './hero.js';
import { worldStatus } from './world-status.js';

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
const epochOf = (db, saveId) => db.prepare('SELECT COUNT(*) AS n FROM resets WHERE save_id = ?').get(saveId).n;

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

// A quest opens for a hero in a finished world once every earlier quest is solved in this epoch.
// Where the NPC stands and whether they are awake is not checked, so the Master can always recover.
function requireQuestAccess(db, saveId, quest) {
  if (!getHero(db, saveId)) throw new Error('No hero yet. Create one first.');
  const status = worldStatus(db, saveId);
  if (!status.complete) throw new Error(`The world is not ready yet (missing: ${status.missing.join(', ')}).`);
  const { solved } = getProgress(db, saveId);
  const unsolved = QUESTS.slice(0, QUESTS.indexOf(quest))
    .filter((q) => !solved.includes(q.id))
    .map((q) => q.id);
  if (unsolved.length) throw new Error(`Quest "${quest.id}" is not open yet. Solve first: ${unsolved.join(', ')}.`);
}

// With a database and a save the quest is gated. Tools that only want the stub can leave them out.
export function startQuest(questId, { playerDir = defaultPlayerDir(), db, saveId, lang } = {}) {
  const quest = requireQuest(questId);
  if (db) requireQuestAccess(db, saveId, quest);
  const language = lang ?? (db ? effectiveLanguage(db, saveId) : DEFAULT_LANGUAGE);
  const text = questText(quest.id, language);
  mkdirSync(playerDir, { recursive: true });
  const file = join(playerDir, `${quest.id}.js`);
  const created = !existsSync(file);
  if (created) writeFileSync(file, text.stub);
  return {
    questId: quest.id,
    file,
    created,
    title: text.title,
    brief: text.brief,
    style: { general: generalStyle(language), specific: text.specific },
  };
}

// Step 1. Always records an attempt. Honor never changes here.
// With style: true a passing file also gets the style check (a separate, slower step).
export function checkQuest(db, saveId, questId, { playerDir = defaultPlayerDir(), timeoutMs, style = false } = {}) {
  const quest = requireQuest(questId);
  requireQuestAccess(db, saveId, quest);
  const playerPath = join(playerDir, `${quest.id}.js`);
  // Hash first: this is the code the check is about to run. Step 2 must read the same bytes.
  const sha = fileHash(playerPath);
  const lang = effectiveLanguage(db, saveId);
  const result = runQuestCheck(quest.id, playerPath, { timeoutMs: timeoutMs ?? quest.timeoutMs, lang });
  const attempt = db
    .prepare(
      'INSERT INTO quest_attempts (save_id, quest_id, created_at, status, expected, got, message, complexity, file_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(saveId, quest.id, now(), result.status, result.expected, result.got, result.message, quest.complexity, sha);
  const passed = result.status === 'pass';
  return {
    attemptId: Number(attempt.lastInsertRowid),
    file: playerPath,
    ...result,
    next: passed ? 'judge' : 'retry',
    ...(passed ? { tone: toneFor(getHonor(db, saveId)) } : {}),
    ...(passed && style ? { style: checkStyle(playerPath, { lang }) } : {}),
  };
}

// The player kept code that fails the style check after being warned. Small honor hit, once per solve.
export function declineStyle(db, saveId, questId, { playerDir = defaultPlayerDir(), styleRoot } = {}) {
  const quest = requireQuest(questId);
  return inTransaction(db, () => {
    const passed = db
      .prepare("SELECT 1 FROM quest_attempts WHERE save_id = ? AND quest_id = ? AND status = 'pass' LIMIT 1")
      .get(saveId, quest.id);
    if (!passed) throw new Error(`No passing attempt for "${quest.id}". Run the check first.`);
    const epoch = epochOf(db, saveId);
    if (
      db
        .prepare('SELECT 1 FROM style_declines WHERE save_id = ? AND quest_id = ? AND epoch = ?')
        .get(saveId, quest.id, epoch)
    ) {
      throw new Error(`The style of "${quest.id}" was already declined.`);
    }
    const result = checkStyle(join(playerDir, `${quest.id}.js`), styleRoot ? { root: styleRoot } : undefined);
    if (!result.ran) throw new Error(`The style check is not available. ${result.message}`);
    if (result.ok) throw new Error('There is nothing to decline: the style is clean.');
    db.prepare('INSERT INTO style_declines (save_id, quest_id, epoch, created_at) VALUES (?, ?, ?, ?)').run(
      saveId,
      quest.id,
      epoch,
      now(),
    );
    return {
      honor: applyHonorRule(db, saveId, 'style_declined', `kept code that fails the style check in ${quest.id}`),
    };
  });
}

// Step 2. The Master reads the file and reports a verdict; this records it and moves honor.
export function judgeQuest(db, saveId, questId, verdict, note = null, { playerDir = defaultPlayerDir() } = {}) {
  if (verdict !== 'clean' && verdict !== 'cheated')
    throw new Error(`Verdict must be clean or cheated, got "${verdict}".`);
  const quest = requireQuest(questId);

  return inTransaction(db, () => {
    requireQuestAccess(db, saveId, quest);
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
    const existing = db
      .prepare('SELECT id, revoked_at FROM quest_solves WHERE save_id = ? AND quest_id = ? AND epoch = ?')
      .get(saveId, quest.id, epoch);
    if (existing && existing.revoked_at === null) {
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
    if (existing) {
      // A revoked solve is solved again in the same row (one row per quest and epoch).
      db.prepare(
        'UPDATE quest_solves SET attempt_id = ?, solved_at = ?, hints_used = ?, complexity = ?, revoked_at = NULL WHERE id = ?',
      ).run(attempt.id, now(), hints, quest.complexity, existing.id);
    } else {
      db.prepare(
        'INSERT INTO quest_solves (save_id, quest_id, attempt_id, solved_at, epoch, hints_used, complexity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(saveId, quest.id, attempt.id, now(), epoch, hints, quest.complexity);
    }
    const honor = applyHonorRule(
      db,
      saveId,
      hints === 0 ? 'clean_solve_no_hints' : 'clean_solve',
      `solved ${quest.id}`,
    );
    healForSolve(db, saveId);
    return { solved: true, honor };
  });
}

// The Master found cheating after a solve was judged clean. The solve stops counting, the cheat
// penalty applies once, and the quest can be solved again.
export function revokeSolve(db, saveId, questId, note = null) {
  const quest = requireQuest(questId);
  return inTransaction(db, () => {
    const epoch = epochOf(db, saveId);
    const solve = db
      .prepare('SELECT id, revoked_at FROM quest_solves WHERE save_id = ? AND quest_id = ? AND epoch = ?')
      .get(saveId, quest.id, epoch);
    if (!solve) throw new Error(`Quest "${quest.id}" is not solved in this epoch, so there is nothing to revoke.`);
    if (solve.revoked_at !== null) throw new Error(`The solve of "${quest.id}" is already revoked.`);
    db.prepare('UPDATE quest_solves SET revoked_at = ? WHERE id = ?').run(now(), solve.id);
    // Take back the bonus this solve really paid, so being caught late costs the same as being
    // caught at judging. Then the cheat penalty.
    const paid = db
      .prepare(
        "SELECT delta FROM honor_events WHERE save_id = ? AND kind IN ('clean_solve', 'clean_solve_no_hints') AND reason = ? ORDER BY id DESC LIMIT 1",
      )
      .get(saveId, `solved ${quest.id}`);
    if (paid && paid.delta > 0) {
      addHonorEvent(db, saveId, {
        delta: -paid.delta,
        kind: 'revoke_bonus',
        reason: `took back the bonus for ${quest.id}`,
      });
    }
    return {
      revoked: true,
      honor: applyHonorRule(db, saveId, 'cheat', note ?? `cheated on ${quest.id}, found after the solve`),
    };
  });
}

export function logHint(db, saveId, questId, kind, note = null) {
  if (!HINT_KINDS.includes(kind)) throw new Error(`Unknown hint kind "${kind}". Use one of: ${HINT_KINDS.join(', ')}.`);
  const quest = requireQuest(questId);
  return inTransaction(db, () => {
    const epoch = epochOf(db, saveId);
    db.prepare(
      'INSERT INTO quest_hints (save_id, quest_id, created_at, epoch, kind, note) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(saveId, quest.id, now(), epoch, kind, note);
    if (kind === 'illegal_doc') applyHonorRule(db, saveId, 'illegal_link', note ?? `illegal link on ${quest.id}`);
    if (kind === 'master_leak') applyHonorRule(db, saveId, 'master_leak', note ?? `leak trick on ${quest.id}`);
    return { hintsUsed: hintsUsed(db, saveId, quest.id, epoch) };
  });
}

export function getProgress(db, saveId) {
  const epoch = epochOf(db, saveId);
  const solvedIds = new Set(
    db
      .prepare('SELECT quest_id FROM quest_solves WHERE save_id = ? AND epoch = ? AND revoked_at IS NULL')
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
