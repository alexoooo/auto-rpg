import { profileKey, profileKeys } from "../harness/profile-keys.mjs";
import "../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HUMANOID_MODELS, resolveCharacter } from "../../src/core/bodies/models.ts";
import { sensedSpec } from "../../src/core/bodies/senses.ts";
import { limbHoldsAsMeasured, profilesFor, profilesOn } from "../../src/skills/framework/profile/lookup.ts";
import { struckNumbers } from "../../src/skills/framework/profile/numbers.ts";
import { readProfile } from "../../src/skills/framework/profile/reading.ts";
import { loadData } from "../../src/core/data/store.ts";
import { profileAgainst } from "../../src/skills/framework/profile/across.ts";
import { skillDigest } from "../../research/skills/profile-origin.mjs";
import { record } from "../../src/minds/option/predictions/by-hand.ts";
import { buildBout } from "../../src/app/node/evaluation.ts";
import { recipeOf } from "../../src/app/node/setup.ts";
import { reportNow } from "../../src/minds/seat/apart.ts";

/**
 * Every measured profile (`assets/skills/strikes/strike-profiles/strike-profiles.json`, and the edges' and steps') is of a skill the game has, on a body
 * it builds (`profileKeys`): a profile is read only where its body, its skill and its limb are the reader's
 * (`staleness`), so one keyed to a skill or body that has moved on is never read, and a strike or
 * edge that has none is priced by hand in silence.
 */
test("every measured profile is of a current skill on a current body", () => {
  const keys = profileKeys();
  assert.ok(keys.strike.size > 0 && keys.edge.size > 0, "the presets reached strikes and techniques to key profiles by");
  const stale = [];
  for (const kind of Object.keys(keys)) {
    const path = { strike: "../../assets/skills/strikes/strike-profiles/strike-profiles.json", edge: "../../assets/skills/recovery/edge-profiles.json", step: "../../assets/skills/locomotion/step-profiles.json" }[kind];
    const { profiles } = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    assert.ok(profiles.length > 0, `${path} holds profiles`);
    for (const { measured } of profiles) if (!keys[kind].has(profileKey(measured))) stale.push(`${kind}: ${profileKey(measured)}`);
  }
  assert.deepEqual(stale, [], "profiles keyed to no current skill on a current body: measure them again (research/<kind>-profiles.mjs)");
});

/**
 * **A strike is read by its trials struck at the body it strikes**: a skill measured against
 * several bodies has one profile, each trial recording the body it struck as numbers
 * (`Start.struck`), and a reading takes those struck at the struck body's own (`profileAgainst`),
 * wherever they stand in the file. Read by the first, a Warrior priced its punch at a Warrior from
 * its trials at a Rogue.
 */
test("a strike is read by its trials struck at the body it strikes", () => {
  const { profiles } = JSON.parse(readFileSync(new URL("../../assets/skills/strikes/strike-profiles/strike-profiles.json", import.meta.url), "utf8"));
  const specs = HUMANOID_MODELS.map((model) => resolveCharacter({ model }).spec);
  const skills = new Map(profiles.map(({ measured }) => [profileKey(measured), measured]));
  const wrong = [];
  let read = 0;
  for (const [key, measured] of skills) {
    const found = profilesFor(profiles, { ...measured, reaction: null });
    for (const struck of specs) {
      const at = struckNumbers(struck), alike = (trial) => trial.start.struck?.stature === at.stature && trial.start.struck.mass === at.mass;
      const measuredAt = found.read.flatMap((profile) => profile.trials.filter(alike));
      if (measuredAt.length === 0) continue;
      read++;
      const trials = profileAgainst(found.read, struck)?.trials ?? [];
      if (trials.length !== measuredAt.length || !trials.every(alike)) wrong.push(`${key} at a ${struck.model}: ${trials.filter(alike).length} of ${trials.length} trials struck at its numbers, of ${measuredAt.length}`);
    }
  }
  assert.ok(read > skills.size, `the stored profiles reached a skill measured against several bodies: ${read} readings of ${skills.size} skills`);
  assert.deepEqual(wrong, [], "strikes read by trials struck at another body than the one struck");
});

/**
 * **A foe is modelled by what is measured on its body, never by its character's skills**
 * (`profilesOn`): it read `BodySpec.skills`, which a mind's senses do not show, so a Warrior holding
 * `straight-punch/drive` was modelled as throwing `drive` alone and one holding `moving` as
 * throwing `moving`. The stored profiles hold the Warrior's punch in two variations; each model is
 * read holding its own skills, holding one other variation, and as sensed.
 */
