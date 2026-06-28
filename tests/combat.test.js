import { test, eq, ok, approx } from './run.js';
import {
  circlesOverlap, clampToRect, unitToward, inDoorGap, applyDamage,
} from '../game/src/combat.js';

export const NAME = 'combat helpers';

const room = { x0: 60, y0: 96, x1: 840, y1: 580, wall: 22, doorHalf: 34, doorDepth: 26 };

export function run() {
  test('circlesOverlap detects touch and miss', () => {
    ok(circlesOverlap(0, 0, 5, 8, 0, 5), 'overlap when within radii');
    ok(!circlesOverlap(0, 0, 5, 20, 0, 5), 'no overlap when far');
  });

  test('clampToRect keeps circle inside bounds', () => {
    const c = clampToRect(0, 0, 10, 60, 96, 840, 580);
    eq(c.x, 70, 'x clamped to left+radius');
    eq(c.y, 106, 'y clamped to top+radius');
  });

  test('unitToward returns a unit vector', () => {
    const u = unitToward(0, 0, 3, 4);
    approx(Math.hypot(u.x, u.y), 1, 1e-9, 'magnitude 1');
    approx(u.x, 0.6, 1e-9);
    approx(u.y, 0.8, 1e-9);
  });

  test('unitToward handles coincident points', () => {
    const u = unitToward(5, 5, 5, 5);
    eq(u, { x: 0, y: 0 }, 'zero vector');
  });

  test('inDoorGap true at center of top wall, false off-center', () => {
    const cx = (room.x0 + room.x1) / 2;
    ok(inDoorGap(cx, room.y0 + 5, 'up', room), 'in the top doorway');
    ok(!inDoorGap(cx + 200, room.y0 + 5, 'up', room), 'off-center misses door');
    ok(!inDoorGap(cx, (room.y0 + room.y1) / 2, 'up', room), 'middle of room not in doorway');
  });

  test('applyDamage reports death at/under zero', () => {
    const e = { health: 5 };
    ok(!applyDamage(e, 3), 'survives 3 of 5');
    eq(e.health, 2, 'health reduced');
    ok(applyDamage(e, 2), 'dies at exactly zero');
  });
}
