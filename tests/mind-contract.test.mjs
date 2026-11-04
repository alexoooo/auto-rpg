/**
 * **What every registered Mind keeps to** (Node, core world, vendored Rapier, 120 Hz): for each
 * entrant's presets, each drill opponent and each controller's defaults, a short Arena bout of that Mind
 * against itself on the first allowed body it fits, as its preset's character, runs and stays finite, flings nobody, forks
 * and resumes to the bit, and plays again to the bit from its recipe and its recorded order sheets with no
 * Mind made (`replayedBody`). How well a Mind fights is measured apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "../src/core/math/vector.ts";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { SIDES, senseDelayOf } from "../src/arena/duel.ts";
import { reactionSteps } from "../src/core/rules/rulebook.ts";
import { presetFitsModel } from "../src/core/mind/controller.ts";
import { BODY_MODELS } from "../src/core/models.ts";
import { FIGHT_ENTRY, GAME, treeFaults, treeObeys, CONTROLLERS, MINDS as PRESETS, modelRefusal, unusedParts } from "../src/entrants/game.ts";
import { DRILL_OPPONENTS } from "../src/evaluation/drill-opponents.ts";
import { catalogOf } from "../src/core/parts/catalog.ts";
import { toolkitLists } from "../src/core/toolkit.ts";
import { EMPTY_LOADOUT } from "../src/core/items/held.ts";
import { LOADOUTS, loadoutKey } from "../src/core/items/held.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { modelHolding, modelSpec } from "../src/core/models.ts";
import { replayedBody } from "../src/core/mind/sheets.ts";
import { SERVO_SECONDS } from "../src/core/body.ts";
import { commandedBody } from "../src/core/mind/host.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { poseAngles } from "../src/core/control/kinematics.ts";
import { GUARD } from "../src/core/skills/guard/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { coreStand, freshEngine } from "./harness/core-stand.mjs";
import { readView } from "../src/core/build/read-view.ts";
import { embody } from "../src/core/mind/mind.ts";
import { loadState, saveState } from "../src/core/state.ts";
import { uprightness } from "../src/core/control/ground.ts";
import { builtAngles, createMind } from "../src/core/mind/minds.ts";
import { HUMANOID_MODELS } from "../src/core/human/spec.ts";
import { mindWorkers } from "../src/node/minds.ts";
import { skillOf } from "../src/core/skills/framework/menu.ts";

/** The bout's steps, the step it is forked at, and the gap its sides start at, m: near enough for a blow. */
const STEPS = 180, FORK = 90, GAP = 0.9;
/** The most a segment's centre may move, m/s, and a body's centre of mass: as the smoke test holds a bout to. */
const FLUNG = Object.freeze({ segment: 40, body: 12 });

/** Every registered Mind: each preset and drill opponent's mind by id, then each controller's defaults by its kind where no preset is them. */
const MINDS = [...Object.entries(PRESETS), ...Object.entries(DRILL_OPPONENTS).map(([id, { label, mind }]) => [id, { label, config: mind }])];
for (const [kind, controller] of Object.entries(CONTROLLERS)) if (!MINDS.some(([, preset]) => preset.config === controller.defaults)) MINDS.push([kind, { config: controller.defaults }]);

test("the game's catalog has no fault, and refuses an entrant's unscoped kind, a preset id twice and a preset of two entrants' kinds", () => {
  assert.deepEqual(GAME.faults, []);
  // The control: each planted defect is named, and the entry at fault left out.
  const guard = { kind: "cover-guard" }, sly = { ...guard, kind: "sly:guard" }, option = PRESETS.option;
  const planted = catalogOf(() => ({ ...toolkitLists(), entrants: [
    { name: "sly", parts: [{ ...GAME.partOf(guard), defaults: sly }, { ...GAME.partOf(guard), defaults: { ...guard, kind: "low-guard" } }], presets: { option } },
    { name: "copy", presets: { option, mixed: { label: "Mixed", config: { ...option.config, tuning: { parts: { guard: sly } } } } } },
  ] }));
  assert.deepEqual(planted.faults, [
    `sly's guard part "low-guard" is not scoped sly:`,
    `copy's preset "option" is sly's`,
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
        const { position: p, rotation: q } = segment.pose;
        segment.body.linearVelocityToRef(v);
        if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z].every(Number.isFinite)) peak.unfinite.push(world.steps);
        peak.segment = Math.max(peak.segment, v.length());
        momentum.addInPlace(v.scale(segment.rigid.mass)); mass += segment.rigid.mass;
      }
      peak.body = Math.max(peak.body, momentum.length() / mass);
    }
  }
}

