/**
 * One club blow by a core human, scored by the energy it brings to an opponent's head: the damage
 * unit's reading (stage 5 of `docs/plans/2026-09-28-core-foundation.md`).
 *
 * The human holds the wooden club in one hand (`armed`, `woodenClub`), stands on its own feet on
 * the core stand and throws the blow from there, as `core-strike.mjs`'s straights are thrown
 * (`throwBlow` in `core-blow.mjs`): it stands in the lab's guard, holds a chamber pose, then pushes
 * a chosen set of freedoms, each from a chosen moment for a chosen time at a chosen activation;
 * every other freedom is servoed to the guard, and the legs are the stance's. The wrist is pushed
 * here, all three of its freedoms: a club is swung with it.
 *
 * **The target is an opponent's head**: a sphere of the striker's head capsule's radius, at its own
 * head's centre, as it stands when the blow begins, moved straight ahead by a chosen distance. **The blow lands** where the club's
 * swell (its capsule, `woodenClub`) first touches the sphere, found within each step by carrying
 * the hand's pose between the step's ends (its origin in a line, its turn by slerp) at `SUB`
 * points. The closing speed is the club's velocity there along the contact's normal, from the
 * hand body's (its centre's, plus its spin across).
 *
 * **Its energy** is `impactEnergy` of the two masses the contact meets (`contactMass`), joints free
 * and bodies floating: the club's at its contact point along the normal, with the striker's pose at
 * the end of the step it lands in; and the head's at the struck point, which is the Warrior's own
 * head as it stood when the blow began, turned to face the striker. A search's `score` is that
 * energy, or, for a club that never arrives, minus how far its swell passed from the sphere, or,
 * for a body that falls first, `FELL`.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { contactMass } from "../src/core/build/contact-mass.ts";
import { heldPoint } from "../src/core/build/rigid.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { centreNow, inFrameOf, STAND, throwBlow } from "./core-blow.mjs";
import { FELL, perturbed } from "./core-strike.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

export const CORE_CLUB_HARNESS = "Node core stand, standing on its feet as built, ground on; a club blow into a head-sized sphere";

/** Seconds to watch after the chamber. */
const WINDOW = 0.5;
/** Points a step is read at between its ends. */
const SUB = 16;

/** The freedoms a club blow with `hand` may push, and those its chamber poses. */
export const clubPushed = (hand) => [
  "thoracic rotation right", "lumbar rotation right", "thoracic flexion", "thoracic lateral flexion right", "lumbar flexion",
  `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`, `wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`,
];
export const clubChambered = (hand) => [
  "thoracic rotation right", `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`, `wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`,
];

/** The search's bounds, each mapped from [-1, 1]; a chamber goal spans its freedom's range. */
const BOUNDS = { chamberSeconds: [0.1, 0.6], from: [0, 0.3], length: [0, 0.3], distance: [0.4, 1.4] };
const OFF = 0.1;

export const clubDimensions = (hand) => 1 + clubChambered(hand).length + 3 * clubPushed(hand).length + 1;

const map = (u, [lo, hi]) => lo + (Math.max(-1, Math.min(1, u)) + 1) / 2 * (hi - lo);

/** The blow and the target distance that `unit` (numbers in [-1, 1]) stands for, on `spec`. */
export function decodeClub(unit, spec, hand = "right") {
  const ranges = new Map(spec.joints.flatMap((j) => j.dofs.map((d) => [`${j.name} ${d.positive}`, [d.min.value, d.max.value]])));
  let k = 0;
  const seconds = map(unit[k++], BOUNDS.chamberSeconds);
  const pose = Object.fromEntries(clubChambered(hand).map((name) => [name, map(unit[k++], ranges.get(name))]));
  const pushes = [];
  for (const channel of clubPushed(hand)) {
    const level = Math.max(-1, Math.min(1, unit[k++])), from = map(unit[k++], BOUNDS.from), length = map(unit[k++], BOUNDS.length);
    if (Math.abs(level) >= OFF && length > 0) pushes.push({ channel, sense: level > 0 ? 1 : -1, from, to: from + length, level: Math.abs(level) });
  }
  const distance = map(unit[k++], BOUNDS.distance);
  return { strike: { name: `searched ${hand} club blow`, hand, chamber: { seconds, pose }, pushes }, distance };
}

/** The point of segment AB nearest `c`, and its parameter. */
function nearestOn(a, b, c, out) {
  const ab = b.subtract(a), t = Math.max(0, Math.min(1, Vector3.Dot(c.subtract(a), ab) / ab.lengthSquared()));
  return { t, point: out.copyFrom(a).addInPlace(ab.scaleInPlace(t)) };
}

/**
 * Run a club blow on `model` at `hz`: the one `unit` stands for, or a given `strike` at `distance`.
 * Returns the score, the energy and its parts, when it landed after the chamber, and the swell
 * end's peak speed before it.
 */
