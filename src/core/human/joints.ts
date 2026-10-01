import { segmentFrame, type DofSpec, type ForceVelocitySpec, type JointSpec, type SegmentSpec } from "../spec/body.ts";
import { derive, si, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { angleAbout, cross, dot, normalize, orthogonalTo, scale, sub } from "../spec/vec.ts";
import type { HumanFigure } from "./figure.ts";
import { SIDES, type Side } from "./landmarks.ts";
import { segmentName } from "./segments.ts";
import type { Exertion } from "./tables/joint-torques.ts";
import { rangeOfMotion, type RangeRow } from "./tables/range-of-motion.ts";
import { acos } from "../math/real.ts";

/**
 * **The human joints**: fifteen, one wherever `HUMAN_PARENTS` joins two segments, each at the point
 * the two share, with its freedoms, their ranges and the muscle on each.
 *
 * **Freedoms.** Each is named for the anatomical motion its positive angle makes, flexion first,
 * then abduction (or bending to the side), then rotation about the child's own line: the order the
 * builder gives its exact, near and loosest constraint axes. A rotation about axis a turns a lever v
 * toward cross(a, v), so each axis is chosen to turn the child the anatomical way:
 * - a limb's flexion about its own -x, abduction about its -z mirrored by side, internal rotation
 *   about its y mirrored by side; the knee flexes about the thigh's +x, and the elbow about the
 *   line square to the upper arm and the forearm;
 * - the neck, spine and trunk flex about the child's +x, bend right about the head's -z or the
 *   trunk's +z, and turn right about the head's +y or the trunk's -y;
 * - the wrist's axes follow the hand's own right, since the reference pose holds it thumb up: it
 *   flexes about that right's negative, deviates toward the thumb about the negative of what is
 *   square to it and the forearm (mirrored by side), and the forearm turns the hand prone about its
 *   own line, mirrored by side;
 * - the ankle dorsiflexes about the foot's -x and inverts about its line, mirrored by side.
 *
 * **Ranges.** A source measures a range from the anatomical position; the reference pose is not
 * that position. Each freedom's angle in the reference pose (its bind) is measured on the model, in
 * the sense its source measures it, and the joint's limits are the source's ranges less the bind:
 * min = -(the range against the positive sense) - bind, max = (the range with it) - bind. Where
 * nothing gives the bind (neck, spine, hip rotation, foot roll), it is taken as neutral, and that
 * is a stated assumption (`reference-pose-assumptions`). Each figure reads its own sex's ranges.
 *
 * **Muscle.** `strength` gives each exertion's peak torque (`muscle.ts`), and `speed` how that
 * torque falls with speed (`speed.ts`).
 */
type Strength = (exertion: Exertion) => Quantity<number>;
type Speed = (exertion: Exertion) => ForceVelocitySpec;

interface Freedom {
  readonly positive: string;
  readonly negative: string;
  readonly axis: Quantity<Vec3>;
  /** The reference pose's angle from the anatomical zero, in the positive sense, rad. */
  readonly bind: Quantity<number>;
  /** The source's ranges in the positive sense and against it, from the anatomical position. */
  readonly reach: readonly [Quantity<number>, Quantity<number>];
  readonly exertions: readonly [Exertion, Exertion];
}

function dof(joint: string, f: Freedom, strength: Strength, speed: Speed): DofSpec {
  const min = derive("rad", "the range against the positive sense, from the reference pose", [si(f.reach[1]), f.bind], (n, b) => -n - b);
  const max = derive("rad", "the range in the positive sense, from the reference pose", [si(f.reach[0]), f.bind], (p, b) => p - b);
  if (!(min.value <= 0 && max.value >= 0)) {
    throw new Error(`${joint} ${f.positive}: the reference pose, ${f.bind.value} rad, lies outside ${min.value}..${max.value} rad`);
  }
  return {
    positive: f.positive, negative: f.negative, axis: f.axis, min, max,
    muscle: {
      peakPositive: strength(f.exertions[0]), peakNegative: strength(f.exertions[1]),
      speedPositive: speed(f.exertions[0]), speedNegative: speed(f.exertions[1]),
    },
  };
}

type Axis = "x" | "y" | "z";
interface Frame { readonly x: Quantity<Vec3>; readonly y: Quantity<Vec3>; readonly z: Quantity<Vec3> }

/** A segment's frame axes (`segmentFrame`), each a quantity resting on the segment's ends. */
function frame(segment: SegmentSpec): Frame {
  const ends = segment.right ? [segment.proximal, segment.distal, segment.right] : [segment.proximal, segment.distal];
  const axis = (a: Axis) => derive("1", `${segment.name}'s frame ${a}`, ends, (...v) => segmentFrame(v[0]!, v[1]!, v[2])[a]);
  return { x: axis("x"), y: axis("y"), z: axis("z") };
}

const negated = (axis: Quantity<Vec3>, what: string) => derive("1", `the negative of ${what}`, [axis], (a) => scale(a, -1));
/** The side's sign: +1 on the right, -1 on the left, the mirror a limb's axes carry. */
const sign = (side: Side) => (side === "right" ? 1 : -1);
const mirrored = (axis: Quantity<Vec3>, what: string, side: Side, s = sign(side)) =>
  derive("1", `${what}, mirrored for the ${side} side`, [axis], (a) => scale(a, s));

const neutral = (what: string): Quantity<number> =>
  sourced(0, "rad", "reference-pose-assumptions", `the reference pose's ${what}, taken as neutral`);

/** The human joints of `figure`, on its `segments` (`humanSegments`). */
export function humanJoints(figure: HumanFigure, segments: readonly SegmentSpec[], strength: Strength, speed: Speed): JointSpec[] {
  const { sex, model } = figure;
  const at = new Map(segments.map((segment) => [segment.name, segment]));
  const get = (name: string): SegmentSpec => {
    const segment = at.get(name);
    if (!segment) throw new Error(`${model} has no segment ${name}`);
    return segment;
  };
  const rom = (row: RangeRow, side?: Side) => rangeOfMotion(row, sex, side);
  const joint = (name: string, parent: string, child: string, centre: Quantity<Vec3>, freedoms: readonly Freedom[]): JointSpec =>
    ({ name, parent, child, centre, dofs: freedoms.map((f) => dof(name, f, strength, speed)) });

  const head = get("head"), upperTrunk = get("upperTrunk"), middleTrunk = get("middleTrunk"), lowerTrunk = get("lowerTrunk");
  const H = frame(head), U = frame(upperTrunk), M = frame(middleTrunk), L = frame(lowerTrunk);

  const spine = (name: string, parent: SegmentSpec, child: SegmentSpec, C: Frame, rows: {
    flexion: RangeRow; extension: RangeRow; right: RangeRow; left: RangeRow; turnRight: RangeRow; turnLeft: RangeRow;
  }): JointSpec => joint(name, parent.name, child.name, parent.proximal, [
    { positive: "flexion", negative: "extension", axis: C.x, bind: neutral(`${name} flexion`),
      reach: [rom(rows.flexion), rom(rows.extension)], exertions: ["trunkFlexion", "trunkExtension"] },
    { positive: "lateral flexion right", negative: "lateral flexion left", axis: C.z, bind: neutral(`${name} lateral flexion`),
      reach: [rom(rows.right), rom(rows.left)], exertions: ["trunkLateralFlexionRight", "trunkLateralFlexionLeft"] },
    { positive: "rotation right", negative: "rotation left", axis: negated(C.y, `${child.name}'s frame y`), bind: neutral(`${name} rotation`),
      reach: [rom(rows.turnRight), rom(rows.turnLeft)], exertions: ["trunkRotationRight", "trunkRotationLeft"] },
  ]);

  const joints: JointSpec[] = [
    joint("neck", upperTrunk.name, head.name, head.proximal, [
      { positive: "flexion", negative: "extension", axis: H.x, bind: neutral("neck flexion"),
        reach: [rom("neckFlexion"), rom("neckExtension")], exertions: ["neckFlexion", "neckExtension"] },
      { positive: "lateral flexion right", negative: "lateral flexion left", axis: negated(H.z, "the head's frame z"),
        bind: neutral("neck lateral flexion"), reach: [rom("neckLateralFlexionRight"), rom("neckLateralFlexionLeft")],
        exertions: ["neckLateralFlexion", "neckLateralFlexion"] },
      { positive: "rotation right", negative: "rotation left", axis: H.y, bind: neutral("neck rotation"),
        reach: [rom("neckRotationRight"), rom("neckRotationLeft")], exertions: ["neckRotation", "neckRotation"] },
    ]),
    spine("thoracic", middleTrunk, upperTrunk, U, { flexion: "thoracicFlexion", extension: "thoracicExtension",
      right: "thoracicLateralFlexion", left: "thoracicLateralFlexion", turnRight: "thoracicRotation", turnLeft: "thoracicRotation" }),
    spine("lumbar", lowerTrunk, middleTrunk, M, { flexion: "lumbarFlexion", extension: "lumbarExtension",
      right: "lumbarLateralFlexionRight", left: "lumbarLateralFlexionLeft", turnRight: "lumbarRotationRight", turnLeft: "lumbarRotationLeft" }),
  ];

  for (const side of SIDES) {
    const s = sign(side);
    const upperArm = get(segmentName("upperArm", side)), forearm = get(segmentName("forearm", side)), hand = get(segmentName("hand", side));
    const thigh = get(segmentName("thigh", side)), shank = get(segmentName("shank", side)), foot = get(segmentName("foot", side));
    const A = frame(upperArm), F = frame(forearm), Th = frame(thigh), S = frame(shank), Fo = frame(foot);
    const handRight = hand.right;
    if (!handRight) throw new Error(`${model}'s ${hand.name} has no right of its own`);

    const elbowAxis = derive("1", "the elbow's flexion axis: the upper arm's line cross the forearm's",
      [upperArm.proximal, upperArm.distal, forearm.proximal, forearm.distal],
      (up, ud, fp, fd) => normalize(cross(normalize(sub(ud, up)), normalize(sub(fd, fp)))));
    // The wrist's frame: the hand's right made square to the forearm, and what is square to both.
    const across = derive("1", "the hand's right, made square to the forearm", [handRight, F.y], (r, y) => orthogonalTo(r, y));
    const palmar = derive("1", "the wrist's right cross the forearm's line", [across, F.y], (x, y) => cross(x, y));
    // The third metacarpal, from the hand's joint centre to the middle finger's knuckle, in the figure.
    const { WJC: wrist, MET3: knuckle } = figure.limbs[side];

    joints.push(
      joint(`shoulder.${side}`, upperTrunk.name, upperArm.name, upperArm.proximal, [
        { positive: "flexion", negative: "extension", axis: negated(A.x, "the upper arm's frame x"),
          bind: derive("rad", "shoulder flexion in the reference pose: the upper arm's line from the trunk's downward line, about the trunk's -x",
            [U.x, U.y, upperArm.proximal, upperArm.distal], (x, y, p, d) => angleAbout(scale(x, -1), y, sub(d, p))),
          reach: [rom("shoulderFlexion"), rom("shoulderExtension")], exertions: ["shoulderFlexion", "shoulderExtension"] },
        { positive: "abduction", negative: "adduction", axis: mirrored(negated(A.z, "the upper arm's frame z"), "the upper arm's -z", side),
          bind: derive("rad", `shoulder abduction in the reference pose: the upper arm's line from the trunk's downward line, about the trunk's -z mirrored for the ${side} side`,
            [U.z, U.y, upperArm.proximal, upperArm.distal], (z, y, p, d) => angleAbout(scale(z, -s), y, sub(d, p))),
          reach: [rom("shoulderAbduction"), sourced(0, "deg", "reference-pose-assumptions", "shoulder adduction beyond the anatomical position: none, the trunk is in the way")],
          exertions: ["shoulderAbduction", "shoulderAdduction"] },
        { positive: "internal rotation", negative: "external rotation", axis: mirrored(A.y, "the upper arm's frame y", side),
          bind: derive("rad", `shoulder internal rotation in the reference pose: the elbow's axis from the upper arm's -x, about its y mirrored for the ${side} side`,
            [A.x, A.y, elbowAxis], (x, y, e) => angleAbout(scale(y, s), scale(x, -1), e)),
          reach: [rom("shoulderInternalRotation"), rom("shoulderExternalRotation")],
          exertions: ["shoulderInternalRotation", "shoulderExternalRotation"] },
      ]),
      joint(`elbow.${side}`, upperArm.name, forearm.name, forearm.proximal, [
        { positive: "flexion", negative: "hyperextension", axis: elbowAxis,
          bind: derive("rad", "the elbow's bend in the reference pose: the angle between the upper arm's line and the forearm's",
            [upperArm.proximal, upperArm.distal, forearm.proximal, forearm.distal],
            (up, ud, fp, fd) => acos(dot(normalize(sub(ud, up)), normalize(sub(fd, fp))))),
          reach: [rom("elbowFlexion"), rom("elbowHyperextension")], exertions: ["elbowFlexion", "elbowExtension"] },
      ]),
      joint(`wrist.${side}`, forearm.name, hand.name, hand.proximal, [
        { positive: "flexion", negative: "extension", axis: negated(across, "the wrist's right"),
          bind: derive("rad", "wrist flexion in the reference pose: the third metacarpal's line from the forearm's, about the wrist's -x",
            [across, F.y, wrist, knuckle], (x, y, w, k) => angleAbout(scale(x, -1), y, sub(k, w))),
          reach: [rom("wristFlexion"), rom("wristExtension")], exertions: ["wristFlexion", "wristExtension"] },
        { positive: "radial deviation", negative: "ulnar deviation", axis: mirrored(negated(palmar, "the wrist's z"), "the wrist's -z", side),
          bind: derive("rad", `radial deviation in the reference pose: the third metacarpal's line from the forearm's, about the wrist's -z mirrored for the ${side} side`,
            [palmar, F.y, wrist, knuckle], (z, y, w, k) => angleAbout(scale(z, -s), y, sub(k, w))),
          reach: [rom("wristRadialDeviation", side), rom("wristUlnarDeviation", side)],
          exertions: ["wristRadialDeviation", "wristUlnarDeviation"] },
        { positive: "pronation", negative: "supination", axis: mirrored(F.y, "the forearm's frame y", side),
          // The goniometer's zero is the thumb up with the elbow bent: the hand's right along the
          // way the elbow's flexion carries the wrist, mirrored, since a left hand's right is its
          // little finger's side.
          bind: derive("rad", `pronation in the reference pose: the hand's right from the way elbow flexion carries the wrist, about the forearm's line, mirrored for the ${side} side`,
            [F.y, elbowAxis, handRight], (y, e, r) => angleAbout(scale(y, s), scale(cross(e, y), s), r)),
          reach: [rom("forearmPronation"), rom("forearmSupination")], exertions: ["forearmPronation", "forearmSupination"] },
      ]),
      joint(`hip.${side}`, lowerTrunk.name, thigh.name, thigh.proximal, [
        { positive: "flexion", negative: "extension", axis: negated(Th.x, "the thigh's frame x"),
          bind: derive("rad", "hip flexion in the reference pose: the thigh's line from the pelvis's downward line, about the pelvis's -x",
            [L.x, L.y, thigh.proximal, thigh.distal], (x, y, p, d) => angleAbout(scale(x, -1), y, sub(d, p))),
          reach: [rom("hipFlexion"), rom("hipExtension")], exertions: ["hipFlexion", "hipExtension"] },
        { positive: "abduction", negative: "adduction", axis: mirrored(negated(Th.z, "the thigh's frame z"), "the thigh's -z", side),
          bind: derive("rad", `hip abduction in the reference pose: the thigh's line from the pelvis's downward line, about the pelvis's -z mirrored for the ${side} side`,
            [L.z, L.y, thigh.proximal, thigh.distal], (z, y, p, d) => angleAbout(scale(z, -s), y, sub(d, p))),
          reach: [rom("hipAbduction"), rom("hipAdduction")], exertions: ["hipAbduction", "hipAdduction"] },
        { positive: "internal rotation", negative: "external rotation", axis: mirrored(Th.y, "the thigh's frame y", side),
          bind: neutral("hip rotation"),
          reach: [rom("hipInternalRotation"), rom("hipExternalRotation")], exertions: ["hipInternalRotation", "hipExternalRotation"] },
      ]),
      joint(`knee.${side}`, thigh.name, shank.name, shank.proximal, [
        { positive: "flexion", negative: "hyperextension", axis: Th.x,
          bind: derive("rad", "the knee's bend in the reference pose: the shank's line from the thigh's, about the thigh's x",
            [Th.x, thigh.proximal, thigh.distal, shank.proximal, shank.distal],
            (x, tp, td, sp, sd) => angleAbout(x, sub(td, tp), sub(sd, sp))),
          reach: [rom("kneeFlexion"), rom("kneeHyperextension")], exertions: ["kneeFlexion", "kneeExtension"] },
      ]),
      joint(`ankle.${side}`, shank.name, foot.name, shank.distal, [
        { positive: "dorsiflexion", negative: "plantar flexion", axis: negated(Fo.x, "the foot's frame x"),
          bind: derive("rad", "dorsiflexion in the reference pose: the foot's upward normal from the shank's upward line, about the foot's -x",
            [Fo.x, S.y, Fo.z], (x, y, z) => angleAbout(scale(x, -1), scale(y, -1), scale(z, -1))),
          reach: [rom("ankleDorsiflexion"), rom("anklePlantarflexion")], exertions: ["ankleDorsiflexion", "anklePlantarflexion"] },
        { positive: "inversion", negative: "eversion", axis: mirrored(negated(Fo.y, "the foot's frame y"), "the foot's -y", side),
          bind: neutral("foot roll"),
          reach: [rom("footInversion"), rom("footEversion")], exertions: ["footInversion", "footEversion"] },
      ]),
    );
  }
  return joints;
}
