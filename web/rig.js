// ================================================================ web/rig.js
//
// **The rig tables, and nothing else.**
//
// A body is not one drawing any more. It is a short list of *segments*, each
// declared in body-local coordinates, each resolved to a screen placement by
// `main.js`'s `drawRig` and painted by `draw.js`. Three files, three jobs:
//
//   * this one knows **proportions** -- where a leg hangs off a hip and how
//     wide it is -- and knows nothing about the sim, the camera, the canvas or
//     what a `UnitKind` is;
//   * `main.js` knows the sim, and turns a table row plus a snapshot row into a
//     placed, posed, depth-keyed item;
//   * `draw.js` knows the canvas, and is the only thing that touches one.
//
// That split is what makes the tables *data*. It is also why `drawRig` is
// testable by asserting over the items it emitted, with no canvas anywhere near
// it -- `dlDump()` after a frame is the whole instrument.
//
// A classic script, loaded after `draw.js` (it registers its unit paths in the
// paint table at load) and before `main.js`. Top-level `const` in a classic
// script lands in the global lexical environment, so every name here is visible
// to `main.js`.
//
// ---------------------------------------------------------------------------
// THE SPACE
//
// Three numbers per point, all in **body radii**, all body-local:
//
//     along     forward along the body's facing
//     side      to the body's **left**
//     height    up from the feet
//
// The camera looks down the `+x/+y` diagonal -- `wallBlock`'s comment states it
// as the reason only two of a block's four faces are ever emitted -- so facing
// the camera is world bearing `pi/4`, and everything below is written in
//
//     b = camBearing(facing) = facing - pi/4,    wrapped to (-pi, pi]
//
// which is zero facing the viewer, `+/-pi` facing away, `+/-pi/2` in profile.
// Push the local triple through the facing rotation, then through
// `projX`/`projY` and `lift`, divide by the billboard's own scale
// `s = px(radius) * PROJ.ex`, and the whole thing collapses to two lines:
//
//     bx = side * cos b  -  along * sin b
//     by = (along * cos b + side * sin b) / 2  -  height / ex
//
// in exactly the billboard space `UPRIGHTS` is already written in: half-width 1,
// feet at the origin, `-y` up. `main.js`'s `rigProject` is those two lines and
// `assertProjection` proves them against `groundSpace` + `lift` at boot.
//
// **`side` is the body's left and the two lines say so.** Facing the viewer
// (`b = 0`) a point at `side = +1` lands at `bx = +1`, which is the *right* of
// the screen -- which is where a person's left hand is when they are looking at
// you. The plan's draft of these lines carried the opposite sign on both `side`
// terms while its prose said "left"; the pair above is the self-consistent one
// and the mirror is how you check it in your head.
//
// Three things fall straight out and they are what make this cheap:
//
//   1. **The depth key is the y term's numerator**, `along cos b + side sin b`.
//      It is the segment's offset along the camera axis, it is the same quantity
//      `bodyDepth` sorts whole bodies on, and it is continuous in the facing --
//      **so there is no z-order table.** Sort ascending and the weapon passes
//      behind the torso as the figure turns away because the arithmetic says so,
//      with no eight-row table and nothing to get wrong at facing 44 degrees. If
//      a segment pops at a facing boundary the key is mis-signed.
//   2. **Things further from the camera sit higher on the screen**, by exactly
//      half the depth key. `by = depth / 2 - height / ex`. That is a genuine 3D
//      read out of a 2D rig and it costs nothing.
//   3. **`height / ex` is the expression `uprightTop` already uses**, so a
//      segment declared at `height = BODY_H[kind]` has its top edge exactly at
//      the crown the health bar, the pick box and the hero outline all measure
//      from. Nothing is typed twice, and per-archetype proportions stay in
//      `BODY_H` and `HEADS` -- a second copy of a Brute's height in here is how
//      the art and the health bar drift apart.
//
// ---------------------------------------------------------------------------
// WHAT THE ROWS SAY, AND WHAT THEY DELIBERATELY DO NOT
//
// A row is a **segment between two body-local points**, plus a half-width, a
// shape and a tone. One representation for every piece, which is what keeps
// `drawRig` a loop instead of six special cases: a leg, a torso and an arm are
// the same two points with different numbers in them, and an arm that has to
// stretch to reach a weapon's hilt is that same row with its far end replaced.
//
// `h0`/`h1` are **fractions of the archetype's shoulder height**, not radii.
// That is the whole of how one table serves a Fighter, a Rogue and a Brute: the
// shoulder comes out of `HEADS` and `BODY_H` through `uprightHeadOf`, so a
// Brute's head sunk in a notch between its shoulders and a Rogue's held clear on
// a neck are already differences this table inherits rather than restates.
//
// **The weapon is not placed by this table at all.** Its row exists so the
// weapon takes part in the depth sort with everything else; where it actually
// goes is the sim's blade segment -- hilt at `radius` along `limbAngle`, tip at
// `radius + actionLength * limbReach`, precisely the segment `World::blade`
// builds and tests against -- projected through the two lines above. Continuous,
// never quantised, and that stays true even if segment art is ever quantised to
// eight facings.
//
// ---------------------------------------------------------------------------
// TWO GRANULARITIES, ONE WALK
//
// A row carries a `granularity`, and the image rig and the fallback rig are
// different shapes **on purpose**. Image generation is unreliable for an
// isolated "far leg of a Brute facing south-east" and reliable for a whole
// figure, so the image rig is coarse -- one composite body layer plus an arm and
// a shield -- while the fallback rig, which is drawn rather than generated,
// stays fully segmented. The articulation that has to be exact is the weapon's,
// and that one is procedural in both.
//
// `art-06` taught the same rows to resolve to a manifest image, and the shape it
// landed in is one `RIG_IMAGE` row per rig -- `RIG_BODY_ROW`, the composite
// body -- resolved through `assets.js` from the row's own `layer` name. **The
// two sets are alternatives, not additions**: when the composite resolves, the
// four fallback body segments are skipped entirely, and getting that wrong draws
// a figure inside a figure. The arm, the shield and the weapon are `RIG_BOTH`
// and stay drawn either way, so a composite sprite with a fallback arm on it is
// a legal, reviewable state rather than a crash -- which is what every
// integration pass looks like halfway through.
//
// **This session ships the fallback, and it is the deliverable rather than a
// placeholder.** If no character sprite is ever delivered this is the shipping
// look, and the standard it is judged against is `art-00`'s reading of the
// concept: figures are small, dark and rim-lit, the detail is in the silhouette
// and not in the interior. Shrink the window until a body is forty pixels tall;
// if the archetype is still identifiable the shape is right, and if it needed
// the detail then the detail was doing the silhouette's job.

