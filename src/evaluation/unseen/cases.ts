/**
 * **The unseen report's cases**: a mind on a character with a loadout no mind is rated on, against
 * the Duellist with sword and buckler on the same character, on each side.
 */
import { LOADOUTS, loadoutKey, type Loadout } from "../../core/items/held.ts";
import { CONTROLLERS, MINDS } from "../../core/mind/controllers.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { BODY_MODELS, modelHolds, modelRefusal, type BodyModel } from "../../core/models.ts";
import { FIGHT_ENTRY } from "../../core/mind/catalog.ts";
import type { Side } from "../../core/spec/body.ts";
import { readBout, type BoutReading } from "../contest.ts";
import type { Cases, Json, Reader } from "../evaluation.ts";
import { TOURNAMENT } from "../tournament/cases.ts";

/** The opponent: the Duellist with sword and buckler, the sword-and-buckler reference. */
const OPPONENT = Object.freeze({ mind: "duellist", loadout: TOURNAMENT.loadouts.find((loadout) => loadoutKey(loadout) === "buckler,sword")! });

/** The tournament's rules on every loadout of the catalogue the tournament does not rate, against `OPPONENT`. */
const UNSEEN = Object.freeze({
  ...TOURNAMENT, loadouts: Object.freeze(LOADOUTS.filter((loadout) => !TOURNAMENT.loadouts.includes(loadout))), opponent: OPPONENT,
});

/** A case's condition: the character both play, the subject's loadout, the gap, m, and the subject's side. */
export type UnseenCondition = { readonly model: BodyModel; readonly loadout: Loadout; readonly gap: number; readonly side: Side };

/** A bout as the subject played it: the bout's reading and the subject's side. */
export type UnseenReading = BoutReading & { readonly side: Side };

const other = (side: Side): Side => side === "left" ? "right" : "left";

/** Whether `value` names a mind's kind. */
const isMind = (value: Json): boolean => typeof value === "object" && value !== null && !Array.isArray(value)
  && typeof (value as { kind?: unknown }).kind === "string" && Object.hasOwn(CONTROLLERS, (value as { kind: string }).kind);

export const UNSEEN_CASES: Readonly<Record<string, Cases<UnseenCondition, UnseenReading>>> = Object.freeze({
  standard: {
    arity: 1,
    play: UNSEEN as unknown as Json,
    conditions: BODY_MODELS.flatMap((model) => UNSEEN.loadouts.flatMap((loadout) => UNSEEN.gaps.flatMap((gap) =>
      (["left", "right"] as const).map((side) => ({ model, loadout, gap, side }))))),
    seconds: UNSEEN.capSeconds,
    faults: (value, { model, loadout }) => {
      if (!isMind(value)) return ["no mind"];
      if (!modelHolds(model) && (loadout.left !== "empty" || loadout.right !== "empty")) return [`${model} holds nothing`];
      const refused = modelRefusal(model, value as unknown as MindConfig, loadout, FIGHT_ENTRY), opposed = modelRefusal(model, MINDS[OPPONENT.mind].config, OPPONENT.loadout, FIGHT_ENTRY);
      if (refused !== null) return [`the mind cannot play ${model} carrying ${loadoutKey(loadout)}: ${refused}`];
      if (opposed !== null) return [`the opponent cannot play ${model}: ${opposed}`];
      return [];
    },
    world: ([mind], { model, loadout, gap, side }, engine) => ({
      kind: "bout", engine, tape: [], recipe: {
        level: UNSEEN.level, left: model, right: model, gap,
        loadouts: { [side]: loadout, [other(side)]: OPPONENT.loadout } as Record<Side, Loadout>,
        minds: { [side]: mind as unknown as MindConfig, [other(side)]: MINDS[OPPONENT.mind].config } as Record<Side, MindConfig>,
        capSeconds: UNSEEN.capSeconds, recoverySeconds: UNSEEN.recoverySeconds,
      },
    }),
    read: (built, { side }): Reader<UnseenReading> => {
      const bout = readBout(built);
      return { afterStep: () => bout.afterStep(), get ended() { return bout.ended; }, reading: () => ({ ...bout.reading(), side }) };
    },
  },
});
