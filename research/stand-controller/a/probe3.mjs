import { trial, storedPosture } from "./ctl.mjs";
const seed = Number(process.argv[2] ?? 1), resp = Number(process.argv[3] ?? .3), pitch = Number(process.argv[4] ?? 1.3);
const out = await trial({ seed, trace: 6, cap: 1.6, controller: ({ spec }) => {
  const fours = storedPosture(spec, "fours"); let landed = 0;
  return { begin(c) { c.set("land"); }, step(g, c, dt) {
    const L = g.load, shin = L[c.ix.shank[0]] + L[c.ix.shank[1]], hand = c.ix.hand.reduce((s, i) => s + L[i], 0);
    if (c.state === "land") { c.drive(fours, .2, 4, 1); landed = shin > .3 && hand > .1 ? landed + dt : 0; if (landed > .05) { c.b.begin(g); c.set("hold"); } return c.t > 1 ? "fail" : null; }
    c.b.step({ share: { shin: .33, hand: .17 }, posture: fours, pitch, height: null, response: resp }, g, dt);
    return c.t > 1 ? "fail" : null; } };
} });
console.table(out.rows.filter((r,i)=>i%2===1)); const { rows, ...rest } = out; console.log(JSON.stringify(rest));
