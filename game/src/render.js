// render.js — all canvas drawing. Stateless: every function takes ctx + data.

import { drawSprite } from './sprite.js';

const WALL = '#2b2330';
const FLOOR_COLOR = '#4a3f55';
const DOOR_OPEN = '#7a6a55';
const DOOR_LOCKED = '#1c1620';

export function clear(ctx, w, h) {
  ctx.fillStyle = '#15101a';
  ctx.fillRect(0, 0, w, h);
}

/** Draw the current room: floor, wall border, and door gaps. */
export function drawRoom(ctx, room, neighbors, cleared) {
  // Floor
  ctx.fillStyle = FLOOR_COLOR;
  ctx.fillRect(room.x0, room.y0, room.x1 - room.x0, room.y1 - room.y0);

  // Walls (thick border drawn as four rects so door gaps can punch through)
  const t = room.wall;
  ctx.fillStyle = WALL;
  ctx.fillRect(room.x0 - t, room.y0 - t, room.x1 - room.x0 + 2 * t, t); // top
  ctx.fillRect(room.x0 - t, room.y1, room.x1 - room.x0 + 2 * t, t);     // bottom
  ctx.fillRect(room.x0 - t, room.y0 - t, t, room.y1 - room.y0 + 2 * t); // left
  ctx.fillRect(room.x1, room.y0 - t, t, room.y1 - room.y0 + 2 * t);     // right

  // Doors
  const cx = (room.x0 + room.x1) / 2;
  const cy = (room.y0 + room.y1) / 2;
  const h = room.doorHalf;
  const color = cleared ? DOOR_OPEN : DOOR_LOCKED;
  if (neighbors.up) doorRect(ctx, cx - h, room.y0 - t, 2 * h, t, color);
  if (neighbors.down) doorRect(ctx, cx - h, room.y1, 2 * h, t, color);
  if (neighbors.left) doorRect(ctx, room.x0 - t, cy - h, t, 2 * h, color);
  if (neighbors.right) doorRect(ctx, room.x1, cy - h, t, 2 * h, color);
}

function doorRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
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

/** Draw a world pickup (item-on-pedestal / heart / bomb / key) with a gentle bob. */
export function drawPickup(ctx, pk, t) {
  const bob = Math.sin(t / 18 + pk.x) * 3;
  const y = pk.y + bob;
  if (pk.kind === 'item') {
    ctx.fillStyle = '#3a3145';
    ctx.fillRect(pk.x - 12, pk.y + 12, 24, 6);
    ctx.fillStyle = 'rgba(255,255,200,0.10)';
    ctx.beginPath(); ctx.arc(pk.x, y, 18, 0, Math.PI * 2); ctx.fill();
    if (!drawSprite(ctx, pk.sprite, pk.x, y, 26)) {
      ctx.beginPath(); ctx.arc(pk.x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = pk.color || '#dd5'; ctx.fill();
    }
  } else if (pk.kind === 'bomb') {
    drawBombIcon(ctx, pk.x, y, 8);
  } else if (pk.kind === 'key') {
    drawKeyIcon(ctx, pk.x, y, 1);
  } else {
    drawHeart(ctx, pk.x, y, 'full', 0.9);
  }
}

/** A rock obstacle (rect). */
export function drawRock(ctx, rk) {
  ctx.fillStyle = '#4a4150';
  ctx.fillRect(rk.x, rk.y, rk.w, rk.h);
  ctx.fillStyle = '#5a5060';
  ctx.fillRect(rk.x + 3, rk.y + 3, rk.w - 6, rk.h - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(rk.x + 5, rk.y + 5, rk.w - 10, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
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

/** Bomb + key counters for the HUD. */
export function drawResources(ctx, player, x, y) {
  drawBombIcon(ctx, x + 6, y, 7);
  ctx.fillStyle = '#e0d6ea'; ctx.font = '14px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`× ${player.bombs}`, x + 16, y + 5);
  drawKeyIcon(ctx, x + 70, y, 1);
  ctx.fillText(`× ${player.keys}`, x + 82, y + 5);
}

/** Hearts HUD (half-heart granularity). */
export function drawHearts(ctx, player, x, y) {
  const containers = Math.ceil(player.maxHealth / 2);
  for (let i = 0; i < containers; i++) {
    const filled = player.health - i * 2; // 2, 1, or <=0
    drawHeart(ctx, x + i * 26, y, filled >= 2 ? 'full' : filled === 1 ? 'half' : 'empty');
  }
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
