/**
 * **The Rise drill's cases**: an edge of the staged route (`STAGED_ROUTE`, `staged-edges.ts`) played
 * alone on a body (`technique.ts`), begun once its entry admits the body. Rung `placed`: from each
 * position the edge is begun from, placed there at rest (`groundPlacement`, a seed moving its joints).
 * Rung `moving`: after the edges before it on the route, from the nearest begun lying, placed there
 * at rest, the first edge after a shove from standing: entered as the route hands the body over, at
 * the speeds the edge before leaves it. The Warrior on toes, six seeds, empty-handed and holding
 * the buckler and the club (`ARMS`): no edge is worked on flat feet, and the Rogue joins once its
 * stance is measured on toes.
 */
import type { TechniqueName } from "../../core/mind/ground/technique.ts";
import { TECHNIQUES } from "../../core/mind/ground/techniques.ts";
import type { HumanoidModel } from "../../core/models.ts";
import type { Held } from "../../core/items/held.ts";
import type { GROUND_POSTURES } from "../../lab/ground-starts.ts";
import type { Cases, Json } from "../evaluation.ts";
import { readTechnique, techniquePlacement, TECHNIQUE_LIMITS, type BuiltTechnique, type TechniqueCase, type TechniqueReading } from "../technique.ts";

/** An edge drilled, by its technique; the edge before it on the route, none for the first. */
export const EDGES: Readonly<Record<string, TechniqueName | null>> = Object.freeze({
  "staged-roll": null, "staged-down": "staged-roll", "staged-kneel-up": "staged-down", "staged-step-through": "staged-kneel-up", "staged-lunge": "staged-step-through",
  "sit-back": "staged-down", "front-sit-back": "staged-roll",
});
/** The edges drilled, in route order. */
export const DRILLED: readonly TechniqueName[] = Object.freeze(Object.keys(EDGES) as TechniqueName[]);

type Posture = (typeof GROUND_POSTURES)[number];
/** A placed trial: the body, what its right hand holds and its left (empty where it names none), its start's posture and seed. */
export type PlacedCondition = { readonly model: HumanoidModel; readonly held: Held; readonly left?: Held; readonly posture: Posture; readonly seed: number };
/** A trial after the edge before: the body, what its hands hold, and the seed of that edge's start. */
export type MovingCondition = { readonly model: HumanoidModel; readonly held: Held; readonly left?: Held; readonly seed: number };
export type RiseCondition = PlacedCondition | MovingCondition;

const MODELS: readonly HumanoidModel[] = ["workshop-fighter"];
/** What the hands hold: nothing, and the buckler in the left with the club in the right. */
const ARMS: readonly { readonly held: Held; readonly left?: Held }[] = [{ held: "empty" }, { held: "club", left: "buckler" }];
const SEEDS = [1, 2, 3, 4, 5, 6];
/** The positions the staged edges are begun from, as placed starts. */
const POSTURES: readonly Posture[] = ["back", "left", "right", "front", "fours", "kneeling", "half-kneel"];

/** The technique an edge subject names, or why its value is none. */
const edgeOf = (value: Json): TechniqueName | string => {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  return typeof kind === "string" && Object.hasOwn(EDGES, kind) ? kind as TechniqueName : `an edge is one of ${DRILLED.join(", ")}`;
};
const isEdge = (edge: string): edge is TechniqueName => Object.hasOwn(EDGES, edge);
/** The positions `edge` is begun from. */
const fromOf = (edge: TechniqueName): readonly string[] => TECHNIQUES[edge].edges.map((one) => one.from);
/** The positions lying on the ground. */
const LYING: readonly string[] = ["back", "left", "right", "front"];

/**
 * The case an edge plays: placed, from the condition's posture; moving, the route's edges up to it
 * from the edge before it back to the nearest begun lying, placed in a position that one is begun
 * from (by the seed); for the first edge, standing and shoved toward one of six directions by the seed.
 */
export function riseCase(edge: TechniqueName, condition: RiseCondition): TechniqueCase {
  const body = { model: condition.model, held: condition.held, ...(condition.left ? { left: condition.left } : {}), seed: condition.seed };
  if ("posture" in condition) return { ...body, start: { kind: "placed", posture: condition.posture }, chain: [edge] };
  if (EDGES[edge] === null) return { ...body, start: { kind: "shoved", degrees: (condition.seed - 1) * 60 }, chain: [edge] };
  const chain: TechniqueName[] = [edge];
  for (let before: TechniqueName | null | undefined = EDGES[edge]; before !== null && before !== undefined; before = EDGES[before]) {
    chain.unshift(before);
    if (fromOf(before).some((from) => LYING.includes(from))) break;
  }
  const from = fromOf(chain[0]!);
  return { ...body, start: { kind: "placed", posture: from[(condition.seed - 1) % from.length] as Posture }, chain };
}

const play = (rung: string): Json => ({ drill: "rise", rung, limits: TECHNIQUE_LIMITS as unknown as Json });
/** The longest case: the route's every edge in turn. */
const seconds = TECHNIQUE_LIMITS.admit * (DRILLED.length + 1) + TECHNIQUE_LIMITS.run * DRILLED.length + TECHNIQUE_LIMITS.stood + TECHNIQUE_LIMITS.rest + 2;

/** The drill's rungs. A case whose start no seed's draw places clear is refused before it plays. */
export const RISE_CASES: Readonly<Record<"placed" | "moving", Cases<RiseCondition, TechniqueReading & Json, BuiltTechnique>>> = Object.freeze({
  placed: {
    arity: 1, play: play("placed"), engine: "rapier", seconds,
    conditions: ARMS.flatMap((arms) => MODELS.flatMap((model) => POSTURES.flatMap((posture) => SEEDS.map((seed): PlacedCondition => ({ model, ...arms, posture, seed }))))),
    faults(value, condition) {
      const edge = edgeOf(value);
      if (!isEdge(edge)) return [edge];
      if (!("posture" in condition) || !fromOf(edge).includes(condition.posture)) return [`${edge} is not begun from ${"posture" in condition ? condition.posture : "a moving start"}`];
      const placed = techniquePlacement(riseCase(edge, condition));
      return "refused" in placed ? [placed.refused] : [];
    },
    world: ([value], condition, engine) => ({ kind: "technique", engine, technique: riseCase(edgeOf(value!) as TechniqueName, condition) }),
    read: (built) => readTechnique(built),
  },
  moving: {
    arity: 1, play: play("moving"), engine: "rapier", seconds,
    conditions: ARMS.flatMap((arms) => MODELS.flatMap((model) => SEEDS.map((seed): MovingCondition => ({ model, ...arms, seed })))),
    faults(value, condition) {
      const edge = edgeOf(value);
      if (!isEdge(edge)) return [edge];
      const placed = techniquePlacement(riseCase(edge, condition));
      return "refused" in placed ? [placed.refused] : [];
    },
    world: ([value], condition, engine) => ({ kind: "technique", engine, technique: riseCase(edgeOf(value!) as TechniqueName, condition) }),
    read: (built) => readTechnique(built),
  },
});
