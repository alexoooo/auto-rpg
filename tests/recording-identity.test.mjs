import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_IDENTITY, currentBuildIdentity, hashBuildInputs } from "../scripts/build-identity.mjs";
import vite from "../vite.config.ts";
import { recordingIdentity, recordingKey, requireRecordingIdentity } from "../src/core/recording.ts";
import { readTape, tapeHash } from "../src/arena/matchup.ts";
import { buildBout, BOUT_HARNESS } from "../research/bout.mjs";
import { MATCH, readMatchMind, readMatchResult } from "../scripts/match.mjs";
import { TOURNAMENT, UNSEEN_OPPONENT, readTournamentRows } from "../scripts/tournament.mjs";
import { Duel } from "../src/arena/duel.ts";

test("build content includes changed source, assets and solver bytes with checkout-independent text", () => {
  const root = mkdtempSync(join(tmpdir(), "auto-rpg-identity-"));
  try {
    const files = ["source.ts", "asset.json", "solver.wasm"];
    writeFileSync(join(root, files[0]), "export const x = 1;\n");
    writeFileSync(join(root, files[1]), "{\"x\":1}\n");
    writeFileSync(join(root, files[2]), Buffer.from([0, 1, 2]));
    const first = hashBuildInputs(root, files);
    assert.match(first, /^sha256:[0-9a-f]{64}$/);
    assert.equal(hashBuildInputs(root, [...files].reverse()), first);
    writeFileSync(join(root, files[0]), "export const x = 1;\r\n");
    assert.equal(hashBuildInputs(root, files), first);
    for (const [file, changed] of [[files[0], "export const x = 2;\n"], [files[1], "{\"x\":2}\n"], [files[2], Buffer.from([0, 1, 3])]]) {
      const previous = hashBuildInputs(root, files);
      writeFileSync(join(root, file), changed);
      assert.notEqual(hashBuildInputs(root, files), previous, file);
    }
    writeFileSync(join(root, "extra.ts"), "export const extra = 1;\n");
    assert.notEqual(hashBuildInputs(root, [...files, "extra.ts"]), hashBuildInputs(root, files));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Vite and Node expose exactly one content fingerprint and source changes reload the page", () => {
  const plugin = vite.plugins.find(plugin => plugin.name === "recording-build-identity");
  const module = fileURLToPath(new URL("../src/build-identity.ts", import.meta.url));
  assert.equal(plugin.load(module), `export const BUILD_IDENTITY = ${JSON.stringify(BUILD_IDENTITY)};`);
  assert.equal(currentBuildIdentity(), BUILD_IDENTITY);
  const sent = [], invalidated = [], cached = { file: module };
  assert.deepEqual(plugin.handleHotUpdate({ server: { moduleGraph: { idToModuleMap: new Map([[module, cached]]), invalidateModule: value => invalidated.push(value) }, ws: { send: value => sent.push(value) } } }), []);
  assert.deepEqual(invalidated, [cached]);
  assert.deepEqual(sent, [{ type: "full-reload" }]);
});

test("recording identity rejects silently lossy JSON and distinguishes protocol, build and conditions", () => {
  assert.equal(recordingKey({ b: 2, a: [1, null] }), recordingKey({ a: [1, null], b: 2 }));
  for (const invalid of [NaN, Infinity, undefined, { a: undefined }, new Float64Array(2), Array(1)]) assert.throws(() => recordingKey(invalid), /finite plain JSON/);
  const expected = recordingIdentity(BUILD_IDENTITY, "fixture/1", { hz: 120 });
  assert.doesNotThrow(() => requireRecordingIdentity(structuredClone(expected), expected));
  assert.throws(() => requireRecordingIdentity(undefined, expected), /no build and protocol identity/);
  assert.throws(() => requireRecordingIdentity({ ...expected, protocol: "fixture/2" }, expected), /another protocol/);
  assert.throws(() => requireRecordingIdentity({ ...expected, build: `sha256:${"0".repeat(64)}` }, expected), /different source, assets or solver/);
  assert.throws(() => requireRecordingIdentity({ ...expected, configuration: "{}" }, expected), /physical conditions/);
});

test("Arena recordings replay on their exact build and refuse incompatible inputs before changing the world", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", gap: 4, capSeconds: 0.2 };
  const a = await buildBout(recipe, { hooks: { record: true } }), b = await buildBout(recipe);
  try {
    a.duel.order("left", { move: { kind: "direct", direction: { x: -1, z: 0 } }, face: null });
    const recording = readTape(tapeHash(a.duel.recording)), initial = b.duel.save();
    for (const identity of [{ ...recording.identity, build: `sha256:${"0".repeat(64)}` }, { ...recording.identity, protocol: "arena-orders/0" }, { ...recording.identity, configuration: "{}" }]) {
      assert.throws(() => b.duel.playRecording({ ...recording, identity }), /different|protocol/);
      assert.deepEqual(b.duel.save(), initial);
    }
    assert.throws(() => b.duel.load({ ...initial, identity: { ...initial.identity, build: `sha256:${"0".repeat(64)}` } }), /different source/);
    assert.deepEqual(b.duel.save(), initial);
    b.duel.playRecording(recording);
    a.world.step(12); b.world.step(12);
    assert.deepEqual(b.world.physics.save(), a.world.physics.save());
    assert.deepEqual(b.duel.tape, a.duel.tape);
    const logs = Object.fromEntries(["left", "right"].map(side => [side, a.duel.duelists[side].sheets]));
    const replay = await buildBout(recipe, { hooks: { replay: logs } });
    try { replay.world.step(12); assert.deepEqual(replay.world.physics.save(), a.world.physics.save()); }
    finally { replay.dispose(); }
    const wrong = { ...logs, left: { ...logs.left, identity: { ...logs.left.identity, build: `sha256:${"0".repeat(64)}` } } };
    await assert.rejects(buildBout(recipe, { hooks: { replay: wrong } }), /different source/);
    await assert.rejects(buildBout({ ...recipe, balance: { left: 10, right: 10 } }, { hooks: { replay: logs } }), /physical conditions/);
    await assert.rejects(buildBout(recipe, { hz: 60, hooks: { replay: logs } }), /physical conditions/);
  } finally { a.dispose(); b.dispose(); }
});

