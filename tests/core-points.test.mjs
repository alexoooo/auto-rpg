import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { pointsInto } from "../src/core/rules/points.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { rigidOf } from "../src/core/build/rigid.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { lone } from "./fixtures/lone.mjs";

const q = (value, unit) => sourced(value, unit, "reptile-anatomy", "contact-rule fixture");
const point = direction => ({ direction: q(direction, "1"), alignment: q(.8, "1") });
const surface = direction => ({ stiffness: q(10e6, "N/m"), point: point(direction) });
const rules = rulebook("arena");

test("a point's cone accepts its forward normal, including scaled vectors and its boundary", () => {
  assert.equal(pointsInto([0, 0, 2], [0, 0, 3], .8), true);
  assert.equal(pointsInto([0, 0, 1], [.6, 0, .8], .8), true);
  assert.equal(pointsInto([0, 0, 1], [.61, 0, .79], .8), false);
  for (const normal of [[1, 0, 0], [0, 0, -1], [0, 0, 0]]) assert.equal(pointsInto([0, 0, 1], normal, .8), false);
  assert.equal(pointsInto([0, 0, 0], [0, 0, 1], .8), false);
});

/** Two physical bodies, weightless, on the Node Rapier stand at 120 Hz. */
async function impact({ direction = [0, 0, 1], targetFirst = false, rotation, held = false, skin = false, press = false } = {}) {
  const base = lone("pointed", "jaw", 1, { hp: 100 });
  const contact = { name: "tooth", shape: { kind: "sphere", centre: q([0, 0, .07], "m"), radius: q(.025, "m") }, surface: surface(direction) };
  const spec = { ...base, segments: base.segments.map(s => skin ? { ...s, surface: surface(direction) } : held ? s : { ...s, contacts: [contact] }),
    ...(held ? { held: [{ segment: "jaw", origin: q([0, 0, .07], "m"), along: q([0, 0, 1], "1"), across: q([1, 0, 0], "1"),
      item: { name: "pointed item", mass: q(.2, "kg"), centreOfMass: q([0, 0, 0], "m"), inertia: q([.001, .001, .001], "kg m2"),
        shapes: [contact.shape.kind === "sphere" ? { ...contact.shape, centre: q([0, 0, 0], "m") } : contact.shape], points: {}, substance: "bone", surface: surface([0, 1, 0]) } }] } : {}) };
  const stand = await coreStand(spec, { gravity: false, ground: false, position: [0, 1, 0], rotation });
  const forward = rotation ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  const enemy = buildBody(lone("target", "trunk", press ? 1000 : 3, { stiffness: 300e3, hp: 100 }), stand.world, { position: [forward.x * .5, 1, forward.z * .5] });
  const fighters = [{ id: "pointed", side: "one", built: stand.built, pool: createPool(spec, rules) },
    { id: "target", side: "two", built: enemy, pool: createPool(enemy.spec, rules) }];
  const watch = watchBlows(stand.world, targetFirst ? [...fighters].reverse() : fighters, rules);
  try {
    const jaw = stand.built.segments.get("jaw");
    const centre = jaw.node.position.add(new Vector3(0, .05, 0)).add(forward.scale(jaw.rigid.centre[2]));
    jaw.body.applyImpulse(forward.scale(6 * jaw.rigid.mass), centre);
    if (press) {
      stand.step(12);
      const bars = fighters.map(fighter => fighter.pool.bar());
      const hook = stand.world.beforeStep(() => jaw.body.applyImpulse(forward.scale(.05), jaw.node.position.add(new Vector3(0, .05, 0))));
      stand.step(120); hook.dispose();
      assert.deepEqual(fighters.map(fighter => fighter.pool.bar()), bars);
    } else stand.step(60);
    assert.equal(watch.blows.length, 1, JSON.stringify(watch.blows));
    return watch.blows[0];
  } finally { watch.dispose(); enemy.dispose(); stand.dispose(); }
}

test("a natural contact region has its own collider and surface, and retains the segment's mass properties", async () => {
  const base = lone("pointed", "jaw", 1), segment = base.segments[0];
  const region = { name: "tooth", shape: segment.shape, surface: surface([0, 0, 1]) };
  const withContact = { ...segment, contacts: [region] };
  const bare = rigidOf(base, segment), toothed = rigidOf(base, withContact);
  assert.deepEqual([toothed.mass, toothed.centre, toothed.tensor], [bare.mass, bare.centre, bare.tensor]);
  assert.deepEqual(toothed.shapes, [segment.shape, region.shape]);
  assert.deepEqual(toothed.owners, [{ kind: "segment" }, { kind: "region", region }]);
  for (const targetFirst of [false, true]) {
    const blow = await impact({ targetFirst });
    const own = blow.sides.find(s => s.fighter === "pointed"), target = blow.sides.find(s => s.fighter === "target");
    assert.equal(own.region, "tooth"); assert.equal(own.item, null);
    assert.equal(own.mechanism, undefined); assert.equal(target.mechanism, "point");
    assert.ok(blow.closing > 5 && blow.energy > 1);
    assert.equal(own.damage, blowDamage(rules, "blunt", own.share * blow.energy));
    assert.equal(target.damage, blowDamage(rules, "point", target.share * blow.energy));
    assert.ok(target.share > .97 && own.share < .03);
    assert.ok(target.damage > 33 * blowDamage(rules, "blunt", target.share * blow.energy));
  }
});

test("a tooth's side and reverse contacts stay blunt; an ordinary surface still shares by its own stiffness", async () => {
  for (const direction of [[1, 0, 0], [0, 0, -1]]) {
    const blow = await impact({ direction });
    for (const side of blow.sides) {
      assert.equal(side.mechanism, undefined);
      assert.equal(side.damage, blowDamage(rules, "blunt", side.share * blow.energy));
    }
  }
  const blow = await impact({ skin: true });
  assert.equal(blow.sides[0].region, undefined);
  assert.equal(blow.sides[1].mechanism, "point");
});

test("a point follows its segment's world rotation and a held point follows the item's declared frame", async () => {
  for (const options of [{ rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }, { held: true }]) {
    const blow = await impact(options), target = blow.sides.find(s => s.fighter === "target");
    assert.equal(target.mechanism, "point", JSON.stringify(blow));
    assert.equal(target.damage, blowDamage(rules, "point", target.share * blow.energy));
    if (options.held) assert.equal(blow.sides[0].item, "pointed item");
  }
});

test("a pointed contact pressed continuously wounds once until it releases", async () => {
  const blow = await impact({ press: true });
  assert.equal(blow.sides[1].mechanism, "point");
  assert.ok(blow.sides[1].damage > 0);
});
