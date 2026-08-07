# iso-03 — walls get height

**Goal:** rock stops being a flat diamond and becomes a block — a lit top face and two shaded
vertical faces — and the stroked rim retires.

**Leaves the game:** the room reads as carved rock with real height. Bodies still draw on top of
everything, which is wrong and is `iso-04`'s job.

**Depends on:** `iso-02` landed and verified.

**~~This session should make the frame *faster*.~~** *Corrected while landing.* The stroke
deletion is real — the several-hundred-subpath `edge` stroke does go, and that is what makes an
isometric room cheaper than the top-down room it replaces — but it landed in `iso-02`, because
`edge`'s geometry is axis-aligned tile corners and it would have stroked rectangles over diamonds
for a whole session. Measured against `iso-02`, *this* session only **adds**: a top face for every
seen solid tile rather than only exposed ones, two side quads per boundary tile, and four fills per
frame where there were two. Fills are effectively free, so expect flat-to-better against the
top-down baseline and **flat-to-slightly-worse against `iso-02`**. A `render` mean that does not
fall is not a regression here.

---

## 1. `WALL_H`

Declared in `iso-01` for `arenaBox`; this is where it earns its documentation.

```js
/** How tall a wall block stands, in world units.
 *
 *  A block is a cube whose vertical edge is `lift(WALL_H)`. Because the ground
 *  diamond's half-width is `px(1)` and `lift === px`, `WALL_H = 1.0` would be a
 *  literal cube.
 *
 *  1.6 is chest-high on a Fighter: tall enough that the depth interleave in
 *  `iso-04` is legible at a glance, short enough that a fight happening behind a
 *  wall is not simply gone. Tune by eye -- it is presentation only and the sim
 *  has no opinion about it. */
const WALL_H = 1.6;
```

## 2. The three faces

Let `w = px(map.tile)`, `L = lift(WALL_H)`, and `X`, `Y` the tile's north corner from `iso-02`.

The camera looks from `+x, +y`, so **exactly two vertical faces can ever be visible**: the `+x`
face (screen lower-right) and the `+y` face (screen lower-left). The `−x` and `−y` faces are never
emitted, which removes half the work of the four-way `exposed` test at `main.js:4213-4240`.

```js
// The top face -- the ground diamond, lifted.
top.moveTo(X,     Y       - L);
top.lineTo(X + w, Y + w/2 - L);
top.lineTo(X,     Y + w   - L);
top.lineTo(X - w, Y + w/2 - L);
top.closePath();

// The +x face. Only where the neighbour is open ground -- otherwise it is an
// interior seam between two blocks and nothing can see it.
if (!solid(tx + 1, ty)) {
  side.moveTo(X + w, Y + w/2 - L);
  side.lineTo(X,     Y + w   - L);
  side.lineTo(X,     Y + w      );
  side.lineTo(X + w, Y + w/2    );
  side.closePath();
}

// The +y face.
if (!solid(tx, ty + 1)) {
  side.moveTo(X,     Y + w   - L);
  side.lineTo(X - w, Y + w/2 - L);
  side.lineTo(X - w, Y + w/2    );
  side.lineTo(X,     Y + w      );
  side.closePath();
}
```

`solid(tx, ty)` already exists at `main.js:4179-4183` and already treats off-grid as solid, which
is what makes the arena's outer boundary emit no spurious faces.

## 3. The exposure gate moves

Today a solid tile is emitted **only if it borders open ground** (`main.js:4209-4244`). Under iso
that leaves holes in the rock plateau wherever interior rock was skipped.

**The rule changes to:**

- **top face** — emitted for every solid tile the fog says has been seen (`lit !== 0`).
- **side faces** — keep the per-direction exposure test above.

Lifted diamonds tile the plane exactly as ground diamonds do, so all-top-faces gives a continuous
plateau at no extra visual cost, and side faces still appear only where rock meets floor.

**Known artefact:** interior rock the player has *never* seen still lands in no path at all,
leaving a dark patch in the plateau. It is probably invisible — `#0c1017` and the page's void
gradient are near-identical. Verify by eye in this session's acceptance test. If it reads as a pit,
the one-line fix is to also emit a top face for solid tiles that are 4-adjacent to a seen tile.

