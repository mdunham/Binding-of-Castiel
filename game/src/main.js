// main.js — game loop + state machine. Ties content, floor, entities, items,
// obstacles, bombs/keys and chests together.

import { loadContent } from './content.js';
import { generateFloor, makeRng } from './floor.js';
import { generateObstacles, clearPoint } from './obstacles.js';
import { createInput, GP } from './input.js';
import { spawnEntity, stepEnemy } from './entities.js';
import { fireWeapon, cooldownFrames } from './weapons.js';
import { applyItem, effectiveMoveSpeed, effectiveWeapon, luckBonus } from './items.js';
import { TUNING } from './config.js';
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

// ---- touch / mobile controls --------------------------------------------
const isTouchDevice = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
  || (typeof window !== 'undefined' && 'ontouchstart' in window);
let touchMove = { x: 0, y: 0 };
let touchAim = { x: 0, y: 0 };
const moveStick = { id: null, bx: 0, by: 0, cx: 0, cy: 0 };
const aimStick = { id: null, bx: 0, by: 0, cx: 0, cy: 0 };
const BOMB_BTN = () => ({ x: W - 96, y: H - 104, r: 50 });
const MUTE_BTN = () => ({ x: 52, y: H - 56, r: 24 });
const MOVE_GUIDE = () => ({ x: 120, y: H - 130 });
const AIM_GUIDE = () => ({ x: W - 120, y: H - 130 });
const DESCEND_BTN = () => ({ x: W / 2, y: H - 70, w: 260, h: 52 });

// Gamepad UI toggle (persisted in localStorage via input.js).
const gpToggle = document.getElementById('gpToggle');
const gpStatus = document.getElementById('gpStatus');
if (gpToggle) {
  gpToggle.checked = input.isGamepadEnabled();
  gpToggle.addEventListener('change', () => {
    input.setGamepadEnabled(gpToggle.checked);
    updateGpStatus();
    if (gpToggle.checked) audio.resume();
  });
}
function updateGpStatus() {
  if (!gpStatus) return;
  if (!input.isGamepadEnabled()) { gpStatus.textContent = ''; return; }
  gpStatus.textContent = input.gamepadConnected() ? '● linked' : '○ press a button';
}

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
  player.trail = playerDef.trailId ? content.trailsById.get(playerDef.trailId) || null : null;
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
      enemies: [], pickups: [], obstacles: [], chests: [], bombs: [], explosions: [], trail: [],
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

const ENEMY_CAP = 26; // keep a spawner from flooding the room

// A spawner enemy births smaller, faster minis on a timer. Minis chase and
// never spawn themselves (no runaway recursion).
function handleSpawner(e, rs, out) {
  e.spawnTimer--;
  if (e.spawnTimer > 0) return;
  e.spawnTimer = Math.round((e.def.spawnInterval || 2.4) * 60);
  if (rs.enemies.length + out.length >= ENEMY_CAP) return;
  const baseDef = e.spawnId ? content.characters.get(e.spawnId) : e.def;
  if (!baseDef) return;
  const count = e.def.spawnCount || 2;
  for (let i = 0; i < count; i++) {
    const ang = G.rng() * Math.PI * 2;
    const mini = spawnEntity(
      miniDef(baseDef),
      e.x + Math.cos(ang) * (e.radius + 8),
      e.y + Math.sin(ang) * (e.radius + 8),
      content.weapons,
    );
    out.push(mini);
  }
  audio.play('spawn');
}

function miniDef(def) {
  return {
    ...def,
    role: 'enemy',
    ai: 'chase',                                   // minis hunt the player
    size: Math.max(6, def.size * 0.5),             // smaller
    moveSpeed: def.moveSpeed * 1.6,                // faster
    maxHealth: Math.max(2, Math.round(def.maxHealth * 0.4)),
    spawnId: undefined,                            // minis don't spawn
    sprite: def.sprite,
    contactDamage: def.contactDamage || 1,
  };
}

// ---- pickups & rewards ---------------------------------------------------
function makeItemPickup(item, x, y) {
  return { kind: 'item', item, sprite: item.sprite || null, color: item.color, x, y, radius: 13 * TUNING.pickupSizeMult };
}
function makeConsumable(kind, x, y) { return { kind, x, y, radius: 11 * TUNING.pickupSizeMult }; }

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