/** How a row is drawn: which of the unit paths, the blade's own two strokes, or
 *  a manifest image.
 *
 *  `LIMB` is a segment between two points at a half-width; `DISC` is a circle at
 *  a point; `BLADE` is not a shape here at all -- see the weapon note above;
 *  `SPRITE` is an image from `assets.js`, placed by its cell and its anchor and
 *  not by this table's two points. */
const RIG_LIMB = 0;
const RIG_DISC = 1;
const RIG_BLADE = 2;
const RIG_SPRITE = 3;

/** Which piece a row is, for the poser. The table says *where a piece hangs*;
 *  `drawRig` says *what the sim is doing to it*, and this is the join. */
const RIG_SLOT_LEG = 0;
const RIG_SLOT_TORSO = 1;
const RIG_SLOT_ARM = 2;
const RIG_SLOT_HEAD = 3;
const RIG_SLOT_WEAPON = 4;
const RIG_SLOT_SHIELD = 5;
/** The composite body -- legs, torso and head as **one drawing**, which is the
 *  decision the whole character pipeline turns on. It has no fallback geometry
 *  and never will: the fallback for a composite is the four segments it
 *  replaces, already in the table. */
const RIG_SLOT_BODY = 6;

/** **The composite body is row 0 of every rig**, and it is stated here rather
 *  than searched for because `drawRig` has to know whether the sprite resolved
 *  *before* it walks the four rows the sprite replaces. One index, one lookup,
 *  and the alternative is a scan of the table per body per frame to answer a
 *  question the table's own shape settles. */
const RIG_BODY_ROW = 0;

/** Whether a row is fallback geometry, a slot an image may fill, or both.
 *
 *  `BOTH` is the interesting one and it is the intermediate state a half
 *  integrated Codex batch actually lands in: a composite body sprite with a
 *  fallback arm is legal and expected, and if it reads badly that is a
 *  `FEEDBACK.md` item rather than a code path to forbid. */
const RIG_FALLBACK = 1;
const RIG_IMAGE = 2;
const RIG_BOTH = 3;

/** Which module-scope gradient a row is painted with.
 *
 *  Two, and the split is the one `art-00` reads off the concept: everything is a
 *  near-black silhouette except the head, which is the part nearest the light.
 *  Painting a head dark makes it read as a hole rather than as a head, which is
 *  a lesson this codebase has already learned twice -- once top-down and once
 *  when bodies stood up. */
