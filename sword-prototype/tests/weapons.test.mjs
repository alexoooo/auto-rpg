import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, LAYER, COLLIDES } from "../src/physics.ts";
import { Weapon, mountFor } from "../src/weapon.ts";
import { Fighter } from "../src/fighter.ts";
import { Combat } from "../src/combat.ts";
import { idleMind } from "../src/mind.ts";
import {
  WEAPON_KINDS,
  cutsBothWays,
  handsFor,
  hasPoint,
  isShield,
  isStrapped,
  isStriking,
  isWeaponKind,
  kindOrEmpty,
} from "../src/hands.ts";

/**
 * The weapon table, and the axe that found out it was lying.
 *
 * Every question a program asks about a weapon used to be a `===` chain with a
 * default, in five files, and every one of them answered for a kind it had never
 * heard of. The answers were plausible, which is what made them expensive:
 * `isStriking` defaults to *false*, and session 03 made that the question a
 * policy asks to decide which hand it attacks with -- so a fully built weapon
 * with a mesh, a builder, a config block and a picker entry is one a fighter
 * stands there holding. `scoreHit` defaults to the sword, so a new weapon is not
 * broken, it is an arming sword with a different mesh and nothing on screen
 * says so.
 *
 * The tests below are mostly loops over `WEAPON_KINDS`, and that is deliberate:
 * a test that names the kinds it knows about is the same fault one layer up.
 *
 * Real solver, like `shield.test.mjs`, because half the claims are about what a
 * built body actually weighs and where. Havok's wasm has to be handed over as
 * bytes -- its emscripten glue calls `fetch()` and Node cannot fetch `file://`.
 */

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

/** Everything that is a thing you can hold. `empty` is a kind, not an object. */
const THINGS = WEAPON_KINDS.filter((kind) => kind !== "empty");

async function bench() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    steel: mat("steel"), leather: mat("leather"), brass: mat("brass"), wood: mat("wood"),
    arrowAccent: mat("arrow-accent"),
  };
  const make = (kind) =>
    new Weapon(scene, {
      name: kind,
      kind,
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      layer: LAYER.LEFT_SWORD,
      collidesWith: COLLIDES.LEFT_SWORD,
    }, materials);
  return { engine, scene, make };
}

async function fighterBench(loadout) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"),
    leather: mat("leather"), brass: mat("brass"), hide: mat("hide"),
    wood: mat("wood"), arrowAccent: mat("arrow-accent"),
  };
  const fighter = new Fighter(scene, {
    side: "left",
    origin: Vector3.Zero(),
    facing: 0,
    mind: idleMind(),
    loadout,
  }, materials);
  return { engine, scene, fighter, materials };
}

// ---- the layer, which for a whole year did nothing --------------------------

test("a weapon's collision layer reaches the shapes the solver actually filters on", async () => {
  const { engine, make } = await bench();
  try {
    for (const kind of THINGS) {
      const weapon = make(kind);
      // Read the *leaves*. Havok filters on them and ignores the container's own
      // mask entirely -- and reading a container's mask back does not report the
      // problem either, it reports garbage: a container set to 8 handed back
      // 383476. So this asks the shapes the solver asks.
      const parts = weapon.pieces;
      assert.ok(parts.length > 0, `${kind} is made of something`);
      for (const part of parts) {
        assert.equal(
          part.filterMembershipMask,
          LAYER.LEFT_SWORD,
          `${kind}: every piece is on the layer it was built with`,
        );
        assert.equal(part.filterCollideMask, COLLIDES.LEFT_SWORD, `${kind}: and collides with it`);
      }
    }
  } finally {
    engine.dispose();
  }
});

