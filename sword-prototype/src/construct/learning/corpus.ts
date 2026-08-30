import { validateControlGraph, type ConstructControlGraph } from "../actions.ts";
import { validateBlueprint, type ConstructBlueprint } from "../blueprint.ts";
import { saveConstruct, type SavedConstruct } from "../codec.ts";
import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "../integrity.ts";
import type { ConstructProgram } from "../program.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../warden.ts";

export type ConstructLearningMorphologyId =
  | "crossbow-standard"
  | "crossbow-heavy-core"
  | "crossbow-three-limb"
  | "sword-standard"
  | "sword-heavy-core"
  | "sword-three-limb";

const aggressiveProgram = (variant: "crossbow" | "sword"): ConstructProgram => {
  const source = wardenProgram(variant);
  return Object.freeze({ ...source, id: `${source.id}-aggressive`,
    rules: Object.freeze(source.rules.filter(({ id }) => id !== "cover")) });
};

const heavyCore = (source: ConstructBlueprint, suffix: string): ConstructBlueprint => validateBlueprint({
  ...source,
  id: `${source.id}-${suffix}`,
  parts: source.parts.map((part) => part.id === source.rootPart
    ? { ...part, massKg: part.massKg * 1.45, centreOfMassM: [0.18, -0.05, 0] }
    : part),
});

const withoutRearRight = (source: ConstructBlueprint): ConstructBlueprint => {
  const prefix = "limb-rear-right-";
  return validateBlueprint({
    ...source,
    id: `${source.id}-three-limb`,
    parts: source.parts.filter(({ id }) => !id.startsWith(prefix)),
    joints: source.joints.filter(({ id }) => !id.startsWith("bearing-rear-right-")),
    sockets: source.sockets.filter(({ id }) => id !== "socket-rear-right-foot"),
    modules: source.modules.filter(({ id }) => id !== "foot-rear-right"),
  });
};

const controlWithoutRearRight = (source: ConstructControlGraph): ConstructControlGraph => validateControlGraph({
  ...source,
  groups: source.groups.map((group) => Object.freeze({
    ...group,
    joints: Object.freeze(group.joints.filter((id) => !id.startsWith("bearing-rear-right-"))),
    modules: Object.freeze(group.modules.filter((id) => id !== "foot-rear-right"),),
    bindings: Object.freeze(Object.fromEntries(Object.entries(group.bindings)
      .filter(([role]) => role !== "rear-right"))),
  })),
});

const saved = (
  id: ConstructLearningMorphologyId,
  variant: "crossbow" | "sword",
  body: "standard" | "heavy" | "three-limb",
  opponentProgram: "standard" | "aggressive",
): SavedConstruct => {
  const baseBlueprint = wardenBlueprint(variant);
  const blueprint = body === "heavy" ? heavyCore(baseBlueprint, "heavy-core")
    : body === "three-limb" ? withoutRearRight(baseBlueprint) : baseBlueprint;
  const baseControl = wardenControl(variant, "assisted");
  const control = body === "three-limb" ? controlWithoutRearRight(baseControl) : baseControl;
  const program = opponentProgram === "aggressive" ? aggressiveProgram(variant) : wardenProgram(variant);
  return saveConstruct(id, blueprint, control, program, WARDEN_SENSORS);
};

const cache = new Map<ConstructLearningMorphologyId, SavedConstruct>();
const materializationOrder: ConstructLearningMorphologyId[] = [];
const definitions: Readonly<Record<ConstructLearningMorphologyId,
  readonly ["crossbow" | "sword", "standard" | "heavy" | "three-limb", "standard" | "aggressive"]>> = Object.freeze({
  "crossbow-standard": ["crossbow", "standard", "standard"],
  "crossbow-heavy-core": ["crossbow", "heavy", "aggressive"],
  "crossbow-three-limb": ["crossbow", "three-limb", "standard"],
  "sword-standard": ["sword", "standard", "aggressive"],
  "sword-heavy-core": ["sword", "heavy", "standard"],
  "sword-three-limb": ["sword", "three-limb", "aggressive"],
});

export type ConstructLearningSplit = keyof typeof CONSTRUCT_LEARNING_SPLIT;

/** Materializes one save only after its owning split has been opened by the stage coordinator. */
export function constructLearningMorphology(id: ConstructLearningMorphologyId, split: ConstructLearningSplit): SavedConstruct {
  if (!(CONSTRUCT_LEARNING_SPLIT[split] as readonly string[]).includes(id)) {
    throw new Error(`construct ${split} stage cannot open sealed morphology "${id}"`);
  }
  const prior = cache.get(id); if (prior) return prior;
  const definition = definitions[id];
  const result = saved(id, ...definition);
  cache.set(id, result);
  materializationOrder.push(id);
  return result;
}

/** Read-only evidence for tests and host diagnostics; computing corpus identity must leave this empty. */
export function constructLearningMaterializationOrder(): readonly ConstructLearningMorphologyId[] {
  return Object.freeze([...materializationOrder]);
}

/**
 * Frozen physical corpus: limb count, mounted weapon, mass distribution and authored
 * opponent program all vary before a learned candidate is selected.
 */
export function constructLearningMorphologies(): Readonly<Record<ConstructLearningMorphologyId, SavedConstruct>> {
  return Object.freeze(Object.fromEntries(Object.keys(definitions).map((id) => {
    const split = (Object.entries(CONSTRUCT_LEARNING_SPLIT)
      .find(([, ids]) => (ids as readonly string[]).includes(id))?.[0]) as ConstructLearningSplit;
    return [id, constructLearningMorphology(id as ConstructLearningMorphologyId, split)];
  }))) as Readonly<Record<ConstructLearningMorphologyId, SavedConstruct>>;
}

export const CONSTRUCT_LEARNING_SPLIT = Object.freeze({
  train: Object.freeze(["crossbow-standard", "crossbow-heavy-core", "crossbow-three-limb", "sword-standard"]),
  validation: Object.freeze(["sword-heavy-core"]),
  test: Object.freeze(["sword-three-limb"]),
} satisfies Readonly<Record<"train" | "validation" | "test", readonly ConstructLearningMorphologyId[]>>);

const baseDefinitionDigests = Object.freeze(Object.fromEntries((["crossbow", "sword"] as const).map((variant) => [
  variant, Object.freeze({
    blueprint: integrityDigest(canonicalIntegrityJson(wardenBlueprint(variant) as unknown as IntegrityValue)),
    control: integrityDigest(canonicalIntegrityJson(wardenControl(variant, "assisted") as unknown as IntegrityValue)),
    program: integrityDigest(canonicalIntegrityJson(wardenProgram(variant) as unknown as IntegrityValue)),
  }),
])));

/**
 * Corpus identity is metadata plus the base asset bytes, not opened SavedConstruct objects.
 * Recipe changes bump recipeVersion; the broad qualification source fingerprint separately
 * refuses a runtime whose recipe implementation moved after qualification.
 */
export const CONSTRUCT_LEARNING_CORPUS_DIGEST = integrityDigest(canonicalIntegrityJson({
  version: 2,
  recipeVersion: 1,
  split: CONSTRUCT_LEARNING_SPLIT,
  definitions,
  baseDefinitionDigests,
} as unknown as IntegrityValue));

export function constructLearningCorpusDigest(): string {
  return CONSTRUCT_LEARNING_CORPUS_DIGEST;
}
