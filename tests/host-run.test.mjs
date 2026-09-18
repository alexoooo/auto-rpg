import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { begin, defaultMatchup, selectScreen } from "../src/bout.ts";
import { advanceActiveHostTimers, ArenaPresentation, pauseHost, presentRebuiltFrame, restartHost, resumeHost,
  runHostFrame, skimSteps, SKIM_SPEEDS } from "../src/host-run.ts";
import { CONFIG } from "../src/config.ts";

const visibilityTarget = () => {
  const classes = new Set(["gone"]);
  return {
    classes,
    classList: {
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
        return classes.has(name);
      },
    },
  };
};

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

test("pause_reveals_an_in_arena_overlay_without_touching_the_setup_curtain", () => {
  const setup = visibilityTarget();
  const pause = visibilityTarget();
  const presentation = new ArenaPresentation(setup, pause);
  presentation.showSetup(false);

  presentation.showPaused(true);
  assert.equal(setup.classes.has("gone"), true, "the setup screen stays out of the arena");
  assert.equal(pause.classes.has("gone"), false, "the compact pause controls are visible");

  presentation.showPaused(false);
  assert.equal(setup.classes.has("gone"), true, "resuming still does not route through setup");
  assert.equal(pause.classes.has("gone"), true);
});

test("the_pause_overlay_is_a_compact_sibling_and_main_wires_both_targets", async () => {
  const [html, css, main] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/style.css", import.meta.url), "utf8"),
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
  ]);
  const curtainAt = html.indexOf('<div id="curtain">');
  const pauseAt = html.indexOf('<aside id="pause-menu"');
  assert.ok(curtainAt >= 0 && pauseAt > curtainAt);
  const openDivs = html.slice(curtainAt, pauseAt).match(/<div\b/g)?.length ?? 0;
  const closeDivs = html.slice(curtainAt, pauseAt).match(/<\/div>/g)?.length ?? 0;
  assert.equal(openDivs, closeDivs, "pause-menu is outside the setup curtain");
  assert.match(main, /new ArenaPresentation\(curtain, pauseMenu\)/);

  const pauseRule = css.match(/#pause-menu\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(pauseRule, /position:\s*fixed/);
  assert.doesNotMatch(pauseRule, /inset:\s*0/, "pause is not a viewport-sized screen");
  // The two laptop-viewport assertions here read `src/forge/forge.css` and the construct
  // diagnostics drawer it styled. Both went on 2026-09-04 with the Forge; the pause rules
  // above are the part of this test whose subject survives.
});

test("resume_does_not_replay_elapsed_wall_clock", () => {
  const f = fixture();
  pauseHost(f.host);
  assert.equal(resumeHost(f.host), true);
  assert.equal(f.physics, true);
  assert.deepEqual(f.calls.slice(-3), ["screen:false", "physics:true", "start"]);
});

test("a_rebuilt_bout_paints_one_camera_correct_frame_before_the_setup_curtain_can_leave", () => {
  const order = [];
  presentRebuiltFrame({
    placeCamera: () => order.push("camera"),
    updateRoomOcclusion: () => order.push("occlusion"),
    render: () => order.push("render"),
  });
  assert.deepEqual(order, ["camera", "occlusion", "render"]);
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

test("a_paused_frame_freezes_simulation_but_keeps_camera_presentation_live", () => {
  const stages = { mind: 0, combat: 0, arrow: 0, blood: 0, body: 0, camera: 0, occlusion: 0, aim: 0, rig: 0 };
  const advance = () => { for (const name of ["mind", "combat", "arrow", "blood", "body", "aim", "rig"]) stages[name] += 1; };
  const present = () => { stages.camera += 1; stages.occlusion += 1; };
  assert.equal(runHostFrame({ active: false }, advance, present), false);
  assert.deepEqual(stages, { mind: 0, combat: 0, arrow: 0, blood: 0, body: 0, camera: 1, occlusion: 1, aim: 0, rig: 0 });
  assert.equal(runHostFrame({ active: true }, advance, present), true);
  assert.deepEqual(stages, { mind: 1, combat: 1, arrow: 1, blood: 1, body: 1, camera: 2, occlusion: 2, aim: 1, rig: 1 });
});

/**
 * The diagnostics skim, which multiplies the number of fixed steps and never the size of one.
 *
 * `AGENTS.md` carries the trap in as many words -- the solver must never see a variable timestep,
 * and stepping by a raw frame delta was measured at 40 mm of tip wander against 0 mm fixed -- and
 * it cost two sessions. So the assertion that matters is not that four steps happened; it is that
 * **every one of the four was the same size as the one step a speed-1 frame runs**, which is what
 * a mutation scaling the step instead of repeating it would break while still "running 4x". The
 * simulated clock here is the sum of the steps a frame took, so a frame of skim is worth four
 * frames of real time and the step is the step.
 */
test("a_skim_frame_runs_four_fixed_steps_of_the_size_one_frame_runs", () => {
  const FRAME = 1 / CONFIG.world.physicsHz;
  const taken = [];
  const indices = [];
  let presented = 0;
  let clock = 0;
  const advance = (step) => { indices.push(step); taken.push(FRAME); clock += FRAME; };
  const present = () => { presented += 1; };

  // Speed 1 is the arena, and it is the frame that existed before the skim did.
  runHostFrame({ active: true, speed: 1 }, advance, present);
  assert.deepEqual(indices, [0]);
  assert.equal(clock, FRAME);

  taken.length = 0; indices.length = 0; clock = 0;
  runHostFrame({ active: true, speed: 4 }, advance, present);
  // Four runs, handed which run they are on -- the index is what lets the page drive the solver by
  // hand on the three the browser's own `scene.render()` will not cover.
  assert.deepEqual(indices, [0, 1, 2, 3]);
  assert.deepEqual(taken, [FRAME, FRAME, FRAME, FRAME]);
  assert.equal(clock, 4 * FRAME);
  // Presentation is once a frame at every speed: the camera and the room occlusion are about what
  // is on screen, not about what the world did.
  assert.equal(presented, 2);

  // Pause outranks the skim, because pause is an authority gate and the skim is a diagnostic.
  taken.length = 0; indices.length = 0;
  assert.equal(runHostFrame({ active: false, speed: 4 }, advance, present), false);
  assert.deepEqual(indices, []);
  assert.equal(presented, 3);
});

test("a_speed_the_console_typed_is_clamped_rather_than_trusted", () => {
  // `CONFIG` is deliberately mutable from the console and a speed of 400 typed into it would be a
  // hang rather than a fast fight, so the roof is the list's own last entry.
  assert.deepEqual([...SKIM_SPEEDS], [1, 2, 4]);
  assert.equal(skimSteps(undefined), 1, "a host that never heard of the skim runs real time");
  assert.equal(skimSteps(Number.NaN), 1);
  assert.equal(skimSteps(0), 1);
  assert.equal(skimSteps(-8), 1);
  assert.equal(skimSteps(400), SKIM_SPEEDS[SKIM_SPEEDS.length - 1]);
  assert.equal(skimSteps(2.4), 2);
  for (const speed of SKIM_SPEEDS) assert.equal(skimSteps(speed), speed);
});

test("paused_presentation_timers_keep_the_exact_instant_the_player_stopped", () => {
  const timers = { camera: 1.2, hint: 2.4, hand: 3.6 };
  assert.equal(advanceActiveHostTimers({ active: false }, timers, 0.5), timers);
  assert.deepEqual(advanceActiveHostTimers({ active: true }, timers, 0.5), {
    camera: 0.7,
    hint: 1.9,
    hand: 3.1,
  });
});
