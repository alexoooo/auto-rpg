// =============================================================== web/draw.js
//
// **The backend. The only code on this page that touches the arena's context
// once a frame has started.**
//
// Everything that knows what a unit, a tile, an event or a phase is lives in
// `main.js` and **emits**; everything that knows what a canvas is lives here and
// **consumes**. The split test when a function is ambiguous is: does it read a
// field off a snapshot row? If yes it is extract, and it may not paint.
//
// The point of the seam is not tidiness. It is that a second backend -- WebGL2,
// one day, and `art-04` §8 is emphatic that today is not that day -- becomes one
// more file that consumes this list rather than a rewrite threaded through every
// function that knows what a Brute looks like. So the vocabulary below is
// deliberately small and deliberately enumerable, and growing it is a design
// event that gets written into a session file rather than done quietly.
//
// A classic script, loaded **before** `main.js`, no module, no build step -- the
// same terms `main.js` is on, and for the same reason: every top-level `const`
// and `function` here is a global the page can reach, which is what the
// profiling method in `AGENTS.md` and the session instruments both depend on.
//
// ---------------------------------------------------------------------------
// THE RULE, AND ITS WHITELIST
//
//     No per-frame canvas-context call lives outside this file.
//
// Checked with
//
//     grep -nE '\b(ctx|g|globeCtx)\.[a-zA-Z]' web/*.js
//
// and **not** with `grep -n 'ctx\.'`, which is what `art-04` originally asked
// for and which is blind to two thirds of the problem: the bakes and the globe
// write `g.` and `globeCtx.`, so the naive grep comes out clean while a second
// per-frame painter with 46 context calls sits in `main.js`. Two exemptions,
// each on principle rather than convenience:
//
//   * **the paint-source builders** -- `bakeFloorTile`, `bakeGrainTile`,
//     `arenaVignette`, `floorPatternNow` and `rebuildLevelPaths`'s torch
//     gradients. They run once per zoom bucket, once per level bake, or once
//     ever, and what they produce is a *paint source* rather than a drawing. A
//     paint source belongs in the table below; the code that makes one does not
//     have to. (`art-04` §1 named the first three at commit 1 and the other two
//     at commit 2, when the ground layer walked past them.)
//   * `drawGlobe` -- a HUD widget on **its own canvas element** (`#globe`), with
//     its own throttle and its own lifecycle. A display list keyed to one
//     backend context does not describe a second canvas, and pretending it did
//     would buy nothing and cost the globe its independence.
//
// Two things are outside the rule rather than exempt from it, and are named
// only because the grep hits them: `resize`'s `ctx.setTransform`, which is per
// resize; and `render`'s three-call frame preamble -- the device-pixel
// transform, the transparent clear and the camera translate -- which is what
// establishes the space the list is written in and so cannot be an item in it.
//
// ---------------------------------------------------------------------------
// WHAT IS AND IS NOT IN THE LIST YET
//
// `art-04` lands in three commits and two have landed: **the depth layer** and
// **the ground layer**. What is left is the overlay -- `drawHealth`,
// `drawFloaters`, `drawCallouts`, `drawHeroThrough` and `drawGrain` -- and with
// it the kinds only it needs: `ROUND_RECT`, `TEXT`, `SPRITE` and `SPRITE_SPAN`.
// They arrive with the commit that needs them, so that a regression bisects to a
// layer instead of to a five-thousand-line diff. A kind with no consumer is a
// kind nobody has checked.

/** Full turn. Deliberately its own copy rather than a read of `main.js`'s: this
 *  file loads first, so anything of `main.js`'s it wanted at load time would not
 *  be there yet, and one shared spelling of `Math.PI * 2` is not worth a rule
 *  about which file may reach into which. */
const DL_TAU = Math.PI * 2;

// ------------------------------------------------------------- the item kinds

/** Push a matrix, a rotation and a scale -- and, optionally, an alpha. `art-04`
 *  §4 (D1) has the argument at length; the short form is that `groundSpace` is a
 *  **CTM** and not a point transform, byte-identity depends on what that CTM
 *  does to things drawn inside it (stroke widths go anisotropic with bearing,
 *  dash patterns keep their user-space mark counts), and shear composed with a
 *  rotation is not any rotation composed with any scale. So it cannot be folded
 *  into the fields of the item it applies to, and it is state exactly as a clip
 *  is state -- which is the argument §4 already makes for `CLIP_PUSH`, verbatim.
 *
 *  The ops are applied in the order the call sites use them and in no other:
 *  translate, then the linear part, then the rotation, then the uniform scale.
 *  That order is not a convention, it is a transcription -- every transform
 *  sequence in the depth layer is written that way, and reproducing it call for
 *  call is what keeps the CTM bit-identical instead of merely equal. */
const DL_XFORM_PUSH = 0;
const DL_XFORM_POP = 1;

/**
 * A clip, from a `Path2D` in the paint table, and the `restore` that ends it.
 *
 * **The entry people leave out.** `drawLevel`'s two passes -- lit inside
 * `floorLit`, remembered inside `floorSeen` at `SEEN_ALPHA` -- are a clip, and a
 * clip is *state* rather than a mark. Emitting it keeps the backend a straight
 * walk with nothing to be told out of band, and keeps the fog's authority an
 * extract-side decision, where `art-00` §6 puts it: `main.js` decides which
 * region a pass is clipped to and at what alpha, and this file only ever obeys.
 * A backend that had to be told separately where the clips go is a backend that
 * can be told wrong.
 *
 * It carries an alpha for the same reason `XFORM_PUSH` does, and because
 * `drawLevel` sets one on the line after the clip: the two are one push.
 *
 * **At most one is ever live at once**, today. `drawLevel`'s pass clip and
 * `drawLantern`'s are sequential -- the second begins after the first has popped
 * -- and `drawCharacter`'s two are the mutually exclusive arms of one `if` in a
 * layer where no ground clip is open. The backend keeps a real stack anyway,
 * because the depth-layer clip does sit inside the walk's own push and because a
 * backend whose correctness depends on a count being one is a backend with a
 * bug waiting for `art-07`.
 */