const RIG_TONE_BODY = 0;
const RIG_TONE_HEAD = 1;
const RIG_TONE_COUNT = 2;

// ------------------------------------------------------------- the unit paths
//
// **Two paths for the whole rig, and that is the point of the space.** Every
// fallback segment is one of these under its own 2x3, so the shapes are built
// once at load and the per-frame work is arithmetic. A `Path2D` per archetype
// per slot would be twenty-four paths that all say "a tapered limb".
//
// **Fills, and no strokes.** `DESIGN.md`'s measurement is unambiguous -- killing
// `stroke()` alone recovered 43 fps while fills, rects, sprites and text were
// collectively free -- and a stroke per segment would be seven new strokes a
// body where there is currently one. The edge definition a stroke was providing
// comes from the fill instead: each segment is a two-stop gradient across its
// own short axis, dark at one edge.

/**
 * A limb: proximal end at `(0, 0)` at full width, distal end at `(0, -1)`,
 * tapered and rounded.
 *
 * Both ends **overshoot** by a twentieth. Joints are butted rather than hinged
 * -- there is no elbow and there should not be, an elbow is invisible at 116 px
 * of Fighter -- so the overshoot is what stops a hip or a shoulder showing a
 * hairline of floor through it when the two pieces are a degree out of line.
 *
 * The taper is not decoration either: a thigh is wider than an ankle and an
 * upper arm than a wrist, and at forty pixels a body that taper is most of what
 * says "limb" rather than "stick".
 */
function rigLimbPath() {
  const p = new Path2D();
  const w = 0.72;
  p.moveTo(-1, 0.05);
  p.lineTo(-w, -0.84);
  p.quadraticCurveTo(-w, -1.05, 0, -1.05);
  p.quadraticCurveTo(w, -1.05, w, -0.84);
  p.lineTo(1, 0.05);
  p.closePath();
  return p;
}

/** The unit circle, for the head and the shield. Scaled to its own radius by the
 *  row's own matrix, so the gradient across `x = -1 .. 1` is the gradient across
 *  the disc, whatever size the disc is. */
function rigDiscPath() {
  const p = new Path2D();
  p.arc(0, 0, 1, 0, Math.PI * 2);
  p.closePath();
  return p;
}

/** The two shapes as **paint table indices**, registered once at load in the
 *  static region -- which is what they are. An item references a shape by index
 *  and knows nothing about what a `Path2D` is; a second backend maps the same
 *  index to a mesh and nothing here changes. */
const RIG_LIMB_PAINT = dlPaintStatic(rigLimbPath());
const RIG_DISC_PAINT = dlPaintStatic(rigDiscPath());

// ---------------------------------------------------------------- the gradients
//
// **Built once per skin, never per body and never per frame.** Two gradients per
// skin against 64 bodies at 60 fps is the difference between four objects for
// the life of the page and seven thousand a second, in a render path whose
// standing discipline is that it allocates nothing. `wedgeFans` hoisted six
// strings on exactly this argument; these are the same argument about paint.
//
// **They live in the *unit* space and not in any body's**, which is what makes
// "once per skin" possible at all: a gradient from `x = -1` to `x = +1` is the
// gradient across whatever the row's own matrix makes of that interval, so one
// object serves every segment of every body at every zoom.
//
// **That rests on a measurement rather than on a reading of the spec.** Canvas2D
// resolves a gradient's coordinates against the CTM in force **when it is
// painted**, not when it is created: a gradient built at the identity and filled
// under `translate(20, 0)` lands at 20..30, and one built under `translate(30,
// 0)` and filled at the identity lands at 0..10. Both checked in the page, in
// Chrome, before a line of this was written. `dlLinearGradient`'s replay of the
// open transforms is therefore belt and braces rather than the load-bearing
// thing its comment supposes, and `drawCharacter`'s flat arm -- which builds its
// body gradient before a rotation "so the light stays where the room's light is"
// -- is describing an effect it does not get. Recorded rather than acted on: the
// flat arm is reachable only from a top-down *art* mode that no `VIEW_MODES` row
// selects, and this session's gate is that the two flat views do not move.

/** Per-skin ink sets, keyed on the skin object itself.
 *
 *  A `Map` and not a field written onto the skin: a skin is a frozen-in-spirit
 *  palette table shared by six call sites, and a renderer that mutates one is a
 *  renderer that has made the palette its own private cache. One `Map.get` per
 *  *body* per frame -- not per segment -- which is 64 lookups in the worst room
 *  the caps allow. */
const RIG_INKS = new Map();

