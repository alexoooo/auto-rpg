// The arena's geometry, with no Babylon in it.
//
// Everything here is arithmetic over what `sim` published: where the eye sits,
// which regions are drawn, where a capsule's two ends are, and how a world
// coordinate becomes a scene coordinate. It is a separate file from `scene.ts`
// because these are the answers a test can check exactly -- the axis mapping,
// the viewport rectangles, the eye -- and a Babylon `Scene` is a poor place to
// ask an arithmetic question.
//
// **Raw units are divided by 65536 exactly once, in `scenePoint`.** Everything
// upstream of that stays on the integers the simulation decided on, which is the
// same rule `fight/trace.ts` states for the 2D panels.

import { interpolateAngle } from "../render/interpolation.js";
import {
  add, at, scale, shieldCorners, sub,
  type Arm, type Pose, type Region, type Segment, type ShieldFace, type V3,
} from "../fight/trace.js";

const ONE = 65536;
const TAU = Math.PI * 2;

/** A Babylon-space point: metres, `y` up. Not a `Vector3` -- this file has no Babylon. */
export type ScenePoint = readonly [number, number, number];

// ------------------------------------------------------------ the axis mapping

/**
 * World `(x, y, height)` becomes scene `(x, height, -y)`.
 *
 * **The negated `y` is the whole of the handedness argument, and it is a
 * deliberate departure from `ActorPresentation#pose` in `render/actors.ts`,
 * which now carries the other half of this note.** That file draws the legacy
 * world, whose 2D authority `web/main.js` runs `+y` *down* the screen; against
 * that convention `(x, y) -> (x, z)` is orientation-correct and nobody has ever
 * seen a mirrored greybox because a cylinder has no chirality to mirror.
 *
 * This page's authority is `fight/view.ts`, which runs `+y` **up** the screen and
 * explains at length why: `actuator::shoulder` puts `LimbSlot::LeftArm` at
 * `(-sin yaw, cos yaw) * half_width`, which is a body's anatomical left only
 * under a right-handed frame with `y` up. Copy the greybox mapping into a
 * right-handed Babylon scene and the determinant of `(x, y, z) -> (x, z, y)` is
 * **-1**: the picture is a mirror, and a Fighter facing screen-right in the plan
 * holds its shield on the wrong side of its body in the 3/4 view. That is the
 * exact failure the right-handed scene exists to prevent, so the sign that
 * prevents it lives here, with a test that asserts the determinant is +1.
 *
 * Yaw follows from the same choice. Babylon's `rotation.y = phi` takes local `+x`
 * to `(cos phi, 0, -sin phi)`; world forward `(cos yaw, sin yaw)` maps to
 * `(cos yaw, 0, -sin yaw)`; so the scene yaw is `+yaw` and **not** the negated
 * yaw the greybox uses. The two go together and neither is meaningful alone.
 */
export function scenePoint(v: V3): ScenePoint {
  return [v[0] / ONE, v[2] / ONE, -v[1] / ONE];
}

/** A raw world length in scene units. Uniform: the mapping is a rotation. */
export function sceneLength(raw: number): number {
  return raw / ONE;
}

/** The body's one rotation, in radians, as the scene turns about `y`. */
export function sceneYaw(rawYaw: number): number {
  return (rawYaw / ONE) * TAU;
}

/**
 * Where the body is looking, level, as a unit scene direction.
 *
 * **The body's own heading and not the camera's gaze.** The two differ by the
 * constant mount angle of `FIRST_PERSON_PITCH_DEGREES`, which belongs to the rig
 * rather than to the fighter; this is the one rotation the model actually has,
 * and it is what the camera's gaze projects onto the horizontal plane as.
 *
 * The first-person camera is turned by writing `camera.rotation.y`, which is
 * Babylon's own convention and half a turn away from this one. That makes this
 * function the independent statement of the same fact, and
 * `the_first_person_camera_sits_at_the_eye_and_keeps_one_fixed_mount_angle_at_
 * every_yaw` checks the two against each other rather than trusting either on
 * its own.
 */
export function sceneForward(rawYaw: number): ScenePoint {
  const yaw = sceneYaw(rawYaw);
  return [Math.cos(yaw), 0, -Math.sin(yaw)];
}

// ------------------------------------------------------------ the eye

/**
 * The eye: the centre of the **published** head capsule.
 *
 * Not `anatomy.standingHeight` and not `AnatomyRegionSpec::half_height`.
 * `body_region_volumes` builds the head with coincident endpoints, so the head's
 * whole extent is its `radius` and its half-height is dead for that region; a
 * camera placed from the anatomy row would sit wrong by whatever the difference
 * happened to be. On `fight.json` the Fighter's head capsule is a point at
 * `z = 111411` (1.700) with `radius = 13107` (0.200) under a `standingHeight` of
 * `117964` (1.800), so the two answers differ by a tenth of a body.
 */
export function eyeOf(pose: Pose): V3 {
  const head = at(pose.regions, 0);
  return [
    (head.lower[0] + head.upper[0]) / 2,
    (head.lower[1] + head.upper[1]) / 2,
    (head.lower[2] + head.upper[2]) / 2,
  ];
}

/**
 * The regions this first-person camera must not draw, because it is inside them.
 *
 * The eye is the head capsule's centre, so the head always contains it. The
 * torso reaches within a fifth of a unit of it and is a third of a unit thick --
 * on `fight.json` the Fighter's torso runs to `z = 98303` (1.500) at
 * `radius = 22937` (0.350) under an eye at 1.700 -- so the eye is inside that one
 * too. Drawing a capsule you are inside of is not a view of anything: with back
 * faces culled it is invisible, with them not culled it is a wall of colour, and
 * either way the near plane starts slicing it. Everything else -- the arms, the
 * legs, the hands, the weapons and the shield -- is what the panel exists to
 * show and is left alone.
 */
export const OWN_BODY_HIDDEN_REGIONS: readonly number[] = Object.freeze([0, 1]);

// ------------------------------------------------------------ what is drawn

/**
 * A region is drawn when the simulation says it is there.
 *
 * Two rules, and they are the same rule: `present` is false for a region the
 * body does not have, and a set bit in `severed` is a region it no longer has.
 */
export function regionDrawn(pose: Pose, index: number): boolean {
  const region = pose.regions[index];
  if (region === undefined || !region.present) return false;
  return (pose.severed & (1 << index)) === 0;
}

/**
 * The region a limb's own capsule is, in `BodyPart` order.
 *
 * `regionNames` is head, torso, leftArm, rightArm, legs and `severed`'s bits are
 * numbered the same way, so limb `n` is region `n + 2`. Written down once
 * because everything a hand carries has to be gated on it and a body part
 * counted from the wrong end draws a wrong picture rather than crashing.
 */
