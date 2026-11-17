/**
 * **The back step's evaluation's cases**: the subject's mind, standing and throwing nothing, in the
 * carriage the back step stands in, led by the sway Commander (`SWAY`): its carriage taken as its
 * foe nears, the back step ordered on its foe's range. Its foe throws straight punches: walked in
 * and ordered to punch (`drilled`), or fighting as the Warrior's own Mind for 20 s (`mind`). The
 * subject is a Warrior empty-handed, the bout's left side; the attacker starts the condition's gap
 * ahead. Nothing ends a trial but its reader. A trial is a bout world, so the Arena plays it.
 */
import { presetFitsModel } from "../../minds/catalog/controller.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindOf, seatBody, sideCharacters, type Cases, type Json, type Subject } from "../evaluation.ts";
import { readBackStep, type BackStepReading } from "./read.ts";
import { between } from "../twin.ts";
import { withLegs, type OptionMindConfig } from "../../minds/option/config.ts";
import { ORDERS_OPTION } from "../../minds/option/kinds.ts";
import { GOING } from "../../skills/locomotion/move/index.ts";
import { STOCK_GAITS, type Gait } from "../../skills/locomotion/move/gaits.ts";
import type { ConfigFor } from "../../parts/lookup.ts";
import { type GameContext, mindFaultsOf, perContext } from "../../game/arena/context.ts";

/** Who throws the punches: the drill's walked-in attacker, or the Warrior's own Mind. */
type Attacker = "drill" | "mind";

/** One trial's conditions: its attacker and the gap it starts at, m. */
export type BackStepCondition = { readonly attacker: Attacker; readonly gap: number };

/** The carriage the subject is set in as its foe nears and sways from: the left foot 0.4 m ahead, 0.25 m wide, 0.1 m lower. */
const CARRIAGE = deepFreeze({ lead: "left", width: .25, stagger: .4, lower: .1 });

/** The back step as the drill reads best: held back 0.7 s, brought in over 0.5 s, the lead foot stepping 0.1 m in. */
const BACK_STEP = deepFreeze({ kind: "back-step", carriage: CARRIAGE, out: .7, back: .5, stepIn: .1 });

/** The sway Commander's settings: the carriage within 3 m, the back step at 1.05 m held 1.65 s, 0.3 s between. */
const SWAYING = deepFreeze({ kind: "sway", range: 1.05, near: 0, seconds: 1.65, rest: .3, set: 3 });

/** The drill's attacker: walked in at 1 m/s and ordered to punch the trunk's middle the first step it can. */
const DRILLING = deepFreeze({ kind: "drill", skill: "straight-punch", region: { kind: "mark", mark: "middle" }, after: .5, pace: 1, walking: true });

/**
 * A rung: its attacker, the gaps it starts at, m, how long a trial plays, s, and how long past the
 * first punch's fire it plays where that ends it. A change here is a new protocol.
 */
type Rung = { readonly attacker: Attacker; readonly gaps: readonly number[]; readonly seconds: number; readonly after?: number };

const range = (from: number, to: number, step: number): number[] => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, k) => Number((from + k * step).toFixed(3)));

const DRILLED: Rung = deepFreeze({ attacker: "drill", gaps: range(2, 3, .05), seconds: 12, after: 3 });
const MIND: Rung = deepFreeze({ attacker: "mind", gaps: range(2.6, 4.9, .1), seconds: 20 });

export const createBackStepCases = perContext((context: GameContext) => {
  const mindFaults = mindFaultsOf(context), { minds: MINDS } = context.catalog;

  /**
   * The subject's mind as the drill's defender: its Option Mind's standing choices and its orders,
   * throwing nothing, walking only as ordered; Move's stock gaits beside its carriage (`set`) and
   * the back step (`back-step`).
   */
  function defenderOf(value: Json): MindConfig {
    const mind = mindOf(value) as OptionMindConfig;
    const standing = (mind.options ?? []).filter((option) => !option.kind.startsWith("strike-") && !["orders", "walk", "covers"].includes(option.kind));
    const gaits: Gait[] = [...STOCK_GAITS,
      { name: "set", label: "Set", legs: { kind: "stance-walk", variation: "stance-walk", carriage: CARRIAGE } as ConfigFor<"gait"> },
      { name: "back-step", label: "Back step", legs: BACK_STEP as ConfigFor<"gait"> }];
    return withLegs({ ...mind, options: [ORDERS_OPTION.defaults, ...standing] }, { ...GOING, gaits });
  }

  /** Why `value` is no subject, or what keeps its defender from `model`. */
  function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
    if ((value as { kind?: unknown } | null)?.kind !== "option") return ["the back step's subject is an Option Mind"];
    if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
    return mindFaults(defenderOf(value), seatBody(model, { left: "empty", right: "empty" }, subject), { entry: [] }).map((fault) => `${model}: ${fault}`);
  }

  function backStepCases(rung: Rung): Cases<BackStepCondition, BackStepReading> {
    return {
      arity: 1,
      play: rung as unknown as Json,
      conditions: rung.gaps.map((gap) => ({ attacker: rung.attacker, gap })),
      seconds: rung.seconds,
      faults: (value, _condition, subject) => faultsOf(value, "man", subject),
      world: ([value], { attacker, gap }, engine, [seat]) => ({
        kind: "bout", engine, tape: [],
        recipe: { left: "man", right: "man", capSeconds: rung.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideCharacters({ left: "man", right: "man" }, { left: seat }),
          loadouts: { left: { left: "empty", right: "empty" }, right: { left: "empty", right: "empty" } },
          // Along +x, as the open stage's spawns are.
          start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, 0], heading: -Math.PI / 2 } },
          minds: { left: defenderOf(value), right: attacker === "drill" ? MINDS["option-drill"]!.config : context.defaultMind("man") },
          commanders: { left: SWAYING, ...(attacker === "drill" ? { right: DRILLING } : {}) } },
      }),
      read: (built) => readBackStep(built, rung),
    };
  }

  /** A rung a table reads, `name`, beside its training twin, `<name>-twin`: its gaps halfway between (`between`). */
  const twinned = (name: string, rung: Rung): Record<string, Cases<BackStepCondition, BackStepReading>> =>
    ({ [name]: { ...backStepCases(rung), twin: `${name}-twin` }, [`${name}-twin`]: backStepCases(deepFreeze({ ...rung, gaps: between(rung.gaps) })) });

  /** Every protocol the back step's evaluation may be played on, by name. */
  const BACK_STEP_CASES: Readonly<Record<string, Cases<BackStepCondition, BackStepReading>>> = Object.freeze({ ...twinned("drilled", DRILLED), ...twinned("mind", MIND) });

  return { BACK_STEP_CASES };
});
