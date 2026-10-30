/**
 * **The court task's cases**: a striker with sword and buckler, minded by the subject, starts on
 * one of the obstacle court's spawns, `gap` apart from a Warrior with empty hands behind the
 * court's central column, which stands (`still`) or walks to and fro across the line between them
 * (`moving`). It is read until its first swing begins, which is its arrival in the swing's window,
 * or the protocol's seconds: when it arrived, how many steps any of its segments pushed on the
 * court's furniture, and how often it fell.
 */
import { LEVELS } from "../../arena/levels.ts";
import type { OrdersEntry } from "../../arena/duel.ts";
import { loadoutKey } from "../../core/items/held.ts";
import { BEHAVIOURS, type MindConfig } from "../../core/mind/config.ts";
import { CONTROLLERS } from "../../core/mind/controllers.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import { modelHolding, type BodyModel } from "../../core/models.ts";
import type { Side } from "../../core/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { PHYSICS_HZ } from "../../core/world.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { FIGHT_ENTRY } from "../../core/mind/catalog.ts";
import { STANDS } from "../../core/entrants/drill-opponent/mind.ts";
import { sideAttributes, type Cases, type Json, type Subject } from "../evaluation.ts";
import { otherSide } from "../../core/spec/body.ts";

/** The moving target: Behaviours' body of parts, doing only as it is ordered. */
const WALKS: MindConfig = deepFreeze({ ...BEHAVIOURS, tactics: { ...BEHAVIOURS.tactics, list: [{ kind: "follow-orders" }] }, executors: [], actions: [] });

/**
 * The protocol: the strikers' bodies, the gaps, m, the sides they start on and the targets; how
 * long a case runs at most, s; how fast the moving target walks across the line, m/s, and how
 * long each way, s. A change here is a new protocol.
 */
const COURT = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  gaps: [4, 6],
  sides: ["left", "right"] as Side[],
  targets: ["still", "moving"] as ("still" | "moving")[],
  seconds: 15, pace: .4, leg: 3,
});

/** The striker's loadout. */
const HELD = Object.freeze({ left: "buckler", right: "sword" } as const);

/** One case's conditions: the striker's body, the gap, m, the side it starts on, and whether its target stands or walks. */
export type CourtCondition = { readonly model: BodyModel; readonly gap: number; readonly side: Side; readonly target: "still" | "moving" };

/** What a case came to: when the striker arrived (null, never), its steps pushing on the furniture, its falls, and the time read to, s. */
export type CourtReading = { readonly arrived: number | null; readonly contactSteps: number; readonly falls: number; readonly seconds: number };


/** Why `value` is no mind, or what keeps it from sword and buckler on `model` (`mindFaults`). */
function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  if (!presetFitsModel(subject ?? {}, model))
    return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
  return mindFaults(value as unknown as MindConfig, modelHolding(model, HELD, subject?.character), { entry: FIGHT_ENTRY }).map((fault) => `${model} carrying ${loadoutKey(HELD)}: ${fault}`);
}

function courtCases(protocol: typeof COURT): Cases<CourtCondition, CourtReading> {
  const conditions: CourtCondition[] = [];
  for (const model of protocol.models) for (const gap of protocol.gaps) for (const side of protocol.sides) for (const target of protocol.targets) conditions.push({ model, gap, side, target });
  /** The moving target's orders: to and fro across the line, a leg at a time, each given at the step it begins. */
  const walks = (foe: Side): OrdersEntry[] => Array.from({ length: Math.ceil(protocol.seconds / protocol.leg) }, (_, k) => ({ step: Math.round(k * protocol.leg * PHYSICS_HZ.value), side: foe,
    orders: { move: { kind: "direct", direction: { x: 0, z: (k % 2 ? -1 : 1) * protocol.pace } }, face: null } }));
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([mind], { model, gap, side, target }, engine, [character]) => {
      const foe = otherSide(side);
      return { kind: "bout", engine, tape: target === "moving" ? walks(foe) : [],
        // A task, not a fight: the target throws nothing, so the bout asks no attack of either side (`EntryRule`); the subject's own is asked in `faultsOf`.
        recipe: { level: "obstacle-court", ...{ [side]: model, [foe]: "workshop-fighter" } as Record<Side, BodyModel>, gap, capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ...sideAttributes({ [side]: character }),
          loadouts: { [side]: HELD, [foe]: { left: "empty", right: "empty" } } as Record<Side, typeof HELD>,
          minds: { [side]: mind as unknown as MindConfig, [foe]: target === "moving" ? WALKS : STANDS } as Record<Side, MindConfig> } };
    },
    read({ world, duel, colliders }, { side }) {
      const furniture = new Set(LEVELS["obstacle-court"].furniture.map(({ solid }) => colliders.get(solid.name)));
      const striker = duel.duelists[side], skills = striker.minded.skills;
      if (!skills) throw new Error("the striker runs no skills");
      let arrived: number | null = null, contactSteps = 0, falls = 0, down = false;
      return {
        afterStep() {
          if (skills.report.actions.length > 0) arrived = world.time;
          if ([...striker.built.segments.values()].some((segment) => world.physics.contactsOf(segment.body)
            .some((touch) => touch.fixed !== null && furniture.has(touch.fixed) && touch.impulse > 0))) contactSteps++;
          if (striker.body.down && !down) falls++;
          down = striker.body.down;
        },
        get ended() { return arrived !== null || world.time >= protocol.seconds || duel.verdict !== null; },
        reading: () => ({ arrived, contactSteps, falls, seconds: world.time }),
      };
    },
  };
}

/** Every protocol the court task may be played on, by name. */
export const COURT_CASES: Readonly<Record<string, Cases<CourtCondition, CourtReading>>> = Object.freeze({ standard: courtCases(COURT) });
