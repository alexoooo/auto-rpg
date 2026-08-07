# iso-06 — everything on the floor lies on the floor

**Goal:** the free-standing ground decals go into `groundSpace`, and arrows get a presentation
height with a shadow that marks the point the sim actually tests.

**Leaves the game:** every ring, ellipse and path that logically lies on the ground looks like it
does.

**Depends on:** `iso-05` landed and verified.

**This session is mostly one-line changes.** Each decal already draws in "screen pixels of world
offset from an anchor", which is exactly `groundSpace`'s input space, so converting one is a change
at the top and nothing below it moves.

---

## 1. The conversion table

| function | line | change | dash risk |
|---|---|---|---|
| `drawVision` | 4860 | `groundSpace(unit.x, unit.y)`, then `arc(0, 0, px(unit.sight))` | **none** — solid by design (`main.js:4845-4852`). The unimodular shear leaves the fill area unchanged and the perimeter 9% longer, both within noise. |
| `drawReach` | 4938 | same; `arcDash(px(r), 3, 5)` unchanged | **safe** — dashing is in user space, so the mark count is identical to today and `MAX_DASH_SEGMENTS` still bites at the same radius. Verify the count has not moved. |
| `drawLock` | 4652 | `groundSpace(state.orderX, state.orderY)` for the ring; the tether becomes two `projX`/`projY` endpoints (a world line stays a line under an affine map) | safe — `[3,4]` on `r ≈ 0.65` units, ~55 marks |
| `drawDestination` | 4713 | same; draw the crosshair inside `groundSpace` too, so its arms lie on the floor with the ring | safe — `[3,4]` on `r = 0.55` |
| `drawPortal` | 4501 | `groundSpace(state.portalX, state.portalY)`; the shut ring, the two spinning arcs and the glow gradient all work unchanged inside it | safe — `[5,7]` on `r = 0.9` units, ~40 marks |
| `drawTrail` | 4544 | `projX`/`projY` each endpoint (already done in `iso-01`) — verify only | none |
| `drawRoute` | 4579 | `projX`/`projY` each point and the hero anchor (already done in `iso-01`); beads via `groundSpace` | **⚠ pre-existing risk — see §3** |
| collision ring | 5413, 5497 | inside `groundSpace` (done in `iso-05`) — verify only | none |

**Nothing here reintroduces expensive dashing**, and two things got cheaper along the way: the wall
`edge` stroke was deleted in `iso-03`, and the body shadow was simplified in `iso-05`.

## 2. A note on `drawPortal`'s spin

Inside `groundSpace` the two counter-rotating arcs' angle becomes parametric rather than uniform,
so the spin will subtly ease — fastest across the screen-wide axis, slowest across the compressed
one. That is what a ring spinning flat on the ground actually looks like from this angle. It is
decorative; leave it.

## 3. `drawRoute`'s dash is the last uncapped one on the page

`main.js:4596` sets `[4, 6]` on a polyline of up to `ROUTE_MAX = 24` legs at `DRAG_SAMPLE = 1.2`
world units each — roughly 2,500 px of path at default zoom, about **250 marks**. That is
pre-existing and iso does not make it materially worse, but it is exactly the pattern
`MAX_DASH_SEGMENTS` (`main.js:4922`) exists to prevent, and it has no cap.

**Corrected while landing: `ROUTE_MAX` does not bound the path being drawn.** `sampleDrag` thins
`drag.points` to `DRAG_SAMPLE` spacing and never caps the count; `trimPath`'s `ROUTE_MAX` is
applied in `endDrag`, on the way out. So the *walked* route is 24 legs and the route *under the
finger* is as long as the player scribbles — the case with no bound at all, and the one that
actually made this worth taking now. Measured: 248 marks top-down at default framing, 175–350 under
iso depending on bearing, 619/438–876 at `ZOOM_MAX`, all for the 24-leg case alone. After: 96.

`arcDash` takes a *radius* and assumes a circle, so it does not apply here. The sibling it needs:

```js
/** `arcDash` for a path whose length is known rather than implied by a radius.
 *  Same contract: return the pattern asked for when it fits, stretch it when it
 *  does not, preserve the mark-to-gap ratio. */
function pathDash(length, on, off) {
  const period = on + off;
  const want = length / MAX_DASH_SEGMENTS;
  if (want <= period) return [on, off];
  const k = want / period;
  return [on * k, off * k];
}
```

The length is already being walked to build the path — accumulate `Math.hypot` per leg and pass the
total. **Take this in this session** rather than deferring it; the loop that needs the number is the
loop being edited.

## 4. `drawShots` — a presentation height

Arrows have no z anywhere in the frame (`main.js:979-987` parses `{x, y, heading, faction}` and
nothing else), so the height is invented by this file and must be labelled as such.

