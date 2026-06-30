// render.js — all canvas drawing. Stateless: every function takes ctx + data.

import { drawSprite } from './sprite.js';

// Castle palette.
const FLOOR_GROUT = '#221d29';
const FLOOR_A = '#3f3947';
const FLOOR_B = '#453e4e';
const BRICK = '#4b4552';
const BRICK_HI = '#5a5462';
const BRICK_LO = '#37323f';
const MORTAR = '#262230';
const PASSAGE = '#171019';

// Deterministic 0..1 hash for stable per-tile/brick variation (no per-frame flicker).
function hash(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

export function clear(ctx, w, h) {
  ctx.fillStyle = '#0f0b14';
  ctx.fillRect(0, 0, w, h);
}

/** Draw the current room with a castle look: flagstone floor, stone walls, torches. */
export function drawRoom(ctx, room, neighbors, cleared, tick = 0) {
  drawFlagstone(ctx, room);
  drawWalls(ctx, room);
  drawDoors(ctx, room, neighbors, cleared);
  drawTorches(ctx, room, tick);
}

function drawFlagstone(ctx, room) {
  const w = room.x1 - room.x0, h = room.y1 - room.y0;
  ctx.fillStyle = FLOOR_GROUT;
  ctx.fillRect(room.x0, room.y0, w, h);
  const tile = 52;
  for (let ty = 0; ty * tile < h; ty++) {
    for (let tx = 0; tx * tile < w; tx++) {
      const px = room.x0 + tx * tile, py = room.y0 + ty * tile;
      const tw = Math.min(tile, room.x1 - px) - 2;
      const th = Math.min(tile, room.y1 - py) - 2;
      if (tw <= 0 || th <= 0) continue;
      const r = hash(tx, ty);
      ctx.fillStyle = r > 0.5 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(px + 1, py + 1, tw, th);
      // subtle bevel
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(px + 1, py + 1, tw, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(px + 1, py + th - 1, tw, 2);
    }
  }
}

function drawWalls(ctx, room) {
  const t = room.wall;
  brickStrip(ctx, room.x0 - t, room.y0 - t, room.x1 - room.x0 + 2 * t, t, 'h'); // top
  brickStrip(ctx, room.x0 - t, room.y1, room.x1 - room.x0 + 2 * t, t, 'h');     // bottom
  brickStrip(ctx, room.x0 - t, room.y0 - t, t, room.y1 - room.y0 + 2 * t, 'v'); // left
  brickStrip(ctx, room.x1, room.y0 - t, t, room.y1 - room.y0 + 2 * t, 'v');     // right
}

// Tile a wall strip with offset stone blocks, mortar lines and bevels.
function brickStrip(ctx, x, y, w, h, axis) {
  ctx.fillStyle = MORTAR;
  ctx.fillRect(x, y, w, h);
  const bw = 34, bh = axis === 'h' ? h : 22;
  if (axis === 'h') {
    const rows = Math.max(1, Math.round(h / bh));
    for (let ry = 0; ry < rows; ry++) {
      const offset = (ry % 2) * (bw / 2);
      for (let bx = x - offset; bx < x + w; bx += bw) {
        block(ctx, bx + 1, y + ry * (h / rows) + 1, bw - 2, h / rows - 2, hash(Math.round(bx), ry));
      }
    }
  } else {
    let col = 0;
    for (let by = y; by < y + h; by += bh, col++) {
      const offset = (col % 2) * (bh / 2);
      block(ctx, x + 1, by + 1 - (col % 2 ? 0 : 0), w - 2, bh - 2, hash(col, Math.round(by)));
      // note: vertical walls keep simple stacked blocks for clarity
      void offset;
    }
  }
}

function block(ctx, x, y, w, h, r) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = r > 0.7 ? BRICK_HI : r < 0.25 ? BRICK_LO : BRICK;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(x, y + h - 2, w, 2);
}

function drawDoors(ctx, room, neighbors, cleared) {
  const t = room.wall;
  const cx = (room.x0 + room.x1) / 2, cy = (room.y0 + room.y1) / 2;
  const hh = room.doorHalf;
  if (neighbors.up) doorway(ctx, cx - hh, room.y0 - t, 2 * hh, t, cleared, 'h');
  if (neighbors.down) doorway(ctx, cx - hh, room.y1, 2 * hh, t, cleared, 'h');
  if (neighbors.left) doorway(ctx, room.x0 - t, cy - hh, t, 2 * hh, cleared, 'v');
  if (neighbors.right) doorway(ctx, room.x1, cy - hh, t, 2 * hh, cleared, 'v');
}

function doorway(ctx, x, y, w, h, cleared, axis) {
  // Dark passage through the wall.
  ctx.fillStyle = PASSAGE;
  ctx.fillRect(x, y, w, h);
  if (cleared) {
    // warm threshold glow
    ctx.fillStyle = 'rgba(220,150,70,0.18)';
    ctx.fillRect(x, y, w, h);
  } else {
    // closed: iron portcullis bars
    ctx.fillStyle = '#5a5560';
    if (axis === 'h') {
      for (let bx = x + 4; bx < x + w - 2; bx += 8) ctx.fillRect(bx, y, 3, h);
    } else {
      for (let by = y + 4; by < y + h - 2; by += 8) ctx.fillRect(x, by, w, 3);
    }
  }
}

function drawTorches(ctx, room, tick) {
  const cy = (room.y0 + room.y1) / 2;
  torch(ctx, room.x0 + 6, cy - 70, tick);
  torch(ctx, room.x1 - 6, cy + 70, tick + 30);
  torch(ctx, room.x0 + 6, cy + 70, tick + 60);
  torch(ctx, room.x1 - 6, cy - 70, tick + 90);
}

function torch(ctx, x, y, tick) {
  const flick = 0.7 + 0.3 * Math.sin(tick * 0.3) + 0.1 * Math.sin(tick * 0.7);
  // glow
  const g = ctx.createRadialGradient(x, y, 2, x, y, 46 * flick);
  g.addColorStop(0, 'rgba(255,180,80,0.35)');
  g.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, 46 * flick, 0, Math.PI * 2); ctx.fill();
  // bracket
  ctx.fillStyle = '#2a2330';
  ctx.fillRect(x - 2, y, 4, 12);
  // flame
  ctx.fillStyle = '#ffcf5a';
  ctx.beginPath(); ctx.ellipse(x, y - 4, 4 * flick, 8 * flick, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff7a2a';
  ctx.beginPath(); ctx.ellipse(x, y - 2, 2.5 * flick, 5 * flick, 0, 0, Math.PI * 2); ctx.fill();
}

/** Draw an entity: its pixel sprite if it has one, else a colored blob. */
export function drawEntity(ctx, e, isPlayer) {
  const hidden = e.iframes > 0 && Math.floor(e.iframes / 4) % 2 === 0;
  if (!hidden) {
    // Sprite spans the entity diameter (+ a little so it reads at small sizes).
    if (!drawSprite(ctx, e.sprite, e.x, e.y, e.radius * 2.2)) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(e.x - e.radius * 0.3, e.y - e.radius * 0.15, 2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + e.radius * 0.3, e.y - e.radius * 0.15, 2, 0, 7); ctx.fill();
    }
  }
  if (!isPlayer && e.health < e.maxHealth) {
    const w = e.radius * 2;
    const ratio = Math.max(0, e.health / e.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, w, 4);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, w * ratio, 4);
  }
}

