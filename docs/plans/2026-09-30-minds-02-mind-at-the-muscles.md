# Minds 02: the mind at the muscles

## Goal

One seam where anything that drives a body plugs in: `Mind.step(senses, dt)`, made with its own
body and writing its muscles' command. The stack the game has (tactics, skills, motor control)
becomes one mind written with a library, and keeps driving every body exactly as it does: the
trace digest of [plan 01](2026-09-30-minds-01-baseline.md) does not change.

What a mind decides an `Intent` with is today called `Mind`; it becomes `Tactics`, the top layer
of that stack, and `Mind` names the seam.

On a prototype (Node stand, Rapier, 120 Hz; the Warrior, lower trunk pinned, no ground), written
straight on `driveMuscles`: a controller that drives only the right elbow's flexors flat out puts
that elbow at its stop (1.655 rad) in 0.5 s while the left, limp, hangs at its own (-0.861); one
that asks every freedom for full activation and no speed holds the reference pose within 0.08 rad
for a second; with no controller the worst freedom swings 1.94 rad.

## Files

| File | Change |
|---|---|
| `src/core/mind/mind.ts` | Rewritten: `Mind`, `OwnBody`, `MindMaker`, `Embodied`, `embody`. |
| `src/core/mind/senses.ts` | New: `Senses` (the clock), `clockSenses`. |
| `src/core/mind/tactics.ts` | New: today's `mind.ts`, with `Mind` renamed `Tactics`. |
| `src/core/body.ts` | `commandMind`, `CommandMind`; `createBody` drives through `embody`. |
| `src/core/mind/fighter.ts` | `fighterMind` becomes `fighterTactics`. |
| `src/arena/duel.ts`, `src/dungeon/run.ts` | The renames. |
| `src/lab/blow.ts`, `routine.ts`, `run-mode.ts`, `stance-mode.ts`, `stance-scenario.ts` | The renames. |
| `tests/core-mind.test.mjs` | New: three tests. |
| `tests/core-boundary.test.mjs` | One test: only `embody` drives muscles in `src/`. |
| `tests/core-blows.test.mjs` | `driveBy`'s import path; it passes object literals, which need no rename. |
| `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md` | The rule and the layers. |

## `src/core/mind/senses.ts`

```ts
import type { World } from "../world.ts";

/**
 * **What a mind is told of the world**, each control step, as the last solver step left it. A
 * mind's own body is not here: it has that whole (`OwnBody`, `mind.ts`).
 */
export interface Senses {
  /** Seconds of the world's clock. */
  readonly time: number;
}

/** Senses that tell the time and nothing else: a body alone on a stand. */
export function clockSenses(world: World): () => Senses {
  const senses = { time: 0 };
  return () => { senses.time = world.time; return senses; };
}
```

## `src/core/mind/mind.ts`

```ts
import type { BuiltBody } from "../build/build-body.ts";
import { driveMuscles, type MuscleDriver } from "../muscle/driver.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import { clockSenses, type Senses } from "./senses.ts";

/**
 * **A mind**: a stateful function from what its body senses to what its muscles are asked. It is
 * made with its own body (`OwnBody`) and each control step reads its senses and that body, and
 * writes the muscles' command: for each freedom an activation, 0 to 1, and a speed asked for
 * (`MuscleDriver.activation`, `.velocity`). A speed beyond the muscles' reach pushes at the
 * ceiling the activation sets, which is a torque; a speed of zero holds.
 *
 * That command is the whole of what a mind does to the world. How it gets there is its own: the
 * game's bodies run tactics, skills and motor control (`createBody`, `src/core/body.ts`, and
 * `driveBy`, `tactics.ts`), and a mind that writes activations itself is as much a mind.
 *
 * The seam names no hand and no foot: the channels are the body's own
 * (`MuscleDriver.channels`), so a body of another shape takes a mind through the same call.
 */
export interface Mind {
  readonly name: string;
  /** One control step, before the solver's: write this step's command into the body's muscles. */
  step(senses: Senses, dt: number): void;
}

/**
 * **What a mind is made with: its own body, whole.** The spec with what it holds; the built
 * segments and joints, whose nodes and bodies are its proprioception; and its muscles, which read
 * each freedom (angle, rate, speed, strength, the body's dynamics) and take the command.
 */
export interface OwnBody {
  readonly spec: BodySpec;
  readonly built: BuiltBody;
  readonly muscles: MuscleDriver;
}

export type MindMaker<M extends Mind = Mind> = (own: OwnBody) => M;

export interface Embodied<M extends Mind = Mind> {
  readonly own: OwnBody;
  readonly mind: M;
  /** Stop driving: the motors are released. */
  dispose(): void;
}

/**
 * Give `built` a mind: `make` is called once with the body, and the mind steps before every solver
 * step of `world`, after the muscles have read the joints, on `sense`'s senses (the clock alone
 * unless given).
 */
export function embody<M extends Mind>(built: BuiltBody, world: World, make: MindMaker<M>,
  sense: () => Senses = clockSenses(world)): Embodied<M> {
  let mind: M | null = null;
  const muscles = driveMuscles(built, world, (_, dt) => mind!.step(sense(), dt));
  const own: OwnBody = { spec: built.spec, built, muscles };
  mind = make(own);
  return { own, mind, dispose: () => muscles.dispose() };
}
```

