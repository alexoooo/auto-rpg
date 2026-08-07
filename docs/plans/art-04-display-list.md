# art-04 — extract, then draw

**Goal:** one seam through the renderer. A pass that walks the snapshot and the event feed and
**emits** a flat list of draw items, and a backend that **consumes** it and is the only code that
touches a canvas context per frame. Canvas2D is the backend; the seam is what makes a second one
a contained swap instead of a rewrite threaded through everything that knows what a unit is.

**Leaves the game:** byte-identical, in all three views. Nothing new is drawn, nothing moves, no
constant changes. This is the second inert session in the series and its gate is as strict as
`art-03`'s for the same reason.

**Depends on:** nothing structural. It is ordered **here**, before the rig, because `art-05` adds
seven fallback layers and four image layers per body and is the largest new emitter in the
series. Written against `ctx` and converted afterwards, it is exactly the retrofit this session
exists to prevent — and the same is true of `art-07`'s patterns, props and decals and `art-09`'s
two particle pools.

**Unblocks:** every session after it, and one option: a WebGL2 backend becomes a file rather than
a project. **This session does not write that file** — see §8.

---

## 1. The seam, stated as one testable rule

> **No per-frame `ctx` call lives outside `web/draw.js`.**

Everything that knows what a unit, a tile, an event or a phase is **emits**. Everything that knows
what a canvas is **consumes**. Nothing does both, and the split test when a function is ambiguous
is: *does it read a field off a snapshot row?* If yes it is extract, and it may not paint.

`web/draw.js` is a new classic script loaded **before** `main.js`, alongside `web/rig.js` from
`art-05`. It holds the item kinds, the pool, the emit API and the Canvas2D backend. `main.js`
keeps every extract pass it has today — `drawLevel`, `drawCharacter`, `drawLimb`, `consumeEvents`
and the rest keep their names and their logic and stop painting.

**Three exemptions, and they are exemptions on principle rather than convenience:** the offscreen
**bakes** — `bakeFloorTile` (`main.js:4911`), `arenaVignette` (`main.js:5807`) and the grain tile
`art-07` adds — run once per zoom bucket, not per frame, and what they produce is a *paint
source*, not a drawing. They keep their own contexts and are named in `draw.js`'s doc comment so
the grep that checks the rule has a written whitelist rather than a judgement call.

`node --check web/draw.js` joins the tripwire list.

## 2. An item is a row in a typed array, not an object

The render path allocates nothing once the page is running — that is the parse pool's argument at
`main.js:786-796` and it is not weakened for this. So the list is **parallel typed arrays with a
write cursor**, reset to zero at the top of each frame:

```js
/** The frame's draw list. Fixed capacity, written in place, never reallocated.
 *  Parallel arrays rather than objects: no per-frame allocation, and the layout
 *  is already what an instanced backend wants to upload. */
const dlKind = new Int32Array(CAP);      // the backend's switch
const dlLayer = new Int32Array(CAP);     // GROUND | DEPTH | OVERLAY
const dlPaint = new Int32Array(CAP);     // index into the paint table, §3
const dlTint = new Uint32Array(CAP);     // packed rgba
const dlFlags = new Int32Array(CAP);     // additive, ground-space, ...
const dlF = new Float32Array(CAP * 8);   // depth, x, y, w, h, rot, alpha, spare
```

Three properties of that shape are load-bearing:

- **`x` and `y` are screen space. The projection happens in extract and never in the backend.**
  `art-00` §2 is the standing trap in this codebase: `PROJ.upright` is the bit, `groundSpace` is
  the shear, and a backend that projects is a backend that has to be taught the difference. A
  backend that consumes screen coordinates cannot get it wrong, which removes the single easiest
  mistake in the file from half the code that could make it. `groundSpace`'s fourteen-entry
  register (`main.js:4522-4538`) stays where it is and stays an *extract*-side register.
- **`dlPaint` is an index, not an object.** §3.
- **There is no `shadowBlur` field**, so the ban `art-00` §3 states becomes structural rather than
  a rule somebody has to remember.

`CAP` is fixed and generous, and an emit past it is dropped with one warning per frame rather than
growing the arrays. A renderer that silently reallocates under load is a renderer with a sawtooth
in its worst-frame column.

## 3. The paint table is what makes a second backend possible