export async function evaluateClubStrike({ model = "workshop-fighter", unit, hz = 120, hand = "right", perturbation, ...given }) {
  const club = woodenClub(), spec = armed(humanSpec(model), hand, club);
  const decoded = unit ? decodeClub(unit, spec, hand) : given;
  const strike = perturbation ? perturbed(decoded.strike, perturbation) : decoded.strike, distance = decoded.distance;
  const chamber = strike.chamber ?? { seconds: 0 };
  const R = spec.segments.find((s) => s.name === "head").shape.radius.value;
  const [held] = spec.held, swell = club.shapes[1], r = swell.radius.value;
  const stand = await coreStand(spec, { ground: true, hz });
  const blow = throwBlow(stand.built, stand.world, strike);
  const segment = stand.built.segments.get(`hand.${hand}`), head = stand.built.segments.get("head");
  // The swell's ends and the hand's centre, in the hand's own frame.
  const ends = [heldPoint(held, swell.from).value, heldPoint(held, swell.to).value].map((p) => inFrameOf(segment, p));
  const centre = inFrameOf(segment, segment.rigid.centre);
  const striker = contactMass(stand.built), struck = contactMass(stand.built);
  const last = { position: new Vector3(), rotation: new Quaternion(), velocity: new Vector3(), spin: new Vector3() };
  const now = { position: new Vector3(), rotation: new Quaternion(), velocity: new Vector3(), spin: new Vector3() };
  const read = (into) => {
    into.position.copyFrom(segment.node.position);
    into.rotation.copyFrom(segment.node.rotationQuaternion);
    segment.body.getLinearVelocityToRef(into.velocity);
    segment.body.getAngularVelocityToRef(into.spin);
  };
  const place = (position, rotation, local) => local.applyRotationQuaternion(rotation).addInPlace(position);
  let landed = null, nearest = Infinity, peak = 0, watching = false, headCentre = null, target = null, fell = false;
  const at = new Vector3(), q = new Quaternion(), p = new Vector3(), scratch = new Vector3();
  try {
    for (let i = 0; i < stand.seconds(STAND + chamber.seconds + WINDOW); i++) {
      stand.step(1);
      if (!headCentre && blow.time >= STAND) {
        // The body as it stands when the blow begins: the target's pose, and where it is.
        struck.update();
        headCentre = centreNow(head);
        target = headCentre.add(new Vector3(0, 0, distance));
      }
      if (blow.fallen) { fell = true; break; }
      read(now);
      const live = blow.time >= blow.pushing;
      if (live && watching) {
        for (let k = 1; k <= SUB && !landed; k++) {
          const f = k / SUB;
          Vector3.LerpToRef(last.position, now.position, f, at);
          Quaternion.SlerpToRef(last.rotation, now.rotation, f, q);
          const a = place(at, q, ends[0].clone()), b = place(at, q, ends[1].clone());
          const { point } = nearestOn(a, b, target, p);
          const gap = Vector3.Distance(point, target) - R - r;
          nearest = Math.min(nearest, gap);
          if (gap > 0) continue;
          // The normal, club into head; the contact on the swell's surface; its velocity there.
          const normal = target.subtract(point).normalize();
          const contact = point.add(normal.scale(r));
          const c = place(at, q, centre.clone());
          const velocity = Vector3.Lerp(last.velocity, now.velocity, f).addInPlace(Vector3.Cross(Vector3.Lerp(last.spin, now.spin, f), contact.subtract(c)));
          const closing = Vector3.Dot(velocity, normal);
          // The club's mass there, with the pose as this step left it: the contact and its normal
          // carried with the hand from where it touched.
          striker.update();
          const back = Quaternion.Inverse(q), carry = now.rotation.multiply(back);
          const clubPoint = place(now.position, now.rotation, contact.subtract(at).applyRotationQuaternion(back));
          const clubNormal = normal.applyRotationQuaternion(carry);
          const clubKg = striker.along(segment, [clubPoint.x, clubPoint.y, clubPoint.z], [clubNormal.x, clubNormal.y, clubNormal.z]);
          // The head's at the struck point, on the striker's own head turned to face it: a half turn about up.
          const struckOffset = normal.scale(-R), turned = [-struckOffset.x, struckOffset.y, -struckOffset.z];
          const headPoint = [headCentre.x + turned[0], headCentre.y + turned[1], headCentre.z + turned[2]];
          const headKg = struck.along(head, headPoint, [-normal.x, normal.y, -normal.z]);
          landed = {
            energy: impactEnergy(clubKg, headKg, closing), closing, clubKg, headKg,
            at: +(blow.time - blow.pushing - (1 - f) / stand.seconds(1)).toFixed(4),
            normal: [normal.x, normal.y, normal.z].map((x) => +x.toFixed(3)), along: +Vector3.Distance(contact, a).toFixed(3),
          };
        }
        if (landed) break;
        place(now.position, now.rotation, ends[1].clone()).subtractToRef(place(now.position, now.rotation, centre.clone()), scratch);
        peak = Math.max(peak, now.velocity.add(Vector3.Cross(now.spin, scratch)).length());
      }
      // A swell already in the sphere when the pushes begin has not arrived: wait for it to leave.
      if (live && !watching) {
        const a = place(now.position, now.rotation, ends[0].clone()), b = place(now.position, now.rotation, ends[1].clone());
        watching = Vector3.Distance(nearestOn(a, b, target, p).point, target) > R + r;
      }
      last.position.copyFrom(now.position); last.rotation.copyFrom(now.rotation);
      last.velocity.copyFrom(now.velocity); last.spin.copyFrom(now.spin);
    }
  } finally { blow.dispose(); stand.dispose(); }
  const score = fell ? FELL : landed ? landed.energy : -nearest;
  return { score, ...(landed ?? { energy: 0, closing: 0, at: null }), peak, distance, strike, fell };
}
