import assert from "node:assert/strict";
import test from "node:test";
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
import { defaultMatchup, EQUIPMENT, withEquipment } from "../src/bout.ts";
import { Fighter, stepPair } from "../src/fighter.ts";
import { policyMind, POLICIES } from "../src/mind.ts";
import { HUMANOID_CONTROL_SURFACE } from "../src/control-surfaces.ts";
import { attachPhysics, COLLIDES, LAYER, layersFor } from "../src/physics.ts";
import { Quiver } from "../src/arrow.ts";
import { composeTactic, handActionOption, movementIntent } from "../src/options.ts";
import { COMBAT_FIELDS } from "./fixtures/intent.mjs";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("../scripts/measure.mjs");

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;

const materialsFor = (scene) => {
  const mat = (name) => new StandardMaterial(name, scene);
  return {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"),
    leather: mat("leather"), brass: mat("brass"), hide: mat("hide"),
    wood: mat("wood"), arrowAccent: mat("arrow-accent"),
  };
};

const census = (scene) => ({
  meshes: scene.meshes.length,
  materials: scene.materials.length,
  textures: scene.textures.length,
  bodies: scene.getPhysicsEngine().getBodies().length,
  constraints: scene.getPhysicsEngine().getPhysicsPlugin()._integrationLiveConstraints ?? 0,
  // Observable removal is deferred with a zero-delay timer; marked observers
  // are already inert and are not live resources.
  beforePhysicsObservers: scene.onBeforePhysicsObservable.observers.filter((observer) => !observer._willBeUnregistered).length,
  beforeRenderObservers: scene.onBeforeRenderObservable.observers.filter((observer) => !observer._willBeUnregistered).length,
  particles: scene.particleSystems.length,
  trails: scene.meshes.filter((mesh) => mesh.name.endsWith(".trace")).length,
});

const torso = (fighter) => fighter.limbs.find((limb) => limb.key === "torso");

test("every_setup_loadout_and_policy_builds_steps_finishes_and_disposes", () => {
  const reachable = new Map();
  for (const handA of EQUIPMENT) for (const handB of EQUIPMENT) {
    let matchup = withEquipment(defaultMatchup(), "left", "handA", handA.name);
    matchup = withEquipment(matchup, "left", "handB", handB.name);
    const loadout = { primary: matchup.left.handA, secondary: matchup.left.handB };
    reachable.set(`${loadout.primary}/${loadout.secondary}`, loadout);
  }
  // Every policy this matchup's body can actually be handed. `defaultMatchup()` is two Warriors
  // and `EQUIPMENT` is a Warrior's hands, so the loop's subject is the humanoid surface; since
  // Session 09 `POLICIES` also holds `golem-duelist`, which `policyForUnit` refuses for a Warrior
  // by design. Filtering by the same field the picker filters by keeps this test asserting "every
  // policy that can reach this body survives a bout" rather than quietly asserting a count.
  // `golem-duelist` is exercised over a real golem in `tests/golem-mind.test.mjs`.
  const applicable = POLICIES.filter((policy) =>
    policy.surface === null || policy.surface === HUMANOID_CONTROL_SURFACE);
  assert.ok(applicable.length >= 5 && applicable.length < POLICIES.length,
    "the surface filter admits the humanoid policies and holds something back");
  for (const policy of applicable) {
    for (const [label, loadout] of reachable) {
      let samples = 0;
      const result = runBout({
        left: policy.name,
        right: "idle",
        seeds: [101, 202],
        leftLoadout: loadout,
        rightLoadout: { primary: "empty", secondary: "empty" },
        onSample({ right }) {
          samples += 1;
          if (samples === 8) torso(right).health = 0;
        },
      });
      assert.ok(samples >= 8, `${policy.name}/${label} stepped the real pair`);
      assert.equal(result.ending, "exhausted", `${policy.name}/${label} reached a verdict`);
      assert.equal(result.winner, "left", `${policy.name}/${label} kept the forced winner`);
    }
  }
});

