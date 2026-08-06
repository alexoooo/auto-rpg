# iso-01 — the projection seam

**Goal:** introduce the projection indirection and route every world→screen and screen→world
conversion through it, with **all three view modes still top-down**.

**Acceptance test: the screen does not change.** This session ships zero visual difference.

**Why it lands alone:** every later session builds on this. A sign error in the inverse, caught
here, is a five-minute fix; caught in `iso-04`, it looks like a depth-sort bug. Land it, verify
nothing moved, commit, then move on.

---

## 1. The projection table

Add near the camera state (`main.js:1829-1833`, beside `viewport`/`dpr`/`zoom`/`cam`/`scale`).

```js
/** How world coordinates become screen coordinates.
 *
 *  Six coefficients rather than a branch, because the alternative is `if (iso)`
 *  at forty call sites. The forward map is
 *
 *      sx = (ax*wx + bx*wy) * scale
 *      sy = (ay*wx + by*wy) * scale
 *
 *  and the inverse is its 2x2 inverse with the `scale` divided back out.
 *
 *  **`proj` is its own column in `VIEW_MODES` and `artOn()` never stands in for
 *  it.** Art is on in exactly one mode today and that is the mode going
 *  isometric, so the two bits are indistinguishable right now and will stop
 *  being the day a fourth mode exists. See `iso-00-overview.md`. */
const PROJ_TOPDOWN = {
  id: "topdown",
  ax: 1, bx: 0,
  ay: 0, by: 1,
  ix: 1, jx: 0,
  iy: 0, jy: 1,
  ex: 1, ey: 1,        // a world circle of radius r -> ellipse (r*scale*ex, r*scale*ey)
  shear: false,        // `groundSpace` is a bare translate
  upright: false,      // bodies lie flat
};

/** Classic 2:1 isometric. `K = scale`, so `det = scale^2` -- the visible floor
 *  area and therefore `VIEW_UNITS_Y`'s meaning are preserved exactly, the vision
 *  disc's fill cost does not move, and a world unit of height is `px(1)`.
 *
 *  Inverse: A = scale*[[1,-1],[0.5,0.5]], det A = scale^2,
 *           A^-1 = (1/scale)*[[0.5, 1],[-0.5, 1]].
 *  Round trip: (1,0) -> (scale, scale/2) -> (1, 0); (0,1) -> (-scale, scale/2) -> (0, 1). */
const PROJ_ISO = {
  id: "iso",
  ax: 1,   bx: -1,
  ay: 0.5, by: 0.5,
  ix: 0.5,  jx: 1,
  iy: -0.5, jy: 1,
  ex: Math.SQRT2,      // 1.4142135623730951
  ey: Math.SQRT1_2,    // 0.7071067811865476, exactly ex/2
  shear: true,
  upright: true,
};

/** Which one is live. Written only by `setViewMode`. */
let PROJ = PROJ_TOPDOWN;
```

`PROJ_ISO` is defined this session but **never selected** — every `VIEW_MODES` row gets
`proj: "topdown"`. It exists so the round-trip assertion can exercise it.

## 2. The five functions

Put these immediately after `px()` (`main.js:3944`) — or hoist `px` up beside them; they belong
together and the file's habit is to keep a matrix in one place.

