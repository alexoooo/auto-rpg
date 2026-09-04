import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { Fighter, stepPair } from "../src/fighter.ts";
import { blankIntent } from "../src/policies.ts";
import { ACTION_TUNING, selectThreat } from "../src/action-primitives.ts";
import { STRIKER_KINDS, isStriking } from "../src/hands.ts";
import { assertCompleteView } from "./fixtures/view.mjs";

/**
 * What a policy can see, and what it decides is worth answering.
 *
 * Two halves, deliberately. The first runs the real solver, because the claims
 * are about what a shaft loosed from a real bow does to a real view -- and
 * because a fixture that wrote the arrow's velocity by hand would go on passing
 * if `Arrow.flightVelocityToRef` answered zero, which is exactly the failure
 * these tests were made to fail against. The second is pure, because threat
 * selection has no bodies in it.
 *
 * **Third of it went on 2026-09-04**: the feature-table sweep over the research
 * matrix and the mirror check against a separately constructed asymmetric world
 * both had `src/learning/features.ts` as their subject and went with it. What
 * this file is named for -- counting Havok plugin boundary reads per `observe`,
 * which is exact where a heap sample is not -- is untouched.
 *
 * Havok's wasm is handed over as bytes: its emscripten glue calls `fetch()` and
 * Node cannot fetch a `file://` URL.
 */

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;

/**
 * Two fighters and a floor.
 *
 * The floor is here and not in `tests/view.test.mjs` because one of these tests
 * is about a *planted* shaft, and planting is what `Arrow` does when the thing
 * it touched is on `LAYER.WORLD`. Without a floor there is nothing in the scene
 * that a shaft can plant itself in, and "planted" would quietly become "struck a
 * body", which is a different branch.
 *
 * Both minds stand still. These tests aim shafts at points on bodies, and a
 * fighter that walked off would turn a claim about the publication into a claim
 * about marksmanship.
 */
async function ring(leftLoadout, rightLoadout) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"), leather: mat("leather"),
    brass: mat("brass"), hide: mat("hide"), wood: mat("wood"), arrowAccent: mat("arrow-accent"),
  };

  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 0.4, depth: 60 }, scene);
  ground.position.set(0, -0.2, 0);
  const slab = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  slab.shape.filterMembershipMask = LAYER.WORLD;
  slab.shape.filterCollideMask = COLLIDES.WORLD;

  const still = () => ({ name: "still", decide: () => blankIntent() });
  const left = new Fighter(scene, { side: "left", origin: Vector3.Zero(), facing: 0,
    mind: still(), loadout: leftLoadout }, materials);
  const right = new Fighter(scene, { side: "right", origin: new Vector3(0, 0, CONFIG.fighter.separation),
    facing: Math.PI, mind: still(), loadout: rightLoadout }, materials);

  let clock = 0;
  let pending = [];
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
    // **After** `update`. `Arm.update` runs `Quiver.step` first thing, and that
    // is what takes down the one-step teleport `loose` puts up -- a shot queued
    // ahead of it is cancelled before the solver sees it and starts from where
    // the last one ended, which is sixty metres under the floor. `Arm.shoot`
    // occupies exactly this slot for exactly this reason.
    for (const shot of pending) shot();
    pending = [];
  };
  const frames = (n) => {
    for (let i = 0; i < n; i += 1) {
      scene._renderId += 1;
      const observer = scene.onBeforePhysicsObservable.add(control);
      scene._advancePhysicsEngineStep(1000 / 60);
      scene.onBeforePhysicsObservable.remove(observer);
    }
  };
  return { engine, scene, left, right, frames, queue: (fn) => pending.push(fn) };
}

/** Where a body's vitals are, which is the point `selectThreat` measures to. */
const vitalsOf = (body) => new Vector3(body.ground.x, body.vitalHeight, body.ground.z);

