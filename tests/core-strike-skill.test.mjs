/**
 * **The strike skill and its repertoire** (`src/core/skills/strike.ts`, `strikes.ts`), on views
 * built by hand: the left hand's strike is the right's with the arms' channels swapped and the
 * trunk's sided turns reversed; a hand throws the recipe for what it holds whose window holds its
 * target's height, its body's own before another's, with its window turned over for the other
 * hand; every recipe of the repertoire is whole, and reads at its place what its record says; an
 * attack walks toward its place, sets the feet there, stands `STAND` s, asks the window of the
 * head as it stands, chambers, pushes and is counted; and a target out of every recipe's height is
 * struck by a placed blow, a hand goal that carries the hand's point through the target in the
 * body frame. That a blow thrown through the skill reads as its search read it, to the digit, is
 * `tests/lab-blow.test.mjs`'s; that a placed blow lands, `tests/lab-targets.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD_ACTION } from "../src/core/mind/intent.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { PLACING } from "../src/core/skills/locomotion.ts";
import { APPROACH, PLACED, STAND, STEER, strikeSkill } from "../src/core/skills/strike.ts";
import { BAND_NAMES, BANDS, FIST, heldIn, mirrored, mirroredWindow, netsOf, recipeFor, recipesFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { bandRise } from "../src/lab/blow.ts";
import { CORE_BLOW_HARNESS, evaluateBlow, heldSpec } from "../research/core-blow.mjs";
import { WARRIOR_STRAIGHT } from "./fixtures/strikes.mjs";

const DT = 1 / 120;
const plain = (value) => JSON.parse(JSON.stringify(value));

/** The Warrior's own recipes, of a test's: a straight at a head, and the repertoire's club blow at one. */
const STRAIGHTS = [WARRIOR_STRAIGHT];
const CLUB = REPERTOIRE.find((recipe) => recipe.model === "workshop-fighter" && recipe.held === "wooden club" && recipe.band === "high");
const CLUBS = [CLUB];

test("a_left_strike_swaps_the_arms_channels_and_reverses_the_trunks_sided_turns", () => {
  const right = {
    name: "a right straight", hand: "right",
    chamber: { seconds: 0.2, pose: { "thoracic rotation right": -0.1, "thoracic flexion": 0.2, "shoulder.right flexion": 1.5 } },
    pushes: [
      { channel: "thoracic rotation right", sense: -1, from: 0, to: 0.1 },
      { channel: "thoracic lateral flexion right", sense: 1, from: 0, to: 0.1, level: 0.5 },
      { channel: "lumbar flexion", sense: 1, from: 0.05, to: 0.1 },
      { channel: "shoulder.right flexion", sense: 1, from: 0, to: 0.2 },
      { channel: "elbow.right flexion", sense: -1, from: 0.1, to: 0.2 },
    ],
  };
  assert.deepEqual(mirrored(right), {
    name: "a left straight", hand: "left",
    chamber: { seconds: 0.2, pose: { "thoracic rotation right": 0.1, "thoracic flexion": 0.2, "shoulder.left flexion": 1.5 } },
    pushes: [
      { channel: "thoracic rotation right", sense: 1, from: 0, to: 0.1 },
      { channel: "thoracic lateral flexion right", sense: -1, from: 0, to: 0.1, level: 0.5 },
      { channel: "lumbar flexion", sense: 1, from: 0.05, to: 0.1 },
      { channel: "shoulder.left flexion", sense: 1, from: 0, to: 0.2 },
      { channel: "elbow.left flexion", sense: -1, from: 0.1, to: 0.2 },
    ],
  });
  for (const recipe of REPERTOIRE) assert.deepEqual(mirrored(mirrored(recipe.strike)), recipe.strike, recipe.strike.name);
});

