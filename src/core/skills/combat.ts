import { kickSkill, type KickTuning } from "./kick.ts";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { EffectorGoal, Pose } from "../control/motor.ts";
import { validArmExtension, type BlowAttack, type BlowPath, type KickAttack } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { attackPath, ATTACK_PATH, validAttackTuning, type AttackTuning } from "./attack-path.ts";
import { guardPosture, guardSkill } from "./guard.ts";
import { supportFold } from "./support-fold.ts";
import { locomotion, STANCE_LOWER, type TurnStartup } from "./locomotion.ts";
import type { SkillReport, Skills } from "./skills.ts";
import { placedReach, type StrikeReport } from "./strike.ts";
import { aimOf, closesToStrike } from "./strikes.ts";
import { supportReadiness, bearingSupport, STRIKE_SUPPORT } from "../control/support-readiness.ts";
import { STRIKE_EVENT } from "./strike-cycle.ts";
import { effectorStrike, type StrikeCourse, type StrikeState } from "./effector-strike.ts";
import type { Side } from "../spec/body.ts";

/** Experimental execution limits, independent of anatomy: `docs/reference/punch-foundation.md#execution-limits`. */
export const PUNCH_EXECUTION = Object.freeze({ impactSeconds: .04, impactTravel: .04, normalAlignment: .5 });
export const PLANTED_PUNCH_EXECUTION = Object.freeze({ ...PUNCH_EXECUTION, planted: true });
export interface CombatExecution { readonly planted?: boolean; readonly impactSeconds: number; readonly impactTravel: number; readonly normalAlignment: number }
export function validCombatExecution(execution: CombatExecution): boolean {
  return (execution.planted === undefined || typeof execution.planted === "boolean") && [execution.impactSeconds, execution.impactTravel, execution.normalAlignment]
    .every(v => Number.isFinite(v) && v >= 0) && execution.normalAlignment <= 1;
}

/** **What a path skill stack is made of**; a setting left out is its default. */
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
}

/** The elbow's opening `u` of the way from `from` to `to`, eased in and out. */
const smoothElbow = (from: number, to: number, u: number) => from + (to - from) * u * u * (3 - 2 * u);

