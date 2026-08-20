# Arena 03 -- a body you can look at

**Status:** ready once session 02 has landed. Blocks nothing; 04 and 05 do not wait on it.

The selection screen picks an anatomy and two hands and shows the reader six words. This
session puts the body itself in each column, so that "Brute with a club" is a picture
rather than a pair of `<select>` values.

## What this is not

**It is not a simulation.** No wasm, no Worker, no `arena_start`. The selection screen has
to open under `npm run view` -- Vite with no wasm build -- exactly as the route does today,
and a preview that needed a fight to render would take that away. Everything drawn here
comes from two client-side sources that are already loaded:

- **the authored rest pose**, from `loadCombatantAsset` + `instantiateCombatantDress`
  (`client/src/render/combatant-assets.ts:316`, `client/src/render/combatant-dress.ts:112`),
  which need a `Scene` and nothing else and are memoised per `Scene`; and
- **the item's own dimensions**, from `HAND_ITEMS` in
  `client/src/runtime/arena-config.ts:192`, the same table that fills the configuration
  buffer -- so the sword in the preview is the length the sword in the fight will be, by
  construction rather than by two tables agreeing.

**It is not a presentation session.** No GLB, no sidecar, no material, no LOD threshold,
no lighting rig moves. The visual work owed after the 2026-08-17 production pass is
[its own live topic](concept-production-00-overview.md) and session 12 of it is *"Fighter
and Brute together in the live World route under shipped lighting"*. This session is a
consumer of whatever that topic ships and contributes nothing to it. If the preview makes
a combatant look bad, **that is a finding for that topic and not a texture to tweak here.**

## Do not call `copyCombatantRigPose`

`instantiateCombatantDress` returns an independent skinned clone hung from the durable
semantic node names; `copyCombatantRigPose` (`combatant-dress.ts:77`) is the separate step
that forces those nodes onto a *published* pose. The arena calls it because the simulation
owns the pose there. **The preview must not**, and the reason is the rule the arena's own
scene states from the other side: published quantities place things and invented ones only
fill between them. There is no publication here, so there is nothing to place against --
what the preview shows is the authored rest pose, which is an honest thing to show and is
labelled as one.

## One engine, one canvas, two viewports

`client/src/arena/scene.ts:532-546` already splits one `Scene` across three cameras by
`camera.viewport` and `layerMask`, and `ARENA_VIEWPORTS` in
`client/src/arena/geometry.ts:326-341` holds the rectangles.

**The preview draws into `#arena-3d`, the canvas the stage already owns, and does not add
one of its own.** A Babylon `Engine` renders to the canvas it was constructed against, and
`#/arena` has exactly one 3D canvas (`web/index.html:507`; `:518`, `:524` and `:531` are
the 2D panels). So "one engine, two viewports" and "a new `<canvas id="preview">`" are
mutually exclusive, and the first is the one worth keeping: a second `Engine` is a second
WebGPU device, a second render loop and a second thing to lose on context loss.

The two phases never coexist, which is what makes sharing the canvas cheap: in `select`
the canvas carries two preview cameras and the stage's three are inactive; in `fight` it
carries the stage's and the preview's are gone. `scene.activeCameras` is the switch.

```ts
// client/src/arena/preview.ts -- new
export const PREVIEW_VIEWPORTS = [
  new Viewport(0.0, 0, 0.5, 1),   // Fighter A, the left column
  new Viewport(0.5, 0, 0.5, 1),   // Fighter B, the right column
] as const;

/**
 * Bit per side, so a dress hung for A is invisible to B's camera.
 *
 * **Above the stage's, deliberately.** `CAMERA_BITS` at
 * `client/src/arena/scene.ts:125` is `[0x1, 0x2, 0x4]`, and a preview sharing the
 * `Scene` with `[0x1, 0x2]` would make Fighter A's preview visible to the first
 * eye-height camera. Distinct bits, and
 * `no_preview_bit_collides_with_a_stage_camera_bit` asserts the two sets are
 * disjoint rather than leaving it to whoever adds a fourth stage camera.
 */
export const PREVIEW_CAMERA_BITS = [0x8, 0x10] as const;

export interface CombatantPreview {
  /** Rebuilds one side from its choice. Cheap enough to call per `change`. */
  show(side: 0 | 1, choice: SideChoice): void;
  /** One turn of the turntable. Pure in `frame`; see below. */
  draw(frame: number): void;
  dispose(): void;
}
```

The turntable angle is **a pure function of a frame counter and not of the wall clock**:

```ts
const PREVIEW_TURN_TICKS = 480;   // eight seconds at 60 Hz
const yaw = (frame % PREVIEW_TURN_TICKS) / PREVIEW_TURN_TICKS * Math.PI * 2;
```

The arena's gait is pure for a reason it writes down -- a picture whose content depends on
playback history cannot be used to check a geometry claim. Here the reason is narrower and
worth stating separately rather than borrowing: **a preview whose angle depends on how
long the reader has been looking cannot be screenshotted twice and compared**, which is
the only way session 07 or the concept-production topic can say anything about it.

## The fallback has to say so

