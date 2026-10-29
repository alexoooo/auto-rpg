/**
 * The push as a rock back: land (pose drive in fours until the shins and hands bear), rock (on the shins and
 * hands, the weight driven toward the feet at a speed, low), onto (the shins' share onto the feet once the
 * weight is near them), up (on the feet, the hands' share in proportion to how far the weight is outside the
 * soles, the body raised toward the fold), then the stance bridge once a capture test holds. Transitions read
 * the body: `s`, how far the weight is ahead of the soles' middle along the way from the hands to the feet.
 *   node push3.mjs [seeds] [--trace] [json overrides]
 */
import { trial, storedPosture, mix } from "./ctl.mjs";

export const P = { rockV: 1.0, rockH: .3, rockResp: .35, rockShin: .5, rockHand: .2, sOnto: .2, rockMax: 1.6, rockBeyond: 0,
  ontoResp: .25, ontoV: .3, ontoMax: .6, ontoHand: .15,
  upResp: .3, upH: .6, upTime: .8, upPitch: 1.0, handOut: .1, upMax: 2, release: .8, capture: .25, capOut: .0, sTarget: .0, upHandMin: 0, upFold: 1, rockPitch: 1.2, anyFoot: false, slowRelease: 9, tuck: true, tuckAnkle: .1, tuckSole: .4, tuckMax: .8 };
const sum = (L, ix) => ix.reduce((s, i) => s + L[i], 0);
const soleMiddle = (g) => { let x = 0, z = 0, n = 0; for (const s of g.soles) for (const q of s.corners) { x += q.x; z += q.z; n++; } return [x / n, z / n]; };

export const pushController = (p) => ({ spec, fold }) => {
  const fours = storedPosture(spec, "fours"), squat = storedPosture(spec, "squat"), deep = mix(fours, squat, .6);
  let landed = 0, u = null, h0 = 0;
  const tucked = (q) => p.tuck ? { ...q, "ankle.left dorsiflexion": p.tuckAnkle, "ankle.right dorsiflexion": p.tuckAnkle } : q;
  return { begin(c) { c.set("land"); },
    step(g, c, dt) {
      const L = g.load, shin = sum(L, c.ix.shank), hand = sum(L, c.ix.hand), feet = g.footLoad[0] + g.footLoad[1], made = c.b.made;
      const [mx, mz] = soleMiddle(g);
      if (u) c.control.s = c.s = (g.centre.x - mx) * -u[0] + (g.centre.z - mz) * -u[1];
      const place = [mx - u?.[0] * p.sTarget, mz - u?.[1] * p.sTarget];
      switch (c.state) {
        case "land": {
          c.drive(fours, .2, 4, 1); landed = shin > .3 && hand > .1 ? landed + dt : 0;
          if (landed > .05) {
            c.b.begin(g);
            const hl = c.own.built.segments.get("hand.left").node.position, hr = c.own.built.segments.get("hand.right").node.position, hx = (hl.x + hr.x) / 2, hz = (hl.z + hr.z) / 2;
            let ux = mx - hx, uz = mz - hz; const d = Math.hypot(ux, uz); u = [ux / d, uz / d];
            c.b.orient.toward.set(u[0], 0, u[1]);
            c.set(p.tuck ? "tuck" : "rock");
          }
          return c.t > 1 ? "fail" : null;
        }
        case "tuck": {
          // The toes tucked under: the ankles brought up until both soles stand near vertical, the knees and hands bearing.
          c.b.step({ share: { shin: .4, hand: .2 }, posture: tucked(fours), pitch: 1.2, height: null, response: .35 }, g, dt);
          if (Math.abs(g.sole[0]) < p.tuckSole && Math.abs(g.sole[1]) < p.tuckSole && c.t > .1) c.set("rock");
          return c.t > p.tuckMax ? "fail" : null;
        }
        case "rock":
          c.b.step({ share: { shin: p.rockShin, hand: p.rockHand, foot: .05 }, posture: tucked(mix(fours, deep, Math.min(1, c.t / .4))), pitch: p.rockPitch, height: p.rockH, place: [mx + u[0] * p.rockBeyond, mz + u[1] * p.rockBeyond], along: p.rockV, response: p.rockResp }, g, dt);
          if (c.s < p.sOnto) c.set("onto");
          return c.t > p.rockMax ? "fail" : null;
        case "onto": {
          const k = Math.min(1, c.t / .2);
          c.b.step({ share: { shin: p.rockShin * (1 - k), hand: p.ontoHand, foot: .1 + .4 * k }, posture: tucked(deep), pitch: p.rockPitch, height: null, place, along: p.ontoV, response: p.ontoResp }, g, dt);
          if (k >= 1 && shin < .05 && feet > .5) { c.set("up"); h0 = g.height; }
          return c.t > p.ontoMax ? "fail" : null;
        }
        case "up": {
          const out = c.outside(g.centre.x, g.centre.z), k = Math.min(1, c.t / p.upTime), hs = Math.max(p.upHandMin, p.ontoHand * Math.min(1, out / p.handOut));
          c.b.step({ share: { hand: hs, foot: .5 }, posture: mix(tucked(deep), fold, k * p.upFold), pitch: p.rockPitch + (p.upPitch - p.rockPitch) * k, height: p.upH === null ? null : h0 + (p.upH - h0) * k, place, along: 0, response: p.upResp }, g, dt);
          const cx = g.centre.x + g.velocity.x * p.capture, cz = g.centre.z + g.velocity.z * p.capture;
          if (feet >= p.release && (p.anyFoot || (g.flat[0] && g.flat[1])) && c.outside(cx, cz) <= p.capOut && g.velocity.length() < p.slowRelease) return "bridge";
          return c.t > p.upMax ? "fail" : null;
        }
      }
      return "fail";
    } };
};
if (process.argv[1]?.endsWith("push3.mjs")) {
  const args = process.argv.slice(2), trace = args.includes("--trace"), seeds = (args.find((a) => /^\d/.test(a)) ?? "1-4").split("-").map(Number);
  const over = JSON.parse(args.find((a) => a.startsWith("{")) ?? "{}"), p = { ...P, ...over };
  for (let s = seeds[0]; s <= (seeds[1] ?? seeds[0]); s++) {
    const out = await trial({ seed: s, trace: trace ? 6 : 0, controller: pushController(p), model: process.env.MODEL ?? "workshop-fighter", held: process.env.HELD ?? "empty" });
    if (out.rows) console.table(out.rows.filter((r, i) => i % 2 === 0));
    const { rows, ...rest } = out; console.log(JSON.stringify(rest));
  }
}