test("a foe is modelled alike whatever skills its character holds", () => {
  const { profiles } = JSON.parse(readFileSync(new URL("../../assets/skills/strikes/strike-profiles/strike-profiles.json", import.meta.url), "utf8"));
  let both = 0;
  for (const model of HUMANOID_MODELS) {
    const spec = resolveCharacter({ model }).spec, on = profiles.filter((profile) => profile.measured.body === model && limbHoldsAsMeasured(profile, spec));
    assert.ok(on.length > 0, `the stored profiles hold a ${model}'s strikes`);
    const skills = [...new Set(on.map(({ measured }) => measured.skill))];
    if (skills.some((skill) => !spec.skills.includes(skill))) both++;
    const { hz, reaction, rate, delay } = on[0].measured, read = (one) => profilesOn(profiles, one, { hz, reaction, rate: rate ?? hz, delay: delay ?? 0 });
    const own = read(spec);
    assert.ok(own.read.length > 0 && own.stale === null, `a ${model} is modelled by measured strikes: ${own.stale}`);
    for (const one of [{ ...spec, skills: [skills.at(-1)] }, sensedSpec(spec)]) assert.deepEqual(read(one), own);
    assert.deepEqual([...new Set(own.read.map(({ measured }) => measured.skill))].sort(), [...skills].sort());
  }
  assert.ok(both > 0, "the stored profiles reached no variation a model's own character does not hold, so a model by its skills would read the same");
});

/**
 * **A body's strikes are each read by their own freshness** (`profilesOn`): it read a body's fresh
 * profiles, else its stale, all together, so a foe with one strike measured at the reader's
 * settings and another at others was modelled without the other, and said nothing. The kicks
 * measured with the Mind at 10 Hz beside the punches at 60 dropped the punches from a 10 Hz
 * reader's model of a Warrior. A family of the man's stored punches is read as measured at another
 * rate beside the rest.
 */
test("a body's strikes measured at different settings are each read, the fresh as fresh", () => {
  const { profiles } = JSON.parse(readFileSync(new URL("../../assets/skills/strikes/strike-profiles/strike-profiles.json", import.meta.url), "utf8"));
  const spec = resolveCharacter({ model: "man" }).spec, on = profiles.filter((profile) => profile.measured.body === "man" && limbHoldsAsMeasured(profile, spec));
  const skills = [...new Set(on.map(({ measured }) => measured.skill))];
  assert.ok(skills.length >= 2, `the stored profiles hold two of a man's strikes: ${skills.join(", ")}`);
  const [moved] = skills, { hz, reaction, rate, delay } = on[0].measured, at = { hz, reaction, rate: rate ?? hz, delay: delay ?? 0 };
  const mixed = profiles.map((profile) => profile.measured.body === "man" && profile.measured.skill === moved ? { ...profile, measured: { ...profile.measured, rate: at.rate / 6 } } : profile);
  const read = profilesOn(mixed, spec, at);
  assert.deepEqual([...new Set(read.read.map(({ measured }) => measured.skill))].sort(), [...skills].sort());
  assert.equal(read.stale, `measured with its mind at ${at.rate / 6} Hz, read at ${at.rate} Hz`);
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


/**
 * Aim-owned data changed without changing the skill digest.
 */
test("a skill's identity includes the selected aim's declared data", async () => {
  await loadData(["aim-audit-a", "aim-audit-b"], { "aim-audit-a": async () => ({ value: 1 }), "aim-audit-b": async () => ({ value: 2 }) });
  const spec = resolveCharacter({ model: "man" }).spec;
  const action = Object.freeze({ name: "audit", executor: "audit", effectors: ["hand.right"], aim: { kind: "audit-aim" } });
  const executors = [Object.freeze({ name: "audit", kind: "audit-executor" })];
  const lookup = key => ({ of(role) { return role === "aim" ? { reads: () => [key] } : {}; } });
  assert.notEqual(skillDigest(lookup("aim-audit-a"), spec, executors, action), skillDigest(lookup("aim-audit-b"), spec, executors, action));
});

/**
 * A failed zero-duration trial produced NaN instead of a failed finite rate.
 */
test("a zero-length failed profile trial has a finite failed rate", () => {
  const spec = resolveCharacter({ model: "man" }).spec;
  const start = { phase: "clear", range: 1 };
  const reading = readProfile({ measured: { body: spec.model, stature: spec.stature.value, skill: "s", hz: 120, reaction: null }, trials: [{ start, done: false, dealt: 0, taken: 0, seconds: 0, recovers: null, down: false }] }, spec);
  assert.equal(reading.rate(start, spec), 0);
  assert.equal(reading.expect(start, spec).done, 0);
  assert.equal(reading.peak("clear", spec), 0);
});
