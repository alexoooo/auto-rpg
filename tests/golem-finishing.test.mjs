// Physical contact session 03: a standing golem mind finishes a downed body, and a downed one fights
// back from the floor. Every view here is a real publication (`publishedFixture`) of a skeleton pair
// in a supported world, taken standing and then at the lowest its core reached while `fallen`, and
// the only edit made to either is where the other body stands.
//
// A skeleton and not stone, because stone's biped sets no knockdown table and a stone body that is
// `fallen` stays on its feet: its core read 1.286 m fallen against 1.289 standing (Node harness,
// headless arena). A finishing test needs a body that is actually lying down.
import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { Golem } from "../src/golem/golem.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { NEUTRAL, idleMind, policyMind } from "../src/mind.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { assertCompleteView, publishedFixture } from "./fixtures/view.mjs";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;
/** One executor per golem mind family: v1, v2 (through the planner), v3 and v4. */
const MINDS = ["golem-duelist", "golem-champion", "golem-brawler", "golem-miser"];

/**
 * A standing skeleton pair six metres apart; the left one is knocked down by a queued shove twice
 * its fall line. Its mind turns throughout, because a synthetic shove moves the ledger and not the
 * body: a perfectly still skeleton goes `fallen` and stays upright, its core never leaving 1.11 m,
 * and rises at the dwell. Turning is enough to put it on the floor.
 */
async function publications() {
  const arena = await createHeadlessArena();
  const { scene } = arena;
  const world = flatSupportedWorldRegistry();
  const setup = skeletonSetup();
  const turning = { name: "turning", decide: () => ({ ...NEUTRAL, turn: 0.5 }) };
  const pair = ["left", "right"].map((side, i) => new Golem(scene, {
    side, origin: new Vector3(0, 0, i * 6), facing: i * Math.PI,
    setup, mind: i === 0 ? turning : idleMind(), controlPolicies: [], locomotionWorld: world,
  }));
  let clock = 0;
  const control = scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, FIXED, clock); clock += FIXED; });
  const run = (seconds) => {
    const end = clock + seconds;
    while (clock < end) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); }
  };
  try {
    run(2);
    assert.equal(pair[0].locomotion.state, "supported", "the pair did not stand");
    const standing = { them: publishedFixture(pair[1].view, "standing"), self: publishedFixture(pair[0].view, "self standing") };
    const massKg = pair[0].locomotion.diagnostic().stability.supportedMassKg;
    const fallAtMps = pair[0].locomotion.stabilityLinesAlong(1, 0).fallAtMps;
    pair[0].queueStabilityEvent({ horizontalShoveNs: [fallAtMps * massKg * 2, 0] });
    let low = Infinity;
    let downed = null;
    while (clock < 8) {
      run(1 / 60);
      const core = pair[0].view.self.vitalPoint.y;
      if (pair[0].locomotion.state === "fallen" && core < low) {
        low = core;
        downed = { them: publishedFixture(pair[1].view, "downed"), self: publishedFixture(pair[0].view, "self downed") };
      }
    }
    assert.ok(downed, "the shove never knocked the skeleton down");
    return { standing, downed };
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    for (const golem of pair) golem.dispose();
    arena.dispose();
  }
}

const { standing, downed } = await publications();

/** Every point a body publishes, so that a body can be moved whole. */
const points = (body) => [body.ground, body.shoulder, body.tip, body.vitalPoint,
  ...Object.values(body.hands).flatMap((hand) => [hand.shoulder, hand.tip]),
  ...(body.effectors ?? []).flatMap((effector) => [effector.anchor, effector.tip])];

/**
 * The view with the opponent moved, whole, to stand `gap` metres from self's footprint along the
 * line between them. `measure` is re-derived; nothing else changes.
 */
function at(view, gap) {
  const copy = (body) => ({ ...structuredClone({ ...body, capabilities: null }), capabilities: body.capabilities });
  const moved = { ...view, self: copy(view.self), opponent: copy(view.opponent) };
  const me = moved.self.ground;
  const them = moved.opponent.ground;
  const length = Math.hypot(them.x - me.x, them.z - me.z);
  const dx = me.x + (them.x - me.x) / length * gap - them.x;
  const dz = me.z + (them.z - me.z) / length * gap - them.z;
  for (const point of points(moved.opponent)) { point.x += dx; point.z += dz; }
  moved.measure = Math.hypot(moved.self.shoulder.x - moved.opponent.shoulder.x,
    moved.self.shoulder.z - moved.opponent.shoulder.z);
  return assertCompleteView(moved, `moved to ${gap} m`);
}

/**
 * A fresh mind in front of a still view for a second and a half, averaged after the first quarter
 * second: its mean walk, crouch and aim, and the share of steps its acting hand thrusts and any hand
 * guards.
 */
function drive(name, view) {
  const mind = policyMind(name, 7);
  const out = { forward: 0, crouch: 0, lift: 0, thrust: 0, guard: 0 };
  let n = 0;
  for (let step = 0; step < CONFIG.world.physicsHz * 1.5; step += 1) {
    view.clock += FIXED;
    const intent = mind.decide(view, FIXED);
    if (step < CONFIG.world.physicsHz * 0.25) continue;
    const hand = intent[intent.actingHand ?? "primary"];
    out.forward += intent.forward;
    out.crouch += intent.posture.crouch;
    out.lift += hand.pointerY;
    out.thrust += hand.thrust ? 1 : 0;
    out.guard += intent.primary.guard || intent.secondary.guard ? 1 : 0;
    n += 1;
  }
  for (const key of Object.keys(out)) out[key] /= n;
  return out;
}

