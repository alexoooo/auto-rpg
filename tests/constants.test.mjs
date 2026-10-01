/**
 * Every tuned constant says where its value came from. A module-scope constant of the core or a
 * screen that writes a number (`tunedConstants`, `tests/fixtures/constants.mjs`) carries a comment
 * that cites a record's section naming it, a key of `SOURCES`, or says it is a numeric setting or
 * solver conditioning (`sourceFault`).
 *
 * What this cannot see: a number written inside a function, and a record that names a constant
 * without supporting its value. Hoisting the number to the module closes the first; only a reader
 * checks the second.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SOURCES } from "../src/core/sources.ts";
import { ledgerFaults, sourceFault, tunedConstants } from "./fixtures/constants.mjs";
import { recordSection } from "./fixtures/spec.mjs";
import { ROOT, sourcesUnder } from "./harness/program.mjs";

/** Where a tuned number decides how the game plays, looks or sounds. */
const SCOPE = ["src/core", "src/arena", "src/dungeon", "src/render", "src/audio"];

const READ = { sources: Object.keys(SOURCES), sectionOf: recordSection };

/** A constant that cites its sweep, and the section it cites: what the controls below stand on. */
const SOURCED = { file: "src/core/control/stance-tuning.ts", name: "STANCE_SECONDS", section: "docs/reference/stance-tuning.md#time-constants" };

/** The tuned constants of `files` ([file, text] pairs), each as `"path NAME"` with its comment. */
const scanned = (files) => files.flatMap(([file, text]) =>
  tunedConstants(text, file).map((constant) => ({ key: `${file} ${constant.name}`, constant })));

/** Those of `files` whose comment names no source, `"path NAME"` to the reason. */
const unsourced = (files) => new Map(scanned(files)
  .map(({ key, constant }) => [key, sourceFault(constant, READ)])
  .filter(([, fault]) => fault !== null));

/**
 * The constants that name no source yet, as `"path NAME"`. The list only shrinks: an entry that is
 * sourced, renamed or gone fails the test until it is taken out, and a constant that is not listed
 * names its source.
 */
const NOT_YET = [];

test("a tuned constant is a module's number: not a function's, a sourced one, a plain one or a table of places", () => {
  const sample = [
    "const ALONE = 0.3;",
    "const NEGATIVE = -3;",
    "const SUM = Math.PI / 6;",
    "const RECORD = Object.freeze({ inner: { deep: [0, 4] } }) as const;",
    "const HANDED = new Color3(0.4, 0.3, 0.2);",
    "export const EXPORTED = 7, BESIDE = 1;",
    "const SPLICED = `mix(${f(LOOK.top - 0.005)}, 1.0)`;",
    "const VALUES = [0, 60, 120];",
    "const HALVES = [[0.25, 0.75]];",
    "const PLAIN = { none: 0, one: 1, pair: 2, sign: -1, half: 0.5 };",
    "const TWICE = 2 * Math.PI;",
    "const SHADER = `mix(0.65, 1.0)`;",
    "const LATER = (x: number): number => x * 40;",
    "const METHODS = { paint(): number { return 40; }, read: function (): number { return 40; } };",
    "const SOURCED = { unit: sourced(138.26, \"J/HP\", \"core-club-unit\", \"the best blow\") };",
    "const DERIVED = derive(\"m\", \"a sum\", [A, quantityOf(40)], (a, b) => a + b);",
    "const UNITS: Readonly<Partial<Record<Unit, { to: Unit; factor: number }>>> = { cm: { to: \"m\", factor: 1 / 100 } };",
    "const ROWS = Object.freeze([[0, 1, 3], [0, 2, 4]] as const);",
    "let changing = 40;",
    "function f(): number { const INSIDE = 40; return INSIDE; }",
    "",
  ].join("\n");
  assert.deepEqual(tunedConstants(sample).map((constant) => constant.name),
    ["ALONE", "NEGATIVE", "SUM", "RECORD", "HANDED", "EXPORTED", "SPLICED", "VALUES", "HALVES"]);
});

test("a constant's comment is the block on its statement, and no other", () => {
  const sample = [
    "/** The file's header says numeric setting. */",
    "",
    "// A line of its own,",
    "/** and the doc under it. */",
    "const NEAR = 0.3;",
    "const BARE = 0.3;",
    "",
  ].join("\n");
  assert.deepEqual(tunedConstants(sample), [
    { name: "NEAR", comment: "// A line of its own,\n/** and the doc under it. */" },
    { name: "BARE", comment: "" },
  ]);
});