test("an_approaching_arrow_becomes_the_selected_threat", async (t) => {
  // The claim: a shaft in the air outranks whatever is in front of you, because
  // it is the only thing in the world that arrives whether or not you are in
  // measure of it. So it has to *beat* a candidate rather than win by being the
  // only one, and the assertions below check that there was one to beat.
  const { engine, left, right, frames, queue } = await ring(
    { primary: "bow", secondary: "empty" }, { primary: "sword", secondary: "empty" });
  t.after(() => engine.dispose());

  frames(30);
  // With nothing in the air the defender is watching the archer's bare hand, and
  // that is the honest answer rather than the tidy one: a bow is not a striking
  // kind, so the hand holding it is not the thing that can hurt, and the fist on
  // the other arm is. It is a tier-one candidate -- something that can actually
  // strike -- so the arrow below is displacing a real threat.
  const before = selectThreat(right.view);
  assert.equal(before.striker, "empty", "the archer's fist, not the bow it is holding");
  assert.equal(isStriking(before.striker), true, "and it is a candidate that can actually hurt");
  assert.equal(before.source, "secondary");

  // Straight at the defender's vitals, from the archer's own bow hand.
  const target = vitalsOf(right.view.self);
  const from = left.view.self.hands.primary.shoulder.clone();
  const along = target.subtract(from).normalize();
  queue(() => left.arms.primary.quiver.loose(from, along, CONFIG.arrow.speedMax));
  frames(2);

  assert.equal(right.view.projectiles.length, 1, "the shaft is published to the fighter it is aimed at");
  assert.equal(right.view.projectiles[0].owner, "opponent");

  const threat = selectThreat(right.view);
  assert.equal(threat.striker, "arrow", "an arrow that is actually closing outranks the reaching hand");
  assert.equal(threat.weapon, "empty", "an arrow is in nobody's hand, and says so");
  assert.equal(threat.source, null);
  assert.ok(threat.timeToClosest > 0 && threat.timeToClosest < 0.3,
    `it arrives in a fraction of a second, got ${threat.timeToClosest}`);
  assert.ok(threat.closestMiss < right.view.self.collisionRadius,
    `and it is coming inside the body, miss ${threat.closestMiss}`);
  assert.ok(threat.tipSpeed > CONFIG.arrow.speedMax * 0.8,
    `at something like the speed it left the string, got ${threat.tipSpeed}`);

  // And the archer is not frightened of its own arrow, which is the whole point
  // of `owner` being a role rather than an identity.
  assert.equal(left.view.projectiles[0].owner, "self");
  assert.equal(selectThreat(left.view).striker, "sword",
    "the archer goes on watching the blade opposite it");
});

test("a_receding_or_planted_arrow_does_not_displace_a_nearer_melee_threat", async (t) => {
  const { engine, left, right, frames, queue } = await ring(
    { primary: "bow", secondary: "empty" }, { primary: "sword", secondary: "empty" });
  t.after(() => engine.dispose());
  frames(30);

  // Loosed the other way: the shaft is published, is `live && !spent`, and is
  // travelling away. `selectThreat` gates the arrow tier on a *positive* time to
  // closest approach, so this one is offered and declined -- which is a stronger
  // claim than "it is not in the list", and the reason the assertion below
  // checks the list first.
  const away = new Vector3(0, 0.25, -1).normalize();
  queue(() => left.arms.primary.quiver.loose(
    left.view.self.hands.primary.shoulder.clone(), away, CONFIG.arrow.speedMax));
  frames(3);
  assert.equal(right.view.projectiles.length, 1, "a receding shaft is still a published fact");
  assert.equal(selectThreat(right.view).striker, "empty",
    "but it is not the thing worth answering, and the reaching fist still is");

  // Now one into the floor, which is what `planting` means: it touches
  // `LAYER.WORLD`, is made static and becomes scenery. Scenery is not published
  // at all, so it cannot displace anything by construction.
  const down = new Vector3(0, -1, 0.35).normalize();
  queue(() => left.arms.primary.quiver.loose(
    left.view.self.hands.primary.shoulder.clone(), down, CONFIG.arrow.speedMax));
  frames(40);

  const planted = left.arms.primary.quiver.arrows.filter((arrow) => arrow.live && arrow.spent);
  assert.equal(planted.length, 1, "the shot into the floor stuck there");
  assert.equal(right.view.projectiles.some((shot) => shot.age === planted[0].age), false,
    "a planted shaft is scenery and is never published");
  assert.equal(selectThreat(right.view).striker, "empty");
});

