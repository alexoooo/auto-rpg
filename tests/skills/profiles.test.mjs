import { profileKey, profileKeys } from "../harness/profile-keys.mjs";
import "../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCharacter } from "../../src/core/bodies/models.ts";
import { sensedSpec } from "../../src/core/bodies/senses.ts";
import { limbHoldsAsMeasured, profilesFor, profilesOn } from "../../src/skills/framework/profile/lookup.ts";
import { profileAgainst } from "../../src/skills/framework/profile/across.ts";
import { skillDigest } from "../../research/skills/profile-origin.mjs";
import { record } from "../../src/minds/option/value.ts";
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
test("a strike is read by its trials struck at the body it strikes", async () => {
  const { struckNumbers } = await import("../../src/skills/framework/profile/numbers.ts");
  const { profiles } = JSON.parse(readFileSync(new URL("../../assets/skills/strikes/strike-profiles/strike-profiles.json", import.meta.url), "utf8"));
  const specs = ["man", "woman", "skeleton"].map((model) => resolveCharacter({ model }).spec);
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
 * **A body measured against none reads the measured body nearest its numbers** (`profileAgainst`):
 * no struck body's name finds a table, so a body added is read at the one nearest its stature and
 * mass, and its reading says so (`ProfileReading.scaled`).
 */
test("a body measured against none reads the trials struck at the measured body nearest it", async () => {
  const { readProfile } = await import("../../src/skills/framework/profile/reading.ts");
  const trial = (stature, mass, done) => ({ start: { phase: "clear", range: .6, struck: { stature, mass, steadiness: 50, haste: 50 } }, done, dealt: 0, taken: 0, seconds: 1, recovers: null, down: false });
  const profile = { measured: { body: "man", skill: "s", limb: "hand.left", hz: 120, reaction: null }, trials: [trial(1.77, 79, true), trial(1.62, 15, false)] };
  const man = resolveCharacter({ model: "man" }).spec;
  const body = (stature, mass) => ({ ...man, stature: { ...man.stature, value: stature }, mass: { ...man.mass, value: mass } });
  const tall = body(1.77, 79), light = body(1.62, 15), heavy = body(1.3, 70), small = body(1.7, 20);
  const read = (struck) => profileAgainst([profile], struck).trials.map((one) => one.start.struck.mass);
  assert.deepEqual([read(tall), read(light), read(heavy), read(small)], [[79], [15], [79], [15]]);
  assert.equal(readProfile(profileAgainst([profile], tall), man).scaled(tall), null);
  assert.match(readProfile(profileAgainst([profile], heavy), man).scaled(heavy) ?? "", /measured against a body of 1\.77 m and 79 kg, read against one of 1\.3 m and 70 kg/);
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
  for (const model of ["man", "woman", "skeleton"]) {
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
  const { loadData } = await import("../../src/core/data/store.ts");
  await loadData(["aim-audit-a", "aim-audit-b"], { "aim-audit-a": async () => ({ value: 1 }), "aim-audit-b": async () => ({ value: 2 }) });
  const spec = resolveCharacter({ model: "man" }).spec;
  const action = Object.freeze({ name: "audit", executor: "audit", effectors: ["hand.right"], aim: { kind: "audit-aim" } });
  const executors = [Object.freeze({ name: "audit", kind: "audit-executor" })];
  const lookup = key => ({ of(role) { return role === "aim" ? { reads: () => [key] } : {}; } });
  assert.notEqual(skillDigest(lookup("aim-audit-a"), spec, executors, action), skillDigest(lookup("aim-audit-b"), spec, executors, action));
});

/**
 * **How each body stood is a condition of a profile's trials** (`Start.stance`): a strike thrown
 * from a stagger and one from square are read apart, each body's stance by the trials begun
 * nearest it, beyond their span by the nearest that one did; a start asked at no stance, or a
 * profile that records none, reads as before.
 */
test("a profile whose trials began in two stances is read at the stance nearest each body's", async () => {
  const { readProfile } = await import("../../src/skills/framework/profile/reading.ts");
  const spec = resolveCharacter({ model: "man" }).spec;
  const square = { stagger: 0, width: .25, height: 1 }, staggered = { stagger: .4, width: .25, height: .9 }, beyond = { stagger: .6, width: .25, height: .85 };
  const trial = (range, done, stance) => ({ start: { phase: "clear", range, ...(stance ? { stance } : {}) }, done, dealt: 0, taken: 0, seconds: 1, recovers: null, down: false });
  const ranges = Array.from({ length: 12 }, (_, k) => .5 + k * .02), measured = { body: "man", skill: "straight-punch/drive", hz: 120, reaction: null };
  for (const side of ["own", "target"]) {
    const profile = { measured, trials: ranges.flatMap((range) => [trial(range, false, { [side]: square }), trial(range, true, { [side]: staggered })]) };
    const done = (stance) => readProfile(profile, spec).expect({ phase: "clear", range: .6, ...(stance ? { stance: { [side]: stance } } : {}) }, spec).done;
    assert.deepEqual([done(square), done(staggered), done(beyond)], [0, 1, 1], `${side}'s stance`);
    assert.equal(done(undefined), .5, `${side}: a start asked at no stance reads both`);
  }
  const unrecorded = { measured, trials: ranges.flatMap((range) => [trial(range, false), trial(range, true)]) };
  assert.equal(readProfile(unrecorded, spec).expect({ phase: "clear", range: .6, stance: { own: staggered } }, spec).done,
    readProfile(unrecorded, spec).expect({ phase: "clear", range: .6 }, spec).done);
});

/**
 * **What each body held is a condition of a profile's trials, as numbers** (`Start.held`): no
 * item's name finds a profile, so a strike thrown holding a club and one thrown empty-handed are
 * one profile, read apart by the trials begun nearest what each body holds, by the nearest trials
 * and by the written form alike; a profile that records nothing held reads as before, and says it
 * is read past what its trials held.
 */
test("a profile whose trials began holding two ways is read at what each body holds", async () => {
  const { heldNumbers, startHeld } = await import("../../src/skills/framework/profile/numbers.ts");
  const { readProfile } = await import("../../src/skills/framework/profile/reading.ts");
  const { validProfiles } = await import("../../src/skills/framework/profile/profile.ts");
  const { formReading } = await import("../../src/skills/framework/form.ts");
  const { withLoadout } = await import("../../src/core/bodies/items/held.ts");
  const plain = resolveCharacter({ model: "man" }).spec, club = withLoadout(plain, { left: "empty", right: "club" });
  const held = heldNumbers(club);
  assert.ok(held["hand.right"].mass > 0 && held["hand.right"].reach > 0, `a club has mass and reach: ${JSON.stringify(held)}`);
  assert.deepEqual([startHeld(plain, plain), startHeld(club, plain), startHeld(plain, club)], [undefined, { own: held }, { target: held }]);
  const trial = (range, done, hold) => ({ start: { phase: "clear", range, ...(hold ? { held: hold } : {}) }, done, dealt: 0, taken: 0, seconds: 1, recovers: null, down: false });
  const ranges = Array.from({ length: 12 }, (_, k) => .5 + k * .02), measured = { body: "man", stature: plain.stature.value, skill: "straight-punch/drive", limb: "hand.left", hz: 120, reaction: null };
  const at = { phase: "clear", range: .6 };
  for (const side of ["own", "target"]) {
    const profile = { measured, trials: ranges.flatMap((range) => [trial(range, false), trial(range, true, { [side]: held })]) };
    assert.ok(validProfiles([profile]));
    for (const [kind, reading] of [["nearest", readProfile], ["written", formReading]]) {
      const done = (striker, struck) => reading(profile, striker).expect(at, struck).done;
      const read = side === "own" ? (spec) => done(spec, plain) : (spec) => done(plain, spec);
      assert.deepEqual([read(plain), read(club)].map((x) => Math.round(x * 1e9) / 1e9), [0, 1], `${kind}: ${side}'s club`);
    }
  }
  const empty = { measured, trials: ranges.flatMap((range) => [trial(range, false), trial(range, true)]) };
  assert.equal(readProfile(empty, club).expect(at, club).done, readProfile(empty, plain).expect(at, plain).done);
  assert.equal(readProfile(empty, plain).scaled(plain), null);
  assert.match(readProfile(empty, club).scaled(plain) ?? "", /holding .* at hand\.right/, "a body holding past its trials is read so, and says it");
});

/**
 * **A foe's limb throws what its trials' limb threw, holding or empty** (`limbHoldsAsMeasured`):
 * with no loadout in a profile's key, a club's swing would model an empty-handed foe, and a punch a
 * hand that grips a sword. A limb holds as its trials did or the strike is not read of it; a foot,
 * which holds nothing either way, throws its stomp whatever the hands hold.
 */
test("a foe's limb is read throwing only what its trials' limb threw, holding or empty", async () => {
  const { withLoadout } = await import("../../src/core/bodies/items/held.ts");
  const { heldNumbers } = await import("../../src/skills/framework/profile/numbers.ts");
  const plain = resolveCharacter({ model: "man" }).spec, club = withLoadout(plain, { left: "empty", right: "club" });
  const of = (limb, hold) => ({ measured: { body: "man", skill: "s", limb, hz: 120, reaction: null },
    trials: [{ start: { phase: "clear", range: 1, ...(hold ? { held: { own: heldNumbers(club) } } : {}) }, done: true, dealt: 0, taken: 0, seconds: 1, recovers: null, down: false }] });
  const swing = of("hand.right", true), punch = of("hand.right", false), stomp = of("foot.right", false), offhand = of("hand.left", true);
  assert.deepEqual([swing, punch, stomp, offhand].map((profile) => [limbHoldsAsMeasured(profile, plain), limbHoldsAsMeasured(profile, club)]),
    [[false, true], [true, false], [true, true], [true, true]]);
});

/**
 * A failed zero-duration trial produced NaN instead of a failed finite rate.
 */
test("a zero-length failed profile trial has a finite failed rate", async () => {
  const { readProfile } = await import("../../src/skills/framework/profile/reading.ts");
  const spec = resolveCharacter({ model: "man" }).spec;
  const start = { phase: "clear", range: 1 };
  const reading = readProfile({ measured: { body: spec.model, stature: spec.stature.value, skill: "s", hz: 120, reaction: null }, trials: [{ start, done: false, dealt: 0, taken: 0, seconds: 0, recovers: null, down: false }] }, spec);
  assert.equal(reading.rate(start, spec), 0);
  assert.equal(reading.expect(start, spec).done, 0);
  assert.equal(reading.peak("clear", spec), 0);
});

/**
 * **A pressure table is found by its bodies' numbers** (`pressureTable`): no model or item names
 * one, so a pairing near the bodies measured reads it, and one far from them, or holding otherwise,
 * reads none and is priced by its strikes' rate.
 */
test("a pressure table is read by a pairing near the bodies it measured and by no other", async () => {
  const { pressureBody, pressureTable } = await import("../../src/minds/option/pressure.ts");
  const { withLoadout } = await import("../../src/core/bodies/items/held.ts");
  const man = resolveCharacter({ model: "man" }).spec, skeleton = resolveCharacter({ model: "skeleton" }).spec;
  const near = { ...man, mass: { ...man.mass, value: man.mass.value + 5 } }, club = withLoadout(man, { left: "empty", right: "club" });
  const table = { measured: pressureBody(man), target: pressureBody(man), horizons: [1], bins: [] };
  const found = (striker, struck) => pressureTable([table], striker, struck) === table;
  assert.deepEqual([found(man, man), found(near, man), found(man, near), found(skeleton, man), found(man, skeleton), found(club, man), found(man, club)],
    [true, true, true, false, false, false, false]);
});
