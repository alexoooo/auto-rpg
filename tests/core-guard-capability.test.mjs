/**
 * **How closely the guard covers** (`guardSkill`, `src/core/skills/guard.ts`), measured and not a
 * gate (`tests/experimental.json`): a bare hand on the threat's line within 3 cm in 0.3 s, and a
 * club laid across it within its radius (Node core stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD, GUARD_COVER } from "../src/core/skills/guard.ts";
import { apart, covering, segmentsApart } from "./fixtures/guard-cover.mjs";

const WARRIOR = humanSpec("workshop-fighter"), CLUBBED = armed(WARRIOR, "right", woodenClub());

test("a_bare_hand_comes_between_the_threat_and_the_head", async () => {
  const { stand, view, held, place, arms, dispose } = await covering(WARRIOR, ["left"]);
  try {
    stand.step(stand.seconds(1.5));
    const guard = arms(), head = view.head.clone();
    assert.ok(apart(guard, { ...guard, ...GUARD }) < 0.1, "it stands in the guard");
    // A threat 0.8 m before the face.
    held.threat = [head.x, head.y, head.z + 0.8];
    stand.step(stand.seconds(0.3));
    const before = Vector3.Distance(view.fists.left.position, place(held.threat));
    assert.ok(before < 0.03, `the knuckles are ${before} m from the place on the line`);
    assert.ok(Math.abs(Vector3.Distance(view.fists.left.position, view.head) - GUARD_COVER.out) < 0.03, "which is out from the head, not from the threat");
    // The threat a quarter round the head, to its left: the knuckles follow.
    held.threat = [head.x - 0.8, head.y, head.z];
    stand.step(stand.seconds(0.6));
    const beside = Vector3.Distance(view.fists.left.position, place(held.threat));
    assert.ok(beside < 0.03, `the knuckles are ${beside} m from the place at its side`);
    // The other hand was given no cover, and kept the guard.
    assert.ok(apart(arms(), guard, (name) => name.includes(".right ")) < 0.1, `the right arm moved ${apart(arms(), guard, (name) => name.includes(".right "))} rad`);
    // The cover taken away, the arm is the guard's again.
    held.threat = null;
    stand.step(stand.seconds(1));
    assert.ok(apart(arms(), guard) < 0.05, `back in the guard to ${apart(arms(), guard)} rad`);
    assert.equal(view.down, false);
  } finally { dispose(); }
});

test("a_club_is_laid_across_the_threats_line", async () => {
  const { stand, view, held, point, dispose } = await covering(CLUBBED, ["right"]);
  const radius = woodenClub().shapes[1].radius.value;
  /** The swell's axis: its two ends, how near the line from the head to the threat passes it, and the angle it is off square to that line. */
  const laid = () => {
    const from = point("right", "swellFrom"), to = point("right", "swellTo"), threat = Vector3.FromArray(held.threat);
    const along = Vector3.Dot(to.subtract(from).normalize(), threat.subtract(view.head).normalize());
    return { gap: segmentsApart(view.head, threat, from, to), off: Math.abs(Math.asin(along)), up: to.y - from.y };
  };
  try {
    stand.step(stand.seconds(1.5));
    const head = view.head.clone();
    held.threat = [head.x, head.y, head.z + 0.8];
    const uppermost = Math.sign(laid().up);
    assert.ok(uppermost !== 0);
    stand.step(stand.seconds(0.6));
    const ahead = laid();
    assert.ok(ahead.gap < radius, `the threat's line passes ${ahead.gap} m from the swell's axis, whose radius is ${radius}`);
    assert.ok(ahead.off < 0.2, `the swell lies ${ahead.off} rad off square to the line`);
    // A threat from the other side: the club is turned to it the short way, the same end uppermost at every step.
    held.threat = [head.x - 0.8, head.y, head.z];
    let least = Infinity;
    for (let i = 0; i < stand.seconds(1); i++) { stand.step(); least = Math.min(least, uppermost * laid().up); }
    assert.ok(least > 0, `the end that was uppermost was ${least} m over the other at the least`);
    assert.ok(laid().off < 0.4, `and the swell lies ${laid().off} rad off square to the line`);
    assert.equal(view.down, false);
  } finally { dispose(); }
});
