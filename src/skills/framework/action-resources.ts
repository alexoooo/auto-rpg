import type { BodyCommand } from "../../control/body.ts";
import type { EffectorModel } from "../../control/effectors.ts";
import { deepFreeze } from "../../core/state.ts";
import { hasResource, LEG_RESOURCE, segmentResource, poseResource, ASSIST_RESOURCE, TRUNK_RESOURCE, type ActionClaim, type Resource } from "./action.ts";
import type { BearingEnd } from "../../core/bodies/spec/body.ts";

/**
 * **One compiled map** serves both admission conflicts and command-write validation. Every control
 * a resource holds is a slot: a channel (`channel:<name>`), an effector (`effector:<segment>`), a
 * hand's pose (`pose:<segment>`), the stance or the assist, named by its place in `slots`, its id.
 * A step reads slots by id; names are for building a body's skills and for reports.
 */
export interface ResourceMap {
  readonly all: readonly Resource[];
  /** Every slot by id, in the order `all`'s resources hold them. */
  readonly slots: readonly string[];
  /** Each slot's id by its name; none for a slot the body has not. */
  readonly ids: ReadonlyMap<string, number>;
  /** The stance's slot. */
  readonly stance: number;
  /** Each channel's, effector's and pose's slot by its channel's or segment's name. */
  readonly channel: ReadonlyMap<string, number>;
  readonly effector: ReadonlyMap<string, number>;
  readonly pose: ReadonlyMap<string, number>;
  /** The slots `resources` hold, each once, in order: a thrown error for a resource the body has not. */
  slotsOf(resources: readonly Resource[]): number[];
  /** The slots `resources` hold, by name (`slotsOf`). */
  controls(resources: readonly Resource[]): readonly string[];
  /** A thrown error for a resource the body has not. */
  check(resources: readonly Resource[]): void;
  /** Whether `resources` hold `slot` (none, -1, is held by none). */
  holds(resources: readonly Resource[], slot: number): boolean;
  overlap(a: readonly Resource[], b: readonly Resource[]): boolean;
  validate(resources: readonly Resource[], claim: ActionClaim): void;
  validatePatch(resources: readonly Resource[], patch: Partial<BodyCommand>): void;
}

/**
 * Compile anatomical chains, segment configuration actuators and the stance's support limbs (its
 * feet, each by its end's name and its segment) into concrete control slots.
 */
