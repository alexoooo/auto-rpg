/**
 * Who takes a blow, and what each part holds, read from the specs: no world is built.
 *
 *   node research/blow-shares.mjs
 *
 * It prints:
 * - each row's stiffness under a blunt load (`CONTACT_STIFFNESS`), N/mm, and the sources its
 *   provenance names (`docs/reference/wounds.md#stiffness`);
 * - the share each of two surfaces takes where they meet (`energyShares`,
 *   `docs/reference/wounds.md#shares`);
 * - the same with one surface half and twice as stiff as it is;
 * - the energy a blow must bring to each part of each body, as that surface's share, at the
 *   rulebook's unit: to spend the body's life (its hit points over the part's cost in life,
 *   `lifeFactor`), and on a limb to empty the limb's bar (`LimbSpec.share` of full life).
 */
import { CONTACT_STIFFNESS } from "../src/core/bodies/human/tables/contact-stiffness.ts";
import { HUMANOID_MODELS, modelSpec } from "../src/core/bodies/models.ts";
import { lifeFactor, woundGroups } from "../src/combat/pool.ts";
import { rulebook } from "../src/combat/rulebook.ts";
import { energyShares } from "../src/combat/share.ts";
import { si } from "../src/core/bodies/spec/quantity.ts";

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

const rules = rulebook("arena"), unit = rules.unit.value;
console.log(`
Joules of blunt blow that spend the body's life, and that empty the part's limb's bar, at ${unit} J a hit point:
`);
console.log(`| Part | ${HUMANOID_MODELS.map((model) => `${model}: group | life, J | bar, J`).join(" | ")} |
|---|${HUMANOID_MODELS.map(() => "---|---|---|").join("")}`);
const specs = HUMANOID_MODELS.map(model => modelSpec(model));
for (const row of Object.keys(CONTACT_STIFFNESS)) {
  const cells = specs.map((spec) => {
    const segment = spec.segments.find((one) => one.name === row || one.name === `${row}.right`), hp = spec.wounds.hp.value;
    const group = woundGroups(spec).get(segment.name), bar = group.kind === "limb" ? (group.limb.share.value * hp * unit).toFixed(0) : "-";
    return `${group.kind} | ${(hp / lifeFactor(rules, spec, segment.name) * unit).toFixed(0)} | ${bar}`;
  });
  console.log(`| ${row} | ${cells.join(" | ")} |`);
}