/** Shared strike executor: measured hand trajectories and supported locomotion with independent tactics. */
export function combatSkills(body: Body, { state: tactics, engagement }: Pick<Tactics, "state" | "engagement"> = {},
  { paths: tuning = ATTACK_PATH, kick: kicks, execution, turnLimit, turnStartup, ground = false, overlap = false }: CombatSettings = {}): Skills {
  if (execution && !validCombatExecution(execution)) throw new Error("invalid combat execution settings");
  if (!validAttackTuning(tuning)) throw new Error("combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]");
  const spec = body.built.spec, legs = locomotion(body.envelope, turnLimit, turnStartup), guard = guardSkill(spec), guarding = guardPosture(body.built);
  const elbowRange = (hand: Side) => spec.joints.find(j => j.name === `elbow.${hand}`)?.dofs.find(d => d.positive === "flexion");
  const elbows = { left: elbowRange("left"), right: elbowRange("right") };
  const fold = ground ? supportFold(body) : null;
  const foundation = execution?.planted ? supportReadiness(body.built) : null;
  const kicking = kicks ? kickSkill(body, kicks) : null;
  const all = [legs, guard, ...(fold ? [fold] : []), ...(kicking ? [kicking] : [])];
  // A bare hand closes for its strike cycle and strikes with its fist (`closesToStrike`).
  const bare = { left: closesToStrike(spec, "left"), right: closesToStrike(spec, "right") };
  const aims = { left: aimOf(spec, "left"), right: aimOf(spec, "right") };
  const limits = Object.freeze({ ...tuning, ...(execution ? { impact: execution } : {}) });
  const strikeOf = (hand: Side) => effectorStrike({ effector: `hand.${hand}`, point: aims[hand], limits,
    chamberSeconds: tuning.chamberSeconds, returnSeconds: tuning.returnSeconds });
  const strikes = { left: strikeOf("left"), right: strikeOf("right") };
  const blowOf = (hand: Side): HandBlow => ({ cycle: strikes[hand].state, action: null, home: null, chamber: null, elbow: 0, initialElbow: 0 });
  const state = { command: { posture: guarding, pushes: [], stance: null } as BodyCommand,
    legs: legs.state, ...(kicking ? { kick: kicking.state } : {}), ...(foundation ? { foundation: foundation.state } : {}), ...(fold ? { support: fold.state } : {}),
    lower: STANCE_LOWER, tactics: tactics ?? null, hand: null as Side | null, hands: { left: blowOf("left"), right: blowOf("right") },
    cooldown: 0, interrupted: 0, canOverlap: false };
  const rest = (blow: HandBlow) => { blow.action = null; blow.home = null; blow.chamber = null; blow.elbow = 0; blow.initialElbow = 0; };
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
  const skillReport: SkillReport = { strike: report, get heading() { return legs.heading; }, get pace() { return legs.pace; },
    get reference() { return legs.reference; }, ...(fold ? { support: fold.report } : {}), ...(kicking ? { kick: kicking.report } : {}), ...(engagement ? { engagement } : {}) };
  const resume = (view: BodyView) => {
    if (state.hands.left.cycle.phase !== null) state.interrupted++;
    if (state.hands.right.cycle.phase !== null) state.interrupted++;
    state.canOverlap = false;
    if (foundation) foundation.state.quiet = 0;
    body.built.handPoses.request((["left", "right"] as const).filter(h => bare[h]).map(hand => ({ hand, pose: "open" as const })));
    state.hand = null; state.cooldown = 0;
    for (const hand of ["left", "right"] as const) { strikes[hand].reset(); rest(state.hands[hand]); }
    for (const skill of all) skill.resume(view);
  };
  return { state, report: skillReport, resume, release: resume, command(view, intent, dt) {
    const velocities = { left: strikes.left.read(view, dt), right: strikes.right.read(view, dt) };
    foundation?.read(view.stance.centre, view.stance.velocity, dt);
    state.cooldown += dt;
    let blow: PathBlow | null = null, kick: KickAttack | null = null;
    const attack = intent.attack;
    if (attack) switch (attack.kind) {
      case "blow":
        if (!attack.path) throw new Error("the path skill throws a blow along the path it names");
        blow = { ...attack, path: attack.path }; break;
      case "kick":
        if (!kicking) throw new Error("these skills carry out no kick");
        kick = attack; break;
      default: { const never: never = attack; throw new Error(`unknown attack ${JSON.stringify(never)}`); }
    }
    const requested = kicking && (kick || kicking.report.foot) ? null : blow;
    if (requested && !validArmExtension(requested.path.armExtension)) throw new Error("combat armExtension must be finite and in [0,1]");
    fold?.tick(view, busy() ? state.lower : intent.lower ?? STANCE_LOWER, !!intent.move, dt);
    const mayOverlap = () => {
      const h = state.hand;
      if (!overlap || !h) return false;
      const { home, cycle } = state.hands[h];
      if (!home || cycle.phase !== "return" || state.hands[other(h)].cycle.phase !== null || view.down
        || (fold && fold.report.stage !== "stand") || state.lower !== STANCE_LOWER
        || (intent.lower ?? STANCE_LOWER) !== STANCE_LOWER || (view.effectors[`hand.${h}`]!.feedback?.impulse ?? 0) > 0) return false;
      const at = cycle.previous!, velocity = velocities[h];
      return velocity[0] * (home[0] - at[0]) + velocity[1] * (home[1] - at[1]) + velocity[2] * (home[2] - at[2]) > 0;
    };
    if (requested && requested.hand !== state.hand && mayOverlap()) state.hand = null;
    if (!state.hand && requested && state.hands[requested.hand].cycle.phase === null && view.time >= tuning.startup && state.cooldown >= tuning.hold && (!foundation || (foundation.state.quiet >= STRIKE_SUPPORT.hold && view.stance.phase === "stand" && !view.down)) && (!fold || fold.report.stage === "stand" || fold.report.ready)) {
      const hand = requested.hand, starting = state.hands[hand];
      starting.action = { ...requested, target: [...requested.target], path: { ...requested.path, ...(requested.path.direction ? { direction: [...requested.path.direction] as Vec3 } : {}) } };
      state.hand = hand; state.lower = intent.lower ?? STANCE_LOWER;
      starting.home = [...starting.cycle.previous!];
      intoFrameToRef(view.root, requested.target, target);
      starting.chamber = attackPath(starting.home, [target.x, target.y, target.z], hand, requested.path.family, tuning).chamber;
      starting.initialElbow = starting.elbow; strikes[hand].begin("chamber", velocities[hand]);
    }
    let posture: Pose = guarding;
    const goals: Record<Side, EffectorGoal | null> = { left: null, right: null };
    const advance = (hand: Side) => {
      const striking = state.hands[hand], strike = strikes[hand], action = striking.action!, home = striking.home!, chamber = striking.chamber!;
      intoFrameToRef(view.root, action.target, target);
      const contactDirection = action.path.direction ? direction.set(...action.path.direction)
        .applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), direction) : null;
      const path = attackPath(home, [target.x, target.y, target.z], hand, action.path.family, tuning,
        contactDirection ? [contactDirection.x, contactDirection.y, contactDirection.z] : undefined);
      const course: StrikeCourse = { home, chamber, target: [target.x, target.y, target.z], contactVelocity: path.contactVelocity,
        seconds: path.seconds, ...(path.curve ? { curve: path.curve } : {}) };
      const previousPhase = striking.cycle.phase;
      const event = strike.step(view, velocities[hand], course, { requested: !!requested, down: view.down,
        supported: !foundation || bearingSupport(foundation.state), prepared: !bare[hand] || view.handPoses[hand]?.applied === "fist",
        free: true, targetId: action.targetId }, dt);
      if (striking.cycle.phase !== previousPhase) striking.initialElbow = striking.elbow;
      if (event & STRIKE_EVENT.finished) {
        if (hand === state.hand) { state.hand = null; state.cooldown = 0; }
        rest(striking);
      }
      const phase = striking.cycle.phase;
      if (!phase) return;
      goals[hand] = strike.goal(course);
      const extension = action.path.armExtension ?? tuning.elbowExtension;
      if (extension || striking.elbow) {
        striking.elbow = smoothElbow(striking.initialElbow, phase === "swing" ? extension : 0, Math.min(1, striking.cycle.time / strike.seconds(course)));
        const dof = elbows[hand], name = `elbow.${hand} flexion`, preferred = (1 - striking.elbow) * guarding[name]!;
        if (dof) posture = { ...posture, [name]: Math.max(dof.min.value, Math.min(dof.max.value, preferred)) };
      }
      const rotation = phase === "chamber" ? -path.torso : phase === "swing" ? path.torso : 0;
      if (rotation) {
        const dof = spec.joints.find(j => j.name === "thoracic")?.dofs.find(d => d.positive === "rotation right");
        posture = { ...posture, "thoracic rotation right": dof ? Math.max(dof.min.value, Math.min(dof.max.value, rotation)) : 0 };
      }
    };
    const main = state.hand, back = returning();
    if (main) advance(main);
    if (back) advance(back);
    state.canOverlap = mayOverlap();
    const covers = guard.command(view, intent.guard, state.hand);
    const swinging = state.hand !== null && state.hands[state.hand].cycle.phase === "swing";
    const baseStance = legs.goal(view, ((kicking && (kick || kicking.report.foot)) || (execution?.planted && state.hand !== null) || swinging || (fold && fold.report.stage !== "stand" && fold.report.stage !== "wait")) ? null : intent.move, intent.face, dt, fold ? STANCE_LOWER : intent.lower);
    const supported = fold?.apply(baseStance, posture) ?? { stance: baseStance, posture };
    const fist = (hand: Side) => (state.hands[hand].cycle.phase !== null ? "fist" : "open") as "fist" | "open";
    state.command = { posture: supported.posture, pushes: [], effectors: { "hand.left": goals.left ?? covers.left, "hand.right": goals.right ?? covers.right }, stance: supported.stance,
      ...(bare.left || bare.right ? { handPoses: { ...(bare.left ? { left: fist("left") } : {}), ...(bare.right ? { right: fist("right") } : {}) } } : {}) };
    const motion = kicking?.command(view, kick, supported.stance, !busy() && !view.down && (!fold || fold.report.stage === "stand"), dt);
    if (motion) state.command = { ...state.command, ...motion, effectors: { ...state.command.effectors, ...motion.effectors } };
    return state.command;
  } };
}
