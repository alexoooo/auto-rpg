import type { MotorAndGuard } from "../../../framework/motor-and-guard.ts";
import { SUPPORT_REFERENCE } from "../../../../control/support-reference.ts";
import { MOTOR_STANCE } from "../../../../control/motor-part.ts";
import type { BodyView } from "../../../../control/body.ts";
import type { Clock } from "../../../../core/world/clock.ts";
import { carrying } from "../../../../control/motor.ts";
import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import type { OwnBody } from "../../../../core/bodies/own-body.ts";
import { stagedRise } from "./staged.ts";
import { SIT_BACK, derivedRecipe, stageFaults, type Recipe } from "./stages.ts";
import { standReady, type GroundReading, type Position } from "../../../../control/ground-reading.ts";
import { recordFault } from "../../../framework/records.ts";
import { LIMIT, LOW, SIT_BACK_BODIES, STEP_UP_BODIES, stepUpRecipe, stepUpTuning, validStepUp, type StepUpRise, type StepUpTuning } from "./records.ts";
import { stanceSteady } from "./steady.ts";
import { REACHED_SECONDS, type TechniqueEnd, type TechniquePart, type TechniqueRun } from "../../technique.ts";
import { technique } from "../../bilateral.ts";
import { type Side, otherSide } from "../../../../core/bodies/bilateral.ts";

/**
 * **Where step up's route is cut**: in route order, the stage of its rise (`RISE`) at whose end
 * each posture is read.
 */
const CUTS: readonly { readonly after: string; readonly at: Position }[] = Object.freeze([
  { after: "fours", at: "fours" }]);

/**
 * **How fast a body a part of the route takes or hands on may move**: its centre of mass under
 * `speed`, m/s, its pelvis turning under `spin`, rad/s.
 */
const HAND_OVER = Object.freeze({ speed: 1, spin: 2 });

/** Whether the body moves slowly enough for a part of the route to take it or hand it on (`HAND_OVER`). */
const handsOver = (g: GroundReading): boolean =>
  g.velocity.lengthSquared() < HAND_OVER.speed * HAND_OVER.speed && g.spin < HAND_OVER.spin;

/**
 * **A part of a staged route**: the recipe it plays (absent, step up's, `stepUpRecipe`), where in its rise
 * it begins (none: the roll alone), the positions it is begun from, the one it takes the body to,
 * and how slow a body it is begun on is: `moving`, under `HAND_OVER`; `still`, under the speed its
 * body's step up lies still at before it reads its lie (`StepUpTuning`'s `settle`).
 */
interface Part {
  readonly recipe?: Recipe;
  readonly first: string | null;
  readonly from: readonly Position[];
  readonly to: Position;
  readonly entry: "moving" | "still";
}

/** The route's parts, by technique. */
const PARTS = Object.freeze({
  "staged-roll": { first: null, from: ["back", "left", "right"], to: "front", entry: "still" },
  "staged-down": { first: "fold", from: ["front"], to: "fours", entry: "still" },
  "sit-back": { recipe: SIT_BACK, first: "plant", from: ["fours"], to: "standing", entry: "moving" },
  "front-sit-back": { recipe: SIT_BACK, first: "fold", from: ["front"], to: "standing", entry: "still" },
} as const satisfies Record<string, Part>);
type StagedKind = keyof typeof PARTS;

/** Whether a body of step up's `tuning` moves slowly enough for part `kind` to be begun on it (`Part.entry`). */
const slowFor = (kind: StagedKind, tuning: StepUpTuning, g: GroundReading): boolean => {
  const entry = PARTS[kind].entry;
  switch (entry) {
    case "moving": return handsOver(g);
    case "still": { const speed = tuning.settle.speed; return g.velocity.lengthSquared() < speed * speed && g.spin < HAND_OVER.spin; }
    default: { const never: never = entry; throw new Error(`no entry ${String(never)}`); }
  }
};

/** The part begun from position `at`. */
const partFrom = (at: Position): StagedKind | undefined =>
  (Object.keys(PARTS) as StagedKind[]).find(kind => (PARTS[kind].from as readonly Position[]).includes(at));

/**
 * **A part's entry**: begun on the left, a body of step up's `tuning` read in a position it is begun from, as it
 * reads this step (`GroundReading.raw`) or as it last settled (`GroundReading.position`, where the
 * part before it is read to have handed it over, `reads`), and slow enough for it (`Part.entry`),
 * still or not.
 */