test("projectile_publication_reuses_records_after_warmup", async (t) => {
  // The property the pooling exists for, stated as object identity rather than
  // as a memory reading: once a volley has been up once, publishing it again
  // hands back the *same* records. A fresh `{ position, velocity }` per shaft
  // per observe is four objects per arrow per solver step, at 240 Hz, per
  // fighter -- which is why `FighterView` says the array is trimmed rather than
  // replaced, and this is what holds it to that.
  const bow = { primary: "bow", secondary: "empty" };
  const { engine, left, right, frames, queue } = await ring(bow, bow);
  t.after(() => engine.dispose());
  frames(30);

  const up = (z) => new Vector3(0, 0.6, z).normalize();
  const volley = (n) => {
    for (let i = 0; i < n; i += 1) {
      queue(() => left.arms.primary.quiver.loose(
        left.view.self.hands.primary.shoulder.clone(), up(1), CONFIG.arrow.speedMax));
      queue(() => right.arms.primary.quiver.loose(
        right.view.self.hands.primary.shoulder.clone(), up(-1), CONFIG.arrow.speedMax));
      frames(2);
    }
  };

  const array = left.view.projectiles;
  volley(3);
  assert.equal(left.view.projectiles.length, 6, "three each, both owners, all still flying");
  assert.equal(left.view.projectiles, array, "the array itself is never replaced");

  const warm = [...left.view.projectiles];
  const warmPositions = warm.map((shot) => shot.position);
  frames(3);
  assert.equal(left.view.projectiles.length, 6, "still six up");
  for (let i = 0; i < warm.length; i += 1) {
    assert.equal(left.view.projectiles[i], warm[i], `record ${i} is the same object on the next step`);
    assert.equal(left.view.projectiles[i].position, warmPositions[i], `record ${i} keeps its own vectors`);
  }
  // And they moved, so this is not six records nobody wrote to.
  assert.ok(warm.every((shot) => shot.age > 0));

  // Let the whole volley land, then loose the same number again. The pool is
  // sized by the high-water mark and must not have grown: these are the records
  // from the first volley, coming back.
  frames(240);
  assert.deepEqual(left.view.projectiles, [], "the volley is spent or collected");
  volley(3);
  assert.equal(left.view.projectiles.length, 6);
  for (let i = 0; i < warm.length; i += 1) {
    assert.equal(left.view.projectiles[i], warm[i], `record ${i} is reused by the second volley`);
  }
});

/**
 * Every read a control step makes across the Havok boundary, counted by name.
 *
 * The plugin is wrapped rather than the bodies, because that is the one place
 * every reader has to come through: `PhysicsBody.getLinearVelocity` allocates a
 * `Vector3` and then calls `getLinearVelocityToRef`, which calls the plugin, so
 * a session that swapped a `ToRef` reader for its allocating twin would still be
 * counted here.
 */
function boundaryCounter(scene) {
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const tally = new Map();
  const original = new Map();
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(plugin))) {
    if (!name.startsWith("get") || typeof plugin[name] !== "function") continue;
    const wrapped = plugin[name];
    original.set(name, wrapped);
    plugin[name] = function (...args) {
      tally.set(name, (tally.get(name) ?? 0) + 1);
      return wrapped.apply(this, args);
    };
  }
  return {
    /** Run `work`, and hand back what it cost. */
    cost(work) {
      tally.clear();
      work();
      const linear = tally.get("getLinearVelocityToRef") ?? 0;
      const angular = tally.get("getAngularVelocityToRef") ?? 0;
      const other = [...tally.entries()].filter(([name]) =>
        name !== "getLinearVelocityToRef" && name !== "getAngularVelocityToRef");
      return { linear, angular, other, total: linear + angular + other.reduce((sum, [, n]) => sum + n, 0) };
    },
    restore() { for (const [name, fn] of original) plugin[name] = fn; },
  };
}

/**
 * The steady-state cost of one `observe`, as a count of boundary reads rather
 * than as a heap reading.
 *
 * **`ToRef` is not allocation-free at this boundary**, which is the fact the
 * plan for this session was written without and the reason this test is a count.
 * `HavokPlugin.getLinearVelocityToRef` reads
 * `this._hknp.HP_Body_GetLinearVelocity(id)[1]` -- the emscripten glue builds a
 * fresh JS array per call, and the `ToRef` saves only the destination
 * `Vector3`. Measured on this build with `.review/boundary-count.mjs`: 216 B a
 * call for the linear reader, 184 for the angular, and 0.1 for
 * `getObjectCenterWorldToRef`, which never crosses at all because it copies
 * `transformNode.position`. So true zero is not reachable through this API and a
 * byte assertion would be a sampled number pretending to be a contract; the
 * count is exact, is stable, and fails the moment a reader is added.
 *
 * The budget, and each line of it is a claim:
 *
 * - **a held weapon costs two**, its linear and its angular velocity, because
 *   its tip is out on the end of a body that rotates;
 * - **a bare fist costs one**, because the point published for it is the fist's
 *   own centre, where the `w x r` term is identically zero;
 * - **a hand holding something does not also pay for its fist**, which is what
 *   `describeFighter` used to do for an empty hand and a weapon on one arm;
 * - **a shaft in the air costs one**, its linear velocity, per `observe` that
 *   publishes it -- so the steady state at the high-water mark of twelve is
 *   twelve more reads and not one allocation more than that.
 */
