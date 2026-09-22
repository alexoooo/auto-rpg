import { writeFileSync } from "node:fs";
import { createHeadlessArena } from "../../tests/harness/golem-headless-arena.mjs";
import { DungeonRun } from "../../src/dungeon/run.ts";
const arena = await createHeadlessArena({ populateDefaultGeometry: false });
const run = new DungeonRun(arena.scene, 42, "human-warrior", false);
try {
  const origin = run.map.start;
  const parts = run.hero.body.visualParts().map(p => ({ slot: p.slot, module: p.moduleId,
    id: p.id.split(".").pop(), position: [p.host.position.x - origin.x, p.host.position.y, p.host.position.z - origin.z],
    rotation: p.host.rotationQuaternion.asArray(), size: p.host.getBoundingInfo().boundingBox.extendSize.scale(2).asArray() }));
  writeFileSync(process.argv[2], JSON.stringify(parts, null, 2));
} finally { run.dispose(); arena.dispose(); }
