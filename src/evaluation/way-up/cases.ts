/**
 * **The way-up drill's falls** (`docs/reference/rising.md#the-way-up-drill`): the stand-up target's
 * falls, every body (`HUMANOID_MODELS`) in every rated loadout (`REPRESENTATIVE`) shoved sixteen ways
 * (`risingJobs`) on the open floor and again beside each obstacle level (`GROUND_LEVELS`: a column,
 * a wall, a tomb, a bench), on the fall bed every mind is felled on (`buildFall`), calm air,
 * Balance 0 and Grit 0, a 30 s cap. Protocol `fresh`: the same shoved halfway between those
 * directions (`FRESH_OFFSET`), the drill's training twin (`Cases.twin`). Protocol `bouts`: falls
 * from bouts, the riser's mind fighting a copy of itself until a side falls (`./bouts.ts`), its
 * twin `bouts-fresh`. The riser is a mind with
 * one way up ranked first (`WayUpValue`); a body that way up does not fit, holding the fall's
 * loadout, is refused.
 */
import type { Loadout } from "../../core/bodies/items/held.ts";
import type { HumanoidModel } from "../../core/bodies/models.ts";
import { isRefused } from "../../core/refusal.ts";
import type { GroundLevel } from "../../game/lab/ground-environment.ts";
import { type GameContext, mindFaults as contextMindFaults } from "../../game/arena/context.ts";
import type { TechniqueName } from "../../skills/recovery/shared/technique.ts";
import { mindOf, seatBody, seatCharacter, type Cases, type Json, type Subject } from "../evaluation.ts";
import { FALL_AFTER, FALL_CAP, fallCases, readFall, type BuiltFall, type FallReading } from "../fall.ts";
import { declaredWaysUp } from "../../minds/option/rise.ts";
import type { OptionMindConfig } from "../../minds/option/config.ts";
import { FRESH_OFFSET, risingJobs } from "../rising.ts";
import type { BuiltBout } from "../bout.ts";
import { BOUT_PLACES, BOUT_SECONDS, boutFallWorld, boutFalls, readBoutFall, TWIN_PLACES, type WayUpBoutCondition } from "./bouts.ts";

/** One of the drill's falls: a body holding a loadout, shoved at `degrees` from +z on a level. */
export type WayUpCondition = {
  readonly model: HumanoidModel; readonly loadout: Loadout; readonly seed: number; readonly start: "shoved"; readonly degrees: number;
  readonly level: GroundLevel; readonly balance: number; readonly grit: number; readonly gusts: boolean; readonly target: boolean; readonly obstacle: boolean;
};

/** Any case of the drill: a shoved fall, or a bout's (`WayUpBoutCondition`). */
export type WayUpCase = WayUpCondition | WayUpBoutCondition;

/** **A way-up subject's value**: the riser's mind, its way up `way` ranked first among its ways up (`wayUpMind`). */
export type WayUpValue = { readonly mind: Json; readonly way: TechniqueName };

/** **What a fall of the drill came to** (`FallReading`), and the way up its riser ranks first, the one it reads: none for a mind that ranks none. */
export type WayUpReading = FallReading & { readonly way: string | null };

/** The drill's falls with their shoves turned by `offset` degrees: the stand-up target's on the open floor, then beside each obstacle (`risingJobs`' `obstacles`). */
const wayUpFalls = (offset: number): WayUpCondition[] => [...risingJobs({ target: true, offset }), ...risingJobs({ obstacles: true, offset })]
  .map(({ model, loadout, seed, degrees, level, balance, grit, gusts, target, obstacle }): WayUpCondition =>
    ({ model: model!, loadout: loadout!, seed, start: "shoved", degrees: degrees!, level: level ?? "open", balance: balance!, grit: grit!, gusts: gusts!,
      target: Boolean(target), obstacle: Boolean(obstacle) }));

