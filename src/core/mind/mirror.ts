import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { clipToRef, type Assist } from "../control/assist.ts";
import type { ContactPair, MassProperties } from "../engine/engine.ts";
import { NOTHING_SENSED, type BodySense, type Senses } from "./senses.ts";
import type { ObjectSense, SolidSense } from "./object-senses.ts";
import { muscleChannels, strengthAt, type BodyLevel, type MuscleDriver } from "../muscle/driver.ts";
import type { BodyRef, ReadBody, ReadContact, ReadJoint, ReadPhysics, ReadSegment, ReadSegmentBody } from "../read-body.ts";
import type { BodySpec, HandPose } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { bodyDynamics } from "../build/dynamics.ts";
import { checkHandPoses, handPoseModel, type HandPoseRequest } from "../build/hand-poses.ts";
import { jointKinematics } from "../build/joint-kinematics.ts";
import { jointTracker } from "../build/joint-state.ts";
import { cos, sin } from "../math/real.ts";
import { segmentShapes } from "../build/segment-shapes.ts";

/**
 * **A body's mirror**: the body as its mind reads it (`ReadBody`, its muscles' reading side, its
 * assist, its hands and its senses), made from its spec and what the world tells it once
 * (`MirrorStatics`), and refreshed from numbers the world writes (`MirrorChannel.inbound`); what its
 * mind asks (the muscles' command, the assist's ask, the hands' poses) goes back as numbers
 * (`MirrorChannel.outbound`). Nothing of it reaches the engine, the world or the built body, so a
 * mind on its mirror runs wherever the numbers can be carried.
 *
 * The world writes the whole body each time a mind could read it: as each completed physics interval
 * is observed (`OwnBody.afterPhysics`), and before the mind steps, so the mirror reads what the body
 * would have answered at each moment (`mirrorWriter`).
 *
 * Its numbers, by section (`layoutOf`): the clock and level; each segment's pose, motion, hand, toes
 * and mass; each joint's angles, speeds, rates and turning as the muscles last read them; the
 * muscles' command, ceilings, delivered torque and bounds; the assist's ceiling, ask, gift, meter and
 * withdrawal; the senses' own life; then, of variable length, each segment's contacts and manifolds,
 * and each other body and object the senses show.
 */

/** What a body's mirror is told once, plain data the world sends with its first numbers. */
export interface MirrorStatics {
  readonly spec: BodySpec;
  readonly gravity: Vec3;
  /** Each segment by name, its engine body's identity and its node's name, in the order built. */
  readonly segments: readonly { readonly name: string; readonly id: number; readonly node: string }[];
  /** Each joint's name, in the order built: the muscles' channels' order. */
  readonly joints: readonly string[];
}

/** What the mirror learns as the world meets it: another body's name in a contact, a body or an object its senses show. */
type Told =
  | { readonly kind: "senses"; readonly side: string; readonly ends: number | undefined; readonly solids: readonly SolidSense[] | undefined }
  | { readonly kind: "body"; readonly id: number; readonly name: string }
  | { readonly kind: "other"; readonly key: number; readonly id: string; readonly side: string; readonly spec: BodySpec; readonly segments: readonly string[] }
  | { readonly kind: "object"; readonly key: number; readonly id: string; readonly owner: string | null; readonly points: Readonly<Record<string, Vec3>> };

/**
 * **What carries one body's numbers between the world and its mirror**: what the world writes
 * (`inbound`) and the mind answers (`outbound`), each grown as it needs, and what the world has told
 * the mirror once, in order (`told`), of which the mirror has heard the first `heard`.
 */
export interface MirrorChannel {
  inbound: Float64Array;
  outbound: Float64Array;
  readonly told: Told[];
  heard: number;
}

/** A channel for a body with `layout`'s fixed numbers, with room for some contacts and senses beyond. */
const channelFor = (layout: Layout): MirrorChannel =>
  ({ inbound: new Float64Array(2 * layout.fixed + 256), outbound: new Float64Array(layout.command + 16), told: [], heard: 0 });

