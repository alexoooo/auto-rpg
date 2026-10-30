/**
 * **The Cover drill's cases**: the subject stands and covers (`drill-cover`, in its mind's tactics
 * slot) against a drill opponent striking on its script: rung 0 (`swung`) swinging a club in its
 * right hand (`drill-swing`), rung 1 (`punched`) closing to punch (`drill-punch`), each two seconds
 * striking and one standing, round again. The subject is a Warrior empty-handed, with a club in
 * its right hand, or with a buckler in its left as well; the opponent starts the condition's gap ahead and offset across, the two on the
 * stage's own axis as a bout's spawns are, so the Arena's camera sees them side on. Nothing ends a
 * trial but its seconds. A trial is a bout world, so the Arena plays it as it was scored.
 */
import { CONTROLLERS, MINDS } from "../../core/mind/controllers.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { drilledBy } from "../../core/mind/catalog.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import { loadoutKey, type Loadout } from "../../core/items/held.ts";
import type { BodyModel } from "../../core/models.ts";
import { modelHolding } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { sideAttributes, type Cases, type Json, type Subject } from "../evaluation.ts";
import { readCover, type CoverReading } from "./read.ts";

/** What the subject holds in its right hand: nothing, or a club. */
export type CoverHeld = "empty" | "club";

/** What the subject holds in its left hand, where it holds anything: a buckler. */
export type CoverShield = "buckler";

/**
 * One trial's conditions, range last: the strip's columns (`Evaluation.outcome`). The left hand is
 * named only where it holds something, so an empty-handed or club trial is the one it always was.
 */
export type CoverCondition = { readonly model: BodyModel; readonly held: CoverHeld; readonly left?: CoverShield; readonly across: number; readonly gap: number };

/**
 * A rung: its opponent (a preset, `MINDS`) and what that one holds; the subjects' bodies and what
 * they hold; how far ahead the opponent's centre stands at the start and how far to the side, m;
 * and how long a trial plays, s. A change here is a new protocol.
 */
const SWUNG = deepFreeze({
  opponent: "drill-swing", foe: { left: "empty", right: "club" } as Loadout,
  models: ["workshop-fighter"] as BodyModel[], loadouts: [{ left: "empty", right: "empty" }, { left: "empty", right: "club" }, { left: "buckler", right: "club" }] as Loadout[],
  across: [0, .2], gaps: [1.2, 1.6, 2], seconds: 8,
});
const PUNCHED = deepFreeze({ ...SWUNG, opponent: "drill-punch", foe: { left: "empty", right: "empty" } as Loadout });
type Rung = typeof SWUNG;

/** What the subject holds, as a loadout. */
const loadoutOf = ({ held, left }: Pick<CoverCondition, "held" | "left">): Loadout => ({ left: left ?? "empty", right: held });

/** The subject's mind standing and covering: `mind` with the drill in its tactics' slot. */
export function coverer(mind: MindConfig): MindConfig {
  const drilled = drilledBy(mind, { kind: "drill-cover" });
  if (!drilled) throw new Error(`no drill drives a ${mind.kind} mind`);
  return deepFreeze(drilled);
}

/** Why `value` is no subject, or what keeps its mind from `model` holding `loadout` (`mindFaults`). */
function faultsOf(value: Json, model: BodyModel, loadout: Loadout, subject?: Subject): readonly string[] {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
  if (!drilledBy(value as unknown as MindConfig, { kind: "drill-cover" })) return [`no drill drives a ${kind} mind`];
  return mindFaults(coverer(value as unknown as MindConfig), modelHolding(model, loadout, subject?.character), { entry: [] }).map((fault) => `${model}, ${loadoutKey(loadout)}: ${fault}`);
}

function coverCases(protocol: Rung): Cases<CoverCondition, CoverReading> {
  const conditions: CoverCondition[] = [];
  for (const model of protocol.models) for (const { left, right } of protocol.loadouts) for (const across of protocol.across) for (const gap of protocol.gaps)
    conditions.push({ model, held: right as CoverHeld, ...(left === "empty" ? {} : { left: left as CoverShield }), across, gap });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value, condition, subject) => faultsOf(value, condition.model, loadoutOf(condition), subject),
    world: ([value], condition, engine, [character]) => {
      const { model, across, gap } = condition;
      return { kind: "bout", engine, tape: [],
        // A drill, not a fight: nothing ends it but its reader.
        recipe: { left: model, right: "workshop-fighter", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideAttributes({ left: character }),
          loadouts: { left: loadoutOf(condition), right: protocol.foe },
          // Along +x, as the open stage's spawns are.
          start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, across], heading: -Math.PI / 2 } },
          minds: { left: coverer(value as unknown as MindConfig), right: MINDS[protocol.opponent]!.config as MindConfig } } };
    },
    read: (built) => readCover(built, protocol),
  };
}

/** Every protocol the Cover drill may be played on, by name: its rungs. */
export const COVER_CASES: Readonly<Record<string, Cases<CoverCondition, CoverReading>>> = Object.freeze({ swung: coverCases(SWUNG), punched: coverCases(PUNCHED) });
