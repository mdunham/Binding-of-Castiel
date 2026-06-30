// items.js — PURE item/stat logic. No DOM. Unit-testable.
// Items apply additive deltas to a player's stat modifiers ("mods"). Weapon-derived
// values are computed from base weapon + mods at fire time so pickups stack cleanly.

import { TUNING } from './config.js';

export const MOD_KEYS = [
  'damage', 'fireRate', 'moveSpeed', 'shotCount', 'projectileSpeed', 'range', 'spread',
  'damageMult', 'piercing', 'homing', 'luck',
];
// One-time resource grants applied at pickup (not accumulated as mods).
const GRANT_KEYS = ['bombs', 'keys'];

/** Fresh zeroed modifier set for a new player. */
export function emptyMods() {
  const m = {};
  for (const k of MOD_KEYS) m[k] = 0;
  return m;
}

/**
 * Apply an item's effects to a player entity (mutates). Returns the item id.
 * maxHealth is special: it raises the cap AND heals by the same amount.
 */
export function applyItem(player, item) {
  const e = item.effects || {};
  for (const k of MOD_KEYS) {
    if (typeof e[k] === 'number') player.mods[k] += e[k];
  }
  if (typeof e.maxHealth === 'number') {
    player.maxHealth += e.maxHealth;
    player.health = Math.min(player.maxHealth, player.health + e.maxHealth);
  }
  for (const k of GRANT_KEYS) {
    if (typeof e[k] === 'number') player[k] = (player[k] || 0) + e[k];
  }
  player.items.push(item.id);
  return item.id;
}

/** Effective move speed after item mods + global tuning (never below a floor). */
export function effectiveMoveSpeed(player) {
  return Math.max(0.4, player.def.moveSpeed * TUNING.speedMult + player.mods.moveSpeed);
}

/** Effective weapon (base weapon merged with mods) for firing. Null if unarmed. */
export function effectiveWeapon(player) {
  const w = player.weapon;
  if (!w) return null;
  const m = player.mods;
  return {
    ...w,
    damage: Math.max(0.1, (w.damage + m.damage) * (1 + (m.damageMult || 0))),
    fireRate: Math.max(0.2, w.fireRate + m.fireRate),
    projectileSpeed: Math.max(1, w.projectileSpeed + m.projectileSpeed),
    range: Math.max(5, w.range + m.range),
    spread: Math.max(0, w.spread + m.spread),
    shotCount: Math.max(1, Math.round(w.shotCount + m.shotCount)),
    piercing: !!w.piercing || m.piercing > 0,
    homing: (w.homing ? 1 : 0) + (m.homing || 0) > 0,
  };
}

/** Drop chance bonus from the luck mod. */
export function luckBonus(player) {
  return Math.min(0.45, (player.mods.luck || 0) * 0.08);
}