const stagedEntry = (kind: StagedKind, tuning: StepUpTuning, g: GroundReading, side: Side): boolean => {
  const from: readonly Position[] = PARTS[kind].from;
  return side === "left" && g.raw !== "standing" && (from.includes(g.raw) || from.includes(g.position)) && slowFor(kind, tuning, g);
};

/**
 * **A part of step up's route as a technique**, its stages timed by its body's step-up record (`stepUpTuning`), begun on
 * the body as it is, moving or not (`stagedEntry`): the roll (`rollPart`) or a part of the rise
 * (`risePart`). A rise that falls back to lying slack, or onto its back, fails; one longer than
 * step up's whole attempt (`LIMIT`) times out.
 */
function routePart(own: OwnBody, view: BodyView, fitted: MotorAndGuard, kind: StagedKind, tuning: StepUpTuning): TechniqueRun<Side> {
  return PARTS[kind].first === null ? rollPart(own, view, kind, tuning) : risePart(own, view, fitted, kind, tuning);
}

/** The exact roll or rise slices this route constructs, shared with its body admission. */
function routeRecipes(kind: StagedKind, tuning: StepUpTuning): readonly Recipe[] {
  const part: Part = PARTS[kind], whole = stepUpRecipe(tuning, part.recipe);
  if (part.first === null) {
    const across = otherSide(tuning.over ?? "right");
    return [derivedRecipe(whole, "roll", () => ({ ...whole, rise: [] })),
      derivedRecipe(tuning, `roll over ${across}`, () => ({ ...stepUpRecipe({ ...tuning, over: across }), rise: [] }))];
  }
  const first = whole.rise.findIndex(stage => stage.name === part.first);
  if (first < 0) throw new Error(`the rise has no ${JSON.stringify(part.first)} stage`);
  return [derivedRecipe(whole, `unrolled from ${first}`, () => ({ ...whole, roll: { back: [], left: [], right: [] }, rise: whole.rise.slice(first) }))];
}

/** Whether a body of step up's `tuning` is read in position `to`, slow enough for the part begun there (`slowFor`), else to hand over (`handsOver`). */
const readsAt = (tuning: StepUpTuning, g: GroundReading, to: Position): boolean => {
  const next = partFrom(to);
  return g.position === to && (next ? slowFor(next, tuning, g) : handsOver(g));
};

/**
 * **The roll**: the roll of the lie it reads at once, the attempt after one that failed over the
 * other side; lies slack after it and reads again, rolling again where it is not on its front; and
 * is done once its rolled body has been read on its front, slow enough to hand over, for
 * `REACHED_SECONDS`. It yields only while it lies slack before it has turned the body: a roll's
 * settling and rolling again are its own until it reads on its front.
 */
function rollPart(own: OwnBody, view: BodyView, kind: StagedKind, tuning: StepUpTuning): TechniqueRun<Side> {
  const recipes = routeRecipes(kind, tuning);
  // `other`: the roll over the other side.
  const rises: Record<"whole" | "other", StepUpRise> = {
    whole: stagedRise(own, view, recipes[0]!),
    other: stagedRise(own, view, recipes[1]!),
  };
  // `flip`: this attempt rolls over the other side, the last having failed. `rolled`: the roll has begun turning the body.
  const state = { entry: "whole" as "whole" | "other", flip: false, rolled: false, ended: null as TechniqueEnd | null, elapsed: 0, reached: 0,
    rises: { whole: rises.whole.state, other: rises.other.state } };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  return {
    state, get phase() { return rises[state.entry].state.phase; },
    get yields() { return state.ended !== null || rises[state.entry].state.phase === "settle" && !state.rolled; },
    admits: (g, side) => stagedEntry(kind, tuning, g, side),
    reached: (g, to) => to === "standing" ? standReady({ down: view.down, ground: g }) : readsAt(tuning, g, to),
    begin() {
      state.flip = state.ended === "failed" || state.ended === "timed-out" ? !state.flip : false;
      state.entry = state.flip ? "other" : "whole"; state.rolled = false; state.ended = null; state.elapsed = 0; state.reached = 0;
      rises[state.entry].beginRolling();
    },
    end() { if (state.ended === null) { rises[state.entry].end(); finish("interrupted"); } },
    step(g, senses, control, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      const rise = rises[state.entry];
      if (state.elapsed > LIMIT) { rise.end(); return finish("timed-out"); }
      // Already on its front at entry, or rolled there: slow enough to hand over.
      rise.step(senses, control, dt);
      const now: string = rise.state.phase;
      if (now === "roll") state.rolled = true;
      state.reached = now !== "roll" && readsAt(tuning, g, "front") ? state.reached + dt : 0;
      if (state.reached + 1e-9 < REACHED_SECONDS) return null;
      rise.end();
      return finish("done");
    },
  };
}