const DL_CLIP_PUSH = 2;
const DL_CLIP_POP = 3;

/** A full circle: `arc(cx, cy, r, 0, TAU)`. Under the shear that is an ellipse
 *  twice as wide as it is tall, which is exactly what a circle on the floor
 *  looks like -- and getting it by drawing a circle in a sheared space rather
 *  than by computing an ellipse is what keeps the dash counts and the line
 *  widths the ones that were measured. Fills **or** strokes, never both: the two
 *  carry different colours at nearly every call site, so a shape that wanted
 *  both would need two of everything and the list is clearer with two items. */
const DL_ELLIPSE = 4;

/** A partial arc, with per-frame start and end angles and a direction flag; or,
 *  with `DL_SECTOR`, the pie slice that arc closes back to its centre. */
const DL_ARC = 5;

/** A `Path2D` from the paint table, filled or stroked. */
const DL_PATH_FILL = 6;
const DL_PATH_STROKE = 7;

/** A stroked polyline whose points were written into `dlPts` this frame.
 *
 *  `PATH_STROKE` as `art-04` first defined it -- "a `Path2D` from the table" --
 *  covers 8 of this page's 38 strokes. The other 30 stroke a current path built
 *  out of numbers that did not exist a frame ago, and there is no `Path2D` for
 *  any of them that does not allocate one per frame. Points, an offset and a
 *  count, out of one preallocated buffer, is what that costs instead. */
const DL_POLY_STROKE = 8;

/** A rectangle filled with a flat colour. */
const DL_RECT = 9;

/** A rectangle filled with a `CanvasPattern` from the table, through whatever
 *  clip is open. The pattern carries its own matrix -- `floorPatternNow` re-aims
 *  it every frame -- so the item is only the rectangle. */
const DL_PATTERN = 10;

/** A rectangle filled with a **radial falloff** from the table.
 *
 *  Adding light or taking it away, and the same kind either way: the arena
 *  vignette and the lantern darken at `source-over`, a torch pool adds under
 *  `lighter`, and the three are one rectangle through one radial gradient with a
 *  blend mode on the push above them. Splitting "light" from "shadow" here would
 *  be splitting on the sign of a number that is already in the gradient's stops.
 *
 *  A falloff painted through an *arc* rather than a rect is an `ELLIPSE` with an
 *  `ink` -- `drawPortal`'s glow is the one of those. */
const DL_LIGHT = 11;

/** For the frame dump. Index by kind. */
const DL_KIND_NAMES = [
  "XFORM_PUSH",
  "XFORM_POP",
  "CLIP_PUSH",
  "CLIP_POP",
  "ELLIPSE",
  "ARC",
  "PATH_FILL",
  "PATH_STROKE",
  "POLY_STROKE",
  "RECT",
  "PATTERN",
  "LIGHT",
];

// ----------------------------------------------------------------- the layers

const DL_GROUND = 0;
const DL_DEPTH = 1;
const DL_OVERLAY = 2;

/** Which layer the items being emitted belong to. Set by the extract passes at
 *  the top of each; it is a label the counters and `?noart=1`'s filter read, and
 *  it reorders nothing -- the backend walks in emission order, and the three
 *  layers are already emitted in the order they composite. */
let dlActiveLayer = DL_DEPTH;

function dlLayerIs(layer) {
  dlActiveLayer = layer;
}

// ------------------------------------------------------------------ the flags

const DL_FILL = 1 << 0;
const DL_STROKE = 1 << 1;
/** `ARC`: close the arc back to its centre, so it fills as a pie slice. */
const DL_SECTOR = 1 << 2;
/** `ARC`: the counter-clockwise flag `ctx.arc` takes as its seventh argument. */
const DL_CCW = 1 << 3;
const DL_DASHED = 1 << 4;
const DL_CAP_ROUND = 1 << 5;
const DL_CAP_SQUARE = 1 << 6;
/** `POLY_STROKE`: the run is `2n` points forming `n` **disjoint** segments in one
 *  path, rather than one polyline of `n` points.
 *
 *  For `drawDestination`'s crosshair, which is four `moveTo`/`lineTo` pairs
 *  stroked as a single path. Four items would be four strokes, and §5.1 makes
 *  the stroke count the metric this session is measured on -- so a kind that can
 *  only say "polyline" would make the seam report a number the page does not
 *  actually pay. It is the only multi-subpath stroke in the file; `drawMarks`'s
 *  four sparks are already four `beginPath`/`stroke` pairs and stay four items. */
const DL_SEGMENTS = 1 << 9;
const DL_JOIN_ROUND = 1 << 10;
/** `XFORM_PUSH`: `globalCompositeOperation = "lighter"` inside this save.
 *
 *  One site, `drawTorchLight`, and it is the only non-`source-over` composite in
 *  `web/` that is not `drawGrain` re-asserting the default. It rides on the push
 *  rather than on the items because that is where the code it replaces puts it --
 *  a blend mode is state, and one that a pop puts back is a blend mode that
 *  cannot leak into the vignette painted after it. */
const DL_ADDITIVE = 1 << 11;
/** `XFORM_PUSH`: concatenate onto the current state **without saving**, and
 *  expect no matching `XFORM_POP`.
 *
 *  Only for the five sites that compose their own inverse -- `drawLimb`'s four
 *  `rotate(theta)` / `rotate(-theta)` pairs and `drawCharacter`'s facing wedge.
 *  A save and a restore would be *more* exact than the code it replaces, because
 *  `M * R(theta) * R(-theta)` is only approximately `M` once Skia has taken
 *  `sinf` and `cosf` of the angle -- and this session's gate is identity with
 *  what the file does today, not with what it meant. When those pairs are
 *  retired, this flag goes with them. */
