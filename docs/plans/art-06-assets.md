# art-06 — the asset contract

**Goal:** the page can draw an image where it draws a shape, driven entirely by a manifest;
`ASSET_SPEC.md` exists and is self-contained enough that its reader has read nothing else; there
is a tool that measures a PNG and proposes its manifest entry; and the whole path is proven with
two hand-made test images before a single generated one exists.

**Leaves the game:** identical, because the manifest ships with two obviously-fake test entries
and everything else falls back. The deliverable is the pipeline, not a look.

**Depends on:** `art-05` (the rig defines the slots an image can fill), `art-01` (the palette the
spec quotes), and `art-04` — a loaded image is a **paint-table entry**, and every draw site below
is an emitted `SPRITE` item rather than a `drawImage` call.

**Unblocks:** every Codex image session, forever. Codex's first batch is generated against the
`ASSET_SPEC.md` this session authors and is integrated by `art-07`; the second is integrated by
`art-08`. See `art-00`'s interleave table.

---

## 1. `web/assets/manifest.json`

One file, one shape, read by the renderer and written by nobody but the integrating agent.

```json
{
  "version": 1,
  "px_per_world_unit": 86,
  "assets": {
    "env/floor_a": {
      "file": "env/floor_a.png",
      "kind": "surface",
      "world": 4
    },
    "env/wall_x": {
      "file": "env/wall_x.png",
      "kind": "face",
      "world": [1, 1.6]
    },
    "env/torch": {
      "file": "env/torch.png",
      "kind": "billboard",
      "frames": 3,
      "anchor": [24, 96],
      "world_h": 0.9
    },
    "props/barrel": {
      "file": "props/barrel.png",
      "kind": "billboard",
      "anchor": [40, 118],
      "world_h": 0.8
    },
    "weapons/sword": {
      "file": "weapons/sword.png",
      "kind": "weapon",
      "hilt": [8, 20],
      "tip": [188, 20]
    },
    "actors/fighter": {
      "kind": "actor",
      "facings": ["s", "sw", "w", "nw", "n", "ne", "e", "se"],
      "cell": [128, 160],
      "layers": {
        "body":   { "file": "fighter/body_{facing}_{frame}.png",
                    "frames": ["idle", "walk1", "walk2", "walk3"],
                    "anchor": [64, 156] },
        "armMain": { "file": "fighter/arm_{facing}.png",    "pivot": [64, 96] },
        "shield":  { "file": "fighter/shield_{facing}.png", "pivot": [64, 96] }
      }
    }
  }
}
```

Five kinds, and each exists because the renderer needs a genuinely different transform:

| kind | what the renderer does | who consumes it |
|---|---|---|
| `surface` | tiles it through a `CanvasPattern` whose matrix carries the projection, exactly as `floorPatternNow` does today. `world` is how many world units across the tile is | `art-07` |
| `face` | maps the rectangle onto a wall block's `+x` or `+y` quad with a `setTransform`. `world` is `[width, height]` in world units | `art-07` |
| `billboard` | draws it upright at a ground point. `anchor` is the pixel that lands on that point; `world_h` is how tall it stands, which is what makes it zoom correctly | `art-07` |
| `weapon` | emits a `SPRITE_SPAN` so `hilt` lands on the projected hilt and `tip` on the projected tip | `art-05`'s weapon slot; reviewed in `art-08` |
| `actor` | resolves one file per layer per facing (per frame, for `body`) and hands each to the matching rig slot | `art-05`'s rig; reviewed in `art-08` |

**`{facing}` and `{frame}` are substituted from the manifest's own lists**, so a Fighter is four
lines of JSON rather than thirty-two, and **no filename is still hardcoded in JS** — the pattern,
the facing names and the frame names are all manifest data. Substitution is `String.replace`, and
a key that resolves to a file that does not exist behaves exactly like every other missing file:
that layer falls back, silently.

**The `body` layer is a composite — legs, torso and head as one drawing — and that is the
decision the whole character pipeline turns on.** An image model asked for "the far leg of a
Brute facing south-east on a transparent background" returns something that does not match the
torso it was asked for separately; asked for a whole figure, it returns a whole figure. So the
generated art is coarse, the articulation that must be exact stays procedural — the weapon is
projected from the sim's blade line and is never a sprite frame — and the `frames` list makes the
walk a *sprite indexed by `stride`*, which is sim state and not a clip with its own clock.

