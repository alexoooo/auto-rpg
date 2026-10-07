/**
 * Who takes a blow, and what each part holds, read from the specs: no world is built.
 *
 *   node research/blow-shares.mjs
 *
 * It prints the tables of `docs/reference/wounds.md`:
 * - each row's stiffness under a blunt load (`CONTACT_STIFFNESS`), N/mm, and the sources its
 *   provenance names;
 * - the share each of two surfaces takes where they meet (`energyShares`);
 * - the same with one surface half and twice as stiff as it is;
 * - the energy that empties each part of each body, at the rulebook's unit: the part's hit points
 *   (`partHitPoints`) times the unit, which is what a blow must bring to that surface, its share.
 */
import { CONTACT_STIFFNESS } from "../src/core/human/tables/contact-stiffness.ts";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { partHitPoints } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { energyShares } from "../src/core/rules/share.ts";
import { si } from "../src/core/spec/quantity.ts";

/** The sources a quantity's provenance names, each once. */
function sourcesOf(quantity, into = new Set()) {
  if ("source" in quantity.provenance) into.add(quantity.provenance.source);
  else for (const input of quantity.provenance.inputs) sourcesOf(input, into);
  return into;
}

/** Each row's stiffness, N/m; a held item with no stated surface is rigid. */
const K = { ...Object.fromEntries(Object.entries(CONTACT_STIFFNESS).map(([row, k]) => [row, si(k).value])), club: null };

console.log("| Row | N/mm | Sources |\n|---|---|---|");
for (const [row, k] of Object.entries(CONTACT_STIFFNESS)) console.log(`| ${row} | ${(si(k).value / 1000).toFixed(1)} | ${[...sourcesOf(k)].join(", ")} |`);

const MEETINGS = [
  ["hand", "head"], ["hand", "upperTrunk"], ["hand", "hand"], ["hand", "forearm"], ["hand", "thigh"], ["foot", "thigh"], ["foot", "shank"],
  ["head", "head"], ["head", "upperTrunk"], ["forearm", "upperTrunk"], ["forearm", "forearm"], ["club", "head"], ["club", "hand"], ["club", "club"],
];
console.log("\n| Meeting | First's share | Second's share |\n|---|---|---|");
for (const [first, second] of MEETINGS) console.log(`| ${first}, ${second} | ${energyShares([K[first], K[second]]).map((share) => share.toFixed(3)).join(" | ")} |`);

/** The share `row` takes of a blow with `other`, `row` being `times` as stiff as it is. */
const shareAt = (row, other, times) => energyShares([K[row] * times, K[other]])[0];
const VARIED = [
  ["hand", "head"], ["hand", "upperTrunk"], ["hand", "forearm"], ["foot", "thigh"], ["foot", "hand"],
  ["middleTrunk", "hand"], ["lowerTrunk", "hand"], ["upperArm", "hand"], ["forearm", "hand"], ["shank", "hand"], ["shank", "foot"],
];
console.log("\n| Surface varied | Met by | Its share at half its stiffness | As it is | At twice |\n|---|---|---|---|---|");
for (const [row, other] of VARIED) console.log(`| ${row} | ${other} | ${[0.5, 1, 2].map((times) => shareAt(row, other, times).toFixed(3)).join(" | ")} |`);

const unit = rulebook("arena").unit.value;
console.log(`\nJoules that empty a part, at ${unit} J a hit point:\n`);
console.log(`| Part | ${HUMANOID_MODELS.map((model) => `${model}: kg | HP | J`).join(" | ")} |\n|---|${HUMANOID_MODELS.map(() => "---|---|---|").join("")}`);
const specs = HUMANOID_MODELS.map(modelSpec), pools = specs.map(partHitPoints);
for (const row of Object.keys(CONTACT_STIFFNESS)) {
  const cells = specs.map((spec, at) => {
    const segment = spec.segments.find((one) => one.name === row || one.name === `${row}.right`);
    const hp = pools[at].get(segment.name).value;
    return `${segment.mass.value.toFixed(2)} | ${hp.toFixed(3)} | ${(hp * unit).toFixed(1)}`;
  });
  console.log(`| ${row} | ${cells.join(" | ")} |`);
}
