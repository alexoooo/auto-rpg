import { trial, storedPosture } from "./ctl.mjs";
const resp = Number(process.argv[2] ?? .3);
let n = 0;
const out = await trial({ seed: 1, cap: .5, controller: ({ spec }) => {
  const fours = storedPosture(spec, "fours"); let landed = 0;
  return { begin(c) { c.set("land"); }, step(g, c, dt) {
    const L = g.load, shin = L[c.ix.shank[0]] + L[c.ix.shank[1]], hand = c.ix.hand.reduce((s, i) => s + L[i], 0);
    if (c.state === "land") { c.drive(fours, .2, 4, 1); landed = shin > .3 && hand > .1 ? landed + dt : 0; if (landed > .05) { c.b.begin(g); c.set("hold"); } return null; }
    const bore = c.b.step({ share: { shin: .33, hand: .17 }, posture: fours, pitch: 1.3, height: null, response: resp }, g);
    if (n++ < 4) console.log(c.view.time.toFixed(3), "bore", bore, "v", [...c.own.muscles.velocity].slice(0, 6).map(v => v.toFixed(2)).join(","), "a", [...c.own.muscles.activation].slice(0, 6).map(v => v.toFixed(2)).join(","));
    return null; } };
} });
