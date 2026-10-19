/**
 * **The lab's targets and their dummy** (`src/lab/targets.ts`): drawn by seed in their strata; a
 * dummy of its attacker's head that hangs still against its own weight and gives way to a blow as
 * a head on no neck does (Node, Rapier, 120 Hz, the arena's rules).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { buildBody } from "../src/core/build/build-body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { blowDamage } from "../src/core/rules/rulebook.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { createWorld } from "../src/core/world.ts";
import { drawTargets, dummySpec, hangDummy, TARGET_BOX } from "../src/lab/targets.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { RULES, sideOf } from "./fixtures/target-strikes.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

const WARRIOR = humanSpec("workshop-fighter");

test("targets_are_the_seeds_and_lie_in_their_strata", () => {
  const frame = { place: [0.5, 0, 2.45], heading: 0, stature: 1.8, head: 1.65 };
  const targets = drawTargets(1, 10, frame);
  assert.deepEqual(targets, [
    { at: [0.5, 1.65, 2.45], stratum: "control" },
    { at: [0.5914932372234761, 1.5873511679819785, 2.270984859624878], stratum: "high" },
    { at: [0.8463566965796054, 1.0264965763315559, 2.6186160433571786], stratum: "middle" },
    { at: [0.5812439796328545, 0.5382520798221231, 2.529467530809343], stratum: "low" },
    { at: [0.8562725208885968, 1.5699547428404912, 2.4338976057805124], stratum: "high" },
    { at: [0.24003218004479998, 1.0113857533782722, 2.415348115433008], stratum: "middle" },
    { at: [0.2512350571528077, 0.3124430265510455, 2.4460918023623526], stratum: "low" },
    { at: [0.42412590758875013, 1.4786377530894244, 2.546158889345825], stratum: "high" },
    { at: [0.2774289764650166, 1.0923218801035546, 2.285382695598528], stratum: "middle" },
    { at: [0.5650753952004015, 0.45576801865361627, 2.5575263176299634], stratum: "low" },
  ]);
  // Facing +z, across is x and along is z: each lies in the box, and in its own stratum's band and no other's.
  const within = (value, [low, high]) => low * frame.stature <= value && value <= high * frame.stature;
  for (const { at, stratum } of targets.slice(1)) {
    assert.ok(within(at[0] - frame.place[0], TARGET_BOX.across) && within(at[2] - frame.place[2], TARGET_BOX.along), `${stratum} at ${at}`);
    assert.deepEqual(Object.keys(TARGET_BOX.up).filter((band) => within(at[1], TARGET_BOX.up[band])), [stratum], `${stratum} at ${at}`);
  }
  // A seed names one list: the same again, and another seed's is another.
  assert.deepEqual(drawTargets(1, 10, frame), targets);
  assert.deepEqual(drawTargets(1, 4, frame), targets.slice(0, 4));
  assert.deepEqual(drawTargets(2, 4, frame), [
    { at: [0.5, 1.65, 2.45], stratum: "control" },
    { at: [0.6686606799252331, 1.478383224864956, 2.3869994356296957], stratum: "high" },
    { at: [0.5273277133703231, 1.183875003887806, 2.5851036609243603], stratum: "middle" },
    { at: [0.4994251330383122, 0.7624010106059722, 2.398608076060191], stratum: "low" },
  ]);
  assert.deepEqual(drawTargets(1, 0, frame), []);
  // Turned a quarter to the right it faces +x: along is x, and across, to its right, is -z.
  const turned = drawTargets(1, 10, { ...frame, heading: Math.PI / 2 });
  targets.forEach(({ at, stratum }, k) => {
    const across = at[0] - frame.place[0], along = at[2] - frame.place[2], to = turned[k].at;
    assert.equal(turned[k].stratum, stratum);
    assert.ok(Math.abs(to[0] - frame.place[0] - along) < 1e-12 && Math.abs(to[2] - frame.place[2] + across) < 1e-12 && to[1] === at[1], `${k}: ${to} from ${at}`);
  });
});

test("a_dummy_is_a_ball_of_its_attackers_head_and_every_number_is_the_attackers", () => {
  const spec = dummySpec(WARRIOR), head = WARRIOR.segments.find((segment) => segment.name === "head");
  assert.deepEqual(specProvenanceFaults(spec), []);
  const [ball] = spec.segments, r = head.shape.radius.value, m = head.mass.value;
  assert.deepEqual(
    { model: spec.model, segments: spec.segments.map((segment) => segment.name), joints: spec.joints, mass: spec.mass.value, stature: spec.stature.value,
      kind: ball.shape.kind, radius: ball.shape.radius.value, centre: ball.shape.centre.value, com: ball.centreOfMass.value, kg: ball.mass.value,
      inertia: ball.inertia.value, surface: [ball.surface.stiffness.value, ball.surface.stiffness.unit], hp: spec.wounds.hp.value, vital: spec.wounds.vital, whole: spec.wounds.whole, balance: spec.attributes.balance.value },
    { model: "workshop-fighter.dummy", segments: ["head"], joints: [], mass: m, stature: 2 * r,
      kind: "sphere", radius: r, centre: [0, 0, 0], com: [0, 0, 0], kg: m,
      inertia: [(2 / 5) * m * r * r, (2 / 5) * m * r * r, (2 / 5) * m * r * r], surface: [201e3, "N/m"], hp: WARRIOR.wounds.hp.value, vital: [], whole: ["head"], balance: WARRIOR.attributes.balance.value });
});

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the targets' tests");

/** The fist's surface, N/m: as stiff as the dummy's, a head's, so each takes half of a blow between them. */
const FIST_K = 201e3;

