import { getAway } from "./ground/get-away.ts";
import { groundFight } from "./ground/ground-fight.ts";
import { choice, number } from "./fields.ts";
import { standUp } from "./ground/stand-up.ts";
import { TECHNIQUES, type TechniqueName } from "./ground/techniques.ts";
import { graphWork, reachable } from "./ground/graph.ts";
import { commandable, type Body, type BodyView } from "../body.ts";
import { deepFreeze } from "../state.ts";
import { STAND_UP, type SubMindConfig } from "./config.ts";
import { lying } from "./lie.ts";
import type { OwnBody } from "./mind.ts";
import { supportRecovery } from "./rise/support-recovery.ts";
import { researchRise, researchRiseFits } from "./rise/research.ts";
import type { Part } from "./parts.ts";
import type { SubMind } from "./sub-mind.ts";
import type { Clock } from "../clock.ts";

/**
 * What makes a sub-mind for a body: its own body, its host's view of it, read each step before the
 * sub-mind is asked anything, and the world the body is in.
 */
export type SubMindMaker = (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) => SubMind;

/** A sub-mind of no settings and no slots: what it is called, and which bodies it fits. */
const plain = <K extends SubMindConfig["kind"]>(kind: K, label: string, fits: Part["fits"]): Part<Extract<SubMindConfig, { kind: K }>> =>
  deepFreeze({ role: "sub-mind", label, stage: "game", fields: [], slots: [], defaults: { kind } as Extract<SubMindConfig, { kind: K }>, fits, faults: () => [] });

/**
 * **Every sub-mind, by its kind** (`Part`): what a host's slot may hold. Lying still fits any body;
 * a rise is the human's recipe (`RISE`), for a body that takes the commands it gives.
 */
export const SUB_MIND_PARTS: { readonly [K in SubMindConfig["kind"]]: Part<Extract<SubMindConfig, { kind: K }>> } = Object.freeze({
  "stand-up": deepFreeze<Part<Extract<SubMindConfig, { kind: "stand-up" }>>>({ role: "sub-mind", label: "Stand up", stage: "game", fields: [], slots: [],
    defaults: STAND_UP,
    fits: (spec, config) => commandable(spec) && Array.isArray(config.techniques) && config.techniques.every((name: TechniqueName) => TECHNIQUES[name]?.fits(spec)),
    faults: config => {
      if (!Array.isArray(config.techniques)) return ["techniques must be a ranked list"];
      if (config.techniques.some(name => !Object.hasOwn(TECHNIQUES, name))) return ["unknown technique"];
      if (new Set(config.techniques).size !== config.techniques.length) return ["a technique may appear only once"];
      const graph = Object.fromEntries(Object.entries(TECHNIQUES).map(([name, spec]) => [name, { ...spec, admits: () => true }]));
      return (["back", "front"] as const).filter(from => !reachable(config.techniques, from, graph, graphWork())).map(from => `no route to standing from ${from}`);
    },
    reads: config => config.techniques.includes("learned-rise") ? ["learned-rise"] : [] }),
  "get-away": deepFreeze<Part<Extract<SubMindConfig, { kind: "get-away" }>>>({ role: "sub-mind", label: "Get away", stage: "experimental", slots: [],
    fields: [number("metres", "Foe distance", .1, 10, .1, "m")], defaults: { kind: "get-away", metres: 2 }, fits: commandable,
    faults: config => Number.isFinite(config.metres) && config.metres > 0 ? [] : ["distance must be finite and positive"] }),
  "ground-fight": deepFreeze<Part<Extract<SubMindConfig, { kind: "ground-fight" }>>>({ role: "sub-mind", label: "Fight on the ground", stage: "experimental", slots: [],
    fields: [number("reach", "Foe reach", .1, 3, .1, "m"), choice("kicks", "Kicking foot", [["either", "Either"], ["left", "Left"], ["right", "Right"], ["none", "Cover only"]])],
    defaults: { kind: "ground-fight", reach: 1.2, kicks: "either" }, fits: commandable,
    faults: config => [...Number.isFinite(config.reach) && config.reach > 0 ? [] : ["reach must be finite and positive"],
      ...["either", "left", "right", "none"].includes(config.kicks) ? [] : ["unknown kicking foot"]] }),
  lie: plain("lie", "Lie still", () => true),
  "support-recovery": plain("support-recovery", "Rise, then steady", (spec) => commandable(spec)),
  "research-rise": deepFreeze({ role: "sub-mind", label: "Research rise", stage: "experimental", fields: [], slots: [],
    defaults: { kind: "research-rise" }, fits: researchRiseFits, faults: () => [], reads: () => ["research-rise" as const] } as const),
});

/** The sub-mind `config` names. */
export function subMind(own: OwnBody, view: BodyView, config: SubMindConfig, clock: Clock, afterPhysics?: Body["afterPhysics"]): SubMind {
  switch (config.kind) {
    case "get-away": return getAway(own, view, config);
    case "ground-fight": if (!afterPhysics) throw new Error("ground fighting needs completed body observations"); return groundFight(own, view, clock, config, afterPhysics);
    case "stand-up": return standUp(own, view, clock, config);
    case "lie": return lying(own, view);
    case "support-recovery": return supportRecovery(own, view, clock);
    case "research-rise": return researchRise(own, view, clock);
    default: return unknownKind(config);
  }
}

/** `configs`' sub-minds as a body takes them (`BodyOptions.subs`). */
export const subMindsOf = (configs: readonly SubMindConfig[]): readonly SubMindMaker[] =>
  configs.map((config) => (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) => subMind(own, view, config, clock, afterPhysics));

/** A config's kind no maker knows: a compile error where the union is known, and a thrown one for a config read from a save or a link. */
function unknownKind(config: never): never {
  throw new Error(`no sub-mind of kind ${JSON.stringify((config as { kind?: unknown }).kind)}`);
}
