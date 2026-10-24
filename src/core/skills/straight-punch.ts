import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { bodyEffectors } from "../control/effectors.ts";
import { intoFrameToRef, pointAtToRef, reachWork, solveReach } from "../control/kinematics.ts";
import type { MusclePush, PointTask, Pose } from "../control/motor.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { channelName } from "../muscle/driver.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { type StrikeReport } from "./strike.ts";
import { turnSense } from "./whole-body-strike.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, Readiness, TargetResolver } from "./action.ts";
import { withinActionWindow } from "../mind/action-window.ts";
import { closesToStrike } from "./strikes.ts";

/**
 * **A straight punch's settings.** It is admitted with the body moving no faster than `pace`
 * m/s, facing the target, with it `reach` of the arm's straight length (shoulder to knuckles)
 * from the punching shoulder, no more than `band` m further across the ground and no nearer than
 * `CROWDED` (`punchReadiness`: the tactics bring the body there), and stands for `settle` s with
 * both feet bearing (no foot swinging in a step), its fist set on the
 * line from the shoulder to the target `chamber` m from the shoulder (none at 0). Then the hips
 * turn its punching shoulder forward by `hips` rad (the stance's heading, `Claim.steer`), the
 * chest by `turn` rad and the trunk leans `lean` rad, and `lead` s later the arm is driven at its
 * contact pose: straight at a point `through` m past the target along the line from the shoulder,
 * the elbow `elbow` s after the rest of the arm, so the upper arm lifts the fist to the line
 * before the forearm opens along it. Each channel is pushed flat out until it is within `brake`
 * rad of its goal, then held there by the posture. The drive ends `follow` s after the hand begins
 * to touch something, or `longest` s after it began; the arm comes back to the guard over
 * `recover` s. With `landed`, the drive also waits for both feet to bear: a step under way lands
 * first, as a boxer's lead foot lands with the jab. With `driven`, the arm is not pushed joint by
 * joint: from `lead` its striking point is driven (`PointTask`) to where the contact pose puts it,
 * at the speed `accel` m/s^2 gives it over what is left of the way, and no less than it gives over
 * `arrive` m, so the fist meets the target moving and the arm's range stops it; the velocity that
 * asks closed at `steer` per second and the ask no more than `accel`. The arm is drawn toward its
 * contact pose beneath it, and the whole-body solve gives what the muscles can.
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
  readonly landed?: boolean;
  readonly driven?: { readonly accel: number; readonly steer: number; readonly arrive: number };
}

/**
 * A straight punch's drive settings: a bare-handed search of Arena
 * bouts of the Puncher against Classic, Combat, Brawler, Kicker, Scrapper and itself fighting
 * back, scored by the hit points and the share of the head each side lost and held to the punch
 * test's walked-in blows on a Warrior standing in guard (`research/punch-in-bout.mjs --scene
 * --head 2`), rounded, with the arm pushed flat out to its goal (no `brake`) and brought back over
 * 0.376 s, not the searched 0.26 s, over which it fell eight times as often against itself, and the
 * hips turned 0.22 rad, which beat the searched 0.077 against itself without falling more; at the
 * longest reach whose fist still meets its target with the arm behind it: an arm apart, not chest
 * to chest. The entry band permits 0.05 m beyond that stand-off: the bounded drive must reach a
 * stationary target without relying on a foe walking into it.
 */
export const STRAIGHT_PUNCH: StraightPunch = deepFreeze({
  pace: 1.021, reach: 0.8, band: 0.05, settle: 0, through: 0.265, hips: 0.22, turn: 0.41, lean: 0.276,
  chamber: 0.195, lead: 0.055, elbow: 0, brake: 0, follow: 0.02, longest: 0.249, recover: 0.376,
});

