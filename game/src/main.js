// main.js — game loop + state machine. Ties content, floor, entities, items together.

import { loadContent } from './content.js';
import { generateFloor, makeRng } from './floor.js';
import { createInput } from './input.js';
import { spawnEntity, stepEnemy } from './entities.js';
import { fireWeapon, cooldownFrames } from './weapons.js';
import { applyItem, effectiveMoveSpeed, effectiveWeapon } from './items.js';
import { circlesOverlap, clampToRect, inDoorGap, applyDamage } from './combat.js';
import { drawSprite } from './sprite.js';
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
const CX = (ROOM.x0 + ROOM.x1) / 2;
const CY = (ROOM.y0 + ROOM.y1) / 2;

const input = createInput(window);
let content = null;
let G = null;            // active game state
let seedCounter = 1234;  // bumped each new floor for variety
let tick = 0;            // global frame counter (for bobbing/animation)

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
  if (idx != null && idx < content.players.length) startNewRun(content.players[idx]);
});

window.addEventListener('keydown', (e) => {
  if (!G) return;
  const k = e.key.toLowerCase();
  if (G.state === 'select') {
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= content.players.length) {
      startNewRun(content.players[n - 1]);
    }
  } else if (G.state === 'play') {
    if (k === ' ' && G.bossCleared) nextFloor();
    else if (k === 'r') startNewRun(G.playerDef);
  } else if (G.state === 'dead') {
    if (k === 'r') startNewRun(G.playerDef);
  }
});

// ---- run setup -----------------------------------------------------------
function startNewRun(playerDef) {
  const player = spawnEntity(playerDef, CX, CY, content.weapons);
  buildFloor(playerDef, 1, player);
}

// Descend: keep the same player (items/stats/health persist), new harder floor.
function nextFloor() {
  buildFloor(G.playerDef, G.floorNum + 1, G.player);
}

