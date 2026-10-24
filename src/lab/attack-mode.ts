import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { createSenses } from "../core/mind/senses.ts";
import { landed, blocked, cleanMiss } from "../core/skills/action-instances.ts";
import { randomStream } from "../core/math/random.ts";
import { rulebook } from "../core/rules/rulebook.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { isBody } from "../core/read-body.ts";
import type { Actor } from "./actor.ts";
import { dummySpec, hangDummy, type Dummy } from "./targets.ts";
import { startWind, type WindSettings } from "./wind.ts";
import { dummyPart } from "./dummy-spec.ts";
import { cos, sin, square } from "../core/math/real.ts";

/** Seconds an impacted target stays physical and visible before replacement. */
const FADE_SECONDS = 0.6;
/** Half-width of the target field, m; targets bounce at its edges. */
const FIELD = 4;
/** Clearance at spawn from the actor and other targets, m. */
const CLEARANCE = 0.5;

interface TargetState {
  readonly id: string;
  direction: [number, number];
  hit: number | null;
}

interface AttackOptions {
  readonly seed: number;
  readonly count: number;
  readonly targetPart?: string;
  readonly speed?: number;
  readonly wind?: WindSettings;
  readonly hears?: (built: BuiltBody) => { dispose(): void };
}

/**
 * Physical targets driven by ordinary fighter orders. The scenario chooses only a foe's identity;
 * the mind senses its live body and owns the approach and attack. Targets float against gravity,
 * move by impulses until contact, then give way freely and disappear after a short delay.
 */
