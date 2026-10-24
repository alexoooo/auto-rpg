import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { commandable, type BodyView } from "../../body.ts";
import { recoveryMeasurement } from "../../control/recovery-measurement.ts";
import { dataOf } from "../../data/store.ts";
import { observeBody } from "../../observation.ts";
import { loadState, saveState } from "../../state.ts";
import type { Clock } from "../../clock.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import type { BodySpec } from "../../spec/body.ts";
import { libraryPolicy } from "./reference-library.ts";
import { pathPolicy } from "./reference-path.ts";
import type { ReferenceAction } from "./reference-types.ts";

const SIDES = ["left", "right"] as const;

/** Human rigs with two legs, usable hands and at most one compound held item. */
export function researchRiseFits(spec: BodySpec): boolean {
  return (spec.model === "workshop-fighter" || spec.model === "workshop-rogue") && commandable(spec)
    && ["lowerTrunk", "middleTrunk", "upperTrunk", "shank.left", "shank.right"].every(name => spec.segments.some(s => s.name === name))
    && (spec.held?.length ?? 0) <= 1 && (spec.held ?? []).every(h => SIDES.some(side => h.segment === `hand.${side}`));
}

/** Recorded reference motions with feedback (`dataOf("research-rise")`, read when made), executed through the body's ordinary muscles. */
export function researchRise(own: OwnBody, view: BodyView, clock: Clock): SubMind {
  if (!researchRiseFits(own.spec)) throw new Error(`${own.spec.model} cannot take research rise`);
  const data = dataOf("research-rise");
  const held = own.spec.held ?? [];
  const club = held.length === 1 && held[0].segment === "hand.right" && held[0].item.name === "wooden club";
  const entry = own.spec.model === "workshop-fighter" && held.length === 0
    && own.spec.segments.every(s => s.surface?.sole === undefined) ? data.unshodWarrior
    : data.bodies[`${own.spec.model}/${club ? "club" : "empty"}`] ?? data.default;
  const channels = own.muscles.channels.map(c => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value }));
  if (channels.length !== entry.channels.length || channels.some((c, i) => c.name !== entry.channels[i]))
    throw new Error("research rise reference does not match this body's muscle channels");
  const args = { channels, reference: entry.reference, parameters: entry.parameters };
  const policy = entry.kind === "library" ? libraryPolicy(args) : pathPolicy(args);
  const initial = saveState(policy.state);
  const observe = observeBody(own.built, own.muscles, clock, () => view.senses, { down: () => view.down, contactPatches: true });
  const measure = recoveryMeasurement(own.built, observe), zero = new Vector3();
  const state = { policy: policy.state, active: false, started: 0, quiet: 0, attempts: 0, completed: 0,
    exhaustedAt: null as number | null,
    action: { kind: "host" } as ReferenceAction };
  const start = () => {
    loadState(policy.state, initial); state.active = true; state.started = clock.time;
    state.quiet = 0; state.exhaustedAt = null; state.attempts++;
  };
  return { get name() { return `research-rise: ${Math.round(policy.state.phase)}`; }, state,
    wants() {
      if (!state.active) { if (!view.down) return false; start(); }
      const m = measure();
      state.quiet = m.ready ? state.quiet + clock.dt : 0;
      // Quiet support releases the episode; a failed attempt can start again from the actual fall.
      if (state.quiet >= .5) { state.active = false; state.completed++; state.action = { kind: "host" }; return false; }
      const selected = "reference" in policy.state ? policy.state.reference ?? 0 : 0;
      const reference = entry.kind === "library" ? entry.reference.references[selected] : entry.reference;
      // Give the terminal command time to settle, then reselect from the actual pose if still down.
      if (view.down && policy.state.phase >= reference.frames.length - 1) state.exhaustedAt ??= clock.time;
      else state.exhaustedAt = null;
      if (view.down && (clock.time - state.started >= 20
        || (state.exhaustedAt !== null && clock.time - state.exhaustedAt >= 2))) start();
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
      own.requestHandPoses(SIDES.filter(hand => action.handPoses[hand] !== undefined)
        .map(hand => ({ hand, pose: action.handPoses[hand] })));
      own.assist.ask(zero, zero);
    } };
}
