import { kickSkill, type KickTuning } from "./kick.ts";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import { cos, hypot, sin } from "../math/real.ts";
import type { EffectorGoal, MusclePush, Pose } from "../control/motor.ts";
import { validArmExtension, type BlowAttack, type BlowPath, type BlowFamily } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { skillSet, type SkillParts } from "./arbiter.ts";
import { attackPath, ATTACK_PATH, validAttackTuning, type AttackTuning } from "./attack-path.ts";
import { guardPosture, guardSkill } from "./guard.ts";
import { supportFold } from "./support-fold.ts";
import { locomotion, STANCE_LOWER, type TurnStartup } from "./locomotion.ts";
import type { BlowSkill, LegsAsk } from "./skill.ts";
import type { Skills } from "./skills.ts";
import { placedHeightFits, placedReach, type StrikeReport } from "./strike.ts";
import { aimOf, closesToStrike } from "./strikes.ts";
import { supportReadiness, bearingSupport, STRIKE_SUPPORT } from "../control/support-readiness.ts";
import { STRIKE_EVENT } from "./strike-cycle.ts";
import { effectorStrike, type StrikeCourse, type StrikeState } from "./effector-strike.ts";
import type { Side } from "../spec/body.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, Resource, TargetRef } from "./action.ts";
import { withinActionWindow } from "../mind/action-window.ts";

/** Experimental execution limits, independent of anatomy: `docs/reference/punch-foundation.md#execution-limits`. */
export const PUNCH_EXECUTION = Object.freeze({ impactSeconds: .04, impactTravel: .04, normalAlignment: .5 });
export const PLANTED_PUNCH_EXECUTION = Object.freeze({ ...PUNCH_EXECUTION, planted: true });
export interface CombatExecution { readonly planted?: boolean; readonly impactSeconds: number; readonly impactTravel: number; readonly normalAlignment: number }
export function validCombatExecution(execution: CombatExecution): boolean {
  return (execution.planted === undefined || typeof execution.planted === "boolean") && [execution.impactSeconds, execution.impactTravel, execution.normalAlignment]
    .every(v => Number.isFinite(v) && v >= 0) && execution.normalAlignment <= 1;
}

/**
 * **The driven strike**: the path strike with its trunk driven into the swing. The cross and the
 * hook turn the trunk the way that brings the striking shoulder back in the chamber and forward in
 * the swing, `torso` rad each way; the swing pushes `thoracic rotation right` flat out at level
 * `drive` (`MusclePush`) until the trunk is turned that far. The hand is aimed from where the trunk
 * is (`EffectorGoal.carried`); the chamber winds up `windup` m; and the swing takes the time an
 * evenly accelerating fist takes from where it is at launch to `contact` m/s at the target: twice
 * the distance over the speed.
 */
export interface DrivenStrike {
  readonly drive: number;
  readonly torso: number;
  readonly windup: number;
  readonly contact: number;
}

/** The driven strike's first setting tried, its punch rows in `docs/reference/competencies.md#research-blows`. */
export const DRIVEN_STRIKE: DrivenStrike = Object.freeze({ drive: 1, torso: 0.43, windup: 0.3, contact: 7.5 });

/** A driven strike's settings: a level in [0, 1], a turn and a wind-up finite and not negative, and a positive speed. */
export function validDrivenStrike(driven: DrivenStrike): boolean {
  return [driven.drive, driven.torso, driven.windup, driven.contact].every(Number.isFinite) && driven.drive >= 0 && driven.drive <= 1
    && driven.torso >= 0 && driven.windup >= 0 && driven.contact > 0;
}

/** **What the path strike's usual skill set is made of**; a setting left out is its default. */
interface CombatSettings {
  /** The hands' paths. */
  readonly paths?: AttackTuning;
  /** The kick, or none for a body that does not kick. */
  readonly kick?: KickTuning | null;
  /** How a contact is held, and whether a blow waits on planted support; with none, a contact ends the stroke. */
  readonly execution?: CombatExecution;
  readonly turnLimit?: number;
  readonly turnStartup?: TurnStartup;
  /** Whether it fights from low support too (`supportFold`). */
  readonly ground?: boolean;
  /** Whether a hand may start while the other is still returning. */
  readonly overlap?: boolean;
}