If cross-image drift between facings turns out to be the failure mode in review, the escalation
is a single sheet per archetype with a `cell` grid, which this schema already carries the field
for. **Do not start there**: individual figures are what generation does well, and a grid is what
it does badly.

**The renderer consumes only the manifest.** No filename appears in JS. No offset appears in JS.
A missing key, a missing file, a file that fails to decode and a manifest that fails to parse all
resolve to the same thing: the `art-05` fallback, silently, with at most one console warning.

## 2. The loader

`web/assets.js`, a classic script before `main.js`, under ~100 lines:

- Fetch `assets/manifest.json` once at boot, **off the critical path**. The game starts and runs
  with no manifest; images appear when they appear.
- Per entry, an `Image` created lazily **the first time something asks for that key**, not at
  load. A floor never seen is a file never fetched.
- Three states per entry: `pending`, `ready`, `failed`. `onerror` → `failed`, forever, no retry.
- `assetPaint(key)` returns the entry's **paint-table index** when `ready` and `-1` otherwise.
  Every draw site is `const p = assetPaint(k); if (p >= 0) { emit(SPRITE, p, …) } else { …fallback
  item… }`. The index is stable for the life of the page and is what `art-04` §3 exists for: the
  extract passes name paint by index and never hold an `HTMLImageElement`, so the same manifest
  drives a backend that has textures instead of images.
- `assetsEnabled` — a boolean, default true, flipped by `?noart=1` and settable from the console.
  **This is the review instrument**: `art-06`, `art-07` and `art-08` all require comparing a
  sprite against the fallback it replaced, and doing that by renaming files is how a review takes
  an afternoon. With `art-04` in place it is a predicate over the list rather than a branch at
  every site, so it cannot drift out of sync with the sites it is supposed to be A/B-ing.
- `imageSmoothingEnabled` is set explicitly to `true` around sprite draws and restored. It is the
  canvas default, and relying on a default that some future path might have changed is how one
  category of art comes out crunchy for a week before anyone notices.

**No decoding work per frame.** `drawImage` of a loaded `HTMLImageElement` is the free primitive
`DESIGN.md` measured; `createImageBitmap`, per-frame `canvas` copies and offscreen recomposition
are not, and none of them is needed.

## 3. `tools/measure_assets.js`

Reads every PNG under `web/assets/`, and for each one prints the manifest fragment it proposes:
the tight alpha bounding box, the anchor and pivot the spec's conventions put on that box, and
the image's dimensions against what the spec says they should be.

**It decodes PNG itself, in about eighty lines, with `zlib.inflateSync`.** Node has no image API
and this repository does not take npm dependencies — it hand-rolled a wasm ABI, a fixed-point
sine table and an HTTP server rather than take one. Restrict the reader to **colour type 6
(RGBA), bit depth 8, non-interlaced** and *assert* it, which is the load-bearing part: the tool
that measures the images is then also the tool that enforces the format clause of the contract,
and a palettised or interlaced PNG fails loudly at integration instead of quietly in some
browser.

What it checks, beyond measuring:

- dimensions match what `ASSET_SPEC.md` states for that category and archetype;
- the alpha channel is genuinely binary-ish at the edges — a soft one-pixel feather is the spec,
  a four-pixel grey halo against transparency is a fail and is what "no anti-aliased halo"
  means in a form a script can test;
- an actor layer matches its archetype's declared cell exactly, and its content's alpha bounding
  box sits on the cell's bottom edge, centred, within a pixel or two;
- **every frame of one facing has the same bounding box centre**, which is the check that catches
  the failure mode this convention actually has: a walk frame drawn a few pixels off makes the
  figure bob sideways as it walks, and it is invisible in the file and obvious in the game;
- no fully-opaque background pixel in a category that requires transparency.

It **prints** the fragments. It does not write `manifest.json`. Only the integrating agent edits
that file, and a tool that could write it is a tool that could point an entry at a file that does
not exist.

