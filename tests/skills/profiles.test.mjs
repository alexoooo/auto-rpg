import { profileKeys } from "../harness/profile-keys.mjs";
import "../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCharacter } from "../../src/core/bodies/models.ts";
import { skillDigest } from "../../src/skills/framework/profile.ts";
import { record } from "../../src/minds/option/value.ts";

/**
 * Every measured profile (`assets/skills/strikes/<kind>/<kind>-profiles.json`) is of a skill the game has, on a body
 * it builds (`profileKeys`): a profile is read only where its body, spec digest and skill digest are the reader's
 * (`staleness`), so one keyed to a skill or body that has moved on is never read, and a strike or
 * edge that has none is priced by hand in silence.
 */
test("every measured profile is of a current skill on a current body", () => {
  const keys = profileKeys();
  assert.ok(keys.strike.size > 0 && keys.edge.size > 0, "the presets reached strikes and techniques to key profiles by");
  const stale = [];
  for (const kind of Object.keys(keys)) {
    const path = kind === "strike" ? "../../assets/skills/strikes/strike-profiles/strike-profiles.json" : "../../assets/skills/recovery/edge-profiles.json";
    const { profiles } = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    assert.ok(profiles.length > 0, `${path} holds profiles`);
    for (const { measured } of profiles) if (!keys[kind].has(`${measured.body} ${measured.spec} ${measured.skill}`))
      stale.push(`${kind}: ${measured.body} (spec ${measured.spec}), skill ${measured.skill}`);
  }
  assert.deepEqual(stale, [], "profiles keyed to no current skill on a current body: measure them again (research/<kind>-profiles.mjs)");
});

/**
 * **A strike priced by hand reads its tries of its own limb** (`record`): a stomp its executor gave
 * up on before committing (`stalled`) is a try that landed nothing, so a foot that keeps failing
 * from where it stands is priced down, not retried from there forever; the other foot's record is
 * its own, and a try the mind let go (`cancelled`) is no try.
 */
test("a strike's record counts its own limb's tries its executor gave up on", () => {
  const none = { target: 0, block: 0, incidental: 0, world: 0 };
  const ended = (id, effector, kind, committed) => ({ id, action: "stomp", effector, target: { kind: "body", id: "foe", region: { kind: "mark", mark: "middle" } },
    sequence: id, began: id, ended: id + .5, ending: { kind }, committed, observations: [], observed: 0,
    contacts: { counts: { prepare: none, commit: none, release: none }, loadedInCommit: false, blockedSegments: [], lastTarget: null } });
  const right = { name: "stomp", effectors: ["foot.right"] }, left = { name: "stomp", effectors: ["foot.left"] };
  const stalled = [1, 2, 3].map((id) => ended(id, "foot.right", "stalled", false));
  const fresh = record([], right);
  assert.ok(record(stalled, right).lands < fresh.lands, `three stalled tries lower the foot's record: ${record(stalled, right).lands} against ${fresh.lands}`);
  assert.deepEqual(record(stalled, left), record([], left), "the other foot's record is its own");
  assert.deepEqual(record([...stalled, ended(4, "foot.right", "cancelled", false)], right), record(stalled, right), "a try let go is no try");
});


test("a skill's identity includes the selected aim's declared data", async () => {
  const { loadData } = await import("../../src/core/data/store.ts");
  await loadData(["aim-audit-a", "aim-audit-b"], { "aim-audit-a": async () => ({ value: 1 }), "aim-audit-b": async () => ({ value: 2 }) });
  const spec = resolveCharacter({ model: "workshop-fighter" }).spec;
  const action = Object.freeze({ name: "audit", executor: "audit", effectors: ["hand.right"], aim: { kind: "audit-aim" } });
  const executors = [Object.freeze({ name: "audit", kind: "audit-executor" })];
  const lookup = key => ({ of(role) { return role === "aim" ? { reads: () => [key] } : {}; } });
  assert.notEqual(skillDigest(lookup("aim-audit-a"), spec, executors, action), skillDigest(lookup("aim-audit-b"), spec, executors, action));
});

test("a zero-length failed profile trial has a finite failed rate", async () => {
  const { profileReading } = await import("../../src/skills/framework/profile.ts");
  const spec = resolveCharacter({ model: "workshop-fighter" }).spec;
  const start = { phase: "clear", range: 1 };
  const reading = profileReading({ target: null, trials: [{ start, done: false, dealt: 0, taken: 0, seconds: 0, recovers: null, down: false }] }, spec);
  assert.equal(reading.rate(start, spec), 0);
  assert.equal(reading.expect(start, spec).done, 0);
  assert.equal(reading.peak("clear", spec), 0);
});