export const ARM_REGIONS: readonly [number, number] = Object.freeze([2, 3]);

/**
 * Whether this arm is still on the body, and so whether what it holds is drawn.
 *
 * A hand, a weapon and a shield hang off an arm, and a `Pose` carries an arm row
 * per limb whether or not the limb is there, so the hand of an arm that is gone
 * is still a published point. The simulation is not confused about this --
 * `build_contact_colliders` masks a severed arm's volume *and* its grip out of
 * the sweep, saying in as many words that "a sword swinging on its own is what
 * leaving it out looks like" -- and the panel must not be either. A hand and a
 * gold plate floating with nothing between them and the shoulder is a shape
 * nothing swept.
 *
 * No fixture reaches this: all three recordings carry zero `severed` bits and no
 * absent region, which is why it is checked in
 * `a_severed_or_absent_region_leaves_no_mesh_and_no_count_behind` and nowhere on
 * screen.
 */
export function armDrawn(pose: Pose, limb: 0 | 1): boolean {
  return regionDrawn(pose, ARM_REGIONS[limb]);
}

/**
 * Which arm holds the shield, out of the published points and nothing else.
 *
 * `World::derive_shield_pose` writes `centre: self.arms[i][limb].hand`, so the
 * face's centre **is** the holding hand, exactly, in raw units. That makes this
 * an integer comparison over two published quantities rather than a guess about
 * which side a plate is on -- which matters because the pose carries no limb for
 * the shield and {@link armDrawn} needs one. It holds on every published pose of
 * the three fixtures that carries one: **10542 of 10542** put the plate's centre
 * on limb 0's hand to the raw unit, over 21083 poses. (This said 10803 of 10803
 * when v2-ui-02 measured it; `web/fight-learned.json` was re-recorded on
 * 2026-08-11 and is 523 poses shorter. The invariant is unchanged and the count
 * is not -- see the note under `FIRST_PERSON_FOV_DEGREES` for which of this
 * file's other fixture-derived numbers that re-recording reaches.)
 *
 * Null when neither hand is at the centre, and the caller then draws the shield
 * anyway. `release_severed_grips` drops what a severed arm was holding before
 * the pose is published, so no recorded trace can reach that branch; it is there
 * for a future shield carried somewhere other than at the hand, where quietly
 * deleting a published shape would be the worse of the two failures.
 */
export function shieldLimb(pose: Pose, shield: ShieldFace): 0 | 1 | null {
  for (const limb of [0, 1] as const) {
    const hand = pose.arms[limb].hand;
    if (hand[0] === shield.centre[0] && hand[1] === shield.centre[1] && hand[2] === shield.centre[2]) {
      return limb;
    }
  }
  return null;
}

/**
 * A capsule as the pieces that draw it: two end spheres and a shaft between.
 *
 * **Not one stretched capsule mesh.** A Babylon capsule scaled along its own
 * axis squashes its hemispherical caps, and the caps are exactly where the
 * contact phase put the surface -- a shortened arm would be drawn with flattened
 * ends that the sweep never had. A cylinder plus two spheres is the union the
 * simulation means, and with a depth buffer and no transparency the parts of the
 * spheres inside the cylinder are simply never seen.
 *
 * A degenerate capsule -- the head, which `body_region_volumes` builds with
 * coincident endpoints -- is one sphere and no shaft, rather than two coincident
 * spheres and a zero-length cylinder whose axis has no direction.
 */
export type CapsuleParts = Readonly<{
  lower: ScenePoint;
  /** Null when the endpoints coincide, which is the head's normal state. */
  upper: ScenePoint | null;
  /** Null when there is no length to draw a shaft over. */
  shaft: Readonly<{ centre: ScenePoint; direction: ScenePoint; length: number }> | null;
  radius: number;
}>;

const DEGENERATE = 1e-9;

export function capsuleParts(lowerRaw: V3, upperRaw: V3, radiusRaw: number): CapsuleParts {
  return capsuleBetween(scenePoint(lowerRaw), scenePoint(upperRaw), sceneLength(radiusRaw));
}

/**
 * The same decomposition over two points that are already in scene space.
 *
 * The proxy's invented pieces -- the two halves of an elbowed arm, the two legs
 * split out of the one published capsule -- are computed in scene units and have
 * no raw form to be divided from, so they arrive here rather than at
 * {@link capsuleParts}. One decomposition either way, so a capsule cannot be
 * built two different ways on the same page.
 */
