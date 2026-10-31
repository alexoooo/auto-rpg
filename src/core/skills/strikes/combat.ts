import { standingFooting } from "../../control/support.ts";
import { kickExecutor, type KickTuning } from "./kick.ts";
import { stanceFeetOf } from "../framework/skill.ts";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../../body.ts";
import { intoFrameToRef } from "../../control/kinematics.ts";
import { cos, sin } from "../../math/real.ts";
import type { MusclePush } from "../../control/motor.ts";
import type { Pose } from "../../spec/pose.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { skillSet, type SkillParts } from "../framework/arbiter.ts";
import { attackPath, ATTACK_PATH, validAttackTuning, type AttackTuning, type BlowFamily } from "./attack-path.ts";
import { guardSkill } from "../guard/guard.ts";
import { supportFold, supportHeadDrop } from "../locomotion/support-fold.ts";
import { locomotion, STANCE_LOWER, type TurnStartup } from "../locomotion/locomotion.ts";
import type { Skills } from "../framework/skills.ts";
import { placedHeightFits, placedReach } from "./arm-reach.ts";
import { aimOf, closesToStrike } from "./held-strike.ts";
import { supportReadiness, bearingSupport, STRIKE_SUPPORT } from "../../control/support-readiness.ts";
import { STRIKE_EVENT } from "./strike-cycle.ts";
import { effectorStrike, type StrikeCourse } from "./effector-strike.ts";
import type { Side } from "../../spec/body.ts";
import { pointTarget, type ActionEnding, type ActionRequest, type Executor, type LifecycleUpdate, type Resource, type TargetResolver } from "../framework/action.ts";
import { withinActionWindow } from "../../intent/action-window.ts";
import { otherSide } from "../../spec/body.ts";