export function createWayUpCases(context: GameContext) {
  const mindFaults = contextMindFaults.bind(undefined, context);
  const parts = context.catalog.partLookup;

  /** Why a way-up subject cannot rise on `condition`'s body holding its loadout: its way up does not fit it, or its mind does not. */
  function riserFaults(value: Json, condition: Pick<WayUpCase, "model" | "loadout">, subject?: Subject): readonly string[] {
    const { mind, way } = value as WayUpValue;
    const spec = seatBody(condition.model, condition.loadout, subject), technique = parts.find("technique", { kind: way });
    const unfit = technique ? technique.fits(spec, technique.defaults, parts) : `no way up ${way}`;
    if (unfit) return [`${way} does not fit ${condition.model}: ${unfit}`];
    return mindFaults(mindOf(mind), spec, { entry: [] });
  }

  /** The way up a riser of `config` ranks first: the one a way-up subject reads. */
  const wayOf = (config: unknown): string | null => declaredWaysUp(parts, (config as OptionMindConfig | undefined)?.options ?? [])[0]?.kind ?? null;

  /** `conditions` risen by a way-up subject's mind, refused where the mind or its way up does not fit the body holding the fall's loadout. */
  function wayUpCases(play: Json, conditions: readonly WayUpCondition[]): Cases<WayUpCondition, WayUpReading, BuiltFall> {
    const inner = fallCases(play, conditions);
    return { ...inner,
      faults: (value, condition, subject) => {
        const bed = inner.faults?.((value as WayUpValue).mind, condition, subject) ?? [];
        return bed.length ? bed : riserFaults(value, condition, subject);
      },
      world: (values, condition, engine, seats) => {
        const world = inner.world(values.map((value) => (value as WayUpValue).mind), condition, engine, seats);
        if (isRefused(world)) return world;
        return world.kind === "fall" ? { ...world, fall: { ...world.fall, ...seatCharacter(world.fall.model, seats[0]) } } : world;
      },
      read: (built) => {
        const fall = readFall(built), way = wayOf(built.combatant?.mind);
        return { afterStep: () => fall.afterStep(), get ended() { return fall.ended; }, reading: () => ({ ...fall.reading(), way }) };
      } };
  }

  /** `conditions`, bouts of a way-up subject's mind against itself, refused where the mind or its way up does not fit the body holding the bout's loadout. */
  function boutCases(play: Json, conditions: readonly WayUpBoutCondition[]): Cases<WayUpBoutCondition, WayUpReading, BuiltBout> {
    return { arity: 1, play, conditions, seconds: BOUT_SECONDS,
      faults: (value, condition, subject) => typeof value !== "object" || value === null || Array.isArray(value) ? ["a riser is a way-up subject's value"]
        : riserFaults(value, condition, subject),
      world: ([value], condition, engine, [seat]) => boutFallWorld((value as WayUpValue).mind, condition, engine, seat ?? {}),
      read: (built) => {
        const fall = readBoutFall(context.techniques, built);
        return { afterStep: () => fall.afterStep(), get ended() { return fall.ended; },
          reading: () => { const side = fall.fallen(); return { ...fall.reading(), way: side === null ? null : wayOf(built.duel.duelists[side].mind) }; } };
      } };
  }

  const bouts = { suite: "the way-up drill's falls from bouts", wait: BOUT_SECONDS - FALL_CAP - FALL_AFTER, cap: FALL_CAP, after: FALL_AFTER };
  const WAY_UP_CASES: Readonly<Record<string, Cases<WayUpCase, WayUpReading, BuiltFall | BuiltBout>>> = Object.freeze({
    standard: { ...wayUpCases({ suite: "the way-up drill", cap: FALL_CAP, after: FALL_AFTER }, wayUpFalls(0)), twin: "fresh" },
    fresh: wayUpCases({ suite: "the way-up drill's fresh falls", cap: FALL_CAP, after: FALL_AFTER }, wayUpFalls(FRESH_OFFSET)),
    bouts: { ...boutCases({ ...bouts, places: BOUT_PLACES }, boutFalls(BOUT_PLACES)), twin: "bouts-fresh" },
    "bouts-fresh": boutCases({ ...bouts, places: TWIN_PLACES }, boutFalls(TWIN_PLACES)),
  });

  return { WAY_UP_CASES };
}