export function capsuleBetween(lower: ScenePoint, upper: ScenePoint, radius: number): CapsuleParts {
  const dx = upper[0] - lower[0];
  const dy = upper[1] - lower[1];
  const dz = upper[2] - lower[2];
  const length = Math.hypot(dx, dy, dz);
  if (length <= DEGENERATE) {
    return Object.freeze({ lower, upper: null, shaft: null, radius });
  }
  return Object.freeze({
    lower,
    upper,
    shaft: Object.freeze({
      centre: [(lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, (lower[2] + upper[2]) / 2] as ScenePoint,
      direction: [dx / length, dy / length, dz / length] as ScenePoint,
      length,
    }),
    radius,
  });
}

/**
 * The shield's four corners, in scene space, in `shield_face`'s own order.
 *
 * `shieldCorners` is called rather than re-derived, so the 3D face and the 2D
 * face are the same four points and a drift between them is impossible rather
 * than merely unlikely. Its mixed units are the reason it is worth reading
 * before use: `thickness` and `halfWidth` scale unit vectors and are divided by
 * 65536 in there, while `halfHeight` rides a raw-space basis vector and is used
 * raw. Nothing here second-guesses that.
 */
export function shieldQuad(shield: ShieldFace): readonly [ScenePoint, ScenePoint, ScenePoint, ScenePoint] {
  const corners = shieldCorners(shield);
  return [
    scenePoint(corners[0]), scenePoint(corners[1]),
    scenePoint(corners[2]), scenePoint(corners[3]),
  ];
}

// ------------------------------------------------------------ the viewports

/**
 * The three panels, as normalised rectangles with the origin at the bottom left.
 *
 * **These two numbers are also in `web/index.html`'s stylesheet** -- the 3/4
 * label and the mode buttons hang at `left: calc(28% + .5rem)` and the second
 * first-person label at `top: calc(50% + .4rem)` -- and the CSS says in a comment
 * that the two must move together. `the_stage_viewports_match_the_css_that_
 * labels_them` in `client/test/render-contract.test.mjs` reads the percentages
 * back out of the shipped stylesheet and fails if one side is edited alone,
 * because a label sitting over the wrong panel is the cheapest possible symptom
 * and nobody should have to notice it by eye.
 */
export const STAGE_COLUMN_SPLIT = 0.28;
export const STAGE_FIRST_PERSON_SPLIT = 0.5;

export type ViewportRect = Readonly<{ x: number; y: number; width: number; height: number }>;

export const ARENA_VIEWPORTS: Readonly<{
  firstPersonA: ViewportRect; firstPersonB: ViewportRect; threeQuarter: ViewportRect;
}> = Object.freeze({
  // Babylon's viewport origin is the bottom left, the CSS labels' is the top
  // left, which is why the *upper* panel is the one with the offset `y`.
  firstPersonA: Object.freeze({
    x: 0, y: STAGE_FIRST_PERSON_SPLIT,
    width: STAGE_COLUMN_SPLIT, height: 1 - STAGE_FIRST_PERSON_SPLIT,
  }),
  firstPersonB: Object.freeze({
    x: 0, y: 0, width: STAGE_COLUMN_SPLIT, height: STAGE_FIRST_PERSON_SPLIT,
  }),
  threeQuarter: Object.freeze({
    x: STAGE_COLUMN_SPLIT, y: 0, width: 1 - STAGE_COLUMN_SPLIT, height: 1,
  }),
});

// ------------------------------------------------------------ camera constants

/**
 * Ninety degrees on a mount tilted a fixed twenty-five down, and both numbers
 * came out of the recordings rather than out of taste.
 *
 * **The measurement.** The guard is held low and the eye is high -- 1.700 on the
 * Fighter -- so the point of a `weaponShield` contact sits well below a level
 * gaze: 31.5 to 63.9 degrees below it on `fight.json`, 16.5 to 61.2 on
 * `fight-windmill.json`, 14.6 to 65.9 on `fight-learned.json`, with medians of
 * 46.5, 46.3 and 49.9. The panel exists to answer "did the plate cover the
 * club", so whether it can answer at all is exactly the question of whether that
 * point is in the frustum, over the 430, 188 and 54 weapon-shield contacts the
 * three fixtures record.
 *
 * **The test is rectangular, not conical.** `fovMode` is Babylon's default
 * `FOVMODE_VERTICAL_FIXED`, which clips on `|y| <= tan(fov/2) * (-z)` and
 * `|x| <= aspect * tan(fov/2) * (-z)`, where `-z` is the distance along the
 * gaze and not the distance in the horizontal plane. An earlier table here was
 * built with a spherical test and read 8/35/74/91/97 percent at 80/90/100/110/120
 * on `fight.json`; the frustum that actually ships holds far less than that, and
 * a corner is further off the axis than a top edge. Contacts inside, at aspect
 * 0.9956:
 *
 * | mount | lens | fight.json | windmill | learned |
 * |---|---|---|---|---|
 * | level | 80 | 0% | 9% | 13% |
 * | level | 90 | 14% | 28% | 15% |
 * | level | 100 | 52% | 61% | 22% |
 * | level | 120 | 90% | 88% | 59% |
 * | 25 down | 70 | 81% | 85% | 57% |
 * | 25 down | 80 | 93% | 95% | 83% |
 * | **25 down** | **90** | **100%** | **97%** | **94%** |
 * | 35 down | 80 | 99% | 96% | 100% |
 *
 * **Why a constant mount angle is not the pitch the plan ruled out.** The plan
 * argued against pitch because "a camera that pitched would be inventing a
 * degree of freedom the fighter does not have", and that argument is intact and
 * still holds: this body has exactly one rotation, so **nothing here tracks**.
 * A camera that tilted to follow an incoming club would be showing a degree of
 * freedom the model does not have and the reader would believe it. A constant
 * downward mount invents no more than a constant field of view does -- it is a
 * property of the rig, it never varies with anything the fighter does, and it is
 * written down here with the number it was set to.
 *
 * **What it costs, measured rather than assumed.** A tilted horizon reads oddly
 * as first-person, and the honest version of that worry is losing the attacker.
 * The opponent's head, at those same ticks, stays in frame for 97/95/96 percent
 * of them at 25 down and 90, against 100/99/96 for the level 100 this replaces
 * -- so the mount costs the attacker 3 points and 4 points on the first two
 * fixtures and **nothing at all** on the learned one, where the two ticks that
 * lose it lose it at level 100 too, to buy 48, 36 and 72 points of the guard.
 * That is the whole trade and it is not close.
 *
 * What bounds the mount from above is the same measurement. Both bodies stand
 * about 1.17 apart at these ticks and are about the same height, so the
 * opponent's head never rises more than **9.9 degrees** above a level gaze on
 * any of the three fixtures -- and the frustum's top edge is `fov/2 - pitch`
 * above level, which is 20 degrees here and 10 at a 35-degree mount. Tilt that
 * far and the attacker starts leaving the frame: 35 down with a 70 lens holds
 * 93% of the guard and **0%** of the opponent.
 *
 * So the pair beats what it replaces where it matters and pays a point or two
 * where it does not, and it does so with a *narrower* lens than the 100 degrees
 * it takes over from -- a strict reduction in the edge distortion a panel used
 * for judging whether one shape covered another can least afford. All of it
 * moves if the guard height does; `the_first_person_camera_sits_at_the_eye_and_
 * keeps_one_fixed_mount_angle_at_every_yaw` rebuilds this frustum from these two
 * constants, four measured contact directions and the highest measured opponent
 * head, and fails if either constant drifts in either direction.
 *
 * The panel is very nearly square -- 0.28 by 0.5 of a 16:9 canvas is an aspect
 * of 0.9956 -- so this is within half a degree of the horizontal field of view
 * too. The lateral spread of those same contacts reaches 62.4, 65.1 and 49.8
 * degrees; 48.0 is only the 95th percentile on `fight.json`, and 5.1% of its
 * contacts are wider than that.
 *
 * **The `learned` column was re-derived on 2026-08-11 and the decision it was
 * evidence for still stands, more strongly than before.**
 * `web/fight-learned.json` was re-recorded and now carries 6679 published poses
 * against 7202, 2195 contacts against 2966 and **54 weapon-shield contacts
 * against 375**, so every learned percentage above and the two sentences before
 * this one are the new sweep rather than the old. The `fight.json` and windmill
 * columns re-measure cell for cell, which is what says the re-derivation is the
 * same measurement. What moved: the shipped `25 down / 90` cell reads **94%
 * (51/54)** rather than 98%, so learned is now the *worst* of the three at the
 * shipped setting rather than the best, and its three misses are one contiguous
 * cluster at ticks 2490-2492 -- the deepest contacts in the file, at 65.9, 64.8
 * and 63.2 degrees below level, needing a 93.6 degree lens at this mount.
 *
 * **What 54 will and will not carry.** The 95% Wilson interval on 51/54 is
 * [84.9%, 98.1%] against [99.1%, 100%] on `fight.json`'s 430/430, and even that
 * is a floor: the 54 are not 54 trials but 10 swings, one of which supplies 20
 * of them. Read at swing granularity -- which is what a reader watching the
 * panel actually experiences -- the shipped setting holds 9 of 10 swings wholly
 * in frame and 10 of 10 partly, against level 100's 2 of 10 and 3 of 10. That is
 * the reading to trust on this fixture; a percentage to two figures on n=54 is
 * more precision than it carries.
 */
export const FIRST_PERSON_FOV_DEGREES = 90;

/**
 * The constant downward mount angle, in degrees. See {@link FIRST_PERSON_FOV_DEGREES}.
 *
 * Fixed, and fixed is the whole of the argument: it is the same number at every
 * tick of every fight, so it cannot be read as a fighter looking anywhere.
 */
export const FIRST_PERSON_PITCH_DEGREES = 25;

/**
 * Two centimetres, an order of magnitude inside the nearest thing to be clipped.
 *
 * Measured over the same recording, the closest a body's own drawn surface comes
 * to its own eye is the upper arm capsule at 0.218 units; the hand sphere gets
 * to 0.351, the shield's nearest corner to 0.518 and its own weapon to 0.533.
 * Babylon's default `minZ` is 1, which would clip every one of them, so this is
 * a value that has to be set rather than one that has to be tuned.
 */
export const NEAR_PLANE = 0.02;

/** The arena is 24 by 16 units; this holds it, its floor grid and its corners. */
export const FAR_PLANE = 120;

/** A normal lens for the wide panel, so the pair reads without fisheye. */
export const THREE_QUARTER_FOV_DEGREES = 45;
/** Off the floor rather than on it, which is what makes it a 3/4 and not an elevation. */
export const THREE_QUARTER_ELEVATION_DEGREES = 30;
/** Chest height, so the bodies sit in the frame rather than the floor. */
export const THREE_QUARTER_TARGET_HEIGHT = 1;

/**
 * Where the 3/4 camera stands, as a pure function of the frame it is drawing.
 *
 * **Pure, and that is the point.** A camera that eased toward a moving subject
 * would put the reader at a different place in the world depending on whether
 * they scrubbed to tick 1329 forwards or backwards, and a picture whose
 * viewpoint depends on playback history cannot be used to check a geometry
 * claim. So the position is recomputed from the focus, the span and the azimuth
 * every frame and remembers nothing.
 *
 * **It stands exactly where the elevation camera stands.** `elevationCamera`
 * puts its eye on the `(sin azimuth, -cos azimuth)` side of the focus, and this
 * uses the same expression and then lifts it 30 degrees -- so the 3/4 view is
 * the elevation, from the same heading, with perspective and some height. One
 * control turns both, the default azimuth `adopt` computes from the line
 * between the two bodies is a good default for both, and a reader who cannot
 * see a contact because a body is in front of it can turn the slider and look
 * from the other side. That last part is not a nicety: measured over
 * `web/fight.json`, a camera pinned to one heading leaves the great majority of
 * this fight's 1061 weapon-body contacts behind one body or the other, and the
 * capsule check needs the point on screen.
 *
 * At azimuth zero the eye is on the world's `-y` side, so screen right is world
 * `+x` and "away from the camera" is "up the panel" -- which is exactly how the
 * plan reads, and is why that is the azimuth the handedness check is taken at.
 *
 * `span` is the same control the plan and elevation use, so the five panels
 * frame the same width of world and the Span slider moves all of them.
 */
export function threeQuarterPlacement(
  focus: V3, spanRaw: number, aspect: number, azimuth: number,
): Readonly<{ position: ScenePoint; target: ScenePoint }> {
  const span = Math.max(1, sceneLength(spanRaw));
  const vertical = (THREE_QUARTER_FOV_DEGREES * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(0.1, aspect));
  // Far enough back that the panel covers the same world width the orthographic
  // panels do, measured at the focus.
  const distance = Math.max(2, span / 2 / Math.tan(horizontal / 2));
  const elevation = (THREE_QUARTER_ELEVATION_DEGREES * Math.PI) / 180;
  const ground = distance * Math.cos(elevation);
  const target: ScenePoint = [
    focus[0] / ONE, THREE_QUARTER_TARGET_HEIGHT, -focus[1] / ONE,
  ];
  const offsetX = Math.sin(azimuth) * ground;
  const offsetY = -Math.cos(azimuth) * ground;
  return Object.freeze({
    position: [
      target[0] + offsetX,
      target[1] + distance * Math.sin(elevation),
      target[2] - offsetY,
    ] as ScenePoint,
    target,
  });
}

// ------------------------------------------------------- the v2-18 node contract

/**
 * The semantic node names [`v2-18`](../../../docs/plans/v2-18-combatant-integration.md)
 * says the authored Fighter and Brute rigs will carry.
 *
 * **Built a session early, and on purpose.** The proxy hangs its shapes off nodes
 * with exactly these names, so landing `v2-18` is swapping what hangs under each
 * node rather than rewriting the presentation layer -- and so the socket contract
 * is exercised, and its mistakes found, before there is an asset pipeline to
 * blame them on. `the_proxy_rig_carries_the_v2_18_node_names_and_hangs_them_off_
 * published_points` reads this list against the plan's own code block, so a name
 * that drifts on one side fails on the other.
 *
 * The three order-sensitive facts, written down because a list of strings hides
 * them: `RIG_REGIONS` is in `regionNames` order, so `RIG_REGIONS[i]` is the node
 * for `pose.regions[i]`; `arm_left`/`hand_left` are limb 0 and `arm_right`/
 * `hand_right` limb 1, which is `LimbSlot`'s own order; and `RIG_NODES` concatenates
 * the four lists in the order v2-18's own block lists them, which is what the test
 * compares.
 */
export const RIG_BONES = Object.freeze([
  "root", "pelvis", "torso", "head", "arm_left", "hand_left", "arm_right", "hand_right",
] as const);

export const RIG_SOCKETS = Object.freeze([
  "socket_weapon_left", "socket_weapon_right", "socket_shield",
] as const);

/** In `regionNames` order: head, torso, leftArm, rightArm, legs. */
export const RIG_REGIONS = Object.freeze([
  "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs",
] as const);

/**
 * The four clip slots, of which this session can honestly select two.
 *
 * `idle` and `walk` are chosen from published body speed, so they are the two the
 * velocity-driven gait can reach. **`stagger` and `fall` are left empty and are
 * never selected**, because v2-18's rule is that reactions begin only from events
 * and this session wires no event into the proxy: a stagger picked off a threshold
 * on published `shock` would be a reaction this page invented, and `shock` over
 * the three recordings' 21083 poses peaks at 0.021 world units with a 99th
 * percentile of 0.000, so any threshold worth drawing would fire on nothing or on
 * noise -- a hundredth of a unit is a twentieth of a torso. The slots exist
 * anyway, so that the session which starts a reaction from an event finds the node
 * already named, already parented and already checked.
 */
export const RIG_CLIPS = Object.freeze(["idle", "walk", "stagger", "fall"] as const);

export type RigClip = (typeof RIG_CLIPS)[number];

/** Every node name, in the order v2-18 lists them. */
export const RIG_NODES: readonly string[] = Object.freeze([
  ...RIG_BONES, ...RIG_SOCKETS, ...RIG_REGIONS, ...RIG_CLIPS,
]);

// ------------------------------------------------------- the invented quantities

/**
 * The bend plane of the elbow, and it is the only thing about the elbow that is
 * chosen.
 *
 * **What is published and what is not.** The arm's own region capsule runs from
 * the shoulder to the hand -- `region.upper` is `arms[limb].hand` to the raw unit
 * on all 14404 arm rows of `web/fight.json` -- so the two-bone solve has a real
 * root and a real target and its own length is the extension. What no published
 * quantity fixes is *where round that axis* the elbow sits: the solution is a
 * whole circle, and one point on it has to be picked.
 *
 * **Picked away from the torso, and the claim is comparative rather than
 * absolute.** The guard is held in front of the chest, so the shoulder-to-hand
 * axis passes close to the body's centre line and the elbow has to go somewhere
 * near it either way -- indeed the *published shoulder* is already inside the
 * published torso, `shoulderHalfWidth` 0.250 against a torso radius of 0.350 on
 * the Fighter and 0.300 against 0.400 on the Brute, so no choice of plane puts an
 * elbow clear of the chest. What the choice decides is how far *in* it goes, and
 * that difference is large: measured over the twenty solves of
 * `the_invented_elbow_bends_away_from_the_torso_and_never_into_it`, the nearest
 * the outward elbow comes to the body's axis is 0.361 on the Fighter and 0.274 on
 * the Brute, against 0.201 and 0.126 for the inward plane -- so the inward elbow
 * sits a third of the way through the body while the outward one is at or outside
 * the published torso's own surface, and the inward arm reads as though it had
 * been threaded through the chest.
 *
 * **Those four numbers are the twenty solves and not a corpus-wide floor**, and
 * the difference is a finding rather than a caveat. Swept over all 42166 arm
 * rows of the three recordings, "the outward elbow is further from the body axis
 * than the inward one" is **false on 5 of them** -- all `fight-learned.json`,
 * all Fighter/limb 1, on the consecutive ticks 195 to 199, worst at 198 where
 * the outward elbow is 0.024 from the axis against the inward one's 0.066. The
 * choice is not what fails there; the *unsigned distance* is. The two solves are
 * mirror images about the shoulder-to-hand midpoint, so the unsigned comparison
 * flips exactly when that midpoint crosses the body axis -- an exact criterion,
 * 0 mismatches over the 42166 rows -- and on all five the outward elbow is on
 * the correct side of the axis while the inward one is 5 to 8 cm *through* the
 * chest. Signed along the outward direction, the outward plane is at least as
 * far out on **every** row, with the equalities being the collapsed solves
 * below. The Fighter is reaching its right arm across its own chest over those
 * ticks at 96 to 99 percent of `armLength`; at tick 200 the arm passes full
 * extension, the solve collapses and the window closes.
 *
 * The outward direction is the horizontal one from the body's own vertical axis
 * through the published shoulder -- which is exactly the anatomical left or right,
 * since `actuator::shoulder` puts the shoulder `shoulderHalfWidth` off the centre
 * line at +/-90 degrees to the facing, and the recordings agree to four places.
 *
 * **The most important thing about this function is how often it does nothing,
 * and the plan's table understates it.** A hand further from the shoulder than
 * two `armLength/2` bones can span has no triangle to solve, and this simulation
 * publishes that constantly: the shoulder-to-hand distance is at or past
 * `anatomy.armLength` on **43% of `fight.json`'s 14404 arm rows, 68% of
 * `fight-windmill.json`'s and 67% of `fight-learned.json`'s**, with medians of
 * 0.95, 1.04 and 1.07 times `armLength` and a maximum of 1.62. `arena.ts`'s
 * readout has the reason open as a v2-17 ledger item: the actuator's
 * `physical_reach` is applied to the shoulder's `x` and `y` only, so a *low* hand
 * stretches the published capsule past `armLength` even when the horizontal reach
 * is inside it.
 *
 * On every one of those rows the elbow collapses onto the midpoint of the
 * published segment and the two drawn capsules are collinear -- so the drawn arm
 * **is** the published capsule, exactly, which is the best answer available and
 * not a fudge. And the transition is continuous rather than a pop: `lift` falls
 * to zero as the extension approaches the pair's span, so the arm straightens the
 * way an arm does. The honest summary is that the elbow is an invention the
 * simulation permits about half the time and overrules the rest.
 *
 * One more degenerate case, also real: an arm held straight out to the side has
 * its axis along the outward direction, leaving no perpendicular component to
 * bend along. The fallback is scene down, which is where a human elbow goes and
 * which is never parallel to a horizontal axis.
 */
export function elbowOf(
  shoulder: ScenePoint, hand: ScenePoint, outward: ScenePoint, boneLength: number,
): ScenePoint {
  const span: ScenePoint = [hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]];
  // The full three-dimensional distance, unlike the simulation's `physical_reach`,
  // which is horizontal. This is the length the two bones have to span.
  const extension = Math.hypot(span[0], span[1], span[2]);
  const half = extension / 2;
  // Past the pair's reach there is no triangle, so there is no elbow to place and
  // the arm is drawn straight -- which is the published capsule.
  const lift = Math.sqrt(Math.max(0, boneLength * boneLength - half * half));
  if (extension <= DEGENERATE || lift <= DEGENERATE) {
    return [shoulder[0] + span[0] / 2, shoulder[1] + span[1] / 2, shoulder[2] + span[2] / 2];
  }
  const axis: ScenePoint = [span[0] / extension, span[1] / extension, span[2] / extension];
  // Two hints and no third: they are mutually perpendicular -- one horizontal,
  // one vertical -- so no axis can be within a thousandth of both, and the second
  // `??` is a type obligation rather than a case. It is written as `axis` because
  // that is the one answer that is at least on the shoulder-to-hand line; there is
  // no arm shape that reaches it.
  const bend = perpendicular(outward, axis) ?? perpendicular([0, -1, 0], axis) ?? axis;
  return [
    shoulder[0] + axis[0] * half + bend[0] * lift,
    shoulder[1] + axis[1] * half + bend[1] * lift,
    shoulder[2] + axis[2] * half + bend[2] * lift,
  ];
}