/** Whether `settings` are a straight punch's: every one finite and not negative, the pace, reach, band and drive's length positive. */
export function validStraightPunch(settings: StraightPunch): boolean {
  const values = [settings.pace, settings.reach, settings.band, settings.settle, settings.through, settings.hips, settings.turn, settings.lean,
    settings.chamber, settings.lead, settings.elbow, settings.brake, settings.follow, settings.longest, settings.recover];
  return values.every((v) => Number.isFinite(v) && v >= 0) && settings.pace > 0 && settings.reach > 0 && settings.band > 0 && settings.longest > 0
    && (settings.landed === undefined || typeof settings.landed === "boolean")
    && (settings.driven === undefined || [settings.driven.accel, settings.driven.steer, settings.driven.arrive].every((v) => Number.isFinite(v) && v >= 0) && settings.driven.accel > 0);
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
  /** The striking point, body frame, reference pose, and its name. */
  readonly point: Vec3;
  readonly aim: string;
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

/** Where a straight punch is: standing at its stand-off, driven, or coming back. */
type Phase = "settle" | "swing" | "return";

/** How far nearer than its stand-off a foe may come before the punch backs out from it, m. */
const CROWDED = 0.05;

/**
 * The fastest its centre of mass may move across the ground, m/s, for a stance shifting its weight
 * for a step to count as set: a drive begun from a shift while the body still carries its walk
 * throws it over.
 */
const SHIFTING_PACE = 0.25;

const HANDS: readonly Side[] = Object.freeze(["left", "right"]);
/**
 * **The straight punch**: a hand's blow thrown with the arm lined up behind the fist, for a fist
 * that meets its target with the arm's mass behind it rather than an elbow giving way. Admitted
 * with the target `reach` from the head, facing it (`punchReadiness`), it
 * stands there `settle` s with both feet bearing, its fist on the line (its chamber): a stance
 * shifting its weight for a step still bears on both, and so counts while the body moves no
 * faster than `SHIFTING_PACE`, since waiting for the step to land would cost it a quarter of its
 * punches. Then it turns the hips and the
 * chest and leans the trunk to bring the punching shoulder forward, and drives the arm, `lead` s
 * behind, at its
 * contact pose, solved each step for where the target is (`solveReach`): the striking point on
 * the line from the shoulder, `through` m past the target, with the elbow straight and the wrist
 * on the line where the reach leaves them free. Each channel is pushed flat out toward its goal
 * and held once near it (`StraightPunch.brake`). After the drive it brings the arm back to the
 * guard and stands. An attack given up before the drive is dropped; a drive begun is thrown to its
 * end. It has the legs from its stand to its return, and the hand is closed throughout.
 */
export function straightTechnique(body: Body, guard: Pose, settings: StraightPunch) {
  const built = body.built, spec = built.spec, sense = { left: turnSense("left"), right: turnSense("right") };
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
    return { chain, free: effector.free.map((f) => ({ ...f })), work: reachWork(effector.free.length), point: effector.points.get(aim)!, aim,
      trunk, shoulder, arm, goals, angles, trunkChain: chain.slice(0, trunk),
      trunkNames: chain.slice(0, trunk).map((joint) => joint.dofs.map((_, k) => channelName(joint, k))), trunkAngles: angles.slice(0, trunk) };
  };
  const limbs = { left: limbOf("left"), right: limbOf("right") };
  const state = {
    hand: null as Side | null, phase: null as Phase | null,
    /** Where it aims, world, the last target asked; the way it faces as the drive began. */
    target: [0, 0, 0] as [number, number, number], face: 0,
    /** Seconds stood at the stand-off on both feet; when the drive began, when its hand began to touch, whether it touched last step, and when it came back. */
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
    rangeAt: (hand, up) => ({ reach: standOff(hand, up), along: [-CROWDED, settings.band] }),
  };
  const end = () => { state.hand = null; state.phase = null; state.touched = null; state.stood = 0; state.still = 0; };
  const target = new Vector3(), shoulder = new Vector3(), head = new Vector3(), goal = new Vector3(), headAt: [number, number, number] = [0, 0, 0];
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
   * The posture, pushes and point driven of a drive `since` s old: the trunk's goals from its
   * start; from `lead` the arm's contact pose, the striking point `through` m past the target on
   * the line from the shoulder, the elbow straight and the wrist on the line, the elbow from
   * `elbow` s later; or with `driven`, the arm drawn to that pose and its striking point driven
   * (`drivenPoint`).
   */
  const drive = (view: BodyView, hand: Side, since: number, pushes: MusclePush[], points: PointTask[]): Pose => {
    const limb = limbs[hand], posture: Record<string, number> = { ...(chamber(view, hand) ?? guard) };
    solve(view, limb, true, (apart) => apart + settings.through, null);
    const push = (channel: string, goal: number) => {
      const error = goal - (view.angles[channel] ?? 0);
      if (Math.abs(error) > settings.brake) pushes.push({ channel, sense: error > 0 ? 1 : -1, level: 1 });
      posture[channel] = goal;
    };
    for (const g of limb.goals) push(g.channel, g.angle);
    if (since >= settings.lead && settings.driven) {
      for (const f of limb.free) posture[f.name] = limb.angles[f.joint]![f.k]!;
      points.push(drivenPoint(view, hand, limb, settings.driven));
    } else if (since >= settings.lead) {
      for (const f of limb.free) if (!/^elbow/.test(f.name) || since >= settings.lead + settings.elbow) push(f.name, limb.angles[f.joint]![f.k]!);
    }
    return posture;
  };
  /**
   * The striking point driven to where the limb's contact pose, as last solved, puts it: toward it at
   * the speed `accel` gives over the way left, or over `arrive` where that is longer, that velocity
   * closed at `steer` and the ask no more than `accel`.
   */
  const drivenPoint = (view: BodyView, hand: Side, limb: Limb, { accel, steer, arrive }: NonNullable<StraightPunch["driven"]>): PointTask => {
    pointAtToRef(limb.chain, limb.angles, limb.point, goal);
    goal.applyRotationQuaternionToRef(view.root.rotation, goal).addInPlace(view.root.position);
    const fist = view.fists[hand], v = fist.velocity;
    const dx = goal.x - fist.position.x, dy = goal.y - fist.position.y, dz = goal.z - fist.position.z, apart = hypot(dx, dy, dz);
    const speed = apart > 0 ? Math.sqrt(2 * accel * Math.max(apart, arrive)) / apart : 0;
    const ax = steer * (dx * speed - v.x), ay = steer * (dy * speed - v.y), az = steer * (dz * speed - v.z), size = hypot(ax, ay, az);
    const scale = size > accel ? accel / size : 1;
    return { segment: `hand.${hand}`, point: limb.aim, accel: [ax * scale, ay * scale, az * scale] };
  };
  const read = (view: BodyView) => {
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
  };
  return { state, report, end, read, standOff, chamber, drive, sense,
    heightFits: (hand: Side, up: number) => Math.abs(up - state.shoulders[hand][1]) <= settings.reach * limbs[hand].arm };
}