`dlPaint` indexes a small table of paint sources built outside the frame: `HTMLImageElement`s from
`art-06`'s loader, `Path2D`s from `art-05`'s rig and `UPRIGHTS`, `CanvasPattern`s from
`floorPatternNow` (`main.js:4998`), the module-scope gradients `wedgeFans` already builds
(`main.js:6868-6886`), and the baked tiles from §1's exemptions.

**This indirection is the whole of the insurance.** A Canvas2D backend maps index → `Path2D` or
`CanvasPattern`; a WebGL2 backend maps the same index → a texture id or a tessellated mesh. The
extract passes reference paint by index and know nothing about either. Without the table, every
`ctx.fill(somePath2D)` in the list is a Canvas2D-shaped hole in a supposedly backend-neutral
vocabulary, and the swap is a rewrite again.

## 4. The vocabulary is small enough to enumerate, and that is the bet

| kind | what it draws | notes |
|---|---|---|
| `RECT` | `fillRect` | bars, HUD plates |
| `ELLIPSE` | a circle on the floor, which the shear makes an axis-aligned ellipse twice as wide as tall | shadows, collision rings, vision discs, `art-09`'s stains |
| `PATH_FILL` | a `Path2D` from the table, filled | rig segments, silhouettes, corpses, wedges |
| `PATH_STROKE` | the scarce one — §5 | rings, telegraphs, the hero outline |
| `SPRITE` | an axis-aligned blit | `art-07`'s props, torches, decals; `art-08`'s bodies |
| `SPRITE_SPAN` | a blit stretched and rotated between two screen points | weapons, on `art-05` §4's hilt-and-tip line |
| `PATTERN` | a pattern fill with its own matrix, through the current clip | floors, wall faces |
| `LIGHT` | an additive radial gradient | `drawTorchLight` (`main.js:6355`), `drawLantern` (`main.js:6438`) |
| `TEXT` | one string | floaters, callouts |
| `CLIP_PUSH` / `CLIP_POP` | the fog's two passes | below |

**The clip is an item, and that is the entry people leave out.** `drawLevel`'s two-pass structure
— lit inside `floorLit`, remembered at `SEEN_ALPHA = 0.4` — is a clip, and the clip is *state*
rather than a mark. Emitting it into the list keeps the backend a straight walk with no
out-of-band state, and keeps the fog's authority (`art-00` §6) an extract-side decision where it
belongs. A backend that had to be told separately where the clips go is a backend that can be
told wrong.

If a later session needs an eleventh kind, that is a real design event and it gets stated in that
session's file rather than added quietly. Ten is the claim; growing it is allowed and hiding it is
not.

## 5. What the seam pays for itself with, before any backend swap

Four returns that land in this session and do not depend on WebGL2 ever happening. This matters:
insurance nobody collects on should still be worth its premium.

1. **The stroke discipline becomes countable.** `DESIGN.md`'s measurement is that killing
   `stroke` alone recovered 43 fps while every other primitive was collectively free. After this
   session `PATH_STROKE` is the only kind that strokes, so "how many strokes is this frame" is a
   count over one array rather than an audit, and `arcDash`/`pathDash`'s `MAX_DASH_SEGMENTS = 96`
   cap (`main.js:7074`, `7099`) is enforced in one place on the way in.
2. **`art-05`'s `layerDraws` counter is free** — it is the list length by kind, and so is the
   answer to "is a half-integrated body drawing both arms of the composite/segments `if`", which
   `art-08` §4 needs and would otherwise have to instrument by hand. `floorBakes`
   (`main.js:4869`) gets a shelf of siblings rather than a one-off.
3. **A frame becomes dumpable.** One dev-mode key writes the list to the console as text: every
   item, its kind, its layer, its depth, its paint. That is the debugging instrument this file
   does not have, and it is what turns "the barrel is drawn under the wall" from a bisect into a
   read.
4. **`?noart=1` becomes a filter rather than a branch.** `art-06`'s review instrument is currently
   an `if` at every sprite site; over a list it is a predicate applied once, which means it cannot
   drift out of sync with the sites it is supposed to be A/B-ing.

## 6. The depth layer already is a display list, and saying so is the safety argument

