import assert from "node:assert/strict";
import test from "node:test";

import { actionFromCommand } from "../scripts/clone-policy.mjs";
import {
  COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES, freshCommand,
} from "../src/golem/tactics-v4.ts";
import { commandFromAction } from "../src/golem/policy.ts";

/**
 * The inverse that produces every training label in CR.
 *
 * A defect here does not crash and does not fail a gate: it writes a dataset whose targets are
 * quietly wrong, fits a clone to them, and reports an honest R2 against the wrong answer. So the
 * property asserted is the round trip against the decoder that actually runs at inference, rather
 * than against arithmetic restated here -- restating it would pass equally well if both copies
 * were wrong in the same way.
 */
const roundTrip = (command) => commandFromAction(
  actionFromCommand(command, COMMAND_RANGES, COMMAND_AXES, COMMAND_GATES), freshCommand(),
);

test("a_command_in_range_survives_the_trip_through_the_action_space_unchanged", () => {
  const command = {
    ...freshCommand(),
    standOff: 1.4, strafe: -0.3, lean: 0.25, advance: -0.75,
    targetHeight: 0.62, targetLateral: 0.1, reach: -0.4, swing: 0.8, bite: 0.33,
    commit: 1, abort: 0, parry: 1,
  };
  const back = roundTrip(command);
  for (const axis of COMMAND_AXES) {
    assert.ok(Math.abs(back[axis] - command[axis]) < 1e-12, `${axis}: ${back[axis]}`);
  }
  for (const gate of COMMAND_GATES) assert.equal(back[gate], command[gate], gate);
});

test("each_axis_is_centred_on_its_own_published_range_and_not_on_zero", () => {
  // `standOff` is the one that would catch a centre-on-zero mistake: its range is 0..2, so its
  // neutral is 1 and a naive `value / high` would map the fencer's shipped stand-off onto +0.5.
  const at = (over) => actionFromCommand(
    { ...freshCommand(), ...over }, COMMAND_RANGES, COMMAND_AXES, COMMAND_GATES,
  );
  const standOff = COMMAND_AXES.indexOf("standOff");
  assert.equal(at({ standOff: 1 })[standOff], 0, "the neutral stand-off is the zero of the axis");
  assert.equal(at({ standOff: 2 })[standOff], 1);
  assert.equal(at({ standOff: 0 })[standOff], -1);
  // `swing` is 0..1 rather than -1..+1, so its midpoint is a half and a shared centre would be
  // wrong by the whole half-width.
  const swing = COMMAND_AXES.indexOf("swing");
  assert.equal(at({ swing: 0.5 })[swing], 0);
  assert.equal(at({ swing: 1 })[swing], 1);
  assert.equal(at({ swing: 0 })[swing], -1);
});

test("a_command_outside_its_range_clips_rather_than_teaching_a_target_the_body_refuses", () => {
  // The executor clamps a command it is handed and counts the refusal, so a label carrying the
  // unclamped value would train the clone toward a number no body will ever act on.
  const out = actionFromCommand(
    { ...freshCommand(), standOff: 9, strafe: -4, swing: 3 },
    COMMAND_RANGES, COMMAND_AXES, COMMAND_GATES,
  );
  assert.equal(out[COMMAND_AXES.indexOf("standOff")], 1);
  assert.equal(out[COMMAND_AXES.indexOf("strafe")], -1);
  assert.equal(out[COMMAND_AXES.indexOf("swing")], 1);
  const back = roundTrip({ ...freshCommand(), standOff: 9 });
  assert.equal(back.standOff, 2, "it decodes to the roof the executor would have clamped to");
});

test("a_gate_is_a_bit_and_the_target_is_the_bit_rather_than_the_number_that_carried_it", () => {
  // `meanAction` thresholds a gate logit at **zero**, and only then does `commandFromAction` see a
  // value already one or nought. What this pins is the label side: whatever a mind writes into a
  // gate field, the target handed to the fit is 1 or 0 and nothing between.
  const gateAt = COMMAND_AXES.length + COMMAND_GATES.indexOf("commit");
  const at = (commit) => actionFromCommand(
    { ...freshCommand(), commit }, COMMAND_RANGES, COMMAND_AXES, COMMAND_GATES,
  )[gateAt];
  assert.equal(at(1), 1);
  assert.equal(at(0), 0);
  assert.equal(at(0.5), 1, "the boundary belongs to the raised side");
  assert.equal(at(0.49), 0);
  assert.equal(at(0.9), 1, "a gate is never handed to the fit as a fraction");
});

test("every_axis_and_gate_the_surface_publishes_has_a_slot_in_the_action", () => {
  // A surface that grows a field and an inverse that does not is the defect this catches: the new
  // field would be silently dropped from every label and the clone would never learn it.
  const out = actionFromCommand(freshCommand(), COMMAND_RANGES, COMMAND_AXES, COMMAND_GATES);
  assert.equal(out.length, COMMAND_AXES.length + COMMAND_GATES.length);
  assert.equal(out.length, 12, "nine axes and three gates, in head order");
  for (const axis of COMMAND_AXES) assert.ok(COMMAND_RANGES[axis] !== undefined, axis);
});