test("every_finish_path_stops_combat_on_the_exact_verdict_step", async () => {
  const calls = { left: [], right: [] };
  let callsAtVerdict = null;
  const tracked = (name, side) => {
    const inner = policyMind(name, side === "left" ? 31 : 47);
    return { name: inner.name, decide(view, dt) { calls[side].push(view.clock); return inner.decide(view, dt); } };
  };
  let samples = 0;
  const result = runBout({
    left: "duelist", right: "swinger", seeds: [31, 47],
    leftMind: tracked("duelist", "left"), rightMind: tracked("swinger", "right"),
    physics: await freshHavok(),
    onSample({ right }) { samples += 1; if (samples === 60) torso(right).health = 0; },
    onVerdict() { callsAtVerdict = { left: calls.left.length, right: calls.right.length }; },
    postVerdictFrames: 3,
    postVerdictActionProbe: true,
  });
  assert.equal(result.ending, "exhausted");
  assert.equal(result.winner, "left");
  for (const side of ["left", "right"]) {
    assert.ok(calls[side].length > 0);
    assert.equal(calls[side].length, callsAtVerdict[side], `${side} mind stopped on the verdict step`);
    assert.ok(calls[side].at(-1) <= result.seconds + Number.EPSILON,
      `${side} received no command after the verdict clock ${result.seconds}`);
  }
});

for (const kind of ["shield", "buckler"]) {
  test(`an_arrow_stopped_by_a_${kind}_records_one_block_and_no_wound`, async () => {
    const contacts = [];
    const result = runBout({
      left: "archer", right: "duelist", seeds: [3101, 7103],
      leftLoadout: { primary: "bow", secondary: "empty" },
      rightLoadout: { primary: "sword", secondary: kind },
      physics: await freshHavok(),
      onEvent(event) {
        if (event.side === "left" && event.report.weapon === "arrow") contacts.push(event);
      },
    });
    const blocks = contacts.filter((event) => event.blocked && event.report.key === `block:${kind}`);
    assert.ok(blocks.length > 0, `${kind} physically intercepted at least one shot`);
    for (const block of blocks) {
      assert.equal(contacts.some((event) => !event.blocked && event.report.at === block.report.at), false,
        "the first-contact block cannot also become a wound before spent promotion");
    }
    assert.ok(result.right, "the real bout completed and disposed");
  });
}

/**
 * Renamed from `all_shipped_intents_stay_finite_and_anatomically_bounded_for_a_full_bout`
 * when session 15 took the camera out of the command. The bout it runs and every
 * bound it checks are unchanged; what it now also states is the shape it is
 * checking, once per control step of a real fight, which is where a stale field
 * would actually reach a fighter.
 */
test("every_policy_returns_a_finite_zoom_free_combat_command", () => {
  const loadoutFor = { idle: { primary: "sword", secondary: "empty" },
    swinger: { primary: "sword", secondary: "empty" }, duelist: { primary: "sword", secondary: "shield" },
    archer: { primary: "bow", secondary: "empty" } };
  const inspect = (intent, label) => {
    assert.deepEqual(Object.keys(intent).sort(), COMBAT_FIELDS, `${label} asked for a host field`);
    const axes = [intent.forward, intent.strafe, intent.turn,
      intent.posture.trunkLean, intent.posture.trunkTwist, intent.posture.crouch];
    for (const value of axes) assert.ok(Number.isFinite(value), `${label} returned a finite body axis`);
    for (const value of [intent.forward, intent.strafe, intent.turn, intent.posture.trunkLean, intent.posture.trunkTwist]) {
      assert.ok(value >= -1 && value <= 1, `${label} kept a normalized signed axis: ${value}`);
    }
    assert.ok(intent.posture.crouch >= 0 && intent.posture.crouch <= 1, `${label} kept crouch anatomical`);
    // A hand, or `null` -- and null means one thing only: what is acting is not
    // a hand. `crawler` drives a set of jaws and is the one shipped policy that
    // answers it, so pinning *which* policies answer null is what keeps this two
    // claims instead of a check every value passes.
    assert.ok(intent.actingHand === "primary" || intent.actingHand === "secondary" || intent.actingHand === null,
      `${label} named a real hand or none at all`);
    assert.equal(intent.actingHand === null, label === "crawler",
      `${label} names a hand exactly when a hand is what acts`);
    assert.equal(typeof intent.natural.thrust, "boolean", `${label} published a natural button`);
    assert.equal(typeof intent.natural.guard, "boolean", `${label} published a natural button`);
    for (const hand of [intent.primary, intent.secondary]) {
      for (const value of [hand.pointerX, hand.pointerY, hand.roll, hand.wristBend]) {
        assert.ok(Number.isFinite(value), `${label} returned a finite hand command`);
      }
      assert.ok(hand.pointerX >= -1 && hand.pointerX <= 1 && hand.pointerY >= -1 && hand.pointerY <= 1,
        `${label} kept its cursor in the controller envelope`);
      assert.ok(hand.roll >= CONFIG.arm.rollMin && hand.roll <= CONFIG.arm.rollMax,
        `${label} kept roll inside ${CONFIG.arm.rollMin}..${CONFIG.arm.rollMax}`);
      assert.ok(hand.wristBend >= 0 && hand.wristBend <= 1, `${label} kept wrist bend anatomical`);
    }
  };
  for (const [index, policy] of POLICIES.entries()) {
    const inner = policy.create(500 + index);
    const mind = { name: inner.name, decide(view, dt) { const intent = inner.decide(view, dt); inspect(intent, policy.name); return intent; } };
    const result = runBout({
      left: policy.name, right: "swinger", seeds: [500 + index, 900 + index], leftMind: mind,
      leftLoadout: loadoutFor[policy.name],
    });
    assert.ok(result.ending === "exhausted" || result.ending === "time", `${policy.name} completed a full bout`);
  }
});