test("observe_reads_the_physics_boundary_a_counted_number_of_times", async (t) => {
  const { engine, scene, left, right, frames } = await ring(
    { primary: "empty", secondary: "empty" }, { primary: "sword", secondary: "buckler" });
  t.after(() => engine.dispose());
  frames(30);

  const counter = boundaryCounter(scene);
  t.after(() => counter.restore());

  // One body at a time first, so the budget is attributed rather than inferred
  // from a total that several loadouts could add up to.
  const bare = counter.cost(() => left.describe(left.view.self));
  assert.deepEqual({ linear: bare.linear, angular: bare.angular, total: bare.total },
    { linear: 2, angular: 0, total: 2 }, "two bare fists, one linear read each and nothing else");

  const armed = counter.cost(() => right.describe(left.view.opponent));
  assert.deepEqual({ linear: armed.linear, angular: armed.angular, total: armed.total },
    { linear: 2, angular: 2, total: 4 }, "a sword and a buckler, two reads each");

  const both = counter.cost(() => left.observe(right, 1));
  assert.deepEqual({ linear: both.linear, angular: both.angular, total: both.total },
    { linear: 4, angular: 2, total: 6 }, "one observe is the two bodies it describes and nothing else");
  assert.deepEqual(both.other, [], `observe made an unbudgeted plugin read: ${JSON.stringify(both.other)}`);

  // And it is a steady state, not a first-call figure.
  for (let i = 0; i < 5; i += 1) {
    assert.equal(counter.cost(() => left.observe(right, 2 + i)).total, 6, `observe ${i} costs the same`);
  }
});

test("a_full_quiver_in_the_air_costs_one_read_a_shaft_and_stays_there", async (t) => {
  // The high-water mark the plan names: `CONFIG.arrow.count` is 12 and `bow` is
  // two-handed, so one fighter can have exactly twelve shafts up and no more.
  const { engine, scene, left, right, frames, queue } = await ring(
    { primary: "bow", secondary: "empty" }, { primary: "sword", secondary: "empty" });
  t.after(() => engine.dispose());
  frames(30);

  const counter = boundaryCounter(scene);
  t.after(() => counter.restore());
  // A bow and its trailing hand cost three; a sword and a fist cost three.
  assert.equal(counter.cost(() => left.observe(right, 1)).total, 6, "nothing in the air yet");

  const up = new Vector3(0, 0.62, 1).normalize();
  for (let i = 0; i < CONFIG.arrow.count; i += 1) {
    queue(() => left.arms.primary.quiver.loose(
      left.view.self.hands.primary.shoulder.clone(), up, CONFIG.arrow.speedMax));
    frames(2);
  }
  assert.equal(left.view.projectiles.length, CONFIG.arrow.count, "a whole quiver is up");

  const full = counter.cost(() => left.observe(right, 2));
  assert.deepEqual({ linear: full.linear, angular: full.angular, total: full.total },
    { linear: 4 + CONFIG.arrow.count, angular: 2, total: 6 + CONFIG.arrow.count },
    "six for the two bodies, one for each shaft, and nothing for the pool");
  // Twice more at the same count: the records are warm, so a growing figure here
  // would be a pool that reallocates rather than reuses.
  assert.equal(counter.cost(() => left.observe(right, 3)).total, 6 + CONFIG.arrow.count);
  assert.equal(counter.cost(() => left.observe(right, 4)).total, 6 + CONFIG.arrow.count);

  // The other side reads the same twelve shafts, and pays the same for them.
  assert.equal(counter.cost(() => right.observe(left, 5)).total, 6 + CONFIG.arrow.count,
    "the defender pays for the volley it is looking at, not for one it owns");
});

// ---- the feature table, without a body in sight ----------------------------

/** How far each kind puts its business end out. `Arm.strikeReach` needs a scene. */
const reachOf = (weapon) => weapon === "empty" ? 0.45 : weapon === "shield" || weapon === "buckler" ? 0.62
  : weapon === "bow" ? 0.72 : weapon === "axe" ? 1.32 : 1.45;
