import type { BodyView } from "../../body.ts";
import type { Clock } from "../../clock.ts";
import { carrying } from "../../control/motor.ts";
import type { Side } from "../../spec/body.ts";
import type { MindKit } from "../kit.ts";
import type { OwnBody } from "../mind.ts";
import { stagedRise } from "../rise/staged.ts";
import { SIT_BACK, type Recipe } from "../rise/stages.ts";
import { standReady, type GroundReading, type Position } from "./reading.ts";
import { LIMIT, LOW, stanceSteady, stepUpRecipe, stepUpTuning, type StepUpRise } from "./step-up.ts";
import { REACHED_SECONDS, technique, type TechniqueEnd, type TechniqueName, type TechniqueRun } from "./technique.ts";

/**
 * **Where step up's route is cut**: in route order, the stage of its rise (`RISE`) at whose end
 * each posture is read (`docs/reference/rising.md#the-staged-route`).
 */
const CUTS: readonly { readonly after: string; readonly at: Position }[] = Object.freeze([
  { after: "sit", at: "fours" }, { after: "tall", at: "kneeling" }, { after: "onto the toes", at: "half-kneel" }]);

/**
 * **How fast a body a part of the route takes or hands on may move**: its centre of mass under
 * `speed`, m/s, its pelvis turning under `spin`, rad/s (`docs/reference/rising.md#the-staged-route`).
 */
const HAND_OVER = Object.freeze({ speed: 1, spin: 2 });

/** Whether the body moves slowly enough for a part of the route to take it or hand it on (`HAND_OVER`). */
const handsOver = (g: GroundReading): boolean =>
  g.velocity.lengthSquared() < HAND_OVER.speed * HAND_OVER.speed && g.spin < HAND_OVER.spin;

/**
 * **How upright a trunk sat back on its heels is** (`GroundReading.upright`): above it a body on its
 * hands and knees is sat back as the route's down leaves it, below it the kneel-up sits it back
 * first (`docs/reference/rising.md#the-staged-route`).
 */
const SAT_BACK = .22;

/**
 * **A part of a staged route**: the recipe it plays (absent, step up's, `stepUp`), where in its rise
 * it begins (none: the roll alone), the
 * stage before that it begins at instead on a body not yet sat back (`SAT_BACK`), the positions it
 * is begun from, the one it takes the body to, and how slow a body it is begun on is: `moving`,
 * under `HAND_OVER`; `still`, under the speed its body's step up lies still at before it reads its
 * lie (`STEP_UP`'s `settle`).
 */
interface Part {
  readonly recipe?: Recipe;
  readonly first: string | null;
  readonly unsat?: string;
  readonly from: readonly Position[];
  readonly to: Position;
  readonly entry: "moving" | "still";
}

/** The route's parts, by technique. */
const PARTS = Object.freeze({
  "staged-roll": { first: null, from: ["back", "left", "right"], to: "front", entry: "still" },
  "staged-down": { first: "fold", from: ["front"], to: "fours", entry: "still" },
  "staged-kneel-up": { first: "kneel 0", unsat: "sit", from: ["fours"], to: "kneeling", entry: "moving" },
  "staged-step-through": { first: "shift", from: ["kneeling"], to: "half-kneel", entry: "moving" },
  "staged-lunge": { first: "lunge 0", from: ["half-kneel"], to: "standing", entry: "moving" },
  "sit-back": { recipe: SIT_BACK, first: "plant", from: ["fours"], to: "standing", entry: "moving" },
  "front-sit-back": { recipe: SIT_BACK, first: "fold", from: ["front"], to: "standing", entry: "still" },
} as const satisfies Record<string, Part>);
type StagedKind = keyof typeof PARTS;

/** Whether body `model` moves slowly enough for part `kind` to be begun on it (`Part.entry`). */
const slowFor = (kind: StagedKind, model: string, g: GroundReading): boolean => {
  const entry = PARTS[kind].entry;
  switch (entry) {
    case "moving": return handsOver(g);
    case "still": { const speed = stepUpTuning(model).settle.speed; return g.velocity.lengthSquared() < speed * speed && g.spin < HAND_OVER.spin; }
    default: { const never: never = entry; throw new Error(`no entry ${String(never)}`); }
  }
};

/** The part begun from position `at`. */
const partFrom = (at: Position): StagedKind | undefined =>
  (Object.keys(PARTS) as StagedKind[]).find(kind => (PARTS[kind].from as readonly Position[]).includes(at));