test("the_fixture_is_a_real_body_lying_down_and_the_control_is_the_same_body_standing", () => {
  assert.equal(standing.them.opponent.support, "supported");
  assert.equal(downed.them.opponent.support, "fallen");
  assert.equal(downed.self.self.support, "fallen");
  assert.equal(downed.them.self.support, "supported", "the finisher is on its feet");
  const up = standing.them.opponent.vitalPoint.y;
  const lying = downed.them.opponent.vitalPoint.y;
  assert.ok(lying < 0.4 * up, `the downed core is at ${lying.toFixed(3)} m of a standing ${up.toFixed(3)}`);
  // The published core is the body's own: the same point either corner's view reports.
  assert.deepEqual(downed.them.opponent.vitalPoint, downed.self.self.vitalPoint);
});

/** The nearest gap, on a 5 cm grid out to 1.6 m, at which the mind walks toward the other body. */
function holdOf(name, view) {
  for (let step = 0; step <= 28; step += 1) {
    const gap = 0.2 + step * 0.05;
    if (drive(name, at(view, gap)).forward > 0) return gap;
  }
  return Infinity;
}

/** The downed publication with one stated edit: it says the body is standing. Nothing else moves. */
const claimsStanding = (view) => ({ ...view, opponent: { ...view.opponent, support: "supported" } });

// A downed body's reach lies on the floor with it, so the stand-off drops to the finisher's own
// ranges (`standOffReach` in `src/downed.ts`). The control is the **same** lying body with its
// `support` edited back to `supported`: its shoulder is live and already low, so the 3-D gap to it
// already pulls a mind in from its standing hold (1.45 m) to about 0.8, and only the stand-off rule
// is left between the two. Measured (Node harness, headless arena): duelist 0.55 m against 0.80,
// champion 0.70 against 0.80, miser 0.20 against 0.85 -- the miser's executor floors a hold at
// nothing of its own, so without their reach there is nothing to hold it off. The brawler closes on
// anything and is not asked.
test("a_standing_mind_holds_nearer_a_downed_body_than_the_same_body_said_to_be_standing", () => {
  for (const name of MINDS.filter((mind) => mind !== "golem-brawler")) {
    const lying = holdOf(name, downed.them);
    const said = holdOf(name, claimsStanding(downed.them));
    const up = holdOf(name, standing.them);
    assert.ok(lying < said - 0.075, `${name} held at ${lying.toFixed(2)} m of a downed body and ${said.toFixed(2)} m of it said to be standing`);
    assert.ok(said < up, `${name} held at ${said.toFixed(2)} m of a lying body and ${up.toFixed(2)} m of a standing one`);
  }
});

// The stroke goes low: at 1.2 m every mind's aim drops by more than 0.4 of the cursor against the
// same body standing (probe: -0.86 against -0.23 for the duelist), and right over it the mark is
// below the arm's own floor and the crouch the executors derive from it comes on (0.48, against
// none standing). **This is carried by the live shoulder as much as by `finishPoint`**: with the
// helper made to ignore `support`, every figure here still holds, because v1, v2 and v3 aim at
// their published shoulder and v4 scales by it. What `finishPoint` adds is the core's own place
// rather than a column over the feet, which is 0.21 m further on for this fall.
test("a_standing_mind_aims_at_a_downed_body_where_it_lies_and_crouches_over_it", () => {
  for (const name of MINDS) {
    const up = drive(name, at(standing.them, 1.2));
    const lying = drive(name, at(downed.them, 1.2));
    assert.ok(lying.lift < up.lift - 0.4,
      `${name} aimed at ${lying.lift.toFixed(2)} over a downed body against ${up.lift.toFixed(2)} standing`);
    const over = drive(name, at(downed.them, 0.2));
    const overStanding = drive(name, at(standing.them, 0.2));
    assert.equal(overStanding.crouch, 0, `${name} crouched at a standing body`);
    assert.ok(over.crouch > 0.3, `${name} crouched only ${over.crouch.toFixed(2)} over a downed body`);
  }
});

// The owner's rule: a body on the floor swings and parries, and `GROUNDED_TONE` is what makes it
// weak, never its mind. In reach, a downed mind thrusts and guards as often as it would standing,
// and aims from where its socket actually is -- upward at a standing body, 0.6 or more of the cursor
// above its standing aim at 0.4 m (probe: duelist +0.65 against -0.20).
test("a_downed_mind_in_reach_strikes_and_guards_from_its_live_socket", () => {
  for (const name of MINDS) {
    const up = drive(name, at(standing.self, 0.4));
    const lying = drive(name, at(downed.self, 0.4));
    assert.ok(lying.thrust > 0, `${name} never thrust from the floor`);
    assert.ok(lying.guard > 0.5, `${name} guarded ${lying.guard.toFixed(2)} of the time from the floor`);
    assert.ok(lying.lift > up.lift + 0.6,
      `${name} aimed at ${lying.lift.toFixed(2)} from the floor against ${up.lift.toFixed(2)} standing`);
  }
});
