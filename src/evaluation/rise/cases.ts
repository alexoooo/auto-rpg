/**
 * **The Rise drill's cases**: an edge of the game's Stand up (`STAND_UP`, `stand-up.ts`) played
 * alone on a body (`technique.ts`), begun once its entry admits the body. Rung `placed`: from each
 * position the edge is begun from, placed there at rest (`groundPlacement`, a seed moving its joints).
 * Rung `moving`: after the edges before it on the route, from the nearest begun lying, placed there
 * at rest, the first edge after a shove from standing: entered as the route hands the body over, at
 * the speeds the edge before leaves it. Six seeds. A rung's own protocol plays the Warrior
 * empty-handed and holding the buckler and the club (`OWN`); its `-bodies` protocol plays every
 * other body and loadout a stand-up is read on (`OTHERS`), its trials otherwise the same. An edge's
 * cases are those on a body it fits.
 */
import type { TechniqueName } from "../../skills/recovery/technique.ts";
import { HUMANOID_MODELS, modelSpec, type HumanoidModel } from "../../core/bodies/models.ts";
import { withLoadout } from "../../core/bodies/items/held.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import type { Held } from "../../core/bodies/items/held.ts";
import type { GROUND_POSTURES } from "../../game/lab/ground-starts.ts";
import type { Cases, Json } from "../evaluation.ts";
import { readTechnique, techniquePlacement, TECHNIQUE_LIMITS, type BuiltTechnique, type TechniqueCase, type TechniqueReading } from "../technique.ts";
import { type GameContext } from "../../game/arena/context.ts";

/** An edge drilled, by its technique; the edge before it on the route, none for the first. */
export const EDGES: Readonly<Record<string, TechniqueName | null>> = Object.freeze({
  "staged-roll": null, "staged-down": "staged-roll", "sit-back": "staged-down", "front-sit-back": "staged-roll",
});

/** The edges drilled, in route order. */
export const DRILLED: readonly TechniqueName[] = Object.freeze(Object.keys(EDGES) as TechniqueName[]);

type Posture = (typeof GROUND_POSTURES)[number];

/** A placed trial: the body, what its right hand holds and its left (empty where it names none), its start's posture and seed. */
type PlacedCondition = { readonly model: HumanoidModel; readonly held: Held; readonly left?: Held; readonly posture: Posture; readonly seed: number };

/** A trial after the edge before: the body, what its hands hold, and the seed of that edge's start. */
type MovingCondition = { readonly model: HumanoidModel; readonly held: Held; readonly left?: Held; readonly seed: number };

export type RiseCondition = PlacedCondition | MovingCondition;

/** A body and what its hands hold: its right's, and its left's where that is not empty. */
type Carrier = { readonly model: HumanoidModel; readonly held: Held; readonly left?: Held };

/** What a rung's own protocol plays: the Warrior with nothing in its hands, and with the buckler in the left and the club in the right. */
const OWN: readonly Carrier[] = [{ model: "man", held: "empty" }, { model: "man", held: "club", left: "buckler" }];

const same = (a: Carrier, b: Carrier): boolean => a.model === b.model && a.held === b.held && (a.left ?? "empty") === (b.left ?? "empty");

/** What a rung's `-bodies` protocol plays: every humanoid body holding every loadout minds are rated on (`REPRESENTATIVE`), but its own protocol's. */
const OTHERS: readonly Carrier[] = HUMANOID_MODELS.flatMap((model) => REPRESENTATIVE.map((loadout): Carrier =>
  ({ model, held: loadout.right, ...(loadout.left === "empty" ? {} : { left: loadout.left }) }))).filter((one) => !OWN.some((own) => same(own, one)));

const SEEDS = [1, 2, 3, 4, 5, 6];

/** The positions the edges are begun from, as placed starts. */
const POSTURES: readonly Posture[] = ["back", "left", "right", "front", "fours"];

/** The technique an edge subject names, or why its value is none. */
const edgeOf = (value: Json): TechniqueName | string => {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  return typeof kind === "string" && Object.hasOwn(EDGES, kind) ? kind as TechniqueName : `an edge is one of ${DRILLED.join(", ")}`;
};

