// weapons.js — turn a weapon def + aim direction into projectile objects.

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
  const shots = [];
  // Center the spread fan around the aim angle.
  const start = baseAngle - (spreadRad * (count - 1)) / 2;
  for (let i = 0; i < count; i++) {
    const a = start + spreadRad * i;
    shots.push({
      x, y,
      vx: Math.cos(a) * weapon.projectileSpeed,
      vy: Math.sin(a) * weapon.projectileSpeed,
      radius: weapon.projectileSize,
      damage: weapon.damage,
      color: weapon.color,
      life: weapon.range,           // frames remaining
      piercing: !!weapon.piercing,
      team,
      dead: false,
    });
  }
  return shots;
}

/** Frames between shots for a given fire rate (shots/sec) at 60fps. */
export function cooldownFrames(weapon) {
  return Math.max(1, Math.round(60 / Math.max(0.1, weapon.fireRate)));
}
