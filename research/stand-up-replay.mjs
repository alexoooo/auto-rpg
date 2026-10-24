import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { serialize, deserialize } from "node:v8";
import { pathToFileURL } from "node:url";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../src/core/models.ts";
import { armedWith } from "../src/core/items/held.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { observeBody } from "../src/core/observation.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { SEARCH_FALL } from "./stand-up-fall.mjs";
import { coreStand, saveStand, loadStand } from "../tests/harness/core-stand.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const artifact = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  .dependencies["@dimforge/rapier3d-simd-compat"].replace(/^file:/, "");
const artifactSha256 = digest(readFileSync(new URL(`../${artifact}`, import.meta.url)));
const controllerHash = createHash("sha256");
for (const name of readdirSync(new URL("../src/core/", import.meta.url), { recursive: true }).filter(n => n.endsWith(".ts")).sort())
  controllerHash.update(name.replaceAll("\\", "/")).update(readFileSync(new URL(`../src/core/${name.replaceAll("\\", "/")}`, import.meta.url)));
for (const name of ["actor", "stance-mode", "scenarios"])
  controllerHash.update(name).update(readFileSync(new URL(`../src/lab/${name}.ts`, import.meta.url)));
controllerHash.update("stand-up-fall.mjs").update(readFileSync(new URL("./stand-up-fall.mjs", import.meta.url)));
const controllerSha256 = controllerHash.digest("hex");

