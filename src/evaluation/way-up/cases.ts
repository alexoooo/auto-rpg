/**
 * **The way-up drill's falls** (`docs/reference/rising.md#the-way-up-drill`): the stand-up target's
 * falls, every body (`HUMANOID_MODELS`) in every rated loadout (`REPRESENTATIVE`) shoved sixteen ways
 * (`risingJobs`) on the open floor and again beside each obstacle level (`GROUND_LEVELS`: a column,
 * a wall, a tomb, a bench), on the fall bed every mind is felled on (`buildFall`), calm air,
 * Balance 0 and Grit 0, a 30 s cap. Protocol `fresh`: the same shoved halfway between those
 * directions (`FRESH_OFFSET`), the drill's training twin (`Cases.twin`). The riser is a mind with
 * one way up ranked first (`WayUpValue`); a body that way up does not fit, holding the fall's
 * loadout, is refused.
 */
import type { Loadout } from "../../core/bodies/items/held.ts";
import { modelHolding, type HumanoidModel } from "../../core/bodies/models.ts";
import { isRefused } from "../../core/refusal.ts";
import type { GroundLevel } from "../../game/lab/ground-environment.ts";
import { type GameContext, mindFaults as contextMindFaults } from "../../game/arena/context.ts";
import type { TechniqueName } from "../../skills/recovery/technique.ts";
import { mindOf, type Cases, type Json } from "../evaluation.ts";
import { FALL_AFTER, FALL_CAP, fallCases, readFall, type BuiltFall, type FallReading } from "../fall.ts";
import { declaredWaysUp } from "../../minds/option/rise.ts";
import type { OptionMindConfig } from "../../minds/option/config.ts";
import { FRESH_OFFSET, risingJobs } from "../rising.ts";

/** One of the drill's falls: a body holding a loadout, shoved at `degrees` from +z on a level. */
export type WayUpCondition = {
  readonly model: HumanoidModel; readonly loadout: Loadout; readonly seed: number; readonly start: "shoved"; readonly degrees: number;
  readonly level: GroundLevel; readonly balance: number; readonly grit: number; readonly gusts: boolean; readonly target: boolean; readonly obstacle: boolean;
};

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

  /** `conditions` risen by a way-up subject's mind, refused where the mind or its way up does not fit the body holding the fall's loadout. */
  function wayUpCases(play: Json, conditions: readonly WayUpCondition[]): Cases<WayUpCondition, WayUpReading, BuiltFall> {
    const inner = fallCases(play, conditions);
    return { ...inner,
      faults: (value, condition, subject) => {
        const { mind, way } = value as WayUpValue;
        const bed = inner.faults?.(mind, condition, subject) ?? [];
        if (bed.length) return bed;
        const spec = modelHolding(condition.model, condition.loadout, subject?.character), technique = parts.find("technique", { kind: way });
        const unfit = technique ? technique.fits(spec, technique.defaults, parts) : `no way up ${way}`;
        if (unfit) return [`${way} does not fit ${condition.model}: ${unfit}`];
        return mindFaults(mindOf(mind), spec, { entry: [] });
      },
      world: (values, condition, engine, characters) => {
        const world = inner.world(values.map((value) => (value as WayUpValue).mind), condition, engine, characters), character = characters[0];
        if (isRefused(world)) return world;
        return world.kind === "fall" && character && Object.keys(character).length > 0 ? { ...world, fall: { ...world.fall, character } } : world;
      },
      read: (built) => {
        const fall = readFall(built), options = (built.combatant?.mind as OptionMindConfig | undefined)?.options ?? [];
        const way = declaredWaysUp(parts, options)[0]?.kind ?? null;
        return { afterStep: () => fall.afterStep(), get ended() { return fall.ended; }, reading: () => ({ ...fall.reading(), way }) };
      } };
  }

  const WAY_UP_CASES: Readonly<Record<string, Cases<WayUpCondition, WayUpReading, BuiltFall>>> = Object.freeze({
    standard: { ...wayUpCases({ suite: "the way-up drill", cap: FALL_CAP, after: FALL_AFTER }, wayUpFalls(0)), twin: "fresh" },
    fresh: wayUpCases({ suite: "the way-up drill's fresh falls", cap: FALL_CAP, after: FALL_AFTER }, wayUpFalls(FRESH_OFFSET)),
  });

  return { WAY_UP_CASES };
}