`mind.ts` imports the build and the muscles only, so `src/core/body.ts` may import it: the seam
sits beside the muscles in the layering, and the tactics above the skills.

## `src/core/mind/tactics.ts`

Today's `src/core/mind/mind.ts`, moved, with these changes and no others:

- `Mind` is `Tactics`; its doc comment opens "**Tactics**: each control step, what a body sees
  becomes an `Intent`. The top layer of a mind made of layers (`driveBy`): a scenario's script, a
  person's keys, the arena's AI."
- `driveBy(body: Body, tactics: Tactics, options?: SkillOptions): Skills`, body unchanged.
- `Sight` unchanged.

## `src/core/body.ts`

The body's own controller becomes a mind. `createBody` keeps its signature and its `Body`; every
caller is untouched.

```ts
/**
 * **The command layers as a mind**: motor control under a driver that hands it goals
 * (`BodyDriver`). Each step it reads the view, asks the driver for a command, and gives the
 * command to motor control, which writes the muscles.
 */
export interface CommandMind extends Mind {
  readonly view: BodyView;
  /** Read the view from the body as it stands, on `senses`. */
  look(senses: Senses): void;
  drive(driver: BodyDriver | null): void;
}

export function commandMind(own: OwnBody, { servoSeconds, stance }: BodyOptions): CommandMind
```

`commandMind` holds what `createBody` holds today (`motor`, `fists`, `head`, `angles`, `view`,
`driver`, `current`, `goals`, `obey`, `see`), with `built` read as `own.built` and the muscles as
`own.muscles`. `see(d)` becomes `look(senses)`, which sets `view.time = senses.time` and reads the
rest from `own.muscles`. Its step is the closure `createBody` gives `driveMuscles` today:

```ts
    name: "command",
    step(senses, dt) {
      look(senses);
      const next = driver?.(view, dt);
      if (next) obey(next);
      motor.control(own.muscles, dt);
    },
```

and `createBody` is what is left:

```ts
export function createBody(built: BuiltBody, world: World, options: BodyOptions): Body {
  const sense = clockSenses(world);
  const { own, mind, dispose } = embody(built, world, (body) => commandMind(body, options), sense);
  // Before its first step the view is the body as built, where a driver or a run first finds it.
  mind.look(sense());
  return {
    built, muscles: own.muscles, view: mind.view,
    envelope: !options.measuring && Object.keys(options.stance ?? {}).length === 0 ? stanceEnvelope(built.spec) : null,
    drive: (next) => mind.drive(next),
    dispose,
  };
}
```

`Body`'s doc comment loses "nothing reaches past the command to a joint or a muscle" and says
instead: "A body under the command layers (`commandMind`): whoever drives it at this level sees
the view and hands back a command. A mind may drive muscles itself instead (`embody`,
`src/core/mind/mind.ts`)."

## The renames

Every one is the name only; no body of a function changes.