test("a comment names a source by a record's section that names the constant, a key of the sources, or by saying it is numeric", () => {
  const fault = (name, comment) => sourceFault({ name, comment }, READ);
  const { name, section } = SOURCED;
  // The fixture is real: the section exists and names the constant, and the key is one of the sources.
  assert.ok(recordSection(section).includes(`\`${name}\``));
  assert.ok(READ.sources.includes("owner-hp-pool"));
  assert.deepEqual([
    fault(name, `/** Sweep: \`${section}\`. */`),
    fault(name, `/** Sweep: \`docs/reference/no-such-record.md#time-constants\`, and again \`${section}\`. */`),
    fault("ANY", "/** The owner's pool (`owner-hp-pool`). */"),
    fault("ANY", "/** The solve's damping, a numeric setting. */"),
    fault("ANY", "/** Solver conditioning: the engine's iterations. */"),
    fault("ANY", ""),
    fault("ANY", "/** A margin that felt right. */"),
    fault("ANY", "/** The pool, as owner-hp-pools has it. */"),
    fault("ANY", "/** The pool, as no-owner-hp-pool has it. */"),
    fault("ANY", "/** See docs/reference/stance-tuning.md. */"),
    fault(name, "/** See `docs/reference/stance-tuning.md#no-such-section`. */"),
    fault(name, "/** See `docs/reference/no-such-record.md#time-constants`. */"),
    fault("OTHER_SECONDS", `/** Sweep: \`${section}\`. */`),
    fault("STANCE", `/** Sweep: \`${section}\`. */`),
  ], [
    null, null, null, null, null,
    "names no source",
    "names no source",
    "names no source",
    "names no source",
    "names no source",
    "cites docs/reference/stance-tuning.md#no-such-section, which does not exist",
    "cites docs/reference/no-such-record.md#time-constants, which does not exist",
    `cites ${section}, which does not name \`OTHER_SECONDS\``,
    `cites ${section}, which does not name \`STANCE\``,
  ]);
  // A section is its own text and its subsections', and no more: a constant the record names
  // elsewhere is not named by this one.
  const gait = recordSection("docs/reference/stance-tuning.md#gait");
  assert.ok(gait.startsWith("## Gait") && gait.includes("### Swing time and double support together") && !gait.includes("## Heel-off"));
  assert.ok(recordSection("docs/reference/stance-tuning.md#knee-bend").includes("`STANCE_KNEE_BEND`"));
  assert.equal(fault("STANCE_KNEE_BEND", `/** Sweep: \`${section}\`. */`), `cites ${section}, which does not name \`STANCE_KNEE_BEND\``);
  // A record of the art is read as one of the references is, and by the section asked for.
  const art = { sources: [], sectionOf: (record) => record === "docs/art/crypt.md#stone" ? "The stone is `STONE_LOOK.vary`." : undefined };
  assert.equal(sourceFault({ name: "STONE_LOOK", comment: "/** `docs/art/crypt.md#stone`. */" }, art), null);
  assert.equal(sourceFault({ name: "STONE_LOOK", comment: "/** `docs/art/crypt.md#fog`. */" }, art), "cites docs/art/crypt.md#fog, which does not exist");
});

test("the list of constants not yet sourced holds every failure, and nothing that passes or is gone", () => {
  const failing = new Map([["a.ts LEFT", "names no source"], ["a.ts NEW", "names no source"]]);
  assert.deepEqual(ledgerFaults(failing, ["a.ts LEFT", "a.ts NEW"]), []);
  assert.deepEqual(ledgerFaults(failing, ["a.ts LEFT", "a.ts SOURCED"]), [
    "a.ts NEW names no source",
    "a.ts SOURCED is listed as not yet sourced, and it is sourced or gone",
  ]);
});

test("every tuned constant of the core and the screens names its source, or is listed as not yet", () => {
  const files = SCOPE.flatMap((directory) => sourcesUnder(directory, ".ts"))
    .map((file) => [file, fs.readFileSync(`${ROOT}/${file}`, "utf8")]);
  const failing = unsourced(files);
  assert.deepEqual(ledgerFaults(failing, NOT_YET), []);

  // The scan read the tree: the sourced constant is among what it found, and passed.
  const sourced = `${SOURCED.file} ${SOURCED.name}`;
  assert.ok(scanned(files).some(({ key }) => key === sourced) && !failing.has(sourced));
  // The same tree with that constant's citation taken out of its comment: the scan that passed sees it.
  const uncited = files.map(([file, text]) => [file, file === SOURCED.file ? text.replace(SOURCED.section, "the sweep") : text]);
  assert.deepEqual(ledgerFaults(unsourced(uncited), NOT_YET), [`${sourced} names no source`]);
  // And with the list still naming it: an entry that passes is refused.
  assert.deepEqual(ledgerFaults(failing, [...NOT_YET, sourced]), [`${sourced} is listed as not yet sourced, and it is sourced or gone`]);
});