/** A stopped approach must establish its local stroke within this many seconds. */
export const PUNCH_PREPARE_LIMIT = 6;

/** Whether the body stands quiet enough to drive a punch: standing, or shifting its weight no faster than `SHIFTING_PACE`. */
export const quietToPunch = (view: BodyView): boolean =>
  view.stance.phase === "stand" || view.stance.phase === "shift" && hypot(view.stance.velocity.x, view.stance.velocity.z) < SHIFTING_PACE;

/**
 * Whether `hand`'s straight punch at `at` (`technique`'s, with `settings`) can be thrown from where
 * the body stands, facing `heading`: blocked out of the arm's height band; else ready within its
 * window, its stand-off on the ground from the target, or the window to walk to.
 */
export function punchReadiness(view: BodyView, technique: ReturnType<typeof straightTechnique>, settings: StraightPunch, hand: Side, at: Vec3, heading: number): Readiness {
  const reach = technique.standOff(hand, at[1] - view.head.y);
  if (!technique.heightFits(hand, at[1] - view.head.y)) return { kind: "blocked", reason: "target is outside the arm's height band" };
  const dx = view.head.x - view.stance.centre.x, dz = view.head.z - view.stance.centre.z;
  const ahead = dx * sin(heading) + dz * cos(heading), across = dx * cos(heading) - dz * sin(heading);
  // Entry permits the configured approach speed and a modest bearing error before settling.
  const window = { at, along: [reach + ahead - CROWDED, reach + ahead + settings.band] as const,
    across: [across - settings.band, across + settings.band] as const, facing: .4, speed: settings.pace };
  if (!withinActionWindow(view, window, heading)) return { kind: "position", window };
  return { kind: "ready" };
}

