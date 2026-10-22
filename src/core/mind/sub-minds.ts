import type { Body, BodyView } from "../body.ts";
import type { Clock } from "../clock.ts";
import { GET_AWAY_PART } from "./ground/get-away-part.ts";
import { GROUND_FIGHT_PART } from "./ground/ground-fight-part.ts";
import { STAND_UP_PART } from "./ground/stand-up-part.ts";
import { LIE_PART } from "./lie-part.ts";
import type { OwnBody } from "./mind.ts";
import { partsByKind, type ConfigOf, type PartConfig } from "./parts.ts";
import { RESEARCH_RISE_PART } from "./rise/research-part.ts";
import { SUPPORT_RECOVERY_PART } from "./rise/support-recovery-part.ts";
import type { SubMind } from "./sub-mind.ts";
import type { SubMindPart } from "./sub-mind-part.ts";

/**
 * What makes a sub-mind for a body: its own body, its host's view of it, read each step before the
 * sub-mind is asked anything, and the world the body is in.
 */
export type SubMindMaker = (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) => SubMind;

/**
 * **Every sub-mind, by its kind** (`SubMindPart`), in the order a picker offers them: what a host's
 * slot may hold. A kind is its own module and a line here.
 */
export const SUB_MIND_PARTS = partsByKind([STAND_UP_PART, GET_AWAY_PART, GROUND_FIGHT_PART, LIE_PART, SUPPORT_RECOVERY_PART, RESEARCH_RISE_PART]);

/** **A sub-mind's config**, by kind (`SUB_MIND_PARTS`): what a host's slot holds, whole, so a sub-mind is configured where it is chosen. */
export type SubMindConfig = ConfigOf<typeof SUB_MIND_PARTS>;

/** The sub-mind `config` names; a thrown error for a kind none has, read from a save or a link. */
export function subMind(own: OwnBody, view: BodyView, config: PartConfig, clock: Clock, afterPhysics?: Body["afterPhysics"]): SubMind {
  const part = Object.hasOwn(SUB_MIND_PARTS, config.kind) ? (SUB_MIND_PARTS as Readonly<Record<string, unknown>>)[config.kind] : undefined;
  if (!part) throw new Error(`no sub-mind of kind ${JSON.stringify(config.kind)}`);
  return (part as SubMindPart).make(own, view, config, clock, afterPhysics);
}

/** `configs`' sub-minds as a body takes them (`BodyOptions.subs`). */
export const subMindsOf = (configs: readonly SubMindConfig[]): readonly SubMindMaker[] =>
  configs.map((config) => (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) => subMind(own, view, config, clock, afterPhysics));
