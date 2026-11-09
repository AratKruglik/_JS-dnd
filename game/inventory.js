import { inTransaction } from './db.js';
import { effectiveLanguage } from './i18n.js';
import { lintVoice } from './voice.js';

// Items are names only. A script grants an unnamed item and the Master names it once, in the voice of
// the world. A revoked item stays as a row, so history is kept.
export const MAX_ITEM_NAME = 60;

const now = () => new Date().toISOString();

export function grantItem(db, saveId, { source, questId = null, fightId = null }) {
  const result = db
    .prepare('INSERT INTO inventory_items (save_id, source, quest_id, fight_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(saveId, source, questId, fightId, now());
  return Number(result.lastInsertRowid);
}

// The latest item a solve of this quest gave, taken away when that solve is revoked.
export function revokeQuestItem(db, saveId, questId) {
  const item = db
    .prepare(
      "SELECT id FROM inventory_items WHERE save_id = ? AND source = 'quest' AND quest_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1",
    )
    .get(saveId, questId);
  if (item) db.prepare('UPDATE inventory_items SET revoked_at = ? WHERE id = ?').run(now(), item.id);
  return Boolean(item);
}

export function listItems(db, saveId) {
  return db
    .prepare(
      'SELECT id, name, source, quest_id, fight_id, created_at FROM inventory_items WHERE save_id = ? AND revoked_at IS NULL ORDER BY id',
    )
    .all(saveId)
    .map((r) => ({
      id: r.id,
      name: r.name,
      source: r.source,
      questId: r.quest_id,
      fightId: r.fight_id,
      createdAt: r.created_at,
    }));
}

export const countItems = (db, saveId) =>
  db.prepare('SELECT COUNT(*) AS n FROM inventory_items WHERE save_id = ? AND revoked_at IS NULL').get(saveId).n;

export function nameItem(db, saveId, itemId, name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('The item name must not be empty.');
  const clean = name.trim();
  if (clean.length > MAX_ITEM_NAME) throw new Error(`The item name is at most ${MAX_ITEM_NAME} characters.`);
  if (/[\p{Cc}\p{Cf}]/u.test(clean)) throw new Error('The item name must be one line of plain text.');
  const { hits } = lintVoice(clean, effectiveLanguage(db, saveId));
  if (hits.length)
    throw new Error(`The item name contains the banned phrase "${hits[0]}". Rewrite it in the setting's voice.`);

  return inTransaction(db, () => {
    const item = Number.isSafeInteger(itemId)
      ? db
          .prepare('SELECT id, name FROM inventory_items WHERE id = ? AND save_id = ? AND revoked_at IS NULL')
          .get(itemId, saveId)
      : undefined;
    if (!item) throw new Error(`No item ${itemId} in this inventory.`);
    if (item.name !== null) throw new Error(`Item ${itemId} already has a name: ${item.name}.`);
    db.prepare('UPDATE inventory_items SET name = ? WHERE id = ?').run(clean, itemId);
    return { id: itemId, name: clean };
  });
}
