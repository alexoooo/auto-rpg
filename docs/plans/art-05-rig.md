# art-05 — bodies get parts

**Goal:** the `[world]` view's single-path billboard becomes an ordered list of layers, each
placed by projecting a body-local offset through the one camera matrix, posed every frame from
sim state, and z-ordered by a key derived from the facing rather than tabulated against it.

**Leaves the game:** the game as intended, with **zero image files**. Everything here is
procedural fallback art. If Codex never delivers a single character sprite, this is the shipping
look, and it has to be good enough to be one.

**Depends on:** `art-03` landed and verified — the rig reads `vx`, `vy`, `stride` and
`swing_span`, and none of them exists before it. And `art-04`, which is why this session contains
no `ctx` call at all: **the rig emits draw items and the backend paints them.** That is not a
constraint bolted on to this session, it is what makes it small — a slot resolves to an item, and
whether the item is a `PATH_FILL` of a fallback path or a `SPRITE` of a manifest image is one
field rather than two code paths.

---

## 1. Where the rig lives

A new file, `web/rig.js`, loaded by a `<script src="rig.js">` **before** `main.js` in
`index.html`. Classic script, no module, no bundler: top-level `const` in a classic script binds
in the global lexical environment and is visible to every script loaded after it.

It holds the rig tables and nothing else — no drawing, no canvas reference, no sim knowledge.
`main.js` holds `drawRig`, which reads the tables and the snapshot and **emits**; `web/draw.js`
from `art-04` paints. Three files, three jobs: `rig.js` knows proportions and knows nothing else,
`main.js` knows the sim, `draw.js` knows the canvas. That split is what makes the tables data —
and it is why `drawRig` is testable by asserting over the items it emitted, without a canvas.

`node --check web/rig.js` joins the tripwire list.

## 2. The space, and the one piece of arithmetic the whole session rests on

Segments are declared in **body-local coordinates, in body radii**:

| | |
|---|---|
| `along` | forward along the body's facing |
| `side` | to the body's **left** |
| `height` | up from the feet |

The camera looks down the `+x/+y` diagonal — `TORCH_POS_X`'s comment (`main.js:736-742`) states
it as the reason only two of a block's four faces are ever emitted, and `wallBlock`
(`main.js:4900`) is the code it points at — so **facing the camera is world bearing `π/4`.**
Define the body's bearing away from the camera:

```js
/** How far a body has turned away from looking at the viewer, wrapped to (-pi, pi].
 *  Zero is facing the camera; +/-pi is facing away; +/-pi/2 are the two profiles. */
function camBearing(facing) { /* facing - Math.PI/4, wrapped */ }
```

Now the derivation. A segment's world offset from the body's ground point is the local triple
rotated by the facing and scaled by the radius. Push that through `projX`/`projY` and `lift`,
substitute `PROJ_ISO`'s coefficients, and collect terms in `b = camBearing(facing)`:

```
screen x  =   s * (side * cos b  -  along * sin b)
screen y  =   s * (along * cos b  +  side * sin b) / 2  -  s * height / ex
```

where `s = px(unit.radius) * PROJ.ex` — **the same `s` the billboard art is already drawn in**
(`main.js:9063`), and `ex = PROJ.ex`. So the whole rig lives in the billboard space that already
exists, and its offsets are pure numbers.

**Both `side` terms carried the wrong sign in this plan's first draft**, and the pair above is the
corrected one. The draft's prose said `side` was the body's left and its arithmetic made it the
body's right; the two lines are self-consistent either way, which is exactly why nothing would
have caught it but a mirrored figure. The body's left is `(sin f, -cos f)` in a world whose `+y`
runs *down* the screen — a person facing east on a map has their left hand to the north — and the
mirror is how to check it in your head: at `b = 0` the body is looking at you, so a point at
`side = +1` has to land at `screen x = +s`, the right of the screen, which is where that person's
left hand is. `assertProjection` now proves the pair against `projX`/`projY` + `lift` at boot
(`main.js:12266-12300`), across six facings and three offsets, so a future sign slip says so
rather than drawing a plausible mirrored figure.

