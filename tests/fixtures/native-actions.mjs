import { coreStand } from "../harness/core-stand.mjs";
import { humanSpec } from "../../src/core/human/spec.ts";
import { createBody } from "../../src/core/body.ts";
import { guardPosture, guardSkill } from "../../src/core/skills/guard.ts";
import { locomotion } from "../../src/core/skills/locomotion.ts";
import { skillSet } from "../../src/core/skills/arbiter.ts";
import { pathExecutor } from "../../src/core/skills/combat.ts";
import { supportFold } from "../../src/core/skills/support-fold.ts";
import { kickExecutor } from "../../src/core/skills/kick.ts";
import { wholeBodyExecutor } from "../../src/core/skills/whole-body-strike.ts";
import { placedReach } from "../../src/core/skills/strike.ts";
import { armedWith } from "../../src/core/items/held.ts";

/**
 * A Warrior holding `held` in each hand, on the core stand in guard (Node, Rapier, 120 Hz), throwing
 * one jab of its `side` hand through the path executor at a point its placed reach ahead of its head,
 * the request withdrawn once the action commits, for up to 5 s or until the ledger records it:
 * every phase it passed, the steps it spent committed, how far the hand moved, whether the other
 * hand was commanded on every step, and the skill set's report at the end.
 */
export async function nativeJab(side, held) {
  const spec = armedWith(armedWith(humanSpec("workshop-fighter"), "left", held), "right", held);
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  const other = side === "right" ? "left" : "right", effector = `hand.${side}`;
  const body = createBody(stand.built, stand.world, { servoSeconds: .1, feedback: true });
  const executor = pathExecutor(body, [{ name: "jab", family: "straight" }]);
  const skills = skillSet(body, {}, { legs: locomotion(body.envelope), guard: guardSkill(spec), executors: [{ name: "punch", executor }], actions: [{ name: "jab", executor: "punch", effectors: [effector] }] });
  const at = [body.view.head.x, body.view.head.y, body.view.head.z + placedReach(spec, side, 0)];
  const request = { id: skills.instance(), action: "jab", effector, target: { kind: "point", at } };
  const intent = { face: 0, move: null, guard: { [other]: { guarded: [body.view.head.x, body.view.head.y, body.view.head.z], threat: at }, [side]: null }, actions: [] };
  const phases = new Set(), initial = body.view.effectors[effector].points.knuckles.clone();
  let motion = 0, committed = 0, started = false, uncovered = 0;
  body.drive((view, dt) => {
    if (!started && skills.readiness(view, request.action, request.effector, request.target,
      { heading: skills.report.heading, placed: true, support: null, walk: null, lower: .03 }).kind === "ready") {
      intent.actions = [request]; started = true;
    }
    const command = skills.command(view, intent, dt);
    for (const action of skills.report.actions) {
      phases.add(action.phase);
      if (action.phase === "commit") { committed++; intent.actions = []; }
    }
    motion = Math.max(motion, body.view.effectors[effector].points.knuckles.subtract(initial).length());
    if (!command.effectors[`hand.${other}`]) uncovered++;
    return command;
  }, skills.release);
  try {
    for (let i = 0; i < 600 && !skills.report.ledger.length; i++) stand.step();
    const { actions, ledger, holders, reservations } = skills.report;
    return { effector, phases: [...phases], committed, motion, uncovered, actions: [...actions], ledger: [...ledger], holder: holders[`effector:${effector}`], reservation: reservations[`effector:${effector}`] };
  } finally { body.dispose(); stand.dispose(); }
}

/**
 * A bare Warrior on the core stand in guard (Node, Rapier, 120 Hz) asked at 2 s for one native
 * `kind` (a front kick, a whole-body strike, or a low or low-wide downward strike with the support
 * fold) at a point its kind reaches, admitted once ready, for up to 24 s or until the ledger
 * records it: whether it was admitted, every phase and stage it passed, the skill set's report at
 * the end and whether the body is down.
 */
export async function nativeCycle(kind) {
  const spec = humanSpec("workshop-fighter");
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1, feedback: true });
  const executor = kind.startsWith("low") ? pathExecutor(body, [{ name: kind, family: "downward", lower: .5 }]) : kind === "kick" ? kickExecutor(body, [kind]) : wholeBodyExecutor(body, stand.world, [kind], "timed");
  const effector = kind === "kick" ? "foot.right" : "hand.right";
  const skills = skillSet(body, {}, { legs: locomotion(body.envelope), guard: guardSkill(spec), ...(kind.startsWith("low") ? { support: supportFold(body) } : {}), executors: [{ name: kind, executor }], actions: [{ name: kind, executor: kind, effectors: [effector] }] });
  let request = null, admitted = false;
  const phases = new Set(), stages = new Set();
  body.drive((view, dt) => {
    if (!request && view.time >= 2) {
      const at = kind.startsWith("low") ? [view.stance.centre.x + (kind === "low-wide" ? .1 : .35), .23, view.stance.centre.z + (kind === "low-wide" ? .65 : .04)] : kind === "kick" ? [view.stance.centre.x + .1, .45, view.stance.soles.right.z + .45]
        : [view.head.x, view.head.y, view.head.z + placedReach(spec, "right", 0)];
      request = { id: skills.instance(), action: kind, effector, target: { kind: "point", at } };
    }
    const around = { heading: skills.report.heading, placed: true, support: skills.report.support ?? null, walk: null, lower: .03 };
    if (request && !admitted && skills.readiness(view, kind, effector, request.target, around).kind === "ready") admitted = true;
    const command = skills.command(view, { face: 0, move: null, guard: { left: null, right: null }, actions: admitted ? [request] : [] }, dt);
    for (const action of skills.report.actions) { phases.add(action.phase); stages.add(action.stage); }
    return command;
  }, skills.release);
  try {
    for (let i = 0; i < stand.seconds(24) && !skills.report.ledger.length; i++) stand.step();
    const { actions, ledger, support, reservations } = skills.report;
    return { admitted, phases: [...phases], stages: [...stages], actions: [...actions], ledger: [...ledger], support: support ?? null, reservations: { ...reservations }, down: body.down };
  } finally { body.dispose(); stand.dispose(); }
}
