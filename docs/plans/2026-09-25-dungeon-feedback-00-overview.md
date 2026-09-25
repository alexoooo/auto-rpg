# Dungeon feedback 00: overview

After dungeon look 05 (dressing) the owner played `?play=dungeon`, sent three screenshots, and wrote:

- the see-through-walls area is too small. It should be an oval around the character, with a bit
  of the room around them, and with fading: "it should be obvious that this is a transparency
  bubble, perhaps with some lower alpha value";
- "i'd add a bit more clutter";
- the flames "just kinda float in the transparency bubble", and should be somewhat transparent too;
- the thin shapes (roots and webs) look ok;
- wall decoration is fine, but there should be more of it: higher density, and more types;
- the rooms are all at 45 degrees, which is annoying to walk with WASD. The walls should be
  vertically and horizontally aligned on screen;
- there are a lot of "pointless" rooms, "basically just small cubbies in the wall";
- enemies should be more diverse, including skeletons.

## What each complaint is, measured

- **The bubble.** It is `CUT_AWAY` and `cutAway` in `src/dungeon/fog.ts`, and the same rule in the
  shader in `src/dungeon/fog-plugin.ts`. Today it is 2.4 m by 2.2 m on screen. The ghost is
  13 of 16 pixels dropped at the heart (`most` 0.8), falling to none over the outer 70 % of the
  radius.
- **The flames.** A flame is a `ShaderMaterial` (`"dungeon.fire"`, the arena's `proofFire` shader)
  with no fog plugin. The wall and sconce behind it ghost; the flame does not.
- **The diagonal.** It is the camera, not the rooms. Every room is axis-aligned on the grid.
  `frameDungeon` in `src/dungeon/camera.ts` stands the camera at hero + (20, h, 20), down the
  -X-Z diagonal, and five other places assume that azimuth (session 02 lists them).
- **The cubbies.** `divide` in `src/dungeon/level.ts` draws one fine-cell wall across a long room.
  Its position rule puts the wall one block (3 cells) from an end in 202 of 244 divided rooms
  (seeds 1-50, Node, run inline). Of those one-block strips:
  - 41 are dead-end pockets reached only through the arch;
  - 60 more have a blind end past the arch;
  - only 101 are clean pass-throughs.

  Rooms themselves are never smaller than 6 by 6 cells.
- **Enemies.** `DungeonRun`'s constructor in `src/dungeon/run.ts` draws every spawn uniformly from
  `NAMED_BUILDS` in `src/golem/roster.ts`, which holds the 12 stone builds. Skeletons already
  walk and fight in the dungeon (`tests/skeleton-dungeon.test.mjs`, and `FAMILY_POLICY` in
  `src/golem/family.ts` gives each family its duelist). Nothing draws them, and
  `every_playable_build_is_accepted_at_load` in `tests/roster.test.mjs` pins that no skeleton or
  human build is in `NAMED_BUILDS`. `NAMED_BUILDS` is also the research and tournament pool, so it
  must not widen.
- **Clutter and wall decoration.** These are the `DRESSING` densities in `src/dungeon/dressing.ts`
  and the 4x2 atlas in `src/dungeon/decals.ts`: 5 floor kinds and 2 hung kinds.

## Sessions

Each session lands green on its own, and the owner looks at each one in play.

| # | Session | Moves the level or the fights? |
|---|---|---|
| 01 | A wider, visibly soft cut-away bubble; flames fade with it | no |
| 02 | The camera looks along an axis: walls run across and up the screen, and WASD walks along them | no (visuals, input mapping and dressing placement) |
| 03 | No one-block strips: a room's dividing wall leaves both sides at least two blocks deep | yes: generated levels change |
| 04 | Diverse enemies: skeletons join the stone golems in a dungeon-only pool | yes: who spawns changes |
| 05 | More clutter and more wall decoration: more kinds, higher densities | no |

**Order:** 01, 03, 02, 05, 04.
- 03 changes the levels, and 02 and 05 set floors measured on them: the per-azimuth masonry ray floor, and the
  per-room marking and mural floors. So 03 goes first.
- 05 places wall pieces by the rule 02 rewrites.
- 04 touches no level and no floor, so it may go anywhere after 01.

## What must not move

- **Colliders, navigation and the depths figures, in 01, 02 and 05.**
  - `the_dungeon_builds_the_same_colliders_with_or_without_visuals` pins seeds 1 and 2 by count and
    sha256, and its pins must not change.
  - `scripts/dungeon/sweep.mjs`, plain and with `--visuals`, must match the baseline before the
    session to the hundredth. Record that baseline at the session's start: the physics-rate
    commit `e36832ff` landed after the table in `docs/plans/2026-09-24-dungeon-look-01-light-and-air.md`
    was recorded, so do not compare against that table without re-running it first.
- **03 and 04 move levels and fights by design.** Each re-pins what it moves and records the new
  sweep in its own "What landed", with the old row beside the new one.
  - 03 re-pins the collider hashes for seeds 1 and 2 and the quoted times in
    `the_hero_explores_generated_levels_to_their_exits`.
  - 04 moves who spawns. The sweep empties every level's spawns (`map.spawns = []`), so it must
    not move; 04 measures its fights with a run of its own.
- **The research pool.** `NAMED_BUILDS` is unchanged in every session.
- **The physicality rules** of `docs/plans/2026-09-24-dungeon-look-00-overview.md`:
  - a floor marking is flat;
  - a hung piece stands at most `WALL_ALLOWANCE` past a rock face;
  - nothing solid-looking stands on a floor cell.

  "More clutter" in 05 is therefore flat clutter. Solid clutter (rubble heaps, barrels, crates)
  needs cells the level grid knows about. That belongs with depths session 06's set pieces, and it
  is written down as the owner's decision, not built.

## Constants introduced or moved

- `CUT_AWAY` (01): wider and softer.
- `CAMERA_AZIMUTH` and `cameraToward` in `src/dungeon/camera.ts` (02), with `?azimuth=` in degrees
  to compare. The shipped value is pi: the camera stands at -z of the hero, screen right is +x and
  screen up is +z.
- `LEVEL.dividerMinBlocks` 3 -> 4, and the wall's position rule (03).
- `DUNGEON_ENEMIES` in the new `src/dungeon/enemies.ts` (04).
- `DRESSING` densities and the new kinds; the atlas grows to 4x4 (05).

## Decisions the owner may want to reverse

None of these is asked about before the owner can play it.

- The bubble's size, softness and ghost share (01).
- The azimuth: pi, or a small yaw off the axis so the side walls show a sliver of their faces (02).
  `?azimuth=` compares them.
- Whether a room keeps a dividing wall at all (03). The simplest alternative is none.
- The family weights in the enemy pool, and humans (04): they are left out until their per-frame skinning cost is measured on the owner's machine.
- Solid clutter, which needs depths 06 (05).