```js
/** World to screen, x and y separately.
 *
 *  Two scalar functions and not one point-returning function: a shared out-object
 *  would alias the moment two projections appear in one expression
 *  (`moveTo(project(a)); lineTo(project(b))`), and a fresh object per call would
 *  allocate in the hot path, which this file does not do. Two multiplies and an
 *  add inline to nothing. Under `topdown` these are literally `wx * scale`. */
function projX(wx, wy) { return (PROJ.ax * wx + PROJ.bx * wy) * scale; }
function projY(wx, wy) { return (PROJ.ay * wx + PROJ.by * wy) * scale; }

function unprojX(sx, sy) { return (PROJ.ix * sx + PROJ.jx * sy) / scale; }
function unprojY(sx, sy) { return (PROJ.iy * sx + PROJ.jy * sy) / scale; }

/** World units of *height* to screen pixels upward.
 *
 *  Identical to `px` by construction -- in a 2:1 projection with `K = scale` a
 *  unit cube's vertical edge is the ground diamond's half-width, which is
 *  `px(1)`. It exists as its own name so the call sites say which of the two
 *  things they mean, and so a future non-cube projection has one place to change. */
function lift(h) { return h * scale; }

/** The CTM for anything lying flat on the floor.
 *
 *  Its input space is exactly the space `drawLimb`, `drawMarks`, `drawSprint` and
 *  every decal already work in: screen pixels of top-down world offset from the
 *  anchor. So converting one of them is a one-line change at the top and nothing
 *  below it moves.
 *
 *  `ctx.transform(a,b,c,d,e,f)` composes x' = a*x + c*y + e, y' = b*x + d*y + f,
 *  so (1, 0.5, -1, 0.5, 0, 0) maps (px(dx), px(dy)) to
 *  (scale*(dx-dy), scale*(dx+dy)/2) -- the forward projection's offset, and
 *  therefore consistent with `projX`/`projY` by construction rather than by
 *  a second derivation.
 *
 *  **det = 1*0.5 - (-1)*0.5 = 1.** The shear is unimodular, so every ground fill
 *  covers exactly the pixels it covers today. That is the whole reason the
 *  isometric conversion is not a rasteriser regression, and it is why dash
 *  patterns keep their measured mark counts: dashing happens in user space and
 *  is transformed afterwards. */
function groundSpace(wx, wy) {
  ctx.translate(projX(wx, wy), projY(wx, wy));
  if (PROJ.shear) ctx.transform(1, 0.5, -1, 0.5, 0, 0);
}
```

## 3. `VIEW_MODES` gets a column

`main.js:2812-2837` — add `proj` to all three rows, **all `"topdown"` this session**:

```js
{ id: "regular",  label: "Regular",  art: true,  fog: true,  dev: false, proj: "topdown", hint: … },
{ id: "tactical", label: "Tactical", art: false, fog: true,  dev: false, proj: "topdown", hint: … },
{ id: "dev",      label: "Dev",      art: false, fog: false, dev: true,  proj: "topdown", hint: … },
```

And beside `artOn()` (`main.js:2854`):

```js
const PROJECTIONS = { topdown: PROJ_TOPDOWN, iso: PROJ_ISO };
```

## 4. `setViewMode` — three additions

`main.js:2879-2902`. Order matters.

```js
function setViewMode(id) {
  …existing mode lookup…
  PROJ = PROJECTIONS[currentView().proj] || PROJ_TOPDOWN;

  // `fit` is projection-dependent and `Path2D` holds *pixels*, so the scale has
  // to settle before anything is baked against it. Without this the first frame
  // after a mode change draws the room at the previous projection's scale.
  resize();

  // A projection change is a cut, not a pan. Same reasoning as the descent
  // (main.js:6880) and the restart.
  snapCamera(SCRATCH_STATE_OR_CURRENT);

  rebuildLevelPaths(readMap(), wasm.map_revision());
  …existing hint…
}
```

Use whatever state handle the surrounding code already has for `snapCamera`; the existing call
sites are the model.

## 5. `viewOrigin` — `main.js:2146-2156`

```js
function viewOrigin() {
  const safe = safeRect();
  const q = dpr * 4;
  return {
    x: Math.round((safe.x + safe.w / 2 - projX(cam.x, cam.y)) * q) / q,
    y: Math.round((safe.y + safe.h / 2 - projY(cam.x, cam.y)) * q) / q,
  };
}
```

**The quarter-device-pixel snap stays exactly as it is, and the reasoning in the comment at
`main.js:2123-2144` survives verbatim.** The snap is a screen-space translation applied *after* the
projection; it has nothing to say about world axes. What it buys — the baked `Path2D` and the
`CanvasPattern` not crawling under an easing camera — is unchanged.

