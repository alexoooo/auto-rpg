# Isometric world view — overview

**Not a session.** The map, the decisions, and the four facts every session depends on.
Sessions are `iso-01` … `iso-07`, each independently landable and each leaving the game playable.

---

## What this is

The world view is top-down. It becomes a classic 2:1 isometric room, Diablo-1 style.
Placeholder art is explicitly fine — the structure is the deliverable, the art is not.

## Why the performance work had to come first

The measurements in `DESIGN.md` ("Performance notes") were taken on the machine that was slow,
by removing work rather than hiding it, with a repeated baseline as a control. They say:

- **Fills, `fillRect`, `drawImage`, sprites and text are effectively free.** Suppressing every
  drawing primitive was worth no more than suppressing `stroke` alone (49.9 vs 54.4 fps).
- **Strokes are the scarce resource.** With the canvas suppressed entirely, 55.9 fps; with only
  strokes suppressed, 55.5. All remaining canvas cost is stroking.
- **Long dashed strokes are catastrophic.** A fixed `[7,9]` px dash on a sight ring produced
  3,363 tessellated sub-paths per frame and cost 40 fps. Cost is the *product* of mark count and
  radius, and it is superlinear — 5× the marks cost 8.9× the time.

**This inverts the instinct.** A world of filled diamonds and blitted sprites is the *cheap*
direction here. A world of outlined tiles is not. The conversion actually **deletes** a stroke —
the wall rim (`main.js:4216-4239`, stroked at `4435-4440`) is replaced by three flat fills — so
`iso-03` should measure as a frame-time *gain*.

An earlier draft of `DESIGN.md` concluded the binding constraint was blended fill area. That was
wrong; the file now records why. Do not plan against it.

## Decisions taken with the user — settled, do not revisit

| | |
|---|---|
| **Projection** | Classic 2:1 isometric, affine, Canvas2D. Canvas2D cannot express true perspective at all; that would mean a WebGL rewrite, which was declined. |
| **Top-down survives** | `Regular` becomes isometric. `Tactical` and `Dev` stay top-down, as the A/B control for the whole project. |
| **Bodies** | Upright billboards, flat ground shadow, flat collision ring. Facing moves to a ground wedge. |
| **Walls** | Proper depth interleave. Walls baked per depth row, merged with depth-sorted bodies. |

---

## The four load-bearing facts

### 1. The top-level CTM stays translate-only

The projection lives in the coordinates handed to draw calls, **not** in `ctx.setTransform`.
`render`'s header (`main.js:6062-6070`) is untouched:

```js
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.clearRect(0, 0, viewport.w, viewport.h);
const origin = viewOrigin();
ctx.translate(origin.x, origin.y);
```

This is what preserves the "one matrix written twice" rule the file states three times
(`main.js:2117-2122`, `2161-2167`, `4342-4345`), keeps `viewOrigin()`'s quarter-device-pixel snap
valid, and keeps `drawLevel`'s viewport-clamped `fillRect` trick working.

### 2. `K = scale` — no second scale factor anywhere

```
sx = (wx - wy) * scale
sy = (wx + wy) * scale / 2
```

`det = scale²`, so:

- `VIEW_UNITS_Y` (`main.js:1813`) keeps meaning what its comment says about how much room you see.
- The vision disc's fill area is **unchanged**, so the measurement above still holds.
- A world unit of height is exactly `px(h)`. **`lift(h) === px(h)`** in both projections, so every
  anchor expression (health bars, floaters, callouts) is one formula in both modes.

`K = scale/√2` was rejected: it doubles the visible floor area, halves the vision-disc fill
(invalidating the measurement), and forces a third scale factor for height.

### 3. `art` and `iso` are **not** the same bit

`artOn()` is true in exactly one mode, and that mode is the one becoming isometric. So today they
are the same bit, and any code inferring the projection from `artOn()` will work perfectly until a
fourth view mode exists, then fail in a way that takes an hour to find.

**The projection gets its own column in `VIEW_MODES` (`main.js:2812`), read only through `PROJ`.
`artOn()` never stands in for it.** This is the single easiest mistake to make in this project.

### 4. `groundSpace()` is what makes it cheap

```js
function groundSpace(wx, wy) {
  ctx.translate(projX(wx, wy), projY(wx, wy));
  if (PROJ.shear) ctx.transform(1, 0.5, -1, 0.5, 0, 0);
}
```

Its input space is exactly the space `drawLimb`, `drawMarks`, `drawSprint` and every decal already
work in: screen pixels of top-down world offset from an anchor. Three properties earn it:

- **`det = 1·0.5 − (−1)·0.5 = 1`.** Unimodular. **Every ground fill costs exactly the pixels it
  costs today** — vision disc, guard wedge, shadow, all unchanged in rasteriser cost.
