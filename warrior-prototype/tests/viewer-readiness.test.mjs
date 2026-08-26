import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceStage, isViewerVisible, stageIndex, stageMessage, VIEWER_STAGE_MESSAGES,
} from "../app/viewer-readiness.ts";

test("a constructed scene is not a visible scene", () => {
  // The regression this file exists for: the viewer cleared its status as soon
  // as the scene object existed, so seconds of shader compilation looked like a
  // dead black canvas. Building the scene may never reach the terminal stage.
  const built = advanceStage("loading", "scene-built");
  assert.notEqual(built, "ready");
  assert.equal(isViewerVisible(built), false);
  assert.notEqual(stageMessage(built), "");
});

test("only a rendered frame clears the status", () => {
  let stage = "loading";
  for (const event of ["scene-built", "assets-ready"]) {
    stage = advanceStage(stage, event);
    assert.equal(isViewerVisible(stage), false, `${event} must not clear the status`);
  }
  assert.equal(advanceStage(stage, "frame-rendered"), "ready");
  assert.equal(isViewerVisible("ready"), true);
  assert.equal(stageMessage("ready"), "");
});

test("out-of-order events cannot skip ahead", () => {
  assert.equal(advanceStage("loading", "frame-rendered"), "loading");
  assert.equal(advanceStage("loading", "assets-ready"), "loading");
  assert.equal(advanceStage("parsing", "frame-rendered"), "parsing");
  assert.equal(advanceStage("parsing", "scene-built"), "parsing");
});

test("every stage before ready shows the viewer is still working", () => {
  for (const [stage, message] of Object.entries(VIEWER_STAGE_MESSAGES)) {
    if (stage === "ready") continue;
    assert.notEqual(message, "", `${stage} must tell the viewer something is happening`);
  }
});

test("stages advance monotonically", () => {
  const events = ["scene-built", "assets-ready", "frame-rendered"];
  let stage = "loading";
  for (const event of events) {
    const next = advanceStage(stage, event);
    assert.ok(stageIndex(next) > stageIndex(stage), `${event} must move forward`);
    stage = next;
  }
  assert.equal(advanceStage("ready", "scene-built"), "ready");
});
