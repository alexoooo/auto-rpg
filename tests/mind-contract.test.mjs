/**
 * **What every registered Mind keeps to** (Node, core world, vendored Rapier, 120 Hz): for each
 * entrant's presets, each drill opponent and each controller's defaults, a short Arena bout of that Mind
 * against itself on the first allowed body it fits, as its preset's character, runs and stays finite, flings nobody, forks
 * and resumes to the bit, and plays again to the bit from its recipe and its recorded order sheets with no
 * Mind made (`replayedBody`). How well a Mind fights is measured apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { SIDES, senseDelayOf } from "../src/arena/duel.ts";
import { reactionSteps } from "../src/core/rules/rulebook.ts";
import { presetFitsModel } from "../src/core/mind/controller.ts";
import { BODY_MODELS } from "../src/core/models.ts";
import { FIGHT_ENTRY, GAME, treeObeys, CONTROLLERS, MINDS as PRESETS, modelRefusal } from "../src/entrants/game.ts";
import { DRILL_OPPONENTS } from "../src/evaluation/drill-opponents.ts";
import { catalogOf } from "../src/core/parts/catalog.ts";
import { toolkitLists } from "../src/core/toolkit.ts";
import { BLADE_FIGHTER } from "../src/core/tactics/config.ts";
import { EMPTY_LOADOUT } from "../src/core/items/held.ts";
import { LOADOUTS, loadoutKey } from "../src/core/items/held.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { modelSpec } from "../src/core/models.ts";
import { replayedBody } from "../src/core/mind/sheets.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { poseAngles } from "../src/core/control/kinematics.ts";
import { GUARD } from "../src/core/skills/guard/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";

/** The bout's steps, the step it is forked at, and the gap its sides start at, m: near enough for a blow. */
const STEPS = 180, FORK = 90, GAP = 0.9;
/** The most a segment's centre may move, m/s, and a body's centre of mass: as the smoke test holds a bout to. */
const FLUNG = Object.freeze({ segment: 40, body: 12 });

/** Every registered Mind: each preset and drill opponent by id, then each controller's defaults by its kind where no preset is them. */
const MINDS = [...Object.entries(PRESETS), ...Object.entries(DRILL_OPPONENTS)];
for (const [kind, controller] of Object.entries(CONTROLLERS)) if (!MINDS.some(([, preset]) => preset.config === controller.defaults)) MINDS.push([kind, { config: controller.defaults }]);

test("the game's catalog has no fault, and refuses an entrant's unscoped kind, a preset id twice and a preset of two entrants' kinds", () => {
  assert.deepEqual(GAME.faults, []);
  // The control: each planted defect is named, and the entry at fault left out.
  const guard = BLADE_FIGHTER.guard, sly = { ...guard, kind: "sly:guard" }, duellist = PRESETS.duellist;
  const planted = catalogOf(() => ({ ...toolkitLists(), entrants: [
    { name: "sly", parts: [{ ...GAME.partOf(guard), defaults: sly }, { ...GAME.partOf(guard), defaults: { ...guard, kind: "low-guard" } }], presets: { duellist } },
    { name: "copy", presets: { duellist, mixed: { label: "Mixed", config: { ...duellist.config, guard: sly } } } },
  ] }));
  assert.deepEqual(planted.faults, [
    `sly's guard part "low-guard" is not scoped sly:`,
    `copy's preset "duellist" is sly's`,
    `copy's preset "mixed" names sly's kinds`,
  ]);
});

/** The first body a preset both allows and physically fits, as its character; an uncalibrated mind allows every model. */
const modelFor = (preset) => BODY_MODELS.find((candidate) => presetFitsModel(preset, candidate)
  && modelRefusal(candidate, preset.config, EMPTY_LOADOUT, [], preset.character) === null);

/** A recipe's attributes for both sides as `character`, or none. */
const bothAs = (character) => character ? { attributes: { left: character, right: character } } : {};

