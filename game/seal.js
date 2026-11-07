// Developer-only. Run this after an intended change to game/dice.js so the fingerprint
// in game/dice.sha256 matches. It is deliberately not part of the player CLI
// (game/cli.js), so a player or the Master cannot use it to hide tampering.
import { sealDice } from './integrity.js';

console.log(sealDice());