## 4. `web/assets/ASSET_SPEC.md` — author it in this session

This is the binding contract and the single input to every image session. **Assume its reader
has read nothing else in the repository, ever.** Contents, in this order:

1. **What the game is, in three sentences**, and one embedded reference screenshot of
   `[world]` at default framing.
2. **The camera.** Classic 2:1 isometric, `sx = (wx − wy)·s`, `sy = (wx + wy)·s/2`. The three
   facts an artist needs from it: a floor tile is a diamond twice as wide as it is tall; one
   world unit of *height* is exactly the diamond's half-width in pixels; a circle on the floor
   is an axis-aligned ellipse twice as wide as tall. Draw the diamond in ASCII if that is what
   it takes.
3. **The scale, stated once as law: `86 px per world unit`**, the default framing's value. Every
   pixel dimension in the document is derived from it and says so.
4. **The style.** Painted, not pixel art. Warm umber near-black. No black outlines. Soft alpha
   edges, one pixel of feather at most. No visible texel grid. Composited with smoothing on, so
   an image authored at these dimensions is drawn at 1:1 at default zoom and interpolated at
   others. **Say the cost out loud**: the game zooms to 2.5×, and art authored for 1× is soft
   there. That is the accepted trade and not a defect to report.
5. **The palette**, as the hexes from **`DESIGN.md`'s "Art direction" section** — not from
   `art-01`, which is a plan file with a deletion date (`AGENTS.md` §Plans). `art-01` §7 puts the
   palette, the global light and the saturation rule in `DESIGN.md` precisely so this document has
   a durable source to quote. Copy the hexes in; this file's reader has read nothing else and must
   not be sent to a second document. Include the saturation rule: nothing but flame, blood and the
   two thin team rings carries chroma.

   **The two documents divide as why versus how, and neither substitutes for the other.**
   `DESIGN.md` records why the room is umber and what that decision cost, for whoever changes it
   in a year. `ASSET_SPEC.md` states what to draw and at what size, for an agent that will never
   read anything else. A number that appears in both is copied deliberately and `DESIGN.md` is the
   original.
6. **The format.** PNG, RGBA, 8-bit, non-interlaced, transparent background, tight-cropped to
   content.
7. **Geometry per category**, and the one instruction that everything depends on:

   > **Surfaces and faces are drawn flat and unprojected. Do not draw a diamond and do not draw
   > a parallelogram.** A floor tile is a **square** of stone as seen from straight above; the
   > renderer applies the isometric shear. A wall side face is a **rectangle** of stone as seen
   > straight on; the renderer maps it onto the block's quad. Art with the projection baked into
   > it gets projected twice and comes out as a rhombus of rhombuses.

   Then, per category, with numbers:

   | category | authored as | size at 86 px/unit | notes |
   |---|---|---|---|
   | floor top face | seamless square, 4 world units | 344 × 344 | must tile against itself; the seam falls on a grid line |
   | wall side face | rectangle, 1 × 1.6 world units | 86 × 138 | one per exposed face; `+x` and `+y` may share one image |
   | wall top face | seamless square, 4 world units | 344 × 344 | lit; the floor's cousin, brighter |
   | grime / moss / crack decals | square, 1–2 world units, mostly transparent | 86–172 square | overlaid on floor, not tiled |
   | props | upright billboard, anchor at base centre | height from `world_h` | barrels, crates, rubble |
   | torch / lantern | upright billboard, 2–3 flicker frames, same anchor | ~0.9 units tall | the flame is the brightest thing in the game |
   | weapons | drawn along **+x**, hilt at the left edge, tip at the right | length is free; the two marker pixels are what bind | see 9 |
   | actor body | one whole figure per facing per frame, feet on the cell's bottom edge | cell per archetype, tabulated | see 8 |
   | actor arm / shield | one per facing, pivoting at the shoulder | same cell | see 8 |

   Plus one clause that belongs with the style and is stated here because it is what an artist
   actually has to hold: **one global light direction, from the upper right, warm.** Every asset
   in the game is lit by it — a floor's lip, a block's top face, a barrel's highlight, a
   figure's rim — and an asset lit from anywhere else is the one defect that cannot be fixed by
   putting it next to something.

