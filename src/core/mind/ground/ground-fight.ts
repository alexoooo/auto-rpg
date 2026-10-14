import { type Body, type BodyView } from "../../body.ts";
import { rootSegment } from "../../build/build-body.ts";
import { effectorTracker } from "../../control/effector-tracker.ts";
import { hypot } from "../../math/real.ts";
import { skillSet } from "../../skills/arbiter.ts";
import { guardSkill } from "../../skills/guard.ts";
import type { Locomotion } from "../../skills/locomotion.ts";
import type { Side } from "../../spec/body.ts";
import type { World } from "../../world.ts";
import { actionProducer } from "../action-producer.ts";
import type { GroundFightConfig } from "../config.ts";
import { standIntent } from "../intent.ts";
import type { OwnBody } from "../mind.ts";
import type { Senses } from "../senses.ts";
import type { SubMind } from "../sub-mind.ts";
import { nearestFoe, nearestSurface } from "../targets.ts";
import { poseDrive } from "./techniques.ts";
import { GROUND_LEGS, groundKick } from "./ground-kick.ts";

/** Cover and ground footwork surround a named supine kick on the body's shared action compositor. */
export function groundFight(own: OwnBody, view: BodyView, _world: World, config: GroundFightConfig, afterPhysics: Body["afterPhysics"]): SubMind {
  const tracker = effectorTracker(own.built, rootSegment(own.built)), posture: Record<string, number> = {};
  const legs: Locomotion = { state: {}, heading: 0, pace: 0, reference: null, placed: true, envelope: null,
    resume() {}, goal() { return null; }, place() { return null; }, drive() { return { kind: "drive", posture: config.kicks === "none" ? {} : GROUND_LEGS, pushes: [] }; } };
  const producer = actionProducer(), executor = groundKick(own), rest = poseDrive(own.muscles);
  const skills = skillSet({ built: own.built, muscles: own.muscles, view, envelope: null, afterPhysics }, {}, {
    legs, guard: guardSkill(own.spec), executors: [{ name: "ground", executor }],
    actions: [{ name: "ground-kick", executor: "ground", effectors: ["foot.left", "foot.right"] }] });
  const state = { active: false, settled: 0, next: "right" as Side, sequence: 0, kicks: 0, tracker: tracker.state, skills: skills.state, producer: producer.state };
  const supported = () => view.ground?.position === "back" || view.ground?.position === "sitting";
  const nearby = (senses: Senses) => {
    const foe = nearestFoe(senses, view.stance.centre, "standing");
    return foe && hypot(foe.centre.x - view.stance.centre.x, foe.centre.z - view.stance.centre.z) <= config.reach ? foe : null;
  };
  return { name: "Fight on the ground", state,
    wants(senses) { return view.down && skills.report.actions.some(action => action.phase !== "prepare") || !!supported() && !!nearby(senses); },
    holds() { return view.down && skills.report.actions.some(action => action.phase !== "prepare"); },
    begin() { state.active = true; state.settled = 0; tracker.reset(); skills.resume(view); },
    end() { skills.release(view); tracker.reset(); producer.state.current = null; state.active = false; },
    step(senses, dt) {
      state.settled += dt;
      for (const record of skills.report.ledger) if (record.sequence > state.sequence) {
        state.sequence = record.sequence;
        if (record.committed) { state.kicks++; state.next = record.effector === "foot.right" ? "left" : "right"; }
      }
      const foe = nearby(senses), current = producer.state.current;
      const retained = current && skills.report.actions.some(action => action.id === current.id);
      const surface = foe && nearestSurface(senses, [view.stance.centre.x, view.stance.centre.y, view.stance.centre.z], () => true, foe.id);
      const side = config.kicks === "either" ? state.next : config.kicks;
      const choice = retained ? current : side !== "none" && state.settled >= 1 && surface && supported() ? { action: "ground-kick", effector: `foot.${side}`,
        target: { kind: "body" as const, body: surface.foe, region: { kind: "segment" as const, segment: surface.part } } } : null;
      const sight = { view, report: skills.report, envelope: null, instance: skills.instance, readiness: skills.readiness };
      const asked = producer.request(sight, choice, { heading: 0, placed: true, walk: null, lower: 0, support: null });
      const command = skills.command(view, { ...standIntent(), actions: asked.requests }, dt);
      for (const effector of tracker.models) {
        const goal = command.effectors?.[effector.segment];
        if (goal) tracker.reach(effector.segment, goal); else tracker.release(effector.segment);
      }
      const owned = tracker.step(own.muscles, command.posture, dt, true, true);
      for (let i = 0; i < own.muscles.channels.length; i++) {
        const name = own.muscles.channels[i]!.name; posture[name] = (owned(i)?.[0] ?? command.posture[name] ?? 0) + own.muscles.channels[i]!.dof.spec.bind.value;
      }
      rest(posture, .2, 3, .5);
    },
  };
}