test("a_hand_throws_the_recipe_for_what_it_holds_whose_window_holds_its_targets_height", () => {
  const warrior = humanSpec("workshop-fighter"), rogue = humanSpec("workshop-rogue");
  const rogueClub = armed(rogue, "right", woodenClub());
  assert.equal(heldIn(rogueClub, "right"), "wooden club");
  assert.equal(heldIn(rogueClub, "left"), FIST);
  /** A recipe of `model`'s with `held` in the right hand: its target `up` m over the head, its window's height about that. */
  const made = (model, held, band, up, net, height = [-0.1, 0.1]) => ({
    model, held, band, strike: { name: `a right ${band} blow`, hand: "right", pushes: [{ channel: "thoracic rotation right", sense: -1, from: 0, to: 0.1 }] },
    place: { ahead: 0.5, up }, found: "a fixture", window: { along: [-0.02, 0.08], across: [-0.14, 0.01], up: height }, net,
  });
  const theirs = made("workshop-rogue", FIST, "high", 0, -0.02), high = made("workshop-fighter", FIST, "high", 0, -0.03), middle = made("workshop-fighter", FIST, "middle", -0.24, 0.2);
  const club = made("workshop-fighter", "wooden club", "high", 0, 0.98);
  const known = [theirs, high, middle, club];
  const as = (recipe, hand) => hand === recipe.strike.hand
    ? { recipe, strike: recipe.strike, window: recipe.window }
    : { recipe, strike: mirrored(recipe.strike), window: mirroredWindow(recipe.window) };

  // By the target's height over the head: a head-high one the high recipe, a chest-high one the
  // middle, and one between the two windows, or over the higher, none.
  for (const up of [-0.09, 0, 0.09]) assert.deepEqual(recipeFor(known, warrior, "right", up), as(high, "right"), `${up} m`);
  for (const up of [-0.33, -0.24, -0.15]) assert.deepEqual(recipeFor(known, warrior, "right", up), as(middle, "right"), `${up} m`);
  for (const up of [-0.12, 0.11, -0.35]) assert.equal(recipeFor(known, warrior, "right", up), null, `${up} m`);
  // The other hand's is turned over, across the heading and not along it or up.
  assert.deepEqual(mirroredWindow({ along: [-0.02, 0.08], across: [-0.14, 0.01], up: [-0.3, 0.06] }), { along: [-0.02, 0.08], across: [-0.01, 0.14], up: [-0.3, 0.06] });
  assert.deepEqual(recipeFor(known, warrior, "left", -0.2), as(middle, "left"));
  assert.deepEqual(recipeFor(known, warrior, "left", -0.2).window, { along: [-0.02, 0.08], across: [-0.01, 0.14], up: [-0.1, 0.1] });

  // A body's own and no other's: wherever it is in the table, and though another body's window holds the height.
  assert.deepEqual(recipeFor(known, rogue, "right", 0), as(theirs, "right"));
  assert.deepEqual(recipeFor(known, rogue, "left", 0.05), as(theirs, "left"));
  const wide = made("workshop-rogue", FIST, "high", 0, -0.02, [-0.3, 0.06]);
  for (const table of [[middle, wide], [wide, middle]]) assert.deepEqual(recipeFor(table, rogue, "right", -0.22), as(wide, "right"));
  assert.equal(recipeFor(known, rogue, "right", -0.24), null);
  assert.equal(recipeFor(known, rogueClub, "right", 0), null);
  assert.deepEqual(recipeFor(known, rogueClub, "left", 0), as(theirs, "left"));
  // Of two of its own whose windows both hold it, the one whose place is nearer in height, the first of equals.
  const upper = made("workshop-fighter", FIST, "high", 0, -0.03, [-0.3, 0.1]), lower = made("workshop-fighter", FIST, "middle", -0.24, 0.2, [-0.1, 0.3]);
  assert.deepEqual(recipeFor([upper, lower], warrior, "right", -0.1), as(upper, "right"));
  assert.deepEqual(recipeFor([upper, lower], warrior, "right", -0.15), as(lower, "right"));
  assert.deepEqual(recipeFor([lower, upper], warrior, "right", -0.1), as(upper, "right"));
  assert.deepEqual(recipeFor([upper, lower], warrior, "right", -0.12), as(upper, "right"));
  assert.deepEqual(recipeFor([lower, upper], warrior, "right", -0.12), as(lower, "right"));

  // Every recipe a hand may throw, in the table's order; and what they net by band.
  assert.deepEqual(recipesFor(known, warrior, "right"), [as(high, "right"), as(middle, "right")]);
  assert.deepEqual(recipesFor(known, rogue, "left"), [as(theirs, "left")]);
  assert.deepEqual(recipesFor(known, armed(warrior, "right", woodenClub()), "right"), [as(club, "right")]);
  assert.deepEqual(netsOf(recipesFor(known, warrior, "right")), { high: -0.03, middle: 0.2 });
  assert.deepEqual(netsOf(recipesFor(known, rogue, "right")), { high: -0.02, middle: null });
  assert.deepEqual(netsOf(recipesFor(known, rogueClub, "right")), { high: null, middle: null });
  assert.deepEqual(netsOf([]), { high: null, middle: null });
});

