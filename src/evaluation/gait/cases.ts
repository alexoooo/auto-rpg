/**
 * **The Gait drill's cases**: the subject's mind, led by the drill Commander, goes at a still target
 * by a gait at a speed, stops where its strike's window would admit it, and strikes; how
 * long the gait left it unbraced, and whether it fell. The subject's body is the Warrior, its hands
 * empty, the strike its mind's first thrown standing, at the middle mark with each hand; the target
 * a Warrior standing in guard (`drill-stand`), set the protocol's gap ahead on the stage's own axis
 * as a bout's spawns are. Nothing ends a trial but its reader. A trial is a bout world, so the Arena
 * plays it as it was scored.
 */
import type { MindConfig } from "../../core/mind/config.ts";
import { treeObeys } from "../../entrants/game.ts";
import type { DrillCommanderConfig } from "../../core/command/drill.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import { modelHolding, type BodyModel } from "../../core/models.ts";
import { GAIT_NAMES, type GaitName } from "../../core/skills/locomotion/gaits.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { sideAttributes, type Cases, type Json, type Subject } from "../evaluation.ts";
import { readGait, type GaitReading } from "./read.ts";
import { DRILL_OPPONENTS } from "../drill-opponents.ts";

/** A hand the strike is thrown with. */
type GaitHand = "left" | "right";

/** One trial's conditions: the strip's columns (`Evaluation.outcome`). */
export type GaitCondition = { readonly model: BodyModel; readonly gait: GaitName; readonly speed: number; readonly hand: GaitHand };

/**
 * The protocol: the subjects' bodies; the gaits and the speeds each is asked to go at, m/s, a
 * ceiling under what it holds; the hands; how far ahead the target stands, m, far enough for the
 * fastest to come up to its speed; how long a trial plays, and how long it runs on once the action
 * has ended, for a fall it brings about, s. A change here is a new protocol.
 */
const GAITS_ASKED = deepFreeze({
  models: ["workshop-fighter"] as BodyModel[],
  gaits: [...GAIT_NAMES] as GaitName[],
  speeds: [.5, 1, 1.5, 2.5, 3.5],
  hands: ["left", "right"] as GaitHand[],
  gap: 5, seconds: 16, settle: .5,
});

/** The first action `mind` throws standing, by name; null where it has none. */
function actionOf(mind: MindConfig): string | null {
  const actions = (mind as { readonly actions?: readonly { readonly name: string; readonly lower?: unknown }[] }).actions ?? [];
  return actions.find((action) => action.lower === undefined)?.name ?? null;
}

/**
 * The subject's side going by `gait` at `speed`, stopping and striking with `hand`: `mind` as given,
 * led by the drill Commander, which goes at the foe at `speed` (`going`), walks back into the
 * window by the gait no faster, and orders the strike the first step it is ready (`walking`).
 */
function goer(mind: MindConfig, gait: GaitName, speed: number, hand: GaitHand): { readonly mind: MindConfig; readonly commander: DrillCommanderConfig } {
  const action = actionOf(mind);
  if (action === null) throw new Error(`a ${mind.kind} mind throws nothing standing`);
  const commander: DrillCommanderConfig = { kind: "drill", action, limb: `hand.${hand}`, region: { kind: "mark", mark: "middle" }, after: 0, going: speed, pace: speed, walking: true, gait };
  return deepFreeze({ mind, commander });
}

/** Why `value` is no subject, or what keeps its mind from `model` with empty hands (`mindFaults`). */
function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
  const mind = value as unknown as MindConfig | null;
  if (!mind || typeof mind !== "object" || !treeObeys(mind)) return ["a subject is a mind that carries out orders, which a drill leads by"];
  if (actionOf(mind) === null) return ["a subject's mind throws a strike standing"];
  if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
  return mindFaults(mind, modelHolding(model, { left: "empty", right: "empty" }, subject?.character), { entry: [] }).map((fault) => `${model}: ${fault}`);
}

function gaitCases(protocol: typeof GAITS_ASKED): Cases<GaitCondition, GaitReading> {
  const conditions: GaitCondition[] = [];
  for (const model of protocol.models) for (const gait of protocol.gaits) for (const speed of protocol.speeds) for (const hand of protocol.hands)
    conditions.push({ model, gait, speed, hand });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([value], { model, gait, speed, hand }, engine, [character]) => {
      const going = goer(value as unknown as MindConfig, gait, speed, hand);
      return { kind: "bout", engine, tape: [],
      // A drill, not a fight: nothing ends it but its reader.
      recipe: { left: model, right: "workshop-fighter", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideAttributes({ left: character }),
        // Along +x, as the open stage's spawns are.
        start: { left: { at: [-protocol.gap / 2, 0], heading: Math.PI / 2 }, right: { at: [protocol.gap / 2, 0], heading: -Math.PI / 2 } },
        minds: { left: going.mind, right: DRILL_OPPONENTS["drill-stand"]!.config as MindConfig }, commanders: { left: going.commander } } };
    },
    read: (built) => readGait(built, protocol),
  };
}

/** Every protocol the Gait drill may be played on, by name. */
export const GAIT_CASES: Readonly<Record<string, Cases<GaitCondition, GaitReading>>> = Object.freeze({ stopped: gaitCases(GAITS_ASKED) });