/**
 * One hand, complete.
 *
 * `tipVelocity` and `tipSpeed` are set together from one argument, because
 * `describeFighter` derives the second from the first and a fixture in which
 * they disagree describes a body that cannot exist -- and, worse, describes a
 * blade that `selectThreat` reads as standing still while every assertion about
 * it talks about a committed cut.
 */
const hand = (weapon, { x, z, toward, outboard, side, speed = 0, across = 0 }) => {
  const reach = reachOf(weapon);
  return {
    weapon, lost: false, outboard,
    shoulder: { x, y: 1.42, z },
    // Out in front of the body it belongs to, which is what `toward` is: +1 for
    // the fighter looking down +Z and -1 for the one looking back at it.
    tip: { x: x + outboard * 0.1, y: 1.38, z: z + toward * reach },
    tipSpeed: speed,
    // Along the body's own forward, plus a lateral component so the local-right
    // columns have something to say. `side` is the reflection, so the sideways
    // half flips with the world and the forward half does not.
    tipVelocity: { x: side * across * speed, y: 0, z: toward * speed * 0.9 },
    reach,
  };
};
const WARRIOR = { unit: "warrior", reach: 0.45, crownHeight: 1.77, vitalHeight: 1.28, collisionRadius: 0.16 };
const CENTIPEDE = { unit: "centipede", reach: 0.62, crownHeight: 0.52, vitalHeight: 0.29, collisionRadius: 0.22 };

/**
 * A body carrying a loadout named as one string.
 *
 * The name is split rather than looked up -- `loadout.split("+")` fills both hands from it and
 * `hand` is total over `WEAPON_KINDS` -- which is why a new pair needs no edit here. It used to
 * be driven from `RESEARCH_STRATA`'s eight rows; that table went with `src/learning/` on
 * 2026-09-04 and the builder did not need it.
 *
 * `toward` is which way it looks, `side` is which world it is in. Only `side` flips under a
 * mirror, and the two stay separate arguments -- a builder where "reflected" and "facing the
 * other fighter" were the same knob could not construct an asymmetric pair at all. The mirror
 * test that needed that went with the feature table on 2026-09-04; the separation is kept
 * because it is what makes `facing` able to place two bodies in one world.
 */
function body(loadout, { z, toward, side, lateral = 0.12 }) {
  const facing = toward > 0 ? 0 : Math.PI;
  if (loadout === "natural:bite") {
    return { ...CENTIPEDE, naturalAttacks: { bite: { reach: 0.62, ready: true, active: false } },
      ground: { x: side * lateral, y: 0, z }, facing, shoulder: { x: side * lateral, y: 0.3, z },
      tip: { x: side * lateral, y: 0.28, z: z + toward * 0.55 }, tipSpeed: 1.4, hands: {},
      crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 0.8, health: { head: 1 } };
  }
  const [primaryKind, secondaryKind] = loadout.split("+");
  const primary = hand(primaryKind, { x: side * (lateral + 0.21), z, toward, outboard: side, side, speed: 6.5, across: -0.35 });
  const secondary = hand(secondaryKind, { x: side * (lateral - 0.21), z, toward, outboard: -side, side });
  return { ...WARRIOR, naturalAttacks: {}, ground: { x: side * lateral, y: 0, z }, facing,
    shoulder: primary.shoulder, tip: primary.tip, tipSpeed: primary.tipSpeed,
    hands: { primary, secondary }, crouch: 0.15, trunkLean: -0.2, trunkTwist: side * 0.3,
    vitality: 0.7, health: { torso: 1, head: 0.5 } };
}

// ---- the ranking itself, on stated geometry --------------------------------

/** Two warriors a stride apart, with nothing in the air unless a test puts it there. */
const facing = (mine, theirs, projectiles = []) => assertCompleteView({
  self: body(mine, { z: 0, toward: 1, side: 1 }),
  opponent: body(theirs, { z: 1.55, toward: -1, side: 1, lateral: -0.4 }),
  projectiles, measure: 1.2, clock: 3,
}, `${mine} against ${theirs}`);
/** Where the observer's vitals are: the point every approach in the ranking is measured to. */
const vitals = (view) => ({ x: view.self.ground.x, y: view.self.vitalHeight, z: view.self.ground.z });
/** Point a hand's velocity at a target, at `speed`, and keep `tipSpeed` honest. */
const send = (hand, at, speed) => {
  const dx = at.x - hand.tip.x; const dy = at.y - hand.tip.y; const dz = at.z - hand.tip.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  hand.tipVelocity = { x: dx / length * speed, y: dy / length * speed, z: dz / length * speed };
  hand.tipSpeed = speed;
  return hand;
};

