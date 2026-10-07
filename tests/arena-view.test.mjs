import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { arenaCameraRig } from "../src/arena/camera.ts";
import { arenaViewSearch, cameraFocuses, normalizeArenaView, readArenaView } from "../src/arena/view.ts";
import { CAMERA_MODES, PROJECTIONS, VIEW_MODES } from "../src/render/view.ts";
import { keysToMove } from "../src/arena/orders-input.ts";

const defaults = { view: "world", camera: "free", projection: "orthographic", focus: "both" };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} against ${b}`);

test("Arena view addresses preserve the recipe and normalize Chase focus", () => {
  const search = "?play=arena&matchup=workshop-fighter,workshop-fighter&appearance=relic,duelist&you=right&gap=2&balance=0,0&control=combat,classic&held=empty,club&recovery=30";
  assert.deepEqual(readArenaView("", null), defaults);
  assert.deepEqual(readArenaView("?view=wrong&camera=wrong&projection=wrong&focus=wrong", null), defaults);
  assert.deepEqual(cameraFocuses("free"), ["both", "left", "right"]);
  assert.deepEqual(cameraFocuses("isometric"), ["both", "left", "right"]);
  assert.deepEqual(cameraFocuses("chase"), ["left", "right"]);
  for (const camera of CAMERA_MODES) for (const view of VIEW_MODES) for (const projection of PROJECTIONS) for (const focus of cameraFocuses(camera)) {
    const settings = { camera, view, projection, focus }, changed = arenaViewSearch(search, settings);
    assert.deepEqual(readArenaView(changed, "right"), settings);
    const query = new URLSearchParams(changed);
    for (const key of Object.keys(defaults)) query.delete(key);
    assert.deepEqual([...query], [...new URLSearchParams(search)]);
  }
  assert.deepEqual(normalizeArenaView({ ...defaults, camera: "chase" }, "right"), { ...defaults, camera: "chase", focus: "right" });
  assert.deepEqual(readArenaView("?camera=chase", null), { ...defaults, camera: "chase", focus: "left" });
  assert.deepEqual(readArenaView("?camera=chase&focus=left", "right"), { ...defaults, camera: "chase", focus: "left" });
});

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine), camera = new FreeCamera("view", Vector3.Zero(), scene);
  camera.fov = .95;
  const subjects = {
    left: { position: new Vector3(-2, 1, 1), rotation: Quaternion.Identity(), rest: Quaternion.Identity() },
    right: { position: new Vector3(3, 1, -1), rotation: Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0), rest: Quaternion.Identity() },
  };
  const rig = arenaCameraRig(camera, defaults);
  const frames = (aspect = 16 / 9) => {
    for (let i = 0; i < 360; i++) { rig.frame("fight", subjects, 1 / 60, aspect); scene.render(); }
  };
  return { scene, camera, subjects, rig, frames, dispose() { scene.dispose(); engine.dispose(); } };
}

test("Arena focus, projection, zoom and setup use the existing camera", () => {
  const f = fixture();
  try {
    f.frames(); near(f.camera.getTarget().x, .5); near(f.camera.getTarget().z, 0);
    f.rig.choose({ ...defaults, camera: "isometric", focus: "right" }); f.frames();
    assert.equal(f.camera.mode, Camera.ORTHOGRAPHIC_CAMERA);
    near(f.camera.getTarget().x, 3); near(f.camera.getTarget().z, -1);
    near(f.rig.azimuth, Math.PI / 4);
    const delta = f.camera.position.subtract(f.camera.getTarget());
    near(Math.abs(delta.x), Math.abs(delta.y)); near(Math.abs(delta.y), Math.abs(delta.z));
    const top = f.camera.orthoTop;
    f.frames(.5); near(f.camera.orthoRight / f.camera.orthoTop, .5);
    f.rig.zoom(200); f.frames(.5); assert.ok(f.camera.orthoTop > top);
    const at = f.camera.position.clone(); f.rig.orbit(300, 150); f.frames(.5);
    assert.ok(Vector3.Distance(at, f.camera.position) < 1e-6);
    f.rig.choose({ ...defaults, camera: "isometric", projection: "perspective", focus: "right" }); f.frames(.5);
    assert.equal(f.camera.mode, Camera.PERSPECTIVE_CAMERA);
    assert.ok(Vector3.Distance(at, f.camera.position) < 1e-6);
    f.rig.frame("setup", null, 1 / 60, .5);
    f.scene.render();
    assert.equal(f.camera.mode, Camera.PERSPECTIVE_CAMERA); near(f.camera.getTarget().length(), 0);
    f.rig.reset(); f.rig.choose({ ...defaults, focus: "left" }); f.frames();
    near(f.camera.getTarget().x, -2);
    assert.equal(f.scene.cameras.length, 1);
  } finally { f.dispose(); }
});

test("Chase follows each fighter, retains a fallen heading and supplies camera-relative walking", () => {
  const f = fixture();
  try {
    f.rig.orbit(70, -10); f.frames(); const free = f.rig.azimuth;
    for (const [side, angle] of [["left", -.8], ["right", 1.3]]) {
      f.subjects[side].rotation = Quaternion.RotationYawPitchRoll(angle, 0, 0);
      f.rig.choose({ ...defaults, camera: "chase", focus: side }); f.frames();
      near(f.rig.azimuth, angle);
      const move = keysToMove({ up: true, down: false, left: false, right: false }, f.rig.azimuth);
      near(move.x, Math.sin(angle)); near(move.z, Math.cos(angle));
      f.subjects[side].rotation = Quaternion.RotationYawPitchRoll(angle, -Math.PI / 2, 0); f.frames();
      near(f.rig.azimuth, angle);
      f.subjects[side].position.x += 2; f.frames();
      near(f.camera.getTarget().x, f.subjects[side].position.x);
    }
    f.rig.choose(defaults); f.frames(); near(f.rig.azimuth, free);
    f.rig.orbit(-30, 20); f.frames(); assert.notEqual(f.rig.azimuth, free);
  } finally { f.dispose(); }
});
