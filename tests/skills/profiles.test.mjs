import { profileKey, profileKeys } from "../harness/profile-keys.mjs";
import "../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCharacter } from "../../src/core/bodies/models.ts";
import { holdsOf, profileAgainst, profilesFor, profilesOn, skillDigest } from "../../src/skills/framework/profile.ts";
import { record } from "../../src/minds/option/value.ts";
import { buildBout } from "../../src/app/node/evaluation.ts";
import { recipeOf } from "../../src/app/node/setup.ts";
import { reportNow } from "../../src/minds/seat/apart.ts";

/**
 * Every measured profile (`assets/skills/strikes/strike-profiles/strike-profiles.json`) is of a skill the game has, on a body
 * it builds (`profileKeys`): a profile is read only where its body, what it holds, its skill and its limb are the reader's
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
    for (const { measured } of profiles) if (!keys[kind].has(profileKey(measured))) stale.push(`${kind}: ${profileKey(measured)}`);
  }
  assert.deepEqual(stale, [], "profiles keyed to no current skill on a current body: measure them again (research/<kind>-profiles.mjs)");
});

/**
 * **A strike is read by its profile measured against the body it strikes**: a skill measured
 * against several bodies has a profile for each (`profilesFor`), and the one read is the struck
 * body's (`profileAgainst`), wherever it stands in the file. Read by the first, a Warrior priced
 * its punch at a Warrior from its trials at a Rogue.
 */
test("a strike is read by its profile measured against the body it strikes", () => {
  const { profiles } = JSON.parse(readFileSync(new URL("../../assets/skills/strikes/strike-profiles/strike-profiles.json", import.meta.url), "utf8"));
  const specs = ["man", "woman", "skeleton"].map((model) => resolveCharacter({ model }).spec);
  const skills = new Map(profiles.map(({ measured }) => [profileKey(measured), measured]));
  const wrong = [];
  let read = 0;
  for (const [key, measured] of skills) {
    const found = profilesFor(profiles, { ...measured, reaction: null });
    for (const struck of specs) {
      const against = found.fresh.filter((profile) => profile.target.body === struck.model && profile.target.holds === holdsOf(struck));
      if (against.length === 0) continue;
      read++;
      const profile = profileAgainst(found.fresh, struck);
      if (profile !== against[0]) wrong.push(`${key} at a ${struck.model}: read against ${profile?.target.body ?? "none"}`);
    }
  }
  assert.ok(read > skills.size, `the stored profiles reached a skill measured against several bodies: ${read} readings of ${skills.size} skills`);
  assert.deepEqual(wrong, [], "strikes read by a profile measured against another body than the one struck");
});

/**
 * **A foe is modelled by the strikes its character holds** (`profilesOn`): the stored profiles hold
 * a model's punch in two variations, and its character holds one. Found by the body's digest, which
 * leaves its skills out, a Warrior holding `straight-punch/drive` was modelled as throwing
 * `straight-punch/from-guard` beside it.
 */
test("a foe is modelled by the profiles of the skills its character holds", () => {
  const { profiles } = JSON.parse(readFileSync(new URL("../../assets/skills/strikes/strike-profiles/strike-profiles.json", import.meta.url), "utf8"));
  const strayed = [];
  let others = 0;
  for (const model of ["man", "woman", "skeleton"]) {
    const spec = resolveCharacter({ model }).spec, on = profiles.filter(({ measured }) => measured.body === model && measured.holds === holdsOf(spec));
    assert.ok(on.length > 0, `the stored profiles hold a ${model}'s strikes`);
    others += on.filter(({ measured }) => !spec.skills.includes(measured.skill)).length;
    const { hz, reaction, rate, delay } = on[0].measured, { fresh, stale } = profilesOn(profiles, spec, hz, reaction, rate ?? hz, delay ?? 0);
    assert.ok(fresh.length > 0, `a ${model} is modelled by measured strikes: ${stale}`);
    for (const { measured } of fresh) if (!spec.skills.includes(measured.skill)) strayed.push(`${model}: ${measured.skill} with ${measured.limb}`);
  }
  assert.ok(others > 0, "the stored profiles reached a variation a model's own character does not hold");
  assert.deepEqual(strayed, [], "foes modelled by strikes their characters do not hold");
});

