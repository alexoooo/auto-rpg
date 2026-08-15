"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const ROOT = path.resolve(__dirname, "..");
const INPUT_PATHS = ["target/smart128-calibration-a.csv", "target/smart128-calibration-b.csv"];
const ALLOWED_PREFIXES = new Set([
  "target/smart129-shared-solver-a",
  "target/smart129-shared-solver-b",
]);
const SOURCE_COMMIT = "7813de079e237f613ec59c4ef38aeee8b399742f";
const EXPECTED_BYTES = 309770;
const EXPECTED_LINES = 901;
const EXPECTED_SHA256 = "6e892f830c915d86ab88980832dc9daf82921c44842f9cc6b2d41de88c813a8a";
const HEADER = "fingerprint,seed,mirrored,target,offset_x_raw,offset_y_raw,bracket_equal,reference_unique,reference_crossed,held_inert,held_legal,reference_legal,tactical_legal,productive_unique_crossing_contact_dissipation,productive_cut_or_thrust_matching_integrity,reference_contact_tick,reference_region,reference_weapon_body_facts,reference_competing_facts,reference_tip_speed_raw,reference_energy_before_raw,reference_dissipated_raw,reference_cut_raw,reference_thrust_raw,reference_pressure_raw,reference_integrity_loss_head_raw,reference_integrity_loss_torso_raw,reference_integrity_loss_left_arm_raw,reference_integrity_loss_right_arm_raw,reference_integrity_loss_legs_raw,reference_wound_gain_head_raw,reference_wound_gain_torso_raw,reference_wound_gain_left_arm_raw,reference_wound_gain_right_arm_raw,reference_wound_gain_legs_raw,reference_blood_loss_raw,reference_refusals,reference_solver_rejections,reference_cap_hits,reference_energy_excess_raw,held_contact_tick,held_weapon_body_facts,held_competing_facts,held_energy_before_raw,held_dissipated_raw,held_cut_raw,held_thrust_raw,held_pressure_raw,held_integrity_loss_head_raw,held_integrity_loss_torso_raw,held_integrity_loss_left_arm_raw,held_integrity_loss_right_arm_raw,held_integrity_loss_legs_raw,held_wound_gain_head_raw,held_wound_gain_torso_raw,held_wound_gain_left_arm_raw,held_wound_gain_right_arm_raw,held_wound_gain_legs_raw,held_blood_loss_raw,held_refusals,held_solver_rejections,held_cap_hits,held_energy_excess_raw,tactical_intended_region,tactical_intended_hand,tactical_first_cross_tick,tactical_first_contact_tick,tactical_first_contact_cross_tick,tactical_first_contact_region,tactical_first_contact_hand,tactical_first_contact_attributed_facts,tactical_first_contact_competing_facts,tactical_first_contact_dissipated_raw,tactical_first_contact_cut_or_thrust_raw,tactical_first_contact_matching_integrity_loss_raw,tactical_peak_tip_speed_raw,tactical_peak_normal_closing_raw,tactical_peak_energy_before_raw,tactical_peak_dissipated_raw,tactical_cut_raw,tactical_thrust_raw,tactical_pressure_raw,tactical_integrity_loss_head_raw,tactical_integrity_loss_torso_raw,tactical_integrity_loss_left_arm_raw,tactical_integrity_loss_right_arm_raw,tactical_integrity_loss_legs_raw,tactical_wound_gain_head_raw,tactical_wound_gain_torso_raw,tactical_wound_gain_left_arm_raw,tactical_wound_gain_right_arm_raw,tactical_wound_gain_legs_raw,tactical_blood_loss_raw,tactical_unattributed_anatomy_changes,tactical_decision_tick,tactical_outcome,tactical_refusals,tactical_solver_rejections,tactical_cap_hits,tactical_energy_excess_raw,commits,crossings,weapon_body_facts,positive_closing,dissipated_groups,above_floor,cut_or_thrust,integrity_losses,open_wounds,body_decisions";
const COLUMNS = HEADER.split(",");
const COLUMN = new Map(COLUMNS.map((name, at) => [name, at]));
const PERMITTED_COLUMNS = Object.freeze([
  "seed", "mirrored", "target", "offset_x_raw", "offset_y_raw", "bracket_equal",
  "reference_weapon_body_facts", "reference_crossed", "reference_solver_rejections",
  "held_inert", "held_solver_rejections", "tactical_first_contact_tick",
  "tactical_first_contact_cross_tick", "tactical_solver_rejections",
  "tactical_unattributed_anatomy_changes",
]);
const PERMITTED_COLUMN_SET = new Set(PERMITTED_COLUMNS);
const OFFSETS = [
  [-196608, -65536], [-196608, 0], [-196608, 65536],
  [-163840, -65536], [-163840, 0], [-163840, 65536],
  [-131072, -65536], [-131072, 0], [-131072, 65536],
];