8. **Characters.** The facing set is **8**, named by the screen direction the body is looking:

   ```
        n           n  = facing away from the viewer
    nw     ne       s  = facing the viewer
   w         e      w  = facing screen-left
    sw     se       e  = facing screen-right
        s
   ```

   Facing order is `s, sw, w, nw, n, ne, e, se` and it is the manifest's `facings` list.

   Per archetype: one **composite body** — legs, torso and head in one drawing — in each of the
   eight facings, in each of **four frames**: `idle`, `walk1`, `walk2`, `walk3`. `walk1` and
   `walk3` are the two extremes of the stride and `walk2` is the passing pose; the renderer picks
   the frame from how far the body has actually walked, so the cycle must read as a loop in the
   order `walk1, walk2, walk3, walk2`. Then one **arm** layer and one **shield** layer per
   facing, each drawn from the shoulder, posed by the renderer.

   **The arm and shield are drawn detached and neutral**, in a straight relaxed pose along the
   facing, because the renderer rotates them to wherever the sim is holding them. An arm drawn
   mid-swing is an arm that will be rotated to a second, wrong mid-swing.

   Then the numbers, straight out of the sim:

   | archetype | body radius | height | drawn size at 86 px/unit | cell |
   |---|---|---|---|---|
   | Fighter | 0.45 | 1.35 | 109 × 116 | 128 × 160 |
   | Rogue | 0.35 | 1.12 | 85 × 96 | 112 × 144 |
   | Brute | 0.70 | 1.89 | 170 × 163 | 192 × 192 |
   | Skitterer | 0.30 | 0.33 | 73 × 28 | 96 × 64 |

   The figure's **feet sit on the cell's bottom edge, horizontally centred**, and its crown
   touches the drawn height above it. That is what makes the anchor derivable rather than
   negotiated, and it is what `tools/measure_assets.js` checks.

   > **The bodies are stocky because the sim's bodies are stocky** — a Brute is 1.4 world units
   > across standing on a 1-unit tile — and a Skitterer is *wider than it is tall*. These are
   > not stylistic proportions to improve. Drawing a Brute at heroic proportions makes it
   > narrower than its own collision circle, and the collision circle is drawn on the floor
   > underneath it.

   State per slot what pose it must be in per facing, and where its pivot sits. Be concrete: "the
   torso's pivot is the hip centre, at the bottom edge of the cell, horizontally centred."

9. **Weapons by parameter.** The renderer stretches a weapon sprite between the projected hilt
   and the projected tip, so **length is decided by the sim and not by the image**. What the
   image decides is heft: a weapon's drawn thickness should read against its mass. The spec gives
   the roster's reach and mass so an artist can size them relative to one another, and states the
   convention so a new item resolves to plausible art by default.
10. **Naming.** `env/floor_a.png`, `env/wall_x.png`, `props/barrel.png`, `weapons/axe_heavy.png`,
    `fighter/body_e_walk1.png`, `fighter/arm_e.png`, `brute/shield_nw.png`. Lower case,
    underscore, category or archetype directory, no spaces.
11. **The loop.** Read `FEEDBACK.md` after this file and before producing anything. Never
    overwrite an asset marked passed. Deliver in coherent batches. Report spec gaps rather than
    guessing — a gap in this document is a bug in this document.

## 5. `web/assets/FEEDBACK.md` — create the template

One section per asset, cumulative and current, with exactly two verdicts:

```markdown
## chars/fighter.png
**regenerate** — the `n` column's torso is lit from the front; every other column is
lit from the upper right. Screenshot: docs/review/2026-08-14-fighter-n.png
```

```markdown
## env/floor_a.png
**passed** — locked. Do not regenerate.
```

Plus a **calibration gate** at the top, which starts as not passed:

```markdown
# Calibration: NOT PASSED
Batch 1 is under review. Mass production must not begin.
```

`art-00` says why it is worth a gate of its own: mass production reuses whatever passed
calibration, so a defect that slips through multiplies across the whole asset set.

## 6. Prove the path with three hand-made images — one per transform

