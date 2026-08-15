"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  COLUMNS, DESCRIPTORS, EXPECTED_BYTES, EXPECTED_LINES, EXPECTED_SHA256, HEADER,
  INPUT_PATHS, PERMITTED_COLUMNS, PRODUCTION_AUTHORITY, SOURCE_COMMIT,
  analyzeReceiptPair, diagnose, outputPaths, parseRows, renderJson, renderText, runProduction, sha256,
} = require("./diagnose_smart128.js");

const PERMITTED = new Set([
  "seed", "mirrored", "target", "offset_x_raw", "offset_y_raw", "bracket_equal",
  "reference_weapon_body_facts", "reference_crossed", "reference_solver_rejections",
  "held_inert", "held_solver_rejections", "tactical_first_contact_tick",
  "tactical_first_contact_cross_tick", "tactical_solver_rejections",
  "tactical_unattributed_anatomy_changes",
]);

function fixture(options = {}) {
  const poison = options.poison ?? "a";
  const lines = [options.header ?? HEADER];
  for (let ordinal = 0; ordinal < DESCRIPTORS.length; ordinal += 1) {
    const descriptor = DESCRIPTORS[ordinal];
    const values = Object.fromEntries(COLUMNS.map((name, at) =>
      [name, `forbidden-${poison}-${at}`]));
    Object.assign(values, {
      seed: String(descriptor.seed),
      mirrored: String(descriptor.mirrored),
      target: descriptor.target,
      offset_x_raw: String(descriptor.offsetXRaw),
      offset_y_raw: String(descriptor.offsetYRaw),
      bracket_equal: "true",
      reference_weapon_body_facts: "1",
      reference_crossed: "true",
      reference_solver_rejections: "0",
      held_inert: "true",
      held_solver_rejections: "0",
      tactical_first_contact_tick: "none",
      tactical_first_contact_cross_tick: "none",
      tactical_solver_rejections: "0",
      tactical_unattributed_anatomy_changes: "0",
    });
    if (options.rows?.[ordinal]) Object.assign(values, options.rows[ordinal]);
    lines.push(COLUMNS.map((name) => values[name]).join(","));
  }
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}

function authority(bytes, overrides = {}) {
  return {
    bytes: bytes.length,
    lines: 901,
    sha256: sha256(bytes),
    header: HEADER,
    descriptors: DESCRIPTORS,
    ...overrides,
  };
}

function parsed(options = {}) {
  const bytes = fixture(options);
  return parseRows(bytes, authority(bytes));
}

function memoryIo(first, second, failure = {}) {
  const files = new Map();
  const writes = [];
  const renames = [];
  let writeAt = 0;
  let renameAt = 0;
  return {
    files,
    writes,
    renames,
    existsSync(file) { return files.has(file); },
    readFileSync(file) { return file.includes("calibration-a") ? first : second; },
    writeFileSync(file, bytes, options) {
      writeAt += 1;
      writes.push({ file, bytes, options });
      if (writeAt === failure.writeAt) throw new Error(`injected write ${writeAt}`);
      if (files.has(file)) throw new Error(`existing ${file}`);
      files.set(file, bytes);
    },
    renameSync(from, to) {
      renameAt += 1;
      renames.push({ from, to });
      if (renameAt === failure.renameAt) throw new Error(`injected rename ${renameAt}`);
      if (!files.has(from) || files.has(to)) throw new Error(`invalid rename ${from} to ${to}`);
      files.set(to, files.get(from));
      files.delete(from);
    },
    unlinkSync(file) { files.delete(file); },
  };
}

test("both frozen receipts must be byte identical and authority exact", () => {
  assert.deepEqual(INPUT_PATHS,
    ["target/smart128-calibration-a.csv", "target/smart128-calibration-b.csv"]);
  assert.equal(SOURCE_COMMIT, "7813de079e237f613ec59c4ef38aeee8b399742f");
  assert.equal(EXPECTED_BYTES, 309770);
  assert.equal(EXPECTED_LINES, 901);
  assert.equal(EXPECTED_SHA256, "6e892f830c915d86ab88980832dc9daf82921c44842f9cc6b2d41de88c813a8a");
  assert.equal(PRODUCTION_AUTHORITY.bytes, EXPECTED_BYTES);
  assert.equal(PRODUCTION_AUTHORITY.lines, EXPECTED_LINES);
  assert.equal(PRODUCTION_AUTHORITY.sha256, EXPECTED_SHA256);
  assert.equal(PRODUCTION_AUTHORITY.header, HEADER);
  assert.equal(PRODUCTION_AUTHORITY.descriptors, DESCRIPTORS);
  const first = fixture();
  const altered = Buffer.from(first);
  altered[altered.length - 2] = altered[altered.length - 2] === 97 ? 98 : 97;
  assert.throws(() => analyzeReceiptPair(first, altered, authority(first)),
    /invalid-receipt-stop: the two frozen receipts are not byte identical/);
  assert.throws(() => analyzeReceiptPair(first, first, authority(first, { sha256: "0".repeat(64) })),
    /invalid-receipt-stop: artifact SHA-256/);
  assert.throws(() => analyzeReceiptPair(first, first, authority(first, { bytes: first.length + 1 })),
    /invalid-receipt-stop: artifact is .* bytes; expected/);
  const corruptSchemaAndReceipt = Buffer.from(first);
  corruptSchemaAndReceipt[0] = 34;
  assert.throws(() => analyzeReceiptPair(corruptSchemaAndReceipt, corruptSchemaAndReceipt,
    authority(first)), /invalid-receipt-stop: artifact SHA-256/);
  const report = analyzeReceiptPair(first, first, authority(first));
  assert.equal(report.guards.rows, 900);
});