/**
 * The part of `v` at right angles to the unit vector `axis`, or null if there is
 * none worth using.
 *
 * **The threshold is 1e-3 rather than {@link DEGENERATE}'s 1e-9**, and the
 * difference is the point: this answer is normalised and then multiplied by a
 * length, so a residue a thousandth of a unit long is direction that is almost
 * entirely rounding error. Every caller has a second choice to fall back on, and
 * a plausible fallback beats an exact answer computed out of noise -- an arm held
 * within a thousandth of straight out to the side gets its elbow *below* the line
 * rather than in whichever direction the last bits happened to point.
 */
function perpendicular(v: ScenePoint, axis: ScenePoint): ScenePoint | null {
  const along = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
  const out: ScenePoint = [v[0] - axis[0] * along, v[1] - axis[1] * along, v[2] - axis[2] * along];
  const size = Math.hypot(out[0], out[1], out[2]);
  if (size <= 1e-3) return null;
  return [out[0] / size, out[1] / size, out[2] / size];
}

/**
 * Scene forward and scene anatomical left for a published yaw.
 *
 * **`left` is `up x forward` and the order is the whole of it.** The other order
 * is the body's *right*, and it is silently wrong rather than obviously wrong:
 * the legs are symmetric so they look identical either way, but the elbow's bend
 * plane is chosen "away from the torso" against this vector, and with the sign
 * flipped both elbows bend **across the chest** -- which is the exact failure
 * {@link elbowOf} exists to avoid, arrived at through the vector rather than the
 * choice. `the_arena_axis_mapping_is_a_rotation_rather_than_a_mirror_of_the_world`
 * fixes the convention (`actuator::shoulder` puts `LimbSlot::LeftArm` on the +90
 * degree side, which is world `+y`, which is scene `-z` at yaw zero) and
 * `the_body_frames_the_proxy_is_built_on_are_rotations_rather_than_mirrors`
 * checks this against it.
 */
