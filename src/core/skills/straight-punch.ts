import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { bodyEffectors } from "../control/effectors.ts";
import { intoFrameToRef, pointAtToRef, reachWork, solveReach } from "../control/kinematics.ts";
import type { EffectorGoal, MusclePush, Pose } from "../control/motor.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { channelName } from "../muscle/driver.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { guardPosture } from "./guard.ts";
import type { BlowSkill } from "./skill.ts";
import { APPROACH, type StrikeReport } from "./strike.ts";
import { turnSense } from "./whole-body-strike.ts";

/**
 * **A straight punch's settings.** The body walks at `pace` m/s at most to stand, facing the
 * target, with it `reach` of the arm's straight length (shoulder to knuckles) from the punching
 * shoulder, within `band` m across the ground, for `settle` s, its fist set on the
 * line from the shoulder to the target `chamber` m from the shoulder (none at 0). Then the hips
 * turn its punching shoulder forward by `hips` rad (the stance's heading, `Claim.steer`), the
 * chest by `turn` rad and the trunk leans `lean` rad, and `lead` s later the arm is driven at its
 * contact pose: straight at a point `through` m past the target along the line from the shoulder,
 * the elbow `elbow` s after the rest of the arm, so the upper arm lifts the fist to the line
 * before the forearm opens along it. Each channel is pushed flat out until it is within `brake`
 * rad of its goal, then held there by the posture. The drive ends `follow` s after the hand begins
 * to touch something, or `longest` s after it began; the arm comes back to the guard over
 * `recover` s.
 */
export interface StraightPunch {
  readonly pace: number;
  readonly reach: number;
  readonly band: number;
  readonly settle: number;
  readonly through: number;
  readonly hips: number;
  readonly turn: number;
  readonly lean: number;
  readonly chamber: number;
  readonly lead: number;
  readonly elbow: number;
  readonly brake: number;
  readonly follow: number;
  readonly longest: number;
  readonly recover: number;
}

/**
 * A straight punch's settings as the game throws it: the best of a bare-handed search of Arena
 * bouts against a Warrior standing in guard (`research/punch-in-bout.mjs`), rounded, at the
 * longest reach whose fist still meets its target with the arm behind it: an arm apart, not chest
 * to chest.
 */
export const STRAIGHT_PUNCH: StraightPunch = deepFreeze({
  pace: 0.596, reach: 0.8, band: 0.148, settle: 0.023, through: 0.32, hips: 0.13, turn: 0.427, lean: 0.143,
  chamber: 0.024, lead: 0.007, elbow: 0.002, brake: 0.024, follow: 0.021, longest: 0.475, recover: 0.163,
});

/** Whether `settings` are a straight punch's: every one finite and not negative, the pace, reach, band and drive's length positive. */
export function validStraightPunch(settings: StraightPunch): boolean {
  const values = [settings.pace, settings.reach, settings.band, settings.settle, settings.through, settings.hips, settings.turn, settings.lean,
    settings.chamber, settings.lead, settings.elbow, settings.brake, settings.follow, settings.longest, settings.recover];
  return values.every((v) => Number.isFinite(v) && v >= 0) && settings.pace > 0 && settings.reach > 0 && settings.band > 0 && settings.longest > 0;
}

/** Whether a body of `spec` can throw the straight punch: a hand effector each side, below a chest, and a thoracic joint that turns it. */
export function straightPunchFits(spec: BodySpec): boolean {
  const hand = (side: Side) => spec.effectors?.some((e) => e.segment === `hand.${side}` && e.base === "upperTrunk") ?? false;
  return hand("left") && hand("right") && spec.joints.some((j) => j.name === "thoracic");
}

