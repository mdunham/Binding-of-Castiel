# IsaacLike — Design Spec

**Date:** 2026-06-28
**Status:** Approved (quick mode)

A standalone, zero-dependency Binding of Isaac–style game whose characters, enemies,
and weapons are all authored in a separate browser-based **designer** app and shared
through a single `content.json` file.

## Goals

1. A playable top-down twin-stick roguelike: connected rooms, doors, minimap,
   clear-room-to-advance, boss room.
2. A separate designer app to author characters, enemies, and weapons.
3. Both apps are vanilla HTML/CSS/JS — no build step, no npm dependencies.
4. The game is fully data-driven: everything spawnable comes from `content.json`.

## Project layout

```
IsaacLike/
├── content.json            # shared data (characters, weapons)
├── serve.js                # zero-dep Node static server (game + designer + json need http)
├── package.json            # scripts: start, test
├── game/
│   ├── index.html
│   └── src/
│       ├── main.js         # game loop + state machine
│       ├── content.js      # loadContent() + pure validateContent()
│       ├── input.js        # keyboard state
│       ├── weapons.js      # spawn projectiles from a weapon def
│       ├── entities.js     # player/enemy entity + AI (chase/wander/shooter)
│       ├── floor.js        # PURE procedural floor/room generation
│       ├── combat.js       # PURE collision/damage helpers
│       └── render.js       # all canvas drawing
├── designer/
│   ├── index.html
│   ├── designer.css
│   └── designer.js
└── tests/
    ├── run.js              # tiny zero-dep test runner
    ├── content.test.js
    ├── floor.test.js
    └── combat.test.js
```

## Data model (`content.json`)

```jsonc
{
  "characters": [
    {
      "id": "isaac", "name": "Isaac",
      "role": "player",            // "player" | "enemy" | "boss"
      "maxHealth": 6,              // half-hearts
      "moveSpeed": 2.6,            // px/frame
      "size": 13,                  // radius px
      "color": "#e8d8b0",
      "weaponId": "tears",
      "ai": "chase",               // enemy/boss only: chase | wander | shooter
      "contactDamage": 1           // enemy/boss only, in half-hearts
    }
  ],
  "weapons": [
    {
      "id": "tears", "name": "Tears",
      "damage": 3.5,
      "fireRate": 2.5,             // shots/sec
      "projectileSpeed": 5.0,      // px/frame
      "range": 55,                 // lifetime in frames * speed; tuned as frames
      "projectileSize": 6,
      "color": "#9cd2ff",
      "shotCount": 1,              // >1 = spread
      "spread": 12,                // degrees between shots
      "piercing": false
    }
  ]
}
```

- Characters and enemies share one shape, keyed by `role`. The designer edits both
  with one form.
- Weapons are referenced by `id`. Validation enforces unique ids and resolvable
  `weaponId` references.

## Game behaviour

- **Start screen:** choose any `role:"player"` character.
- **Controls:** WASD move, Arrow keys shoot (twin-stick). `R` restart, `M` minimap toggle.
- **Floor gen:** BoI-style growth on a grid from a center start room; farthest dead-end
  becomes the boss room; other rooms get random `role:"enemy"` spawns.
- **Doors:** locked while a room has live enemies; open when cleared. Walking through a
  door transitions to the neighbouring room.
- **Combat:** player projectiles damage enemies; enemy contact + shooter projectiles
  damage player (half-hearts, with i-frames). Death → game over; clearing the boss room →
  floor cleared (press R for a fresh, harder floor).
- **HUD:** hearts, current weapon, minimap.

## Pure / testable units

- `validateContent(data)` — structural + reference validation.
- `generateFloor(rng, opts)` — deterministic given a seeded rng; returns room graph.
- `combat.js` — circle/circle hit test, door-region test, damage application.

## Success criteria

Author a character + weapon + enemy in the designer, save `content.json`, open the game,
and play through a generated floor (including the boss) using exactly that content.
Tests pass: `node tests/run.js`.