/**
 * The bout of `recipe` under `hooks` played to `STEPS`, forked at `FORK` and played on again from
 * there when asked; with `read`, each side's whole report read after every step; with `mirrored`,
 * each mind on its mirror (`World.mirrored`); with `minds`, each mind apart in that place (`World.minds`).
 */
async function played(recipe, hooks, fork, { read = false, mirrored = false, minds = undefined } = {}) {
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, hooks, ...(mirrored ? { mirrored } : {}), ...(minds ? { minds } : {}) });
  try {
    duel.play([]);
    const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts), tail = traceOf(builts);
    const peak = { segment: 0, body: 0, unfinite: [] }, reading = { menus: 0, kit: 0 };
    const after = !read ? undefined : () => {
      for (const side of SIDES) {
        const report = duel.duelists[side].minded.report;
        if (!report) continue;
        JSON.stringify({ engagement: report.engagement, prospects: report.prospects, heading: report.heading, navigation: report.navigation, kit: report.kit, actions: report.actions, ended: report.ended });
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
  // Nearer than the bouts above, so that blows land within the bout's steps.
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 0.8, balance: { left: 25, right: 25 }, minds: { left: config, right: config }, ...bothAs(character) };
  const first = await played(recipe, { record: true }, false);
  const carried = (key) => SIDES.map((side) => first.sheets[side].sheets.filter((sheet) => key(sheet)).length);
  assert.ok(first.blows > 0, "a blow lands");
  assert.ok(carried((sheet) => sheet.hands.length > 0).every((n) => n > 0), "each side's sheets carry its hand poses");
  assert.ok(carried((sheet) => sheet.force.some((v) => v !== 0) || sheet.moment.some((v) => v !== 0)).every((n) => n > 0), "each side asks its assist");
  const replay = await played(recipe, { replay: first.sheets }, false);
  assert.equal(replay.end.digest, first.end.digest);
  assert.equal(replay.end.physics, first.end.physics);
});

/**
 * The bouts a mind's mirror is held to: Option Mind each side with a quarter of its weight to ask, near enough for blows,
 * fists and assist asks (the assisted replay's bout); the Warrior with sword and buckler against the Rogue with the club;
 * and the reptile against itself, whose bite reads its contacts. The first is the assisted one.
 */
function mirrorRecipes() {
  const { config, character } = PRESETS.option;
  const assisted = { left: "workshop-fighter", right: "workshop-fighter", gap: GAP, balance: { left: 25, right: 25 }, minds: { left: config, right: config }, ...bothAs(character) };
  return [assisted,
    { ...assisted, right: "workshop-rogue", loadouts: { left: { left: "buckler", right: "sword" }, right: { left: "empty", right: "club" } } },
    { left: "reptile", right: "reptile", gap: GAP, minds: { left: config, right: config }, entry: [] },
  ];
}

