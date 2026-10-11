import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { dynamicRise } from "../src/core/mind/rise/dynamic.ts";
import { stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { centreOfToRef, footStatesOf } from "../src/core/control/support.ts";
import { standUpReplay } from "./stand-up-replay.mjs";

/** Ordinary bearing control of measured hands and capsule shins, with a declared boot-preparation posture. */
export function bootContactRecovery(config) {
  const tuning = Object.freeze({ ...config });
  if (![tuning.knee, tuning.ankle, tuning.seconds].every(Number.isFinite) || !(tuning.seconds > 0))
    throw new Error("boot preparation requires finite goals and a positive duration");
  return (own, view, world) => {
    const rise = dynamicRise(own, view, world), parts = [...own.built.segments.values()];
    const mass = parts.reduce((sum, p) => sum + p.rigid.mass, 0), centre = new Vector3(), velocity = new Vector3(), scratch = new Vector3();
    const bearingView = { ...view, get down() { return view.down; }, stance: { ...view.stance, centre, velocity } };
    // The capsule support excludes the unmeasured boot proxy used by a propped shin.
    const recipe = { ...RISE, limbs: RISE.limbs.map(limb => limb.kind === "propped"
      ? { kind: "end", name: limb.name, segment: limb.segment, from: limb.from, takes: limb.takes } : limb),
      rise: [{ kind: "bear", name: "boot preparation", on: [
        { limb: "shin.left", share: .35 }, { limb: "shin.right", share: .35 },
        { limb: "hand.left", share: .15 }, { limb: "hand.right", share: .15 }],
      leave: [], overProp: false, height: null, pitch: null, posture: "reference",
      seconds: .3, postureSeconds: .15, limit: 8 }] };
    const bearing = stagedRise(own, bearingView, recipe);
    const state = rise.state.experiment = { active: false, time: 0, from: null, bearing: bearing.state };
    const posture = () => Object.fromEntries(own.muscles.channels.map((c, i) => [c.name,
      Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, own.muscles.angle(i))) + c.dof.spec.bind.value]));
    const step = (senses, dt) => {
      if (!state.active && rise.state.policy.phase !== "place") { rise.step(senses, dt); return; }
      if (!state.active) { state.active = true; state.from = posture(); bearing.beginSupported(state.from, { hold: true }); }
      state.time += dt;
      const u = Math.min(1, state.time / tuning.seconds), amount = u * u * (3 - 2 * u);
      for (const side of ["left", "right"]) for (const [name, goal] of [
        [`knee.${side} flexion`, tuning.knee], [`ankle.${side} dorsiflexion`, tuning.ankle]]) {
        const channel = own.muscles.channels.find(c => c.name === name);
        const legal = Math.max(channel.dof.spec.min.value + channel.dof.spec.bind.value,
          Math.min(channel.dof.spec.max.value + channel.dof.spec.bind.value, goal));
        bearing.state.supportedPosture[name] = state.from[name] + (legal - state.from[name]) * amount;
      }
      centre.setAll(0); velocity.setAll(0);
      for (const part of parts) {
        centre.addInPlace(centreOfToRef(part, scratch).scaleInPlace(part.rigid.mass / mass));
        velocity.addInPlace(part.body.linearVelocityToRef(scratch).scaleInPlace(part.rigid.mass / mass));
      }
      bearing.step(senses, dt);
    };
    return Object.create(rise, { step: { value: step } });
  };
}

/** Boot loads and bearing faces are a component result; the host's recovery gate remains separate. */
export async function runBootContact(config, { watch = 6 } = {}) {
  const source = readFileSync(new URL(import.meta.url));
  const recoveryId = `boot-contact/${createHash("sha256").update(source).update(JSON.stringify(config)).digest("hex")}`;
  const f = await standUpReplay({ recovery: bootContactRecovery(config), recoveryId });
  try {
    f.fall(); const trace = [], feet = footStatesOf(f.stand.built);
    let quiet = 0, acquired = null;
    for (let k = 0; k < Math.round(watch / f.stand.world.dt); k++) {
      f.step(); const sample = f.sample();
      const boots = feet.map(foot => {
        const p = sample.segments.find(p => p.name === foot.segment.spec.name);
        return { side: foot.side, load: sample.floor.filter(c => c.segment === p.name && -c.normal[1] >= .9)
          .reduce((sum, c) => sum + c.impulse / f.stand.world.dt, 0),
          up: Vector3.Up().applyRotationQuaternion(Quaternion.Inverse(foot.segment.rest))
            .applyRotationQuaternion(new Quaternion(...p.rotation)).y };
      });
      quiet = boots.every(b => b.load > 5 && b.up >= .9) ? quiet + f.stand.world.dt : 0;
      if (quiet >= .05 && acquired === null) acquired = sample.fromFirstDown;
      if (k % 30 === 0) trace.push({ ...sample, boots });
    }
    return { metadata: f.metadata, config, acquired, completed: f.sample().policy.completed, trace };
  } finally { f.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--out");
  if (at < 0 || !process.argv[at + 1]) throw new Error("--out names a new contact experiment record");
  const rows = [];
  // These knee and ankle targets compare preparation motions, with identical support control and duration.
  for (const knee of [1.6, 1.9, 2.2]) for (const ankle of [-.9, -.3, .36]) {
    const row = await runBootContact({ knee, ankle, seconds: .5 }); rows.push(row);
    console.log(JSON.stringify({ config: row.config, acquired: row.acquired, completed: row.completed,
      final: { boots: row.trace.at(-1).boots, up: row.trace.at(-1).up, down: row.trace.at(-1).down } }));
  }
  writeFileSync(process.argv[at + 1], JSON.stringify(rows, null, 2), { flag: "wx" });
}