/** Experimental execution limits, independent of anatomy: `docs/reference/punch-foundation.md#execution-limits`. */
export const PUNCH_EXECUTION = Object.freeze({ impactSeconds: .04, impactTravel: .04, normalAlignment: .5 });
export const PLANTED_PUNCH_EXECUTION = Object.freeze({ ...PUNCH_EXECUTION, planted: true });
export interface CombatExecution { readonly planted?: boolean; readonly impactSeconds: number; readonly impactTravel: number; readonly normalAlignment: number }
export function validCombatExecution(execution: CombatExecution): boolean {
  return (execution.planted === undefined || typeof execution.planted === "boolean") && [execution.impactSeconds, execution.impactTravel, execution.normalAlignment]
    .every(v => Number.isFinite(v) && v >= 0) && execution.normalAlignment <= 1;
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

/** The elbow's opening `u` of the way from `from` to `to`, eased in and out. */
const smoothElbow = (from: number, to: number, u: number) => from + (to - from) * u * u * (3 - 2 * u);

/** What a path strike's blows are carried out with; a setting left out is its default. */
type PathStrikeSettings = Pick<CombatSettings, "paths" | "execution" | "overlap">;

/** The path strike's usual skills of `body`: the walk, the guard, the path strike, and the kick and the support fold it has. */
export function pathParts(body: Body, { paths, kick, execution, turnLimit, turnStartup, ground = false, overlap = false }: CombatSettings = {}): SkillParts {
  const actions: PathAction[] = (["straight", "cross", "hook", "downward", "overhand", "uppercut"] as const).map(family => ({ name: family, family }));
  const guard = guardSkill(body.built.spec);
  return {
    legs: locomotion(stanceFeetOf(body.built.spec), body.envelope, { turnLimit, turnStartup, idleFooting: standingFooting(body.built) }), navigation: null, guard,
    executors: [{ name: "paths", kind: "path-strike", executor: pathExecutor(body, guard.posture, actions, { paths, execution, overlap, resolve: pointTarget }) },
      ...(kick ? [{ name: "kicks", kind: "front-kick", executor: kickExecutor(body, ["kick"], kick, pointTarget) }] : [])],
    actions: [...actions.map(action => ({ name: action.name, executor: "paths", effectors: ["hand.left", "hand.right"] })),
      ...(kick ? [{ name: "kick", executor: "kicks", effectors: ["foot.left", "foot.right"] }] : [])],
    support: ground ? supportFold(body) : null,
  };
}

/** The path strike's usual skill set of `body` (`pathParts`), which a decider hands its intent. */
export const combatSkills = (body: Body, settings: CombatSettings = {}): Skills =>
  skillSet(body, pathParts(body, settings));

/** A path action's own trajectory and optional low-support request. */
interface PathAction {
  readonly name: string;
  readonly family: BlowFamily;
  readonly armExtension?: number;
  readonly lower?: number;
}

/** Shared path timing belongs to the named executor; its actions own their trajectory settings. */
interface PathExecutorSettings extends PathStrikeSettings {
  readonly resolve: TargetResolver;
  readonly direction?: TargetResolver;
}

/** Path actions retain separate returning instances and generate only their own writes. */
export function pathExecutor(body: Body, guard: Pose, actions: readonly PathAction[], settings: PathExecutorSettings): Executor {
  const { execution, overlap = false } = settings;
  const paths = settings.paths ?? ATTACK_PATH;
  const tuning = paths;
  if (!validAttackTuning(tuning) || execution && !validCombatExecution(execution))
    throw new Error("invalid path executor settings");
  const spec = body.built.spec, guarding = guard;
  const resolve = settings.resolve;
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
    withdrawn: boolean; ending: ActionEnding; elapsed: number; supportPhase: "lower" | "ready" | "rise"; supportTime: number; elbow: number; initialElbow: number };
  const state = { lives: { left: null as Motion | null, right: null as Motion | null },
    cycles: { left: strikes.left.state, right: strikes.right.state },
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
      contactVelocity: path.contactVelocity, seconds: path.seconds, ...(path.curve ? { curve: path.curve } : {}) };
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
      const hand = sideOf(effector), other = otherSide(hand);
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.lives[hand] || state.lives[other] && (!overlap || state.cycles[other].phase !== "return"))
        return { kind: "waiting", reason: "shared executor is striking" };
      const at = resolve(view, requested, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      const low = find(action).lower;
      if (low !== undefined && !around.support) return { kind: "blocked", reason: "low action needs a support service" };
      // Admission predicts lowering before the executor owns and prepares that support.
      const predictedHead = view.head.y - (low === undefined ? 0 : supportHeadDrop(view, low));
      if (!placedHeightFits(spec, hand, at[1] - predictedHead)) return { kind: "blocked", reason: "target is outside the arm's height band" };
      const reach = placedReach(spec, hand, at[1] - predictedHead), dx = view.head.x - view.stance.centre.x, dz = view.head.z - view.stance.centre.z;
      const ahead = dx * sin(around.heading) + dz * cos(around.heading), across = dx * cos(around.heading) - dz * sin(around.heading);
      // Downward paths enter beside the low target; level paths enter at their extended reach.
      const window = low === undefined ? { at, along: [reach + ahead - .15, reach + ahead + .15] as const,
        across: [across - .2, across + .2] as const, facing: .4, speed: .3 }
        : { at, along: [-.15, .75] as const, across: hand === "right" ? [.05, .55] as const : [-.55, -.05] as const, facing: 2, speed: .18 };
      if (!withinActionWindow(view, window, around.heading)) return { kind: "position", window };
      return { kind: "ready", window };
    },
    interrupt(_view, id) {
      for (const hand of ["left", "right"] as const) if (state.lives[hand]?.request.id === id) { state.lives[hand] = null; strikes[hand].reset(); }
    },
    resume() {
      state.lives.left = null; state.lives.right = null;
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
        withdrawn: false, ending: { kind: "completed" }, elapsed: 0, supportPhase: action.lower === undefined ? "ready" : "lower", supportTime: 0, elbow: 0, initialElbow: 0 };
      strike.state.previous = [...home]; strike.begin("chamber", [0, 0, 0]);
    },
    update(view, continued, around, dt) {
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
        if (live.supportPhase === "lower" || live.supportPhase === "rise") {
          live.supportTime += dt;
          if (live.supportPhase === "lower" && live.withdrawn) { live.supportPhase = "rise"; live.supportTime = 0; }
          // A support fold has its own finite acquisition and return, outside the hand's chamber clock.
          if (live.supportTime >= 6) {
            live.ending = { kind: "stalled", reason: `${live.supportPhase} support deadline` };
            if (live.supportPhase === "lower") { live.supportPhase = "rise"; live.supportTime = 0; }
            else {
              updates.push({ id: live.request.id, ending: live.ending });
              state.lives[hand] = null; strike.reset(); continue;
            }
          }
          if (live.supportPhase === "rise") {
            if (around.support?.stage === "stand") {
              updates.push({ id: live.request.id, ending: live.ending }); state.lives[hand] = null; strike.reset(); continue;
            }
            updates.push({ id: live.request.id, phase: "release", stage: "rise", holds: held(hand, live) }); continue;
          }
          if (!around.support?.ready) {
            updates.push({ id: live.request.id, phase: "prepare", stage: "lower", holds: held(hand, live) }); continue;
          }
          live.supportPhase = "ready";
          const point = view.effectors[live.request.effector]!.points[aims[hand]]!;
          live.home = [point.x, point.y, point.z];
          intoFrameToRef(view.root, live.target, target);
          live.chamber = attackPath(live.home, [target.x, target.y, target.z], hand, action.family, tuning).chamber;
          strike.begin("chamber", velocity);
        }
        const { course } = courseOf(view, hand, live), previous = cycle.phase;
        const prepared = (!bare[hand] || view.handPoses[`hand.${hand}`]?.applied === "fist")
          && (!foundation || foundation.state.quiet >= STRIKE_SUPPORT.hold && view.stance.phase === "stand")
          && (action.lower !== undefined ? around.support?.ready === true : !around.support || around.support.stage === "stand" || around.support.ready);
        const supported = !foundation || bearingSupport(foundation.state);
        const event = strike.step(view, velocity, course, {
          requested: cycle.phase === "swing" || cycle.phase === "return" || !live.withdrawn,
          down: false, supported, prepared, free: true, targetId: live.request.target.body,
        }, dt);
        if (event & STRIKE_EVENT.failed) live.ending = { kind: "stalled", reason: cycle.phase === null
          ? `return deadline${live.ending.kind === "completed" ? "" : ` after ${live.ending.reason ?? live.ending.kind}`}` : "preparation deadline" };
        if (event & STRIKE_EVENT.aborted) live.ending = { kind: "interrupted", reason: "stroke lost support or met blocking contact" };
        if (cycle.phase !== previous) live.initialElbow = live.elbow;
        if (event & STRIKE_EVENT.finished) {
          if (action.lower !== undefined) {
            live.supportPhase = "rise"; live.supportTime = 0;
            updates.push({ id: live.request.id, phase: "release", stage: "rise", holds: held(hand, live) }); continue;
          }
          updates.push({ id: live.request.id, ending: live.ending }); state.lives[hand] = null; continue;
        }
        const extension = action.armExtension ?? tuning.elbowExtension;
        live.elbow = smoothElbow(live.initialElbow, cycle.phase === "swing" ? extension : 0,
          Math.min(1, cycle.time / strike.seconds(course)));
        const phase = cycle.phase === "chamber" ? "prepare" : cycle.phase === "swing" ? "commit" : "release";
        updates.push({ id: live.request.id, phase, stage: cycle.phase ?? "return", holds: held(hand, live) });
      }
      return updates;
    },
    command(view, id, around) {
      const hand = state.lives.left?.request.id === id ? "left" : state.lives.right?.request.id === id ? "right" : null;
      if (!hand) throw new Error(`path executor has no instance ${id}`);
      const live = state.lives[hand]!, strike = strikes[hand], { path, course } = courseOf(view, hand, live);
      if (live.supportPhase !== "ready") {
        const posture = Object.fromEntries(Object.entries(guarding).filter(([name]) => name.startsWith(`shoulder.${hand} `) || name.startsWith(`elbow.${hand} `) || name.startsWith(`wrist.${hand} `)));
        const lower = live.supportPhase === "rise" ? STANCE_LOWER : live.lower;
        return { posture: { ...posture, ...around.support?.posture }, legs: { walk: null, height: view.standing - lower },
          ...(bare[hand] ? { handPoses: { [`hand.${hand}`]: "fist" as const } } : {}) };
      }
      const phase = strike.state.phase, posture: Record<string, number> = Object.fromEntries(Object.entries(guarding).filter(([name]) => name.startsWith(`wrist.${hand} `))), pushes: MusclePush[] = [];
      if (live.elbow) {
        const name = `elbow.${hand} flexion`, dof = spec.joints.find(j => j.name === `elbow.${hand}`)?.dofs.find(d => d.positive === "flexion");
        if (dof) posture[name] = Math.max(dof.min.value, Math.min(dof.max.value, (1 - live.elbow) * guarding[name]!));
      }
      const turn = path.torso, rotation = phase === "chamber" ? -turn : phase === "swing" ? turn : 0;
      if (rotation) {
        const name = "thoracic rotation right", dof = spec.joints.find(j => j.name === "thoracic")?.dofs.find(d => d.positive === "rotation right");
        posture[name] = dof ? Math.max(dof.min.value, Math.min(dof.max.value, rotation)) : 0;
      }
      const owns = held(hand, live), low = find(live.request.action).lower;
      const goal = strike.goal(course);
      // A low blow is thrown with the trunk as the fold asks it.
      return { posture: low === undefined ? posture : { ...posture, ...around.support?.posture }, pushes, effectors: { [live.request.effector]: goal },
        ...(bare[hand] ? { handPoses: { [`hand.${hand}`]: "fist" as const } } : {}),
        ...(owns.includes("legs") ? { legs: { walk: null, height: view.standing - live.lower } } : {}) };
    },
  };
}
