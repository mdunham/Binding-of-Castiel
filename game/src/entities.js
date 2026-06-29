// entities.js — spawn player/enemy entities from character defs and run enemy AI.

import { unitToward } from './combat.js';
import { fireWeapon, cooldownFrames } from './weapons.js';
import { emptyMods } from './items.js';

let nextId = 1;

/** Spawn an entity instance from a character def. */
export function spawnEntity(def, x, y, weapons) {
  const weapon = def.weaponId ? weapons.get(def.weaponId) : null;
  return {
    eid: nextId++,
    def,
    x, y,
    radius: def.size,
    color: def.color,
    sprite: def.sprite || null,
    health: def.maxHealth,
    maxHealth: def.maxHealth,
    moveSpeed: def.moveSpeed,
    role: def.role,
    ai: def.ai || null,
    contactDamage: def.contactDamage || 0,
    weapon,
    cooldown: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    iframes: 0,
    dead: false,
    // Player-only run state (harmless on enemies):
    mods: emptyMods(),
    items: [],
    bombs: 1,
    keys: 0,
  };
}

/**
 * Advance one enemy by its AI for a frame. Pushes any fired projectiles into `out`.
 * @param {object} e enemy entity
 * @param {object} player player entity
 * @param {Projectile[]} out  projectile sink
 * @param {object} room  current room bounds (for wander clamping is handled by caller)
 */
export function stepEnemy(e, player, out) {
  if (e.cooldown > 0) e.cooldown--;
  if (e.iframes > 0) e.iframes--;

  switch (e.ai) {
    case 'chase': {
      const u = unitToward(e.x, e.y, player.x, player.y);
      e.x += u.x * e.moveSpeed;
      e.y += u.y * e.moveSpeed;
      break;
    }
    case 'wander': {
      // Occasionally pick a new heading; drift around the room.
      if (Math.random() < 0.02) e.wanderAngle = Math.random() * Math.PI * 2;
      e.x += Math.cos(e.wanderAngle) * e.moveSpeed;
      e.y += Math.sin(e.wanderAngle) * e.moveSpeed;
      break;
    }
    case 'shooter': {
      // Keep some distance, then fire at the player on cooldown.
      const dist = Math.hypot(player.x - e.x, player.y - e.y);
      const u = unitToward(e.x, e.y, player.x, player.y);
      const desired = 180;
      if (dist > desired + 30) { e.x += u.x * e.moveSpeed; e.y += u.y * e.moveSpeed; }
      else if (dist < desired - 30) { e.x -= u.x * e.moveSpeed; e.y -= u.y * e.moveSpeed; }
      if (e.weapon && e.cooldown === 0) {
        out.push(...fireWeapon(e.weapon, e.x, e.y, u, 'enemy'));
        e.cooldown = cooldownFrames(e.weapon);
      }
      break;
    }
    default:
      break;
  }
}
