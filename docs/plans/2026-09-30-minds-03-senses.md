# Minds 03: senses

## Goal

A mind learns of every other body through its senses, and through nothing else. Today the arena
hands each side's tactics a live `Body` (`Duel.plan`), read out of the other side's view; after
this the bout owns one sensing layer (`createSenses`), each body's `Senses` lists the others as
that layer passes them, and the arena's tactics pick their own foe from what they see (`seekFoe`).

Two things change in play, both small, and the trace digest (`research/bout-trace.mjs`) changes
with them:

- **Both sides see the same step.** Today the left side's mind runs before the right side's body
  has read itself, so the left aims at where the right was a step earlier, and the right at where
  the left is now. The sensing layer reads every body before any mind steps, in a phase of the
  step of its own (`World.sense`), so no order of construction can put a mind ahead of it.
- **A delay is a dial.** `DuelRecipe.senseDelay`, in steps, zero unless given: what a body sees of
  the others is that many steps old.

## Files

| File | Change |
|---|---|
| `src/core/world.ts` | `World.sense`: hooks that run first in a step. |
| `src/core/mind/senses.ts` | `Senses` gains `side`, `out`, `others`; `BodySense`, `SegmentSense`, `Sensed`, `SensesHub`, `createSenses`. |
| `src/core/body.ts` | `BodyOptions.senses`; `BodyView.senses`. |
| `src/core/mind/tactics.ts` | `Sight`'s comment: what it is aimed at, it sees. |
| `src/core/mind/fighter.ts` | `FighterPlan.attack` is a point; `fighterTactics`' plan is given the sight; `seekFoe`. |
| `src/arena/duel.ts` | The bout's senses; `seekFoe` in place of `Duel.plan`; `DuelRecipe.senseDelay`. |
| `src/dungeon/run.ts` | Passes its target's head as a point. |
| `tests/core-senses.test.mjs` | New: five tests. |
| `tests/core-world.test.mjs` | One test: sensing runs first. |
| `tests/arena-core.test.mjs` | Two tests. |
| `docs/reference/bouts.md` | A section: the standing table read again, and the new digests. |
| `AGENTS.md`, `docs/architecture.md` | The rule's sentence on senses; the Minds section. |

## `src/core/world.ts`

A step gains a first phase. Whatever reads the world for every mind runs there, before any step
hook, whenever it was added:

```ts
  /**
   * Run `hook` first in every step, before every `beforeStep` hook, after the sensing hooks added
   * before it: what reads the world for the minds, so that every mind in a step decides on the
   * same moment.
   */
  sense(hook: StepHook): Hook;
```

`createWorld` keeps a third list, `sensing`, run by `runAll(sensing)` before `runAll(before)`
and emptied in `dispose`. The interface's comment reads: "A step is: the sensing hooks; the step
hooks, in the order they were added (minds, motor control, the muscle driver); then one solver
step of `dt` ...".

## `src/core/mind/senses.ts`

`Senses` and `clockSenses` stay; the rest is new.

