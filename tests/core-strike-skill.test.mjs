/**
 * **The strike skill and its repertoire** (`src/core/skills/strike.ts`, `strikes.ts`), on views
 * built by hand: the left hand's strike is the right's with the arms' channels swapped and the
 * trunk's sided turns reversed; a hand throws the recipe for what it holds, its body's own or
 * another's, with its window turned over for the other hand; the club blow in the repertoire is the
 * damage unit's; and an attack walks toward its place, sets the feet there, stands `STAND` s, asks
 * the window of the head as it stands, chambers, pushes and is counted. That a blow thrown through
 * the skill reads as its search read it, to the digit, is `tests/lab-blow.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD_ACTION } from "../src/core/mind/intent.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { APPROACH, STAND, strikeSkill } from "../src/core/skills/strike.ts";
import { FIST, heldIn, mirrored, mirroredWindow, recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";

const DT = 1 / 120;
const plain = (value) => JSON.parse(JSON.stringify(value));

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

test("a_hand_throws_the_recipe_for_what_it_holds_its_bodys_own_or_another_bodys", () => {
  const warrior = humanSpec("workshop-fighter"), rogue = humanSpec("workshop-rogue");
  const rogueClub = armed(rogue, "right", woodenClub());
  assert.equal(heldIn(rogueClub, "right"), "wooden club");
  assert.equal(heldIn(rogueClub, "left"), FIST);
  const own = (spec, held) => REPERTOIRE.find((r) => r.model === spec.model && r.held === held);
  const as = (recipe, hand) => hand === recipe.strike.hand
    ? { recipe, strike: recipe.strike, window: recipe.window }
    : { recipe, strike: mirrored(recipe.strike), window: mirroredWindow(recipe.window) };
  assert.deepEqual(recipeFor(REPERTOIRE, warrior, "right"), { ...as(own(warrior, FIST), "right"), borrowed: false });
  assert.deepEqual(recipeFor(REPERTOIRE, rogue, "left"), { ...as(own(rogue, FIST), "left"), borrowed: false });
  // The window is turned over across the heading, not along it.
  assert.deepEqual(mirroredWindow({ along: [-0.02, 0.08], across: [-0.14, 0.01] }), { along: [-0.02, 0.08], across: [-0.01, 0.14] });
  // The Rogue has no club blow of its own and throws the Warrior's.
  const club = own(warrior, "wooden club");
  assert.deepEqual(recipeFor(REPERTOIRE, rogueClub, "right"), { ...as(club, "right"), borrowed: true });
  assert.deepEqual(recipeFor(REPERTOIRE, rogueClub, "left"), { ...as(own(rogue, FIST), "left"), borrowed: false });
  assert.equal(recipeFor(REPERTOIRE.filter((r) => r.held === FIST), rogueClub, "right"), null);
});

test("the_repertoires_club_blow_is_the_damage_units", async () => {
  const unit = JSON.parse(await readFile(new URL("../research/core-club-unit.json", import.meta.url), "utf8"));
  const clubs = REPERTOIRE.filter((r) => r.held === "wooden club");
  assert.equal(clubs.length, 1);
  // Its window is measured after (`research/core-strike-window.mjs`), and holds its place.
  const { window, ...recipe } = clubs[0];
  assert.ok(window.along[0] <= 0 && 0 <= window.along[1] && window.across[0] <= 0 && 0 <= window.across[1], JSON.stringify(window));
  assert.deepEqual(plain(recipe), plain({
    model: unit.model, held: "wooden club", strike: unit.strike, distance: unit.distance, found: unit.found, readings: unit.readings,
  }));
});

test("an_attack_walks_to_its_place_sets_the_feet_stands_asks_the_window_and_is_thrown", () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const skill = strikeSkill(spec, REPERTOIRE);
  const { strike, recipe, window } = recipeFor(REPERTOIRE, spec, "right");
  // Standing as built: the feet 0.4 m apart, the head over their middle; heading 0 faces +z.
  const stance = { phase: "stand", centre: new Vector3(0, 0.9, 0), soles: { left: new Vector3(-0.2, 0, 0), right: new Vector3(0.2, 0, 0) } };
  const head = new Vector3(0, 1.6, 0), view = { head, stance };
  const moveBy = (x, z) => { for (const v of [head, stance.centre, stance.soles.left, stance.soles.right]) { v.x += x; v.z += z; } };
  const target = [0.1, 1.6, 3];
  const attack = { left: GUARD_ACTION, right: { kind: "attack", target } };
  // Where the feet stand for the target to be at the window's middle: square, as built.
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  const mx = target[0] - middle[1], mz = target[2] - recipe.distance - middle[0];
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