## 6. `pointerToWorld` — `main.js:2180-2187`

```js
function pointerToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  const origin = viewOrigin();
  const sx = event.clientX - rect.left - origin.x;
  const sy = event.clientY - rect.top - origin.y;
  return { x: unprojX(sx, sy), y: unprojY(sx, sy) };
}
```

Still reads `viewOrigin()` rather than re-deriving it. Still one matrix written twice — now with
the linear half factored into the same table `projX`/`projY` read. `milli()`'s clamp
(`main.js:2234`) is untouched.

## 7. `cameraTarget` — clamp in screen space

`main.js:2079-2094`. The visible world region under iso is a rhombus, so there is no correct
per-axis world clamp. Clamp the camera's *projected* position against the arena's *screen*
bounding box instead. This degenerates to today's clamp exactly, and is shorter than it.

```js
/** The arena's screen-space box, pre-pan, in CSS pixels.
 *
 *  Hoisted and mutated rather than returned fresh: this runs every frame and the
 *  file allocates nothing per frame. */
const ARENA_BOX = { x0: 0, y0: 0, x1: 0, y1: 0 };

function arenaBox() {
  const A = arena.x;
  const B = arena.y;
  if (PROJ.shear) {
    ARENA_BOX.x0 = -B * scale;              // the west corner,  world (0, B)
    ARENA_BOX.x1 = A * scale;               // the east corner,  world (A, 0)
    ARENA_BOX.y0 = -lift(WALL_H);           // rock stands above world y = 0
    ARENA_BOX.y1 = ((A + B) * scale) / 2;   // the south corner, world (A, B)
  } else {
    ARENA_BOX.x0 = 0;
    ARENA_BOX.y0 = 0;
    ARENA_BOX.x1 = A * scale;
    ARENA_BOX.y1 = B * scale;
  }
  return ARENA_BOX;
}

function cameraTarget(state) {
  const anchor = state.hero || cam;
  const safe = safeRect();
  const box = arenaBox();
  const over = CAMERA_OVERSCAN * scale;   // world units of permitted void, as pixels
  const hw = safe.w / 2;
  const hh = safe.h / 2;

  // "Clamp if the interval exists, centre if it does not" -- which is exactly
  // what the two `halfW * 2 >= arena.x + ...` tests were saying, said once.
  const loX = box.x0 + hw - over;
  const hiX = box.x1 - hw + over;
  const loY = box.y0 + hh - over;
  const hiY = box.y1 - hh + over;
  const sx = loX <= hiX ? clamp(projX(anchor.x, anchor.y), loX, hiX) : (box.x0 + box.x1) / 2;
  const sy = loY <= hiY ? clamp(projY(anchor.x, anchor.y), loY, hiY) : (box.y0 + box.y1) / 2;
  return { x: unprojX(sx, sy), y: unprojY(sx, sy) };
}
```

`WALL_H` does not exist until `iso-03`. **Declare it in this session** as a top-level const with
its documentation (see `iso-03`), value `1.6`; nothing reads it under `topdown` because that arm
does not touch `y0`.

**Degeneracy proof, worth keeping in the commit message.** Top-down gives
`box = {0, 0, A·scale, B·scale}`; the x interval is `[hw − over, A·scale − hw + over]`, and dividing
by `scale` gives `[halfW − OVERSCAN, A − halfW + OVERSCAN]`, today's clamp at `main.js:2088`
exactly. The non-empty test `loX ≤ hiX` ⟺ `A + 2·OVERSCAN ≥ 2·halfW`, the negation of today's
centre test at `main.js:2086`, exactly.

`updateCamera` (`main.js:2099`) and `snapCamera` (`main.js:2109`) consume the target and need no
change.

## 8. `resize` — one line

`main.js:2027-2034`. Only `fit` moves:

