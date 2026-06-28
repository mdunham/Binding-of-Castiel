// combat.js — PURE geometry/combat helpers (no DOM), unit-testable.

/** Circle/circle overlap test. */
export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

/** Clamp a circle of radius r to stay inside an axis-aligned rect [x0,y0,x1,y1]. */
export function clampToRect(px, py, r, x0, y0, x1, y1) {
  return {
    x: Math.max(x0 + r, Math.min(x1 - r, px)),
    y: Math.max(y0 + r, Math.min(y1 - r, py)),
  };
}

/** Unit vector from (ax,ay) toward (bx,by). Returns {x:0,y:0} if coincident. */
export function unitToward(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/**
 * Is a point within an open door gap on a given wall?
 * Doors are centered on each wall. `half` is half the gap width.
 */
export function inDoorGap(px, py, dir, room) {
  const cx = (room.x0 + room.x1) / 2;
  const cy = (room.y0 + room.y1) / 2;
  const half = room.doorHalf;
  const tol = room.doorDepth; // how close to the wall counts as "in the doorway"
  switch (dir) {
    case 'up': return Math.abs(px - cx) < half && py < room.y0 + tol;
    case 'down': return Math.abs(px - cx) < half && py > room.y1 - tol;
    case 'left': return Math.abs(py - cy) < half && px < room.x0 + tol;
    case 'right': return Math.abs(py - cy) < half && px > room.x1 - tol;
    default: return false;
  }
}

/** Apply damage to a health-bearing entity; returns true if it died. */
export function applyDamage(entity, amount) {
  entity.health -= amount;
  return entity.health <= 0;
}