/** Step `duel` to `until` bout steps, taking each of `traces` and the peaks after each, and calling `after`. */
function stepTo(world, duel, until, traces, peak, after = () => {}) {
  const v = new Vector3(), momentum = new Vector3();
  while (duel.steps < until) {
    world.step();
    after();
    for (const trace of traces) trace.take();
    for (const side of SIDES) {
      let mass = 0;
      momentum.setAll(0);
      for (const segment of duel.duelists[side].built.segments.values()) {
        const { position: p, rotationQuaternion: q } = segment.node;
        segment.body.linearVelocityToRef(v);
        if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z].every(Number.isFinite)) peak.unfinite.push(world.steps);
        peak.segment = Math.max(peak.segment, v.length());
        momentum.addInPlace(v.scale(segment.rigid.mass)); mass += segment.rigid.mass;
      }
      peak.body = Math.max(peak.body, momentum.length() / mass);
    }
  }
}

/** The bout of `recipe` under `hooks` played to `STEPS`, forked at `FORK` and played on again from there when asked; with `read`, each side's whole report read after every step. */
async function played(recipe, hooks, fork, { read = false } = {}) {
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, hooks });
  try {
    duel.play([]);
    const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts), tail = traceOf(builts);
    const peak = { segment: 0, body: 0, unfinite: [] }, reading = { menus: 0, kit: 0 };
    const after = !read ? undefined : () => {
      for (const side of SIDES) {
        const report = duel.duelists[side].minded.report;
        if (!report) continue;
        JSON.stringify({ engagement: report.engagement, heading: report.heading, navigation: report.navigation, kit: report.kit, actions: report.actions, ended: report.ended });
        reading.menus += JSON.parse(JSON.stringify(report.menu ?? [])).length; reading.kit += report.kit?.length ?? 0;
      }
    };
    stepTo(world, duel, FORK, [trace], peak, after);
    const saved = fork ? duel.save() : null;
    stepTo(world, duel, STEPS, [trace, tail], peak, after);
    const end = { digest: trace.digest(), tail: tail.digest(), physics: Buffer.from(world.physics.save()).toString("base64") };
    let resumed = null;
    if (saved) {
      duel.load(saved);
      const again = traceOf(builts);
      stepTo(world, duel, STEPS, [again], { segment: 0, body: 0, unfinite: [] });
      resumed = again.digest();
    }
    const sheets = Object.fromEntries(SIDES.map((side) => [side, duel.duelists[side].sheets]));
    return { end, peak, resumed, sheets, minds: SIDES.map((side) => duel.duelists[side].minded.kind), blows: duel.blows.length, reading };
  } finally { dispose(); }
}

for (const [id, preset] of MINDS) {
  const { config } = preset, model = modelFor(preset);
  test(`${id} on ${model ?? "no allowed body"}: a short bout runs, stays finite, flings nobody, forks and resumes, replays from its order sheets, and plays the same read`, async () => {
    assert.ok(model, `${id} fits no body allowed by its calibration`);
    assert.ok(presetFitsModel(preset, model), "the replay fixture uses an allowed body");
    const recipe = { left: model, right: model, gap: GAP, minds: { left: config, right: config }, entry: [], ...bothAs(preset.character) };
    const first = await played(recipe, { record: true }, true);
    assert.deepEqual(first.peak.unfinite, [], "every pose and velocity is finite");
    assert.ok(first.peak.segment < FLUNG.segment && first.peak.body < FLUNG.body, `the fastest segment ${first.peak.segment} m/s, body ${first.peak.body} m/s`);
    assert.equal(first.resumed, first.end.tail, "the bout forked and resumed is the bout, step by step");
    for (const side of SIDES) assert.equal(first.sheets[side].sheets.length, STEPS, `${side} wrote a sheet a step`);
    const replay = await played(recipe, { replay: first.sheets }, false);
    assert.deepEqual(replay.minds, ["replay", "replay"]);
    assert.equal(replay.end.digest, first.end.digest, "the replay's poses are the bout's, step by step");
    assert.equal(replay.end.physics, first.end.physics, "the replay's physical state is the bout's to the bit");
    // Its whole report read after every step, its menu of choices with it, changes nothing of the bout.
    const read = await played(recipe, {}, false, { read: true });
    assert.ok(read.reading.kit === 0 || read.reading.menus > 0, `a mind with a kit has choices to read (${read.reading.menus} read)`);
    assert.equal(read.end.digest, first.end.digest, "the bout read is the bout, step by step");
    assert.equal(read.end.physics, first.end.physics, "the bout read is the bout's physical state to the bit");
  });
}