/** A blow the path skill throws: one that names its path. */
type PathBlow = BlowAttack & { readonly path: BlowPath };

/** A hand's strike, the blow it carries out from where, and how far the elbow has opened. */
interface HandBlow {
  readonly cycle: StrikeState;
  action: PathBlow | null;
  home: Vec3 | null;
  chamber: Vec3 | null;
  elbow: number;
  initialElbow: number;
  /** A driven swing's time, s, set at its launch (`DrivenStrike`); null otherwise. */
  launch: number | null;
}

/** The elbow's opening `u` of the way from `from` to `to`, eased in and out. */
const smoothElbow = (from: number, to: number, u: number) => from + (to - from) * u * u * (3 - 2 * u);

/** What a path strike's blows are carried out with, and whether its trunk is driven (`DrivenStrike`); a setting left out is its default. */
type PathStrikeSettings = Pick<CombatSettings, "paths" | "execution" | "overlap"> & { readonly driven?: DrivenStrike };

const HOLD: LegsAsk = Object.freeze({ kind: "hold" });
const FREE: LegsAsk = Object.freeze({ kind: "free" });
const NO_PUSHES: readonly MusclePush[] = Object.freeze([]);

/**
 * **The path strike**: each hand's blow carried along the path it names (`attackPath`) on the
 * strike cycle (`effectorStrike`), from chamber to return, a measured hand trajectory under a hand
 * goal. One hand begins at a time; with `overlap`, a hand may begin while the other returns. With
 * a planted `execution`, a blow waits on quiet planted support (`supportReadiness`) and holds the
 * walk until it is over; a swing holds it too. Resumed, a blow under way is interrupted. With
 * `driven`, it is the driven strike (`DrivenStrike`).
 */
