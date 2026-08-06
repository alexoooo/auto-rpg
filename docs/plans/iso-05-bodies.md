# iso-05 — bodies stand up

**Goal:** bodies become upright billboards with a flat ground shadow, a flat collision ring and a
ground facing wedge. Everything hung above a body re-anchors to the top of its head. Picking
matches the picture.

**Leaves the game:** the game as intended.

**Depends on:** `iso-04` landed and verified.

---

## 1. Heights

```js
/** Body height in body radii, per archetype, beside `HEADS` (main.js:5256) --
 *  a Skitterer is not a short Fighter. */
const BODY_H = {
  [BODY_FIGHTER]: 3.0,
  [BODY_ROGUE]: 3.2,
  [BODY_BRUTE]: 2.7,
  [BODY_SKITTERER]: 1.1,
};

function bodyHeight(unit) {
  return unit.radius * (BODY_H[unit.kind] || BODY_H[BODY_FIGHTER]);
}
```

Numbers at default framing (`scale ≈ 86`): the tile diamond is 172 × 86 px, a wall block lifts
138 px, a Fighter (`r = 0.5`) is `1.5 · 86 = 129` px tall and `2 · 0.5 · 86 · √2 = 121` px wide; a
Brute (`r = 0.7`) is 163 px tall and 170 px wide. The bodies are genuinely stocky because the sim's
bodies are genuinely stocky — a 1-unit-diameter body on a 1-unit tile. Tune by eye; placeholder is
fine.

**The billboard's width is not a free choice.** The silhouette of an upright cylinder of radius `r`
is exactly the semi-major axis of its ground ellipse, `px(r) · PROJ.ex`. Drawing it narrower puts
the figure inside its own footprint.

## 2. Placeholder art

Four side-view `Path2D`s replacing `SILHOUETTES` (`main.js:5245`), built once at module scope in a
space where **x-unit = y-unit = `px(r)·ex`, origin at the feet, −y is up**:

| kind | shape |
|---|---|
| `fighterUpright` | squarish torso, flat top, square shoulders |
| `rogueUpright` | narrow, hood peak |
| `bruteUpright` | wide, shoulder hump, sunken head notch |
| `skittererUpright` | low and wide, legs splayed either side |

Keep the head as a separate circle from `HEADS` (`main.js:5256`), **reinterpreting `at` as "height
up the body" rather than "along the facing"** — one comment change, one table reused.

Keep the rim-light pass (`main.js:5448-5456`) verbatim; `ctx.clip(path)` works on any closed path.

## 3. Facing, on the ground

An ellipse sector under the feet, reusing the existing `WEDGE_HALF` / `WEDGE_REACH`
(`main.js:5279-5280`) and the existing intent alphas, so the two view modes agree about what
"bearing down" looks like:

```js
ctx.save();
groundSpace(unit.x, unit.y);
ctx.rotate(unit.facing);
ctx.beginPath();
ctx.moveTo(0, 0);
ctx.arc(0, 0, px(unit.radius) * WEDGE_REACH, -WEDGE_HALF, WEDGE_HALF);
ctx.closePath();
ctx.fillStyle = `rgba(${skin.wedge},${(0.08 + 0.20 * fan).toFixed(3)})`;
ctx.fill();
ctx.restore();
```

This is literally the tactical wedge from `main.js:5376-5381` with `groundSpace` in front of it.
The shear is unimodular, so it costs the same pixels.

## 4. Draw order within one body

```
groundSpace:   ground shadow ellipse  ->  facing wedge  ->  collision ring
screen space:  billboard fill + outline  ->  head  ->  rim light  ->  hit flash
groundSpace:   limb, marks, sprint
```

**The shadow changes shape and gets cheaper.** Today it is the dropped silhouette plus the head
circle (`main.js:5391-5406`), which exists because a plain ellipse looked wrong under a rotating
top-down Brute. Upright, it becomes a single flat `arc(0, 0, px(unit.radius) * 1.05, 0, TAU)` fill
in `groundSpace` — one fill instead of two, and it is now load-bearing rather than decorative: the
shadow is what plants an upright billboard on the floor.

**The collision ring must survive** (house rule 4). In `groundSpace` it is the same
`ctx.arc(0, 0, px(unit.radius))` it is today (`main.js:5413-5417`, `5497-5498`) and comes out as an
ellipse exactly on the sim's circle. The `lineWidth = 1 / r` hairline trick becomes anisotropic
(0.9–1.4 px depending on direction); fine for placeholder.

## 5. The branch structure

`artOn()` is false in both top-down modes, so only two of the four combinations exist:

| | `art` | `!art` |
|---|---|---|
| **iso** | billboard | *unreachable* |
| **topdown** | *unreachable today* | today's disc + wedge, verbatim |

So `drawCharacter` (`main.js:5303`) grows exactly one new branch nested inside the existing `art`
arm:

```js
if (!art) {
  …disc + wedge, unchanged (main.js:5362-5389)…
} else if (PROJ.upright) {
  …billboard…
} else {
  …today's silhouette art, unchanged (main.js:5390-5457)…
}
```

**Gate on `PROJ.upright`, never on `art`.** See `iso-00-overview.md` §3.

The `ghost` early-return (`main.js:5339-5360`) gets the same treatment — a dashed *billboard*
outline under iso. Its dash `[0.28, 0.22]` is in radii over a ~10-radius perimeter, about 23 marks,
nowhere near the `MAX_DASH_SEGMENTS` regime.

