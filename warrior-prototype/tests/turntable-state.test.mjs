import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/turntable-state.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
const state = await import(moduleUrl);

test("one configured turn wraps to its starting angle", () => {
  assert.ok(Math.abs(state.advanceAngle(0, state.TURN_SECONDS, true)) < 1e-10);
});

test("paused and invalid elapsed time do not move the turntable", () => {
  assert.equal(state.advanceAngle(1.25, 2, false), 1.25);
  assert.equal(state.advanceAngle(1.25, Number.NaN, true), 1.25);
  assert.equal(state.advanceAngle(1.25, -1, true), 1.25);
});

test("manual inspection pauses until the user resumes", () => {
  const initial = state.initialTurntableState(false);
  const paused = state.pauseForInspection(initial);
  assert.equal(paused.playing, false);
  assert.equal(state.toggleTurntable(paused).playing, true);
});

test("reduced motion starts and resets paused", () => {
  const initial = state.initialTurntableState(true);
  assert.equal(initial.playing, false);
  assert.equal(state.resetTurntable({ ...initial, playing: true }).playing, false);
});
