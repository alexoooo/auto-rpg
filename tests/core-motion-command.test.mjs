/**
 * **A motion command is checked before it acts** (`checkedMotionCommand`, `src/core/control/tasks.ts`):
 * its support loads and bearing edges are copied, frozen and refused when they cannot be met.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkedMotionCommand } from "../src/core/control/tasks.ts";

test("support load requests are detached, frozen and validated before physical actions", () => {
  const frame = { kind: "segment", name: "foot.left" }, model = { channels: [], frames: [frame] };
  const normalLoad = { min: 10, max: 40, pointMin: 1 }, support = { frame, mode: "auto", normalLoad };
  const command = { joints: [], frames: [], grips: [], supports: [support] };
  const checked = checkedMotionCommand(command, model);
  normalLoad.min = 20; frame.name = "absent";
  assert.deepEqual(checked.supports, [{ frame: { kind: "segment", name: "foot.left" }, mode: "auto",
    normalLoad: { min: 10, max: 40, pointMin: 1 } }]);
  assert.throws(() => { checked.supports[0].normalLoad.max = 80; }, TypeError);
  const known = checked.supports[0].frame;
  const withLoad = (load, mode = "auto") => ({ ...command, supports: [{ frame: known, mode, normalLoad: load }] });
  for (const load of [{}, null, [], { min: -1 }, { min: null }, { pointMin: null }, { pointMin: -1 }, { max: Infinity },
    { min: 10, max: 5 }, { pointMin: 2, max: 1 }, { min: NaN }, { max: NaN }]) {
    assert.throws(() => checkedMotionCommand(withLoad(load), { channels: [], frames: [known] }), /invalid support load/);
  }
  assert.throws(() => checkedMotionCommand(withLoad({ max: 0 }, "free"), { channels: [], frames: [known] }), /free support/);
  for (const load of [{ min: 0 }, { max: 0 }, { pointMin: 1 }, { min: 3, max: 3 }]) {
    assert.deepEqual(checkedMotionCommand(withLoad(load), { channels: [], frames: [known] }).supports[0].normalLoad, load);
  }
});

test("bearing edge requests are detached, frozen and validated before physical actions", () => {
  const frame = { kind: "segment", name: "foot.right" }, model = { channels: [], frames: [frame] },
    edge = { from: [-.1, -.05, .1], to: [.1, -.05, .1], radius: .015 },
    command = { joints: [], frames: [], grips: [], supports: [{ frame, mode: "auto", edge }] };
  const checked = checkedMotionCommand(command, model);
  edge.from[0] = 99; edge.radius = 99;
  assert.deepEqual(checked.supports, [{ frame, mode: "auto", edge: { from: [-.1, -.05, .1], to: [.1, -.05, .1], radius: .015 } }]);
  assert.throws(() => { checked.supports[0].edge.to[0] = 99; }, TypeError);
  for (const invalid of [null, {}, { from: [0, 0], to: [1, 0, 0], radius: .1 },
    { from: [0, NaN, 0], to: [1, 0, 0], radius: .1 }, { from: [0, 0, 0], to: [0, 0, 0], radius: .1 },
    ...[0, -1, Infinity, NaN].map(radius => ({ from: [0, 0, 0], to: [1, 0, 0], radius }))])
    assert.throws(() => checkedMotionCommand({ ...command, supports: [{ frame, mode: "auto", edge: invalid }] }, model), /invalid support edge/);
  assert.throws(() => checkedMotionCommand({ ...command, supports: [{ frame, mode: "free", edge }] }, model), /free support/);
});
