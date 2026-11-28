import { constructionScope } from "../../../core/construction.ts";
import { configuredAims } from "../../../skills/assembly/action-config.ts";
import { aimsState } from "../../../skills/framework/aim-part.ts";
import { motorLayerOptions, makeSkills } from "../../../skills/assembly/assembly.ts";
import { filledOf, motorAndGuardOf } from "../../../skills/assembly/filled.ts";
import type { SkillParts } from "../../../skills/config.ts";
import { groundSkills } from "../../../skills/recovery/shared/skills.ts";
import type { MindMade } from "../../catalog/controller.ts";
import type { BodyHost } from "../../mind.ts";
import { commandLayers } from "../../motor-layers.ts";
import { skillsReport } from "../../report.ts";
import { chooserOf } from "../choosers/chooser.ts";
import { RETHINK } from "../choosers/select-set.ts";
import type { ResolvedConfig } from "./config.ts";
import { bodyOf } from "../predictions/value/fitted-value.ts";
import { optionsOf } from "../options/kinds.ts";
import { OptionMind } from "../option-mind.ts";
import { everyOf, Pace } from "./pace.ts";
import { optionRecord } from "../situation/record.ts";
import { situationReader } from "../situation/reader.ts";
import { skillsOf } from "./skills.ts";
import { walker } from "../options/walk.ts";
import { guardConfigs } from "../../../skills/assembly/guards.ts";
import type { Intent } from "../../../skills/framework/intent.ts";

/**
 * **An Option Mind of `config` on `host`'s body** (`OptionMind`), with everything it is made of.
 * `config` has its defaults (`resolveConfig`) and has passed its checks (`optionMindFaults`, the
 * controller's `fits`).
 */
export function buildOptionMind(host: BodyHost, config: ResolvedConfig): MindMade {
  const { parts, spec, clock } = host;

  // The parts under its skills: the one an experiment passes in, else the one the body fits.
  const tuned = config.tuning?.parts;
  const motor = filledOf(parts, spec, "motor", tuned);
  const legs = filledOf(parts, spec, "legs", tuned);
  const guard = guardConfigs(parts, spec, tuned?.guard);

  // What its Options name of the body's skills, and with the parts above, what its skills are made from.
  const named = skillsOf(parts, spec, config.options);
  const navigation = named.navigations;
  const skillParts: SkillParts = { legs, guards: guard, navigations: navigation, executors: named.executors, actions: named.actions, supports: named.supports };

  const layerOptions = { ...motorLayerOptions(motor, parts), ...host.experiment };
  // It decides every `every`th control step.
  const hz = Math.round(1 / clock.dt), every = everyOf(config.rate, hz), rate = hz / every;

  // The body, taken once from its host. Taking it hooks the Mind made here to the world's step (`embody`).
  const { mind, skills } = host.take((own) => {
    // A part that throws while the Mind is built disposes the layers already made.
    const scope = constructionScope(); let complete = false;
    try {
      // The command layers on its motor, which read the body as it stands before anything is made over their view.
      const layers = scope.own(commandLayers<Intent>(own, layerOptions, clock));
      layers.firstLook();
      const body = layers.body;

      // Its skills on that body: its ways up off the ground, its aims, then those its parts make.
      const ground = groundSkills(body, clock, motorAndGuardOf(parts, spec, tuned), named.techniques);
      const aims = configuredAims(parts, spec, skillParts.actions);
      const skills = makeSkills(body, clock, parts, skillParts, ground, aims);

      // What it predicts by, as its predictions part makes it; then its Options, its exchange predictor, given the strikes they model, its reader and its chooser.
      const predictors = parts.of("predictions", config.predictions).make(config.predictions);
      const walk = walker(spec, predictors.walkStart, predictors.walkArrivals?.(bodyOf(spec)) ?? null), record = optionRecord();
      const options = optionsOf(config.options, { spec, hz, rate, delay: body.delay, parts, walk, legs, guards: guard, outcomes: predictors.outcomes, guesses: predictors.guesses, record });
      const exchange = predictors.exchange({ strikes: options.flatMap((option) => option.modelled ? [option.modelled] : []) });
      const reader = situationReader({ spec, hz, rate, delay: body.delay, rules: host.rules, exchange, ordersOf: (sight) => host.orders(sight.view.senses), record, parts, techniques: named.techniques });
      const chooser = chooserOf(parts, config.chooser, { options, seed: host.seed, body: bodyOf(spec), exchange, rethink: config.rethink ?? RETHINK });

      const mind = new OptionMind({ layers, skills, reader, options, chooser, pace: new Pace(every, host.phase, (senses) => host.orders(senses)),
        record, aims: aimsState(aims), facing: walk.facing });
      complete = true;
      return { mind, skills, name: layers.name, has: () => mind.state.idle ? "nobody" : layers.name, body,
        dispose() { skills.release(layers.view, "replaced"); scope.dispose(); } };
    } finally { if (!complete) scope.dispose(); }
  });
  return { state: mind.state, skills, report: skillsReport(skills, mind) };
}
