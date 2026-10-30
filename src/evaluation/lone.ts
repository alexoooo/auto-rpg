/**
 * **A lone body as a case**: one character under one mind, standing at the open stage's centre with
 * the arena's solids and no one else, for its reader to read: what a mind does alone (stands, walks
 * its orders, keeps its feet). Built as a fight builds a body (`enlist`), under the fight's senses
 * and rules, so it is bit-equal between JavaScript engines as a bout is. Its script gives it orders
 * and shoves at set times (`LoneCue`).
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../arena/room.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import { enlist, type Combatant } from "../core/combatant.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { EMPTY_LOADOUT, type Loadout } from "../core/items/held.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { Orders } from "../core/intent/orders.ts";
import { cos, sin } from "../core/math/real.ts";
import { createSenses } from "../core/mind/senses.ts";
import { modelHolding, type BodyModel } from "../core/models.ts";
import { rulebook } from "../core/rules/rulebook.ts";
import { createWorld, type World } from "../core/world.ts";
import type { CaseWorld, WorldKind } from "./evaluation.ts";
import { GAME } from "../entrants/game.ts";

/**
 * A cue of a lone body's script, `at` s into the case: the orders it is given from then on (none
 * where absent: the last given hold), and a shove then, a level impulse at its middle trunk's
 * centre of mass of `impulse` N s, `degrees` from +z toward +x.
 */
export interface LoneCue {
  readonly at: number;
  readonly orders?: Orders | null;
  readonly shove?: { readonly impulse: number; readonly degrees: number };
}

/** One lone body, as plain data: its body, its character's attributes, what it holds, its mind in full, its balance, per cent of its weight, in place of its character's, and its script. */
export interface LoneCase {
  readonly model: BodyModel;
  readonly character?: AttributeOverrides;
  readonly loadout?: Loadout;
  readonly mind: MindConfig;
  readonly balance?: number;
  readonly script?: readonly LoneCue[];
}

/** A lone body's world, for its reader. */
export interface BuiltLone {
  readonly world: World;
  readonly body: Combatant;
  dispose(): void;
}

/**
 * A world with the arena's solids and `lone`'s body in it at the centre, facing +z, on a scene of
 * its own with no canvas, its script played: each cue's orders from the step it falls on, and its
 * shove before that step.
 */
async function buildLone(lone: LoneCase, engine: CaseWorld["engine"]): Promise<BuiltLone> {
  const babylon = new NullEngine(), scene = new Scene(babylon), world = createWorld(scene, await loadEngine(engine));
  try {
    addArenaSolids(world.physics);
    const cues = [...(lone.script ?? [])].map((cue) => ({ ...cue, step: Math.round(cue.at * world.hz) })).sort((a, b) => a.step - b.step);
    let orders: Orders | null = null, next = 0, steps = 0;
    const body = enlist(world, { id: "lone", side: "lone", name: "lone", spec: modelHolding(lone.model, lone.loadout ?? EMPTY_LOADOUT, lone.character), rules: rulebook("arena"),
      mind: lone.mind, catalog: GAME, at: [0, 0, 0], senses: createSenses(world), out: () => false, orders: () => orders, ...(lone.balance !== undefined ? { balance: lone.balance } : {}) });
    const trunk = body.built.segments.get("middleTrunk"), point = new Vector3(), impulse = new Vector3();
    // First in every step: the cues that fall on it, before the mind reads its orders.
    world.sense(() => {
      for (; next < cues.length && cues[next]!.step <= steps; next++) {
        const cue = cues[next]!;
        if (cue.orders !== undefined) orders = cue.orders;
        if (cue.shove) {
          if (!trunk) throw new Error("a shove needs a middle trunk");
          const way = cue.shove.degrees * Math.PI / 180, node = trunk.body.node, centre = trunk.body.massProperties.centre;
          point.set(centre[0], centre[1], centre[2]).applyRotationQuaternionToRef(node.rotationQuaternion!, point).addInPlace(node.position);
          trunk.body.applyImpulse(impulse.set(cue.shove.impulse * sin(way), 0, cue.shove.impulse * cos(way)), point);
        }
      }
      steps++;
    });
    return { world, body, dispose() { body.body.dispose(); body.built.dispose(); world.dispose(); scene.dispose(); babylon.dispose(); } };
  } catch (error) { world.dispose(); scene.dispose(); babylon.dispose(); throw error; }
}

/** The lone-body world kind: built by `buildLone`, its one body traced, played by the world's clock. */
export const LONE_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "lone" }>, BuiltLone> = {
  build: (world) => buildLone(world.lone, world.engine),
  traced: (built) => [built.body.built],
  clock: (built) => built.world.time,
  minds: (world) => [world.lone.mind],
  hosted: (built) => [built.body.minded],
};
