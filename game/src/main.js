// main.js — game loop + state machine. Ties content, floor, entities, render together.

import { loadContent } from './content.js';
import { generateFloor, makeRng } from './floor.js';
import { createInput } from './input.js';
import { spawnEntity, stepEnemy } from './entities.js';
import { fireWeapon, cooldownFrames } from './weapons.js';
import {
  circlesOverlap, clampToRect, inDoorGap, applyDamage,
} from './combat.js';
import * as draw from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// Fixed room geometry shared by every room (BoI rooms are uniform).
const ROOM = {
  x0: 60, y0: 96, x1: W - 60, y1: H - 40,
  wall: 22, doorHalf: 34, doorDepth: 26,
};

const input = createInput(window);
let content = null;
let G = null;            // active game state
let seedCounter = 1234;  // bumped each new floor for variety

const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

// ---- boot ----------------------------------------------------------------
loadContent('../content.json')
  .then((c) => { content = c; G = { state: 'select', selectedIndex: 0 }; })
  .catch((err) => { G = { state: 'error', message: err.message }; });

canvas.addEventListener('click', (e) => {
  if (!G || G.state !== 'select') return;
  const rect = canvas.getBoundingClientRect();
  const my = (e.clientY - rect.top) * (H / rect.height);
  const idx = playerCardIndexAt(my);
  if (idx != null && idx < content.players.length) startRun(content.players[idx], 1);
});

window.addEventListener('keydown', (e) => {
  if (!G) return;
  const k = e.key.toLowerCase();
  if (G.state === 'select') {
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= content.players.length) {
      startRun(content.players[n - 1], 1);
    }
  } else if (G.state === 'dead') {
    if (k === 'r') startRun(G.playerDef, 1);
  } else if (G.state === 'cleared') {
    if (k === 'r') startRun(G.playerDef, G.floorNum + 1);
  }
});

// ---- run setup -----------------------------------------------------------
function startRun(playerDef, floorNum) {
  seedCounter += 7;
  const rng = makeRng(seedCounter + floorNum * 101);
  const roomCount = Math.min(15, 7 + floorNum);
  const floor = generateFloor(rng, { roomCount });

  const player = spawnEntity(
    playerDef,
    (ROOM.x0 + ROOM.x1) / 2,
    (ROOM.y0 + ROOM.y1) / 2,
    content.weapons,
  );

  const roomState = new Map();
  for (const k of floor.rooms.keys()) {
    roomState.set(k, { visited: false, cleared: false, enemies: [], spawned: false });
  }

  G = {
    state: 'play',
    playerDef, floorNum, floor, roomState,
    currentKey: floor.start,
    player,
    projectiles: [],
    rng,
  };
  enterRoom(floor.start, null);
}

// Populate / restore a room when the player walks into it.
function enterRoom(key, fromDir) {
  G.currentKey = key;
  const rs = G.roomState.get(key);
  rs.visited = true;
  const room = G.floor.rooms.get(key);

  if (!rs.spawned) {
    rs.spawned = true;
    if (room.type === 'start') {
      rs.cleared = true;
    } else if (room.type === 'boss') {
      const boss = pick(content.bosses, G.rng) || pick(content.enemies, G.rng);
      if (boss) {
        const e = spawnEntity(boss, (ROOM.x0 + ROOM.x1) / 2, ROOM.y0 + 90, content.weapons);
        scaleForFloor(e, G.floorNum);
        rs.enemies.push(e);
      } else rs.cleared = true;
    } else {
      const count = 2 + Math.min(4, G.floorNum);
      for (let i = 0; i < count; i++) {
        const def = pick(content.enemies, G.rng);
        if (!def) break;
        const pos = randomRoomPoint(G.rng, def.size);
        const e = spawnEntity(def, pos.x, pos.y, content.weapons);
        scaleForFloor(e, G.floorNum);
        rs.enemies.push(e);
      }
      if (rs.enemies.length === 0) rs.cleared = true;
    }
  }

  // Place the player just inside the door they came through.
  const r = ROOM;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const inset = G.player.radius + r.doorDepth + 4;
  if (fromDir === 'up') { G.player.x = cx; G.player.y = r.y0 + inset; }
  else if (fromDir === 'down') { G.player.x = cx; G.player.y = r.y1 - inset; }
  else if (fromDir === 'left') { G.player.x = r.x0 + inset; G.player.y = cy; }
  else if (fromDir === 'right') { G.player.x = r.x1 - inset; G.player.y = cy; }
  else { G.player.x = cx; G.player.y = cy; }
}