/**
 * **A part of the rise**: step up's route played on from the part's first stage; done at the end
 * of the first cut's stage (`CUTS`) where the body has been read in that cut's posture, slow enough to hand over, for
 * `REACHED_SECONDS`, from that stage on until the next cut's begins; read at none, it plays the
 * route to its end, step up's climb and steadying (`stanceSteady`). It yields only while it lies
 * slack: its climb is its own until the body stands ready or falls.
 */
function risePart(own: OwnBody, view: BodyView, fitted: MotorAndGuard, kind: StagedKind, tuning: StepUpTuning): TechniqueRun<Side> {
  const part: Part = PARTS[kind];
  const whole = stepUpRecipe(tuning, part.recipe);
  const at = (name: string): number => {
    const index = whole.rise.findIndex(stage => stage.name === name);
    if (index < 0) throw new Error(`the rise has no ${JSON.stringify(name)} stage`);
    return index;
  };
  const first = at(part.first!);
  /** The cuts this part may end at, by the index of the stage each is read after: step up's, on its own recipe. */
  const cuts = part.recipe ? [] : CUTS.map(cut => ({ index: at(cut.after), at: cut.at })).filter(cut => cut.index >= first && cut.at === part.to);
  const unrolled = routeRecipes(kind, tuning)[0]!;
  const rise: StepUpRise = stagedRise(own, view, unrolled);
  const motor = carrying(fitted.motor.make(own.built, own.muscles, .1, fitted.posture), ["stance"], "a part of step up's route");
  const steady = stanceSteady(own, view, motor, tuning.climb);
  // `cut`: the latest of `cuts` begun, -1 for none.
  const state = { phase: "rise" as "rise" | "steady", rose: false,
    ended: null as TechniqueEnd | null, elapsed: 0, cut: -1, reached: 0, handover: 0,
    rise: rise.state, steady: steady.state, motor: motor.state };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  return {
    state, get phase() { return state.phase === "steady" ? "steady" : rise.state.phase; },
    get yields() { return state.ended !== null || rise.state.phase === "settle"; },
    admits: (g, side) => stagedEntry(kind, tuning, g, side),
    reached: (g, to) => to === "standing" ? standReady({ down: view.down, ground: g }) : readsAt(tuning, g, to),
    begin() {
      state.phase = "rise"; state.rose = false; state.ended = null;
      state.elapsed = 0; state.cut = -1; state.reached = 0; state.handover = 0;
      rise.beginRising();
      motor.reset();
    },
    end() { if (state.ended === null) { rise.end(); finish("interrupted"); } },
    step(g, senses, control, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      if (state.phase === "rise") {
        if (state.elapsed > LIMIT) { rise.end(); return finish("timed-out"); }
        // The rise lies slack again once an attempt has failed.
        if (rise.state.phase === "rise") state.rose = true;
        else if (state.rose && rise.state.phase === "settle") { rise.end(); return finish("failed"); }
        if (rise.state.phase === "rise" && g.raw === "back" && g.height < LOW) { rise.end(); return finish("failed"); }
        const handover = whole.handover;
        if (handover && rise.state.phase === "rise" && rise.state.stage === unrolled.rise.length - 1) {
          const load = g.footLoad.reduce((sum, value) => sum + value, 0);
          const ready = g.onFeet && load >= handover.load && g.upright >= handover.upright && g.velocity.lengthSquared() < handover.speed * handover.speed;
          state.handover = ready ? state.handover + dt : 0;
          if (ready && state.handover + 1e-9 >= handover.seconds) rise.end();
        }
        if (rise.state.phase !== "idle") {
          rise.step(senses, control, dt);
          // A rise fallen back to lying slack has failed, read at the next step.
          const after: string = rise.state.phase;
          if (after === "settle") return null;
          const now = after === "idle" ? whole.rise.length : first + rise.state.stage;
          let cut = -1;
          for (let k = 0; k < cuts.length; k++) if (cuts[k]!.index <= now) cut = k;
          if (cut !== state.cut) { state.cut = cut; state.reached = 0; }
          if (cut < 0) return null;
          state.reached = readsAt(tuning, g, cuts[cut]!.at) ? state.reached + dt : 0;
          if (now <= cuts[cut]!.index || state.reached + 1e-9 < REACHED_SECONDS) return null;
          rise.end();
          return finish("done");
        }
        if (part.to !== "standing") return finish("failed");
        // The rise is over: the stance takes the body from the height it was left at.
        steady.begin(g);
        state.phase = "steady";
      }
      const end = steady.step(g, control, dt);
      return end === null ? null : finish(end);
    },
  };
}

