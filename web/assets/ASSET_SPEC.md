# ASSET_SPEC.md — the binding contract for every image in this game

**You have read nothing else, and you do not need to.** This document is complete on its own.
Every dimension, every colour, every filename and every pose convention you need is stated here.
Where a number came from somewhere else in the repository, the number itself is written out here
and the source is given in small print as provenance — you never have to go and look. That last
part is now load-bearing rather than a courtesy: the provenance lines citing `web/main.js` name
the retired Canvas page, so those files are gone and the numbers here are the only copy. They are
still the right numbers; the citation records where they were derived, not where to check them.

**Read `FEEDBACK.md`, in this same directory, immediately after this file and before you draw
anything.** It carries the review of everything delivered so far: what passed, what must be
regenerated, and why. An asset marked `passed` is locked and must not be overwritten.

**If this document is ambiguous or silent on something you need, stop and report the gap.** Do
not guess. A gap in this document is a bug in this document, and it gets fixed here rather than
worked around in an image.

You deliver PNG files and a short written report. You do not edit code, `manifest.json`, or this
file.

---

## 1. What the game is

`auto-rpg` is an isometric auto-battler set in a dark stone dungeon: you give a character rough
directions and it fights for itself. The camera looks down at a generated level of rooms and
three-wide corridors — umber stone in near-total darkness, torches on the walls the only light,
with small dark figures moving through it. The mood is Diablo 1's Cathedral: grimy, desaturated,
oppressive, quiet.

Everything you draw is for one view — the game's main **World** view, the isometric one. Two
other view modes exist (`Tactical` and `Dev`); both are deliberately plain top-down diagrams that
never draw a single image and are none of your concern.

### The two images to look at before you draw anything

**What it must look like — `web/assets/CONCEPT.png`, in this same directory.** A painted mockup
of the World view at default framing, with the full interface around it. This is the target for
everything in this document: the stone, the light, the figures, the props, the mood. It is
permanent, it is not an asset, nothing loads it, and it is never regenerated. Open it before you
read any further, and open it again before you deliver.

**What it looks like now.** The game today draws the same room procedurally, with **no image
files at all** — a baked flagstone pattern on the floor, flat-tinted blocks for the walls, and
bodies built out of simple filled shapes. It is already umber, already lit by torches, and
already in the projection of § 2. What it is missing is every texture and every figure in the
concept. **That gap is what you are being asked to close.**

> **TODO — current-state screenshot.** A screenshot of the World view at default framing, as the
> game actually renders today, belongs at `web/assets/REFERENCE.png` and is to be dropped in at
> that path. It is not in the repository yet, and **nothing else in the repository substitutes
> for it** — in particular `web/media/screenshot.jpg` is a stale top-down image from an earlier
> milestone, in the old cold blue palette and the wrong projection, and pointing an artist at it
> would be worse than showing nothing. Like `CONCEPT.png`, the screenshot will be a permanent
> reference image rather than an asset: never regenerated, never loaded. See `FEEDBACK.md`
> § "Permanent files".

---

## 2. The camera

Classic 2:1 isometric. The projection, exactly, with `s` the pixels-per-world-unit scale of § 3:

```
    screen_x = (world_x − world_y) · s
    screen_y = (world_x + world_y) · s / 2          (screen y increases downward)
    a world unit of HEIGHT rises  s  pixels up the screen
```

World `+x` runs down and to the right on screen. World `+y` runs down and to the left. Screen up
is world height.

**The three facts you actually need.**

**(a) A floor tile is a diamond twice as wide as it is tall.** One world unit square, drawn:

```
                             world (0,0)
                                  /\
                                 /  \                     ---
                                /    \                     |
                               /      \                    |
                              /        \                   |
              world (0,1)  --<          >--  world (1,0)   |   86 px tall
                              \        /                   |
                               \      /                    |
                                \    /                     |
                                 \  /                      |
                                  \/                      ---
                             world (1,1)

              |<----------------- 172 px wide ----------------->|

              (schematic — the characters do not line up, the numbers are exact)
```

Its top corner is world `(0,0)`, its right corner `(1,0)`, its bottom corner `(1,1)`, its left
corner `(0,1)`. Width `2 × 86 = 172` px. Height `86` px. **One dungeon tile is exactly one world
unit**, so that diamond is one tile of the floor grid.

Equivalently: the ground plane is seen from **30° above the horizon**. The square's diagonal
across the screen is 172 px and its diagonal into the screen is 86 px, and `86 / 172 = 0.5 =
sin 30°`. That is where the `/ 2` in the `screen_y` formula comes from, and it is why a standing
figure is seen *very slightly* from above: draw a body essentially straight on, with just enough
downward tilt that the tops of the shoulders and the top of the head are visible.

**(b) One world unit of height is exactly the diamond's half-width in pixels.** Half of 172 is
86, and one world unit of height is 86 px. A cube one world unit on a side is therefore a
diamond 172 × 86 with vertical edges 86 px long. Heights and ground distances are *not* the same
scale as each other on screen, and this is the sentence that reconciles them.

**(c) A circle lying on the floor is an axis-aligned ellipse twice as wide as it is tall.** A
circle of world radius `r` becomes an ellipse with semi-axes `(r · s · √2, r · s · √2/2)` —
horizontal `1.41421 · r · s`, vertical `0.70711 · r · s`, exactly 2:1, and never tilted. Every
body in the game stands on such an ellipse (its collision circle), and the renderer draws that
circle on the floor underneath it. **This is why the figures are as wide as they are** — see § 8.

