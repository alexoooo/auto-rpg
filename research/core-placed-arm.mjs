/**
 * **An arm alone following a placed blow's goal** (`HandGoal`, `src/core/control/motor.ts`): each
 * body with its lower trunk held, standing in the guard, its right hand's striking point (`aimOf`)
 * given one goal as the strike skill gives it (`PLACED.through` beyond its place, following), to
 * each of `--places`: m ahead of the head and up from it, straight ahead of the right shoulder,
 * in `--seconds`. No walk, no stance and no target: what is read is the arm's, apart from where
 * the body stands.
 *
 *   node research/core-placed-arm.mjs [--models workshop-fighter,workshop-rogue,crypt-skeleton] [--held empty,club]
 *     [--seconds 0.4,2] [--places 0.55:0,0.55:-0.2,0.55:-0.5,0.4:-0.8]
 *
 * Prints, per body, thing held and place: how far the point is from the place as the goal is
 * given, m; and for each time, the nearest the point came to the place, cm, from the goal's
 * beginning to 0.3 s after its time, and its speed there, m/s. Node core stand, Rapier, 120 Hz,
 * gravity on, no ground.
 */
import { parseArgs } from "node:util";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { motorControl } from "../src/core/control/motor.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { PLACED } from "../src/core/skills/strike.ts";
import { aimOf } from "../src/core/skills/strikes.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;
const { values } = parseArgs({ options: {
  models: { type: "string", default: "workshop-fighter,workshop-rogue,crypt-skeleton" }, held: { type: "string", default: "empty,club" },
  seconds: { type: "string", default: "0.4,2" }, places: { type: "string", default: "0.55:0,0.55:-0.2,0.55:-0.5,0.4:-0.8" },
} });
const times = values.seconds.split(",").map(Number), places = values.places.split(",").map((p) => p.split(":").map(Number));
const HZ = 120;
/** Seconds the arm stands in the guard before its goal, and those it is watched for after the goal's time. */
const STOOD = 1.5, AFTER = 0.3;

/** One goal: how far the point began from its place, m, the nearest it came, m, and its speed there, m/s. */
async function one(spec, aim, [ahead, up], seconds) {
  const stand = await coreStand(spec, { ground: false, pinned: "lowerTrunk", hz: HZ });
  const motor = motorControl(stand.built, 0.1, GUARD);
  const driver = driveMuscles(stand.built, stand.world, motor.control);
  try {
    stand.step(stand.seconds(STOOD));
    const head = spec.segments.find((s) => s.name === "head").centreOfMass.value;
    const shoulder = spec.joints.find((j) => j.name === "shoulder.right").centre.value;
    const position = [shoulder[0], head[1] + up, head[2] + ahead], place = new Vector3(...position);
    const goal = { places: [{ point: aim, position }], seconds, through: PLACED.through, follows: true };
    const at = motor.pointToRef("right", aim, new Vector3()), last = at.clone(), began = Vector3.Distance(at, place);
    let nearest = Infinity, speed = 0;
    for (let s = 0; s < stand.seconds(seconds + AFTER); s++) {
      if (s < stand.seconds(seconds)) motor.reach("right", goal); else motor.release("right");
      stand.step(1);
      motor.pointToRef("right", aim, at);
      const off = Vector3.Distance(at, place);
      if (off < nearest) { nearest = off; speed = Vector3.Distance(at, last) * HZ; }
      last.copyFrom(at);
    }
    return { began, nearest, speed };
  } finally { driver.dispose(); stand.dispose(); }
}

console.log(`An arm alone following a placed blow's goal, the lower trunk held, from the guard; Node core stand, Rapier, ${HZ} Hz, gravity on, no ground.\n`);
console.log(`| Body | Held | Point | Ahead of the head, m | Up from it, m | Away as given, m | ${times.map((t) => `In ${t} s: nearest, cm | m/s`).join(" | ")} |`);
console.log(`|---|---|---|---|---|---|${times.map(() => "---|---|").join("")}`);
for (const model of values.models.split(",")) {
  for (const right of values.held.split(",")) {
    const spec = loadoutSpec({ model, right, left: "empty" }), aim = aimOf(spec, "right");
    for (const place of places) {
      const read = [];
      for (const seconds of times) read.push(await one(spec, aim, place, seconds));
      console.log(`| ${model} | ${right} | ${aim} | ${place[0]} | ${place[1]} | ${read[0].began.toFixed(2)} | ${read.map((r) => `${(100 * r.nearest).toFixed(1)} | ${r.speed.toFixed(2)}`).join(" | ")} |`);
    }
  }
}