/** What a hand's straight punch moves: the arm's chain from the root, its free freedoms, the trunk's, and the shoulder. */
interface Limb {
  readonly chain: ReturnType<typeof bodyEffectors>[number]["chain"];
  /** The arm's freedoms (`solveReach`), each drawn toward the contact pose's preferred angle. */
  readonly free: { joint: number; k: number; min: number; max: number; preferred: number; name: string }[];
  readonly work: ReturnType<typeof reachWork>;
  /** The striking point, body frame, reference pose. */
  readonly point: Vec3;
  /** The chain's joints before the arm's, and the shoulder's centre on the last of their segments. */
  readonly trunk: number;
  readonly shoulder: Vec3;
  /** The shoulder to the striking point with the elbow straight and the wrist on line, m. */
  readonly arm: number;
  /** The chain's joints before the arm's, their channels and their rows of `angles`. */
  readonly trunkChain: Limb["chain"];
  readonly trunkNames: readonly (readonly string[])[];
  readonly trunkAngles: number[][];
  /** The trunk's goals at contact, by channel: the chest's turn and the lean, each the way that brings this shoulder forward. */
  readonly goals: readonly { readonly channel: string; readonly joint: number; readonly k: number; readonly angle: number }[];
  /** The angles the solve works in, by chain joint. */
  readonly angles: number[][];
}

/** Where a straight punch is: walking to its stand-off, standing there, driven, or coming back. */
type Phase = "approach" | "settle" | "swing" | "return";

const HANDS: readonly Side[] = Object.freeze(["left", "right"]);
const NO_HANDS = Object.freeze({ left: null, right: null }) as Readonly<Record<Side, EffectorGoal | null>>;
const CLOSED: Readonly<Record<Side, Readonly<Record<Side, boolean>>>> = Object.freeze({
  left: Object.freeze({ left: true, right: false }), right: Object.freeze({ left: false, right: true }),
});

/**
 * **The straight punch**: a hand's blow thrown with the arm lined up behind the fist, for a fist
 * that meets its target with the arm's mass behind it rather than an elbow giving way. Given an
 * attack, it walks the body to where the target stands `reach` from the head, facing it, closing
 * the error over `APPROACH.seconds`, and stands there `settle` s with its fist on the line (its
 * chamber). Then it turns the hips and the chest and leans the trunk to bring the punching
 * shoulder forward, and drives the arm, `lead` s behind, at its
 * contact pose, solved each step for where the target is (`solveReach`): the striking point on
 * the line from the shoulder, `through` m past the target, with the elbow straight and the wrist
 * on the line where the reach leaves them free. Each channel is pushed flat out toward its goal
 * and held once near it (`StraightPunch.brake`). After the drive it brings the arm back to the
 * guard and stands. An attack given up before the drive is dropped; a drive begun is thrown to its
 * end. It has the legs from its approach to its return, and the hand is closed throughout.
 */
