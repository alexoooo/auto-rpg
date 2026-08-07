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

**Four exemptions, and they are exemptions on principle rather than convenience** (D5, amended
during commit 1 — this list said three and named the wrong three):

- the offscreen **bakes** — `bakeFloorTile` (`main.js:5142`), `arenaVignette` (`main.js:6165`)
  and `bakeGrainTile` (`main.js:5312`) — run once per zoom bucket or once ever, not per frame,
  and what they produce is a *paint source*, not a drawing;
- **`drawGlobe`** (`main.js:10221`, ~46 calls a frame on `globeCtx`). It is a HUD widget with
  **its own canvas element** (`#globe`), its own throttle (`GLOBE_MS`) and its own lifecycle. A
  display list keyed to one backend context does not describe a second canvas, and pretending it
  does would buy nothing and cost the globe its independence. Exempt **by name**, not by
  accident: the standing rule at the bottom of this file says a new `ctx` call site outside
  `draw.js` is a review failure, and this is 46 of them that already exist.

The grain tile is **present tense, not future**: `art-01` shipped `GRAIN_TILE`, `bakeGrainTile`
and `drawGrain`. This file used to say "the grain tile `art-07` adds". `drawGrain` itself is a
per-frame overlay painter and is **not** exempt; it emits like everything else in commit 3.

`resize`'s `ctx.setTransform` (`main.js:2411`) is per *resize*, not per frame, and is outside the
rule rather than exempt from it — but it is written down here because it trips the grep.

`node --check web/draw.js` joins the tripwire list.

## 2. An item is a row in a typed array, not an object

The render path allocates nothing once the page is running — that is the parse pool's argument at
`main.js:812-823` and it is not weakened for this. So the list is **parallel typed arrays with a
write cursor**, reset to zero at the top of each frame:

```js
/** The frame's draw list. Fixed capacity, written in place, never reallocated.
 *  Parallel arrays rather than objects: no per-frame allocation, and the layout
 *  is already what an instanced backend wants to upload. */
const dlKind = new Int32Array(CAP);      // the backend's switch
const dlLayer = new Int32Array(CAP);     // GROUND | DEPTH | OVERLAY
const dlShape = new Int32Array(CAP);     // index into the paint table, §3 -- the Path2D/image
const dlInk = new Int32Array(CAP);       // index into the paint table, §3 -- the gradient/pattern
const dlStyle = new Array(CAP);          // D2: the colour, as the CSS string the page builds
const dlFlags = new Int32Array(CAP);     // fill, stroke, sector, ccw, dashed, local width, ...
const dlF = new Float64Array(CAP * 14);  // depth, alpha, six geometry, rot, scale, width, n, dash x2
```

Three properties of that shape are load-bearing:

- **`x` and `y` are screen space. The projection happens in extract and never in the backend.**
  `art-00` §2 is the standing trap in this codebase: `PROJ.upright` is the bit, `groundSpace` is
  the shear, and a backend that projects is a backend that has to be taught the difference. A
  backend that consumes screen coordinates cannot get it wrong, which removes the single easiest
  mistake in the file from half the code that could make it. `groundSpace`'s fourteen-entry
  register (`main.js:4753-4769`) stays where it is and stays an *extract*-side register.

  **That claim is weakened by `XFORM_PUSH` and here is exactly how** (D1). Extract still projects
  every *point*: no backend ever sees a world coordinate, and every `x`, `y` and radius in the
  list is in screen pixels. What a backend now also has to do is **apply a matrix that arrived in
  the list**. A shape drawn inside `groundSpace` is a shape in a *sheared* space, and the shear is
  not expressible as anything the item's own fields could carry — so it arrives as its own item
  and the backend concatenates it. The mistake the original claim removed is still removed (a
  backend cannot choose the wrong projection, because it never sees one); the mistake that is now
  possible is a backend that ignores or mis-orders the matrix items, which is a different and
  much louder failure. It is an honest cost of the shear and it is recorded here rather than
  glossed.
- **`dlShape` and `dlInk` are indices, not objects.** §3. `dlStyle` is the one exception and D2
  in §3 is the argument for it.