export function drawProjectile(ctx, p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
}

/** Draw a damaging ground trail (electric / blood / poison styles). */
export function drawTrail(ctx, segments, trail, tick) {
  if (!trail || !segments || !segments.length) return;
  const w = trail.width || 14;
  for (const s of segments) {
    const a = Math.max(0, s.life / (s.maxLife || 1));
    if (trail.style === 'electric') {
      ctx.globalAlpha = a;
      ctx.strokeStyle = trail.color; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - w, s.y);
      for (let i = 1; i <= 4; i++) {
        const nx = s.x - w + (2 * w) * (i / 4);
        const ny = s.y + Math.sin(tick * 0.4 + i * 2 + s.x) * w * 0.45;
        ctx.lineTo(nx, ny);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.7 * a; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (trail.style === 'poison') {
      ctx.globalAlpha = 0.45 * a; ctx.fillStyle = trail.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, w, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6 * a; ctx.fillStyle = '#d8ffcf';
      const b = (tick * 0.4 + s.x) % 12;
      ctx.beginPath(); ctx.arc(s.x + Math.sin(s.x) * 4, s.y - b, 2, 0, Math.PI * 2); ctx.fill();
    } else { // blood
      ctx.globalAlpha = 0.55 * a; ctx.fillStyle = trail.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, w, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.3 * a; ctx.fillStyle = '#3a0a0a';
      ctx.beginPath(); ctx.arc(s.x, s.y, w * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Draw a world pickup (item-on-pedestal / heart / bomb / key) with a gentle bob. */
export function drawPickup(ctx, pk, t) {
  const bob = Math.sin(t / 18 + pk.x) * 3;
  const y = pk.y + bob;
  const rad = pk.radius || 13;
  if (pk.kind === 'item') {
    ctx.fillStyle = '#3a3145';
    ctx.fillRect(pk.x - rad, pk.y + rad - 2, rad * 2, 6);
    ctx.fillStyle = 'rgba(255,255,200,0.10)';
    ctx.beginPath(); ctx.arc(pk.x, y, rad * 1.4, 0, Math.PI * 2); ctx.fill();
    if (!drawSprite(ctx, pk.sprite, pk.x, y, rad * 2.2)) {
      ctx.beginPath(); ctx.arc(pk.x, y, rad * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = pk.color || '#dd5'; ctx.fill();
    }
  } else if (pk.kind === 'bomb') {
    drawBombIcon(ctx, pk.x, y, rad * 0.75);
  } else if (pk.kind === 'key') {
    drawKeyIcon(ctx, pk.x, y, rad / 11);
  } else {
    drawHeart(ctx, pk.x, y, 'full', rad / 12);
  }
}

/** A rock obstacle — a mossy stone block to fit the castle. */
export function drawRock(ctx, rk) {
  ctx.fillStyle = '#39343f';
  ctx.fillRect(rk.x, rk.y, rk.w, rk.h);
  ctx.fillStyle = '#564f60';
  ctx.fillRect(rk.x + 2, rk.y + 2, rk.w - 4, rk.h - 6);
  // top highlight + bottom shadow (carved-block look)
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(rk.x + 4, rk.y + 4, rk.w - 8, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(rk.x + 2, rk.y + rk.h - 5, rk.w - 4, 3);
  // a bit of moss
  ctx.fillStyle = 'rgba(110,150,80,0.45)';
  ctx.fillRect(rk.x + 3, rk.y + 3, Math.max(4, rk.w * 0.28), 3);
  ctx.fillRect(rk.x + rk.w * 0.55, rk.y + rk.h - 7, Math.max(4, rk.w * 0.3), 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rk.x + 0.5, rk.y + 0.5, rk.w - 1, rk.h - 1);
}

/** A treasure chest (locked = gold). */
export function drawChest(ctx, chest, t) {
  const w = 30, h = 24;
  const x = chest.x - w / 2, y = chest.y - h / 2;
  const base = chest.locked ? '#caa72e' : '#8a5a2b';
  const lid = chest.locked ? '#e0c33e' : '#a8702f';
  if (chest.opened) {
    ctx.fillStyle = '#2a2030';
    ctx.fillRect(x, y + 6, w, h - 6);
    return;
  }
  ctx.fillStyle = base;
  ctx.fillRect(x, y + 8, w, h - 8);
  ctx.fillStyle = lid;
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(chest.x - 3, y + 6, 6, 8); // latch
  if (chest.locked) {
    const pulse = 0.5 + 0.5 * Math.sin(t / 14);
    ctx.fillStyle = `rgba(255,240,150,${0.3 + 0.4 * pulse})`;
    ctx.fillRect(chest.x - 2, y + 7, 4, 5);
  }
}

/** A live bomb with a flashing fuse. */
export function drawBomb(ctx, b) {
  const flash = b.fuse < 30 && Math.floor(b.fuse / 5) % 2 === 0;
  drawBombIcon(ctx, b.x, b.y, 9, flash);
}

/** An explosion flash, fading over its life. */
export function drawExplosion(ctx, ex) {
  const p = ex.life / ex.maxLife;
  ctx.globalAlpha = Math.max(0, p);
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, ex.radius * (1.1 - p * 0.3), 0, Math.PI * 2);
  ctx.fillStyle = '#ffd27a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, ex.radius * (0.7 - p * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = '#ff7a3a';
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBombIcon(ctx, x, y, r, flash) {
  ctx.beginPath(); ctx.arc(x, y + 1, r, 0, Math.PI * 2);
  ctx.fillStyle = flash ? '#ff5a4a' : '#23202a'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + 3, y - r - 5); ctx.stroke();
  ctx.fillStyle = '#ffcf5a';
  ctx.beginPath(); ctx.arc(x + 3, y - r - 6, 2, 0, Math.PI * 2); ctx.fill();
}

function drawKeyIcon(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.strokeStyle = '#e0c33e'; ctx.fillStyle = '#e0c33e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-4, -3, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(5, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, 5); ctx.lineTo(6, 5); ctx.stroke();
  ctx.restore();
}

/** Bomb + key counters for the HUD (enlarged for legibility). */
export function drawResources(ctx, player, x, y) {
  drawBombIcon(ctx, x + 9, y, 10);
  ctx.fillStyle = '#e8def2'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`×${player.bombs}`, x + 22, y + 6);
  drawKeyIcon(ctx, x + 96, y, 1.5);
  ctx.fillText(`×${player.keys}`, x + 110, y + 6);
}

/** Hearts HUD (half-heart granularity). `scale` enlarges the whole row. */
export function drawHearts(ctx, player, x, y, scale = 1.3) {
  const containers = Math.ceil(player.maxHealth / 2);
  const step = 24 * scale;
  for (let i = 0; i < containers; i++) {
    const filled = player.health - i * 2; // 2, 1, or <=0
    drawHeart(ctx, x + 10 * scale + i * step, y, filled >= 2 ? 'full' : filled === 1 ? 'half' : 'empty', scale);
  }
}
export function heartsWidth(player, scale = 1.3) {
  return Math.ceil(player.maxHealth / 2) * 24 * scale + 12 * scale;
}

function drawHeart(ctx, x, y, state, scale = 1) {
  const empty = '#3a2f3f';
  const red = '#e74c3c';
  ctx.save();
  ctx.translate(x, y);
  if (scale !== 1) ctx.scale(scale, scale);
  // left + right lobes + bottom point, drawn as two circles + triangle
  const paint = (color, clipHalf) => {
    ctx.fillStyle = color;
    if (clipHalf) { ctx.beginPath(); ctx.rect(-10, -10, 10, 20); ctx.clip(); }
    ctx.beginPath();
    ctx.arc(-5, -3, 5, 0, Math.PI * 2);
    ctx.arc(5, -3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9.5, -1); ctx.lineTo(9.5, -1); ctx.lineTo(0, 11); ctx.closePath();
    ctx.fill();
  };
  const reset = () => { ctx.restore(); ctx.save(); ctx.translate(x, y); if (scale !== 1) ctx.scale(scale, scale); };
  paint(empty, false);
  if (state === 'full') { reset(); paint(red, false); }
  else if (state === 'half') { reset(); paint(red, true); }
  ctx.restore();
}

/** Minimap of the floor in the top-right corner. */
export function drawMinimap(ctx, floor, roomState, currentKey, originX, originY) {
  const cell = 12;
  const gap = 2;
  for (const [k, room] of floor.rooms) {
    const visited = roomState.get(k)?.visited;
    const known = visited || isAdjacentToVisited(floor, roomState, k);
    if (!known) continue;
    const px = originX + room.x * (cell + gap);
    const py = originY + room.y * (cell + gap);
    let color = '#5a4f64';
    if (room.type === 'boss') color = visited ? '#b84a5a' : '#7a3a44';
    else if (room.type === 'treasure') color = visited ? '#c8b04a' : '#7a6a2a';
    else if (room.type === 'start') color = '#4a7a5a';
    else if (visited) color = '#8a7f94';
    ctx.fillStyle = color;
    ctx.fillRect(px, py, cell, cell);
    if (k === currentKey) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 1, py - 1, cell + 2, cell + 2);
    }
  }
}

function isAdjacentToVisited(floor, roomState, k) {
  const room = floor.rooms.get(k);
  return Object.values(room.neighbors).some((nk) => roomState.get(nk)?.visited);
}

/** Centered overlay text (start/dead/cleared screens). */
export function drawCenterText(ctx, w, h, lines) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  let y = h / 2 - (lines.length - 1) * 18;
  for (const line of lines) {
    ctx.fillStyle = line.color || '#ffffff';
    ctx.font = line.font || '20px monospace';
    ctx.fillText(line.text, w / 2, y);
    y += line.gap || 36;
  }
  ctx.textAlign = 'left';
}
