import { isRefused, type Refused } from "../core/refusal.ts";
import { constructionScope } from "../core/construction.ts";
/**
 * **A lone body as a case**: one character under one mind, standing at the open stage's centre with
 * the arena's solids and no one else, for its reader to read: what a mind does alone (stands, walks
 * its orders, keeps its feet). Built as a fight builds a body (`enlist`), under the fight's senses
 * and rules, so it is bit-equal between JavaScript engines as a bout is. Its script gives it orders
 * and shoves at set times (`LoneCue`).
 */
import { Vector3 } from "../core/math/vector.ts";
import { addArenaSolids } from "../game/arena/solids.ts";
import type { AttributeOverrides } from "../core/bodies/character-attributes.ts";
import { enlist, type Combatant } from "../game/combatant.ts";
import { loadEngine } from "../core/physics/engines.ts";
import { EMPTY_LOADOUT, type Loadout } from "../core/bodies/items/held.ts";
import type { MindConfig } from "../minds/catalog/config.ts";
import type { Orders } from "../minds/orders.ts";
import { cos, sin } from "../core/math/real.ts";
import { createSenses } from "../core/world/senses.ts";
import { modelHoldingChecked, type BodyModel } from "../core/bodies/models.ts";
import { rulebook } from "../combat/rulebook.ts";
import { createWorld, type World } from "../core/world/world.ts";
import type { CaseWorld, WorldKind } from "./evaluation.ts";
import { labGusts, startWind } from "../game/lab/wind.ts";
import { type GameContext } from "../game/arena/context.ts";
import { saveState, loadState, type Saved } from "../core/state.ts";

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

/**
 * One lone body, as plain data: its body, its character's attributes, what it holds, its mind in
 * full, its balance, per cent of its weight, in place of its character's, its script, whether the
 * lab's gusts blow (`labGusts`, scaled by its mass), and the seed of its mind's chance and the gusts (its mind's own
 * where it names none, the gusts' 1).
 */
export interface LoneCase {
  /** An open square floor's side, m, in place of the Arena, for travel beyond its walls. */
  readonly floorSize?: number;
  /** Initial facing, radians about up; the body and its recording use the same heading. */
  readonly heading?: number;
  readonly model: BodyModel;
  readonly character?: AttributeOverrides;
  readonly loadout?: Loadout;
  readonly mind: MindConfig;
  readonly balance?: number;
  readonly script?: readonly LoneCue[];
  readonly gusts?: true;
  readonly seed?: number;
}

/** An open floor's side, m (`LoneCase.floorSize`): room for a run of the drills' longest course with no wall or post in its way. */
export const OPEN_FLOOR = 400;

/** A lone body's world, for its reader. */
export interface BuiltLone {
  readonly world: World;
  readonly state: object;
  readonly body: Combatant;
  /** Refresh perception and body views after the world's physics and state are restored. */
  loaded(): void;
  dispose(): void;
}

export function createLone(context: GameContext) {
  const GAME = context.catalog;

  /**
   * A world with the arena's solids or an open floor and `lone`'s body at the centre, facing +z, its script
   * played: each cue's orders from the step it falls on, and its
   * shove before that step; at `hz` steps a second where given (a confirmation's finer rate), else the game's.
   */
  async function buildLone(lone: LoneCase, engine: CaseWorld["engine"], { hz }: { readonly hz?: number } = {}): Promise<BuiltLone | Refused> {
    if (lone.heading !== undefined && !Number.isFinite(lone.heading)) return { refused: "a lone body's heading must be finite" };
    if (lone.floorSize !== undefined && (!Number.isFinite(lone.floorSize) || lone.floorSize <= 0)) return { refused: "an open floor needs a finite positive side" };
    const spec = modelHoldingChecked(lone.model, lone.loadout ?? EMPTY_LOADOUT, lone.character);
    if (isRefused(spec)) return spec;
    if ((lone.script ?? []).some(cue => cue.shove) && !spec.segments.some(segment => segment.name === "middleTrunk")) return { refused: "a shove needs a middle trunk" };
    const scope = constructionScope(); let complete = false;
    try {
      const world = scope.own(createWorld(await loadEngine(engine), hz === undefined ? {} : { hz }));
      if (lone.floorSize === undefined) addArenaSolids(world.physics);
      else world.physics.addFixedBox([0, -0.5, 0], [lone.floorSize, 1, lone.floorSize]);
      const cues = [...(lone.script ?? [])].map((cue) => ({ ...cue, step: Math.round(cue.at * world.hz) })).sort((a, b) => a.step - b.step);
      const state = { orders: null as Orders | null, next: 0, steps: 0 };
      const senses = scope.own(createSenses(world));
      const body = enlist(world, { id: "lone", side: "lone", name: "lone", spec, rules: rulebook("arena"),
        mind: lone.mind, catalog: GAME, at: [0, 0, 0], ...(lone.heading !== undefined ? { heading: lone.heading } : {}), senses, out: () => false, orders: () => state.orders, ...(lone.balance !== undefined ? { balance: lone.balance } : {}),
        ...(lone.seed !== undefined ? { seed: lone.seed } : {}) });
      scope.own(body.body); scope.own(body.built);
      const wind = lone.gusts ? startWind(body.built, world, labGusts(lone.model), lone.seed ?? 1) : null;
      if (isRefused(wind)) return wind;
      scope.own(wind);
      const trunk = body.built.segments.get("middleTrunk"), point = new Vector3(), impulse = new Vector3();
      // First in every step: the cues that fall on it, before the mind reads its orders.
      world.sense(() => {
        for (; state.next < cues.length && cues[state.next]!.step <= state.steps; state.next++) {
          const cue = cues[state.next]!;
          if (cue.orders !== undefined) state.orders = cue.orders;
          if (cue.shove) {
            if (!trunk) throw new Error("a shove needs a middle trunk");
            const way = cue.shove.degrees * Math.PI / 180, pose = trunk.body.pose, centre = trunk.body.massProperties.centre;
            point.set(centre[0], centre[1], centre[2]).applyRotationQuaternionToRef(pose.rotation, point).addInPlace(pose.position);
            trunk.body.applyImpulse(impulse.set(cue.shove.impulse * sin(way), 0, cue.shove.impulse * cos(way)), point);
          }
        }
        state.steps++;
      });
      complete = true;
      return { world, body, state: { world: world.state, script: state, body: body.body.state, mind: body.minded.state, senses: senses.state, wind: wind?.state ?? null },
        loaded() { senses.show(); world.loaded(); }, dispose: scope.dispose };
    } finally { if (!complete) scope.dispose(); }
  }

  /** The lone-body world kind: built by `buildLone`, its one body traced, played by the world's clock. */
  const LONE_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "lone" }>, BuiltLone> = {
    build: (world, options) => buildLone(world.lone, world.engine, options?.hz === undefined ? {} : { hz: options.hz }),
    traced: (built) => [built.body.built],
    clock: (built) => built.world.time,
    minds: (world) => [world.lone.mind],
    hosted: (built) => [built.body.minded],
    save: built => ({ physics: built.world.physics.save(), state: saveState(built.state) }),
    load: (built, saved) => {
      const snapshot = saved as { readonly physics: ReturnType<World["physics"]["save"]>; readonly state: Saved };
      built.world.physics.load(snapshot.physics);
      loadState(built.state, snapshot.state);
      built.loaded();
    },
  };

  return { LONE_WORLD };
}

/** The registered world factory for this builder. */
export const loneWorld = (context: GameContext) => createLone(context).LONE_WORLD;
