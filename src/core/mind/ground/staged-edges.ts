import type { BodyView } from "../../body.ts";
import type { Clock } from "../../clock.ts";
import { carrying } from "../../control/motor.ts";
import type { Side } from "../../spec/body.ts";
import type { MindKit } from "../kit.ts";
import type { OwnBody } from "../mind.ts";
import { stagedRise } from "../rise/staged.ts";
import type { Recipe } from "../rise/stages.ts";
import { standReady, tumbling, type GroundReading, type Position } from "./reading.ts";
import { LIMIT, LOW, stanceSteady, stepUpRecipe, stepUpTuning, type StepUpRise } from "./step-up.ts";
import { REACHED_SECONDS, technique, type TechniqueEnd, type TechniqueName, type TechniqueRun } from "./technique.ts";

/**
 * **Where step up's route is cut**: in route order, the stage of its rise (`RISE`) at whose end
 * each posture is read (`docs/reference/rising.md#the-staged-route`).
 */
const CUTS: readonly { readonly after: string; readonly at: Position }[] = Object.freeze([
  { after: "sit", at: "fours" }, { after: "tall", at: "kneeling" }, { after: "onto the toes", at: "half-kneel" }]);

/**
 * **A part of step up's route** (`stepUp`): where in its rise it begins (none: the roll alone), how,
 * and the positions it is begun from. It begins `lying` as the whole route does, slack until still,
 * then reading its lie; or `direct`, at its first stage at once.
 */
interface Part {
  readonly first: string | null;
  readonly entry: "lying" | "direct";
  readonly from: readonly Position[];
}

/**
 * **A part of step up's route as a technique**, its stages timed as step up's (`STEP_UP`). The roll
 * lies slack and reads its lie, rolls as step up rolls, the attempt after one that failed over the
 * other side, and is done once it has read itself on its front, not tumbling (`tumbling`), for
 * `REACHED_SECONDS` of its settling after the roll. A part of the rise plays step up's route on from
 * its first stage, one begun lying failing if the lie it reads is not the front; it is done at the
 * end of the first cut's stage (`CUTS`) where the body has been read in that cut's posture, not
 * tumbling, for `REACHED_SECONDS`, from that stage on until the next cut's begins; read at none, it
 * plays the route to its end, step up's climb and steadying (`stanceSteady`). A rise that falls
 * back to lying slack, or onto its back, fails; one longer than step up's whole attempt (`LIMIT`)
 * times out.
 */
