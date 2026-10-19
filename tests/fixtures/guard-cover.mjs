/** **A standing body whose guard covers a threat** (`guardSkill`, `src/core/skills/guard.ts`), as the guard's tests read it. */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../../src/core/body.ts";
import { driveBy } from "../../src/core/mind/tactics.ts";
import { GUARD_COVER } from "../../src/core/skills/guard.ts";
import { coreStand } from "../harness/core-stand.mjs";

/**
 * `spec` standing under its skills, each hand of `covering` given a cover of `stand.threat` (world)
 * while there is one, guarded its head; the other in the plain guard.
 */
export async function covering(spec, hands) {
  const stand = await coreStand(spec, { ground: true });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const held = { threat: null };
  driveBy(body, { name: "covers", decide: ({ view }) => {
    const cover = (hand) => held.threat && hands.includes(hand) ? { threat: held.threat, guarded: view.head.asArray() } : null;
    return { move: null, face: 0, guard: { left: cover("left"), right: cover("right") }, actions: [] };
  } });
  const { view } = body;
  return {
    stand, body, view, held,
    /** A point of a hand's rigid body, world. */
    point: (hand, name) => view.effectors[`hand.${hand}`].points[name].clone().applyRotationQuaternion(view.root.rotation).addInPlace(view.root.position),
    /** Where a cover of `threat` puts its point, or its two points' middle: `out` from the head toward it. */
    place: (threat) => view.head.add(Vector3.FromArray(threat).subtract(view.head).normalize().scale(GUARD_COVER.out)),
    /** The arms' angles, by channel. */
    arms: () => Object.fromEntries(Object.entries(view.angles).filter(([name]) => /^(shoulder|elbow|wrist)\./.test(name))),
    dispose() { body.dispose(); stand.dispose(); },
  };
}

/** The most two records of angles differ by, rad, over the channels `of` names. */
export const apart = (a, b, of = () => true) => Math.max(...Object.keys(a).filter(of).map((name) => Math.abs(a[name] - b[name])));

/** How near two segments pass, m: `a` to `b`, and `c` to `d`. */
export function segmentsApart(a, b, c, d) {
  const u = b.subtract(a), v = d.subtract(c), w = a.subtract(c);
  const uu = Vector3.Dot(u, u), uv = Vector3.Dot(u, v), vv = Vector3.Dot(v, v), uw = Vector3.Dot(u, w), vw = Vector3.Dot(v, w);
  const clamp = (x) => Math.max(0, Math.min(1, x)), den = uu * vv - uv * uv;
  let s = den > 1e-12 ? clamp((uv * vw - vv * uw) / den) : 0;
  const t = clamp((uv * s + vw) / vv);
  s = clamp((uv * t - uw) / uu);
  return Vector3.Distance(a.add(u.scale(s)), c.add(v.scale(t)));
}