/** A straight-punch instance owns settling, its committed drive and its bounded guard return; `requireArmAim` checks the aim while the trunk leads the arm. */
export function straightPunchExecutor(body: Body, guard: Pose, actions: readonly string[], settings: StraightPunch,
  resolve: TargetResolver, { requireArmAim = false }: { readonly requireArmAim?: boolean } = {}): Executor {
  if (!validStraightPunch(settings)) throw new Error("invalid straight punch settings");
  const technique = straightTechnique(body, guard, settings), motion = technique.state;
  technique.read(body.view);
  const sides = { left: ["hand.left", "trunk", "legs"], right: ["hand.right", "trunk", "legs"] } as const;
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`straight punch has no effector ${effector}`);
  };
  const state = { motion, live: null as null | { request: ActionRequest; hand: Side; phase: "prepare" | "commit" | "release";
    stage: "admitting" | "settle" | "swing" | "return"; time: number; quiet: number; lower: number;
    withdrawn: boolean; ending: ActionEnding } };
  const release = (ending: ActionEnding) => {
    const live = state.live!; live.phase = "release"; live.stage = "return"; live.time = 0; live.ending = ending; motion.phase = "return";
  };
  const sparse = (posture: Pose, hand: Side): Pose => Object.fromEntries(Object.entries(posture)
    .filter(([channel]) => !channel.includes(`.${hand === "left" ? "right" : "left"} `)));
  return {
    state,
    needs(_action, effector) { return sides[sideOf(effector)]; },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.live) return { kind: "waiting", reason: "straight punch is striking or returning" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      return punchReadiness(view, technique, settings, sideOf(effector), at, around.heading);
    },
    resume() { state.live = null; technique.end(); },
    interrupt(_view, id) { if (state.live?.request.id === id) { state.live = null; technique.end(); } },
    start(view, request, around) {
      if (state.live) throw new Error("straight punch already owns an instance");
      const hand = sideOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("straight punch target has no aim");
      state.live = { request: { ...request }, hand, phase: "prepare", stage: "admitting", time: 0, quiet: 0, lower: around.lower,
        withdrawn: false, ending: { kind: "completed" } };
      motion.hand = hand; motion.phase = "settle"; motion.target = [...at]; motion.face = atan2(at[0] - view.head.x, at[2] - view.head.z);
      motion.began = view.time; motion.now = view.time; motion.touched = null; motion.touching = false;
    },
    update(view, continued, _around, dt) {
      technique.read(view); motion.now = view.time;
      const live = state.live;
      if (!live) return [];
      if (view.down) { state.live = null; technique.end(); return [{ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }]; }
      const request = continued.find(one => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      const source = request ?? live.request, at = resolve(view, source.target, source.action, source.effector);
      if (live.phase === "prepare" && (live.withdrawn || !at)) release(!at ? { kind: "lost", reason: "target is no longer sensed" } : { kind: "cancelled" });
      else if (requireArmAim && live.phase === "commit" && live.time < settings.lead && !at) release({ kind: "completed" });
      if (at && !live.withdrawn && live.phase !== "release") motion.target = [...at];
      live.time += dt;
      if (live.phase === "prepare") {
        live.stage = "settle";
        const quiet = quietToPunch(view);
        live.quiet = quiet ? live.quiet + dt : 0;
        if (live.time >= PUNCH_PREPARE_LIMIT) release({ kind: "stalled", reason: "settling deadline" });
        else if (quiet && live.quiet >= settings.settle) {
          live.phase = "commit"; live.stage = "swing"; live.time = 0; motion.phase = "swing";
          motion.began = view.time; motion.touched = null; motion.face = atan2(motion.target[0] - view.head.x, motion.target[2] - view.head.z);
          motion.touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        }
      } else if (live.phase === "commit") {
        const touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        if (touching && !motion.touching && motion.touched === null) motion.touched = view.time;
        motion.touching = touching;
        if (motion.touched !== null && view.time - motion.touched >= settings.follow || live.time >= settings.longest) release({ kind: "completed" });
      } else if (live.time >= settings.recover) {
        const ending = live.ending; state.live = null; technique.end(); return [{ id: live.request.id, ending }];
      }
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: sides[live.hand] }];
      return updates;
    },
    command(view, id) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`straight punch has no instance ${id}`);
      const pushes: MusclePush[] = [], points: PointTask[] = [];
      const posture = live.phase === "commit" ? technique.drive(view, live.hand, live.time, pushes, points)
        : live.phase === "prepare" ? technique.chamber(view, live.hand) ?? guard : guard;
      return { posture: sparse(posture, live.hand), pushes, points, ...(closesToStrike(body.built.spec, live.hand) ? { handPoses: { [`hand.${live.hand}`]: "fist" as const } } : {}),
        legs: { kind: "walk", walk: null, face: motion.face }, lower: live.lower,
        steer: live.phase === "commit" ? technique.sense[live.hand] * settings.hips : 0 };
    },
  };
}
