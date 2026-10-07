import { BODY_MODELS, modelInfo, type BodyModel } from "../core/models.ts";

/** Cosmetic choices; supported models are physical bodies, never aliases for these skins. */
export const APPEARANCES = Object.freeze([
  Object.freeze({ id: "default", name: "Original", models: BODY_MODELS, clothing: true }),
  Object.freeze({ id: "industrial", name: "Industrial", models: Object.freeze(["workshop-fighter"] as const), clothing: false }),
  Object.freeze({ id: "relic", name: "Steampunk", models: Object.freeze(["workshop-fighter"] as const), clothing: false }),
  Object.freeze({ id: "duelist", name: "Futuristic", models: Object.freeze(["workshop-fighter"] as const), clothing: false }),
] as const);
export type Appearance = (typeof APPEARANCES)[number]["id"];

/** The appearances whose attachment layout fits this model. */
export function appearancesFor(model: BodyModel): readonly (typeof APPEARANCES)[number][] {
  return APPEARANCES.filter(row => (row.models as readonly BodyModel[]).includes(model));
}

/** Addresses and selectors share one compatibility rule; missing or incompatible choices use the body's own skin. */
export function appearanceFor(model: BodyModel, value: string | null | undefined): Appearance {
  return appearancesFor(model).find(row => row.id === value)?.id ?? "default";
}

/** Whether this appearance can display the human clothing controls. */
export function wearsClothing(model: BodyModel, appearance: Appearance): boolean {
  return modelInfo(model).clothing && APPEARANCES.find(row => row.id === appearanceFor(model, appearance))!.clothing;
}