/**
 * Where the body ramp's far stop sits, in unit-path x.
 *
 * A segment spans `x = -1 .. 1`, so a ramp declared out to 2.4 reaches only
 * `(1 + 1) / (2.4 + 1)` = **0.59 of the way to its lit stop** anywhere on the
 * piece -- the rest of the ramp falls off the end of the shape and is never
 * painted. One number instead of a third colour constant per skin, and it
 * carries the whole argument for why the figures stay dark: `body[1]` is where
 * the ramp is *aimed* so that a lit edge is the right hue, and 0.59 of the way
 * there is how far it is allowed to get.
 *
 * Tuned at forty pixels a body against the concept, where the test is that the
 * fill still reads as near-black beside the head and the rim, and the segment
 * boundaries still exist. `1` -- the whole ramp -- puts a Brute in daylight.
 */
const RIG_RAMP = 2.4;

/**
 * Build the gradient pair for each skin, once.
 *
 * Called from `boot` after `dlBind`, because a gradient needs a context to
 * exist and this file loads before anything has one. Idempotent, so calling it
 * twice is free rather than a second set of table entries.
 *
 * `backdrop` is the room's own darkness -- `PAL.void` -- passed in rather than
 * read, because a palette is `main.js`'s and this file's whole claim is that it
 * knows nothing it was not handed.
 *
 * **Dark at `x = -1`, lit at `x = +1`.** The rim light runs the same way (its
 * gradient is `-0.7 -> 1.05` with the alpha climbing), so an unrotated segment
 * agrees with the body's own lit edge. A segment at a steep angle does not, and
 * that is accepted: at this size the ramp is doing *edge definition* -- the job
 * the stroke used to do -- rather than claiming a light direction, and a ramp
 * that tracked the room's light per segment would be a per-frame gradient.
 */
function rigBuildInks(skins, backdrop) {
  for (const skin of skins) {
    if (RIG_INKS.has(skin)) continue;
    const inks = new Array(RIG_TONE_COUNT);
    // The void to the skin's mid tone, **and only the first 59 per cent of that
    // ramp is ever on a segment** -- see `RIG_RAMP`.
    //
    // The plan asked for `deep` to the void and drawn that way the parts
    // vanished: `deep` is `#141c22` on the hero and `#1c1410` on a monster, the
    // void is `#0b0a08`, and over the near-black base fill underneath them a
    // body came out as one undifferentiated hole with a bright rim round it --
    // no legs, no arms, no read at any size. The ramp has to run from the base
    // *upward* for a segment boundary to exist at all. Run the whole way to
    // `body[1]` and the figures stop being near-black, which is the one thing
    // `art-00` is unambiguous about; `RIG_RAMP` is what buys both.
    inks[RIG_TONE_BODY] = dlGradientStatic(-1, 0, RIG_RAMP, 0, backdrop, skin.body[1]);
    // The head stays in the pale end. See `RIG_TONE_HEAD`.
    inks[RIG_TONE_HEAD] = dlGradientStatic(-1, 0, 1, 0, skin.body[1], skin.body[0]);
    RIG_INKS.set(skin, inks);
  }
}

/** The ink set for a skin, or `null` for one nobody built. `drawRig` resolves it
 *  once per body and indexes it per segment. */
function rigInksOf(skin) {
  const inks = RIG_INKS.get(skin);
  return inks === undefined ? null : inks;
}

// ------------------------------------------------------------------ the rigs
//
// A row, field by field:
//
//     slot          which piece, for the poser
//     shape         RIG_LIMB | RIG_DISC | RIG_BLADE
//     grain         RIG_FALLBACK | RIG_IMAGE | RIG_BOTH
//     tone          which of the two gradients
//     side          body-local side, in radii. Signed: + is the body's left
//     a0, h0        proximal end -- along in radii, height as a fraction of the
//                   archetype's shoulder height
//     a1, h1        distal end, same units
//     wide          half-width in radii; for a DISC, the radius as a multiple of
//                   the archetype's own head radius
//     swing         how far the distal end travels fore and aft over one stride,
//                   in radii. Zero for anything that does not walk
//     phase         where in the stride cycle this piece is, in turns. The pair
//                   of legs is one row written twice at 0 and 0.5
//     main          the arm the weapon is in. Exactly one row per rig has it
//     layer         for a RIG_IMAGE row only: which layer of the manifest's
//                   actor entry fills it. The one string in this file, and it is
//                   a *slot name* rather than a filename -- which file it
//                   resolves to, at which facing and which frame, is
//                   `manifest.json`'s business and `assets.js`'s