/**
 * A target that does not move the contacted limb is a target in name only.
 *
 * This is asserted on `HitReport.key` out of a real Havok bout rather than on
 * `intent.pointerY`, and the difference is the whole point. A cursor elevation
 * is the *reachable* quantity -- it is written by the aim and read back by the
 * test that wrote it, so it goes green whether or not the blade ends up
 * anywhere new. Session 16 shipped exactly that shape of test twice. The limb
 * the sword actually bit is the quantity the decision is about, and only the
 * report knows it.
 *
 * **This names `thrust` because a thrust is a point, and it was called
 * `a_requested_high_or_low_target_reaches_that_body_region_without_fallback`
 * while covering one of four actions.** A cut and a punch are *strokes* -- the
 * aim seeds an arc rather than a destination -- and they get their own test
 * below, with a pooled sample, because one bout of a cut is 22 to 50 contacts of
 * which two or three are on a head. Stage B ran this fixture on a cut once and
 * read the noise as a rule; `docs/measurements.md` carries both sets of tables
 * and which of the two the session 18 change repaired. `shoot` still lands two
 * to four body contacts a bout here, which is too thin to be a claim about
 * anything and has no test.
 *
 * Measured on this fixture, thrusting with a sword against an idle warrior
 * (`head`, `torso`, and the `pelvis`/`thigh`/`shin` group, contacts per bout):
 *
 * | target        | head | torso | low group |
 * | ---           | ---: | ---:  | ---:      |
 * | as-measured   |   13 |   114 |        17 |
 * | high          |   76 |    66 |        15 |
 * | vital         |    6 |   295 |        32 |
 * | low           |    1 |    24 |       112 |
 *
 * The bands below are wide against those figures on purpose -- this is a
 * physics bout and the claim is about the distribution, not about a count --
 * but they are far inside what an ignored target produces, which is three
 * copies of the `as-measured` row.
 */
