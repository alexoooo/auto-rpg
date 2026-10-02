/**
 * **Where one place for a point of the right hand's rigid body can be solved** (`solveReach`,
 * `src/core/control/kinematics.ts`): the Warrior's knuckles, and the swell of the club he holds,
 * asked to each place of a grid ahead of his right shoulder, with the wrist held at the posture's
 * angles and with it freed. Each row of the grid is a path: its first place is solved from the
 * guard, each next from the angles the last found. Kinematics alone: no step of the world is
 * taken (Node core stand, the lower trunk held).
 *
 *   node research/core-reach-map.mjs [--up 0.4,0.6,0.8,1,1.2,1.4,1.6,1.8,2] [--ahead 0.3,0.45,0.6,0.75,0.9,1.05]
 *
 * Prints, per point and wrist, each place's distance left, mm, and the greatest turn of any
 * angle from the place before it on its row, rad; then the places solved within a millimetre.
 */
import { parseArgs } from "node:util";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { chainTo, pointAtToRef, solveReach } from "../src/core/control/kinematics.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;
const { values } = parseArgs({ options: {
  up: { type: "string", default: "0.4,0.6,0.8,1,1.2,1.4,1.6,1.8,2" }, ahead: { type: "string", default: "0.3,0.45,0.6,0.75,0.9,1.05" },
} });
const ups = values.up.split(",").map(Number), aheads = values.ahead.split(",").map(Number);

const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
const stand = await coreStand(spec, { ground: false, pinned: "lowerTrunk" });
const hand = stand.built.segments.get("hand.right"), chain = chainTo(stand.built, hand), points = rigidPoints(spec, hand.spec);
const name = (j, k) => `${chain[j].spec.name} ${chain[j].dofs[k].spec.positive}`;
const guard = () => chain.map((joint, j) => joint.dofs.map((_, k) => GUARD[name(j, k)] ?? 0));
const shoulder = spec.joints.find((joint) => joint.name === "shoulder.right").centre.value;
console.log(`The Warrior with the club, each place straight ahead of his right shoulder (${shoulder.map((c) => c.toFixed(2)).join(", ")}), body frame; `
  + `each row solved in turn from the guard. Kinematics alone (Node core stand).`);
for (const point of ["knuckles", "swell"]) {
  for (const [wrist, moved] of [["held", ["shoulder.right", "elbow.right"]], ["freed", ["shoulder.right", "elbow.right", "wrist.right"]]]) {
    const free = chain.flatMap((joint, j) => moved.includes(joint.spec.name)
      ? joint.dofs.map((dof, k) => ({ joint: j, k, min: dof.spec.min.value, max: dof.spec.max.value, preferred: GUARD[name(j, k)] ?? 0 })) : []);
    const start = pointAtToRef(chain, guard(), points.get(point).value, new Vector3());
    console.log(`\n${point}, the wrist ${wrist}; at the guard it is at ${start.asArray().map((c) => c.toFixed(2)).join(", ")}`);
    console.log(`| Up, m \\ ahead, m | ${aheads.join(" | ")} |`);
    console.log(`|---|${aheads.map(() => "---").join("|")}|`);
    let solved = 0;
    for (const up of ups) {
      const angles = guard(), cells = [];
      for (const ahead of aheads) {
        const was = angles.map((row) => [...row]);
        const left = solveReach(chain, angles, free, [{ point: points.get(point).value, target: [shoulder[0], up, shoulder[2] + ahead] }]);
        const turn = Math.max(...free.map((f) => Math.abs(angles[f.joint][f.k] - was[f.joint][f.k])));
        if (left < 0.001) solved += 1;
        cells.push(`${(1000 * left).toFixed(0)} / ${turn.toFixed(2)}`);
      }
      console.log(`| ${up} | ${cells.join(" | ")} |`);
    }
    console.log(`${solved} of ${ups.length * aheads.length} places solved within a millimetre`);
  }
}
stand.dispose();
