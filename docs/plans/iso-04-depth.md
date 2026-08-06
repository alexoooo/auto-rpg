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
levelPaths.bandW        = px(map.tile);   // the band's screen pitch
levelPaths.bandL        = lift(WALL_H);   // how far up-screen a band reaches
levelPaths.bandTile     = map.tile;       // world units one band step spans
```

**`bandW`, `bandL` and `bandTile` were added during implementation and the plan
omitted all three.** The culling arithmetic needs `w = px(map.tile)` and
`L = lift(WALL_H)` every frame and must not call `readMap()` to get the first;
`bandTile` is what §5 multiplies the band index by. `bandL` in particular is a
value that has to *agree with the bake* — it is the height the band paths were
built at — so reading it from the bake rather than recomputing it off the live
`scale` is the same argument `bbox` is there on. The two are equal on every frame
that can exist; one place they come from is the point. Every one of the six fields
above is `null` or `0` under top-down.

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

**Corrected: the justification the plan gave for this is false, and the deferral survives on
different terms.** The plan said a remembered wall is out of the hero's sight, so any body it could
occlude is a ghost. A block being beyond the sight radius says nothing about the strip *behind* it,
which is nearer and can be well inside it. Sight 9.6, hero `(20, 20)`, block `(27, 27)` at distance
9.9 — remembered, so unbanded, so painted in the ground layer. Live monster at `(25.5, 25.5)`,
distance 7.78 — visible. Its depth of 51 is behind the block's near plane at 56 and behind the
block's own north corner at 54, so its ground point sits under that top face, and nothing blocks the
hero's line to it because the block is further along the same ray. A fully lit, live monster draws
over a dim block it is standing behind.

So the artefact is reachable and it is not a ghost. It is still worth deferring: the geometry
confines it to the annulus near the sight boundary, where a remembered block stands between the hero
and something it can still see; and the block is two fills at `SEEN_ALPHA` over the void, so the
mis-occlusion is faint on the dimmest thing on the page. Bounded, uncommon and faint.
**Escalation if it bites:** `iso-07` §6 — band the seen walls into two more arrays, the same code
applied twice, four fills per band instead of two.

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
  for (const c of corpses) if (c.age < CORPSE_MS) pushItem(ITEM_CORPSE, c, c.x + c.y);
  for (const unit of state.monsters) pushItem(ITEM_BODY, unit, bodyDepth(unit));
  if (state.hero) pushItem(ITEM_BODY, state.hero, bodyDepth(state.hero));
  for (const shot of state.shots) pushItem(ITEM_SHOT, shot, shot.x + shot.y);
}
```

**Corrected: there is no `c.t`.** A corpse carries `age`; `drawCorpses` computes
`t = c.age / CORPSE_MS` and skips on `t >= 1` and again on `r < 0.4`. The push test
is the first of those with the division taken off both sides, and **both skips stay
inside `drawCorpse`** so the two cannot drift.

**Corrected: a body's depth is `bodyDepth(unit)`, not `unit.x + unit.y`.** The plan
wrote the live coordinates for every body. `drawBody` draws an *unseen* body at the
frozen pose out of `bodies` — drawing the live row would be a wallhack with a fade on
it — so the live key sorts a ghost at coordinates nothing on screen is standing on.
Top-down there was no depth and this could not bite. Under iso it does: a Skitterer
that runs behind rock and keeps going north has its ghost painted at the corridor mouth
and sorted at the far-north depth, so every wall band between the two flushes before it
and the ghost comes out cut in half by a block it is plainly standing south of; send it
south instead and the ghost floats over a block it is behind. Bounded to
`GHOST_FADE_MS + GHOST_HOLD_MS` = 2.4 s per body, and plainly visible for all of it.

```js
function bodyDepth(unit) {
  if (canSee(unit)) return unit.x + unit.y;
  const remembered = bodies.get(unit.id);
  return remembered ? remembered.x + remembered.y : unit.x + unit.y;
}
```

