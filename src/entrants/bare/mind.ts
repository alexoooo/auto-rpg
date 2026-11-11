/** A bare mind reads its body and senses into its network, and carries saved pulls in its fast phase. */
import { networkFaults, recoveryNetwork, type Network } from "../../core/math/index.ts";
import type { BodySpec } from "../../core/bodies/index.ts";
import { deepFreeze } from "../../core/state.ts";
import { controller, NO_POSTURE, type Controller, type MindPreset } from "../../minds/index.ts";
import type { BodyHost } from "../../minds/index.ts";
import type { MindConstruction } from "../../minds/index.ts";
import type { OwnBody } from "../../core/bodies/index.ts";
import type { Senses } from "../../core/bodies/index.ts";
import { act, ask, learnerOf, type Learner } from "../../core/math/index.ts";
import { Vector3 } from "../../core/math/index.ts";
import { jointTracker } from "../../core/bodies/index.ts";
import { rootSegment, type ReadSegment } from "../../core/bodies/index.ts";
import { massCentreToRef, partsOn } from "../../core/bodies/index.ts";

interface BareConfig {
  readonly kind: "bare:mind";
  readonly network: Network | null;
  /** Seconds between its decisions. */
  readonly interval: number;
}

/** Pulls wait between think and act; learning survives an interruption. */
interface BareState {
  readonly learner: Learner;
  readonly keptPulls: Float64Array;
}

