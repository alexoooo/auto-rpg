import type { Body, BodyView } from "../body.ts";
import { bodyEffectors } from "../control/effectors.ts";
import type { MusclePush } from "../control/motor.ts";
import { atan2, hypot } from "../math/real.ts";
import type { Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetRef } from "./action.ts";
import { guardPosture } from "./guard.ts";
import { PUNCH_PREPARE_LIMIT, punchReadiness, quietToPunch, STRAIGHT_PUNCH, straightPunchFits, straightTechnique, validStraightPunch, type StraightPunch } from "./straight-punch.ts";
import { closesToStrike } from "./strikes.ts";

/**
 * **A combination's settings**: a straight punch's; how many drives it is, one or two; how long
 * after the first drive ends the second may begin, s; how far the centre of mass may stand across
 * the ground from the middle of the feet for a drive to begin, m; and how long past `gap` it waits
 * for that before the second is given up, s.
 */
export interface Combination extends StraightPunch {
  readonly drives: number;
  readonly gap: number;
  readonly poise: number;
  readonly wait: number;
}

/**
 * The combination as the options fighter throws it: the Counter-puncher's straight punch, the
 * second hand driven 0.3 s after the first drive ends, once the centre of mass is back over the
 * feet: sooner, or from a body still carried off its feet by the first, the second lean bends the
 * body over at the hips.
 */
export const COMBINATION: Combination = deepFreeze({ ...STRAIGHT_PUNCH, band: .4, drives: 2, gap: .3, poise: .1, wait: .4 });

/** Whether `settings` are a combination's: a straight punch's, of one drive or two, and a gap, poise and wait each finite and not negative. */
export const validCombination = (settings: Combination): boolean => validStraightPunch(settings) && (settings.drives === 1 || settings.drives === 2)
  && [settings.gap, settings.poise, settings.wait].every((v) => Number.isFinite(v) && v >= 0);

/** Where a combination is: settling, driving its first hand, between its drives, driving its second hand, or coming back. */
type Stage = "settle" | "first" | "between" | "second" | "return";

const other = (hand: Side): Side => hand === "left" ? "right" : "left";

/**
 * **A combination**: two straight punches as one action, the hand asked for first and the other
 * second (a one-two); of one drive, a lone straight punch that waits for its poise and leaves its
 * hand to the guard coming back. It settles as the straight punch does (`straightTechnique`), and
 * further until its centre of mass is within `poise` of the middle of its feet, and drives the
 * first hand; settling, and between its drives, it turns to face its target as the target moves.
 * As that drive ends the first arm comes back to the guard and, `gap` s later, once
 * the body is poised again, the second hand is driven, the hips and chest turning back the other
 * way; if it is not poised within `wait` s more, the second is given up and the first comes back
 * alone. Each drive ends as a straight punch's does: `follow` s after its hand begins to touch, or
 * `longest` s after it began; then both arms come back to the guard over `recover` s. Its
 * commitment runs from the first drive to the end of the last. It holds the hands it drives, the
 * trunk and the legs until a hand is on its way back: from the first drive's end it lets go of the
 * first, and coming back of both, to the guard, which brings each back and may cover with it, while
 * it holds the trunk and legs to the end. It is ready where the first hand's straight punch is.
 */