/**
 * **A part's entry**: begun on the left, body `model` read in a position it is begun from (its raw
 * reading, `GroundReading.raw`) and slow enough for it (`Part.entry`), still or not.
 */
const stagedEntry = (kind: StagedKind, model: string, g: GroundReading, side: Side): boolean =>
  side === "left" && (PARTS[kind].from as readonly Position[]).includes(g.raw) && slowFor(kind, model, g);

/**
 * **A part of step up's route as a technique**, its stages timed as step up's (`STEP_UP`), begun on
 * the body as it is, moving or not (`stagedEntry`). The roll plays the roll of the lie it reads at
 * once, the attempt after one that failed over the other side; lies slack after it and reads again,
 * rolling again where it is not on its front; and is done once its rolled body has been read on its
 * front, slow enough to hand over, for `REACHED_SECONDS`. A part of the rise plays step up's route on
 * from its first stage, or from its `unsat` stage on a body not yet sat back; it is done at the end of the first cut's stage (`CUTS`) where the body has
 * been read in that cut's posture, slow enough to hand over, for `REACHED_SECONDS`, from that stage
 * on until the next cut's begins; read at none, it plays the route to its end, step up's climb and
 * steadying (`stanceSteady`). A rise that falls back to lying slack, or onto its back, fails; one
 * longer than step up's whole attempt (`LIMIT`) times out.
 */
function routePart(own: OwnBody, view: BodyView, kit: MindKit, kind: StagedKind): TechniqueRun {
  const part: Part = PARTS[kind];
  const model = own.spec.model, tuning = stepUpTuning(model), whole = stepUpRecipe(tuning, part.recipe);
  const at = (name: string): number => {
    const index = whole.rise.findIndex(stage => stage.name === name);
    if (index < 0) throw new Error(`the rise has no ${JSON.stringify(name)} stage`);
    return index;
  };
  const first = part.first === null ? whole.rise.length : at(part.first);
  /** The cuts this part may end at, by the index of the stage each is read after: step up's, on its own recipe. */
  const cuts = part.recipe ? [] : CUTS.map(cut => ({ index: at(cut.after), at: cut.at })).filter(cut => cut.index >= first);
  const otherSide: Side = (tuning.over ?? "right") === "right" ? "left" : "right";
  const from = (index: number): Recipe => ({ ...whole, roll: { back: [], left: [], right: [] }, rise: whole.rise.slice(index) });
  // `other`: the roll over the other side; for a part with an `unsat` stage, its rise from there.
  const begins = { whole: first, other: part.unsat === undefined ? first : at(part.unsat) };
  const rises: Record<"whole" | "other", StepUpRise> = part.first === null
    ? { whole: stagedRise(own, view, { ...whole, rise: [] }), other: stagedRise(own, view, { ...stepUpRecipe({ ...tuning, over: otherSide }), rise: [] }) }
    : { whole: stagedRise(own, view, from(first)), other: stagedRise(own, view, from(begins.other)) };
  const motor = part.first === null ? null : carrying(kit.motor(own.built, .1, kit.posture), ["stance"], "a part of step up's route");
  const steady = motor && stanceSteady(own, view, motor, tuning.climb);
  // `flip`: this attempt rolls over the other side, the last having failed. `rolled`: the roll has
  // begun turning the body. `cut`: the latest of `cuts` begun, -1 for none.
  const state = { phase: "rise" as "rise" | "steady", entry: "whole" as "whole" | "other", rose: false, flip: false, rolled: false,
    ended: null as TechniqueEnd | null, elapsed: 0, cut: -1, reached: 0,
    rises: { whole: rises.whole.state, other: rises.other.state }, ...(steady ? { steady: steady.state, motor: motor!.state } : {}) };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  /** Whether the body is read in position `to`, slow enough for the part begun there. */
  const reads = (g: GroundReading, to: Position) => { const next = partFrom(to); return g.position === to && (next ? slowFor(next, model, g) : handsOver(g)); };
  return {
    state, get phase() { return state.phase === "steady" ? "steady" : rises[state.entry].state.phase; },
    get yields() { return state.ended !== null || state.phase === "steady" || rises[state.entry].state.phase === "settle"; },
    admits: (g, side) => stagedEntry(kind, model, g, side),
    reached: (g, to) => to === "standing" ? standReady({ down: view.down, ground: g }) : reads(g, to),
    begin() {
      state.flip = part.first === null && (state.ended === "failed" || state.ended === "timed-out") ? !state.flip : false;
      const unsat = part.unsat !== undefined && (view.ground?.upright ?? 0) < SAT_BACK;
      state.phase = "rise"; state.entry = state.flip || unsat ? "other" : "whole"; state.rose = false; state.rolled = false; state.ended = null;
      state.elapsed = 0; state.cut = -1; state.reached = 0;
      const rise = rises[state.entry];
      if (part.first === null) rise.beginRolling(); else rise.beginRising();
      motor?.reset();
    },
    end() { if (state.ended === null) { rises[state.entry].end(); finish("interrupted"); } },
    step(g, senses, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      const rise = rises[state.entry];
      if (state.phase === "rise") {
        if (state.elapsed > LIMIT) { rise.end(); return finish("timed-out"); }
        if (part.first === null) {
          // The roll: on its front once it has rolled, slow enough to hand over.
          rise.step(senses, dt);
          const now: string = rise.state.phase;
          if (now === "roll") state.rolled = true;
          state.reached = state.rolled && now !== "roll" && reads(g, "front") ? state.reached + dt : 0;
          if (state.reached + 1e-9 < REACHED_SECONDS) return null;
          rise.end();
          return finish("done");
        }
        // The rise lies slack again once an attempt has failed.
        if (rise.state.phase === "rise") state.rose = true;
        else if (state.rose && rise.state.phase === "settle") { rise.end(); return finish("failed"); }
        if (rise.state.phase === "rise" && g.lie === "back" && g.height < LOW) { rise.end(); return finish("failed"); }
        if (rise.state.phase !== "idle") {
          rise.step(senses, dt);
          // A rise fallen back to lying slack has failed, read at the next step.
          const after: string = rise.state.phase;
          if (after === "settle") return null;
          const now = after === "idle" ? whole.rise.length : begins[state.entry] + rise.state.stage;
          let cut = -1;
          for (let k = 0; k < cuts.length; k++) if (cuts[k]!.index <= now) cut = k;
          if (cut !== state.cut) { state.cut = cut; state.reached = 0; }
          if (cut < 0) return null;
          state.reached = reads(g, cuts[cut]!.at) ? state.reached + dt : 0;
          if (now <= cuts[cut]!.index || state.reached + 1e-9 < REACHED_SECONDS) return null;
          rise.end();
          return finish("done");
        }
        // The rise is over: the stance takes the body from the height it was left at.
        steady!.begin(g);
        state.phase = "steady";
      }
      const end = steady!.step(g, dt);
      return end === null ? null : finish(end);
    },
  };
}

