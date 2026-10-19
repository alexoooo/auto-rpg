/**
 * **A Warrior's club blow at a skeleton**: a Warrior driven to strike a skeleton's head with its
 * club, where it stands, lands there and ends the fight (Node core stand, Rapier, 120 Hz). The blow's
 * record contract is `tests/core-blows.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";
import { createWorld } from "../src/core/world.ts";
import { pointScript } from "./fixtures/point-script.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

const RULES = rulebook("dungeon");
const none = () => null;
/** `blow`'s record whole, from what it read and what the rule makes of that (`tests/core-blows.test.mjs`). */
function recordOf(blow, sides) {
  const energy = impactEnergy(blow.sides[0].kg, blow.sides[1].kg, blow.closing);
  return {
    time: blow.time, point: blow.point, normal: blow.normal, closing: blow.closing, energy,
    sides: sides.map(([fighter, segment, item, share, wound], k) => {
      const damage = share > 0 ? blowDamage(RULES, "blunt", share * energy) : 0;
      return { fighter, segment, item, kg: blow.sides[k].kg, share, damage, wound: wound(damage) };
    }),
  };
}

test("a Warrior's club blow at a skeleton's head lands there and ends the fight", async () => {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -0.5, 0], [20, 1, 20]);
  const make = (id, spec, z, side) => {
    const built = buildBody(spec, world, { position: [0, 0, z] });
    return { id, side, built, body: createBody(built, world, { servoSeconds: SERVO_SECONDS }), pool: createPool(spec, RULES) };
  };
  const warrior = make("warrior", armed(modelSpec("workshop-fighter"), "right", woodenClub()), 0, "party");
  // Built within the club's reach, so that the Warrior strikes where it stands: the blow is the
  // test's, not the walk up to it, whose last step decides where the club meets the skeleton.
  const skeleton = make("skeleton", modelSpec("crypt-skeleton"), 0.9, "enemy");
  try {
    driveBy(warrior.body, pointScript(() => {
      const h = skeleton.body.view.head;
      return { key: 0, action: "strike", effector: "hand.right", target: { kind: "point", at: [h.x, h.y, h.z], body: "skeleton" } };
    }));
    driveBy(skeleton.body, { name: "stand", decide: () => standIntent(0) });
    const watch = watchBlows(world, [warrior, skeleton], RULES);
    for (let i = 0; i < 12 * world.hz && skeleton.pool.ending() === null; i++) world.step();
    const blow = watch.blows.at(-1);
    assert.ok(blow, "a blow landed");
    // The club is rigid: its side takes none of it, the head's all. The record whole, with the wound the pool gave.
    assert.deepEqual(blow, recordOf(blow, [["warrior", "hand.right", "wooden club", 0, none], ["skeleton", "head", null, 1, () => blow.sides[1].wound]]));
    assert.ok(blow.closing > 10 && blow.energy > 50, `${blow.closing} m/s, ${blow.energy} J`);
    assert.equal(skeleton.pool.ending(), blow.sides[1].wound.ending);
    assert.notEqual(skeleton.pool.ending(), null, "the fight ended");
    assert.equal(warrior.pool.bar(), 1, "the club's holder is whole");
    watch.dispose();
  } finally { warrior.body.dispose(); skeleton.body.dispose(); world.dispose(); scene.dispose(); }
});