test("a bout with every mind on its mirror is the bout with every mind on its body, step for step: poses, physics, order sheets, a fork", async () => {
  const [assisted] = mirrorRecipes();
  for (const recipe of mirrorRecipes()) {
    const body = await played(recipe, { record: true }, true), mirror = await played(recipe, { record: true }, true, { mirrored: true });
    const sheets = (run) => JSON.stringify(SIDES.map((side) => run.sheets[side].sheets));
    if (recipe === assisted) assert.ok(body.blows > 0 && SIDES.every((side) => body.sheets[side].sheets.some((sheet) => sheet.hands.length > 0)
      && body.sheets[side].sheets.some((sheet) => sheet.force.some((v) => v !== 0))), "the fixture reaches blows, hand poses and assist asks");
    assert.equal(mirror.end.digest, body.end.digest, `${recipe.left}: the poses, step by step`);
    assert.equal(mirror.end.physics, body.end.physics, `${recipe.left}: the physical state to the bit`);
    assert.equal(sheets(mirror), sheets(body), `${recipe.left}: every order sheet`);
    assert.equal(mirror.resumed, body.resumed, `${recipe.left}: forked at ${FORK} and resumed`);
    assert.equal(mirror.blows, body.blows);
  }
});

test("a bout with every mind apart, on two minds' threads, is the bout with every mind on its body, its reports read", async () => {
  // Apart, a mind's memory is where it runs: the bout is neither saved nor forked, and its reports and menus cross as data.
  for (const recipe of mirrorRecipes()) {
    const body = await played(recipe, { record: true }, false, { read: true });
    const minds = mindWorkers(2);
    try {
      const apart = await played(recipe, { record: true }, false, { read: true, minds });
      const sheets = (run) => JSON.stringify(SIDES.map((side) => run.sheets[side].sheets));
      assert.equal(apart.end.digest, body.end.digest, `${recipe.left}: the poses, step by step`);
      assert.equal(apart.end.physics, body.end.physics, `${recipe.left}: the physical state to the bit`);
      assert.equal(sheets(apart), sheets(body), `${recipe.left}: every order sheet`);
      assert.deepEqual([apart.blows, apart.reading], [body.blows, body.reading], `${recipe.left}: the blows, and the menus and kits read`);
    } finally { minds.dispose(); }
  }
});

test("a mind that draws by chance plays apart on two bout seeds, and a seed's bout forks and resumes to the bit", async () => {
  // Option Mind, its punch an Option of each hand, the two near alike in worth, and a margin wide enough that either may be drawn.
  const { config, character } = PRESETS.option;
  const mind = (margin) => ({ ...config, chooser: { ...config.chooser, margin } });
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
  // Nearer than the bouts above, so that blows land within the bout's steps.
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 0.8, balance: { left: 25, right: 25 }, minds: { left: config, right: config }, ...bothAs(character) };
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
  const world = createWorld(await freshEngine());
  world.physics.addFixedBox([0, -.5, 0], [20, 1, 20]);
  const spec = modelSpec("workshop-fighter"), half = Math.sqrt(.5);
  const built = buildBody(spec, world, { position: [0, .4, 0], rotation: [-half, 0, 0, half], joints: poseAngles(spec, GUARD) });
  const body = commandedBody(built, world, { servoSeconds: SERVO_SECONDS });
  try {
    body.drive(() => ({ posture: poseAngles(spec, GUARD), pushes: [], stance: { feet: ["foot.left", "foot.right"], centre: null, height: 0.02, heading: 0 } }));
    world.step(world.hz);
    assert.ok(body.physical.height < body.view.standing - 0.5, `the fixture is not lying: its centre of mass is ${body.physical.height.toFixed(2)} m over its lowest point`);
    assert.deepEqual({ itsMind: body.view.down, theFight: body.down }, { itsMind: false, theFight: true });
  } finally { body.dispose(); built.dispose(); world.dispose(); }
});

