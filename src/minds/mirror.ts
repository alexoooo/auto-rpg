import { Quaternion, Vector3 } from "../core/math/vector.ts";
import { clipToRef, type Assist, type AssistReading } from "../core/bodies/assist.ts";
import type { BodyControl } from "../core/bodies/body-control.ts";
import type { ContactIdentity, ContactTarget } from "../core/bodies/contact-identity.ts";
import type { ContactPair, ContactSink, MassProperties } from "../core/physics/engine.ts";
import { NOTHING_SENSED, OFF_BODY, shownSegments, type BodySense, type Senses } from "../core/bodies/senses.ts";
import type { ObjectSense, SolidSense } from "../core/bodies/object-senses.ts";
import { muscleChannels, strengthAt, type BodyLevel, type MuscleDriver, type MuscleReading } from "../core/bodies/muscle/driver.ts";
import type { BodyRef, ReadBody, ReadContact, ReadJoint, ReadManifold, ReadPhysics, ReadSegment, ReadSegmentBody } from "../core/bodies/read-body.ts";
import type { BodySpec, ConfigurationName } from "../core/bodies/spec/body.ts";
import type { Vec3 } from "../core/bodies/spec/quantity.ts";
import { deepFreeze } from "../core/world/state.ts";
import type { BuiltBody } from "../core/bodies/build/build-body.ts";
import { bodyDynamics } from "../core/bodies/build/dynamics.ts";
import { checkConfiguration, configurationModel, configurationAt, configurationCode } from "../core/bodies/build/configurations.ts";
import { jointKinematics } from "../core/bodies/build/joint-kinematics.ts";
import { segmentShapes } from "../core/bodies/build/segment-shapes.ts";

/**
 * **A body's mirror**: the body as its mind reads it (`ReadBody`, its muscles' reading side, its
 * assist, its segment configurations and its senses), made from its spec and what the world tells it once
 * (`MirrorStatics`), and refreshed from numbers the world writes (`MirrorChannel.inbound`); what its
 * mind asks (the muscles' command, the assist's ask, segment configurations) goes back as numbers
 * (`MirrorChannel.outbound`). Nothing of it reaches the engine, the world or the built body, so a
 * mind on its mirror runs wherever the numbers can be carried.
 *
 * The world writes the whole body each time a mind could read it: as each completed physics interval
 * is observed (`CommandLayers.observe`), and before the mind steps, so the mirror reads what the body
 * would have answered at each moment (`mirrorWriter`).
 *
 * Its numbers, by section (`layoutOf`): the clock and level; each segment's pose, motion, configuration, toes
 * and mass; each joint's angles, speeds, rates and turning as the muscles last read them; the
 * muscles' ceilings, delivered torque, bounds and strength (`BuiltBody.strength`); the assist's ceiling, gift, meter and withdrawal; the senses' own life; then, of variable length, each segment's contacts and manifolds,
 * each other body and object the senses show, and, where its fight labels what it touches
 * (`OwnBody.contactIdentity`), the label of each body its contacts name and of the world's.
 */

/** What a body's mirror is told once, plain data the world sends with its first numbers. */
export interface MirrorStatics {
  readonly spec: BodySpec;
  readonly gravity: Vec3;
  /** Each segment by name, its engine body's identity and its pose's name, in the order built. */
  readonly segments: readonly { readonly name: string; readonly id: number; readonly poseName: string }[];
  /** Each joint's name, in the order built: the muscles' channels' order. */
  readonly joints: readonly string[];
  /** Whether its fight labels what it touches (`OwnBody.contactIdentity`): the numbers then carry each label its contacts need. */
  readonly labelled: boolean;
  /** The world's command delay, steps (`World.delay`): at one or more, its mind decides once its motor part has answered (`embody`). */
  readonly delay: number;
}

/** What the mirror learns as the world meets it: another body's name in a contact, a body or an object its senses show. */
type Told =
  | { readonly kind: "senses"; readonly side: string; readonly begins: number | undefined; readonly ends: number | undefined; readonly solids: readonly SolidSense[] | undefined }
  | { readonly kind: "body"; readonly id: number; readonly name: string }
  | { readonly kind: "other"; readonly key: number; readonly id: string; readonly side: string; readonly spec: BodySpec }
  | { readonly kind: "object"; readonly key: number; readonly id: string; readonly owner: string | null; readonly points: Readonly<Record<string, Vec3>> }
  | { readonly kind: "label"; readonly code: number; readonly target: ContactTarget };

/**
 * **What carries one body's numbers between the world and its mirror**: what the world writes
 * (`inbound`) and the mind answers (`outbound`), each grown as it needs from where its numbers are
 * kept (`allocate`), and what the world has told the mirror once, in order (`told`), of which the
 * mirror has heard the first `heard`.
 */
export interface MirrorChannel {
  inbound: Float64Array;
  outbound: Float64Array;
  readonly told: Told[];
  heard: number;
  /** Numbers to hold `length`: where the channel's numbers are kept, memory both sides of it share where they are apart. */
  readonly allocate: (length: number) => Float64Array;
}

/** Numbers of this thread's own. */
const OWN_NUMBERS = (length: number): Float64Array => new Float64Array(length);

/** A channel for a body with `layout`'s fixed numbers, with room for some contacts and senses beyond, its numbers kept by `allocate`. */
const channelFor = (layout: Layout, allocate: (length: number) => Float64Array): MirrorChannel =>
  ({ inbound: allocate(2 * layout.fixed + 256), outbound: allocate(layout.command + 16), told: [], heard: 0, allocate });

