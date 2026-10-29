/**
 * Fork B: the statics' balanced deep squat on a raised ankle, placed on the world (direct), held by
 * the bearing solve on the feet alone (the squat's own posture, pitch and height, the centre of mass
 * aimed over the feet's middle) for `hold` s, then `handoff()`'s bridge (the stance eased toward the
 * combat fold) and Stand up's climb once quiet on flat feet. Node stand, core world, Rapier, 120 Hz.
 *
 *   node squat-hold.mjs --variant dorsi0.8 [--hold 1] [--response .3] [--rise .75] [--pitch .8|keep] [--ease .8] [--seeds 0-5] [--trace]
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { handoff } from "../handoff.mjs";

const { values } = parseArgs({ options: { variant: { type: "string" }, record: { type: "string" }, hold: { type: "string" }, response: { type: "string" }, rise: { type: "string" },
  pitch: { type: "string" }, ease: { type: "string" }, seeds: { type: "string" }, trace: { type: "boolean" }, from: { type: "string" }, height: { type: "string" }, jitter: { type: "string" } } });
const variant = values.variant ?? "dorsi0.8";
const records = JSON.parse(readFileSync(new URL(values.record ?? "../margin-workshop-fighter.json", import.meta.url), "utf8"));
const mine = records.filter((m) => m.variant === (values.from ?? variant) && m.rec.row === "hands and feet, hands light" && m.rec.held && m.rec.height < .4);
if (!mine.length) throw new Error(`no deep squat on ${values.from ?? variant}`);
const best = mine.reduce((a, b) => (b.rec.margin > a.rec.margin ? b : a));
console.log(`squat: ${best.variant} seed ${best.seed}, margin ${best.rec.margin}, centre ${best.rec.height}, pitch ${best.rec.pitch}, knee ${best.rec.angles["knee.right flexion"]}, ankle ${best.rec.angles["ankle.right dorsiflexion"]}`);
const ramp = { target: { angles: best.rec.angles, pitch: best.rec.pitch, height: Number(values.height ?? best.rec.height) }, standing: .98, seconds: Number(values.hold ?? 1), response: Number(values.response ?? .3), hands: [0] };
const [lo, hi] = (values.seeds ?? "0-5").split("-").map(Number);
for (let seed = lo; seed <= hi; seed++) {
  const out = await handoff({ model: "workshop-fighter", variant, posture: best.rec.posture, ramp, seed, forceDirect: true, ease: Number(values.ease ?? .8), hold: 2, settle: 0,
    rise: Number(values.rise ?? .75), pitchTo: values.pitch === "keep" ? null : Number(values.pitch ?? .8), jitter: Number(values.jitter ?? .03), trace: values.trace });
  if (out.rows) console.table(out.rows);
  const { rows: _r, standLog: _l, ...rest } = out;
  console.log(JSON.stringify({ seed, ...rest }));
}
