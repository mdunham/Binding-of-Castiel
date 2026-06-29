// main.js — game loop + state machine. Ties content, floor, entities, items,
// obstacles, bombs/keys and chests together.

import { loadContent } from './content.js';
import { generateFloor, makeRng } from './floor.js';
import { generateObstacles, clearPoint } from './obstacles.js';
import { createInput } from './input.js';
import { spawnEntity, stepEnemy } from './entities.js';
import { fireWeapon, cooldownFrames } from './weapons.js';
import { applyItem, effectiveMoveSpeed, effectiveWeapon, luckBonus } from './items.js';
import {
  circlesOverlap, clampToRect, inDoorGap, applyDamage, pointInRect, resolveCircleRects,
} from './combat.js';
import { drawSprite } from './sprite.js';
import * as audio from './audio.js';
import * as draw from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// Fixed room geometry shared by every room (BoI rooms are uniform).
const ROOM = {
  x0: 60, y0: 96, x1: W - 60, y1: H - 40,
  wall: 22, doorHalf: 40, doorDepth: 26,
};
const GEO = { x0: ROOM.x0, y0: ROOM.y0, x1: ROOM.x1, y1: ROOM.y1 };
const CX = (ROOM.x0 + ROOM.x1) / 2;
const CY = (ROOM.y0 + ROOM.y1) / 2;
const BOMB_RADIUS = 84;

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
  audio.resume();
  if (!G || G.state !== 'select') return;
  const rect = canvas.getBoundingClientRect();
  const my = (e.clientY - rect.top) * (H / rect.height);
  const idx = playerCardIndexAt(my);
  if (idx != null && idx < content.players.length) startNewRun(content.players[idx]);
});

