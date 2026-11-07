import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const defaultDicePath = () => process.env.JSDND_DICE_PATH ?? resolve(repoRoot, 'game', 'dice.js');
const defaultSealPath = () => process.env.JSDND_DICE_SEAL ?? resolve(repoRoot, 'game', 'dice.sha256');

const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// Writes the fingerprint of the dice file into the seal file. Developers run this after
// an intended change to game/dice.js (node game/seal.js).
export function sealDice(dicePath = defaultDicePath(), sealPath = defaultSealPath()) {
  const hash = hashFile(dicePath);
  writeFileSync(sealPath, `${hash}\n`);
  return hash;
}

// A dice file that cannot be read counts as missing, so a locked or deleted file never crashes the game.
export function checkDice({ dicePath = defaultDicePath(), sealPath = defaultSealPath() } = {}) {
  let expected = null;
  try {
    expected = readFileSync(sealPath, 'utf8').trim() || null;
  } catch {
    expected = null;
  }
  let found = 'missing';
  try {
    found = hashFile(dicePath);
  } catch {
    found = 'missing';
  }
  if (expected === null) return { ok: false, reason: 'seal-missing', expected: null, found };
  if (found === 'missing') return { ok: false, reason: 'missing', expected, found };
  if (found !== expected) return { ok: false, reason: 'modified', expected, found };
  return { ok: true };
}
