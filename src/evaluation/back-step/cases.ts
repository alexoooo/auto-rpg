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
import { withBackStep, withLegs, type OptionMindConfig } from "../../minds/option/config.ts";
import { ORDERS_OPTION } from "../../minds/option/kinds.ts";
import { GOING, type MoveConfig } from "../../skills/locomotion/move/index.ts";
import { STAGGERED, STOCK_GAITS, type Gait } from "../../skills/locomotion/move/gaits.ts";
import type { ConfigFor } from "../../parts/lookup.ts";
import { type GameContext, mindFaultsOf, perContext } from "../../game/arena/context.ts";

/** Who throws the punches: the drill's walked-in attacker, or the Warrior's own Mind. */
type Attacker = "drill" | "mind";

/** One trial's conditions: its attacker, the gap it starts at, m, and, sparring, the range its sway is ordered at, m. */
export type BackStepCondition = { readonly attacker: Attacker; readonly gap: number; readonly sway?: number };

/** The carriage the subject is set in as its foe nears and sways from (`STAGGERED`). */
const CARRIAGE = STAGGERED;

/** The back step as the drill reads best: held back 0.7 s, brought in over 0.5 s, the lead foot stepping 0.1 m in. */
const BACK_STEP = deepFreeze({ kind: "back-step", carriage: CARRIAGE, out: .7, back: .5, stepIn: .1, follow: .15, turn: 2 });

/** The sway Commander's settings: the carriage within 3 m, the back step at 1.05 m held 1.65 s, 0.3 s between. */
const SWAYING = deepFreeze({ kind: "sway", range: 1.05, near: 0, seconds: 2.8, rest: .3, set: 3, follow: .95, fight: 0 });

/**
 * The sway Commander sparring (`SPAR`): the back step held 1.65 s, as the Mind holds it (its
 * `back-step` Option), with no follow; its range each trial's own.
 */
const SPARRING = deepFreeze({ kind: "sway", near: 0, seconds: 1.65, rest: .3, set: 3, follow: 0, fight: 0 });

/** The sway Commander sparring a fighting subject (`SPAR_FIGHT`): as `SPARRING`, the subject its own Mind's a second between sways and in no carriage but its Mind's. */
const FIGHTING = deepFreeze({ ...SPARRING, rest: 1, set: 0, fight: 1 });

/** The drill's attacker: walked in at 1 m/s and ordered to punch the trunk's middle the first step it can. */
const DRILLING = deepFreeze({ kind: "drill", skill: "straight-punch", region: { kind: "mark", mark: "middle" }, after: .5, pace: 1, walking: true });

/**
 * A rung: its attacker, the gaps it starts at, m, how long a trial plays, s, and how long past the
 * first punch's fire it plays where that ends it. A change here is a new protocol.
 */
type Rung = { readonly attacker: Attacker; readonly gaps: readonly number[]; readonly seconds: number; readonly after?: number; readonly sways?: readonly number[]; readonly recorded?: true; readonly fight?: true; readonly chosen?: true; readonly mirror?: true };

const range = (from: number, to: number, step: number): number[] => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, k) => Number((from + k * step).toFixed(4)));

const DRILLED: Rung = deepFreeze({ attacker: "drill", gaps: range(2, 3, .05), seconds: 12, after: 3 });
const MIND: Rung = deepFreeze({ attacker: "mind", gaps: range(2.6, 4.9, .1), seconds: 20 });

/**
 * **The drill's sways recorded**: `drilled`, each sway its Commander orders a trial (`Sway`), the
 * attacker walked straight in along the line the two start on, so how the subject faces after a
 * sway is its own turn's and not a foe's stepping across.
 */
const DRILLED_SWAYS: Rung = deepFreeze({ ...DRILLED, recorded: true });

/**
 * **Sparring**: what the back step's profile is measured on (`research/skills/locomotion/back-step-profiles.mjs`).
 * The Mind's gaps, each with the sway ordered at each range from 0.6 to 1.6 m (`SPARRING`): each
 * sway a trial from where the fight had the two bodies then (`Sway`).
 */
const SPAR: Rung = deepFreeze({ ...MIND, sways: range(.6, 1.6, .1) });

/**
 * **Sparring while fighting**, with `spar` what the back step's profile is measured on: the
 * subject the Warrior's own Mind fighting (`fighter`), ordered the sway at each range as `spar`
 * orders it (`FIGHTING`), so its trials begin where the Mind's own fight has the body: out of a
 * walk, a punch or its recovery, as a Mind that chooses the back step begins it.
 */
const SPAR_FIGHT: Rung = deepFreeze({ ...SPAR, fight: true });

/**
 * **The back step as the Mind chooses it**: the subject the Warrior's own Mind with the back step
 * (`withBackStep`), ordered nothing, from 2.6 to 4.95 m apart a centimetre at a time; each sway it takes a trial. Its
 * sways begin where its Mind would begin them, so they read what a fight's do, which the drawn
 * starts of `spar` and `spar-fight` may not.
 */
const SPAR_CHOSEN: Rung = deepFreeze({ ...MIND, gaps: range(2.6, 4.95, .01), sways: [0], fight: true, chosen: true });