test("Arena recording identity resolves omitted and explicit stage defaults alike", async () => {
  for (const [level, gap] of [["open", 4], ["obstacle-court", 6]]) {
    const recipe = { left: "workshop-fighter", right: "workshop-rogue", ...(level === "open" ? {} : { level }) };
    const node = await buildBout(recipe), page = await buildBout({ ...recipe, level, gap }, { hooks: { solids: undefined } });
    try {
      assert.deepEqual(node.duel.recording.identity, page.duel.recording.identity);
      assert.doesNotThrow(() => page.duel.playRecording(node.duel.recording));
      assert.throws(() => page.duel.playRecording({ ...node.duel.recording, identity: { ...node.duel.recording.identity, configuration: "{}" } }), /physical conditions/);
    } finally { node.dispose(); page.dispose(); }
  }
});

test("a bad right-side sheet recording is refused before a direct Duel changes an existing world", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", balance: { left: 5, right: 8 },
    loadouts: { left: { left: "buckler", right: "sword" }, right: { left: "club", right: "empty" } } };
  const current = await buildBout(recipe, { hooks: { record: true } }), { world, duel } = current;
  const counts = { bodies: 0, joints: 0, senses: 0, before: 0, observed: 0, after: 0 }, originals = [];
  try {
    const replay = Object.fromEntries(["left", "right"].map(side => [side, duel.duelists[side].sheets]));
    replay.right = { ...replay.right, identity: { ...replay.right.identity, build: `sha256:${"0".repeat(64)}` } };
    const before = { physics: world.physics.save(), clock: world.steps, nodes: world.scene.transformNodes.length };
    for (const [object, key, counter] of [[world.physics, "addBody", "bodies"], [world.physics, "addJoint", "joints"],
      [world, "sense", "senses"], [world, "beforeStep", "before"], [world, "afterPhysics", "observed"], [world, "afterStep", "after"]]) {
      const original = object[key]; originals.push([object, key, original]);
      object[key] = (...args) => { counts[counter]++; return original.apply(object, args); };
    }
    assert.throws(() => new Duel(world, recipe, { replay }), /different source, assets or solver/);
    assert.deepEqual(counts, { bodies: 0, joints: 0, senses: 0, before: 0, observed: 0, after: 0 });
    assert.deepEqual(world.physics.save(), before.physics);
    assert.equal(world.steps, before.clock);
    assert.equal(world.scene.transformNodes.length, before.nodes);
    assert.doesNotThrow(() => world.step());
    assert.equal(world.steps, before.clock + 1);
  } finally {
    for (const [object, key, original] of originals) object[key] = original;
    current.dispose();
  }
});

test("match results and tournament rows reject incompatible builds and protocols before reuse", () => {
  const digest = value => createHash("sha256").update(recordingKey(value)).digest("hex").slice(0, 16);
  const mind = readMatchMind("options"), minds = { a: mind, b: mind };
  const identity = recordingIdentity(BUILD_IDENTITY, "arena-match/1", { harness: BOUT_HARNESS, protocol: MATCH });
  const result = { identity, harness: BOUT_HARNESS, protocol: MATCH, protocolDigest: digest(MATCH), minds, bouts: [], score: {} };
  assert.equal(readMatchResult(result), result);
  assert.throws(() => readMatchResult({ ...result, identity: undefined }), /no build/);
  assert.throws(() => readMatchResult({ ...result, identity: { ...identity, build: `sha256:${"0".repeat(64)}` } }), /different source/);
  assert.throws(() => readMatchResult({ ...result, protocol: { ...MATCH, gaps: [9] } }), /another match protocol/);
  assert.throws(() => readMatchResult({ ...result, identity: { ...identity, protocol: "arena-match/0" } }), /another protocol/);
  const tournament = recordingIdentity(BUILD_IDENTITY, "arena-tournament/1", { harness: BOUT_HARNESS, protocol: TOURNAMENT, unseen: UNSEEN_OPPONENT });
  const row = { identity: tournament, level: TOURNAMENT.level, key: "a|b|4", winner: "left" };
  assert.deepEqual([...readTournamentRows(JSON.stringify(row), tournament)], [[row.key, row]]);
  assert.throws(() => readTournamentRows(JSON.stringify({ ...row, level: "obstacle-court" }), tournament), /level/);
  for (const incompatible of [undefined, identity, { ...tournament, build: `sha256:${"0".repeat(64)}` }]) assert.throws(() => readTournamentRows(JSON.stringify({ ...row, identity: incompatible }), tournament), /identity|protocol|different source/);
});