Three things fall straight out of those two lines and they are what make the session cheap:

1. **The depth key is the `y` term's numerator.**
   ```js
   const depth = along * Math.cos(b) + side * Math.sin(b);   // larger = nearer the camera
   ```
   It is the segment's offset along the camera axis, it is the *same* quantity `bodyDepth` sorts
   whole bodies on, and it is continuous in the facing. **So there is no z-order table.** Sort
   the segments by it, ascending, and the weapon passes behind the torso as the figure turns
   away because the arithmetic says it does — no eight-row table, no discontinuity at an octant
   boundary, nothing to get wrong at facing 44°.
2. **Things further from the camera sit higher on the screen**, by exactly half the depth key.
   That is a genuine 3D read out of a 2D rig and it is free.
3. **`height / ex` is the same expression `uprightTop` already uses** (`main.js:8293`), so a
   segment declared at `height = BODY_H[kind]` has its top edge exactly at the crown the health
   bar, the pick box and the hero outline all measure from. Nothing is typed twice.

**Sort in place, into a module-scope scratch array of indices, with an insertion sort.** Seven
items; `Array.prototype.sort` on a fresh array would allocate 64 arrays a frame in a render path
whose standing discipline is that it allocates nothing (`main.js:812`, `main.js:10278-10286`).

## 3. The rigs, at two granularities

**The image rig and the fallback rig are different shapes on purpose**, and the rig code carries
both. The brief's argument, restated because it is the design decision of the whole session:
image generation is unreliable for an isolated "far leg of a Brute facing south-east" and
reliable for a whole figure, so the image rig is coarse — and **the articulation that has to be
exact is the weapon's**, which is procedural in both rigs and is never a sprite frame.

| | image rig | fallback rig |
|---|---|---|
| body | one **composite** layer: legs + torso + head, per facing, 2–3 stride frames + idle | six segments: `legFar`, `legNear`, `torso`, `armOff`, `head` |
| main arm | its own layer, posed continuously | its own segment |
| weapon | projected from the blade line, §4 | same, identical code |
| shield | its own layer when `role === ROLE_GUARD` | same |
| layers drawn | 4 | 7 |

Both are one table with a `granularity` per slot, and `drawRig` walks the same list either way:
a slot resolves to a manifest image if `art-06`'s loader has one **and** the archetype declares
that granularity, and to its fallback path otherwise.

**`body` and the four fallback segments are alternatives, not additions.** If the composite
sprite resolves, `legFar`/`legNear`/`torso`/`head` are skipped entirely; if it does not, `body`
is skipped and the four are drawn. One `if` at the top of the walk, and getting it wrong draws a
figure inside a figure. **A body may be half-and-half** — a
composite body sprite with a fallback arm is a legal and expected intermediate state while a
Codex batch is half-integrated, and if that reads badly it is a `FEEDBACK.md` item rather than a
code path to forbid.

**`RIG_UPRIGHT`** — Fighter, Rogue, Brute:

| slot | granularity | along | side | height | notes |
|---|---|---|---|---|---|
| `body` | image | 0 | 0 | feet → crown | composite; frame from `stride`, §4 |
| `legFar` | fallback | ±swing | +0.35 | 0 → 0.9 | one slot drawn twice, at opposite stride phase |
| `legNear` | fallback | ∓swing | −0.35 | 0 → 0.9 | |
| `torso` | fallback | 0 | 0 | 0.9 → shoulder | leans |
| `head` | fallback | 0.05 | 0 | crown | the circle `UPRIGHT_HEADS` already describes |
| `armOff` | both | 0.1 | +0.55 | shoulder | holds the shield when `role === ROLE_GUARD` |
| `armMain` | both | stretched | −0.55 | shoulder | hand tracks the weapon's hilt |
| `weapon` | both | stretched | — | hand | §4; not placed by this table at all |

**`RIG_CRAWLER`** — Skitterer. Composite body plus a head-end layer for the image rig; four
segments (`legsFar`, `body`, `legsNear`, `head`) for the fallback. A Skitterer is 0.33 world
units tall and 73 px wide at default framing — it is *wider than it is tall* — so it gets a low
body with legs splayed to the full half-width either side and a head carried forward, which is
what `skittererUprightPath` already draws as one outline. Cutting that outline into four is most
of the fallback work here.