<sub>Provenance: `web/main.js:2131-2141` (`PROJ_ISO`: `ax:1, bx:-1, ay:0.5, by:0.5, ex:√2,
ey:√2/2`), `web/main.js:4684-4690` (`projX`/`projY`), `web/main.js:4700-4708` (`lift`, height to
pixels, identical to `px` by construction), `crates/web/src/lib.rs:563` (`TILE_MILLI = 1000` — one
tile is one world unit).</sub>

---

## 3. The scale, as law

> ## **86 pixels per world unit.**
>
> This is the game's default framing and it is the only scale in this document. Every pixel
> dimension below is derived from it by multiplication, and every one of them says so.

The renderer declares it once, as `px_per_world_unit: 86` in `manifest.json`, and the game's own
source calls the default framing `scale ~ 86`. An image authored at these dimensions is drawn at
**1:1** at default framing.

Wherever a size appears below it is written as arithmetic — `1.6 × 86 = 137.6 → 138 px` — so that
if the scale ever changes you can regenerate the whole table by substitution. Rounding is to the
nearest whole pixel.

<sub>Provenance: `web/main.js:2077` (`VIEW_UNITS_Y = 11`, the framing in world units),
`web/main.js:2392-2393` (`scale = safeRect().h / VIEW_UNITS_Y`, clamped by the zoom),
`web/main.js:8110` ("At default framing (`scale ~ 86`)").</sub>

---

## 4. The style

**Painted, not pixel art.** Hand-painted texture in the manner of a 1996 dungeon crawler's
pre-rendered stone. Not a texel grid, not chunky pixels, not cel shading, not vector flats, not
glossy, not cute.

- **Warm umber near-black.** The room's darkest tone is `#0b0a08` — a brown-black, never a
  blue-black. See § 5.
- **No black outlines.** Nothing is inked. Form comes from value and edge, not from a contour
  line.
- **Soft alpha edges, one pixel of feather at most.** The edge of a sprite may have a single
  pixel of partial alpha. It may not have a three- or four-pixel grey halo fading into
  transparency — that reads as a smudge over the dark floor and it is automatically rejected by
  the measuring tool.
- **No visible texel grid.** No dithering pattern, no scanlines, no deliberate low-resolution
  blockiness.
- **Silhouette first — which is not the same as empty.** Shrink any figure until it is forty
  pixels tall: if you can still name what it is and which way it is facing, the shape is right;
  if you needed the interior, the silhouette is wrong. This is the test that matters most for
  characters, because forty pixels of dark figure against dark stone under a guttering torch is
  what the player actually sees.

  **But the interior is not blank.** `CONCEPT.png` shows figures in articulated plate with
  rivets, a visored helm, a studded shield with a boss, a bow and a cloak — dark overall, with a
  warm rim on the lit side, and a readable interior *inside* that silhouette. Draw that. The rule
  is that the silhouette must carry the read **on its own**, not that the detail is forbidden;
  detail that survives the forty-pixel test as texture rather than as information is exactly
  right.

**The cost, stated out loud so nobody reports it as a bug.** Images are composited with canvas
smoothing left **on**. An image authored at the dimensions in this document is drawn at 1:1 at
the default framing and *interpolated* at every other zoom. The game zooms in to **2.5× the
default framing**, and art authored for 1× is **soft there**. It also zooms out far enough to see
a whole room, where the same art is minified.

**That is the accepted trade. It is not a defect. Do not report it, do not compensate for it, and
do not author at 2× to hide it** — authoring larger would make every asset in the game
inconsistent with every dimension in this document, which is a far worse problem than softness at
the top of the zoom range.

<sub>Provenance: `web/main.js:2078` (`ZOOM_MAX = 2.5`, "multiples of the default framing").</sub>

---

## 5. The palette

These sixteen tones are the whole material palette of the game. They are copied here from the
repository's own durable record so that you never need to open a second document.

```
void       #0b0a08     never-seen dark, and the page's own background
mortar     #100d0a     what every seam shows through to
stoneLo    #241e14     darkest flagstone
stoneHi    #2e281e     brightest flagstone
rockSide   #1e1a14     a wall block's side faces
rockTop    #3a342c     a wall block's lit top face
rockLip    #57503f     the lit edge of a course
timberTop  #5a3d1c     a door, lit face
timberSide #33220f     a door, side face
iron       #2a1d10     a torch bracket, and metal generally
flame      #e8842c     fire
flameCore  #fff0c4     the hottest part of a flame
bone       #c9bfa8     highlights, and any text on the canvas
boneDim    #8c8474     the same, dimmed
blood      #7a1010     blood
bloodHot   #c0392b     fresh blood
cold       #3d4f5c     portal and magic, and nothing else
```

**The three claims those numbers exist to make, all of which your art must keep true:**

1. **Rock is lighter than distant floor.** A lit wall top face standing over ground the light no
   longer reaches is the ordinary isometric read.
2. **Flame is brighter than anything.** The flame of a torch is the brightest thing in the game.
3. **Blood is the only saturation.**

**The saturation rule.** Nothing but flame and blood carries chroma. Everything else in every
image you deliver is umber, bone or near-black — separated from its neighbours by **how much
light it is getting**, never by hue.

**The rule is about materials, and only about materials.** Looking at `CONCEPT.png` you will see
strongly saturated cyan and red: the thin team rings under the feet, the health bars, the callout
pills. Those are **gameplay instruments, not surfaces** — they are drawn procedurally by the
renderer in all three view modes and they keep their chroma deliberately. **You never draw one of
them, and their presence in the concept is not a licence to put chroma into stone, timber, iron,
cloth or leather.**

**The check is a desaturated screenshot, not an opinion.** Drop the saturation of your image to
zero. Any *material* that stops being findable was relying on hue it was not allowed to spend.

