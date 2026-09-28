/**
 * What each human freedom's positive turn should do in the workshop models' reference pose, in the
 * body frame: a lever on the child, and the anatomical direction its end should move. The models
 * stand with arms hanging a little out from the sides, elbows bent forward, hands thumb forward.
 */
import { segmentName } from "../../src/core/human/segments.ts";
import { SIDES } from "../../src/core/human/landmarks.ts";
import { scale, sub } from "../../src/core/spec/vec.ts";

const RIGHT = [1, 0, 0], UP = [0, 1, 0], FORWARD = [0, 0, 1], BACK = [0, 0, -1];

/** Rows of [joint, freedom, lever, direction]. */
export function jointSenses(spec) {
  const segment = (name) => spec.segments.find((s) => s.name === name);
  const line = (name) => sub(segment(name).distal.value, segment(name).proximal.value);
  const rows = [
    ["neck", "flexion", line("head"), FORWARD],
    ["neck", "lateral flexion right", line("head"), RIGHT],
    ["neck", "rotation right", FORWARD, RIGHT],
  ];
  for (const joint of ["thoracic", "lumbar"]) {
    rows.push([joint, "flexion", UP, FORWARD], [joint, "lateral flexion right", UP, RIGHT], [joint, "rotation right", FORWARD, RIGHT]);
  }
  for (const side of SIDES) {
    const s = side === "right" ? 1 : -1;
    const lateral = scale(RIGHT, s), medial = scale(RIGHT, -s);
    const name = (row) => segmentName(row, side);
    const thumbward = scale(segment(name("hand")).right.value, s);
    rows.push(
      [`shoulder.${side}`, "flexion", line(name("upperArm")), FORWARD],
      [`shoulder.${side}`, "abduction", line(name("upperArm")), lateral],
      [`shoulder.${side}`, "internal rotation", line(name("forearm")), medial],
      [`elbow.${side}`, "flexion", line(name("forearm")), UP],
      [`wrist.${side}`, "flexion", line(name("hand")), medial],
      [`wrist.${side}`, "radial deviation", line(name("hand")), FORWARD],
      [`wrist.${side}`, "pronation", thumbward, medial],
      [`hip.${side}`, "flexion", line(name("thigh")), FORWARD],
      [`hip.${side}`, "abduction", line(name("thigh")), lateral],
      [`hip.${side}`, "internal rotation", line(name("foot")), medial],
      [`knee.${side}`, "flexion", line(name("shank")), BACK],
      [`ankle.${side}`, "dorsiflexion", line(name("foot")), UP],
      [`ankle.${side}`, "inversion", UP, lateral],
    );
  }
  return rows;
}