/** A body has step up's route where it has a step-up record; the sit-back's parts (`SIT_BACK`), where it has a sit-back record as well. */
const fitsStepUp = recordFault<never>("step up", STEP_UP_BODIES, () => false);
const fitsSitBack = recordFault<never>("sit-back", SIT_BACK_BODIES, () => false);
const fitsPart = (kind: StagedKind) => (spec: BodySpec, config: { readonly tuning?: StepUpTuning }): string | null => {
  const missing = config.tuning === undefined ? ((PARTS[kind] as Part).recipe === SIT_BACK ? fitsSitBack(spec, {}) : null) ?? fitsStepUp(spec, {}) : null;
  if (missing) return missing;
  const tuning = config.tuning ?? stepUpTuning(spec);
  if (!validStepUp(tuning)) return "invalid step-up settings";
  return routeRecipes(kind, tuning).flatMap(recipe => stageFaults(recipe, spec))[0] ?? null;
};

/** An experiment may pass a whole immutable recipe tuning in place of the body's record. */
interface StagedConfig<K extends StagedKind> { readonly kind: K; readonly tuning?: StepUpTuning }

declare module "../../technique.ts" {
  interface TechniqueConfigs {
    readonly "staged-roll": StagedConfig<"staged-roll">;
    readonly "staged-down": StagedConfig<"staged-down">;
    readonly "sit-back": StagedConfig<"sit-back">;
    readonly "front-sit-back": StagedConfig<"front-sit-back">;
  }
}

const routeTechnique = <K extends StagedKind>(kind: K, label: string): TechniquePart<StagedConfig<K>> => Object.freeze({ ...technique(kind, { label, stage: "experimental", moving: true,
  sides: Object.freeze(["left"] as const), edges: Object.freeze(PARTS[kind].from.map(from => Object.freeze({ from, to: PARTS[kind].to as Position }))),
  requires: PARTS[kind].first === null ? [] : [SUPPORT_REFERENCE, MOTOR_STANCE], reads: () => ["step-up", "sit-back"],
  make: (own, view, _clock: Clock, fitted, config) => routePart(own, view, fitted, kind, (config as StagedConfig<K>).tuning ?? stepUpTuning(own.spec)) }),
  fitReads: ["step-up", "sit-back"] as const, fits: fitsPart(kind),
  keys: { kind: true, tuning: true } as const, tuning: ["settle", "climb", "stages", "rest", "over", "roll", "sideSwing", "heldSupport", "loadouts"],
  faults: (config: StagedConfig<K>) => config.tuning === undefined || validStepUp(config.tuning) ? [] : ["tuning: invalid step-up settings"],
});

/** **Staged roll**: from the back or a side onto the front, as step up rolls. */
export const STAGED_ROLL = routeTechnique("staged-roll", "Staged roll");
/** **Staged down**: from the front onto hands and knees, step up's fold, tuck, prop and bearing stage on them. */
export const STAGED_DOWN = routeTechnique("staged-down", "Staged down");
/** **Sit back**: from hands and knees on toes, sat back onto the heels and up over the feet (`SIT_BACK`), climbed and steadied. */
export const SIT_BACK_EDGE = routeTechnique("sit-back", "Sit back");
/**
 * **Sit back from the front**: onto hands and knees as step up comes, and on through the sit-back
 * without a stop (`SIT_BACK`): one rise, since a body stopped on hands and knees (`staged-down`)
 * and begun on the sit-back afresh mostly falls.
 */
export const FRONT_SIT_BACK = routeTechnique("front-sit-back", "Sit back from the front");