The comment at `main.js:5295-5298` about keeping all branches in one function still holds; honour
it. If it later wants splitting, the seam is `drawBodyFlat` / `drawBodyUpright` sharing a pre-pass
(shadow, wedge, ring) and a post-pass (limb, marks, sprint) — but that is not this project.

## 6. Anchoring everything hung above a body

Two helpers do all of it:

```js
/** The world height above the ground point that anything hung over a body has to
 *  clear. Under `topdown` that is the top of the disc; under iso, the top of the
 *  head. */
function bodyTopWorld(unit) { return PROJ.upright ? bodyHeight(unit) : unit.radius; }

function anchorY(unit) { return projY(unit.x, unit.y) - lift(bodyTopWorld(unit)); }
```

Under top-down `anchorY` is `px(y) − px(radius)` — **exactly today's value** at `main.js:5600`.
So each of these is one or two lines:

| function | line | change |
|---|---|---|
| `drawHealth` | 5595-5600 | `x = projX(unit.x, unit.y) - w / 2`, `y = anchorY(unit) - 8` |
| `drawCallouts` | 6023-6026 | `cx = projX(x, y)`, `top = anchorY(actor) - 18 - h - 6 * ease`; the `radius` fallback becomes a `bodyTopWorld`-shaped fallback |
| `drawFloaters` | 5946-5947 | `x = projX(f.x + f.jitter * 0.3, f.y)`, `y = projY(f.x, f.y) - lift(rise)` |

Because `lift === px`, `FLOATER_RISE = 0.8` (`main.js:5785`) keeps its exact pixel meaning in both
modes ✓.

## 7. `unitAt` — the picture and the pick must agree

`main.js:2214-2225`. Under iso the painted body is a billboard *above* its ground point, so a click
on a monster's chest unprojects to a world point roughly `bodyHeight` behind it and the current
circle test misses.

The signature and both call sites (`main.js:2397` in `endDrag`, `main.js:7173` in the pick phase)
are unchanged.

```js
function unitAt(point, state) {
  // Re-projected here rather than carried on the point: `endDrag` fires frames
  // after the move that produced it and the camera pans in between. A world point
  // re-projected through the *current* origin is where the cursor is now; a
  // screen point stored at sample time is where it was.
  const sx = projX(point.x, point.y);
  const sy = projY(point.x, point.y);
  let best = null;
  let nearest = Infinity;
  let bestDepth = -Infinity;
  for (const unit of state.monsters) {
    if (!canSee(unit)) continue;
    if (!PROJ.upright) {
      const d = Math.hypot(unit.x - point.x, unit.y - point.y);
      if (d > unit.radius + PICK_SLOP || d >= nearest) continue;
      nearest = d;
      best = unit;
      continue;
    }
    const bx = projX(unit.x, unit.y);
    const by = projY(unit.x, unit.y);
    const halfW = px(unit.radius) * PROJ.ex + px(PICK_SLOP);
    const top = by - lift(bodyHeight(unit)) - px(PICK_SLOP);
    const bot = by + px(unit.radius) * PROJ.ey + px(PICK_SLOP);
    if (sx < bx - halfW || sx > bx + halfW || sy < top || sy > bot) continue;
    // Depth, not distance: two overlapping billboards are one in front of the
    // other and the player clicked the front one. This is the same key the
    // painter sorts on, which is what "the picture and the pick agree" means.
    const depth = unit.x + unit.y;
    if (depth <= bestDepth) continue;
    bestDepth = depth;
    best = unit;
  }
  return best;
}
```

The box spans the billboard **plus** the ground ellipse's lower half, so both the body and its feet
are clickable. The `!PROJ.upright` arm is byte-identical to today.

## 8. The hero outline

`drawHeroThrough` from `iso-04` becomes the real thing: stroke the upright billboard path in
`rgba(110,231,255,0.55)` at `lineWidth 1.5`, unconditionally, after the depth walk. One stroke of a
small closed path — well inside budget.

## 9. Corpses

`drawCorpse` (extracted in `iso-04` from `main.js:5611`) uses the billboard path under iso, fading
and settling as today. Its `translate`/`rotate`/`scale` becomes `groundSpace(c.x, c.y)` plus the
existing rotate/scale for the flat arm; the upright arm needs no rotation.

## 10. Limb, marks, sprint

One line each — `translate(px(x), px(y))` becomes `groundSpace(unit.x, unit.y)`:

| function | line |
|---|---|
| `drawLimb` | 4988 — all ~124 lines below it unchanged |
| `drawMarks` | 5118 — twice |
| `drawSprint` | 5525 |

Their `rotate(θ)` / `rotate(−θ)` inverse pairs are **fine** under the shear: canvas composes
`CTM·R(θ)·R(−θ) = CTM` exactly regardless of what `CTM` is. Do not convert them to `save`/`restore`.

`drawLimb`'s `setLineDash([max(3, r*0.3), max(3, r*0.35)])` is in user space, so its mark count is
unchanged.

---

## Acceptance test

1. **Click every monster on the chest *and* on the feet.** The cursor affordance
   (`main.js:7172-7174`) and the click must agree in both places.
2. Health bars sit above heads at every zoom, with a Brute standing next to a Skitterer.
3. Callouts and damage floaters clear the head and do not collide with the bar.
4. Ghost fade, corpse settle and hit flash all still read.
5. A body standing on a wall's north side is occluded; its health bar is too, or is not — decide
   consciously and write down which.
6. The facing wedge is legible at every zoom and matches what the body is actually doing.
7. `Tactical` and `Dev` are byte-identical to before.

## Tripwires

All five from `iso-00-overview.md`.

## Explicitly not in this session

- Free-standing decals — `iso-06`.
- Lifting arrows — `iso-06`.