test("an assisted bout with blows, fists and assist asks replays from its sheets to the bit", async () => {
  // The control for the bouts above, where nobody is assisted: Option Mind each side, with a quarter of its weight to ask.
  const { config, character } = PRESETS.option;
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: GAP, balance: { left: 25, right: 25 }, minds: { left: config, right: config }, ...bothAs(character) };
  const first = await played(recipe, { record: true }, false);
  const carried = (key) => SIDES.map((side) => first.sheets[side].sheets.filter((sheet) => key(sheet)).length);
  assert.ok(first.blows > 0, "a blow lands");
  assert.ok(carried((sheet) => sheet.hands.length > 0).every((n) => n > 0), "each side's sheets carry its hand poses");
  assert.ok(carried((sheet) => sheet.force.some((v) => v !== 0) || sheet.moment.some((v) => v !== 0)).every((n) => n > 0), "each side asks its assist");
  const replay = await played(recipe, { replay: first.sheets }, false);
  assert.equal(replay.end.digest, first.end.digest);
  assert.equal(replay.end.physics, first.end.physics);
});

test("a mind that draws by chance plays apart on two bout seeds, and a seed's bout forks and resumes to the bit", async () => {
  // Option Mind with a punch of each hand, the two near alike in worth, and a margin wide enough that either may be drawn.
  const { config, character } = PRESETS.option, [strike] = config.actions;
  const hands = ["hand.right", "hand.left"].map((hand) => ({ ...strike, name: hand, effectors: [hand] }));
  const mind = (margin) => ({ ...config, actions: hands, chooser: { ...config.chooser, margin } });
  const recipe = (margin, seed) => ({ left: "workshop-fighter", right: "workshop-fighter", gap: GAP, seed, minds: { left: mind(margin), right: config }, entry: [], ...bothAs(character) });
  const [one, two] = [await played(recipe(1000, 1), {}, true), await played(recipe(1000, 2), {}, false)];
  assert.notEqual(two.end.digest, one.end.digest, "two seeds play apart: with a margin, a draw changed a choice");
  assert.equal(one.resumed, one.end.tail, "a seed's bout forked and resumed is the bout, step by step, its stream's word in its state");
  // The control: with no margin nothing is drawn, so the seed changes nothing.
  assert.equal((await played(recipe(0, 2), {}, false)).end.digest, (await played(recipe(0, 1), {}, false)).end.digest, "with no margin the seed plays no part");
});

test("a mind senses its own life at once and another's as late as the rest of it, a fraction of the whole, never a part's hit points", async () => {
  // Option Mind at arm's reach each side, each with a quarter of its weight to ask, wound each other within the bout.
  const { config, character } = PRESETS.option;
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: GAP, balance: { left: 25, right: 25 }, minds: { left: config, right: config }, ...bothAs(character) };
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE });
  try {
    duel.play([]);
    // The senses read each body as the step before left it, blows included, and show it the reaction time later.
    const late = reactionSteps(senseDelayOf(recipe), world.hz) + 1, [left, right] = SIDES.map((side) => duel.duelists[side]);
    const bars = [], own = [], seen = [];
    while (duel.steps < STEPS * 2) {
      world.step();
      bars.push(left.pool.bar()); own.push(left.senses().life);
      const sensed = right.senses().others.find((body) => body.id === left.id);
      seen.push(sensed.life);
      assert.deepEqual(Object.keys(sensed).filter((key) => /hp|hit|pool/i.test(key)), [], "no part's hit points among what is sensed of a body");
    }
    const wounded = bars.findIndex((bar) => bar < 1);
    assert.ok(late > 1 && wounded >= 0 && wounded < bars.length - late, `the left is wounded ${late} steps or more before the end (first at step ${wounded})`);
    assert.deepEqual(own, bars, "its own life is its bar, at once");
    assert.deepEqual(seen.slice(late), bars.slice(0, bars.length - late), "the other sees its bar as the step before left it, the reaction time late");
    assert.ok(seen.slice(0, late).every((life) => life === 1), "before then, as it stood");
  } finally { dispose(); }
});

