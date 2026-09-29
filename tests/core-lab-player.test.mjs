import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer } from "../src/core-lab/player.ts";

/**
 * A scripted world: a loop of `frames` frames, 10 ms a step, at `live`. `advance` takes one step;
 * `wrapAt` starts the loop again early, which a real routine never does. The clock reads a
 * millisecond later every time it is read.
 */
function world({ frames = 100, live = 40, wrapAt = frames } = {}) {
  const w = {
    running: null, shown: [], changes: [], steps: 0, now: 0,
    timeline: {
      seconds: 0.01,
      live: () => live,
      show: (frame) => { if (frame <= live) w.shown.push(frame); },
    },
    run: (running) => { w.running = running; },
    advance: () => { w.steps++; live = live + 1 >= wrapAt ? 0 : live + 1; },
  };
  w.player = createPlayer(w, (playhead) => w.changes.push(playhead), () => w.now++);
  return w;
}

test("a player starts live, with the world running and its own frame on the nodes", () => {
  const w = world();
  assert.deepEqual(w.player.playhead, { kind: "live" });
  assert.deepEqual([w.running, w.shown, w.changes], [true, [40], [{ kind: "live" }]]);
  assert.equal(w.player.isPaused(), false);
});

test("pausing holds the live frame, and playing from it runs the world on", () => {
  const w = world();
  w.player.setPaused(true);
  assert.deepEqual([w.player.playhead, w.running, w.player.isPaused()], [{ kind: "held", frame: 40 }, false, true]);
  w.player.setPaused(false);
  assert.deepEqual([w.player.playhead, w.running], [{ kind: "live" }, true]);
});

test("a frame behind the live one is held from the recording, and plays on at the world's pace into the world", () => {
  const w = world();
  w.player.setPaused(true);
  w.player.seek(10);
  assert.deepEqual([w.player.playhead, w.running, w.shown.at(-1), w.player.shownFrame()], [{ kind: "held", frame: 10 }, false, 10, 10]);
  w.player.setPaused(false);
  assert.deepEqual(w.player.playhead, { kind: "replaying", frame: 10, carry: 0 });
  assert.equal(w.player.isPaused(), false);
  w.player.tick(35, 0);
  assert.deepEqual([w.player.playhead, w.shown.at(-1), w.running], [{ kind: "replaying", frame: 13, carry: 5 }, 13, false]);
  assert.equal(w.steps, 0, "a replay does not step the world");
  // 27 more frames reach the live one: the world takes over there, with its own frame back on.
  for (let i = 0; i < 3; i++) w.player.tick(90, 0);
  assert.deepEqual([w.player.playhead, w.running, w.shown.at(-1)], [{ kind: "live" }, true, 40]);
});

test("a replay does not leap for a stalled page", () => {
  const w = world({ live: 90 });
  w.player.seek(10);
  w.player.setPaused(false);
  w.player.tick(5000, 0);
  assert.deepEqual(w.player.playhead, { kind: "replaying", frame: 20, carry: 0 });
});

test("a frame ahead of the live one is reached by running the world there, then held", () => {
  const w = world();
  w.player.setPaused(true);
  w.player.seek(10);
  w.player.seek(70);
  assert.deepEqual([w.player.playhead, w.running, w.shown.at(-1), w.player.shownFrame(), w.player.isPaused()],
    [{ kind: "seeking", frame: 70 }, false, 40, null, true], "the world's own frame goes back on before it steps");
  w.player.tick(16, w.now + 1000);
  assert.deepEqual([w.player.playhead, w.steps, w.running, w.shown.at(-1)], [{ kind: "held", frame: 70 }, 30, false, 70]);
});

test("a seek runs the world only within its budget, and goes on next frame", () => {
  const w = world();
  w.player.seek(70);
  // The clock reads once a step: a budget of 10 readings is 10 steps.
  w.player.tick(16, w.now + 10);
  assert.deepEqual([w.player.playhead, w.steps], [{ kind: "seeking", frame: 70 }, 10]);
  w.player.tick(16, w.now + 1000);
  assert.deepEqual([w.player.playhead, w.steps], [{ kind: "held", frame: 70 }, 30]);
});

test("pausing a seek holds where the world got to; playing one runs the world on from there", () => {
  const paused = world();
  paused.player.seek(70);
  paused.player.tick(16, paused.now + 10);
  paused.player.setPaused(true);
  assert.deepEqual([paused.player.playhead, paused.running], [{ kind: "held", frame: 50 }, false]);
  const played = world();
  played.player.seek(70);
  played.player.tick(16, played.now + 10);
  played.player.setPaused(false);
  assert.deepEqual([played.player.playhead, played.running], [{ kind: "live" }, true]);
});

test("a seek whose loop starts again before the frame holds where the new loop is", () => {
  const w = world({ wrapAt: 60 });
  w.player.seek(70);
  w.player.tick(16, w.now + 1000);
  assert.deepEqual([w.player.playhead, w.steps], [{ kind: "held", frame: 0 }, 20]);
});

test("ticks move nothing while live or held", () => {
  const w = world();
  w.player.tick(1000, w.now + 1000);
  w.player.setPaused(true);
  w.player.tick(1000, w.now + 1000);
  assert.deepEqual([w.player.playhead, w.steps, w.changes.length], [{ kind: "held", frame: 40 }, 0, 2]);
});