function scaleForFloor(e, floorNum) {
  const mult = 1 + 0.18 * (floorNum - 1);
  e.maxHealth = Math.round(e.maxHealth * mult);
  e.health = e.maxHealth;
}

// ---- update --------------------------------------------------------------
function update() {
  if (!G || G.state !== 'play') return;
  const p = G.player;
  const rs = G.roomState.get(G.currentKey);
  const room = G.floor.rooms.get(G.currentKey);

  // Movement
  const mv = input.moveVector();
  const mlen = Math.hypot(mv.x, mv.y) || 1;
  p.x += (mv.x / mlen) * p.moveSpeed;
  p.y += (mv.y / mlen) * p.moveSpeed;
  const c = clampToRect(p.x, p.y, p.radius, ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1);
  p.x = c.x; p.y = c.y;
  if (p.iframes > 0) p.iframes--;
  if (p.cooldown > 0) p.cooldown--;

  // Shooting (twin-stick)
  const aim = input.aimVector();
  if ((aim.x || aim.y) && p.weapon && p.cooldown === 0) {
    const len = Math.hypot(aim.x, aim.y);
    G.projectiles.push(...fireWeapon(p.weapon, p.x, p.y, { x: aim.x / len, y: aim.y / len }, 'player'));
    p.cooldown = cooldownFrames(p.weapon);
  }

  // Enemies
  for (const e of rs.enemies) {
    stepEnemy(e, p, G.projectiles);
    const ec = clampToRect(e.x, e.y, e.radius, ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1);
    e.x = ec.x; e.y = ec.y;
    // contact damage
    if (p.iframes === 0 && circlesOverlap(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
      damagePlayer(e.contactDamage || 1);
    }
  }

  // Projectiles
  for (const pr of G.projectiles) {
    pr.x += pr.vx; pr.y += pr.vy; pr.life--;
    if (pr.life <= 0 || pr.x < ROOM.x0 || pr.x > ROOM.x1 || pr.y < ROOM.y0 || pr.y > ROOM.y1) {
      pr.dead = true; continue;
    }
    if (pr.team === 'player') {
      for (const e of rs.enemies) {
        if (e.dead) continue;
        if (circlesOverlap(pr.x, pr.y, pr.radius, e.x, e.y, e.radius)) {
          if (applyDamage(e, pr.damage)) e.dead = true;
          if (!pr.piercing) { pr.dead = true; break; }
        }
      }
    } else if (pr.team === 'enemy' && p.iframes === 0) {
      if (circlesOverlap(pr.x, pr.y, pr.radius, p.x, p.y, p.radius)) {
        damagePlayer(1);
        pr.dead = true;
      }
    }
  }
  rs.enemies = rs.enemies.filter((e) => !e.dead);
  G.projectiles = G.projectiles.filter((pr) => !pr.dead);

  // Room cleared?
  if (!rs.cleared && rs.enemies.length === 0) {
    rs.cleared = true;
    G.projectiles = G.projectiles.filter((pr) => pr.team === 'player');
    if (room.type === 'boss') { G.state = 'cleared'; return; }
  }

  // Door transitions (only when cleared)
  if (rs.cleared) {
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (room.neighbors[dir] && inDoorGap(p.x, p.y, dir, ROOM)) {
        G.projectiles = [];
        enterRoom(room.neighbors[dir], OPP[dir]);
        break;
      }
    }
  }

  if (p.health <= 0) G.state = 'dead';
}

function damagePlayer(amount) {
  const p = G.player;
  applyDamage(p, amount);
  p.iframes = 48;
}

