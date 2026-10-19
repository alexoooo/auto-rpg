import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { SEARCH_FALL, startStance } from "../src/lab/stance-mode.ts";

// A two-shove Lab fall: as the body folds, a geometric contact between two of its own segments
// keeps the impulse it last bore while the solver gave the pair none this step.
test("discarded geometric contacts contribute no load to current solver contacts", async () => {
  const spec = modelSpec("workshop-fighter");
  const f = await coreStand(spec, { engine: "rapier-coordinate", posture: guardPosture(spec), groundSize: 40 });
  const stance = startStance(labActor(f.built, f.world, { mind: { ...LAB_PRESETS.script.config, subs: [] } }));
  try {
    f.world.step(240);
    stance.shove(SEARCH_FALL.impulse, SEARCH_FALL.degrees); f.world.step(24); stance.shove(SEARCH_FALL.impulse, SEARCH_FALL.degrees);
    const parts = [...f.built.segments.values()], raw = () => f.world.physics.raw;
    let found = 0;
    for (let step = 0; step < 4 * 120; step++) {
      f.world.step();
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const [a, b] = [parts[i].body, parts[j].body], geometric = [], solver = [];
        let given = 0;
        for (let m = 0; m < a.rigid.numColliders(); m++) for (let n = 0; n < b.rigid.numColliders(); n++)
          raw().narrowPhase.contactPair(a.rigid.collider(m).handle, b.rigid.collider(n).handle, raw().bodies, (manifold) => {
            for (let k = 0; k < manifold.numContacts(); k++) geometric.push(manifold.contactImpulse(k));
            for (let k = 0; k < manifold.numSolverContacts(); k++) solver.push(manifold.solverContactSeparation(k));
            given += manifold.totalSolverContactImpulse();
          });
        if (!(geometric.some((impulse) => impulse > 0) && solver.length > 0 && given === 0)) continue;
        found++;
        const contacts = f.world.physics.contactsOf(a, (other) => other === b);
        assert.equal(contacts.length, 1, "predictive contacts remain observable");
        assert.deepEqual(contacts.map(({ impulse, pairs }) => ({ impulse, pairs })), [{ impulse: 0, pairs: [] }]);
        const manifolds = f.world.physics.contactManifoldsOf(a, (other) => other === b);
        assert.deepEqual(manifolds.map(({ impulse }) => impulse), [0]);
        assert.deepEqual(manifolds.flatMap(({ points }) => points.map(({ distance }) => distance)), solver);
      }
    }
    assert.ok(found > 0, "the fall never left a cached impulse on a pair the solver gave none: the fixture did not reach its case");
  } finally { stance.dispose(); f.dispose(); }
});
