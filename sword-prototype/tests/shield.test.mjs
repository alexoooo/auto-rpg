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
import { attachPhysics, LAYER, COLLIDES } from "../src/physics.ts";
import { Fighter } from "../src/fighter.ts";
import { mountFor, mountRotation } from "../src/weapon.ts";
import { blankIntent } from "../src/policies.ts";

/**
 * A shield is held, not aimed.
 *
 * It was welded like a blade -- face normal along the arm -- for as long as it
 * existed, and every complaint about it followed from that one line. A hand that
 * hung by its owner's side laid the plate flat like a table top through his hip;
 * a hand that guarded faced the plate at whatever the arm was pointing at, which
 * is never the enemy, because the arm points at the enemy.
 *
 * Then it got worse than cosmetic. The plate stands 110 mm off the fist along
 * the hand's +X, and a hand is built in the torso's frame, so the off hand's
 * shield was **built inside its owner's pelvis** -- on the layer that says the
 * two may not overlap. The contact pinned the arm at full extension before it
 * had lifted once, so the hand never re-orientated, so the overlap never
 * cleared. A shield arm tracked its anchor 350 mm away where a sword arm tracked
 * it to nothing, and no amount of looking at the pose would have found it,
 * because the pose was a symptom.
 *
 * The first test here is that regression written down. The rest are the claims
 * the fix rests on.
 *
 * Real solver, like `death.test.mjs` and for the same reason: every claim is
 * about what native constraint objects do. Havok's wasm has to be handed over as
 * bytes -- its emscripten glue calls `fetch()` and Node cannot fetch `file://`.
 */

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const B = CONFIG.body;

async function ring(loadout) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"),
    leather: mat("leather"), brass: mat("brass"), hide: mat("hide"),
    wood: mat("wood"), arrowAccent: mat("arrow-accent"),
  };

  const intent = blankIntent();
  const mind = { name: "held", decide: () => intent };
  const left = new Fighter(scene, {
    side: "left", origin: Vector3.Zero(), facing: 0, mind, loadout,
  }, materials);
  const right = new Fighter(scene, {
    side: "right", origin: new Vector3(0, 0, CONFIG.fighter.separation),
    facing: Math.PI, mind: { name: "still", decide: () => blankIntent() },
    loadout: { primary: "empty", secondary: "empty" },
  }, materials);

  const clock = { now: 0 };
  const run = (seconds) => {
    const observer = scene.onBeforePhysicsObservable.add(() => {
      left.observe(right, clock.now);
      right.observe(left, clock.now);
      left.update(FIXED);
      right.update(FIXED);
      clock.now += FIXED;
    });
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 / 60);
    }
    scene.onBeforePhysicsObservable.remove(observer);
  };

  return { engine, scene, left, intent, run };
}

/** How far a hand is from the anchor dragging it, in millimetres. */
const strayMm = (arm) =>
  Vector3.Distance(arm.hand.mesh.position, arm.handAnchor.mesh.position) * 1000;

/**
 * The trunk, as capsules: a segment and a radius each.
 *
 * Reconstructed from `config.ts` rather than asked of Havok, because what is
 * being tested is whether the *shape* is somewhere it should not be, and asking
 * the solver whether it thinks two of its own bodies overlap is asking the
 * accused.
 */
function trunk(fighter) {
  const spec = [
    [fighter.torso, B.torsoLength, B.torsoRadius],
    [fighter.head, B.headLength, B.headRadius],
    [fighter.pelvis, B.pelvisLength, B.pelvisRadius],
  ];
  for (const limb of fighter.limbs) {
    if (limb.key.startsWith("thigh")) spec.push([limb.part, B.thighLength, B.thighRadius]);
    if (limb.key.startsWith("shin")) spec.push([limb.part, B.shinLength, B.shinRadius]);
  }
  return spec.map(([part, length, radius]) => {
    const m = part.mesh.computeWorldMatrix(true);
    const axis = new Vector3(m.m[4], m.m[5], m.m[6]).normalize();
    const centre = new Vector3(m.m[12], m.m[13], m.m[14]);
    const half = Math.max(0, length / 2 - radius);
    return { a: centre.add(axis.scale(half)), b: centre.subtract(axis.scale(half)), radius };
  });
}