export function bodyAxes(rawYaw: number): Readonly<{ forward: ScenePoint; left: ScenePoint }> {
  const forward = sceneForward(rawYaw);
  return Object.freeze({ forward, left: [forward[2], 0, -forward[0]] as ScenePoint });
}

/**
 * How fast a body has to be going before the proxy calls it walking.
 *
 * **Written as world units times `ONE` because the comparison is against raw.**
 * `length(pose.vel)` is raw units a tick, so the constant is 196.6 raw and the
 * quantity a reader should hold onto is the 0.003: three thousandths of a world
 * unit a tick, which at the simulation's 60 Hz is 0.18 world units a second -- a
 * tenth of a body length a second, slower than any deliberate step and faster
 * than the jitter a body holding position shows.
 *
 * The split it produces, idle to walk: 63/37 on `fight.json`, 4/96 on
 * `fight-windmill.json` and 4/96 on `fight-learned.json`, over 7202, 7202 and
 * 6679 published poses. That is the shape those fights have -- the composed
 * script spends most of its time standing and the other two almost none of it.
 */
export const GAIT_WALK_SPEED = 0.003 * ONE;

/**
 * Cycles a tick at the invented constant cadence: one full cycle in 40 ticks.
 *
 * **A cycle is two steps**, so 40 ticks at the simulation's 60 Hz is three steps
 * a second: 180 a minute, which is a *running* cadence and not a walking one --
 * walking is 100 to 120. That is deliberate rather than a slip. The stride
 * amplitude is small (see {@link GAIT_STRIDE_PER_SPEED}) because it is set by
 * what reads rather than by what would keep a foot still, and a small stride at a
 * walking cadence reads as shuffling. It is *constant* either way, which is the
 * property that matters -- see {@link gaitOf} for why the cadence may not be
 * derived from speed on a page that scrubs.
 */