/**
 * Fighter, Rogue and Brute: a thing that stands on two legs.
 *
 * Six fallback segments plus the weapon and, for a `Role::Guard`, a shield. The
 * hip sits at 0.44 of the shoulder and the torso starts a little below it, so
 * the two overlap rather than meeting -- see `rigLimbPath` on butted joints.
 *
 * **The legs are one row written twice**, at opposite stride phase and opposite
 * side, which is what makes "the far leg is the near leg half a cycle ago" a
 * property of the data rather than of two blocks of code that have to be kept in
 * step. Same for the arms, and the arms swing against the legs -- `armMain` is
 * on the legs' phase 0 row and sits opposite `legNear`, because a body whose
 * right arm and right leg go forward together is a body marching like a toy.
 */
const RIG_UPRIGHT = [
  // **The composite, and the four rows under it are its alternatives rather
  // than its neighbours.** When `art-06`'s loader resolves this layer, the two
  // legs, the torso and the head are skipped entirely and what is left of the
  // rig is the arms, the shield and the weapon -- which is exactly the state a
  // half-integrated batch lands in, and it is legal. Drawing both is a figure
  // inside a figure.
  //
  // Its own two points are the origin, so its depth key is zero: the body axis
  // itself. Everything else sorts around it on the sign of its own key, which
  // is how an arm passes behind the body as the figure turns away with no table
  // to get wrong.
  { slot: RIG_SLOT_BODY, shape: RIG_SPRITE, grain: RIG_IMAGE, tone: RIG_TONE_BODY, layer: "body",
    side:  0.00, a0: 0, h0: 0.00, a1: 0, h1: 0.00, wide: 0.00, swing: 0.00, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_LEG, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side:  0.38, a0: 0, h0: 0.46, a1: 0, h1: 0.00, wide: 0.22, swing: 0.42, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_LEG, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side: -0.38, a0: 0, h0: 0.46, a1: 0, h1: 0.00, wide: 0.22, swing: 0.42, phase: 0.5, main: 0 },
  // **Shoulder-down and not hip-up**, which is the one row in the table where
  // which end is `0` decides what the piece looks like: `rigLimbPath` is at full
  // width at its proximal end and tapered at its distal one, so a torso written
  // the other way round is a body with a wasp waist and hips like a bell. It
  // reads as a blob at any size, and it swallowed the legs and both arms whole
  // the first time this table was drawn.
  { slot: RIG_SLOT_TORSO, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side:  0.00, a0: 0, h0: 1.02, a1: 0, h1: 0.34, wide: 0.46, swing: 0.00, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_ARM, shape: RIG_LIMB, grain: RIG_BOTH, tone: RIG_TONE_BODY,
    side:  0.62, a0: 0, h0: 0.94, a1: 0.10, h1: 0.44, wide: 0.14, swing: 0.24, phase: 0.5, main: 0 },
  { slot: RIG_SLOT_ARM, shape: RIG_LIMB, grain: RIG_BOTH, tone: RIG_TONE_BODY,
    side: -0.62, a0: 0, h0: 0.94, a1: 0.10, h1: 0.44, wide: 0.14, swing: 0.24, phase: 0.0, main: 1 },
  // The head. `a0` is the only forward offset in the table and it is a twentieth
  // of a radius -- about a pixel and a half at default framing -- which is
  // enough to say "this end is the front" and not enough to lift the crown off
  // `uprightTop`, which the health bar hangs from.
  { slot: RIG_SLOT_HEAD, shape: RIG_DISC, grain: RIG_FALLBACK, tone: RIG_TONE_HEAD,
    side:  0.00, a0: 0.05, h0: 0, a1: 0.05, h1: 0, wide: 1.00, swing: 0.00, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_SHIELD, shape: RIG_DISC, grain: RIG_BOTH, tone: RIG_TONE_BODY,
    side:  0.70, a0: 0, h0: 0.60, a1: 0, h1: 0.60, wide: 1.55, swing: 0.00, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_WEAPON, shape: RIG_BLADE, grain: RIG_BOTH, tone: RIG_TONE_BODY,
    side:  0.00, a0: 0, h0: 0, a1: 0, h1: 0, wide: 0.00, swing: 0.00, phase: 0.0, main: 0 },
];

/**
 * The Skitterer: a thing that runs along the floor.
 *
 * **It is wider than it is tall.** 0.33 world units of height against 73 px of
 * width at default framing, which is why it gets a low body carried on splayed
 * legs and a head held out in front rather than a short Fighter. That is the
 * same read `skittererUprightPath` draws as one outline and this is that outline
 * cut into pieces -- which was most of the fallback work in this session.
 *
 * Four legs and not six. The top-down silhouette has six because from directly
 * above all six are visible and the fan is the whole shape; from the side the
 * near three occlude the far three almost exactly, so six rows would be two
 * extra draw calls a body to draw pixels that are already there. The pairs run
 * on opposite stride phases, which is what makes it scuttle.
 */