**One observation about the concept, so that matching it by eye does not drift.** Measured across
its stone, `CONCEPT.png` is warm everywhere — every sample of floor and masonry has red above
green above blue — but its **mid-tone stone runs a little greyer than the darkest flagstone
hexes above**: patches of lit wall measure around `rgb(48,45,37)` and `rgb(44,41,34)` where
`stoneHi` is `rgb(46,40,30)`, so the warm span is a few levels narrower. **The hexes above
govern.** Match the concept's *rendering* — its stonework, its light, its detail density — and
take your *tone* from the palette. This document is not the place to re-decide the palette, and
an artist eyedropping the concept instead of reading the list is how a batch ends up half a step
cooler than everything already in the game.

**One global light: upper right, warm.** Every asset in the game is lit by it — a floor's lip, a
block's top face, a barrel's highlight, a figure's rim. It never rotates: the light belongs to
the room, not to the object.

> ### This is the one defect that cannot be fixed by putting the asset next to something else.
> A wrong size can be rescaled, a wrong palette can be regraded, a wrong crop can be recropped.
> **Two sprites lit from opposite sides are wrong together at every scale and in every
> arrangement.** If you are unsure about any other rule in this document, get the light direction
> right first.

**The style reference.**

The painted target for the whole game is `web/assets/CONCEPT.png`, in this same directory. Open
it. **Match its rendering style; treat its content as directional inspiration, not as a template
to copy.** It is permanent, it is not an asset, nothing loads it, and it is never regenerated.
See `FEEDBACK.md` § "Permanent files".

<sub>Provenance: `DESIGN.md` § "Art direction" is the original of this palette and of the global
light and saturation rules; it is realised in code as `PAL` at `web/main.js:6214-6232`. The two
copies are identical and `DESIGN.md` is the one that governs.</sub>

---

## 6. The format

Every file you deliver:

| | |
|---|---|
| container | **PNG** |
| colour type | **6 — RGBA**, truecolour with alpha. Not palettised, not greyscale, not RGB-without-alpha |
| bit depth | **8** per channel |
| interlacing | **none** (no Adam7) |
| background | **transparent** where the category calls for it (see § 7) |
| edges | alpha is binary-ish; **at most one pixel of feather**, never a soft multi-pixel halo |

**These are asserted by a tool, not eyeballed.** `tools/measure_assets.js` reads every PNG under
`web/assets/` and *rejects* anything that is palettised, interlaced, at the wrong bit depth, at
the wrong dimensions for its category, or carrying a soft alpha halo. A file that fails is not
integrated. Export settings that produce an 8-bit indexed PNG "to save space" will fail every
time.

**Cropping differs by category and this is the one place people get it wrong:**

- **Surfaces and faces** (floors, wall faces) are drawn to the **exact** stated dimensions and
  are **fully opaque** everywhere — not one transparent pixel.
- **Billboards, props, torches, decals and weapons** are **tight-cropped to their content**: the
  content's alpha bounding box touches all four edges of the canvas.
- **Actor layers** (character bodies, arms, shields) are the **exact cell size for their
  archetype**, padded with transparency. They are *not* tight-cropped — the padding is what
  guarantees every facing and every frame lands in the same place. See § 8.

---

## 7. Geometry, per category

> # Surfaces and faces are drawn flat and unprojected.
> # Do not draw a diamond. Do not draw a parallelogram.
>
> A **floor tile is a SQUARE** of stone as seen from **straight above**. The renderer applies the
> isometric shear itself.
>
> A **wall side face is a RECTANGLE** of stone as seen **straight on**. The renderer maps it onto
> the block's quad itself.
>
> **Art with the projection baked into it gets projected twice and comes out as a rhombus of
> rhombuses.** This silently wastes an entire batch: every individual image looks plausible in a
> file browser and the whole room is unusable in the game.

The same instruction, put positively: draw the floor as if you were photographing a flagstone
pavement from directly overhead with a lens pointing straight down, and draw the wall face as if
you were photographing a masonry wall from directly in front of it. Nothing you draw is ever
skewed, sheared, tilted or foreshortened by you.

### The table

Every size is `world units × 86 px/unit`, and the arithmetic is shown.

| category | authored as | size at 86 px/unit | arithmetic | alpha |
|---|---|---|---|---|
| **floor top face** | seamless square, 4 world units across | **344 × 344** | `4 × 86 = 344` | fully opaque |
| **wall side face** | rectangle, 1 world unit wide × 1.6 tall, seen straight on | **86 × 138** | `1 × 86 = 86`; `1.6 × 86 = 137.6 → 138` | fully opaque |
| **wall top face** | seamless square, 4 world units across | **344 × 344** | `4 × 86 = 344` | fully opaque |
| **door top face** | seamless square, 4 world units across | **344 × 344** | `4 × 86 = 344` | fully opaque |
| **door side face** | rectangle, 1 world unit wide × 1.6 tall, seen straight on | **86 × 138** | `1 × 86 = 86`; `1.6 × 86 = 137.6 → 138` | fully opaque |
| **grime / moss / crack decals** | square, 1–2 world units, mostly transparent | **86 × 86** to **172 × 172** | `1 × 86 = 86`; `2 × 86 = 172` | transparent, tight-cropped |
| **props** (barrel, crate, rubble) | upright billboard, seen straight on | height from its world height; a barrel at 0.8 units is **69 px tall** | `0.8 × 86 = 68.8 → 69` | transparent, tight-cropped |
| **torch / lantern** | upright billboard, **3 flicker frames**, identical dimensions and identical base point across frames | ~0.9 units tall = **77 px tall** | `0.9 × 86 = 77.4 → 77` | transparent, tight-cropped |
| **weapons** | drawn along **+x**: hilt at the left edge, tip at the right edge | length from the roster, § 9 | see § 9 | transparent, tight-cropped |
| **actor body** | one whole figure per facing per frame, feet on the cell's bottom edge | cell per archetype, § 8 | see § 8 | transparent, padded to cell |
| **actor arm / shield** | one per facing, pivoting at the shoulder | same cell as the body | see § 8 | transparent, padded to cell |