/** The clock and level: the steps, the time, the level (`LEVELS`). */
const HEAD = 3;
/** A segment's numbers: position 3, turn 4, velocity 3, spin 3, the segment's applied and requested configuration (`configurationCode`), the toes' bend, mass 1, centre 3, moments 3, orientation 4. */
const SEGMENT = 27;
/** The assist's numbers: its ceilings 2, its gift 6, its meter 3, whether withdrawn. */
const ASSIST = 12;
/** A contact's numbers before its pairs: the other's identity (NaN for none), the fixed collider's (NaN for none), impulse, point 3, normal 3, its pairs' count. */
const CONTACT = 10;
/** A contact pair's numbers: mine, theirs, impulse, point 3, normal 3. */
const PAIR = 9;
/** A manifold's numbers before its points: the other, the fixed, mine, theirs, normal 3, impulse, its points' count. */
const MANIFOLD = 9;
/** A sensed segment's numbers, each of its body's spec's: its configuration (`configurationCode`, -1 none, `OFF_BODY` off its body), position 3, turn 4, centre 3, velocity 3, spin 3. */
const SENSED_SEGMENT = 17;
/** A sensed body's numbers after its segments: centre 3, velocity 3, out, down, life, time (NaN unread). */
const SENSED_BODY = 10;
/** A sensed object's numbers: its key, time, mass, position 3, turn 4, centre 3, velocity 3, spin 3. */
const SENSED_OBJECT = 19;

const LEVELS: readonly BodyLevel[] = ["full", "limp", "held"];

/** Where each section of a body's numbers starts, made once from its statics. */
interface Layout {
  readonly segments: number;
  /** Each joint's freedoms, where its numbers start (its angles, speeds, rates, turning, and whether it is attached), and its first freedom's muscle channel. */
  readonly joints: readonly { readonly dofs: number; readonly at: number; readonly channel: number }[];
  readonly channels: number;
  readonly muscles: number;
  readonly assist: number;
  readonly senses: number;
  /** Where the numbers of variable length begin. */
  readonly fixed: number;
  /** The command's fixed numbers: activation and velocity, the assist's ask 6; configuration requests follow. */
  readonly command: number;
}

function layoutOf(statics: Pick<MirrorStatics, "spec" | "segments" | "joints">): Layout {
  const specs = new Map(statics.spec.joints.map((joint) => [joint.name, joint]));
  let at = HEAD + SEGMENT * statics.segments.length, channels = 0;
  const joints = statics.joints.map((name) => {
    const dofs = specs.get(name)!.dofs.length, made = { dofs, at, channel: channels };
    at += 3 * dofs + dofs * dofs + 1; channels += dofs;
    return made;
  });
  const muscles = at, assist = muscles + 5 * channels, senses = assist + ASSIST;
  return { segments: statics.segments.length, joints, channels, muscles, assist, senses, fixed: senses + 2, command: 2 * channels + 6 };
}

/** `array` grown to hold `length` numbers from `allocate`, its numbers kept. */
function grown(array: Float64Array, length: number, allocate: (length: number) => Float64Array): Float64Array {
  if (length <= array.length) return array;
  const more = allocate(Math.max(length, 2 * array.length));
  more.set(array);
  return more;
}

/** What the world tells a mirror of `built` once. */
export function mirrorStatics(built: BuiltBody, labelled: boolean, delay: number): MirrorStatics {
  return { labelled, delay,
    spec: built.spec, gravity: [built.physics.gravity[0], built.physics.gravity[1], built.physics.gravity[2]],
    segments: [...built.segments].map(([name, segment]) => ({ name, id: segment.body.id, poseName: segment.pose.name })),
    joints: [...built.joints.keys()],
  };
}

/** The world's side of a body's mirror: what it reads of the body and what carries out its mind's command. */
export interface MirrorWriter {
  readonly channel: MirrorChannel;
  /**
   * Write the body as it stands, the muscles' last reading and the senses' into the channel's
   * inbound numbers; with `sensing` false, the senses as nothing yet read, as before the fight first
   * senses for the body (`NOTHING_SENSED`). Each writing takes the other of two arrays, the channel's
   * `inbound` from then: a mind still deciding on the last writing's numbers reads them as they were.
   */
  write(options?: { readonly sensing: false }): void;
  /** Carry out the command the channel's outbound numbers hold: the muscles', the assist's ask, segment configurations, each request also given to `asked`. */
  carry(asked: BodyControl["configurations"]["request"]): void;
}

/**
 * **The world's side of `built`'s mirror** (`MirrorWriter`): it reads the body, its muscles
 * (`driver`), its assist (`assist`, with its ask so far, `asked`), its senses (`sense`) and, where
 * its statics say it is labelled, how its fight labels what it touches (`labels`), and carries the
 * command out on them. `clock` is the world's; its numbers are kept by `allocate`.
 */
