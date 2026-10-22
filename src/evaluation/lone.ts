/**
 * **A lone body as a case**: one character under one mind, standing at the open stage's centre with
 * the arena's solids and no one else, for its reader to read: what a mind does alone (stands, walks
 * its orders, keeps its feet). Built as a fight builds a body (`enlist`), under the fight's senses
 * and rules, so it is bit-equal between JavaScript engines as a bout is.
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../arena/room.ts";
import { enlist, type Combatant } from "../core/combatant.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { EMPTY_LOADOUT, type Loadout } from "../core/items/held.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { createSenses } from "../core/mind/senses.ts";
import { modelHolding, type BodyModel } from "../core/models.ts";
import { rulebook } from "../core/rules/rulebook.ts";
import { createWorld, type World } from "../core/world.ts";
import type { CaseWorld, WorldKind } from "./evaluation.ts";

/** One lone body, as plain data: its character, what it holds, its mind in full, and its balance, per cent of its weight, in place of its character's. */
export interface LoneCase {
  readonly model: BodyModel;
  readonly loadout?: Loadout;
  readonly mind: MindConfig;
  readonly balance?: number;
}

/** A lone body's world, for its reader. */
export interface BuiltLone {
  readonly world: World;
  readonly body: Combatant;
  dispose(): void;
}

/** A world with the arena's solids and `lone`'s body in it at the centre, facing +z, on a scene of its own with no canvas. */
export async function buildLone(lone: LoneCase, engine: CaseWorld["engine"]): Promise<BuiltLone> {
  const babylon = new NullEngine(), scene = new Scene(babylon), world = createWorld(scene, await loadEngine(engine));
  try {
    addArenaSolids(world.physics);
    const body = enlist(world, { id: "lone", side: "lone", name: "lone", spec: modelHolding(lone.model, lone.loadout ?? EMPTY_LOADOUT), rules: rulebook("arena"),
      mind: lone.mind, at: [0, 0, 0], senses: createSenses(world), out: () => false, orders: () => null, ...(lone.balance !== undefined ? { balance: lone.balance } : {}) });
    return { world, body, dispose() { body.body.dispose(); body.built.dispose(); world.dispose(); scene.dispose(); babylon.dispose(); } };
  } catch (error) { world.dispose(); scene.dispose(); babylon.dispose(); throw error; }
}

/** The lone-body world kind: built by `buildLone`, its one body traced, played by the world's clock. */
export const LONE_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "lone" }>, BuiltLone> = {
  build: (world) => buildLone(world.lone, world.engine),
  traced: (built) => [built.body.built],
  clock: (built) => built.world.time,
  minds: (world) => [world.lone.mind],
};