/** The clock and level: the steps, the time, the level (`LEVELS`). */
const HEAD = 3;
/** A segment's numbers: position 3, turn 4, velocity 3, spin 3, the hand's applied and requested pose (`POSES`), the toes' bend, mass 1, centre 3, moments 3, orientation 4. */
const SEGMENT = 27;
/** The assist's numbers: its ceilings 2, its ask 6, its gift 6, its meter 3, whether withdrawn. */
const ASSIST = 18;
/** A contact's numbers before its pairs: the other's identity (NaN for none), the fixed collider's (NaN for none), impulse, point 3, normal 3, its pairs' count. */
const CONTACT = 10;
/** A contact pair's numbers: mine, theirs, impulse, point 3, normal 3. */
const PAIR = 9;
/** A manifold's numbers before its points: the other, the fixed, mine, theirs, normal 3, impulse, its points' count. */
const MANIFOLD = 9;
/** A sensed segment's numbers: its hand's pose (`POSES`, -1 none), position 3, turn 4, centre 3, velocity 3, spin 3. */
const SENSED_SEGMENT = 17;
/** A sensed body's numbers after its segments: centre 3, velocity 3, out, down, life, time (NaN unread). */
const SENSED_BODY = 10;
/** A sensed object's numbers: its key, time, mass, position 3, turn 4, centre 3, velocity 3, spin 3. */
const SENSED_OBJECT = 19;

const LEVELS: readonly BodyLevel[] = ["full", "limp", "held"];
const POSES: readonly HandPose[] = ["open", "fist", "grip"];
const poseCode = (pose: HandPose | undefined): number => pose === undefined ? -1 : POSES.indexOf(pose);

/** Where each section of a body's numbers starts, made once from its statics. */
interface Layout {
  readonly segments: number;
  /** Each joint's freedoms, and where its numbers start. */
  readonly joints: readonly { readonly dofs: number; readonly at: number }[];
  readonly channels: number;
  readonly muscles: number;
  readonly assist: number;
  readonly senses: number;
  /** Where the numbers of variable length begin. */
  readonly fixed: number;
  /** The command's fixed numbers: activation and velocity, the assist's ask 6; the hands' requests follow. */
  readonly command: number;
}

function layoutOf(statics: Pick<MirrorStatics, "spec" | "segments" | "joints">): Layout {
  const specs = new Map(statics.spec.joints.map((joint) => [joint.name, joint]));
  let at = HEAD + SEGMENT * statics.segments.length, channels = 0;
  const joints = statics.joints.map((name) => {
    const dofs = specs.get(name)!.dofs.length, made = { dofs, at };
    at += 3 * dofs + dofs * dofs; channels += dofs;
    return made;
  });
  const muscles = at, assist = muscles + 6 * channels, senses = assist + ASSIST;
  return { segments: statics.segments.length, joints, channels, muscles, assist, senses, fixed: senses + 2, command: 2 * channels + 6 };
}

/** `array` grown to hold `length` numbers, its numbers kept. */
function grown(array: Float64Array, length: number): Float64Array {
  if (length <= array.length) return array;
  const more = new Float64Array(Math.max(length, 2 * array.length));
  more.set(array);
  return more;
}

/** What the world tells a mirror of `built` once. */
export function mirrorStatics(built: BuiltBody): MirrorStatics {
  return {
    spec: built.spec, gravity: [built.physics.gravity[0], built.physics.gravity[1], built.physics.gravity[2]],
    segments: [...built.segments].map(([name, segment]) => ({ name, id: segment.body.id, node: segment.node.name })),
    joints: [...built.joints.keys()],
  };
}

/** The world's side of a body's mirror: what it reads of the body and what carries out its mind's command. */
export interface MirrorWriter {
  readonly channel: MirrorChannel;
  /**
   * Write the body as it stands, the muscles' last reading and the senses' into the channel's
   * inbound numbers; with `sensing` false, the senses as nothing yet read, as before the fight first
   * senses for the body (`NOTHING_SENSED`).
   */
  write(options?: { readonly sensing: false }): void;
  /** Carry out the command the channel's outbound numbers hold: the muscles', the assist's ask, the hands' poses, each request also given to `asked`. */
  carry(asked: (requests: readonly HandPoseRequest[]) => void): void;
}