const channelsOf = (spec: BodySpec): string[] => spec.joints.flatMap((joint) => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`));

function bareLayout(spec: BodySpec): { readonly inputs: readonly string[]; readonly outputs: readonly string[] } {
  const channels = channelsOf(spec), frame = (name: string) => [`${name} along`, `${name} up`, `${name} across`];
  return {
    inputs: [...channels.map((c) => `${c} angle`), ...channels.map((c) => `${c} rate`), ...frame("root up"), "centre height", ...frame("root velocity"),
      ...frame("root spin"), "other seen", ...frame("other place"), ...frame("other velocity"), "ordered", "order along", "order across", "order pace"],
    outputs: channels.map((c) => `${c} pull`),
  };
}

const BARE: BareConfig = deepFreeze({ kind: "bare:mind", network: null, interval: 1 / 60 });

export const BARE_PRESETS: Readonly<Record<string, MindPreset<BareConfig>>> = deepFreeze({
  bare: { label: "Bare (no network)", config: BARE, offered: false },
});

function fits(spec: BodySpec, config: BareConfig): string | null {
  if (!config.network) return null;
  const layout = bareLayout(spec), { inputs } = networkFaults(config.network);
  return inputs !== layout.inputs.length || config.network.actions !== layout.outputs.length
    ? `its network reads ${inputs} inputs for ${config.network.actions} pulls; this body gives ${layout.inputs.length} for ${layout.outputs.length}` : null;
}

/** Append one world vector in the heading frame, retaining the input array's storage. */
function writeFrame(into: number[], at: number, vx: number, vy: number, vz: number, fx: number, fz: number): number {
  into[at] = vx * fx + vz * fz; into[at + 1] = vy; into[at + 2] = vx * fz - vz * fx;
  return at + 3;
}

/** Body and senses inputs in bareLayout order; every workspace value is overwritten by a read. */
function inputsOf(own: OwnBody, orders: BodyHost["orders"]): (into: number[], senses: Senses) => void {
  const root = rootSegment(own.built), parts = partsOn(own.built);
  const centre = new Vector3(), point = new Vector3(), velocity = new Vector3();
  const spins = [...own.built.segments.values()].map((part) => ({ part, spin: new Vector3() }));
  const spinOf = new Map(spins.map(({ part, spin }) => [part, spin]));
  const trackers = [...own.built.joints.values()].map((joint) => jointTracker(joint));
  const angular = (part: ReadSegment) => spinOf.get(part)!;
  const rootSpin = angular(root);
  return (into, senses) => {
    let at = 0;
    const current = parts();
    massCentreToRef(current.segments, current.mass, centre, point);
    for (let i = 0; i < spins.length; i++) { const reading = spins[i]!; reading.part.body.angularVelocityToRef(reading.spin); }
    for (let i = 0; i < trackers.length; i++) {
      const tracker = trackers[i]!; tracker.update(angular);
      for (let k = 0; k < tracker.angles.length; k++) into[at++] = tracker.angles[k]!;
    }
    for (let i = 0; i < trackers.length; i++) {
      const rates = trackers[i]!.rates;
      for (let k = 0; k < rates.length; k++) into[at++] = rates[k]!;
    }
    const { x, y, z, w } = root.pose.rotation, twist = w * w + y * y;
    const fx = twist > 1e-12 ? 2 * w * y / twist : 0, fz = twist > 1e-12 ? (w * w - y * y) / twist : 1;
    at = writeFrame(into, at, 2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), fx, fz);
    into[at++] = centre.y;
    root.body.linearVelocityToRef(velocity); at = writeFrame(into, at, velocity.x, velocity.y, velocity.z, fx, fz);
    at = writeFrame(into, at, rootSpin.x, rootSpin.y, rootSpin.z, fx, fz);
    let nearest: Senses["others"][number] | null = null, best = Infinity;
    for (let i = 0; i < senses.others.length; i++) {
      const other = senses.others[i]!;
      if (other.out) continue;
      const dx = other.centre.x - centre.x, dz = other.centre.z - centre.z, distance = dx * dx + dz * dz;
      if (distance < best) { best = distance; nearest = other; }
    }
    into[at++] = nearest ? 1 : 0;
    if (nearest) {
      at = writeFrame(into, at, nearest.centre.x - centre.x, nearest.centre.y - centre.y, nearest.centre.z - centre.z, fx, fz);
      at = writeFrame(into, at, nearest.velocity.x, nearest.velocity.y, nearest.velocity.z, fx, fz);
    } else { for (let i = 0; i < 6; i++) into[at++] = 0; }
    const given = orders(senses), move = given?.move;
    const direct = move?.kind === "direct" ? move.direction : null, length = direct ? Math.sqrt(direct.x * direct.x + direct.z * direct.z) : 0;
    into[at++] = direct ? 1 : 0;
    if (direct && length > 0) {
      into[at++] = (direct.x * fx + direct.z * fz) / length;
      into[at++] = (direct.x * fz - direct.z * fx) / length;
    } else { into[at++] = 0; into[at++] = 0; }
    into[at] = given?.pace ?? 0;
  };
}

export const BARE_MIND: Controller = controller<BareConfig>({
  role: "mind", label: "Bare", stage: "experimental", fields: [], slots: [], defaults: BARE,
  keys: { kind: true, network: true, interval: true },
  fits: (spec, config) => fits(spec, config),
  strikes: (spec) => (spec.effectors ?? []).map((effector) => effector.segment),
  faults: (config) => [...(config.interval > 0 && Number.isFinite(config.interval) ? [] : ["its decision interval is a finite positive number of seconds"]),
    ...(config.network ? networkFaults(config.network).faults : [])],
  builtIn: () => NO_POSTURE,
  create: (host, config) => {
    // With no network it pulls nothing where no trainer answers it.
    const layout = bareLayout(host.spec), still: readonly number[] = new Array<number>(layout.outputs.length).fill(0);
    const decide = config.network ? recoveryNetwork(config.network) : () => still;
    const learner = learnerOf(layout.inputs.length, config.interval, { running: true, trained: config.network !== undefined });
    const state: BareState = { learner, keptPulls: new Float64Array(layout.outputs.length) };
    host.take((own) => {
      if (own.muscles.channels.map((channel) => channel.name).join("\n") !== channelsOf(host.spec).join("\n")) throw new Error("the bare layout's channels are not the body's");
      const read = inputsOf(own, host.orders);
      return { name: "bare", has: () => "bare", dispose() {}, mind: {
        state,
        act(control) {
          const { keptPulls } = state;
          for (let i = 0; i < keptPulls.length; i++) {
            const pull = keptPulls[i]!;
            control.muscles.activation[i] = Math.min(1, Math.abs(pull));
            control.muscles.velocity[i] = pull > 0 ? Infinity : pull < 0 ? -Infinity : 0;
          }
        },
        think(senses) {
          const { learner, keptPulls } = state, pulls = act(learner, decide);
          if (pulls.length) keptPulls.set(pulls);
          if (ask(learner, own.dt)) read(learner.inputs, senses);
        },
        interrupt() { state.keptPulls.fill(0); },
      } } satisfies MindConstruction;
    });
    return { state };
  },
});
