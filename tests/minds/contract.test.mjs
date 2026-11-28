import { BOUT_WORLD, buildBout, EVALUATIONS } from "../../src/app/node/evaluation.ts";
import { DEFAULT_ENGINE } from "../../src/core/physics/engines.ts";
import { recipeOf } from "../../src/app/node/setup.ts";
import { reportNow } from "../../src/minds/seat/apart.ts";
import { traceOf } from "../../src/evaluation/trace.ts";
/** Command delivery, suspension and restoration, independent of skill capability. */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "../../src/core/math/vector.ts";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { poseAngles } from "../../src/control/kinematics.ts";
import { GUARD } from "../../src/skills/guard/shared/guard.ts";
import { createWorld } from "../../src/core/world/world.ts";
import { buildBody } from "../../src/core/bodies/build/build-body.ts";
import { embody } from "../../src/minds/seat/embodiment.ts";
import { loadState, saveState } from "../../src/core/state.ts";
import { freshEngine, coreStand } from "../harness/core-stand.mjs";
import { SERVO_SECONDS } from "../../src/control/body.ts";
import { commandedMind } from "../../src/minds/scripted-mind.ts";
import { standingSkills } from "../../src/app/standing-skills.ts";
import { standIntent } from "../../src/skills/framework/intent.ts";
import { stockMotor } from "../../src/app/registration/stock-motor.ts";
import { isOrdersEntry } from "../../src/game/arena/duel.ts";
import { MOVE_PART } from "../../src/skills/locomotion/move/index.ts";
import { optionsOf } from "../../src/minds/option/assembly/config.ts";
import { partLookup } from "../../src/app/catalog.ts";
import { PAW_MOVE } from "../../src/skills/locomotion/paw-move/index.ts";

/** The command's delay a world is made with to show it: more than one step, so its ring is read through. */
const SHOWN_DELAY = 2;

/**
 * Detect body-declared actuators omitted by bilateral hand discovery and pose encoding; check
 * muscle activation, assist force and segment configuration requests at exact queue positions;
 * check that suspension discards old commands and saving restores in-flight values. A body can
 * meet a skill's outcome with an early, late or stale command, so a drill cannot establish this
 * timing contract.
 */
