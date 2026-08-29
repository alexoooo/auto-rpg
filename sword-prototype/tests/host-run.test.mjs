import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { begin, defaultMatchup, selectScreen } from "../src/bout.ts";
import { advanceActiveHostTimers, ArenaPresentation, pauseHost, presentRebuiltFrame, restartHost, resumeHost,
  runActiveHostFrame } from "../src/host-run.ts";

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
  const [html, css, forgeCss, main] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/style.css", import.meta.url), "utf8"),
    readFile(new URL("../src/forge/forge.css", import.meta.url), "utf8"),
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
  const laptopDiagnostics = forgeCss.match(/@media \(max-width: 1400px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(laptopDiagnostics, /#arena-construct-diagnostics\s*\{[^}]*width:\s*min\(420px,/,
    "expanded diagnostics must preserve most of a laptop viewport for the fight");
  assert.match(laptopDiagnostics, /\.diagnostic-columns\s*\{[^}]*grid-template-columns:\s*1fr/,
    "the narrow evidence drawer scrolls vertically instead of widening over the arena");
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

test("a_paused_frame_advances_no_mind_combat_arrow_blood_body_or_presentation_transform", () => {
  const stages = { mind: 0, combat: 0, arrow: 0, blood: 0, body: 0, camera: 0, occlusion: 0, aim: 0, rig: 0 };
  const frame = () => { for (const name of Object.keys(stages)) stages[name] += 1; };
  assert.equal(runActiveHostFrame({ active: false }, frame), false);
  assert.deepEqual(stages, { mind: 0, combat: 0, arrow: 0, blood: 0, body: 0, camera: 0, occlusion: 0, aim: 0, rig: 0 });
  assert.equal(runActiveHostFrame({ active: true }, frame), true);
  assert.deepEqual(stages, { mind: 1, combat: 1, arrow: 1, blood: 1, body: 1, camera: 1, occlusion: 1, aim: 1, rig: 1 });
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
