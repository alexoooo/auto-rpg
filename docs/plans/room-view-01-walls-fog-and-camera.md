# Room view 01 -- corner rotation, the fog frontier, and the camera

**Status: completed and corrected 2026-08-17.** The live default `/#/game` route
reached worker-and-room ready under WebGPU with a clean current console; the room
matrix keeps the forced-WebGL2 and foreground frame-time work explicitly pending.

- The rewritten `room_door_torch_socket_and_wall_orientation_use_only_general_semantic_rules`
  went red on all four corner pairs against the old code (`{N,E} at 0 turns lands its
  arms on S and E`), then green; the corner mapping is `{E,S}` 0, `{N,E}` 1, `{N,W}` 2,
  `{S,W}` 3, derived from the authored spur geometry and mirrored into the arena.
  Stub and tee rotations were also wrong under `findIndex` and are now axis- and
  open-side-derived, pinned the same way.
- The centreline-neighbour model above was subsequently refuted by the shipped room:
  it reproduced arbitrary solid-cell graphs instead of architectural boundaries.
  The corrected game renderer extracts disclosed solid-to-open contours, presents
  only the camera-facing -X/-Z facades, repeats seamless tile-frequency masonry, and
  gives every disclosed solid an inset raised coping block. Undisclosed cells never
  create perpendicular arms or presentation instances; remembered facades remain
  opaque so coursed masonry cannot dissolve into pickets.
- Camera: `GAME_INITIAL_FIXED_ZOOM = 10` and `FOLLOW_DEAD_ZONE_FRACTION = 0.35` in
  `room-review-camera.ts`, both bounded from both sides in
  `the_game_follow_camera_starts_close_and_pans_only_when_the_hero_leaves_the_dead_zone`.
  The first disclosed hero sample centres the view before the dead-zone takes over.
  The follow is a hard camera window (pans exactly the excess) rather than a per-frame
  easing fraction, deliberately: the window is frame-rate independent where an easing
  constant is not. It mutates the one live camera (`moveFixedTo`), is suspended by a
  drag until the hero itself walks out of a zone-sized region, and is **absent** on the
  stress/review fixtures so captures cannot drift.
- Gates: `npm run check` pass; render contract suite 101/101; room asset validator
  12/12 including two clean pinned Blender exports; `node tools/check_docs.js` pass;
  `git diff --check` clean.
- No `crates/` file was touched. The GLB and build-input pins did not move; the
  capacity-only sidecar and validator pins moved with the exact 1,835-instance
  residency calculation recorded in the room asset contract.

The original plan follows.

**Status:** planned, not started. Client-only; no registered pin moves.
Depends on nothing. See [the overview](room-view-00-overview.md).

Three fixes that share one property: each is a small, self-contained rule change with a
test that currently asserts the wrong answer.

## 1. Corner rotation

`chooseRoomWall` in `client/src/render/room-environment.ts` builds
`solid = [N, E, S, W]`, then picks a corner's rotation from
`found = solid.findIndex(Boolean)` -- the index of the **first** solid neighbour.
Four corner orientations collapse onto three values:

| corner | `findIndex` | correct quarter turns |
|---|---:|---:|
| `{N, E}` | 0 | 0 |
| `{E, S}` | 1 | 1 |
| `{S, W}` | 2 | 2 |
| `{N, W}` | **0** | **3** |

`{N,W}` collides with `{N,E}` because north is index 0 and is found first, so **three
of the four corners in the shipped fixture are mis-rotated**. The same `first` is used
for `wall_outside` and `wall_end`, so all three non-straight branches inherit it.

Replace the "first solid neighbour" rule with the neighbour **pair**. The straight
branch immediately above is already correct and is the only branch carrying an argument
in a comment; give the corner branch the same treatment rather than a bare table.

**Mirror it** into `client/src/arena/environment.ts`, which restates the rule on
purpose (the reason is written above it) rather than importing it.

### The test that must fail first

`room_door_torch_socket_and_wall_orientation_use_only_general_semantic_rules` in
`client/test/render-contract.test.mjs` **pins the current wrong answer**, including
the `wall_inside, quarterTurns: 1` case. It asserts what the code does, not what is
geometrically right, so it will go red on a correct fix.

Do not re-record it. Rewrite it to bound the answer from both sides: assert all four
corner pairs map to four **distinct** quarter turns, and that rotating the authored
piece by that amount puts its arms on the two solid neighbours. A test that only
restates the new constants is the same defect one revision later.