class DiagnosisError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function refuse(code, message) {
  throw new DiagnosisError(code, `${code}: ${message}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonicalDescriptors() {
  const rows = [];
  for (let seed = 0; seed < 25; seed += 1) {
    for (const mirrored of [false, true]) {
      for (const target of ["fighter", "brute"]) {
        for (const [offsetXRaw, offsetYRaw] of OFFSETS) {
          rows.push({ seed, mirrored, target, offsetXRaw, offsetYRaw });
        }
      }
    }
  }
  return rows;
}

const DESCRIPTORS = canonicalDescriptors();
const PRODUCTION_AUTHORITY = Object.freeze({
  bytes: EXPECTED_BYTES,
  lines: EXPECTED_LINES,
  sha256: EXPECTED_SHA256,
  header: HEADER,
  descriptors: DESCRIPTORS,
});

function descriptorSetDigest(descriptors = DESCRIPTORS) {
  const body = descriptors.map((row) =>
    `${row.seed},${row.mirrored},${row.target},${row.offsetXRaw},${row.offsetYRaw}\n`).join("");
  return sha256(Buffer.from(`ARPG-SMART129-DESCRIPTORS-V1\n${body}`, "ascii"));
}

function unsigned(value, name, ordinal) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    refuse("invalid-schema-order-stop", `row ${ordinal} column ${name} is not an unsigned integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    refuse("invalid-schema-order-stop", `row ${ordinal} column ${name} is outside the safe integer range`);
  }
  return number;
}