`RIGS = { [BODY_FIGHTER]: RIG_UPRIGHT, ..., [BODY_SKITTERER]: RIG_CRAWLER }`, read through a
`rigOf(kind)` with the Fighter's as the fallback, on exactly `silhouettePaintOf`'s argument
(`main.js:8462`).

**Per-archetype proportions stay in `BODY_H` and `HEADS` and are not duplicated into the rig.**
`BODY_H` is read by `bodyHeight`, `bodyTopWorld`, `uprightTop`, `anchorY` and `unitAt`; a second
copy of a Brute's height inside a rig table is how the art and the health bar drift apart. The
rig's `height` column is a *fraction* of `BODY_H[kind]` wherever it describes a body landmark —
and a composite body sprite's top edge must land on `uprightTop(kind)` exactly, which is what
`ASSET_SPEC.md` states as each archetype's drawn size.

**The composite body's facing is quantised to 8 and nothing else is.** Hard constraint 3 permits
exactly that: quantised body art augments the continuous truth overlays and never replaces them.
The weapon, the arm, the guard wedge, the declared line, the reach ring and the collision circle
all stay continuous in `limbAngle` and `facing`. `camBearing` from §2 is what the quantiser
rounds; the facing index is `round(b / (TAU/8)) & 7` and the compass order is fixed in
`ASSET_SPEC.md` as `s, sw, w, nw, n, ne, e, se` with `s` looking at the viewer.

## 4. Posing from sim truth

### The weapon is not in the rig table

It is the sim's blade segment, projected. Hilt at `radius` along `limbAngle`, tip at
`radius + actionLength * limbReach` — **precisely the segment `World::blade` builds and tests
against**, which is what `drawLimb` already says at `main.js:7969`:

```js
const hx = unit.x + Math.cos(unit.limbAngle) * unit.radius;
const hy = unit.y + Math.sin(unit.limbAngle) * unit.radius;
const tip = unit.radius + unit.actionLength * unit.limbReach;
const tx = unit.x + Math.cos(unit.limbAngle) * tip;
const ty = unit.y + Math.sin(unit.limbAngle) * tip;
// Both endpoints through the one projection, lifted to the hand. This is
// `drawShot`'s pattern verbatim (main.js:9504): an arrow's shaft lies in the
// world plane at shoulder height and goes through a screen-space lift applied
// before the shear.
const lift_ = lift(handHeight(unit));
```

**Continuous, never quantised, and it stays continuous even if segment art is ever quantised to
8 facings.** That is hard constraint 3 and it is the one thing in this session that is not
negotiable.

**The blade moves up to the hand and leaves a shadow behind on the floor.** The sim is 2D and
has no opinion about height, so the *plan-view* position is the truth and the height is a
rendering choice — drawing the blade at hand height changes nothing the sim can measure. What it
does cost is readability, because the bright thing is no longer where it hits. So `drawLimb`
keeps a ground pass and gains one line: the same segment, dim, on the floor, exactly where the
hitbox is. Bright blade at the hand, its shadow on the stone. This is again `drawShot`'s
structure — a ground shadow under a lifted shaft — and it is why that function is worth reading
before starting.

`drawLimb`'s two **readouts stay on the floor unchanged**: the guard wedge (`main.js:7876`) and
the declared line (`:7898`). They are telegraphs, they are read against the floor, and lifting
them would make the single most useful thing on the canvas harder to see.

While in there, take `art-03`'s gift: replace `clamp(1 - unit.swingLeft / 30, 0.15, 1)` with the
real fraction from `swingSpan`. That literal 30 is wrong for every action that is not a sword.

### The arm follows the weapon; there is no IK

`armMain` is drawn as a stretch between the shoulder point (from the rig table) and the weapon's
hilt (from the projection above). Two points, one quad or one rotated sprite. Nothing solves for
an elbow, and nothing should: an elbow is invisible at 116 px of Fighter.

### The phases