const DL_BARE = 1 << 7;
/** `PATH_STROKE` / `POLY_STROKE`: the width is quoted in the item's own local
 *  units rather than in screen pixels -- body radii, mostly, at the nine call
 *  sites that put a path inside a `scale`.
 *
 *  **A no-op for this backend, and carried anyway.** Canvas2D's `lineWidth` is a
 *  user-space quantity by construction, so a width quoted in radii inside a
 *  `scale(r, r)` already comes out right and there is nothing for the arm below
 *  to do. A backend that flattens to screen space before it strokes has to know,
 *  and it can only know if the item says so. */
const DL_LOCAL_WIDTH = 1 << 8;

// ------------------------------------------------------------------- the list

/**
 * **Fixed capacity, written in place, never reallocated**, and that is the parse
 * pool's rule rather than a new one: nothing on this page allocates once it is
 * running, because a fresh object per drawable per frame is a GC sawtooth built
 * into the render path.
 *
 * Parallel arrays rather than an array of objects, for the same reason plus one
 * more: this layout is already what an instanced backend wants to upload.
 *
 * Sized for the worst room the caps allow -- `MAX_UNITS` bodies at about twenty
 * items each, `MAX_SHOTS` arrows, the corpses, and two dozen wall bands at seven
 * fills apiece -- and then doubled, because the cost of a generous fixed
 * capacity is one allocation at load and the cost of a tight one is a renderer
 * that reallocates under load, which is a sawtooth in the worst-frame column.
 */
const DL_CAP = 8192;

/** Named slots, wide enough that no kind has to alias a slot against another
 *  kind's meaning -- which is the sort of saving that buys a hundred kilobytes
 *  and costs an afternoon. */
const DL_STRIDE = 15;

const DL_F_DEPTH = 0;
/**
 * `globalAlpha`. Negative means "leave it alone".
 *
 * **An item states an alpha exactly where the code it replaces stated one, and
 * inherits otherwise.** That is a transcription rule rather than a preference,
 * and it is the whole of how this survives a byte-for-byte gate.
 *
 * Two shapes, because the file has two. Most of the depth layer sets
 * `globalAlpha` once inside a `save` and lets everything under it inherit -- the
 * walk's own `= 1`, a ghost's falling alpha -- so there the alpha rides on
 * `XFORM_PUSH` and the pop puts it back. `drawLevel`'s rock pass and
 * `drawDestination` instead assign it between draws inside one `save`, so there
 * the alpha rides on the item, set by `dlAlpha` on the line above the emit
 * exactly as `ctx.globalAlpha =` sits on the line above the fill.
 *
 * What it is never is folded into a colour. A ghost's alpha multiplies against
 * stop alphas and `rgba()` alphas already in the styles below it, and that
 * product is the rasteriser's to compute at its own precision; doing it here in
 * a float would move pixels, and the gate is string equality on a PNG.
 */
const DL_F_ALPHA = 1;
/** Six geometry slots. `XFORM_PUSH` reads them as a 2x3 -- the linear part in
 *  A..D and the translation in E, F. Everything else reads what its own arm
 *  documents: a centre and a radius, a pair of angles, an offset and a count. */
const DL_F_A = 2;
const DL_F_B = 3;
const DL_F_C = 4;
const DL_F_D = 5;
const DL_F_E = 6;
const DL_F_F = 7;
const DL_F_ROT = 8;
const DL_F_SCALE = 9;
const DL_F_WIDTH = 10;
const DL_F_N = 11;
const DL_F_DASH_ON = 12;
const DL_F_DASH_OFF = 13;
/** The one animated dash on the page: `drawRoute`'s crawl, which is what carries
 *  the *direction* of a path whose legs are otherwise identical lines. It is set
 *  on every stroke and not only on that one, because the `save` that used to
 *  scope it is gone and a dash offset left behind would crawl somebody else's
 *  line. */
const DL_F_DASH_OFFSET = 14;

const dlKind = new Int32Array(DL_CAP);
const dlLayer = new Int32Array(DL_CAP);
/** The paint table index of the **shape** this item draws -- a `Path2D` today,
 *  an image or a mesh to somebody else. `DL_NO_PAINT` when the geometry is in
 *  `dlF` instead. */
const dlShape = new Int32Array(DL_CAP);
/** The paint table index of the **paint** this item draws with: a gradient or a
 *  pattern. `DL_NO_PAINT` when the colour is a colour, in which case it is in
 *  `dlStyle`. */
const dlInk = new Int32Array(DL_CAP);
/**
 * The item's colour, as the CSS string the page already built.
 *
 * **Not a packed `Uint32`, and the reason is the gate** (`art-04` §3, D2). 27
 * call sites build their style with `toFixed(3)`, and `wedgeFans`'s six fan
 * strings carry alphas -- `0.080`, `0.180`, `0.280` -- whose exact characters
 * that function's own comment declares load-bearing for `[tactical]`'s
 * byte-identity. `0.080 * 255` is `20.4`; an eight-bit alpha channel cannot
 * round-trip it and the picture moves the moment it tries.
 *
 * Assigning a reference into a preallocated array allocates nothing beyond the
 * string, and the string is one the page builds today either way -- so keeping
 * full precision here costs the no-allocation rule exactly nothing. A backend
 * that wants floats parses once and caches, from a value that still has all of
 * its digits.
 */
const dlStyle = new Array(DL_CAP);
const dlFlags = new Int32Array(DL_CAP);
const dlF = new Float64Array(DL_CAP * DL_STRIDE);