export function startAttack(actor: Actor, options: AttackOptions) {
  const { world, body } = actor, { built } = body;
  const random = randomStream(options.seed), spec = dummySpec(built.spec, dummyPart(built.spec, options.targetPart)), rules = rulebook("arena");
  const state = { random: random.state, targets: [] as TargetState[], selected: null as string | null, next: 0, hits: 0,
    speed: options.speed ?? 0, sequence: 0, totals: { committed: 0, landed: 0, blocked: 0, missed: 0, refused: 0, stalled: 0, interrupted: 0 } };
  const targets = new Map<string, { dummy: Dummy; sound?: { dispose(): void } }>();
  const hub = createSenses(world);
  const senses = hub.add({ id: "attacker", side: "attacker", built, out: () => false, down: () => body.view.down });
  const wind = startWind(built, world, options.wind ?? { rate: 0, strength: 0 }, options.seed);
  const actorBodies = new Set([...built.segments.values()].map((segment) => segment.body));
  const velocity = new Vector3(), impulse = new Vector3();

  const spawn = (): boolean => {
    const radius = spec.segments[0]!.shape.kind === "sphere" ? spec.segments[0]!.shape.radius.value : 0;
    // A crowded field waits for another step instead of creating intersecting bodies.
    for (let attempt = 0; attempt < 40; attempt++) {
      const at: Vec3 = [(random.next() * 2 - 1) * FIELD,
        built.spec.stature.value * (0.5 + 0.4 * random.next()), (random.next() * 2 - 1) * FIELD];
      if ([...actorBodies].some((segment) => segment.gapTo(at) < radius + CLEARANCE)) continue;
      if ([...targets.values()].some(({ dummy }) => Vector3.DistanceSquared(dummy.centre, Vector3.FromArray(at)) < square(2 * radius + CLEARANCE))) continue;
      const id = `target-${state.next++}`, dummy = hangDummy(world, spec, at, rules);
      const angle = random.next() * Math.PI * 2;
      const target: TargetState = { id, direction: [sin(angle), cos(angle)], hit: null };
      state.targets.push(target);
      targets.set(id, { dummy, sound: options.hears?.(dummy.fighter.built) });
      hub.add({ id, side: "targets", built: dummy.fighter.built, out: () => target.hit !== null });
      return true;
    }
    return false;
  };
  const remove = (id: string): void => {
    const target = targets.get(id)!;
    hub.remove(id);
    target.sound?.dispose();
    target.dummy.dispose();
    targets.delete(id);
    if (state.selected === id) state.selected = null;
    state.targets.splice(state.targets.findIndex((target) => target.id === id), 1);
  };
  const select = (id: string): void => {
    if (state.targets.some((target) => target.id === id && target.hit === null)) state.selected = id;
  };
  for (let i = 0; i < options.count; i++) if (!spawn()) break;
  const skills = actor.drive(undefined, {
    senses,
    orders: () => state.selected === null ? null : { face: null, foe: state.selected },
    contactIdentity: (other) => {
      if (!other) return { kind: "world" };
      for (const [id, { dummy }] of targets) for (const segment of dummy.fighter.built.segments.values())
        if (isBody(other, segment.body)) return { kind: "body", body: id, segment: segment.spec.name, guard: false };
      return null;
    },
  });
  const moving = world.beforeStep(() => {
    for (const target of [...state.targets]) if (target.hit !== null && world.time - target.hit >= FADE_SECONDS) remove(target.id);
    while (state.targets.length < options.count) if (!spawn()) break;
      for (const target of state.targets) {
      if (target.hit !== null) continue;
      const dummy = targets.get(target.id)!.dummy, at = dummy.centre;
      const segment = dummy.fighter.built.segments.values().next().value!;
      if (at.x > FIELD && target.direction[0] > 0 || at.x < -FIELD && target.direction[0] < 0) target.direction[0] *= -1;
      if (at.z > FIELD && target.direction[1] > 0 || at.z < -FIELD && target.direction[1] < 0) target.direction[1] *= -1;
      segment.body.linearVelocityToRef(velocity);
      impulse.set(state.speed * target.direction[0] - velocity.x, 0, state.speed * target.direction[1] - velocity.z).scaleInPlace(segment.rigid.mass);
      segment.body.applyImpulse(impulse, at);
    }
  });
  const contacts = world.afterStep(() => {
    for (const record of skills.report.ledger) if (record.sequence > state.sequence) {
      state.totals.committed += Number(record.committed);
      state.totals.landed += Number(landed(record)); state.totals.blocked += Number(blocked(record)); state.totals.missed += Number(cleanMiss(record));
      if (record.ending.kind === "refused" || record.ending.kind === "stalled" || record.ending.kind === "interrupted") state.totals[record.ending.kind]++;
      state.sequence = record.sequence;
    }
    for (const target of state.targets) {
      if (target.hit !== null) continue;
      const segment = targets.get(target.id)!.dummy.fighter.built.segments.values().next().value!;
      if (world.physics.contactsOf(segment.body, (other) => other !== null && actorBodies.has(other)).some((contact) => contact.impulse > 0)) {
        target.hit = world.time;
        state.hits++;
      }
    }
    });
  return {
    state, skills, wind, select,
    frame: () => ({ time: body.view.time, hits: state.hits, totals: { ...state.totals }, selected: skills.report.engagement?.focus ?? null,
      actions: structuredClone(skills.report.actions), ledger: structuredClone(skills.report.ledger), engagement: structuredClone(skills.report.engagement),
      phase: skills.report.actions[0]?.stage ?? null, down: body.view.down, wind: [...wind.state.force],
      targets: state.targets.map((target) => {
        const dummy = targets.get(target.id)!.dummy;
        return { id: target.id, centre: [dummy.centre.x, dummy.centre.y, dummy.centre.z] as Vec3,
          radius: dummy.radius, hit: target.hit !== null, fade: target.hit === null ? 1 : Math.max(0, 1 - (world.time - target.hit) / FADE_SECONDS) };
      }) }),
    dispose() {
      moving.dispose(); contacts.dispose(); wind.dispose(); hub.dispose();
      for (const id of [...targets.keys()]) remove(id);
      actor.dispose();
    },
  };
}