/**
 * **The world's side of `built`'s mirror** (`MirrorWriter`): it reads the body, its muscles
 * (`driver`), its assist (`assist`, with its ask so far, `asked`) and its senses (`sense`), and
 * carries the command out on them. `clock` is the world's.
 */
export function mirrorWriter(built: BuiltBody, statics: MirrorStatics, clock: { readonly steps: number; readonly time: number }, driver: MuscleDriver,
  assist: { readonly assist: Assist; readonly asked: { readonly force: Vector3; readonly moment: Vector3 } }, sense: () => Senses): MirrorWriter {
  const layout = layoutOf(statics), channel = channelFor(layout), segments = [...built.segments.values()];
  const own = new Set(statics.segments.map((segment) => segment.id)), named = new Set<number>(own);
  const others = new Map<string, number>(), objects = new Map<string, number>();
  // What the senses last told of what seldom changes: the side, the fight's end, the solids granted.
  let side: string | null = null, ends: number | undefined, solids: readonly SolidSense[] | undefined;
  const v = new Vector3();
  let k = 0;
  const put = (x: number) => { channel.inbound[k++] = x; };
  const room = (more: number) => { channel.inbound = grown(channel.inbound, k + more); };
  const vec = (a: { readonly x: number; readonly y: number; readonly z: number }) => { put(a.x); put(a.y); put(a.z); };
  const triple = (a: Vec3) => { put(a[0]); put(a[1]); put(a[2]); };
  const quat = (q: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }) => { put(q.x); put(q.y); put(q.z); put(q.w); };
  const identity = (other: { readonly id: number; readonly node: { readonly name: string } } | null): number => {
    if (other === null) return NaN;
    if (!named.has(other.id)) { named.add(other.id); channel.told.push({ kind: "body", id: other.id, name: other.node.name }); }
    return other.id;
  };
  const writeContacts = () => {
    for (const segment of segments) {
      const contacts = built.physics.contactsOf(segment.body);
      room(1); put(contacts.length);
      for (const contact of contacts) {
        room(CONTACT + PAIR * contact.pairs.length);
        put(identity(contact.other)); put(contact.fixed ?? NaN); put(contact.impulse); triple(contact.point); triple(contact.normal); put(contact.pairs.length);
        for (const pair of contact.pairs) { put(pair.mine); put(pair.theirs); put(pair.impulse); triple(pair.point); triple(pair.normal); }
      }
      const manifolds = built.physics.contactManifoldsOf(segment.body);
      room(1); put(manifolds.length);
      for (const manifold of manifolds) {
        room(MANIFOLD + 4 * manifold.points.length);
        put(identity(manifold.other)); put(manifold.fixed ?? NaN); put(manifold.mine); put(manifold.theirs); triple(manifold.normal); put(manifold.impulse); put(manifold.points.length);
        for (const point of manifold.points) { triple(point.point); put(point.distance); }
      }
    }
  };
  const writeSenses = (senses: Senses) => {
    if (senses.side !== side || senses.ends !== ends || senses.solids !== solids) {
      side = senses.side; ends = senses.ends; solids = senses.solids;
      channel.told.push({ kind: "senses", side, ends, solids });
    }
    room(1); put(senses.others.length);
    for (const other of senses.others) {
      let key = others.get(other.id);
      if (key === undefined) {
        others.set(other.id, key = others.size);
        channel.told.push({ kind: "other", key, id: other.id, side: other.side, spec: other.spec, segments: [...other.segments.keys()] });
      }
      room(1 + SENSED_SEGMENT * other.segments.size + SENSED_BODY);
      put(key);
      for (const s of other.segments.values()) { put(poseCode(s.handPose)); vec(s.position); quat(s.rotation); vec(s.centre); vec(s.velocity); vec(s.spin); }
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
      k = 0;
      put(clock.steps); put(clock.time); put(LEVELS.indexOf(driver.level));
      for (const segment of segments) {
        const node = segment.node, mass: MassProperties = segment.body.massProperties;
        vec(node.position); quat(node.rotationQuaternion!);
        vec(segment.body.linearVelocityToRef(v)); vec(segment.body.angularVelocityToRef(v));
        put(poseCode(segment.handPose?.applied)); put(poseCode(segment.handPose?.requested)); put(segment.toes?.bend ?? 0);
        put(mass.mass); triple(mass.centre); triple(mass.moments); quat(mass.orientation);
      }
      let c = 0;
      for (const joint of layout.joints) {
        for (let i = 0; i < joint.dofs; i++) put(driver.angle(c + i));
        for (let i = 0; i < joint.dofs; i++) put(driver.speed(c + i));
        for (let i = 0; i < joint.dofs; i++) put(driver.rate(c + i));
        for (let i = 0; i < joint.dofs; i++) for (let j = 0; j < joint.dofs; j++) put(driver.turning(c + i, j));
        c += joint.dofs;
      }
      const n = layout.channels;
      channel.inbound.set(driver.activation, k); k += n;
      channel.inbound.set(driver.velocity, k); k += n;
      channel.inbound.set(driver.ceiling, k); k += n;
      channel.inbound.set(driver.pulled, k); k += n;
      channel.inbound.set(driver.bounds.negative, k); k += n;
      channel.inbound.set(driver.bounds.positive, k); k += n;
      const help = assist.assist;
      put(help.most.force); put(help.most.moment); vec(assist.asked.force); vec(assist.asked.moment); vec(help.given.force); vec(help.given.moment);
      put(help.meter.steps); put(help.meter.force); put(help.meter.moment); put(help.withdrawn ? 1 : 0);
      put(senses.out ? 1 : 0); put(senses.life);
      writeContacts();
      writeSenses(senses);
    },
    carry(asked) {
      const out = channel.outbound, n = layout.channels;
      driver.activation.set(out.subarray(0, n));
      driver.velocity.set(out.subarray(n, 2 * n));
      assist.asked.force.set(out[2 * n]!, out[2 * n + 1]!, out[2 * n + 2]!);
      assist.asked.moment.set(out[2 * n + 3]!, out[2 * n + 4]!, out[2 * n + 5]!);
      let at = layout.command;
      const calls = out[at++]!;
      for (let call = 0; call < calls; call++) {
        const count = out[at++]!, requests: HandPoseRequest[] = [];
        for (let r = 0; r < count; r++, at += 2) requests.push({ hand: out[at] === 0 ? "left" : "right", pose: POSES[out[at + 1]!]! });
        asked(requests);
      }
    },
  };
}

