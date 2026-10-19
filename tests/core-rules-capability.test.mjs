/**
 * **The recorded club blow thrown live**: the blow that sets the unit, thrown on the core stand at a
 * target body (Node, core world, Rapier, 960 Hz): it lands on the head, the club takes none of it, its
 * energy is its parts', the head is priced by it, and the thrower stands after it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";

const RULES = rulebook("arena");
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);

test("the recorded club blow thrown live lands on the head and is priced by its measured energy", async () => {
  // The whole path: that blow on the core stand at a target body, its contact, the masses it meets, its energy, its price.
  const { evaluateBlow } = await import("../research/core-blow.mjs");
  const { hardestOn } = await import("../src/lab/targets.ts");
  const { readFile } = await import("node:fs/promises");
  const blow = JSON.parse(await readFile(new URL("../research/core-club-unit.json", import.meta.url), "utf8"));
  const result = await evaluateBlow({ model: blow.model, held: "wooden club", hand: blow.hand, band: "high", strike: blow.strike, ahead: blow.distance, hz: 960 });
  const landed = hardestOn(result.blows, "dummy");
  assert.ok(landed, "the blow lands");
  const [club, head] = landed.sides;
  assert.deepEqual([club.fighter, club.item, club.share, head.fighter, head.segment, head.share], ["attacker", "wooden club", 0, "dummy", "head", 1]);
  close(landed.energy, impactEnergy(club.kg, head.kg, landed.closing), "its energy is its parts'");
  close(head.damage, blowDamage(RULES, "blunt", landed.energy), "the head takes the whole of it");
  assert.deepEqual({ fell: result.fell, stood: result.stood, cost: result.cost }, { fell: false, stood: true, cost: 0 });
  // The current controller is priced by its own contact.
  const kg = humanSpec(blow.model).segments.find((segment) => segment.name === "head").mass.value;
  // The head is met, with the body behind it as far as its free neck couples them: about its own
  // mass, less as the blow's line passes off its centre, more as it runs down its neck.
  assert.ok(head.kg > 0.5 * kg && head.kg < 2 * kg, `${head.kg} kg of a head of ${kg}`);
  close(result.done, result.blows.reduce((sum, blow) => sum + blow.sides.filter(side => side.fighter === "dummy").reduce((total, side) => total + side.damage, 0), 0), "all contacts contribute their damage");
});