export function pathStrike(body: Body, { paths = ATTACK_PATH, execution, overlap = false, driven }: PathStrikeSettings = {}): BlowSkill {
  if (execution && !validCombatExecution(execution)) throw new Error("invalid combat execution settings");
  if (driven && !validDrivenStrike(driven)) throw new Error("a driven strike needs a drive in [0,1], a turn and a wind-up not negative, and a positive contact speed");
  const tuning = driven ? { ...paths, windup: driven.windup, torso: driven.torso, contactSpeed: driven.contact } : paths;
  if (!validAttackTuning(tuning)) throw new Error("combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]");
  const spec = body.built.spec, guarding = guardPosture(spec);
  const elbowRange = (hand: Side) => spec.joints.find(j => j.name === `elbow.${hand}`)?.dofs.find(d => d.positive === "flexion");
  const elbows = { left: elbowRange("left"), right: elbowRange("right") };
  const foundation = execution?.planted ? supportReadiness(body.built) : null;
  // A bare hand closes for its strike cycle and strikes with its fist (`closesToStrike`).
  const bare = { left: closesToStrike(spec, "left"), right: closesToStrike(spec, "right") };
  const aims = { left: aimOf(spec, "left"), right: aimOf(spec, "right") };
  const limits = Object.freeze({ ...tuning, ...(execution ? { impact: execution } : {}) });
  const strikeOf = (hand: Side) => effectorStrike({ effector: `hand.${hand}`, point: aims[hand], limits,
    chamberSeconds: tuning.chamberSeconds, returnSeconds: tuning.returnSeconds });
  const strikes = { left: strikeOf("left"), right: strikeOf("right") };
  const blowOf = (hand: Side): HandBlow => ({ cycle: strikes[hand].state, action: null, home: null, chamber: null, elbow: 0, initialElbow: 0, launch: null });
  const state = { ...(foundation ? { foundation: foundation.state } : {}),
    lower: STANCE_LOWER, hand: null as Side | null, hands: { left: blowOf("left"), right: blowOf("right") },
    cooldown: 0, interrupted: 0, canOverlap: false };
  const rest = (blow: HandBlow) => { blow.action = null; blow.home = null; blow.chamber = null; blow.elbow = 0; blow.initialElbow = 0; blow.launch = null; };
  const target = new Vector3(), direction = new Vector3(), inverse = new Quaternion();
  const other = (hand: Side): Side => hand === "left" ? "right" : "left";
  /** The hand still returning beside the one striking, or after it. */
  const returning = (): Side | null => state.hand !== "left" && state.hands.left.cycle.phase !== null ? "left"
    : state.hand !== "right" && state.hands.right.cycle.phase !== null ? "right" : null;
  const busy = () => state.hands.left.cycle.phase !== null || state.hands.right.cycle.phase !== null;
  const report: StrikeReport = {
    get impact() { return state.hands.left.cycle.impact !== null || state.hands.right.cycle.impact !== null; },
    get hand() { return state.hand ?? returning(); },
    get phase() { return state.hand ? state.hands[state.hand].cycle.phase : returning() ? "return" : null; },
    get blow() { return busy() ? "placed" : null; },
    get returning() { return returning(); },
    get overlapHand() { return state.canOverlap && state.hand && state.hands[state.hand].cycle.phase === "return" && !returning() ? other(state.hand) : null; },
    get since() { const hand = state.hand ?? returning(); return hand ? state.hands[hand].cycle.time : -Infinity; },
    thrown: { get left() { return state.hands.left.cycle.thrown; }, get right() { return state.hands.right.cycle.thrown; } },
    pointCycle: { returned: { get left() { return state.hands.left.cycle.returned; }, get right() { return state.hands.right.cycle.returned; } },
      get failed() { return state.hands.left.cycle.failed + state.hands.right.cycle.failed; }, get interrupted() { return state.interrupted; } },
    get still() { return state.cooldown; },
    rangeAt(hand, up) { return { reach: placedReach(spec, hand, up), along: [-tuning.near, tuning.near] }; },
  };
  return {
    state, report, releases: true,
    get holds() { return state.hand; },
    get busy() { return busy(); },
    get lower() { return busy() ? state.lower : null; },
    accepts: (attack) => attack.path !== undefined,
    resume() {
      if (state.hands.left.cycle.phase !== null) state.interrupted++;
      if (state.hands.right.cycle.phase !== null) state.interrupted++;
      state.canOverlap = false;
      if (foundation) foundation.state.quiet = 0;
      body.built.handPoses.request((["left", "right"] as const).filter(h => bare[h]).map(hand => ({ hand, pose: "open" as const })));
      state.hand = null; state.cooldown = 0;
      for (const hand of ["left", "right"] as const) { strikes[hand].reset(); rest(state.hands[hand]); }
    },
    command(view, attack, intent, around, dt) {
      const velocities = { left: strikes.left.read(view, dt), right: strikes.right.read(view, dt) };
      foundation?.read(view.stance.centre, view.stance.velocity, dt);
      state.cooldown += dt;
      if (attack && !attack.path) throw new Error("the path skill throws a blow along the path it names");
      const requested = attack as PathBlow | null, support = around.support;
      if (requested && !validArmExtension(requested.path.armExtension)) throw new Error("combat armExtension must be finite and in [0,1]");
      const mayOverlap = () => {
        const h = state.hand;
        if (!overlap || !h) return false;
        const { home, cycle } = state.hands[h];
        if (!home || cycle.phase !== "return" || state.hands[other(h)].cycle.phase !== null || view.down
          || (support && support.stage !== "stand") || state.lower !== STANCE_LOWER
          || (intent.lower ?? STANCE_LOWER) !== STANCE_LOWER || (view.effectors[`hand.${h}`]!.feedback?.impulse ?? 0) > 0) return false;
        const at = cycle.previous!, velocity = velocities[h];
        return velocity[0] * (home[0] - at[0]) + velocity[1] * (home[1] - at[1]) + velocity[2] * (home[2] - at[2]) > 0;
      };
      if (requested && requested.hand !== state.hand && mayOverlap()) state.hand = null;
      if (!state.hand && requested && state.hands[requested.hand].cycle.phase === null && view.time >= tuning.startup && state.cooldown >= tuning.hold && (!foundation || (foundation.state.quiet >= STRIKE_SUPPORT.hold && view.stance.phase === "stand" && !view.down)) && (!support || support.stage === "stand" || support.ready)) {
        const hand = requested.hand, starting = state.hands[hand];
        starting.action = { ...requested, target: [...requested.target], path: { ...requested.path, ...(requested.path.direction ? { direction: [...requested.path.direction] as Vec3 } : {}) } };
        state.hand = hand; state.lower = intent.lower ?? STANCE_LOWER;
        starting.home = [...starting.cycle.previous!];
        intoFrameToRef(view.root, requested.target, target);
        starting.chamber = attackPath(starting.home, [target.x, target.y, target.z], hand, requested.path.family, tuning).chamber;
        starting.initialElbow = starting.elbow; strikes[hand].begin("chamber", velocities[hand]);
      }
      let posture: Pose = guarding, pushes = NO_PUSHES;
      const goals: Record<Side, EffectorGoal | null> = { left: null, right: null };
      const advance = (hand: Side) => {
        const striking = state.hands[hand], strike = strikes[hand], action = striking.action!, home = striking.home!, chamber = striking.chamber!;
        intoFrameToRef(view.root, action.target, target);
        const contactDirection = action.path.direction ? direction.set(...action.path.direction)
          .applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), direction) : null;
        const path = attackPath(home, [target.x, target.y, target.z], hand, action.path.family, tuning,
          contactDirection ? [contactDirection.x, contactDirection.y, contactDirection.z] : undefined);
        let course: StrikeCourse = { home, chamber, target: [target.x, target.y, target.z], contactVelocity: path.contactVelocity,
          seconds: striking.launch ?? path.seconds, ...(path.curve ? { curve: path.curve } : {}) };
        const previousPhase = striking.cycle.phase;
        const event = strike.step(view, velocities[hand], course, { requested: !!requested, down: view.down,
          supported: !foundation || bearingSupport(foundation.state), prepared: !bare[hand] || view.handPoses[hand]?.applied === "fist",
          free: true, targetId: action.targetId }, dt);
        if (striking.cycle.phase !== previousPhase) {
          striking.initialElbow = striking.elbow;
          if (driven && striking.cycle.phase === "swing") {
            const at = striking.cycle.previous!;
            striking.launch = Math.max(dt, 2 * hypot(target.x - at[0], target.y - at[1], target.z - at[2]) / driven.contact);
            course = { ...course, seconds: striking.launch };
          }
        }
        if (event & STRIKE_EVENT.finished) {
          if (hand === state.hand) { state.hand = null; state.cooldown = 0; }
          rest(striking);
        }
        const phase = striking.cycle.phase;
        if (!phase) return;
        goals[hand] = driven ? { ...strike.goal(course), carried: true } : strike.goal(course);
        const extension = action.path.armExtension ?? tuning.elbowExtension;
        if (extension || striking.elbow) {
          striking.elbow = smoothElbow(striking.initialElbow, phase === "swing" ? extension : 0, Math.min(1, striking.cycle.time / strike.seconds(course)));
          const dof = elbows[hand], name = `elbow.${hand} flexion`, preferred = (1 - striking.elbow) * guarding[name]!;
          if (dof) posture = { ...posture, [name]: Math.max(dof.min.value, Math.min(dof.max.value, preferred)) };
        }
        // The driven strike turns the trunk the other way: the striking shoulder forward in the swing.
        const turn = driven ? -path.torso : path.torso, rotation = phase === "chamber" ? -turn : phase === "swing" ? turn : 0;
        if (rotation) {
          const dof = spec.joints.find(j => j.name === "thoracic")?.dofs.find(d => d.positive === "rotation right");
          const sense = rotation > 0 ? 1 : -1, turned = sense * (view.angles["thoracic rotation right"] ?? 0) >= sense * rotation;
          if (driven && driven.drive > 0 && phase === "swing" && dof && !turned) pushes = [{ channel: "thoracic rotation right", sense, level: driven.drive }];
          else posture = { ...posture, "thoracic rotation right": dof ? Math.max(dof.min.value, Math.min(dof.max.value, rotation)) : 0 };
        }
      };
      const main = state.hand, back = returning();
      if (main) advance(main);
      if (back) advance(back);
      state.canOverlap = mayOverlap();
      const swinging = state.hand !== null && state.hands[state.hand].cycle.phase === "swing";
      return {
        hands: goals, posture: posture === guarding ? null : posture, pushes, steer: 0,
        closed: { left: state.hands.left.cycle.phase !== null, right: state.hands.right.cycle.phase !== null },
        legs: (execution?.planted && state.hand !== null) || swinging ? HOLD : FREE,
      };
    },
  };
}

