import test from "node:test";
import assert from "node:assert/strict";
import { handPose } from "../src/render/hand-pose.ts";
import { strikeHands, fighterHands } from "../src/render/strike-hands.ts";
import { dressRobot } from "../src/render/robot-skin.ts";
import { skinSlot } from "../src/render/skin-slot.ts";
import { commandsBody } from "../src/core/body.ts";
import { RECIPE_FIGHTER, COMBAT } from "../src/core/mind/config.ts";
import { DEFAULT_ENGINE } from "../src/core/engine/engines.ts";
import { modelSpec } from "../src/core/models.ts";
import { buildBout } from "../research/bout.mjs";
import { labActor } from "../src/lab/actor.ts";
import { throwBlow } from "../src/lab/blow.ts";
import { recordHistory } from "../src/lab/history.ts";
import { createPlayer } from "../src/lab/player.ts";
import { coreStand, freshEngine } from "./harness/core-stand.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun, WAKE_METRES } from "../src/dungeon/run.ts";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("hand transitions start at their current closure and each hand is independent", () => {
  const pose = handPose();
  assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
  pose.step("left", "close", .05);
  assert.deepEqual(pose.snapshot(), { left: .5, right: 0 });
  const saved = pose.snapshot();
  pose.step("left", "relax", .125);
  near(pose.closure("left"), .25);
  pose.step("left", "close", .05);
  near(pose.closure("left"), .625);
  pose.step("right", "fist", 1 / 120);
  assert.deepEqual(pose.snapshot(), { left: .625, right: 1 });
  pose.step("left", "close", .05);
  pose.step("right", "relax", .25);
  assert.deepEqual(pose.snapshot(), { left: 1, right: 0 });
  assert.deepEqual(saved, { left: .5, right: 0 });
  saved.left = 0;
  assert.equal(pose.closure("left"), 1, "editing a snapshot cannot change the live pose");
});

test("closure at simulation times is independent of step partition and render reads", () => {
  const run = hz => {
    const pose = handPose(), frames = [];
    for (const action of ["close", "fist", "relax"]) {
      for (let i = 0; i < hz / 10; i++) {
        pose.step("right", action, 1 / hz);
        for (let read = 0; read < 3; read++) pose.closure("right");
      }
      frames.push(pose.snapshot());
    }
    return frames;
  };
  for (const hz of [120, 240, 480]) {
    const frames = run(hz);
    for (const [i, expected] of [1, 1, .6].entries()) {
      near(frames[i].right, expected);
      assert.equal(frames[i].left, 0);
    }
  }
});

/** Only the scheduling seam is replaced; the adapter sees mutable ownership and real phase names. */
function clock() {
  const hooks = new Set();
  return {
    afterStep(hook) { hooks.add(hook); return { dispose: () => hooks.delete(hook) }; },
    step(dt) { for (const hook of hooks) hook(dt); },
    get observers() { return hooks.size; },
  };
}

test("strike presentation ignores stale reports on takeover, inactivity and elimination", () => {
  const world = clock(), body = { has: "command", level: "full" };
  const strike = { hand: "right", phase: "swing" };
  let ending = null;
  const pose = strikeHands(world, body, () => strike, () => ending === null);
  try {
    assert.equal(commandsBody(body), true);
    world.step(.01);
    assert.deepEqual(pose.snapshot(), { left: 0, right: 1 });
    for (const cause of ["takeover", "inactive", "eliminated"]) {
      if (cause === "takeover") body.has = "rise";
      if (cause === "inactive") body.level = "limp";
      if (cause === "eliminated") ending = "exhausted";
      world.step(.125);
      assert.deepEqual(pose.snapshot(), { left: 0, right: .5 }, cause);
      world.step(.125);
      assert.deepEqual(pose.snapshot(), { left: 0, right: 0 }, cause);
      body.has = "command"; body.level = "full"; ending = null;
      world.step(.01);
      assert.equal(pose.closure("right"), 1);
    }
    const saved = pose.snapshot();
    pose.dispose();
    world.step(1);
    assert.deepEqual(pose.snapshot(), saved);
    assert.equal(world.observers, 0);
  } finally { pose.dispose(); }
});