| Was | Is | Where |
|---|---|---|
| `Mind` (type) | `Tactics` | `src/dungeon/run.ts`, `src/lab/blow.ts`, `routine.ts`, `run-mode.ts`, `stance-mode.ts` |
| `"../core/mind/mind.ts"` (for `driveBy`, `Mind`, `Sight`) | `"../core/mind/tactics.ts"` | the same, and `src/arena/duel.ts`, `tests/core-blows.test.mjs` |
| `fighterMind` | `fighterTactics` | `src/core/mind/fighter.ts`, `src/arena/duel.ts`, `src/dungeon/run.ts` |
| `trackMind`, `TrackMind` | `trackTactics`, `TrackTactics` | `src/lab/run-mode.ts`, `routine.ts` |
| `routineMind`, `RoutineMind` | `routineTactics`, `RoutineTactics` | `src/lab/routine.ts` |
| `ordersMind` | `stanceTactics` | `src/lab/stance-mode.ts`, `stance-scenario.ts` |
| `DungeonRun.mind(actor)` | `DungeonRun.tactics(actor)` | `src/dungeon/run.ts` |

`Routine.mind` and `startRoutine`'s local `mind` become `tactics`. Comments that say "a mind" of
one of these say "tactics". `grep -rn "Mind\b" src tests` afterwards finds only `Mind`,
`MindMaker`, `CommandMind` and `commandMind`.

## Tests

`tests/core-mind.test.mjs`. Node stand: the Warrior, lower trunk pinned, gravity on, no ground,
120 Hz.

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { embody } from "../src/core/mind/mind.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = humanSpec("workshop-fighter");
const elbow = spec.joints.find((j) => j.name === "elbow.right").dofs[0];
const stand = () => coreStand(spec, { ground: false, pinned: "lowerTrunk" });
/** The freedom furthest from its reference angle, rad. */
const worst = (muscles) => Math.max(...muscles.channels.map((_, i) => Math.abs(muscles.angle(i))));

test("a_mind_moves_its_body_through_its_muscles'_command_alone", async () => {
  const s = await stand();
  // It flexes its right elbow flat out and leaves every other freedom limp.
  const { own, mind, dispose } = embody(s.built, s.world, (body) => {
    const right = body.muscles.channel("elbow.right flexion");
    return { name: "flex", steps: 0, times: [], step(senses) {
      this.steps += 1; this.times.push(senses.time);
      body.muscles.activation.fill(0); body.muscles.velocity.fill(0);
      body.muscles.activation[right] = 1; body.muscles.velocity[right] = 1e3;
    } };
  });
  try {
    assert.equal(own.spec, spec);
    s.step(s.seconds(0.5));
    const angle = (name) => own.muscles.angle(own.muscles.channel(name));
    assert.ok(Math.abs(angle("elbow.right flexion") - elbow.max.value) < 0.02, `the driven elbow is at its stop: ${angle("elbow.right flexion")}`);
    assert.ok(Math.abs(angle("elbow.left flexion") - elbow.min.value) < 0.05, `the limp one hangs: ${angle("elbow.left flexion")}`);
    // Once a step, before the solver, on the clock as the last step left it.
    assert.equal(mind.steps, 60);
    assert.deepEqual([mind.times[0], mind.times[59]], [0, 59 / 120]);
  } finally { dispose(); s.dispose(); }
});

test("a_mind_that_asks_every_freedom_to_hold_holds_the_pose_and_none_lets_it_fall", async () => {
  const held = await stand(), limp = await stand();
  const a = embody(held.built, held.world, (body) => ({ name: "hold", step() { body.muscles.activation.fill(1); body.muscles.velocity.fill(0); } }));
  const b = embody(limp.built, limp.world, () => ({ name: "limp", step() {} }));
  try {
    held.step(held.seconds(1)); limp.step(limp.seconds(1));
    assert.ok(worst(a.own.muscles) < 0.12, `held: ${worst(a.own.muscles)}`);
    assert.ok(worst(b.own.muscles) > 1, `limp: ${worst(b.own.muscles)}`);
  } finally { a.dispose(); b.dispose(); held.dispose(); limp.dispose(); }
});

