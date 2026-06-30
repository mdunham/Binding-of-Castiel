// weapons.js — turn a weapon def + aim direction into projectile objects.

import { TUNING } from './config.js';

/**
 * Create projectiles for one shot.
 * @param {object} weapon  weapon def from content.json
 * @param {number} x,y     origin
 * @param {{x:number,y:number}} dir  normalized aim direction
 * @param {'player'|'enemy'} team  who fired it
 * @returns {Projectile[]}
 */
export function fireWeapon(weapon, x, y, dir, team) {
  const baseAngle = Math.atan2(dir.y, dir.x);
  const count = Math.max(1, weapon.shotCount | 0);
  const spreadRad = (weapon.spread || 0) * (Math.PI / 180);
  const speed = weapon.projectileSpeed * TUNING.projectileSpeedMult;
  const size = weapon.projectileSize * TUNING.projectileSizeMult;
  const shots = [];
  // Center the spread fan around the aim angle.
  const start = baseAngle - (spreadRad * (count - 1)) / 2;
  for (let i = 0; i < count; i++) {
    const a = start + spreadRad * i;
    shots.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      radius: size,
      damage: weapon.damage,
      color: weapon.color,
      life: weapon.range,           // frames remaining
      piercing: !!weapon.piercing,
      homing: !!weapon.homing,
      team,
      dead: false,
    });
  }
  return shots;
}

/** Frames between shots for a given fire rate (shots/sec) at 60fps, tuning-scaled. */
export function cooldownFrames(weapon) {
  const rate = Math.max(0.1, weapon.fireRate) * TUNING.fireRateMult;
  return Math.max(1, Math.round(60 / rate));
}