export const GAIT_CADENCE = 1 / 40;

/**
 * How far a foot swings fore and aft, per **world** unit a tick of published
 * speed -- `gaitOf` divides the raw speed by 65536 before multiplying.
 *
 * Chosen so the swing reads at the speeds these fights actually hold: the 90th
 * percentile of `fight.json` is 0.033 world units a tick, which gives a
 * half-stride of 0.13 and so a fore-and-aft separation of 0.26 between the feet.
 * It is emphatically **not** the amplitude that would keep a foot still on the
 * ground -- that would be `speed * 60 / (2 * cadence * 60) = speed / (2 * cadence)`,
 * about five times this -- and even that would slide, because the cadence is
 * constant and the speed is not.
 */
export const GAIT_STRIDE_PER_SPEED = 4;

/**
 * The furthest a foot swings from under its hip, world units.
 *
 * A hip is 0.8 up, so a 0.32 half-stride is already a leg at 22 degrees. The clamp
 * is for the sprint the recordings barely reach: it binds on 1 of `fight.json`'s
 * 2638 walking poses, 8 of `fight-windmill.json`'s 6921 and none of
 * `fight-learned.json`'s 6438, so it bounds the worst case rather than shaping the
 * ordinary one.
 */
export const GAIT_MAX_STRIDE = 0.32;

/** How high the swinging foot lifts at the top of its arc, world units. */
export const GAIT_LIFT = 0.06;

export type Gait = Readonly<{
  /** The clip slot this state would play, which in this session is `idle` or `walk`. */
  clip: RigClip;
  /** Radians round the cycle. A pure function of the tick -- never accumulated. */
  phase: number;
  /** Half the fore-and-aft separation of the two feet, world units. */
  stride: number;
}>;

/**
 * The gait, as a **pure function of the tick and the published speed**.
 *
 * **Nothing here is integrated, and that is not a style preference.** The arena
 * scrubs: a phase advanced by `speed * dt` every frame would make the picture at
 * tick 1329 depend on whether the reader arrived forwards, backwards or by
 * clicking the chart, and a picture whose content depends on playback history
 * cannot be used to check a geometry claim. {@link threeQuarterPlacement} makes
 * the same argument about the camera and this is the same rule. So the cadence is
 * a constant against the tick number and the published speed sets the *amplitude*:
 * a standing body's feet are together, a moving body's are apart, and both are
 * recomputed from scratch every frame.
 *
 * **What that costs, said plainly: the feet slide.** A constant cadence and a
 * varying stride cannot keep a foot still on the ground, and no correction would
 * fix it, because there is nothing to correct against -- the simulation publishes
 * **one** leg capsule with no stride phase, no per-foot position and no notion of
 * a footfall at all. Nothing about the legs of a body drawn in `[Texture]` may be
 * read as evidence about footwork. `[Geometry]` shows the one capsule that is
 * actually there, and it is one keystroke away for exactly this reason.
 */