/** The path strike's usual skills of `body`: the walk, the guard, the path strike, and the kick and the support fold it has. */
export function pathParts(body: Body, { paths, kick, execution, turnLimit, turnStartup, ground = false, overlap = false }: CombatSettings = {}): SkillParts {
  return {
    legs: locomotion(body.envelope, turnLimit, turnStartup), guard: guardSkill(body.built.spec),
    blow: pathStrike(body, { ...(paths ? { paths } : {}), ...(execution ? { execution } : {}), overlap }),
    kick: kick ? kickSkill(body, kick) : null, support: ground ? supportFold(body) : null,
  };
}

/** The path strike's usual skill set of `body` (`pathParts`), which `tactics` will hand their intent. */
export const combatSkills = (body: Body, tactics: Pick<Tactics, "state" | "engagement"> = {}, settings: CombatSettings = {}): Skills =>
  skillSet(body, tactics, pathParts(body, settings));

/** A path action's own trajectory and optional low-support request. */
interface PathAction {
  readonly name: string;
  readonly family: BlowFamily;
  readonly armExtension?: number;
  readonly lower?: number;
}

/** Shared path timing belongs to the named executor; its actions own their trajectory settings. */
interface PathExecutorSettings extends PathStrikeSettings {
  readonly resolve?: (view: BodyView, target: TargetRef, action: string, effector: string) => Vec3 | null;
  readonly direction?: (view: BodyView, target: TargetRef, action: string, effector: string) => Vec3 | null;
}

