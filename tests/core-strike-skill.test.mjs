/**
 * **The strike skill and its repertoire** (`src/core/skills/strike.ts`, `strikes.ts`), on views
 * built by hand: the left hand's strike is the right's with the arms' channels swapped and the
 * trunk's sided turns reversed; a hand throws the recipe for what it holds, its body's own or
 * another's; the club blow in the repertoire is the damage unit's; and an attack walks into range,
 * stands `STAND` s, chambers, pushes and is counted. That a blow thrown through the skill reads as
 * the old driver's did, to the digit, is `tests/core-lab-blow.test.mjs`'s.
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
import { RANGE, STAND, strikeSkill } from "../src/core/skills/strike.ts";
import { FIST, heldIn, mirrored, recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";

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
  assert.deepEqual(recipeFor(REPERTOIRE, warrior, "right"), { recipe: own(warrior, FIST), strike: own(warrior, FIST).strike, borrowed: false });
  assert.deepEqual(recipeFor(REPERTOIRE, rogue, "left"), { recipe: own(rogue, FIST), strike: mirrored(own(rogue, FIST).strike), borrowed: false });
  // The Rogue has no club blow of its own and throws the Warrior's.
  const club = own(warrior, "wooden club");
  assert.deepEqual(recipeFor(REPERTOIRE, rogueClub, "right"), { recipe: club, strike: club.strike, borrowed: true });
  assert.deepEqual(recipeFor(REPERTOIRE, rogueClub, "left"), { recipe: own(rogue, FIST), strike: mirrored(own(rogue, FIST).strike), borrowed: false });
  assert.equal(recipeFor(REPERTOIRE.filter((r) => r.held === FIST), rogueClub, "right"), null);
});

test("the_repertoires_club_blow_is_the_damage_units", async () => {
  const unit = JSON.parse(await readFile(new URL("../research/core-club-unit.json", import.meta.url), "utf8"));
  const clubs = REPERTOIRE.filter((r) => r.held === "wooden club");
  assert.equal(clubs.length, 1);
  assert.deepEqual(plain(clubs[0]), plain({
    model: unit.model, held: "wooden club", strike: unit.strike, distance: unit.distance, found: unit.found, readings: unit.readings,
  }));
});

test("an_attack_walks_into_range_stands_chambers_pushes_and_is_counted", () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const skill = strikeSkill(spec, REPERTOIRE);
  const { strike, recipe } = recipeFor(REPERTOIRE, spec, "right");
  const head = new Vector3(0, 1.6, 0), view = { head };
  // Heading 0 faces +z: the target 0.5 m beyond the recipe's distance, a little to the right.
  const target = [0.1, 1.6, recipe.distance + 0.5];
  const attack = { left: GUARD_ACTION, right: { kind: "attack", target } };

  const far = skill.command(view, attack, 0, DT);
  assert.equal(skill.report.phase, "approach");
  assert.ok(far.walk[0] > 0 && far.walk[1] > 0 && Math.hypot(...far.walk) <= 0.3 + 1e-12, JSON.stringify(far.walk));
  assert.equal(far.face, Math.atan2(0.1, recipe.distance + 0.5));
  assert.deepEqual(plain(far.posture), plain(GUARD));

  // Given up while walking, it is dropped.
  assert.equal(skill.command(view, { left: GUARD_ACTION, right: GUARD_ACTION }, 0, DT), null);
  assert.equal(skill.report.hand, null);

  // Arrived: inside the range it stands, not walking.
  head.set(0.1 - RANGE.across / 2, 1.6, 0.5 + RANGE.along / 2);
  const phases = [];
  let command, steps = 0;
  while (skill.report.thrown.right === 0 && steps < 10 * 120) {
    command = skill.command(view, attack, 0, DT);
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