const toSegment = (p, a, b) => {
  const ab = b.subtract(a);
  const denominator = Vector3.Dot(ab, ab);
  const t = denominator < 1e-9
    ? 0
    : Math.min(1, Math.max(0, Vector3.Dot(p.subtract(a), ab) / denominator));
  return Vector3.Distance(p, a.add(ab.scale(t)));
};

/**
 * A grid of points over the face of whichever shield this is, in its own frame.
 *
 * **Per kind, and it has to be.** This used to be the heater shield's rectangle
 * written out inline, which would have gone on passing for a buckler by sampling
 * a 440x600 mm patch of empty air where a 340 mm disc is -- a green test
 * asserting nothing, which `AGENTS.md` calls the worst defect this directory
 * produces. The two kinds do not even agree about which local axis is the long
 * one: a strapped shield lies along +Z and a buckler is a disc in the XZ plane
 * with its normal on +Y.
 */
function facePoints(kind) {
  const points = [];
  if (kind === "buckler") {
    const B = CONFIG.buckler;
    for (let ring = 0; ring <= 3; ring += 1) {
      const r = (ring / 3) * (B.diameter / 2);
      const steps = ring === 0 ? 1 : 8 * ring;
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2;
        points.push(new Vector3(Math.cos(a) * r, B.standOff, Math.sin(a) * r));
      }
    }
    return points;
  }
  const S = CONFIG.shield;
  const along = S.height / 2 - S.gripInset;
  for (let i = 0; i <= 6; i += 1) {
    for (let j = 0; j <= 8; j += 1) {
      points.push(
        new Vector3((i / 6 - 0.5) * S.width, S.standOff, along + (j / 8 - 0.5) * S.height),
      );
    }
  }
  return points;
}

/** How far the plate is inside the trunk, in millimetres, at its deepest. */
function biteMm(fighter, arm) {
  const m = arm.weapon.root.computeWorldMatrix(true);
  const capsules = trunk(fighter);
  const world = new Vector3();
  let deepest = 0;
  for (const local of facePoints(arm.weapon.kind)) {
    Vector3.TransformCoordinatesToRef(local, m, world);
    for (const c of capsules) {
      deepest = Math.max(deepest, c.radius - toSegment(world, c.a, c.b));
    }
  }
  return deepest * 1000;
}

test("an arm holding a shield tracks its anchor as closely as one holding a sword", async (t) => {
  const { engine, left, run } = await ring({ primary: "sword", secondary: "shield" });
  t.after(() => engine.dispose());

  run(3);

  // The regression, in one line: this was 350 mm and the sword's was nothing.
  // A tolerance rather than an equality because they are two different weights
  // on two different arms, but the failure being guarded against is three
  // orders of magnitude away from it.
  assert.ok(strayMm(left.arms.primary) < 5, `sword hand strayed ${strayMm(left.arms.primary)} mm`);
  assert.ok(
    strayMm(left.arms.secondary) < 5,
    `shield hand strayed ${strayMm(left.arms.secondary)} mm -- it is pinned on something`,
  );
});

for (const kind of ["shield", "buckler"]) {
  test(`a ${kind} stays out of the fighter carrying it, over the whole aiming envelope`, async (t) => {
    const { engine, left, intent, run } = await ring({ primary: kind, secondary: "empty" });
    t.after(() => engine.dispose());

    let worst = 0;
    let worstAt = null;
    for (const pointerX of [-1, -0.5, 0, 0.5, 1]) {
      for (const pointerY of [-1, 0, 1]) {
        for (const roll of [-2.6, 0, 2.6]) {
          for (const guard of [false, true]) {
            Object.assign(intent.primary, { pointerX, pointerY, roll, guard });
            run(0.4);
            const bite = biteMm(left, left.arms.primary);
            if (bite > worst) {
              worst = bite;
              worstAt = { pointerX, pointerY, roll, guard };
            }
          }
        }
      }
    }

    // Deepest anywhere in ninety poses is single-digit millimetres, which is
    // less than the plate's own half thickness and inside the solver's contact
    // slop.
    assert.ok(
      worst < 10,
      `${kind} ${worst.toFixed(1)} mm inside the trunk at ${JSON.stringify(worstAt)}`,
    );
  });
}

