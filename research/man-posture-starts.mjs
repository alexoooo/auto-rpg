/**
 * **The installed postures' starts on each envelope** (`docs/reference/man-postures.md`): the boot
 * keeps the installed starts (`assets/research/posture-holds.json`); the bare rigid foot and open
 * hand start from the statics' barefoot witnesses (`research/man-postures.mjs`) of the rows the
 * installed starts came from, as placements (`docs/reference/man-postures.json`).
 *
 *   node research/man-posture-starts.mjs [--sweep research/runs/postures/envelopes.json]   (rewrites the record's starts)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { buildBody } from "../src/core/build/build-body.ts";
import { modelSpec } from "../src/core/models.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { AUDITED, envelopeSpec, posed, staticBody } from "./core-posture-trials.mjs";

const RECORD = new URL("../docs/reference/man-postures.json", import.meta.url);
/** How far above the ground a start is built, m, as the installed starts were. */
const LIFT = 0.0005;

/** The task's spec and start for `posture` on `envelope`: nothing for the boot, the barefoot witness's otherwise. */
export function postureStart(envelope, posture) {
  switch (envelope) {
    case "boot": return {};
    case "barefoot": {
      const start = JSON.parse(readFileSync(RECORD, "utf8")).starts.find((s) => s.id === posture && s.envelope === envelope);
      if (!start) throw new Error(`no ${envelope} start for ${posture}`);
      return { spec: envelopeSpec(modelSpec(AUDITED), envelope), placement: start.placement };
    }
    default: throw new Error(`no envelope ${envelope}`);
  }
}

/** A statics posture as a placement: the body frame `height` up, pitched then rolled, each freedom clamped to its range. */
function placementOf(body, posture) {
  const joints = Object.fromEntries(body.joints.map((joint) => [joint.spec.name, joint.dofs.map(() => 0)]));
  body.freedoms.forEach((f, i) => { joints[f.joint.spec.name][f.k] = Math.max(f.lo, Math.min(f.hi, posture.angles[i])); });
  return { position: [0, posture.height + LIFT, 0], rotation: Quaternion.RotationYawPitchRoll(0, posture.pitch, posture.roll).asArray(), joints };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { rows } = JSON.parse(readFileSync(RECORD, "utf8"));
  const at = process.argv.indexOf("--sweep");
  const sweep = JSON.parse(readFileSync(at < 0 ? new URL("./runs/postures/envelopes.json", import.meta.url) : process.argv[at + 1], "utf8"));
  const body = await staticBody(undefined, undefined, "barefoot");
  const starts = [];
  for (const { id, row } of rows) {
    const witness = sweep.best[`${row}|barefoot|box`];
    if (!witness?.held) throw new Error(`${row} holds nothing barefoot`);
    const placement = placementOf(body, witness.posture);
    // The placement built in a world of its own must put every segment where the statics posed it.
    posed(body, witness.posture);
    const scene = new Scene(new NullEngine()), world = createWorld(scene, await freshEngine());
    const built = buildBody(envelopeSpec(modelSpec(AUDITED), "barefoot"), world, placement);
    let apart = 0;
    for (const segment of body.segments) {
      const a = segment.node.position, b = built.segments.get(segment.spec.name).node.position;
      apart = Math.max(apart, Math.sqrt((a.x - b.x) ** 2 + (a.y + LIFT - b.y) ** 2 + (a.z - b.z) ** 2));
    }
    built.dispose(); world.dispose(); scene.dispose();
    if (apart > 1e-6) throw new Error(`${row}: the placement builds ${apart} m from the statics' posture`);
    starts.push({ id, model: AUDITED, envelope: "barefoot", source: { row, share: witness.share, margin: witness.margin }, placement });
    console.log(`${id}: ${row}, share ${witness.share.toFixed(3)}, built within ${apart.toExponential(1)} m`);
  }
  body.dispose();
  const record = JSON.parse(readFileSync(RECORD, "utf8"));
  writeFileSync(RECORD, JSON.stringify({ ...record, starts }, null, 1) + "\n");
}
