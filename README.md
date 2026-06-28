# IsaacLike

A small **Binding of Isaac–style** top-down roguelike (vanilla JS + Canvas, zero
dependencies) whose **characters, enemies, and weapons are all authored in a separate
designer app** and shared through a single `content.json` file.

```
┌────────────┐   writes    ┌──────────────┐   reads    ┌──────────┐
│  designer/ │ ──────────▶ │ content.json │ ─────────▶ │  game/   │
│  (editor)  │             │  (shared)    │            │ (play)   │
└────────────┘             └──────────────┘            └──────────┘
```

## Run it

ES modules + `fetch('content.json')` need HTTP (not `file://`), so use the bundled
zero-dependency server (requires Node):

```bash
node serve.js          # then open the URLs it prints
# Game     → http://localhost:8080/game/
# Designer → http://localhost:8080/designer/
```

(Any static server works too, e.g. `npx serve`. Serve the **project root**, not a subfolder.)

## Play

- **WASD** — move
- **Arrow keys** — shoot (twin-stick, like Isaac's tears)
- **R** — restart / descend to the next floor
- Clear a room's enemies to open its doors; reach and beat the **boss room** to clear the floor.

## Design content

Open the **designer**, edit characters/enemies and weapons (live preview on the right),
then **Save content.json** and drop the downloaded file into the project root (replacing
the existing one). Reload the game and your content is live.

- **Characters** have a `role`: `player` (selectable), `enemy`, or `boss`. Enemies/bosses
  add an `ai` (`chase` / `wander` / `shooter`) and `contactDamage`.
- **Weapons** are referenced by characters via `weaponId` (damage, fire rate, projectile
  speed/size, spread/shot-count, range, piercing).

The game is fully data-driven: everything that spawns comes from `content.json`.

## Project layout

```
content.json          shared data (characters + weapons)
serve.js              zero-dep static server
game/                 the playable game (Canvas 2D, ES modules in game/src/)
designer/             the content editor (vanilla HTML/CSS/JS)
tests/                zero-dep unit tests for the pure logic
docs/                 design spec
```

## Test

```bash
node tests/run.js      # or: npm test
```

Covers content validation, deterministic floor generation, and combat geometry.
