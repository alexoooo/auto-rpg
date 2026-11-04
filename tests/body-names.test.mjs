import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { BODY_MODELS } from "../src/core/models.ts";

/**
 * **No body is named in control code**: bodies are told apart in data (a skill's record, by
 * `bodyKey`) and by what a body can do (a part's `fits`), never by a model's name. The core's
 * control code names no model, as a string or an object's key, no model type or list, and reads no
 * body's model to compare it or look it up. Left out are the modules that build bodies (`human/`,
 * `reptile/spec.ts`, `reptile/physique.ts`), the models' list (`models.ts`) and the sources
 * (`sources.ts`); and `reptile/`, whose righting is looked up by its body's model (`RIGHTING`,
 * `reptile/righting.ts`, read in `reptile/layers.ts`).
 */
const CORE = "src/core";
const LEFT_OUT = [/^human\//, /^reptile\//, /^models\.ts$/, /^sources\.ts$/];

/** Every TypeScript module under `dir`, by its path from it. */
const modules = (dir) => readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));

/** `source` with its comments blanked, so a comment may name a body. */
const uncommented = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAMES = BODY_MODELS.map(escape).join("|");

/** What names a body in control code, each with what it is. */
const NAMINGS = [
  { what: "a model's name", pattern: new RegExp(`["'\`](${NAMES})["'\`]|(?<![\\w-])(${NAMES})\\s*:(?!:)`) },
  { what: "a model type or list", pattern: /\b(HumanoidModel|BodyModel|WorkshopModel|SKELETON_MODEL|WORKSHOP_MODELS|HUMANOID_MODELS|BODY_MODELS)\b/ },
  { what: "a body's model compared", pattern: /\.model\s*[!=]==|[!=]==\s*[\w.?]*\.model\b/ },
  { what: "a lookup by a body's model", pattern: /\[[\w.?]*\.model\]/ },
];

test("the core's control code names no body", () => {
  const found = [];
  const checked = modules(CORE).filter((path) => !LEFT_OUT.some((out) => out.test(path)));
  assert.ok(checked.length > 100, `the modules checked: ${checked.length}`);
  for (const path of checked) {
    const lines = uncommented(readFileSync(join(CORE, path), "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const { what, pattern } of NAMINGS) if (pattern.test(line)) found.push(`${CORE}/${path}:${i + 1}: ${what}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, []);
});

test("the body-name check finds each way of naming a body", () => {
  const lines = ['if (spec.model === "crypt-skeleton") return 0;', "const BY = { rat: 1 };", "const t: Record<HumanoidModel, number> = {};", "return TABLE[own.spec.model];",
    "const ok = other !== built.spec.model;"];
  for (const line of lines) assert.ok(NAMINGS.some(({ pattern }) => pattern.test(uncommented(line))), line);
  for (const line of ["throw new Error(`${spec.model} has no foot`);", "// the crypt-skeleton's roll", "const rate = 2, ratio: 3;", "{ model: poses.model }"])
    assert.ok(!NAMINGS.some(({ pattern }) => pattern.test(uncommented(line))), line);
});