test("a_thrust_at_a_named_high_or_low_target_reaches_that_body_region", () => {
  const HIGH_KEYS = ["head"];
  const LOW_KEYS = ["pelvis", "thighL", "thighR", "shinL", "shinR"];
  const thrusting = (target, seen) => {
    let option = null;
    return { name: `thrust-${target}`, decide(view, dt) {
      if (!option || option.done(view)) {
        option = handActionOption("thrust", { effector: "primary", target, stance: "action-default" });
        option.enter(view);
      }
      const action = option.decide(view, dt);
      seen.add(action.actingHand);
      return composeTactic(view, "close", "thrust", movementIntent("close", view), action);
    } };
  };
  const distribution = (target) => {
    const keys = {}; const hands = new Set(); const filed = { primary: 0, secondary: 0 };
    runBout({
      left: "duelist", right: "idle", seeds: [11, 22],
      leftLoadout: { primary: "sword", secondary: "empty" },
      rightLoadout: { primary: "empty", secondary: "empty" },
      leftMind: thrusting(target, hands),
      onEvent(event) {
        if (event.side !== "left" || event.blocked) return;
        filed[event.hand] += 1;
        keys[event.report.key] = (keys[event.report.key] ?? 0) + 1;
      },
    });
    const count = (group) => group.reduce((sum, key) => sum + (keys[key] ?? 0), 0);
    const body = count(HIGH_KEYS) + count(["torso"]) + count(LOW_KEYS);
    // The arm that did the work, from the thing reported rather than from the
    // reporter. Reading `actingHand` back is bookkeeping: `reset()` writes it
    // from the literal effector, so it can only ever answer "primary" or throw,
    // and it is kept only because the throw is real -- `decide` refuses a named
    // hand that has been severed. `Combat` stamps every report with the hand
    // whose striker filed it, which is the quantity a fallback would move: on a
    // sword+empty body a silent switch to the off hand arrives here as `empty`
    // contacts doing the scoring. Measured, the off hand files 4 of 165 and 2 of
    // 158, which is a covering fist brushing a body it is held in front of.
    //
    // The real proof that a request for one hand is never executed on the other
    // is `a_dual_wielder_executes_the_effector_the_decision_named` in
    // `tests/options.test.mjs`: a shield in the primary and a sword in the
    // secondary is the loadout the old `[preferred, other]` search redirected
    // silently, and this fixture cannot express it because both its hands can
    // thrust.
    assert.deepEqual([...hands], ["primary"], `${target} was executed by a hand nobody asked for`);
    assert.ok(filed.secondary / (filed.primary + filed.secondary) < 0.05,
      `${target}: the off hand filed ${filed.secondary} of ${filed.primary + filed.secondary} contacts`);
    assert.ok(body > 40, `${target} landed only ${body} body contacts, which is too few to read`);
    return { high: count(HIGH_KEYS) / body, low: count(LOW_KEYS) / body, keys };
  };

  const high = distribution("high");
  const low = distribution("low");
  assert.ok(high.high > 0.25, `high aimed at the head and got ${JSON.stringify(high.keys)}`);
  assert.ok(low.low > 0.55, `low aimed at the legs and got ${JSON.stringify(low.keys)}`);
  // And against each other, which is what an ignored target cannot survive: it
  // would make these two bouts the same bout.
  assert.ok(high.high > low.high * 4, `${high.high} head high against ${low.high} low`);
  assert.ok(low.low > high.low * 4, `${low.low} legs low against ${high.low} high`);
});

/**
 * The same claim for the action that did not obey it, and the reason it needs a
 * different shape of measurement.
 *
 * A `thrust` is a *point* and one bout of it separates cleanly. A `cut` is a
 * *stroke*, and a single bout of one is 22 to 50 scoring contacts of which zero
 * to three are on a head -- so the Stage B table read `high` at a 0.045 head
 * share and `low` at 0.077, in the wrong order, off one and three contacts, and
 * its `vital` row had no head in it at all. That was noise, and the correction
 * matters because the pair being compared there, `high` against `as-measured`,
 * is 0.012 cursor units apart on this fixture: the same stroke, twice, reported
 * as a rule.
 *
 * So this pools six bouts a condition with a seeded pause between strokes --
 * the only nuisance knob available, since both minds are deterministic and
 * `idle` ignores `runBout`'s own seeds -- and asserts on `high` against `low`,
 * which is what "a named region separates" means. **Forty**-seed figures from
 * `.review/aimdist.mjs`, head share then leg share:
 *
 * | target | before | after |
 * | ---    | ---    | ---   |
 * | high   | 0.128 / 0.308 | 0.166 / 0.239 |
 * | low    | 0.044 / 0.504 | 0.019 / 0.513 |
 *
 * **This table used to quote a sixteen-seed pair that the harness it names
 * cannot produce** -- 0.072 / 0.452 -> 0.133 / 0.226 and 0.009 / 0.657 ->
 * 0.017 / 0.606, taken under a pause convention `driver` now comments out, and
 * disagreeing with the forty-seed run by about a factor of two. Not one of the
 * eight reproduced. The figures above are re-taken on both trees and do.
 *
 * **Which of the six assertions below actually hold the change, measured rather
 * than reasoned about** (`.review/rem2/cut6.mjs` reproduces `distribution`
 * exactly and runs it on both trees). On the flat `+-0.50` arc this replaced:
 *
 * | assertion | before | verdict |
 * | --- | ---: | --- |
 * | `high.head > 0.09` | 0.1050 | passes |
 * | `high.low < 0.34` | 0.3039 | passes |
 * | `low.head < 0.05` | 0.0500 | **fails** |
 * | `low.low > 0.50` | 0.5269 | passes |
 * | `high.head > low.head * 3` | 2.099 | **fails** |
 * | `low.low > high.low * 1.7` | 1.734 | passes, by 0.034 |
 *
 * So the **ratio is what discriminates** and the head-share floor and leg-share
 * ceiling are regression guards, not evidence. This note said the exact
 * opposite -- "the ratio alone survives the defect: `high` was already eight
 * times `low` before the change" -- and eight was a number from no harness: on
 * this fixture it was 2.1, and 2.9 pooled over forty seeded bouts. Both of the
 * discriminating assertions clear their thresholds narrowly, which is stated
 * here rather than dressed up, and the 1.7 leg band clears the pre-change
 * figure by two per cent and holds nothing. The claim that survives everything
 * is the pooled ratio with its interval: 2.93 [2.00, 4.55] before against
 * 8.90 [5.21, 19.34] after, non-overlapping.
 */