test("a body's command is applied the world's delay after it is sent, none before, none again after its level leaves full, and across a save and load", async () => {
  // A body-declared actuator away from a bilateral hand name, with its own configuration names.
  const stock = modelSpec("man");
  const spec = JSON.parse(JSON.stringify(stock).replaceAll('"hand.right"', '"tool.central"'));
  const tool = spec.segments.find(segment => segment.name === "tool.central");
  const shapes = tool.configurations.shapes;
  tool.configurations = { initial: "extended", shapes: { extended: shapes.open, retracted: shapes.fist, latched: shapes.grip },
    holding: { configuration: "latched", release: "extended" } };
  const world = createWorld(await freshEngine(), { actuation: "directional", delay: SHOWN_DELAY });
  const built = buildBody(spec, world, { position: [0, 1, 0], joints: poseAngles(spec, GUARD) });
  // Held in place, every muscle's strength is the one at rest, so a ceiling reads the activation that set it; its weight sets its assist's ceiling.
  for (const segment of built.segments.values()) segment.body.setFixed(true);
  const actuator = built.configurations.model.find(entry => entry.segment === tool.name);
  assert.ok(actuator, "the body must expose its declared actuator regardless of its segment name");
  const poses = actuator.configurations.slice(0, 2);
  assert.equal(poses.length, 2, "the fixture needs an actuator with two configurations");
  const sent = [], level = (k) => 0.05 + 0.1 * (k % 7), push = (k) => [k + 1, 0, 0];
  const embodied = embody(built, world, () => {
    const state = { pending: -1 };
    return { name: "delay probe", has: () => "delay probe", dispose() {}, mind: {
      state, interrupt() { state.pending = -1; },
      think() { state.pending = sent.length; sent.push(state.pending); },
      act(control) {
        const k = state.pending;
        if (k < 0) return;
        control.muscles.activation.fill(level(k)); control.muscles.velocity.fill(0);
        control.assist.force.set(...push(k)); control.assist.moment.setAll(0);
        control.configurations.request(tool.name, poses[k % 2]);
      },
    } };
  }, { assist: { force: 10, moment: 10 } });
  // The body's own muscles and assist, not the mind's view of them, which a world with a delay keeps on a mirror a step behind.
  const muscles = embodied.held.muscles, channel = muscles.channels.findIndex((c) => c.positive.tendon === null && c.negative.tendon === null);
  assert.ok(channel >= 0, "the fixture needs a channel without a tendon");
  // What the body was given on the step just taken: the activation its ceiling reads, the assist's push and the hand's pose asked.
  const given = () => ({ activation: Math.round(1e9 * muscles.bounds.positive[channel] / muscles.strength(channel, 1)) / 1e9,
    push: embodied.held.assist.given.force.x, pose: built.configurations.state[tool.name].requested });
  const expected = (k, since) => k - since < SHOWN_DELAY ? { activation: 0, push: 0, pose: null }
    : { activation: Math.round(1e9 * level(k - SHOWN_DELAY)) / 1e9, push: push(k - SHOWN_DELAY)[0], pose: poses[(k - SHOWN_DELAY) % 2] };
  // A hand keeps the pose it was last asked: where none is due, the reading names none if the hand holds the one it held as the steps began.
  const played = (from, steps, since) => {
    const held = built.configurations.state[tool.name].requested;
    return Array.from({ length: steps }, (_, i) => {
      world.step();
      const reading = given(), want = expected(from + i, since);
      return { ...reading, pose: want.pose === null && reading.pose === held ? null : reading.pose };
    });
  };
  const wanted = (from, steps, since) => Array.from({ length: steps }, (_, i) => expected(from + i, since));
  assert.deepEqual(played(0, 8, 0), wanted(0, 8, 0));
  // Off its level and back, the body is its mind's again from its next command: none sent before is given.
  muscles.setLevel("limp"); world.step(3); muscles.setLevel("full");
  for (const segment of built.segments.values()) segment.body.setFixed(true);
  assert.deepEqual(played(8, 6, 8), wanted(8, 6, 8));
  // Saved between a command sent and its step, the load gives the same commands again.
  const root = { world: world.state, body: embodied.state, sent }, saved = saveState(root);
  const after = played(14, 5, 8);
  loadState(root, saved);
  assert.deepEqual(played(14, 5, 8), after);
  assert.deepEqual(after, wanted(14, 5, 8));
  embodied.dispose(); world.dispose();
});

/**
 * Detect extra or reordered force resets after loading into a fresh world, which alter Rapier's
 * saved modification flags despite matching body poses. Compare whole saved worlds across steps
 * with a nonzero force, an explicit zero ask and an untouched body; a skill drill does not
 * establish exact saved continuation.
 */
test("a fresh physics fork resets exactly the forces pending at its save", async () => {
  const engine = await freshEngine();
  const make = () => {
    const world = engine.createPhysics({ hz: 120, gravity: false });
    const bodies = [0, 3, 6].map((x, i) => world.addBody(
      { name: `box ${i}`, position: new Vector3(x, 2, 0), rotation: Quaternion.Identity() },
      [{ kind: "box", centre: [0, 0, 0], size: [1, 1, 1] }],
      { mass: 1, centre: [0, 0, 0], moments: [1, 1, 1], orientation: Quaternion.Identity() },
    ));
    return { world, bodies };
  };
  const original = make(), fork = make();
  try {
    original.world.step(1 / 120);
    original.bodies[1].applyForce(new Vector3(), original.bodies[1].pose.position);
    original.bodies[0].applyForce(new Vector3(2, 0, 0), original.bodies[0].pose.position);
    original.bodies[0].applyTorque(new Vector3(0, 1, 0));
    fork.world.load(original.world.save());
    assert.deepEqual(fork.world.save(), original.world.save());
    for (let i = 0; i < 3; i++) {
      original.world.step(1 / 120); fork.world.step(1 / 120);
      assert.deepEqual(fork.world.save(), original.world.save(), `continuation step ${i + 1}`);
    }
  } finally { original.world.dispose(); fork.world.dispose(); }
});