function routePart(own: OwnBody, view: BodyView, kit: MindKit, part: Part): TechniqueRun {
  const tuning = stepUpTuning(own.spec.model), whole = stepUpRecipe(tuning);
  const at = (name: string): number => {
    const index = whole.rise.findIndex(stage => stage.name === name);
    if (index < 0) throw new Error(`step up's rise has no ${JSON.stringify(name)} stage`);
    return index;
  };
  const first = part.first === null ? whole.rise.length : at(part.first);
  /** The cuts this part may end at, by the index of the stage each is read after. */
  const cuts = CUTS.map(cut => ({ index: at(cut.after), at: cut.at })).filter(cut => cut.index >= first);
  const otherSide: Side = (tuning.over ?? "right") === "right" ? "left" : "right";
  const recipe: Recipe = part.first === null ? { ...whole, rise: [] } : { ...whole, roll: { back: [], left: [], right: [] }, rise: whole.rise.slice(first) };
  const rises: Record<"whole" | "other", StepUpRise> = { whole: stagedRise(own, view, recipe),
    other: stagedRise(own, view, part.first === null ? { ...stepUpRecipe({ ...tuning, over: otherSide }), rise: [] } : recipe) };
  const motor = part.first === null ? null : carrying(kit.motor(own.built, .1, kit.posture), ["stance"], "a part of step up's route");
  const steady = motor && stanceSteady(own, view, motor, tuning.climb);
  // `flip`: this attempt rolls over the other side, the last having failed. `cut`: the latest of `cuts` begun, -1 for none.
  const state = { phase: "rise" as "rise" | "steady", entry: "whole" as "whole" | "other", rose: false, flip: false,
    ended: null as TechniqueEnd | null, elapsed: 0, cut: -1, reached: 0,
    rises: { whole: rises.whole.state, other: rises.other.state }, ...(steady ? { steady: steady.state, motor: motor!.state } : {}) };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  /** Whether the body is read in position `to`, not tumbling. */
  const reads = (g: GroundReading, to: Position) => g.position === to && !tumbling(g);
  return {
    state, get phase() { return state.phase === "steady" ? "steady" : rises[state.entry].state.phase; },
    get yields() { return state.ended !== null || state.phase === "steady" || rises[state.entry].state.phase === "settle"; },
    admits(g, side) { return side === "left" && g.spin < 8 && g.velocity.lengthSquared() < 9 && part.from.includes(g.position); },
    reached: (g, to) => to === "standing" ? standReady({ down: view.down, ground: g }) : reads(g, to),
    begin() {
      state.flip = part.first === null && (state.ended === "failed" || state.ended === "timed-out") ? !state.flip : false;
      state.phase = "rise"; state.entry = state.flip ? "other" : "whole"; state.rose = false; state.ended = null; state.elapsed = 0;
      state.cut = -1; state.reached = 0;
      const rise = rises[state.entry];
      switch (part.entry) {
        case "lying": rise.begin(); break;
        case "direct": rise.beginRising(); break;
        default: { const never: never = part.entry; throw new Error(`no entry ${String(never)}`); }
      }
      motor?.reset();
    },
    end() { if (state.ended === null) { rises[state.entry].end(); finish("interrupted"); } },
    step(g, senses, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      const rise = rises[state.entry];
      if (state.phase === "rise") {
        // The rise lies slack again once an attempt has failed.
        if (rise.state.phase === "rise") state.rose = true;
        else if (state.rose && rise.state.phase === "settle") { rise.end(); return finish("failed"); }
        // A part of the rise begun lying is not a roll: a body it reads on another lie has failed it.
        if (part.first !== null && part.entry === "lying" && rise.state.tries > 0 && rise.state.lie !== "front") { rise.end(); return finish("failed"); }
        if (rise.state.phase === "rise" && g.lie === "back" && g.height < LOW) { rise.end(); return finish("failed"); }
        if (state.elapsed > LIMIT) { rise.end(); return finish("timed-out"); }
        if (part.first === null) {
          // The roll: on its front once its settling has read it so.
          rise.step(senses, dt);
          state.reached = reads(g, "front") ? state.reached + dt : 0;
          if (rise.state.tries === 0 || rise.state.lie !== "front" || rise.state.phase !== "idle" || state.reached + 1e-9 < REACHED_SECONDS) return null;
          rise.end();
          return finish("done");
        }
        if (rise.state.phase !== "idle") {
          rise.step(senses, dt);
          // A rise fallen back to lying slack has failed, read at the next step.
          const after: string = rise.state.phase;
          if (after === "settle") return null;
          const now = after === "idle" ? whole.rise.length : first + rise.state.stage;
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

const LYING = Object.freeze(["back", "left", "right"] as const);
const routeTechnique = <K extends string>(kind: K, label: string, part: Part, to: Position) => technique(kind, { label, stage: "experimental",
  sides: Object.freeze(["left"] as const), edges: Object.freeze(part.from.map(from => Object.freeze({ from, to }))),
  make: (own, view, _clock: Clock, _listed, kit) => routePart(own, view, kit, part) });

/** **Staged roll**: from the back or a side onto the front, as step up rolls. */
export const STAGED_ROLL = routeTechnique("staged-roll", "Staged roll", { first: null, entry: "lying", from: LYING }, "front");
/** **Staged down**: from the front onto hands and knees, step up's fold, tuck, prop and bearing stage on them, sitting back toward the heels. */
export const STAGED_DOWN = routeTechnique("staged-down", "Staged down", { first: "fold", entry: "lying", from: ["front"] }, "fours");
/** **Staged kneel-up**: from hands and knees up tall on the knees. */
export const STAGED_KNEEL_UP = routeTechnique("staged-kneel-up", "Staged kneel-up", { first: "kneel 0", entry: "direct", from: ["fours"] }, "kneeling");
/** **Staged step-through**: from kneeling, the left foot brought through and set down ahead, half kneeling, the weight onto the right toes. */
export const STAGED_STEP_THROUGH = routeTechnique("staged-step-through", "Staged step-through", { first: "shift", entry: "direct", from: ["kneeling"] }, "half-kneel");
/** **Staged lunge**: from half kneeling up the lunge to standing, climbed and steadied. */
export const STAGED_LUNGE = routeTechnique("staged-lunge", "Staged lunge", { first: "lunge 0", entry: "direct", from: ["half-kneel"] }, "standing");

/** **The staged route**: step up's parts in route order, then step up from whatever they do not take. */
export const STAGED_ROUTE: readonly TechniqueName[] = Object.freeze(["staged-roll", "staged-down", "staged-kneel-up", "staged-step-through", "staged-lunge", "step-up"]);