test("a_cut_at_a_named_high_or_low_target_reaches_that_body_region", () => {
  const LOW_KEYS = ["pelvis", "thighL", "thighR", "shinL", "shinR"];
  const cutting = (target, seed) => {
    let option = null; let hold = 0; let state = seed >>> 0;
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0; let v = state;
      v = Math.imul(v ^ (v >>> 15), v | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
    return { name: `cut-${target}`, decide(view, dt) {
      if (hold > 0) {
        hold -= Math.max(0, dt); option = null;
        const rest = handActionOption("recover", { effector: "primary", target: "vital", stance: "action-default" });
        rest.enter(view);
        return composeTactic(view, "hold", "recover", movementIntent("hold", view), rest.decide(view, dt));
      }
      if (!option || option.done(view)) {
        if (option) hold = random() * 0.30;
        option = handActionOption("cut", { effector: "primary", target, stance: "action-default" });
        option.enter(view);
      }
      return composeTactic(view, "close", "cut", movementIntent("close", view), option.decide(view, dt));
    } };
  };
  const distribution = (target) => {
    const keys = {};
    for (let seed = 0; seed < 6; seed += 1) {
      runBout({
        left: "duelist", right: "idle", seeds: [11, 22],
        leftLoadout: { primary: "sword", secondary: "empty" },
        rightLoadout: { primary: "empty", secondary: "empty" },
        leftMind: cutting(target, 0x51ede000 + seed),
        onEvent(event) {
          if (event.side !== "left" || event.blocked) return;
          keys[event.report.key] = (keys[event.report.key] ?? 0) + 1;
        },
      });
    }
    const count = (group) => group.reduce((sum, key) => sum + (keys[key] ?? 0), 0);
    const body = count(["head"]) + count(["torso"]) + count(LOW_KEYS);
    assert.ok(body > 150, `${target} landed only ${body} body contacts over six bouts`);
    return { head: count(["head"]) / body, low: count(LOW_KEYS) / body, keys };
  };
  const high = distribution("high");
  const low = distribution("low");
  // Where it lands, both ends of the body. These four are **regression guards**
  // rather than evidence for the change: three of them pass on the wide arc this
  // replaced, and the table in the docstring says which and by how much. They
  // are worth keeping because the failure they would catch -- a stroke that
  // stops reaching a region at all -- is not the one the ratios below catch.
  assert.ok(high.head > 0.09, `high aimed at the head and got ${JSON.stringify(high.keys)}`);
  assert.ok(high.low < 0.34, `high still raked the legs: ${JSON.stringify(high.keys)}`);
  assert.ok(low.head < 0.05, `low reached the head ${low.head} of the time`);
  assert.ok(low.low > 0.50, `low aimed at the legs and got ${JSON.stringify(low.keys)}`);
  // And against each other, which is what an ignored region cannot survive --
  // and, measured, the assertion that does the work: 5.83 here against 2.10 on
  // the old arc, so a threshold of 3 refuses the wide stroke outright.
  assert.ok(high.head > low.head * 3, `${high.head} head high against ${low.head} low`);
  // The leg ratio is the weak one and is left weak on purpose. Measured 1.91
  // here against **1.73** on the arc this replaced -- so 1.7 clears the old
  // figure by two per cent and this assertion holds nothing the head ratio does
  // not. (The note here read "against 1.45", which was a number from no harness;
  // the band was written believing it had a margin it does not have.) A
  // threshold that separated 1.73 from 1.91 would be fitted to a six-seed
  // reading of a fixture with no usable seed, which is worse than a weak band
  // that says it is weak. What bounds the leg share properly is the 40-seed
  // table in `docs/measurements.md`.
  assert.ok(low.low > high.low * 1.7, `${low.low} legs low against ${high.low} high`);
});

test("cosmetics_disabled_and_enabled_produce_identical_fight_records", async () => {
  const fight = async (enabled) => {
    const events = [];
    const result = runBout({
      left: "duelist", right: "swinger", seeds: [0x14c0ffee, 0x51debeef],
      physics: await freshHavok(),
      onEvent: (event) => events.push({ side: event.side, type: event.type,
        weapon: event.report?.weapon, key: event.report?.key, damage: event.report?.damage,
        severed: event.report?.severed, at: event.report?.at }),
      onSample({ left, right }) {
        for (const fighter of [left, right]) for (const mesh of fighter.costume) mesh.setEnabled(enabled);
      },
    });
    return { result, events };
  };
  assert.deepEqual(await fight(false), await fight(true));
});

test("a_hundred_arrows_and_twenty_five_rebuilds_return_all_resource_counts_to_baseline", async (t) => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  plugin._integrationLiveConstraints = 0;
  const initConstraint = plugin.initConstraint.bind(plugin);
  plugin.initConstraint = (...args) => {
    const constraint = args[0];
    const before = constraint._pluginData?.length ?? 0;
    initConstraint(...args);
    plugin._integrationLiveConstraints += (constraint._pluginData?.length ?? 0) - before;
  };
  const disposeConstraint = plugin.disposeConstraint.bind(plugin);
  plugin.disposeConstraint = (constraint) => {
    plugin._integrationLiveConstraints -= constraint._pluginData?.length ?? 0;
    disposeConstraint(constraint);
  };
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);
  const materials = materialsFor(scene);
  const ground = MeshBuilder.CreateBox("integration.ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const aggregate = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  aggregate.shape.filterMembershipMask = LAYER.WORLD; aggregate.shape.filterCollideMask = COLLIDES.WORLD;
  // Babylon installs one engine-owned observer lazily on the first physics
  // advance. Warm that invariant up before calling it a rebuild leak.
  scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);
  const loadouts = [
    { primary: "sword", secondary: "empty" }, { primary: "sword", secondary: "shield" },
    { primary: "axe", secondary: "shield" }, { primary: "sword", secondary: "sword" },
    { primary: "bow", secondary: "empty" },
  ];
  const rebuildFighters = (rebuild) => {
    const left = new Fighter(scene, { side: "left", origin: Vector3.Zero(), facing: 0,
      mind: policyMind("duelist", rebuild), loadout: loadouts[Math.abs(rebuild) % loadouts.length] }, materials);
    const right = new Fighter(scene, { side: "right", origin: new Vector3(0, 0, CONFIG.fighter.separation), facing: Math.PI,
      mind: policyMind("swinger", rebuild + 1000), loadout: loadouts[(Math.abs(rebuild) + 1) % loadouts.length] }, materials);
    let clock = 0;
    const control = () => { stepPair(left, right, FIXED, clock); clock += FIXED; };
    scene.onBeforePhysicsObservable.add(control);
    scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);
    scene.onBeforePhysicsObservable.removeCallback(control);
    left.dispose(); right.dispose();
  };
  // The first articulated build makes Havok install one persistent engine-side
  // observer. It belongs to the warmed scene, not to a bout, so establish the
  // rebuild baseline after that one-time initialization.
  rebuildFighters(-1);
  const baseline = census(scene);
  for (let rebuild = 0; rebuild < 25; rebuild += 1) {
    rebuildFighters(rebuild);
    assert.deepEqual(census(scene), baseline, `fighter rebuild ${rebuild + 1} returned every counted resource`);
  }

  const layers = layersFor("left");
  const quiver = new Quiver(scene, { name: "integration.quiver", layer: layers.arrow,
    collidesWith: layers.arrowCollides }, materials);
  let pending = null;
  const driver = scene.onBeforePhysicsObservable.add(() => {
    quiver.step(FIXED);
    if (pending) { quiver.loose(pending.from, pending.along, pending.speed); pending = null; }
  });
  const pooled = census(scene);
  for (let shot = 0; shot < 100; shot += 1) {
    pending = { from: new Vector3(0, 4, -8), along: new Vector3(0, 0, 1), speed: 45 };
    for (let frame = 0; frame < 6; frame += 1) {
      scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);
    }
  }
  assert.deepEqual(census(scene), pooled, "one prebuilt arrow pool stayed flat across a hundred launches");
  scene.onBeforePhysicsObservable.remove(driver); quiver.dispose();
  assert.deepEqual(census(scene), baseline, "disposing the quiver returned trails, bodies and observers to baseline");
});
