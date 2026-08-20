# Arena 04 -- the camera that follows, and the zoom that closes

**Status:** ready once session 01 has landed. Blocks 05.

The arena's three cameras are placed by a pure function every frame with no easing, no
tracking and no `attachControl` (`client/src/arena/scene.ts:768-804`). There is no zoom:
the Span slider changes how much world all five panels frame, which is a *framing* control
and not a camera. This session gives the 3/4 viewport a camera a person owns, and it lands
before the hands because **a body you are driving that you cannot follow or lean into is
not a control scheme you can judge.**

## What Span means afterwards, and why that has to be said out loud

`adopt()` seeds azimuth along the A-to-B line and span to
`min(Number(spanInput.max), ceil(distance) + 4)` (`client/src/arena/arena.ts:706`), and
`threeQuarterPlacement(focus, span, aspect, azimuth)`
(`client/src/arena/geometry.ts:520-544`) derives the 3/4 camera's distance from that span
so **all five panels frame the same world width**. That coupling is deliberate and it is
what makes the plan panel and the 3/4 panel comparable.

**Note where the upper bound actually lives.** The 26 is not in TypeScript: it is the
`max` attribute of the slider at `web/index.html:561`, read back out of the DOM. This
session relabels that slider, so which side owns the bound stops being a detail -- if the
3/4 camera gets its own radius range, the slider's `max` is no longer the only ceiling and
the two must not silently disagree.

A wheel that moves the 3/4 camera breaks it. The choice is which way, and both honest
answers were considered:

- **Span keeps driving everything and the wheel changes Span.** Then zooming into a face
  drags the plan and elevation panels down to a two-metre window and the reader loses the
  fight while looking at it.
- **Span keeps the two 2D panels and seeds the 3/4 camera; the wheel takes ownership.**
  The panels stay comparable to each other and the 3/4 view becomes a camera.

The second is what lands, **and the page says so rather than letting the reader discover
it**: once the wheel or a drag has been used, the Span slider is labelled as no longer
driving the 3/4 view and a **[Refit]** button gives it back. A control that silently stops
affecting one of the five things it used to affect is the same defect as a flag nothing
shows.

## Do not import the other route's camera

`client/src/render/camera.ts` and `client/src/render/room-review-camera.ts` are the
`#/game` cameras. They are **orthographic isometric**, their bounds are tile counts in a
dungeon (`MIN_CAMERA_ZOOM = 0.5`, `MAX_CAMERA_ZOOM = 12`, justified against a 48x32 stress
fixture), and they are written against the greybox mapping -- world `(x, y)` to Babylon
`(x, z)` with yaw negated, determinant `-1`. The arena maps world `(x, y, height)` to
`(x, height, -y)` and does **not** negate yaw. `docs/architecture/browser-runtime.md:184`
states that the two mappings are mirror images and that neither may be copied into the
other's page.

So: **port the decisions, not the code.** The three worth porting are named below with
their sources, and each gets its own constant in the arena's own frame.

### One repair in passing

`client/src/render/room-review-camera.ts:28-30` argues a dead zone of **0.35** and the
constant on the very next line, `:31`, is `FOLLOW_DEAD_ZONE_FRACTION = 0.08`. A wrong
comment is worse than no comment, and this session reads that comment closely enough to be
the one that notices. Fix it in place, in its own line of the commit message, and supersede
rather than delete: if 0.35 was ever measured, say what changed it.

## The camera this session lands

```ts
// client/src/arena/stage-camera.ts -- new
/**
 * The 3/4 viewport's camera, in the arena's own frame.
 *
 * Three modes and one owner, on `room-review-camera.ts`'s argument that leaving a
 * special view must restore the fixed one rather than construct another camera.
 */
export type StageCameraMode = "fit" | "follow" | "orbit";

export interface StageCamera {
  /** Span-derived framing of both bodies. What the arena does today. */
  fit(focus: V3, span: number, azimuth: number): void;
  /** Damped follow of one body, dead-zoned so small footwork does not swim. */
  follow(body: Pose, dt: number): void;
  /** Pointer drag; refuses nothing, because a camera commands no simulation. */
  orbit(dx: number, dy: number): void;
  /** Wheel. Clamped both ends; the near end is a face and the far end is the arena. */
  zoom(delta: number): void;
  refit(): void;
}
```