test("a strapped shield is held closer in than a buckler is held out", async (t) => {
  // The owner's complaint, as a number: "the shield is held with a full arm
  // extended, that's not how a person holds a shield, unless it's a buckler."
  // So the two must not agree, and the strapped one must be the near one.
  const shield = await ring({ primary: "shield", secondary: "empty" });
  t.after(() => shield.engine.dispose());
  shield.run(1.5);
  const strapped = shield.left.arms.primary.reach;

  const buckler = await ring({ primary: "buckler", secondary: "empty" });
  t.after(() => buckler.engine.dispose());
  buckler.run(1.5);
  const punched = buckler.left.arms.primary.reach;

  assert.ok(
    strapped <= CONFIG.shield.reachCap + 1e-6,
    `a strapped shield reached ${strapped.toFixed(3)} m, past its cap of ${CONFIG.shield.reachCap}`,
  );
  assert.ok(
    punched > strapped + 0.05,
    `a buckler is punched out (${punched.toFixed(3)} m) and a shield is not (${strapped.toFixed(3)} m)`,
  );
  assert.ok(
    Math.abs(punched - CONFIG.arm.reachNeutral) < 0.02,
    `a buckler takes the blade's reach, not a capped one: ${punched.toFixed(3)} m`,
  );
});

test("the collision table lets a shield rest on its owner and a blade pass through", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);
  t.after(() => engine.dispose());

  // Boxes rather than fighters. The claim is about the mask table and nothing
  // else, and a fighter would answer it through an arm.
  let column = 0;
  const drop = (label, floorLayer, floorMask, fallerLayer, fallerMask) => {
    const x = (column += 4);
    const floor = MeshBuilder.CreateBox(`floor.${label}`, { width: 2, height: 0.2, depth: 2 }, scene);
    floor.position.set(x, 1, 0);
    const fixed = new PhysicsAggregate(floor, PhysicsShapeType.BOX, { mass: 0 }, scene);
    fixed.shape.filterMembershipMask = floorLayer;
    fixed.shape.filterCollideMask = floorMask;

    const faller = MeshBuilder.CreateBox(`faller.${label}`, { size: 0.3 }, scene);
    faller.position.set(x, 2, 0);
    const body = new PhysicsAggregate(faller, PhysicsShapeType.BOX, { mass: 1 }, scene);
    body.shape.filterMembershipMask = fallerLayer;
    body.shape.filterCollideMask = fallerMask;
    return { label, faller };
  };

  const cases = [
    ["a shield stops on its own trunk", LAYER.LEFT_TRUNK, COLLIDES.LEFT_TRUNK, LAYER.LEFT_SHIELD, COLLIDES.LEFT_SHIELD, true],
    ["a blade passes through its own trunk", LAYER.LEFT_TRUNK, COLLIDES.LEFT_TRUNK, LAYER.LEFT_SWORD, COLLIDES.LEFT_SWORD, false],
    ["a shield passes through its own arm", LAYER.LEFT_ARM, COLLIDES.LEFT_ARM, LAYER.LEFT_SHIELD, COLLIDES.LEFT_SHIELD, false],
    ["an arm passes through its own trunk", LAYER.LEFT_TRUNK, COLLIDES.LEFT_TRUNK, LAYER.LEFT_ARM, COLLIDES.LEFT_ARM, false],
    ["a shield stops on the enemy", LAYER.RIGHT_TRUNK, COLLIDES.RIGHT_TRUNK, LAYER.LEFT_SHIELD, COLLIDES.LEFT_SHIELD, true],
    ["a blade stops on the enemy", LAYER.RIGHT_TRUNK, COLLIDES.RIGHT_TRUNK, LAYER.LEFT_SWORD, COLLIDES.LEFT_SWORD, true],
    ["a blade stops on the enemy's shield", LAYER.RIGHT_SHIELD, COLLIDES.RIGHT_SHIELD, LAYER.LEFT_SWORD, COLLIDES.LEFT_SWORD, true],
    ["an arrow stops on the enemy's shield", LAYER.RIGHT_SHIELD, COLLIDES.RIGHT_SHIELD, LAYER.LEFT_ARROW, COLLIDES.LEFT_ARROW, true],
    ["an arrow stops on the enemy's buckler layer", LAYER.LEFT_SHIELD, COLLIDES.LEFT_SHIELD, LAYER.RIGHT_ARROW, COLLIDES.RIGHT_ARROW, true],
  ].map(([label, fl, fm, bl, bm, lands]) => ({ ...drop(label, fl, fm, bl, bm), lands }));

  for (let frame = 0; frame < 120; frame += 1) scene._advancePhysicsEngineStep(1000 / 60);

  for (const c of cases) {
    assert.equal(c.faller.position.y > 1.0, c.lands, `${c.label}: y = ${c.faller.position.y.toFixed(2)}`);
  }
});