/**
 * Detect a driver's and its skills' memory saved only through a separate controller result. Load
 * the published Mind state into a fresh commanded mind and verify its driver continues from the
 * saved count; a whole-bout fork can hide the omission by saving a second memory root.
 */
test("a commanded Mind restores its driver's memory from its own state", async () => {
  const make = async () => {
    const stand = await coreStand(modelSpec("man"));
    const embodied = embody(stand.built, stand.world, own => commandedMind(own, { servoSeconds: SERVO_SECONDS, motor: stockMotor() }, stand.world));
    const memory = { decisions: 0 }, skills = standingSkills(embodied.construction.body);
    embodied.construction.drive({ state: { memory, skills: skills.state },
      decide() { memory.decisions++; return standIntent(0); },
      carry: (view, intent, dt) => skills.command(view, intent, dt) }, skills.release);
    return { stand, embodied, memory, dispose() { embodied.dispose(); stand.dispose(); } };
  };
  const original = await make(), fork = await make();
  try {
    original.stand.step(3);
    assert.equal(original.memory.decisions, 3, "the driver must decide before its state is saved");
    const saved = saveState(original.embodied.construction.mind.state);
    loadState(fork.embodied.construction.mind.state, saved);
    assert.deepEqual(fork.memory, original.memory);
    original.stand.step(); fork.stand.step();
    assert.deepEqual(fork.memory, original.memory);
    assert.equal(fork.memory.decisions, 4);
  } finally { original.dispose(); fork.dispose(); }
});

/**
 * Detect replay admission rejecting valid configured gait names, including paw gaits and an
 * entrant-defined name, while stock gaits survive. Capability drills give live orders directly and
 * do not establish that saved orders pass the external recording validator.
 */
test("recorded orders accept configured gait names across JSON transport", () => {
  const spec = modelSpec("man"), stock = MOVE_PART.gaits(MOVE_PART.defaults, spec, partLookup);
  assert.ok(stock.length > 0, "the fixture needs a registered gait for its custom name");
  const config = { ...MOVE_PART.defaults, gaits: [...stock, { ...stock[0], name: "entrant-step" }], otherwise: "entrant-step" };
  assert.deepEqual(MOVE_PART.faults(config, partLookup), [], "the locomotion must admit the configured gait");
  const gaits = [...MOVE_PART.gaits(config, spec, partLookup), ...PAW_MOVE.gaits(PAW_MOVE.defaults, modelSpec("reptile"), partLookup)];
  const tape = gaits.map(({ name }, step) => ({ step, side: "left", orders: { face: null, gait: name } }));
  const transported = JSON.parse(JSON.stringify(tape));
  assert.deepEqual(transported.filter(isOrdersEntry), tape);
  for (const gait of ["", null, 0]) assert.equal(isOrdersEntry({ step: 0, side: "left", orders: { face: null, gait } }), false);
});


/**
 * Reproduce the answered report kept outside the saved graph, and profile engagement details kept
 * in unsaved situation closures. Compare the complete published report immediately after loading
 * into a fresh same-recipe bout, before another decision can hide the stale data; physics-only
 * replay diagnostics miss this observable failure.
 */
test("a fresh bout load restores the whole published Mind report before another decision", async () => {
  const recipe = { ...recipeOf("?matchup=man,man&control=option,option&left.loadout=empty,empty&right.loadout=empty,empty", { left: {}, right: {} }, "open"),
    commanders: { left: { kind: "drill", after: 0 } } };
  const original = await buildBout(recipe), fork = await buildBout(recipe);
  const report = bout => structuredClone(reportNow(bout.duel.duelists.left.minded.report));
  try {
    original.world.step(120);
    const said = report(original);
    assert.ok(said.engagement?.offers?.length && said.engagement.details?.length, "the fixture must have decided and published its complete engagement");
    assert.notDeepEqual(report(fork), said, "the fresh recipe must distinguish the saved report from its initial report");
    fork.duel.load(original.duel.save());
    assert.deepEqual(report(fork), said);
  } finally { original.dispose(); fork.dispose(); }
});