test("every_recipe_of_the_repertoire_is_whole", () => {
  assert.ok(CLUB, "the Warrior has a club blow at a head");
  const cells = REPERTOIRE.map(({ model, held, band }) => `${model}/${held}/${band}`);
  assert.equal(new Set(cells).size, cells.length, "one recipe a cell");
  for (const { model, held, band, strike, place, found, window, net } of REPERTOIRE) {
    const cell = `${model}, ${held}, ${band}`;
    assert.ok(BAND_NAMES.includes(band) && strike.hand === "right" && strike.pushes.length > 0, cell);
    // Its target stood at its band's part's height on its own body, ahead of it.
    assert.ok(place.ahead > 0 && Math.abs(place.up - bandRise(heldSpec(model, held), band)) < 1e-3, `${cell}: ${JSON.stringify(place)}`);
    for (const way of ["along", "across", "up"]) assert.ok(window[way][0] <= 0 && 0 <= window[way][1], `${cell}: ${way} is ${JSON.stringify(window[way])}`);
    // The feet can be set to it: each is placed within `PLACING.near`, and the blow is thrown once the target stands in the window.
    for (const way of ["along", "across"]) assert.ok(window[way][1] - window[way][0] > 2 * PLACING.near - 1e-9, `${cell}: ${way} is ${JSON.stringify(window[way])}`);
    assert.ok(Number.isFinite(net), `${cell}: it nets ${net}`);
    assert.ok(found.includes(CORE_BLOW_HARNESS), `${cell}: found by ${found}`);
  }
  assert.deepEqual(BANDS, { high: "head", middle: "upperTrunk" });
});

test("the_repertoires_club_blow_reads_at_its_place_what_its_record_says", async () => {
  // As written, on a 20 m ground at the game's rate: the first of the eight its net is the mean of.
  const { readings, net } = CLUB, read = readings.at120;
  const blow = await evaluateBlow({ model: CLUB.model, held: CLUB.held, band: CLUB.band, strike: CLUB.strike, ahead: CLUB.place.ahead, hz: 120, ground: 20 });
  assert.deepEqual({ fell: blow.fell, stood: blow.stood, cost: blow.cost }, { fell: false, stood: true, cost: 0 });
  assert.equal(+(blow.done - blow.cost).toFixed(3), read.runs[0]);
  assert.equal(read.runs.length, 8);
  assert.ok(Math.abs(net - read.runs.reduce((sum, run) => sum + run, 0) / 8) < 1e-3 && net === read.net, `it nets ${net} of ${read.runs}`);
  assert.ok(net > 0.5, `${net} HP`);
});

test("the_repertoires_club_blow_follows_a_head_that_moved_across_under_it", async () => {
  // The Warrior's club at a head, the target 12 cm to the left once the blow is committed: on the
  // stand, as written, it does 0.09 HP unturned and 0.93 turned (`docs/reference/blows.md#steered`).
  const thrown = (steer) => evaluateBlow({ model: CLUB.model, held: CLUB.held, band: CLUB.band, strike: CLUB.strike, ahead: CLUB.place.ahead,
    off: { across: -0.12 }, seen: true, steer });
  const [turned, unturned] = [await thrown(STEER), await thrown(0)], at = CLUB.readings.at120.runs[0];
  assert.deepEqual({ fell: turned.fell, stood: turned.stood }, { fell: false, stood: true });
  assert.ok(turned.done > 0.7 * at && unturned.done < 0.2 * at, `turned ${turned.done}, unturned ${unturned.done}, at its place ${at}`);
});

