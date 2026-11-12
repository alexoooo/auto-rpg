import { mindOf } from "../evaluation.ts";
import type { Cases, Json } from "../evaluation.ts";
import { OPEN_FLOOR, type BuiltLone } from "../lone.ts";
import type { GameContext } from "../../game/arena/context.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import { DEFAULT_ENGINE } from "../../core/physics/engines.ts";
import { deepFreeze } from "../../core/state.ts";
import { createLocomotionCases } from "../locomotion/cases.ts";
import { TRAVEL, travelScript, type TravelCondition, type TravelMode } from "./protocol.ts";
import { readTravel, type TravelReading } from "./read.ts";
import { later, turned } from "../twin.ts";

/**
 * Minimum capability cases; confirmation reserves intermediate directions and starting headings.
 * Both run forward from a walk, and to a place by a route with a corner and to a goal moved while
 * the body runs, to each side, as the game's commanders order.
 * The confirmation's training twin (`twin`, `src/evaluation/twin.ts`) is the confirmation's
 * trials on the next four seeds, its starting headings and its ways turned halfway between the
 * confirmation's: research's to tune on, the confirmation held out.
 */
function conditions({ confirmation, twin = false }: { readonly confirmation: boolean; readonly twin?: boolean }): TravelCondition[] {
  const seeds = [1, 2, 3, 4], count = confirmation ? 16 : 8;
  return REPRESENTATIVE.flatMap(loadout => [false, true].flatMap(gusts => (twin ? later(seeds) : seeds).flatMap((seed, k) => {
    const heading = k * Math.PI / 2 + (confirmation ? Math.PI / 8 : 0) + (twin ? Math.PI / 4 : 0);
    const base = { model: "workshop-fighter" as const, loadout, gusts, seed, heading };
    const rows: TravelCondition[] = [];
    const add = (mode: TravelMode, way = 0, sense: 1 | -1 = 1) => rows.push({ ...base, mode, way, sense,
      pace: mode === "circle" ? TRAVEL.circleSpeed : mode === "facing" && way !== 0 ? TRAVEL.directional : TRAVEL.forward });
    add("forward");
    add("walking");
    const ways = Array.from({ length: count }, (_, k) => k * 360 / count);
    for (const way of twin ? turned(ways) : ways) { add("heading", way); add("facing", way); }
    for (const sense of [-1, 1] as const) { add("circle", 0, sense); add("corner", 0, sense); add("reverse", 0, sense); add("route", 0, sense); add("moved", 0, sense); }
    return rows;
  })));
}

export function createTravelCases(context: GameContext) {
  const admission = createLocomotionCases(context).LOCOMOTION_CASES.run!;
  const protocol = ({ confirmation, twin = false }: { readonly confirmation: boolean; readonly twin?: boolean }): Cases<TravelCondition, TravelReading, BuiltLone> => {
    const cases = conditions({ confirmation, twin });
    return { arity: 1, engine: DEFAULT_ENGINE, play: { target: TRAVEL, confirmation, ...(twin ? { twin } : {}) } as unknown as Json,
      conditions: cases, seconds: Math.max(...cases.map(c => travelScript(c).end)),
      faults: (value, c, subject) => admission.faults?.(value, { kind: "run", model: c.model }, subject) ?? [],
      world: ([mind], c, engine, [character]) => ({ kind: "lone", engine, lone: {
        model: c.model, mind: mindOf(mind), loadout: c.loadout, balance: 0, floorSize: OPEN_FLOOR,
        heading: c.heading, seed: c.seed, script: travelScript(c).cues,
        ...(character && Object.keys(character).length ? { character } : {}), ...(c.gusts ? { gusts: true as const } : {}),
      } }), read: readTravel };
  };
  return { TRAVEL_CASES: deepFreeze({ minimum: protocol({ confirmation: false }), confirmation: { ...protocol({ confirmation: true }), twin: "confirmation-twin" },
    "confirmation-twin": protocol({ confirmation: true, twin: true }) }) };
}
