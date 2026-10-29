import { deepTrial, deepSquat, feetFrame } from "./deep.mjs";
const squat = deepSquat("dorsi0.8");
let printed = 0;
await deepTrial({ variant: "dorsi0.8", control: "stance", seed: 0, seconds: .9, squat, onStep(world, g, built) {
  if (Math.round(world.time * 120) % 12 !== 0) return;
  const f = feetFrame(built, g), corners = g.soles.flatMap((s) => s.corners), mx = corners.reduce((a, c) => a + c.x, 0) / corners.length, mz = corners.reduce((a, c) => a + c.z, 0) / corners.length;
  const along = (p) => +((p.x - mx) * f.fwd.x + (p.z - mz) * f.fwd.z).toFixed(3);
  const seg = (n) => built.segments.get(n).node.position;
  console.log(JSON.stringify({ t: +world.time.toFixed(2), lead: +f.lead.toFixed(3), handL: along(seg("hand.left")), head: along(seg("head")), knee: along(seg("shank.left")), pelvis: along(seg("lowerTrunk")), handY: +seg("hand.left").y.toFixed(3), load: Array.from(g.load).map((v, i) => [built.spec.segments[i].name, +v.toFixed(2)]).filter(([, v]) => v > .02) }));
} });
