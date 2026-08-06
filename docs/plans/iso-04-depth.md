# iso-04 — depth interleave

**Goal:** walls occlude what stands behind them. Wall geometry is banded by depth row and merged
with a depth-sorted list of bodies, corpses and shots.

**Leaves the game:** occlusion works and the room has real depth.

**Depends on:** `iso-03` landed and verified.

**Bodies are still flat top-down silhouettes in this session, and that is deliberate** — a flat
decal sliding under a wall block is unmistakable, so the depth logic gets verified before upright
billboards arrive to complicate the picture.

---

## 1. The depth key

`depth = wx + wy`, for everything on the ground. That is exactly what `projY` depends on, so it is
the screen-y of the ground point, which is what a painter's algorithm sorts on.

Band index for a tile: `d = tx + ty`. `bandCount = cols + rows − 1` — **79** for a 48×32 room.

Every tile in band `d` has its north corner at exactly the same screen y, `d·w/2`, because `projY`
depends only on `wx + wy`. So a band's screen extent is closed form:

```
y ∈ [ d·w/2 − L , (d + 2)·w/2 ]        where w = px(map.tile), L = lift(WALL_H)
```

and the visible band range is two divisions per frame:

```js
const yTop = -origin.y;
const yBot = -origin.y + viewport.h;
const firstBand = clamp(Math.floor((2 * yTop) / w) - 2, 0, bandCount - 1);
const lastBand  = clamp(Math.ceil((2 * (yBot + L)) / w), 0, bandCount - 1);
```

At default framing (`w ≈ 86`, 945 px tall) that is ~24 visible bands, so ~48 `ctx.fill()` calls per
frame. Fills are free; 48 calls are not a concern.

## 2. Banded paths

Two arrays on `levelPaths`, built in `rebuildLevelPaths` alongside the unbanded ones:

```js
levelPaths.wallBandTop  = new Array(bandCount).fill(null);   // Path2D or null
levelPaths.wallBandSide = new Array(bandCount).fill(null);
levelPaths.bandCount    = bandCount;
```

Lazily allocated per band — most bands in a carved dungeon have rock, but not all:

```js
function bandPath(arr, d) {
  let p = arr[d];
  if (p === null) { p = new Path2D(); arr[d] = p; }
  return p;
}
```

**Band only the *lit* walls.** Remembered walls (`lit === 1`) stay as the unbanded
`wallTopSeen`/`wallSideSeen` pair from `iso-03`, drawn once in the ground layer before the depth
walk.

Justification: a remembered wall is by construction out of the hero's sight, so it is either off
screen or beyond the lantern, and any body it could occlude is a ghost. The artefact is bounded and
rare. **Escalation if it bites:** band the seen walls into two more arrays — the same code, four
fills per band instead of two.

## 3. The pooled draw list

The file allocates nothing per frame (`main.js:679-706`) and that discipline holds here.

```js
const ITEM_BODY = 0;
const ITEM_CORPSE = 1;
const ITEM_SHOT = 2;

/** Pooled, like the frame states. Grows only if a frame ever carries more rows
 *  than the caps say it can, which it cannot. */
const drawItems = [];
let drawCount = 0;

function resetDrawList() { drawCount = 0; }

function pushItem(kind, ref, depth) {
  while (drawItems.length <= drawCount) drawItems.push({ kind: 0, ref: null, depth: 0 });
  const it = drawItems[drawCount++];
  it.kind = kind;
  it.ref = ref;
  it.depth = depth;
}
```

Building it:

```js
function buildDrawList(state) {
  resetDrawList();
  for (const c of corpses) if (c.t < 1) pushItem(ITEM_CORPSE, c, c.x + c.y);
  for (const unit of state.monsters) pushItem(ITEM_BODY, unit, unit.x + unit.y);
  if (state.hero) pushItem(ITEM_BODY, state.hero, state.hero.x + state.hero.y);
  for (const shot of state.shots) pushItem(ITEM_SHOT, shot, shot.x + shot.y);
}
```

Note the hero goes in like anything else — see §5.

## 4. The sort

**An explicit insertion sort, not `Array.prototype.sort`.** V8's TimSort allocates a work array
above ~22 elements and this list runs to ~100. Insertion sort is O(n) on a near-sorted list, and
this list *is* near-sorted every frame because bodies move by fractions of a unit between frames.

```js
function sortDrawList() {
  for (let i = 1; i < drawCount; i++) {
    const it = drawItems[i];
    const d = it.depth;
    let j = i - 1;
    while (j >= 0 && drawItems[j].depth > d) {
      drawItems[j + 1] = drawItems[j];
      j--;
    }
    drawItems[j + 1] = it;
  }
}
```

Permuting the pool is safe: every slot is fully overwritten by `pushItem` before it is read.

## 5. The merge walk

A wall block at band `d` occludes anything whose ground point is behind its **near plane**, which
is its south corner at `wx + wy = d + 2`. So the band's sort key is `d + 2` and the rule is uniform:

```js
function walkDrawList(state, now) {
  let band = firstBand;
  for (let i = 0; i < drawCount; i++) {
    const it = drawItems[i];
    while (band <= lastBand && band + 2 <= it.depth) fillBand(band++);
    drawItem(it, now);
  }
  while (band <= lastBand) fillBand(band++);
}

function fillBand(d) {
  const top = levelPaths.wallBandTop[d];
  if (top !== null) { ctx.fillStyle = WALL_TOP; ctx.fill(top); }
  const side = levelPaths.wallBandSide[d];
  if (side !== null) { ctx.fillStyle = WALL_XFACE; ctx.fill(side); }
}

function drawItem(it, now) {
  if (it.kind === ITEM_BODY) drawBody(it.ref, now);
  else if (it.kind === ITEM_CORPSE) drawCorpse(it.ref);
  else drawShot(it.ref);
}
```