/** Shared objects, collection order and typed-array bytes survive hashing; record storage order does not affect it. */
function checkpointIdentity(data) {
  const seen = new Map(), nodes = [];
  const encode = value => {
    if (typeof value === "number") return { number: Object.is(value, -0) ? "-0" : String(value) };
    if (value === undefined) return { undefined: true };
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return { ref: seen.get(value) };
    const id = nodes.length; seen.set(value, id); nodes.push(null);
    if (ArrayBuffer.isView(value)) nodes[id] = { kind: value.constructor.name,
      bytes: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64") };
    else if (value instanceof Map) nodes[id] = { kind: "map", entries: [...value].map(([key, item]) => [encode(key), encode(item)]) };
    else if (value instanceof Set) nodes[id] = { kind: "set", entries: [...value].map(encode) };
    else if (Array.isArray(value)) nodes[id] = { kind: "array", entries: value.map(encode) };
    else nodes[id] = { kind: "record", entries: Object.keys(value).sort().map(key => [key, encode(value[key])]) };
    return { ref: id };
  };
  const root = encode(data);
  return digest(JSON.stringify({ root, nodes }));
}

/** Read a complete checkpoint and give it the same identity as the saved physical and controller state. */
export function standUpCheckpoint(bytes) {
  try { return { id: checkpointIdentity(deserialize(bytes)), bytes }; }
  catch (cause) { throw new Error("invalid checkpoint identity or encoding", { cause }); }
}

/** The actual Lab host and body persist through the shoves, recovery and commanded handover. */
export async function standUpReplay({ model = "workshop-fighter", held = "empty", mind = { ...LAB_PRESETS.script.config, subs: [{ kind: "support-recovery" }] }, place } = {}) {
  const spec = armedWith(modelSpec(model), "right", held);
  // `place` builds the body where and how it says (`coreStand`'s position, rotation and joints) in place of standing in its guard.
  const stand = await coreStand(spec, { engine: "rapier-coordinate", groundSize: 40, ...place ?? { posture: guardPosture(spec) } });
  const config = structuredClone(mind);
  const actor = labActor(stand.built, stand.world, { mind: config });
  const stance = startStance(actor), { body } = stance;
  const states = { body: body.state, skills: actor.skills.state, orders: stance.orders };
  const observe = observeBody(stand.built, body.muscles, stand.world, clockSenses(stand.world), { down: () => body.down, contactPatches: true });
  const metadata = { harness: "Node Stance Lab host", engine: stand.world.physics.engine,
    revision: stand.world.physics.revision, artifact, artifactSha256, controllerSha256, specSha256: digest(JSON.stringify(spec)), hz: 1 / stand.world.dt,
    actuation: stand.world.actuation, balance: 0, model, held, mind: config,
    shoves: [{ impulse: SEARCH_FALL.impulse, degrees: SEARCH_FALL.degrees, step: 240 }, { impulse: SEARCH_FALL.impulse, degrees: SEARCH_FALL.degrees, step: 264 }] };
  const root = stand.built.segments.get("lowerTrunk"), inverse = Quaternion.Inverse(root.rest);
  let firstDown = null;
  const sample = () => {
    const o = observe();
    const up = Vector3.UpReadOnly.applyRotationQuaternionToRef(root.node.rotationQuaternion.multiply(inverse), new Vector3()).y;
    const mass = [...stand.built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
    const velocity = o.segments.reduce((v, s) => v.map((value, k) => value
      + s.velocity[k] * stand.built.segments.get(s.name).rigid.mass / mass), [0, 0, 0]);
    const seconds = Math.sqrt(Math.max(0, o.centre[1]) / -stand.world.physics.gravity[1]);
    return structuredClone({ time: o.time, fromSecondShove: o.time - 264 * stand.world.dt,
      firstDown, fromFirstDown: firstDown === null ? null : o.time - firstDown,
      controller: { name: body.has, state: body.state.mind.subs }, up, centre: o.centre, velocity, capture: [o.centre[0] + velocity[0] * seconds, o.centre[2] + velocity[2] * seconds],
      handPoses: o.handPoses, segments: o.segments, joints: o.joints.map((j, i) => ({ ...j,
        min: body.muscles.channels[i].dof.spec.min.value, max: body.muscles.channels[i].dof.spec.max.value,
        activation: body.muscles.activation[i], requestedVelocity: Number.isFinite(body.muscles.velocity[i])
          ? body.muscles.velocity[i] : String(body.muscles.velocity[i]),
        atBound: j.effort > 0 ? j.positive > 0 && j.effort >= j.positive * .98
          : j.negative > 0 && -j.effort >= j.negative * .98 })),
      floor: o.contacts.filter(c => c.fixed !== null), self: o.contacts.filter(c => c.other !== null),
      assist: { force: body.assist.meter.force, moment: body.assist.meter.moment }, down: o.down });
  };
  const step = (count = 1) => {
    for (let k = 0; k < count; k++) { stand.world.step(); if (body.down && firstDown === null) firstDown = stand.world.time; }
  };
  const save = () => {
    const data = { metadata, firstDown, saved: saveStand(stand.world, states) }, bytes = serialize(data);
    return { id: checkpointIdentity(data), bytes, diagnostic: sample() };
  };
  const restore = checkpoint => {
    assert.equal(standUpCheckpoint(checkpoint.bytes).id, checkpoint.id, "checkpoint identity covers its complete contents");
    const data = deserialize(checkpoint.bytes);
    assert.deepEqual(data.metadata, metadata, "checkpoint engine and controller configuration must match");
    loadStand(stand.world, states, data.saved); firstDown = data.firstDown;
  };
  return { stand, actor, stance, observe, metadata, step, sample, save, restore,
    fall() {
      step(240); assert.equal(body.down, false, "the fresh Lab host starts standing");
      stance.shove(SEARCH_FALL.impulse, SEARCH_FALL.degrees); step(24); stance.shove(SEARCH_FALL.impulse, SEARCH_FALL.degrees);
    },
    dispose() { stance.dispose(); stand.dispose(); } };
}

/** A fresh fall and an exact continuation from its first down observation. */
export async function replayStandUp({ watch = 8, verifyFork = true, ...options } = {}) {
  const f = await standUpReplay(options);
  try {
    f.fall();
    const events = [], checkpoints = [];
    let last = "", fallen = null;
    for (let k = 0; k < Math.round(watch / f.stand.world.dt); k++) {
      f.step();
      const key = f.stance.body.has;
      if (key !== last) {
        last = key; events.push(f.sample());
        const checkpoint = f.save(); checkpoints.push(checkpoint);
        if (f.stance.body.down && fallen === null) fallen = checkpoint;
      }
      if (fallen && !f.stance.body.down && key === "command") break;
    }
    const final = f.sample();
    let exact = null;
    if (verifyFork && fallen) {
      const continuation = () => {
        const trace = [];
        for (let k = 0; k < 60; k++) { f.step(); trace.push(f.sample()); }
        return { trace, saved: saveStand(f.stand.world, { body: f.stance.body.state,
          skills: f.actor.skills.state, orders: f.stance.orders }) };
      };
      f.restore(fallen); const expected = continuation();
      const fresh = await standUpReplay(options);
      try {
        fresh.restore(fallen);
        const trace = [];
        for (let k = 0; k < 60; k++) { fresh.step(); trace.push(fresh.sample()); }
        assert.deepEqual({ trace, saved: saveStand(fresh.stand.world, { body: fresh.stance.body.state,
          skills: fresh.actor.skills.state, orders: fresh.stance.orders }) }, expected);
        exact = { steps: 60, freshWorld: true, pass: true };
      } finally { fresh.dispose(); }
    }
    return { metadata: f.metadata, events, final, exact, checkpoints };
  } finally { f.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--out");
  if (at < 0 || !process.argv[at + 1]) throw new Error("--out names a new diagnostic directory");
  const result = await replayStandUp();
  mkdirSync(process.argv[at + 1]);
  for (const checkpoint of result.checkpoints)
    writeFileSync(`${process.argv[at + 1]}/${checkpoint.id}.checkpoint`, checkpoint.bytes, { flag: "wx" });
  const { checkpoints, ...report } = result;
  report.checkpoints = checkpoints.map(({ id, diagnostic }) => ({ id, diagnostic }));
  writeFileSync(`${process.argv[at + 1]}/replay.json`, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ metadata: result.metadata, exact: result.exact,
    transitions: result.events.map(e => ({ seconds: e.fromSecondShove, controller: e.controller.name, up: e.up, down: e.down })) }, null, 2));
}
