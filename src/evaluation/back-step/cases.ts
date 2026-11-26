/**
 * **The back step's evaluation's cases**: the subject's mind, standing and throwing nothing, in the
 * carriage the back step stands in, led by the sway Commander (`SWAY`): its carriage taken as its
 * foe nears, the back step ordered on its foe's range (on a held rung's `-standing` twin, never,
 * the half of the bar it is compared with). Its foe throws straight punches: walked in
 * and ordered to punch (`drilled`), or fighting as the Warrior's own Mind for 20 s (`mind`). The
 * subject is a Warrior empty-handed, the bout's left side; the attacker starts the condition's gap
 * ahead. Nothing ends a trial but its reader. A trial is a bout world, so the Arena plays it.
 */
import { presetFitsModel } from "../../minds/catalog/controller.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import type { CommanderConfig } from "../../minds/command/kind.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindOf, seatBody, sideCharacters, type Cases, type Json, type Subject } from "../evaluation.ts";
import { readBackStep, type BackStepReading, type BackStepReads } from "./read.ts";
import { between } from "../twin.ts";
import { optionMind, optionsOf, standingOptions, withLegs, type OptionMindConfig } from "../../minds/option/assembly/config.ts";
import { BACK_STEP_OPTION, ORDERS_OPTION } from "../../minds/option/options/kinds.ts";
import { GOING } from "../../skills/locomotion/move/index.ts";
import { stockGaits } from "../../skills/locomotion/move/gaits.ts";
import type { Gait } from "../../skills/framework/locomotion-part.ts";
import { BACK_STEP_SECONDS } from "../../skills/locomotion/back-step/index.ts";
import { STAGGERED } from "../../skills/locomotion/shared/locomotion.ts";
import { type GameContext, mindFaultsOf, perContext } from "../../game/arena/context.ts";
import { EMPTY_LOADOUT } from "../../core/bodies/items/held.ts";

/** Who throws the punches: the drill's walked-in attacker, or the Warrior's own Mind. */
type Attacker = "drill" | "mind";

/** One trial's conditions: its attacker, the gap it starts at, m, and the range its sway is ordered at, m; null where its Commander orders by its own settings, or none orders it. */
export type BackStepCondition = { readonly attacker: Attacker; readonly gap: number; readonly sway: number | null };

/** The carriage the subject is set in as its foe nears and sways from (`STAGGERED`). */
const CARRIAGE = STAGGERED;

/** The sway Commander's settings: the carriage within 3 m, the back step at 1.05 m held 2.8 s, 0.3 s between, walking in from 0.95 m. */
const SWAYING = deepFreeze({ kind: "sway", range: 1.05, near: 0, seconds: 2.8, rest: .3, set: 3, follow: .95, fight: false });

/** The sway Commander never swaying: the carriage within 3 m, the back step ordered at no range a foe comes within, so the subject stands in its carriage. */
const STANDING = deepFreeze({ ...SWAYING, range: 0 });

/**
 * The sway Commander sparring (`SPAR`): the back step held as the Mind holds it (its `back-step`
 * Option, `BACK_STEP_SECONDS`), with no follow; its range each trial's own.
 */
const SPARRING = deepFreeze({ kind: "sway", near: 0, seconds: BACK_STEP_SECONDS.held, rest: .3, set: 3, follow: 0, fight: false });

/** The sway Commander sparring a fighting subject (`SPAR_FIGHT`): as `SPARRING`, the subject its own Mind's a second between sways and in no carriage but its Mind's. */
const FIGHTING = deepFreeze({ ...SPARRING, rest: 1, set: 0, fight: true });

/** The drill's attacker: walked in at 1 m/s and ordered to punch the trunk's middle the first step it can. */
const DRILLING = deepFreeze({ kind: "drill", skill: "straight-punch", region: { kind: "mark", mark: "middle" }, after: .5, pace: 1, walking: true });

/** The subject's carriage as a gait (`set`), beside the stock gaits. */
const SET_GAIT: Gait = deepFreeze({ name: "set", label: "Set", legs: { kind: "stance-walk", variation: "stance-walk", carriage: CARRIAGE } });

/**
 * **A side of a trial as a rung plays it**: its mind, made of the subject's (`mind`), and its
 * Commander, given the range a condition orders its sway at (null where it orders none), null
 * where it has none.
 */
interface Side {
  mind(subject: MindConfig): MindConfig;
  commander(sway: number | null): CommanderConfig | null;
}

/**
 * **A rung**: who attacks, by the condition's name for it, and the side that plays it; the subject's
 * side; the gaps it starts at, m, and the ranges its sway is ordered at, m (null alone where its
 * Commander orders by its own settings or none orders it); how long a trial plays, s; and what its
 * reader reads (`BackStepReads`). A change here is a new protocol.
 */