export function gaitOf(tick: number, speedRaw: number): Gait {
  const walking = speedRaw >= GAIT_WALK_SPEED;
  const stride = Math.min(GAIT_MAX_STRIDE, sceneLength(speedRaw) * GAIT_STRIDE_PER_SPEED);
  return Object.freeze({
    clip: walking ? "walk" : "idle",
    phase: tick * GAIT_CADENCE * TAU,
    stride: walking ? stride : 0,
  });
}

/** One invented leg: a capsule from a hip to a foot, at half the published radius. */
export type Leg = Readonly<{ hip: ScenePoint; foot: ScenePoint; radius: number }>;

/**
 * The published leg capsule, split into two, and it is the weakest claim on the page.
 *
 * The capsule is real: its lower endpoint is on the floor at height zero on every
 * one of `web/fight.json`'s 7202 leg rows, its upper is the hip, and its radius is
 * published. **Everything that makes two legs out of it is invented**: the lateral
 * offset, the split radius, the fore-and-aft swing and the lift. The offset and
 * the radius are chosen so the pair's silhouette is the published capsule's width
 * -- each leg is half the published radius and stands half a published radius off
 * the centre line, so the outside of the outer leg is exactly where the outside of
 * the capsule was -- which keeps the one measurable thing about the published
 * shape measurable.
 *
 * The swing and the lift are not measurable against anything, because there is
 * nothing to measure them against. See {@link gaitOf}.
 */
export function legsOf(
  lowerRaw: V3, upperRaw: V3, radiusRaw: number, rawYaw: number, gait: Gait,
): readonly [Leg, Leg] {
  const ground = scenePoint(lowerRaw);
  const hip = scenePoint(upperRaw);
  const radius = sceneLength(radiusRaw);
  const { forward, left } = bodyAxes(rawYaw);
  const half = radius / 2;
  const leg = (side: 1 | -1, offset: number): Leg => {
    const reach = gait.stride * Math.sin(gait.phase + offset);
    // The lift is on the half of the cycle where the foot is coming forward. It
    // is what makes the pair read as walking, and it is the invention that would
    // most mislead a reader who took it for a footfall: there is no footfall.
    const lift = gait.stride === 0 ? 0 : Math.max(0, Math.cos(gait.phase + offset)) * GAIT_LIFT;
    return Object.freeze({
      hip: [hip[0] + left[0] * side * half, hip[1], hip[2] + left[2] * side * half] as ScenePoint,
      foot: [
        ground[0] + left[0] * side * half + forward[0] * reach,
        ground[1] + lift,
        ground[2] + left[2] * side * half + forward[2] * reach,
      ] as ScenePoint,
      radius: half,
    });
  };
  return [leg(1, 0), leg(-1, Math.PI)];
}

/**
 * An orthonormal frame in scene space, as three axes. No Babylon in this file.
 *
 * `y` is the axis a source cylinder runs along, which is the convention every
 * capsule in `scene.ts` is built on, so a socket's `y` is the thing it points.
 */
export type Frame3 = Readonly<{ x: ScenePoint; y: ScenePoint; z: ScenePoint }>;

const IDENTITY_FRAME: Frame3 = Object.freeze({
  x: Object.freeze([1, 0, 0]) as ScenePoint,
  y: Object.freeze([0, 1, 0]) as ScenePoint,
  z: Object.freeze([0, 0, 1]) as ScenePoint,
});