test("re-layering a weapon reaches every piece of it", async () => {
  // `Arm.drop` calls this, and used to do it by writing the container's masks --
  // so "a dropped weapon is debris like any other piece" was true in the comment
  // and false in the solver, for as long as there was a comment.
  const { engine, make } = await bench();
  try {
    const sword = make("sword");
    sword.relayer(LAYER.DEBRIS, COLLIDES.DEBRIS);
    for (const part of sword.pieces) {
      assert.equal(part.filterMembershipMask, LAYER.DEBRIS);
      assert.equal(part.filterCollideMask, COLLIDES.DEBRIS);
    }
  } finally {
    engine.dispose();
  }
});

// ---- the table itself -----------------------------------------------------

test("every kind the code has can be built, and the one that cannot says so", async () => {
  const { engine, make } = await bench();
  try {
    for (const kind of THINGS) {
      const weapon = make(kind);
      assert.equal(weapon.kind, kind);
      assert.ok(weapon.tipOffset > 0, `${kind} needs a length`);
      assert.ok(weapon.body.getMassProperties().mass > 0, `${kind} needs a mass`);
    }
    // Not an oversight and not a gap in the table: there is no body to weld to a
    // hand holding nothing, so `Arm` never asks for one, and asking anyway is a
    // mistake worth a message rather than a shape with no children.
    assert.throws(() => make("empty"), /empty hand/);
  } finally {
    engine.dispose();
  }
});

test("an_empty_hand_builds_no_weapon_body_but_exposes_one_fist_striker", async (t) => {
  const { engine, scene, fighter } = await fighterBench({ primary: "empty", secondary: "shield" });
  t.after(() => engine.dispose());

  const arm = fighter.arms.primary;
  const fists = fighter.strikers.filter((striker) => striker.kind === "empty");
  assert.equal(arm.weapon, null, "the empty hand still builds no Weapon");
  assert.equal(fists.length, 1, "one attached empty hand exposes one striker");
  assert.equal(fists[0].body, arm.hand.body, "the striker is the visible simulated hand body");
  assert.equal(
    scene.meshes.some((mesh) => mesh.name.includes("primary.weapon")),
    false,
    "there is no invisible weapon mesh beside the fist",
  );

  arm.hand.body.setLinearVelocity(new Vector3(4.25, -1.5, 0.75));
  arm.hand.body.setAngularVelocity(new Vector3(0, 0, 2));
  const centre = arm.hand.body.getObjectCenterWorld();
  const right = centre.add(new Vector3(1, 0, 0));
  const left = centre.add(new Vector3(-1, 0, 0));
  assert.deepEqual(
    fists[0].velocityAt(right).asArray(),
    [4.25, 0.5, 0.75],
    "angular velocity adds omega cross radius on one side of the hand",
  );
  assert.deepEqual(
    fists[0].velocityAt(left).asArray(),
    [4.25, -3.5, 0.75],
    "and reverses at the opposite material point",
  );
});

test("a_slow_fist_slaps_and_shoves_without_hurting", () => {
  let contact;
  const impulses = [];
  const weapon = {
    kind: "empty",
    spent: false,
    body: {
      getCollisionObservable: () => ({
        add: (callback) => { contact = callback; return {}; },
        remove: () => {},
      }),
    },
    velocityAt: () => new Vector3(2, 0, 0),
    edgeDirection: () => new Vector3(1, 0, 0),
    bladeDirection: () => new Vector3(0, 1, 0),
    tipPosition: () => Vector3.Zero(),
  };
  const limb = {
    key: "torso", label: "Torso", health: 100, maxHealth: 100,
    severed: false, lastHitAt: -999,
    part: { body: { applyImpulse: (impulse) => impulses.push(impulse.clone()) } },
  };
  const combat = new Combat("left", [weapon]);
  combat.attach({
    limbFor: () => limb,
    parriedBy: () => null,
    sever: () => assert.fail("a slap cannot sever"),
  });

  contact({
    type: PhysicsEventType.COLLISION_STARTED,
    point: Vector3.Zero(),
    impulse: 1,
    collidedAgainst: {},
  });

  assert.equal(limb.health, 100, "the sub-floor fist does no damage");
  assert.equal(combat.lastHit.kind, "slap");
  assert.equal(combat.lastHit.damage, 0);
  assert.equal(impulses.length, 1, "the contact still reaches the shove path");
  assert.ok(impulses[0].x > 0, "the shove follows the fist");
});