export function mirrorWriter(built: BuiltBody, statics: MirrorStatics, clock: { readonly steps: number; readonly time: number }, driver: MuscleDriver,
  assist: { readonly assist: Assist; readonly asked: { readonly force: Vector3; readonly moment: Vector3 } }, sense: () => Senses,
  { allocate = OWN_NUMBERS, labels }: { readonly allocate?: (length: number) => Float64Array; readonly labels?: ContactIdentity } = {}): MirrorWriter {
  if (statics.labelled !== (labels !== undefined)) throw new Error("a mirror is labelled where its fight labels what its body touches");
  const layout = layoutOf(statics), channel = channelFor(layout, allocate), segments = [...built.segments.values()], joints = [...built.joints.values()];
  const own = new Set(statics.segments.map((segment) => segment.id)), named = new Set<number>(own);
  const others = new Map<string, number>(), objects = new Map<string, number>();
  // What the senses last told of what seldom changes: the side, the fight's start and end, the solids granted.
  let side: string | null = null, begins: number | undefined, ends: number | undefined, solids: readonly SolidSense[] | undefined;
  const v = new Vector3();
  let k = 0;
  // The array the writing before last filled, the next writing's.
  let spare: Float64Array | null = null;
  const put = (x: number) => { channel.inbound[k++] = x; };
  const room = (more: number) => { channel.inbound = grown(channel.inbound, k + more, channel.allocate); };
  const vec = (a: { readonly x: number; readonly y: number; readonly z: number }) => { put(a.x); put(a.y); put(a.z); };
  // Stored straight from array to array: a number read from an array of numbers and passed on is boxed.
  const triple = (a: Vec3) => { const into = channel.inbound; into[k] = a[0]; into[k + 1] = a[1]; into[k + 2] = a[2]; k += 3; };
  const quat = (q: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }) => { put(q.x); put(q.y); put(q.z); put(q.w); };
  // The bodies this writing's contacts name, which its labels are written for.
  const touched = new Map<number, BodyRef>();
  // Each label told, by its target written out, and its code.
  const coded = new Map<string, number>();
  const identity = (other: BodyRef | null): number => {
    if (other === null) return NaN;
    if (!named.has(other.id)) { named.add(other.id); channel.told.push({ kind: "body", id: other.id, name: other.pose.name }); }
    if (labels) touched.set(other.id, other);
    return other.id;
  };
  const labelCode = (target: ContactTarget | null): number => {
    if (target === null) return -1;
    const key = JSON.stringify(target);
    let code = coded.get(key);
    if (code === undefined) { coded.set(key, code = coded.size); channel.told.push({ kind: "label", code, target }); }
    return code;
  };
  const writeLabels = (label: ContactIdentity) => {
    room(2 + 2 * touched.size);
    put(labelCode(label(null))); put(touched.size);
    for (const [id, ref] of touched) { put(id); put(labelCode(label(ref))); }
    touched.clear();
  };
  // Each segment's contacts and manifolds, told by the engine number by number (`ContactSink`), each list after its count.
  let counted = 0;
  const sink: ContactSink = {
    contact(other, fixed, impulse, px, py, pz, nx, ny, nz, pairs) {
      room(CONTACT + PAIR * pairs);
      channel.inbound[counted]! += 1;
      put(identity(other)); put(fixed ?? NaN); put(impulse); put(px); put(py); put(pz); put(nx); put(ny); put(nz); put(pairs);
    },
    pair(mine, theirs, impulse, px, py, pz, nx, ny, nz) { put(mine); put(theirs); put(impulse); put(px); put(py); put(pz); put(nx); put(ny); put(nz); },
    manifold(other, fixed, mine, theirs, nx, ny, nz, impulse, points) {
      room(MANIFOLD + 4 * points);
      channel.inbound[counted]! += 1;
      put(identity(other)); put(fixed ?? NaN); put(mine); put(theirs); put(nx); put(ny); put(nz); put(impulse); put(points);
    },
    point(x, y, z, distance) { put(x); put(y); put(z); put(distance); },
  };
  const writeContacts = () => {
    for (const segment of segments) {
      room(1); counted = k; put(0);
      built.physics.tellContacts(segment.body, sink);
      room(1); counted = k; put(0);
      built.physics.tellManifolds(segment.body, sink);
    }
  };
  const writeSenses = (senses: Senses) => {
    if (senses.side !== side || senses.begins !== begins || senses.ends !== ends || senses.solids !== solids) {
      side = senses.side; begins = senses.begins; ends = senses.ends; solids = senses.solids;
      channel.told.push({ kind: "senses", side, begins, ends, solids });
    }
    room(1); put(senses.others.length);
    for (const other of senses.others) {
      let key = others.get(other.id);
      if (key === undefined) {
        others.set(other.id, key = others.size);
        channel.told.push({ kind: "other", key, id: other.id, side: other.side, spec: other.spec });
      }
      room(1 + SENSED_SEGMENT * other.spec.segments.length + SENSED_BODY);
      put(key);
      for (const segment of other.spec.segments) {
        const s = other.segments.get(segment.name);
        if (s) { put(configurationCode(segment, s.configuration)); vec(s.position); quat(s.rotation); vec(s.centre); vec(s.velocity); vec(s.spin); }
        else { put(OFF_BODY); for (let i = 1; i < SENSED_SEGMENT; i++) put(0); }
      }
      vec(other.centre); vec(other.velocity); put(other.out ? 1 : 0); put(other.down ? 1 : 0); put(other.life); put(other.time ?? NaN);
    }
    const sensed = senses.objects;
    room(1); put(sensed === undefined ? -1 : sensed.length);
    for (const object of sensed ?? []) {
      let key = objects.get(object.id);
      if (key === undefined) {
        objects.set(object.id, key = objects.size);
        channel.told.push({ kind: "object", key, id: object.id, owner: object.owner, points: object.points });
      }
      room(SENSED_OBJECT);
      put(key); put(object.time); put(object.mass); triple(object.position);
      put(object.rotation[0]); put(object.rotation[1]); put(object.rotation[2]); put(object.rotation[3]);
      triple(object.centre); triple(object.velocity); triple(object.spin);
    }
  };
  return {
    channel,
    write({ sensing = true }: { readonly sensing?: boolean } = {}) {
      const senses = sensing ? sense() : NOTHING_SENSED;
      const next = spare ?? channel.allocate(channel.inbound.length);
      spare = channel.inbound;
      channel.inbound = next;
      k = 0;
      put(clock.steps); put(clock.time); put(LEVELS.indexOf(driver.level));
      for (const segment of segments) {
        const pose = segment.pose, mass: MassProperties = segment.body.massProperties;
        vec(pose.position); quat(pose.rotation);
        vec(segment.body.linearVelocityToRef(v)); vec(segment.body.angularVelocityToRef(v));
        put(configurationCode(segment.spec, segment.configuration?.applied)); put(configurationCode(segment.spec, segment.configuration?.requested)); put(segment.toes?.bend ?? 0);
        put(mass.mass); triple(mass.centre); triple(mass.moments); quat(mass.orientation);
      }
      let c = 0;
      for (let j = 0; j < layout.joints.length; j++) {
        const joint = layout.joints[j]!;
        for (let i = 0; i < joint.dofs; i++) put(driver.angle(c + i));
        for (let i = 0; i < joint.dofs; i++) put(driver.speed(c + i));
        for (let i = 0; i < joint.dofs; i++) put(driver.rate(c + i));
        for (let i = 0; i < joint.dofs; i++) for (let j = 0; j < joint.dofs; j++) put(driver.turning(c + i, j));
        put(joints[j]!.attached() ? 1 : 0);
        c += joint.dofs;
      }
      const n = layout.channels;
      channel.inbound.set(driver.ceiling, k); k += n;
      channel.inbound.set(driver.pulled, k); k += n;
      channel.inbound.set(driver.bounds.negative, k); k += n;
      channel.inbound.set(driver.bounds.positive, k); k += n;
      channel.inbound.set(built.strength, k); k += n;
      const help = assist.assist;
      put(help.most.force); put(help.most.moment); vec(help.given.force); vec(help.given.moment);
      put(help.meter.steps); put(help.meter.force); put(help.meter.moment); put(help.withdrawn ? 1 : 0);
      put(senses.out ? 1 : 0); put(senses.life);
      writeContacts();
      writeSenses(senses);
      if (labels) writeLabels(labels);
    },
    carry(asked) {
      const out = channel.outbound, n = layout.channels;
      driver.activation.set(out.subarray(0, n));
      driver.velocity.set(out.subarray(n, 2 * n));
      assist.asked.force.set(out[2 * n]!, out[2 * n + 1]!, out[2 * n + 2]!);
      assist.asked.moment.set(out[2 * n + 3]!, out[2 * n + 4]!, out[2 * n + 5]!);
      let at = layout.command;
      const count = out[at++]!;
      for (let r = 0; r < count; r++, at += 2) {
        const entry = built.configurations.model[out[at]!]!;
        asked(entry.segment, entry.configurations[out[at + 1]!]!);
      }
    },
  };
}

