import { inTransaction } from './db.js';
import { getHero } from './hero.js';
import { worldStatus } from './world-status.js';
import { startFight, logFightStep, endFight, getFightLog } from './fights.js';
import { applyHonorRule } from './honor-rules.js';
import { abilityMod, heroStats, ENEMY_TIERS, attackRoll, damageRoll, initiativeRoll } from './combat.js';
import { getQuest } from '../quests/index.js';
import { SKELETON } from '../world/skeleton.js';

const WARNINGS_BEFORE_FIGHT = 2;
const now = () => new Date().toISOString();

export function warnNpc(db, saveId, npcSlot, reason = null) {
  const slot = String(npcSlot ?? '').trim().toUpperCase();
  if (!SKELETON.npcs.some((n) => n.slot === slot)) throw new Error(`Unknown NPC "${npcSlot}".`);
  return inTransaction(db, () => {
    db.prepare(
      `INSERT INTO npc_warnings (save_id, npc_slot, count, last_reason, updated_at) VALUES (?, ?, 1, ?, ?)
       ON CONFLICT (save_id, npc_slot) DO UPDATE SET count = count + 1, last_reason = excluded.last_reason, updated_at = excluded.updated_at`,
    ).run(saveId, slot, reason, now());
    const { count } = db.prepare('SELECT count FROM npc_warnings WHERE save_id = ? AND npc_slot = ?').get(saveId, slot);
    return { warnings: count, mayFight: count > WARNINGS_BEFORE_FIGHT };
  });
}

const openFight = (db, saveId) =>
  db
    .prepare('SELECT * FROM fights WHERE save_id = ? AND ended_at IS NULL AND enemy_hp IS NOT NULL ORDER BY id DESC LIMIT 1')
    .get(saveId);

function stateOf(db, fightId, extras = {}) {
  const f = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
  return {
    fightId,
    round: f.round,
    hero: { hp: f.hero_hp, hpMax: f.hero_hp_max },
    enemy: { name: f.enemy_name, tier: f.enemy_tier, hp: f.enemy_hp, hpMax: f.enemy_hp_max, ac: f.enemy_ac },
    status: f.outcome ?? 'open',
    log: getFightLog(db, fightId).slice(-6),
    ...extras,
  };
}

export function getFightState(db, saveId) {
  const f = openFight(db, saveId);
  return f ? stateOf(db, f.id) : null;
}

// Only the enemy's answer to the hero's turn. Returns true when the hero is knocked out.
function enemyTurn(db, saveId, fight, hero, rng) {
  const tier = ENEMY_TIERS[fight.enemy_tier];
  const attack = attackRoll(db, saveId, tier.attack, heroStats(hero).ac, rng, `${fight.enemy_name} attack`);
  let detail = `${fight.enemy_name} misses (${attack.total} vs AC ${heroStats(hero).ac})`;
  let heroHp = fight.hero_hp;
  logFightStep(db, fight.id, { actor: 'enemy', action: 'attack', rollId: attack.rollId, detail });
  if (attack.hit) {
    const dmg = damageRoll(db, saveId, tier.die, 0, attack.crit, rng, `${fight.enemy_name} damage`);
    heroHp = Math.max(0, heroHp - dmg.damage);
    logFightStep(db, fight.id, {
      actor: 'enemy',
      action: 'damage',
      rollId: dmg.rollId,
      detail: `${fight.enemy_name} hits for ${dmg.damage}${attack.crit ? ' (critical)' : ''}, hero at ${heroHp}`,
    });
  }
  db.prepare('UPDATE fights SET hero_hp = ? WHERE id = ?').run(heroHp, fight.id);
  return heroHp === 0;
}

function finishLoss(db, fight) {
  endFight(db, fight.id, 'lost');
  db.prepare('UPDATE heroes SET location_slot = ? WHERE save_id = ?').run(SKELETON.start, fight.save_id);
}

