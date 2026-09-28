/**
 * One scripted strike against a standing human, scored exactly as Combat scores it.
 *
 * The striker is driven through its command and nothing else (a mind's `Intent`): a guard, a
 * chamber, a strike and a hold, each a pose of both posture and the striking hand. The target is an
 * idle unarmed Warrior, so no shield and no parry stand between the blow and a body part. What is
 * measured is what the body can deliver, not what a fighting mind chooses to.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { freshIntent } from "../src/action-primitives.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

export const STRIKE_HARNESS = "Node/Havok bout runner, supported, scripted striker against an idle unarmed Warrior";

/** Each parameter's range. A search works in [-1, 1] and `decode` maps it here. */
export const STRIKE_PARAMS = Object.freeze([
  ["separation", 0.9, 2.2],
  ["chamberSeconds", 0.15, 0.9],
  ["chamberX", -1, 1], ["chamberY", -1, 1], ["chamberReach", -1, 1], ["chamberRoll", -1, 1],
  ["chamberBend", -1, 1], ["chamberTwist", -1, 1], ["chamberLean", -1, 1], ["chamberCrouch", 0, 1],
  ["chamberForward", -1, 1],
  ["strikeSeconds", 0.08, 0.6],
  ["strikeX", -1, 1], ["strikeY", -1, 1], ["strikeReach", -1, 1], ["strikeRoll", -1, 1],
  ["strikeBend", -1, 1], ["strikeTwist", -1, 1], ["strikeLean", -1, 1], ["strikeCrouch", 0, 1],
  ["strikeForward", -1, 1], ["strikeThrust", -1, 1],
]);

export function decode(unit) {
  return Object.fromEntries(STRIKE_PARAMS.map(([name, lo, hi], i) => {
    const u = Math.max(-1, Math.min(1, unit[i] ?? 0));
    return [name, lo + (u + 1) / 2 * (hi - lo)];
  }));
}

const WARM = 0.6, HOLD = 0.5;

function scriptedStriker(p) {
  let t = 0;
  const pose = (intent, prefix) => {
    Object.assign(intent.primary, { pointerX: p[`${prefix}X`], pointerY: p[`${prefix}Y`],
      reach: p[`${prefix}Reach`], roll: p[`${prefix}Roll`], wristBend: p[`${prefix}Bend`] });
    Object.assign(intent.posture, { trunkTwist: p[`${prefix}Twist`], trunkLean: p[`${prefix}Lean`],
      crouch: p[`${prefix}Crouch`] });
    intent.forward = p[`${prefix}Forward`];
  };
  return { name: "scripted-strike", decide(_view, dt) {
    t += dt;
    const intent = freshIntent();
    if (t < WARM) return intent;
    if (t < WARM + p.chamberSeconds) { pose(intent, "chamber"); return intent; }
    pose(intent, "strike");
    intent.primary.thrust = p.strikeThrust > 0;
    if (t > WARM + p.chamberSeconds + p.strikeSeconds) intent.forward = 0;
    return intent;
  } };
}

/**
 * `terminal` is what the striker holds in the right hand; `attributes` and `model` build it.
 * Returns the strongest unblocked contact the primary hand made on the target's body.
 */
export async function evaluateStrike({ terminal = "club", attributes, model, params, objective = "energy" }) {
  const p = decode(params);
  const setup = { ...humanSetup(terminal, "fist", model),
    ...(attributes ? { attributes } : {}) };
  const seconds = WARM + p.chamberSeconds + p.strikeSeconds + HOLD;
  const bout = createBout({ left: "idle", right: "idle", leftMind: scriptedStriker(p),
    leftGolem: setup, rightGolem: humanSetup("fist", "fist"), seeds: [1, 2],
    separation: p.separation, locomotionMode: "supported", maxSeconds: seconds + 0.1,
    physics: await freshHavok() });
  const contacts = [];
  const combat = bout.forkWorld().roots.leftCombat;
  const original = combat.onReport;
  combat.onReport = function (event) {
    original?.call(this, event);
    const r = event.report;
    if (event.hand !== "primary" || event.blocked || r.at < WARM) return;
    contacts.push({ at: r.at, kind: r.kind, key: r.key, energyJ: r.energyJ, closingSpeed: r.closingSpeed,
      speed: r.speed, strikerMassKg: r.strikerMassKg, partMassKg: r.partMassKg,
      impulseNs: r.solverImpulse, preArmourDamage: r.preArmourDamage, damage: r.damage });
  };
  // The striking item's far end, read from mesh.position and rotationQuaternion (never a world
  // matrix), so its free-flight speed can be set beside the speed it arrived with.
  const parts = bout.left.effectorModules[0].module.parts;
  const item = (parts.find(x => x.id.endsWith("." + terminal)) ?? parts.at(-1)).part;
  const reach = terminal === "fist" ? 0 : Math.max(...item.mesh.getBoundingInfo().boundingBox.extendSize.asArray()) * 0.9;
  const along = new Vector3(0, reach, 0), scratch = new Vector3();
  const end = () => along.rotateByQuaternionToRef(item.mesh.rotationQuaternion, scratch).addInPlace(item.mesh.position).clone();
  let clock = 0, previous = end(), peakSpeed = 0;
  try {
    while (bout.active && clock < seconds) {
      bout.step(); clock += 1 / 60;
      const now = end(); const speed = Vector3.Distance(now, previous) * 60; previous = now;
      if (clock > WARM && contacts.length === 0) peakSpeed = Math.max(peakSpeed, speed);
    }
  } finally { combat.onReport = original; bout.dispose(); }
  const score = (c) => objective === "speed" ? c.closingSpeed : c.energyJ;
  const best = contacts.reduce((a, c) => !a || score(c) > score(a) ? c : a, null);
  return { energyJ: best ? score(best) : 0, best, contacts: contacts.length, peakSpeedBeforeContact: peakSpeed, params: p };
}