test("a_body's_command_layers_are_a_mind_like_any_other", async () => {
  // The same goals through `createBody` and through `commandMind` under `embody` end in the same place, to the bit.
  const { commandMind } = await import("../src/core/body.ts");
  const posture = { "elbow.right flexion": 1.2, "shoulder.left flexion": 0.5 };
  const command = () => ({ posture, hands: { left: null, right: null }, pushes: [], stance: null });
  const one = await stand(), two = await stand();
  const body = createBody(one.built, one.world, { servoSeconds: 0.1 });
  body.drive(command);
  const raw = embody(two.built, two.world, (own) => commandMind(own, { servoSeconds: 0.1 }));
  raw.mind.drive(command);
  try {
    one.step(one.seconds(1)); two.step(two.seconds(1));
    const angles = (muscles) => muscles.channels.map((_, i) => muscles.angle(i));
    assert.deepEqual(angles(raw.own.muscles), angles(body.muscles));
    assert.ok(Math.abs(body.view.angles["elbow.right flexion"] - 1.2) < 0.01);
  } finally { body.dispose(); raw.dispose(); one.dispose(); two.dispose(); }
});
```

In `tests/core-boundary.test.mjs`, beside the engine seam's test:

```js
/** The files among `files` ([file, source] pairs) that drive muscles themselves. */
const muscleDrivers = (files) => files.filter(([, source]) => /\bdriveMuscles\(/.test(source)).map(([file]) => file);

test("in the game's source only the mind seam drives muscles", () => {
  const files = filesUnder("src/").filter((file) => file.endsWith(".ts")).map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.deepEqual(muscleDrivers(files), ["src/core/mind/mind.ts", "src/core/muscle/driver.ts"]);
  // The control: a page driving muscles itself is found.
  assert.deepEqual(muscleDrivers([["src/lab/x.ts", "const d = driveMuscles(built, world);"]]), ["src/lab/x.ts"]);
});
```

Tests and research keep calling `driveMuscles`: an instrument is not a mind.

## Mutations, each must go red

- `embody` steps the mind after `driveMuscles`' loop has set the motors (move the call past the
  loop): the first test's elbow, a step late, and `mind.times`.
- `embody` passes no senses (`mind.step(undefined, dt)`): the first test's `times`.
- `commandMind.step` skips `motor.control`: the third test's posture, and `tests/core-body.test.mjs`.
- `commandMind.step` skips `look`: `tests/core-body.test.mjs`' clock (`view.time` stays 0).
- `createBody` calls `driveMuscles` itself beside `embody`: the boundary test, and every body is
  driven twice a step.
- The hold mind writes `activation.fill(0)`: the second test's first bar.

## Documents

- `AGENTS.md`: the rule "A mind drives a body only through its command" is replaced by the text
  in [the design](2026-09-30-minds-00-design.md#the-rules-this-changes), without its sentence
  on `Senses` naming other bodies, which plan 03 makes true: here it reads "It learns of the world
  through its senses (`Senses`, the clock) and its own body (`OwnBody`)".
- `docs/architecture.md`: the layer table gains a row after Muscles, "Mind seam |
  `src/core/mind/mind.ts` | a mind made with its body, stepped before the solver, writing the
  muscles' command", and the Minds row reads "Tactics | `src/core/mind/tactics.ts`, `fighter.ts` |
  what the body should do, decided from what it sees". The "Minds" section is rewritten on the
  new names; its last paragraph, on the structure being open, goes. "One world step" says the hook
  runs the body's mind (`embody`), which for a game body is `commandMind`.
- `docs/roadmap.md`: "The AI"'s first item goes; the line on what sits above `fighterMind` in the
  direction section names `Tactics` and points at the design.

## Verification

```powershell
node research/bout-trace.mjs    # before the change: note the digest
npm test
npm run check
npm run build
node research/bout-trace.mjs    # after: the same digest (fd30dd8586076627 at 144961d4 on this machine)
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60   # 65d5ac39a44024e3, 4312 steps
```

The two digests unchanged is the gate: the seam moved and no number did.