const routeTechnique = <K extends StagedKind>(kind: K, label: string) => technique(kind, { label, stage: "experimental", moving: true,
  sides: Object.freeze(["left"] as const), edges: Object.freeze(PARTS[kind].from.map(from => Object.freeze({ from, to: PARTS[kind].to as Position }))),
  make: (own, view, _clock: Clock, kit) => routePart(own, view, kit, kind) });

/** **Staged roll**: from the back or a side onto the front, as step up rolls. */
export const STAGED_ROLL = routeTechnique("staged-roll", "Staged roll");
/** **Staged down**: from the front onto hands and knees, step up's fold, tuck, prop and bearing stage on them, sitting back toward the heels. */
export const STAGED_DOWN = routeTechnique("staged-down", "Staged down");
/** **Staged kneel-up**: from hands and knees up tall on the knees. */
export const STAGED_KNEEL_UP = routeTechnique("staged-kneel-up", "Staged kneel-up");
/** **Staged step-through**: from kneeling, the left foot brought through and set down ahead, half kneeling, the weight onto the right toes. */
export const STAGED_STEP_THROUGH = routeTechnique("staged-step-through", "Staged step-through");
/** **Staged lunge**: from half kneeling up the lunge to standing, climbed and steadied. */
export const STAGED_LUNGE = routeTechnique("staged-lunge", "Staged lunge");
/** **Sit back**: from hands and knees on toes, sat back onto the heels and up over the feet (`SIT_BACK`), climbed and steadied. */
export const SIT_BACK_EDGE = routeTechnique("sit-back", "Sit back");
/** **Sit back from the front**: onto hands and knees as step up comes, and on through the sit-back without a stop (`SIT_BACK`). */
export const FRONT_SIT_BACK = routeTechnique("front-sit-back", "Sit back from the front");

/** **The staged route**: step up's parts in route order, then step up from whatever they do not take. */
export const STAGED_ROUTE: readonly TechniqueName[] = Object.freeze(["staged-roll", "staged-down", "staged-kneel-up", "staged-step-through", "staged-lunge", "step-up"]);