## 2. The fog frontier -- a decision, not a bug fix

`knownSolid` requires `snapshot.vis[at] !== 0`, so a wall whose neighbours are merely
**undisclosed** reads as having no solid neighbours at all, falls through to the
`neighbours <= 1` branch, and draws `wall_end` -- a piece that is **0.62 long inside a
1.0 tile** (`tools/art/room.py`). The gaps therefore track the *exploration boundary*,
not the map, which is why they appear along the least-explored edge and move as the
hero walks.

The current behaviour is deliberate and says so: *"Only disclosed solid neighbours
connect; fog never becomes inferred topology."* Two options preserve that intent:

- **(i) recommended** -- let an undisclosed neighbour count as solid **for topology
  only**, while still drawing nothing for the neighbour itself. The frontier tile then
  renders a full-length straight instead of a stub, and no undisclosed tile is ever
  drawn, so the rule the comment protects is untouched;
- (ii) draw the frontier tile at full length in its remembered material.

Take (i), and replace the comment with one that states the sharpened rule: *fog never
becomes a drawn tile; it may complete a drawn tile's topology.* The tests
`known_geometry_and_valid_furniture_obey_visibility_and_light_caps`,
`room_instances_need_known_topology_and_current_furniture_disclosure` and
`unknown_room_tiles_leave_no_enabled_spatial_instance_or_registry_residue` are the
ones that guard the half being kept; they must stay green **unmodified**, which is the
evidence that (i) did not quietly become (ii).

## 3. Camera: start closer, then follow

**Zoom.** `#/game` passes no `initialFixedZoom` in `client/src/v2.ts`, so zoom is `1`
and `fixedIsometricBounds` in `client/src/render/camera.ts` yields a vertical
half-extent of `(mapCols + mapRows) / 2` -- on the real 68x45 dungeon that is `56.5`,
so **113 world units of view for a 45-tile room, roughly 2.5x over-framed**. Pass an
initial zoom, which is the mechanism `review=room` already uses.

While there: the doc comment on `camera.ts` claims a zoom of twelve "keeps roughly six
vertical tiles visible in the shipped 48 x 32 room". That arithmetic is for the stress
fixture, not the 68x45 dungeon this route actually renders, where the same zoom gives
about 9.4 tiles. Correct it.

**Follow.** There is no follow behaviour anywhere. `#fitCamera` in
`client/src/render/renderer.ts` runs only when the room dimensions change and resets
the pan to the room centre; `#render` never touches the camera. Drive the pan from the
hero, read as the `faction === 0` unit off the interpolated sample `#render` already
computes -- `AGENTS.md` guarantees exactly one.

Three things to get right, and they are the whole difficulty:

- **Do not rebuild the camera per frame.** `pan` and `zoom` currently go through
  `replaceFixed` in `client/src/render/room-review-camera.ts`, which constructs a new
  camera. Add a mutate path for the follow update and leave `replaceFixed` for the
  discrete calls.
- **Do not fight the user's drag.** A follow that overwrites the pan every frame makes
  dragging impossible and breaks
  `primary_pointer_click_issues_goto_while_primary_drag_moves_the_live_camera`. Use a
  dead-zone: the camera re-centres only when the hero leaves a central fraction of the
  view, and a drag suspends the follow until the hero next leaves that zone.
- **Clamp in screen space, not per axis.** `clampCameraPan` in `camera.ts` is the naive
  per-axis version. `web/main.js` already solved this for the legacy page and the
  comment above it explains why a per-axis world clamp has no correct answer under
  isometric projection -- the room's screen-space silhouette is a diamond, not a
  rectangle. Read that argument before writing this.

`the_room_review_camera_is_bounded_resettable_and_dispose_owned` pins the zoom bounds,
the max-zoom ortho top and the reset target, and asserts no leaked listeners after
`resetFixed` and `dispose`. A follow subscription is a listener; it must be owned and
released the same way.

## Also in this session

`web/index.html` says `#/game` is "rendered through the v2 procedural GPU greybox".
It has not been since the default flipped to the authored kit. Fix the sentence.

## Verification

```powershell
npx tsc --noEmit
npm run build
node --test client/test/render-contract.test.mjs
node tools/check_docs.js
git diff --check
```

Predicted pin movement: **none**. Update the wall-topology and camera rows of
`docs/performance/v2-room-matrix.md` in the same commit, and record the visible check
(`npm run dev`, `/#/game`) against its review criteria -- from a foreground tab, by a
person.
