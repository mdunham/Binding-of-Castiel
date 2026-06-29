import { test, eq, ok, approx } from './run.js';
import {
  circlesOverlap, clampToRect, unitToward, inDoorGap, applyDamage,
  pointInRect, circleIntersectsRect, resolveCircleRect, resolveCircleRects,
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

  test('door trigger is radius-aware (large characters can pass)', () => {
    const cx = (room.x0 + room.x1) / 2;
    const radius = 28; // bigger than doorDepth (26)
    // A radius-28 player clamps to the wall at y = y1 - radius and must still trigger.
    const clampedY = room.y1 - radius;
    ok(!inDoorGap(cx, clampedY, 'down', room), 'without radius, big char cannot trigger');
    ok(inDoorGap(cx, clampedY, 'down', room, radius), 'with radius, it triggers');
  });

  test('applyDamage reports death at/under zero', () => {
    const e = { health: 5 };
    ok(!applyDamage(e, 3), 'survives 3 of 5');
    eq(e.health, 2, 'health reduced');
    ok(applyDamage(e, 2), 'dies at exactly zero');
  });

  const rect = { x: 100, y: 100, w: 40, h: 40 };

  test('pointInRect', () => {
    ok(pointInRect(120, 120, rect), 'inside');
    ok(!pointInRect(90, 120, rect), 'outside left');
  });

  test('circleIntersectsRect detects edge overlap and clear miss', () => {
    ok(circleIntersectsRect(95, 120, 8, rect), 'circle straddling left edge');
    ok(!circleIntersectsRect(80, 120, 8, rect), 'circle clear of the rect');
  });

  test('resolveCircleRect pushes a circle out along the nearest edge', () => {
    // Circle overlapping the left edge should be pushed further left (x decreases).
    const out = resolveCircleRect(105, 120, 10, rect);
    ok(out.x < 105, 'pushed left out of the rect');
    ok(!circleIntersectsRect(out.x, out.y, 10, rect), 'no longer overlapping');
  });

  test('resolveCircleRect leaves a non-overlapping circle unchanged', () => {
    const out = resolveCircleRect(50, 50, 8, rect);
    eq(out, { x: 50, y: 50 }, 'unchanged');
  });

  test('resolveCircleRects clears overlaps against multiple rocks', () => {
    // Two well-separated rocks; the circle overlaps only the first.
    const rocks = [rect, { x: 220, y: 100, w: 30, h: 40 }];
    const out = resolveCircleRects(105, 120, 10, rocks);
    ok(!rocks.some((r) => circleIntersectsRect(out.x, out.y, 10, r)), 'clear of all rocks');
  });
}
