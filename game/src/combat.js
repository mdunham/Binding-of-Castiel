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
export function inDoorGap(px, py, dir, room, radius = 0) {
  const cx = (room.x0 + room.x1) / 2;
  const cy = (room.y0 + room.y1) / 2;
  const half = room.doorHalf;
  // A clamped circle's center only reaches `wall - radius`, so the doorway
  // tolerance must include the radius or large characters can never trigger it.
  const tol = room.doorDepth + radius;
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

/** Is a point inside an axis-aligned rect {x,y,w,h}? */
export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** Does a circle overlap an axis-aligned rect? */
export function circleIntersectsRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * Push a circle out of a single rect along the smallest axis of penetration.
 * Returns the adjusted {x,y} (unchanged if not overlapping).
 */
export function resolveCircleRect(cx, cy, r, rect) {
  if (!circleIntersectsRect(cx, cy, r, rect)) return { x: cx, y: cy };
  const cxClamp = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const cyClamp = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - cxClamp, dy = cy - cyClamp;
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-6) {
    // Outside the rect's edge: push straight out along the contact normal.
    const push = r - dist;
    return { x: cx + (dx / dist) * push, y: cy + (dy / dist) * push };
  }
  // Center is inside the rect: eject along the nearest edge.
  const left = cx - rect.x, right = rect.x + rect.w - cx;
  const top = cy - rect.y, bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: cy };
  if (m === right) return { x: rect.x + rect.w + r, y: cy };
  if (m === top) return { x: cx, y: rect.y - r };
  return { x: cx, y: rect.y + rect.h + r };
}

/** Resolve a circle against a list of rects (a couple of passes for stability). */
export function resolveCircleRects(cx, cy, r, rects) {
  let x = cx, y = cy;
  for (let pass = 0; pass < 2; pass++) {
    for (const rect of rects) {
      const out = resolveCircleRect(x, y, r, rect);
      x = out.x; y = out.y;
    }
  }
  return { x, y };
}
