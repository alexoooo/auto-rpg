import { trial, storedPosture } from "./ctl.mjs";
const seed = Number(process.argv[2] ?? 1);
const out = await trial({ seed, trace: 12, cap: 1.5, controller: ({ spec }) => {
  const fours = storedPosture(spec, "fours");
  return { begin(c) { c.set("hold"); }, step(g, c) { c.b.step({ share: { shin: .33, hand: .17 }, posture: fours, pitch: 1.3, height: null, response: .3 }, g); return c.t > 1.2 ? "fail" : null; } };
} });
console.table(out.rows); const { rows, ...rest } = out; console.log(JSON.stringify(rest));