test("the full 110 column header and canonical descriptor order are required", () => {
  assert.equal(COLUMNS.length, 110);
  assert.equal(COLUMNS.join(","), HEADER);
  const swapped = COLUMNS.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const wrongHeader = fixture({ header: swapped.join(",") });
  assert.throws(() => parseRows(wrongHeader, authority(wrongHeader)),
    /invalid-schema-order-stop: the full 110 column header does not match/);
  const displaced = fixture({ rows: { 0: { seed: "1" } } });
  assert.throws(() => parseRows(displaced, authority(displaced)),
    /invalid-schema-order-stop: descriptor mismatch at row 0/);
  const drift = fixture({ rows: { 899: { bracket_equal: "false" } } });
  assert.throws(() => parseRows(drift, authority(drift)),
    /invalid-schema-order-stop: bracket drift is nonzero/);
  const noFinalNewline = fixture().subarray(0, fixture().length - 1);
  assert.throws(() => parseRows(noFinalNewline, authority(noFinalNewline)),
    /invalid-schema-order-stop: artifact lacks its final newline/);
  const withCr = Buffer.from(fixture().toString("utf8").replace("\n", "\r\n"), "utf8");
  assert.throws(() => parseRows(withCr, authority(withCr)),
    /invalid-schema-order-stop: artifact contains CR bytes/);
  const withQuote = Buffer.from(fixture());
  withQuote[HEADER.length + 1] = 34;
  assert.throws(() => parseRows(withQuote, authority(withQuote)),
    /invalid-schema-order-stop: artifact contains quotes/);
  const badBoolean = fixture({ rows: { 1: { reference_crossed: "yes" } } });
  assert.throws(() => parseRows(badBoolean, authority(badBoolean)),
    /invalid-schema-order-stop: row 1 column reference_crossed is not true or false/);
  const badOptional = fixture({ rows: { 2: { tactical_first_contact_tick: "-1" } } });
  assert.throws(() => parseRows(badOptional, authority(badOptional)),
    /invalid-schema-order-stop: row 2 column tactical_first_contact_tick is not an unsigned integer/);
  const narrowLines = fixture().toString("utf8").trimEnd().split("\n");
  narrowLines[1] = narrowLines[1].split(",").slice(0, -1).join(",");
  const narrowRow = Buffer.from(`${narrowLines.join("\n")}\n`, "utf8");
  assert.throws(() => parseRows(narrowRow, authority(narrowRow)),
    /invalid-schema-order-stop: row 0 has 109 columns; expected 110/);
  const shortLines = fixture().toString("utf8").trimEnd().split("\n").slice(0, -1);
  const shortReceipt = Buffer.from(`${shortLines.join("\n")}\n`, "utf8");
  assert.throws(() => parseRows(shortReceipt, authority(shortReceipt)),
    /invalid-receipt-stop: artifact has 900 lines; expected 901/);
});

test("the solver two by two table counts every row once", () => {
  const rows = parsed({ rows: {
    1: { held_solver_rejections: "1" },
    2: { reference_solver_rejections: "1" },
    3: { reference_solver_rejections: "2", held_solver_rejections: "2" },
    4: { reference_solver_rejections: "1" },
  } });
  const report = diagnose(rows);
  assert.deepEqual(report.solverTwoByTwo, [
    { referencePositive: false, heldPositive: false, cases: 896 },
    { referencePositive: false, heldPositive: true, cases: 1 },
    { referencePositive: true, heldPositive: false, cases: 2 },
    { referencePositive: true, heldPositive: true, cases: 1 },
  ]);
  assert.equal(report.solverTwoByTwo.reduce((sum, cell) => sum + cell.cases, 0), 900);
});