**The follow decision, ported:** a dead zone so the camera does not chase a fighter's
weight shift, and damping that restores exactly the excess so the camera moves at the
body's speed rather than lagging by a fixed fraction. Both are in
`room-review-camera.ts:119-169` and both are right; the numbers are not, because a dead
zone measured as a fraction of an isometric dungeon view means nothing in a
perspective 3/4 view of two bodies.

```ts
/**
 * How far the followed body may drift from the viewport centre before the camera
 * moves, as a fraction of the smaller viewport dimension.
 *
 * **Bounded from both sides.** At 0 the camera integrates every hip sway and the
 * background swims, which is the complaint that made `#/game` grow a dead zone at
 * all. Above about a quarter the followed body can stand at the edge of its own
 * viewport while it is being hit from off screen, which is the failure the whole
 * follow exists to prevent.
 *
 * `the_follow_dead_zone_is_bounded_from_both_sides` asserts both ends.
 */
export const ARENA_FOLLOW_DEAD_ZONE_FRACTION = 0.10;

/**
 * The nearest the camera may come to the followed body's centre, in world units.
 *
 * **Bounded from both sides.** Below the head capsule's own radius plus
 * `NEAR_PLANE` (0.02, `geometry.ts:461`) the camera is inside the body and the
 * near plane clips the face it was brought in to see. Above about two standing
 * heights it is not a close-up and the Span fit already covers it.
 */
export const ARENA_CLOSE_UP_RADIUS = 0.9;

/** The farthest, so a wheel cannot lose the fight off the back of the arena. */
export const ARENA_WIDE_RADIUS = 30;
```

`ARENA_CLOSE_UP_RADIUS`'s lower bound is **derived and not chosen**: the session computes
it from the shipped anatomies' head radius rather than typing a number, and
`the_close_up_radius_clears_the_near_plane_and_the_head` asserts it against
`fighter_anatomy()` and `brute_anatomy()` so that an anatomy change breaks the test rather
than the picture.

## Who is followed

A `<select>` beside the Span slider: **Fighter A**, **Fighter B**, or **both** -- "both"
being today's midpoint fit, and the default, so an unattended AI fight looks exactly as it
looks now.

Session 05 adds one more rule and this session leaves room for it rather than guessing at
it: when a side is driven by a human, the follow target defaults to that side. That is one
line in 05 and it is named here so 05 does not have to widen this control.

## The first-person viewports get a way to be the main view

The two eye-height cameras exist and are 28% of the canvas each in a left column
(`ARENA_VIEWPORTS`, `client/src/arena/geometry.ts:326-341`). `browser-runtime.md` records
why they exist: *"the design target the off-arm decision was made against is first-person
human control of a single hero."*

This session adds a view selector -- `3/4`, `A's eyes`, `B's eyes` -- that promotes one of
them to the large rectangle and demotes the 3/4 to the small one. **One `Scene`, the same
three cameras, the viewports swapped**, on the same rule the arena's `[Texture]`/`[Geometry]`
pair already follows: the mode is a property of the scene, it moves no camera it does not
have to and it rebuilds no engine.

## What this session must not change

- **The pure placement of the first-person cameras.** Eye at the published head-capsule
  centre, rotation from `sceneYaw(pose.yaw)`, `setTarget` deliberately unused. That is
  published-quantity placement and it is not a camera to smooth.
- **`FIRST_PERSON_FOV_DEGREES = 90`.** It carries a whole contact-frustum measurement
  table at `client/src/arena/geometry.ts:345-441` and it is not this session's to retune.
  Note the field-of-view trap the house rules already record: an assertion of the form
  `FOV / 2 > 46` passes for anything from 93 to 179 degrees and looks like coverage. Any
  new bound here is two-sided.
- **`[Geometry]` stays one keystroke away.** No visual on the legs may be read as evidence
  about footwork, and a camera that can now push in on a leg makes that more true rather
  than less.
- **No simulation command.** A camera commands nothing; `#/game`'s Free view *refuses*
  simulation commands and the arena's camera has none to refuse. It also must not consume
  the pointer events session 06 needs -- which is why orbit lands on the **middle** button
  here, leaving the primary button free for the cut and the secondary button free for
  session 06's extension gesture, on the same principle `greybox-input.ts:104-110` uses to
  keep camera buttons and command buttons disjoint. The handler answers whether it consumed
  a delta. Session 06 sends a consumed delta to the camera **only** and never also to the
  virtual hand; one physical movement cannot be both an orbit and a cut.

  A camera move also cannot become an arm command indirectly. Session 06 keeps the last
  staged arm target stable while orbit, zoom, follow damping or viewport promotion moves
  the view, then rebases its virtual-hand reticle into the new view before the next weapon
  delta. This session exposes the camera basis and change serial needed for that rebase;
  it does not know an arm exists.

