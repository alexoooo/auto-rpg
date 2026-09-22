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
export const BODY_FAMILIES = ["human", "golem"] as const;
export type BodyFamily = (typeof BODY_FAMILIES)[number];

export const isBodyFamily = (value: unknown): value is BodyFamily =>
  typeof value === "string" && (BODY_FAMILIES as readonly string[]).includes(value);

/** What the setup screen's button for each family says. */
export const FAMILY_LABEL: Readonly<Record<BodyFamily, string>> =
  Object.freeze({ human: "Human warrior", golem: "Stone golem" });

/** The policy a corner is given when a person picks the family's button. */
export const FAMILY_POLICY: Readonly<Record<BodyFamily, string>> =
  Object.freeze({ human: "humanoid-duelist", golem: "golem-duelist" });

/** Each arm chain's family. Total over `ChainId`, so a new chain is a compile error here. */
export const CHAIN_FAMILY = Object.freeze({
  none: "golem", pitch: "golem", reach: "golem", wrist: "golem", anatomical: "human",
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