test("positive set identity is weaker than per row count identity", () => {
  const report = diagnose(parsed({ rows: {
    17: { reference_solver_rejections: "1", held_solver_rejections: "2" },
  } }));
  assert.equal(report.identity.positiveSetsEqual, true);
  assert.equal(report.identity.positiveCountVectorsEqual, false);
  assert.deepEqual(report.identity.heldOnlyOrdinals, []);
  assert.deepEqual(report.identity.referenceOnlyOrdinals, []);
  assert.deepEqual(report.identity.sharedUnequalCountOrdinals, [17]);
  assert.equal(report.decision, "controlled-arm-solver-asymmetry");
});

test("mirror anatomy offset and seed marginals keep canonical order", () => {
  const report = diagnose(parsed());
  assert.deepEqual(report.marginals.mirror.map((row) => row.mirrored), [false, true]);
  assert.deepEqual(report.marginals.mirror.map((row) => row.cases), [450, 450]);
  assert.deepEqual(report.marginals.anatomy.map((row) => row.target), ["fighter", "brute"]);
  assert.deepEqual(report.marginals.anatomy.map((row) => row.cases), [450, 450]);
  assert.deepEqual(report.marginals.offset.map((row) => [row.offsetXRaw, row.offsetYRaw]), [
    [-196608, -65536], [-196608, 0], [-196608, 65536],
    [-163840, -65536], [-163840, 0], [-163840, 65536],
    [-131072, -65536], [-131072, 0], [-131072, 65536],
  ]);
  assert.deepEqual(report.marginals.offset.map((row) => row.cases), Array(9).fill(100));
  assert.deepEqual(report.marginals.seed.map((row) => row.seed), Array.from({ length: 25 }, (_, at) => at));
  assert.deepEqual(report.marginals.seed.map((row) => row.cases), Array(25).fill(36));
});

test("shared solver intersections overlap and retain their labels", () => {
  const report = diagnose(parsed({ rows: {
    0: {
      reference_solver_rejections: "1", held_solver_rejections: "1",
      reference_weapon_body_facts: "0", reference_crossed: "false", held_inert: "false",
      tactical_solver_rejections: "1", tactical_unattributed_anatomy_changes: "1",
      tactical_first_contact_tick: "8", tactical_first_contact_cross_tick: "none",
    },
    1: {
      reference_solver_rejections: "2", held_solver_rejections: "2",
      reference_weapon_body_facts: "0", reference_crossed: "false",
    },
  } }));
  assert.deepEqual(report.sharedSolverIntersections, {
    overlap: true,
    sharedPositive: 2,
    referenceMissing: 2,
    referenceUncrossed: 2,
    heldNonInert: 1,
    tacticalSolverPositive: 1,
    tacticalUnattributedPositive: 1,
    tacticalCrossOrder: 1,
  });
  assert.ok(report.sharedSolverIntersections.referenceMissing +
    report.sharedSolverIntersections.referenceUncrossed > report.sharedSolverIntersections.sharedPositive);
});

