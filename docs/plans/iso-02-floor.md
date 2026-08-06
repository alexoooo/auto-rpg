# iso-02 — the floor becomes diamonds

**Goal:** flip `Regular` to `proj: "iso"` and make the ground correct — floor tiles as diamonds,
the flagstone pattern sheared to match, the grid on the tile diagonals, and every screen-space
rectangle that assumed an axis-aligned arena re-derived from a baked bounding box.

**Leaves the game:** playable and isometric. Bodies are still flat top-down silhouettes and will
look wrong — that is expected and is the next-but-one session. **Every click must still land.**

**Depends on:** `iso-01` landed and verified.

---

## 1. Flip the mode

`main.js:2812`, the `regular` row only:

```js
{ id: "regular", label: "Regular", art: true, fog: true, dev: false, proj: "iso", hint: … },
```

`tactical` and `dev` stay `"topdown"`. From here on, toggling the view mode is the A/B control for
everything that follows.

## 2. Tile → screen vertex math

Let `w = px(map.tile)` — the diamond's half-width, and also its full height, since 2:1.

North corner of tile `(tx, ty)`:

```
X = (tx - ty) * w
Y = (tx + ty) * w / 2
```

Both are an integer times `w`, which is `projX(tx*T, ty*T)` with `w = scale*T` factored out — so no
per-tile `projX` call is needed, and the bake stays two multiplies per tile.

The four ground corners:

```
N (X,     Y      )   = world (tx,   ty  )
E (X + w, Y + w/2)   = world (tx+1, ty  )
S (X,     Y + w  )   = world (tx+1, ty+1)
W (X - w, Y + w/2)   = world (tx,   ty+1)
```

Check `S`: `projX = scale·T·((tx+1) − (ty+1)) = X` ✓, `projY = scale·T·(tx+ty+2)/2 = Y + w` ✓.
The diamond is `2w × w` ✓.

## 3. `rebuildLevelPaths` — the floor

`main.js:4160-4282`. The floor emit at `main.js:4196` changes from `rect()` to a diamond. Keep the
lit/seen split and the `lit === 0 → continue` skip exactly as they are.

```js
// replaces: (lit === 2 ? floorLit : floorSeen).rect(x, y, size, size);
const p = lit === 2 ? floorLit : floorSeen;
const X = (tx - ty) * w;
const Y = ((tx + ty) * w) / 2;
p.moveTo(X, Y);
p.lineTo(X + w, Y + w / 2);
p.lineTo(X, Y + w);
p.lineTo(X - w, Y + w / 2);
p.closePath();
```

Four segments instead of one `rect()`. 1,536 tiles → ~6k segments, baked once per revision.

**Seams:** coincident edges inside a single `Path2D` are rasterised in one coverage pass, so there
is no hairline — the same guarantee today's `rect()` tiling already relies on. Verify at every zoom
bucket anyway; it is the failure this session would be embarrassed by.

**Keep this session's wall emit as flat diamonds too** — same shape, into `wallLit`/`wallSeen`, no
height. Height is `iso-03`. That keeps this session's diff to "the ground is a diamond grid".

Under `topdown` the existing `rect()` path must remain. Branch on `PROJ.shear` once, at the top of
the tile loop, not per tile.

## 4. The grid

`main.js:4256-4266`. Becomes two families of parallel diagonals at ±26.57°, running corner to
corner of the arena rather than edge to edge. Same ~20 subpaths, ~40% more total length, still two
`ctx.stroke` calls per frame — measured cheap, and it now reads *better*, because it draws the tile
grid's own directions, which is what an isometric scale bar wants to say.

**Drop the `Math.round(px(x)) + 0.5` half-pixel snap under iso.** Half-pixel alignment is
meaningless for a 26.57° line. The lattice will be a hair softer; nobody will notice.

## 5. The flagstone pattern carries the shear

`main.js:4091-4103`. `CanvasPattern.setTransform` takes a `DOMMatrix2DInit`, and
`new DOMMatrix([a,b,c,d,e,f])` is the spec'd six-element form, which maps
`x' = a·x + c·y + e`, `y' = b·x + d·y + f`.

```js
/** The pattern's own matrix, hoisted. The line this replaces allocated a fresh
 *  `DOMMatrix` every frame; the file allocates nothing per frame elsewhere and
 *  this is the moment to stop. */
const PATTERN_M = new DOMMatrix();

// in floorPatternNow(), replacing main.js:4100:
if (floorPattern) {
  const k = TILE_WORLD / floorTile.width;      // world units per pattern texel
  PATTERN_M.a = PROJ.ax * scale * k;
  PATTERN_M.b = PROJ.ay * scale * k;
  PATTERN_M.c = PROJ.bx * scale * k;
  PATTERN_M.d = PROJ.by * scale * k;
  PATTERN_M.e = 0;
  PATTERN_M.f = 0;
  floorPattern.setTransform(PATTERN_M);
}
```

