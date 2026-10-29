/**
 * Fork B: how far forward a flat-footed deep squat's centre of mass can go. From the statics' best
 * no-hands squat at `height` (squat-statics.mjs, share cap 0.6), the trunk and arms leaned further
 * forward by named freedoms, each posture put back on its ground (`statics`, which moves every knob
 * least to keep both soles down at the row's height), then read: ground fit, overlap, balanced and the
 * muscles' share, margin, and the centre's offset ahead of the soles' middle (+z, the body's front).
 *
 *   node lean-sweep.mjs [variant] [height]
 */
import "../../../tests/harness/preload-data.mjs";
import { readFileSync } from "node:fs";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { staticBody, statics, rowNamed, recordOf } from "../../../research/core-posture-trials.mjs";

/** The body's centre of mass as posed: each segment's centre (its rigid's, in the segment's frame) turned and placed by its node, mass-weighted. */
function centreOfMass(body) {
  const out = new Vector3(), v = new Vector3();
  for (const s of body.segments) { const c = s.rigid.centre; v.set(c[0], c[1], c[2]).applyRotationQuaternionInPlace(s.node.rotationQuaternion).addInPlace(s.node.position); out.addInPlace(v.scale(s.rigid.mass)); }
  return out.scaleInPlace(1 / body.mass);
}
import { variantSpec, cappedSpec } from "../bodies.mjs";

const variant = process.argv[2] ?? "dorsi0.8", height = Number(process.argv[3] ?? .45);
const records = JSON.parse(readFileSync(new URL("./squat-workshop-fighter.json", import.meta.url), "utf8"));
const base = records.filter((m) => m.variant === variant && m.height === height && m.rec.held).reduce((a, b) => (b.rec.margin > a.rec.margin ? b : a)).rec;
const body = await staticBody(cappedSpec(variantSpec("workshop-fighter", variant)));
const row = rowNamed("squat");
const index = (name) => body.freedoms.findIndex((f) => f.name === name);
const both = (name) => [index(name.replace("@", "left")), index(name.replace("@", "right"))];
const read = async (posture, label) => {
  const r = statics(body, row, posture, { height }), rec = recordOf(body, row, r, { height, variant });
  const a = (n) => rec.angles[n];
  console.log(JSON.stringify({ label, found: rec.found, overlap: rec.overlap.depth, between: rec.overlap.between, balanced: rec.balanced, share: rec.share, margin: rec.margin, pitch: rec.pitch,
    ankle: a("ankle.right dorsiflexion"), knee: a("knee.right flexion"), hip: a("hip.right flexion"), lumbar: a("lumbar flexion"), thoracic: a("thoracic flexion"), shoulder: a("shoulder.right flexion") }));
  if (process.env.SAVE === label) { const { writeFileSync } = await import("node:fs"); writeFileSync(new URL(`./posture-${variant}-${height}-${label.replace(/[^a-z0-9.]+/gi, "_")}.json`, import.meta.url), JSON.stringify({ variant, label, rec })); }
  return r;
};
console.log(`${variant} squat @ ${height} m: record margin ${base.margin}, share ${base.share}`);
await read(base.posture, "record");
const tweak = (deltas) => { const angles = [...base.posture.angles]; for (const [name, d] of deltas) for (const i of name.includes("@") ? both(name) : [index(name)]) angles[i] = Math.min(body.freedoms[i].hi, Math.max(body.freedoms[i].lo, angles[i] + d)); return { ...base.posture, angles }; };
for (const d of [.2, .4, .6, .8]) await read(tweak([["hip.@ flexion", d]]), `hip +${d}`);
for (const d of [.2, .4]) await read(tweak([["thoracic flexion", d], ["lumbar flexion", d]]), `spine +${d}`);
for (const s of [1, 1.5, 2]) await read(tweak([["shoulder.@ flexion", s - (base.posture.angles[index("shoulder.right flexion")] + body.freedoms[index("shoulder.right flexion")].bind)]]), `arms to ${s}`);
for (const d of [.3, .6]) await read(tweak([["hip.@ flexion", d], ["shoulder.@ flexion", 1.5 - (base.posture.angles[index("shoulder.right flexion")] + body.freedoms[index("shoulder.right flexion")].bind)]]), `hip +${d}, arms 1.5`);
body.dispose();