## Files

| file | change |
|---|---|
| `client/src/arena/stage-camera.ts` | new: the owned 3/4 camera, its three modes and its bounds |
| `client/src/arena/scene.ts` | `#placeCameras` asks the owner for the 3/4 placement instead of computing it; viewport promotion |
| `client/src/arena/geometry.ts` | `threeQuarterPlacement` keeps its job and gains the radius override; `PROMOTED_VIEWPORTS` beside `ARENA_VIEWPORTS` |
| `client/src/arena/arena.ts` | wheel, middle drag, follow `<select>`, view `<select>`, **[Refit]**, and the Span label that admits what it no longer drives |
| `web/index.html` | the three new controls in the arena's control row |
| `client/src/render/room-review-camera.ts` | the 0.35-versus-0.08 comment repair only |
| `docs/architecture/browser-runtime.md` | "The arena's two dresses" gains what the cameras now do |

## Tests

`client/test/render-contract.test.mjs`, under `NullEngine`:

- `the_follow_dead_zone_is_bounded_from_both_sides`
- `the_close_up_radius_clears_the_near_plane_and_the_head`
- `a_followed_body_inside_the_dead_zone_does_not_move_the_camera`
- `a_followed_body_outside_it_is_restored_to_the_edge_and_not_to_the_centre` -- the
  damping claim, and the one most likely to pass while broken, because a camera that
  simply snaps also puts the body inside the dead zone
- `the_wheel_cannot_put_the_camera_inside_the_body_or_behind_the_arena`
- `promoting_a_first_person_viewport_moves_no_camera_and_builds_no_engine`
- `a_camera_change_serial_moves_for_orbit_zoom_and_promotion_but_not_for_followed_pose_publication`

`client/test/studio-shell.test.mjs`:

- `the_span_slider_says_when_it_has_stopped_driving_the_stage_camera`
- `refit_returns_the_stage_camera_to_the_span_fit`
- `an_unattended_fight_frames_both_bodies_exactly_as_it_does_today`

## What cannot be checked here

**Whether the follow reads as smooth.** Damping and dead zones are judged at 60 Hz by a
person, and rendering behaviour cannot be measured from an automated browser tab -- always
`visibilityState: "hidden"`, a stop rather than a throttle, rasterising in software. Four
confident wrong hypotheses in a row came out of ignoring that. The numbers above are
placeholders with two-sided tests; **session 08 is where a person says whether 0.10 and
0.9 are the right two numbers**, and if they are not, they move with the measurement
written down beside them.

## Acceptance

1. The wheel zooms the 3/4 view, a middle drag orbits it, and neither can put the camera
   inside a body or lose the arena.
2. A follow target can be chosen, and choosing **both** is byte-for-byte the framing the
   arena produces today.
3. Either first-person viewport can be promoted to the main rectangle and back, with one
   `Scene` and no new engine.
4. Camera gestures have a disjoint event claim and a change serial session 06 can use to
   preserve an arm target across a view change.
5. The Span slider tells the truth about what it drives.

## Hash expectations

**Nothing moves.** TypeScript, HTML and one comment.

## Verification

```powershell
node --test "client/test/*.test.mjs"
npm run check
node tools/check_docs.js
node tools/check_deps.js
npm run dev        # foreground: run a fight, follow A, wheel in to the face, Refit
```
