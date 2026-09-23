# Skeleton art -- 02 runtime skin

Put the compiled bones from `-01` on every skeleton on the arena, dungeon and bench pages, with
the primitives kept as the fallback.

## Code

- **`src/golem/skeleton/appearance.ts`** (new).
  - `loadSkeletonAssets()` fetches the GLB once per page and keeps its **bytes** at module level.
    A failure clears the cache so the next call retries.
    - It does not take a scene. The arena runs `loadHumanAssets()` before its scene exists, and
      the dungeon's `rebuild()` builds a new scene and its golems synchronously. Because of both,
      an asynchronous load per scene could never finish first.
  - Templates are made per scene, in a `WeakMap<Scene, ...>`. Each is built synchronously from
    the bytes on the first dress of its key, and is disabled and unpickable.
    - Positions are used exactly as written. The file is in the game's left-handed frame and
      winds like `MeshBuilder`, so nothing is negated or swapped.
  - `dressSkeletonPart(part, palette, next)` answers `null` for a non-skeleton module, a missing
    asset, or a key with no piece. Weapons are the third case. For a part it does draw:
    - It clones the template, parents the clone to `part.host` at the identity, and hides the
      primitive shells.
    - It moves the rune eyes to `extras.eyes` and hands them to `next`, the installed appearance,
      so that forge style's `configure(palette)` still lights them.
    - The roll ring hides its shells and answers `[]`.
  - Material: `palette.boneModel`, a lazy palette material beside `bone` (`src/golem/materials.ts`).
    It has a near-white tint, warm on the left and cool on the right, because a vertex colour
    multiplies the albedo.
    - It is separate from `bone` because the bench shows primitive bone beside modelled bone on one
      stand palette: a ribcage module's primitives next to a carried skull. Retinting `bone` turned
      those primitives white.
  - The key reads the second-last segment of the id.
    - The bench spells that segment as the slot (`locomotion`, `torso`); `SLOT_NAME` maps it to
      `Golem`'s spelling (`legs`, `trunk`).
    - A maul's `trailing` arm takes the pieces of the socket its owner is not in. In a fight that
      is always the left, because `golemEffectorPlan` puts a two-socket module in primary. On the
      bench it is the right after `F` swaps the maul into secondary.
- **`dressGolemPart`** in `src/golem/appearance.ts` calls
  `dressSkeletonPart(part, palette, installed) ?? installed(part, palette)`, where `installed`
  falls back to the primitives. This covers `Golem.register` and the bench's direct calls.
- **Loading.** `src/arena.ts` `buildArena`, `src/dungeon/main.ts` `boot` and `src/bench/main.ts`
  `main` await `loadSkeletonAssets()` beside `loadHumanAssets()`, logging a warning on failure.

## Tests: `tests/skeleton-art.test.mjs`

The fixtures are every `SKELETON_BUILDS` entry, plus fists on both hands and fist-and-whip.
`fetch` is stubbed with the checked-in GLB.

| Test | Pins |
|---|---|
| every part has a piece | Body parts are dressed, weapons are not, the roll ring is empty, and every GLB mesh is used. |
| part key | Prefix stripping, the bench's slot names, the trailing arm on either side, and the fist's split hand. |
| bench | Each skeleton module is built on a stand the way `src/bench/main.ts` builds it, including a maul in either socket. Every body part is dressed, and every collar reaches medially. |
| own material | The primitive bone keeps carved-bone ivory, and the modelled bone is near white on a different material. |
| no authority | No body, parented at the identity, bone material, and the eyes stay rune. |
| rune eyes | The eyes are handed to the installed appearance, the bones are not, and the eyes are in the orbits. |
| body identical | Stepping in one process, with art and without, is `deepEqual`. Without art, every primitive stays. |
| sits on its collider | The centre offset per key, and the long bones' Y span. |
| faces forward | Face and toes on +Z, the neck behind, and each collar reaching medially. |
| winding | Every piece in the file, across two mirrored builds, winds like a `MeshBuilder` sphere. |
| rebuild | 10 build, sever and dispose cycles return to the same count of meshes and materials. |
| failed load | Primitives are used after a 404, and the next load retries. |

The mutation battery run on 2026-09-23 (`.review/mutate*.mjs`, not checked in) turned each of
these red:

- key breaks
- no parent
- offset clone
- host moved
- primitives left
- roll ring drawn
- no template cache
- sticky failure
- eyes not handed on, not moved, or swapped
- bone handed on
- head or thigh vertices offset
- everything negated in Z
- one collar negated in X
- the bench's slot names unmapped
- the trailing arm always drawn on the left
- the modelled bone sharing and retinting `bone`

An adversarial review found the last three as live defects on the bench, after the first battery
had passed. None of the earlier fixtures built a module the way the bench does.

## Done when

`npm test`, `npm run check` and `npm run build` are green, the commit's
`git diff --numstat` matches `--ignore-cr-at-eol`, and an adversarial review has been answered.