function buildFloor(playerDef, floorNum, player) {
  seedCounter += 7;
  const rng = makeRng(seedCounter + floorNum * 101);
  const floor = generateFloor(rng, { roomCount: Math.min(15, 7 + floorNum) });

  const roomState = new Map();
  for (const key of floor.rooms.keys()) {
    roomState.set(key, { visited: false, cleared: false, spawned: false, enemies: [], pickups: [] });
  }

  G = {
    state: 'play',
    playerDef, floorNum, floor, roomState,
    currentKey: floor.start,
    player,
    projectiles: [],
    rng,
    bossCleared: false,
    banner: null,       // { text, until }
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
    } else if (room.type === 'treasure') {
      rs.cleared = true;
      const item = pick(content.items, G.rng);
      if (item) rs.pickups.push(makeItemPickup(item, CX, CY));
    } else if (room.type === 'boss') {
      const boss = pick(content.bosses, G.rng) || pick(content.enemies, G.rng);
      if (boss) {
        const e = spawnEntity(boss, CX, ROOM.y0 + 90, content.weapons);
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
  const inset = G.player.radius + ROOM.doorDepth + 4;
  if (fromDir === 'up') { G.player.x = CX; G.player.y = ROOM.y0 + inset; }
  else if (fromDir === 'down') { G.player.x = CX; G.player.y = ROOM.y1 - inset; }
  else if (fromDir === 'left') { G.player.x = ROOM.x0 + inset; G.player.y = CY; }
  else if (fromDir === 'right') { G.player.x = ROOM.x1 - inset; G.player.y = CY; }
  else { G.player.x = CX; G.player.y = CY; }
}

function scaleForFloor(e, floorNum) {
  const mult = 1 + 0.18 * (floorNum - 1);
  e.maxHealth = Math.round(e.maxHealth * mult);
  e.health = e.maxHealth;
}

function makeItemPickup(item, x, y) {
  return { kind: 'item', item, sprite: item.sprite || null, color: item.color, x, y, radius: 13 };
}
function makeHeartPickup(x, y) {
  return { kind: 'heart', x, y, radius: 11 };
}

// ---- update --------------------------------------------------------------
function update() {
  if (!G || G.state !== 'play') return;
  const p = G.player;
  const rs = G.roomState.get(G.currentKey);
  const room = G.floor.rooms.get(G.currentKey);

  // Movement (item-modified speed).
  const speed = effectiveMoveSpeed(p);
  const mv = input.moveVector();
  const mlen = Math.hypot(mv.x, mv.y) || 1;
  p.x += (mv.x / mlen) * speed;
  p.y += (mv.y / mlen) * speed;
  const c = clampToRect(p.x, p.y, p.radius, ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1);
  p.x = c.x; p.y = c.y;
  if (p.iframes > 0) p.iframes--;
  if (p.cooldown > 0) p.cooldown--;

  // Shooting (item-modified weapon).
  const aim = input.aimVector();
  const eff = effectiveWeapon(p);
  if ((aim.x || aim.y) && eff && p.cooldown === 0) {
    const len = Math.hypot(aim.x, aim.y);
    G.projectiles.push(...fireWeapon(eff, p.x, p.y, { x: aim.x / len, y: aim.y / len }, 'player'));
    p.cooldown = cooldownFrames(eff);
  }

  // Enemies
  for (const e of rs.enemies) {
    stepEnemy(e, p, G.projectiles);
    const ec = clampToRect(e.x, e.y, e.radius, ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1);
    e.x = ec.x; e.y = ec.y;
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
          if (applyDamage(e, pr.damage)) {
            e.dead = true;
            if (e.role !== 'boss' && G.rng() < 0.22) rs.pickups.push(makeHeartPickup(e.x, e.y));
          }
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

  // Pickups
  for (const pk of rs.pickups) {
    if (circlesOverlap(p.x, p.y, p.radius, pk.x, pk.y, pk.radius)) {
      if (pk.kind === 'heart') {
        if (p.health < p.maxHealth) { p.health = Math.min(p.maxHealth, p.health + 2); pk.taken = true; banner('+ Heart'); }
      } else {
        applyItem(p, pk.item);
        pk.taken = true;
        banner(`Picked up: ${pk.item.name}`);
      }
    }
  }
  rs.pickups = rs.pickups.filter((pk) => !pk.taken);

  // Room cleared?
  if (!rs.cleared && rs.enemies.length === 0) {
    rs.cleared = true;
    G.projectiles = G.projectiles.filter((pr) => pr.team === 'player');
    if (room.type === 'boss') {
      G.bossCleared = true;
      const reward = pick(content.items, G.rng);
      if (reward) rs.pickups.push(makeItemPickup(reward, CX, CY + 40));
      banner('BOSS DEFEATED!');
    }
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

function banner(text) { G.banner = { text, until: tick + 120 }; }

// ---- render --------------------------------------------------------------
function frame() {
  tick++;
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
        { text: `Floor ${G.floorNum} • ${G.player.items.length} items collected`, font: '16px monospace' },
        { text: 'Press R to start a new run', font: '16px monospace' },
      ]);
    }
  }
  requestAnimationFrame(frame);
}

function drawPlay() {
  const room = G.floor.rooms.get(G.currentKey);
  const rs = G.roomState.get(G.currentKey);
  draw.drawRoom(ctx, ROOM, room.neighbors, rs.cleared);
  for (const pk of rs.pickups) draw.drawPickup(ctx, pk, tick);
  for (const pr of G.projectiles) draw.drawProjectile(ctx, pr);
  for (const e of rs.enemies) draw.drawEntity(ctx, e, false);
  draw.drawEntity(ctx, G.player, true);

  // HUD
  draw.drawHearts(ctx, G.player, 24, 28);
  const eff = effectiveWeapon(G.player) || { damage: 0, fireRate: 0 };
  ctx.fillStyle = '#c9bcd8';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `${G.playerDef.name}  •  ${G.player.weapon ? G.player.weapon.name : 'Unarmed'}  •  `
    + `DMG ${eff.damage.toFixed(1)}  RATE ${eff.fireRate.toFixed(1)}  SPD ${effectiveMoveSpeed(G.player).toFixed(1)}`
    + `  •  Items ${G.player.items.length}  •  Floor ${G.floorNum}`,
    24, 60,
  );

  if (room.type === 'boss' && !rs.cleared) {
    ctx.fillStyle = '#e74c3c'; ctx.textAlign = 'center';
    ctx.fillText('— BOSS —', W / 2, 84); ctx.textAlign = 'left';
  } else if (room.type === 'treasure') {
    ctx.fillStyle = '#d8c84a'; ctx.textAlign = 'center';
    ctx.fillText('✦ TREASURE ✦', W / 2, 84); ctx.textAlign = 'left';
  }

  // Banner (pickups / boss / descend prompt)
  ctx.textAlign = 'center';
  if (G.bossCleared) {
    ctx.fillStyle = '#7ed957'; ctx.font = '15px monospace';
    ctx.fillText('Boss defeated — grab your reward, then press SPACE to descend', W / 2, H - 16);
  }
  if (G.banner && tick < G.banner.until) {
    ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 16px monospace';
    ctx.fillText(G.banner.text, W / 2, 108);
  }
  ctx.textAlign = 'left';

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
  ctx.fillText('Click a character or press its number. WASD move • Arrows shoot • items & treasure await', W / 2, 118);

  content.players.forEach((pd, i) => {
    const y = CARD.top + i * (CARD.height + CARD.gap);
    ctx.fillStyle = '#2b2330';
    ctx.fillRect(CARD.left, y, CARD.width, CARD.height);
    // avatar: sprite if present, else blob
    const ax = CARD.left + 45, ay = y + CARD.height / 2;
    if (!drawSprite(ctx, pd.sprite, ax, ay, (pd.size + 6) * 2)) {
      ctx.beginPath(); ctx.arc(ax, ay, pd.size + 6, 0, Math.PI * 2);
      ctx.fillStyle = pd.color; ctx.fill();
    }
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
  let x, y, tries = 0;
  do {
    x = ROOM.x0 + pad + rng() * (ROOM.x1 - ROOM.x0 - 2 * pad);
    y = ROOM.y0 + pad + rng() * (ROOM.y1 - ROOM.y0 - 2 * pad);
    tries++;
  } while (tries < 8 && Math.hypot(x - CX, y - CY) < 90);
  return { x, y };
}

// Dev hook: lets tooling/console inspect live state. Harmless in normal play.
window.__game = () => G;

requestAnimationFrame(frame);