- **There is no `shadowBlur` field**, so the ban `art-00` §3 states becomes structural rather than
  a rule somebody has to remember.
- **`dlF` is `Float64Array` and not `Float32Array`.** The gate is `toDataURL` string equality and
  every coordinate in this file is computed in doubles today; rounding them to `f32` on the way
  into the list is a change to the numbers the rasteriser receives, made for no reason, in the
  one session that cannot afford one. An instanced backend that wants `f32` can narrow on upload,
  which is where the narrowing belongs.

`CAP` is fixed and generous, and an emit past it is dropped with one warning per frame rather than
growing the arrays. A renderer that silently reallocates under load is a renderer with a sawtooth
in its worst-frame column.

## 3. The paint table is what makes a second backend possible

`dlShape` and `dlInk` index a small table of paint sources: `HTMLImageElement`s from `art-06`'s
loader, `Path2D`s from `art-05`'s rig and `UPRIGHTS`, `CanvasPattern`s from `floorPatternNow`
(`main.js:5250`), the per-body and per-frame gradients, and the baked tiles from §1's exemptions.

**This indirection is the whole of the insurance.** A Canvas2D backend maps index → `Path2D` or
`CanvasPattern`; a WebGL2 backend maps the same index → a texture id or a tessellated mesh. The
extract passes reference paint by index and know nothing about either. Without the table, every
`ctx.fill(somePath2D)` in the list is a Canvas2D-shaped hole in a supposedly backend-neutral
vocabulary, and the swap is a rewrite again.

### D2 — a colour is a string reference, not a packed `Uint32`

This file used to say `dlTint` was "packed rgba". **It cannot be, and the reason is the gate.**

27 code sites build their style with `toFixed(3)`, 22 of them inside per-frame painters. And
`wedgeFans` (`main.js:7453-7455`) **builds strings, not gradients** — this file said "the
module-scope gradients `wedgeFans` already builds" and that was simply wrong:

```js
function wedgeFans(rgb) {
  return [0, 0.5, 1].map((fan) => `rgba(${rgb},${(0.08 + 0.20 * fan).toFixed(3)})`);
}
```

Its own comment declares the exact characters `0.080` / `0.180` / `0.280` load-bearing for
`[tactical]`'s byte-identity. `0.080 × 255 = 20.4`, so an 8-bit alpha channel cannot round-trip
it and the picture moves the moment it tries. So the colour travels as **`dlStyle[i]`, a reference
to the very string the page already built**. Assigning a reference into a preallocated array
allocates nothing beyond that string, and the string is one the code builds today either way — so
this costs the no-allocation rule exactly nothing.

A backend that wants floats parses the string once and caches; that is a backend's problem and it
has full precision to work from, which a `Uint32` would already have thrown away.

### D3 — the table has a static region and a per-frame region, and that is a finding

This section used to say paint sources are "built outside the frame". **Six gradients are built
per frame today** and one table entry is *mutated* per frame:

| site | what | cadence |
|---|---|---|
| `drawCharacter:8530` | body gradient, flat arm | per body per frame |
| `drawCharacter:8549` | body gradient, billboard arm | per body per frame |
| `drawCharacter:8673`, `8745` | the rim light | per body per frame |
| `drawLantern:6989` | the lantern | per frame |
| `drawPortal:7051` | the portal glow | per frame |
| `floorPatternNow:5266` | `floorPattern.setTransform(PATTERN_M)` | per frame, mutating a cached `CanvasPattern` |

**This session does not fix that**, deliberately. Hoisting a per-body gradient is a change to what
is allocated and, because `drawCharacter:8549` is built *after* `ctx.scale` in the space it paints
in, potentially a change to what is drawn — inside the one session whose gate is that nothing
changes. So the table simply grows a **per-frame region**, reset with the write cursor, and the
static region keeps the things that really are built once. The fix is a later session's, with its
own before/after; it is written down here so it is a decision rather than a hole.

## 4. The vocabulary is small enough to enumerate, and that is the bet