```ts
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import { centreOfToRef } from "../control/support.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";

/**
 * **What a mind is told of the world**, each control step, as the last solver step left it. A
 * mind's own body is not here: it has that whole (`OwnBody`, `mind.ts`). Everything it knows of
 * another body is in `others`, and nothing of another mind is: not its memory, its command or
 * its orders.
 */
export interface Senses {
  /** Seconds of the world's clock. */
  readonly time: number;
  /** The side this body fights on; empty in no fight. */
  readonly side: string;
  /** Whether this body is out of the fight. Its own, so it knows at once, whatever the delay. */
  readonly out: boolean;
  /** Every other body the senses carry, as they pass it (`createSenses`): in the order added. */
  readonly others: readonly BodySense[];
}

/**
 * **Another body, as sensed**: everything physical of it, and whether it is still in the fight.
 * Not its hit points. `seekFoe` (`fighter.ts`) reads `side`, `out`, `centre` and the head's
 * centre; the segments' poses, velocities and spins, and the spec with what the body holds, are
 * what a mind that attacks a moving body, blocks or parries reads (`docs/roadmap.md`, The AI).
 */
export interface BodySense {
  readonly id: string;
  readonly side: string;
  /** What it is built from, with what it holds. */
  readonly spec: BodySpec;
  readonly out: boolean;
  /** Its centre of mass and that centre's velocity, world. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  /** Each segment, by name, in the order built. */
  readonly segments: ReadonlyMap<string, SegmentSense>;
}

export interface SegmentSense {
  /** The segment frame's origin and turn, world: its node's. */
  readonly position: Vector3;
  readonly rotation: Quaternion;
  /** Its rigid body's centre of mass, with what it holds, world; that centre's velocity; its spin. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  readonly spin: Vector3;
}

/** A body the senses carry: who it is, and whether it is out of the fight, asked once a step. */
export interface Sensed {
  readonly id: string;
  readonly side: string;
  readonly built: BuiltBody;
  out(): boolean;
}

export interface SensesHub {
  /**
   * Carry `sensed`. Returns what it senses: every body carried but itself, whether added before
   * it or after. Until the next step the others see it as it stands now, in the fight.
   */
  add(sensed: Sensed): () => Senses;
  dispose(): void;
}

/** The numbers of a segment in a frame: position 3, rotation 4, centre 3, velocity 3, spin 3. */
const ROW = 16;
/** After the segments: the body's centre 3, its velocity 3, and whether it is out. */
const TAIL = 7;

/**
 * **The one layer between the world and every mind's `Senses`.** In the step's sensing phase
 * (`World.sense`) it reads every body it carries as the last solver step left it, and shows each
 * to the others `delay` steps late. Every mind in a step therefore sees the same moment, and none
 * sees another through its view.
 *
 * `delay` is whole steps, 0 unless given. The frames a body's delay holds are its memory
 * (`Carried.at`, `.frames`), plain numbers.
 */
export function createSenses(world: World, delay = 0): SensesHub {
  if (!Number.isInteger(delay) || delay < 0) throw new Error(`a delay is whole steps, not ${delay}`);
  const carried: Carried[] = [];
  const p = new Vector3(), v = new Vector3(), w = new Vector3();

  /** `entry`'s body as it stands, into `frame`. */
  const read = (entry: Carried, frame: Float64Array, out: boolean): void => {
    let k = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
    for (const segment of entry.segments) {
      const at = segment.node.position, q = segment.node.rotationQuaternion!, m = segment.rigid.mass;
      centreOfToRef(segment, p);
      segment.body.linearVelocityToRef(v);
      segment.body.angularVelocityToRef(w);
      frame[k] = at.x; frame[k + 1] = at.y; frame[k + 2] = at.z;
      frame[k + 3] = q.x; frame[k + 4] = q.y; frame[k + 5] = q.z; frame[k + 6] = q.w;
      frame[k + 7] = p.x; frame[k + 8] = p.y; frame[k + 9] = p.z;
      frame[k + 10] = v.x; frame[k + 11] = v.y; frame[k + 12] = v.z;
      frame[k + 13] = w.x; frame[k + 14] = w.y; frame[k + 15] = w.z;
      cx += m * p.x; cy += m * p.y; cz += m * p.z; vx += m * v.x; vy += m * v.y; vz += m * v.z;
      k += ROW;
    }
    const mass = entry.mass;
    frame[k] = cx / mass; frame[k + 1] = cy / mass; frame[k + 2] = cz / mass;
    frame[k + 3] = vx / mass; frame[k + 4] = vy / mass; frame[k + 5] = vz / mass;
    frame[k + 6] = out ? 1 : 0;
  };
  /** `frame` into what the others are shown of `entry`. */
  const show = (entry: Carried, frame: Float64Array): void => {
    let k = 0;
    for (const s of entry.shown.segments.values()) {
      s.position.set(frame[k]!, frame[k + 1]!, frame[k + 2]!);
      s.rotation.set(frame[k + 3]!, frame[k + 4]!, frame[k + 5]!, frame[k + 6]!);
      s.centre.set(frame[k + 7]!, frame[k + 8]!, frame[k + 9]!);
      s.velocity.set(frame[k + 10]!, frame[k + 11]!, frame[k + 12]!);
      s.spin.set(frame[k + 13]!, frame[k + 14]!, frame[k + 15]!);
      k += ROW;
    }
    entry.shown.centre.set(frame[k]!, frame[k + 1]!, frame[k + 2]!);
    entry.shown.velocity.set(frame[k + 3]!, frame[k + 4]!, frame[k + 5]!);
    entry.shown.out = frame[k + 6] === 1;
  };

  const hook = world.sense(() => {
    for (const entry of carried) {
      // The newest frame goes where the oldest was; the one after it is now `delay` steps old.
      read(entry, entry.frames[entry.at]!, entry.sensed.out());
      entry.at = (entry.at + 1) % entry.frames.length;
      show(entry, entry.frames[entry.at]!);
    }
  });

  return {
    add(sensed) {
      const segments = [...sensed.built.segments.values()];
      const shown = {
        id: sensed.id, side: sensed.side, spec: sensed.built.spec, out: false,
        centre: new Vector3(), velocity: new Vector3(),
        segments: new Map([...sensed.built.segments.keys()].map((name) => [name,
          { position: new Vector3(), rotation: new Quaternion(), centre: new Vector3(), velocity: new Vector3(), spin: new Vector3() }])),
      };
      const entry: Carried = {
        sensed, segments, shown, others: [], at: 0,
        mass: segments.reduce((sum, s) => sum + s.rigid.mass, 0),
        frames: Array.from({ length: delay + 1 }, () => new Float64Array(segments.length * ROW + TAIL)),
      };
      // Every frame starts as the body stands, in the fight: `out` is first asked at the next step.
      for (const frame of entry.frames) read(entry, frame, false);
      show(entry, entry.frames[0]!);
      for (const other of carried) { other.others.push(shown); entry.others.push(other.shown); }
      carried.push(entry);
      const senses: Senses = {
        get time() { return world.time; },
        side: sensed.side,
        get out() { return sensed.out(); },
        others: entry.others,
      };
      return () => senses;
    },
    dispose() { hook.dispose(); carried.length = 0; },
  };
}

interface Carried {
  readonly sensed: Sensed;
  readonly segments: readonly BuiltSegment[];
  readonly mass: number;
  /** What the others are shown of it. */
  readonly shown: { -readonly [K in keyof BodySense]: BodySense[K] };
  /** What it is shown: the others' `shown`. */
  readonly others: BodySense[];
  /** `delay + 1` frames, and the one shown. */
  readonly frames: Float64Array[];
  at: number;
}
```