test("combat_reports_every_contact_before_its_screen_log_is_truncated", () => {
  let contact;
  const reports = [];
  const weapon = {
    kind: "empty", hand: "secondary", spent: false,
    body: { getCollisionObservable: () => ({ add: (callback) => { contact = callback; return {}; }, remove: () => {} }) },
    velocityAt: () => new Vector3(2, 0, 0), edgeDirection: () => new Vector3(1, 0, 0),
    bladeDirection: () => new Vector3(0, 1, 0), tipPosition: () => Vector3.Zero(),
  };
  const limb = { key: "torso", label: "Torso", health: 1000, maxHealth: 1000, severed: false,
    lastHitAt: -999, part: { body: { applyImpulse: () => {} } } };
  const combat = new Combat("left", [weapon], (event) => reports.push(event));
  combat.attach({ limbFor: () => limb, parriedBy: () => null, sever: () => {} });
  for (let i = 0; i < 40; i += 1) {
    contact({ type: PhysicsEventType.COLLISION_STARTED, point: Vector3.Zero(), impulse: 1, collidedAgainst: {} });
    combat.advance(CONFIG.combat.hitCooldown + 0.01);
  }
  assert.equal(reports.length, 40);
  assert.equal(combat.log.length, 24);
  assert.ok(reports.every((event) => event.hand === "secondary" && event.blocked === false));

  let blockedContact;
  const blockedWeapon = { ...weapon, hand: "primary", body: { getCollisionObservable: () => ({
    add: (callback) => { blockedContact = callback; return {}; }, remove: () => {},
  }) } };
  const blocks = [];
  const blockedCombat = new Combat("left", [blockedWeapon], (event) => blocks.push(event));
  blockedCombat.attach({ limbFor: () => null, parriedBy: () => ({ kind: "empty" }), sever: () => {} });
  blockedContact({ type: PhysicsEventType.COLLISION_STARTED, point: Vector3.Zero(), impulse: 1, collidedAgainst: {} });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].blocked, true);
  assert.equal(blocks[0].hand, "primary");
});

test("a_lost_empty_hand_cannot_score_or_block", async (t) => {
  const { engine, fighter } = await fighterBench({ primary: "empty", secondary: "shield" });
  t.after(() => engine.dispose());

  const arm = fighter.arms.primary;
  const fist = fighter.strikers.find((striker) => striker.kind === "empty");
  assert.ok(fist);
  assert.equal(fighter.parriedBy(arm.hand.body), fist);
  assert.equal(fighter.parriedBy(arm.forearm.body), fist, "the forearm and fist form one guard");

  arm.drop();
  assert.equal(fist.spent, true);
  assert.equal(fighter.strikers.some((striker) => striker.kind === "empty"), false);
  assert.equal(fighter.parriedBy(arm.hand.body), null);
  assert.equal(fighter.parriedBy(arm.forearm.body), null);
});

test("a_dropped_fist_contact_cannot_change_health_or_the_log", async (t) => {
  const { engine, fighter } = await fighterBench({ primary: "empty", secondary: "shield" });
  t.after(() => engine.dispose());

  const arm = fighter.arms.primary;
  const fist = fighter.strikers.find((striker) => striker.kind === "empty");
  const combat = new Combat("left", [fist]);
  const limb = {
    key: "torso", label: "Torso", health: 100, maxHealth: 100,
    severed: false, lastHitAt: -999,
    part: { body: { applyImpulse: () => assert.fail("spent fists do not shove") } },
  };
  combat.attach({
    limbFor: () => limb,
    parriedBy: () => null,
    sever: () => assert.fail("spent fists do not sever"),
  });

  arm.drop();
  arm.hand.body.getCollisionObservable().notifyObservers({
    type: PhysicsEventType.COLLISION_STARTED,
    point: arm.hand.body.getObjectCenterWorld(),
    impulse: 20,
    collidedAgainst: {},
  });

  assert.equal(limb.health, 100);
  assert.equal(combat.lastHit, null);
  assert.deepEqual(combat.log, []);
  combat.dispose();
});