`pushItem` and its `ITEM_BODY` / `ITEM_CORPSE` / `ITEM_SHOT` kinds (`main.js:8932`) are a flat
list of drawables with a sort key, merged against the lit wall bands. **This session generalizes a
mechanism that exists and has been correct through the whole isometric conversion; it does not
invent one.**

So the three layers keep exactly their current semantics:

- **ground** — emitted in painter order, `depth` unused, inside the floor passes' clips;
- **depth** — emitted with a key, and the merge walk against the wall bands is unchanged, still
  sorting indices rather than records, still an insertion sort over a module-scope scratch array;
- **overlay** — screen space, painter order, after everything.

The three bodies of `ITEM_*` painting code move into `draw.js` as three `kind`s among the ten.
Nothing about the ordering, the key, or the merge changes — and if the merge is touched at all in
this session, that is the bug.

## 7. Land it in three commits, each byte-identical

This is the largest inert refactor in the series and it must not arrive as one commit:

1. **Depth layer.** Generalize `pushItem` into the emit API; move body, corpse and shot painting
   into the backend. Smallest blast radius, and it is the layer that already has the shape.
2. **Ground layer.** Floor passes, patterns, clips, lights, vignette, lantern, rings, discs,
   portal, trail, route. This one carries `CLIP_PUSH`/`CLIP_POP` and is the risky commit.
3. **Overlay.** Bars, floaters, callouts, the hero outline pass.

Each commit is byte-identical on its own, so a regression bisects to a layer instead of to a
five-thousand-line diff.

**The gate is byte-identical and it is checkable rather than eyeballed**: pause the sim at a fixed
tick from a fixed seed, `canvas.toDataURL()`, and diff the string before and after. Same machine,
same browser, same session — this is a session instrument, not a golden, and it does not go in
`tools/`. Do it in all three views. `[tactical]` and `[dev]` must come out identical for the
usual reason, and **so must `[regular]`**, which is what makes this session different from every
other one in the series.

## 8. No WebGL2 backend in this session, and the reason is not scope discipline

Not a line of it. The insurance is the seam; a second backend written now would be written against
a vocabulary that no real art has exercised yet — no sprites, no patterns on wall faces, no
particle pools — and it would fix that vocabulary at exactly the moment it is least informed.
`art-07` §6 already says when to stop and report rather than reach for WebGL2, and that stays
true. The correct time to consider a second backend is after `art-09`, when the ten kinds have
either held or grown, and it is a decision with its own file.

---

## Acceptance test

1. **All three views are byte-identical** at a fixed tick from a fixed seed, before and after,
   by `toDataURL` diff — and at each of the three commits, not only at the end.
2. `grep -n 'ctx\.' web/*.js` hits `web/draw.js` and the three named bake functions, and nothing
   else.
3. The frame dump lists every item of a full room and its counts by kind are stable frame to
   frame with the sim paused.
4. Stroke count for a full room is reported and matches a hand count of what should be stroking.
5. Emitting past `CAP` drops items, warns once, and does not reallocate or throw.
6. No allocation in the render path: profile a minute of play and the sawtooth is no worse than
   the recorded baseline.
7. **No frame-rate movement against a repeated baseline**, at 8 bodies and at a full room, with
   the method `DESIGN.md` states. A pure refactor that costs frames is a refactor that put work
   in the wrong place.
8. Fog still has authority: never-seen is black, remembered draws at `SEEN_ALPHA` with no dynamic
   light, and a torch reveals nothing vision has not.
9. The console is clean at boot, `assertProjection` included.

## Tripwires

All five, plus `node --check web/draw.js` and the §1 grep. No Rust changed.

## Explicitly not in this session

- A WebGL2 backend, an atlas, texture packing, or a batching pass. §8.
- Any new drawing, any new constant, any palette change, any reordering of the merge walk.
- Moving the projection, `groundSpace`, or the bakes.
- Retiring `drawCharacter`'s single-function structure. The comment at `main.js:7761-7774` argues
  for keeping every branch in one function and it still holds; what leaves that function is the
  painting, not the branching.

## The standing rule this session creates

Every session after this one emits. **A new `ctx` call site outside `web/draw.js` is a review
failure, not a style note** — it is one more thing a second backend would have to be threaded
through, which is the entire cost this session was paid to remove. Later session files do not
repeat this; it is stated once, here, and in `art-00`'s house rules.
