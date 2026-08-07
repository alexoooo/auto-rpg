# art-07 — the room gets its stone

**Goal:** floors, wall faces, torches and props draw from manifest images, with the procedural
bake underneath as the fallback; grime and moss appear where a render-side hash of the tile
coordinate says they should; and the room reads like the concept.

**Leaves the game:** the room in the concept's material, and still complete and intentional with
zero image files present.

**Depends on:** `art-06` (manifest and loader), `art-01` (the palette the fallback bake now uses)
and `art-04` (patterns, lights, props and decals are emitted items, not `ctx` calls). **Codex's
first batch — one floor top face, one wall side/top pair, one torch — lands between `art-06` and
this session**, and this session is what receives it.

**This session holds calibration gate 1.** Integrating the batch is half the work; the other half
is reviewing it in-game and writing `FEEDBACK.md` — per-asset, two verdicts, cumulative — and
flipping the environment gate only when the batch survives the acceptance test below. Mass
production reuses whatever passed, so a defect waved through here multiplies across every
remaining floor variant, wall variant, decal and prop. Gate 2 is `art-08`'s and the split is
`art-00`'s interleave table.

---

## 1. Three patterns, three constant matrices, and that is the whole texturing model

`floorPatternNow` (`main.js:4998`) already proves the mechanism: a `CanvasPattern` whose own
matrix carries the projection, filled through a clipped path, with `e` and `f` at zero so the
masonry is nailed to the level rather than to the camera. Its doc comment has the derivation and
the reasoning about clipping moving the fog boundary and nothing else; read it before writing a
line here.

The insight this session runs on is that **the same trick works for wall faces, because each
face family has a constant screen basis.**

| surface | world basis | screen basis (per world unit) | matrix `[a b c d]` |
|---|---|---|---|
| floor / wall top | `+x`, `+y` | `(1, 0.5)·s`, `(−1, 0.5)·s` | `ax, ay, bx, by` — what `floorPatternNow` already writes |
| `+x` face | `+y`, height | `(−1, 0.5)·s`, `(0, −1)·s` | `−s, 0.5s, 0, −s` |
| `+y` face | `+x`, height | `(1, 0.5)·s`, `(0, −1)·s` | `s, 0.5s, 0, −s` |

Both face bases are constant for every block on the level, because a block is an axis-aligned
cube and the camera does not rotate. So:

- three `DOMMatrix` objects hoisted at module scope, rewritten in place per frame, exactly as
  `PATTERN_M` is (`main.js:4867`) and for the same stated reason — this file allocates nothing
  per frame;
- three patterns, each built from a manifest image when one is `ready` and from the procedural
  bake otherwise;
- each filled through the path the wall bake **already produces**. `rebuildLevelPaths`
  (`main.js:5240`) bakes the top faces and the side faces as separate `Path2D`s already, banded
  by depth row for the merge walk. Nothing about the geometry changes. `ctx.fillStyle = pattern`
  replaces `ctx.fillStyle = WALL_TOP`, and the fill that was flat is textured.

**Fill area is unchanged and `DESIGN.md` says fill area is free.** A patterned fill and a flat
fill cover the same pixels; the rasteriser reads a texel instead of a constant. No new stroke, no
new path, no new clip. This session should measure as free and the gate in §6 says to check
rather than assume.

**One honest caveat to write into the comment.** Two `+x` faces at different world `x` land at
different screen positions and therefore sample different regions of the same texture, which is
what makes a wall of blocks look like a wall of *different* blocks. It also means the texture
region a given face gets is a function of where it is on screen relative to world origin — stable
under pan and zoom because `e` and `f` are zero, deterministic, and not something an artist can
control. That is a feature at this texel density and it is worth saying out loud so nobody spends
an afternoon trying to align a face texture to a tile.

**The floor's `world` is 4 units** — `TILE_WORLD` (`main.js:4845`), so the tile seam falls exactly
on a grid line and the masonry and the scale bar never disagree about where a stone ends. The
manifest image inherits that: 4 units, 344 px at default framing. Do not change `TILE_WORLD` in
this session; if the generated stone wants a different pitch, that is a spec change and a
regeneration, not a code change.

## 2. Variation without more patterns

A single 4-unit tile covers sixteen floor tiles and already contains thirty-two stones, so it does
not read as one stone repeated. What it does read as, across a 68 × 45 room, is one *patch*
repeated.

**Fix it with decals, not with more base patterns.** A grime, moss or crack decal is a mostly
transparent square drawn over the floor at a tile position chosen by a render-side hash:

