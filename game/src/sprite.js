// sprite.js — parse the editor's {palette, rows} sprite format and draw it.
// parseSprite() is pure (no DOM) so it can be unit-tested.

const PALCHARS = '123456789abcdefghijklmnopqrstuvwxyz';

function charToIndex(ch) {
  const i = PALCHARS.indexOf(ch);
  return i; // -1 if not found
}

/**
 * Parse a sprite into a flat cell list.
 * @returns {{ w:number, h:number, cells:{x:number,y:number,color:string}[] } | null}
 */
export function parseSprite(sprite) {
  if (!sprite || !Array.isArray(sprite.rows) || !Array.isArray(sprite.palette)) return null;
  const rows = sprite.rows;
  const h = rows.length;
  const w = h ? rows[0].length : 0;
  if (!w || !h) return null;
  const cells = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ' || !ch) continue;
      const idx = charToIndex(ch);
      const color = sprite.palette[idx];
      if (color) cells.push({ x, y, color });
    }
  }
  return { w, h, cells };
}

/** Memoized parse: cache the parsed result on the sprite object. */
export function getParsed(sprite) {
  if (!sprite) return null;
  if (!sprite.__parsed) sprite.__parsed = parseSprite(sprite);
  return sprite.__parsed;
}

/**
 * Draw a sprite centered at (cx,cy), scaled so it spans `diameter` pixels.
 * Returns false if there was no drawable sprite (caller can fall back to a blob).
 */
export function drawSprite(ctx, sprite, cx, cy, diameter) {
  const parsed = getParsed(sprite);
  if (!parsed || parsed.cells.length === 0) return false;
  const px = diameter / parsed.w;
  const ox = cx - (parsed.w * px) / 2;
  const oy = cy - (parsed.h * px) / 2;
  const cell = Math.ceil(px) + 0.5; // slight overlap to avoid seams
  for (const c of parsed.cells) {
    ctx.fillStyle = c.color;
    ctx.fillRect(ox + c.x * px, oy + c.y * px, cell, cell);
  }
  return true;
}