test("a fighter's fingers are its body's hand poses: shut in a fist or a grip, open else, and open with no pose", () => {
  const state = { left: { applied: "open", requested: "fist" }, right: { applied: "fist", requested: "fist" } };
  const fighter = { minded: { body: { built: { handPoses: { state } } } } };
  const pose = fighterHands(fighter);
  assert.deepEqual(pose.snapshot(), { left: 0, right: 1 });
  state.left.applied = "grip"; state.right.applied = "open";
  assert.deepEqual(pose.snapshot(), { left: 1, right: 0 });
  delete state.left;
  assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
  pose.dispose();
});

test("preparation, return, cancelled attacks and alternating hands share one phase adapter", () => {
  const world = clock(), strike = { hand: "left", phase: "chamber" };
  const pose = strikeHands(world, { has: "command", level: "full" }, () => strike);
  try {
    world.step(.05);
    assert.deepEqual(pose.snapshot(), { left: .5, right: 0 });
    strike.phase = "swing"; world.step(.01);
    assert.deepEqual(pose.snapshot(), { left: 1, right: 0 });
    strike.hand = "right"; strike.phase = "chamber"; world.step(.05);
    near(pose.closure("left"), .8); near(pose.closure("right"), .5);
    strike.phase = "return"; world.step(.25);
    assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
    for (const phase of ["approach", "place", "settle", null]) {
      strike.phase = "swing"; world.step(.01);
      strike.phase = phase; world.step(.25);
      assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
    }
  } finally { pose.dispose(); }
});

test("a real Lab blow records fists, replays them and preserves closure through skin replacement", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const actor = labActor(stand.built, stand.world);
  const blow = throwBlow(actor, { hand: "left", strike: null, place: { ahead: .5, up: 0 }, band: "high" });
  const hands = strikeHands(stand.world, actor.body, () => blow.report.strike);
  const history = recordHistory(stand.built, stand.world, 10, () => ({ closure: hands.snapshot(), phase: blow.report.strike.phase }));
  const player = createPlayer({ world: stand.world, recording: history }, () => {}, () => 0);
  const slot = skinSlot(stand.built);
  const options = { clothing: { boots: true, armour: true }, closure: hand => history.at(player.shownFrame() ?? history.live())?.closure[hand] ?? 0 };
  const replace = id => slot.replace(Promise.resolve((built, options) => dressRobot(built, stand.scene, id, options)), options);
  const finger = () => slot.meshes.find(m => m.name.endsWith(".hand.left.finger.0.2"));
  try {
    await replace("industrial");
    const open = finger().rotationQuaternion.asArray();
    let swing = -1;
    for (let i = 0; i < stand.seconds(9); i++) {
      stand.step();
      if (blow.report.strike.phase === "swing" && swing < 0) swing = history.live();
      if (swing >= 0 && hands.closure("left") === 0) break;
    }
    assert.ok(swing >= 0, "the fixture actually swings");
    assert.equal(history.at(swing).closure.left, 1);
    assert.deepEqual(hands.snapshot(), { left: 0, right: 0 });
    player.seek(swing);
    stand.scene.onBeforeRenderObservable.notifyObservers(stand.scene);
    const fist = finger().rotationQuaternion.asArray();
    assert.notDeepEqual(fist, open);
    const time = stand.world.time, frozen = hands.snapshot();
    player.tick(1000, Infinity);
    stand.scene.onBeforeRenderObservable.notifyObservers(stand.scene);
    assert.equal(stand.world.time, time);
    assert.deepEqual(hands.snapshot(), frozen);
    for (const id of ["relic", "duelist"]) {
      await replace(id);
      assert.deepEqual(finger().rotationQuaternion.asArray(), fist);
    }
    player.seek(0);
    stand.scene.onBeforeRenderObservable.notifyObservers(stand.scene);
    assert.deepEqual(finger().rotationQuaternion.asArray(), open);
    player.setPaused(false);
    for (let i = 0; i < 100 && player.shownFrame() !== null; i++) player.tick(100, Infinity);
    assert.equal(player.shownFrame(), null);
    stand.scene.onBeforeRenderObservable.notifyObservers(stand.scene);
    assert.deepEqual(finger().rotationQuaternion.asArray(), open);
  } finally { slot.dispose(); history.dispose(); hands.dispose(); blow.dispose(); stand.dispose(); }
});