`clockSenses` returns the three new fields too: `{ time: 0, side: "", out: false, others: [] }`,
with `time` set at each call as it is.

`senses.ts` now imports the build and `support.ts`, and `mind.ts` imports it: the core's boundary
test passes, since all three are core. `support.ts` imports nothing of the mind.

## `src/core/body.ts`

```ts
export interface BodyOptions {
  // ... as it is, and:
  /** What this body senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
}

export interface BodyView {
  // ... as it is, and:
  /** What the body senses of the world this step (`Senses`): the clock, its side, and every other body. */
  readonly senses: Senses;
}
```

`commandMind`'s `look(senses)` sets `view.senses = senses` beside `view.time = senses.time`, and
`createBody` reads its senses from the options:

```ts
  const sense = options.senses ?? clockSenses(world);
```

`view.time` stays: it is `view.senses.time`, and a driver that reads only its own body reads it
there.

## `src/core/mind/fighter.ts`

```ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { APPROACH } from "../skills/strike.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { GUARD_ACTION, type Intent } from "./intent.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";

/**
 * What a fighter carries out this step: a direction to walk (unit, world) or null to stand, a
 * way to face when standing, and the point to attack (world), or null.
 */
export interface FighterPlan {
  readonly move: Heading | null;
  readonly look: Heading | null;
  readonly attack: Vec3 | null;
}

/**
 * **A fighter's tactics**: it walks its plan's direction at its body's fastest walk
 * (`Body.envelope`), facing it, and given a point to attack attacks it with what the right hand
 * holds: the strike skill brings the body the rest of the way (`APPROACH` in
 * `src/core/skills/strike.ts`). It holds the point it aims at while the plan's stays within
 * `APPROACH.reach` of it, and aims again after each blow, since the skill sets the feet for the
 * point it is given and a point that followed a swaying head would move under every placing.
 * `plan` is asked every control step, with what the body sees.
 */
export function fighterTactics(name: string, plan: (sight: Sight) => FighterPlan): Tactics {
  /** The point aimed at, and the blows thrown when it was chosen. */
  let aim: { point: Vec3; thrown: number } | null = null;
  return {
    name,
    decide: (sight): Intent => {
      const { report, envelope } = sight, { move, look, attack } = plan(sight);
      if (attack) {
        const thrown = report.strike.thrown.right;
        if (!aim || aim.thrown !== thrown
          || Math.hypot(attack[0] - aim.point[0], attack[1] - aim.point[1], attack[2] - aim.point[2]) > APPROACH.reach) {
          aim = { point: [attack[0], attack[1], attack[2]], thrown };
        }
        return { move: null, face: report.heading, hands: { left: GUARD_ACTION, right: { kind: "attack", target: aim.point } } };
      }
      // ... the rest as it is.
    },
  };
}

/**
 * **The plan of a fighter that picks its own fight**, from what it sees: the nearest body of
 * another side, one still in the fight before one that is out. It walks at it until their centres
 * of mass are within `ATTACK_METRES` across the ground, then attacks its head; once either is
 * out it stands, looking at it; and with nobody to fight it stands as it is.
 */
export function seekFoe({ view }: Sight): FighterPlan {
  const { senses, stance } = view, from = stance.centre;
  let foe: BodySense | null = null, near = Infinity;
  for (const other of senses.others) {
    if (other.side === senses.side) continue;
    const d = Math.hypot(other.centre.x - from.x, other.centre.z - from.z);
    if (foe === null || (foe.out && !other.out) || (foe.out === other.out && d < near)) { foe = other; near = d; }
  }
  if (!foe) return { move: null, look: null, attack: null };
  const d = Math.max(0.001, near);
  const toward = { x: (foe.centre.x - from.x) / d, z: (foe.centre.z - from.z) / d };
  if (senses.out || foe.out) return { move: null, look: toward, attack: null };
  if (d > ATTACK_METRES) return { move: toward, look: toward, attack: null };
  const head: Vector3 = foe.segments.get("head")?.centre ?? foe.centre;
  return { move: null, look: toward, attack: [head.x, head.y, head.z] };
}
```