**The rule, not the special case: the sort key must be the depth of the thing on
screen, because the merge walk is a painter's algorithm and a painter sorts what it
paints.** That is what stops the same bug returning in `iso-05`, when bodies become
billboards and stop being drawn at their ground point. `bodyDepth` carries no
ghost-stage logic on purpose — a body with an expired ghost, and a body never seen,
draw nothing at all, so their depth decides nothing and the live-coordinate fallback is
harmless. One copy of the staging, in `drawBody`. `bodies` is a `Map` and `.get` does
not allocate.

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

**Corrected: the comparison is `(band + 2) * tile`, not `band + 2`.** The bare form
is right only while a tile is one world unit. It is today — `TILE_MILLI` is 1000 —
but `map_tile_size_milli` exists in the module precisely so the page does not bake
that in, with a comment saying a client that gets it wrong draws the level at the
wrong scale while every test passes. Converting the *band's* key into the world
rather than the depth key into tiles is also what keeps `depth` meaning exactly
`wx + wy`, which is what §1's whole argument rests on.

`state` is dropped from the signature — nothing in the walk reads it — and `origin`
is taken instead, because the band range is derived here rather than in `render`.

**Added during implementation: the walk is wrapped in one `ctx.save()`/`restore()`,
and `globalAlpha` is set inside it.** `fillBand` leaves a `fillStyle` behind, so
this is the only place the walk could leak into the overlay layer; and `fillBand`
fills at whatever the ambient alpha is, where the `drawLevel` lines it replaced set
`globalAlpha = 1` explicitly inside `drawLevel`'s own save. One save for the whole
walk and not one per band — every item draw already saves and restores its own
state.