// ---- gamepad actions (polled each frame in frame()) ----------------------
function handleGamepad() {
  if (!input.isGamepadEnabled() || !G) return;
  audio.resume();
  if (G.state === 'play') {
    if (input.buttonJustPressed(GP.X) || input.buttonJustPressed(GP.RB)) placeBomb();
    if (G.bossCleared && (input.buttonJustPressed(GP.A) || input.buttonJustPressed(GP.START))) nextFloor();
    if (input.buttonJustPressed(GP.B)) startNewRun(G.playerDef);
  } else if (G.state === 'dead') {
    if (input.buttonJustPressed(GP.B) || input.buttonJustPressed(GP.A) || input.buttonJustPressed(GP.START)) {
      startNewRun(G.playerDef);
    }
  } else if (G.state === 'select' && content) {
    const idx = G.selectedIndex ?? 0;
    if (input.buttonJustPressed(GP.DPAD_UP)) G.selectedIndex = Math.max(0, idx - 1);
    if (input.buttonJustPressed(GP.DPAD_DOWN)) G.selectedIndex = Math.min(content.players.length - 1, idx + 1);
    if (input.buttonJustPressed(GP.A) || input.buttonJustPressed(GP.START)) {
      startNewRun(content.players[G.selectedIndex ?? 0]);
    }
  }
}

