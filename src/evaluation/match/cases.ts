/**
 * **The standard match's cases**: two minds over one fixed set of arena bouts, each mind on each
 * side. Bouts are the same to the bit on every machine (`docs/reference/real-functions.md`).
 */
import { CAP_SECONDS, SIDES } from "../../arena/duel.ts";
import type { ArenaLevel } from "../../arena/levels.ts";
import { EMPTY_LOADOUT, REPRESENTATIVE, loadoutKey, type Loadout } from "../../core/items/held.ts";
import { CONTROLLERS } from "../../core/mind/controllers.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { modelHolding, type BodyModel } from "../../core/models.ts";
import type { Side } from "../../core/spec/body.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { FIGHT_ENTRY } from "../../core/mind/catalog.ts";
import { readBout, type BoutReading } from "../contest.ts";
import { sideAttributes, type Cases, type Json, type Subject } from "../evaluation.ts";

/**
 * What a match plays: each body a mind may have against each the other may have, each loadout, and
 * each level at each of its starting gaps, by the arena's rules as its page plays them (the game's
 * end rules, its cap). The standard plays the representative loadouts (`REPRESENTATIVE`) on the
 * open stage. A change here is a new protocol: its cases' keys change.
 */
const MATCH = Object.freeze({
  levels: Object.freeze([Object.freeze({ level: "open" as ArenaLevel, gaps: Object.freeze([3, 4, 5]) })]),
  bodies: Object.freeze(["workshop-fighter", "workshop-rogue"] as BodyModel[]),
  loadouts: REPRESENTATIVE,
  capSeconds: CAP_SECONDS,
});

/** Sword and buckler on both levels, the court round its columns at its nearer and farther gaps. */
const SWORD_AND_BUCKLER = Object.freeze({ ...MATCH,
  levels: Object.freeze([Object.freeze({ level: "open" as ArenaLevel, gaps: Object.freeze([3, 4.5]) }), Object.freeze({ level: "obstacle-court" as ArenaLevel, gaps: Object.freeze([4, 6]) })]),
  loadouts: Object.freeze(REPRESENTATIVE.filter((loadout) => loadoutKey(loadout) === "buckler,sword")),
});

/** Empty-handed Skeletons on the open stage, each mind on each side of every gap. */
const SKELETON_UNARMED = Object.freeze({ ...MATCH,
  bodies: Object.freeze(["crypt-skeleton"] as BodyModel[]), loadouts: Object.freeze([EMPTY_LOADOUT]),
});

type Protocol = typeof MATCH;

/** One bout's conditions: the left's body, the right's, both sides' loadout, the level and the gap, m. */
export type MatchCondition = { readonly left: BodyModel; readonly right: BodyModel; readonly loadout: Loadout; readonly level: ArenaLevel; readonly gap: number };

/** Both minds occupy both bodies in a complete pair; each body must fit and allow its named calibration. */
function faultsOf(value: Json, condition: MatchCondition, subject?: Subject): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  const { loadout } = condition;
  return [...new Set([condition.left, condition.right])].flatMap((body) => !presetFitsModel(subject ?? {}, body)
    ? [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${body} is unavailable`]
    : mindFaults(value as unknown as MindConfig, modelHolding(body, loadout, subject?.character), { entry: FIGHT_ENTRY }).map((fault) => `${body} carrying ${loadoutKey(loadout)}: ${fault}`));
}

/** The match on `protocol`: its conditions in the order each left body, right body, loadout, level, gap. */
function matchCases(protocol: Protocol): Cases<MatchCondition, BoutReading> {
  const conditions: MatchCondition[] = [];
  for (const left of protocol.bodies) for (const right of protocol.bodies) for (const loadout of protocol.loadouts)
    for (const { level, gaps } of protocol.levels) for (const gap of gaps) conditions.push({ left, right, loadout, level, gap });
  return {
    arity: 2,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.capSeconds,
    faults: faultsOf,
    world: (values, { left, right, loadout, level, gap }, engine, characters) => ({
      kind: "bout", engine, tape: [],
      recipe: { level, left, right, gap, loadouts: { left: loadout, right: loadout },
        minds: Object.fromEntries(SIDES.map((side, k) => [side, values[k] as unknown as MindConfig])) as Record<Side, MindConfig>,
        capSeconds: protocol.capSeconds, ...sideAttributes({ left: characters[0], right: characters[1] }) },
    }),
    read: readBout,
  };
}

/** Every protocol a match may be played on, by name. */
export const MATCH_CASES: Readonly<Record<string, Cases<MatchCondition, BoutReading>>> = Object.freeze({
  standard: matchCases(MATCH), "sword-and-buckler": matchCases(SWORD_AND_BUCKLER), "skeleton-unarmed": matchCases(SKELETON_UNARMED),
});
