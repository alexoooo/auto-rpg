import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { housing, local, type RobotDesign } from "./robot-geometry.ts";

/** Industrial's box housings and finishes (docs/art/robots.md#industrial). */
export const industrialRobot: RobotDesign = {
  palette: {
    frame: { colour: "#242d33", metallic: .78, roughness: .58 },
    plate: { colour: "#9c7439", metallic: .22, roughness: .48 },
    edge: { colour: "#70797c", metallic: .78, roughness: .48 },
    light: { colour: "#ffb64b", metallic: .1, roughness: .48, emission: .75, unlit: true },
  },
  build({ name, segment, c, size, length, front, add, plate, bearing }) {
    const design = { taper: .90, coverage: .84, bevel: .12 };
    if (name === "head") {
      const w = size.x * .85, h = length * .72, d = size.z * .72, at = new Vector3(0, length * .57, 0);
      bearing(new Vector3(0, length * .1, 0), w * .25, length * .22, "y", "frame");
      plate("plate", w, h, d, at, design.taper);
      bearing(at, h * .22, w * 1.03);
      bearing(at.add(new Vector3(0, .015, d * .51)), w * .29, d * .13, "z", "frame");
      bearing(at.add(new Vector3(0, .015, d * .60)), w * .18, d * .025, "z", "light");
      plate("edge", w * .50, h * .12, d * .09, at.add(new Vector3(0, -h * .28, d * .51)));
    } else if (name.endsWith("Trunk")) {
      const w = size.x * .86, h = length * .84, d = size.z * .80;
      plate("frame", w * .52, length * 1.04, d * .62, new Vector3(0, length * .5, c.z));
      for (const side of [-1, 1]) bearing(new Vector3(side * w * .21, length * .50, c.z), w * .055, length * .97, "y");
      add("plate", housing(w, h, d, design.bevel, design.taper), c,
        name === "lowerTrunk" ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI));
      for (const side of [-1, 1]) {
        plate("edge", w * .055, h * .68, d * .08, c.add(new Vector3(side * w * .38, 0, front * d * .49)));
      }
      if (name === "upperTrunk") {
        plate("frame", w * .44, h * .34, d * .09, c.add(new Vector3(0, 0, front * d * .49)));
        plate("light", w * .23, h * .05, d * .1, c.add(new Vector3(0, 0, front * d * .5)));
        for (let row = 0; row < 3; row++) plate("edge", w * .24, h * .034, d * .07,
          c.add(new Vector3(0, h * (.23 + row * .09), -front * d * .5)));
      } else if (name === "middleTrunk") {
        for (let row = 0; row < 3; row++) plate("edge", w * .40, h * .08, d * .10,
          c.add(new Vector3(0, h * (row - 1) * .23, front * d * .49)));
      } else {
        plate("edge", w * .80, h * .15, d * .90, c.add(new Vector3(0, -h * .25, 0)));
      }
    } else if (name.startsWith("foot.")) {
      plate("frame", size.x * .97, size.y * .98, size.z * .32, c.add(new Vector3(0, 0, size.z * .32)));
      plate("plate", size.x * .91, size.y * .92, size.z * .72, c.add(new Vector3(0, 0, -size.z * .10)), .78);
      for (let i = 0; i < 3; i++) plate("edge", size.x * .80, size.y * .045, size.z * .04,
        c.add(new Vector3(0, size.y * (.13 + .10 * i), -size.z * .47)));
    } else if (name.startsWith("hand.")) {
      const hand = name.endsWith("right") ? "right" : "left", k = local(segment, segment.spec.points!.knuckles.value);
      const little = local(segment, segment.spec.points!.little.value), halfWidth = Math.abs(little.x - k.x) * 1.20;
      const radius = segment.spec.shape.kind === "capsule" ? segment.spec.shape.radius.value : size.z / 2;
      plate("plate", halfWidth * 2.2, k.y * .78, radius * 1.5, new Vector3(k.x, k.y * .51, k.z));
      bearing(new Vector3(0, .005, 0), radius * .75, radius * 1.9, "y");
      const thumbSide = hand === "right" ? 1 : -1;
      plate("edge", radius * .70, k.y * .60, radius * .60,
        new Vector3(k.x + thumbSide * halfWidth, k.y * .74, k.z - radius * .85));
    } else {
      const r = Math.min(size.x, size.z) / 2;
      bearing(new Vector3(0, length * .02, 0), r * .68, r * 1.82);
      bearing(new Vector3(0, length * .94, 0), r * .51, r * 1.42, "x", "frame");
      plate("frame", r * .82, length * .86, r * .84, new Vector3(0, length * .50, 0));
      add("plate", housing(r * 1.76, length * design.coverage, r * 1.65, design.bevel, design.taper),
        new Vector3(0, length * .50, 0), Quaternion.RotationAxis(Vector3.Right(), Math.PI));
      plate("edge", r * .46, length * design.coverage * .66, r * .15, new Vector3(0, length * .49, front * r * .83));
      for (const side of [-1, 1]) bearing(new Vector3(side * r * .85, length * .20, 0), r * .16, r * .11);
    }
  },
};