/**
 * Reproduce a save refused by every build but the one that made it, which kept no bout's start
 * across a commit. Load one bout's save under another build's name into fresh bouts of its recipe:
 * one continues to the same whole save as the original; one whose saved mind is named as built
 * otherwise keeps that mind as built over the saved physics and the other side's saved report; a
 * body named so, and a mind named so in a bout that has stepped, refuse with the part named. A
 * fork on its own build never meets another build's save.
 */
test("a bout's save made on another build loads its bodies, and starts fresh a mind whose memory is built otherwise", async () => {
  const recipe = { ...recipeOf("?matchup=man,man&control=option,option&left.loadout=empty,empty&right.loadout=empty,empty", { left: {}, right: {} }, "open"),
    commanders: { left: { kind: "drill", after: 0 } } };
  const original = await buildBout(recipe), fork = await buildBout(recipe), woken = await buildBout(recipe);
  const report = (bout, side) => structuredClone(reportNow(bout.duel.duelists[side].minded.report));
  try {
    const built = report(woken, "left");
    original.world.step(120);
    const saved = original.duel.save(), elsewhere = { ...saved, identity: { ...saved.identity, build: `git:${"0".repeat(40)}` } };
    const otherwise = (part) => ({ ...elsewhere, shapes: { ...elsewhere.shapes, [part]: "built otherwise" } });
    assert.notDeepEqual(report(original, "left"), built, "the fixture's mind must have left the memory it was built with");
    assert.deepEqual(fork.duel.load(elsewhere), []);
    assert.deepEqual(woken.duel.load(otherwise("left's mind")), ["left"]);
    assert.deepEqual(woken.duel.save().physics, saved.physics);
    assert.deepEqual(report(woken, "left"), built);
    assert.deepEqual(report(woken, "right"), report(original, "right"));
    assert.throws(() => woken.duel.load(otherwise("left's body")), /left's body is built otherwise.*saved on git:0{40}/);
    original.world.step(60); fork.world.step(60); woken.world.step(60);
    assert.deepEqual(fork.duel.save(), original.duel.save());
    assert.throws(() => fork.duel.load(otherwise("left's mind")), /left's mind is built otherwise.*has not stepped/);
  } finally { original.dispose(); fork.dispose(); woken.dispose(); }
});

/**
 * Reproduce a save refused as another bout's recipe by a bout whose striker runs a tuning, which
 * kept a search's candidate from a start a fight was saved at. Load the opening save of a Strike
 * drill's still trial into a bout of that trial built under a tuned punch, unsteered as no trainer
 * steers it here (a tuning drops the record's network): it loads with no mind
 * started fresh, and 90 steps on its bodies are a fresh tuned bout's to the bit and not the
 * untuned bout's; a bout of another trial refuses the save. A save loaded only into its own recipe
 * never meets a mind under other settings.
 */
test("a bout's save loads under another tuning of its striker's punch, and plays on as a bout built under it", async () => {
  const cases = EVALUATIONS.strike.protocols.still, [subject] = EVALUATIONS.strike.subjects(["option/straight-punch"]);
  const [condition, further] = cases.conditions.filter((one) => one.model === "man" && one.mark === "middle" && one.across === 0 && one.gap >= .9);
  const tuned = { ...subject.value, mind: { ...subject.value.mind, options: optionsOf(subject.value.mind, partLookup).map((option) =>
    option.skill?.kind !== "straight-punch" ? option : { ...option, skill: { ...option.skill, tuning: { hips: .2, steered: false } } }) } };
  const build = async (value, at) => {
    const world = cases.world([value], at, cases.engine ?? DEFAULT_ENGINE, [subject]), built = await BOUT_WORLD.build(world, {});
    BOUT_WORLD.start(built, world);
    return built;
  };
  const original = await build(subject.value, condition), under = await build(tuned, condition), fresh = await build(tuned, condition), elsewhere = await build(tuned, further);
  try {
    const saved = original.duel.save();
    assert.deepEqual(under.duel.load(saved), []);
    assert.throws(() => elsewhere.duel.load(saved), /different physical conditions or a different recipe/);
    for (const bout of [original, under, fresh]) bout.world.step(90);
    assert.deepEqual(under.duel.save().physics, fresh.duel.save().physics);
    assert.notDeepEqual(original.duel.save().physics, fresh.duel.save().physics, "the fixture's tuning must move the bodies");
  } finally { original.dispose(); under.dispose(); fresh.dispose(); elsewhere.dispose(); }
});

/**
 * Reproduce a strike option's reading of its limbs kept by the step's time alone, which a bout put
 * back to a save met again as stale: the aim was not asked, its hold was not made, and a start
 * made of a fight by putting it back parted from the fight. Save a `fights` trial at its first
 * step, play four steps, put the bout back and play two: its whole save is the one it made two
 * steps on the first time. A load into a fresh bout never meets a time twice.
 */
test("a bout put back to its own save plays on as it did from there before", async () => {
  const cases = EVALUATIONS.strike.protocols.fights, [subject] = EVALUATIONS.strike.subjects(["option/straight-punch"]);
  const condition = cases.conditions.find((one) => one.model === "man" && one.mark === "middle" && one.hand === "left" && one.moment === 1 && one.gap === 3);
  const world = cases.world([subject.value], condition, cases.engine ?? DEFAULT_ENGINE, [subject]), bout = await BOUT_WORLD.build(world, {});
  try {
    BOUT_WORLD.start(bout, world);
    const saved = bout.duel.save();
    bout.world.step(2);
    const straight = bout.duel.save();
    bout.world.step(2);
    assert.deepEqual(bout.duel.load(saved), []);
    bout.world.step(2);
    assert.deepEqual(bout.duel.save(), straight);
  } finally { bout.dispose(); }
});


/**
 * Reproduce a menu read that changed the mind it read: a blow's readiness asks its aim, and the
 * surface aim held each opening it found, so a Commander's or a screen's read made holds the mind
 * had not, and its later blows aimed elsewhere (found at 60 Hz, `fd0a953b`; with reads keeping,
 * the sword bout below plays other poses). The aims now keep nothing when a menu asks
 * (`keepingNothing`). Every pose of an Option Mind sword bout read every step against the bout
 * unread; a drill always has its reader, so it cannot compare.
 */
test("a bout whose minds' menus are read every step plays as it does unread", async () => {
  const recipe = { ...recipeOf("?matchup=man,man&control=option,option&left.loadout=empty,sword&right.loadout=empty,sword", { left: {}, right: {} }, "open"), capSeconds: 4 };
  // Every pose of the bout, with each side's menu read between steps where `reading`, as a Commander or a screen reads it.
  const play = async (reading) => {
    const bout = await buildBout(recipe), sides = ["left", "right"], trace = traceOf(sides.map((side) => bout.duel.duelists[side].built));
    let offered = 0;
    try {
      while (bout.duel.verdict === null) {
        bout.world.step(); trace.take();
        if (reading) for (const side of sides) offered += bout.duel.duelists[side].minded.report.menu.filter((entry) => entry.foe !== null).length;
      }
      return { digest: trace.digest(), offered, steps: bout.world.steps };
    } finally { bout.dispose(); }
  };
  const unread = await play(false), read = await play(true);
  assert.ok(read.offered > 0, "the fixture must read menus offering blows at a foe");
  assert.deepEqual({ digest: read.digest, steps: read.steps }, { digest: unread.digest, steps: unread.steps });
});

/**
 * Reproduce generalized recovery discovery treating a reposition as an ascent, suppressing its own
 * transitions and changing brace admission. Construct the real fallback alone at an uncovered
 * ready start and verify registered ascent declarations drive discovery/replacement, including an
 * entrant-owned kind; a full bout can avoid the fallback and conceal the defect.
 */
test("a fallback recovery Option does not count its own transition as an ordinary ascent", async () => {
  const { GAME } = await import("../../src/app/catalog.ts");
  const { catalogOf } = await import("../../src/minds/catalog/catalog.ts");
  const { toolkitLists } = await import("../../src/app/toolkit.ts");
  const { REPOSITION_OPTION, WAY_UP_OPTION, waysUpIn, withWaysUp } = await import("../../src/minds/option/options/rise.ts");
  const { walker } = await import("../../src/minds/option/options/walk.ts");
  const { optionRecord } = await import("../../src/minds/option/situation/record.ts");
  const { BY_HAND } = await import("../../src/minds/option/predictions/by-hand.ts");
  const { nearestTrials } = await import("../../src/skills/framework/outcomes.ts");
  const spec = modelSpec("man"), [fallback] = REPOSITION_OPTION.each(REPOSITION_OPTION.defaults, GAME.partLookup);
  const technique = GAME.partLookup.of("technique", fallback.skill), from = technique.edges[0]?.from;
  assert.equal(technique.fits(spec, fallback.skill, GAME.partLookup), null, "the real fallback technique must fit the fixture body");
  assert.ok(from && technique.starts.length, "the fallback must expose a transition and a declared beginning");
  const [option] = REPOSITION_OPTION.make(fallback, { spec, hz: 120, rate: 120, delay: 0, parts: GAME.partLookup, legs: { kind: "move", rules: [], otherwise: "braced" },
    options: [fallback], outcomes: nearestTrials({}), guesses: BY_HAND, tries: null, walk: walker(spec, "speed", null), record: optionRecord(), sites: { all: [], names: [] } });
  assert.ok(option, "the fallback constructor must produce its transition Option");
  const ground = { settled: true, position: from, raw: from, side: "left", velocity: new Vector3(), spin: 0 };
  const now = { ground, sight: { view: { ground }, actions: { around: { heading: 0, placed: false, lower: 0, support: null, walk: null }, readiness: () => ({ kind: "ready" }) } } };
  assert.deepEqual(option.entry(now), { kind: "ready" }, "a ready uncovered start must retain the fallback's own transition");
  assert.deepEqual(waysUpIn(GAME.partLookup, spec, [fallback]), []);
  const ascent = { ...WAY_UP_OPTION, defaults: { kind: "fixture:ascent", skill: fallback.skill } };
  const catalog = catalogOf(() => ({ ...toolkitLists(), entrants: [{ name: "fixture", parts: [ascent], presets: {} }] }));
  assert.deepEqual(catalog.faults, []);
  assert.deepEqual(waysUpIn(catalog.partLookup, spec, [ascent.defaults, fallback]), [fallback.skill]);
  assert.deepEqual(withWaysUp(catalog.partLookup, [ascent.defaults, fallback], [fallback.skill]), [{ kind: "way-up", skill: fallback.skill }]);
});


/**
 * A valid numeric order reached the script but received zero obedience value without a
 * calibration, so the chooser held still; trace the measured actor through selection to its first
 * landing. Calibrated drills do not reach this path.
 */
test("a measured Lab script follows an explicit numeric walk without a gait envelope", async () => {
  const [{ LAB_MIND }, { labActor }, { startLocomotion }, { trackOf }] = await Promise.all([
    import("../../src/app/node/setup.ts"), import("../../src/app/node/game.ts"),
    import("../../src/game/lab/locomotion-mode.ts"), import("../../src/game/lab/track.ts"),
  ]);
  const stand = await coreStand(modelSpec("man"));
  let session;
  try {
    const actor = labActor(stand.built, stand.world, { mind: LAB_MIND, experiment: { measuring: true } });
    assert.equal("refused" in actor, false, "the measured Lab actor must be admitted");
    const course = trackOf([{ kind: "corner", metres: 0, turn: 0 }, { kind: "straight", metres: 80 }]);
    session = startLocomotion(actor, course, { top: .7, facing: 0 });
    assert.equal("refused" in session, false, "the numeric walk must start");
    assert.equal(actor.mind.skills.legs.envelope, null, "the fixture must remove its measured gait envelope");
    stand.step(stand.seconds(1));
    assert.ok(Number.isFinite(actor.state.script.orders.pace) && actor.state.script.orders.pace > 0, "the script must publish a finite numeric movement");
    assert.equal(actor.mind.report.engagement.phase, "follow orders (visibility-navigation/visibility-navigation)");
    stand.step(stand.seconds(2));
    const reading = session.frame();
    assert.ok(reading.gait.touchdowns > 0, "the selected ordered walk must reach its first landing");
    assert.equal(reading.fallen, false);
  } finally { session?.dispose(); stand.dispose(); }
});