test("an_attack_walks_to_its_place_sets_the_feet_stands_asks_the_window_and_is_thrown", () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const skill = strikeSkill(spec, CLUBS);
  const { strike, recipe, window } = recipeFor(CLUBS, spec, "right", 0);
  // Standing as built: the feet 0.4 m apart, the head over their middle; heading 0 faces +z.
  const stance = { phase: "stand", centre: new Vector3(0, 0.9, 0), soles: { left: new Vector3(-0.2, 0, 0), right: new Vector3(0.2, 0, 0) } };
  const head = new Vector3(0, 1.6, 0), view = { head, stance };
  const moveBy = (x, z) => { for (const v of [head, stance.centre, stance.soles.left, stance.soles.right]) { v.x += x; v.z += z; } };
  const target = [0.1, 1.6, 3];
  const attack = { left: GUARD_ACTION, right: { kind: "attack", target } };
  // Where the feet stand for the target to be at the window's middle: square, as built.
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  const mx = target[0] - middle[1], mz = target[2] - recipe.place.ahead - middle[0];
  const footing = { left: [mx - 0.2, mz], right: [mx + 0.2, mz] };
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-12;

  const far = skill.command(view, attack, 0, false, DT);
  assert.equal(skill.report.phase, "approach");
  assert.equal(far.footing, null);
  assert.ok(far.walk[0] > 0 && far.walk[1] > 0 && Math.abs(Math.hypot(...far.walk) - APPROACH.pace) < 1e-12, JSON.stringify(far.walk));
  const r = Math.hypot(0.1, 3);
  assert.equal(far.face, Math.atan2(0.1, 3) - Math.asin(middle[1] / r));
  assert.deepEqual(plain(far.posture), plain(GUARD));

  // Given up while walking, it is dropped.
  assert.equal(skill.command(view, { left: GUARD_ACTION, right: GUARD_ACTION }, 0, false, DT), null);
  assert.equal(skill.report.hand, null);

  // Within reach of its place, it asks for the feet there, and does not walk.
  moveBy(mx, mz - APPROACH.reach / 2);
  const placing = skill.command(view, attack, 0, false, DT);
  assert.equal(skill.report.phase, "place");
  assert.equal(placing.walk, null);
  assert.ok(near(placing.footing.left, footing.left) && near(placing.footing.right, footing.right), JSON.stringify(placing.footing));
  // Placed, it stands; then asks the window, and out of it (the feet set well short), sets them again.
  skill.command(view, attack, 0, true, DT);
  assert.equal(skill.report.phase, "settle");
  let command, steps = 0;
  while (skill.report.phase === "settle" && steps < 10 * 120) { command = skill.command(view, attack, 0, false, DT); steps += 1; }
  assert.equal(skill.report.phase, "place");
  assert.ok(Math.abs(steps * DT - STAND) <= 2 * DT, `asked the window after ${steps} steps`);

  // The feet at their place: it stands out its time, chambers, pushes and is counted.
  moveBy(0, APPROACH.reach / 2);
  const phases = [];
  steps = 0;
  while (skill.report.thrown.right === 0 && steps < 10 * 120) {
    command = skill.command(view, attack, 0, false, DT);
    steps += 1;
    assert.equal(command.walk, null);
    if (phases.at(-1) !== skill.report.phase) phases.push(skill.report.phase);
    if (skill.report.phase === "chamber") assert.deepEqual(plain(command.posture), plain({ ...GUARD, ...strike.chamber.pose }));
  }
  assert.deepEqual(phases, ["settle", "chamber", "swing", null]);
  assert.deepEqual({ ...skill.report.thrown }, { left: 0, right: 1 });
  const end = Math.max(...strike.pushes.map((p) => p.to));
  assert.ok(Math.abs(steps * DT - (STAND + strike.chamber.seconds + end)) <= 2 * DT, `thrown after ${steps} steps`);
  assert.equal(skill.report.still, 0);
});

test("a_recipe_whose_window_holds_its_target_where_the_body_stands_is_thrown_from_there", () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const { strike, recipe, window } = recipeFor(CLUBS, spec, "right", 0);
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  const target = [middle[1], 1.6, recipe.place.ahead + middle[0]];
  const attack = { left: GUARD_ACTION, right: { kind: "attack", target } };
  // From each edge of the window along, inside it and past it, and from across it: the feet not where they would be set.
  const from = (along, across) => {
    const skill = strikeSkill(spec, CLUBS), { view, moveBy } = standing();
    moveBy(across, along);
    const first = skill.command(view, attack, 0, false, DT), phases = [skill.report.phase];
    let steps = 0;
    while (skill.report.thrown.right === 0 && skill.report.phase !== "place" && steps < 10 * 120) {
      const command = skill.command(view, attack, 0, false, DT);
      steps += 1;
      if (phases.at(-1) !== skill.report.phase) phases.push(skill.report.phase);
      assert.equal(command.walk, null);
    }
    return { footing: first.footing !== null, walk: first.walk !== null, phases, thrown: skill.report.thrown.right };
  };
  const inside = 0.01, beyond = 0.01, margin = Math.max(PLACING.near, 0.03);
  // Moved toward the target by its middle less the window's near edge (and less a little), the target sits just inside it.
  for (const along of [middle[0] - window.along[0] - inside, -(window.along[1] - middle[0] - inside), margin]) {
    assert.deepEqual(from(along, 0), { footing: false, walk: false, phases: ["settle", "chamber", "swing", null], thrown: 1 }, `${along} m along`);
  }
  // Past its edge either way, it sets the feet.
  for (const along of [middle[0] - window.along[0] + beyond, -(window.along[1] - middle[0] + beyond)]) {
    assert.deepEqual(from(along, 0), { footing: true, walk: false, phases: ["place"], thrown: 0 }, `${along} m along`);
  }
  // Across: the target at its window's edge across stands; past it, the feet are set.
  assert.deepEqual(from(0, middle[1] - window.across[0] - inside).thrown, 1);
  assert.deepEqual(from(0, middle[1] - window.across[0] + beyond).phases, ["place"]);
  assert.ok(strike.chamber);
});