/**
 * A blade that is plainly moving is not a blade standing still, even mid-arc.
 *
 * This is the case the shipped v4.0 key could not see. `closing` was `tipSpeed`
 * gated on the *radial* component of the tip's motion toward the vitals, and a
 * swung blade is mostly tangential at the instant it is sampled -- and for the
 * whole of the chamber and the whole of the recovery it is tangential *and
 * slightly outward*. Measured over real duelist bouts, a hand faster than 1.5
 * m/s reported as not closing on 44 % to 68 % of the samples it appeared in. On
 * every one of those the key collapsed to exactly zero, tied with a hand hanging
 * at rest, and the answer fell through to a reach-margin tiebreak that neither
 * copy of the old rule ever had.
 *
 * So the velocity here is the tangent with a tenth of the speed leaking outward,
 * which is a stroke at the top of its arc: 12 m/s of blade, and a radial
 * component that is *positive* and therefore reads as "not closing". The still
 * hand is deliberately the one a reach-margin fallback would pick, or the
 * fixture would pass under the old rule for a reason that has nothing to do with
 * the key.
 */
test("a_blade_moving_across_the_line_still_outranks_a_hand_at_rest", () => {
  const view = facing("sword+empty", "sword+empty");
  const blade = view.opponent.hands.primary;
  const fist = view.opponent.hands.secondary;
  const at = vitals(view);
  const rx = blade.tip.x - at.x; const ry = blade.tip.y - at.y; const rz = blade.tip.z - at.z;
  const radial = Math.hypot(rx, ry, rz);
  // Across the line rather than along it, and not vertical either, so this is a
  // stroke over the body rather than a lift.
  const acrossX = -rz; const acrossZ = rx;
  const across = Math.hypot(acrossX, acrossZ);
  const mixX = acrossX / across * 0.99 + rx / radial * 0.1;
  const mixY = ry / radial * 0.1;
  const mixZ = acrossZ / across * 0.99 + rz / radial * 0.1;
  const mix = Math.hypot(mixX, mixY, mixZ);
  blade.tipVelocity = { x: mixX / mix * 12, y: mixY / mix * 12, z: mixZ / mix * 12 };
  blade.tipSpeed = 12;
  fist.tipVelocity = { x: 0, y: 0, z: 0 };
  fist.tipSpeed = 0;
  fist.shoulder = { x: at.x, y: at.y, z: at.z + 0.3 };

  const margin = (hand) => hand.reach + view.self.collisionRadius
    - Math.hypot(hand.shoulder.x - at.x, hand.shoulder.y - at.y, hand.shoulder.z - at.z);
  assert.ok(margin(fist) > margin(blade), "the fixture is one a reach-margin tiebreak answers 'secondary'");
  assert.ok(rx * blade.tipVelocity.x + ry * blade.tipVelocity.y + rz * blade.tipVelocity.z > 0,
    "and one the old key scores at zero, because the radial component is outward");

  const threat = selectThreat(view);
  assert.equal(threat.source, "primary", "the sword hand, which is the one that is moving");
  assert.equal(threat.striker, "sword");
  assert.equal(threat.tipSpeed, 12);
});

/**
 * And a stroke that is going to miss is not a stroke that is arriving.
 *
 * The other half of the same key, and the half `tipSpeed` alone could never
 * express: both hands are the same distance from the vitals and the faster one
 * is going somewhere else. Under the v3 rule -- speed, preferring the striking
 * hand -- the sweep at 12 m/s wins every time.
 */
test("a_slower_hand_that_is_arriving_outranks_a_faster_one_sweeping_past", () => {
  const view = facing("sword+empty", "sword+empty");
  const blade = view.opponent.hands.primary;
  const fist = view.opponent.hands.secondary;
  const at = vitals(view);
  // Same tip distance for both, so nothing here is decided by proximity.
  blade.tip = { x: at.x + 0.6, y: at.y + 0.2, z: at.z + 0.9 };
  fist.tip = { x: at.x - 0.6, y: at.y + 0.2, z: at.z + 0.9 };
  send(blade, { x: at.x + 2.4, y: at.y + 0.2, z: at.z - 0.4 }, 12);
  send(fist, at, 5);

  const threat = selectThreat(view);
  assert.equal(threat.source, "secondary", "the fist that is actually coming to the vitals");
  assert.ok(threat.closestMiss < 1e-9, `and it is coming to them, miss ${threat.closestMiss}`);
  assert.ok(threat.timeToClosest > 0);
});