Under `topdown` this reduces to `a = d = px(TILE_WORLD)/floorTile.width`, `b = c = 0` — exactly
today's line ✓.

The pattern stays anchored at pattern-space origin = canvas origin = world (0,0), so the stones
stay nailed to the level and the reasoning at `main.js:4332-4337` survives verbatim. The courses
come out as diamonds aligned with the tile grid, which is the right look.

`floorTileSize()` (`main.js:4023`) needs no change — iso compresses the pattern 2:1 vertically, so
the bucket is if anything over-resolved.

## 6. The baked bounding box

`drawLevel`'s viewport clamp (`main.js:4373-4376`) clamps against `[0, px(arena.x)] × [0, px(arena.y)]`.
Under iso the arena's screen box starts at `x = −arena.y·scale`.

Bake it where the geometry is baked — add to `levelPaths`:

```js
levelPaths.bbox = { x0, y0, x1, y1 };   // screen px, pre-pan; from arenaBox()
levelPaths.proj = PROJ.id;
```

and in `drawLevel`:

```js
const bb = levelPaths.bbox;
const clipX = clamp(-origin.x, bb.x0, bb.x1);
const clipY = clamp(-origin.y, bb.y0, bb.y1);
const clipW = clamp(-origin.x + viewport.w, bb.x0, bb.x1) - clipX;
const clipH = clamp(-origin.y + viewport.h, bb.y0, bb.y1) - clipY;
```

This also removes `px(arena.x)` / `px(arena.y)` from `drawLevel` entirely. The correctness argument
at `main.js:4365-4372` — the far edge can never land left of the near one — still holds, because
`-origin` is still a monotone screen-space translation.

## 7. Cache invalidation

Add to the if/else chain at `main.js:6901`:

```js
} else if (levelPaths.proj !== PROJ.id) {
  rebuildLevelPaths(readMap(), wasm.map_revision());
}
```

`setViewMode` already forces a rebuild after `resize()` (from `iso-01`), so this is belt and
braces — but it is the cheap kind, and a stale projection in a baked path is a confusing bug.

## 8. The vignette

`main.js:4307-4323`. Key it on the bbox rather than `(px(arena.x), px(arena.y))`, and centre it at
the bbox centre.

Happily the bbox centre **is** the room centre:
`projX(A/2, B/2) = (A−B)·scale/2 = (x0+x1)/2` ✓ and
`projY(A/2, B/2) = (A+B)·scale/4 = (y0+y1)/2` ✓ —
so the "a property of the room, not the camera" argument at `main.js:4299-4305` holds unchanged.

It stays a circular gradient over a 2:1 box, which reads slightly round for the space. A
`save`/`scale(1, 0.5)`/`restore` around the fill fixes it in three lines; defer to `iso-07` and see
whether it bothers anyone first.

## 9. `drawLantern`

`main.js:4477-4491`. **Leave it circular this session.** Its own comment (`main.js:4458-4463`)
already says the gradient is a circle and the exact answer is not, and squashing it is the same
three-line `scale(1, 0.5)` whenever you want it. `iso-07`.

Its `px(hero.x), px(hero.y)` pair became `projX/projY` in `iso-01`, which is all it needs to be
centred correctly.

---

## Acceptance test

1. `Regular` shows a diamond-tiled floor; `Tactical` and `Dev` are unchanged top-down.
2. **Every click lands.** Click ten scattered floor tiles and confirm the character walks to the
   tile under the cursor, not to a tile offset from it. This is the session's real risk.
3. Drag a six-waypoint route across the room; every bead sits under where the cursor went.
4. Walk into all four corners; the camera stops sensibly and the void wedge past the diagonal is
   not alarming. (If it is, the lever is a per-projection `CAMERA_OVERSCAN` in `iso-07`, not a
   different clamp — see `iso-00`.)
5. **No hairline seams between tiles at any zoom.** Wheel slowly through the full range and watch
   a large open room.
6. `floorBakes` (`main.js:3987-3991`) still single digits after a minute of wheeling.
7. The flagstone courses stay nailed to the floor as the camera pans — they must not crawl.
8. Watch the `perf` strip's `level` **max**, not its mean (`main.js:6842-6845`): the diamond bake
   is four times the segments of the rect bake and it happens on a revision change.

## Tripwires

All five from `iso-00-overview.md`.

## Explicitly not in this session

- Wall height, wall faces, `edge` retirement — `iso-03`.
- Any depth sorting or banding — `iso-04`.
- Any change to bodies or decals — `iso-05`, `iso-06`.