/**
 * A view built by hand: the body standing as built at the origin, heading 0 (facing +z), its head
 * `height` up; the root's frame turned a quarter about the upright and set off, so a place in it
 * is not the world's.
 */
function standing(height = 1.6) {
  const stance = { phase: "stand", centre: new Vector3(0, 0.9, 0), soles: { left: new Vector3(-0.2, 0, 0), right: new Vector3(0.2, 0, 0) } };
  const head = new Vector3(0, height, 0);
  const root = { position: new Vector3(0.3, 1, -0.2), rotation: Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI / 2) };
  const view = { head, stance, root };
  const moveBy = (x, z) => { for (const v of [head, stance.centre, stance.soles.left, stance.soles.right, root.position]) { v.x += x; v.z += z; } };
  return { view, moveBy };
}

/** The spec's own reading of `hand`'s arm: its length laid straight to `point`, and its shoulder from the head's centre of mass. */
function armOf(spec, hand, point) {
  const centre = (name) => spec.joints.find((joint) => joint.name === `${name}.${hand}`).centre.value;
  const segment = (name) => spec.segments.find((s) => s.name === name);
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const end = rigidPoints(spec, segment(`hand.${hand}`)).get(point).value, head = segment("head").centreOfMass.value;
  return {
    length: apart(centre("shoulder"), centre("elbow")) + apart(centre("elbow"), centre("wrist")) + apart(centre("wrist"), end),
    shoulder: centre("shoulder").map((c, k) => c - head[k]),
    toes: Math.max(segment("foot.left").distal.value[2], segment("foot.right").distal.value[2]) - head[2],
  };
}