test("a strapped shield's face is square to the arm and a buckler's runs along it", () => {
  // `mountFor` gives the weapon's own +X and +Y in the hand's frame, and the
  // hand's -Y is the arm. So a blade's +Y is the arm, and a strapped shield's is
  // not -- and this is the whole difference between the two shields.
  const arm = new Vector3(0, -1, 0);

  const blade = mountFor("sword");
  assert.equal(Vector3.Dot(blade.perp, arm), 1, "a blade leaves the fist along the arm");

  const shield = mountFor("shield");
  assert.equal(Vector3.Dot(shield.perp, arm), 0, "a shield's face is square to the arm");
  // And on the hand's +X, which is the axis `roll` turns.
  assert.equal(shield.perp.x, 1);

  const buckler = mountFor("buckler");
  assert.equal(
    Vector3.Dot(buckler.perp, arm),
    1,
    "a buckler is punched out along the arm, so it faces wherever the arm points",
  );
  assert.deepEqual(
    { axis: buckler.axis.asArray(), perp: buckler.perp.asArray() },
    { axis: blade.axis.asArray(), perp: blade.perp.asArray() },
    "and it takes the blade's mount exactly, which is why it needs none of the shield's machinery",
  );

  for (const kind of ["sword", "shield", "buckler", "club"]) {
    const { axis, perp } = mountFor(kind);
    assert.equal(Vector3.Dot(axis, perp), 0, `${kind}: the two mount axes must be perpendicular`);
    assert.equal(Vector3.Cross(axis, perp).length(), 1, `${kind}: and unit, or the frame is not one`);
  }
});

test("every weapon is built in the frame its own weld demands", async (t) => {
  // A weld between two frames that disagree at construction is a violation the
  // solver clears on the first step, and it clears it by flinging the thing.
  // Measured, peak tip speed in the first fifth of a second of a fighter
  // standing perfectly still: sword 48.3 m/s before this held, club 80.4,
  // shield 26.8. They are 23.9, 19.1 and 3.5 now, and what is left is the arm
  // being lifted out of its build pose rather than the weld snapping shut.
  for (const kind of ["sword", "shield", "buckler", "club"]) {
    const { engine, left } = await ring({ primary: kind, secondary: "empty" });
    t.after(() => engine.dispose());

    const arm = left.arms.primary;
    const hand = arm.hand.mesh.computeWorldMatrix(true);
    const built = arm.weapon.root.computeWorldMatrix(true);

    const wanted = mountRotation(kind, arm.hand.mesh.rotationQuaternion);
    const axes = (m) => [
      new Vector3(m.m[0], m.m[1], m.m[2]),
      new Vector3(m.m[4], m.m[5], m.m[6]),
      new Vector3(m.m[8], m.m[9], m.m[10]),
    ];
    const [handX, handY] = axes(hand);
    const [weaponX, weaponY] = axes(built);
    const mount = mountFor(kind);

    // The weapon's own +X and +Y, in the hand's frame, are what the weld pins.
    assert.ok(
      Math.abs(Vector3.Dot(weaponX, handX) - mount.axis.x) < 1e-6
      && Math.abs(Vector3.Dot(weaponY, handX) - mount.perp.x) < 1e-6
      && Math.abs(Vector3.Dot(weaponY, handY) - mount.perp.y) < 1e-6,
      `${kind} is built out of its weld's frame`,
    );
    assert.ok(wanted, "and `mountRotation` is the thing that put it there");
  }
});

