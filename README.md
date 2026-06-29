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
- **E** — drop a bomb (destroys rocks, damages enemies, blasts chests open — and hurts you if you're too close)
- **R** — start a new run
- **SPACE** — descend to the next floor after beating the boss
- Clear a room's enemies to open its doors. Rooms have **rock** layouts that block you and your shots.
- **Chests** hold rewards — gold ones are locked (use a **key**, or bomb them open).
- Find the **treasure room** (locked chest) and beat the **boss room** to clear the floor.
- **Items** boost your stats for the run and persist between floors; **hearts/bombs/keys** drop from enemies and rocks.

## Design content

Open the **designer**, edit characters/enemies, weapons and items, and draw 16×16 pixel
sprites for each (live preview on the right). When running under `serve.js`, **Save to
server** writes `content.json` straight to disk — no download/drop step. (**Download** is
still there as a fallback for when you're not using `serve.js`.) Reload the game and your
content is live.

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