`loadCombatantAssetOrFallback` (`combatant-assets.ts:332`) exists because the GLB can fail
validation, and the arena's answer is to keep the primitive textured proxy. The preview
takes the same path -- `buildFigure` from `client/src/render/figure.ts`, hung off the same
`rig-names.ts` node names -- **and puts a line under the column saying which one is on
screen.** A preview that silently degrades to primitives is a preview that tells the
reader their Fighter looks like that.

That is the same rule as `recordingTruncated`: a flag nothing shows is not honesty.

## Which way the body faces

**The mirror-map trap applies here and it is the one thing in this session that can be
subtly wrong in a way nobody notices.** Two world-to-scene mappings exist in this
repository and they are mirror images:
`docs/architecture/browser-runtime.md:184` states them -- `#/game` maps world `(x, y)` to
Babylon `(x, z)` with yaw negated, and `#/arena` maps world `(x, y, height)` to
`(x, height, -y)` and does not negate yaw.

A preview draws no world coordinates at all, so it is free of both -- **and that freedom
is exactly how it goes wrong**, because a shield hung on the wrong side is a picture a
reader will believe. The preview is built in the **arena's** frame, because the fight the
reader is about to watch is drawn in that frame, and
`a_previewed_shield_is_on_the_same_side_as_the_shield_in_the_fight` asserts it by
comparing the previewed shield node's sign against the arena scene's for the same choice.

## Files

| file | change |
|---|---|
| `client/src/arena/preview.ts` | new: the two-viewport preview, the dress, the item geometry, the turntable |
| `client/src/arena/arena.ts` | mount the preview in the `select` phase, dispose it on leaving, feed it every picker `change`; swap `scene.activeCameras` between the two phases |
| `web/index.html` | the picker columns are laid out over the existing `#arena-3d`; a per-column dress line. **No new canvas** |
| `client/src/runtime/arena-config.ts` | nothing, if `HAND_ITEMS` is already exported; otherwise export it rather than copying it |

**Nothing under `web/assets3d/` is touched, and nothing in `client/src/render/` changes
behaviour.** If the preview needs something `combatant-dress.ts` does not expose, it is
exported, not reimplemented.

## Tests

`client/test/render-contract.test.mjs` -- it is where the combatant asset and dress
contract already lives:

- `a_preview_hangs_the_item_the_configuration_buffer_would_carry` -- the previewed
  segment's length and radius are `HAND_ITEMS`' own, read from the same table
  `arenaConfigOf` writes
- `a_preview_falls_back_to_primitives_and_says_which_dress_is_on_screen`
- `the_preview_turntable_is_a_pure_function_of_its_frame`
- `a_previewed_shield_is_on_the_same_side_as_the_shield_in_the_fight`
- `a_preview_does_not_pose_the_rig_from_a_publication_it_does_not_have`
- `no_preview_bit_collides_with_a_stage_camera_bit`
- `the_preview_and_the_stage_are_never_active_on_the_canvas_at_once`

`client/test/studio-shell.test.mjs`:

- `leaving_the_selection_phase_disposes_the_preview_engine_camera_and_observer` -- the
  neighbour `mounting_and_disposing_the_arena_twice_leaves_no_listener_observer_or_frame_behind`
  is the model, and this one matters more than usual because the preview holds a Babylon
  `Scene` and a `ResizeObserver`
- `the_selection_screen_opens_with_no_wasm_present`

All of these run under `NullEngine`; `createArenaContent(engine, debug)` is already
exported for exactly that (`client/src/arena/scene.ts:1745`) and the preview follows it
with an engine-injection seam rather than reaching for a canvas.

## What cannot be checked here, and is owed to a person

**Whether the preview is legible at the size the column gives it.**
`COMBATANT_HIGH_LOD_MIN_PIXELS` is 160 and `COMBATANT_MID_LOD_MIN_PIXELS` is 64
(`combatant-dress.ts:29-30`), so a column narrower than about 160 device pixels of body
height silently shows the reader a mid-LOD combatant in a shop window. Whether that reads
acceptably is a judgement at a foreground browser, and **it is blocked rather than
skipped**: a Claude-in-Chrome tab is always `visibilityState: "hidden"`, which is a stop
and not a throttle, and it rasterises in software. Session 07 asks the owner; this session
records the projected height the layout actually produces so there is a number to ask
about.

## Acceptance

1. Each column shows the body its side is configured as, with the items its side carries,
   and changing a `<select>` changes the picture.
2. The dress on screen is named, and a fallback says it fell back.
3. No asset, sidecar, material or LOD threshold moved.
4. The selection screen still opens with no wasm build present.

## Hash expectations

**Nothing moves.** No crate is edited and no asset byte changes, so
`node tools/validate_assets.js web/assets3d/room_slice.glb` and the combatant sidecar pins
answer exactly what they answer today.

## Verification

```powershell
node --test "client/test/*.test.mjs"
npm run check
node tools/validate_assets.js web/assets3d/room_slice.glb
node tools/check_docs.js
npm run view       # foreground: the selection screen must open with no wasm
npm run dev        # foreground, stopped before the session ends
```