The aim no longer remembers whose head it was. A plan that changes its target to one more than
`APPROACH.reach` from the old point aims again as before; one nearer than that keeps the point,
which the strike skill's own window then judges.

`Sight`'s comment in `tactics.ts` reads: "What tactics see: the body's view, with what it senses
of the others (`BodyView.senses`), how its skills are going, and what its stance holds."

## `src/arena/duel.ts`

```ts
export interface DuelRecipe {
  // ... as it is, and:
  /** How many steps old what each side sees of the other is; none unless given (`createSenses`). */
  readonly senseDelay?: number;
}
```

In the constructor, before the sides are built:

```ts
    this.senses = createSenses(world, this.recipe.senseDelay ?? 0);
```

and each side:

```ts
      const built = buildBody(spec, world, { position: [x, 0, 0] });
      const pool = createPool(spec, this.rules);
      const sense = this.senses.add({ id: side, side, built, out: () => this.verdict !== null || !duelists[side].standing });
      const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: sense });
      const skills = driveBy(body, fighterTactics(`arena ${side}`, seekFoe));
```

`Duel.plan` and the local `other` are deleted; `private readonly senses: SensesHub` is disposed
in `dispose`, before the bodies. The class comment's "A mind walks at the other" reads "Each
side's tactics (`seekFoe`) walk at the body they see of the other side".

A side is `out` to the other once the bout has a verdict, or its pool has ended, or it has
fallen: what `Duel.plan` asks today of `this.verdict` and `standing`.

## `src/dungeon/run.ts`

The run's plan stays the commander of its fighters and reads its own actors; only the type of
what it hands over changes:

```ts
      const { move, look, attack } = actor.plan, head = attack?.fighter?.body.view.head;
      return actor.alive
        ? { move, look, attack: head ? [head.x, head.y, head.z] : null }
        : { move: null, look, attack: null };
```