`swing`, `swingLeft` and `swingSpan` give an exact fraction. `progress = 1 - swingLeft/swingSpan`
when `swingSpan > 0`.

| phase | pose |
|---|---|
| `SWING_GUARD` | `limbAngle` is where the hand is; the rig follows it and does nothing else |
| `SWING_WINDUP` | interpolate `armMain` from guard toward a cocked pose by `progress`. **The blade itself still comes from `limbAngle`**, which during a windup is a long way from `limbLine` — `main.js:7840-7846` calls that gap the tell, and the arm may embellish it but must not close it |
| `SWING_STRIKE` | nothing to interpolate: the blade is sweeping the committed line the sim is testing, and the arm is wherever the blade is |
| `SWING_RECOVER` | return from the follow-through over `progress`, i.e. over the real recovery duration |
| `SWING_SWAP` | nothing in the hand and nothing drawn; the hand returns to a neutral carry over `progress`. `SWING_SKIN`'s own row draws an inert stub and says why (`main.js:7826-7830`) |

**A Brute's 33-tick windup must visibly last 33 ticks.** That is the session's headline gate and
it is satisfied by construction if every pose is a function of `progress` and none of them is a
function of `now`.

**Corrected: the rule is narrower than that, and the wide version deletes acceptance test 5.** The
constraint exists so the renderer cannot lie about **reach, bearing or phase** — quantities the sim
measures and the player has to read off the body. A wall-clock windup misrepresents phase and is
forbidden. An idle breath misrepresents nothing: the body has zero velocity, its limb is at guard,
and there is no sim quantity for it to contradict. So the rule is **no pose may be a function of
`now` where a sim quantity governs it**, and the idle breath is the one named exception — see
`RIG_BREATH`, which carries the argument and the scope. As written, the blanket version forbade
the breath that test 5 requires; the two could not both be satisfied and this is which one gives.

The exception is kept honest structurally rather than by promise. `drawRig` computes the breath as
zero unless the limb is at guard or mid-swap *and* the walk amplitude has faded out, and applies it
to the torso and head rows alone — so it cannot ride on a windup, a strike or a stride, cannot
reach the hand height the hilt is measured from, the blade, the shield or the legs, and cannot move
the feet, because it scales heights rather than offsetting them. It is the frozen-aware clock
`render` was handed, so `freezeRenderClock` pins it and the byte-identity gate is unaffected.

### The walk, at both granularities

`stride` (column 31) is the phase and it is the sim's, not the page's. One number drives both
rigs:

- **image rig** — the composite body's frame is `floor(stride * frames)`, plus an idle frame
  selected when the stride is not advancing. **A sprite sheet indexed by sim state is not a
  canned clip**: the frame is a function of how far the body has actually walked, so a body that
  is walled, shoved or stopped freezes on its frame, and one walking at half speed cycles at half
  rate, with nothing timing it. That is the distinction hard constraint 3 draws, and it is the
  whole reason `art-03` put `stride` in the frame rather than letting the page integrate one.
- **fallback rig** — `legFar` swings to `sin(stride * TAU)` and `legNear` to its negation, with a
  small vertical bob at twice the frequency.

**The blend to idle comes from the stride's own rate, not from a speed constant.** `syncBodies`
(`main.js:11436`) already keeps per-body page state across frames; have it record
`strideRate = wrap(curr.stride - prev.stride) / (currTick - prevTick)` and blend toward idle — a
leg amplitude in the fallback rig, the idle frame in the image rig — as that goes to zero. Two
properties: no mirrored `move_speed` formula, which is the bug class `unit.sight` was moved into
the frame to kill; and a body that is stopped, or walled, or being carried by a shove rather than
walking, stands still for free, because `art-03` drives the accumulator from velocity rather than
from time.

### The lean

Acceleration is `(curr.vx - prev.vx, curr.vy - prev.vy)`, differenced in `syncBodies` on the same
terms. Rotate it into the body frame, put it through §2's `ux` line, and lean the upper stack
about the hip by a small multiple of the result, clamped hard.