export function combinationExecutor(body: Body, actions: readonly string[], settings: Combination = COMBINATION,
  resolve: (view: BodyView, target: TargetRef, action: string, effector: string) => Vec3 | null = (_view, target) => target.kind === "point" ? target.at : null): Executor {
  if (!validCombination(settings)) throw new Error("invalid combination settings");
  const technique = straightTechnique(body, settings), motion = technique.state, guard = guardPosture(body.built.spec);
  technique.read(body.view);
  const holds = ["hand.left", "hand.right", "trunk", "legs"] as const;
  /** What it holds where it is: both hands, the trunk and the legs, of one drive the first hand of them; from the first drive's end, the second hand of them; coming back the trunk and legs. */
  const holding = (stage: Stage, first: Side): readonly string[] => {
    switch (stage) {
      case "settle": case "first": return settings.drives === 1 ? [`hand.${first}`, "trunk", "legs"] : holds;
      case "between": case "second": return [`hand.${other(first)}`, "trunk", "legs"];
      case "return": return ["trunk", "legs"];
      default: { const never: never = stage; throw new Error(`unknown combination stage ${JSON.stringify(never)}`); }
    }
  };
  /** Each arm's channels: what a hand it has let go of leaves to the guard. */
  const arms = deepFreeze(Object.fromEntries((["left", "right"] as const).map((side) =>
    [side, bodyEffectors(body.built).find((effector) => effector.model.segment === `hand.${side}`)?.model.channels ?? []])) as Record<Side, readonly string[]>);
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`combination has no effector ${effector}`);
  };
  const state = { motion, live: null as null | { request: ActionRequest; first: Side; phase: "prepare" | "commit" | "release"; stage: Stage;
    time: number; drive: number; quiet: number; lower: number; withdrawn: boolean; ending: ActionEnding } };
  /** The hand a drive in `stage` drives; null between and outside the drives. */
  const driving = (stage: Stage, first: Side): Side | null => {
    switch (stage) {
      case "first": return first;
      case "second": return other(first);
      case "settle": case "between": case "return": return null;
      default: { const never: never = stage; throw new Error(`unknown combination stage ${JSON.stringify(never)}`); }
    }
  };
  /** Whether the body stands quiet to drive, its centre of mass within `poise` of the middle of its feet. */
  const poised = (view: BodyView): boolean => {
    const { centre, support } = view.stance;
    return quietToPunch(view) && hypot(centre.x - support.x, centre.z - support.z) <= settings.poise;
  };
  /** Begins `hand`'s drive now. */
  const drive = (view: BodyView, hand: Side) => {
    const live = state.live!;
    live.drive = 0; motion.hand = hand; motion.phase = "swing"; motion.began = view.time; motion.touched = null;
    motion.face = atan2(motion.target[0] - view.head.x, motion.target[2] - view.head.z);
    motion.touching = (view.effectors[`hand.${hand}`]?.feedback?.impulse ?? 0) > 0;
  };
  const release = (ending: ActionEnding) => {
    const live = state.live!; live.phase = "release"; live.stage = "return"; live.time = 0; live.ending = ending; motion.phase = "return";
  };
  const fists = deepFreeze(Object.fromEntries((["left", "right"] as const).filter((hand) => closesToStrike(body.built.spec, hand)).map((hand) => [hand, "fist" as const])));
  return {
    state,
    needs(_action, effector) { return holding("settle", sideOf(effector)); },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.live) return { kind: "waiting", reason: "combination is striking or returning" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      return punchReadiness(view, technique, settings, sideOf(effector), at, around.heading);
    },
    resume() { state.live = null; technique.end(); },
    interrupt(_view, id) { if (state.live?.request.id === id) { state.live = null; technique.end(); } },
    start(view, request, around) {
      if (state.live) throw new Error("combination already owns an instance");
      const first = sideOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("combination target has no aim");
      state.live = { request: { ...request }, first, phase: "prepare", stage: "settle", time: 0, drive: 0, quiet: 0, lower: around.lower,
        withdrawn: false, ending: { kind: "completed" } };
      motion.hand = first; motion.phase = "settle"; motion.target = [...at]; motion.face = atan2(at[0] - view.head.x, at[2] - view.head.z);
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
      if (at && !live.withdrawn && live.phase !== "release") motion.target = [...at];
      if (live.phase === "prepare" || live.stage === "between") motion.face = atan2(motion.target[0] - view.head.x, motion.target[2] - view.head.z);
      live.time += dt; live.drive += dt;
      if (live.phase === "prepare") {
        live.quiet = poised(view) ? live.quiet + dt : 0;
        if (live.time >= PUNCH_PREPARE_LIMIT) release({ kind: "stalled", reason: "settling deadline" });
        else if (poised(view) && live.quiet >= settings.settle) { live.phase = "commit"; live.stage = "first"; live.time = 0; drive(view, live.first); }
      } else if (live.phase === "commit") {
        const hand = driving(live.stage, live.first);
        if (hand === null) {
          live.quiet = poised(view) ? live.quiet + dt : 0;
          if (live.drive >= settings.gap && live.quiet >= settings.settle && poised(view)) { live.stage = "second"; drive(view, other(live.first)); }
          else if (live.drive >= settings.gap + settings.wait) release({ kind: "completed" });
        } else {
          const touching = (view.effectors[`hand.${hand}`]?.feedback?.impulse ?? 0) > 0;
          if (touching && !motion.touching && motion.touched === null) motion.touched = view.time;
          motion.touching = touching;
          if (motion.touched !== null && view.time - motion.touched >= settings.follow || live.drive >= settings.longest) {
            if (live.stage === "first" && settings.drives === 1) release({ kind: "completed" });
            else if (live.stage === "first") { live.stage = "between"; live.drive = 0; live.quiet = 0; motion.phase = "return"; }
            else release({ kind: "completed" });
          }
        }
      } else if (live.time >= settings.recover) {
        const ending = live.ending; state.live = null; technique.end(); return [{ id: live.request.id, ending }];
      }
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: holding(live.stage, live.first) }];
      return updates;
    },
    command(view, id) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`combination has no instance ${id}`);
      const pushes: MusclePush[] = [], hand = live.phase === "commit" ? driving(live.stage, live.first) : null;
      const posture = hand !== null ? technique.drive(view, hand, live.drive, pushes)
        : live.phase === "prepare" ? technique.chamber(view, live.first) ?? guard
          : live.stage === "between" ? technique.chamber(view, other(live.first)) ?? guard : guard;
      const held = holding(live.stage, live.first), free = (["left", "right"] as const).filter((side) => !held.includes(`hand.${side}`));
      if (free.length) {
        const own: Record<string, number> = { ...posture }, poses: Partial<Record<Side, "fist">> = { ...fists };
        for (const side of free) { for (const channel of arms[side]) delete own[channel]; delete poses[side]; }
        return { posture: own, pushes, handPoses: poses, legs: { kind: "walk", walk: null, face: motion.face }, lower: live.lower, steer: 0 };
      }
      return { posture, pushes, handPoses: fists, legs: { kind: "walk", walk: null, face: motion.face }, lower: live.lower,
        steer: hand !== null ? technique.sense[hand] * settings.hips : 0 };
    },
  };
}

/** Whether a body of `spec` can throw a combination: as a straight punch. */
export const combinationFits = straightPunchFits;