Its bodies take no senses (`createBody` without the option), so their `view.senses.others` is
empty.

## Tests

`tests/core-senses.test.mjs`. Node stand, Rapier, 120 Hz: two Warriors in one world, the second
built two metres along x with `buildBody(spec, stand.world, { position: [2, 0, 0] })`, both limp
unless a test says otherwise, so both are falling and every reading moves.

```js
/** Every number the senses carry of `built`, read from the body as it stands. */
function standing(built) {
  const p = new Vector3(), v = new Vector3(), w = new Vector3();
  return [...built.segments.values()].map((s) => {
    const at = s.node.position, q = s.node.rotationQuaternion;
    centreOfToRef(s, p); s.body.linearVelocityToRef(v); s.body.angularVelocityToRef(w);
    return [at.x, at.y, at.z, q.x, q.y, q.z, q.w, p.x, p.y, p.z, v.x, v.y, v.z, w.x, w.y, w.z];
  });
}
/** The same numbers, as sensed. */
const sensed = (body) => [...body.segments.values()].map((s) => [...s.position.asArray(), ...s.rotation.asArray(),
  ...s.centre.asArray(), ...s.velocity.asArray(), ...s.spin.asArray()]);
```

1. `a_mind_sees_the_others_as_the_last_step_left_them_whenever_the_senses_were_made`: the first
   Warrior is given a mind before the senses exist, and the senses are made after it:

   ```js
   let sense = null, seen = null;
   const watcher = embody(stand.built, stand.world, () => ({ name: "watch", step(senses) { seen = sensed(senses.others[0]); } }), () => sense());
   const hub = createSenses(stand.world);
   sense = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
   const b = hub.add({ id: "b", side: "right", built: second, out: () => false });
   ```

   `sense().others` has one entry, id `"b"`, side and spec as given, and `b().others[0].id` is
   `"a"`. Step 30; take `before = standing(second)`; step once. `seen` (what the mind saw when
   it stepped) deep-equals `before`, to the bit, and `standing(second)` does not (the control: the
   body moved in that step).
2. `a_delay_shows_the_others_that_many_steps_late`: both limp, added as `a` and `b`;
   `createSenses(world, 12)`. Keep
   `history[j] = standing(second)` after `j` steps, `j` from 0. After 5 steps the sensed body is
   `history[0]`; after 40, `history[27]` (the step reads the world 39 steps in, and shows it 12
   late), and not `history[28]` or `history[26]`.
3. `a_body_is_out_to_the_others_a_step_after_it_is_out_and_to_itself_at_once`: `b`'s `out`
   returns a flag. Before any step both read false; set the flag: `b().out` is true at once,
   `a().others[0].out` still false; after one step, true. With a delay of 3, true after four
   steps and not after three.
4. `a_sensed_centre_is_the_body's_own_reading`: the second Warrior under
   `createBody(second, world, { servoSeconds: SERVO_SECONDS })`, added after the hub. After 20
   steps `a().others[0].centre` and `.velocity` are within 1e-9 of that body's
   `view.stance.centre` and `.velocity`, and the head's `centre` within 1e-9 of `view.head`.
5. `a_fighter_picks_its_foe_from_what_it_sees` (no world): `seekFoe` on hand-made sights, whole
   plans compared. A sight is `{ view: { stance: { centre: new Vector3(0, 1, 0) }, senses } }`
   and a body `{ side, out, centre, segments: new Map([["head", { centre }]]) }`.
   - nobody: `{ move: null, look: null, attack: null }`;
   - a foe at (4, 1, 0): `{ move: { x: 1, z: 0 }, look: { x: 1, z: 0 }, attack: null }`;
   - a foe at (0, 1, 1.5), head at (0.1, 1.6, 1.4): attack `[0.1, 1.6, 1.4]`, `move` null;
   - a foe at 1.5 m with no head segment: attack is its centre;
   - that foe out, or the body itself out: `attack` null, `move` null, `look` toward it;
   - a friend at 1 m and a foe at 3 m: walks at the foe;
   - foes at 3 m and 2 m: the nearer; the nearer out: the farther.