test("productivity outcome channel and damage columns cannot affect diagnosis", () => {
  assert.deepEqual(PERMITTED_COLUMNS, [...PERMITTED]);
  assert.deepEqual(Object.keys(parsed()[0]), [
    "seed", "mirrored", "target", "offsetXRaw", "offsetYRaw", "bracketEqual",
    "referenceWeaponBodyFacts", "referenceCrossed", "referenceSolverRejections",
    "heldInert", "heldSolverRejections", "tacticalFirstContactTick",
    "tacticalFirstContactCrossTick", "tacticalSolverRejections",
    "tacticalUnattributedAnatomyChanges",
  ]);
  const firstBytes = fixture({ poison: "a" });
  const secondBytes = fixture({ poison: "b" });
  const first = diagnose(parseRows(firstBytes, authority(firstBytes)));
  const second = diagnose(parseRows(secondBytes, authority(secondBytes)));
  // The receipt envelope must change when bytes change. This comparison isolates
  // the diagnostic payload and proves forbidden columns cannot change the query.
  assert.equal(renderText({ schema: "core", sourceCommit: "core", inputs: [],
    descriptorSetDigest: "core", ...first }), renderText({ schema: "core", sourceCommit: "core",
    inputs: [], descriptorSetDigest: "core", ...second }));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("a refused diagnosis writes no artifact", () => {
  const good = fixture();
  const bad = Buffer.from(good);
  bad[bad.length - 2] = bad[bad.length - 2] === 97 ? 98 : 97;
  const prefix = "target/smart129-shared-solver-a";
  const mismatched = memoryIo(good, bad);
  assert.throws(() => runProduction(["--out-prefix", prefix], mismatched, authority(good)),
    /invalid-receipt-stop/);
  assert.deepEqual(mismatched.writes, []);
  assert.deepEqual([...mismatched.files], []);
  assert.throws(() => runProduction(["--out-prefix"], mismatched), /usage requires only --out-prefix PATH/);
  assert.throws(() => runProduction(["--out-prefix", "target/not-authorized"], mismatched),
    /--out-prefix must be/);
  assert.deepEqual(mismatched.writes, []);
});

test("a diagnosis publishes both artifacts or cleans the whole pair", () => {
  const good = fixture();
  const prefix = "target/smart129-shared-solver-a";
  const outputs = outputPaths(prefix);
  for (const failure of [{ writeAt: 1 }, { writeAt: 2 }, { renameAt: 1 }, { renameAt: 2 }]) {
    const io = memoryIo(good, good, failure);
    assert.throws(() => runProduction(["--out-prefix", prefix], io, authority(good)),
      /invalid-output-stop: could not publish the output pair: injected (write|rename) [12]; no diagnosis artifact remains/);
    for (const file of Object.values(outputs)) assert.equal(io.files.has(file), false);
  }

  for (const existing of Object.values(outputs)) {
    const io = memoryIo(good, good);
    io.files.set(existing, "existing");
    assert.throws(() => runProduction(["--out-prefix", prefix], io, authority(good)),
      /invalid-output-stop: .* already exists; no artifact was written/);
    assert.deepEqual([...io.files], [[existing, "existing"]]);
    assert.deepEqual(io.writes, []);
    assert.deepEqual(io.renames, []);
  }

  const success = memoryIo(good, good);
  const rendered = runProduction(["--out-prefix", prefix], success, authority(good));
  assert.deepEqual(success.writes.map((row) => row.file), [outputs.textTemp, outputs.jsonTemp]);
  assert.deepEqual(success.writes.map((row) => row.options), [
    { encoding: "utf8", flag: "wx" }, { encoding: "utf8", flag: "wx" },
  ]);
  assert.deepEqual(success.renames, [
    { from: outputs.textTemp, to: outputs.textFinal },
    { from: outputs.jsonTemp, to: outputs.jsonFinal },
  ]);
  assert.equal(success.files.get(outputs.textFinal), rendered.text);
  assert.equal(success.files.get(outputs.jsonFinal), rendered.json);
  assert.equal(success.files.has(outputs.textTemp), false);
  assert.equal(success.files.has(outputs.jsonTemp), false);
});

test("text and json output are byte identical on repeat", () => {
  const bytes = fixture({ rows: {
    7: { reference_solver_rejections: "3", held_solver_rejections: "3" },
    8: { reference_solver_rejections: "1" },
    9: { held_solver_rejections: "1" },
    10: {
      reference_solver_rejections: "2", held_solver_rejections: "4",
      reference_weapon_body_facts: "0", reference_crossed: "false", held_inert: "false",
      tactical_solver_rejections: "1", tactical_unattributed_anatomy_changes: "1",
      tactical_first_contact_tick: "5", tactical_first_contact_cross_tick: "6",
    },
  } });
  const report = analyzeReceiptPair(bytes, bytes, authority(bytes));
  const firstText = renderText(report);
  const firstJson = renderJson(report);
  assert.deepEqual(Object.keys(report), [
    "schema", "sourceCommit", "inputs", "descriptorSetDigest", "guards",
    "solverTwoByTwo", "identity", "marginals", "sharedSolverIntersections", "decision",
  ]);
  assert.deepEqual(Object.keys(report.guards), ["rows", "bracketDrift", "descriptorMismatch"]);
  assert.deepEqual(Object.keys(report.identity), [
    "positiveSetsEqual", "positiveCountVectorsEqual", "heldOnlyOrdinals",
    "referenceOnlyOrdinals", "sharedUnequalCountOrdinals",
  ]);
  assert.deepEqual(Object.keys(report.sharedSolverIntersections), [
    "overlap", "sharedPositive", "referenceMissing", "referenceUncrossed", "heldNonInert",
    "tacticalSolverPositive", "tacticalUnattributedPositive", "tacticalCrossOrder",
  ]);
  assert.equal(sha256(Buffer.from(firstText, "utf8")),
    "91b9c6f701fb9ba50463924252ab8272ab2a0710fe6469fd185228b2b46342ef");
  assert.equal(sha256(Buffer.from(firstJson, "utf8")),
    "fba46004985f880d21ae07877dc8f6a5dd7067890dd61217748e9db842cd1b8a");
  assert.equal(firstText, renderText(report));
  assert.equal(firstJson, renderJson(report));
  assert.equal(firstText.endsWith("\n"), true);
  assert.equal(firstJson.endsWith("\n"), true);
  assert.equal(firstText.includes("\r"), false);
  assert.equal(firstJson.includes("\r"), false);
  assert.equal(firstText.includes("wall"), false);
  assert.equal(firstJson.includes("wall"), false);
});