```js
/** The arena's screen extent in multiples of `scale`.
 *    topdown: { w: A,     h: B }
 *    iso:     { w: A + B, h: (A + B) / 2 + WALL_H }   */
function arenaSpan() {
  const A = arena.x;
  const B = arena.y;
  return PROJ.shear
    ? { w: A + B, h: (A + B) / 2 + WALL_H }
    : { w: A, h: B };
}

// in resize():
const span = arenaSpan();
const fit = Math.min(safe.w / span.w, safe.h / span.h);
const base = safe.h / VIEW_UNITS_Y;      // unchanged
scale = clamp(base * zoom, fit, base * ZOOM_MAX);
zoom = scale / base;
```

`base` and `ZOOM_MAX` are untouched, so zoom feels identical. The existing invariant that
`fit < base` (`main.js:2023-2026`) generalises: iso needs `(A + B)/2 > VIEW_UNITS_Y`, i.e.
`40 > 11` for a 48×32 room.

## 9. The ~40 position pairs

Mechanical. Every `px(a.x), px(a.y)` **pair** becomes `projX(a.x, a.y), projY(a.x, a.y)`.
Every *other* `px()` call — line widths, dash sizes, radii, health-bar widths, floater font size,
`SHAFT`, `ROUTE_MARK` — **stays exactly as it is**. Roughly 30 of the 71 call sites never change.

Find them with:

```
rg -n 'px\([^)]*\.x\)' web/main.js
```

Known sites: `drawLantern` (4480-4482), `drawPortal` (4503-4505), `drawTrail` (4554-4555),
`drawRoute` (4600, 4624), `drawLock`/`drawDestination` (4656-4657, 4719-4720),
`drawVision` (4866), `drawReach` (4947), `drawCharacter` (5305-5307),
`drawSprint` (5530), `drawShots` (5568-5569), `drawHealth` (5599-5600),
`drawCorpses` (5623), `drawFloaters` (5946-5947), `drawCallouts` (6023-6026).

**Do not convert `translate(px(x), px(y))` to `groundSpace` in this session.** That is `iso-06`'s
job and it changes behaviour under iso. Here it becomes `translate(projX(…), projY(…))`, which is
byte-identical under `topdown`.

## 10. The round-trip assertion

This is a classic script with no test harness, and an inverse wrong by a sign is a whole session of
confusion. Six lines at boot, next to the `FRAME_LAYOUT_VERSION` handshake (`main.js:7315-7330`):

```js
/** Both projections, forward then back, on a coarse grid. Costs nothing at boot
 *  and turns a sign error from a day of confusion into a console line. */
function assertProjection() {
  const was = PROJ;
  for (const p of [PROJ_TOPDOWN, PROJ_ISO]) {
    PROJ = p;
    for (let wx = 0; wx <= 48; wx += 6) {
      for (let wy = 0; wy <= 32; wy += 4) {
        const sx = projX(wx, wy);
        const sy = projY(wx, wy);
        console.assert(
          Math.abs(unprojX(sx, sy) - wx) < 1e-9 && Math.abs(unprojY(sx, sy) - wy) < 1e-9,
          `projection ${p.id} round-trip failed at ${wx},${wy}`
        );
      }
    }
  }
  PROJ = was;
}
```

Call it once at boot, after `resize()` so `scale` is non-zero.

---

## Acceptance test — nothing changed

1. Screenshot `Regular` before and after; they must agree to within the quarter-pixel snap.
2. Click a recognisable tile in each of the four corners and read the hint's coordinates.
3. Wheel through the full zoom range; `zoom` clamps at both ends and does not stick.
4. Open and close both rails while walking east — the camera re-centres, no jump.
5. Drag a route with six waypoints; the beads land where the cursor went.
6. Press the view toggle through all three modes twice; **the room does not resize**.
7. `assertProjection()` prints nothing at boot.

## Tripwires

All five from `iso-00-overview.md`. Nothing in this session goes near Rust.

## Explicitly not in this session

- Any `VIEW_MODES` row set to `"iso"`.
- Any `groundSpace` call site.
- Any change to `rebuildLevelPaths`, `drawLevel` or `render`'s draw order.