test("a body is down by the fight's rule of the body alone, whatever height its mind asks it to hold", async () => {
  // The Warrior on its back, its mind asking its stance for a centre of mass 2 cm over its soles:
  // under that ask its own view reads it not down, and the fight reads it down all the same.
  const rendering = new NullEngine(), scene = new Scene(rendering), world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -.5, 0], [20, 1, 20]);
  const spec = modelSpec("workshop-fighter"), half = Math.sqrt(.5);
  const built = buildBody(spec, world, { position: [0, .4, 0], rotation: [-half, 0, 0, half], joints: poseAngles(spec, GUARD) });
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  try {
    body.drive(() => ({ posture: poseAngles(spec, GUARD), pushes: [], stance: { feet: ["left", "right"], centre: null, height: 0.02, heading: 0 } }));
    world.step(world.hz);
    assert.ok(body.physical.height < body.view.standing - 0.5, `the fixture is not lying: its centre of mass is ${body.physical.height.toFixed(2)} m over its lowest point`);
    assert.deepEqual({ itsMind: body.view.down, theFight: body.down }, { itsMind: false, theFight: true });
  } finally { body.dispose(); built.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); }
});

test("a replay refuses a step with no order sheet, so a record that is short is found", async () => {
  const [, preset] = MINDS[0], { config } = preset, model = modelFor(preset);
  assert.ok(model, "the replay fixture has an allowed body it fits");
  const recipe = { left: model, right: model, gap: GAP, minds: { left: config, right: config }, entry: [], ...bothAs(preset.character) };
  const first = await played(recipe, { record: true }, false);
  const short = Object.fromEntries(SIDES.map((side) => [side, { ...first.sheets[side], sheets: first.sheets[side].sheets.slice(0, FORK) }]));
  await assert.rejects(played(recipe, { replay: short }, false), /no order sheet for step/);
});


test("both-hand loadouts fork and replay their physical commands", async () => {
  const config = PRESETS.duellist.config;
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", gap: 3,
    loadouts: { left: { left: "sword", right: "sword" }, right: { left: "buckler", right: "sword" } },
    minds: { left: config, right: config } };
  const first = await played(recipe, { record: true }, true);
  assert.deepEqual(first.peak.unfinite, []);
  assert.equal(first.resumed, first.end.tail);
  const replay = await played(recipe, { replay: first.sheets }, false);
  assert.deepEqual(replay.minds, ["replay", "replay"]);
  assert.equal(replay.end.digest, first.end.digest);
  assert.equal(replay.end.physics, first.end.physics);
});

/** The longest an ordered mind is watched striking, bout steps (8 s), and the strikes it is watched to begin. */
const ORDERED = Object.freeze({ steps: 960, strikes: 2 });
/** The foe an ordered mind strikes: one that stands still. */
const STILL = MINDS.find(([id]) => id === "drill-stand")[1];

