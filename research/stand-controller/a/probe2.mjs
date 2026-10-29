import { trial, storedPosture } from "./ctl.mjs";
const seed = Number(process.argv[2] ?? 1), mode = process.argv[3] ?? "hold";
const out = await trial({ seed, trace: 6, cap: 0.8, controller: ({ spec }) => {
  const fours = storedPosture(spec, "fours");
  return { begin(c) { c.set(mode); }, step(g, c) {
    if (c.own.view?.time === undefined && c.t < 0.01) {}
    if (Math.round(c.view.time * 120) % 12 === 1) console.log(c.view.time.toFixed(2), c.spec.segments.map((s, i) => g.load[i] > .01 ? `${s.name}:${g.load[i].toFixed(2)}` : "").filter(Boolean).join(" "));
    if (mode === "hold") c.b.step({ share: { shin: .33, hand: .17 }, posture: fours, pitch: 1.3, height: null, response: .3 }, g);
    return null; } };
} });