test("a_target_in_a_recipes_window_is_thrown_at_with_it_and_one_out_of_its_height_is_placed", () => {
  const spec = humanSpec("workshop-fighter");
  const { recipe, window } = recipeFor(STRAIGHTS, spec, "right", 0);
  const attack = (target) => ({ left: GUARD_ACTION, right: { kind: "attack", target } });
  const taken = (up) => {
    const skill = strikeSkill(spec, STRAIGHTS), { view } = standing();
    skill.command(view, attack([0, 1.6 + up, 3]), 0, false, DT);
    return { blow: skill.report.blow, chosen: skill.report.chosen?.recipe ?? null, distance: skill.report.distance };
  };
  // Either side of both ends of the height's window, a micrometre off: the window is not even about its place.
  assert.notEqual(-window.up[0], window.up[1]);
  for (const up of [window.up[0] + 1e-6, 0, window.up[1] - 1e-6]) assert.deepEqual(taken(up), { blow: "recipe", chosen: recipe, distance: recipe.place.ahead }, `${up} m over the head`);
  const arm = armOf(spec, "right", "knuckles");
  for (const up of [window.up[0] - 1e-6, window.up[1] + 1e-6, -0.4, -0.6]) {
    const { blow, chosen, distance } = taken(up);
    assert.deepEqual({ blow, chosen }, { blow: "placed", chosen: null }, `${up} m over the head`);
    // It stands for the target to be `stretch` of the arm from the shoulder, straight ahead of the head.
    assert.ok(distance > arm.toes, `${up} m over the head, the fixture stands at its toes`);
    const from = Math.hypot(0 - arm.shoulder[0], up - arm.shoulder[1], distance - arm.shoulder[2]);
    assert.ok(Math.abs(from - PLACED.stretch * arm.length) < 1e-9, `${up} m over the head, the target stands ${from} m from the shoulder, of an arm ${arm.length} m`);
  }
  // Too low or too high for the arm's stretch from any standing place: stood for no nearer than the toes.
  for (const up of [-1.5, 0.8]) assert.deepEqual(taken(up), { blow: "placed", chosen: null, distance: arm.toes }, `${up} m over the head`);
  assert.ok(arm.toes > arm.shoulder[2], "the fixture's toes reach ahead of its shoulder: the floor is the toes'");

  // A placed blow, whole: the walk, the feet, the stand, the hand's goal each step, and the count.
  const skill = strikeSkill(spec, STRAIGHTS), { view, moveBy } = standing();
  const target = [0.1, 1.2, 3], hands = attack(target);
  const far = skill.command(view, hands, 0, false, DT);
  assert.equal(skill.report.phase, "approach");
  assert.ok(far.walk[0] > 0 && Math.abs(Math.hypot(...far.walk) - APPROACH.pace) < 1e-12, JSON.stringify(far.walk));
  assert.deepEqual(plain(far.hands), { left: null, right: null });
  const { distance } = skill.report;
  // Its feet where the target is straight ahead of the head, its distance off: it stands at once.
  moveBy(target[0], target[2] - distance);
  const phases = [], goals = [];
  let steps = 0, command;
  while (skill.report.thrown.right === 0 && steps < 10 * 120) {
    command = skill.command(view, hands, 0, false, DT);
    steps += 1;
    if (phases.at(-1) !== skill.report.phase) phases.push(skill.report.phase);
    assert.deepEqual(plain(command.posture), plain(GUARD));
    assert.deepEqual(command.pushes, []);
    assert.equal(command.walk, null);
    assert.equal(command.hands.left, null);
    assert.equal(skill.report.phase === "swing", command.hands.right !== null, `step ${steps}, ${skill.report.phase}`);
    if (command.hands.right) goals.push(command.hands.right);
  }
  assert.deepEqual(phases, ["settle", "swing", null]);
  assert.deepEqual({ ...skill.report.thrown }, { left: 0, right: 1 });
  assert.deepEqual(plain(command.hands), { left: null, right: null });
  assert.ok(Math.abs(steps * DT - (STAND + PLACED.seconds)) <= 2 * DT, `thrown after ${steps} steps`);
  assert.ok(Math.abs(goals.length * DT - PLACED.seconds) <= 2 * DT, `the hand had its goal ${goals.length} steps`);
  // The goal: the hand's own point, at the target in the root's frame, carried through, one path that follows.
  const { places: [place], ...rest } = goals[0];
  assert.deepEqual(rest, { seconds: PLACED.seconds, through: PLACED.through, follows: true });
  assert.equal(goals[0].places.length, 1);
  assert.equal(place.point, "knuckles");
  const back = new Vector3(...place.position).applyRotationQuaternion(view.root.rotation).add(view.root.position);
  assert.ok(Vector3.Distance(back, new Vector3(...target)) < 1e-12, `the place is ${back.asArray()} in the world`);
  assert.ok(Math.hypot(...place.position.map((c, k) => c - target[k])) > 0.5, "the fixture's root frame is not the world's");
  assert.deepEqual(plain(goals.at(-1)), plain(goals[0]));

  // What a placed blow takes is the skill's to be given: another time is another count of steps.
  const quick = strikeSkill(spec, STRAIGHTS, { ...PLACED, seconds: PLACED.seconds / 2 });
  for (steps = 0; quick.report.thrown.right === 0 && steps < 10 * 120; steps++) quick.command(view, hands, 0, false, DT);
  assert.ok(Math.abs(steps * DT - (STAND + PLACED.seconds / 2)) <= 2 * DT, `thrown after ${steps} steps`);

  // With the club the point is the swell's, and the arm reaches the club's length farther.
  const clubbed = armed(spec, "right", woodenClub()), held = strikeSkill(clubbed, CLUBS);
  const high = [0, 1.6 + recipeFor(CLUBS, clubbed, "right", 0).window.up[1] + 0.1, 3];
  held.command(view, attack(high), 0, false, DT);
  assert.deepEqual({ blow: held.report.blow, phase: held.report.phase }, { blow: "placed", phase: "approach" });
  assert.ok(armOf(clubbed, "right", "swell").length > arm.length + 0.4);
  moveBy(high[0] - view.head.x, high[2] - held.report.distance - view.head.z);
  for (steps = 0; held.report.phase !== "swing" && steps < 10 * 120; steps++) command = held.command(view, attack(high), 0, false, DT);
  assert.equal(command.hands.right.places[0].point, "swell");
});

test("a_blow_is_chosen_again_by_the_head_as_it_stands", () => {
  const spec = humanSpec("workshop-fighter"), skill = strikeSkill(spec, STRAIGHTS);
  const { recipe, window } = recipeFor(STRAIGHTS, spec, "right", 0);
  const { view, moveBy } = standing();
  const target = [0, 1.6, 3], hands = { left: GUARD_ACTION, right: { kind: "attack", target } };
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  moveBy(target[0] - middle[1], target[2] - recipe.place.ahead - middle[0]);
  skill.command(view, hands, 0, false, DT);
  assert.deepEqual({ blow: skill.report.blow, phase: skill.report.phase }, { blow: "recipe", phase: "settle" });
  // Standing, the head sinks under the recipe's height: asked again after the stand, the blow is placed, and walked to.
  view.head.y -= window.up[1] + 0.05;
  let steps = 0;
  while (skill.report.phase === "settle" && steps < 10 * 120) { skill.command(view, hands, 0, false, DT); steps += 1; }
  assert.ok(Math.abs(steps * DT - STAND) <= 2 * DT, `chosen again after ${steps} steps`);
  assert.deepEqual({ blow: skill.report.blow, chosen: skill.report.chosen, still: skill.report.still }, { blow: "placed", chosen: null, still: 0 });
  assert.notEqual(skill.report.distance, recipe.place.ahead);
  assert.deepEqual({ ...skill.report.thrown }, { left: 0, right: 0 });
  const next = skill.command(view, hands, 0, false, DT);
  assert.ok(["approach", "place"].includes(skill.report.phase), skill.report.phase);
  assert.deepEqual(plain(next.hands), { left: null, right: null });
});