/**
 * **A bout's first decisions read each strike's measured profile**: a profile is measured at the
 * senses' reaction time (`Senses.reaction`), and a foe carried for less than that is shown as it
 * stood when the bout began. Read at how old that showing was, every strike was priced by hand
 * ("measured with senses 0.15 s late, read 0 s late") until the bout was 0.15 s old.
 */
test("a bout's first decision prices a measured strike by its profile", async () => {
  const recipe = recipeOf("?matchup=man,man&control=option,option&left.loadout=empty,empty&right.loadout=empty,empty", { left: {}, right: {} }, "open");
  const bout = await buildBout(recipe);
  try {
    bout.world.step(1);
    const profiles = reportNow(bout.duel.duelists.left.minded.report).engagement?.details?.find((detail) => detail.label === "Profiles")?.value;
    assert.ok(profiles?.includes("straight-punch"), "the fixture's mind must have decided and said how it prices its punch");
    assert.doesNotMatch(profiles, /measured with senses/, "a strike priced by hand for the age of what the senses show at a bout's start");
  } finally { bout.dispose(); }
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
  const spec = resolveCharacter({ model: "man" }).spec;
  const action = Object.freeze({ name: "audit", executor: "audit", effectors: ["hand.right"], aim: { kind: "audit-aim" } });
  const executors = [Object.freeze({ name: "audit", kind: "audit-executor" })];
  const lookup = key => ({ of(role) { return role === "aim" ? { reads: () => [key] } : {}; } });
  assert.notEqual(skillDigest(lookup("aim-audit-a"), spec, executors, action), skillDigest(lookup("aim-audit-b"), spec, executors, action));
});

/**
 * **A number a character sets is a condition of a profile's trials** (`Start.levels`): a profile
 * whose trials began at two Balances was read as measured at one, whatever its reader's Balance.
 * A striker and a struck body are each read by the trials begun at the level nearest theirs, a
 * level no trial began at by the nearest that one did, and a profile that records none as before.
 */
test("a profile whose trials began at several Balances is read at the level nearest each body's", async () => {
  const { profileReading, startLevels, validProfiles } = await import("../../src/skills/framework/profile.ts");
  const body = (balance) => resolveCharacter({ model: "man", ...(balance === undefined ? {} : { attributes: { balance } }) }).spec;
  const plain = body(), own = plain.attributes.balance.value, raised = body(own + 25), beyond = body(own + 60);
  assert.deepEqual([startLevels(plain, plain), startLevels(raised, plain), startLevels(plain, raised)], [undefined, { own: { balance: own + 25 } }, { target: { balance: own + 25 } }]);
  const trial = (range, done, levels) => ({ start: { phase: "clear", range, ...(levels ? { levels } : {}) }, done, dealt: 0, taken: 0, seconds: 1, recovers: null, down: false });
  const ranges = Array.from({ length: 12 }, (_, k) => .5 + k * .02), measured = { body: "man", skill: "straight-punch/drive", hz: 120, reaction: null }, target = { body: "man" };
  const at = { phase: "clear", range: .6 };
  for (const side of ["own", "target"]) {
    const profile = { measured, target, trials: ranges.flatMap((range) => [trial(range, false), trial(range, true, { [side]: { balance: own + 25 } })]) };
    assert.ok(validProfiles([profile]));
    const done = (striker, struck) => profileReading(profile, striker).expect(at, struck).done;
    const read = side === "own" ? (spec) => done(spec, plain) : (spec) => done(plain, spec);
    assert.deepEqual([read(plain), read(raised), read(beyond)], [0, 1, 1], `${side}'s Balance`);
  }
  const unlevelled = { measured, target, trials: ranges.flatMap((range) => [trial(range, false), trial(range, true)]) };
  assert.equal(profileReading(unlevelled, raised).expect(at, raised).done, profileReading(unlevelled, plain).expect(at, plain).done);
});

test("a zero-length failed profile trial has a finite failed rate", async () => {
  const { profileReading } = await import("../../src/skills/framework/profile.ts");
  const spec = resolveCharacter({ model: "man" }).spec;
  const start = { phase: "clear", range: 1 };
  const reading = profileReading({ target: null, trials: [{ start, done: false, dealt: 0, taken: 0, seconds: 0, recovers: null, down: false }] }, spec);
  assert.equal(reading.rate(start, spec), 0);
  assert.equal(reading.expect(start, spec).done, 0);
  assert.equal(reading.peak("clear", spec), 0);
});