Before any generated asset exists, commit three obviously-fake PNGs and integrate them through the
real tooling. **One per transform the renderer can get wrong**, which is why there are three and
not two:

- `env/floor_a.png` — a 344 × 344 magenta-and-black checker. Proves `surface`. It is *supposed*
  to look wrong.
- `fighter/body_{facing}_{frame}.png` — thirty-two flat green rectangles, each with its facing
  letter and frame number drawn in it, and each with a small notch at a *different* height per
  frame so a wrong frame is visible at a glance. Proves `actor`.
- `weapons/test_bar.png` — a flat cyan bar with a **red pixel block at the hilt end and a yellow
  one at the tip end**, and asymmetric notches along it so a mirrored or reversed span is obvious.
  Proves `weapon`.

Then run `tools/measure_assets.js`, paste its fragments into `manifest.json`, load the game, and
check that the checker lies on the floor in the projection, that the green rectangle stands on
its feet at every facing, that the letter matches the direction the body is walking, that the
notch steps through `walk1, walk2, walk3, walk2` at a rate that tracks the ground going past, and
that the cyan bar's **red end stays on the hand and its yellow end on the tip through a full
swing, at every facing, in both the lifted blade and its ground shadow**.

**A deliberately ugly test asset is the only one whose defects are unambiguous**, and a magenta
checkerboard that comes out as a rhombus of rhombuses is §4's "projected twice" failure caught
before it costs a generation batch.

**The weapon fixture is why Codex's first batch has no weapons in it.** `art-00`'s calibration row
has the argument: a weapon sprite is two marker pixels and a drawing stretched between them, so it
has no reviewable property until a body is swinging it, and a fixture proves the transform for
nothing where a generated batch would have proved it against nothing. Real weapons arrive with the
characters and are reviewed in `art-08`.

Delete none of the three. They stay in the repository as the pipeline's fixtures, referenced from
`FEEDBACK.md` as "not art, do not regenerate", and the manifest keeps pointing at them until real
assets replace those keys.

---

## Acceptance test

1. **The game runs identically with the manifest present, absent, renamed, truncated
   mid-object, and pointing at files that do not exist.** Five loads, one console warning at
   most in each, no exception, no missing body, no blank floor.
2. An image that 404s falls back and does not retry on subsequent frames.
3. `?noart=1` reverts every sprite to its fallback with no other change.
4. `tools/measure_assets.js` rejects a palettised PNG, an interlaced PNG, a body layer at the
   wrong cell size, and a walk frame whose bounding box centre has drifted — test it by making
   one of each.
5. The checker floor lies flat, tiles seamlessly, stays nailed to the level under a pan, and does
   not re-tile visibly under a zoom.
6. The test body holds its footing through a full walk cycle, a full turn and a swing, at both
   extremes of the zoom, and does not bob sideways.
7. The test weapon's red end stays on the hand and its yellow end on the tip through a full swing
   at all eight facings, and `[tactical]` agrees about the bearing and the extension. A bar that
   comes out reversed at four facings and correct at the other four is a sign error in the span,
   and it is the whole reason the fixture is asymmetric.
7. **A half-integrated actor is not broken**: delete `fighter/arm_e.png` and the body still draws
   with a fallback arm on it. That state is what every integration pass looks like halfway
   through and it must be reviewable rather than a crash.
8. **Hand `ASSET_SPEC.md` to someone — or something — that has read nothing else and ask what
   size to draw a Brute's body at, in which facings, in how many frames, and lit from where.** If
   they cannot answer all four from the document alone, the document is not finished.

## Tripwires

All five, plus `node --check` on `web/assets.js`, and `node tools/measure_assets.js` runs clean.
No Rust changed.

## Explicitly not in this session

- Any generated image. Codex's first batch comes after this lands, against
  `codex-image-brief.md`, and is integrated by `art-07`.
- Using the manifest for the environment. `art-07` is what wires `surface` and `face` into
  `drawLevel` and the wall bake; this session only proves the shapes exist and the loader works.
- Reviewing real character or weapon art. `art-08`. This session proves the `actor` and `weapon`
  transforms against fixtures whose defects are unambiguous; judging a drawing is a different
  activity with a different instrument and it has its own session.