/**
 * Two hands that are both doing nothing: the primary, as both motor copies said.
 *
 * `threatHand` broke that tie with `primary.tipSpeed >= secondary.tipSpeed`, so
 * a body at rest was guarded against its primary. The shipped v4.0 broke it on
 * reach margin instead -- a third rule, present in neither copy it replaced --
 * and this fixture is built so the two disagree: the secondary's shoulder is
 * pulled a metre and a half nearer the observer, which makes its margin the
 * larger of the two even though it is a bare hand and the other holds a sword.
 */
test("two_hands_doing_nothing_break_the_tie_to_the_primary", () => {
  const view = facing("sword+empty", "sword+empty");
  const at = vitals(view);
  for (const name of ["primary", "secondary"]) {
    view.opponent.hands[name].tipVelocity = { x: 0, y: 0, z: 0 };
    view.opponent.hands[name].tipSpeed = 0;
  }
  const near = view.opponent.hands.secondary;
  near.shoulder = { x: at.x, y: at.y, z: at.z + 0.3 };
  const far = view.opponent.hands.primary;
  const margin = (hand) => hand.reach + view.self.collisionRadius
    - Math.hypot(hand.shoulder.x - at.x, hand.shoulder.y - at.y, hand.shoulder.z - at.z);
  assert.ok(margin(near) > margin(far),
    "the fixture is one where a reach-margin tiebreak would answer 'secondary'");

  assert.equal(selectThreat(view).source, "primary",
    "ties go to the primary hand, which is what both copies of the old rule did");
});

/**
 * A shaft aimed the way an archer actually aims one, at the range that made the
 * gravity-free solve wrong.
 *
 * `actionArcherAim` lifts the shot by `actionArrowLift`, so the velocity a
 * defender sees points *above* its vitals and a straight-line extrapolation
 * sails over them: 689 mm of predicted miss at 18 m, against a gate of 610. The
 * shipped version declined shafts that were going to hit, at exactly the ranges
 * a bow is used at. Both halves are asserted, so this fails if the correction is
 * removed *and* it would have failed before it was added.
 */
test("a_lifted_shaft_is_answered_at_the_range_it_is_actually_taken_at", () => {
  const view = facing("sword+empty", "sword+empty");
  const at = vitals(view);
  const range = 18;
  const flight = range / ACTION_TUNING.arrowSpeed;
  const lift = ACTION_TUNING.gravity * flight * flight * 0.5;
  const from = { x: at.x, y: 1.42, z: at.z - range };
  const along = { x: 0, y: at.y + lift - from.y, z: range };
  const length = Math.hypot(along.x, along.y, along.z);
  const shot = { kind: "arrow", owner: "opponent", position: from, age: 0,
    velocity: { x: along.x / length * ACTION_TUNING.arrowSpeed, y: along.y / length * ACTION_TUNING.arrowSpeed,
      z: along.z / length * ACTION_TUNING.arrowSpeed } };
  view.projectiles.push(shot);
  assertCompleteView(view, "a lifted shaft");

  // What the straight line says about the same shaft, which is the reading that
  // used to decide whether it was worth answering at all.
  const speed2 = shot.velocity.x ** 2 + shot.velocity.y ** 2 + shot.velocity.z ** 2;
  const rx = from.x - at.x; const ry = from.y - at.y; const rz = from.z - at.z;
  const straightT = -(rx * shot.velocity.x + ry * shot.velocity.y + rz * shot.velocity.z) / speed2;
  const straightMiss = Math.hypot(rx + shot.velocity.x * straightT, ry + shot.velocity.y * straightT,
    rz + shot.velocity.z * straightT);
  assert.ok(straightMiss > view.self.collisionRadius + ACTION_TUNING.arrowMissMargin,
    `a straight line puts this shaft ${straightMiss.toFixed(3)} m wide, outside the gate`);

  const threat = selectThreat(view);
  assert.equal(threat.striker, "arrow", "and it is answered anyway, because it is not travelling in a straight line");
  assert.ok(threat.closestMiss < view.self.collisionRadius,
    `it arrives inside the body, miss ${threat.closestMiss.toFixed(3)} m`);
  assert.ok(Math.abs(threat.timeToClosest - flight) < 0.02,
    `after about the flight time it was aimed for, got ${threat.timeToClosest.toFixed(3)} s`);
});

