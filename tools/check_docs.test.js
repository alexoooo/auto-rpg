"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { checkArchitecture, checkDesignMigration, checkEnforcement, checkInventory } = require("./check_docs.js");

function write(root, rel, body) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function inventory(rows) {
  return [
    "# Inventory", "",
    "| Current source anchor | Heading | Destination | Status | Move phase | Inbound links | Audit note |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((row) => `| [\`${row[0]}\`](../${row[0]}) | ${row[1]} | ${row[2]} | ${row[3]} | ${row[5] || "v2-05"} | ${row[6] || "none"} | ${row[4] === undefined ? "Checked." : row[4]} |`),
    "",
  ].join("\n");
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-rpg-docs-"));
  write(root, "DESIGN.md", [
    "# Design rules", "", "## The determinism contract", "", "## The agent boundary", "",
    "### What the agent can see (layout versions 7 through 9)", "", "### Actions and loadouts", "", "## Replays", "",
    "### The route", "", "## Performance notes", "",
  ].join("\n"));
  write(root, "README.md", "# auto-rpg\n\n## Status\n\n## The three decisions everything else follows from\n");
  write(root, "AGENTS.md", [
    "# AGENTS.md", "", "## Commands", "", "## The one rule everything else serves", "",
    "## Golden hashes: decide before you edit, not after", "",
    "## The frame ABI is a handshake across four files", "",
  ].join("\n"));
  write(root, "docs/README.md", [
    "# Documentation map", "", "## Read by role", "",
    "- **Player:** [status](../README.md#status).",
    "- **Contributor:** [commands](../AGENTS.md#commands).",
    "- **Mechanics author:** [design](../DESIGN.md#design-rules), [determinism](../DESIGN.md#the-determinism-contract), [boundary](../DESIGN.md#the-agent-boundary).",
    "- **Renderer author:** [performance](../DESIGN.md#performance-notes).",
    "- **Policy researcher:** [replays](../DESIGN.md#replays).", "", "## Target hierarchy", "",
  ].join("\n"));
  const rows = [
    ["DESIGN.md#design-rules", "Design rules", "orientation", "current", undefined, undefined, "`docs/README.md`"],
    ["DESIGN.md#the-determinism-contract", "The determinism contract", "reference", "current", "Scenario::fingerprint omits loadout.", undefined, "`docs/README.md`"],
    ["DESIGN.md#the-agent-boundary", "The agent boundary", "architecture", "duplicate", "Copies exact feature-layout versions and counts.", undefined, "`docs/README.md`"],
    ["DESIGN.md#what-the-agent-can-see-layout-versions-7-through-9", "What the agent can see (layout versions 7 through 9)", "reference", "duplicate", "Copies exact feature-vector layouts and version numbers."],
    ["DESIGN.md#actions-and-loadouts", "Actions and loadouts", "reference", "duplicate", "Copies exact action/loadout shapes and discriminants."],
    ["DESIGN.md#replays", "Replays", "reference", "stale", "One-limb LimbCommand replaced the stale two-hand 36 bytes claim.", undefined, "`docs/README.md`"],
    ["DESIGN.md#the-route", "The route", "architecture", "current", "Copies literal ROOM_HASH value."],
    ["DESIGN.md#performance-notes", "Performance notes", "evidence", "stale", "Temporary authority is docs/plans/v2-00-overview.md.", undefined, "`docs/README.md`"],
    ["README.md#auto-rpg", "auto-rpg", "orientation", "current"],
    ["README.md#status", "Status", "orientation", "current", "Former literal state hash 0x1234 is preserved as historical provenance in docs/reference/hashes.md.", undefined, "`docs/README.md`"],
    ["README.md#the-three-decisions-everything-else-follows-from", "The three decisions everything else follows from", "design", "duplicate", "Repeats determinism authority from DESIGN."],
    ["AGENTS.md#agentsmd", "AGENTS.md", "orientation", "current"],
    ["AGENTS.md#commands", "Commands", "reference", "current", undefined, undefined, "`docs/README.md`"],
    ["AGENTS.md#the-one-rule-everything-else-serves", "The one rule everything else serves", "reference", "duplicate", "Contributor summary repeats DESIGN determinism."],
    ["AGENTS.md#golden-hashes-decide-before-you-edit-not-after", "Golden hashes: decide before you edit, not after", "reference", "duplicate", "Exact hash names and pin locations form a copied registry."],
    ["AGENTS.md#the-frame-abi-is-a-handshake-across-four-files", "The frame ABI is a handshake across four files", "reference", "duplicate", "Frame ABI mirrors exact layout constants."],
  ];
  write(root, "docs/documentation-inventory.md", inventory(rows));
  return { root, rows };
}