/**
 * `Float64Array` and not `Float32Array`.
 *
 * Every coordinate on this page is computed in doubles. Rounding them to `f32`
 * on the way into the list changes the numbers the rasteriser is handed, for no
 * reason anybody asked for, in the one session that cannot afford a changed
 * number. An instanced backend that wants `f32` narrows on upload, which is
 * where a narrowing belongs -- next to the thing that needs it.
 */
let dlCount = 0;

/** Points for `POLY_STROKE`, x and y interleaved. One buffer, a cursor, and the
 *  same discipline as the list itself. */
const DL_PTS_CAP = 8192;
const dlPts = new Float64Array(DL_PTS_CAP * 2);
let dlPtsCount = 0;
let dlPolyStart = 0;

/** Set when a frame ran out of list or out of points. One warning per list, not
 *  one per item: a full room that overflows would otherwise print a thousand
 *  lines and hide the first one. */
let dlOverflow = false;

const DL_NO_PAINT = -1;

// ------------------------------------------------------------- the paint table

/**
 * **The indirection is the whole of the insurance** (`art-04` §3). A Canvas2D
 * backend maps an index to a `Path2D` or a `CanvasPattern`; a WebGL2 backend
 * maps the same index to a texture id or a tessellated mesh. Extract references
 * paint by index and knows about neither.
 *
 * Two regions, and the second one is a finding rather than a design (D3). §3
 * used to say paint sources are "built outside the frame". **Six gradients are
 * built per frame today** -- two per body, plus the lantern and the portal --
 * and `floorPatternNow` mutates a cached `CanvasPattern` every frame. Hoisting
 * them is a change to what is allocated and, because the billboard's body
 * gradient is deliberately built *after* `ctx.scale` in the space it paints in,
 * possibly a change to what is drawn; neither belongs in a session whose gate is
 * that nothing changes. So the table simply has a per-frame region, reset with
 * the write cursor, and the fix is a later session's with its own before and
 * after.
 */
const DL_PAINT_STATIC_CAP = 64;
const DL_PAINT_FRAME_CAP = 4096;
const dlPaintTable = new Array(DL_PAINT_STATIC_CAP + DL_PAINT_FRAME_CAP).fill(null);
let dlPaintStaticCount = 0;
let dlPaintFrameCount = 0;

/** Register a paint source that outlives the frame -- a module-scope `Path2D`,
 *  an image, a baked tile. Called at load, never in the render path. */
function dlPaintStatic(src) {
  if (dlPaintStaticCount >= DL_PAINT_STATIC_CAP) {
    console.warn("draw.js: static paint table full");
    return DL_NO_PAINT;
  }
  const at = dlPaintStaticCount++;
  dlPaintTable[at] = src;
  return at;
}

/** Register a paint source that is only good for this list: a per-frame
 *  gradient, or a `Path2D` the level bake owns and replaces. Reset by
 *  `dlReset`. */
function dlPaintFrame(src) {
  if (dlPaintFrameCount >= DL_PAINT_FRAME_CAP) {
    dlOverflow = true;
    return DL_NO_PAINT;
  }
  const at = DL_PAINT_STATIC_CAP + dlPaintFrameCount++;
  dlPaintTable[at] = src;
  return at;
}

// ------------------------------------------------------------- the bound canvas

/** The arena's context. Bound once, by `main.js`, which still owns the DOM: a
 *  canvas element is the page's, and only what is done *to* it is this file's. */
let dlCtx = null;

function dlBind(ctx) {
  dlCtx = ctx;
}

// ------------------------------------------------------------------- emitting

/**
 * Start a list. Resets the write cursor, the point buffer and the per-frame
 * paint region -- nothing is freed and nothing is allocated; the slots past the
 * cursor hold the last list's values and are never read, exactly as the parse
 * pool's rows do.
 *
 * **Once a frame since commit 2, and that is the point of the ground layer
 * moving.** Commit 1 had to reset and draw more than once, because painters that
 * still wrote straight onto the context sat between the runs that emitted --
 * `drawReach` between the corpses and the bodies most of all. With the ground
 * layer emitting there is nothing left in between, so the frame is one list from
 * the floor to the last arrow, walked once. The overlay joins it in commit 3 and
 * then it is the whole frame.
 */
function dlReset() {
  dlCount = 0;
  dlPtsCount = 0;
  dlPolyStart = 0;
  dlPaintFrameCount = 0;
  dlOverflow = false;
  dlOpenCount = 0;
  dlPendingAlpha = -1;
}

/**
 * The alpha the **next** item states, and then it is cleared.
 *
 * Reads as the line it replaces -- `ctx.globalAlpha = a;` immediately above a
 * fill -- and is consumed once for the same reason that line is written once:
 * every site in the file that assigns `globalAlpha` outside a `save` draws
 * exactly one thing at it. An alpha that applied until changed would be a second
 * kind of state to track, and one that leaked past its draw would be the sort of
 * bug that shows up three painters later as a faded overlay.
 *
 * Where the source sets an alpha *inside* a `save` and lets a subtree inherit,
 * the alpha belongs on the `XFORM_PUSH` or the `CLIP_PUSH` instead.
 */
let dlPendingAlpha = -1;

function dlAlpha(a) {
  dlPendingAlpha = a;
}

/** The next slot, or -1 when the list is full. **Drops rather than grows**: a
 *  renderer that silently reallocates under load is a renderer with a sawtooth
 *  in its worst-frame column, and a dropped item is a visible bug that gets
 *  fixed rather than an invisible one that gets shipped. */
function dlNext(kind, layer) {
  if (dlCount >= DL_CAP) {
    dlOverflow = true;
    return -1;
  }
  const at = dlCount++;
  const b = at * DL_STRIDE;
  dlKind[at] = kind;
  dlLayer[at] = layer;
  dlShape[at] = DL_NO_PAINT;
  dlInk[at] = DL_NO_PAINT;
  dlStyle[at] = null;
  dlFlags[at] = 0;
  for (let i = 0; i < DL_STRIDE; i++) dlF[b + i] = 0;
  dlF[b + DL_F_ALPHA] = dlPendingAlpha;
  dlPendingAlpha = -1;
  dlF[b + DL_F_SCALE] = 1;
  return at;
}