const RIG_CRAWLER = [
  // The composite, on `RIG_UPRIGHT`'s terms and at `RIG_BODY_ROW`. No Skitterer
  // art exists, so it resolves to nothing and the four legs, the abdomen and
  // the head below are what draws -- which is the point of the row being data:
  // the archetype that has art and the archetype that does not take the same
  // path through `drawRig`.
  { slot: RIG_SLOT_BODY, shape: RIG_SPRITE, grain: RIG_IMAGE, tone: RIG_TONE_BODY, layer: "body",
    side:  0.00, a0: 0, h0: 0.00, a1: 0, h1: 0.00, wide: 0.00, swing: 0.00, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_LEG, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side:  0.52, a0: 0.30, h0: 0.95, a1: 0.98, h1: 0.00, wide: 0.15, swing: 0.34, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_LEG, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side: -0.52, a0: 0.30, h0: 0.95, a1: 0.98, h1: 0.00, wide: 0.15, swing: 0.34, phase: 0.5, main: 0 },
  { slot: RIG_SLOT_LEG, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side:  0.52, a0: -0.35, h0: 0.95, a1: -0.95, h1: 0.00, wide: 0.15, swing: 0.34, phase: 0.5, main: 0 },
  { slot: RIG_SLOT_LEG, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side: -0.52, a0: -0.35, h0: 0.95, a1: -0.95, h1: 0.00, wide: 0.15, swing: 0.34, phase: 0.0, main: 0 },
  // The body, lying along the facing rather than standing up it -- the one row
  // in either table whose two ends differ in `along` and not in `height`. The
  // limb path's taper points forward, which is the abdomen narrowing toward the
  // neck.
  //
  // **`wide` is the one number in either table that has to be read as a *screen*
  // half-width rather than as a thickness**, and this is the row where the
  // difference bites. A half-width is applied perpendicular to the segment in
  // billboard space, so on every upright row -- all of which stand up the
  // `height` axis -- it comes out horizontal, against a body two units wide. On
  // this one the axis is `along`, so at the profile facings the perpendicular is
  // *vertical*, against a Skitterer only 0.778 units tall. Drawn at 0.42 the
  // abdomen came out 0.846 units thick on a 0.778-unit body and hung 0.132 below
  // the floor plane: a hard-edged plank leaning on the creature at six of the
  // eight facings, and the one archetype that failed the forty-pixel test.
  //
  // 0.26 is the roundest number that keeps the whole quad inside the band the
  // body actually occupies -- measured at the profile, it runs -0.554 to -0.028,
  // so it clears the floor and stops at 71 per cent of the crown. The quad first
  // touches the floor plane at about 0.29, which is the ceiling this is under.
  // Head-on it is still 1.7 times the head's own width, and the splayed legs and
  // the silhouette underneath carry the rest.
  { slot: RIG_SLOT_TORSO, shape: RIG_LIMB, grain: RIG_FALLBACK, tone: RIG_TONE_BODY,
    side:  0.00, a0: -0.72, h0: 0.98, a1: 0.55, h1: 1.00, wide: 0.26, swing: 0.00, phase: 0.0, main: 0 },
  { slot: RIG_SLOT_HEAD, shape: RIG_DISC, grain: RIG_FALLBACK, tone: RIG_TONE_HEAD,
    side:  0.00, a0: 0.30, h0: 0, a1: 0.30, h1: 0, wide: 1.00, swing: 0.00, phase: 0.0, main: 0 },
  // A Skitterer has no arm and no shield -- the sim gives it a bite, and the
  // blade segment that bite is comes out of `limbAngle` like anybody else's.
  { slot: RIG_SLOT_WEAPON, shape: RIG_BLADE, grain: RIG_BOTH, tone: RIG_TONE_BODY,
    side:  0.00, a0: 0, h0: 0, a1: 0, h1: 0, wide: 0.00, swing: 0.00, phase: 0.0, main: 0 },
];

// --------------------------------------------------------------- the numbers
//
// Everything below is presentation and every one of them is a *fraction* of
// something the sim owns, so none of them is a mirrored constant. Tune by eye at
// forty pixels a body, which is the size the shapes have to survive.

/** How high the hand rides, as a fraction of the shoulder.
 *
 *  Not the shoulder itself: a hand held at shoulder height reads as a salute.
 *  This is the height the *blade* is lifted to as well, so it is also the height
 *  the blade's floor shadow is offset from -- and the shadow is what keeps the
 *  hitbox findable once the bright thing has left the ground. */