export function actionResources(channels: readonly string[], effectors: readonly EffectorModel[], feet: readonly { readonly name: BearingEnd; readonly segment: string; readonly channels: readonly string[] }[],
  posable: readonly string[], segments: readonly { readonly segment: string; readonly channels: readonly string[] }[] = []): ResourceMap {
  const support = feet.map((foot) => foot.segment);
  const all: Resource[] = [];
  const named: Record<Resource["kind"], Record<string, readonly string[]>> = { segment: Object.create(null), pose: Object.create(null), service: Object.create(null) };
  const put = (resource: Resource, controls: readonly string[]): void => {
    if (Object.hasOwn(named[resource.kind], resource.name)) throw new Error(`duplicate ${resource.kind} resource ${resource.name}`);
    named[resource.kind][resource.name] = controls; all.push(resource);
  };
  const limbChannels = new Set<string>();
  for (const effector of effectors) {
    for (const channel of effector.channels) {
      if (!channels.includes(channel)) throw new Error(`unknown effector channel ${channel}`);
      limbChannels.add(channel);
    }
    put(segmentResource(effector.segment), [`effector:${effector.segment}`, ...effector.channels.map(c => `channel:${c}`),
      ...posable.includes(effector.segment) ? [`pose:${effector.segment}`] : []]);
  }
  for (const foot of feet) {
    if (!Object.hasOwn(named.segment, foot.segment)) put(segmentResource(foot.segment), [`effector:${foot.segment}`, ...foot.channels.map(channel => `channel:${channel}`),
      ...posable.includes(foot.segment) ? [`pose:${foot.segment}`] : []]);
  }
  for (const segment of segments) if (!Object.hasOwn(named.segment, segment.segment)) {
    put(segmentResource(segment.segment), [`effector:${segment.segment}`, ...segment.channels.map(channel => `channel:${channel}`),
      ...posable.includes(segment.segment) ? [`pose:${segment.segment}`] : []]);
  }
  for (const segment of posable) put(poseResource(segment), [`pose:${segment}`]);
  put(ASSIST_RESOURCE, ["assist"]);
  const supportChannels = new Set(feet.flatMap(foot => foot.channels));
  put(TRUNK_RESOURCE, channels.filter(c => !limbChannels.has(c) && !supportChannels.has(c)).map(c => `channel:${c}`));
  put(LEG_RESOURCE, ["stance", ...feet.flatMap(foot => [`effector:${foot.segment}`, ...foot.channels.map(channel => `channel:${channel}`),
    ...posable.includes(foot.segment) ? [`pose:${foot.segment}`] : []])]);
  // Each slot's id, in the order the resources first hold it; each resource's slots by id.
  const slots: string[] = [], ids = new Map<string, number>();
  for (const resource of all) for (const control of named[resource.kind][resource.name]!) if (!ids.has(control)) { ids.set(control, slots.length); slots.push(control); }
  const footprints: Record<Resource["kind"], Record<string, Int32Array>> = { segment: Object.create(null), pose: Object.create(null), service: Object.create(null) };
  for (const resource of all) footprints[resource.kind][resource.name] = Int32Array.from(named[resource.kind][resource.name]!, (control) => ids.get(control)!);
  const byKind = (kind: string): Map<string, number> => {
    const of = new Map<string, number>();
    for (let id = 0; id < slots.length; id++) if (slots[id]!.startsWith(`${kind}:`)) of.set(slots[id]!.slice(kind.length + 1), id);
    return of;
  };
  const channel = byKind("channel"), effector = byKind("effector"), pose = byKind("pose");
  const stance = ids.get("stance")!, assist = ids.get("assist")!;
  // Which slots a reading has marked: a slot is marked where it holds the reading's mark, so a reading clears nothing.
  const marks = new Uint32Array(slots.length);
  let mark = 0;
  const next = (): number => { if (++mark === 0xFFFFFFFF) { marks.fill(0); mark = 1; } return mark; };
  const footprintOf = (resource: Resource): Int32Array => {
    const footprint = footprints[resource.kind][resource.name];
    if (!footprint) throw new Error(`unknown resource ${resource}`);
    return footprint;
  };
  /** Marks the slots `resources` hold with a new mark, which it returns. */
  const marked = (resources: readonly Resource[]): number => {
    const now = next();
    // Indexed: it runs for each action's readiness many times a step, and an iterator is garbage.
    for (let r = 0; r < resources.length; r++) { const footprint = footprintOf(resources[r]!); for (let c = 0; c < footprint.length; c++) marks[footprint[c]!] = now; }
    return now;
  };
  const slotsOf = (resources: readonly Resource[]): number[] => {
    const now = next(), result: number[] = [];
    for (let r = 0; r < resources.length; r++) {
      const footprint = footprintOf(resources[r]!);
      for (let c = 0; c < footprint.length; c++) { const id = footprint[c]!; if (marks[id] !== now) { marks[id] = now; result.push(id); } }
    }
    return result;
  };
  /** That the patch writes only the slots marked `held` holds. */
  const writes = (held: number, patch: Partial<BodyCommand>): void => {
    // A slot's name is made only for the error.
    const owns = (id: number | undefined, kind: string, name: string): void => { if (id === undefined || marks[id] !== held) throw new Error(`undeclared action write ${kind}${name}`); };
    for (const name in patch.posture) owns(channel.get(name), "channel:", name);
    for (const name in patch.paths) owns(channel.get(name), "channel:", name);
    if (patch.pushes) for (let i = 0; i < patch.pushes.length; i++) { const name = patch.pushes[i]!.channel; owns(channel.get(name), "channel:", name); }
    for (const segment in patch.effectors) owns(effector.get(segment), "effector:", segment);
    if (patch.points) for (let i = 0; i < patch.points.length; i++) { const segment = patch.points[i]!.segment; owns(effector.get(segment), "effector:", segment); }
    for (let i = 0; i < support.length; i++) if (patch.effectors?.[support[i]!] && marks[stance] !== held) throw new Error("a support effector needs legs");
    for (const segment in patch.configurations) owns(pose.get(segment), "pose:", segment);
    if (patch.assist !== undefined) owns(assist, "", "assist");
    if (patch.stance !== undefined) owns(stance, "", "stance");
    if (patch.stance) for (const end of patch.stance.feet) {
      const segment = feet.find((foot) => foot.name === end)?.segment;
      if (segment !== undefined && patch.effectors?.[segment]) throw new Error(`two controllers own ${segment}`);
    }
  };
  deepFreeze(named);
  return {
    all: deepFreeze(all), slots: Object.freeze(slots), ids, stance, channel, effector, pose, slotsOf,
    controls: (resources) => slotsOf(resources).map((id) => slots[id]!),
    check(resources) { marked(resources); },
    holds(resources, slot) { const held = marked(resources); return slot >= 0 && marks[slot] === held; },
    overlap(a, b) {
      const held = marked(a);
      for (let r = 0; r < b.length; r++) { const footprint = footprintOf(b[r]!); for (let c = 0; c < footprint.length; c++) if (marks[footprint[c]!] === held) return true; }
      return false;
    },
    validate(resources, claim) {
      const held = marked(resources);
      writes(held, claim);
      if (claim.legs !== undefined && marks[stance] !== held) throw new Error("action has no legs");
      for (const one of effectors) if (support.includes(one.segment) && claim.effectors?.[one.segment] && !hasResource(resources, LEG_RESOURCE)) throw new Error("a support effector needs legs");
    },
    validatePatch(resources, patch) { writes(marked(resources), patch); },
  };
}