/** A sensed body as the mirror shows it, its fields set from the numbers. */
type Shown = { -readonly [K in keyof BodySense]: BodySense[K] };

/** **The mind's side of a body's mirror**: the body it reads, and what refreshes it and sends its command back. */
export interface Mirror {
  readonly read: ReadBody;
  readonly muscles: MuscleDriver;
  readonly assist: Assist;
  readonly senses: Senses;
  /** The steps and time of the numbers last read. */
  readonly steps: number;
  readonly time: number;
  requestHandPoses(requests: readonly HandPoseRequest[]): void;
  /** Read the channel's inbound numbers; with `dynamics`, read the body's dynamics from them as its muscles do before their mind steps. */
  refresh(options: { readonly dynamics: boolean }): void;
  /** Write what its mind asked into the channel's outbound numbers, and forget the hands' requests sent. */
  answer(): void;
  /**
   * **Carry the body forward a step of `dt`** under `motion`, a command's efference copy
   * (`MuscleDriver.planned`): each segment's spin and its centre's velocity change by what the
   * motion accelerates it at (`BodyDynamics.accelerationToRef`), its pose moves by them as the
   * solver moves a body, its joints are read again from the poses and spins, and its dynamics
   * read there. Its contacts, hands and senses stay as last read. Read after `refresh` with dynamics.
   */
  forecast(motion: ArrayLike<number>, dt: number): void;
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
  const records = statics.segments.map(({ name, id, node: nodeName }) => {
    const segmentSpec = specs.get(name)!;
    const { frame, initial, poses, bent, rigidAt } = segmentShapes(spec, segmentSpec);
    const node = Object.freeze({ name: nodeName, position: new Vector3(), rotationQuaternion: new Quaternion() as Quaternion | null });
    const linear = new Vector3(), angular = new Vector3();
    const motion = { mass: { mass: 0, centre: [0, 0, 0], moments: [0, 0, 0], orientation: new Quaternion() } as MassProperties };
    const body: ReadSegmentBody = Object.freeze({
      id, node,
      linearVelocityToRef: (out: Vector3) => out.copyFrom(linear),
      angularVelocityToRef: (out: Vector3) => out.copyFrom(angular),
      get massProperties() { return motion.mass; },
    });
    const handPose: { applied: HandPose; requested: HandPose } | undefined = poses ? { applied: initial, requested: initial } : undefined;
    const toes = bent ? { bend: 0 } : undefined;
    const rest = Quaternion.RotationQuaternionFromAxis(new Vector3(frame.x[0], frame.x[1], frame.x[2]), new Vector3(frame.y[0], frame.y[1], frame.y[2]), new Vector3(frame.z[0], frame.z[1], frame.z[2]));
    const segment: ReadSegment = Object.freeze({ spec: segmentSpec, frame, node, body, rest, get rigid() { return rigidAt(handPose?.applied, toes); },
      ...(handPose ? { handPose } : {}), ...(poses ? { poses } : {}), ...(toes ? { toes } : {}) });
    byId.set(id, body);
    spins.set(segment, angular);
    return { segment, node, linear, angular, motion, handPose, toes };
  });
  const segments = new Map(records.map((record, i) => [statics.segments[i]!.name, record.segment]));
  const jointSpecs = new Map(spec.joints.map((joint) => [joint.name, joint]));
  const joints = new Map<string, ReadJoint>(statics.joints.map((name) => {
    const jointSpec = jointSpecs.get(name)!, { dofs, axes } = jointKinematics(jointSpec);
    return [name, Object.freeze({ spec: jointSpec, dofs, axes, parent: segments.get(jointSpec.parent)!, child: segments.get(jointSpec.child)! })];
  }));
  const index = new Map<ReadSegmentBody, number>(records.map((record, i) => [record.segment.body, i]));
  // Its joints as its muscles read them, for a forecast: each from the poses and spins its segments are given.
  const trackers = statics.joints.map((name) => jointTracker(joints.get(name)!));
  const ahead = { linear: new Vector3(), angular: new Vector3(), turn: new Quaternion(), offset: new Vector3(), spin: (segment: ReadSegment) => spins.get(segment)! };
  /** Where each segment's contacts and manifolds start in the inbound numbers, as last read. */
  const contactsAt = new Int32Array(records.length), manifoldsAt = new Int32Array(records.length);
  const names = new Map<number, string>();
  const refOf = (code: number): BodyRef | null => {
    if (Number.isNaN(code)) return null;
    let ref = byId.get(code);
    if (!ref) { ref = Object.freeze({ id: code, node: Object.freeze({ name: names.get(code)! }) }); byId.set(code, ref); }
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
      const a = channel.inbound;
      let at = contactsAt[segmentOf(body)]!, out: ReadContact[] | null = null;
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
      return out ?? EMPTY;
    },
    contactManifoldsOf(body: ReadSegmentBody, wanted?: (other: BodyRef | null) => boolean) {
      const a = channel.inbound;
      let at = manifoldsAt[segmentOf(body)]!;
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
      return out.length === 0 ? EMPTY : out;
    },
  });
  const model = handPoseModel(spec.segments);
  const handState = Object.fromEntries(model.map(({ hand, segment }) => [hand, records[statics.segments.findIndex((s) => s.name === segment)]!.handPose!]));
  const read: ReadBody = Object.freeze({ spec, physics, segments, joints,
    handPoses: Object.freeze({ model, state: Object.freeze(handState), check: (requests: readonly HandPoseRequest[]) => checkHandPoses(model, requests) }) });

  const n = layout.channels, channels = muscleChannels(read);
  const angles = new Float64Array(n), speeds = new Float64Array(n), rates = new Float64Array(n), turning = new Float64Array(3 * n);
  const jointAngles = layout.joints.map((joint) => new Array<number>(joint.dofs).fill(0));
  const state = { level: "full" as BodyLevel, activation: new Float64Array(n), velocity: new Float64Array(n), ceiling: new Float64Array(n), pulled: new Float64Array(n),
    planned: new Float64Array(6 + n).fill(NaN), bounds: { negative: new Float64Array(n), positive: new Float64Array(n) } };
  const motion_ = { spin: (segment: ReadSegment) => spins.get(segment)! };
  let dynamics: ReturnType<typeof bodyDynamics> | null = null;
  const byName = new Map(channels.map((c, i) => [c.name, i]));
  const muscles: MuscleDriver = {
    channels, state, activation: state.activation, velocity: state.velocity, ceiling: state.ceiling, pulled: state.pulled, planned: state.planned, expect: new Float64Array(n).fill(NaN), bounds: state.bounds,
    get dynamics() { return dynamics!; },
    get level() { return state.level; },
    angle: (i) => angles[i]!, rate: (i) => rates[i]!, speed: (i) => speeds[i]!, turning: (i, k) => turning[3 * i + k]!,
    strength: (i, sense) => strengthAt(channels[i]!, sense, speeds[i]!),
    channel(name) {
      const i = byName.get(name);
      if (i === undefined) throw new Error(`${spec.model} has no muscle channel "${name}"`);
      return i;
    },
    setLevel() { throw new Error("a mirror's level is its body's"); },
    dispose() { throw new Error("a mirror is its body's to dispose"); },
  };

  const asked = { force: new Vector3(), moment: new Vector3() };
  const help = { most: { force: 0, moment: 0 }, given: { force: new Vector3(), moment: new Vector3() }, meter: { steps: 0, force: 0, moment: 0 }, withdrawn: false };
  const assist: Assist = {
    get on() { return !help.withdrawn && (help.most.force > 0 || help.most.moment > 0); },
    get withdrawn() { return help.withdrawn; },
    most: help.most, given: help.given, meter: help.meter,
    clipToRef(force, moment, givenForce, givenMoment) {
      clipToRef(force, help.withdrawn ? 0 : help.most.force, givenForce);
      clipToRef(moment, help.withdrawn ? 0 : help.most.moment, givenMoment);
    },
    ask(force, moment) { asked.force.copyFrom(force); asked.moment.copyFrom(moment); },
    withdraw() { throw new Error("a mirror's assist is withdrawn by its fight"); },
  };

  const clock = { steps: 0, time: 0, out: false, life: 1, solids: undefined as readonly SolidSense[] | undefined };
  const others: Shown[] = [], shown = new Map<number, Shown>(), statics_ = new Map<number, ObjectStatics>();
  let objects: readonly ObjectSense[] | undefined;
  const senses: { -readonly [K in keyof Senses]: Senses[K] } = {
    get time() { return clock.time; },
    side: "",
    get out() { return clock.out; },
    get life() { return clock.life; },
    others,
  };
  Object.defineProperty(senses, "objects", { enumerable: true, get: () => objects });

  /** Each call's hand requests since the last answer, in order. */
  const hands: (readonly HandPoseRequest[])[] = [];
  const hear = () => {
    for (; channel.heard < channel.told.length; channel.heard++) {
      const told = channel.told[channel.heard]!;
      switch (told.kind) {
        case "senses":
          senses.side = told.side;
          if (told.ends === undefined) delete senses.ends; else senses.ends = told.ends;
          if (told.solids !== undefined && clock.solids === undefined) Object.defineProperty(senses, "solids", { enumerable: true, get: () => clock.solids });
          clock.solids = told.solids;
          break;
        case "body": names.set(told.id, told.name); break;
        case "other": shown.set(told.key, { id: told.id, side: told.side, spec: told.spec, out: false, down: false, life: 1, time: 0,
          centre: new Vector3(), velocity: new Vector3(),
          segments: new Map(told.segments.map((name) => [name, { position: new Vector3(), rotation: new Quaternion(), centre: new Vector3(), velocity: new Vector3(), spin: new Vector3() }])) }); break;
        case "object": statics_.set(told.key, { id: told.id, owner: told.owner, points: told.points }); break;
        default: { const never: never = told; throw new Error(`nothing told as ${JSON.stringify(never)}`); }
      }
    }
  };
  const mirror: Mirror = {
    read, muscles, assist, senses,
    get steps() { return clock.steps; }, get time() { return clock.time; },
    requestHandPoses(requests) {
      const checked = checkHandPoses(model, requests);
      for (const request of checked) handState[request.hand]!.requested = request.pose;
      hands.push(checked);
    },
    refresh({ dynamics: reading }) {
      hear();
      const a = channel.inbound;
      let k = 0;
      clock.steps = a[k++]!; clock.time = a[k++]!; state.level = LEVELS[a[k++]!]!;
      for (const record of records) {
        record.node.position.set(a[k]!, a[k + 1]!, a[k + 2]!);
        record.node.rotationQuaternion!.set(a[k + 3]!, a[k + 4]!, a[k + 5]!, a[k + 6]!);
        record.linear.set(a[k + 7]!, a[k + 8]!, a[k + 9]!);
        record.angular.set(a[k + 10]!, a[k + 11]!, a[k + 12]!);
        if (record.handPose) { record.handPose.applied = POSES[a[k + 13]!]!; record.handPose.requested = POSES[a[k + 14]!]!; }
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
        k += 3 * d + d * d; c += d;
      });
      state.activation.set(a.subarray(k, k + n)); k += n;
      state.velocity.set(a.subarray(k, k + n)); k += n;
      state.ceiling.set(a.subarray(k, k + n)); k += n;
      state.pulled.set(a.subarray(k, k + n)); k += n;
      state.bounds.negative.set(a.subarray(k, k + n)); k += n;
      state.bounds.positive.set(a.subarray(k, k + n)); k += n;
      help.most.force = a[k++]!; help.most.moment = a[k++]!;
      asked.force.set(a[k]!, a[k + 1]!, a[k + 2]!); asked.moment.set(a[k + 3]!, a[k + 4]!, a[k + 5]!); k += 6;
      help.given.force.set(a[k]!, a[k + 1]!, a[k + 2]!); help.given.moment.set(a[k + 3]!, a[k + 4]!, a[k + 5]!); k += 6;
      help.meter.steps = a[k++]!; help.meter.force = a[k++]!; help.meter.moment = a[k++]!; help.withdrawn = a[k++] === 1;
      clock.out = a[k++] === 1; clock.life = a[k++]!;
      for (let s = 0; s < records.length; s++) {
        contactsAt[s] = k;
        const contacts = a[k++]!;
        for (let i = 0; i < contacts; i++) k += CONTACT + PAIR * a[k + 9]!;
        manifoldsAt[s] = k;
        const manifolds = a[k++]!;
        for (let i = 0; i < manifolds; i++) k += MANIFOLD + 4 * a[k + 8]!;
      }
      const count = a[k++]!;
      others.length = count;
      for (let i = 0; i < count; i++) {
        const other = shown.get(a[k++]!)!;
        for (const s of other.segments.values()) {
          const pose = a[k]!;
          if (pose >= 0) (s as { handPose?: HandPose }).handPose = POSES[pose]!;
          s.position.set(a[k + 1]!, a[k + 2]!, a[k + 3]!);
          s.rotation.set(a[k + 4]!, a[k + 5]!, a[k + 6]!, a[k + 7]!);
          s.centre.set(a[k + 8]!, a[k + 9]!, a[k + 10]!);
          s.velocity.set(a[k + 11]!, a[k + 12]!, a[k + 13]!);
          s.spin.set(a[k + 14]!, a[k + 15]!, a[k + 16]!);
          k += SENSED_SEGMENT;
        }
        other.centre.set(a[k]!, a[k + 1]!, a[k + 2]!);
        other.velocity.set(a[k + 3]!, a[k + 4]!, a[k + 5]!);
        other.out = a[k + 6] === 1; other.down = a[k + 7] === 1; other.life = a[k + 8]!;
        if (Number.isNaN(a[k + 9])) delete other.time; else other.time = a[k + 9]!;
        k += SENSED_BODY;
        others[i] = other;
      }
      const sensed = a[k++]!;
      if (sensed < 0) objects = undefined;
      else {
        const made: ObjectSense[] = [];
        for (let i = 0; i < sensed; i++, k += SENSED_OBJECT) {
          const fixed = statics_.get(a[k]!)!;
          made.push({ id: fixed.id, owner: fixed.owner, points: fixed.points, time: a[k + 1]!, mass: a[k + 2]!, position: at3(a, k + 3),
            rotation: [a[k + 6]!, a[k + 7]!, a[k + 8]!, a[k + 9]!], centre: at3(a, k + 10), velocity: at3(a, k + 13), spin: at3(a, k + 16) });
        }
        objects = deepFreeze(made);
      }
      if (reading) dynamics!.update(jointAngles, motion_);
    },
    forecast(motion, dt) {
      const d = dynamics!, { linear, angular, turn, offset } = ahead;
      for (const record of records) {
        const segment = record.segment, c = d.centre(segment), node = record.node, q = node.rotationQuaternion!;
        d.accelerationToRef(segment, motion, linear, angular);
        record.angular.addInPlaceFromFloats(dt * angular.x, dt * angular.y, dt * angular.z);
        record.linear.addInPlaceFromFloats(dt * linear.x, dt * linear.y, dt * linear.z);
        // Its turn over the step, about its new spin (`rotationStep`), carries the node about the centre.
        rotationStep(record.angular, dt, turn);
        offset.set(node.position.x - c[0], node.position.y - c[1], node.position.z - c[2]).applyRotationQuaternionToRef(turn, offset);
        node.position.set(c[0] + dt * record.linear.x + offset.x, c[1] + dt * record.linear.y + offset.y, c[2] + dt * record.linear.z + offset.z);
        turn.multiplyToRef(q, q);
        q.normalize();
      }
      let c = 0;
      trackers.forEach((tracker, j) => {
        tracker.update(ahead.spin);
        const dofs = tracker.angles.length, mine = jointAngles[j]!;
        for (let i = 0; i < dofs; i++) {
          angles[c + i] = tracker.angles[i]!; mine[i] = tracker.angles[i]!; speeds[c + i] = tracker.speeds[i]!; rates[c + i] = tracker.rates[i]!;
          for (let m = 0; m < dofs; m++) turning[3 * (c + i) + m] = tracker.turning[i]![m]!;
        }
        c += dofs;
      });
      d.update(jointAngles, motion_);
    },
    answer() {
      let calls = 0, size = 0;
      for (const call of hands) { calls += 1; size += 1 + 2 * call.length; }
      channel.outbound = grown(channel.outbound, layout.command + 1 + size);
      const out = channel.outbound;
      out.set(state.activation, 0); out.set(state.velocity, n);
      out[2 * n] = asked.force.x; out[2 * n + 1] = asked.force.y; out[2 * n + 2] = asked.force.z;
      out[2 * n + 3] = asked.moment.x; out[2 * n + 4] = asked.moment.y; out[2 * n + 5] = asked.moment.z;
      let at = layout.command;
      out[at++] = calls;
      for (const call of hands) {
        out[at++] = call.length;
        for (const request of call) { out[at++] = request.hand === "left" ? 0 : 1; out[at++] = POSES.indexOf(request.pose); }
      }
      hands.length = 0;
    },
  };
  // Its dynamics are made as its muscles make theirs, from the body as it first stands.
  mirror.refresh({ dynamics: false });
  dynamics = bodyDynamics(read, statics.gravity);
  return mirror;
}

/** What an object the senses show keeps from its first showing. */
interface ObjectStatics { readonly id: string; readonly owner: string | null; readonly points: Readonly<Record<string, Vec3>> }

/**
 * The turn a body spinning at `spin` (rad/s, world) makes over `dt`, into `out`: about the spin's
 * axis by its speed times the step, as the solver turns a body.
 */
function rotationStep(spin: Vector3, dt: number, out: Quaternion): Quaternion {
  const speed = Math.sqrt(spin.x * spin.x + spin.y * spin.y + spin.z * spin.z), half = speed * dt / 2;
  if (speed === 0) return out.set(0, 0, 0, 1);
  const k = sin(half) / speed;
  return out.set(spin.x * k, spin.y * k, spin.z * k, cos(half));
}
