import type { Body } from "../../../control/body.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { Locomotion, LocomotionPart } from "../../framework/locomotion-part.ts";
import { ALL_MET, LEGS_FIELDS, fieldsOf, maskOf, setIn } from "../../framework/skill.ts";
import { skillName } from "../../framework/variations.ts";
import { pawEndpoints, pawReader } from "../../../control/quadruped/paws.ts";
import { pawLegs, type PawGaitName } from "../shared/quadruped/paw-legs.ts";
import { move, type MoveGait } from "../shared/move.ts";

interface GaitChoiceConfig { readonly kind: "gait-choice" }

/** Native gaits available without an automatic locomotion policy, each named by its held variation. */
const gaitsOf = (spec: BodySpec, parts: PartLookup) => (["gait", "paw-gait"] as const).flatMap(role => parts.selected(role, spec)
  .map(config => ({ role, name: skillName(config), label: parts.of(role, config).label, legs: config })));

/** No gait selected: no locomotion command is supplied on behalf of the player. */
function idleLegs(body: Body): Locomotion {
  const state = { unmet: { ...ALL_MET } }, all = maskOf(LEGS_FIELDS);
  return { state, supports: (body.built.spec.ends ?? []).filter(end => end.kind === "foot" || end.kind === "paw").map(end => end.name),
    lower: 0, stopping: 0, lag: 0, envelope: null, gaits: [], limitsOf: () => null,
    get heading() { return body.view.stance.facing; }, get unmet() { return state.unmet; }, resume() {},
    goal(_view, goal) { state.unmet.fields = fieldsOf(setIn(goal, all)); return { kind: "drive", posture: {}, pushes: [] }; },
  };
}

/** The mind can use selected native gaits even when no automatic Move policy is enabled. */
export const GAIT_CHOICE: LocomotionPart<GaitChoiceConfig> = {
  role: "locomotion", label: "Selected gaits", stage: "game", defaults: { kind: "gait-choice" }, keys: { kind: true }, fields: [], slots: [],
  fits: (spec, _config, parts) => parts.selected("locomotion", spec).length ? "an enabled locomotion policy already supplies these gaits" : null,
  faults: () => [],
  supplies: (_config, parts) => (["gait", "paw-gait"] as const).flatMap(role => parts.candidates(role).map(config => ({ role, config }))),
  gaits: (_config, spec, parts) => gaitsOf(spec, parts),
  make(body, _config, legs) {
    const gaits: MoveGait[] = gaitsOf(body.built.spec, legs.parts).map(gait => {
      if (gait.role === "gait") return { name: gait.name, legs: legs.parts.of("gait", gait.legs).make(body, gait.legs) };
      const root = body.muscles.dynamics.root.segment, reading = pawReader(body.built).state;
      const part = legs.parts.of("paw-gait", gait.legs), config = gait.legs;
      const native = part.make(body.built, root, { centre: reading.centre, velocity: reading.velocity, feet: reading.endpoints },
        pawEndpoints(body.built).map(paw => paw.segment), config);
      const name: PawGaitName = native.settings.crawlHeight === undefined ? "trot" : "crawl";
      return { name: gait.name, legs: pawLegs(body, { [name]: native }) };
    });
    return gaits.length ? move(gaits, [], 0) : idleLegs(body);
  },
};

declare module "../../config.ts" {
  interface LocomotionConfigs { readonly "gait-choice": GaitChoiceConfig }
}
