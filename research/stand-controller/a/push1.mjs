/**
 * The push, closed loop: land (pose drive in fours until the shins and hands bear), back (the weight over the knees),
 * feet (the shares moved from the shins onto the feet, the knees deep), rise (the hands' share to none, the body up toward
 * the fold's height over the soles), then the stance bridge. Parameters by `P`.
 *   node push1.mjs [seeds] [--trace] [json overrides]
 */
import { trial, storedPosture, mix } from "./ctl.mjs";
export const P = { backResp: .35, backToward: .15, backTime: .6, feetResp: .3, feetTime: .8, feetHand: .2, rise: .62, riseResp: .35, riseTime: 1.2, risePitch: .9, release: .85, capture: .25, capOut: .01, handOut: .15 };
const soleMiddle = (g) => { let x = 0, z = 0, n = 0; for (const s of g.soles) for (const q of s.corners) { x += q.x; z += q.z; n++; } return [x / n, z / n]; };
const sum = (L, ix) => ix.reduce((s, i) => s + L[i], 0);
export const pushController = (p) => ({ spec, fold }) => {
  const fours = storedPosture(spec, "fours"), squat = storedPosture(spec, "squat"), deep = mix(fours, squat, .6);
  let landed = 0, up0 = 0, hgt0 = .45;
  return { begin(c) { c.set("land"); },
    step(g, c, dt) {
      const L = g.load, shin = sum(L, c.ix.shank), hand = sum(L, c.ix.hand), feet = g.footLoad[0] + g.footLoad[1];
      switch (c.state) {
        case "land":
          c.drive(fours, .2, 4, 1); landed = shin > .3 && hand > .1 ? landed + dt : 0;
          if (landed > .05) { c.b.begin(g); c.set("back"); }
          return c.t > 1 ? "fail" : null;
        case "back":
          c.b.step({ share: { shin: .4, hand: .1, foot: .05 }, posture: mix(fours, deep, Math.min(1, c.t / p.backTime)), pitch: 1.2, height: null, toward: p.backToward, response: p.backResp }, g, dt);
          if (c.t > p.backTime) c.set("feet");
          return null;
        case "feet": {
          const k = Math.min(1, c.t / p.feetTime), [mx, mz] = soleMiddle(g);
          c.b.step({ share: { shin: .4 * (1 - k), hand: p.feetHand, foot: .1 + .4 * k }, posture: mix(deep, squat, k), pitch: 1.1, height: null, place: k > .5 ? [mx, mz] : null, toward: k > .5 ? 0 : .3 * k, response: p.feetResp }, g, dt);
          if (k >= 1 && shin < .05) { c.set("rise"); up0 = 0; hgt0 = g.height; }
          return c.t > p.feetTime + 1 ? "fail" : null;
        }
        case "rise": {
          const [mx, mz] = soleMiddle(g), out = c.outside(g.centre.x, g.centre.z);
          // The hands bear in proportion to how far the weight is outside the soles; the body rises only once it is over them.
          const hs = p.feetHand * Math.min(1, out / p.handOut), up = out < .03 ? Math.min(1, (up0 += dt / p.riseTime)) : up0;
          c.b.step({ share: { hand: hs, foot: .5 }, posture: mix(squat, fold, up), pitch: 1.1 + (p.risePitch - 1.1) * up, height: null, ...(up > 0 ? { height: hgt0 + (p.rise - hgt0) * up } : {}), place: [mx, mz], toward: 0, response: p.riseResp }, g, dt);
          const cx = g.centre.x + g.velocity.x * p.capture, cz = g.centre.z + g.velocity.z * p.capture;
          if (feet >= p.release && g.flat[0] && g.flat[1] && c.outside(cx, cz) <= p.capOut) return "bridge";
          return c.t > p.riseTime + 1 ? "fail" : null;
        }
      }
      return "fail";
    } };
};
if (process.argv[1]?.endsWith("push1.mjs")) {
  const args = process.argv.slice(2), trace = args.includes("--trace"), seeds = (args.find((a) => /^\d/.test(a)) ?? "1-4").split("-").map(Number);
  const over = JSON.parse(args.find((a) => a.startsWith("{")) ?? "{}"), p = { ...P, ...over };
  for (let s = seeds[0]; s <= (seeds[1] ?? seeds[0]); s++) {
    const out = await trial({ seed: s, trace: trace ? 6 : 0, controller: pushController(p), model: process.env.MODEL ?? "workshop-fighter", held: process.env.HELD ?? "empty" });
    if (out.rows) console.table(out.rows.filter((r, i) => i % 2 === 0));
    const { rows, ...rest } = out; console.log(JSON.stringify(rest));
  }
}
