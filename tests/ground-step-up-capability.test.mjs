import test from "node:test";
import assert from "node:assert/strict";
import { risingTrial } from "../research/rising-trial.mjs";

test("a Warrior placed half kneeling joins the route there and stands, at Balance 0, within 4.5 s", async () => {
  const r = await risingTrial({ id: 0, model: "workshop-fighter", held: "empty", seed: 2, start: "placed", posture: "half-kneel",
    sub: "stand-up", techniques: ["step-up"], balance: 0, cap: 6 });
  assert.deepEqual([r.status, r.handBackReason], ["stood", "ready"]);
  assert.ok(r.handback <= 4.5, `handed back at ${r.handback} s`);
  assert.deepEqual(r.attempts.map(a => [a.technique, a.end]), [["step-up", "done"], ["steady", "ready"]]);
  // Joined at its half kneel: it never lay slack to read its lie, nor rolled.
  assert.deepEqual(Object.keys(r.phases).sort(), ["execute", "idle", "rise", "steady"]);
  assert.ok(r.phases.idle <= .25 + 1e-9, `waited ${r.phases.idle} s for its reading`);
  assert.deepEqual(r.assist, { forcePeak: 0, momentPeak: 0, forceImpulse: 0, momentImpulse: 0 });
});
