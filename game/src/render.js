// render.js — all canvas drawing. Stateless: every function takes ctx + data.

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

/** Draw an entity as a colored circle, with a health bar for non-player units. */
export function drawEntity(ctx, e, isPlayer) {
  if (e.iframes > 0 && Math.floor(e.iframes / 4) % 2 === 0) {
    // flicker while invincible
  } else {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fillStyle = e.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    // simple "eyes" so facing reads as a creature
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(e.x - e.radius * 0.3, e.y - e.radius * 0.15, 2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(e.x + e.radius * 0.3, e.y - e.radius * 0.15, 2, 0, 7); ctx.fill();
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

/** Hearts HUD (half-heart granularity). */
export function drawHearts(ctx, player, x, y) {
  const containers = Math.ceil(player.maxHealth / 2);
  for (let i = 0; i < containers; i++) {
    const filled = player.health - i * 2; // 2, 1, or <=0
    drawHeart(ctx, x + i * 26, y, filled >= 2 ? 'full' : filled === 1 ? 'half' : 'empty');
  }
}

function drawHeart(ctx, x, y, state) {
  const empty = '#3a2f3f';
  const red = '#e74c3c';
  ctx.save();
  ctx.translate(x, y);
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
  paint(empty, false);
  if (state === 'full') { ctx.restore(); ctx.save(); ctx.translate(x, y); paint(red, false); }
  else if (state === 'half') { ctx.restore(); ctx.save(); ctx.translate(x, y); paint(red, true); }
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
