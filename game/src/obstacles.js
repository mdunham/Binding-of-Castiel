// obstacles.js — PURE per-room rock layout generation (no DOM). Deterministic
// given a seeded rng. Keeps a clear center cross so doors stay reachable.

const COLS = 12;
const ROWS = 6;
// Center cells kept clear (door lanes): cols 5-6 and rows 2-3 of a 12x6 grid.
const CLEAR_COLS = new Set([5, 6]);
const CLEAR_ROWS = new Set([2, 3]);

// Template predicates: given (col,row,rng) return true to place a rock.
const TEMPLATES = {
  pillars: (c, r) => c % 3 === 1 && r % 2 === 1,
  corners: (c, r) => (c < 2 || c >= COLS - 2) && (r < 2 || r >= ROWS - 2),
  diamond: (c, r) => {
    const d = Math.abs(c - 5.5) + Math.abs(r - 2.5);
    return d >= 4 && d <= 5;
  },
  scatter: (c, r, rng) => rng() < 0.18,
  rows: (c, r) => r % 3 === 1 && c % 2 === 0,
};
const TEMPLATE_KEYS = Object.keys(TEMPLATES);

/**
 * Generate rock rectangles for a room.
 * @param {() => number} rng
 * @param {string} roomType  'start'|'normal'|'treasure'|'boss'
 * @param {{x0,y0,x1,y1}} geo  play-area bounds
 * @returns {{x,y,w,h}[]}  axis-aligned rock rectangles
 */
export function generateObstacles(rng, roomType, geo) {
  if (roomType === 'start' || roomType === 'boss') return [];
  const margin = 46;
  const ix0 = geo.x0 + margin, iy0 = geo.y0 + margin;
  const cw = (geo.x1 - margin - ix0) / COLS;
  const ch = (geo.y1 - margin - iy0) / ROWS;
  // Treasure rooms get a sparse frame so the chest stays accessible.
  const template = roomType === 'treasure'
    ? TEMPLATES.corners
    : TEMPLATES[TEMPLATE_KEYS[Math.floor(rng() * TEMPLATE_KEYS.length)]];

  const pad = 6;
  const rocks = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (CLEAR_COLS.has(c) || CLEAR_ROWS.has(r)) continue;
      if (!template(c, r, rng)) continue;
      rocks.push({ x: ix0 + c * cw + pad, y: iy0 + r * ch + pad, w: cw - 2 * pad, h: ch - 2 * pad });
    }
  }
  return rocks;
}

/** A clear spawn point not overlapping any rock (falls back to center). */
export function clearPoint(rng, geo, rocks, radius) {
  const cx = (geo.x0 + geo.x1) / 2, cy = (geo.y0 + geo.y1) / 2;
  for (let tries = 0; tries < 24; tries++) {
    const x = geo.x0 + 60 + rng() * (geo.x1 - geo.x0 - 120);
    const y = geo.y0 + 60 + rng() * (geo.y1 - geo.y0 - 120);
    if (!rocks.some((rk) => x > rk.x - radius && x < rk.x + rk.w + radius
      && y > rk.y - radius && y < rk.y + rk.h + radius)) {
      return { x, y };
    }
  }
  return { x: cx, y: cy };
}
