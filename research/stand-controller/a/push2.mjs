/**
 * The push with the hands walked back: land (pose drive in fours until the shins and hands bear), back (the
 * weight over the knees), feet (the shins' share onto the feet: hands and feet), walk (one hand at a time
 * unloaded, carried a step toward the feet and set down, the hips raised and the legs straightened toward
 * the pike, until the weight is over the soles), push (the hands' share in proportion to how far the
 * weight is outside the soles), then the stance bridge once a capture test holds.
 *   node push2.mjs [seeds] [--trace] [json overrides]
 */
import { readFileSync } from "node:fs";
import { trial, storedPosture, mix } from "./ctl.mjs";

export const P = { backTime: .5, feetTime: .6, step: .14, lift: .07, unload: .12, moveRate: 9, walkMax: 4, handGap: .42,
  pitch: 1.35, height: null, handOut: .12, pushTime: 1.2, release: .85, capture: .25, capOut: .0 };
const pike = (() => { const r = JSON.parse(readFileSync(new URL("../margin-workshop-fighter.json", import.meta.url), "utf8"))
  .filter((m) => m.variant === "built" && m.rec.row === "hands and feet, hands light" && m.rec.held).sort((a, b) => b.rec.margin - a.rec.margin)[0]; return r.rec.angles; })();
const sum = (L, ix) => ix.reduce((s, i) => s + L[i], 0);
const soleMiddle = (g) => { let x = 0, z = 0, n = 0; for (const s of g.soles) for (const q of s.corners) { x += q.x; z += q.z; n++; } return [x / n, z / n]; };
const HAND = [1, 4], FOOT = [2, 5];

export const pushController = (p) => ({ spec }) => {
  const fours = storedPosture(spec, "fours"), squat = storedPosture(spec, "squat"), deep = mix(fours, squat, .6), piked = { ...fours, ...pike };
  let landed = 0, hand = 0, sub = "unload", subT = 0, target = null, steps = 0, gap0 = null;
  const shares = (h, k) => { const s = [0, .2, .3, 0, .2, .3]; if (h !== null) s[HAND[h]] = .2 * (1 - k); return s; };
  return { begin(c) { c.set("land"); },
    step(g, c, dt) {
      const L = g.load, shin = sum(L, c.ix.shank), feet = g.footLoad[0] + g.footLoad[1], made = c.b.made;
      const out = c.outside(g.centre.x, g.centre.z), [mx, mz] = soleMiddle(g);
      switch (c.state) {
        case "land":
          c.drive(fours, .2, 4, 1); landed = shin > .3 && sum(L, c.ix.hand) > .1 ? landed + dt : 0;
          if (landed > .05) { c.b.begin(g); c.set("back"); }
          return c.t > 1 ? "fail" : null;
        case "back":
          c.b.step({ share: { shin: .4, hand: .1, foot: .05 }, posture: mix(fours, deep, Math.min(1, c.t / p.backTime)), pitch: 1.2, height: null, toward: .15, response: .35 }, g, dt);
          if (c.t > p.backTime) c.set("feet");
          return null;
        case "feet": {
          const k = Math.min(1, c.t / p.feetTime);
          c.b.step({ share: { shin: .4 * (1 - k), hand: .2, foot: .1 + .3 * k }, posture: mix(deep, piked, .3 * k), pitch: 1.2, height: null, response: .3 }, g, dt);
          if (k >= 1 && shin < .05 && feet > .3) { c.set("walk"); sub = "unload"; subT = 0; }
          return c.t > p.feetTime + 1 ? "fail" : null;
        }
        case "walk": {
          subT += dt;
          // How far the hands are from the feet along the ground, the walk's progress toward the pike's gap.
          const hx = (made.over[1].x + made.over[4].x) / 2, hz = (made.over[1].z + made.over[4].z) / 2, gap = Math.hypot(hx - mx, hz - mz);
          gap0 ??= gap;
          const k = Math.min(1, Math.max(0, (gap0 - gap) / Math.max(.05, gap0 - p.handGap)));
          const aim = { shares: shares(null, 0), posture: mix(mix(deep, piked, .3), piked, k), pitch: 1.2 + (p.pitch - 1.2) * k, height: null, response: .3 };
          const h = HAND[hand];
          if (sub === "unload") { aim.shares = shares(hand, Math.min(1, subT / p.unload)); if (subT >= p.unload) { sub = "move"; subT = 0; const at = made.over[h], dx = mx - at.x, dz = mz - at.z, d = Math.hypot(dx, dz); target = [at.x + dx / d * p.step, at.z + dz / d * p.step]; } }
          if (sub === "move" || sub === "plant") {
            aim.shares = shares(hand, 1);
            const at = made.over[h], near = Math.hypot(at.x - target[0], at.z - target[1]);
            if (sub === "move" && near < .03) sub = "plant";
            aim.moves = { [h]: [target[0], sub === "move" ? g.centre.y * 0 + made.over[h].y * 0 + (made.over[FOOT[0]].y + p.lift) : made.over[FOOT[0]].y - .03, target[1], p.moveRate] };
            if (sub === "plant" && at.y - Math.min(made.over[2].y, made.over[5].y) < .015) { sub = "load"; subT = 0; }
            if (subT > .8) return "fail";
          }
          if (sub === "load") { aim.shares = shares(hand, 1 - Math.min(1, subT / p.unload)); if (subT >= p.unload) { steps++; hand = 1 - hand; sub = "unload"; subT = 0; } }
          c.b.step(aim, g, dt);
          if (sub === "unload" && subT === dt && (gap <= p.handGap || out < .02)) c.set("push");
          return steps > 2 * p.walkMax ? "fail" : null;
        }
        case "push": {
          const hs = .2 * Math.min(1, out / p.handOut);
          c.b.step({ shares: [0, hs, .3, 0, hs, .3], posture: piked, pitch: p.pitch, height: null, place: [mx, mz], response: .3 }, g, dt);
          const cx = g.centre.x + g.velocity.x * p.capture, cz = g.centre.z + g.velocity.z * p.capture;
          if (feet >= p.release && g.flat[0] && g.flat[1] && c.outside(cx, cz) <= p.capOut) return "bridge";
          return c.t > p.pushTime ? "fail" : null;
        }
      }
      return "fail";
    } };
};
if (process.argv[1]?.endsWith("push2.mjs")) {
  const args = process.argv.slice(2), trace = args.includes("--trace"), seeds = (args.find((a) => /^\d/.test(a)) ?? "1-4").split("-").map(Number);
  const over = JSON.parse(args.find((a) => a.startsWith("{")) ?? "{}"), p = { ...P, ...over };
  for (let s = seeds[0]; s <= (seeds[1] ?? seeds[0]); s++) {
    const out = await trial({ seed: s, trace: trace ? 6 : 0, controller: pushController(p), model: process.env.MODEL ?? "workshop-fighter", held: process.env.HELD ?? "empty" });
    if (out.rows) console.table(out.rows.filter((r, i) => i % 2 === 0));
    const { rows, ...rest } = out; console.log(JSON.stringify(rest));
  }
}
