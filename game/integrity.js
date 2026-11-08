import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const defaultDicePath = () => process.env.JSDND_DICE_PATH ?? resolve(repoRoot, 'game', 'dice.js');
const defaultRollsPath = () => process.env.JSDND_ROLLS_PATH ?? resolve(repoRoot, 'game', 'rolls.js');
const defaultSealPath = () => process.env.JSDND_DICE_SEAL ?? resolve(repoRoot, 'game', 'dice.sha256');

const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// One fingerprint for both sealed files, so a change to either one is a different fingerprint.
const combine = (dice, rolls) => createHash('sha256').update(`dice:${dice}\nrolls:${rolls}\n`).digest('hex');

// The seal file has one line per sealed file: "dice <hash>" and "rolls <hash>". Anything else is broken.
function readSeal(sealPath) {
  try {
    const hashes = {};
    for (const line of readFileSync(sealPath, 'utf8').split('\n')) {
      const match = /^(dice|rolls) ([0-9a-f]{64})$/.exec(line.trim());
      if (match) hashes[match[1]] = match[2];
    }
    return hashes.dice && hashes.rolls ? hashes : null;
  } catch {
    return null;
  }
}

// Writes the fingerprints of game/dice.js and game/rolls.js into the seal file. Developers run this
// after an intended change to either one (node game/seal.js). Returns the combined fingerprint.
export function sealDice(dicePath = defaultDicePath(), sealPath = defaultSealPath(), rollsPath = defaultRollsPath()) {
  const dice = hashFile(dicePath);
  const rolls = hashFile(rollsPath);
  writeFileSync(sealPath, `dice ${dice}\nrolls ${rolls}\n`);
  return combine(dice, rolls);
}

// A sealed file that cannot be read counts as missing, so a locked or deleted file never crashes the game.
export function checkDice({
  dicePath = defaultDicePath(),
  sealPath = defaultSealPath(),
  rollsPath = defaultRollsPath(),
} = {}) {
  const seal = readSeal(sealPath);
  const expected = seal ? combine(seal.dice, seal.rolls) : null;
  let found = 'missing';
  try {
    found = combine(hashFile(dicePath), hashFile(rollsPath));
  } catch {
    found = 'missing';
  }
  if (expected === null) return { ok: false, reason: 'seal-missing', expected: null, found };
  if (found === 'missing') return { ok: false, reason: 'missing', expected, found };
  if (found !== expected) return { ok: false, reason: 'modified', expected, found };
  return { ok: true };
}