export function straightPunch(body: Body, settings: StraightPunch = STRAIGHT_PUNCH): BlowSkill {
  const built = body.built, spec = built.spec, guard = guardPosture(spec), sense = { left: turnSense("left"), right: turnSense("right") };
  if (!straightPunchFits(spec)) throw new Error(`${spec.model} cannot throw the straight punch`);
  const effectors = bodyEffectors(built), at = new Vector3(), before = new Vector3();
  const limbOf = (hand: Side): Limb => {
    const effector = effectors.find((e) => e.segment.spec.name === `hand.${hand}`)!;
    const { chain } = effector, trunk = effector.free[0]!.joint, aim = effector.model.point;
    const angles = chain.map((joint) => joint.dofs.map(() => 0));
    const shoulder = chain[trunk]!.spec.centre.value;
    // Each trunk freedom named, signed by which way of it carries the shoulder forward (+z) from the reference pose.
    const goals: Limb["goals"][number][] = [];
    const goal = (joint: string, pattern: RegExp, amount: number) => {
      const j = chain.findIndex((c) => c.spec.name === joint);
      if (j < 0 || j >= trunk) return;
      const k = chain[j]!.dofs.findIndex((_, i) => pattern.test(channelName(chain[j]!, i)));
      if (k < 0) return;
      const dof = chain[j]!.dofs[k]!.spec;
      pointAtToRef(chain.slice(0, trunk), angles.slice(0, trunk), shoulder, before);
      angles[j]![k] = 0.1;
      pointAtToRef(chain.slice(0, trunk), angles.slice(0, trunk), shoulder, at);
      angles[j]![k] = 0;
      const angle = (at.z > before.z ? 1 : -1) * amount;
      goals.push({ channel: channelName(chain[j]!, k), joint: j, k, angle: Math.max(dof.min.value, Math.min(dof.max.value, angle)) });
    };
    goal("thoracic", /rotation/, settings.turn);
    goal("lumbar", /^lumbar flexion$/, settings.lean);
    for (const f of effector.free) if (/^elbow/.test(f.name)) angles[f.joint]![f.k] = f.min;
    pointAtToRef(chain, angles, effector.points.get(aim)!, at);
    for (const f of effector.free) angles[f.joint]![f.k] = 0;
    const arm = hypot(at.x - shoulder[0], at.y - shoulder[1], at.z - shoulder[2]);
    return { chain, free: effector.free.map((f) => ({ ...f })), work: reachWork(effector.free.length), point: effector.points.get(aim)!,
      trunk, shoulder, arm, goals, angles, trunkChain: chain.slice(0, trunk),
      trunkNames: chain.slice(0, trunk).map((joint) => joint.dofs.map((_, k) => channelName(joint, k))), trunkAngles: angles.slice(0, trunk) };
  };
  const limbs = { left: limbOf("left"), right: limbOf("right") };
  const state = {
    hand: null as Side | null, phase: null as Phase | null,
    /** Where it aims, world, the last target asked; the way it faces as the drive began. */
    target: [0, 0, 0] as [number, number, number], face: 0,
    /** Seconds stood at the stand-off; when the drive began, when its hand began to touch, whether it touched last step, and when it came back. */
    stood: 0, began: 0, touched: null as number | null, touching: false, ended: 0, now: 0, headY: 0,
    still: 0, thrown: { left: 0, right: 0 },
    /**
     * Each shoulder at contact from the head as the last step left it, in the body frame: the
     * trunk at its contact goals and the hips turned, across, up and forward, m.
     */
    shoulders: { left: [0, 0, 0] as [number, number, number], right: [0, 0, 0] as [number, number, number] },
  };
  /**
   * How far across the ground the head stands from a target `up` m above it, facing it, for the
   * target to be `reach` of the arm from the `hand`'s shoulder as the drive carries it forward.
   */
  const standOff = (hand: Side, up: number): number => {
    const [across, high, ahead] = state.shoulders[hand], length = settings.reach * limbs[hand].arm, rise = up - high;
    const ground = Math.sqrt(Math.max(0, length * length - rise * rise));
    return Math.max(0, ahead + Math.sqrt(Math.max(0, ground * ground - across * across)));
  };
  const report: StrikeReport = {
    get hand() { return state.hand; },
    get phase() { return state.phase; },
    get blow() { return state.phase ? "placed" : null; },
    get distance() { return state.hand && state.phase ? standOff(state.hand, state.target[1] - state.headY) : null; },
    get since() { return state.phase === "swing" || state.phase === "return" ? state.now - state.began : -Infinity; },
    follows: true,
    thrown: state.thrown,
    get still() { return state.still; },
    rangeAt: (hand, up) => ({ reach: standOff(hand, up), along: [-settings.band, settings.band] }),
  };
  const end = () => { state.hand = null; state.phase = null; state.touched = null; state.stood = 0; state.still = 0; };
  const target = new Vector3(), shoulder = new Vector3(), head = new Vector3(), headAt: [number, number, number] = [0, 0, 0];
  /**
   * The arm's angles that put its striking point `out` m from the shoulder on the line to the
   * target, into the limb's `angles`: the trunk as it stands, or at its contact goals with
   * `turned`; the elbow drawn toward `elbow`, the wrist toward the line, the shoulder toward where it is.
   */
  const solve = (view: BodyView, limb: Limb, turned: boolean, out: (apart: number) => number, elbow: number | null): void => {
    const { chain, angles, free, goals } = limb;
    chain.forEach((joint, j) => joint.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
    if (turned) for (const g of goals) angles[g.joint]![g.k] = g.angle;
    intoFrameToRef(view.root, state.target, target);
    pointAtToRef(chain.slice(0, limb.trunk), angles.slice(0, limb.trunk), limb.shoulder, shoulder);
    const dx = target.x - shoulder.x, dy = target.y - shoulder.y, dz = target.z - shoulder.z, apart = hypot(dx, dy, dz) || 1, reach = out(apart) / apart;
    for (const f of free) f.preferred = /^elbow/.test(f.name) ? elbow ?? f.min : /^wrist/.test(f.name) ? 0 : angles[f.joint]![f.k]!;
    solveReach(chain, angles, free, [{ point: limb.point, target: [shoulder.x + dx * reach, shoulder.y + dy * reach, shoulder.z + dz * reach] }], undefined, limb.work);
  };
  /** The guard with the punching arm set on the line to the target, `chamber` m from the shoulder; the guard itself with no chamber. */
  const chamber = (view: BodyView, hand: Side): Pose | null => {
    if (settings.chamber === 0) return null;
    const limb = limbs[hand], posture: Record<string, number> = { ...guard };
    solve(view, limb, false, () => settings.chamber, guard[`elbow.${hand} flexion`] ?? null);
    for (const f of limb.free) posture[f.name] = limb.angles[f.joint]![f.k]!;
    return posture;
  };
  /**
   * The posture and pushes of a drive `since` s old: the trunk's goals from its start; from `lead`
   * the arm's contact pose, the striking point `through` m past the target on the line from the
   * shoulder, the elbow straight and the wrist on the line, the elbow from `elbow` s later.
   */
  const drive = (view: BodyView, hand: Side, since: number, pushes: MusclePush[]): Pose => {
    const limb = limbs[hand], posture: Record<string, number> = { ...(chamber(view, hand) ?? guard) };
    solve(view, limb, true, (apart) => apart + settings.through, null);
    const push = (channel: string, goal: number) => {
      const error = goal - (view.angles[channel] ?? 0);
      if (Math.abs(error) > settings.brake) pushes.push({ channel, sense: error > 0 ? 1 : -1, level: 1 });
      posture[channel] = goal;
    };
    for (const g of limb.goals) push(g.channel, g.angle);
    if (since >= settings.lead) {
      for (const f of limb.free) if (!/^elbow/.test(f.name) || since >= settings.lead + settings.elbow) push(f.name, limb.angles[f.joint]![f.k]!);
    }
    return posture;
  };
  return {
    report, state, releases: false, lower: null,
    get holds() { return state.hand; },
    get busy() { return state.phase === "swing" || state.phase === "return"; },
    accepts: () => true,
    resume() { end(); },
    command(view, attack, _intent, around, dt) {
      const t = state.now = view.time;
      state.still += dt;
      headAt[0] = view.head.x; headAt[1] = view.head.y; headAt[2] = view.head.z;
      intoFrameToRef(view.root, headAt, head);
      state.headY = view.head.y;
      for (const side of HANDS) {
        const limb = limbs[side], { trunkChain, trunkNames, trunkAngles } = limb;
        for (let j = 0; j < trunkChain.length; j++) {
          const names = trunkNames[j]!, row = trunkAngles[j]!;
          for (let k = 0; k < names.length; k++) row[k] = view.angles[names[k]!] ?? 0;
        }
        for (const g of limb.goals) trunkAngles[g.joint]![g.k] = g.angle;
        pointAtToRef(trunkChain, trunkAngles, limb.shoulder, shoulder);
        // The hips' turn swings the shoulder forward about up through the root.
        const h = settings.hips, toward = shoulder.x < 0 ? -1 : 1, x = shoulder.x * cos(h) - toward * shoulder.z * sin(h), z = toward * shoulder.x * sin(h) + shoulder.z * cos(h);
        const into = state.shoulders[side];
        into[0] = x - head.x; into[1] = shoulder.y - head.y; into[2] = z - head.z;
      }
      if (view.down) { if (state.hand) end(); return null; }
      // An attack given up, or another hand's, before the drive drops it.
      if ((state.phase === "approach" || state.phase === "settle") && attack?.hand !== state.hand) end();
      if (state.phase === null) {
        if (!attack) return null;
        state.hand = attack.hand; state.phase = "approach"; state.stood = 0;
      }
      const hand = state.hand!;
      if (attack && attack.hand === hand && state.phase !== "return") { state.target[0] = attack.target[0]; state.target[1] = attack.target[1]; state.target[2] = attack.target[2]; }
      const pushes: MusclePush[] = [];
      switch (state.phase) {
        case "approach": case "settle": {
          const [tx, , tz] = state.target, hx = view.head.x, hz = view.head.z, apart = hypot(tx - hx, tz - hz) || 1;
          const face = atan2(tx - hx, tz - hz), off = apart - standOff(hand, state.target[1] - view.head.y);
          if (Math.abs(off) > settings.band) {
            // Walked toward the stand-off along the line to the target, the centre of mass leading.
            const heading = around.heading, ux = (tx - hx) / apart * off, uz = (tz - hz) / apart * off;
            const s = sin(heading), c = cos(heading), forward = ux * s + uz * c, right = ux * c - uz * s;
            const speed = hypot(forward, right) / APPROACH.seconds, scale = speed > settings.pace ? settings.pace / speed : 1;
            state.phase = "approach"; state.stood = 0; state.still = 0;
            return { hands: NO_HANDS, posture: null, pushes, closed: CLOSED[hand], steer: 0,
              legs: { kind: "walk", walk: [forward / APPROACH.seconds * scale, right / APPROACH.seconds * scale], face } };
          }
          state.phase = "settle";
          if (view.stance.phase === "stand") state.stood += dt;
          if (state.stood < settings.settle) {
            return { hands: NO_HANDS, posture: chamber(view, hand), pushes, closed: CLOSED[hand], steer: 0, legs: { kind: "walk", walk: null, face } };
          }
          state.phase = "swing"; state.began = t; state.touched = null; state.face = face; state.thrown[hand]++;
          state.touching = (view.effectors[`hand.${hand}`]?.feedback?.impulse ?? 0) > 0;
          break;
        }
        case "swing": {
          // A touch the hand had as the drive began is not its blow: one that begins under it is.
          const touching = (view.effectors[`hand.${hand}`]?.feedback?.impulse ?? 0) > 0;
          if (touching && !state.touching && state.touched === null) state.touched = t;
          state.touching = touching;
          if ((state.touched !== null && t - state.touched >= settings.follow) || t - state.began >= settings.longest) { state.phase = "return"; state.ended = t; }
          break;
        }
        case "return":
          if (t - state.ended >= settings.recover) { end(); return null; }
          break;
        case null: return null;
        default: { const never: never = state.phase; throw new Error(`no phase ${JSON.stringify(never)}`); }
      }
      if (state.phase === "return") {
        return { hands: NO_HANDS, posture: null, pushes, closed: CLOSED[hand], steer: 0, legs: { kind: "walk", walk: null, face: state.face } };
      }
      const posture = drive(view, hand, t - state.began, pushes);
      return { hands: NO_HANDS, posture, pushes, closed: CLOSED[hand], steer: sense[hand] * settings.hips, legs: { kind: "walk", walk: null, face: state.face } };
    },
  };
}