/** The strikes the left side begins against a still foe, as many as `strikes`, given `order` after its first step: its menu then, and what it began (null where its report names no action aimed at a body). */
async function strikesAt(preset, strikes, order = () => null) {
  const recipe = { left: modelFor(preset), right: modelFor(STILL), gap: GAP, minds: { left: preset.config, right: STILL.config },
    entry: [], ...(preset.character ? { attributes: { left: preset.character } } : {}) };
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE });
  try {
    duel.play([]);
    world.step();
    const report = duel.duelists.left.minded.report, menu = report.menu ?? [];
    const orders = order(menu);
    if (orders) duel.order("left", orders);
    const struck = new Set((report.kit ?? []).filter((entry) => entry.regions.length > 0).map((entry) => entry.action)), begun = new Map();
    if (struck.size === 0) return { menu, begun: null };
    while (duel.steps < ORDERED.steps && begun.size < strikes) {
      world.step();
      for (const action of report.actions) if (struck.has(action.action) && !begun.has(action.id))
        begun.set(action.id, JSON.parse(JSON.stringify({ action: action.action, limb: action.effector, target: action.target })));
    }
    return { menu, begun: [...begun.values()] };
  } finally { dispose(); }
}

for (const [id, preset] of MINDS.filter(([, preset]) => treeObeys(preset.config))) {
  test(`${id}: ordered to strike a still foe with a choice of its menu it would not make, it begins that and no other`, async (t) => {
    const on = `${id} on ${modelFor(preset)}`, own = await strikesAt(preset, 1);
    if (own.begun === null) { t.skip(`${on} reports no action aimed at a body`); return; }
    if (own.begun.length === 0) { t.skip(`the fixture does not reach ${on}: unordered, it begins no strike at a still foe in ${ORDERED.steps} steps`); return; }
    const [first] = own.begun;
    // The last choice at the foe that its body could start or walk to, other than the strike it begins by itself.
    const choice = own.menu.filter((entry) => entry.foe === "right" && (entry.readiness.kind === "ready" || entry.readiness.kind === "position")
      && !(entry.action === first.action && entry.limb === first.limb)).at(-1);
    if (!choice) { t.skip(`${on} has no choice at a still foe on its menu but the strike it begins by itself`); return; }
    const asked = { action: choice.action, limb: choice.limb, target: { kind: "body", body: "right", region: choice.region } };
    const ordered = await strikesAt(preset, ORDERED.strikes, () => ({ foe: "right", region: choice.region, action: choice.action, limb: choice.limb }));
    assert.ok(ordered.begun.length > 0, `${on}, ordered ${JSON.stringify(asked)}, began no strike in ${ORDERED.steps} steps; unordered it began ${JSON.stringify(first)}`);
    for (const one of ordered.begun) assert.deepEqual(one, asked, `${on} began what it was not ordered`);
  });
}

test("every registered Mind is built on each character and catalog loadout it fits", async () => {
  // Fitting is the promise that a mind can be built and fight there: two cases a bout, one a side.
  // A preset that names its character is built as it on the bodies it allows.
  const cases = MINDS.flatMap(([id, preset]) => BODY_MODELS.filter((model) => !preset.character || presetFitsModel(preset, model)).flatMap((model) => LOADOUTS
    .filter((loadout) => modelRefusal(model, preset.config, loadout, FIGHT_ENTRY, preset.character) === null)
    .map((loadout) => ({ id, config: preset.config, character: preset.character, model, loadout }))));
  assert.ok(cases.some(({ loadout }) => loadout.left === "buckler" && loadout.right === "sword"), "the fixture reaches sword and buckler");
  const failed = [];
  for (let k = 0; k < cases.length; k += 2) {
    const left = cases[k], right = cases[k + 1] ?? cases[k];
    try {
      const { dispose } = await buildBout({ left: left.model, right: right.model, gap: 4, loadouts: { left: left.loadout, right: right.loadout }, minds: { left: left.config, right: right.config },
        attributes: { left: left.character ?? {}, right: right.character ?? {} } }, { engine: BOUT_ENGINE });
      dispose();
    } catch (error) { failed.push(`${left.id}/${left.model}/${loadoutKey(left.loadout)} or ${right.id}/${right.model}/${loadoutKey(right.loadout)}: ${error.message}`); }
  }
  assert.deepEqual(failed, []);
});