- **Dashes are applied in user space and then transformed.** `arcDash` (`main.js:4930`) keeps its
  meaning and `MAX_DASH_SEGMENTS` keeps biting at the same radius. Converting decals to
  `ctx.ellipse` instead would *silently* change every mark count — the exact bug class that cost
  40 fps this week.
- `ctx.arc` under it yields the correct ellipse for free; `ctx.rotate(facing)` yields the correct
  sheared rotation for free.

Where an explicit ellipse *is* wanted: a world circle of radius `r` projects to an **axis-aligned**
ellipse (both components share phase `θ + π/4`) with semi-axes `r·scale·√2` and `r·scale·√2/2`, so
`ctx.ellipse(x, y, rx, ry, 0, 0, TAU)` needs no rotation.

---

## Layer diagram

```
GROUND LAYER            (no depth; today's painter order)
  floor passes            clip diamonds -> pattern -> vignette -> grid
  lantern
  remembered walls        unbanded, both faces
  portal, trail, route, destination/lock
  vision discs, reach rings
DEPTH LAYER             (merge walk, iso only)
  lit wall bands   ×   { corpses, monsters, hero, shots }
OVERLAY LAYER           (screen space)
  hero outline pass       iso only
  health bars, floaters, callouts
```

Moving **all** flat ground decals ahead of the walls is not a compromise, it is *more correct*
than today: a vision disc that runs onto rock should be hidden by the rock, and today it is painted
over it. Every "must be under bodies" rule in `main.js:6072-6084` is preserved at zero cost.

---

## The one rule that cannot survive, and its successor

`main.js:6129` states: *"monsters first, then the hero: the character you are commanding must never
end up underneath the thing attacking it."*

Under iso that cannot be kept without lying about geometry. It is **replaced**, not weakened:

> The hero is depth-sorted like everything else. It is never *invisible*, because it gets an
> outline pass over the whole scene after the depth walk.

The old rule's intent — you can always see what you command — is what survives.

**Do not use a depth bias on the hero.** Giving it `depth + 0.35` so it wins near-ties breaks the
merge walk's monotonicity: the band cursor advances past a band a later, shallower item still needs
drawn first. The symptom is one-frame flicker, which is miserable to chase.

---

## Session order and what each unblocks

| session | leaves the game |
|---|---|
| `iso-01-projection` | **pixel-identical.** Pure refactor with a "nothing changed" acceptance test. |
| `iso-02-floor` | playable and isometric; bodies look wrong; every click lands. |
| `iso-03-walls` | rock reads as blocks; bodies always on top. |
| `iso-04-depth` | occlusion works; the room has depth. Bodies still flat — which is the point. |
| `iso-05-bodies` | the game as intended. |
| `iso-06-decals` | everything on the floor lies on the floor. |
| `iso-07-polish` | — |

`iso-01` is the highest-value session and must land alone. It is a refactor whose acceptance test
is that the screen does not change, so a bug in the projection is caught **before** any isometric
geometry exists to confuse it.

Sessions 01–04 leave `Tactical` and `Dev` byte-identical. 05–07 touch them only through shared
helpers whose top-down arms are the code they replace.

---

## Tripwires — run at the end of every session

**No Rust change is needed anywhere in this conversion.** The map (`map_ptr`/`map_cols`/`map_rows`/
`map_tile_size_milli`, read at `main.js:642-649`), the fog (`vis_ptr`, `main.js:661-677`) and every
unit column the renderer needs already cross the wall.

```
cargo test --workspace
cargo run --release -p lab -- hash                  # must print 0x00b48ceb21081d1d
cargo run --release -p lab -- verify --seeds 200
node --test tools/wasm_check.js                     # 13 tests
node --check web/main.js
```

All five must be byte-identical every time. If one moves, the session touched something it had no
business touching.

Two reasons the goldens genuinely cannot move, so nobody has to re-derive it:

1. The only page-side value crossing the wall from the projection is
   `pointerToWorld` → `milli()` → `set_goto`. A wrong inverse is a **gameplay** bug (orders land in
   the wrong place), not a determinism one.
2. `wasm_check`'s golden scripts drive the module with literal integers — `init(1)`,
   `set_goto(20_000, 12_000)`, `step(600)` and siblings. **None goes through the pointer path**, so
   the renderer is not in any golden's blast radius.

---

## Housekeeping

`docs/plans/` was untracked (`?? docs/`) and was wiped on 2026-08-06, taking `perf-measurements.md`
with it. The measurement record survives in `DESIGN.md`. **Commit these files.**

Line numbers throughout these documents are from `web/main.js` at 7,415 lines and will drift as
sessions land. Where a number and a quoted snippet disagree, trust the snippet.