### Notes per category

**Floor top face.** Must tile seamlessly against *itself* in both directions. The seam falls
exactly on a grid line — four world units is four tiles of the floor grid, so the stones and the
grid never disagree about where a stone ends. **Large irregular flagstones, hand-placed**, each
one visibly a different stone from its neighbours in size, shape and tone; grit and dirt packed
into the seams; the odd crack; patches of dull rust-and-blood staining. That is what
`CONCEPT.png` shows and it is not a repeating swatch. Keep it quiet all the same: figures and
telegraphs have to read over it.

**Wall side face.** Blocks stand **1.6 world units** tall, which is chest-high on a Fighter. One
image serves both exposed faces of a block (the renderer only ever shows two of a block's four
faces, and they may share one image). **Coursed masonry with every individual stone visible** —
small, roughly rectangular blocks in courses, each with a lit top edge and a shadowed seam under
it, with moss and vines in the joints and creeping down onto the floor at the base. Not a smooth
face, not a repeating swatch.

**Wall top face.** The floor's cousin, and **markedly brighter than the side faces** — it is a
lit surface standing over ground the light no longer reaches, and in `CONCEPT.png` that
difference is the single strongest value contrast in the room. Same 4-unit seamless square, same
tiling rule, same coursed stones.

**Door faces.** Heavy vertical timber with iron straps and visible joinery, authored through the
same two transforms as a wall top and side. A door is not a flat brown occluder: the top catches
the global light and the side carries enough hardware and grain to remain a door at room scale.

**Decals.** Overlaid on the floor, **not tiled**. Mostly transparent — a decal is a patch of
grime, a spread of moss, a crack, a rust stain, not a full square of texture.

**Props.** Depth-sorted with the bodies, so a barrel occludes and is occluded like a figure.
Drawn upright, straight on, standing on its own base. Its width is free; its height is what the
manifest states in world units, so `world height × 86` is its pixel height. `CONCEPT.png` shows
the register to aim for: an iron-banded barrel, a small stack of crates, a clay pot, vines.

**Torch.** The flame is the brightest thing in the game. Give it a visible iron fixture — light
comes from *things* in this game, and a glow with no bracket is a bug in the picture. All three
flicker frames must be the same dimensions with the base of the bracket at the same pixel, so
that cycling them does not make the fixture jump. Vary the flame, not the iron. In `CONCEPT.png`
a wall torch throws a warm pool onto the floor in front of it **and warm bounce onto the surface
behind it**; the renderer draws that light itself, so do not paint a pool or a glow into the
sprite — draw the fixture and the flame only.

### The light, once more, because it is what an artist actually has to hold

**One global light direction: from the upper right, warm.** A floor's lip catches it. A block's
top face catches it. A barrel's highlight is on its upper right. A figure's rim light is on its
upper right and **does not rotate as the figure turns** — the light belongs to the room. An asset
lit from anywhere else is the one defect that nothing can rescue.

> **Do not take the light direction off `CONCEPT.png` by eye.** In the concept the barrel, the
> crates and the pot all carry their highlight on the **left** — because the wall torch happens
> to stand up and to the left of them, and they are being lit by it. **That is local light, and
> the renderer draws local light itself**: it paints a torch's pool and its bounce over your
> sprite at run time, wherever the torch actually is. What you paint into the asset is the
> *global* key, and the global key is upper right. The one thing the concept does say about it
> unambiguously, and which your art must obey, is that **light comes from above**: every wall top
> face in it is far brighter than any side face.