const isEdge = (edge: string): edge is TechniqueName => Object.hasOwn(EDGES, edge);

/** The positions lying on the ground. */
const LYING: readonly string[] = ["back", "left", "right", "front"];

const play = (rung: string): Json => ({ drill: "rise", rung, limits: TECHNIQUE_LIMITS as unknown as Json });

/** The longest case: the route's every edge in turn. */
const seconds = TECHNIQUE_LIMITS.admit * (DRILLED.length + 1) + TECHNIQUE_LIMITS.run * DRILLED.length + TECHNIQUE_LIMITS.stood + TECHNIQUE_LIMITS.rest + 2;

export function createRiseCases(context: GameContext) {
  const TECHNIQUES = context.techniques;

  /** Why `edge` is no technique of the body a condition names, a sentence (`Part.fits`); null where it fits. */
  const unfit = (edge: TechniqueName, condition: RiseCondition): string | null =>
    TECHNIQUES[edge].fits(withLoadout(modelSpec(condition.model), { left: condition.left ?? "empty", right: condition.held }), TECHNIQUES[edge].defaults, context.catalog.partLookup);

  /** The positions `edge` is begun from. */
  const fromOf = (edge: TechniqueName): readonly string[] => TECHNIQUES[edge].edges.map((one) => one.from);

  /**
   * The case an edge plays: placed, from the condition's posture; moving, the route's edges up to it
   * from the edge before it back to the nearest begun lying, placed in a position that one is begun
   * from (by the seed); for the first edge, standing and shoved toward one of six directions by the seed.
   */
  function riseCase(edge: TechniqueName, condition: RiseCondition): TechniqueCase {
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

  type RiseCases = Cases<RiseCondition, TechniqueReading & Json, BuiltTechnique>;

  /** Rung `placed` on `carriers`. */
  const placed = (carriers: readonly Carrier[]): RiseCases => ({
    arity: 1, play: play("placed"), seconds,
    conditions: carriers.flatMap((carrier) => POSTURES.flatMap((posture) => SEEDS.map((seed): PlacedCondition => ({ ...carrier, posture, seed })))),
    faults(value, condition) {
      const edge = edgeOf(value);
      if (!isEdge(edge)) return [edge];
      if (!("posture" in condition) || !fromOf(edge).includes(condition.posture)) return [`${edge} is not begun from ${"posture" in condition ? condition.posture : "a moving start"}`];
      const refused = unfit(edge, condition);
      if (refused) return [refused];
      const placed = techniquePlacement(riseCase(edge, condition));
      return "refused" in placed ? [placed.refused] : [];
    },
    world: ([value], condition, engine) => ({ kind: "technique", engine, technique: riseCase(edgeOf(value!) as TechniqueName, condition) }),
    read: (built) => readTechnique(built),
  });

  /** Rung `moving` on `carriers`. */
  const moving = (carriers: readonly Carrier[]): RiseCases => ({
    arity: 1, play: play("moving"), seconds,
    conditions: carriers.flatMap((carrier) => SEEDS.map((seed): MovingCondition => ({ ...carrier, seed }))),
    faults(value, condition) {
      const edge = edgeOf(value);
      if (!isEdge(edge)) return [edge];
      const refused = unfit(edge, condition);
      if (refused) return [refused];
      const placed = techniquePlacement(riseCase(edge, condition));
      return "refused" in placed ? [placed.refused] : [];
    },
    world: ([value], condition, engine) => ({ kind: "technique", engine, technique: riseCase(edgeOf(value!) as TechniqueName, condition) }),
    read: (built) => readTechnique(built),
  });

  /** The drill's rungs, each on its own bodies and on the others (`-bodies`). A case whose start no seed's draw places clear is refused before it plays. */
  const RISE_CASES: Readonly<Record<"placed" | "moving" | "placed-bodies" | "moving-bodies", RiseCases>> = Object.freeze({
    placed: placed(OWN), moving: moving(OWN), "placed-bodies": placed(OTHERS), "moving-bodies": moving(OTHERS),
  });

  return { RISE_CASES };
}
