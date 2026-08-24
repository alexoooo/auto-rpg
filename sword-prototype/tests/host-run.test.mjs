import assert from "node:assert/strict";
import test from "node:test";

import { begin, defaultMatchup, selectScreen } from "../src/bout.ts";
import { pauseHost, restartHost, resumeHost, runActiveHostFrame } from "../src/host-run.ts";

const fixture = () => {
  const calls = [];
  let active = true;
  let physics = true;
  const host = {
    get active() { return active; },
    setPhysics(value) { physics = value; calls.push(`physics:${value}`); },
    startControls() { active = true; calls.push("start"); },
    pauseControls() { active = false; calls.push("pause"); },
    showPaused(value) { calls.push(`screen:${value}`); },
    rebuild() { calls.push("rebuild"); },
  };
  return { host, calls, get active() { return active; }, get physics() { return physics; } };
};

test("blur_and_hidden_visibility_pause_once_and_never_resume", () => {
  const f = fixture();
  assert.equal(pauseHost(f.host), true);
  assert.equal(pauseHost(f.host), false, "a second focus-loss edge is inert");
  assert.equal(f.active, false);
  assert.deepEqual(f.calls, ["physics:false", "pause", "screen:true"]);
});

test("resume_does_not_replay_elapsed_wall_clock", () => {
  const f = fixture();
  pauseHost(f.host);
  assert.equal(resumeHost(f.host), true);
  assert.equal(f.physics, true);
  assert.deepEqual(f.calls.slice(-3), ["screen:false", "physics:true", "start"]);
});

test("restart_button_rebuilds_once_clears_the_verdict_and_resumes", () => {
  const f = fixture();
  pauseHost(f.host);
  const fighting = begin(selectScreen(defaultMatchup()), defaultMatchup());
  const over = { ...fighting, phase: "over", clock: 12, outcome: { text: "done" } };
  const fresh = restartHost(over, f.host, true);
  assert.equal(fresh.phase, "fight");
  assert.equal(fresh.clock, 0);
  assert.equal(fresh.outcome, null);
  assert.equal(f.calls.filter((call) => call === "rebuild").length, 1);
  assert.equal(f.active, true);
});

test("a_paused_frame_advances_no_mind_combat_arrow_blood_body_or_presentation_transform", () => {
  const stages = { mind: 0, combat: 0, arrow: 0, blood: 0, body: 0, camera: 0, occlusion: 0, aim: 0, rig: 0 };
  const frame = () => { for (const name of Object.keys(stages)) stages[name] += 1; };
  assert.equal(runActiveHostFrame({ active: false }, frame), false);
  assert.deepEqual(stages, { mind: 0, combat: 0, arrow: 0, blood: 0, body: 0, camera: 0, occlusion: 0, aim: 0, rig: 0 });
  assert.equal(runActiveHostFrame({ active: true }, frame), true);
  assert.deepEqual(stages, { mind: 1, combat: 1, arrow: 1, blood: 1, body: 1, camera: 1, occlusion: 1, aim: 1, rig: 1 });
});