<sub>Provenance: `web/main.js:5076` (`TILE_WORLD = 4`, "so the tile seam falls exactly on a grid
line"), `web/main.js:2168` (`WALL_H = 1.6`, "chest-high on a Fighter"), `web/main.js:4615-4619`
(only two of a block's four faces are ever drawn), `DESIGN.md` § "Art direction" (the global
light).</sub>

---

## 8. Characters

### 8.1 The facings — there are eight

Named by the screen direction the body is **looking**:

```
                    n                       n   facing directly AWAY from the viewer
                    |                            (you see its back)
          nw        |        ne              s   facing the viewer
             \      |      /                     (you see its face and chest)
               \    |    /                   w   facing screen-LEFT  (pure profile)
                 \  |  /                     e   facing screen-RIGHT (pure profile)
                   \|/
        w -----------+----------- e          nw, ne, sw, se
                   /|\                           the four three-quarter views
                 /  |  \
               /    |    \
             /      |      \
          sw        |        se
                    |
                    s
```

**The fixed order is `s, sw, w, nw, n, ne, e, se`.** That is a clockwise sweep on screen starting
from "facing the viewer", it is the order the renderer indexes, and it is the order you deliver
in. Deliver all eight or none — a partial facing set is a body that turns and vanishes.

Remember from § 2 that every facing is seen from **30° above the horizon**: a slight look-down,
not a level shot and not a top-down one.

### 8.2 The frames — there are four

Per facing: `idle`, `walk1`, `walk2`, `walk3`.

| frame | what it is |
|---|---|
| `idle` | standing, weight settled, not walking |
| `walk1` | one extreme of the stride (say, left leg forward) |
| `walk2` | the **passing pose** — legs together, mid-step |
| `walk3` | the other extreme of the stride (right leg forward) |

> **The cycle must read as a loop in the order `walk1, walk2, walk3, walk2`.**

Walk2 is played **twice per cycle, in both directions of travel**, so it has to be a true middle
that works passing either way. Draw it as the neutral passing pose, not as a pose that commits to
which leg is coming through.

**There is no clock and no animation timeline.** The renderer picks the frame from how far the
body has actually walked in the simulation. A body that stops freezes on its frame; a body
walking at half speed cycles at half rate; a body being shoved backwards does not cycle at all.
Draw four still poses that step cleanly between each other in that order, and nothing else.

### 8.3 The numbers, per archetype

All four archetypes, with every dimension derived from the 86 px/unit law of § 3.

| archetype | body radius | height | **drawn width** | **drawn height** | **cell (canvas)** |
|---|---|---|---|---|---|
| **Fighter** | 0.45 | 1.35 | **109 px** | **116 px** | **128 × 160** |
| **Rogue** | 0.35 | 1.12 | **85 px** | **96 px** | **112 × 144** |
| **Brute** | 0.70 | 1.89 | **170 px** | **163 px** | **192 × 192** |
| **Skitterer** | 0.30 | 0.33 | **73 px** | **28 px** | **96 × 64** |

**Where the height comes from.** Each archetype's height is its body radius times a per-archetype
multiplier (`3.0`, `3.2`, `2.7`, `1.1`):

```
    Fighter    0.45 × 3.0 = 1.35 world units
    Rogue      0.35 × 3.2 = 1.12
    Brute      0.70 × 2.7 = 1.89
    Skitterer  0.30 × 1.1 = 0.33
```

**Drawn height** = height in world units × 86:

```
    Fighter    1.35 × 86 = 116.1  → 116 px
    Rogue      1.12 × 86 =  96.3  →  96 px
    Brute      1.89 × 86 = 162.5  → 163 px
    Skitterer  0.33 × 86 =  28.4  →  28 px
```

**Drawn width** = `2 × radius × 86 × √2`. The `√2` is not decoration: a body's drawn half-width
is exactly the semi-major axis of its own collision ellipse on the floor (§ 2c), so the figure
stands precisely on the ring the renderer draws underneath it. A narrower figure stands *inside*
its own footprint; a wider one overhangs it. Both look wrong immediately.

```
    Fighter    2 × 0.45 × 86 × 1.41421 = 0.90 × 86 × 1.41421 = 109.5  → 109 px
    Rogue      2 × 0.35 × 86 × 1.41421 = 0.70 × 86 × 1.41421 =  85.1  →  85 px
    Brute      2 × 0.70 × 86 × 1.41421 = 1.40 × 86 × 1.41421 = 170.3  → 170 px
    Skitterer  2 × 0.30 × 86 × 1.41421 = 0.60 × 86 × 1.41421 =  73.0  →  73 px
```

**The cell** is the canvas every layer of that archetype is delivered on — body, arm and shield
alike, every facing, every frame. It is a fixed size per archetype and it is checked exactly: a
file one pixel off its cell is rejected. It is larger than the drawn figure, and the extra is
transparent margin:

| archetype | cell | margin each side | headroom above the crown |
|---|---|---|---|
| Fighter | 128 × 160 | `(128 − 109) / 2 = 9.5 px` | `160 − 116 = 44 px` |
| Rogue | 112 × 144 | `(112 − 85) / 2 = 13.5 px` | `144 − 96 = 48 px` |
| Brute | 192 × 192 | `(192 − 170) / 2 = 11 px` | `192 − 163 = 29 px` |
| Skitterer | 96 × 64 | `(96 − 73) / 2 = 11.5 px` | `64 − 28 = 36 px` |

The headroom exists for the arm and shield layers, which share the cell and may reach above the
crown. **The body must not use it.** The body's crown sits at exactly the drawn height above the
bottom edge and nothing on the body goes higher.

**Head size**, for proportion, = head radius in body radii × body radius × 86 × 2:

```
    Fighter    0.32 × 0.45 × 86 × 2 = 24.8  → 25 px across
    Rogue      0.28 × 0.35 × 86 × 2 = 16.9  → 17 px across
    Brute      0.30 × 0.70 × 86 × 2 = 36.1  → 36 px across
    Skitterer  0.22 × 0.30 × 86 × 2 = 11.4  → 11 px across
```

A Brute's head is *small for its body* and sits down in a notch between its shoulders — it has no
neck, and only the crown clears the shoulder line. A Rogue's is held clear on a neck under a
hood. A Skitterer carries its head out at the front end.

<sub>Provenance: radii from `crates/sim/src/entity.rs:101-108` (`Body::radius()`: Fighter
`45/100`, Rogue `35/100`, Brute `70/100`, Skitterer `30/100`). Height multipliers from
`web/main.js:8122-8127` (`BODY_H`). Head proportions from `web/main.js:8087-8092` (`HEADS`, `r` in
body radii). The `√2` from `web/main.js:2137` (`PROJ_ISO.ex = Math.SQRT2`) and the reason from
`web/main.js:8144-8148`. The three px results are confirmed by the source's own worked example at
`web/main.js:8110-8111`: "a Fighter is `0.45 * 3.0 * 86 = 116` px tall and `2 * 0.45 * 86 *
sqrt(2) = 109` px wide, a Brute 163 by 170".</sub>

### 8.4 Placement in the cell — the rule that everything hangs off

> **The figure's feet sit on the cell's bottom edge, horizontally centred, and its crown touches
> the drawn height above it. In every facing and every frame.**

The renderer plants the bottom-centre of the cell on a point on the floor and hangs the health
bar off the crown. So:

- a figure drawn a few pixels off centre **bobs sideways as it walks**;
- a figure floating above the bottom edge **hovers**;
- a figure whose crown falls short **has its health bar floating over nothing**.

All three are invisible in the file and glaring in the game, which is why a tool checks them:
every frame of one facing must have the **same bounding-box centre**, the content must sit on the
bottom edge, and the canvas must be the exact cell.

The **anchor** — the pixel of the image that lands on the floor point — is therefore derivable
rather than negotiated. It is the midpoint of the cell's bottom edge:

| archetype | anchor `[x, y]` |
|---|---|
| Fighter | `[64, 160]` |
| Rogue | `[56, 144]` |
| Brute | `[96, 192]` |
| Skitterer | `[48, 64]` |

### 8.5 The layers, and what pose each must be in

The body is a **composite**: legs, torso and head as **one drawing**. It is not assembled from
parts. Two layers hang off it separately because the renderer poses them from the fight:

| layer | delivered as | per archetype |
|---|---|---|
| `body` | one composite figure per facing per frame — **8 facings × 4 frames = 32 files** | all four |
| `arm` | one per facing — **8 files** — the main (weapon) arm | Fighter, Rogue, Brute |
| `shield` | one per facing — **8 files** — the off-hand guard | Fighter, Rogue |
| `head` | one per facing — **8 files** — the head end only | Skitterer only |

The Skitterer is a low, wide, many-legged thing that runs along the floor; it has no shoulder and
no shield, and its knife is projected straight from its head end. It ships `body` and `head`.

**The weapon is never one of these layers and is never a frame of the body.** It is its own
sprite, stretched between the hilt and tip the simulation is actually swinging. See § 9. **Draw
every body, and every arm, empty-handed.**

> ### The arm and the shield are drawn detached and neutral.
> Draw them in a straight, relaxed pose along the facing, as if the character were standing at
> ease. **The renderer rotates them to wherever the simulation is holding them** — a windup, a
> committed cut, a raised guard, a recovery. **An arm drawn mid-swing is an arm that will be
> rotated to a second, wrong mid-swing.**

**Where the pivots sit.** Both the arm and the shield pivot at the **shoulder**. Draw them on the
same cell as the body, with the shoulder joint on the pivot pixel, and **do not offset them
sideways** — the renderer applies the left/right shoulder offset itself from the facing, so the
pivot column is the cell's **centre column for every facing**. Offsetting in the image doubles
it.

The shoulder sits at `(height multiplier − head radius − head offset) × body radius` world units
above the feet:

```
    Fighter    (3.0 − 0.32 − 0.40) × 0.45 = 2.28 × 0.45 = 1.026 u × 86 =  88.2 →  88 px
    Rogue      (3.2 − 0.28 − 0.44) × 0.35 = 2.48 × 0.35 = 0.868 u × 86 =  74.6 →  75 px
    Brute      (2.7 − 0.30 − 0.22) × 0.70 = 2.18 × 0.70 = 1.526 u × 86 = 131.2 → 131 px
```

Converted to a pixel in the cell (`x = cell width / 2`, `y = cell height − shoulder height`):

| archetype | body anchor | arm / shield pivot | shoulder height above the feet |
|---|---|---|---|
| Fighter | `[64, 160]` | `[64, 72]` | 88 px — `160 − 88 = 72` |
| Rogue | `[56, 144]` | `[56, 69]` | 75 px — `144 − 75 = 69` |
| Brute | `[96, 192]` | `[96, 61]` | 131 px — `192 − 131 = 61` |
| Skitterer | `[48, 64]` | *(no arm or shield layer)* | — |

**Per-facing pose, per layer:**

- **`body`** — the whole figure, standing on its own feet, torso squared to the named facing,
  head looking along the facing. `s` shows the face and chest; `n` shows the back; `w` and `e`
  are pure profiles; the four diagonals are three-quarter views. Empty-handed. The stride frames
  differ only in the legs and the resulting weight shift — the head must not translate sideways
  between frames of one facing.

  **Detail level: `CONCEPT.png`'s figures, not a flat blob.** Its bodies are near-black overall
  with a warm rim on the lit side, and *inside* that they carry articulated plate with rivets and
  edge highlights, a visored helm, a cloak, a studded shield with a boss. Interior detail at that
  density is what is wanted. It must survive § 4's forty-pixel test as *texture* — the archetype
  and the facing have to be readable from the outline alone — but the interior is not empty and
  a figure delivered as a plain dark shape is under-drawn.
- **`arm`** — the main arm alone, from the shoulder, hanging relaxed and slightly forward along
  the facing, hand open and empty. Nothing raised, nothing cocked, nothing swinging. Foreshorten
  it for the facing: an arm at facing `n` or `s` is seen nearly end-on and is short and stubby; at
  `w` or `e` it is seen full length.
- **`shield`** — the shield alone, held on a relaxed off-arm at the character's side, face
  outward along the facing. Not raised into a guard. Foreshortened for the facing exactly as the
  arm is: seen face-on at `s`, edge-on at `w` and `e`. Its face spans about **39 px** (§ 9).
- **`head`** (Skitterer only) — the head end alone, on the pivot, oriented along the facing.

### 8.6 The proportions are not negotiable

> ### **The bodies are stocky because the sim's bodies are stocky**
> — a Brute is 1.4 world units across standing on a 1-unit tile — **and a Skitterer is *wider
> than it is tall*. These are not stylistic proportions to improve. Drawing a Brute at heroic
> proportions makes it narrower than its own collision circle, and the collision circle is drawn
> on the floor underneath it.**

Concretely: a Brute is **170 px wide and 163 px tall**. It is very slightly wider than it is
tall. A Skitterer is **73 px wide and 28 px tall** — two and a half times wider than tall, a low
scuttling thing with its legs splayed to the full half-width either side and its head carried
forward. A Fighter at 109 × 116 is close to square. Only the Rogue, at 85 × 96, is meaningfully
taller than it is wide.

If a figure you have drawn looks lanky, it is wrong. If it looks squat and heavy, it is right.

---

## 9. Weapons, by parameter

### The convention

**A weapon is drawn along `+x`: hilt at the left edge of the canvas, tip at the right edge.**
Horizontal, pointing right, tight-cropped so the hilt end touches the left edge and the tip
touches the right.

**Length is decided by the simulation and never by your canvas.** The renderer stretches the
sprite between the projected hilt — on the character's hand — and the projected tip — the end of
the blade the simulation is actually testing for a hit. The two ends of your image are the only
things that bind. What your image decides is **heft**: a weapon's drawn thickness has to read
against its mass.

Author each weapon at its **true length at 86 px/unit** anyway, so that you see it at its real
size and so that the stretch is close to 1:1 at full extension. That is the length column below.

### The roster

`reach` is blade length beyond the body surface at full extension, in world units. `mass` is with
a Fighter's whole body as the unit — a Club at 2.23 weighs more than twice an entire Fighter, and
that is the whole reason it is slow. `balance` is where the mass sits: `0` at the hilt, `1` at the
tip.

| weapon | reach | **length at 86 px/unit** | mass | balance | carried by |
|---|---|---|---|---|---|
| **Club** | 1.45 | **125 px** — `1.45 × 86 = 124.7` | 2.23 | 0.61 | Brute (main) |
| **Sword** | 0.95 | **82 px** — `0.95 × 86 = 81.7` | 1.24 | 0.55 | Fighter (main) |
| **Shortsword** | 0.55 | **47 px** — `0.55 × 86 = 47.3` | 0.86 | 0.50 | Rogue (main) |
| **Shield** | 0.45 | **39 px** — `0.45 × 86 = 38.7` | 0.90 | 0.35 | Fighter, Rogue (off-hand) |
| **Knife** | 0.40 | **34 px** — `0.40 × 86 = 34.4` | 1.25 | 0.75 | Skitterer (main) |
| **Bow** | 0.30 | **26 px** — `0.30 × 86 = 25.8` | 0.80 | 0.50 | reserved |
| **Punch** | 0.18 | **15 px** — `0.18 × 86 = 15.5` | 0.65 | 0.30 | Brute, Skitterer (off-hand) |

**Two rows are not weapon sprites.**

- The **Shield** is a guard, not a blade, and it ships as a character layer (`shield_{facing}.png`,
  § 8.5), not as a weapon sprite. Its `reach` of 0.45 units is how far the guard stands beyond
  the body surface, so draw its face about **39 px** across. It covers a wedge of ±62° in front
  of the character.
- The **Punch** is a fist. It is not drawn at all — the arm layer already has a hand on it.

The **Bow** row is reserved and not yet requested. Note that its 0.30 is the **draw**, not the
range: an arrow carries as far as its archer can see.

### Sizing a weapon against the others, and sizing a new one

**Length comes from the table. Thickness comes from mass. The Sword is the reference for
everything.**

Draw the Sword's blade at **about 10 px** at its widest, at 86 px/unit — roughly a hand's width
of steel. That 10 px is the one number in this document that is chosen rather than derived, and
it is set so the reference weapon reads correctly at default framing. Everything else scales from
it by mass:

```
    widest point  ≈  10 px × (mass ÷ 1.24)

    Club        10 × (2.23 ÷ 1.24) = 18 px, over 125 px of length  — a heavy two-handed thing
    Sword       10 × (1.24 ÷ 1.24) = 10 px, over  82 px            — the reference
    Knife       10 × (1.25 ÷ 1.24) = 10 px, over  34 px            — short and dense, a chunky dagger
    Shortsword  10 × (0.86 ÷ 1.24) =  7 px, over  47 px            — slim and light
    Bow         10 × (0.80 ÷ 1.24) =  6 px, over  26 px
```

**Put the visual bulk at `balance`.** A weapon's widest point sits that fraction of the way from
hilt to tip. A Knife at 0.75 is hafted well forward and carries its weight near the point — dense
for its size, which is what keeps a blade on a very short arm worth anything. A Sword at 0.55 is
nearly even. A Shortsword at 0.50 is hilt-heavy for its class. A Club at 0.61 is weight-forward
and long.

**A new item resolves by the same three rules with no further guidance needed:** length is
`reach × 86` px, thickness is `10 px × mass ÷ 1.24`, and the bulk sits at `balance` along it.

<sub>Provenance: `crates/sim/src/action.rs:333-494` (`ACTIONS`, one row per weapon: Punch
`length 18/100, mass 65/100, balance 30/100`; Knife `40/100, 125/100, 75/100`; Sword `95/100,
124/100, 55/100`; Club `145/100, 223/100, 61/100`; Shield `45/100, 90/100, 35/100, arc 11_264`
= ±61.9°; Bow `30/100, 80/100, 50/100`; Shortsword `55/100, 86/100, 50/100`).
Field meanings at `crates/sim/src/action.rs:275-285`. "Sword — the reference for everything" at
`crates/sim/src/action.rs:365`. Loadouts at `crates/sim/src/entity.rs:217-235`.</sub>

---

## 10. Naming

**Lower case. Underscores, never spaces or hyphens. A category or archetype directory. `.png`.**

```
web/assets/
  env/         floors, wall faces, decals, torches
  props/       barrels, crates, rubble
  weapons/     weapon sprites
  fighter/     Fighter body, arm and shield layers
  rogue/       Rogue body, arm and shield layers
  brute/       Brute body and arm layers
  skitterer/   Skitterer body and head layers
```

The four archetype directories are the archetype's own lower-case name and nothing else:
`fighter`, `rogue`, `brute`, `skitterer`.

**Examples, and they are the pattern rather than a sample:**

```
env/floor_a.png            env/wall_x.png          env/wall_top.png
env/door_x.png             env/door_top.png
env/moss_a.png             env/crack_a.png
env/torch_0.png            env/torch_1.png         env/torch_2.png
props/barrel.png           props/crate.png         props/rubble_a.png
weapons/sword.png          weapons/axe_heavy.png   weapons/knife.png
fighter/body_e_walk1.png   fighter/arm_e.png       fighter/shield_e.png
brute/body_nw_idle.png     brute/arm_nw.png
skitterer/body_s_walk2.png skitterer/head_s.png
```

**The character file patterns, spelled out.** Substituting the eight facings and the four frames:

```
    {archetype}/body_{facing}_{frame}.png     32 files per archetype
    {archetype}/arm_{facing}.png               8 files
    {archetype}/shield_{facing}.png            8 files
    skitterer/head_{facing}.png                8 files

    {facing} ∈ s, sw, w, nw, n, ne, e, se
    {frame}  ∈ idle, walk1, walk2, walk3
```

Variants of an environment asset are suffixed `_a`, `_b`, `_c`. Flicker frames of a torch or
lantern are suffixed `_0`, `_1`, `_2` and every frame is the same size.

A file at a path this scheme does not produce is a file the game cannot find. Nothing about the
naming is inferred, corrected or fuzzy-matched: it is compared literally.

---

## 11. The loop

1. **Read `FEEDBACK.md` after this file and before producing anything.** It is in this same
   directory. It carries the review of every batch so far: which assets passed, which must be
   regenerated, and exactly why. Address every open item before starting anything new.
2. **Never overwrite an asset marked `passed`.** Passed means locked. Regenerate it only if
   `FEEDBACK.md` explicitly asks for it by name.
3. **Two calibration gates come before mass production, and `FEEDBACK.md` holds them.**
   - *Stage 1 — the room.* One floor top face, one wall side-face and top-face pair, one torch.
     **Nothing else. No weapons, no figures.** This is everything the renderer shears onto a
     surface or plants upright on a ground point, and it locks style, scale, palette and geometry
     fit for everything that follows. Then stop and wait for review.
   - *Stage 2 — the body.* One archetype (the Fighter), complete: the composite body in all eight
     facings and all four frames, plus its arm and shield layers — and two or three weapons.
     Match stage 1's style exactly. Then stop and wait for review again.
   - *Production.* Only once `FEEDBACK.md` marks both gates passed. Reuse the exact settings that
     passed calibration and change only the subject.
4. **Deliver in coherent batches** — one archetype complete, one asset category complete — never
   scattered singles. Cross-asset consistency matters more than any single image, and a batch
   that mixes half of two categories leaves half of itself unreviewable.
5. **Self-check every image against this document before delivering**: canvas dimensions against
   § 3 and the category's row in § 7 or § 8; facings against § 8.1's compass; frames against
   § 8.2; feet on the bottom edge and centred, per § 8.4; light from the upper right, per § 5 and
   § 7; nothing skewed or sheared, per § 7's opening block; palette within the saturation rule;
   PNG format per § 6; clean transparency with no halo.
6. **Report spec gaps rather than guessing.** If this document does not tell you something you
   need, or tells you two things that conflict, **stop and say so**. A gap in this document is a
   bug in this document and it will be fixed here. An image produced by guessing is an image that
   has to be regenerated, and worse, one that may look fine on its own and be wrong in the room.
7. **Commit only PNG files, under `web/assets/`, at the paths § 10 gives.** No code, no
   `manifest.json`, no edit to this file, no edit to `FEEDBACK.md`.
8. **End every session with a short report**: what was produced, which sections of this document
   or which `FEEDBACK.md` items each batch addresses, and every gap or ambiguity you hit.

---

## Appendix — every number in one place

Scale: **86 px per world unit.** Global light: **upper right, warm.** Format: **PNG, RGBA, 8-bit,
non-interlaced.**

**Environment**

| asset | pixels | from |
|---|---|---|
| floor top face | 344 × 344 | `4 × 86` |
| wall side face | 86 × 138 | `1 × 86`, `1.6 × 86` |
| wall top face | 344 × 344 | `4 × 86` |
| decal | 86 × 86 … 172 × 172 | `1 × 86` … `2 × 86` |
| torch (× 3 frames) | ~77 px tall | `0.9 × 86` |
| barrel | ~69 px tall | `0.8 × 86` |

**Characters** — 8 facings `s, sw, w, nw, n, ne, e, se`; 4 body frames `idle, walk1, walk2,
walk3` looping `walk1, walk2, walk3, walk2`; feet on the cell's bottom edge, horizontally
centred; arms and shields detached and neutral.

| archetype | drawn w × h | cell | body anchor | arm / shield pivot | files |
|---|---|---|---|---|---|
| Fighter | 109 × 116 | 128 × 160 | `[64, 160]` | `[64, 72]` | 32 body + 8 arm + 8 shield |
| Rogue | 85 × 96 | 112 × 144 | `[56, 144]` | `[56, 69]` | 32 body + 8 arm + 8 shield |
| Brute | 170 × 163 | 192 × 192 | `[96, 192]` | `[96, 61]` | 32 body + 8 arm |
| Skitterer | 73 × 28 | 96 × 64 | `[48, 64]` | — | 32 body + 8 head |

**Weapons** — drawn along `+x`, hilt at the left edge, tip at the right.

| weapon | length | widest | bulk at |
|---|---|---|---|
| Club | 125 px | 18 px | 0.61 |
| Sword | 82 px | 10 px | 0.55 |
| Shortsword | 47 px | 7 px | 0.50 |
| Knife | 34 px | 10 px | 0.75 |
| Bow | 26 px | 6 px | 0.50 |
| Shield (a character layer, not a weapon sprite) | ~39 px across | — | — |
