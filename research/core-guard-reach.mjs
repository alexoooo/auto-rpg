/**
 * What a cover reaches, and how soon (`guardSkill`, `src/core/skills/guard.ts`): a body standing in
 * the guard is given a cover of a threat 0.8 m from its head, each way in turn from a stand of its
 * own, with its bare left hand and with the club in its right (Node core stand, Rapier, 120 Hz).
 *
 *   node research/core-guard-reach.mjs [--model workshop-fighter] [--covers '[{"out":0.3,"seconds":0.15}]'] [--at 0.15,0.3,0.6,1] [--club skill|up|middle]
 *
 * It prints, for each cover (`Covering`) and each way the threat lies, how far the knuckles are
 * from their place at each time of `--at`, cm; how far the middle of the club's swell is from its
 * place; and at the last time, how far the swell's line is off square to the threat's, rad, and
 * whether the end that was uppermost still is.
 *
 * `--club` is how the club's hand is given its goal: by the guard skill (`skill`, its two points
 * laid square to the threat's line the way nearest how the club lies); or, in the skill's place, a
 * goal of this script's with the same middle: the two points laid square the way nearest the
 * body's up (`up`), or the swell's middle alone, its line left to the posture (`middle`).
 */
import { parseArgs } from "node:util";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { intoFrameToRef } from "../src/core/control/kinematics.ts";
import { HUMANOID_MODELS } from "../src/core/models.ts";
import { GUARD_ACTION } from "../src/core/mind/intent.ts";
import { GUARD_COVER } from "../src/core/skills/guard.ts";
import { recipeSkills } from "../src/core/skills/skills.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: {
  model: { type: "string", default: "workshop-fighter" }, covers: { type: "string", default: JSON.stringify([GUARD_COVER]) },
  at: { type: "string", default: "0.15,0.3,0.6,1" }, club: { type: "string", default: "skill" },
} });
if (!["skill", "up", "middle"].includes(values.club)) throw new Error(`--club is skill, up or middle, not ${values.club}`);
if (!HUMANOID_MODELS.includes(values.model)) throw new Error(`--model names no body: ${values.model} (one of ${HUMANOID_MODELS.join(", ")})`);
const covers = JSON.parse(values.covers), times = values.at.split(",").map(Number);

/** How far the threat is from the head, m, and the ways it lies: ahead, to each side, above and ahead, low and ahead. */
const FAR = 0.8;
const WAYS = [["ahead", [0, 0, 1]], ["its left", [-1, 0, 0]], ["its right", [1, 0, 0]], ["above", [0, 0.6, 0.8]], ["low", [0, -0.6, 0.8]]];

/** `hand` covering a threat `way` from the head under `cover`: what it reads at each of `times`. */
async function reach(cover, way, hand) {
  const spec = loadoutSpec({ model: values.model, right: "club", left: "empty" });
  const stand = await coreStand(spec, { ground: true });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const { view } = body, skills = recipeSkills(body, {}, { cover });
  const known = rigidPoints(spec, spec.segments.find((segment) => segment.name === "hand.right"));
  const span = Vector3.Distance(Vector3.FromArray(known.get("swellFrom").value), Vector3.FromArray(known.get("swellTo").value));
  const own = hand === "right" && values.club !== "skill", guarded = new Vector3(), toward = new Vector3();
  let threat = null;
  body.drive((_, dt) => {
    const act = (which) => threat && which === hand && !own ? { kind: "guard", cover: { threat, guarded: view.head.asArray() } } : GUARD_ACTION;
    const command = skills.command(view, { move: null, face: 0, hands: { left: act("left"), right: act("right") } }, dt);
    if (!threat || !own) return command;
    // This script's goal, in the body frame as the skill's is: the same middle, and the line by the body's up or left free.
    intoFrameToRef(view.root, view.head.asArray(), guarded);
    intoFrameToRef(view.root, threat, toward).subtractInPlace(guarded).normalize();
    const middle = guarded.add(toward.scale(Math.min(cover.out, FAR)));
    if (values.club === "middle") return { ...command, effectors: { "hand.right": { places: [{ point: "swell", position: middle.asArray() }], seconds: cover.seconds, follows: true } } };
    const up = Vector3.Up(), half = up.subtract(toward.scale(Vector3.Dot(up, toward))).normalize().scale(span / 2);
    const lies = view.effectors["hand.right"].points.swellTo.subtract(view.effectors["hand.right"].points.swellFrom);
    if (Vector3.Dot(lies, half) < 0) half.scaleInPlace(-1);
    return { ...command, effectors: { "hand.right": { places: [{ point: "swellFrom", position: middle.subtract(half).asArray() }, { point: "swellTo", position: middle.add(half).asArray() }], seconds: cover.seconds, follows: true } } };
  });
  const world = (p) => p.clone().applyRotationQuaternion(view.root.rotation).addInPlace(view.root.position);
  try {
    stand.step(stand.seconds(1.5));
    threat = view.head.add(Vector3.FromArray(way).scale(FAR)).asArray();
    const ends = () => [world(view.effectors["hand.right"].points.swellFrom), world(view.effectors["hand.right"].points.swellTo)];
    const uppermost = Math.sign(ends()[1].y - ends()[0].y);
    const rows = [];
    let t = 0;
    for (const until of times) {
      stand.step(stand.seconds(until - t));
      t = until;
      const toward = Vector3.FromArray(threat).subtract(view.head).normalize(), place = view.head.add(toward.scale(Math.min(cover.out, FAR)));
      if (hand === "left") rows.push({ off: Vector3.Distance(view.fists.left.position, place) });
      else {
        const [a, b] = ends();
        rows.push({ off: Vector3.Distance(a.add(b).scale(0.5), place), square: Math.abs(Math.asin(Vector3.Dot(b.subtract(a).normalize(), toward))), kept: Math.sign(b.y - a.y) === uppermost });
      }
    }
    return { rows, down: view.down };
  } finally { body.dispose(); stand.dispose(); }
}

console.log(`${values.model}, a threat ${FAR} m from the head; the club's goal: ${values.club}; Node core stand, Rapier, 120 Hz. Off: from the place a cover asks for, cm.`);
console.log(`\n| Out, m | Seconds | Threat | ${times.map((t) => `Knuckles off, ${t} s`).join(" | ")} | ${times.map((t) => `Swell off, ${t} s`).join(" | ")} | Off square, rad | Same end up | Stood |`);
console.log(`|---|---|---|${times.map(() => "---|---|").join("")}---|---|---|`);
for (const cover of covers) for (const [name, way] of WAYS) {
  const bare = await reach(cover, way, "left"), club = await reach(cover, way, "right"), last = club.rows.at(-1);
  console.log(`| ${cover.out} | ${cover.seconds} | ${name} | ${bare.rows.map((row) => (100 * row.off).toFixed(1)).join(" | ")} | ${club.rows.map((row) => (100 * row.off).toFixed(1)).join(" | ")} | ${last.square.toFixed(2)} | ${last.kept ? "yes" : "no"} | ${bare.down || club.down ? "no" : "yes"} |`);
}
