import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { local, type RobotDesign } from "./robot-geometry.ts";

/** Copper pressure vessels, brass fittings and iron mechanisms (docs/art/robots.md#steampunk). */
export const steampunkRobot: RobotDesign = {
  palette: {
    frame: { colour: "#272b29", metallic: .68, roughness: .54 },
    plate: { colour: "#914827", metallic: .72, roughness: .38 },
    edge: { colour: "#b48a43", metallic: .80, roughness: .32 },
    glass: { colour: "#173b38", metallic: .30, roughness: .18 },
    light: { colour: "#ffc66b", metallic: .10, roughness: .36, emission: .45 },
  },
  build({ name, segment, c, size, length, front, plate, bearing, orb, profile, pipe }) {
    if (name === "head") {
      const w = size.x * .91, h = length * .86, d = size.z * .82, at = new Vector3(0, length * .55, 0);
      bearing(new Vector3(0, length * .08, 0), w * .23, length * .23, "y", "frame");
      orb("edge", new Vector3(w, h, d), at);
      bearing(at.add(new Vector3(0, -h * .25, 0)), w * .43, h * .14, "y", "plate");
      for (const side of [-1, 1]) {
        const eye = at.add(new Vector3(side * w * .23, h * .08, d * .40));
        bearing(eye, w * .23, d * .22, "z", "frame");
        bearing(eye.add(new Vector3(0, 0, d * .12)), w * .20, d * .07, "z");
        bearing(eye.add(new Vector3(0, 0, d * .16)), w * .145, d * .025, "z", "glass");
        bearing(eye.add(new Vector3(-w * .045, w * .055, d * .177)), w * .035, d * .01, "z", "light");
      }
      for (const x of [-1, 0, 1]) bearing(at.add(new Vector3(x * w * .12, -h * .24, d * .42)), w * .035, h * .19, "y", "frame");
    } else if (name.endsWith("Trunk")) {
      const w = size.x * .91, h = length * .83, d = size.z * .87;
      bearing(new Vector3(0, length * .50, c.z), w * .21, length * 1.02, "y", "frame");
      if (name === "upperTrunk") {
        profile("plate", [[-h * .5, w * .62, d * .62], [-h * .36, w * .94, d * .92],
          [0, w, d], [h * .34, w * .86, d * .86], [h * .5, w * .55, d * .58]], c);
        for (const y of [-.3, .28]) profile("edge", [[h * (y - .035), w * .94, d * .94],
          [h * (y + .035), w * .94, d * .94]], c);
        const gauge = c.add(new Vector3(w * .06, -h * .05, front * d * .48));
        bearing(gauge, h * .25, d * .10, "z");
        bearing(gauge.add(new Vector3(0, 0, front * d * .06)), h * .20, d * .025, "z", "frame");
        const face = gauge.add(new Vector3(0, 0, front * d * .08));
        pipe("light", [face.add(new Vector3(-h * .07, h * .09, 0)), face.add(new Vector3(h * .09, -h * .09, 0))], h * .015);
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          bearing(gauge.add(new Vector3(Math.cos(angle) * h * .23, Math.sin(angle) * h * .23, front * d * .06)), h * .017, d * .025, "z", "frame");
        }
        for (const side of [-1, 1]) pipe("edge", [c.add(new Vector3(side * w * .30, -h * .44, front * d * .28)),
          c.add(new Vector3(side * w * .42, -h * .18, front * d * .34)),
          c.add(new Vector3(side * w * .42, h * .26, front * d * .28)),
          c.add(new Vector3(side * w * .28, h * .40, front * d * .23))], w * .028);
        for (const side of [-1, 1]) bearing(c.add(new Vector3(side * w * .28, 0, -front * d * .35)), w * .11, h * .93, "y", "frame");
      } else if (name === "middleTrunk") {
        for (let row = 0; row < 5; row++) {
          const y = h * (row / 4 - .5), width = w * (.69 - .10 * Math.abs(row - 2));
          profile("frame", [[y - h * .07, width, d * .68], [y + h * .07, width, d * .68]], c);
        }
        for (const side of [-1, 1]) pipe("edge", [c.add(new Vector3(side * w * .30, -h * .48, front * d * .20)),
          c.add(new Vector3(side * w * .33, 0, front * d * .37)), c.add(new Vector3(side * w * .24, h * .48, front * d * .24))], w * .043);
      } else {
        orb("plate", new Vector3(w, h * .96, d), c);
        bearing(c.add(new Vector3(0, 0, front * d * .44)), h * .27, d * .09, "z");
        for (const side of [-1, 1]) bearing(c.add(new Vector3(side * w * .42, 0, 0)), h * .39, w * .16, "x", "frame");
      }
    } else if (name.startsWith("foot.")) {
      const up = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2), h = size.z, d = size.y;
      profile("frame", [[-h * .49, size.x * .86, d * .93], [-h * .29, size.x * .98, d * .97]], c, up);
      profile("plate", [[-h * .29, size.x * .94, d * .95], [h * .08, size.x * .94, d * .90],
        [h * .41, size.x * .70, d * .67, -d * .08]], c, up);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) orb("edge", Vector3.One().scale(size.x * .07),
        c.add(new Vector3(side * size.x * .32, d * (-.29 + i * .19), -h * .15)));
    } else if (name.startsWith("hand.")) {
      const k = local(segment, segment.spec.points!.knuckles.value), little = local(segment, segment.spec.points!.little.value);
      const w = Math.abs(little.x - k.x) * 2.5, r = size.z / 2;
      orb("plate", new Vector3(w, k.y * .88, r * 1.6), new Vector3(k.x, k.y * .47, k.z));
      bearing(new Vector3(0, .005, 0), r * .78, r * 1.8, "y");
      const side = name.endsWith("right") ? 1 : -1;
      plate("edge", r * .70, k.y * .60, r * .60, new Vector3(k.x + side * w * .46, k.y * .74, k.z - r * .85));
    } else {
      const r = Math.min(size.x, size.z) / 2;
      bearing(new Vector3(0, length * .03, 0), r * .79, r * 1.8, "x", "frame");
      bearing(new Vector3(0, length * .93, 0), r * .58, r * 1.42, "x", "frame");
      profile("plate", [[length * .15, r * 1.12, r * 1.12], [length * .25, r * 1.72, r * 1.72],
        [length * .67, r * 1.56, r * 1.56], [length * .78, r * 1.10, r * 1.10]], Vector3.Zero());
      for (const y of [.25, .65]) bearing(new Vector3(0, length * y, 0), r * .88, length * .075, "y");
      for (const side of [-1, 1]) {
        pipe("frame", [new Vector3(side * r * .78, length * .22, front * r * .30), new Vector3(side * r * .78, length * .80, front * r * .30)], r * .16);
        pipe("edge", [new Vector3(side * r * .78, length * .51, front * r * .30), new Vector3(side * r * .78, length * .89, front * r * .30)], r * .085);
        for (const y of [.25, .65]) bearing(new Vector3(side * r * .82, length * y, 0), r * .09, r * .17);
      }
    }
  },
};