function problems(root) {
  try {
    return checkInventory(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function architectureFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-rpg-architecture-"));
  const crates = ["fx", "sim", "policy", "lab", "web"];
  write(root, "Cargo.toml", `[workspace]\nmembers = [${crates.map((name) => `"crates/${name}"`).join(", ")}]\n`);
  const dependencies = {
    fx: [], sim: ["fx"], policy: ["fx", "sim"], lab: ["fx", "sim", "policy"], web: ["fx", "sim", "policy"],
  };
  for (const name of crates) {
    write(root, `crates/${name}/Cargo.toml`, [
      "[package]", `name = "${name}"`, 'version = "0.1.0"', "[dependencies]",
      ...dependencies[name].map((dependency) => `${dependency} = { path = "../${dependency}" }`), "",
    ].join("\n"));
    write(root, `crates/${name}/src/lib.rs`, name === "policy"
      ? "pub trait Policy {}\n\n// filler\n// filler\n// filler\n// filler\n// filler\n// wrong line\n"
      : name === "web"
        ? "thread_local! { static X: u8 = 0; }\nfn write_frame() {}\npub extern \"C\" fn init() {}\n"
        : "pub fn seam() {}\n");
  }
  write(root, "crates/sim/src/world.rs", [
    "pub fn step() {}", "", "pub fn state_hash() {}", "", "// filler", "// filler", "// filler", "// filler", "// wrong line", "",
  ].join("\n"));
  write(root, "crates/sim/src/replay.rs", "pub struct Replay;\n");
  write(root, "crates/sim/src/scenario.rs", "pub fn fingerprint() {}\n");
  const diagram = [
    "```mermaid", "flowchart BT", "sim --> fx", "policy --> fx", "policy --> sim",
    "lab --> fx", "lab --> sim", "lab --> policy", "web --> fx", "web --> sim", "web --> policy", "```",
  ].join("\n");
  const names = ["overview.md", "simulation.md", "policy.md", "replay-hashing.md", "browser-runtime.md", "assets.md", "learning.md"];
  for (const name of names) {
    const body = [
      name === "learning.md" ? "# Learning status" : `# ${name}`, "", "**Purpose:** Describe the current boundary.", "**Status:** current",
      "**Canonical source:** [simulation seam](../../crates/sim/src/lib.rs#L1)",
      "**Update when:** The current boundary changes.", "", "## Current path", "",
      "The current path is deterministic.", "",
      "> **Proposed by v2 -- not current:** A Worker, Babylon, articulated actor, and learned policy are future proposals.", "",
    ];
    if (name === "overview.md") body.push("## Current crate graph", "", diagram, "", "## Source anchors", "", "- [workspace](../../Cargo.toml)", "");
    if (name === "simulation.md") body.push("```mermaid", "flowchart LR", "A --> B", "```", "", "## Source anchors", "", "- [World::step](../../crates/sim/src/world.rs#L1)", "");
    if (name === "policy.md") body.push("## Source anchors", "", "- [Policy](../../crates/policy/src/lib.rs#L1)", "");
    if (name === "replay-hashing.md") body.push(
      "```mermaid", "flowchart LR", "A --> B", "```", "", "## Source anchors", "",
      "- [Replay](../../crates/sim/src/replay.rs#L1)",
      "- [Scenario::fingerprint](../../crates/sim/src/scenario.rs#L1)",
      "- [World::state_hash](../../crates/sim/src/world.rs#L3)", "",
    );
    if (name === "browser-runtime.md") body.push(
      "```mermaid", "flowchart LR", "A --> B", "```", "", "## Source anchors", "",
      "- [thread_local](../../crates/web/src/lib.rs#L1)",
      "- [write_frame](../../crates/web/src/lib.rs#L2)",
      "- [exports](../../crates/web/src/lib.rs#L3)", "",
    );
    write(root, `docs/architecture/${name}`, body.join("\n"));
  }
  return root;
}

function standardDocument(title, body = "## Destination\n\nDurable current explanation.\n") {
  return [
    `# ${title}`, "", "**Purpose:** Own this durable concept.", "**Status:** current",
    "**Canonical source:** this document", "**Update when:** The concept changes.", "", body,
  ].join("\n");
}

function migrationFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-rpg-migration-"));
  const compatibility = [
    "The determinism contract", "The agent boundary", "The swing", "Weight, momentum and inertia", "Replays",
    "Deliberate non-choices", "The floor plan", "Performance notes", "Art direction",
    "Rules that exist for termination, not for flavour", "Open questions",
  ];
  write(root, "DESIGN.md", [
    "# Design rules", "", "Short compatibility index.", "",
    ...compatibility.flatMap((title) => [`## ${title}`, "", "See [durable design](docs/design/combat.md#destination).", ""]),
  ].join("\n"));
  for (const name of ["combat.md", "navigation-visibility.md", "presentation.md", "progression.md"]) {
    const body = name === "combat.md"
      ? "## Destination\n\nDurable current explanation.\n\n## Moved detail\n\nMigrated rationale.\n"
      : undefined;
    write(root, `docs/design/${name}`, standardDocument(name, body));
  }
  for (const name of ["0001-deterministic-fixed-point.md", "0002-record-commands-in-replays.md", "0003-renderer-outside-sim.md"]) {
    write(root, `docs/decisions/${name}`, standardDocument(name));
  }
  for (const name of ["determinism.md", "commands.md", "hashes.md", "frame-abi.md"]) {
    write(root, `docs/reference/${name}`, standardDocument(name));
  }
  write(root, "docs/documentation-inventory.md", inventory([
    ["DESIGN.md#moved-detail", "Moved detail", "design", "current"],
  ]));
  write(root, "docs/performance/evidence/2026-08-example.md", [
    "# Evidence", "", "**Purpose:** Preserve a measurement.", "**Status:** historical",
    "**Canonical source:** this document", "**Update when:** The baseline changes.", "",
    "**Date:** August 2026. **Hardware:** Windows reference machine.", "", "## Method", "", "Paired visible runs.", "",
  ].join("\n"));
  return root;
}

function enforcementFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-rpg-enforcement-"));
  write(root, "README.md", [
    "# Read me", "", "See the [contract](docs/reference/contracts.md#contract), [source line](source.txt#L2), and ![image](image.png).", "",
  ].join("\n"));
  write(root, "DESIGN.md", "# Design\n");
  write(root, "AGENTS.md", [
    "# Agents", "", "## Before you call it done", "",
    "1. Run `cargo test` and `node --test tools/wasm_check.js`.",
    "2. Record hash impact and frame ABI mirrors.",
    "3. Record documentation impact and run `node tools/check_docs.js`.", "",
  ].join("\n"));
  write(root, "source.txt", "first\nsecond\n");
  write(root, "image.png", "fixture image");
  write(root, "docs/README.md", [
    "# Documentation", "", "## Contract convention", "",
    "`DOC_CONTRACT:` markers live only in `docs/reference/`, bind to the following heading, and contextual links target that heading anchor.", "",
  ].join("\n"));
  write(root, "docs/reference/contracts.md", [
    "# Contracts", "", "**Purpose:** Own fixture contracts.", "**Status:** current",
    "**Canonical source:** this document", "**Update when:** The fixture changes.", "",
    "<!-- DOC_CONTRACT: fixture-contract -->", "## Contract", "", "Normative text.", "",
  ].join("\n"));
  write(root, "docs/reference/hashes.md", standardDocument("Hashes", [
    "## Scenario fingerprint", "", "Scenario::fingerprint accidentally omits each unit loadout.", "",
  ].join("\n")));
  write(root, "docs/decisions/0002-record-commands-in-replays.md", standardDocument("Replay decision", [
    "## Historical correction", "", "The former 36-byte two-hand command is historical; the current command has one limb.", "",
  ].join("\n")));
  return root;
}