/** A body of one ball of `kg`, 5 cm in radius, named `hand.right`: a fist and nothing else, its centre 5 cm over its node. */
const fistSpec = (kg) => ({
  model: "fist", mass: q(kg, "kg"), stature: q(0.1),
  segments: [{ name: "hand.right", proximal: q([0, 0, 0]), distal: q([0, 0.1, 0]), mass: q(kg, "kg"), centreOfMass: q([0, 0.05, 0]),
    inertia: q([0.001, 0.001, 0.001], "kg m2"), shape: { kind: "sphere", centre: q([0, 0.05, 0]), radius: q(0.05) },
    surface: { stiffness: q(FIST_K, "N/m") } }],
  joints: [], wounds: { hp: q(1, "HP"), vital: [], whole: [] }, attributes: { balance: q(0, "%") }, down: { kind: "asked", fallen: q(0.25) },
});

/**
 * A dummy hung 1.5 m up in a world with gravity, between two steps or `inStep`, from a hook of the
 * world's first step; then a fist of 1 kg sent into it at 6 m/s.
 */
async function hung(inStep = false) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  const at = [0, 1.5, 0.5];
  let dummy = inStep ? null : hangDummy(world, dummySpec(WARRIOR), at, RULES);
  if (inStep) {
    const hook = world.beforeStep(() => { dummy ??= hangDummy(world, dummySpec(WARRIOR), at, RULES); });
    world.step(1);
    hook.dispose();
  }
  const head = dummy.fighter.built.segments.get("head");
  const centre = () => [dummy.centre.x, dummy.centre.y, dummy.centre.z];
  return {
    world, dummy, at, centre, head,
    /** Build the fist 15 cm short of the dummy, level with its centre, send it, and watch the blows for half a second. */
    strike() {
      const spec = fistSpec(1), built = buildBody(spec, world, { position: [0, at[1] - 0.05, at[2] - dummy.radius - 0.05 - 0.15] });
      const fist = { id: "fist", side: "fist", built, pool: createPool(spec, RULES) };
      const watch = watchBlows(world, [fist, dummy.fighter], RULES);
      const hand = built.segments.get("hand.right");
      hand.body.applyImpulse(new Vector3(0, 0, 6), hand.node.position.add(new Vector3(0, 0.05, 0)));
      world.step(60);
      const blows = [...watch.blows];
      watch.dispose();
      return { blows, fistSpeed: hand.body.linearVelocityToRef(new Vector3()) };
    },
    dispose() { dummy.dispose(); world.dispose(); scene.dispose(); },
  };
}

test("a_dummy_hangs_still_and_gives_way_to_a_blow", async () => {
  const h = await hung();
  try {
    assert.equal(h.dummy.radius, WARRIOR.segments.find((segment) => segment.name === "head").shape.radius.value);
    // Its weight is held and nothing else: 10 s on it is where it hung.
    h.world.step(10 * 120);
    const drift = Math.hypot(...h.centre().map((x, k) => x - h.at[k]));
    assert.ok(drift < 1e-3, `it drifted ${drift} m in 10 s`);
    // Hung from inside a step, as a reading hangs it, it is held through that step too.
    const within = await hung(true);
    try {
      within.world.step(10 * 120);
      const moved = Math.hypot(...within.centre().map((x, k) => x - within.at[k]));
      assert.ok(moved < 1e-3, `hung in a step, it drifted ${moved} m in 10 s`);
    } finally { within.dispose(); }
    const { blows, fistSpeed } = h.strike();
    assert.equal(blows.length, 1, JSON.stringify(blows));
    const [blow] = blows, kg = h.head.rigid.mass;
    const [by, on] = blow.sides;
    assert.deepEqual(blow.sides.map(sideOf), [["fist", "hand.right", null, 0.5], ["dummy", "head", null, 0.5]]);
    // Two balls meet through their centres, so the masses the contact meets are the bodies' own: but
    // for the few millimetres the fist has dropped on its way, which put the contact that far off the line.
    assert.ok(Math.abs(by.kg - 1) < 0.01 && Math.abs(on.kg - kg) < 0.01, `${by.kg}, ${on.kg} kg of 1 and ${kg}`);
    assert.ok(Math.abs(blow.closing - 6) < 0.02, `${blow.closing} m/s`);
    assert.equal(blow.energy, impactEnergy(by.kg, on.kg, blow.closing));
    // Each takes its half of it, and is wounded by that much.
    const half = blowDamage(RULES, "blunt", 0.5 * blow.energy);
    assert.ok(half > 0);
    assert.deepEqual([by, on].map((side) => [side.damage, side.wound.taken]), [[half, [{ part: "hand.right", hp: half }]], [half, [{ part: "head", hp: half }]]]);
    // It moves off with the blow, as a head on no neck does: the fist's 6 N s is in the two of them, and it has not dropped.
    const moving = h.head.body.linearVelocityToRef(new Vector3());
    assert.ok(moving.z > 0.5 && Math.abs(fistSpeed.z + kg * moving.z - 6) < 0.06, `the dummy at ${moving.z} m/s, the fist at ${fistSpeed.z}`);
    assert.ok(Math.abs(moving.y) < 0.05 && h.centre()[2] - h.at[2] > 0.2, `it moves at ${moving} and is at ${h.centre()}`);
  } finally { h.dispose(); }
});