/**
 * The transform stack, as **item indices** rather than as matrices.
 *
 * It exists for one caller: `dlLinearGradient`, which has to build a gradient
 * under exactly the matrix the items around it will be drawn under, and the
 * honest way to get that matrix is to replay the pushes that are open. Composing
 * it in JS instead would mean multiplying matrices with `Math.cos` where Skia
 * used `cosf`, which is the sort of near-equality this session cannot spend.
 *
 * A `DL_BARE` push has no pop of its own; it is unwound by the next real pop,
 * which is what the `saving` marker below is for.
 */
const DL_OPEN_CAP = 32;
const dlOpen = new Int32Array(DL_OPEN_CAP);
const dlOpenSaving = new Uint8Array(DL_OPEN_CAP);
let dlOpenCount = 0;

function dlOpenPush(at, saving) {
  if (dlOpenCount >= DL_OPEN_CAP) return;
  dlOpen[dlOpenCount] = at;
  dlOpenSaving[dlOpenCount] = saving ? 1 : 0;
  dlOpenCount++;
}

/**
 * Push a transform, saving the state it is pushed onto.
 *
 * `la`..`ld` is the linear part and `tx`, `ty` the translation, applied in that
 * order and separately, because that is how the call sites are written: a
 * `ctx.translate` followed by a `ctx.transform` is not the same sequence of
 * float operations as one `ctx.transform` carrying both, and only one of the two
 * is what the file did yesterday.
 *
 * `alpha` negative means "do not touch `globalAlpha`", which is what all but two
 * call sites want.
 */