test("a_blow_chosen_standing_is_the_one_thrown_at_that_point", () => {
  const spec = humanSpec("workshop-fighter"), skill = strikeSkill(spec, STRAIGHTS);
  const { recipe, window } = recipeFor(STRAIGHTS, spec, "right", 0);
  const { view, moveBy } = standing();
  const target = [0, 1.6, 3], attack = (at) => ({ left: GUARD_ACTION, right: { kind: "attack", target: at } });
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  moveBy(target[0] - middle[1], target[2] - recipe.place.ahead - middle[0]);
  skill.command(view, attack(target), 0, false, DT);
  // Standing, the head is over the recipe's height: the blow is placed.
  view.head.y += 0.05 - window.up[0];
  let steps = 0;
  while (skill.report.phase === "settle" && steps < 10 * 120) { skill.command(view, attack(target), 0, false, DT); steps += 1; }
  assert.equal(skill.report.blow, "placed");
  // Stood where the placed blow is thrown from, with the head back in the recipe's height: the
  // blow chosen standing for that point is thrown, and no other is stood for.
  view.head.y = 1.6;
  moveBy(target[0] - view.head.x, target[2] - skill.report.distance - view.head.z);
  for (steps = 0; skill.report.phase !== "swing" && steps < 10 * 120; steps++) skill.command(view, attack(target), 0, false, DT);
  assert.deepEqual({ phase: skill.report.phase, blow: skill.report.blow, chosen: skill.report.chosen }, { phase: "swing", blow: "placed", chosen: null });

  // Another point attacked is chosen for standing in its turn: with the recipe, at that height.
  const other = strikeSkill(spec, STRAIGHTS), stood = standing(), moved = [0, 1.6, 3.5];
  stood.moveBy(target[0] - middle[1], target[2] - recipe.place.ahead - middle[0]);
  other.command(stood.view, attack(target), 0, false, DT);
  stood.view.head.y += 0.05 - window.up[0];
  for (steps = 0; other.report.phase === "settle" && steps < 10 * 120; steps++) other.command(stood.view, attack(target), 0, false, DT);
  assert.equal(other.report.blow, "placed");
  stood.view.head.y = 1.6;
  stood.moveBy(moved[0] - stood.view.head.x, moved[2] - other.report.distance - stood.view.head.z);
  for (steps = 0; other.report.blow === "placed" && other.report.phase !== "swing" && steps < 10 * 120; steps++) other.command(stood.view, attack(moved), 0, false, DT);
  assert.deepEqual({ blow: other.report.blow, band: other.report.chosen?.recipe.band }, { blow: "recipe", band: recipe.band });

  // And so is the same point attacked anew: given up and taken up with the head over the
  // recipe's height, the blow is placed, and chosen again by the head as it stands.
  assert.equal(skill.command(view, { left: GUARD_ACTION, right: GUARD_ACTION }, 0, false, DT), null);
  view.head.y += 0.05 - window.up[0];
  skill.command(view, attack(target), 0, false, DT);
  assert.deepEqual({ blow: skill.report.blow, phase: skill.report.phase }, { blow: "placed", phase: "settle" });
  view.head.y = 1.6;
  for (steps = 0; skill.report.blow === "placed" && skill.report.phase !== "swing" && steps < 10 * 120; steps++) skill.command(view, attack(target), 0, false, DT);
  assert.deepEqual({ blow: skill.report.blow, band: skill.report.chosen?.recipe.band }, { blow: "recipe", band: recipe.band });
});