window.addEventListener('keydown', (e) => {
  if (!G) return;
  audio.resume();                 // unlock audio on first key
  const k = e.key.toLowerCase();
  if (k === 'm') { G.muted = audio.toggleMute(); return; }
  if (G.state === 'select') {
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= content.players.length) {
      startNewRun(content.players[n - 1]);
    }
  } else if (G.state === 'play') {
    if (k === 'e' || k === 'b') placeBomb();
    else if (k === ' ' && G.bossCleared) nextFloor();
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

// Descend: keep the same player (items/stats/bombs/keys persist), new floor.
function nextFloor() {
  audio.play('descend');
  buildFloor(G.playerDef, G.floorNum + 1, G.player);
}

function buildFloor(playerDef, floorNum, player) {
  seedCounter += 7;
  const rng = makeRng(seedCounter + floorNum * 101);
  const floor = generateFloor(rng, { roomCount: Math.min(15, 7 + floorNum) });

  const roomState = new Map();
  for (const key of floor.rooms.keys()) {
    roomState.set(key, {
      visited: false, cleared: false, spawned: false,
      enemies: [], pickups: [], obstacles: [], chests: [], bombs: [], explosions: [],
    });
  }

  G = {
    state: 'play',
    playerDef, floorNum, floor, roomState,
    currentKey: floor.start,
    player,
    projectiles: [],
    rng,
    bossCleared: false,
    banner: null,
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
    rs.obstacles = generateObstacles(G.rng, room.type, GEO);

    if (room.type === 'start') {
      rs.cleared = true;
    } else if (room.type === 'treasure') {
      rs.cleared = true;
      const item = pick(content.items, G.rng);
      rs.chests.push({ x: CX, y: CY, locked: true, opened: false, reward: item ? { kind: 'item', def: item } : null });
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
        const pos = clearPoint(G.rng, GEO, rs.obstacles, def.size);
        const e = spawnEntity(def, pos.x, pos.y, content.weapons);
        scaleForFloor(e, G.floorNum);
        rs.enemies.push(e);
      }
      if (rs.enemies.length === 0) rs.cleared = true;
      if (G.rng() < 0.3) {
        const pos = clearPoint(G.rng, GEO, rs.obstacles, 18);
        rs.chests.push({ x: pos.x, y: pos.y, locked: G.rng() < 0.4, opened: false, reward: randomChestReward(G.rng) });
      }
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

// ---- pickups & rewards ---------------------------------------------------
function makeItemPickup(item, x, y) {
  return { kind: 'item', item, sprite: item.sprite || null, color: item.color, x, y, radius: 13 };
}
function makeConsumable(kind, x, y) { return { kind, x, y, radius: 11 }; }

// Weighted consumable: hearts a bit more common than bombs/keys.
function rollConsumable(rng) {
  const r = rng();
  if (r < 0.4) return 'heart';
  if (r < 0.7) return 'bomb';
  return 'key';
}
function dropFromEnemy(rng, x, y) {
  const chance = 0.28 + luckBonus(G.player);
  return rng() < chance ? makeConsumable(rollConsumable(rng), x, y) : null;
}
function randomChestReward(rng) {
  if (rng() < 0.45 && content.items.length) return { kind: 'item', def: pick(content.items, rng) };
  return { kind: rollConsumable(rng) };
}
function openChest(chest, rs) {
  chest.opened = true;
  const rw = chest.reward;
  if (!rw) { banner('Empty…'); return; }
  if (rw.kind === 'item' && rw.def) rs.pickups.push(makeItemPickup(rw.def, chest.x, chest.y - 6));
  else rs.pickups.push(makeConsumable(rw.kind, chest.x, chest.y - 6));
  audio.play('chest');
  banner('Chest opened!');
}

// ---- bombs ---------------------------------------------------------------
function placeBomb() {
  if (!G || G.state !== 'play') return;
  const p = G.player;
  if (p.bombs <= 0) { banner('No bombs'); return; }
  p.bombs--;
  G.roomState.get(G.currentKey).bombs.push({ x: p.x, y: p.y, fuse: 90 });
  audio.play('bomb');
}

function explode(b, rs) {
  const p = G.player;
  audio.play('explosion');
  rs.explosions.push({ x: b.x, y: b.y, radius: BOMB_RADIUS, life: 18, maxLife: 18 });
  // rocks within blast are destroyed (chance to drop)
  rs.obstacles = rs.obstacles.filter((rk) => {
    const rcx = rk.x + rk.w / 2, rcy = rk.y + rk.h / 2;
    if (Math.hypot(rcx - b.x, rcy - b.y) <= BOMB_RADIUS) {
      if (G.rng() < 0.2) rs.pickups.push(makeConsumable(rollConsumable(G.rng), rcx, rcy));
      return false;
    }
    return true;
  });
  // enemies
  for (const e of rs.enemies) {
    if (Math.hypot(e.x - b.x, e.y - b.y) <= BOMB_RADIUS + e.radius) {
      if (applyDamage(e, 40)) {
        e.dead = true;
        const d = dropFromEnemy(G.rng, e.x, e.y);
        if (d) rs.pickups.push(d);
      }
    }
  }
  // chests (bombs blast locked chests open)
  for (const ch of rs.chests) {
    if (!ch.opened && Math.hypot(ch.x - b.x, ch.y - b.y) <= BOMB_RADIUS) openChest(ch, rs);
  }
  // the player
  if (p.iframes === 0 && Math.hypot(p.x - b.x, p.y - b.y) <= BOMB_RADIUS + p.radius) damagePlayer(2);
}

// ---- update --------------------------------------------------------------
function update() {
  if (!G || G.state !== 'play') return;
  const p = G.player;
  const rs = G.roomState.get(G.currentKey);
  const room = G.floor.rooms.get(G.currentKey);

  // Movement: apply input, resolve against rocks, then clamp to the room.
  const speed = effectiveMoveSpeed(p);
  const mv = input.moveVector();
  const mlen = Math.hypot(mv.x, mv.y) || 1;
  p.x += (mv.x / mlen) * speed;
  p.y += (mv.y / mlen) * speed;
  const r1 = resolveCircleRects(p.x, p.y, p.radius, rs.obstacles);
  p.x = r1.x; p.y = r1.y;
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
    audio.play('shoot');
  }

  // Enemies — move by AI, collide with rocks (unless flying), stay in the room.
  for (const e of rs.enemies) {
    stepEnemy(e, p, G.projectiles);
    if (!e.flying) {
      const er = resolveCircleRects(e.x, e.y, e.radius, rs.obstacles);
      e.x = er.x; e.y = er.y;
    }
    const ec = clampToRect(e.x, e.y, e.radius, ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1);
    e.x = ec.x; e.y = ec.y;
    if (p.iframes === 0 && circlesOverlap(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
      damagePlayer(e.contactDamage || 1);
    }
  }

  // Projectiles
  for (const pr of G.projectiles) {
    if (pr.homing && pr.team === 'player') steerHoming(pr, rs.enemies);
    pr.x += pr.vx; pr.y += pr.vy; pr.life--;
    if (pr.life <= 0 || pr.x < ROOM.x0 || pr.x > ROOM.x1 || pr.y < ROOM.y0 || pr.y > ROOM.y1) {
      pr.dead = true; continue;
    }
    if (rs.obstacles.some((rk) => pointInRect(pr.x, pr.y, rk))) { pr.dead = true; continue; }
    if (pr.team === 'player') {
      for (const e of rs.enemies) {
        if (e.dead) continue;
        if (circlesOverlap(pr.x, pr.y, pr.radius, e.x, e.y, e.radius)) {
          if (applyDamage(e, pr.damage)) {
            e.dead = true;
            audio.play('enemyDie');
            if (e.role !== 'boss') { const d = dropFromEnemy(G.rng, e.x, e.y); if (d) rs.pickups.push(d); }
          } else audio.play('hit');
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

  // Bombs (fuse + explosion)
  for (const b of rs.bombs) {
    b.fuse--;
    if (b.fuse <= 0) { explode(b, rs); b.done = true; }
  }
  rs.bombs = rs.bombs.filter((b) => !b.done);
  for (const ex of rs.explosions) ex.life--;
  rs.explosions = rs.explosions.filter((ex) => ex.life > 0);

  rs.enemies = rs.enemies.filter((e) => !e.dead);
  G.projectiles = G.projectiles.filter((pr) => !pr.dead);

  // Chests (walk into to open; locked needs a key)
  for (const ch of rs.chests) {
    if (ch.opened) continue;
    if (circlesOverlap(p.x, p.y, p.radius, ch.x, ch.y, 18)) {
      if (ch.locked) {
        if (p.keys > 0) { p.keys--; openChest(ch, rs); }
        else { banner('Locked — need a key (or bomb it)'); audio.play('locked'); }
      } else openChest(ch, rs);
    }
  }

  // Pickups
  for (const pk of rs.pickups) {
    if (!circlesOverlap(p.x, p.y, p.radius, pk.x, pk.y, pk.radius)) continue;
    if (pk.kind === 'heart') {
      if (p.health < p.maxHealth) { p.health = Math.min(p.maxHealth, p.health + 2); pk.taken = true; banner('+ Heart'); audio.play('pickup'); }
    } else if (pk.kind === 'bomb') {
      p.bombs++; pk.taken = true; banner('+ Bomb'); audio.play('pickup');
    } else if (pk.kind === 'key') {
      p.keys++; pk.taken = true; banner('+ Key'); audio.play('key');
    } else {
      applyItem(p, pk.item); pk.taken = true; banner(`Picked up: ${pk.item.name}`); audio.play('item');
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
      audio.play('boss');
    } else {
      audio.play('clear');
    }
  }

  // Door transitions (only when cleared)
  if (rs.cleared) {
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (room.neighbors[dir] && inDoorGap(p.x, p.y, dir, ROOM, p.radius)) {
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
  audio.play('hurt');
}

// Gently curve a homing projectile toward the nearest enemy, keeping its speed.
function steerHoming(pr, enemies) {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - pr.x, e.y - pr.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best || bd < 1) return;
  const sp = Math.hypot(pr.vx, pr.vy) || 1;
  pr.vx += ((best.x - pr.x) / bd) * 0.6;
  pr.vy += ((best.y - pr.y) / bd) * 0.6;
  const ns = Math.hypot(pr.vx, pr.vy) || 1;
  pr.vx = (pr.vx / ns) * sp;
  pr.vy = (pr.vy / ns) * sp;
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
  for (const rk of rs.obstacles) draw.drawRock(ctx, rk);
  for (const ch of rs.chests) draw.drawChest(ctx, ch, tick);
  for (const pk of rs.pickups) draw.drawPickup(ctx, pk, tick);
  for (const pr of G.projectiles) draw.drawProjectile(ctx, pr);
  for (const b of rs.bombs) draw.drawBomb(ctx, b);
  for (const e of rs.enemies) draw.drawEntity(ctx, e, false);
  draw.drawEntity(ctx, G.player, true);
  for (const ex of rs.explosions) draw.drawExplosion(ctx, ex);

  // HUD
  draw.drawHearts(ctx, G.player, 24, 28);
  draw.drawResources(ctx, G.player, 24, 80);
  ctx.fillStyle = '#6f6480'; ctx.font = '11px monospace'; ctx.textAlign = 'right';
  ctx.fillText(audio.isMuted() ? '🔇 muted (M)' : '🔊 sound (M)', W - 24, H - 14);
  ctx.textAlign = 'left';
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
  ctx.fillText('Click a character or press its number. WASD move • Arrows shoot • E bomb • items, keys & chests await', W / 2, 118);

  content.players.forEach((pd, i) => {
    const y = CARD.top + i * (CARD.height + CARD.gap);
    ctx.fillStyle = '#2b2330';
    ctx.fillRect(CARD.left, y, CARD.width, CARD.height);
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

// Fullscreen toggle for the gameplay view.
const fsBtn = document.getElementById('fsBtn');
if (fsBtn) {
  fsBtn.addEventListener('click', () => {
    audio.resume();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (canvas.requestFullscreen) canvas.requestFullscreen();
  });
}

// Dev hook: lets tooling/console inspect live state. Harmless in normal play.
window.__game = () => G;

requestAnimationFrame(frame);