export function beginFight(db, saveId, { npcSlot, tier, aggressor, questId = null, rng } = {}) {
  const hero = getHero(db, saveId);
  if (!hero) throw new Error('No hero yet. Create one first.');
  const status = worldStatus(db, saveId);
  if (!status.complete) throw new Error(`The world is not ready yet (missing: ${status.missing.join(', ')}).`);
  if (!Object.hasOwn(ENEMY_TIERS, tier)) throw new Error(`Unknown tier "${tier}". Use one of: ${Object.keys(ENEMY_TIERS).join(', ')}.`);
  if (aggressor !== 'hero' && aggressor !== 'npc') throw new Error(`Aggressor must be "hero" or "npc", got "${aggressor}".`);
  if (questId !== null && !getQuest(questId)) throw new Error(`Unknown quest "${questId}".`);

  const slot = String(npcSlot ?? '').trim().toUpperCase();
  const spot = SKELETON.npcs.find((n) => n.slot === slot);
  if (!spot || spot.location !== hero.locationSlot) throw new Error(`${npcSlot} is not here.`);
  if (openFight(db, saveId)) throw new Error('A fight is already in progress.');

  if (aggressor === 'npc' && !questId) {
    const row = db.prepare('SELECT count FROM npc_warnings WHERE save_id = ? AND npc_slot = ?').get(saveId, slot);
    const given = row?.count ?? 0;
    if (given <= WARNINGS_BEFORE_FIGHT) {
      throw new Error(`${slot} has only given ${given} warning(s). They need ${WARNINGS_BEFORE_FIGHT + 1} before starting a fight.`);
    }
  }

  return inTransaction(db, () => {
    const npc = db.prepare('SELECT name FROM world_npcs WHERE save_id = ? AND slot = ?').get(saveId, slot);
    const stats = heroStats(hero);
    const enemy = ENEMY_TIERS[tier];
    const fightId = startFight(db, saveId, { triggerReason: `${aggressor === 'hero' ? 'hero attacked' : 'provoked'} ${npc.name}` });
    db.prepare(
      `UPDATE fights SET aggressor = ?, npc_slot = ?, quest_id = ?, enemy_name = ?, enemy_tier = ?, enemy_hp = ?,
         enemy_hp_max = ?, enemy_ac = ?, hero_hp = ?, hero_hp_max = ? WHERE id = ?`,
    ).run(aggressor, slot, questId, npc.name, tier, enemy.hp, enemy.hp, enemy.ac, stats.maxHp, stats.maxHp, fightId);

    const dexMod = abilityMod(hero.abilities.DEX.base + hero.abilities.DEX.traitAdjust);
    const heroInit = initiativeRoll(db, saveId, dexMod, rng, 'hero initiative');
    const enemyInit = initiativeRoll(db, saveId, 0, rng, `${npc.name} initiative`);
    const heroGoesFirst = heroInit.total >= enemyInit.total;
    logFightStep(db, fightId, {
      actor: 'system',
      action: 'initiative',
      rollId: heroInit.rollId,
      detail: `hero ${heroInit.total} vs ${npc.name} ${enemyInit.total}, ${heroGoesFirst ? 'hero' : npc.name} first`,
    });

    if (!heroGoesFirst) {
      const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
      if (enemyTurn(db, saveId, fight, hero, rng)) finishLoss(db, fight);
    }
    return stateOf(db, fightId);
  });
}

export function heroAttack(db, saveId, { rng, sureHit = false, doubleDamage = false } = {}) {
  const fight = openFight(db, saveId);
  if (!fight) throw new Error('No fight in progress.');
  const hero = getHero(db, saveId);
  const stats = heroStats(hero);

  return inTransaction(db, () => {
    let enemyHp = fight.enemy_hp;
    const attack = attackRoll(db, saveId, stats.attackBonus, fight.enemy_ac, rng, 'hero attack');
    const hit = sureHit || attack.hit;
    logFightStep(db, fight.id, {
      actor: 'hero',
      action: 'attack',
      rollId: attack.rollId,
      detail: hit ? `hit (${attack.total} vs AC ${fight.enemy_ac})${sureHit ? ', sure hit' : ''}` : `miss (${attack.total} vs AC ${fight.enemy_ac})`,
    });
    if (hit) {
      const dmg = damageRoll(db, saveId, 8, stats.damageMod, attack.crit, rng, 'hero damage');
      const damage = doubleDamage ? dmg.damage * 2 : dmg.damage;
      enemyHp = Math.max(0, enemyHp - damage);
      logFightStep(db, fight.id, {
        actor: 'hero',
        action: 'damage',
        rollId: dmg.rollId,
        detail: `hero deals ${damage}${doubleDamage ? ' (double)' : ''}${attack.crit ? ' (critical)' : ''}, ${fight.enemy_name} at ${enemyHp}`,
      });
    }
    db.prepare('UPDATE fights SET enemy_hp = ? WHERE id = ?').run(enemyHp, fight.id);

    if (enemyHp === 0) {
      endFight(db, fight.id, 'won');
      const kind = fight.aggressor === 'npc' ? 'kill_self_defense' : 'kill_unprovoked';
      const honor = applyHonorRule(db, saveId, kind, `defeated ${fight.enemy_name}`);
      return stateOf(db, fight.id, { honor });
    }

    const current = db.prepare('SELECT * FROM fights WHERE id = ?').get(fight.id);
    if (enemyTurn(db, saveId, current, hero, rng)) {
      finishLoss(db, current);
    } else {
      db.prepare('UPDATE fights SET round = round + 1 WHERE id = ?').run(fight.id);
    }
    return stateOf(db, fight.id);
  });
}

export function fleeFight(db, saveId) {
  const fight = openFight(db, saveId);
  if (!fight) throw new Error('No fight in progress.');
  logFightStep(db, fight.id, { actor: 'hero', action: 'flee', detail: 'the hero runs' });
  endFight(db, fight.id, 'fled');
  return stateOf(db, fight.id);
}