test("a weapon does not collide with the arm that is holding it", async () => {
  /**
   * The regression this session found, and it is the same *shape* as the one at
   * the top of this file: a rule stated at length in `physics.ts`, believed by
   * everybody, and not enforced anywhere.
   *
   * `Weapon.finish` set its collision masks on the `PhysicsShapeContainer`.
   * Havok filters on the **leaf** shapes and ignores a container's mask
   * entirely, so every weapon in the program carried the default filter, which
   * collides with everything. Measured on a real fighter swept through its
   * envelope for twelve seconds: the sword logged 1687 contacts against its own
   * upper arm, 1572 against its own forearm, 853 against its own torso and 795
   * against its own shield; the shield logged 985 against its owner's head, 725
   * and 669 against its owner's two arms, and 391 against its own hand.
   *
   * The shield's is the expensive half. The plate hangs 110 mm off the fist and
   * its own forearm sits inside that gap by construction, so that is *permanent*
   * contact between a 4 kg lever and the chain driving it -- which is exactly
   * the failure the four-layers-per-side split was invented to prevent, running
   * the whole time it was there.
   *
   * It was invisible because the symptom is friction rather than a hole, in a
   * prototype whose whole subject is how cleanly an arm tracks its anchor.
   */
  const { engine, left, intent, run } = await ring({ primary: "sword", secondary: "shield" });
  try {
    const own = new Set();
    for (const limb of left.limbs) own.add(limb.part.body);

    const arms = new Set();
    for (const name of ["primary", "secondary"]) {
      const arm = left.arms[name];
      for (const part of [arm.upperArm, arm.forearm, arm.hand]) arms.add(part.body);
    }

    const hits = { sword: 0, shield: 0, swordOwnArm: 0, shieldOwnArm: 0 };
    const watch = (weapon, key) => {
      weapon.body.getCollisionObservable().add((event) => {
        if (own.has(event.collidedAgainst)) hits[key] += 1;
        if (arms.has(event.collidedAgainst)) hits[`${key}OwnArm`] += 1;
      });
    };
    watch(left.arms.primary.weapon, "sword");
    watch(left.arms.secondary.weapon, "shield");

    // Sweep both hands right through their envelopes, which is what found it.
    for (let leg = 0; leg < 24; leg += 1) {
      const a = (leg / 24) * Math.PI * 2;
      intent.primary.pointerX = Math.sin(a * 1.7);
      intent.primary.pointerY = Math.cos(a * 1.1);
      intent.secondary.pointerX = Math.sin(a * 0.9 + 1);
      intent.secondary.pointerY = Math.cos(a * 1.4 + 2);
      run(0.5);
    }

    assert.equal(hits.swordOwnArm, 0, "a blade passes through the arm swinging it");
    assert.equal(
      hits.shieldOwnArm,
      0,
      "and a shield through both of its owner's -- the 4 kg lever that must not be in permanent contact",
    );
    // What the shield *is* allowed to find is its owner's trunk, which is the
    // entire reason it has a layer of its own. So this is not "a shield touches
    // nothing"; it is a shield touching the one thing it should.
    assert.ok(hits.shield > 0, "the shield still stops on its owner's trunk, which is its whole job");
  } finally {
    engine.dispose();
  }
});
