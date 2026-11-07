import type { BuiltSegment } from "./build-body.ts";
import type { BodySpec, ConfigurationName, SegmentSpec } from "../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { ColliderShape } from "../../physics/engine.ts";
import type { StepHost } from "../step-host.ts";

/** A segment's requested collision configuration. */
export interface ConfigurationRequest { readonly segment: string; readonly configuration: ConfigurationName }

const NAMES = new WeakMap<SegmentSpec, readonly ConfigurationName[]>();

/** Faults in a segment's configuration identifiers and attachment declarations. */
export function configurationFaults(segment: SegmentSpec): string[] {
  const declared = segment.configurations;
  if (!declared) return [];
  const faults: string[] = [], names = Object.keys(declared.shapes);
  const named = (name: unknown): name is string => typeof name === "string" && name.trim().length > 0;
  const known = (name: unknown): boolean => named(name) && Object.hasOwn(declared.shapes, name);
  for (const name of names) if (!named(name)) faults.push("a configuration needs a nonempty name");
  if (!known(declared.initial)) faults.push("the initial configuration needs a declared shape");
  if (declared.holding) {
    if (!known(declared.holding.configuration)) faults.push("the holding configuration needs a declared shape");
    if (!known(declared.holding.release)) faults.push("the release configuration needs a declared shape");
  }
  for (const [configuration, point] of Object.entries(declared.aim ?? {})) {
    if (!known(configuration)) faults.push(`the aim configuration ${configuration} needs a declared shape`);
    if (!named(point)) faults.push(`the aim of ${configuration} needs a named point`);
  }
  return faults;
}

/** The segment's configuration names in their transport order, fixed by its immutable spec. */
function configurationNames(segment: SegmentSpec): readonly ConfigurationName[] {
  let names = NAMES.get(segment);
  if (!names) NAMES.set(segment, names = Object.freeze(Object.keys(segment.configurations?.shapes ?? {})));
  return names;
}

/** A configuration's transport code; a segment without a configuration uses -1. */
export const configurationCode = (segment: SegmentSpec, configuration: ConfigurationName | undefined): number =>
  configuration === undefined ? -1 : configurationNames(segment).indexOf(configuration);

/** The configuration named by a segment's transport code. */
export const configurationAt = (segment: SegmentSpec, code: number): ConfigurationName => configurationNames(segment)[code]!;

/** Detached requests, applied at an unloaded, clear world-step boundary. */
export interface Configurations {
  readonly model: readonly { readonly segment: string; readonly configurations: readonly ConfigurationName[] }[];
  readonly state: Record<string, { applied: ConfigurationName; requested: ConfigurationName }>;
  requestOne(segment: string, configuration: ConfigurationName): void;
  dispose(): void;
}

/** Each segment that declares collision configurations, in the body's spec order. */
export function configurationModel(segments: readonly SegmentSpec[]): Configurations["model"] {
  for (const segment of segments) {
    const faults = configurationFaults(segment);
    if (faults.length) throw new Error(`${segment.name}: ${faults.join("; ")}`);
  }
  return deepFreeze(segments.filter(segment => segment.configurations).map(segment => ({ segment: segment.name, configurations: configurationNames(segment) })));
}

/** The segment's command code, after checking its declared configurations. */
export function checkConfiguration(model: Configurations["model"], segment: string, configuration: ConfigurationName): number {
  for (let i = 0; i < model.length; i++) {
    const entry = model[i]!;
    if (entry.segment === segment && entry.configurations.includes(configuration)) return i;
  }
  throw new Error(`invalid configuration ${configuration} for segment ${segment}`);
}

/** Contact load or an overlapping target collider prevents a configuration change this step. */
function configurationBlocked(world: StepHost, part: BuiltSegment, collider: ColliderShape): boolean {
  return world.physics.contactsOf(part.body).some(contact => contact.impulse > 0) || !part.body.canChangeShape(0, collider);
}

/** Apply each declared segment configuration while retaining collider identity and mass properties. */
export function createConfigurations(spec: BodySpec, segments: ReadonlyMap<string, BuiltSegment>, world: StepHost): Configurations {
  const parts = [...segments.values()].filter(part => part.configuration && part.poses).map(part => {
    return { part, poses: part.poses!, holding: part.spec.configurations?.holding, held: !!spec.held?.some(item => item.segment === part.spec.name) };
  });
  const state: Configurations["state"] = Object.fromEntries(parts.map(({ part }) => [part.spec.name, part.configuration!]));
  const model = configurationModel(parts.map(({ part }) => part.spec));
  const hook = parts.length === 0 ? null : world.prepare(() => {
    for (const { part, poses, holding, held } of parts) {
      const configuration = state[part.spec.name]!;
      const attached = part.body.gripping();
      const desired = holding && held ? holding.configuration : holding && attached
        ? (configuration.requested === holding.release ? configuration.applied : holding.configuration) : configuration.requested;
      if (desired === configuration.applied) continue;
      const collider = poses[desired]!.collider;
      if (configurationBlocked(world, part, collider)) continue;
      part.body.changeShape(0, collider); configuration.applied = desired;
    }
  });
  return { model, state,
    requestOne(segment, configuration) { checkConfiguration(model, segment, configuration); state[segment]!.requested = configuration; },
    dispose: () => hook?.dispose() };
}