`drawCorpse` and `drawShot` are the per-item bodies extracted from the existing `drawCorpses`
(`main.js:5611`) and `drawShots` (`main.js:5562`) loops. Extract them in this session; their
contents do not change until `iso-05`/`iso-06`.

### Correctness checks

With a wall block at `(tx, ty)`, `d = tx + ty`:

| body position | body depth | `band + 2 ≤ depth`? | result |
|---|---|---|---|
| tile **south** of the wall | `d + 2` | `d+2 ≤ d+2` true | band fills first → body over wall ✓ (body is nearer) |
| tile **north** of the wall | `d` | `d+2 ≤ d` false | body first, band after → wall occludes body ✓ |
| tile **east** of the wall | `d + 2` | true | band first → body over wall ✓ |

## 6. The hero exception

The old rule at `main.js:6129` — *"monsters first, then the hero"* — **cannot survive iso without
lying about geometry**, so it is replaced rather than weakened:

> The hero is depth-sorted like everything else. It is never *invisible*, because it gets an
> outline pass over the whole scene after the depth walk.

```js
// After the depth walk, before the health bars. One stroke of a small closed
// path, unconditional. Where nothing covers the hero it sits exactly on its own
// edge and reads as a slightly brighter rim; where a monster or a wall covers
// it, it reads through. This is the successor to "the hero draws last": the old
// rule's *intent* was that you can always see what you are commanding, and that
// intent is what survives.
if (PROJ.upright && view.hero && canSee(view.hero)) drawHeroThrough(view.hero);
```

In this session `drawHeroThrough` can be the hero's collision ring stroked in
`rgba(110,231,255,0.55)` — the body outline version arrives with the billboard in `iso-05`.

**Do not add a depth bias to the hero.** Giving it `depth + 0.35` so it wins near-ties breaks the
merge walk's monotonicity — the band cursor advances past a band that a later, shallower item still
needs drawn first — and the symptom is one-frame flicker, which is miserable to chase. If someone
wants the knob later, it belongs in `iso-07` with its artefact stated.

## 7. `render` gets exactly one branch

`main.js:6095-6143`. The ground layer runs in both modes; only the body block branches.

```js
drawLevel(state, origin);          // floor, lantern, remembered walls, grid

drawPortal(state, now);
drawTrail();
drawRoute(state, now);
if (state.hero) drawDestination(state, now, arrived);
for (const unit of state.units) {
  if (canSee(unit)) drawVision(unit, unit === state.hero || (locked !== null && unit.id === locked));
}
for (const unit of state.units) if (canSee(unit)) drawReach(unit, skinOf(unit), now);

if (PROJ.upright) {
  buildDrawList(state);
  sortDrawList();
  walkDrawList(state, now);
  if (state.hero && canSee(state.hero)) drawHeroThrough(state.hero);
} else {
  // Today's lines, verbatim.
  drawCorpses();
  for (const unit of state.monsters) drawBody(unit, now);
  if (state.hero) drawBody(state.hero, now);
  drawShots(state.shots);
}

const fighting = state.monsters.length > 0;
for (const unit of state.units) {
  if (canSee(unit) && (fighting || unit.hp < unit.maxHp)) drawHealth(unit, skinOf(unit));
}
drawFloaters();
drawCallouts(state);
```

**Two deliberate order changes, both in *both* modes:**

- **Reach rings move up, ahead of the bodies.** They were already under bodies; this is a no-op
  visually and it puts every flat ground decal in one place.
- **All ground decals now precede the walls.** This is *more correct* than today: a vision disc that
  runs onto rock should be hidden by the rock, and today it is painted over it. Every "must be under
  bodies" rule in the comment at `main.js:6072-6084` is preserved.

**One cosmetic cost, worth deciding consciously:** the lantern moves from after the walls to inside
`drawLevel` right after the floor. Today it also takes down the outer half of the `edge` stroke at
range (`main.js:4443-4445`); under iso that stroke no longer exists, and under top-down the far rock
gets marginally brighter. If it matters, keep a second lantern pass after the top-down wall fill.
Probably not worth it.

## 8. Culling

`firstBand`/`lastBand` cull wall bands. Bodies are not culled today and need not be — `canSee`
already skips the invisible ones, and the caps are 64 units and 32 shots.

---

## Acceptance test

1. Walk the hero **north** until a wall block eats it; walk **south** and watch it come back out
   over the top. Do the same with a Brute and with a Skitterer.
2. Stand the hero one tile north of a wall and a monster one tile south — the monster draws over
   the wall, the hero behind it.
3. Fire an arrow so it flies behind a wall block; it is occluded, and its ground point is what
   decides.
4. The hero is never *lost*: with it fully behind a block, the outline pass still shows where it is.
5. **No flicker** as a body crosses a band boundary. Walk slowly diagonally across a long wall.
6. **Record a devtools memory profile for 30 s and confirm no per-frame allocation appears.** The
   file's parse discipline (`main.js:679-706`) is the standard and the draw list must meet it.
7. `Tactical` and `Dev` are byte-identical to before.
8. `perf` `render` mean has not regressed against `iso-03`.

## Tripwires

All five from `iso-00-overview.md`.

## Explicitly not in this session

- Upright bodies — `iso-05`. Bodies staying flat here is the point.
- Lifting arrows off the ground — `iso-06`.