## 4. Three flat fills replace a stroke

```js
const WALL_TOP   = "#161c28";   // catches what light the room has
const WALL_XFACE = "#0e131c";   // the +x face, half lit
const WALL_YFACE = "#090d14";   // the +y face, in shadow
```

**Start with one side colour** (`WALL_XFACE` for both faces, one `side` path). Split the two faces
into separate paths and colours only if the blocks read flat — that costs a third baked path and a
third fill per band in `iso-04`, and it may not be needed.

**Set `edge = null` under iso.** The existing guard at `main.js:4435` already skips the stroke when
`levelPaths.edge` is null, so this is one line at `main.js:4172`:

```js
const edge = art && !PROJ.shear ? new Path2D() : null;
```

Under iso you get the rim **for free**: the top face, the `+x` face and the `+y` face are three
different flat fills, and the silhouette edge is exactly where the fills meet. This is the
counter-intuitive part and it is worth stating in the commit message — *the isometric conversion
removes a several-hundred-sub-path stroke that ran every frame.*

**Corrected while landing.** The draft said "the page's second-largest stroke". Nothing in
`DESIGN.md`'s "Performance notes" ranks strokes: the only attribution recorded there is
`drawVision` at 80% of all *dashing*, and `edge` is undashed, so its cost was never measured at
all. The count and the cadence are known and are enough to make the point.

## 5. Path inventory after this session

`levelPaths` gains, for iso only:

```
wallTopLit    Path2D    lit top faces
wallTopSeen   Path2D    remembered top faces
wallSideLit   Path2D    lit side faces
wallSideSeen  Path2D    remembered side faces
```

and `wallLit`/`wallSeen` become the top-down-only pair. Under `topdown` the four new ones stay null
and nothing reads them.

`drawLevel`'s wall block (`main.js:4429-4441`) branches once:

```js
if (PROJ.shear) {
  ctx.globalAlpha = SEEN_ALPHA;
  ctx.fillStyle = WALL_TOP;   ctx.fill(levelPaths.wallTopSeen);
  ctx.fillStyle = WALL_XFACE; ctx.fill(levelPaths.wallSideSeen);
  ctx.globalAlpha = 1;
  ctx.fillStyle = WALL_TOP;   ctx.fill(levelPaths.wallTopLit);
  ctx.fillStyle = WALL_XFACE; ctx.fill(levelPaths.wallSideLit);
} else {
  …today's lines, verbatim…
}
```

Still one unbanded pass, drawn between the floor and the bodies. Banding is `iso-04`.

## 6. `arenaSpan` already accounts for the height

`iso-01` defined `arenaSpan().h = (A + B) / 2 + WALL_H`, so `fit` already reserves room for the
rock standing above world `y = 0`, and `arenaBox().y0 = -lift(WALL_H)` already lets the camera see
it. Nothing to do here — just confirm the north wall is not clipped when the camera is hard against
the top.

---

## Acceptance test

1. Rock reads as blocks with a lit top and shaded sides. Walk around a pillar and confirm the two
   visible faces are the lower-right and lower-left ones.
2. **`render` mean should not have *risen* meaningfully against `iso-02`.** The `edge` stroke was
   already gone by then, so what this session adds is fills, which are free. Record before and
   after from the `perf` strip (`P`). The comparison that shows the conversion's real gain is
   against *top-down*, not against the previous commit.
3. Look for holes in the plateau where interior rock is unseen. Decide whether it reads as a pit;
   if so, apply the 4-adjacency fix above in this session rather than deferring it.
4. Walk to the north edge of the map with the camera hard against the top — the tallest rock is not
   clipped off the top of the viewport.
5. No z-fighting or seams between the top face of one block and the side face of its neighbour.
6. `Tactical` and `Dev` are byte-identical to before.

## Tripwires

All five from `iso-00-overview.md`.

## Explicitly not in this session

- Banding walls by depth row, or any sorting — `iso-04`.
- Bodies — `iso-05`.