**This is garnish and the brief's rule about garnish is absolute**: it may never misrepresent
reach, bearing or phase. It moves the torso and the head. It does not move the shoulder point
the weapon's hilt is measured from, and it does not touch the blade.

### Recoil

`EVENT_SHOVE` (kind 8) carries the impulse magnitude and who was shoved. `syncBodies` seeds a
decaying `recoil` on that body, ~200 ms, and the rig tilts and squashes the stack by it.

**It must not translate the feet.** The body's ground point is `projX(unit.x, unit.y)` and the
sim has already moved it — the shove *is* the position change. Offsetting the art on top of that
would double the displacement and put the figure off its own collision ring, which is the one
mark on the floor house rule 4 says must never lie.

## 5. What `drawCharacter` keeps, exactly

The rig replaces **one arm of one branch**: `drawCharacter`'s `else if (upright)` block
(`main.js:9254-9319`), which becomes a call to `drawRig(unit, skin, pose)`. Everything else in
that function stays where it is, and the comment at `main.js:8997-9018` about keeping every
branch in one function still holds.

Kept verbatim:

- **The ground pre-pass** (`main.js:9079-9134`): shadow, facing wedge, collision ring. Three
  fills and a stroke through `groundSpace`, unchanged. The collision ring is house rule 4 and is
  unconditional.
- **`bodyTopWorld` / `anchorY` / `unitAt`'s box.** All three read `BODY_H` and none of them
  learns that the body has parts. A rig whose top segment does not reach `uprightTop(kind)` is a
  rig that hangs the health bar off nothing — check it, do not assume it.
- **The hit flash** (`main.js:9398`): one white fill of the **silhouette path**, not a flash per
  segment. Same look, one draw call instead of seven.
- **`drawSprint`, `drawLimb`'s readouts, `drawMarks`** — untouched call sites at the bottom of
  `drawCharacter`.

### `UPRIGHTS` survives, and stops being the body

It becomes the **silhouette**: the one closed path per archetype, used by four things that each
want a whole-body outline and none of which wants seven —

- `drawHeroThrough` (`main.js:10626`), one stroke over the depth walk;
- the ghost's dashed outline (`main.js:9191-9212`);
- `drawCorpse` (`main.js:9618`) — a corpse is a settling shape, not an articulated body;
- the hit flash above.

So `assertProjection`'s `UPRIGHT_EX` assertion (`main.js:12261`) keeps meaning something and
must keep passing. **Update its message**, which currently talks about "the upright art"; it now
guards the silhouette *and* the rig, and both are authored against `PROJ_ISO.ex`.

## 6. Fallback art: fills, not fills-and-strokes

Each **fallback-granularity** slot gets a `Path2D` in the billboard space, built once at module
scope, cut out of the proportions `UPRIGHTS` already uses so that the segmented body and the
silhouette agree at every edge. This is the whole of what ships until Codex's second calibration
gate passes in `art-08`, so it is the deliverable rather than a placeholder.

**One `PATH_FILL` item per segment and no `PATH_STROKE`.** `DESIGN.md`'s measurement is unambiguous — fills, rects,
sprites and text were collectively free while `stroke` alone cost 43 fps — and a stroke per
segment would be seven new strokes per body where there is currently one. The edge definition
that a stroke was providing comes from the fill instead: each segment is a two-stop linear
gradient across its own short axis, dark at the trailing edge. Gradients are built **once per
skin at module scope**, never per body per frame, on exactly `wedgeFans`' argument
(`main.js:7488`).

Palette from `art-01`'s `PAL` and the art skins. The concept's figures are near-black silhouettes
with a warm rim, so:

- fills sit between `skin.deep` and `PAL.void`;
- **the rim light survives and does the faction read**, exactly as it does today — clipped to
  the silhouette, one stroke, hue never moving (`main.js:9296-9318`). It is what carries the
  faction at four pixels a body and it is not a candidate for deletion.
- the head stays in the pale end. It is the part nearest the light and painting it dark makes it
  read as a hole, which is a lesson the file learned twice already (`main.js:9358`, and `RIG_TONE_HEAD` in `rig.js`).

