import { test, eq, ok } from './run.js';
import { generateFloor, makeRng } from '../game/src/floor.js';

export const NAME = 'floor generation';

export function run() {
  test('produces the requested room count', () => {
    const floor = generateFloor(makeRng(1), { roomCount: 9 });
    eq(floor.rooms.size, 9, 'room count');
  });

  test('is deterministic for a fixed seed', () => {
    const a = generateFloor(makeRng(42), { roomCount: 10 });
    const b = generateFloor(makeRng(42), { roomCount: 10 });
    eq([...a.rooms.keys()].sort(), [...b.rooms.keys()].sort(), 'same rooms');
    eq(a.boss, b.boss, 'same boss');
  });

  test('start room exists and is type start', () => {
    const floor = generateFloor(makeRng(7), { roomCount: 8 });
    const start = floor.rooms.get(floor.start);
    ok(start, 'start room present');
    eq(start.type, 'start', 'start type');
  });

  test('boss room is distinct from start and typed boss', () => {
    const floor = generateFloor(makeRng(7), { roomCount: 8 });
    ok(floor.boss !== floor.start, 'boss != start');
    eq(floor.rooms.get(floor.boss).type, 'boss', 'boss type');
  });

  test('every room is reachable from start', () => {
    const floor = generateFloor(makeRng(123), { roomCount: 12 });
    for (const room of floor.rooms.values()) {
      ok(room.distance < Infinity, `room ${room.x},${room.y} reachable`);
    }
  });

  test('neighbor links are symmetric', () => {
    const floor = generateFloor(makeRng(99), { roomCount: 11 });
    const opp = { up: 'down', down: 'up', left: 'right', right: 'left' };
    for (const [k, room] of floor.rooms) {
      for (const [dir, nk] of Object.entries(room.neighbors)) {
        const nb = floor.rooms.get(nk);
        ok(nb, `neighbor ${nk} exists`);
        eq(nb.neighbors[opp[dir]], k, `symmetric link ${k}<->${nk}`);
      }
    }
  });
}