test("a body's uprightness read through its mind's view of it is the body's, whichever's segments it is asked with", async () => {
  // The Warrior standing in its guard: every reading the same through the body and its view, and
  // the clearance it holds over its soles asked with either's feet.
  const stand = await coreStand(modelSpec("workshop-fighter"), { posture: GUARD });
  try {
    const built = stand.built, view = readView(built), feet = [...built.segments.keys()].filter((name) => /^(foot|toes)\./.test(name));
    const read = (body) => {
      const upright = uprightness(body);
      return { height: upright.height(), lowest: upright.lowest(), down: upright.down(), fallen: upright.fallen(),
        overSoles: upright.clearance(new Set(feet.map((name) => body.segments.get(name)))) };
    };
    const asBuilt = read(built);
    assert.ok(asBuilt.overSoles > 0.02, `the fixture does not stand on its feet: the rest is ${asBuilt.overSoles} m over its soles`);
    assert.deepEqual(read(view), asBuilt);
  } finally { stand.dispose(); }
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
  const config = PRESETS.option.config;
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
        begun.set(action.id, JSON.parse(JSON.stringify({ skill: skillOf(report.kit, action.action), limb: action.effector, target: action.target })));
    }
    return { menu, begun: [...begun.values()] };
  } finally { dispose(); }
}

