import type { AttributeId } from "./attributes.ts";
import type { ChainId } from "./module.ts";

/**
 * The body families, in the order the setup screen offers them.
 *
 * Declared, never inferred. Every module belongs to exactly one family by a row below, and an id
 * with no row throws instead of joining a family by default: a module registered without a row
 * would otherwise land on another family's shelves, in its random draws and its refusal, silently.
 * That is the ternary-with-a-default-branch trap in `AGENTS.md`, and the family used to be exactly
 * that -- anything not on a short human list was stone.
 */
export const BODY_FAMILIES = ["human", "golem", "skeleton"] as const;
export type BodyFamily = (typeof BODY_FAMILIES)[number];

export const isBodyFamily = (value: unknown): value is BodyFamily =>
  typeof value === "string" && (BODY_FAMILIES as readonly string[]).includes(value);

/** What the setup screen's button for each family says. */
export const FAMILY_LABEL: Readonly<Record<BodyFamily, string>> =
  Object.freeze({ human: "Human warrior", golem: "Stone golem", skeleton: "Skeleton" });

/**
 * The stats a family's bodies are built at x1 whatever is asked, and why. Total, so a new family
 * says what it cannot follow.
 *
 * **A human is the size it is.** Its skin is one fitted model (`warrior.glb`) and its arm's lengths
 * are literals in `humanoid/kinematics.ts`, so neither follows a size law (session 12 of the
 * attribute plan set, 2026-09-23). `golemSetupRefusal` refuses a human build at any other size,
 * the corner and hero reducers drop the stat when a body becomes human, and the panels show it
 * fixed with this reason.
 */
export const FAMILY_FIXED_ATTRIBUTES: Readonly<Record<BodyFamily, Readonly<Partial<Record<AttributeId, string>>>>> =
  Object.freeze({
    human: Object.freeze({
      size: "a human's skin is a fixed-size model and its arm's lengths are fixed",
    }),
    golem: Object.freeze({}),
    skeleton: Object.freeze({}),
  });

/** A setting without the stats this family fixes, or the very setting when it fixes none of them. */
export function withoutFixedAttributes<T extends Partial<Record<AttributeId, number>>>(
  setting: T | undefined, family: BodyFamily,
): T | undefined {
  const fixed = Object.keys(FAMILY_FIXED_ATTRIBUTES[family]);
  if (!setting || !fixed.some((id) => id in setting)) return setting;
  const next: Partial<Record<string, number>> = { ...setting };
  for (const id of fixed) delete next[id];
  return next as T;
}

/** The policy a corner is given when a person picks the family's button. */
export const FAMILY_POLICY: Readonly<Record<BodyFamily, string>> =
  Object.freeze({ human: "humanoid-duelist", golem: "golem-duelist", skeleton: "skeleton-duelist" });

/** Each arm chain's family. Total over `ChainId`, so a new chain is a compile error here. */
export const CHAIN_FAMILY = Object.freeze({
  none: "golem", pitch: "golem", reach: "golem", wrist: "golem", anatomical: "human",
  skeletal: "skeleton",
} as const satisfies Record<ChainId, BodyFamily>);

/**
 * Each locomotion, torso and head module's family. `tests/body-family.test.mjs` holds this table
 * and the registry to the same set of ids, in both directions.
 */
export const BODY_MODULE_FAMILY: Readonly<Record<string, BodyFamily>> = Object.freeze({
  "locomotion.biped": "golem", "locomotion.wheel": "golem", "locomotion.multileg": "golem",
  "torso.plain": "golem", "torso.plated": "golem",
  "head.plain": "golem", "head.ram": "golem",
  "locomotion.human": "human", "torso.human": "human", "head.human": "human",
  "locomotion.skeleton": "skeleton", "torso.ribcage": "skeleton", "head.skull": "skeleton",
});

/**
 * The family of a module id, a chain id, or an effector id (`effector.<chain>` or
 * `effector.<chain>.<terminal>`). Throws on an id with no row.
 *
 * `Object.hasOwn` and never a plain index: `table["constructor"]` is `Object.prototype`'s, which
 * would make "constructor" a family's module. `EFFECTOR_CHAINS` in `build.ts` is read the same
 * way for the same reason.
 */
export function moduleFamily(id: string): BodyFamily {
  if (Object.hasOwn(BODY_MODULE_FAMILY, id)) return BODY_MODULE_FAMILY[id];
  const chain = id.startsWith("effector.") ? id.split(".")[1] : id;
  if (Object.hasOwn(CHAIN_FAMILY, chain)) return CHAIN_FAMILY[chain as ChainId];
  throw new Error(`"${id}" belongs to no body family; give it a row in src/golem/family.ts`);
}

/** A setup's family: its own field when it has one, else its locomotion's. */
export function bodyFamily(setup: { family?: BodyFamily; locomotion: string }): BodyFamily {
  return setup.family ?? moduleFamily(setup.locomotion);
}