```js
/** A stable integer hash of a tile coordinate. **Render-side, never the sim's RNG**, on
 *  exactly `grainRandom`'s argument (main.js:4875-4883): this is presentation, it never
 *  crosses the boundary, and the only property it needs is that the same tile answers the
 *  same way every time so the moss does not crawl when the camera moves. */
function tileHash(tx, ty) { /* a small integer mix, returning 0..0xffffffff */ }
```

Per visible floor tile: hash it, and if the low bits fall under a density threshold, draw one
decal from the manifest, rotated by nothing and scaled by nothing — a decal that varied
continuously would be a per-tile transform where a `drawImage` will do.

Density low. The concept's emptiness is part of the mood, and a floor with something on every
third tile reads as clutter rather than as age.

**Both the decals and the props below go inside the floor passes' own clips**, so a decal on a
tile the character has never seen is not drawn, and a decal on a remembered tile fades with
`SEEN_ALPHA` like the ground it is on. The fog is the authority; that is `art-00` §6 and it is
not negotiable for a cosmetic.

If one base tile still reads as repetitive after decals, the escalation is a second `surface`
entry and a hash-selected clip pass per 4-unit block — two clips and two fills instead of one.
**Do not do that speculatively.** It doubles the level's clip work to fix a problem that may not
exist once there is moss on the floor.

## 3. Props, and the honesty rule

The sim has no prop colliders. So a barrel standing on open floor is a barrel a character walks
straight through, and worse, a barrel a *player* routes around for no reason.

**The rule: a prop's footprint lies inside a solid tile.** Not "next to a wall" — *inside* the
rock, at the near edge of the solid tile, so it reads as standing against the wall's base and
overhangs the walkable cell by a sliver of its silhouette rather than by its footprint. A body
can clip the overhang, which reads as passing in front of it, and the collision the player infers
is the wall's, which is real.

Placement:

- walk the solid tiles that border open floor — the wall bake already knows which those are, it
  is `wallBlock`'s `xFace`/`yFace` exposure test (`main.js:4621`);
- hash each; below a low threshold, place one prop from the manifest at that tile's near corner;
- **props join the depth walk.** A barrel is a standing object that must occlude and be occluded
  like a body, so it is a `pushItem` kind alongside `ITEM_BODY`, `ITEM_CORPSE` and `ITEM_SHOT`
  (`main.js:8932`) with the same `depth` key. Putting it on the ground layer paints it under
  every wall on the level, which is `art-00`'s layer diagram warning.
- `standable()` (`main.js:640`) is the check to *assert* against in a dev-mode console pass: no
  prop's ground point may be somewhere a body could stand. Write that assertion; the rule is one
  sentence and the failure is invisible until someone walks through a crate.

## 4. Torches become sprites, and the light does not change

`TORCH_BRACKET`, `TORCH_FLAME` and `TORCH_CORE` (`main.js:4799-4823`) are three hand-built paths
filled in three tones. They become one `billboard` manifest entry with 2–3 flicker frames,
selected on the wall clock at `TORCH_FLICKER_HZ` with the per-torch phase the light already uses,
falling back to the three paths.

**`drawTorchLight` (`main.js:6355`) is not touched.** The light field, the additive `lighter`
composite, `TORCH_STOPS`, `TORCH_LIGHT`'s five-unit reach and the flicker's amplitude are all
correct and all measured against the palette in `art-01`. A sprite replaces the *lamp*, not the
*light*.

Two properties of the existing torch that must survive the swap, both argued at
`main.js:5914-5929`:

- **Three separable tones**, bracket to flame to core, with the first step larger than the
  second. In an umber room the read is carried entirely by those steps — `art-01` §3 has the
  argument — so a generated torch whose bracket is not markedly darker than its flame is a
  regenerate, not a tune.
- **The core is the brightest thing in the game** and `arenaVignette` does not reach it, so a
  torch across a dark room stays the brightest thing on screen at any distance. Check that after
  the swap; a sprite drawn inside the vignette's pass would lose it.

## 5. What the fog still owns

Nothing in this session may widen what the player can see. The three checks:

- **Never-seen is black.** A textured floor tile outside the fog is not drawn at all, not drawn
  dark.
- **Remembered-but-unseen** draws at `SEEN_ALPHA = 0.4` with no dynamic light on it — the
  existing two-pass structure in `drawLevel` already enforces this and the textures go inside the
  same passes.
- **A lit torch reveals nothing the character's vision has not.** The light is painted through
  `floorLit`, which is the sim's answer (`main.js:5966-5967` says so explicitly). A prop, a decal
  or a torch sprite drawn outside that clip would be a light source revealing geometry, which is
  the one thing the brief forbids the lighting to do.
