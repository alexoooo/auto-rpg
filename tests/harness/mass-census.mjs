/**
 * What every body weighs, read off the solver.
 *
 *     node tests/harness/mass-census.mjs
 *     node tests/harness/mass-census.mjs --json
 *
 * `docs/plans/2026-09-23-physical-contact-01-measure.md` (in git at 30dcb8c) section 6. Each family is stood up in a real
 * bout (`createBout`, supported locomotion, NullEngine, real Havok) and every body its golem owns is
 * asked `getMassProperties()`, so the table is what the solver moves and not what a config table
 * says it should. Beside it: the supported mass the stability model divides a shove by (off the
 * locomotion port's diagnostic) and `golemUpperMassKg`, the build's own sum for what the carrier
 * holds up, against the solver's sum of the same modules.
 *
 * Part classes: the **carrier** is the locomotion module's root (a biped's pelvis, a multileg's
 * chassis, a wheel's yoke), **legs** is the rest of the locomotion module, **trunk** the torso
 * module, **head** the head module (neck included), **arm links** every effector part that is not
 * an item, and **items** the held things: a part the module marks `combatRole: "equipment"`, or one
 * named for a terminal.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { pathToFileURL } from "node:url";

import { golemUpperMassKg } from "../../src/golem/build.ts";
import { namedBuild } from "../../src/golem/roster.ts";
import { createBout, freshHavok } from "./bout-runner.mjs";

export const HARNESS = "the Node mass census (tests/harness/mass-census.mjs, createBout, supported locomotion, NullEngine, real Havok)";

/** The families of the plan's list, by named build, plus the stone default at the `max` preset. */
export const CENSUS_FAMILIES = Object.freeze([
  { family: "stone", build: "default" },
  { family: "giant (stone at max)", build: "default", preset: "max" },
  { family: "skeleton", build: "skeleton-warrior" },
  { family: "human", build: "human-warrior" },
  { family: "wheel", build: "wheel" },
  { family: "multileg", build: "multileg" },
]);

export const PART_CLASSES = Object.freeze(["carrier", "legs", "trunk", "head", "arm links", "items"]);
const CARRIERS = new Set(["pelvis", "chassis", "yoke"]);
const ITEMS = new Set(["blade", "plate", "mace", "maul", "whip", "lash", "buckler", "shield"]);

/** The class of one part, from the slot its module fills and the part's own name. */
export function partClass(slot, part) {
  const name = part.id.split(".").pop();
  if (slot === "locomotion") return CARRIERS.has(name) ? "carrier" : "legs";
  if (slot === "torso") return "trunk";
  if (slot === "head") return "head";
  return part.combatRole === "equipment" || ITEMS.has(name) ? "items" : "arm links";
}

/** One golem's census, read off a live body. */
export function censusOf(golem, setup) {
  const byClass = Object.fromEntries(PART_CLASSES.map((c) => [c, 0]));
  let whole = 0, upper = 0;
  for (const module of golem.modules) {
    for (const part of module.built.parts) {
      const kg = part.part.body.getMassProperties().mass;
      byClass[partClass(module.slot, part)] += kg;
      whole += kg;
      if (module.slot !== "locomotion") upper += kg;
    }
  }
  const stability = golem.locomotion.diagnostic().stability;
  return {
    wholeKg: whole, byClass,
    supportedMassKg: stability.supportedMassKg,
    // What a standing body falls to, in newton-seconds, along its weakest direction: its own
    // geometry's fall line (physical contact session 08) times the mass it holds up.
    fallAtNs: stability.fallAtMps * stability.supportedMassKg,
    upperMassKg: { build: golemUpperMassKg(setup), solver: upper },
  };
}

export async function runMassCensus(families = CENSUS_FAMILIES) {
  const { ATTRIBUTE_PRESETS } = await import("../../research/stat-sweep.mjs");
  const rows = [];
  for (const entry of families) {
    const named = namedBuild(entry.build);
    if (!named) throw new Error(`no named build "${entry.build}"`);
    const setup = entry.preset ? { ...named.setup, attributes: ATTRIBUTE_PRESETS[entry.preset]() } : named.setup;
    const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: namedBuild("default").setup,
      locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
    try { rows.push({ ...entry, ...censusOf(bout.left, setup) }); } finally { bout.dispose(); }
  }
  return rows;
}

export function massMarkdown(rows) {
  const kg = (value) => value.toFixed(2);
  return [HARNESS, "",
    `| Family | Whole kg | ${PART_CLASSES.join(" | ")} | Supported kg | Upper kg, build / solver |`,
    `| --- | ---: |${PART_CLASSES.map(() => " ---: |").join("")} ---: | ---: |`,
    ...rows.map((r) => `| ${r.family} | ${kg(r.wholeKg)} | ${PART_CLASSES.map((c) => kg(r.byClass[c])).join(" | ")} | ${kg(r.supportedMassKg)} | ${kg(r.upperMassKg.build)} / ${kg(r.upperMassKg.solver)} |`),
    ""].join("\n");
}

async function main() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const rows = await runMassCensus();
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ harness: HARNESS, rows }, null, 2)); return; }
  console.log(massMarkdown(rows));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
