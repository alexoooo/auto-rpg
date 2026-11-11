import { aimsState, configuredAims } from "../../skills/assembly/action-config.ts";
import { kitBody, kitSkills } from "../../skills/assembly/assembly.ts";
import { filledOf, mindKitOf } from "../../skills/assembly/kit.ts";
import type { SkillKit } from "../../skills/config.ts";
import type { Skills } from "../../skills/framework/skills.ts";
import { groundSkills } from "../../skills/recovery/skills.ts";
import type { MindMade } from "../catalog/controller.ts";
import { driveBy, everyOf, type Driven, type Sight } from "../decider.ts";
import type { BodyHost } from "../mind.ts";
import type { Orders } from "../orders.ts";
import type { MindReport } from "../report.ts";
import { commandedMind } from "../sub-mind.ts";
import type { ResolvedConfig } from "./config.ts";
import { skillsOf } from "./skills.ts";

/**
 * **A running Option Mind**: what `buildOptionMind` gives the fight of the mind it makes on one
 * body.
 *
 * How it is stepped: as the mind takes its body it hands its host an object with `act` and
 * `think` (`Mind`, made by `commandedMind`). On each world step that simulates the body in full
 * (a control step), the body's hook on the world (`embody`) calls `act`, then `think`. `think`
 * asks the decider what to do, at its pace; `act`, on the next step, has `skills` turn that
 * answer into the body's command.
 */
export interface OptionMind extends MindMade {
  /** Its skills: its legs, its guard, its navigation, and the executors and ground techniques its Options name. */
  readonly skills: Skills;
  /** Its memory above the body's, saved and loaded with it: its skills', its decider's, its pace's and its aims'. */
  readonly state: Driven["state"];
  /** What it publishes of itself: what it is doing and what it expects of each foe. */
  readonly report: MindReport;
}

/**
 * **An Option Mind of `config` on `host`'s body.** `config` has its defaults (`resolveConfig`)
 * and has passed its checks (`optionMindFaults`, the controller's `fits`).
 */
export function buildOptionMind(host: BodyHost, config: ResolvedConfig): OptionMind {
  const { parts, spec, clock } = host;

  // The parts under its skills: the one an experiment passes in, else the one the body fits.
  const tuned = config.tuning?.parts;
  const motor = filledOf(parts, spec, "motor", tuned);
  const legs = filledOf(parts, spec, "legs", tuned);
  const guard = filledOf(parts, spec, "guard", tuned);

  // What its Options name of the body's skills, and with the parts above, the kit its skills are made from.
  const named = skillsOf(parts, spec, config.options);
  const navigation = named.navigation ?? config.navigation;
  const kit: SkillKit = { legs, guard, navigation, executors: named.executors, actions: named.actions, support: named.support };

  // The body, taken once from its host under command layers on its motor. Taking it hooks the mind to the world's step (`embody`).
  const layerOptions = { ...kitBody(motor, parts), ...host.experiment };
  const { body } = host.take(own => commandedMind(own, layerOptions, clock));

  // Its skills on that body: its ways up off the ground, its aims, then the kit's.
  const ground = groundSkills(body, clock, mindKitOf(parts, spec, tuned), named.techniques);
  const aims = configuredAims(parts, spec, kit.actions);
  const skills = kitSkills(body, clock, parts, kit, ground, aims);

  // Its decider: the session its predictions part builds over its chooser and Options, deciding every `every`th control step.
  const hz = Math.round(1 / clock.dt);
  const every = everyOf(config.rate, hz);
  const orders = (sight: Sight): Orders | null => host.orders(sight.view.senses);
  const evaluation = parts.of("predictions", config.predictions).make(config.predictions);
  const decider = evaluation.build({ spec, parts, rules: host.rules, seed: host.seed, phase: host.phase, hz, rate: hz / every, delay: body.delay,
    legs, options: config.options, chooser: config.chooser, techniques: named.techniques, orders });

  // The decider becomes the body's driver (`Body.drive`): it decides at its pace, and the skills carry each decision out.
  const driven = driveBy(body, decider, skills, { every, phase: host.phase, orders }, aimsState(aims));
  return { skills, state: driven.state, report: driven.report };
}