// ---- update --------------------------------------------------------------
function update() {
  if (!G || G.state !== 'play') return;
  const p = G.player;
  const rs = G.roomState.get(G.currentKey);
  const room = G.floor.rooms.get(G.currentKey);

  // Movement: keyboard / gamepad / touch — resolve rocks, clamp to room.
  const speed = effectiveMoveSpeed(p);
  const mvk = input.moveVector();
  const mv = (mvk.x || mvk.y) ? mvk : touchMove;
  const mlen = Math.hypot(mv.x, mv.y) || 1;
  p.x += (mv.x / mlen) * speed;
  p.y += (mv.y / mlen) * speed;
  const r1 = resolveCircleRects(p.x, p.y, p.radius, rs.obstacles);
  p.x = r1.x; p.y = r1.y;
  const c = clampToRect(p.x, p.y, p.radius, ROOM.x0, ROOM.y0, ROOM.x1, ROOM.y1);
  p.x = c.x; p.y = c.y;
  if (p.iframes > 0) p.iframes--;
  if (p.cooldown > 0) p.cooldown--;

  // Shooting; aim from arrows, right stick, or touch aim stick.
  const aimk = input.aimVector();
  const aim = (aimk.x || aimk.y) ? aimk : touchAim;
  const eff = effectiveWeapon(p);
  if ((aim.x || aim.y) && eff && p.cooldown === 0) {
    const len = Math.hypot(aim.x, aim.y);
    G.projectiles.push(...fireWeapon(eff, p.x, p.y, { x: aim.x / len, y: aim.y / len }, 'player'));
    p.cooldown = cooldownFrames(eff);
    audio.play('shoot');
  }

  // Enemies — move by AI, collide with rocks (unless flying), stay in the room.
  const spawned = [];
  for (const e of rs.enemies) {
    stepEnemy(e, p, G.projectiles);
    if (e.ai === 'spawner') handleSpawner(e, rs, spawned);
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
  if (spawned.length) rs.enemies.push(...spawned);

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

  // Damaging trail: drop segments while moving, age them, damage enemies on them.
  if (p.trail) {
    if (mv.x || mv.y) {
      p.trailDropCd--;
      if (p.trailDropCd <= 0) {
        const life = p.trail.lifetime || 45;
        rs.trail.push({ x: p.x, y: p.y, life, maxLife: life });
        p.trailDropCd = p.trail.dropInterval || 5;
      }
    }
    const tw = p.trail.width || 14;
    let trailKill = false;
    for (const e of rs.enemies) {
      e.trailCd--;
      if (e.trailCd <= 0 && rs.trail.some((s) => Math.hypot(s.x - e.x, s.y - e.y) < tw + e.radius)) {
        if (applyDamage(e, p.trail.damage)) {
          e.dead = true; trailKill = true; audio.play('enemyDie');
          if (e.role !== 'boss') { const d = dropFromEnemy(G.rng, e.x, e.y); if (d) rs.pickups.push(d); }
        }
        e.trailCd = p.trail.tickInterval || 16;
      }
    }
    if (trailKill) rs.enemies = rs.enemies.filter((e) => !e.dead);
  }
  for (const s of rs.trail) s.life--;
  rs.trail = rs.trail.filter((s) => s.life > 0);

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
      if (pk.item.trailId) p.trail = content.trailsById.get(pk.item.trailId) || p.trail;
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
  if (p.god) return; // cheat: invulnerable
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

// HUD text with a 1px dark shadow so it stays readable over any background.
function hudText(text, x, y, color, font) {
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ---- render --------------------------------------------------------------
function frame() {
  tick++;
  input.poll();
  handleGamepad();
  input.endPoll();
  updateGpStatus();
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
  draw.drawRoom(ctx, ROOM, room.neighbors, rs.cleared, tick);
  for (const rk of rs.obstacles) draw.drawRock(ctx, rk);
  draw.drawTrail(ctx, rs.trail, G.player.trail, tick);
  for (const ch of rs.chests) draw.drawChest(ctx, ch, tick);
  for (const pk of rs.pickups) draw.drawPickup(ctx, pk, tick);
  for (const pr of G.projectiles) draw.drawProjectile(ctx, pr);
  for (const b of rs.bombs) draw.drawBomb(ctx, b);
  for (const e of rs.enemies) draw.drawEntity(ctx, e, false);
  draw.drawEntity(ctx, G.player, true);
  for (const ex of rs.explosions) draw.drawExplosion(ctx, ex);

  // ---- HUD (drawn on a dark strip so bigger text stays legible) ----
  ctx.fillStyle = 'rgba(12,9,16,0.82)';
  ctx.fillRect(0, 0, W, ROOM.y0 - ROOM.wall - 2); // strip above the walls
  ctx.textAlign = 'left';

  // Row 1: hearts + name/weapon/floor
  draw.drawHearts(ctx, G.player, 20, 24, 1.3);
  const nameX = 20 + draw.heartsWidth(G.player, 1.3) + 18;
  hudText(`${G.playerDef.name}  ·  ${G.player.weapon ? G.player.weapon.name : 'Unarmed'}  ·  Floor ${G.floorNum}`,
    nameX, 30, '#c9bcd8', 'bold 16px monospace');

  // Row 2: bombs/keys + combat stats
  draw.drawResources(ctx, G.player, 20, 56);
  const eff = effectiveWeapon(G.player) || { damage: 0, fireRate: 0 };
  hudText(
    `DMG ${eff.damage.toFixed(1)}   RATE ${eff.fireRate.toFixed(1)}   SPD ${effectiveMoveSpeed(G.player).toFixed(1)}   ·   Items ${G.player.items.length}`,
    nameX, 62, '#e8def2', 'bold 17px monospace',
  );

  // sound indicator (bottom-right, clear of the minimap)
  ctx.fillStyle = '#9a86b8'; ctx.font = '13px monospace'; ctx.textAlign = 'right';
  ctx.fillText(audio.isMuted() ? '🔇 muted (M)' : '🔊 sound (M)', W - 20, H - 14);
  ctx.textAlign = 'left';

  if (room.type === 'boss' && !rs.cleared) {
    ctx.fillStyle = '#ff6a5a'; ctx.textAlign = 'center'; ctx.font = 'bold 18px monospace';
    ctx.fillText('— BOSS —', W / 2, ROOM.y0 + 28); ctx.textAlign = 'left';
  } else if (room.type === 'treasure') {
    ctx.fillStyle = '#e0c84a'; ctx.textAlign = 'center'; ctx.font = 'bold 18px monospace';
    ctx.fillText('✦ TREASURE ✦', W / 2, ROOM.y0 + 28); ctx.textAlign = 'left';
  }

  ctx.textAlign = 'center';
  if (G.bossCleared) {
    ctx.fillStyle = '#7ed957'; ctx.font = '15px monospace';
    const msg = isTouchDevice
      ? 'Boss defeated — grab your reward, then tap DESCEND or press SPACE / A'
      : 'Boss defeated — grab your reward, then press SPACE or A to descend';
    ctx.fillText(msg, W / 2, H - 16);
  }
  if (G.banner && tick < G.banner.until) {
    ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 16px monospace';
    ctx.fillText(G.banner.text, W / 2, 108);
  }
  ctx.textAlign = 'left';

  draw.drawMinimap(ctx, G.floor, G.roomState, G.currentKey, W - 150, 18);
  drawTouchControls();
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
  ctx.fillText('Click / tap a character or press its number. WASD or left stick move · Arrows or right stick shoot', W / 2, 118);
  if (isTouchDevice) {
    ctx.fillStyle = '#7a9cb8';
    ctx.fillText('Touch: tap a character card to begin', W / 2, 136);
  }

  content.players.forEach((pd, i) => {
    const y = CARD.top + i * (CARD.height + CARD.gap);
    const selected = i === (G.selectedIndex ?? 0);
    ctx.fillStyle = selected ? '#3a3148' : '#2b2330';
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

// ---- cheat / test panel --------------------------------------------------
function curRoom() { return G && G.roomState.get(G.currentKey); }
const Cheat = {
  item(id) { const it = content.itemsById.get(id); const rs = curRoom(); if (it && rs) { rs.pickups.push(makeItemPickup(it, G.player.x + 40, G.player.y)); banner('Spawned: ' + it.name); } },
  weapon(id) { const w = content.weapons.get(id); if (w && G) { G.player.weapon = w; banner('Weapon: ' + w.name); } },
  enemy(id) { const d = content.characters.get(id); const rs = curRoom(); if (d && rs) { const e = spawnEntity(d, G.player.x + 70, G.player.y, content.weapons); scaleForFloor(e, G.floorNum); rs.enemies.push(e); rs.cleared = false; banner('Spawned: ' + d.name); } },
  consumable(kind) { if (!G) return; const p = G.player; if (kind === 'heart') p.health = Math.min(p.maxHealth, p.health + 2); else if (kind === 'bomb') p.bombs++; else if (kind === 'key') p.keys++; },
  trail(id) { if (G) { G.player.trail = content.trailsById.get(id) || null; banner('Trail: ' + (G.player.trail ? G.player.trail.name : 'none')); } },
  god() { if (G) { G.player.god = !G.player.god; banner('God mode: ' + (G.player.god ? 'ON' : 'off')); } },
  heal() { if (G) { G.player.maxHealth += 2; G.player.health = G.player.maxHealth; banner('+ Heart container'); } },
  floor() { if (G && G.state === 'play') nextFloor(); },
  clear() { const rs = curRoom(); if (rs) rs.enemies = []; },
};
window.__cheat = Cheat;

const cheatBtn = document.getElementById('cheatBtn');
const cheatPanel = document.getElementById('cheatPanel');
if (cheatBtn && cheatPanel) {
  cheatBtn.addEventListener('click', () => {
    if (!content) return;
    if (!cheatPanel.dataset.built) { buildCheatPanel(); cheatPanel.dataset.built = '1'; }
    cheatPanel.classList.toggle('open');
  });
}

function buildCheatPanel() {
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b; };
  const section = (title, entries) => {
    const h = document.createElement('h3'); h.textContent = title; cheatPanel.appendChild(h);
    const g = document.createElement('div'); g.className = 'grid';
    for (const e of entries) g.appendChild(e);
    cheatPanel.appendChild(g);
  };
  cheatPanel.innerHTML = '';
  const close = mk('✕ close', () => cheatPanel.classList.remove('open')); close.className = 'close';
  cheatPanel.appendChild(close);
  const title = document.createElement('h3'); title.textContent = 'CHEATS / TEST'; cheatPanel.appendChild(title);
  const note = document.createElement('p'); note.className = 'note'; note.textContent = 'Start a run first; spawns appear by the player.'; cheatPanel.appendChild(note);

  section('Toggles', [
    mk('God mode', () => Cheat.god()), mk('+ Heart container', () => Cheat.heal()),
    mk('Next floor', () => Cheat.floor()), mk('Clear room', () => Cheat.clear()),
  ]);
  section('Consumables', [
    mk('+ Bomb', () => Cheat.consumable('bomb')), mk('+ Key', () => Cheat.consumable('key')), mk('Heal', () => Cheat.consumable('heart')),
  ]);
  section('Weapons', [...content.weapons.values()].map((w) => mk(w.name, () => Cheat.weapon(w.id))));
  if (content.trails.length) {
    section('Trails', content.trails.map((t) => mk(t.name, () => Cheat.trail(t.id))).concat(mk('none', () => Cheat.trail('__none'))));
  }
  section('Spawn item', content.items.map((it) => mk(it.name, () => Cheat.item(it.id))));
  section('Spawn enemy', [...content.enemies, ...content.bosses].map((c) => mk(c.name, () => Cheat.enemy(c.id))));
}

// ---- touch input ---------------------------------------------------------
function canvasPoint(t) {
  const r = canvas.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}
const inCircle = (p, b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.r;
const inRect = (p, r) => Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.y - r.y) <= r.h / 2;

function stickVec(p, s) {
  s.cx = p.x; s.cy = p.y;
  const dx = p.x - s.bx, dy = p.y - s.by;
  const len = Math.hypot(dx, dy);
  if (len < 12) return { x: 0, y: 0 };
  const m = Math.min(1, len / 60);
  return { x: (dx / len) * m, y: (dy / len) * m };
}

function onTouchStart(e) {
  e.preventDefault();
  audio.resume();
  for (const t of e.changedTouches) {
    const p = canvasPoint(t);
    if (inCircle(p, MUTE_BTN())) { audio.toggleMute(); continue; }
    if (!G) continue;
    if (G.state === 'select') {
      const i = playerCardIndexAt(p.y);
      if (i != null && i < content.players.length) startNewRun(content.players[i]);
      continue;
    }
    if (G.state === 'dead') { startNewRun(G.playerDef); continue; }
    if (G.state === 'play') {
      if (G.bossCleared && inRect(p, DESCEND_BTN())) { nextFloor(); continue; }
      if (inCircle(p, BOMB_BTN())) { placeBomb(); continue; }
      const mg = MOVE_GUIDE(), ag = AIM_GUIDE();
      const nearMove = Math.hypot(p.x - mg.x, p.y - mg.y) < 80;
      const nearAim = Math.hypot(p.x - ag.x, p.y - ag.y) < 80;
      if ((p.x < W / 2 || nearMove) && moveStick.id === null) {
        const g = nearMove ? mg : p;
        moveStick.id = t.identifier; moveStick.bx = moveStick.cx = g.x; moveStick.by = moveStick.cy = g.y;
        touchMove = { x: 0, y: 0 };
      } else if ((p.x >= W / 2 || nearAim) && aimStick.id === null) {
        const g = nearAim ? ag : p;
        aimStick.id = t.identifier; aimStick.bx = aimStick.cx = g.x; aimStick.by = aimStick.cy = g.y;
        touchAim = { x: 0, y: 0 };
      }
    }
  }
}
function onTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = canvasPoint(t);
    if (moveStick.id === t.identifier) touchMove = stickVec(p, moveStick);
    else if (aimStick.id === t.identifier) touchAim = stickVec(p, aimStick);
  }
}
function onTouchEnd(e) {
  for (const t of e.changedTouches) {
    if (moveStick.id === t.identifier) { moveStick.id = null; touchMove = { x: 0, y: 0 }; }
    else if (aimStick.id === t.identifier) { aimStick.id = null; touchAim = { x: 0, y: 0 }; }
  }
}
canvas.addEventListener('touchstart', onTouchStart, { passive: false });
canvas.addEventListener('touchmove', onTouchMove, { passive: false });
canvas.addEventListener('touchend', onTouchEnd);
canvas.addEventListener('touchcancel', onTouchEnd);

// Drawn on-canvas controls (only on touch devices).
function drawTouchControls() {
  if (!isTouchDevice || !G || G.state !== 'play') return;

  // faint joystick guides (always visible so players know where to touch)
  for (const [g, col, label] of [
    [MOVE_GUIDE(), '#9cd2ff', 'MOVE'],
    [AIM_GUIDE(), '#ff9c6a', 'AIM'],
  ]) {
    if ((label === 'MOVE' && moveStick.id !== null) || (label === 'AIM' && aimStick.id !== null)) continue;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.x, g.y, 56, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = col; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(g.x, g.y, 22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.45; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, g.x, g.y + 78);
    ctx.globalAlpha = 1;
  }

  // active sticks
  for (const [s, col] of [[moveStick, '#9cd2ff'], [aimStick, '#ff9c6a']]) {
    if (s.id === null) continue;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.bx, s.by, 56, 0, Math.PI * 2); ctx.stroke();
    const dx = s.cx - s.bx, dy = s.cy - s.by; const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(56, len) / len;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(s.bx + dx * k, s.by + dy * k, 26, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // bomb button
  const bb = BOMB_BTN();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(40,32,52,0.8)';
  ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6a5a7a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#23202a';
  ctx.beginPath(); ctx.arc(bb.x, bb.y + 3, 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.beginPath(); ctx.moveTo(bb.x, bb.y - 13); ctx.lineTo(bb.x + 5, bb.y - 22); ctx.stroke();
  ctx.fillStyle = '#e8def2'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`×${G.player.bombs}`, bb.x, bb.y + 40);
  // mute button
  const mb = MUTE_BTN();
  ctx.fillStyle = 'rgba(40,32,52,0.8)';
  ctx.beginPath(); ctx.arc(mb.x, mb.y, mb.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6a5a7a'; ctx.stroke();
  ctx.fillStyle = '#e0d6ea'; ctx.font = '18px monospace';
  ctx.fillText(audio.isMuted() ? '🔇' : '🔊', mb.x, mb.y + 6);
  ctx.globalAlpha = 1;
  // descend button after boss
  if (G.bossCleared) {
    const d = DESCEND_BTN();
    ctx.fillStyle = '#2e6b3a';
    ctx.fillRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
    ctx.fillStyle = '#dfffe4'; ctx.font = 'bold 18px monospace';
    ctx.fillText('⏬ TAP TO DESCEND', d.x, d.y + 6);
  }
  ctx.textAlign = 'left';
}

// Dev hook: lets tooling/console inspect live state. Harmless in normal play.
window.__game = () => G;

requestAnimationFrame(frame);
