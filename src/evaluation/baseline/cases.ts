/**
 * **The baseline evaluation's cases**: each competence of one mind's configuration on the Warrior,
 * a protocol each, every one another evaluation's cases played by this subject:
 *
 * - `walk`: the Locomotion drill's screen (`LOCOMOTION_CASES`);
 * - `punch`: the Strike drill's still and walk rungs (`STRIKE_CASES`), thrown by the mind's first
 *   action;
 * - `stand-up`: the owner's target's falls (`RISING_TARGET_CASES`) risen by the whole mind on the
 *   fall bed (`buildFall`), as every mind is: shoved by the target's impulse, again while it holds
 *   it, its stand verified;
 * - `fight`: the standard match's bouts (`MATCH`'s loadouts, level and gaps) against each opponent,
 *   a mind's preset (`OPPONENTS`), on each side, under the game's verdict.
 *
 * The subject's character (its preset's, `Subject.character`) is its body's in every one. Each
 * reading carries its competence (`part`), and a fight's is the subject's own side's.
 */
import { CAP_SECONDS, SIDES } from "../../arena/duel.ts";
import { REPRESENTATIVE, loadoutKey, type Loadout } from "../../core/items/held.ts";
import { FIGHT_ENTRY } from "../../core/mind/catalog.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import { MINDS } from "../../core/mind/controllers.ts";
import { modelHolding, type BodyModel } from "../../core/models.ts";
import type { Side } from "../../core/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { readBout } from "../contest.ts";
import type { BuiltCase, Cases, Json, Reader, Subject } from "../evaluation.ts";
import { sideAttributes } from "../evaluation.ts";
import { readFall, type FallReading } from "../fall.ts";
import { LOCOMOTION_CASES, type LocomotionCondition } from "../locomotion/cases.ts";
import type { LocomotionReading } from "../locomotion/read.ts";
import { RISING_TARGET_CASES, type TargetCondition } from "../rising-target/cases.ts";
import { STRIKE_CASES, type StillCondition, type StrikeSubject } from "../strike/cases.ts";
import type { StrikeReading } from "../strike/read.ts";
import type { BuiltBout } from "../bout.ts";
import { otherSide } from "../../core/spec/body.ts";

/** The body every competence is read on. */
export const BODY: BodyModel = "workshop-fighter";

/** The minds a subject fights, by preset: none of them the reference mind's own. */
export const OPPONENTS = deepFreeze(["duellist", "vanguard-warrior"]);

/** The Strike drill's rungs the punch is read on. */
const RUNGS = deepFreeze(["still", "walk"] as const);
type Rung = typeof RUNGS[number];

/** A fight's conditions: the opponent, the subject's side, both sides' loadout, and the gap, m, on the open stage. */
export type BaselineFight = { readonly foe: string; readonly side: Side; readonly loadout: Loadout; readonly gap: number };
type BaselinePunch = StillCondition & { readonly rung: Rung };

/** What a fight came to for the subject: a win 1, a draw a half; its life less the other's at the verdict; how it ended and when, s; the blows landed. */
export type FightReading = { readonly score: number; readonly margin: number; readonly won: boolean; readonly ending: string; readonly seconds: number; readonly blows: number };

/** A baseline reading: its competence's reading, and which competence it is. */
export type BaselineReading =
  | (LocomotionReading & { readonly part: "walk" })
  | (StrikeReading & { readonly part: "punch" })
  | (FallReading & { readonly part: "stand-up" })
  | (FightReading & { readonly part: "fight" });
export type BaselinePart = BaselineReading["part"];

/** `read`'s readings carried as `part`'s. */
function tagged<R extends Json>(part: BaselinePart, reader: Reader<R>): Reader<BaselineReading> {
  return { afterStep: () => reader.afterStep(), get ended() { return reader.ended; }, reading: () => ({ ...(reader.reading() as object), part }) as BaselineReading };
}

/** The subject's first action, as the Strike drill's subject; null for a mind with none. */
function strikeSubject(value: Json): StrikeSubject | null {
  const actions = (value as { readonly actions?: readonly { readonly name?: unknown }[] } | null)?.actions;
  const action = Array.isArray(actions) ? actions[0]?.name : undefined;
  return typeof action === "string" ? { mind: value as unknown as MindConfig, action } : null;
}

const walkCases = (): Cases<Json, BaselineReading, BuiltCase> => {
  const inner = LOCOMOTION_CASES.screen!;
  return {
    arity: 1, play: { walk: inner.play }, seconds: inner.seconds,
    conditions: inner.conditions.filter((one) => one.model === BODY) as unknown as Json[],
    faults: (value, condition, subject) => inner.faults?.(value, condition as LocomotionCondition, subject) ?? [],
    world: (values, condition, engine, characters) => inner.world(values, condition as LocomotionCondition, engine, characters),
    read: (built, condition) => tagged("walk", inner.read(built as never, condition as LocomotionCondition)),
  };
};