| kind | what it draws | notes |
|---|---|---|
| `RECT` | `fillRect` | bars, HUD plates |
| `ELLIPSE` | a circle on the floor, which the shear makes an axis-aligned ellipse twice as wide as tall — **filled, stroked, or both** | shadows, collision rings, vision discs, `art-09`'s stains |
| `PATH_FILL` | a `Path2D` from the table, filled | rig segments, silhouettes, corpses, wedges |
| `PATH_STROKE` | the scarce one — §5 | rings, telegraphs, the hero outline |
| `POLY_STROKE` | **new** — a stroked polyline out of a scratch point buffer | segments, chevrons, the route, the crosshair |
| `ARC` | **new** — a partial arc, or a pie sector when closed to its centre | guard arcs, swing smears, the bow, the facing wedge |
| `ROUND_RECT` | **new** — four `arcTo`s, filled and/or stroked | the health plate, the callout pill |
| `SPRITE` | an axis-aligned blit | `art-07`'s props, torches, decals; `art-08`'s bodies |
| `SPRITE_SPAN` | a blit stretched and rotated between two screen points | weapons, on `art-05` §4's hilt-and-tip line |
| `PATTERN` | a pattern fill with its own matrix, through the current clip | floors, wall faces |
| `LIGHT` | an additive radial gradient | `drawTorchLight` (`main.js:6900`), `drawLantern` (`main.js:6983`) |
| `TEXT` | one string | floaters, callouts |
| `CLIP_PUSH` / `CLIP_POP` | the fog's two passes | below |
| `XFORM_PUSH` / `XFORM_POP` | **new** — a matrix, a rotation and a scale, pushed as state | `groundSpace`, the billboard, the unit-radius space |

**The clip is an item, and that is the entry people leave out.** `drawLevel`'s two-pass structure
— lit inside `floorLit`, remembered at `SEEN_ALPHA = 0.4` — is a clip, and the clip is *state*
rather than a mark. Emitting it into the list keeps the backend a straight walk with no
out-of-band state, and keeps the fog's authority (`art-00` §6) an extract-side decision where it
belongs. A backend that had to be told separately where the clips go is a backend that can be
told wrong.

### The vocabulary grew from ten to fourteen, and here is the argument for each of the four

This file said: *"If a later session needs an eleventh kind, that is a real design event and it
gets stated in that session's file rather than added quietly."* The reconnaissance for commit 1
found **eleven call-site classes that fit none of the ten**, and four kinds cover all eleven. So:
stated, here, before a line of it was written.

**`XFORM_PUSH` / `XFORM_POP` is the important one, and it is the one that changes what §2 claims.**

`groundSpace` (`main.js:4786`) is `ctx.translate` plus `ctx.transform(PROJ.ax, PROJ.ay, PROJ.bx,
PROJ.by, 0, 0)` — a **CTM**, not a point transform, and byte-identity depends on what that CTM
does to things drawn *inside* it rather than on where it puts a point:

- **stroke widths go anisotropic with bearing.** `drawVision` and `drawReach` are 1.2 px lines
  that come out 0.9 to 1.4 px depending on which way the arc is running, and `groundSpace`'s own
  doc comment says that is the point — *"a ring that traces something the sim can measure goes
  through the shear and wears the anisotropy, because being the right shape matters more."*
- **dash patterns keep their measured mark counts**, because dashing happens in user space and is
  transformed afterwards. `drawReach`'s comment (`main.js:7731-7737`) states the consequence in
  terms: converting it to an explicit ellipse *"would have changed that number silently, which is
  exactly the bug class that cost the page 40 fps."*