```js
/** How high an arrow flies, in world units. **Presentation only.** The sim's
 *  arrow is a point and `resolve_shots` tests the segment it travelled this
 *  tick; this file does not get to invent an altitude the hit test does not know
 *  about. So the number is constant and the flight is flat -- a parabola would be
 *  the page making up physics that the sim would then disagree with. */
const SHOT_Z = 0.55;
```

Rewriting the loop body (`main.js:5568-5589`):

```js
// The ground shadow first, and it is not decoration: it is the only thing that
// makes the altitude readable, and it marks the point the sim actually tests.
// House rule 4.
ctx.save();
groundSpace(shot.x, shot.y);
ctx.fillStyle = "rgba(0,0,0,0.35)";
ctx.beginPath();
ctx.arc(0, 0, px(0.1), 0, TAU);
ctx.fill();
ctx.restore();

// The shaft, lying in the world plane at shoulder height.
ctx.save();
ctx.translate(0, -lift(SHOT_Z));
groundSpace(shot.x, shot.y);
ctx.rotate(shot.heading);
…the two existing strokes, unchanged…
ctx.restore();
```

The `translate`/`rotate` inverse pairs go, replaced by one `save`/`restore` per shot — **not**
because the pairs are inexact (they are exact under any CTM) but because `groundSpace` uses
`ctx.transform`, which has no tidy inverse pair. At ≤32 shots that is 64 extra save/restores per
frame, which is irrelevant.

Note the `translate(0, -lift(SHOT_Z))` comes **before** `groundSpace`, so the lift is in screen
space — straight up the screen, which is what a height is.

**Corrected while landing: both new passes need a `PROJ.upright` gate.** The snippet above is
written from the iso side and is not a no-op top-down — it would lift every arrow 47 px up the
screen and put a black dot where the arrow used to be, and `Tactical` and `Dev` are the A/B
control. From directly above a height is invisible by construction: the arrow and its shadow are
the same pixels. Same gate, and the same argument, as `drawCharacter`'s ground pre-pass.

## 5. `drawLantern` — squash it

`main.js:4477-4491`. Now is the time, since everything else on the floor is elliptical:

```js
ctx.save();
ctx.clip(levelPaths.floorLit);
if (PROJ.shear) {
  // The gradient is a circle and the answer is not; the lantern has always been
  // a cosmetic softening of an exact tile-granular fact (see the note above this
  // function). Squashing it 2:1 puts the softening on the same ellipse as the
  // vision ring it is standing in for.
  ctx.translate(x, y);
  ctx.scale(1, 0.5);
  ctx.translate(-x, -y);
}
ctx.fillStyle = lamp;
ctx.fillRect(x0, y0, w, h);
ctx.restore();
```

⚠ **The `fillRect` bounds must be un-squashed too**, or the fill will not cover the viewport. Either
compute the rect in the squashed space, or — simpler and what the earlier `drawLantern` fix already
established — expand `h` by 2× and shift `y0` accordingly before scaling. Verify at maximum zoom-out
with the camera in each corner; a lantern that stops short of the viewport edge is the failure.

The gradient radius `far` is in the pre-squash space, so it needs no change.

---

## Acceptance test

1. Every ring on the floor is an ellipse with the same 2:1 aspect as the tiles. Stand a body on a
   tile boundary and confirm its collision ring traces the tile's diamond proportions.
2. **The `drawReach` dash mark count has not moved.** Re-run the per-function stroke attribution
   from `DESIGN.md`'s performance notes; `drawReach` was 567 marks/frame inside a 52 fps result and
   must stay there.
3. `perf` `render` mean has not regressed against `iso-05`.
4. Arrows read as flying: the shadow tracks the point, the shaft floats above it, and the two
   separate visibly as an arrow crosses open floor.
5. An arrow flying behind a wall block is occluded (this was `iso-04`'s job — confirm the lift did
   not break it, since the depth key is still the ground point).
6. The lantern reaches the viewport edge at maximum zoom-out with the camera in each of the four
   corners.
7. A 24-waypoint route no longer costs an unbounded number of dash marks — count them.
8. `Tactical` and `Dev` are byte-identical to before — **with one sanctioned exception, added while
   landing.** `drawRoute` runs above `render`'s projection branch, so §3's dash cap reaches the
   control modes too. At default framing it engages past 960 screen pixels of polyline, about nine
   legs, and a ten-waypoint route draws as a coarser dash than it did. Confirmed by replay: this is
   the *only* difference in either control mode across every function this session touched;
   everything else is identical to 1e-12 px. Blessed rather than reverted, because an unbounded
   dash is a hazard the top-down page had all along and capping it in one mode only would leave the
   two modes disagreeing about something the projection had nothing to do with.

## Tripwires

All five from `iso-00-overview.md`.

## Explicitly not in this session

- Wall face shading, camera overscan tuning, aiming — `iso-07`.