/** Path and driven actions retain separate returning instances and generate only their own writes. */
export function pathExecutor(body: Body, actions: readonly PathAction[], settings: PathExecutorSettings = {}): Executor {
  const { execution, driven, overlap = false } = settings;
  const paths = settings.paths ?? ATTACK_PATH;
  const tuning = driven ? { ...paths, windup: driven.windup, torso: driven.torso, contactSpeed: driven.contact } : paths;
  if (!validAttackTuning(tuning) || execution && !validCombatExecution(execution) || driven && !validDrivenStrike(driven))
    throw new Error("invalid path executor settings");
  const spec = body.built.spec, guarding = guardPosture(spec);
  const resolve = settings.resolve ?? ((_view: BodyView, target: TargetRef) => target.kind === "point" ? target.at : null);
  const foundation = execution?.planted ? supportReadiness(body.built) : null;
  const bare = { left: closesToStrike(spec, "left"), right: closesToStrike(spec, "right") };
  const aims = { left: aimOf(spec, "left"), right: aimOf(spec, "right") };
  const limits = Object.freeze({ ...tuning, ...(execution ? { impact: execution } : {}) });
  const strikeOf = (hand: Side) => effectorStrike({ effector: `hand.${hand}`, point: aims[hand], limits,
    chamberSeconds: tuning.chamberSeconds, returnSeconds: tuning.returnSeconds });
  const strikes = { left: strikeOf("left"), right: strikeOf("right") };
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`path executor has no effector ${effector}`);
  };
  const find = (name: string): PathAction => {
    const action = actions.find(action => action.name === name);
    if (!action) throw new Error(`path executor has no action ${name}`);
    return action;
  };
  const footprints = Object.fromEntries(actions.map(action => [action.name, {
    left: Object.freeze(["hand.left", ...(action.family === "cross" || action.family === "hook" || action.lower !== undefined || execution?.planted ? ["trunk"] : []),
      ...(action.lower !== undefined || execution?.planted ? ["legs"] : [])]),
    right: Object.freeze(["hand.right", ...(action.family === "cross" || action.family === "hook" || action.lower !== undefined || execution?.planted ? ["trunk"] : []),
      ...(action.lower !== undefined || execution?.planted ? ["legs"] : [])]),
  }]));
  type Motion = { request: ActionRequest; target: Vec3; direction: Vec3 | null; home: Vec3; chamber: Vec3; lower: number;
    withdrawn: boolean; ending: ActionEnding; elapsed: number; elbow: number; initialElbow: number; launch: number | null };
  const state = { lives: { left: null as Motion | null, right: null as Motion | null },
    cycles: { left: strikes.left.state, right: strikes.right.state }, cooldown: 0,
    ...(foundation ? { foundation: foundation.state } : {}) };
  const target = new Vector3(), direction = new Vector3(), inverse = new Quaternion();
  const courseOf = (view: BodyView, hand: Side, live: Motion) => {
    const action = find(live.request.action);
    intoFrameToRef(view.root, live.target, target);
    const aimed = live.direction;
    if (aimed) direction.set(...aimed).applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), direction);
    const path = attackPath(live.home, [target.x, target.y, target.z], hand, action.family, tuning,
      aimed ? [direction.x, direction.y, direction.z] : undefined);
    const course: StrikeCourse = { home: live.home, chamber: live.chamber, target: [target.x, target.y, target.z],
      contactVelocity: path.contactVelocity, seconds: live.launch ?? path.seconds, ...(path.curve ? { curve: path.curve } : {}) };
    return { path, course };
  };
  const held = (hand: Side, live: Motion): readonly Resource[] => state.cycles[hand].phase === "return" && find(live.request.action).lower === undefined
    ? [`hand.${hand}`] : footprints[live.request.action]![hand];
  return {
    state,
    needs(action, effector) { find(action); return footprints[action]![sideOf(effector)]; },
    readiness(view, action, effector, requested, around) {
      if (!actions.some(one => one.name === action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      const hand = sideOf(effector), other = hand === "left" ? "right" : "left";
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (view.time < tuning.startup || state.cooldown < tuning.hold) return { kind: "waiting", reason: "startup or cooldown" };
      if (state.lives[hand] || state.lives[other] && (!overlap || state.cycles[other].phase !== "return"))
        return { kind: "waiting", reason: "shared executor is striking" };
      const at = resolve(view, requested, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      if (!placedHeightFits(spec, hand, at[1] - view.head.y)) return { kind: "blocked", reason: "target is outside the arm's height band" };
      const reach = placedReach(spec, hand, at[1] - view.head.y), dx = view.head.x - view.stance.centre.x, dz = view.head.z - view.stance.centre.z;
      const ahead = dx * sin(around.heading) + dz * cos(around.heading), across = dx * cos(around.heading) - dz * sin(around.heading);
      // Entry allows the ordinary approach speed while the admitted chamber establishes support.
      const window = { at, along: [reach + ahead - tuning.near, reach + ahead + tuning.near] as const,
        across: [across - tuning.near, across + tuning.near] as const, facing: .4, speed: .3 };
      if (!withinActionWindow(view, window, around.heading)) return { kind: "position", window };
      return { kind: "ready" };
    },
    resume() {
      state.lives.left = null; state.lives.right = null; state.cooldown = 0;
      strikes.left.reset(); strikes.right.reset();
      if (foundation) foundation.state.quiet = 0;
    },
    start(view, request, around) {
      const hand = sideOf(request.effector), action = find(request.action), strike = strikes[hand];
      if (state.lives[hand]) throw new Error(`path executor already owns ${request.effector}`);
      const at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("path target has no aim");
      const p = view.effectors[request.effector]!.points[aims[hand]]!;
      const home: Vec3 = [p.x, p.y, p.z];
      intoFrameToRef(view.root, at, target);
      const chamber = attackPath(home, [target.x, target.y, target.z], hand, action.family, tuning).chamber;
      const direction = request.target.kind === "point" ? request.target.direction : settings.direction?.(view, request.target, request.action, request.effector);
      state.lives[hand] = { request: { ...request }, target: [...at], direction: direction ? [...direction] : null, home, chamber, lower: action.lower ?? around.lower,
        withdrawn: false, ending: { kind: "completed" }, elapsed: 0, elbow: 0, initialElbow: 0, launch: null };
      strike.state.previous = [...home]; strike.begin("chamber", [0, 0, 0]);
    },
    update(view, continued, around, dt) {
      state.cooldown += dt;
      foundation?.read(view.stance.centre, view.stance.velocity, dt);
      const updates: LifecycleUpdate[] = [];
      for (const hand of ["left", "right"] as const) {
        const strike = strikes[hand], velocity = strike.read(view, dt), live = state.lives[hand];
        if (!live) continue;
        const action = find(live.request.action), cycle = strike.state;
        const request = continued.find(one => one.id === live.request.id);
        if (!request) live.withdrawn = true;
        live.elapsed += dt;
        if (view.down) {
          updates.push({ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } });
          state.lives[hand] = null; strike.reset(); continue;
        }
        if (cycle.phase === "chamber") {
          if (!resolve(view, live.request.target, live.request.action, live.request.effector)) {
            live.withdrawn = true; live.ending = { kind: "lost", reason: "target is no longer sensed" };
          } else if (live.withdrawn) live.ending = { kind: "cancelled" };
        }
        const { course } = courseOf(view, hand, live), previous = cycle.phase;
        const prepared = (!bare[hand] || view.handPoses[hand]?.applied === "fist")
          && (!foundation || foundation.state.quiet >= STRIKE_SUPPORT.hold && view.stance.phase === "stand")
          && (!around.support || around.support.stage === "stand" || around.support.ready);
        const supported = !foundation || bearingSupport(foundation.state);
        const event = strike.step(view, velocity, course, {
          requested: cycle.phase === "swing" || cycle.phase === "return" || !live.withdrawn,
          down: false, supported, prepared, free: true, targetId: live.request.target.body,
        }, dt);
        if (event & STRIKE_EVENT.failed) live.ending = { kind: "stalled", reason: cycle.phase === null
          ? `return deadline${live.ending.kind === "completed" ? "" : ` after ${live.ending.reason ?? live.ending.kind}`}` : "preparation deadline" };
        if (event & STRIKE_EVENT.aborted) live.ending = { kind: "interrupted", reason: "stroke lost support or met blocking contact" };
        if (cycle.phase !== previous) {
          live.initialElbow = live.elbow;
          if (driven && cycle.phase === "swing") live.launch = Math.max(dt, 2 * hypot(course.target[0] - cycle.previous![0],
            course.target[1] - cycle.previous![1], course.target[2] - cycle.previous![2]) / driven.contact);
        }
        if (event & STRIKE_EVENT.finished) {
          updates.push({ id: live.request.id, ending: live.ending }); state.lives[hand] = null; state.cooldown = 0; continue;
        }
        const extension = action.armExtension ?? tuning.elbowExtension;
        live.elbow = smoothElbow(live.initialElbow, cycle.phase === "swing" ? extension : 0,
          Math.min(1, cycle.time / strike.seconds(course)));
        const phase = cycle.phase === "chamber" ? "prepare" : cycle.phase === "swing" ? "commit" : "release";
        updates.push({ id: live.request.id, phase, stage: cycle.phase ?? "return", holds: held(hand, live) });
      }
      return updates;
    },
    command(view, id) {
      const hand = state.lives.left?.request.id === id ? "left" : state.lives.right?.request.id === id ? "right" : null;
      if (!hand) throw new Error(`path executor has no instance ${id}`);
      const live = state.lives[hand]!, strike = strikes[hand], { path, course } = courseOf(view, hand, live);
      const phase = strike.state.phase, posture: Record<string, number> = Object.fromEntries(Object.entries(guarding).filter(([name]) => name.startsWith(`wrist.${hand} `))), pushes: MusclePush[] = [];
      if (live.elbow) {
        const name = `elbow.${hand} flexion`, dof = spec.joints.find(j => j.name === `elbow.${hand}`)?.dofs.find(d => d.positive === "flexion");
        if (dof) posture[name] = Math.max(dof.min.value, Math.min(dof.max.value, (1 - live.elbow) * guarding[name]!));
      }
      const turn = driven ? -path.torso : path.torso, rotation = phase === "chamber" ? -turn : phase === "swing" ? turn : 0;
      if (rotation) {
        const name = "thoracic rotation right", dof = spec.joints.find(j => j.name === "thoracic")?.dofs.find(d => d.positive === "rotation right");
        const sense = rotation > 0 ? 1 : -1, turned = sense * (view.angles[name] ?? 0) >= sense * rotation;
        if (driven && driven.drive > 0 && phase === "swing" && dof && !turned) pushes.push({ channel: name, sense, level: driven.drive });
        else posture[name] = dof ? Math.max(dof.min.value, Math.min(dof.max.value, rotation)) : 0;
      }
      const owns = held(hand, live), low = find(live.request.action).lower;
      const goal = strike.goal(course);
      return { posture, pushes, effectors: { [live.request.effector]: driven ? { ...goal, carried: true } : goal },
        ...(bare[hand] ? { handPoses: { [hand]: "fist" as const } } : {}),
        ...(owns.includes("legs") ? { legs: HOLD, lower: live.lower } : {}),
        ...(low !== undefined ? { support: live.lower } : {}) };
    },
  };
}
