// gen-sprites.mjs — bake default 16x16 pixel sprites into content.json for any
// character/weapon/item that doesn't already have one. Run: node tools/gen-sprites.mjs
// The sprite format matches the in-app pixel editor:
//   sprite = { palette: ["#hex", ...], rows: [ "16 chars", ... x16 ] }
//   row chars: '.' = transparent; '1'-'9','a'-'z' = palette index (1-based)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PALCHARS = '123456789abcdefghijklmnopqrstuvwxyz';
const SIZE = 16;

function lighten(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function setIf(grid, x, y, ch) {
  if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y][x] = ch;
}

// Build a round blob sprite. palette: 1=body, 2=dark(eyes), 3=highlight.
function blobSprite(color, { r = 6.5, eyes = false, shine = true } = {}) {
  const cx = 7.5, cy = 7.5;
  const palette = [color, '#161018', lighten(color, 0.45)];
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) grid[y][x] = '1';
    }
  }
  if (shine) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (grid[y][x] === '1' && Math.hypot(x - (cx - 2), y - (cy - 2)) <= r * 0.33) {
          grid[y][x] = '3';
        }
      }
    }
  }
  if (eyes) {
    const ey = Math.round(cy - 0.5);
    for (const dx of [-3, 2]) {
      setIf(grid, Math.round(cx + dx), ey, '2');
      setIf(grid, Math.round(cx + dx), ey + 1, '2');
    }
  }
  return { palette, rows: grid.map((row) => row.join('')) };
}

const path = fileURLToPath(new URL('../content.json', import.meta.url));
const data = JSON.parse(await readFile(path, 'utf8'));
data.items = data.items || [];

let added = 0;
for (const c of data.characters) {
  if (!c.sprite) {
    const r = c.role === 'boss' ? 7.6 : c.size > 13 ? 7 : 6.4;
    c.sprite = blobSprite(c.color, { r, eyes: true });
    added++;
  }
}
for (const w of data.weapons) {
  if (!w.sprite) { w.sprite = blobSprite(w.color, { r: 4.6, eyes: false }); added++; }
}
for (const it of data.items) {
  if (!it.sprite) { it.sprite = blobSprite(it.color, { r: 6, eyes: false }); added++; }
}

await writeFile(path, JSON.stringify(data, null, 2) + '\n');
console.log(`Baked ${added} default sprites into content.json`);
