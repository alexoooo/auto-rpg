# A main menu, and levels after Diablo's Cathedral -- overview

## What the owner asked for

1. **One game with a main menu**, not two detached pages. The menu offers **New Game** (the
   top-down dungeon mode, today's `/dungeon.html`) and **Arena** (today's duel, `/`).
2. **Better level design** for the dungeon. The owner likes Diablo 1's levels and asked whether we
   can do better. Wave function collapse was considered and set aside for layout: it is good at
   local variety and blind to the things a level is judged on (connectivity, room size, the route
   from start to exit). It may come back later as a way of dressing a level, which this plan does
   not cover.

## What Diablo 1 does, and what we change

From devilution's reconstruction of the Cathedral generator (`Source/drlg_l1.cpp`):

- `L5firstRoom` lays a spine of up to three rooms along one axis of a 40x40 grid, joined by
  hallways; `L5roomGen` recursively branches rooms of 2 to 10 units off their sides, refusing
  overlaps.
- `L5GetArea` counts the floor, and the level is thrown away and regenerated if it is too small.
- `L5makeDungeon` doubles the grid to 80x80, and `L5makeDmt` turns the floor mask into wall tiles
  through a lookup table.
- `L5AddWall` draws walls across the larger rooms with a gap or door in them. These are what make
  the Cathedral read as ambushes and half-seen spaces rather than as boxes.
- `DRLG_L5Subs` swaps random floor tiles for variants, and the quest set pieces are stamped in.

What we keep: the spine, the branching, the regenerate-if-bad rule and the walls across rooms.
What we add, because it is where Diablo is weak:

- **Loops** (Brogue's rule): where two open spaces are close through rock and far apart on foot,
  open a passage. Diablo's levels are trees, so every dead end is a walk back.
- **Candidates scored and the best kept**, rather than the first one big enough.
- **Clearance by construction**: the level is laid out on 3 m blocks, so no passage is narrower
  than the widest body. Three invariants are checked at the widest hero's footprint: every cell it
  can stand on reaches every other, every corridor is still a way through after walls and set
  pieces are drawn, and no floor is out of its reach.
- **Authored set pieces** stamped into rooms that fit them.

What we deliberately do not do yet: lock-and-key cycles (Unexplored's cyclic generation). The
dungeon has no items or keys, so a lock would be a door with a different colour. It comes back
if the game grows keys.

## Sessions

| # | File | Lands |
|---|------|-------|
| 01 | `-01-main-menu.md` | One document with three screens: menu, arena, dungeon. |
| 02 | `-02-rooms.md` | `src/dungeon/level.ts`: spine, branches, walls with arches, doors, start, exit, spawns. An ASCII printer. Not yet used by the run. |
| 03 | `-03-loops-and-choice.md` | The loop pass, the metrics, and the best of several candidates. |
| 04 | `-04-the-hero-slides.md` | A fix to today's run: the hero slides along walls and replans a leg it is stuck on. |
| 05 | `-05-into-the-run.md` | The dungeon plays on the new levels. The old generator becomes a test fixture. |
| 06 | `-06-set-pieces.md` | Three authored room templates. |

01 is independent of the rest and can land first or in parallel. 04 is independent of 02 and 03
and fixes a bug the dungeon ships today: automatic exploration sticks on a corridor wall on 19 of
21 classic seeds, and the one seed its test ran is one of the two that work. 05 needs 02, 03 and
04. 02 and 03 change nothing a player sees. Their output prints as ASCII
(`node scripts/dungeon/print-level.mjs 1 2 3 4`), which is for checking the generator does what it
says, not for judging the levels: those are judged in play, in 05, before 06 adds anything. That is
the "simplest version first" rule: play the plain levels before paying for set pieces.

**How the generator sessions were checked.** Sessions 02, 03 and 06 were built as a scratch
prototype outside the tree, and their tests, copied from these files, were run against it: all 20
pass in 1.3 s, and every mutation each session lists goes red, or stays green, as it says.
Session 04's fix was measured the same way, served in place of the real files by a Node loader
hook, and the full suite passed with it. The prototype is evidence that the plans are
implementable and that their thresholds are real. It is not the implementation, and each session
still asks for its own figures.

**Not in this plan: the look.** Textured wall blocks, floor variation, torchlight and props (the
concept image) are the next plan, written once the owner has played the new layouts. They do not
depend on how the layout was made.

## Constants introduced

All in `LEVEL`, a frozen table at the head of `src/dungeon/level.ts` (the dungeon has no table in
`src/config.ts`, and a level rule is not a console-tunable dial):

| Constant | Value | Why |
|---|---|---|
| `blocks` | 17 | 17 x 3 = 51 fine cells, the size the run was built and measured at. Findpath's open list is a linear scan, so a larger map is a cost to measure first. |
| `block` | 3 | Fine cells (metres) per block. Every corridor and arch is a whole block wide. |
| `clearance` | 0.65 | The widest hero: `LOCOMOTION_MULTILEG.footprintRadius` 0.50 at size x1.25 is 0.625. Wheel bodies are refused as heroes by `src/dungeon/main.ts`. |
| `roomMin`, `roomMax` | 2, 4 | Room sides in blocks: 6 m to 12 m. Today's rooms are 9 m and 11 m. |
| `corridorMax` | 2 | Corridor length in blocks. |
| `maxRooms`, `minRooms` | 11, 6 | Today's floor has 7. |
| `branchChance`, `branchDecay` | 0.75, 0.8 | Chance a side of a room grows a room, falling with depth. |
| `dividerChance`, `dividerMinBlocks` | 0.6, 3 | Walls across rooms at least 9 m long. |
| `doorChance` | 0.6 | Doors per corridor. Today every corridor has two. |
| `spawnCount` | 8 | Today's count, so a run is as hard as it was. |
| `minExitPath` | 24 | Metres on foot from start to exit, cell to cell. A guard: the prototype's shortest over 24 seeds was 50. |
| `loops`, `loopMinDetour` | 3, 6 | Session 03. At most three loops, each saving at least six blocks of walking. |
| `candidates` | 12 | Session 03. Levels scored per seed. |

## The owner's decisions

- The game is **Auto-RPG**. The menu's title and every document title carry it ("Auto-RPG",
  "Golem Duel · Auto-RPG", "The Depths · Auto-RPG"), and so does the dungeon's top bar, which
  said "THE FORGE". The Forge remains the arena's room.
- New Game is the dungeon; Arena is the duel. There is one document: `index.html`.
- The level score's weights and the facing lag are judged in play, not before (session 05's
  checklist).