- **The ghost fade keeps its timings.** `GHOST_FADE_MS = 400`, `GHOST_HOLD_MS = 2000`. If the
  ember-like restyle the brief floats is wanted, it is a `art-09` decision and it must be
  measured against the same readability, not merely against taste.

## 6. Performance

The gate is the brief's: **60 fps with the player and six monsters and about eight torch
lights**, on the machine that runs the game, in a foreground tab, with `?perf=1`.

What this session adds is: three patterned fills where there were three flat ones (free), one
`drawImage` per decal (free), one per prop (free), one per torch (free, replacing three fills).
So the prediction is that it costs nothing measurable, and `DESIGN.md`'s whole method section
says a prediction is not a measurement.

**Take a `render` reading properly or do not quote one.** `DESIGN.md` is explicit that Canvas2D
commands are queued, that a `for` loop measures the rasteriser's back-pressure rather than the
drawing, and that a large `idle` beside a small `render` is the compositor asking to be measured
a different way. Use `P`, use a foreground tab, and repeat the baseline as a control.

If the frame does move, the suspects in order: a clip emitted per decal instead of one
`CLIP_PUSH` per pass; a pattern matrix rebuilt as a fresh `DOMMatrix` per frame; a prop that ended
up outside the merge walk and is being re-sorted; `shadowBlur` reaching for a soft light, which
`art-04` removed the field for.

**And if it moves and none of those is it: stop and report.** Do not reach for WebGL2. `art-04`
put the seam in precisely so that a second backend is a decision somebody makes deliberately, with
its own file and its own measurements, rather than one an implementer makes at the bottom of a
texturing session because the frame budget got tight. The measurement that matters is
`DESIGN.md`'s: fills, `fillRect`, `drawImage`, sprites and text were collectively free and
`stroke` alone cost 43 fps, so a texturing session that costs frames has almost certainly grown a
stroke or a clip, not exhausted Canvas2D.

---

## Acceptance test

1. **Floor and wall pieces meet the block extrusion with no seams.** Stand at a wall corner and
   look for a bright or dark line where a top face meets a side face or a neighbour's top face.
   The lifted-diamond argument (`main.js:4609-4613`) says there cannot be one geometrically, so a
   seam is a texture edge and a regeneration item.
2. The floor tiles seamlessly against itself in both world axes, stays nailed to the level under
   a pan, and does not re-tile visibly through a zoom.
3. **Textures stay quiet under figures and telegraphs.** Put a Brute mid-windup over the busiest
   patch of floor in the room; the amber declared line is still the loudest thing there. If it is
   not, the texture is too contrasty and that is a `FEEDBACK.md` item, not a code change.
4. No prop stands anywhere a body can stand. Assert it in dev mode over the whole level.
5. A torch reads as a lamp at five pixels and its light pool is unchanged from before the swap.
6. `?noart=1` reverts every surface to the procedural bake with no other change, and the room is
   still intentional — that is what "playable with zero image files" means and this is where it
   gets checked.
7. Fog: walk into a dark corridor with a torch on the far wall. The torch's light stops at the
   fog boundary; nothing behind the boundary is lit, textured or propped.
8. `[tactical]` and `[dev]` are byte-identical.
9. The perf gate above, measured, with the method stated.
10. **`FEEDBACK.md` is written and the environment gate is flipped, or it is not.** Every asset in
    the batch carries a verdict; every `regenerate` carries the specific defect and a screenshot
    reference. If a defect turns out to live in `ASSET_SPEC.md` rather than in the image, fix the
    spec, note the change in `FEEDBACK.md`, and mark previously passed assets the change touches
    as suspect. Codex's second batch does not begin until this item is done.
11. **`DESIGN.md`'s "Art direction" section gains the texture-and-light law this session arrived
    at** — how loud a floor may be before it eats a telegraph, and how the three pattern matrices
    relate to the projection. Two or three lines, the append `art-01` §7 schedules here. It is the
    one finding of this session that a future texture pass needs and that neither the code nor
    `ASSET_SPEC.md` records.

## Tripwires

All five. No Rust changed.

## Explicitly not in this session

- Character sprites and weapon sprites. They are Codex's **second** calibration gate, they arrive
  in the batch this session unblocks rather than the one it receives, and `art-08` integrates and
  reviews them through `art-05`'s layer slots. Nothing here waits for them and nothing here
  anticipates them.
- Blood decals — they are `art-09` and they are a different pool with a different lifetime.
- Changing `TILE_WORLD`, `WALL_H`, or any geometry the wall bake produces.
