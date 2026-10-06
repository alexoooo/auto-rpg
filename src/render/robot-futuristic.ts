import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { local, type RobotDesign } from "./robot-geometry.ts";

/** Swept ceramic armour over a graphite chassis (docs/art/robots.md#futuristic). */
export const futuristicRobot: RobotDesign = {
  palette: {
    frame: { colour: "#17222e", metallic: .42, roughness: .43 },
    plate: { colour: "#d6e1e5", metallic: .12, roughness: .27 },
    edge: { colour: "#506f82", metallic: .64, roughness: .32 },
    glass: { colour: "#071b29", metallic: .35, roughness: .14 },
    light: { colour: "#29cfe5", metallic: .05, roughness: .32, emission: .60 },
  },
  build({ name, segment, c, size, length, front, plate, bearing, orb, profile, pipe }) {
    if (name === "head") {
      const w = size.x * .88, h = length * .88, d = size.z * .78, at = new Vector3(0, length * .54, 0);
      bearing(new Vector3(0, length * .08, 0), w * .20, length * .26, "y", "frame");
      profile("plate", [[-h * .5, w * .35, d * .45, d * .12], [-h * .30, w * .73, d * .77, d * .05],
        [h * .10, w, d], [h * .36, w * .88, d * .86], [h * .5, w * .42, d * .42]], at);
      orb("glass", new Vector3(w * .89, h * .32, d * .40), at.add(new Vector3(0, h * .09, d * .35)));
      pipe("light", [at.add(new Vector3(-w * .31, h * .10, d * .49)), at.add(new Vector3(0, h * .07, d * .553)),
        at.add(new Vector3(w * .31, h * .10, d * .49))], h * .012);
      for (const side of [-1, 1]) orb("edge", new Vector3(w * .07, h * .25, d * .30), at.add(new Vector3(side * w * .45, 0, 0)));
    } else if (name.endsWith("Trunk")) {
      const w = size.x * .94, h = length * .87, d = size.z * .87;
      profile("frame", [[0, w * .30, d * .42], [length, w * .30, d * .42]], new Vector3(0, 0, c.z));
      if (name === "upperTrunk") {
        profile("plate", [[-h * .50, w * .74, d * .60], [-h * .32, w, d * .96], [h * .05, w * .91, d],
          [h * .38, w * .58, d * .71], [h * .50, w * .44, d * .48]], c);
        const z = front * d * .475;
        pipe("edge", [c.add(new Vector3(-w * .34, -h * .20, z)), c.add(new Vector3(0, h * .21, front * d * .49)),
          c.add(new Vector3(w * .34, -h * .20, z))], w * .019);
        pipe("light", [c.add(new Vector3(-w * .21, -h * .05, front * d * .50)), c.add(new Vector3(0, h * .17, front * d * .511)),
          c.add(new Vector3(w * .21, -h * .05, front * d * .50))], w * .009);
        for (const side of [-1, 1]) orb("edge", new Vector3(w * .16, h * .60, d * .17), c.add(new Vector3(side * w * .28, 0, -front * d * .43)));
      } else if (name === "middleTrunk") {
        for (let row = 0; row < 3; row++) {
          const y = h * (row - 1) * .28, width = w * (.43 + row * .07);
          profile("plate", [[y - h * .13, width * .76, d * .40], [y - h * .04, width, d * .63],
            [y + h * .13, width * .87, d * .47]], c);
        }
      } else {
        profile("frame", [[-h * .42, w * .57, d * .68], [h * .40, w * .80, d * .69]], c);
        for (const side of [-1, 1]) orb("plate", new Vector3(w * .40, h * .95, d * .85), c.add(new Vector3(side * w * .29, 0, 0)));
        profile("plate", [[-h * .34, w * .43, d * .39], [0, w * .35, d * .66], [h * .38, w * .13, d * .29]],
          c.add(new Vector3(0, 0, front * d * .16)));
      }
    } else if (name.startsWith("foot.")) {
      const up = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2), h = size.z, d = size.y;
      profile("frame", [[-h * .48, size.x * .64, d * .89], [-h * .28, size.x * .88, d * .97]], c, up);
      profile("plate", [[-h * .28, size.x * .84, d * .94], [h * .05, size.x * .80, d * .78, -d * .035],
        [h * .43, size.x * .53, d * .40, -d * .16]], c, up);
      pipe("light", [c.add(new Vector3(-size.x * .28, d * .35, h * .17)),
        c.add(new Vector3(0, d * .48, h * .17)), c.add(new Vector3(size.x * .28, d * .35, h * .17))], size.x * .017);
    } else if (name.startsWith("hand.")) {
      const k = local(segment, segment.spec.points!.knuckles.value), little = local(segment, segment.spec.points!.little.value);
      const w = Math.abs(little.x - k.x) * 2.5, r = size.z / 2;
      profile("plate", [[k.y * .10, w * .56, r], [k.y * .55, w, r * 1.6], [k.y * .86, w * .84, r]], new Vector3(k.x, 0, k.z));
      bearing(new Vector3(0, .005, 0), r * .65, r * 1.75, "y", "frame");
      const side = name.endsWith("right") ? 1 : -1;
      plate("plate", r * .62, k.y * .60, r * .55, new Vector3(k.x + side * w * .46, k.y * .74, k.z - r * .85), .6, .30);
    } else {
      const r = Math.min(size.x, size.z) / 2;
      orb("frame", new Vector3(r * 1.52, r * 1.45, r * 1.52), new Vector3(0, length * .04, 0));
      profile("frame", [[length * .10, r * .68, r * .73], [length * .91, r * .59, r * .64]], Vector3.Zero());
      profile("plate", [[length * .13, r * .93, r * .74], [length * .26, r * 1.87, r * 1.70],
        [length * .52, r * 1.49, r * 1.33, front * r * .06], [length * .79, r * .72, r * .66, front * r * .16],
        [length * .88, r * .39, r * .30, front * r * .15]], Vector3.Zero());
      pipe("edge", [new Vector3(r * .59, length * .28, front * r * .56), new Vector3(r * .42, length * .55, front * r * .54),
        new Vector3(r * .15, length * .79, front * r * .44)], r * .055);
      pipe("light", [new Vector3(-r * .36, length * .31, front * r * .78), new Vector3(-r * .25, length * .47, front * r * .69)], r * .036);
      orb("frame", Vector3.One().scale(r * 1.1), new Vector3(0, length * .96, 0));
    }
  },
};