for (const [id, preset] of MINDS.filter(([, preset]) => treeObeys(preset.config))) {
  test(`${id}: ordered to strike a still foe with a choice of its menu it would not make, it begins that and no other`, async (t) => {
    const on = `${id} on ${modelFor(preset)}`, own = await strikesAt(preset, 1);
    if (own.begun === null) { t.skip(`${on} reports no action aimed at a body`); return; }
    const [first] = own.begun;
    // The last choice at the foe that its body could start or walk to, other than the strike it begins by itself, where it begins one.
    const choice = own.menu.filter((entry) => entry.foe === "right" && (entry.readiness.kind === "ready" || entry.readiness.kind === "position")
      && !(first && entry.skill === first.skill && entry.limb === first.limb)).at(-1);
    if (!choice) { t.skip(`${on} has no choice at a still foe on its menu but the strike it begins by itself`); return; }
    const asked = { skill: choice.skill, limb: choice.limb, target: { kind: "body", body: "right", region: choice.region } };
    const ordered = await strikesAt(preset, ORDERED.strikes, () => ({ foe: "right", region: choice.region, skill: choice.skill, limb: choice.limb }));
    assert.ok(ordered.begun.length > 0, `${on}, ordered ${JSON.stringify(asked)}, began no strike in ${ORDERED.steps} steps; unordered it began ${JSON.stringify(first ?? "none")}`);
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

test("Option Mind's preset fits and is built on every humanoid with every loadout, leaving out only the skills a body cannot use", async () => {
  // A mind is a choice of skills: on a body, it runs the chosen skills the body can use, and the
  // mind panel names the rest (`unusedParts`); a skill a body cannot use never refuses the mind.
  const config = PRESETS.option.config, refused = [], left = new Map();
  const skills = new Set(config.options.flatMap((one) => one.skill ? [GAME.partOf(one.skill).label] : []));
  for (const model of HUMANOID_MODELS) for (const loadout of LOADOUTS) {
    const at = `${model}/${loadoutKey(loadout)}`, refusal = modelRefusal(model, config, loadout, []);
    if (refusal !== null) { refused.push(`${at}: ${refusal}`); continue; }
    const spec = modelHolding(model, loadout), unused = unusedParts(spec, config);
    left.set(at, unused);
    const stand = await coreStand(spec, { joints: builtAngles(GAME, spec, config), engine: BOUT_ENGINE });
    try {
      const minded = createMind(GAME, stand.built, stand.world, config, { name: at, orders: () => null });
      stand.step(12);
      assert.ok(Number.isFinite(minded.body.view.stance.centre.x), `${at}: the body is not finite after its first steps`);
    } finally { stand.dispose(); }
  }
  assert.ok([...left.values()].some((unused) => unused.length > 0), "the fixture reaches a body that leaves a skill out");
  assert.deepEqual(refused, []);
  const named = [...left].flatMap(([at, unused]) => unused.filter((line) => !skills.has(line.slice(0, line.indexOf(":")))).map((line) => `${at}: ${line}`));
  assert.deepEqual(named, [], "only the preset's skills are left out");
});

test("Option Mind's two uses of one skill are two Options, each named for its use; one strike twice is a fault", async () => {
  const config = PRESETS.option.config, club = config.options.find((one) => one.kind === "strike-club-blow");
  const high = { kind: "mark", mark: "high" }, middle = { kind: "mark", mark: "middle" };
  const bonk = { ...club, regions: [high] }, swipe = { ...club, regions: [middle] };
  const using = (strikes) => ({ ...config, options: config.options.flatMap((one) => one === club ? strikes : [one]) });
  const spec = modelHolding("workshop-fighter", { left: "empty", right: "club" });
  assert.deepEqual(treeFaults(using([bonk, swipe])), [], "two uses of one skill are no fault");
  assert.deepEqual(treeFaults(using([club, club])), ["options: two strikes by club-blow alike in limbs, regions and aim: one Option twice"]);
  const both = using([bonk, swipe]), stand = await coreStand(spec, { joints: builtAngles(GAME, spec, both), engine: BOUT_ENGINE });
  try {
    const minded = createMind(GAME, stand.built, stand.world, both, { name: "two uses", orders: () => null });
    stand.step(12);
    assert.deepEqual(minded.report.kit.filter((entry) => entry.kind === "club-blow"), [
      { action: "club-blow (high)", kind: "club-blow", limbs: ["hand.right"], regions: [high] },
      { action: "club-blow (middle)", kind: "club-blow", limbs: ["hand.right"], regions: [middle] },
    ]);
  } finally { stand.dispose(); }
});

/** The command's delay a world is made with to show it: more than one step, so its ring is read through. */
const SHOWN_DELAY = 2;

test("a body's command is applied the world's delay after it is sent, none before, none again after its level leaves full, and across a save and load", async () => {
  const spec = modelSpec("workshop-fighter");
  const world = createWorld(await freshEngine(), { actuation: "directional", delay: SHOWN_DELAY });
  const built = buildBody(spec, world, { position: [0, 1, 0], joints: poseAngles(spec, GUARD) });
  // Held in place, every muscle's strength is the one at rest, so a ceiling reads the activation that set it; its weight sets its assist's ceiling.
  for (const segment of built.segments.values()) segment.body.setFixed(true);
  const right = built.handPoses.model.find((hand) => hand.hand === "right"), poses = right.poses.slice(0, 2);
  assert.equal(poses.length, 2, "the fixture needs a hand with two poses");
  const sent = [], level = (k) => 0.05 + 0.1 * (k % 7), push = (k) => [k + 1, 0, 0];
  const embodied = embody(built, world, (own) => ({ name: "delay probe", state: {}, step() {
    const k = sent.length;
    own.muscles.activation.fill(level(k)); own.muscles.velocity.fill(0);
    own.assist.ask(new Vector3(...push(k)), new Vector3());
    own.requestHandPoses([{ hand: "right", pose: poses[k % 2] }]);
    sent.push(k);
  } }), { assist: { force: 10, moment: 10 } });
  // The body's own muscles and assist, not the mind's view of them, which a world with a delay keeps on a mirror a step behind.
  const muscles = embodied.held.muscles, channel = muscles.channels.findIndex((c) => c.positive.tendon === null && c.negative.tendon === null);
  assert.ok(channel >= 0, "the fixture needs a channel without a tendon");
  // What the body was given on the step just taken: the activation its ceiling reads, the assist's push and the hand's pose asked.
  const given = () => ({ activation: Math.round(1e9 * muscles.bounds.positive[channel] / muscles.strength(channel, 1)) / 1e9,
    push: embodied.held.assist.given.force.x, pose: built.handPoses.state.right.requested });
  const expected = (k, since) => k - since < SHOWN_DELAY ? { activation: 0, push: 0, pose: null }
    : { activation: Math.round(1e9 * level(k - SHOWN_DELAY)) / 1e9, push: push(k - SHOWN_DELAY)[0], pose: poses[(k - SHOWN_DELAY) % 2] };
  // A hand keeps the pose it was last asked: where none is due, the reading names none if the hand holds the one it held as the steps began.
  const played = (from, steps, since) => {
    const held = built.handPoses.state.right.requested;
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