function signed(value, name, ordinal) {
  if (!/^(0|-?[1-9][0-9]*)$/.test(value)) {
    refuse("invalid-schema-order-stop", `row ${ordinal} column ${name} is not an integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    refuse("invalid-schema-order-stop", `row ${ordinal} column ${name} is outside the safe integer range`);
  }
  return number;
}

function boolean(value, name, ordinal) {
  if (value !== "true" && value !== "false") {
    refuse("invalid-schema-order-stop", `row ${ordinal} column ${name} is not true or false`);
  }
  return value === "true";
}

function optionalUnsigned(value, name, ordinal) {
  return value === "none" ? null : unsigned(value, name, ordinal);
}

function parseRows(bytes, authority) {
  if (bytes.length !== authority.bytes) {
    refuse("invalid-receipt-stop", `artifact is ${bytes.length} bytes; expected ${authority.bytes}`);
  }
  const digest = sha256(bytes);
  if (digest !== authority.sha256) {
    refuse("invalid-receipt-stop", `artifact SHA-256 is ${digest}; expected ${authority.sha256}`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    refuse("invalid-schema-order-stop", `artifact is not UTF-8: ${error.message}`);
  }
  if (text.charCodeAt(0) === 0xfeff) refuse("invalid-schema-order-stop", "artifact has a UTF-8 BOM");
  if (text.includes("\r")) refuse("invalid-schema-order-stop", "artifact contains CR bytes; LF is required");
  if (text.includes('"')) refuse("invalid-schema-order-stop", "artifact contains quotes outside the fixed CSV grammar");
  if (!text.endsWith("\n")) refuse("invalid-schema-order-stop", "artifact lacks its final newline");
  const lines = text.split("\n");
  lines.pop();
  if (lines.length !== authority.lines) {
    refuse("invalid-receipt-stop", `artifact has ${lines.length} lines; expected ${authority.lines}`);
  }
  if (lines[0] !== authority.header) refuse("invalid-schema-order-stop", "the full 110 column header does not match");
  const columns = lines[0].split(",");
  if (columns.length !== 110) {
    refuse("invalid-schema-order-stop", `header has ${columns.length} columns; expected 110`);
  }
  const rows = [];
  const descriptors = authority.descriptors;
  if (lines.length - 1 !== descriptors.length) {
    refuse("invalid-schema-order-stop", `artifact has ${lines.length - 1} rows; expected ${descriptors.length}`);
  }
  for (let at = 1; at < lines.length; at += 1) {
    const ordinal = at - 1;
    const fields = lines[at].split(",");
    if (fields.length !== 110) {
      refuse("invalid-schema-order-stop", `row ${ordinal} has ${fields.length} columns; expected 110`);
    }
    const get = (name) => {
      if (!PERMITTED_COLUMN_SET.has(name)) {
        refuse("invalid-schema-order-stop", `internal query attempted forbidden column ${name}`);
      }
      return fields[COLUMN.get(name)];
    };
    const row = {
      seed: unsigned(get("seed"), "seed", ordinal),
      mirrored: boolean(get("mirrored"), "mirrored", ordinal),
      target: get("target"),
      offsetXRaw: signed(get("offset_x_raw"), "offset_x_raw", ordinal),
      offsetYRaw: signed(get("offset_y_raw"), "offset_y_raw", ordinal),
      bracketEqual: boolean(get("bracket_equal"), "bracket_equal", ordinal),
      referenceWeaponBodyFacts: unsigned(get("reference_weapon_body_facts"), "reference_weapon_body_facts", ordinal),
      referenceCrossed: boolean(get("reference_crossed"), "reference_crossed", ordinal),
      referenceSolverRejections: unsigned(get("reference_solver_rejections"), "reference_solver_rejections", ordinal),
      heldInert: boolean(get("held_inert"), "held_inert", ordinal),
      heldSolverRejections: unsigned(get("held_solver_rejections"), "held_solver_rejections", ordinal),
      tacticalFirstContactTick: optionalUnsigned(get("tactical_first_contact_tick"), "tactical_first_contact_tick", ordinal),
      tacticalFirstContactCrossTick: optionalUnsigned(get("tactical_first_contact_cross_tick"), "tactical_first_contact_cross_tick", ordinal),
      tacticalSolverRejections: unsigned(get("tactical_solver_rejections"), "tactical_solver_rejections", ordinal),
      tacticalUnattributedAnatomyChanges: unsigned(get("tactical_unattributed_anatomy_changes"), "tactical_unattributed_anatomy_changes", ordinal),
    };
    if (row.target !== "fighter" && row.target !== "brute") {
      refuse("invalid-schema-order-stop", `row ${ordinal} target is not fighter or brute`);
    }
    const expected = descriptors[ordinal];
    if (row.seed !== expected.seed || row.mirrored !== expected.mirrored ||
        row.target !== expected.target || row.offsetXRaw !== expected.offsetXRaw ||
        row.offsetYRaw !== expected.offsetYRaw) {
      refuse("invalid-schema-order-stop", `descriptor mismatch at row ${ordinal}`);
    }
    rows.push(row);
  }
  if (rows.some((row) => !row.bracketEqual)) {
    refuse("invalid-schema-order-stop", "bracket drift is nonzero");
  }
  return rows;
}

function metric(rows) {
  const answer = {
    cases: rows.length,
    referencePositive: 0,
    heldPositive: 0,
    bothPositive: 0,
    referenceOnly: 0,
    heldOnly: 0,
    equalPositiveCounts: 0,
    unequalPositiveCounts: 0,
  };
  for (const row of rows) {
    const reference = row.referenceSolverRejections > 0;
    const held = row.heldSolverRejections > 0;
    answer.referencePositive += Number(reference);
    answer.heldPositive += Number(held);
    answer.bothPositive += Number(reference && held);
    answer.referenceOnly += Number(reference && !held);
    answer.heldOnly += Number(!reference && held);
    answer.equalPositiveCounts += Number(reference && held &&
      row.referenceSolverRejections === row.heldSolverRejections);
    answer.unequalPositiveCounts += Number(reference && held &&
      row.referenceSolverRejections !== row.heldSolverRejections);
  }
  const neitherPositive = answer.cases - answer.bothPositive - answer.referenceOnly - answer.heldOnly;
  if (neitherPositive < 0 || answer.referencePositive !== answer.bothPositive + answer.referenceOnly ||
      answer.heldPositive !== answer.bothPositive + answer.heldOnly ||
      neitherPositive + answer.bothPositive + answer.referenceOnly + answer.heldOnly !== answer.cases) {
    refuse("invalid-schema-order-stop", "a marginal does not sum to its declared denominator");
  }
  if (answer.equalPositiveCounts + answer.unequalPositiveCounts !== answer.bothPositive) {
    refuse("invalid-schema-order-stop", "positive-count identity does not sum to both-positive");
  }
  return answer;
}

function marginal(rows, values, select, label) {
  return values.map((value) => ({ ...label(value), ...metric(rows.filter((row) => select(row, value))) }));
}

function diagnose(rows) {
  const twoByTwo = [false, true].flatMap((referencePositive) => [false, true].map((heldPositive) => ({
    referencePositive,
    heldPositive,
    cases: rows.filter((row) => (row.referenceSolverRejections > 0) === referencePositive &&
      (row.heldSolverRejections > 0) === heldPositive).length,
  })));
  if (twoByTwo.reduce((sum, cell) => sum + cell.cases, 0) !== rows.length) {
    refuse("invalid-schema-order-stop", "the solver two by two table does not count every row once");
  }
  const heldOnlyOrdinals = [];
  const referenceOnlyOrdinals = [];
  const sharedUnequalCountOrdinals = [];
  const sharedOrdinals = [];
  rows.forEach((row, ordinal) => {
    const reference = row.referenceSolverRejections > 0;
    const held = row.heldSolverRejections > 0;
    if (held && !reference) heldOnlyOrdinals.push(ordinal);
    if (reference && !held) referenceOnlyOrdinals.push(ordinal);
    if (reference && held) {
      sharedOrdinals.push(ordinal);
      if (row.referenceSolverRejections !== row.heldSolverRejections) sharedUnequalCountOrdinals.push(ordinal);
    }
  });
  const identity = {
    positiveSetsEqual: heldOnlyOrdinals.length === 0 && referenceOnlyOrdinals.length === 0,
    positiveCountVectorsEqual: heldOnlyOrdinals.length === 0 && referenceOnlyOrdinals.length === 0 &&
      sharedUnequalCountOrdinals.length === 0,
    heldOnlyOrdinals,
    referenceOnlyOrdinals,
    sharedUnequalCountOrdinals,
  };
  const offsets = OFFSETS.map(([offsetXRaw, offsetYRaw]) => ({ offsetXRaw, offsetYRaw }));
  const marginals = {
    mirror: marginal(rows, [false, true], (row, value) => row.mirrored === value,
      (mirrored) => ({ mirrored })),
    anatomy: marginal(rows, ["fighter", "brute"], (row, value) => row.target === value,
      (target) => ({ target })),
    offset: marginal(rows, offsets, (row, value) =>
      row.offsetXRaw === value.offsetXRaw && row.offsetYRaw === value.offsetYRaw,
      (value) => value),
    seed: marginal(rows, Array.from({ length: 25 }, (_, seed) => seed),
      (row, value) => row.seed === value, (seed) => ({ seed })),
  };
  for (const [name, groups] of Object.entries(marginals)) {
    if (groups.reduce((sum, group) => sum + group.cases, 0) !== rows.length) {
      refuse("invalid-schema-order-stop", `${name} marginals do not sum to the row denominator`);
    }
  }
  const sharedRows = sharedOrdinals.map((ordinal) => rows[ordinal]);
  const tacticalCrossOrder = (row) => row.tacticalFirstContactTick !== null &&
    (row.tacticalFirstContactCrossTick === null ||
      row.tacticalFirstContactCrossTick > row.tacticalFirstContactTick);
  const sharedSolverIntersections = {
    overlap: true,
    sharedPositive: sharedRows.length,
    referenceMissing: sharedRows.filter((row) => row.referenceWeaponBodyFacts === 0).length,
    referenceUncrossed: sharedRows.filter((row) => !row.referenceCrossed).length,
    heldNonInert: sharedRows.filter((row) => !row.heldInert).length,
    tacticalSolverPositive: sharedRows.filter((row) => row.tacticalSolverRejections > 0).length,
    tacticalUnattributedPositive: sharedRows.filter((row) => row.tacticalUnattributedAnatomyChanges > 0).length,
    tacticalCrossOrder: sharedRows.filter(tacticalCrossOrder).length,
  };
  return {
    guards: { rows: rows.length, bracketDrift: 0, descriptorMismatch: 0 },
    solverTwoByTwo: twoByTwo,
    identity,
    marginals,
    sharedSolverIntersections,
    decision: identity.positiveCountVectorsEqual
      ? "shared-solver-counts-identical" : "controlled-arm-solver-asymmetry",
  };
}

function envelope(analysis, receipt) {
  return {
    schema: "smart129-shared-solver-diagnosis-1",
    sourceCommit: SOURCE_COMMIT,
    inputs: INPUT_PATHS.map((inputPath) => ({
      path: inputPath,
      bytes: receipt.bytes,
      lines: receipt.lines,
      sha256: receipt.sha256,
    })),
    descriptorSetDigest: descriptorSetDigest(),
    ...analysis,
  };
}

function metricText(prefix, row) {
  return `${prefix} cases=${row.cases} referencePositive=${row.referencePositive} heldPositive=${row.heldPositive} bothPositive=${row.bothPositive} referenceOnly=${row.referenceOnly} heldOnly=${row.heldOnly} equalPositiveCounts=${row.equalPositiveCounts} unequalPositiveCounts=${row.unequalPositiveCounts}`;
}

function renderText(report) {
  const lines = [
    `schema=${report.schema}`,
    `source_commit=${report.sourceCommit}`,
    ...report.inputs.map((input) => `input=${input.path} bytes=${input.bytes} lines=${input.lines} sha256=${input.sha256}`),
    `descriptor_set_digest=${report.descriptorSetDigest}`,
    `guards rows=${report.guards.rows} bracket_drift=${report.guards.bracketDrift} descriptor_mismatch=${report.guards.descriptorMismatch}`,
    "section=solver-two-by-two",
    ...report.solverTwoByTwo.map((cell) =>
      `reference_positive=${cell.referencePositive} held_positive=${cell.heldPositive} cases=${cell.cases}`),
    "section=identity",
    `positive_sets_equal=${report.identity.positiveSetsEqual}`,
    `positive_count_vectors_equal=${report.identity.positiveCountVectorsEqual}`,
    `held_only_ordinals=${report.identity.heldOnlyOrdinals.join(",")}`,
    `reference_only_ordinals=${report.identity.referenceOnlyOrdinals.join(",")}`,
    `shared_unequal_count_ordinals=${report.identity.sharedUnequalCountOrdinals.join(",")}`,
    "section=marginals-mirror",
    ...report.marginals.mirror.map((row) => metricText(`mirrored=${row.mirrored}`, row)),
    "section=marginals-anatomy",
    ...report.marginals.anatomy.map((row) => metricText(`target=${row.target}`, row)),
    "section=marginals-offset",
    ...report.marginals.offset.map((row) => metricText(
      `offset_x_raw=${row.offsetXRaw} offset_y_raw=${row.offsetYRaw}`, row)),
    "section=marginals-seed",
    ...report.marginals.seed.map((row) => metricText(`seed=${row.seed}`, row)),
    "section=shared-solver-intersections overlap=true",
    `shared_positive=${report.sharedSolverIntersections.sharedPositive}`,
    `reference_missing=${report.sharedSolverIntersections.referenceMissing}`,
    `reference_uncrossed=${report.sharedSolverIntersections.referenceUncrossed}`,
    `held_non_inert=${report.sharedSolverIntersections.heldNonInert}`,
    `tactical_solver_positive=${report.sharedSolverIntersections.tacticalSolverPositive}`,
    `tactical_unattributed_positive=${report.sharedSolverIntersections.tacticalUnattributedPositive}`,
    `tactical_cross_order=${report.sharedSolverIntersections.tacticalCrossOrder}`,
    `decision=${report.decision}`,
  ];
  return `${lines.join("\n")}\n`;
}

function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function analyzeReceiptPair(first, second, authority = PRODUCTION_AUTHORITY) {
  if (!Buffer.isBuffer(first) || !Buffer.isBuffer(second)) {
    refuse("invalid-receipt-stop", "both frozen receipts must be byte buffers");
  }
  if (!first.equals(second)) refuse("invalid-receipt-stop", "the two frozen receipts are not byte identical");
  const rows = parseRows(first, authority);
  return envelope(diagnose(rows), {
    bytes: authority.bytes,
    lines: authority.lines,
    sha256: authority.sha256,
  });
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--out-prefix") {
    refuse("invalid-receipt-stop", "usage requires only --out-prefix PATH");
  }
  if (!ALLOWED_PREFIXES.has(argv[1])) {
    refuse("invalid-receipt-stop", `--out-prefix must be target/smart129-shared-solver-a or target/smart129-shared-solver-b`);
  }
  return argv[1];
}

function outputPaths(outPrefix) {
  const prefix = path.join(ROOT, outPrefix);
  return {
    textFinal: `${prefix}.txt`,
    jsonFinal: `${prefix}.json`,
    textTemp: `${prefix}.txt.tmp`,
    jsonTemp: `${prefix}.json.tmp`,
  };
}

function cleanFailedOutput(io, outputs, published) {
  const failures = [];
  for (const file of [outputs.textTemp, outputs.jsonTemp, ...published]) {
    try {
      if (io.existsSync(file)) io.unlinkSync(file);
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  return failures;
}

function runProduction(argv, io = fs, authority = PRODUCTION_AUTHORITY) {
  const outPrefix = parseArgs(argv);
  const outputs = outputPaths(outPrefix);
  for (const file of Object.values(outputs)) {
    if (io.existsSync(file)) {
      refuse("invalid-output-stop", `${file} already exists; no artifact was written`);
    }
  }
  let first;
  let second;
  try {
    first = io.readFileSync(path.join(ROOT, INPUT_PATHS[0]));
    second = io.readFileSync(path.join(ROOT, INPUT_PATHS[1]));
  } catch (error) {
    refuse("invalid-receipt-stop", `could not read both frozen receipts: ${error.message}`);
  }
  const report = analyzeReceiptPair(first, second, authority);
  const text = renderText(report);
  const json = renderJson(report);
  const published = [];
  try {
    io.writeFileSync(outputs.textTemp, text, { encoding: "utf8", flag: "wx" });
    io.writeFileSync(outputs.jsonTemp, json, { encoding: "utf8", flag: "wx" });
    io.renameSync(outputs.textTemp, outputs.textFinal);
    published.push(outputs.textFinal);
    io.renameSync(outputs.jsonTemp, outputs.jsonFinal);
    published.push(outputs.jsonFinal);
  } catch (error) {
    const cleanup = cleanFailedOutput(io, outputs, published);
    const suffix = cleanup.length === 0
      ? "no diagnosis artifact remains"
      : `cleanup also failed: ${cleanup.join("; ")}`;
    refuse("invalid-output-stop", `could not publish the output pair: ${error.message}; ${suffix}`);
  }
  return { text, json };
}

function main() {
  try {
    runProduction(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof DiagnosisError ? error.message : `invalid-receipt-stop: ${error.message}`;
    console.error(message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  COLUMNS, DESCRIPTORS, DiagnosisError, EXPECTED_BYTES, EXPECTED_LINES, EXPECTED_SHA256,
  HEADER, INPUT_PATHS, OFFSETS, PERMITTED_COLUMNS, PRODUCTION_AUTHORITY, SOURCE_COMMIT,
  analyzeReceiptPair, canonicalDescriptors, descriptorSetDigest, diagnose, envelope,
  outputPaths, parseArgs, parseRows, renderJson, renderText, runProduction, sha256,
};