test("every_root_heading_has_one_inventory_row", () => {
  const clean = fixture();
  assert.deepEqual(problems(clean.root), []);

  const historicalKey = fixture();
  const inventoryFile = path.join(historicalKey.root, "docs/documentation-inventory.md");
  fs.writeFileSync(inventoryFile, fs.readFileSync(inventoryFile, "utf8").replace(
    "[`DESIGN.md#what-the-agent-can-see-layout-versions-7-through-9`](../DESIGN.md#what-the-agent-can-see-layout-versions-7-through-9)",
    "`DESIGN.md#what-the-agent-can-see-layout-versions-7-through-9`",
  ));
  assert.deepEqual(problems(historicalKey.root), []);

  const { root, rows } = fixture();
  write(root, "docs/documentation-inventory.md", inventory([...rows.slice(1), rows[1]]));
  const errors = problems(root).join("\n");
  assert.match(errors, /DESIGN\.md#design-rules: expected one inventory row, found 0/);
  assert.match(errors, /DESIGN\.md#the-determinism-contract: inventory source appears 2 times/);

  const invented = fixture();
  invented.rows.find((row) => row[0] === "DESIGN.md#design-rules")[6] = "`invented.md`";
  write(invented.root, "docs/documentation-inventory.md", inventory(invented.rows));
  assert.match(problems(invented.root).join("\n"), /inbound accounting is invented\.md:1; actual Markdown links are docs\/README\.md:1/);

  const wrongCount = fixture();
  wrongCount.rows.find((row) => row[0] === "DESIGN.md#replays")[6] = "`docs/README.md` (2)";
  write(wrongCount.root, "docs/documentation-inventory.md", inventory(wrongCount.rows));
  assert.match(problems(wrongCount.root).join("\n"), /inbound accounting is docs\/README\.md:2; actual Markdown links are docs\/README\.md:1/);
});

test("every_inventory_destination_uses_a_known_document_class", () => {
  const { root, rows } = fixture();
  rows[0][2] = "miscellaneous";
  rows[0][1] = "Wrong label";
  rows[0][4] = "";
  rows[0][5] = "someday";
  rows[0][6] = "README says so";
  write(root, "docs/documentation-inventory.md", inventory(rows));
  const errors = problems(root).join("\n");
  assert.match(errors, /unknown destination class miscellaneous/);
  assert.match(errors, /heading "Wrong label" does not match source heading "Design rules"/);
  assert.match(errors, /unknown move phase someday/);
  assert.match(errors, /inbound links must be none or structured/);
  assert.match(errors, /audit note is empty/);
});

test("every_role_path_resolves_to_an_existing_anchor", () => {
  const { root } = fixture();
  const file = path.join(root, "docs", "README.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("../README.md#status", "../README.md#missing"));
  assert.match(problems(root).join("\n"), /role link \.\.\/README\.md#missing names a missing anchor/);
});

test("stale_and_duplicate_claims_are_not_silently_current", () => {
  const root = enforcementFixture();
  const hashes = path.join(root, "docs/reference/hashes.md");
  fs.writeFileSync(hashes, fs.readFileSync(hashes, "utf8").replace("omits each unit loadout", "covers the scenario"));
  const replay = path.join(root, "docs/decisions/0002-record-commands-in-replays.md");
  fs.writeFileSync(replay, fs.readFileSync(replay, "utf8").replace("36-byte two-hand", "older"));
  const errors = checkEnforcement(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /scenario fingerprint loadout omission/);
  assert.match(errors, /historical two-hand command correction/);
});

test("every_architecture_document_has_the_standard_header", () => {
  const clean = architectureFixture();
  assert.deepEqual(checkArchitecture(clean), []);
  fs.rmSync(clean, { recursive: true, force: true });

  const root = architectureFixture();
  write(root, "docs/architecture/assets.md", "# Assets\n\n**Purpose:** Present.\n**Status:** maybe\n");
  const errors = checkArchitecture(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /assets\.md:.*standard header/);
  assert.match(errors, /unknown Status maybe/);

  const headerOnly = architectureFixture();
  write(headerOnly, "docs/architecture/assets.md", [
    "# Assets", "", "**Purpose:** Describe assets.", "**Status:** current",
    "**Canonical source:** this document", "**Update when:** Assets change.", "", "## Empty", "",
  ].join("\n"));
  assert.match(checkArchitecture(headerOnly).join("\n"), /assets\.md: architecture document has no substantive non-header prose/);
  fs.rmSync(headerOnly, { recursive: true, force: true });
});

test("current_architecture_does_not_present_v2_types_as_shipped", () => {
  const root = architectureFixture();
  fs.appendFileSync(path.join(root, "docs/architecture/simulation.md"), [
    "", "Worker ships today, not tomorrow.", "", "Babylon and WebGPU ship here today.",
    "", "## Proposed Worker", "", "> Babylon ships today.", "",
  ].join("\n"));
  const errors = checkArchitecture(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /Worker is an unboxed v2 term/);
  assert.match(errors, /Babylon is an unboxed v2 term/);
  assert.match(errors, /WebGPU is an unboxed v2 term/);

  const browser = architectureFixture();
  fs.appendFileSync(path.join(browser, "docs/architecture/browser-runtime.md"),
    "\nThe Worker path, Babylon greybox, and WebGPU backend ship today. GLB art and articulated actors ship today.\n");
  const browserErrors = checkArchitecture(browser).join("\n");
  fs.rmSync(browser, { recursive: true, force: true });
  assert.doesNotMatch(browserErrors, /Worker is an unboxed v2 term/);
  assert.doesNotMatch(browserErrors, /Babylon is an unboxed v2 term/);
  assert.doesNotMatch(browserErrors, /WebGPU is an unboxed v2 term/);
  assert.match(browserErrors, /GLB is an unboxed v2 term/);
  assert.match(browserErrors, /articulated is an unboxed v2 term/);
});

test("architecture_source_anchors_resolve", () => {
  const root = architectureFixture();
  const file = path.join(root, "docs/architecture/policy.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("../../crates/policy/src/lib.rs#L1", "../../crates/policy/src/lib.rs#L8"));
  const simulation = path.join(root, "docs/architecture/simulation.md");
  fs.writeFileSync(simulation, fs.readFileSync(simulation, "utf8").replace("world.rs#L1", "world.rs#L9"));
  const errors = checkArchitecture(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /Policy trait requires a #L source link/);
  assert.match(errors, /World::step requires a #L source link/);
});

test("the_dependency_diagram_matches_workspace_edges", () => {
  const root = architectureFixture();
  const file = path.join(root, "docs/architecture/overview.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("web --> sim", "web --> imaginary"));
  const errors = checkArchitecture(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /dependency diagram is missing workspace edge web->sim/);
  assert.match(errors, /dependency diagram has non-workspace edge web->imaginary/);

  const deleted = architectureFixture();
  const simulation = path.join(deleted, "docs/architecture/simulation.md");
  fs.writeFileSync(simulation, fs.readFileSync(simulation, "utf8").replace(/```mermaid[\s\S]*?```/, ""));
  assert.match(checkArchitecture(deleted).join("\n"), /simulation\.md: expected 1 Mermaid block, found 0/);
  fs.rmSync(deleted, { recursive: true, force: true });

  const misplaced = architectureFixture();
  fs.appendFileSync(path.join(misplaced, "docs/architecture/policy.md"), "\n```mermaid\nflowchart LR\nA --> B\n```\n");
  assert.match(checkArchitecture(misplaced).join("\n"), /policy\.md: expected 0 Mermaid block, found 1/);
  fs.rmSync(misplaced, { recursive: true, force: true });

  const extra = architectureFixture();
  fs.appendFileSync(path.join(extra, "docs/architecture/overview.md"), "\n```mermaid\nflowchart LR\nA --> B\n```\n");
  assert.match(checkArchitecture(extra).join("\n"), /overview\.md: expected 1 Mermaid block, found 2/);
  fs.rmSync(extra, { recursive: true, force: true });
});

test("all_moved_design_anchors_have_a_valid_destination", () => {
  const clean = migrationFixture();
  assert.deepEqual(checkDesignMigration(clean), []);
  fs.rmSync(clean, { recursive: true, force: true });

  const root = migrationFixture();
  const file = path.join(root, "docs/design/combat.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8")
    .replace("## Moved detail", "## Different detail")
    .concat("\nA casual mention of `DESIGN.md#moved-detail` is not a migration declaration.\n"));
  const errors = checkDesignMigration(root).join("\n");
  assert.match(errors, /DESIGN\.md#moved-detail: moved design anchor has no durable destination declaration/);

  fs.appendFileSync(file, "\n## Superseded DESIGN.md headings\n\nThis document supersedes `DESIGN.md#moved-detail`.\n");
  assert.doesNotMatch(checkDesignMigration(root).join("\n"), /DESIGN\.md#moved-detail: moved design anchor/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("every_design_reference_and_decision_document_has_the_standard_header", () => {
  const root = migrationFixture();
  write(root, "docs/reference/hashes.md", "# Hashes\n\nNo standard header.\n");
  write(root, "docs/decisions/0004-new-decision.md", "# ADR 0004\n\nNo standard header.\n");
  write(root, "docs/reference/added.md", "# Added reference\n\nNo standard header.\n");
  const errors = checkDesignMigration(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /docs\/reference\/hashes\.md:.*standard header/);
  assert.match(errors, /docs\/decisions\/0004-new-decision\.md:.*standard header/);
  assert.match(errors, /docs\/reference\/added\.md:.*standard header/);
});

test("new_reference_documents_are_discovered_and_link_checked", () => {
  const root = migrationFixture();
  write(root, "docs/reference/added.md", standardDocument("Added reference", [
    "## Contract", "", "See the [missing authority](missing.md).", "",
  ].join("\n")));
  const errors = checkDesignMigration(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /docs\/reference\/added\.md:.*missing\.md names a missing file/);
});

test("no_durable_document_depends_only_on_a_temporary_plan", () => {
  const root = migrationFixture();
  write(root, "docs/plans/future.md", "# Future\n");
  const file = path.join(root, "docs/design/presentation.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("this document", "[future plan](../plans/future.md)"));
  const errors = checkDesignMigration(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /presentation\.md: canonical source depends only on temporary docs\/plans/);

  const shipped = migrationFixture();
  write(shipped, "docs/plans/future.md", "# Future\n");
  const shippedFile = path.join(shipped, "docs/design/presentation.md");
  fs.appendFileSync(shippedFile, "\nThe renderer uses this path because of the [v2 plan](../plans/future.md).\n");
  assert.match(checkDesignMigration(shipped).join("\n"), /shipped\/current claim depends only on temporary docs\/plans/);
  fs.rmSync(shipped, { recursive: true, force: true });

  const proposed = migrationFixture();
  write(proposed, "docs/plans/future.md", "# Future\n");
  fs.appendFileSync(path.join(proposed, "docs/design/presentation.md"), [
    "", "> **Proposed by v2 -- not current:** The future renderer is described by the [v2 plan](../plans/future.md).", "",
  ].join("\n"));
  assert.deepEqual(checkDesignMigration(proposed), []);
  fs.rmSync(proposed, { recursive: true, force: true });
});

test("the_root_design_entry_point_keeps_compatibility_links", () => {
  const root = migrationFixture();
  const file = path.join(root, "DESIGN.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8")
    .replace("## The swing", "### The swing")
    .replace("[durable design](docs/design/combat.md#destination)", "durable design"));
  const errors = checkDesignMigration(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /DESIGN\.md#the-swing: former top-level compatibility H2 is missing/);
  assert.match(errors, /DESIGN\.md#the-determinism-contract: compatibility section has no valid durable destination link/);
});

test("historical_measurements_name_date_hardware_and_method", () => {
  const root = migrationFixture();
  const file = path.join(root, "docs/performance/evidence/2026-08-example.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8")
    .replace("**Date:** August 2026. **Hardware:** Windows reference machine.\n", "")
    .replace("## Method", "## Results"));
  write(root, "docs/performance/evidence/2026-09-added.md", "# Added evidence\n\nNo standard header.\n");
  const errors = checkDesignMigration(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /must name a dated year/);
  assert.match(errors, /must name hardware/);
  assert.match(errors, /must include a ## Method section/);
  assert.match(errors, /docs\/performance\/evidence\/2026-09-added\.md:.*standard header/);
});

test("internal_links_and_anchors_resolve", () => {
  const clean = enforcementFixture();
  fs.appendFileSync(path.join(clean, "README.md"), "\n```markdown\n[example](missing.md#missing)\n```\n");
  assert.deepEqual(checkEnforcement(clean), []);
  fs.rmSync(clean, { recursive: true, force: true });

  const root = enforcementFixture();
  const file = path.join(root, "README.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8")
    .replace("contracts.md#contract", "contracts.md#missing")
    .replace("source.txt#L2", "source.txt#L99")
    .replace("image.png", "missing.png"));
  const errors = checkEnforcement(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /names a missing anchor/);
  assert.match(errors, /line link .* is outside its target/);
  assert.match(errors, /missing\.png names a missing file/);
});

test("retired_plan_links_fail", () => {
  const root = enforcementFixture();
  write(root, "docs/plans/retired.md", "# Retired\n\n**Status:** retired\n");
  write(root, "docs/plans/complete.md", "# Complete\n\n**Status:** complete. Landed.\n");
  fs.appendFileSync(path.join(root, "README.md"), [
    "", "[old plan](docs/plans/retired.md), [landed plan](docs/plans/complete.md), and [missing plan](docs/plans/missing.md).", "",
  ].join("\n"));
  const errors = checkEnforcement(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /retired\.md targets a retired plan/);
  assert.doesNotMatch(errors, /complete\.md targets a retired plan/);
  assert.match(errors, /missing\.md names a missing file/);
});

test("reference_contract_markers_are_unique", () => {
  const root = enforcementFixture();
  write(root, "docs/reference/added.md", "# Added\n\n<!-- DOC_CONTRACT: fixture-contract -->\n## Added contract\n");
  const errors = checkEnforcement(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /DOC_CONTRACT fixture-contract duplicates/);

  const orphan = enforcementFixture();
  const readme = path.join(orphan, "README.md");
  fs.writeFileSync(readme, fs.readFileSync(readme, "utf8").replace("contracts.md#contract", "contracts.md"));
  const orphanErrors = checkEnforcement(orphan).join("\n");
  fs.rmSync(orphan, { recursive: true, force: true });
  assert.match(orphanErrors, /DOC_CONTRACT fixture-contract heading #contract has no external inbound Markdown link/);
});

test("normative_markers_live_only_in_reference_documents", () => {
  const root = enforcementFixture();
  fs.appendFileSync(path.join(root, "README.md"), "\n<!-- DOC_CONTRACT: misplaced -->\n## Misplaced\n");
  fs.appendFileSync(path.join(root, "docs/reference/contracts.md"), "\n<!-- DOC_CONTRACT: unbound -->\nNot a heading.\n");
  write(root, "docs/plans/marker.md", "# Plan\n\n<!-- DOC_CONTRACT: plan-marker -->\n## Not normative\n");
  const errors = checkEnforcement(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /DOC_CONTRACT markers may live only in docs\/reference/);
  assert.match(errors, /docs\/plans\/marker\.md:.*DOC_CONTRACT markers may live only/);
  assert.match(errors, /DOC_CONTRACT unbound must bind to the following heading/);
});

test("the_completion_checklist_requires_documentation_impact", () => {
  const root = enforcementFixture();
  const file = path.join(root, "AGENTS.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8")
    .replace("Record documentation impact and run `node tools/check_docs.js`.", "Code is complete."));
  const errors = checkEnforcement(root).join("\n");
  fs.rmSync(root, { recursive: true, force: true });
  assert.match(errors, /checklist is missing documentation impact/);
  assert.match(errors, /checklist is missing documentation checker/);
});