const RIG_HAND = 0.80;

/** How far the body drops at the extremes of a stride, as a fraction of its own
 *  height, at full walk.
 *
 *  A *fraction* and not a length, because the same table serves a Brute 1.89
 *  world units tall and a Skitterer 0.33: a fixed drop would be a nod on one and
 *  a collapse on the other. Twice the stride's frequency, because a body bobs
 *  once per *foot* and there are two of them. Small on purpose -- a bob you can
 *  actually see is a bob that reads as a limp. */
const RIG_BOB = 0.022;

/** How far a foot comes off the floor on the forward half of its own swing, as a
 *  fraction of the shoulder height. Without it the feet slide and the walk reads
 *  as a body on castors; much more than this and it reads as a march. */
const RIG_FOOT = 0.09;

/**
 * The idle breath: how far the upper stack rises, as a fraction of its own
 * height, and how long one cycle takes.
 *
 * **The one thing in the rig that reads the wall clock, and it is the one thing
 * that has no sim quantity to read instead.** Everything else here is a function
 * of `progress`, `stride` or `limbAngle`, and the reason is not that clocks are
 * forbidden -- it is that a pose which contradicts a number the sim measures is
 * a pose that lies to the player. A Brute's 33-tick windup timed by `now` would
 * misrepresent phase; a chest rising on a body that is standing at guard with
 * zero velocity misrepresents nothing, because there is nothing there to
 * contradict. The plan's blanket "no pose is a function of `now`" was the right
 * rule stated one word too wide, and it deleted its own acceptance test 5. The
 * rule is: **no pose may be a function of `now` where a sim quantity governs
 * it**, and this is the named exception.
 *
 * **The scope is structural rather than promised.** `drawRig` computes the
 * amplitude as zero unless the limb is at guard or mid-swap *and* the walk
 * amplitude has faded out, and applies it to the torso and head rows alone. So
 * it cannot ride on top of a windup, a strike or a stride; it cannot reach the
 * hand height the hilt is measured from, the blade, the shield or the legs; and
 * because it scales heights rather than offsetting them, the feet cannot move.
 *
 * 0.012 of the height is chosen so that the *only* thing it can be mistaken for
 * is being alive. Measured as the crown's peak-to-peak travel at default
 * framing: a Fighter 2.3 px on a 109 px body, a Rogue 2.0 on 91, a Brute 3.3 on
 * 153 -- about two per cent of height either way. A Skitterer gets 0.5 px on 27,
 * which is under a pixel and stays that way: it is a fraction of a stack that is
 * barely a stack, exactly as `RIG_BOB` is, and inflating it for the one body
 * that is mostly legs would be inventing a heave.
 *
 * The amplitude is also what bounds the one discontinuity in this: the gate on
 * the swing phase is a step, so a body that starts a windup drops its breath in
 * a single frame, and the amplitude is the whole of how far it can drop. Two
 * pixels, in the frame the amber declared line arrives in, is not a pop anybody
 * can see.
 *
 * 3400 ms is a resting breath, twelve to eighteen a minute. Milliseconds and not
 * frames for `CAMERA_TAU_MS`' reason: a frame-count cycle would breathe half
 * again as fast on a 144 Hz panel.
 *
 * The stagger is in turns per entity id, and it is why a room does not breathe
 * in unison -- which reads as machinery rather than as a crowd. An irrational
 * multiplier so that ids one apart are not near-neighbours in phase; the golden
 * ratio's fractional part is the standard one and there is no reason to invent
 * another.
 */
const RIG_BREATH = 0.012;
const RIG_BREATH_MS = 3400;
const RIG_BREATH_STAGGER = 0.6180339887498949;

/** How far past the hand a shield sits, in radii. Just clear of the fist, so the
 *  disc reads as held rather than as a growth. */
const RIG_SHIELD_OUT = 1.15;

