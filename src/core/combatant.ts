import { buildBody } from "./build/build-body.ts";
import type { AssistCeiling } from "./control/assist.ts";
import type { MindConfig } from "./mind/config.ts";
import { builtAngles, createMind, type Minded, type MindWiring } from "./mind/minds.ts";
import type { SolidSense } from "./mind/object-senses.ts";
import type { SensesHub } from "./mind/senses.ts";
import type { PhysicalBody } from "./physical-body.ts";
import type { Fighter } from "./rules/blows.ts";
import { createPool } from "./rules/pool.ts";
import { balanceCeiling, balancePercent, type Rulebook } from "./rules/rulebook.ts";
import type { BodySpec } from "./spec/body.ts";
import type { Vec3 } from "./spec/quantity.ts";
import type { World } from "./world.ts";

/** **What a fight enlists a body with**: who it is, its body, where it stands, and what drives it. */
interface Enlistment extends Pick<MindWiring, "name" | "orders" | "contactIdentity"> {
  readonly id: string;
  readonly side: string;
  /** Its body, with what it holds (`armedWith`). */
  readonly spec: BodySpec;
  /** Where its root stands, world. */
  readonly at: Vec3;
  readonly rules: Rulebook;
  /** The fight's senses, which carry it (`SensesHub.add`). */
  readonly senses: SensesHub;
  /** Fixed collision geometry its senses are granted (`Senses.solids`). */
  readonly solids?: readonly SolidSense[];
  /** Whether it is out of the fight, asked once a step for what it and the others sense. */
  out(): boolean;
  readonly mind: MindConfig;
  /** Its balance, per cent of its weight, in place of its character's (`AttributeSpec.balance`). */
  readonly balance?: number;
  /** What a per cent of balance is, in place of the rulebook's (`balancePercent`). */
  readonly percent?: AssistCeiling;
}

/** A body in a fight under its mind: what the blows read (`Fighter`), the mind, the config it was made from, and the body it drives. */
export interface Combatant extends Fighter {
  readonly minded: Minded;
  /** The config its mind was made from: what an inspector shows of it (`mindInspector`). */
  readonly mind: MindConfig;
  readonly body: PhysicalBody;
}

/**
 * **One combatant**: its body built where it stands, in the posture its mind holds (`builtAngles`),
 * its pool under the fight's rules, carried by the fight's senses, and under the mind its config
 * makes, with the assist its balance gives. Every fight enlists its bodies here, in this order.
 */
export function enlist(world: World, enlisting: Enlistment): Combatant {
  const { id, side, spec, rules, mind } = enlisting;
  const built = buildBody(spec, world, { position: enlisting.at, joints: builtAngles(spec, mind) });
  const pool = createPool(spec, rules);
  const senses = enlisting.senses.add({ id, side, built, out: enlisting.out, ...(enlisting.solids ? { solids: enlisting.solids } : {}) });
  const assist = balanceCeiling(enlisting.balance ?? spec.attributes.balance.value, enlisting.percent ?? balancePercent(rules));
  const minded = createMind(built, world, mind, {
    name: enlisting.name, senses, assist, orders: enlisting.orders,
    ...(enlisting.contactIdentity ? { contactIdentity: enlisting.contactIdentity } : {}),
  });
  return { id, side, built, pool, minded, mind, body: minded.body, muscles: minded.body.muscles };
}