- WFC is not the layout generator.

## Decisions the owner may want to reverse

1. **Every screen change is a navigation within `index.html`** (`./`, `?play=arena`,
   `?play=dungeon`), not a switch inside one running document. The arena's `boot` in
   `src/main.ts` has no teardown at all, and a navigation is the one teardown guaranteed complete.
   The player sees one page with one menu and a short load between screens, and the Back button
   works. A seamless switch needs a dispose path through the whole arena host plus a leak census
   like `twenty_five_golem_rebuilds_return_every_counted_resource_to_baseline`. That is a session
   of its own, worth writing only if the load is a problem in play.
2. **`/dungeon.html` stays as a one-line redirect** to `./?play=dungeon`, so old links and
   bookmarks still work. It could be deleted.
3. **The map stays 51 m square.** Diablo's levels are larger. `LEVEL.blocks` is the dial, after
   measuring `findPath` and `reveal` on a bigger grid.
4. **No lock-and-key** until the game has keys.
5. **Every body slides along walls** (session 04), the keyboard player's included. Pushing
   diagonally into a wall used to stop the hero dead; it now moves it along the wall. The fix for
   exploration needs it for the automatic hero, and giving it to one kind of mover and not another
   would mean two collision rules.

## What must not move

- **The arena.** Every test that reads `index.html`, `src/main.ts` or `src/style.css` as text
  (`tests/host-run.test.mjs`, `tests/arena.test.mjs`) keeps passing unchanged, because the arena's
  markup moves into a `<template>` verbatim and `src/main.ts` stays the arena.
- **Old arena links.** `/?matchup=...` still opens the arena directly.
- **The research preview.** `research/preview.mjs` and the `preview` command in
  `research/lab/cli.mjs` inject policies before the arena boots. They follow the entry to
  `src/app.ts`, and `tests/research.test.mjs` follows them.
- **The run on a known layout.** The physical dungeon tests that pin geometry keep their exact
  layouts by moving onto the old generator as a fixture (session 05), so a change in them is a
  change in the run and not in the map.

## Verification, every session

```powershell
npm test
npm run check
npm run build
git diff --cached --numstat            # must match the next line exactly
git diff --cached --ignore-cr-at-eol --numstat
```

- Mutation-check each new test (each session lists its mutations), then re-touch the mutated
  files and grep the served text on the owner's server before trusting the page (AGENTS.md).
- Browser checks run on the owner's server at `http://localhost:5180/`. Navigate, do not reload.
  Do not start or restart a server.
- An adversarial review before each commit.

## Landed session files

The session files that landed were deleted on 2026-09-25. Read them with
`git show 30dcb8c:docs/plans/<file>`.
