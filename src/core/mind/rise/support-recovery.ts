import poses from "../../../../assets/research/posture-holds.json" with { type: "json" };
import type { BuiltBody } from "../../build/build-body.ts";
import type { MotionModel } from "../../control/tasks.ts";
import type { BodyView } from "../../body.ts";
import { supportEntry, supportEntryReading } from "../../control/support-entry.ts";
import { deepFreeze } from "../../state.ts";
import { observeBody } from "../../observation.ts";
import type { World } from "../../world.ts";
import { applyBodyAction, checkedBodyAction } from "../body-actions.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { RISE } from "./stages.ts";

/** Hand/shin acquisition settings from `docs/reference/support-entry.md#fixture-and-acceptance`. */
export const SUPPORT_ENTRY = deepFreeze({ root: "lowerTrunk", facing: .5,
  required: ["hand.left", "hand.right", "shank.left", "shank.right"],
  forbidden: ["head", "upperTrunk", "middleTrunk", "lowerTrunk"], slow: .1, stillSeconds: .5,
  settleLimit: 3, holdLimit: 6, response: .01, speed: 10 });

/** Shared acquisition policy and its support-reading settings, for research and gameplay. */
export function supportEntryPolicy(built: BuiltBody, model: Pick<MotionModel, "channels">) {
  const pose = poses.find((p) => p.model === built.spec.model && p.id === "fours");
  if (!pose) return null;
  const reference = built.segments.get(SUPPORT_ENTRY.root)!.rest;
  const reading = { ...SUPPORT_ENTRY, reference: [reference.x, reference.y, reference.z, reference.w] as const };
  const bind = Object.fromEntries(built.spec.joints.flatMap((j) => j.dofs.map((d) => [`${j.name} ${d.positive}`, d.bind.value])));
  const targets = Object.fromEntries([...built.joints].flatMap(([name, j]) => j.dofs.map((d, i) =>
    [`${name} ${d.spec.positive}`, (pose.placement.joints as Record<string, number[]>)[name]![i]!] as const)));
  const convert = (stage: { readonly posture: Readonly<Record<string, number>>; readonly seconds: number }) => ({ seconds: stage.seconds,
    targets: Object.fromEntries(model.channels.map((c) => [c.name, Math.max(c.min, Math.min(c.max, (stage.posture[c.name] ?? 0) - bind[c.name]!))])) });
  const policy = supportEntry(model, { ...reading, targets,
    roll: { back: RISE.roll.back.map(convert), left: RISE.roll.left.map(convert), right: RISE.roll.right.map(convert) },
    prepare: RISE.rise.slice(0, 3).map((stage) => {
      if (stage.kind !== "pose") throw new Error("support entry preparation requires poses");
      return convert(stage);
    }) });
  return { policy, reading };
}

/** Acquire support after a fall where a measured pose exists. It does not claim to stand up. */
export function supportRecovery(own: OwnBody, view: BodyView, world: World): SubMind | null {
  const { built, spec, muscles } = own;
  if (spec.held?.length) return null;
  const model = { channels: muscles.channels.map((c) => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value })) };
  const entry = supportEntryPolicy(built, model);
  if (!entry) return null;
  const { policy, reading } = entry;
  const observe = observeBody(built, muscles, world, () => view.senses);
  const initial = structuredClone(policy.state), state = { policy: policy.state, supported: false };
  return { get name() { return state.supported ? "hand/shin support (not standing)" : `support entry: ${state.policy.phase}`; }, state,
    wants: () => view.down,
    begin() { Object.assign(state.policy, initial); state.supported = false; }, end() {},
    step(_senses, dt) {
      const observation = observe();
      state.supported = supportEntryReading(observation, reading).supported;
      applyBodyAction(muscles, checkedBodyAction(policy.step(observation, dt), model.channels.length));
    } };
}