const punchCases = (): Cases<Json, BaselineReading, BuiltCase> => {
  const rungOf = (condition: Json) => { const { rung, ...rest } = condition as BaselinePunch; return { inner: STRIKE_CASES[rung]!, condition: rest as StillCondition }; };
  return {
    arity: 1, play: { punch: Object.fromEntries(RUNGS.map((rung) => [rung, STRIKE_CASES[rung]!.play])), action: "first" },
    seconds: Math.max(...RUNGS.map((rung) => STRIKE_CASES[rung]!.seconds)),
    conditions: RUNGS.flatMap((rung) => STRIKE_CASES[rung]!.conditions.filter((one) => one.model === BODY).map((one) => ({ rung, ...one }))) as unknown as Json[],
    faults: (value, condition, subject) => {
      const striking = strikeSubject(value), { inner, condition: own } = rungOf(condition);
      return striking ? inner.faults?.(striking as unknown as Json, own, subject) ?? [] : ["a mind with no action to punch with"];
    },
    world: ([value], condition, engine, characters) => { const { inner, condition: own } = rungOf(condition); return inner.world([strikeSubject(value!) as unknown as Json], own, engine, characters); },
    read: (built, condition) => { const { inner, condition: own } = rungOf(condition); return tagged("punch", inner.read(built as BuiltBout, own)); },
  };
};

const standUpCases = (): Cases<Json, BaselineReading, BuiltCase> => {
  const inner = RISING_TARGET_CASES.standard!;
  return {
    arity: 1, play: { "stand-up": inner.play, riser: "the whole mind" }, seconds: inner.seconds, engine: inner.engine!,
    conditions: inner.conditions.filter((one) => one.model === BODY) as unknown as Json[],
    faults: (value, condition, subject) => {
      const { held } = condition as TargetCondition;
      if (!presetFitsModel(subject ?? {}, BODY)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${BODY} is unavailable`];
      return mindFaults(value as unknown as MindConfig, modelHolding(BODY, { left: "empty", right: held }, subject?.character), { entry: [] });
    },
    world: ([value], condition, engine, [character]) => ({ kind: "fall", engine,
      fall: { ...(condition as TargetCondition), mind: value as unknown as MindConfig, ...(character && Object.keys(character).length > 0 ? { character } : {}) } }),
    read: (built) => tagged("stand-up", readFall(built as never)),
  };
};

/** The standard match's loadouts and gaps on the open stage, the subject and its opponent on the Warrior. */
const FIGHTS = deepFreeze({ loadouts: REPRESENTATIVE, gaps: [3, 4, 5], capSeconds: CAP_SECONDS });

/** Why the mind of `value` (the subject's, or the preset `foe`'s) cannot fight on the Warrior carrying `loadout`. */
function fighterFaults(value: Json, loadout: Loadout, who: Pick<Subject, "models" | "character">): readonly string[] {
  if (!presetFitsModel(who, BODY)) return [`named calibration allows ${who.models?.join(", ") || "no bodies"}; ${BODY} is unavailable`];
  return mindFaults(value as unknown as MindConfig, modelHolding(BODY, loadout, who.character), { entry: FIGHT_ENTRY }).map((fault) => `carrying ${loadoutKey(loadout)}: ${fault}`);
}

const fightCases = (): Cases<Json, BaselineReading, BuiltCase> => {
  const conditions: BaselineFight[] = [];
  for (const foe of OPPONENTS) for (const side of SIDES) for (const loadout of FIGHTS.loadouts) for (const gap of FIGHTS.gaps) conditions.push({ foe, side, loadout, gap });
  return {
    arity: 1, play: { fight: FIGHTS as unknown as Json, opponents: OPPONENTS as unknown as Json }, seconds: FIGHTS.capSeconds, conditions: conditions as unknown as Json[],
    faults: (value, condition, subject) => {
      const { foe, loadout } = condition as BaselineFight, other = MINDS[foe]!;
      return [...fighterFaults(value, loadout, subject ?? {}), ...fighterFaults(other.config as unknown as Json, loadout, other).map((fault) => `${foe}: ${fault}`)];
    },
    world: ([value], condition, engine, [character]) => {
      const { foe, side, loadout, gap } = condition as BaselineFight, other = MINDS[foe]!, foeSide: Side = otherSide(side);
      return { kind: "bout", engine, tape: [], recipe: { level: "open", left: BODY, right: BODY, gap, loadouts: { left: loadout, right: loadout },
        minds: { [side]: value as unknown as MindConfig, [foeSide]: other.config as MindConfig } as Record<Side, MindConfig>, capSeconds: FIGHTS.capSeconds,
        ...sideAttributes({ [side]: character, [foeSide]: other.character }) } };
    },
    read: (built, condition) => {
      const bout = readBout(built as BuiltBout), { side } = condition as BaselineFight, mine = side === "left";
      return { afterStep: () => bout.afterStep(), get ended() { return bout.ended; }, reading: (): BaselineReading => {
        const r = bout.reading();
        return { part: "fight", score: mine ? r.score : 1 - r.score, margin: mine ? r.margin : -r.margin, won: r.winner === side, ending: r.ending, seconds: r.seconds, blows: r.blows };
      } };
    },
  };
};

/** The baseline's protocols, each a competence, in the order one command plays them. */
export const BASELINE_CASES: Readonly<Record<BaselinePart, Cases<Json, BaselineReading, BuiltCase>>> = Object.freeze({
  walk: walkCases(), punch: punchCases(), "stand-up": standUpCases(), fight: fightCases(),
});