**Silhouette-first.** Judge every fallback segment by shrinking the window until the body is
forty pixels tall. If the archetype is still identifiable, the shape is right; if it needed the
detail, the detail was doing the silhouette's job.

## 7. Performance

The count roughly doubles **on the fallback rig**, which is the arm that ships first: about 8
draw calls per body today, about 15 with seven segments and their gradients. At `MAX_UNITS` that
is ~960 a frame against ~500. The image rig is four layers and comes out *cheaper* than today,
so measure the fallback — measuring the arm that is not shipping is measuring nothing.

`DESIGN.md` says that is affordable and does not say it is free, so this session **measures
rather than assures**:

- `layerDraws` is **free** now: `art-04`'s list already knows its own length by kind, so "the rig
  costs fifteen calls a body" is a count over one array rather than a belief, and the frame dump
  from `art-04` §5 shows exactly which fifteen. Add the per-body breakdown to that dump rather
  than a second counter — a hand-maintained tally beside a list that already has the answer is the
  register that goes stale.
- Take an fps reading with `Shift+S` twice (16 bodies) and once at a full room, paused and then
  live, **with a repeated baseline as the control**. `DESIGN.md` is emphatic that a run without a
  repeated baseline is how `backdrop-filter` was nearly misattributed.
- If the frame moves, the first suspect is a stroke or a gradient that ended up inside the loop,
  not the segment count.

Do not put the rig on an offscreen canvas per body. A cached pose is a canned clip with its own
timeline, which is the thing hard constraint 3 forbids, and it would also be a cache with a
64-body × 8-facing × 5-phase key.

---

## Acceptance test

1. **A Brute's 33-tick windup is visibly readable as a windup** and visibly lasts 33 ticks. Pause
   mid-windup and step; the arm is where `swingLeft/swingSpan` says it is.
2. **The drawn weapon lies on the projected true blade line.** Freeze a strike, switch to
   `[tactical]` with `G`, and the top-down blade is at the same bearing and the same extension.
   Its ground shadow in `[world]` sits under the tip.
3. **Z-order reads at all eight compass facings**, and at the four boundaries between them —
   turn slowly through a full circle and watch for a segment popping. There is no table to get
   wrong; if one pops, §2's key was mis-signed.
4. Legs walk at a rate that matches the ground going past, stop dead when the body stops, and do
   not cycle while a body is being shoved.
5. A body standing still breathes and does nothing else. A body accelerating leans into it.
   Neither moves the blade.
6. **Health bars, callout pills, damage floaters and the pick box still sit on the head** for a
   Brute and a Skitterer standing side by side, at both extremes of the zoom.
7. Click every archetype on the chest and on the feet; the cursor affordance and the click agree.
8. Ghost fade, corpse settle and hit flash all still read, at their existing timings.
9. `[tactical]` and `[dev]` are byte-identical.
10. The console is clean at boot — `assertProjection` included.

## Tripwires

All five, plus `node --check web/rig.js`. No Rust changed.

## Explicitly not in this session

- Any image. The rig emits path items; `art-06` teaches the same slots to emit sprite items, and
  `art-08` is where real character art first arrives in them. **Placement, anchor and pose defects
  that only real art can reveal are `art-08`'s budget, not a bug against this session** — this one
  is judged entirely on the fallback, which is what ships until gate 2 passes.
- Blood, particles, death reactions. `art-09`.
- Shields as their own art. `armOff` holds one when the role is `ROLE_GUARD`; what it looks like
  is a fallback shape here and a sprite later.

---

## Done — and what this plan got wrong

Verified against a pristine `1eafd3c` served side by side with the working tree, at a pinned
`devicePixelRatio` of 2 and a frozen render clock.

**Six corrections to this plan**, in the order they matter:

1. **§2's two lines were mirrored.** Both `side` terms carried the wrong sign. Corrected above,
   with the check that catches it. `rig.js` was written against the corrected pair and
   `assertProjection` proves it against `projX`/`projY` + `lift` at boot; an independent
   re-derivation agrees with `rigProject` to 3.3e-16 across 35 facing/offset combinations.