/** A sensed body as the mirror shows it, its fields set from the numbers. */
type Shown = { -readonly [K in keyof BodySense]: BodySense[K] };

/** **The mind's side of a body's mirror**: the body it reads, and what refreshes it and sends its command back. */
export interface Mirror {
  readonly read: ReadBody;
  /** How its fight labels what it touches, as the numbers last read tell it, where it labels any (`MirrorStatics.labelled`). */
  readonly contactIdentity?: ContactIdentity;
  readonly muscles: MuscleReading;
  readonly assist: AssistReading;
  readonly control: BodyControl;
  readonly senses: Senses;
  /** The steps and time of the numbers last read. */
  readonly steps: number;
  readonly time: number;
  /**
   * Read the body from the channel's inbound numbers; with `dynamics`, read the body's dynamics
   * from them as its muscles do before their mind steps. What it senses is read apart (`sense`).
   */
  refresh(options: { readonly dynamics: boolean }): void;
  /** Read what its body senses from the numbers the last refresh read into what its senses show (`seen`), and show it (`senses`) until the next. */
  sense(): void;
  /**
   * **What its senses show**, plain data its bout saves (`MirrorSeen`): what its mind last decided
   * on, which its motor part still reads at a delay (`SplitDriver`).
   */
  readonly seen: MirrorSeen;
  /** Show what its senses show (`seen`) as its senses, as after a load: each body it shows that its numbers have told it of. */
  recall(): void;
  /** Write what its mind asked into the channel's outbound numbers, and forget configuration requests sent. */
  answer(): void;
  /**
   * **What its mind has asked and not yet answered**, plain data its bout saves (`MirrorCommand`):
   * kept from step to step as its body keeps it, read by none but the answer.
   */
  readonly command: MirrorCommand;
  /** Its body has left `full`: what its mind asked is dropped, as its body drops the command it holds. */
  idle(): void;
}

/** What a mirror's mind has asked: its muscles' command, assist and segment/configuration pairs in request order. */
export interface MirrorCommand {
  readonly activation: Float64Array;
  readonly velocity: Float64Array;
  readonly asked: { readonly force: Vector3; readonly moment: Vector3 };
  readonly configurations: number[];
}