/** **The back step as the Mind chooses it in the mirror**: as `spar-chosen`, the attacker the same Mind with the back step, so its sways begin where a foe that sways too has the bodies. */
const SPAR_MIRROR: Rung = deepFreeze({ ...SPAR_CHOSEN, mirror: true });

/** Gaps no reading of the back step was chosen on, for the bar's last word: two Mind sets of 24 and a drilled one of 21. A checkpoint is never ranked on them. */
const MIND_HELD: Rung = deepFreeze({ ...MIND, gaps: [...range(2.6125, 4.9125, .1), ...range(2.6875, 4.9875, .1)] });
const DRILLED_HELD: Rung = deepFreeze({ ...DRILLED, gaps: range(2.0125, 3.0125, .05) });

export const createBackStepCases = perContext((context: GameContext) => {
  const mindFaults = mindFaultsOf(context), { minds: MINDS } = context.catalog;

  /**
   * The subject's mind as the drill's defender: its Option Mind's standing choices and its orders,
   * throwing nothing, walking only as ordered; Move's stock gaits beside its carriage (`set`) and
   * the back step (`back-step`).
   */
  function defenderOf(value: Json): MindConfig {
    const mind = mindOf(value) as OptionMindConfig;
    const standing = (mind.options ?? []).filter((option) => !option.kind.startsWith("strike-") && !["orders", "walk", "covers", "steps-back"].includes(option.kind));
    const gaits: Gait[] = [...STOCK_GAITS,
      { name: "set", label: "Set", legs: { kind: "stance-walk", variation: "stance-walk", carriage: CARRIAGE } as ConfigFor<"gait"> },
      { name: "back-step", label: "Back step", legs: BACK_STEP as ConfigFor<"gait"> }];
    return withLegs({ ...mind, options: [ORDERS_OPTION.defaults, ...standing] }, { ...GOING, gaits });
  }

  /** The Warrior's own Mind fighting as in the game, choosing no back step of its own, its legs going by the drill's (`BACK_STEP`) beside the stock gaits: what `SPAR_FIGHT` orders the sway. */
  function fighter(): MindConfig {
    const mind = context.defaultMind("man") as OptionMindConfig, legs = (mind.tuning?.parts?.legs ?? GOING) as unknown as MoveConfig;
    return withLegs({ ...mind, options: (mind.options ?? []).filter((option) => option.kind !== "steps-back") },
      { ...legs, gaits: [...(legs.gaits ?? STOCK_GAITS), { name: "back-step", label: "Back step", legs: BACK_STEP as ConfigFor<"gait"> }] } as ConfigFor<"locomotion">) as MindConfig;
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
      conditions: rung.sways ? rung.gaps.flatMap((gap) => rung.sways!.map((sway) => ({ attacker: rung.attacker, gap, sway }))) : rung.gaps.map((gap) => ({ attacker: rung.attacker, gap })),
      seconds: rung.seconds,
      faults: (value, _condition, subject) => faultsOf(value, "man", subject),
      world: ([value], { attacker, gap, sway }, engine, [seat]) => ({
        kind: "bout", engine, tape: [],
        recipe: { left: "man", right: "man", capSeconds: rung.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideCharacters({ left: "man", right: "man" }, { left: seat }),
          loadouts: { left: { left: "empty", right: "empty" }, right: { left: "empty", right: "empty" } },
          // Along +x, as the open stage's spawns are.
          start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, 0], heading: -Math.PI / 2 } },
          minds: { left: rung.chosen ? withBackStep(context.defaultMind("man")) : rung.fight ? fighter() : defenderOf(value), right: attacker === "drill" ? MINDS["option-drill"]!.config : rung.mirror ? withBackStep(context.defaultMind("man")) : context.defaultMind("man") },
          commanders: { ...rung.chosen ? {} : { left: sway === undefined ? SWAYING : { ...rung.fight ? FIGHTING : SPARRING, range: sway } }, ...(attacker === "drill" ? { right: DRILLING } : {}) } },
      }),
      read: (built) => readBackStep(built, { ...rung, sways: rung.sways !== undefined || rung.recorded === true, chosen: rung.chosen === true }),
    };
  }

  /** A rung a table reads, `name`, beside its training twin, `<name>-twin`: its gaps halfway between (`between`). */
  const twinned = (name: string, rung: Rung): Record<string, Cases<BackStepCondition, BackStepReading>> =>
    ({ [name]: { ...backStepCases(rung), twin: `${name}-twin` }, [`${name}-twin`]: backStepCases(deepFreeze({ ...rung, gaps: between(rung.gaps) })) });

  /** Every protocol the back step's evaluation may be played on, by name. */
  const BACK_STEP_CASES: Readonly<Record<string, Cases<BackStepCondition, BackStepReading>>> = Object.freeze({ ...twinned("drilled", DRILLED), ...twinned("mind", MIND),
    "mind-held": backStepCases(MIND_HELD), "drilled-held": backStepCases(DRILLED_HELD), "drilled-sways": backStepCases(DRILLED_SWAYS), spar: backStepCases(SPAR), "spar-fight": backStepCases(SPAR_FIGHT), "spar-chosen": backStepCases(SPAR_CHOSEN), "spar-mirror": backStepCases(SPAR_MIRROR) });

  return { BACK_STEP_CASES };
});
