import type { Cases, Json } from "../evaluation.ts";
import type { BuiltLone } from "../lone.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import type { GameContext } from "../../game/arena/context.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import { DEFAULT_ENGINE } from "../../core/physics/engines.ts";
import { deepFreeze } from "../../core/state.ts";
import { createLocomotionCases } from "../locomotion/cases.ts";
import { TRAVEL, travelScript, type TravelCondition, type TravelMode } from "./protocol.ts";
import { readTravel, type TravelReading } from "./read.ts";

/** Minimum capability cases; confirmation reserves intermediate directions and starting headings. */
function conditions({ confirmation }: { readonly confirmation: boolean }): TravelCondition[] {
  return REPRESENTATIVE.flatMap(loadout => [false, true].flatMap(gusts => [1, 2, 3, 4].flatMap(seed => {
    const heading = (seed - 1) * Math.PI / 2 + (confirmation ? Math.PI / 8 : 0);
    const base = { model: "workshop-fighter" as const, loadout, gusts, seed, heading };
    const rows: TravelCondition[] = [];
    const add = (mode: TravelMode, way = 0, sense: 1 | -1 = 1) => rows.push({ ...base, mode, way, sense,
      pace: mode === "circle" ? TRAVEL.circleSpeed : mode === "facing" && way !== 0 ? TRAVEL.directional : TRAVEL.forward });
    add("forward");
    const count = confirmation ? 16 : 8;
    for (let k = 0; k < count; k++) { add("heading", k * 360 / count); add("facing", k * 360 / count); }
    for (const sense of [-1, 1] as const) { add("circle", 0, sense); add("corner", 0, sense); add("reverse", 0, sense); }
    return rows;
  })));
}

export function createTravelCases(context: GameContext) {
  const admission = createLocomotionCases(context).LOCOMOTION_CASES.run!;
  const protocol = ({ confirmation }: { readonly confirmation: boolean }): Cases<TravelCondition, TravelReading, BuiltLone> => {
    const cases = conditions({ confirmation });
    return { arity: 1, engine: DEFAULT_ENGINE, play: { target: TRAVEL, confirmation } as unknown as Json,
      conditions: cases, seconds: Math.max(...cases.map(c => travelScript(c).end)),
      faults: (value, c, subject) => admission.faults?.(value, { kind: "run", model: c.model }, subject) ?? [],
      world: ([mind], c, engine, [character]) => ({ kind: "lone", engine, lone: {
        model: c.model, mind: mind as unknown as MindConfig, loadout: c.loadout, balance: 0, floorSize: 400,
        heading: c.heading, seed: c.seed, script: travelScript(c).cues,
        ...(character && Object.keys(character).length ? { character } : {}), ...(c.gusts ? { gusts: true as const } : {}),
      } }), read: readTravel };
  };
  return { TRAVEL_CASES: deepFreeze({ minimum: protocol({ confirmation: false }), confirmation: protocol({ confirmation: true }) }) };
}