function cross(a: ScenePoint, b: ScenePoint): ScenePoint {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * A frame whose `y` runs `from` to `to`, with its roll leaning toward `hint`.
 *
 * `y` because that is the axis a source cylinder runs along, so this is the frame
 * that puts a capsule's shaft on a segment. The roll matters for a socket and not
 * for a cylinder, which has none to see.
 */
export function segmentFrame(from: ScenePoint, to: ScenePoint, hint: ScenePoint): Frame3 {
  return directionFrame([to[0] - from[0], to[1] - from[1], to[2] - from[2]], hint);
}

/** A frame whose `y` is `along` and whose `z` leans toward `hint`. */
export function directionFrame(along: ScenePoint, hint: ScenePoint): Frame3 {
  const size = Math.hypot(along[0], along[1], along[2]);
  if (size <= DEGENERATE) return IDENTITY_FRAME;
  const y: ScenePoint = [along[0] / size, along[1] / size, along[2] / size];
  const x = perpendicular(cross(hint, y), y) ?? perpendicular(cross([0, 1, 0], y), y)
    ?? perpendicular(cross([1, 0, 0], y), y) ?? IDENTITY_FRAME.x;
  return Object.freeze({ x, y, z: cross(x, y) });
}

/**
 * Where a weapon socket points, and the one roll it has to choose.
 *
 * **The direction is published and the roll is not.** A weapon is published as a
 * segment -- a hilt, a tip and a radius -- and a segment is a line: it fixes two
 * of the socket's three axes and says nothing about the third. So the blade
 * direction here is the published one exactly, and the remaining turn about it is
 * chosen to put the blade's flat in the plane the blade and the forearm share,
 * which is the only plane the published pose offers. A wrist is not published in
 * any form; this is what "wrist orientation, derived from the weapon segment"
 * amounts to once it is written down.
 *
 * **It is invisible in this session and it is still worth getting right.** The
 * proxy's weapon is the published capsule, which is round, so no reader can see
 * the roll. The moment v2-18 hangs an authored blade on this socket the roll is
 * the difference between a sword held edge-on and one held flat, and finding that
 * out with an asset pipeline in the picture is the expensive way.
 * `the_weapon_socket_points_along_the_published_blade_and_rolls_with_the_forearm`
 * is what keeps it honest until then.
 */
export function weaponSocketFrame(hilt: V3, tip: V3, elbow: ScenePoint): Frame3 {
  const from = scenePoint(hilt);
  const to = scenePoint(tip);
  const forearm: ScenePoint = [from[0] - elbow[0], from[1] - elbow[1], from[2] - elbow[2]];
  return directionFrame([to[0] - from[0], to[1] - from[1], to[2] - from[2]], forearm);
}

/**
 * Where the shield socket points, and every axis of it is published.
 *
 * Built from the same two vectors `shieldCorners` builds the plate from -- the
 * published normal and the published `(0, 0, halfHeight)` up -- rather than from a
 * second derivation of them, so the socket and the plate cannot come apart. The
 * plate faces along `z`.
 */
export function shieldSocketFrame(shield: ShieldFace): Frame3 {
  const normal = scenePoint(shield.normal);
  const size = Math.hypot(normal[0], normal[1], normal[2]);
  if (size <= DEGENERATE) return IDENTITY_FRAME;
  const z: ScenePoint = [normal[0] / size, normal[1] / size, normal[2] / size];
  const y = perpendicular([0, 1, 0], z) ?? perpendicular([1, 0, 0], z) ?? IDENTITY_FRAME.y;
  return Object.freeze({ x: cross(y, z), y, z });
}

/**
 * A frame that carries only the body's one rotation, for the nodes that have no
 * segment of their own to point along.
 *
 * `x` forward, `y` up, `z` the body's **right** -- because `z = x cross y` is what
 * makes this a rotation rather than a reflection, and a reflection handed to
 * `Quaternion.FromRotationMatrixToRef` comes back as a quaternion of the wrong
 * norm and lands the node at an orientation that is not any rotation at all. That
 * is not a hypothetical: it is what this returned until the frames were checked
 * for determinant, and the symptom was a body facing along world `+x` no matter
 * what the pose said.
 */
export function yawFrame(rawYaw: number): Frame3 {
  const { forward, left } = bodyAxes(rawYaw);
  return Object.freeze({
    x: forward, y: [0, 1, 0] as ScenePoint, z: [-left[0], -left[1], -left[2]] as ScenePoint,
  });
}

/** The midpoint of a published capsule, in scene space. */
export function capsuleCentre(lowerRaw: V3, upperRaw: V3): ScenePoint {
  const lower = scenePoint(lowerRaw);
  const upper = scenePoint(upperRaw);
  return [(lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, (lower[2] + upper[2]) / 2];
}

// ------------------------------------------------------------ sub-tick blending

/**
 * Two decided ticks and a fraction between them.
 *
 * **Not `PresentationTimeline`.** That class smooths snapshots arriving from a
 * worker at unpredictable wall-clock times, and has to guess how long the next
 * one will take. This is a recorded buffer: both ticks are already in hand, the
 * fraction is the playback loop's own carry, and the answer is a lerp against a
 * fractional index. At 1x the carry is consumed every frame and `alpha` is zero,
 * so this costs nothing on the path that matters; at 0.1x a tick lasts ten
 * display frames and without this the bodies would visibly stutter.
 *
 * `interpolateAngle` is borrowed from that file for the yaw, because a body
 * turning through the 65535/0 seam must not spin the long way round.
 *
 * Only the drawn quantities are blended. `severed`, `present` and the region
 * radii are facts about the decided tick and a half-severed arm is not a thing.
 *
 * **A region that changed between the two ticks is not blended at all, and nor
 * is anything hanging off it.** `severed` is carried from `current`, so a region
 * severed in `next` goes on being drawn through the sub-tick -- which is right,
 * because the tick this frame names is `current`. Lerping its endpoints as well
 * would draw that arm half way to wherever the stump was published: a pose no
 * tick decided, and the only one a reader could mistake for a limb coming off
 * gradually. The same argument covers the hand, the weapon and the shield.
 *
 * "Changed" is both bits, for the same reason {@link regionDrawn} reads both:
 * a region the body does not have and a region it no longer has are one rule,
 * and a `present` that flips is a limb arriving or leaving exactly as a
 * `severed` bit is. Carrying all four of a limb's published shapes together is
 * also what keeps the shield's centre on its holder's hand through the sub-tick,
 * which {@link shieldLimb} reads -- though not unconditionally, because a `next`
 * that publishes no shield at all leaves the centre where the decided tick had
 * it while the hand goes on blending.
 */
export function blendPose(current: Pose, next: Pose, alpha: number): Pose {
  if (alpha <= 0 || current.id[0] !== next.id[0] || current.id[1] !== next.id[1]) return current;
  const a = Math.min(1, alpha);
  const yaw = interpolateAngle(sceneYaw(current.yaw), sceneYaw(next.yaw), a);
  let changed = current.severed ^ next.severed;
  current.regions.forEach((region, index) => {
    const to = next.regions[index];
    if (to === undefined || to.present !== region.present) changed |= 1 << index;
  });
  const lost = (limb: 0 | 1): boolean => (changed & (1 << ARM_REGIONS[limb])) !== 0;
  const holder = current.shield === null ? null : shieldLimb(current, current.shield);
  // `undefined` is how `blendArm`, `blendSegment` and `blendShield` are already
  // told to keep the decided tick, so a lost limb reuses the path a vanishing
  // weapon takes rather than adding a second way to say the same thing.
  const held = <T>(limb: 0 | 1, value: T): T | undefined => (lost(limb) ? undefined : value);
  return {
    ...current,
    body: mix(current.body, next.body, a),
    yaw: (yaw / TAU) * ONE,
    arms: [
      blendArm(current.arms[0], held(0, next.arms[0]), a),
      blendArm(current.arms[1], held(1, next.arms[1]), a),
    ],
    weapons: [
      blendSegment(current.weapons[0], held(0, next.weapons[0]), a),
      blendSegment(current.weapons[1], held(1, next.weapons[1]), a),
    ],
    shield: blendShield(current.shield, holder === null ? next.shield : held(holder, next.shield), a),
    regions: current.regions.map((region, index) => (
      (changed & (1 << index)) !== 0 ? region : blendRegion(region, next.regions[index], a)
    )),
  };
}

function mix(from: V3, to: V3, alpha: number): V3 {
  return add(from, scale(sub(to, from), alpha));
}

function blendArm(from: Arm, to: Arm | undefined, alpha: number): Arm {
  if (to === undefined) return from;
  return { ...from, hand: mix(from.hand, to.hand, alpha), target: mix(from.target, to.target, alpha) };
}

function blendSegment(from: Segment | null, to: Segment | null | undefined, alpha: number): Segment | null {
  // A weapon that appears or vanishes between two ticks is drawn as the decided
  // tick has it. Fading one in over half a tick would be an invention.
  if (from === null || to === null || to === undefined) return from;
  return { ...from, hilt: mix(from.hilt, to.hilt, alpha), tip: mix(from.tip, to.tip, alpha) };
}

function blendShield(from: ShieldFace | null, to: ShieldFace | null | undefined, alpha: number): ShieldFace | null {
  if (from === null || to === null || to === undefined) return from;
  return { ...from, centre: mix(from.centre, to.centre, alpha), normal: mix(from.normal, to.normal, alpha) };
}

function blendRegion(from: Region, to: Region | undefined, alpha: number): Region {
  if (to === undefined || to.present !== from.present) return from;
  return { ...from, lower: mix(from.lower, to.lower, alpha), upper: mix(from.upper, to.upper, alpha) };
}