2. **`RIG_SHOVE_FLOOR` was above the whole distribution and the recoil never fired once.** The
   plan asked for a `~200 ms` flinch on `EVENT_SHOVE` and the first threshold written was 0.035,
   against a feed whose own-recoil rows top out at 0.0028 and whose real shoves top out at 0.0296
   — zero flinches in 23,532 rows. It is 0.005 now, in the gap between the two populations, and
   the measurement is recorded on the constant. **`EVENT_SHOVE.amount` is a velocity gain in world
   units per tick and it is small**: anything else reacting to that row should read the table on
   `RIG_SHOVE_FLOOR` before picking a number.
3. **Acceptance test 4's "does not cycle while a body is being shoved" is not satisfiable from the
   frame**, and the fault is `art-03`'s column rather than this session's use of it. The module
   advances `stride` by `velocity.length() / (radius * STRIDE_PER_RADIUS)` (`crates/web/src/lib.rs`
   at the stride clock), and a knockback is velocity like any other — so a shoved body's legs
   cycle while it slides. What *is* true, and was checked, is the weaker and more useful property:
   a body walled, stopped or standing has legs that stop dead, because `drawRig`'s walk amplitude
   comes from `hypot(vx, vy)` and not from a differenced stride.
4. **The headline gate was stated one word too wide and it deleted acceptance test 5.** "No pose
   is a function of `now`" and "a body standing still breathes" cannot both hold, because there is
   no sim quantity a breath could ride on. §4 now carries the narrowed rule — no pose may be a
   function of `now` *where a sim quantity governs it* — and `RIG_BREATH` is the named exception,
   scoped structurally: zero unless the limb is at rest and the walk has faded, applied to the
   torso and head rows only, and on the frozen-aware clock.
5. **The plan asked for `strideRate` differenced in `syncBodies` and the implementation refused**,
   on `readUnit`'s own argument that a frame is up to `MAX_CATCHUP_TICKS` ticks and often none.
   The walk amplitude is speed instead. That correction is recorded on `RIG_WALK_FULL` and it is
   the better answer.
6. **The count prediction was close but pessimistic, and the stroke count went the right way.**
   Measured per body, counting only paint items:

   | | baseline items / paints (fills + strokes) | art-05 |
   |---|---|---|
   | Fighter, guard | 20 / 8 (3F + 5S) | 36 / 12 (8F + 4S) |
   | Rogue, drawing | 23 / 9 (3F + 6S) | 38 / 12 (8F + 4S) |
   | Brute, guard | 21 / 9 (4F + 5S) | 39 / 13 (10F + 3S) |
   | Skitterer | 20 / 8 (3F + 5S) | 36 / 12 (8F + 4S) |

   So ~8.5 draw calls a body became ~12.5 rather than the ~15 §7 predicted, and **strokes a body
   fell from 5–6 to 3–4** — the silhouette outline and the head outline became fills. Whole-frame
   totals on the four-monster scene went 273 → 338 items at frame 40 and 376 → 441 at frame 200,
   with frame strokes *down* on both (65 → 59, 176 → 170). `DESIGN.md`'s measurement says strokes
   are the number that matters, so this session made the frame cheaper on the metric it is judged
   on and more expensive on the one it is not.

**Two measurements a later session should not have to take again:**

- **The rig's crown lands on `uprightTop` exactly, and then the depth term moves it.** A segment
  declared at `height = BODY_H[kind]` reaches `uprightTop(kind)` to 0 ulp for all four archetypes,
  and so does the head disc's own top. What the check missed until it was drawn is that the head
  rows carry a forward `along`, which is a *depth*, and depth is half of screen y — so the drawn
  crown breathes with the facing. For the uprights (`a0 = 0.05`) that is ±1.2% of body height,
  about 1.4 px, which is what the table's comment claims. **For the Skitterer (`a0 = 0.30` on a
  body 1.1 radii tall) it is ±19%** — the head sits a fifth of its own height above the health
  bar's anchor when it faces away and a fifth below when it faces you. Nothing hangs off nothing:
  the bar, the pill and the pick box all measure from `uprightTop` and the *silhouette* still
  reaches it exactly. It is a look, and `art-06` should size the crawler's head offset knowing it.