/** What a mirror's senses show, as it last read them: the time, whether its body is out, its life, each other body by its id and its numbers, and the objects. */
export interface MirrorSeen {
  time: number;
  out: boolean;
  life: number;
  readonly others: { readonly id: string; readonly numbers: Float64Array }[];
  objects: readonly ObjectSense[] | undefined;
}

const EMPTY: readonly never[] = Object.freeze([]);

/**
 * **`statics`'s body as its mind reads it, from `channel`'s numbers** (`Mirror`): made from the spec
 * as the builder makes it (`segmentShapes`, `jointKinematics`), so that a segment, a joint and a
 * contact's other side are one object wherever its mind meets them, as in the body's own read view.
 */
export function mirrorBody(statics: MirrorStatics, channel: MirrorChannel): Mirror {
  const layout = layoutOf(statics), spec = statics.spec;
  const specs = new Map(spec.segments.map((segment) => [segment.name, segment]));
  const byId = new Map<number, BodyRef>();
  const spins = new Map<ReadSegment, Vector3>();
  const records = statics.segments.map(({ name, id, poseName }) => {
    const segmentSpec = specs.get(name)!;
    const { frame, initial, poses, bent, rigidAt } = segmentShapes(spec, segmentSpec);
    const pose = Object.freeze({ name: poseName, position: new Vector3(), rotation: new Quaternion() });
    const linear = new Vector3(), angular = new Vector3();
    const motion = { mass: { mass: 0, centre: [0, 0, 0], moments: [0, 0, 0], orientation: new Quaternion() } as MassProperties };
    const body: ReadSegmentBody = Object.freeze({
      id, pose,
      linearVelocityToRef: (out: Vector3) => out.copyFrom(linear),
      angularVelocityToRef: (out: Vector3) => out.copyFrom(angular),
      get massProperties() { return motion.mass; },
    });
    const configuration: { applied: ConfigurationName; requested: ConfigurationName } | undefined = poses ? { applied: initial!, requested: initial! } : undefined;
    const toes = bent ? { bend: 0 } : undefined;
    const rest = Quaternion.RotationQuaternionFromAxis(new Vector3(frame.x[0], frame.x[1], frame.x[2]), new Vector3(frame.y[0], frame.y[1], frame.y[2]), new Vector3(frame.z[0], frame.z[1], frame.z[2]));
    const segment: ReadSegment = Object.freeze({ spec: segmentSpec, frame, pose, body, rest, get rigid() { return rigidAt(configuration?.applied, toes); },
      ...(configuration ? { configuration } : {}), ...(poses ? { poses } : {}), ...(toes ? { toes } : {}) });
    byId.set(id, body);
    spins.set(segment, angular);
    return { segment, pose, linear, angular, motion, configuration, toes };
  });
  const segments = new Map(records.map((record, i) => [statics.segments[i]!.name, record.segment]));
  const jointSpecs = new Map(spec.joints.map((joint) => [joint.name, joint]));
  const strength = new Float64Array(layout.channels).fill(1), attached = new Uint8Array(layout.joints.length).fill(1);
  const joints = new Map<string, ReadJoint>(statics.joints.map((name, j) => {
    const jointSpec = jointSpecs.get(name)!, { dofs, axes } = jointKinematics(jointSpec), at = layout.joints[j]!.channel;
    return [name, Object.freeze({ spec: jointSpec, dofs, axes, parent: segments.get(jointSpec.parent)!, child: segments.get(jointSpec.child)!,
      strength: (dof: number) => strength[at + dof]!, attached: () => attached[j] === 1 })];
  }));
  const index = new Map<ReadSegmentBody, number>(records.map((record, i) => [record.segment.body, i]));
  /** Where each segment's contacts and manifolds start in the inbound numbers, as last read. */
  const contactsAt = new Int32Array(records.length), manifoldsAt = new Int32Array(records.length);
  // Each segment's contacts and manifolds as an unfiltered read last made them from the numbers: the same until they are refreshed.
  const whole = { contacts: new Array<readonly ReadContact[] | null>(records.length).fill(null), manifolds: new Array<readonly ReadManifold[] | null>(records.length).fill(null) };
  const names = new Map<number, string>();
  const refOf = (code: number): BodyRef | null => {
    if (Number.isNaN(code)) return null;
    let ref = byId.get(code);
    if (!ref) { ref = Object.freeze({ id: code, pose: Object.freeze({ name: names.get(code)! }) }); byId.set(code, ref); }
    return ref;
  };
  const at3 = (a: Float64Array, i: number): Vec3 => [a[i]!, a[i + 1]!, a[i + 2]!];
  const segmentOf = (body: ReadSegmentBody): number => {
    const i = index.get(body);
    if (i === undefined) throw new Error("contacts are read of a body's own segments");
    return i;
  };
  const physics: ReadPhysics = Object.freeze({
    gravity: statics.gravity,
    contactsOf(body: ReadSegmentBody, wanted?: (other: BodyRef | null) => boolean): readonly ReadContact[] {
      const a = channel.inbound, s = segmentOf(body), kept = wanted ? null : whole.contacts[s]!;
      if (kept) return kept;
      let at = contactsAt[s]!, out: ReadContact[] | null = null;
      const count = a[at++]!;
      for (let c = 0; c < count; c++) {
        const other = refOf(a[at]!), fixed = a[at + 1]!, impulse = a[at + 2]!, pairs = a[at + 9]!;
        const point = at3(a, at + 3), normal = at3(a, at + 6);
        at += CONTACT;
        if (wanted && !wanted(other)) { at += PAIR * pairs; continue; }
        const made: ContactPair[] = [];
        for (let p = 0; p < pairs; p++, at += PAIR) made.push({ mine: a[at]!, theirs: a[at + 1]!, impulse: a[at + 2]!, point: at3(a, at + 3), normal: at3(a, at + 6) });
        (out ??= []).push({ other, fixed: Number.isNaN(fixed) ? null : fixed, impulse, point, normal, pairs: made });
      }
      if (!wanted) whole.contacts[s] = out ?? EMPTY;
      return out ?? EMPTY;
    },
    contactManifoldsOf(body: ReadSegmentBody, wanted?: (other: BodyRef | null) => boolean) {
      const a = channel.inbound, s = segmentOf(body), kept = wanted ? null : whole.manifolds[s]!;
      if (kept) return kept;
      let at = manifoldsAt[s]!;
      const out: { other: BodyRef | null; fixed: number | null; mine: number; theirs: number; normal: Vec3; points: { point: Vec3; distance: number }[]; impulse: number }[] = [];
      const count = a[at++]!;
      for (let m = 0; m < count; m++) {
        const other = refOf(a[at]!), fixed = a[at + 1]!, mine = a[at + 2]!, theirs = a[at + 3]!, normal = at3(a, at + 4), impulse = a[at + 7]!, points = a[at + 8]!;
        at += MANIFOLD;
        if (wanted && !wanted(other)) { at += 4 * points; continue; }
        const made: { point: Vec3; distance: number }[] = [];
        for (let p = 0; p < points; p++, at += 4) made.push({ point: at3(a, at), distance: a[at + 3]! });
        out.push({ other, fixed: Number.isNaN(fixed) ? null : fixed, mine, theirs, normal, points: made, impulse });
      }
      if (!wanted) whole.manifolds[s] = out.length === 0 ? EMPTY : out;
      return out.length === 0 ? EMPTY : out;
    },
  });
  const model = configurationModel(spec.segments);
  const configurationState = Object.fromEntries(model.map(({ segment }) => [segment, records[statics.segments.findIndex((s) => s.name === segment)]!.configuration!]));
  const read: ReadBody = Object.freeze({ spec, physics, segments, joints,
    configurations: Object.freeze({ model, state: Object.freeze(configurationState) }) });

  const n = layout.channels, channels = muscleChannels(read);
  const angles = new Float64Array(n), speeds = new Float64Array(n), rates = new Float64Array(n), turning = new Float64Array(3 * n);
  const jointAngles = layout.joints.map((joint) => new Array<number>(joint.dofs).fill(0));
  const state = { level: "full" as BodyLevel, activation: new Float64Array(n), velocity: new Float64Array(n), ceiling: new Float64Array(n), pulled: new Float64Array(n),
    bounds: { negative: new Float64Array(n), positive: new Float64Array(n) } };
  const motion_ = { spin: (segment: ReadSegment) => spins.get(segment)! };
  let dynamics: ReturnType<typeof bodyDynamics> | null = null;
  const byName = new Map(channels.map((c, i) => [c.name, i]));
  const muscles: MuscleReading = {
    channels, ceiling: state.ceiling, pulled: state.pulled, bounds: state.bounds,
    get dynamics() { return dynamics!; },
    angle: (i) => angles[i]!, rate: (i) => rates[i]!, speed: (i) => speeds[i]!, turning: (i, k) => turning[3 * i + k]!,
    strength: (i, sense) => strengthAt(channels[i]!, sense, speeds[i]!),
    channel(name) {
      const i = byName.get(name);
      if (i === undefined) throw new Error(`${spec.model} has no muscle channel "${name}"`);
      return i;
    },
  };

  const asked = { force: new Vector3(), moment: new Vector3() };
  const help = { most: { force: 0, moment: 0 }, given: { force: new Vector3(), moment: new Vector3() }, meter: { steps: 0, force: 0, moment: 0 }, withdrawn: false };
  const assist: AssistReading = {
    get on() { return !help.withdrawn && (help.most.force > 0 || help.most.moment > 0); },
    get withdrawn() { return help.withdrawn; },
    most: help.most, given: help.given, meter: help.meter,
    clipToRef(force, moment, givenForce, givenMoment) {
      clipToRef(force, help.withdrawn ? 0 : help.most.force, givenForce);
      clipToRef(moment, help.withdrawn ? 0 : help.most.moment, givenMoment);
    },
  };

  const clock = { steps: 0, time: 0, solids: undefined as readonly SolidSense[] | undefined };
  const seen: MirrorSeen = { time: 0, out: false, life: 1, others: [], objects: undefined };
  const shown = new Map<number, Shown>(), shownBy = new Map<string, { readonly other: Shown; readonly view: ReturnType<typeof shownSegments> }>(), statics_ = new Map<number, ObjectStatics>(), others: Shown[] = [];
  const senses: { -readonly [K in keyof Senses]: Senses[K] } = {
    get time() { return seen.time; },
    side: "",
    get out() { return seen.out; },
    get life() { return seen.life; },
    others,
  };
  Object.defineProperty(senses, "objects", { enumerable: true, get: () => seen.objects });
  // Where the last refresh found the senses' own life, and the bodies and objects they show.
  let lifeAt = 0, sensesAt = 0;

  /** Segment and configuration codes in request order since the last answer. */
  const configurations: number[] = [];
  const command: MirrorCommand = { activation: state.activation, velocity: state.velocity, asked, configurations };
  const control: BodyControl = { muscles: { activation: state.activation, velocity: state.velocity }, assist: asked,
    configurations: { request(segment, configuration) {
      const code = checkConfiguration(model, segment, configuration);
      for (let i = 0; i < configurations.length; i += 2) if (configurations[i] === code) throw new Error(`duplicate configuration request for ${segment}`);
      configurationState[segment]!.requested = configuration;
      configurations.push(code, model[code]!.configurations.indexOf(configuration));
    } },
  };
  /** Each label told, by its code; the world's, and each touched body's, as the numbers last read tell them. */
  const targets: ContactTarget[] = [], labelled = { world: -1, bodies: new Map<number, number>() };
  const label = (code: number | undefined): ContactTarget | null => code === undefined || code < 0 ? null : targets[code]!;
  const hear = () => {
    for (; channel.heard < channel.told.length; channel.heard++) {
      const told = channel.told[channel.heard]!;
      switch (told.kind) {
        case "senses":
          senses.side = told.side;
          if (told.begins === undefined) delete senses.begins; else senses.begins = told.begins;
          if (told.ends === undefined) delete senses.ends; else senses.ends = told.ends;
          if (told.solids !== undefined && clock.solids === undefined) Object.defineProperty(senses, "solids", { enumerable: true, get: () => clock.solids });
          clock.solids = told.solids;
          break;
        case "body": names.set(told.id, told.name); break;
        case "other": {
          const view = shownSegments(told.spec.segments.map((segment) => segment.name));
          const other: Shown = { id: told.id, side: told.side, spec: told.spec, out: false, down: false, life: 1, time: 0,
            centre: new Vector3(), velocity: new Vector3(), segments: view.settle() };
          shown.set(told.key, other); shownBy.set(told.id, { other, view });
          break;
        }
        case "object": statics_.set(told.key, { id: told.id, owner: told.owner, points: told.points }); break;
        case "label": targets[told.code] = deepFreeze(told.target); break;
        default: { const never: never = told; throw new Error(`nothing told as ${JSON.stringify(never)}`); }
      }
    }
  };
  const mirror: Mirror = {
    read, muscles, assist, control, senses,
    ...(statics.labelled ? { contactIdentity: (other: BodyRef | null) => other === null ? label(labelled.world) : label(labelled.bodies.get(other.id)) } : {}),
    get steps() { return clock.steps; }, get time() { return clock.time; },
    refresh({ dynamics: reading }) {
      hear();
      const a = channel.inbound;
      let k = 0;
      clock.steps = a[k++]!; clock.time = a[k++]!; state.level = LEVELS[a[k++]!]!;
      for (const record of records) {
        record.pose.position.set(a[k]!, a[k + 1]!, a[k + 2]!);
        record.pose.rotation.set(a[k + 3]!, a[k + 4]!, a[k + 5]!, a[k + 6]!);
        record.linear.set(a[k + 7]!, a[k + 8]!, a[k + 9]!);
        record.angular.set(a[k + 10]!, a[k + 11]!, a[k + 12]!);
        if (record.configuration) { record.configuration.applied = configurationAt(record.segment.spec, a[k + 13]!); record.configuration.requested = configurationAt(record.segment.spec, a[k + 14]!); }
        if (record.toes) record.toes.bend = a[k + 15]!;
        const m = record.motion.mass, o = m.orientation;
        if (m.mass !== a[k + 16] || m.centre[0] !== a[k + 17] || m.centre[1] !== a[k + 18] || m.centre[2] !== a[k + 19]
          || m.moments[0] !== a[k + 20] || m.moments[1] !== a[k + 21] || m.moments[2] !== a[k + 22]
          || o.x !== a[k + 23] || o.y !== a[k + 24] || o.z !== a[k + 25] || o.w !== a[k + 26]) {
          record.motion.mass = { mass: a[k + 16]!, centre: at3(a, k + 17), moments: at3(a, k + 20), orientation: new Quaternion(a[k + 23]!, a[k + 24]!, a[k + 25]!, a[k + 26]!) };
        }
        k += SEGMENT;
      }
      let c = 0;
      layout.joints.forEach((joint, j) => {
        const d = joint.dofs, mine = jointAngles[j]!;
        for (let i = 0; i < d; i++) { angles[c + i] = a[k + i]!; mine[i] = a[k + i]!; speeds[c + i] = a[k + d + i]!; rates[c + i] = a[k + 2 * d + i]!; }
        for (let i = 0; i < d; i++) for (let m = 0; m < d; m++) turning[3 * (c + i) + m] = a[k + 3 * d + i * d + m]!;
        attached[j] = a[k + 3 * d + d * d]!;
        k += 3 * d + d * d + 1; c += d;
      });
      state.ceiling.set(a.subarray(k, k + n)); k += n;
      state.pulled.set(a.subarray(k, k + n)); k += n;
      state.bounds.negative.set(a.subarray(k, k + n)); k += n;
      state.bounds.positive.set(a.subarray(k, k + n)); k += n;
      strength.set(a.subarray(k, k + n)); k += n;
      help.most.force = a[k++]!; help.most.moment = a[k++]!;
      help.given.force.set(a[k]!, a[k + 1]!, a[k + 2]!); help.given.moment.set(a[k + 3]!, a[k + 4]!, a[k + 5]!); k += 6;
      help.meter.steps = a[k++]!; help.meter.force = a[k++]!; help.meter.moment = a[k++]!; help.withdrawn = a[k++] === 1;
      lifeAt = k; k += 2;
      whole.contacts.fill(null); whole.manifolds.fill(null);
      for (let s = 0; s < records.length; s++) {
        contactsAt[s] = k;
        const contacts = a[k++]!;
        for (let i = 0; i < contacts; i++) k += CONTACT + PAIR * a[k + 9]!;
        manifoldsAt[s] = k;
        const manifolds = a[k++]!;
        for (let i = 0; i < manifolds; i++) k += MANIFOLD + 4 * a[k + 8]!;
      }
      sensesAt = k;
      const count = a[k++]!;
      for (let i = 0; i < count; i++) k += 1 + shown.get(a[k]!)!.spec.segments.length * SENSED_SEGMENT + SENSED_BODY;
      const sensed = a[k++]!;
      if (sensed > 0) k += sensed * SENSED_OBJECT;
      if (statics.labelled) {
        labelled.world = a[k++]!;
        labelled.bodies.clear();
        const count = a[k++]!;
        for (let i = 0; i < count; i++, k += 2) labelled.bodies.set(a[k]!, a[k + 1]!);
      }
      if (reading) dynamics!.update(jointAngles, motion_);
    },
    sense() {
      const a = channel.inbound;
      seen.time = clock.time; seen.out = a[lifeAt] === 1; seen.life = a[lifeAt + 1]!;
      let k = sensesAt;
      const count = a[k++]!, bodies = seen.others;
      bodies.length = count;
      for (let i = 0; i < count; i++) {
        const other = shown.get(a[k++]!)!, length = other.spec.segments.length * SENSED_SEGMENT + SENSED_BODY;
        let body = bodies[i];
        if (body?.id !== other.id || body.numbers.length !== length) bodies[i] = body = { id: other.id, numbers: new Float64Array(length) };
        body.numbers.set(a.subarray(k, k + length));
        k += length;
      }
      const sensed = a[k++]!;
      if (sensed < 0) seen.objects = undefined;
      else {
        const made: ObjectSense[] = [];
        for (let i = 0; i < sensed; i++, k += SENSED_OBJECT) {
          const fixed = statics_.get(a[k]!)!;
          made.push({ id: fixed.id, owner: fixed.owner, points: fixed.points, time: a[k + 1]!, mass: a[k + 2]!, position: at3(a, k + 3),
            rotation: [a[k + 6]!, a[k + 7]!, a[k + 8]!, a[k + 9]!], centre: at3(a, k + 10), velocity: at3(a, k + 13), spin: at3(a, k + 16) });
        }
        seen.objects = deepFreeze(made);
      }
      mirror.recall();
    },
    recall() {
      others.length = 0;
      for (const { id, numbers: a } of seen.others) {
        const known = shownBy.get(id);
        if (!known) continue;
        const { other, view } = known;
        let k = 0;
        for (let i = 0; i < view.all.length; i++) {
          const s = view.all[i]!, pose = a[k]!;
          view.mark(i, pose !== OFF_BODY);
          if (pose >= 0) s.configuration = configurationAt(other.spec.segments[i]!, pose);
          s.position.set(a[k + 1]!, a[k + 2]!, a[k + 3]!);
          s.rotation.set(a[k + 4]!, a[k + 5]!, a[k + 6]!, a[k + 7]!);
          s.centre.set(a[k + 8]!, a[k + 9]!, a[k + 10]!);
          s.velocity.set(a[k + 11]!, a[k + 12]!, a[k + 13]!);
          s.spin.set(a[k + 14]!, a[k + 15]!, a[k + 16]!);
          k += SENSED_SEGMENT;
        }
        other.segments = view.settle();
        other.centre.set(a[k]!, a[k + 1]!, a[k + 2]!);
        other.velocity.set(a[k + 3]!, a[k + 4]!, a[k + 5]!);
        other.out = a[k + 6] === 1; other.down = a[k + 7] === 1; other.life = a[k + 8]!;
        if (Number.isNaN(a[k + 9])) delete other.time; else other.time = a[k + 9]!;
        others.push(other);
      }
    },
    answer() {
      channel.outbound = grown(channel.outbound, layout.command + 1 + configurations.length, channel.allocate);
      const out = channel.outbound;
      out.set(state.activation, 0); out.set(state.velocity, n);
      out[2 * n] = asked.force.x; out[2 * n + 1] = asked.force.y; out[2 * n + 2] = asked.force.z;
      out[2 * n + 3] = asked.moment.x; out[2 * n + 4] = asked.moment.y; out[2 * n + 5] = asked.moment.z;
      let at = layout.command;
      out[at++] = configurations.length / 2;
      for (let i = 0; i < configurations.length; i++) out[at++] = configurations[i]!;
      configurations.length = 0;
    },
    command, seen,
    idle() {
      state.activation.fill(0); state.velocity.fill(0);
      asked.force.setAll(0); asked.moment.setAll(0);
      configurations.length = 0;
    },
  };
  // Its dynamics are made as its muscles make theirs, from the body as it first stands.
  mirror.refresh({ dynamics: false });
  mirror.sense();
  dynamics = bodyDynamics(read, statics.gravity);
  return mirror;
}

/** What an object the senses show keeps from its first showing. */
interface ObjectStatics { readonly id: string; readonly owner: string | null; readonly points: Readonly<Record<string, Vec3>> }