In `tests/arena-core.test.mjs`:

```js
test("each_side_of_a_bout_sees_the_other_and_closes_on_it", async () => {
  const { world, dispose } = await arena();
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
  try {
    const { left, right } = duel.duelists;
    const seen = (duelist) => duelist.body.view.senses.others.map((other) => [other.id, other.side, other.spec.model, other.out]);
    assert.deepEqual(seen(left), [["right", "right", "workshop-rogue", false]]);
    assert.deepEqual(seen(right), [["left", "left", "workshop-fighter", false]]);
    const gap = () => right.body.view.stance.centre.x - left.body.view.stance.centre.x;
    const before = gap();
    duel.run(3);
    assert.ok(gap() < before - 0.5, `they close: ${before} to ${gap()}`);
    // Each sees the other where its own reading has it.
    const other = left.body.view.senses.others[0].centre, own = right.body.view.stance.centre;
    assert.ok(Math.hypot(other.x - own.x, other.y - own.y, other.z - own.z) < 1e-9);
  } finally { duel.dispose(); dispose(); }
});

test("a_bout's_sense_delay_is_a_dial_that_changes_the_bout", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const now = await playBout(recipe, 10), late = await playBout({ ...recipe, senseDelay: 24 }, 10);
  assert.notEqual(late.digest, now.digest);
  assert.deepEqual(await playBout({ ...recipe, senseDelay: 0 }, 10), { ...now, recipe: { ...recipe, senseDelay: 0 } });
});
```

In `tests/core-world.test.mjs`: `sensing_runs_before_every_step_hook_whenever_it_was_added`: a
`beforeStep` hook, then a `sense` hook, then another of each, each pushing its name; one step
gives `["sense 1", "sense 2", "before 1", "before 2"]`; a sensing hook disposed stops at once.

## Mutations, each must go red

- `createSenses` hooks `world.beforeStep`: test 1 (the mind was given its body first, so it sees
  a step late). No test at the arena's level can see this one: what a mind saw as it decided is
  not kept, and what is shown after the step is the same either way. That is why the phase is the
  world's and not an order of construction.
- `World.step` runs `before` ahead of `sensing`: the world's test, and test 1.
- `show` reads `frames[(at + 1) % length]`: test 2.
- `read` writes the node's position where the centre goes: test 1, and test 4's head.
- `add` asks `out()` at once: `Duel`'s constructor throws (its duelists are not made yet).
- The hook passes `false` for `out`: test 3.
- `seekFoe` drops the side check: test 5's friend.
- `seekFoe` prefers the nearer whatever is out: test 5's last case.
- `fighterTactics` ignores its plan's point and keeps its first aim for ever: `tests/core-blows`
  and the arena's bouts land nothing after the first blow; check `blows` in `bout-trace.mjs`.
- `Duel` passes no `senses` to `createBody`: the arena test's first bar (`others` is empty), and
  nobody walks.

## Documents

- `AGENTS.md`: the rule's sentence reads as in
  [the design](2026-09-30-minds-00-design.md#the-rules-this-changes): a mind learns of the world
  through its senses and its own body.
- `docs/architecture.md`, "Minds": the bout's senses (`createSenses`), what a `BodySense` holds,
  that the arena's tactics pick their foe from it (`seekFoe`) and the crypt's run still hands its
  fighters their targets. "One world step": the senses' hook runs first.
- `docs/reference/bouts.md`: a section `## With senses`: the harness line, the commit, the two
  digests read after this change, and the standing table run again in full. The first section is
  not edited.

## Verification

```powershell
npm test
npm run check
npm run build
node research/bout-trace.mjs
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60
node research/bout-baseline.mjs --workers 14
```

The digests differ from plan 02's: the left side sees a step sooner. That is the change, so no
number gates it; what gates it is the tests, and the baseline read against the standing table (`docs/reference/bouts.md`): the same
harness, the same 27 bouts. Write both tables' totals side by side in `bouts.md` (bouts by
ending, falls per minute, wounding blows per minute). A shift in either rate is the reading of
one step of sight, at 27 bouts, and is recorded, not explained.