- **`wide` is a screen half-width, not a thickness, and the crawler's abdomen is the row where
  that bites.** Fixed here: `RIG_CRAWLER`'s torso went `0.42 -> 0.26`. Every upright row stands up
  the `height` axis, so its half-width comes out horizontal against a body two units wide; the
  crawler's body lies along `along`, so at the profile facings the perpendicular is *vertical*
  against a Skitterer 0.778 units tall. At 0.42 the abdomen was 0.846 units thick and hung 0.132
  below the floor plane — a hard-edged plank at six of the eight facings, and the one archetype
  that failed §6's forty-pixel test. The quad first clears the floor at about `wide = 0.29`; 0.26
  puts it at -0.554..-0.028, inside the floor and 71% of the crown, and it is still 1.7× the
  head's own width head-on. **The next rig row whose axis is not vertical wants this paragraph
  read first.**

**What the gate said.**

- **The flat views are *not* byte-identical to `1eafd3c`, and that is correct rather than a gate
  failure.** §5 mandates replacing `drawLimb`'s `clamp(1 - swingLeft/30, 0.15, 1)` with the real
  fraction from `swingSpan`, and `drawLimb` paints in all three views, so `[tactical]` and `[dev]`
  necessarily change. What was gated instead, and what makes the change safe: **stubbing that one
  expression back restores all eight captures — `[tactical]` and `[dev]` × frames 40, 120, 200,
  450 — hash for hash.** So the divergence is entirely attributable to the intended fix and to
  nothing else. Live, three of four frames differ in each view; frame 40 matches either way,
  because nothing is mid-windup in it.
- `[world]` changed, as expected, and is recorded rather than gated. On the four-monster scene at
  a pinned `dpr` of 2 and `freezeRenderClock(5000)`, frames 40 / 120 / 200 / 450 hash to
  `961b6a22d335632b`, `33524e2d946d8e72`, `6c9e47fa1c5b765a`, `ec0bc33f502b2901` (FNV-ish over
  `toDataURL`). **The same frame captured twice gives the same string**, which is the check that
  matters now that a pose reads the clock: `freezeRenderClock` pins the breath along with the
  seven painters it was built for, so `[world]` is as re-capturable as it ever was.
- **The breath is scoped by construction and the display list proves it.** Sweeping the clock
  across a whole cycle on an idle Fighter, **exactly two of the seven rows move: the torso and the
  head.** The legs, both arms and the blade are bit-identical. Sweeping it on the same body
  walking, mid-windup and mid-strike changes nothing at all — the pose is bit-identical across
  clock values in every case the sim has an opinion about.
- **The `art-04` §1 grep is clean.** Comparing the whole hit set against `1eafd3c` rather than
  counting it: `rig.js` contains no context call at all, `main.js` gains exactly one — a
  `ctx.transform` *inside a comment* — and `draw.js` gains `dlGradientStatic`, which is the
  backend.
- **Z-order: no pop.** Turning a full circle in 4000 steps, the largest per-step move of any
  segment endpoint is 0.005 billboard units, and at every one of the 84 order changes the two
  segments that traded places have keys within 0.0034 of each other — they swap where they are at
  the same depth, which is what "no table to get wrong" buys.
- **The drawn weapon is the sim's segment.** The rig's hilt and tip agree with
  `projX`/`projY` + `lift` applied to `World::blade`'s own endpoints to 2e-12 px, and the bearing
  to 2e-14 rad, over 48 kind/facing/limb-angle combinations.
- **The pose reads no clock.** Identical under two different frozen clocks; the Brute's brace is
  linear in `progress` across all 33 ticks of its windup.
- **The pick box still contains the rig.** `unitAt`'s box is `±(1 + PICK_SLOP/s)` wide and runs
  from the crown to `+ey/ex`; the rig's widest excursion is the main arm at 1.14 and its lowest is
  a near foot at 0.41, both inside for every archetype at every facing.
- Not settled here: **frame rate**, which needs a foreground tab on the user's machine —
  `AGENTS.md` records that an automated tab produced four confident wrong hypotheses in a row.