shear ∘ rotate(θ) is not rotate(θ') ∘ scale, so the `rot` / `w` / `h` fields §2 first proposed
cannot express it, and the transforms **nest up to three deep** — `groundSpace`, then
`rotate(limbAngle)`, then `scale(r, r)`. So the matrix is carried whole: `a, b, c, d, e, f` in
`dlF`, with `XFORM_POP` ending it.

**§4's own argument for `CLIP_PUSH` is the argument here, verbatim.** *"The clip is state rather
than a mark. Emitting it into the list keeps the backend a straight walk with no out-of-band
state."* A matrix is state in exactly the same way. And it **composes to any depth**, which the
alternative — a `dlFlags` bit meaning "apply the shear about this item's own origin" — does not:
the flag reproduces one level and has nothing to say about the second and third.

Two details the implementer does not get to choose:

- **The rotation is not folded into the matrix.** `ctx.rotate` is not `ctx.transform(cos, sin,
  -sin, cos, 0, 0)` computed in JS: Blink converts the angle to degrees, Skia converts it back and
  takes `sinf`/`cosf` at single precision, and V8's `Math.sin` is a different implementation
  again. So `XFORM_PUSH` carries the *angle* and the backend calls `ctx.rotate`. Same for the
  uniform scale, which is applied after the rotation because that is the order the call sites use.
- **A `XF_BARE` flag, for the sites that compose their own inverse.** `drawLimb` has four
  `rotate(θ)` … `rotate(-θ)` pairs and `drawCharacter`'s ground wedge has a fifth. Replacing those
  with save/restore would be *more* exact than the code it replaces — `M · R(θ) · R(-θ)` is only
  approximately `M` in single precision — and this session's gate is identity with what the file
  does today, not with what it meant. So `XF_BARE` means "concatenate without saving; the extract
  site emits its own inverse", and it is the one place in the backend where a push has no pop.

**`POLY_STROKE`** — `PATH_STROKE` as specified is "a `Path2D` from the table", and that covers
**8 of the file's 38 strokes**. The other 30 stroke a current path built this frame out of
per-frame numbers: 2-point segments, 3-point chevrons, `drawRoute`'s N-point dashed polyline, and
`drawDestination`'s four disjoint segments stroked as **one** path — which four `POLY_STROKE`
items would turn into four strokes, and §5.1 makes stroke count the metric. There is no `Path2D`
for any of them without allocating one per frame, which §2 forbids. The points come from a
module-scope scratch `Float64Array` and an item carries an offset and a count.

**`ARC`** — `ELLIPSE` is a full circle. 8 sites are partial arcs or pie sectors whose start and
end angles are computed per frame, one of them (`drawLimb:7886`) with a direction flag:
`arc(0, 0, R, 0, sweep, sweep > 0)`. A sector is the same item closed back to its centre.

**`ROUND_RECT`** — `roundRect` (`main.js:4792`) is four `arcTo`s and `arcTo` appears nowhere else
in the file. `drawHealth` fills it; `drawCallouts` fills **and** strokes it. It is not a `RECT`,
and it cannot be a table `Path2D` because its width comes from `measureText`.

And two widenings of kinds that already existed:

- **`ELLIPSE` strokes as well as fills.** Seven `drawCharacter` sites stroke a current path that
  was an `arc` — the collision ring, the body circle, the head, the ghost's disc.
- **`PATH_STROKE` and `POLY_STROKE` carry a "width is in local units" flag.** Nine `ctx.scale`
  sites put paths into a space where `lineWidth` is quoted in radii — `0.11`, `1 / r`, `0.09`,
  `0.07`, `0.20 + 0.20 * heat` — and a backend that assumes screen pixels draws a body wearing a
  four-radius outline.

Fourteen is now the claim. Growing it is still allowed and hiding it is still not.

## 5. What the seam pays for itself with, before any backend swap

Four returns that land in this session and do not depend on WebGL2 ever happening. This matters:
insurance nobody collects on should still be worth its premium.

1. **The stroke discipline becomes countable.** `DESIGN.md`'s measurement is that killing
   `stroke` alone recovered 43 fps while every other primitive was collectively free. After this
   session `PATH_STROKE` is the only kind that strokes, so "how many strokes is this frame" is a
   count over one array rather than an audit, and `arcDash`/`pathDash`'s `MAX_DASH_SEGMENTS = 96`
   cap (`main.js:7693`, `7718`) is enforced in one place on the way in.
2. **`art-05`'s `layerDraws` counter is free** — it is the list length by kind, and so is the
   answer to "is a half-integrated body drawing both arms of the composite/segments `if`", which
   `art-08` §4 needs and would otherwise have to instrument by hand. `floorBakes`
   (`main.js:5104`) gets a shelf of siblings rather than a one-off.
3. **A frame becomes dumpable.** One dev-mode key writes the list to the console as text: every
   item, its kind, its layer, its depth, its paint. That is the debugging instrument this file
   does not have, and it is what turns "the barrel is drawn under the wall" from a bisect into a
   read.
4. **`?noart=1` becomes a filter rather than a branch.** `art-06`'s review instrument is currently
   an `if` at every sprite site; over a list it is a predicate applied once, which means it cannot
   drift out of sync with the sites it is supposed to be A/B-ing.

## 6. The depth layer already is a display list, and saying so is the safety argument

`pushItem` and its `ITEM_BODY` / `ITEM_CORPSE` / `ITEM_SHOT` kinds (`main.js:9638`) are a flat
list of drawables with a sort key, merged against the lit wall bands. **This session generalizes a
mechanism that exists and has been correct through the whole isometric conversion; it does not
invent one.**

So the three layers keep exactly their current semantics:

- **ground** — emitted in painter order, `depth` unused, inside the floor passes' clips;
- **depth** — emitted with a key, and the merge walk against the wall bands is unchanged, still
  sorting indices rather than records, still an insertion sort over a module-scope scratch array;
- **overlay** — screen space, painter order, after everything.

The three bodies of `ITEM_*` painting code move into `draw.js` as items of the kinds §4 lists.
Nothing about the ordering, the key, or the merge changes — and if the merge is touched at all in
this session, that is the bug.

**`fillBand` moves too, and that is not touching the merge.** Its seven fills are painting and
they emit like everything else; the walk they are called from — the band cursor, the
`(band + 2) * tile <= it.depth` comparison, the flush after the last item — is untouched, line
for line.

## 7. Land it in three commits, each byte-identical

This is the largest inert refactor in the series and it must not arrive as one commit:

1. **Depth layer.** Generalize `pushItem` into the emit API; move body, corpse and shot painting
   into the backend. Smallest blast radius, and it is the layer that already has the shape.
   **Landed.** 240 of `main.js`'s 556 context calls moved (556 → 316, plus 33 in `draw.js`);
   `fillBand`, `drawCharacter`, `drawLimb`, `drawMarks`, `drawSprint`, `drawShot` and
   `drawCorpse` emit, the merge walk is line for line what it was, and all twelve captures of
   the gate below came out byte-identical.
2. **Ground layer.** Floor passes, patterns, clips, lights, vignette, lantern, rings, discs,
   portal, trail, route. This one carries `CLIP_PUSH`/`CLIP_POP` and is the risky commit. It also
   takes the ground half of `groundSpace`: commit 1 left a `pushGroundSpace` twin beside the
   `ctx` one, eight sites on the new and six on the old, and commit 2 retires the old. It is also
   what lets `render`'s top-down arm go back to one list -- there are two today only because
   `drawReach` still paints between the corpses and the bodies and that ordering may not move.
3. **Overlay.** Bars, floaters, callouts, the hero outline pass, `drawGrain`. `ROUND_RECT`,
   `TEXT`, `RECT` and D4's `measureTextWidth` are this commit's; nothing before it needs them.

Each commit is byte-identical on its own, so a regression bisects to a layer instead of to a
five-thousand-line diff.

**The gate is byte-identical and it is checkable rather than eyeballed**: pause the sim at a fixed
tick from a fixed seed, `canvas.toDataURL()`, and diff the string before and after. Same machine,
same browser, same session — this is a session instrument, not a golden, and it does not go in
`tools/`. Do it in all three views. `[tactical]` and `[dev]` must come out identical for the
usual reason, and **so must `[world]`**, which is what makes this session different from every
other one in the series.

### D6 — the gate as written above is unrunnable, and needs one more instrument

**Pausing freezes the tick. It does not freeze `now`.** Seven painters animate on the wall clock
and keep animating while paused — the portal's two counter-spinning arcs, the torch flicker,
`drawReach`'s beat, `drawLock`/`drawDestination`'s beat, `drawRoute`'s dash offset, `drawTrail`
and `drawSprint`'s chevrons. Two `toDataURL()` strings taken a frame apart on a paused room differ,
so the diff above can never come out clean and the whole gate is unrunnable as stated.

So the session adds **`freezeRenderClock(at)`** (`main.js`, beside `render`): a settable override
on the `now` the painters are handed, `null` and inert by default, set from the console. One
comparison a frame on a value the loop already has. It is a **session instrument, not a golden**,
and like the `toDataURL` diff itself it does not go in `tools/`.

With it, the whole capture is a pure function of a frame index. The recipe that was actually used
for commit 1, and that later commits should reuse: `restart()` for the constant `SEED`, then drive
`loop(i * 16)` by hand from `t = 0` so the tick count at frame `i` depends on `i` alone, then
`setPaused(true)` and `snapCamera(curr)` so no easing history survives into the capture —
`viewOrigin`'s quarter-device-pixel snap makes the origin exact once the ease is gone. Verified
reproducible twice in one page and once across a full reload before anything was changed.

### D4 — `measureText` lives in `draw.js`, and extract calls it

`drawCallouts` (`main.js:9566`) reads a metric back off the context at *extract* time: the pill's
width, its plate, its icon position and its text position all derive from
`ctx.measureText(label).width`. §1's split test does not resolve it — the function reads a
snapshot row *and* needs a context.

`draw.js` exposes **`measureTextWidth(font, str)`**, and extract calls it. The seam still holds,
and saying why is the point: `draw.js` is the only code that touches a context, and **a
measurement is not a paint**. The alternative — a `TEXT` item with an "auto-size the plate around
me" flag — moves layout into the backend, which is the one thing the backend is not supposed to
know. Commit 3's business; nothing in commits 1 or 2 needs it.

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
   by `toDataURL` diff — and at each of the three commits, not only at the end. **With the wall
   clock frozen** (D6), or it cannot pass at all.
2. `grep -nE '\b(ctx|g|globeCtx)\.[a-zA-Z]' web/*.js` hits `web/draw.js`, the three named bakes,
   `drawGlobe` and `resize`, and nothing else.

   **The grep this file used to ask for — `grep -n 'ctx\.' web/*.js` — is broken** (D5). It
   misses all 46 `drawGlobe` sites and all 12 bake sites, because those write `g.` and
   `globeCtx.` rather than `ctx.`. As written it is satisfiable while a second per-frame painter
   with 46 context calls sits in `main.js`, which is exactly the thing the rule exists to catch.
   The whitelist above is also written into `draw.js`'s doc comment, so the check has a written
   list rather than a judgement call.
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

All five, plus `node --check web/draw.js` and the §1 grep — which is
`grep -nE '\b(ctx|g|globeCtx)\.[a-zA-Z]' web/*.js` and **not** the `ctx\.` one this file asked for
before D5, whose four-exemption whitelist is `web/draw.js`, `bakeFloorTile`, `bakeGrainTile`,
`arenaVignette`, `drawGlobe` and `resize`. No Rust changed, so `cargo test --workspace`,
`lab -- hash` and `wasm_check.js` are a formality that catches a stray edit.

## Explicitly not in this session

- A WebGL2 backend, an atlas, texture packing, or a batching pass. §8.
- Any new drawing, any new constant, any palette change, any reordering of the merge walk.
- Moving the projection, `groundSpace`, or the bakes.
- Retiring `drawCharacter`'s single-function structure. The comment at `main.js:8365-8414` argues
  for keeping every branch in one function and it still holds; what leaves that function is the
  painting, not the branching.

## The standing rule this session creates

Every session after this one emits. **A new `ctx` call site outside `web/draw.js` is a review
failure, not a style note** — it is one more thing a second backend would have to be threaded
through, which is the entire cost this session was paid to remove. Later session files do not
repeat this; it is stated once, here, and in `art-00`'s house rules.