test("Crypt supplies the world to presentation during construction and when an enemy wakes later", async () => {
  const engine = new NullEngine(), scene = new Scene(engine), size = 41, floor = new Uint8Array(size * size);
  for (let z = 19; z <= 21; z++) for (let x = 3; x <= 37; x++) floor[z * size + x] = 1;
  const layout = { seed: 42, size, floor, doors: [], rooms: [{ id: 0, centre: { x: 20, z: 20 }, min: { x: 3, z: 19 }, max: { x: 37, z: 21 } }],
    start: { x: 5, z: 20 }, exit: { x: 37, z: 20 }, spawns: [{ x: 5 + WAKE_METRES + .2, z: 20 }] };
  const presentations = [], seen = [];
  const run = new DungeonRun(scene, { seed: 42, engine: await freshEngine(), visuals: false, layout,
    onBuilt(actor, world) {
      seen.push({ id: actor.id, world });
      presentations.push(fighterHands(actor.fighter));
    } });
  try {
    assert.deepEqual(seen.map(s => s.id), ["hero"]);
    run.commands.setMode({ keyboard: true, facing: false });
    run.commands.up = 1; run.toward = { x: -1, z: 0 };
    for (let i = 0; i < 600 && seen.length < 2; i++) run.step();
    assert.deepEqual(seen.map(s => s.id), ["hero", "enemy-0"]);
    assert.ok(seen.every(s => s.world === run.world));
    // Each grips its club in its right hand, and its left is open.
    assert.deepEqual(presentations.map(p => p.snapshot()), [{ left: 0, right: 1 }, { left: 0, right: 1 }]);
  } finally {
    for (const presentation of presentations) presentation.dispose();
    run.dispose(); scene.dispose(); engine.dispose();
  }
});

for (const mind of [RECIPE_FIGHTER, COMBAT]) test(`${mind.tactics.kind}: actual Arena punches form fists without changing the bout`, async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 2, capSeconds: 8,
    balance: { left: 25, right: 25 }, held: { left: "empty", right: "empty" }, minds: { left: mind, right: mind } };
  const run = async decorated => {
    const stand = await buildBout(recipe, { physicsEngine: await freshEngine(DEFAULT_ENGINE) });
    const { world, duel } = stand, scene = world.scene, poses = [], skins = [], swung = new Set();
    try {
      // Classic receives stationary practice marks so its approach does not chase a moving foe.
      if (mind.tactics.kind === "seek") for (const side of ["left", "right"]) {
        const head = duel.duelists[side].body.physical.head;
        duel.order(side, { move: null, face: 0, attack: [head.x, head.y, head.z + .5] });
      }
      if (decorated) for (const [index, fighter] of Object.values(duel.duelists).entries()) {
        const hands = fighterHands(fighter);
        poses.push(hands);
        skins.push(dressRobot(fighter.built, scene, index ? "relic" : "industrial", { clothing: { boots: true, armour: true }, closure: hands.closure }));
      }
      while (!duel.verdict) {
        world.step();
        if (decorated) {
          scene.onBeforeRenderObservable.notifyObservers(scene);
          for (const [index, fighter] of Object.values(duel.duelists).entries()) {
            const strike = fighter.minded.skills.report.strike;
            if (strike.phase !== "swing" || !commandsBody(fighter.body) || fighter.pool.ending()) continue;
            assert.equal(poses[index].closure(strike.hand), 1);
            const finger = skins[index].meshes.find(m => m.name.endsWith(`.hand.${strike.hand}.finger.0.2`));
            near(finger.rotationQuaternion.x, -Math.sin(5 * Math.PI / 12));
            swung.add(`${fighter.side}:${strike.hand}`);
          }
        }
      }
      if (decorated) assert.ok(swung.size > 0, "the fixture contains an active punch");
      return { save: duel.save(), blows: structuredClone(duel.blows), verdict: duel.verdict };
    } finally {
      for (const pose of poses) pose.dispose();
      for (const skin of skins) skin.dispose();
      stand.dispose();
    }
  };
  assert.deepEqual(await run(true), await run(false));
});
