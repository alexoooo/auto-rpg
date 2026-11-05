import { Vector3 } from "../../core/math/vector.ts";
import type { BodyView } from "../../control/body.ts";
import { heldFrame, rigidPoints } from "../../core/bodies/build/rigid.ts";
import { pointAtToRef, specChainTo } from "../../control/kinematics.ts";
import type { MusclePush } from "../../control/motor.ts";
import { solve3To } from "../../core/math/flat.ts";
import { channelName } from "../../core/bodies/muscle/driver.ts";
import type { JointKinematics } from "../../core/bodies/read-body.ts";
import type { BodySpec, Side } from "../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import type { StrikingFace } from "./straight-punch.ts";

/** How far along its facing the second point that reads the face's facing stands from the face, m. */
const ALIGN_LEVER = 0.1;

/** How far each wrist freedom is turned to read what it does to the face's facing, rad. */
const ALIGN_PROBE = 0.01;

/** The damping of the wrist's least-squares turn, rad^2: how little a freedom that barely moves the facing is asked. */
const ALIGN_DAMPING = 0.01;

/** The most a step asks a wrist freedom ahead of where it stands, rad. */
const ALIGN_MOST = 0.5;

/** The turn a wrist freedom is pushed flat out toward, rad: a smaller one is pushed its share of that. */
const ALIGN_FULL = 0.2;

/**
 * **The wrist that turns `hand`'s face onto a way it is asked** (`ask`): the wrist's freedoms asked
 * the turn that brings the face's facing (`StrikingFace.facing`, as `hand` holds its item) onto
 * that way, by a damped least-squares step on their difference (`ALIGN_DAMPING`), each freedom's
 * effect read by turning it `ALIGN_PROBE` on the arm's chain as the body's angles stand, and each
 * pushed toward its turn, flat out from `ALIGN_FULL`, so the wrist holds the face against the
 * swinging arm's pull on the item. With
 * `either`, the facing against the way counts as met (a two-edged blade leads with either edge);
 * else only the facing along it (a point leads point first). Null where `hand` holds no item or
 * has no wrist.
 */
export function faceAligner(spec: BodySpec, hand: Side, face: StrikingFace, { either }: { readonly either: boolean }) {
  const held = spec.held?.find((one) => one.segment === `hand.${hand}`), segment = spec.segments.find((one) => one.name === `hand.${hand}`);
  if (!held || !segment) return null;
  const chain: JointKinematics[] = specChainTo(spec, `hand.${hand}`), wrist = chain.findIndex((joint) => joint.spec.name === `wrist.${hand}`);
  const at = rigidPoints(spec, segment).get(face.point)?.value;
  if (wrist < 0 || !at) return null;
  const frame = heldFrame(held), f = face.facing;
  const way = [0, 1, 2].map((k) => frame.x[k]! * f[0] + frame.y[k]! * f[1] + frame.z[k]! * f[2]);
  const length = Math.sqrt(way[0]! * way[0]! + way[1]! * way[1]! + way[2]! * way[2]!);
  const ahead = [0, 1, 2].map((k) => at[k]! + way[k]! / length * ALIGN_LEVER) as unknown as Vec3;
  const channels = chain.map((joint) => joint.dofs.map((_, k) => channelName(joint, k))), freedoms = Math.min(chain[wrist]!.dofs.length, 3);
  const angles = chain.map((joint) => joint.dofs.map(() => 0));
  const p = new Vector3(), q = new Vector3(), facing = new Float64Array(3), goal = new Float64Array(3), base = new Float64Array(3);
  const J = new Float64Array(9), A = new Float64Array(9), b = new Float64Array(3), x = new Float64Array(3);
  /** The face's facing, unit, root frame, with the chain at `angles`, onto `facing`. */
  const facingNow = () => {
    pointAtToRef(chain, angles, at, p); pointAtToRef(chain, angles, ahead, q);
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, n = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    facing[0] = dx / n; facing[1] = dy / n; facing[2] = dz / n;
  };
  return {
    /** The wrist's channels: the ones it asks. */
    channels: Object.freeze(channels[wrist]!.slice(0, freedoms)),
    /**
     * Each wrist channel's angle that turns the face onto `way` (root frame, any length), onto
     * `posture`, and its push toward it onto `pushes`; false where `way` has no length, and nothing
     * is asked.
     */
    ask(view: BodyView, way: ArrayLike<number>, posture: Record<string, number>, pushes: MusclePush[]): boolean {
      const n = Math.sqrt(way[0]! * way[0]! + way[1]! * way[1]! + way[2]! * way[2]!);
      if (!(n > 0)) return false;
      for (let j = 0; j < chain.length; j++) for (let k = 0; k < angles[j]!.length; k++) angles[j]![k] = view.angles[channels[j]![k]!] ?? 0;
      facingNow();
      const sign = either && facing[0]! * way[0]! + facing[1]! * way[1]! + facing[2]! * way[2]! < 0 ? -1 : 1;
      for (let i = 0; i < 3; i++) { goal[i] = sign * way[i]! / n; base[i] = facing[i]! - goal[i]!; }
      J.fill(0);
      for (let k = 0; k < freedoms; k++) {
        const was = angles[wrist]![k]!;
        angles[wrist]![k] = was + ALIGN_PROBE; facingNow(); angles[wrist]![k] = was;
        for (let row = 0; row < 3; row++) J[row * 3 + k] = (facing[row]! - goal[row]! - base[row]!) / ALIGN_PROBE;
      }
      // (J'J + damping) x = -J' r: the least turn that takes the facing onto the way.
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) A[i * 3 + k] = J[i]! * J[k]! + J[3 + i]! * J[3 + k]! + J[6 + i]! * J[6 + k]! + (i === k ? ALIGN_DAMPING : 0);
        b[i] = -(J[i]! * base[0]! + J[3 + i]! * base[1]! + J[6 + i]! * base[2]!);
      }
      solve3To(A, b, x);
      for (let k = 0; k < freedoms; k++) {
        const turn = Math.max(-ALIGN_MOST, Math.min(ALIGN_MOST, x[k]!)), channel = channels[wrist]![k]!;
        posture[channel] = angles[wrist]![k]! + turn;
        if (turn !== 0) pushes.push({ channel, sense: turn > 0 ? 1 : -1, level: Math.min(1, Math.abs(turn) / ALIGN_FULL) });
      }
      return true;
    },
  };
}
