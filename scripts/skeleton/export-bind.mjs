// Dump every skeleton part's bind pose for the Blender compiler (scripts/skeleton/build-assets.py).
// Usage: node scripts/skeleton/export-bind.mjs assets/skeleton/bind.json
import { writeFileSync } from "node:fs";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createHeadlessArena } from "../../tests/harness/golem-headless-arena.mjs";
import { Golem } from "../../src/golem/golem.ts";
import { skeletonSetup } from "../../src/golem/skeleton/presets.ts";
import { blankIntent } from "../../src/policies.ts";

const rows = [];
for (const [primary, secondary] of [["fist", "fist"], ["blade", "maul"]]) {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const golem = new Golem(arena.scene, { side: "left", origin: Vector3.Zero(), facing: 0,
    setup: skeletonSetup(primary, secondary), mind: { name: "bind", decide: blankIntent }, controlPolicies: [] });
  try {
    for (const p of golem.visualParts()) {
      const box = p.host.getBoundingInfo().boundingBox;
      rows.push({ build: `${primary}/${secondary}`, module: p.moduleId, id: p.id,
        position: p.host.position.asArray(), rotation: p.host.rotationQuaternion.asArray(),
        min: box.minimum.asArray(), max: box.maximum.asArray(),
        shells: p.shells.map(s => ({ name: s.name, position: s.position.asArray(),
          rotation: (s.rotationQuaternion ?? { asArray: () => null }).asArray?.() ?? null })) });
    }
  } finally { golem.dispose(); arena.dispose(); }
}
writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
console.log(`${rows.length} parts`);