test("a_fist_watcher_and_every_fighter_resource_leave_cleanly_across_rebuilds", async (t) => {
  const first = await fighterBench({ primary: "empty", secondary: "shield" });
  const { engine, scene, materials } = first;
  t.after(() => engine.dispose());
  const physics = scene.getPhysicsEngine();
  const plugin = physics.getPhysicsPlugin();
  const originalInit = plugin.initConstraint.bind(plugin);
  const originalDispose = plugin.disposeConstraint.bind(plugin);
  let created = 0;
  let disposed = 0;
  plugin.initConstraint = (...args) => { created += 1; return originalInit(...args); };
  plugin.disposeConstraint = (...args) => { disposed += 1; return originalDispose(...args); };
  t.after(() => {
    plugin.initConstraint = originalInit;
    plugin.disposeConstraint = originalDispose;
  });

  // The helper built one fighter before the spies were installed. Dispose it
  // to establish the empty-scene baseline, then measure ten complete rebuilds.
  first.fighter.dispose();
  const baseline = {
    bodies: physics.getBodies().length,
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
  };
  const build = () => new Fighter(scene, {
    side: "left", origin: Vector3.Zero(), facing: 0, mind: idleMind(),
    loadout: { primary: "empty", secondary: "shield" },
  }, materials);

  let shape = null;
  for (let generation = 0; generation < 10; generation += 1) {
    const beforeCreated = created;
    const beforeDisposed = disposed;
    const fighter = build();
    const built = {
      bodies: physics.getBodies().length - baseline.bodies,
      meshes: scene.meshes.length - baseline.meshes,
      constraints: created - beforeCreated,
    };
    if (shape === null) shape = built;
    else assert.deepEqual(built, shape, "a rebuild owns the same bodies, meshes, and constraints");

    const fist = fighter.strikers.find((striker) => striker.kind === "empty");
    const observable = fist.body.getCollisionObservable();
    const observers = observable.observers.length;
    const combat = new Combat("left", [fist]);
    assert.equal(observable.observers.length, observers + 1, "construct installs one watcher");
    combat.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(observable.observers.length, observers, "dispose removes that watcher");

    fighter.dispose();
    assert.equal(physics.getBodies().length, baseline.bodies, "all fighter bodies leave the scene");
    assert.equal(scene.meshes.length, baseline.meshes, "all fighter meshes leave the scene");
    assert.equal(scene.materials.length, baseline.materials, "only arena-owned materials remain");
    assert.equal(scene.textures.length, baseline.textures, "shared texture wrappers remain flat");
    assert.equal(disposed - beforeDisposed, built.constraints, "every constructed constraint is disposed");
  }
});

test("the questions about a kind are answered from one row, not from five chains", () => {
  // The property that matters is that every kind gets an answer at all. A `===`
  // chain gives one too -- that is the whole problem -- so what is asserted here
  // is the shape the answers have to make sense in.
  for (const kind of WEAPON_KINDS) {
    assert.ok(handsFor(kind) === 1 || handsFor(kind) === 2, `${kind} takes a number of hands`);
    assert.equal(
      isShield(kind) && isStriking(kind),
      false,
      `${kind} cannot both cover and strike -- they are the same field`,
    );
    if (isStrapped(kind)) {
      assert.ok(isShield(kind), "only a shield is strapped across the forearm");
    }
    if (hasPoint(kind) || cutsBothWays(kind)) {
      assert.ok(isStriking(kind), `${kind} has an edge or a point but is not a striking weapon`);
    }
  }
  assert.equal(handsFor("club"), 2, "and the club is still the two-handed one");
  assert.equal(isStrapped("shield"), true);
  assert.equal(isStrapped("buckler"), false, "a buckler is punched, not strapped");
});