/** The walk amplitude reaches full at this much speed per radius per tick.
 *
 *  **Speed and not a differenced stride, and that is a correction to the plan.**
 *  The plan asked for `strideRate` differenced across frames in `syncBodies`;
 *  `readUnit`'s own comment on the velocity columns is the argument against it,
 *  and it is the better argument: "a frame is up to `MAX_CATCHUP_TICKS` ticks
 *  and often none, so a page-side difference would be measuring rAF's jitter as
 *  much as the body's feet." `vx`/`vy` are in the frame precisely so nobody has
 *  to. The property the plan wanted is kept intact and comes out stronger --
 *  `stride` and this are driven by the *same* quantity in the module
 *  (`speed / (radius * STRIDE_PER_RADIUS)` per tick), so a body that is walled,
 *  shoved to a stop or simply standing has legs that stop with it, with no
 *  mirrored `move_speed` anywhere and no cross-frame state at all.
 *
 *  Divided by the radius for the reason `STRIDE_PER_RADIUS` is: a Brute's stride
 *  is longer than a Skitterer's because a Brute is bigger. 0.05 is a little over
 *  half a Fighter's own 0.082 per tick, so anything genuinely walking is at full
 *  amplitude and only a body easing to a halt eases out of its walk. */
const RIG_WALK_FULL = 0.05;

/** How far the leaning stack is allowed to travel, in radii, and how much
 *  acceleration counts as all of it.
 *
 *  **Garnish, and the rule about garnish is absolute: it may never misrepresent
 *  reach, bearing or phase.** The lean moves the torso and the head. It does not
 *  move the shoulder point the weapon's hilt is measured from, and it does not
 *  touch the blade. Clamped hard for that reason and not for taste -- an
 *  unclamped lean on a shove would put a figure through its own collision ring.
 */
const RIG_LEAN = 0.30;
const RIG_LEAN_FULL = 0.012;

/** How quickly the lean chases the acceleration, as a time constant in
 *  milliseconds. A frame-count ease would lean differently on a 60 Hz panel and
 *  a 144 Hz one, which is the bug `CAMERA_TAU_MS` exists to not have. */
const RIG_LEAN_MS = 90;

/** The windup brace, in radii: how far the upper stack settles back over a
 *  windup and comes through on the strike.
 *
 *  **A pure function of `progress`, which is what makes a Brute's 33-tick windup
 *  visibly last 33 ticks.** `progress` is `1 - swingLeft / swingSpan`, straight
 *  off the frame, so nothing here is timed by the wall clock and a paused world
 *  holds the pose it was in. A body that cannot be told a windup from a recovery
 *  is a body whose whole game is invisible, and this is that tell in the
 *  silhouette rather than only in the blade. */
const RIG_BRACE = 0.26;

/** How far a shove squashes and tips the stack, at full recoil.
 *
 *  **It must not translate the feet.** The body's ground point is
 *  `projX(unit.x, unit.y)` and the sim has already moved it -- the shove *is*
 *  the position change. Offsetting the art on top of that would double the
 *  displacement and stand the figure off its own collision ring, which is the
 *  one mark on the floor house rule 4 says may never lie. So this scales heights
 *  and tips `along`, both of which are zero at the feet by construction. */
const RIG_RECOIL_TIP = 0.34;
const RIG_RECOIL_SQUASH = 0.10;

/** How long a shove's recoil takes to decay, in milliseconds. Aged on the
 *  paused-aware clock with the floaters and the corpses, so a frozen world does
 *  not quietly finish somebody's flinch while the player is looking at it. */
const RIG_RECOIL_MS = 200;

/** The impulse below which a shove is not a flinch.
 *
 *  **`EVENT_SHOVE` is by far the highest-rate row in the feed** -- measured at
 *  about 5.7 a tick and nine rows in ten of everything the frame carries -- and
 *  almost all of them are `World::apply_recoil` billing a fighter for its own
 *  swing. A blow landing is rare and large; a recoil is constant and small. The
 *  module's own doc says a consumer wants a magnitude threshold and that
 *  `amount` is there so it can have one, so this is that threshold rather than a
 *  number somebody liked. Without it every swinging body twitches continuously.
 *
 *  **The number is the gap between two measured populations, and the first one
 *  written here was above both of them** -- 0.035, which fired zero flinches in
 *  23,532 rows. `amount` is a velocity gain in world units per tick, and over
 *  four runs of 900 frames with six monsters in the room the feed splits by
 *  `other`:
 *
 *  | `other`               | rows   | median  | max    |
 *  |---|---|---|---|
 *  | `255` -- its own swing | 23,532 | 0.0010  | 0.0028 |
 *  | somebody              |     36 | 0.0184  | 0.0296 |
 *
 *  Two orders of magnitude apart with nothing in between, so anything in
 *  0.003..0.007 is the same threshold; this sits in the middle of that gap. A
 *  longer sample does put the odd own-recoil as high as 0.015, which is why the
 *  gate is a floor rather than a claim that the two never overlap: the price of
 *  being wrong is that the heaviest swing in the room occasionally rocks the
 *  body that threw it, which is not a lie about anything.
 */
const RIG_SHOVE_FLOOR = 0.005;