function dlXform(la, lb, lc, ld, tx, ty, rot, scale, alpha, flags) {
  const at = dlNext(DL_XFORM_PUSH, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlF[b + DL_F_A] = la;
  dlF[b + DL_F_B] = lb;
  dlF[b + DL_F_C] = lc;
  dlF[b + DL_F_D] = ld;
  dlF[b + DL_F_E] = tx;
  dlF[b + DL_F_F] = ty;
  dlF[b + DL_F_ROT] = rot;
  dlF[b + DL_F_SCALE] = scale;
  dlF[b + DL_F_ALPHA] = alpha;
  dlFlags[at] = flags === undefined ? 0 : flags;
  dlOpenPush(at, true);
}

/** A transform with no save and no pop -- see `DL_BARE`. */
function dlXformBare(la, lb, lc, ld, tx, ty, rot, scale) {
  const at = dlNext(DL_XFORM_PUSH, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlF[b + DL_F_A] = la;
  dlF[b + DL_F_B] = lb;
  dlF[b + DL_F_C] = lc;
  dlF[b + DL_F_D] = ld;
  dlF[b + DL_F_E] = tx;
  dlF[b + DL_F_F] = ty;
  dlF[b + DL_F_ROT] = rot;
  dlF[b + DL_F_SCALE] = scale;
  // A bare push does not save, so it may not set an alpha: there would be
  // nothing to put it back. Cleared rather than inherited from `dlAlpha`, which
  // belongs to the next thing that actually draws.
  dlF[b + DL_F_ALPHA] = -1;
  dlFlags[at] = DL_BARE;
  dlOpenPush(at, false);
}

/** A bare rotation, which is the only shape four of the five `DL_BARE` sites
 *  come in. Written out so the call sites do not each spell an identity. */
function dlRotateBare(rot) {
  dlXformBare(1, 0, 0, 1, 0, 0, rot, 1);
}

/** A bare translation, for the one site that steps aside and steps back. */
function dlTranslateBare(tx, ty) {
  dlXformBare(1, 0, 0, 1, tx, ty, 0, 1);
}

function dlXformEnd() {
  if (dlNext(DL_XFORM_POP, dlActiveLayer) < 0) return;
  while (dlOpenCount > 0) {
    dlOpenCount--;
    if (dlOpenSaving[dlOpenCount]) break;
  }
}

/** Clip to a `Path2D` from the table, saving the state it is pushed onto, and
 *  optionally set the alpha the region is painted at -- `drawLevel` assigns one
 *  on the line after its `ctx.clip`, so the two are one push.
 *
 *  It goes on the open stack with an identity matrix. A clip does not move the
 *  CTM, so replaying it is a no-op; being on the stack is what makes a bare push
 *  emitted *inside* a clip unwind when the clip ends, rather than staying open
 *  until some later `XFORM_POP` walks past it. */
function dlClip(shape, alpha) {
  const at = dlNext(DL_CLIP_PUSH, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlShape[at] = shape;
  dlF[b + DL_F_A] = 1;
  dlF[b + DL_F_D] = 1;
  dlF[b + DL_F_ALPHA] = alpha === undefined ? -1 : alpha;
  dlOpenPush(at, true);
}

function dlClipEnd() {
  if (dlNext(DL_CLIP_POP, dlActiveLayer) < 0) return;
  while (dlOpenCount > 0) {
    dlOpenCount--;
    if (dlOpenSaving[dlOpenCount]) break;
  }
}

/** A full circle, filled or stroked. `ink` is a paint table index or
 *  `DL_NO_PAINT`; `style` is the CSS string when it is not. */
function dlEllipse(cx, cy, r, flags, style, ink, width, dashOn, dashOff) {
  const at = dlNext(DL_ELLIPSE, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlF[b + DL_F_A] = cx;
  dlF[b + DL_F_B] = cy;
  dlF[b + DL_F_C] = r;
  dlF[b + DL_F_WIDTH] = width;
  dlF[b + DL_F_DASH_ON] = dashOn;
  dlF[b + DL_F_DASH_OFF] = dashOff;
  dlFlags[at] = flags;
  dlStyle[at] = style;
  dlInk[at] = ink;
}

/** A partial arc, or the sector it closes to. `a0`/`a1` are the angles
 *  `ctx.arc` takes, and `DL_CCW` is its direction flag. */
function dlArc(cx, cy, r, a0, a1, flags, style, width) {
  const at = dlNext(DL_ARC, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlF[b + DL_F_A] = cx;
  dlF[b + DL_F_B] = cy;
  dlF[b + DL_F_C] = r;
  dlF[b + DL_F_D] = a0;
  dlF[b + DL_F_E] = a1;
  dlF[b + DL_F_WIDTH] = width;
  dlFlags[at] = flags;
  dlStyle[at] = style;
}

/** A `Path2D` from the table, filled or stroked by its flags. */
function dlPath(shape, flags, style, ink, width, dashOn, dashOff) {
  const at = dlNext(flags & DL_FILL ? DL_PATH_FILL : DL_PATH_STROKE, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlShape[at] = shape;
  dlF[b + DL_F_WIDTH] = width;
  dlF[b + DL_F_DASH_ON] = dashOn;
  dlF[b + DL_F_DASH_OFF] = dashOff;
  dlFlags[at] = flags;
  dlStyle[at] = style;
  dlInk[at] = ink;
}

/** A rectangle in a flat colour. `x`, `y`, `w`, `h` in the space of whatever
 *  transforms are open, which for the ground layer's two composites is the
 *  camera's own -- the projection is applied to the box once, in the bake. */
function dlRect(x, y, w, h, style) {
  dlRectItem(DL_RECT, x, y, w, h, style, DL_NO_PAINT);
}

/** The same rectangle through a `CanvasPattern` from the table. */
function dlPatternRect(x, y, w, h, ink) {
  dlRectItem(DL_PATTERN, x, y, w, h, null, ink);
}

/** The same rectangle through a radial falloff from the table. Additive or not
 *  is `DL_ADDITIVE` on the push above it, not a property of the rectangle. */
function dlLight(x, y, w, h, ink) {
  dlRectItem(DL_LIGHT, x, y, w, h, null, ink);
}

function dlRectItem(kind, x, y, w, h, style, ink) {
  const at = dlNext(kind, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlF[b + DL_F_A] = x;
  dlF[b + DL_F_B] = y;
  dlF[b + DL_F_C] = w;
  dlF[b + DL_F_D] = h;
  dlFlags[at] = DL_FILL;
  dlStyle[at] = style;
  dlInk[at] = ink;
}

/** Begin a run of points for one `POLY_STROKE`. */
function dlPolyBegin() {
  dlPolyStart = dlPtsCount;
}

function dlPoint(x, y) {
  if (dlPtsCount >= DL_PTS_CAP) {
    dlOverflow = true;
    return;
  }
  dlPts[dlPtsCount * 2] = x;
  dlPts[dlPtsCount * 2 + 1] = y;
  dlPtsCount++;
}

/** Close the run and emit it. Always a stroke -- a filled polygon would be a
 *  `Path2D`, and the reason this kind exists is that its points did not exist a
 *  frame ago. */
function dlPolyEnd(flags, style, width, dashOn, dashOff, dashOffset) {
  const at = dlNext(DL_POLY_STROKE, dlActiveLayer);
  if (at < 0) return;
  const b = at * DL_STRIDE;
  dlF[b + DL_F_A] = dlPolyStart;
  dlF[b + DL_F_N] = dlPtsCount - dlPolyStart;
  dlF[b + DL_F_WIDTH] = width;
  dlF[b + DL_F_DASH_ON] = dashOn;
  dlF[b + DL_F_DASH_OFF] = dashOff;
  dlF[b + DL_F_DASH_OFFSET] = dashOffset === undefined ? 0 : dashOffset;
  dlFlags[at] = flags | DL_STROKE;
  dlStyle[at] = style;
}

/**
 * A two-stop linear gradient, built **under the transforms that are open**, and
 * registered in the per-frame paint region.
 *
 * This is the one query in the emit API and it exists because six gradients on
 * this page are built per frame, in the middle of a transform sequence, and D3
 * says do not fix that here. `drawCharacter` is explicit about why the position
 * matters: the flat body's gradient is built before the rotation "so the light
 * stays where the room's light is instead of spinning with the character", and
 * the billboard's is built *after* the scale, in that space's own units, under a
 * comment saying the two matrices are deliberately made the same matrix so that
 * "when a canvas resolves a gradient's coordinates" never has to be answered. A
 * seam that built them somewhere else would be answering it by accident.
 *
 * So the open pushes are replayed onto the context, the gradient is made, and
 * the context is put back. The replay is one to three matrices deep and runs
 * twice a body; the alternative is composing matrices in JS with `Math.cos`
 * where Skia used `cosf`.
 */
function dlLinearGradient(x0, y0, x1, y1, stop0, stop1) {
  const c = dlCtx;
  c.save();
  for (let i = 0; i < dlOpenCount; i++) dlApplyXform(c, dlOpen[i] * DL_STRIDE);
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, stop0);
  g.addColorStop(1, stop1);
  c.restore();
  return dlPaintFrame(g);
}

/** The same, radially. `drawPortal`'s glow is built inside `groundSpace` and
 *  `drawLantern`'s at the top-level matrix, and the replay above is what lets
 *  both say only where they want the falloff and not which matrices are open. */
function dlRadialGradient(x0, y0, r0, x1, y1, r1, stop0, stop1) {
  const c = dlCtx;
  c.save();
  for (let i = 0; i < dlOpenCount; i++) dlApplyXform(c, dlOpen[i] * DL_STRIDE);
  const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1);
  g.addColorStop(0, stop0);
  g.addColorStop(1, stop1);
  c.restore();
  return dlPaintFrame(g);
}

/**
 * The width of a string in a font, in CSS pixels.
 *
 * A **measurement is not a paint**, which is the whole of why this can live here
 * without weakening §1: `draw.js` stays the only code that touches a context,
 * and extract stays the only code that decides where anything goes.
 * `drawCallouts` needs it -- the pill's width, its plate, its icon position and
 * its text position all come off one `measureText` -- and the alternative, a
 * `TEXT` item with an "auto-size the plate around me" flag, would move layout
 * into the backend, which is the one thing the backend must not know.
 *
 * Its consumer arrives with the overlay commit; nothing before that calls it.
 */
function dlMeasureTextWidth(font, s) {
  const c = dlCtx;
  c.save();
  c.font = font;
  const w = c.measureText(s).width;
  c.restore();
  return w;
}

// ------------------------------------------------------------------ consuming

/** The empty dash, hoisted for the same reason `main.js` hoists its own: a
 *  solid stroke must not hand the allocator an array. */
const DL_NO_DASH = [];
/** And the two-element one, mutated in place. `setLineDash` copies what it is
 *  given, so one buffer is enough and it is enough forever. */
const dlDash2 = [0, 0];

/** translate, then the linear part, then the rotation, then the scale -- and
 *  each skipped when it is an identity, so that a top-down `groundSpace` comes
 *  out as the bare `ctx.translate` it is today rather than as a translate and a
 *  multiplication by the identity matrix. */
function dlApplyXform(ctx, b) {
  const tx = dlF[b + DL_F_E];
  const ty = dlF[b + DL_F_F];
  if (tx !== 0 || ty !== 0) ctx.translate(tx, ty);
  const la = dlF[b + DL_F_A];
  const lb = dlF[b + DL_F_B];
  const lc = dlF[b + DL_F_C];
  const ld = dlF[b + DL_F_D];
  if (la !== 1 || lb !== 0 || lc !== 0 || ld !== 1) ctx.transform(la, lb, lc, ld, 0, 0);
  const rot = dlF[b + DL_F_ROT];
  if (rot !== 0) ctx.rotate(rot);
  const scale = dlF[b + DL_F_SCALE];
  if (scale !== 1) ctx.scale(scale, scale);
}

/** Everything a stroke needs that a fill does not. Set per item rather than
 *  hoisted per pass: the depth walk puts whole bodies and wall bands between one
 *  arrow and the next, so state set once at the top of a pass is state leaking
 *  across somebody else's draw call in both directions -- which is the argument
 *  `drawShot` already makes for its own `lineCap`. */
function dlStrokeState(ctx, at, b) {
  const flags = dlFlags[at];
  ctx.lineWidth = dlF[b + DL_F_WIDTH];
  ctx.lineCap = flags & DL_CAP_ROUND ? "round" : flags & DL_CAP_SQUARE ? "square" : "butt";
  ctx.lineJoin = flags & DL_JOIN_ROUND ? "round" : "miter";
  ctx.lineDashOffset = dlF[b + DL_F_DASH_OFFSET];
  if (flags & DL_DASHED) {
    dlDash2[0] = dlF[b + DL_F_DASH_ON];
    dlDash2[1] = dlF[b + DL_F_DASH_OFF];
    ctx.setLineDash(dlDash2);
  } else {
    ctx.setLineDash(DL_NO_DASH);
  }
}

/** `globalAlpha`, where the item states one. Negative is "inherit", which is the
 *  common case and is why this is a comparison rather than an assignment. */
function dlSetAlpha(ctx, b) {
  const alpha = dlF[b + DL_F_ALPHA];
  if (alpha >= 0) ctx.globalAlpha = alpha;
}

function dlSetFill(ctx, at) {
  const ink = dlInk[at];
  ctx.fillStyle = ink === DL_NO_PAINT ? dlStyle[at] : dlPaintTable[ink];
}

function dlSetStroke(ctx, at) {
  const ink = dlInk[at];
  ctx.strokeStyle = ink === DL_NO_PAINT ? dlStyle[at] : dlPaintTable[ink];
}

/**
 * Walk the list and paint it. **A straight walk with no out-of-band state**,
 * which is the property every "the clip is an item", "the matrix is an item"
 * argument in `art-04` was bought to protect: there is nothing this function
 * has to be told separately, and so nothing it can be told wrong.
 *
 * **The whole walk is one `save`/`restore`, and it is load-bearing rather than
 * belt and braces.** Every painter this list replaced was `save`/`restore`
 * balanced, so the code after them ran at the state they found -- and a lot of
 * it depends on that without saying so. `drawCallouts` strokes its pill without
 * setting `lineCap` or `lineJoin`, so it inherits; `drawHeroThrough` runs
 * outside the depth walk and its own comment says it relies on the walk having
 * restored. Items state everything they read, so nothing *inside* the list can
 * be surprised -- but the last stroke in it leaves its cap, its join, its width
 * and its dash behind, and without this pair a route bead five hundred items
 * back would decide what a callout's outline looks like. It cost commit 2 an
 * afternoon: `drawTrail`'s round join, which used to live inside that function's
 * own `save`, came out on a pill in the overlay.
 */
function dlDraw() {
  const ctx = dlCtx;
  ctx.save();
  for (let at = 0; at < dlCount; at++) {
    const b = at * DL_STRIDE;
    const flags = dlFlags[at];
    switch (dlKind[at]) {
      case DL_XFORM_PUSH: {
        if (!(flags & DL_BARE)) {
          ctx.save();
          dlSetAlpha(ctx, b);
          if (flags & DL_ADDITIVE) ctx.globalCompositeOperation = "lighter";
        }
        dlApplyXform(ctx, b);
        break;
      }
      case DL_XFORM_POP:
      case DL_CLIP_POP:
        ctx.restore();
        break;
      case DL_CLIP_PUSH:
        ctx.save();
        ctx.clip(dlPaintTable[dlShape[at]]);
        dlSetAlpha(ctx, b);
        break;
      case DL_RECT:
      case DL_PATTERN:
      case DL_LIGHT:
        dlSetAlpha(ctx, b);
        dlSetFill(ctx, at);
        ctx.fillRect(dlF[b + DL_F_A], dlF[b + DL_F_B], dlF[b + DL_F_C], dlF[b + DL_F_D]);
        break;
      case DL_ELLIPSE:
        dlSetAlpha(ctx, b);
        ctx.beginPath();
        ctx.arc(dlF[b + DL_F_A], dlF[b + DL_F_B], dlF[b + DL_F_C], 0, DL_TAU);
        if (flags & DL_FILL) {
          dlSetFill(ctx, at);
          ctx.fill();
        } else {
          dlSetStroke(ctx, at);
          dlStrokeState(ctx, at, b);
          ctx.stroke();
        }
        break;
      case DL_ARC:
        dlSetAlpha(ctx, b);
        ctx.beginPath();
        if (flags & DL_SECTOR) ctx.moveTo(dlF[b + DL_F_A], dlF[b + DL_F_B]);
        ctx.arc(
          dlF[b + DL_F_A],
          dlF[b + DL_F_B],
          dlF[b + DL_F_C],
          dlF[b + DL_F_D],
          dlF[b + DL_F_E],
          (flags & DL_CCW) !== 0
        );
        if (flags & DL_SECTOR) ctx.closePath();
        if (flags & DL_FILL) {
          dlSetFill(ctx, at);
          ctx.fill();
        } else {
          dlSetStroke(ctx, at);
          dlStrokeState(ctx, at, b);
          ctx.stroke();
        }
        break;
      case DL_PATH_FILL:
        dlSetAlpha(ctx, b);
        dlSetFill(ctx, at);
        ctx.fill(dlPaintTable[dlShape[at]]);
        break;
      case DL_PATH_STROKE:
        dlSetAlpha(ctx, b);
        dlSetStroke(ctx, at);
        dlStrokeState(ctx, at, b);
        ctx.stroke(dlPaintTable[dlShape[at]]);
        break;
      case DL_POLY_STROKE: {
        const from = dlF[b + DL_F_A];
        const n = dlF[b + DL_F_N];
        if (n >= 2) {
          dlSetAlpha(ctx, b);
          ctx.beginPath();
          if (flags & DL_SEGMENTS) {
            // Pairs, each its own sub-path: one `stroke` over `n / 2` disjoint
            // segments, which is what `drawDestination`'s crosshair is.
            for (let i = 0; i + 1 < n; i += 2) {
              ctx.moveTo(dlPts[(from + i) * 2], dlPts[(from + i) * 2 + 1]);
              ctx.lineTo(dlPts[(from + i + 1) * 2], dlPts[(from + i + 1) * 2 + 1]);
            }
          } else {
            ctx.moveTo(dlPts[from * 2], dlPts[from * 2 + 1]);
            for (let i = 1; i < n; i++) ctx.lineTo(dlPts[(from + i) * 2], dlPts[(from + i) * 2 + 1]);
          }
          dlSetStroke(ctx, at);
          dlStrokeState(ctx, at, b);
          ctx.stroke();
        }
        break;
      }
      default:
        break;
    }
  }
  ctx.restore();
  if (dlOverflow) {
    console.warn(`draw.js: the frame ran out of list at ${DL_CAP} items and dropped the rest`);
    dlOverflow = false;
  }
}

// ---------------------------------------------------------------- instruments

/** Counts by kind, plus the one number `DESIGN.md` cares about. `art-04` §5.1:
 *  killing `stroke` alone recovered 43 fps while every other primitive was
 *  collectively free, so "how many strokes is this frame" wants to be a count
 *  over one array rather than an audit. */
function dlStats() {
  const byKind = {};
  let strokes = 0;
  for (let at = 0; at < dlCount; at++) {
    const name = DL_KIND_NAMES[dlKind[at]];
    byKind[name] = (byKind[name] || 0) + 1;
    if (dlFlags[at] & DL_STROKE) strokes++;
  }
  return { items: dlCount, strokes, points: dlPtsCount, paint: dlPaintFrameCount, byKind };
}

/** The frame, as text. The debugging instrument this renderer did not have: it
 *  is what turns "the barrel is drawn under the wall" from a bisect into a read.
 *  Dev-mode only by convention -- it is called from the console, not the loop. */
function dlDump() {
  const lines = [];
  let indent = 0;
  for (let at = 0; at < dlCount; at++) {
    const b = at * DL_STRIDE;
    const kind = dlKind[at];
    if (kind === DL_XFORM_POP || kind === DL_CLIP_POP) indent = Math.max(0, indent - 1);
    const pad = "  ".repeat(indent);
    const style = dlStyle[at] === null ? (dlInk[at] === DL_NO_PAINT ? "" : `ink#${dlInk[at]}`) : dlStyle[at];
    lines.push(
      `${String(at).padStart(4)} ${pad}${DL_KIND_NAMES[kind]} ` +
        `d=${dlF[b + DL_F_DEPTH].toFixed(2)} ` +
        `[${dlF[b + DL_F_A].toFixed(2)},${dlF[b + DL_F_B].toFixed(2)},${dlF[b + DL_F_C].toFixed(2)}] ` +
        `${style}`
    );
    if (kind === DL_XFORM_PUSH && !(dlFlags[at] & DL_BARE)) indent++;
    if (kind === DL_CLIP_PUSH) indent++;
  }
  return lines.join("\n");
}