test("a string from a picker is checked before it becomes a weapon", () => {
  for (const kind of WEAPON_KINDS) assert.equal(isWeaponKind(kind), true);
  assert.equal(isWeaponKind("halberd"), false);
  // `Object.hasOwn` rather than `in`, so a prototype member is not a weapon.
  assert.equal(isWeaponKind("constructor"), false);
  assert.equal(isWeaponKind("toString"), false);

  // And the conversion the arena actually calls, which used to be `as
  // WeaponKind` -- a promise about a string that came out of a `<select>`. It
  // held only while every question about a kind had a default; the tables are
  // total now, so the same string is a `TypeError` from inside `handsFor`.
  for (const kind of WEAPON_KINDS) assert.equal(kindOrEmpty(kind), kind);
  assert.equal(kindOrEmpty("halberd"), "empty");
  assert.equal(kindOrEmpty("toString"), "empty");
});

test("how a kind is carried decides its mount, rather than its name", async () => {
  // Two files used to know separately that `shield` was the strapped one, in a
  // `===` neither could see the other make. There is one answer now.
  for (const kind of WEAPON_KINDS) {
    const mount = mountFor(kind);
    const strapped = mount.axis.z !== 0;
    assert.equal(
      strapped,
      isStrapped(kind),
      `${kind}'s mount and its carry should be the same fact`,
    );
    // +X and +Y have to be perpendicular or the third axis is not a rotation.
    assert.ok(Math.abs(Vector3.Dot(mount.axis, mount.perp)) < 1e-9, `${kind}'s mount is skewed`);
  }
});

// ---- the axe --------------------------------------------------------------

test("the axe is shorter than the sword and carries its weight at the far end", async () => {
  const { engine, make } = await bench();
  try {
    const sword = make("sword");
    const axe = make("axe");

    assert.ok(
      axe.tipOffset < sword.tipOffset * 0.8,
      `an axe reaches ${axe.tipOffset.toFixed(3)} m against a sword's ${sword.tipOffset.toFixed(3)}`,
    );

    const swordBalance = sword.body.getMassProperties().centerOfMass;
    const axeBalance = axe.body.getMassProperties().centerOfMass;
    assert.ok(
      axeBalance.y > swordBalance.y * 2,
      "an axe balances out at the head, a sword just ahead of the guard",
    );
    // Past the middle of its own length, which a sword is nowhere near.
    assert.ok(axeBalance.y / axe.tipOffset > 0.6);
    assert.ok(swordBalance.y / sword.tipOffset < 0.3);
    // And off the haft axis, because the head is only on one side of it.
    assert.ok(axeBalance.x > 0.01, "an axe is off-balance sideways, and that is the weapon");
  } finally {
    engine.dispose();
  }
});

test("the axe's head is on +X, which is the axis the wrist turns", async () => {
  const { engine, make } = await bench();
  try {
    const axe = make("axe");
    // Built at identity, so the local frame is the world frame and the three
    // accessors the damage model reads should agree with the frame every kind
    // keeps: +Y along the weapon, +X the edge, +Z the flat.
    assert.ok(Vector3.Dot(axe.bladeDirection(), new Vector3(0, 1, 0)) > 0.999);
    assert.ok(Vector3.Dot(axe.edgeDirection(), new Vector3(1, 0, 0)) > 0.999);

    // The head is built on +X only. Its centre of mass says so, and so does the
    // fact that the mesh named `edge` is out past the haft on that side.
    const edge = axe.root.getChildMeshes().find((m) => m.name.endsWith(".edge"));
    assert.ok(edge, "an axe has an edge");
    assert.ok(edge.position.x > CONFIG.axe.headReach * 0.5, "and it is at the far side of the bit");
    assert.ok(edge.position.y > CONFIG.axe.gripLength, "and up at the head, not down at the grip");
  } finally {
    engine.dispose();
  }
});