/**
 * Jaws are a striker, and rank with the hands rather than under them.
 *
 * **Nothing published today has both**, and that is the reason this fixture is
 * hand-built rather than taken from a body: `Centipede` publishes a bite and no
 * hands, every warrior publishes hands and no bite, so no bout in the tree can
 * tell the two orderings apart. The shipped version put a bite in the same tier
 * as an attached hand that *cannot* strike, so a moving shield would have
 * outranked a set of jaws the day something had both. The tier is `isStriking`,
 * and a bite is a striker.
 */
test("a_bite_competes_with_the_hands_that_can_strike_and_not_below_them", () => {
  const view = facing("sword+empty", "sword+buckler");
  const at = vitals(view);
  view.opponent.naturalAttacks = { bite: { reach: 0.62, ready: true, active: false } };
  view.opponent.tip = { x: at.x, y: at.y + 0.05, z: at.z + 0.7 };
  view.opponent.tipSpeed = 3;
  // Both hands are covering rather than striking: a buckler, and a sword hand
  // that has been cut off. Only the jaws can hurt.
  view.opponent.hands.primary.lost = true;
  send(view.opponent.hands.secondary, at, 9);
  assertCompleteView(view, "a body with jaws and hands");

  const threat = selectThreat(view);
  assert.equal(threat.striker, "bite", "a buckler moving at 9 m/s is still not a thing that can hurt");
  assert.equal(threat.weapon, "empty", "and it is in nobody's hand");
  assert.equal(threat.source, null);
  assert.equal(threat.reach, 0.62);
});

test("a_mounted_sword_is_selected_from_body_neutral_effectors_without_a_fake_hand", () => {
  const view = facing("empty+empty", "empty+empty");
  const at = vitals(view);
  const effector = { weapon: "sword", anchor: { x: at.x + 0.45, y: at.y, z: at.z + 1.0 },
    tip: { x: at.x + 0.20, y: at.y, z: at.z + 0.65 },
    tipVelocity: { x: -1.2, y: 0, z: -5.8 }, reach: 1.1, lost: false };
  view.opponent.effectors = [effector];

  const threat = selectThreat(view);
  assert.equal(threat.striker, "sword");
  assert.equal(threat.weapon, "sword");
  assert.equal(threat.source, null, "a mounted module is not assigned to an invented humanoid hand");
  assert.deepEqual(threat.velocity, effector.tipVelocity);
  assert.equal(threat.reach, 1.1);

  // This is the mutation boundary: the same fast geometry must stop winning as soon as its real
  // module is unavailable. Merely adding an effector row without consuming `lost` fails here.
  effector.lost = true;
  assert.equal(selectThreat(view).striker, "empty");
});

/**
 * The guard, doing its job, on the failure that actually happened.
 *
 * Every other fixture in this file hands `assertCompleteView` a complete view, so nothing
 * else ever sees it refuse one -- and a guard nothing ever watches fail is a guard nobody
 * knows is still connected. `vitalHeight` is the field session 16 added and every fixture in
 * this directory was missing; without it `selectThreat` measures every approach to
 * `undefined`, which loses every comparison silently.
 */
test("an_incomplete_view_is_refused_before_any_reader_sees_it", () => {
  const complete = () => ({
    self: body("sword+empty", { z: 0, toward: 1, side: 1 }),
    opponent: body("sword+empty", { z: 1.55, toward: -1, side: 1, lateral: -0.4 }),
    projectiles: [], measure: 1.2, clock: 7.5,
  });
  assert.doesNotThrow(() => assertCompleteView(complete()));

  const missingField = complete();
  delete missingField.self.vitalHeight;
  assert.throws(() => assertCompleteView(missingField), /vitalHeight/,
    "a body without its vital height is not a view");

  const missingHandField = complete();
  delete missingHandField.opponent.hands.primary.tipVelocity;
  assert.throws(() => assertCompleteView(missingHandField), /tipVelocity/,
    "a hand without its velocity is not a hand");

  const noProjectiles = complete();
  delete noProjectiles.projectiles;
  assert.throws(() => assertCompleteView(noProjectiles), /projectiles/,
    "a body with no bow publishes an empty array, not nothing");

  // And the quiet one: `NaN` in a field that is present, which every clamp in
  // the table would turn into a zero nobody could see.
  const notANumber = complete();
  notANumber.opponent.hands.secondary.tipSpeed = Number.NaN;
  assert.throws(() => assertCompleteView(notANumber), /tipSpeed/,
    "a finite number is part of what a view publishes");
});