```js
function walkDrawList(now, origin) {
  // firstBand/lastBand per §1, from `origin`, `viewport.h`, `bandW` and `bandL`
  const tile = levelPaths.bandTile;
  let band = firstBand;
  ctx.save();
  ctx.globalAlpha = 1;
  for (let i = 0; i < drawCount; i++) {
    const it = drawItems[i];
    while (band <= lastBand && (band + 2) * tile <= it.depth) fillBand(band++);
    drawItem(it, now);
  }
  while (band <= lastBand) fillBand(band++);
  ctx.restore();
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

| body position | body depth | `(d+2)·T ≤ depth`? | result |
|---|---|---|---|
| tile **south** of the wall | `(d+2)·T` | true | band fills first → body over wall ✓ (body is nearer) |
| tile **north** of the wall | `d·T` | false | body first, band after → wall occludes body ✓ |
| tile **east** of the wall | `(d+2)·T` | true | band first → body over wall ✓ |

The table holds for any `T > 0`: every entry is one multiplication of both sides by `T`, and the
comparison is monotone in it. **It has not been run at any other tile size, and cannot have been** —
`TILE_MILLI` is `1000` in Rust and there is no JS test harness for `main.js`. An earlier line here
claimed it was checked against the shipped code at `T = 0.5`, `1` and `4`; the algebra is the whole
of the argument.

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

if (PROJ.upright) {
  for (const unit of state.units) if (canSee(unit)) drawReach(unit, skinOf(unit), now);
  buildDrawList(state);
  sortDrawList();
  walkDrawList(now, origin);
  if (state.hero && canSee(state.hero)) drawHeroThrough(state.hero);
} else {
  // Today's lines, verbatim.
  drawCorpses();
  for (const unit of state.units) if (canSee(unit)) drawReach(unit, skinOf(unit), now);
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

**Corrected: the reach-ring loop stays inside the branch, written twice.** An earlier
draft hoisted it above the branch "in both modes" and called it a visual no-op. It is
not. Today's order is `vision → corpses → reach → bodies → shots`; hoisting makes
top-down `vision → reach → corpses → bodies → shots`, which puts reach rings *under*
corpses where they are over them today, and `iso-00` promises sessions 01–04 leave
`Tactical` and `Dev` byte-identical.

The reordering argument only ever applied to iso anyway. Under top-down the walls are
drawn inside `drawLevel` before everything else, so "all ground decals now precede the
walls" is already true there and there is nothing to gain by moving the line.

**Added during implementation: `assertProjection` now asserts `shear === upright` for
every row of `PROJECTIONS`.** Three places read that pair and no two read the same
member — `rebuildLevelPaths` bands the lit rock on `shear`, this branch gates the walk
on `upright`, and `drawLevel` gates on the `proj` id the bake recorded. A future row
with `shear: true, upright: false` would band the lit rock, draw only the remembered
pair, and never walk: **all lit rock on the level vanishes**, silently, and the existing
round-trip check would not notice because it only exercises the matrices. This is
`iso-00` §3's failure class one level down, and the assert is where the file already
puts boot-time claims of this kind. A genuine fourth projection wanting the two apart
has to make the bake and the walk read one bit first.

**The one order change, and it is iso-only:**

- **All ground decals now precede the walls.** This is *more correct* than today: a
  vision disc that runs onto rock should be hidden by the rock, and today it is painted
  over it. Every "must be under bodies" rule in `render`'s compositing comment is
  preserved.

**The lantern does change under iso, and two earlier drafts of this section both got it
wrong — one said the lantern moves, the next said nothing changes at all.** The lantern
does not move: it is the last call in `drawLevel` in both projections, before and after
this session. But the argument that its position therefore cannot matter — "`drawLantern`
clips to `levelPaths.floorLit`, so it has never put a pixel on rock" — is false under iso.
`ctx.clip(floorLit)` is a **screen-space** region, not a set of world tiles. A block's top
face is `diamond(top, x, y − L, w)` with `L = 1.6·size` against a `size`-tall diamond, so
it reaches about 1.6 bands up-screen, straight over the floor diamonds behind it. Worked
case: block at `(tx, ty)` and floor tile `(tx−1, ty−1)` project to the same screen column;
the top face spans `y ∈ [y_w − 1.6s, y_w − 0.6s]` and the floor diamond spans
`[y_w − s, y_w]` — a 0.4·`size` overlap. Top-down the claim genuinely *is* true (square
tiles, disjoint regions), which is why it reads plausible.

So there **is** an iso-only visual change in this session beyond the occlusion: lit rock
used to be partially darkened by the lantern — only the part that happened to overlap a
lit floor diamond behind it — and now it is not darkened at all, because the bands are
filled after `drawLevel` returns.

**Keep the behaviour; the new picture is the more consistent one.** The old darkening was
never lighting: it was a sliver whose size and position depended on which floor diamond
lay behind which block, so two identical blocks at the same distance from the lantern were
shaded differently according to whether the ground behind them was lit. The plateau is now
uniformly lit at every distance, which is exactly what `iso-03`'s comment above the
`drawLantern` call already claims for the room's two falloffs. Whether the falloff *should*
reach the rock at all is a genuine question and it is already open, with its options and
their costs, as `iso-07` §9.

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
6. **A ghost sorts where it is painted.** Let a Skitterer run behind rock and keep going north, then
   repeat it running south. The fading outline stays whole and stays at the corridor mouth in both —
   never sliced by a block it is standing south of, never floating over one it is behind. This is
   `bodyDepth` in §3; do the same with a Brute, whose larger silhouette makes a slice obvious.
7. **Record a devtools memory profile for 30 s and confirm no per-frame allocation appears.** The
   file's parse discipline (`main.js:679-706`) is the standard and the draw list must meet it.
8. `Tactical` and `Dev` are byte-identical to before.
9. `perf` `render` mean has not regressed against `iso-03`.
10. **No `console.assert` fires at boot.** `assertProjection` now checks `shear === upright` across
    `PROJECTIONS` as well as the two round trips — see §7.

## Tripwires

All five from `iso-00-overview.md`.

## Explicitly not in this session

- Upright bodies — `iso-05`. Bodies staying flat here is the point.
- Lifting arrows off the ground — `iso-06`.