// ---- render --------------------------------------------------------------
function frame() {
  update();
  draw.clear(ctx, W, H);
  if (!G) { requestAnimationFrame(frame); return; }

  if (G.state === 'error') {
    draw.drawCenterText(ctx, W, H, [
      { text: 'Failed to load content.json', color: '#e74c3c', font: '22px monospace' },
      { text: G.message.split('\n')[0], color: '#f0c0c0', font: '13px monospace' },
      { text: 'Run via the static server (node serve.js), not file://', font: '13px monospace' },
    ]);
  } else if (G.state === 'select') {
    drawSelect();
  } else {
    drawPlay();
    if (G.state === 'dead') {
      draw.drawCenterText(ctx, W, H, [
        { text: 'YOU DIED', color: '#e74c3c', font: 'bold 34px monospace' },
        { text: `Floor ${G.floorNum}`, font: '16px monospace' },
        { text: 'Press R to try again', font: '16px monospace' },
      ]);
    } else if (G.state === 'cleared') {
      draw.drawCenterText(ctx, W, H, [
        { text: 'FLOOR CLEARED!', color: '#7ed957', font: 'bold 34px monospace' },
        { text: `Boss down on floor ${G.floorNum}`, font: '16px monospace' },
        { text: 'Press R to descend to the next floor', font: '16px monospace' },
      ]);
    }
  }
  requestAnimationFrame(frame);
}

function drawPlay() {
  const room = G.floor.rooms.get(G.currentKey);
  const rs = G.roomState.get(G.currentKey);
  draw.drawRoom(ctx, ROOM, room.neighbors, rs.cleared);
  for (const pr of G.projectiles) draw.drawProjectile(ctx, pr);
  for (const e of rs.enemies) draw.drawEntity(ctx, e, false);
  draw.drawEntity(ctx, G.player, true);

  // HUD
  draw.drawHearts(ctx, G.player, 24, 28);
  ctx.fillStyle = '#c9bcd8';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${G.playerDef.name}  •  ${G.player.weapon ? G.player.weapon.name : 'Unarmed'}  •  Floor ${G.floorNum}`, 24, 60);
  if (G.floor.rooms.get(G.currentKey).type === 'boss' && !rs.cleared) {
    ctx.fillStyle = '#e74c3c';
    ctx.textAlign = 'center';
    ctx.fillText('— BOSS —', W / 2, 84);
    ctx.textAlign = 'left';
  }
  draw.drawMinimap(ctx, G.floor, G.roomState, G.currentKey, W - 150, 18);
}

// ---- character select ----------------------------------------------------
const CARD = { top: 150, height: 70, gap: 14, left: 120, width: 660 };

function playerCardIndexAt(my) {
  for (let i = 0; i < content.players.length; i++) {
    const y = CARD.top + i * (CARD.height + CARD.gap);
    if (my >= y && my <= y + CARD.height) return i;
  }
  return null;
}

function drawSelect() {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0e6f5';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('CHOOSE YOUR CHARACTER', W / 2, 90);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#a99cb8';
  ctx.fillText('Click a character or press its number. WASD move • Arrows shoot', W / 2, 118);

  content.players.forEach((pd, i) => {
    const y = CARD.top + i * (CARD.height + CARD.gap);
    ctx.fillStyle = '#2b2330';
    ctx.fillRect(CARD.left, y, CARD.width, CARD.height);
    // avatar
    ctx.beginPath();
    ctx.arc(CARD.left + 45, y + CARD.height / 2, pd.size + 6, 0, Math.PI * 2);
    ctx.fillStyle = pd.color;
    ctx.fill();
    // text
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0e6f5';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`${i + 1}. ${pd.name}`, CARD.left + 100, y + 30);
    const w = content.weapons.get(pd.weaponId);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#a99cb8';
    ctx.fillText(
      `HP ${pd.maxHealth / 2} hearts   Speed ${pd.moveSpeed}   Weapon ${w ? w.name : '—'}`,
      CARD.left + 100, y + 52,
    );
    ctx.textAlign = 'center';
  });
  ctx.textAlign = 'left';
}

function pick(arr, rng) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}

function randomRoomPoint(rng, radius) {
  const pad = radius + 20;
  // Avoid spawning right on the player's entry point (room center).
  let x, y, tries = 0;
  do {
    x = ROOM.x0 + pad + rng() * (ROOM.x1 - ROOM.x0 - 2 * pad);
    y = ROOM.y0 + pad + rng() * (ROOM.y1 - ROOM.y0 - 2 * pad);
    tries++;
  } while (tries < 8 && Math.hypot(x - (ROOM.x0 + ROOM.x1) / 2, y - (ROOM.y0 + ROOM.y1) / 2) < 90);
  return { x, y };
}

// Dev hook: lets tooling/console inspect live state. Harmless in normal play.
window.__game = () => G;

requestAnimationFrame(frame);