test("a_recipe_thrown_turns_the_heading_after_its_target_from_where_the_feet_stood_as_it_was_committed", () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const { strike, recipe, window } = recipeFor(CLUBS, spec, "right", 0);
  const { view, moveBy } = standing();
  const target = [0.3, 1.6, 3], attack = (at) => ({ left: GUARD_ACTION, right: { kind: "attack", target: at } });
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  moveBy(target[0] - middle[1], target[2] - recipe.place.ahead - middle[0]);
  const skill = strikeSkill(spec, CLUBS), still = strikeSkill(spec, CLUBS, PLACED, 0);
  const [ox, oz] = [(view.stance.soles.left.x + view.stance.soles.right.x) / 2, (view.stance.soles.left.z + view.stance.soles.right.z) / 2];
  const bearing = (at) => Math.atan2(at[0] - ox, at[2] - oz);
  // Standing for the blow, nothing is turned; committed, the target where it was, nor is it.
  let command, steps = 0;
  while (skill.report.phase !== "chamber" && steps < 10 * 120) {
    command = skill.command(view, attack(target), 0, false, DT);
    still.command(view, attack(target), 0, false, DT);
    steps += 1;
    assert.equal(command.steer, 0, skill.report.phase);
  }
  assert.equal(skill.report.phase, "chamber");
  // The feet sway under it: the bearing is read from where they stood.
  moveBy(0.05, -0.03);
  for (const [x, z, phase] of [[0.08, 3, "chamber"], [-0.1, 2.9, "chamber"], [5, 3, "chamber"], [-5, 3, "chamber"]]) {
    const at = [x, 1.6, z], asked = bearing(at) - bearing(target);
    command = skill.command(view, attack(at), 0, false, DT);
    assert.equal(skill.report.phase, phase);
    assert.ok(Math.abs(command.steer - Math.max(-STEER, Math.min(STEER, asked))) < 1e-9, `${x}, ${z}: ${command.steer} for ${asked}`);
    assert.equal(still.command(view, attack(at), 0, false, DT).steer, 0);
  }
  // Right of where it was, the heading turns right (a heading grows to the right).
  assert.ok(skill.command(view, attack([0.4, 1.6, 3]), 0, false, DT).steer > 0);
  // Given up, the recipe is thrown to its end with the turn it had; then nothing is turned.
  const had = skill.command(view, attack([0.2, 1.6, 3]), 0, false, DT).steer, guard = { left: GUARD_ACTION, right: GUARD_ACTION };
  assert.ok(had < 0);
  for (steps = 0; skill.report.thrown.right === 0 && steps < 10 * 120; steps++) {
    assert.equal(skill.command(view, guard, 0, false, DT).steer, had);
  }
  assert.ok(steps > 0 && steps * DT <= strike.chamber.seconds + Math.max(...strike.pushes.map((p) => p.to)), `${steps} steps`);
  assert.equal(skill.command(view, guard, 0, false, DT), null);
  assert.equal(skill.command(view, attack(target), 0, false, DT).steer, 0);
});

test("a_placed_blow_is_over_when_the_body_is_resumed", () => {
  const spec = humanSpec("workshop-fighter");
  const target = [0, 1.2, 3], hands = { left: GUARD_ACTION, right: { kind: "attack", target } };
  /** A skill with its placed blow under way, a third of the way through. */
  const swinging = () => {
    const skill = strikeSkill(spec, STRAIGHTS), { view, moveBy } = standing();
    skill.command(view, hands, 0, false, DT);
    moveBy(0, target[2] - skill.report.distance);
    let command, steps = 0;
    while (skill.report.since < PLACED.seconds / 3 && steps < 10 * 120) { command = skill.command(view, hands, 0, false, DT); steps += 1; }
    assert.deepEqual({ phase: skill.report.phase, blow: skill.report.blow, goal: command.hands.right !== null }, { phase: "swing", blow: "placed", goal: true });
    return { skill, view };
  };
  const over = (skill) => ({ hand: skill.report.hand, phase: skill.report.phase, blow: skill.report.blow, distance: skill.report.distance,
    thrown: { ...skill.report.thrown }, still: skill.report.still });
  const none = { hand: null, phase: null, blow: null, distance: null, thrown: { left: 0, right: 0 }, still: 0 };

  const resumed = swinging();
  resumed.skill.resume();
  assert.deepEqual(over(resumed.skill), none);
  // Asked again, it stands anew before it throws: no goal for the hand until then.
  const again = resumed.skill.command(resumed.view, hands, 0, false, DT);
  assert.equal(resumed.skill.report.phase, "settle");
  assert.deepEqual(plain(again.hands), { left: null, right: null });

  // Its attack given up, a placed blow is over too, unthrown: nothing carries it on.
  const given = swinging();
  assert.equal(given.skill.command(given.view, { left: GUARD_ACTION, right: GUARD_ACTION }, 0, false, DT), null);
  assert.deepEqual(over(given.skill), none);
});
