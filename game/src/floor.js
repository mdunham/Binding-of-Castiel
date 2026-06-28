// floor.js — PURE procedural floor generation (no DOM). Deterministic given an rng.
// Produces a Binding of Isaac–style branchy room graph on a grid.

/** Tiny seedable RNG (mulberry32). Returns a function -> float in [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  { dx: 0, dy: -1, dir: 'up', opp: 'down' },
  { dx: 1, dy: 0, dir: 'right', opp: 'left' },
  { dx: 0, dy: 1, dir: 'down', opp: 'up' },
  { dx: -1, dy: 0, dir: 'left', opp: 'right' },
];

const key = (x, y) => `${x},${y}`;

/**
 * Generate a floor.
 * @param {() => number} rng
 * @param {{ roomCount?: number, gridSize?: number }} opts
 * @returns {{ rooms: Map<string,Room>, start: string, boss: string, gridSize: number }}
 *   Room = { x, y, neighbors: {up,down,left,right?:string}, type: 'start'|'normal'|'boss', distance }
 */
export function generateFloor(rng, opts = {}) {
  const roomCount = Math.max(5, opts.roomCount ?? 9);
  const gridSize = opts.gridSize ?? 11;
  const center = Math.floor(gridSize / 2);

  const rooms = new Map();
  const startKey = key(center, center);
  rooms.set(startKey, makeRoom(center, center, 'start'));

  // BoI-style growth: keep a frontier queue; add neighbours probabilistically,
  // rejecting cells that already touch >1 placed room (keeps it branchy).
  const queue = [{ x: center, y: center }];
  while (rooms.size < roomCount && queue.length) {
    const { x, y } = queue.shift();
    for (const d of DIRS) {
      if (rooms.size >= roomCount) break;
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
      const nk = key(nx, ny);
      if (rooms.has(nk)) continue;
      if (countPlacedNeighbors(rooms, nx, ny) > 1) continue;
      if (rng() < 0.5) continue; // skip sometimes for irregular shape
      rooms.set(nk, makeRoom(nx, ny, 'normal'));
      queue.push({ x: nx, y: ny });
    }
    // If growth stalled but we still need rooms, re-seed from a random placed room.
    if (queue.length === 0 && rooms.size < roomCount) {
      const keys = [...rooms.keys()];
      const k = keys[Math.floor(rng() * keys.length)];
      const r = rooms.get(k);
      queue.push({ x: r.x, y: r.y });
    }
  }

  // Wire up neighbour links between adjacent placed rooms.
  for (const room of rooms.values()) {
    for (const d of DIRS) {
      const nk = key(room.x + d.dx, room.y + d.dy);
      if (rooms.has(nk)) room.neighbors[d.dir] = nk;
    }
  }

  // BFS distances from start, then pick the farthest dead-end as the boss room.
  bfsDistances(rooms, startKey);
  const bossKey = pickBossRoom(rooms, startKey);
  rooms.get(bossKey).type = 'boss';

  return { rooms, start: startKey, boss: bossKey, gridSize };
}

function makeRoom(x, y, type) {
  return { x, y, neighbors: {}, type, distance: 0 };
}

function countPlacedNeighbors(rooms, x, y) {
  let n = 0;
  for (const d of DIRS) if (rooms.has(key(x + d.dx, y + d.dy))) n++;
  return n;
}

function bfsDistances(rooms, startKey) {
  for (const r of rooms.values()) r.distance = Infinity;
  rooms.get(startKey).distance = 0;
  const q = [startKey];
  while (q.length) {
    const ck = q.shift();
    const room = rooms.get(ck);
    for (const nk of Object.values(room.neighbors)) {
      const nr = rooms.get(nk);
      if (nr.distance > room.distance + 1) {
        nr.distance = room.distance + 1;
        q.push(nk);
      }
    }
  }
}

function pickBossRoom(rooms, startKey) {
  let best = startKey;
  let bestDist = -1;
  for (const [k, room] of rooms) {
    if (k === startKey) continue;
    const deadEnd = Object.keys(room.neighbors).length === 1;
    // Prefer dead-ends; among them (or all, as fallback) the farthest from start.
    const score = room.distance + (deadEnd ? 1000 : 0);
    if (score > bestDist) { bestDist = score; best = k; }
  }
  return best;
}
