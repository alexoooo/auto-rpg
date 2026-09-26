/**
 * What every body *is*, in numbers a person can read: the readable half of a body release.
 *
 *     node research/body-readout.mjs --out research/runs/sc01-baseline/readout-after.json
 *     node research/body-readout.mjs --out after.json --against before.json
 *
 * `tests/harness/body-fingerprint.mjs` says *whether* a body moved: it hashes every limb's motion
 * through fifteen bouts and every bench, so a change of physics rate moves all 55 sections at once
 * and says nothing about what moved. This file says *what* the bodies are, from the built bodies and
 * not from any table: each one is stood up by `createBout` (supported locomotion, NullEngine, real
 * Havok) and read one frame in.
 *
 * - **Masses**, from the solver (`censusOf` in `tests/harness/mass-census.mjs`): the whole body, its
 *   part classes, the mass the stability model holds up, and the impulse that fells it standing.
 * - **The published view** (`BodyView` on `self` after one frame): reach, crown, collision radius,
 *   arm rate, soak.
 * - **The carrier's ceilings**, the locomotion port's own `carrier.config`: walk, back-off, strafe,
 *   acceleration, yaw.
 * - **Every module's envelope** (`built.envelope()`): each axis's range and command rate, the reach,
 *   the swing inertia and the drive's rate and torque scales. Those scales are what the attributes do
 *   to the joint ceilings; the ceilings themselves are constants in `src/golem/config.ts` and
 *   `TORQUES` in `src/golem/humanoid/arm.ts`, and a moved one shows in the source diff.
 * - **The attribute rows** (`ATTRIBUTES`), `SIZE_LAW_POWER`, and the rate settings in `CONFIG.world`
 *   and `CONFIG.combat.contactReading`.
 *
 * The bodies are every playable build at x1, the default at size 0.8 and 1.1 (inside the size range
 * of both release 0 and release 1), and the giant: every live row at its own tree's ceiling.
 *
 * The script imports only through relative paths, so it runs on another commit by being copied into
 * that commit's worktree. Everything it reads is build-time or one frame in, so the file is exact:
 * `--against` prints every leaf that differs, and nothing is rounded before it is compared.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const HARNESS = "Node body readout (research/body-readout.mjs: createBout, supported locomotion, NullEngine, real Havok)";

export async function readBodies() {
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const [{ createBout, freshHavok }, { censusOf }, { PLAYABLE_BUILDS, namedBuild }, attributes, { CONFIG }] = await Promise.all([
    import("../tests/harness/bout-runner.mjs"), import("../tests/harness/mass-census.mjs"),
    import("../src/golem/roster.ts"), import("../src/golem/attributes.ts"), import("../src/config.ts")]);
  const { ATTRIBUTES, ATTRIBUTE_IDS, SIZE_LAW_POWER } = attributes;
  const giant = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, ATTRIBUTES[id].live ? ATTRIBUTES[id].max : 1]));
  const base = namedBuild("default").setup;
  const bodies = [
    ...PLAYABLE_BUILDS.map((build) => ({ name: build.name, setup: build.setup })),
    { name: "default@size0.8", setup: { ...base, attributes: { size: 0.8 } } },
    { name: "default@size1.1", setup: { ...base, attributes: { size: 1.1 } } },
    { name: "giant", setup: { ...base, attributes: giant } },
  ];
  const out = {};
  for (const { name, setup } of bodies) {
    const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: base,
      locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
    try {
      const golem = bout.left;
      // One frame first: the view is published by the first control step, and the fall line is
      // read off the base, which is unread (infinite) before it.
      bout.step();
      const census = censusOf(golem, setup);
      const envelopes = Object.fromEntries(golem.modules.map((module) => {
        const e = module.built.envelope();
        return [`${module.slot}:${module.id}`, {
          axes: Object.fromEntries(e.axes.map((a) => [a.id, { min: a.min, max: a.max, rate: a.rate }])),
          reach: e.reach, swingInertia: e.swingInertia ?? null, drive: e.drive ?? null }];
      }));
      const self = golem.view.self;
      out[name] = {
        mass: { wholeKg: census.wholeKg, ...census.byClass, supportedKg: census.supportedMassKg, fallAtNs: census.fallAtNs },
        view: { reach: self.reach, crownHeight: self.crownHeight, collisionRadius: self.collisionRadius,
          massKg: self.massKg, armRate: self.armRate, soak: self.soak },
        carrier: { ...golem.locomotion.carrier.config },
        envelopes,
      };
    } finally { bout.dispose(); }
  }
  return {
    version: 1,
    settings: { world: { ...CONFIG.world }, contactReading: CONFIG.combat.contactReading ?? null },
    attributes: Object.fromEntries(ATTRIBUTE_IDS.map((id) => {
      const { min, max, step, live } = ATTRIBUTES[id];
      return [id, { min, max, step, live }];
    })),
    sizeLawPower: { ...SIZE_LAW_POWER },
    bodies: out,
  };
}

/** Every leaf, by path. */
function flatten(value, path = "", into = new Map()) {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) flatten(value[key], path ? `${path}.${key}` : key, into);
  } else into.set(path, value);
  return into;
}

/**
 * Every leaf that differs: `{ path, before, after }`, with `undefined` for one that is absent. Both
 * sides go through JSON first, as a file on disk has, so a live readout compares with a saved one.
 */
export function diffReadouts(before, after) {
  const a = flatten(JSON.parse(JSON.stringify(before))), b = flatten(JSON.parse(JSON.stringify(after)));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  return paths.filter((p) => a.get(p) !== b.get(p)).map((p) => ({ path: p, before: a.get(p), after: b.get(p) }));
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: "string" }, against: { type: "string" } } });
  const readout = await readBodies();
  if (values.out) {
    mkdirSync(dirname(resolve(values.out)), { recursive: true });
    writeFileSync(values.out, `${JSON.stringify(readout, null, 2)}\n`);
  }
  console.log(`${Object.keys(readout.bodies).length} bodies (${HARNESS})`);
  if (!values.against) return;
  const rows = diffReadouts(JSON.parse(readFileSync(values.against, "utf8")), readout);
  const show = (x) => (x === undefined ? "(absent)" : typeof x === "number" ? String(+x.toPrecision(6)) : String(x));
  for (const { path, before, after } of rows) {
    const ratio = typeof before === "number" && typeof after === "number" && before !== 0 ? `  x${(after / before).toFixed(4)}` : "";
    console.log(`${path}: ${show(before)} -> ${show(after)}${ratio}`);
  }
  console.log(`${rows.length} leaves differ`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
