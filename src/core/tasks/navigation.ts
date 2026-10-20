import type { Scene } from "@babylonjs/core/scene.js";
import { enlist } from "../combatant.ts";
import type { PhysicsEngine } from "../engine/engine.ts";
import { hypot } from "../math/real.ts";
import type { MindConfig } from "../mind/config.ts";
import type { GroundPoint } from "../mind/movement.ts";
import { solidSenses, type SolidSense } from "../mind/object-senses.ts";
import { isOrders, type Orders } from "../mind/orders.ts";
import { createSenses } from "../mind/senses.ts";
import { modelSpec, type BodyModel } from "../models.ts";
import { EMPTY_LOADOUT, withLoadout, type Loadout } from "../items/held.ts";
import { observeBody } from "../observation.ts";
import { clockOf } from "../clock.ts";
import { rulebook } from "../rules/rulebook.ts";
import { createWorld } from "../world.ts";
import { deepFreeze } from "../state.ts";

interface Participant {
  readonly model: BodyModel;
  readonly mind: MindConfig;
  readonly at: GroundPoint;
  readonly loadout?: Loadout;
  readonly orders: Orders | null;
}

/** Shared physical travel conditions; a moving target uses another ordinary controlled body. */
interface Configuration extends Participant {
  readonly solids: readonly SolidSense[];
  readonly target?: Participant;
}

/**
 * A Node/browser navigation task on the common world. Conditions and scoring read actual bodies;
 * route reports remain diagnostics. The environment supplies reset, capped stepping and replay.
 */
export function createNavigationTask(scene: Scene, engine: PhysicsEngine, config: Configuration) {
  const solids = solidSenses(config.solids), world = createWorld(scene, engine), senses = createSenses(world);
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const obstacles = new Set(solids.map(solid => {
    switch (solid.kind) {
      case "box": return world.physics.addFixedBox(solid.centre, solid.size, solid.turn).id;
      case "hull": return world.physics.addFixedShape({ kind: "hull", points: solid.points }).id;
      default: { const never: never = solid; throw new Error(`unknown navigation solid ${never}`); }
    }
  }));
  const control = { orders: structuredClone(config.orders), obstacleContactSteps: 0, falls: 0, down: false, arrivedSince: null as number | null };
  const make = (id: string, participant: Participant, orders: () => Orders | null) => enlist(world, {
    id, side: id, spec: withLoadout(modelSpec(participant.model), participant.loadout ?? EMPTY_LOADOUT), at: [participant.at.x, 0, participant.at.z],
    mind: participant.mind, rules: rulebook("arena"), senses, solids, balance: 0, out: () => false, name: `navigation ${id}`, orders,
  });
  const own = make("actor", config, () => control.orders);
  const target = config.target ? make("target", config.target, () => config.target!.orders) : null;
  const clock = clockOf(world), read = observeBody(own.built, own.body.muscles, clock, own.senses, undefined, () => own.body.down);
  const targetRead = target ? observeBody(target.built, target.body.muscles, clock, target.senses, undefined, () => target.body.down) : null;
  const state = { control, actor: { body: own.body.state, mind: own.minded.state }, target: target ? { body: target.body.state, mind: target.minded.state } : null, senses: senses.state };
  const stop = world.afterStep(() => {
    let contact = false;
    for (const segment of own.built.segments.values()) if (world.physics.contactsOf(segment.body)
      .some(touch => touch.fixed !== null && obstacles.has(touch.fixed) && touch.impulse > 0)) contact = true;
    if (contact) control.obstacleContactSteps++;
    if (own.body.down && !control.down) control.falls++;
    control.down = own.body.down;
  });
  const resolved = (value: unknown): object => JSON.parse(JSON.stringify(value, (key, entry) => key === "provenance" ? undefined : entry)) as object;
  const configuration = deepFreeze({ task: "navigation", protocol: 1, config: structuredClone(config),
    body: resolved(own.built.spec), targetBody: target ? resolved(target.built.spec) : null, engineRevision: engine.revision,
    assists: { balance: 0 }, arrivalSpeed: .25, rangeHoldSeconds: 1 });
  return { world, state, configuration,
    check(action: { readonly orders: Orders | null }) {
      if (!action || Object.keys(action).some(key => key !== "orders") || action.orders !== null && !isOrders(action.orders)) throw new Error("invalid navigation orders");
      return action;
    },
    act(action: { readonly orders: Orders | null }) { control.orders = action.orders; },
    observe() {
      const observation = read();
      const navigation = own.minded.skills?.report.navigation;
      return { body: observation, target: targetRead?.() ?? null, navigation: navigation ? structuredClone({ ...navigation }) : null };
    },
    evaluate() {
      const observation = read(), centre = observation.centre;
      const speed = own.senses().others.find(other => other.id === "target")?.velocity;
      let distance = 0, near = 0, far = 0, objective = false;
      const request = control.orders?.move;
      if (request?.kind === "place") {
        const goal = request.points[request.points.length - 1]!;
        distance = hypot(centre[0] - goal.x, centre[2] - goal.z); near = 0; far = request.near; objective = true;
      } else if (request?.kind === "range") {
        const focus = own.senses().others.find(other => other.id === request.focus && !other.out);
        if (focus) { distance = hypot(centre[0] - focus.centre.x, centre[2] - focus.centre.z); near = request.near; far = request.far; objective = true; }
      }
      let vx = 0, vz = 0, mass = 0;
      for (const segment of observation.segments) {
        const kg = own.built.segments.get(segment.name)!.rigid.mass;
        vx += kg * segment.velocity[0]; vz += kg * segment.velocity[2]; mass += kg;
      }
      const velocity = hypot(vx / mass, vz / mass), arrived = objective && distance >= near && distance <= far && !observation.down
        && (request?.kind === "range" || velocity <= .25);
      if (arrived) control.arrivedSince ??= world.time;
      else control.arrivedSince = null;
      const invalid = observation.segments.some(part => [...part.position, ...part.rotation, ...part.velocity, ...part.spin].some(value => !Number.isFinite(value)))
        ? "non-finite navigation body" : null;
      return { metrics: { distance, speed: velocity, targetSpeed: speed ? hypot(speed.x, speed.z) : 0,
        falls: control.falls, obstacleContactSteps: control.obstacleContactSteps, arrived: arrived ? 1 : 0 },
        terminated: arrived && (request?.kind !== "range" || world.time - control.arrivedSince! >= configuration.rangeHoldSeconds) ? "arrived" : null, invalid };
    },
    show() { senses.show(); },
    dispose() { stop.dispose(); own.body.dispose(); own.built.dispose(); target?.body.dispose(); target?.built.dispose(); senses.dispose(); world.dispose(); },
  };
}
