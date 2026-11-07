/** Mind construction and entrant manifests, independent of application composition. */
export { controller, NO_POSTURE, type Controller, type MindPreset } from "./catalog/controller.ts";
export type { Mind, MindState, MindConstruction } from "./mind.ts";
export type { MindWiring, MindMade } from "./catalog/controller.ts";
export type { MindDescription, ComponentDescription, ConfigPath } from "./catalog/description.ts";
export type { BodyHost } from "./mind.ts";
export type { Entrant } from "./catalog/entrant.ts";
export { selectSet, type Choice, type Selection, type Chosen } from "./choice.ts";
export type { Decider, Sight } from "./decider.ts";
