import test from "node:test";
import assert from "node:assert/strict";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { armedActions } from "../src/core/tactics/action-config.ts";
import { partLookup, MINDS } from "../src/entrants/game.ts";
import { withLoadout } from "../src/core/items/held.ts";
import { regionSegments } from "../src/core/intent/action-aim.ts";
import { dummyPart, dummyParts, dummySpec } from "../src/lab/dummy-spec.ts";
import { attackTargetPart, attackTargetWarnings } from "../src/lab/attack-target.ts";
import { labAddress, labHref } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { startAttack } from "../src/lab/attack-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("Lab dummy choices construct their real part, preserve anatomical regions, and travel in links", () => {
  for (const model of HUMANOID_MODELS) {
    const spec = modelSpec(model), parts = dummyParts(spec);
    assert.ok(parts.includes(spec.marks.high) && spec.marks.middle.some(part => parts.includes(part)) && spec.marks.legs.some(part => parts.includes(part)));
    for (const part of parts) {
      const target = dummySpec(spec, part);
      assert.deepEqual(target.segments.map(segment => segment.name), [part]);
      assert.equal(target.mass.value, spec.segments.find(segment => segment.name === part).mass.value);
      for (const mark of ["middle", "legs"]) assert.deepEqual(regionSegments(target, { kind: "mark", mark }), spec.marks[mark].includes(part) ? [part] : []);
      const address = labAddress(`?scenario=attack&model=${model}&targetPart=${part}`);
      assert.equal(address.targetPart, part);
      assert.deepEqual(labAddress(labHref(address)), address);
    }
    // Unnamed or unknown, the target part is the one the Attack's default mind aims at most.
    const aimed = attackTargetPart(spec, labAddress(`?scenario=attack&model=${model}`).mind);
    assert.ok(parts.includes(aimed));
    assert.equal(labAddress(`?scenario=attack&model=${model}`).targetPart, aimed);
    assert.equal(labAddress(`?scenario=attack&model=${model}&targetPart=missing`).targetPart, aimed);
    assert.equal(dummyPart(spec, "missing"), spec.marks.high);
    assert.equal(new URLSearchParams(labHref({ ...labAddress(`?model=${model}`), targetPart: "missing" })).has("targetPart"), false);
  }
});

test("Attack compatibility uses declared regions and armed actions without rewriting the kit", () => {
  const spec = modelSpec("workshop-fighter"), config = MINDS.option.config, before = JSON.stringify(config);
  const middle = spec.marks.middle[0], leg = spec.marks.legs[0];
  const usable = armedActions(partLookup, spec, config.executors, config.actions);
  assert.ok(usable.length > 0, "the fixture has bare-hand actions");
  assert.equal(attackTargetWarnings(spec, config, spec.marks.high).length, usable.length);
  assert.deepEqual(attackTargetWarnings(spec, config, middle), []);
  const aimed = regions => ({ ...config, actions: [{ ...usable[0], regions }] });
  assert.deepEqual(attackTargetWarnings(spec, aimed([{ kind: "mark", mark: "legs" }]), leg), []);
  assert.deepEqual(attackTargetWarnings(spec, aimed([{ kind: "segment", segment: middle }]), middle), []);
  assert.equal(attackTargetWarnings(spec, aimed([{ kind: "segment", segment: "missing" }]), middle).length, 1);
  assert.match(attackTargetWarnings(spec, { ...config, executors: [], actions: [] }, middle)[0], /No actions are available/);
  const held = withLoadout(spec, { left: "empty", right: "club" });
  assert.ok(armedActions(partLookup, held, config.executors, config.actions).some(action => action.name === "club-blow"), "the club's blow is armed where the hand holds the club");
  assert.deepEqual(attackTargetWarnings(held, config, middle), []);
  assert.equal(JSON.stringify(config), before);
});

test("the Attack field builds the selected torso and orders its mind at it", async () => {
  const spec = modelSpec("workshop-fighter"), config = MINDS.option.config, part = spec.marks.middle[0];
  const stand = await coreStand(spec), actor = labActor(stand.built, stand.world, { mind: config }), targets = [];
  const attack = startAttack(actor, { seed: 1, count: 1, targetPart: part, hears(built) { targets.push(built.spec); return { dispose() {} }; } });
  try {
    assert.equal(targets.length, 1, "the fixture spawned a physical target before running");
    assert.deepEqual(targets[0].marks.middle, [part]);
    const id = attack.state.targets[0].id;
    attack.select(id);
    stand.step();
    assert.equal(attack.state.selected, id, "the selected target is the one the mind is ordered at");
  } finally { attack.dispose(); stand.dispose(); }
});
