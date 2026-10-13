import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createSenses } from "../core/mind/senses.ts";
import { standIntent } from "../core/mind/intent.ts";
import { STAND_ORDERS } from "../core/mind/orders.ts";
import type { Orders } from "../core/mind/orders.ts";
import { rulebook } from "../core/rules/rulebook.ts";
import { mulberry32 } from "../rng.ts";
import type { Actor } from "./actor.ts";
import type { LabAddress } from "./scenarios.ts";
import { groundMeter } from "./ground-meter.ts";
import { shoveBody } from "./stance-mode.ts";
import { dummySpec, hangDummy } from "./targets.ts";
import { startWind } from "./wind.ts";

/** Reproducible disturbance parameters, with explicit controls taking precedence over the draw. */
export function groundShove(address: Pick<LabAddress, "seed" | "ground">) {
  const random = mulberry32(address.seed);
  const degrees = random() * 360, impulse = 40 + random() * 50;
  return { degrees: address.ground.degrees ?? degrees, impulse: address.ground.impulse ?? impulse };
}

/** Run a placed, dropped or shoved body through its own selected mind and read its ground history. */
export function startGround(actor: Actor, address: LabAddress, options: {
  readonly pushed?: (segment: BuiltSegment, impulse: Vector3, at: Vector3) => void;
  readonly hears?: (built: BuiltBody) => { dispose(): void };
  readonly orders?: () => Orders;
} = {}) {
  const { body, world } = actor, hub = createSenses(world);
  const senses = hub.add({ id: "ground-body", side: "ground-body", built: body.built, out: () => false, down: () => body.view.down });
  const dummy = address.ground.foe ? hangDummy(world, dummySpec(body.built.spec), [0, .5, address.ground.foe], rulebook("arena")) : null;
  const sound = dummy ? options.hears?.(dummy.fighter.built) : null;
  if (dummy) hub.add({ id: "ground-foe", side: "ground-foe", built: dummy.fighter.built, out: () => false });
  const skills = actor.drive({ name: "ground stand", decide: () => standIntent(0) }, { senses, orders: options.orders ?? (() => STAND_ORDERS) });
  const shoving = shoveBody(body, world, () => skills.report.heading, options.pushed), shove = groundShove(address);
  const wind = startWind(body.built, world, address.ground.gusts ? { rate: .7, strength: 45 } : { rate: 0, strength: 0 }, address.seed);
  const meter = groundMeter(body, world, address.balance ?? body.built.spec.attributes.balance.value);
  const state = { status: "running" as "running" | "landed standing" | "cap", shoved: false };
  const disturbance = world.afterStep(() => {
    if (address.ground.start === "shoved" && !state.shoved && world.time >= 1) {
      shoving.shove(shove.impulse, shove.degrees); state.shoved = true;
    }
  });
  const reading = world.afterStep(() => {
    meter.sample();
    if (address.ground.start === "dropped" && meter.state.from === null && world.time >= 3) state.status = "landed standing";
    if (meter.state.from !== null && meter.state.handback === null && world.time - meter.state.from >= 30 && state.status === "running") {
      state.status = "cap"; meter.cap();
    }
  });
  return {
    body, meter, dummy, state,
    frame: () => ({ ...meter.frame(), status: state.status }),
    shove() { meter.beginFall(); state.status = "running"; shoving.shove(shove.impulse, shove.degrees); },
    dispose() { reading.dispose(); disturbance.dispose(); wind.dispose(); shoving.dispose(); sound?.dispose(); dummy?.dispose(); hub.dispose(); actor.dispose(); },
  };
}
