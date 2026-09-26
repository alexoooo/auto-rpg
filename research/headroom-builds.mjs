// The bodies of the headroom audit (skill ceiling session 05,
// `docs/plans/2026-09-25-skill-ceiling-05-headroom-audit.md`).
//
// Modules combine, so the audit's unit is the **module**: it measures every named build and a
// stratified sample of builds in which every module on the shelf appears, and reads a module's
// headroom across the builds that contain it. The named builds (`PLAYABLE_BUILDS` in
// `src/golem/roster.ts`) leave out every reach-chain effector, the pitch chain's mace and fist, the
// human's mace and whip and the skeleton's fist and whip. Each sample below adds one of those and,
// where it can, also moves a second slot off the default, so that no module is read on one context
// alone.
import { namedBuild, PLAYABLE_BUILDS } from "../src/golem/roster.ts";
import { defaultGolemSetup, golemSetupRefusal } from "../src/golem/build.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { bodyFamily, FAMILY_POLICY } from "../src/golem/family.ts";
import { ATTRIBUTE_IDS, ATTRIBUTES } from "../src/golem/attributes.ts";

const stone = (over) => ({ ...defaultGolemSetup(), ...over });
const pick = (chain, terminal) => ({ chain, terminal });

/** The stratified sample: every module the named builds leave out, each on a second context. */
export const SAMPLE_BUILDS = Object.freeze([
  { name: "reach-blade", setup: stone({ primary: pick("reach", "blade"), secondary: pick("reach", "plate") }) },
  { name: "reach-mace-multileg", setup: stone({ locomotion: "locomotion.multileg", primary: pick("reach", "mace"), secondary: pick("reach", "plate") }) },
  { name: "reach-maul-wheel", setup: stone({ locomotion: "locomotion.wheel", primary: pick("reach", "maul"), secondary: pick("reach", "maul") }) },
  { name: "reach-fists-plated", setup: stone({ torso: "torso.plated", primary: pick("reach", "fist"), secondary: pick("reach", "fist") }) },
  { name: "pitch-mace-ram", setup: stone({ head: "head.ram", primary: pick("pitch", "mace"), secondary: pick("pitch", "plate") }) },
  { name: "pitch-fists", setup: stone({ primary: pick("pitch", "fist"), secondary: pick("pitch", "fist") }) },
  { name: "human-mace", setup: humanSetup("mace", "plate") },
  { name: "human-whip", setup: humanSetup("whip", "plate") },
  { name: "skeleton-fists", setup: skeletonSetup("fist", "fist") },
  { name: "skeleton-whip", setup: skeletonSetup("whip", "plate") },
].map((build) => Object.freeze({ ...build, setup: Object.freeze(build.setup) })));

for (const build of SAMPLE_BUILDS) {
  const refusal = golemSetupRefusal(build.setup);
  if (refusal !== null) throw new Error(`sample build "${build.name}" is refused: ${refusal}`);
}

/** Every body the audit measures: the playable builds, then the sample. */
export const AUDIT_BUILDS = Object.freeze([...PLAYABLE_BUILDS, ...SAMPLE_BUILDS]);

/** A build by name: a playable build, a sample build, or null. */
export const auditBuild = (name) => namedBuild(name) ?? SAMPLE_BUILDS.find((b) => b.name === name) ?? null;

/**
 * The modules a setup is made of, as ids: its locomotion, torso and head, and each socket's
 * effector as `effector.<chain>.<terminal>` (a socket a two-socket terminal takes counts once).
 */
export function modulesOf(setup) {
  const out = new Set([setup.locomotion, setup.torso, setup.head]);
  for (const socket of ["primary", "secondary"]) {
    const { chain, terminal } = setup[socket];
    out.add(chain === "none" ? "effector.none" : `effector.${chain}.${terminal}`);
  }
  return [...out];
}

/** Each module and the audit builds that contain it. */
export function moduleCoverage(builds = AUDIT_BUILDS) {
  const map = new Map();
  for (const build of builds) for (const id of modulesOf(build.setup)) {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(build.name);
  }
  return map;
}

/** The family's naive duelist, the top rung each family has (`FAMILY_POLICY`). */
export const familyDuelist = (setup) => FAMILY_POLICY[bodyFamily(setup)];

/** A setup with one attribute moved (none at x1). */
export function withAttribute(setup, id, value) {
  if (!ATTRIBUTE_IDS.includes(id)) throw new Error(`no attribute "${id}"`);
  const row = ATTRIBUTES[id];
  if (value < row.min - 1e-9 || value > row.max + 1e-9) throw new Error(`${id} x${value} is outside x${row.min}..x${row.max}`);
  return { ...setup, attributes: { ...(setup.attributes ?? {}), [id]: value } };
}

/** The giant: the default with every live attribute at its maximum (`ATTRIBUTE_PRESETS.max`). */
export function giantSetup() {
  const attributes = Object.fromEntries(ATTRIBUTE_IDS.filter((id) => ATTRIBUTES[id].live).map((id) => [id, ATTRIBUTES[id].max]));
  return { ...namedBuild("default").setup, attributes };
}
