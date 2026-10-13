import data from "../../../../assets/research/research-rise.json" with { type: "json" };
import unshodData from "../../../../assets/research/research-rise-unshod-warrior.json" with { type: "json" };
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import { recoveryMeasurement } from "../../control/recovery-measurement.ts";
import { observeBody } from "../../observation.ts";
import { deepFreeze, loadState, saveState } from "../../state.ts";
import type { World } from "../../world.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { dynamicRiseFits } from "./dynamic.ts";
import { libraryPolicy } from "./reference-library.ts";
import { pathPolicy } from "./reference-path.ts";
import type { ReferenceAction, ReferenceParameters, RiseReference } from "./reference-types.ts";

interface Entry { kind: "library" | "path"; channels: string[]; parameters: ReferenceParameters; reference: RiseReference }
const SIDES = ["left", "right"] as const;
const bundle = deepFreeze(JSON.parse(data.payload)) as { default: Entry; bodies: Record<string, Entry> };
const additions = deepFreeze(JSON.parse(unshodData.payload)).default as Entry;
const unshodWarrior: Entry = deepFreeze({ ...bundle.default,
  parameters: { ...bundle.default.parameters,
    controllers: [...bundle.default.parameters.controllers!, ...additions.parameters.controllers!] },
  reference: { ...bundle.default.reference,
    references: [...bundle.default.reference.references, ...additions.reference.references] } });

/** Recorded reference motions with feedback, executed through the body's ordinary muscles. */
export function researchRise(own: OwnBody, view: BodyView, world: World): SubMind {
  if (!dynamicRiseFits(own.spec)) throw new Error(`${own.spec.model} cannot take research rise`);
  const held = own.spec.held ?? [];
  const club = held.length === 1 && held[0].segment === "hand.right" && held[0].item.name === "wooden club";
  const entry = own.spec.model === "workshop-fighter" && held.length === 0
    && own.spec.segments.every(s => s.surface?.sole === undefined) ? unshodWarrior
    : bundle.bodies[`${own.spec.model}/${club ? "club" : "empty"}`] ?? bundle.default;
  const channels = own.muscles.channels.map(c => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value }));
  if (channels.length !== entry.channels.length || channels.some((c, i) => c.name !== entry.channels[i]))
    throw new Error("research rise reference does not match this body's muscle channels");
  const args = { channels, reference: entry.reference, parameters: entry.parameters };
  const policy = entry.kind === "library" ? libraryPolicy(args) : pathPolicy(args);
  const initial = saveState(policy.state);
  const observe = observeBody(own.built, own.muscles, world, () => view.senses, undefined, () => view.down, true);
  const measure = recoveryMeasurement(own.built, observe), zero = new Vector3();
  const state = { policy: policy.state, active: false, started: 0, quiet: 0, attempts: 0, completed: 0,
    exhaustedAt: null as number | null,
    action: { kind: "host" } as ReferenceAction };
  const start = () => {
    loadState(policy.state, initial); state.active = true; state.started = world.time;
    state.quiet = 0; state.exhaustedAt = null; state.attempts++;
  };
  return { get name() { return `research-rise: ${Math.round(policy.state.phase)}`; }, state,
    wants() {
      if (!state.active) { if (!view.down) return false; start(); }
      const m = measure();
      state.quiet = m.ready ? state.quiet + world.dt : 0;
      // Quiet support releases the episode; a failed attempt can start again from the actual fall.
      if (state.quiet >= .5) { state.active = false; state.completed++; state.action = { kind: "host" }; return false; }
      const selected = "reference" in policy.state ? policy.state.reference ?? 0 : 0;
      const reference = entry.kind === "library" ? entry.reference.references[selected] : entry.reference;
      // Give the terminal command time to settle, then reselect from the actual pose if still down.
      if (view.down && policy.state.phase >= reference.frames.length - 1) state.exhaustedAt ??= world.time;
      else state.exhaustedAt = null;
      if (view.down && (world.time - state.started >= 20
        || (state.exhaustedAt !== null && world.time - state.exhaustedAt >= 2))) start();
      state.action = policy(m.observation);
      return state.action.kind === "muscles";
    },
    begin() {},
    end() { own.assist.ask(zero, zero); },
    step() {
      const action = state.action;
      if (action.kind !== "muscles") return;
      own.muscles.activation.set(action.activation);
      for (let i = 0; i < channels.length; i++) {
        const v = action.velocity[i];
        own.muscles.velocity[i] = v === "+inf" ? Infinity : v === "-inf" ? -Infinity : v;
      }
      own.built.handPoses.request(SIDES.filter(hand => action.handPoses[hand] !== undefined)
        .map(hand => ({ hand, pose: action.handPoses[hand] })));
      own.assist.ask(zero, zero);
    } };
}