interface Rung {
  readonly attacker: Attacker;
  readonly foe: Side;
  readonly subject: Side;
  readonly gaps: readonly number[];
  readonly sways: readonly (number | null)[];
  readonly seconds: number;
  readonly reads: Omit<BackStepReads, "seconds">;
}

const range = (from: number, to: number, step: number): number[] => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, k) => Number((from + k * step).toFixed(4)));

/** None ordered, or none: a side's Commander where it has none. */
const NONE = (): null => null;

export const createBackStepCases = perContext((context: GameContext) => {
  const mindFaults = mindFaultsOf(context), { minds: MINDS } = context.catalog;

  /**
   * The subject's mind as the drill's defender: its Option Mind's standing choices and its orders,
   * throwing nothing, walking only as ordered; Move's stock gaits, the back step's among them,
   * beside its carriage (`set`).
   */
  function defenderOf(subject: MindConfig): MindConfig {
    const mind = optionMind(subject, "the back step's defender");
    return withLegs({ ...mind, options: [ORDERS_OPTION.defaults, ...standingOptions(mind, context.catalog.partLookup)] }, { ...GOING, gaits: [...stockGaits(context.catalog.partLookup), SET_GAIT] });
  }

  /** The subject's mind fighting as in the game, its Options less the back step, so it chooses none of its own: what `SPAR_FIGHT` orders the sway. */
  function fighterOf(subject: MindConfig): OptionMindConfig {
    const mind = optionMind(subject, "the back step's fighter");
    return { ...mind, options: optionsOf(mind, context.catalog.partLookup).filter((option) => option.kind !== BACK_STEP_OPTION.defaults.kind) };
  }

  /** The subject's own mind, choosing its back steps itself. */
  const OWN = (subject: MindConfig): MindConfig => subject;

  /** The subject's sides: led by the sway Commander at its own range, standing in its carriage, sparring at the condition's range, fighting at the condition's, or choosing its back steps itself. */
  const DEFENDER: Side = { mind: defenderOf, commander: () => SWAYING };
  const STANDER: Side = { mind: defenderOf, commander: () => STANDING };
  const SPARRER: Side = { mind: defenderOf, commander: (sway) => sway === null ? null : { ...SPARRING, range: sway } };
  const FIGHTER: Side = { mind: fighterOf, commander: (sway) => sway === null ? null : { ...FIGHTING, range: sway } };
  const CHOOSER: Side = { mind: OWN, commander: NONE };

  /** The attackers: the drill's, walked in and ordered; the Warrior's own Mind; and the subject's own, its mirror. */
  const DRILL: Side = { mind: () => MINDS["option-drill"]!.config, commander: () => DRILLING };
  const WARRIOR: Side = { mind: () => context.defaultMind("man", EMPTY_LOADOUT), commander: NONE };
  const MIRROR: Side = { mind: OWN, commander: NONE };

  const DRILLED: Rung = { attacker: "drill", foe: DRILL, subject: DEFENDER, gaps: range(2, 3, .05), sways: [null], seconds: 12, reads: { after: 3, sways: false, chosen: false } };
  const MIND: Rung = { attacker: "mind", foe: WARRIOR, subject: DEFENDER, gaps: range(2.6, 4.9, .1), sways: [null], seconds: 20, reads: { sways: false, chosen: false } };

  /**
   * **The drill's sways recorded**: `drilled`, each sway its Commander orders a trial (`Sway`), the
   * attacker walked straight in along the line the two start on, so how the subject faces after a
   * sway is its own turn's and not a foe's stepping across.
   */
  const DRILLED_SWAYS: Rung = { ...DRILLED, reads: { ...DRILLED.reads, sways: true } };

  /**
   * **Sparring**: what the back step's profile is measured on (`research/skills/locomotion/back-step-profiles.mjs`).
   * The Mind's gaps, each with the sway ordered at each range from 0.6 to 1.6 m (`SPARRING`): each
   * sway a trial from where the fight had the two bodies then (`Sway`).
   */
  const SPAR: Rung = { ...MIND, subject: SPARRER, sways: range(.6, 1.6, .1), reads: { sways: true, chosen: false } };

  /**
   * **Sparring while fighting**, with `spar` what the back step's profile is measured on: the
   * subject's own Mind fighting (`fighterOf`), ordered the sway at each range as `spar` orders it
   * (`FIGHTING`), so its trials begin where the Mind's own fight has the body: out of a walk, a
   * punch or its recovery, as a Mind that chooses the back step begins it.
   */
  const SPAR_FIGHT: Rung = { ...SPAR, subject: FIGHTER };

  /**
   * **The back step as the Mind chooses it**: the subject's own Mind, the back step among its
   * Options, ordered nothing, from 2.6 to 4.95 m apart a centimetre at a time; each sway it takes a trial. Its
   * sways begin where its Mind would begin them, so they read what a fight's do, which the drawn
   * starts of `spar` and `spar-fight` may not.
   */
  const SPAR_CHOSEN: Rung = { ...MIND, subject: CHOOSER, gaps: range(2.6, 4.95, .01), reads: { sways: true, chosen: true } };

  /** **The back step as the Mind chooses it in the mirror**: as `spar-chosen`, the attacker the subject's own Mind, so its sways begin where a foe that sways too has the bodies. */
  const SPAR_MIRROR: Rung = { ...SPAR_CHOSEN, foe: MIRROR };

  /** Gaps no reading of the back step was chosen on, for the bar's last word: two Mind sets of 24 and a drilled one of 21. A checkpoint is never ranked on them. */
  const MIND_HELD: Rung = { ...MIND, gaps: [...range(2.6125, 4.9125, .1), ...range(2.6875, 4.9875, .1)] };
  const DRILLED_HELD: Rung = { ...DRILLED, gaps: range(2.0125, 3.0125, .05) };

  /** Why `value` is no subject, or what keeps its defender from `model`. */
  function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
    if (mindOf(value).kind !== "option") return ["the back step's subject is an Option Mind"];
    if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
    return mindFaults(defenderOf(mindOf(value)), seatBody(model, { left: "empty", right: "empty" }, subject), { entry: [] }).map((fault) => `${model}: ${fault}`);
  }

  /** The cases of the rung `name`, `rung`; its key the rung's name, gaps, sways, seconds and reads, as each says what it plays. */
  function backStepCases(name: string, rung: Rung): Cases<BackStepCondition, BackStepReading> {
    return {
      arity: 1,
      play: { protocol: name, gaps: rung.gaps, sways: rung.sways, seconds: rung.seconds, reads: rung.reads },
      conditions: rung.gaps.flatMap((gap) => rung.sways.map((sway) => ({ attacker: rung.attacker, gap, sway }))),
      seconds: rung.seconds,
      faults: (value, _condition, subject) => faultsOf(value, "man", subject),
      world: ([value], { gap, sway }, engine, [seat]) => {
        const subject = mindOf(value), own = rung.subject.commander(sway), foe = rung.foe.commander(sway);
        return {
          kind: "bout", engine, tape: [],
          recipe: { left: "man", right: "man", capSeconds: rung.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideCharacters({ left: "man", right: "man" }, { left: seat }),
            loadouts: { left: { left: "empty", right: "empty" }, right: { left: "empty", right: "empty" } },
            // Along +x, as the open stage's spawns are.
            start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, 0], heading: -Math.PI / 2 } },
            minds: { left: rung.subject.mind(subject), right: rung.foe.mind(subject) },
            commanders: { ...own ? { left: own } : {}, ...foe ? { right: foe } : {} } },
        };
      },
      read: (built) => readBackStep(built, { seconds: rung.seconds, ...rung.reads }),
    };
  }

  /** A rung a table reads, `name`, beside its training twin, `<name>-twin`: its gaps halfway between (`between`). */
  const twinned = (name: string, rung: Rung): Record<string, Cases<BackStepCondition, BackStepReading>> =>
    ({ [name]: { ...backStepCases(name, rung), twin: `${name}-twin` }, [`${name}-twin`]: backStepCases(`${name}-twin`, { ...rung, gaps: between(rung.gaps) }) });

  /** A held-out rung, `name`, beside the same trials with the subject standing in its carriage, `<name>-standing`: the bar's two halves. */
  const held = (name: string, rung: Rung): Record<string, Cases<BackStepCondition, BackStepReading>> =>
    ({ [name]: backStepCases(name, rung), [`${name}-standing`]: backStepCases(`${name}-standing`, { ...rung, subject: STANDER }) });

  /** Every protocol the back step's evaluation may be played on, by name. */
  const BACK_STEP_CASES: Readonly<Record<string, Cases<BackStepCondition, BackStepReading>>> = Object.freeze({ ...twinned("drilled", DRILLED), ...twinned("mind", MIND),
    ...held("mind-held", MIND_HELD), ...held("drilled-held", DRILLED_HELD), "drilled-sways": backStepCases("drilled-sways", DRILLED_SWAYS),
    spar: backStepCases("spar", SPAR), "spar-fight": backStepCases("spar-fight", SPAR_FIGHT), "spar-chosen": backStepCases("spar-chosen", SPAR_CHOSEN), "spar-mirror": backStepCases("spar-mirror", SPAR_MIRROR) });

  return { BACK_STEP_CASES };
});
