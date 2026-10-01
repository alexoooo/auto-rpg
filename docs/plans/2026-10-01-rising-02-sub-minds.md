# Rising 02: sub-minds, a mind's config, and lying still

## Goal

A mind can hand its whole body to a sub-mind, and what a mind is made of is its own plain-data
config that a fight passes through. The first sub-mind lies still: a body that is down asks its
muscles for nothing, on every screen, and its stance is asked nothing.

The rules do not change: a body that is down is still out of its fight (the arena ends the bout,
the crypt drops the body). A bout's trace to its verdict is the one `docs/reference/bouts.md` lists
(`research/bout-trace.mjs`); what differs is every body after it has fallen.

## Files

| File | Change |
|---|---|
| `src/core/mind/sub-mind.ts` | New: `SubMind`, `HostMind`, `Hosted`, `hosting`. |
| `src/core/mind/config.ts` | New: `MindConfig`, `FighterMindConfig`, `SubMindConfig`, `LieConfig`, `FIGHTER`. |
| `src/core/mind/lie.ts` | New: `lying`. |
| `src/core/mind/sub-minds.ts` | New: `SubMindMaker`, `subMind`, `subMindsOf`. |
| `src/core/mind/minds.ts` | New: `MindWiring`, `FighterMind`, `Minded`, `createMind`. |
| `src/core/body.ts` | `BodyOptions.subs`; `Body.has`; `BodyView.resumed`; `commandMind` is a `HostMind`: `look`, `act`, `resume`. |
| `src/core/control/stance.ts`, `stance-state.ts` | `StanceControl.reset`; `StanceReading.facing`. |
| `src/core/control/motor.ts` | `MotorControl.reset`. |
| `src/core/skills/skill.ts` | New: `Skill`. |
| `src/core/skills/locomotion.ts`, `strike.ts`, `skills.ts` | Each skill's `resume`; the skills resume every one of them on `view.resumed`. |
| `src/core/mind/fighter.ts` | `fighterTactics` forgets its aim on `view.resumed`. |
| `src/arena/duel.ts` | `DuelRecipe.minds`; a side is a `Minded`, made by `createMind`; `SideState.mind`. |
| `src/dungeon/run.ts` | `drive` makes a `Minded` by `createMind`. |
| `src/lab/actor.ts`, `mind-log.ts`, `main.ts` | The actor's body takes `FIGHTER`'s sub-minds; the log notes who has the body. |
| `research/core-rise-trials.mjs`, `research/core-rise.mjs` | `shoved` and `boutFall` take `mind`, a `MindConfig` made by `createMind`; the table's script takes `--mind '<MindConfig JSON>'` and passes it to every job. |
| `tests/core-sub-mind.test.mjs` | New: four tests. |
| `tests/core-fork.test.mjs`, `arena-fork.test.mjs`, `arena-core.test.mjs`, `lab-mind-log.test.mjs` | See Tests. |
| `tests/core-ground.test.mjs` | `a body asked to hold itself low is not down at that height` runs under `FIGHTER`'s sub-minds. |
| `research/bout.mjs` and whatever else reads a duelist's or a crypt actor's `skills` | The `Minded`'s, narrowed on its kind. |
| `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/reference/rising.md`, `docs/reference/play.md` | See Documents. |

## `src/core/mind/sub-mind.ts`

```ts
import type { Mind } from "./mind.ts";
import type { Senses } from "./senses.ts";

/**
 * **A sub-mind**: a mind that takes a body over from its host while it wants it. It is made with
 * the body (`OwnBody`) as any mind is, and drives it as any mind does (`Mind.step`).
 */
export interface SubMind extends Mind {
  /** Whether it wants the body this step: asked every step, before any mind steps. */
  wants(senses: Senses): boolean;
  /** The body is its own from this step: it starts from the body as it is. */
  begin(): void;
  /** The body is its own no longer: the host has it back, or a sub-mind of higher rank took it. */
  end(): void;
}

/**
 * **A mind that hands its body over** (`hosting`). Its step is in two halves, so that what it
 * reads of its body is of this step whoever drives, and a sub-mind may read it too.
 */
export interface HostMind extends Mind {
  /** Read the body on `senses`, and command nothing. */
  look(senses: Senses): void;
  /** Command the body on what `look` read: the rest of its step. */
  act(dt: number): void;
  /** The body is its own again from this step: what it was in the middle of is over, and it goes on from the body as it is. */
  resume(): void;
}

/** A host with its sub-minds, as one mind. */
export interface Hosted extends Mind {
  /** The name of the mind that has the body: the host's, or a sub-mind's. */
  readonly has: string;
}

/**
 * `host` with `subs`, in rank order: each step the host looks, then the first sub-mind that wants
 * the body steps in the host's place, or the host acts. Its memory is who has the body (the
 * sub-mind's place in `subs`, or -1), the host's, and each sub-mind's.
 */
export function hosting(host: HostMind, subs: readonly SubMind[]): Hosted {
  const state = { has: -1, host: host.state ?? null, subs: subs.map((sub) => sub.state ?? null) };
  return {
    name: host.name, state,
    get has() { return state.has < 0 ? host.name : subs[state.has]!.name; },
    step(senses, dt) {
      host.look(senses);
      const want = subs.findIndex((sub) => sub.wants(senses));
      if (want !== state.has) {
        if (state.has >= 0) subs[state.has]!.end();
        if (want >= 0) subs[want]!.begin();
        else host.resume();
        state.has = want;
      }
      if (want < 0) host.act(dt);
      else subs[want]!.step(senses, dt);
    },
  };
}
```

`begin`, `end` and `resume` change only state: a load mid-way puts `has` and each mind's memory
back, and calls none of them.

The hand-over is of the whole body, because every sub-mind in this set wants all of it. Nothing
here stands in the way of one that wants a part: it would say which channels it claims, and
`hosting` would let the host act and then the sub-mind write its own channels, as a push does
(the stance already carries freedoms held at a torque, `heldFreedoms`). That is added with the
first sub-mind that needs it, and no sub-mind here changes when it is.

## `src/core/mind/config.ts`

```ts
import { deepFreeze } from "../state.ts";

/** Lie still while down: ask the muscles for nothing (`lying`, `lie.ts`). */
export interface LieConfig { readonly kind: "lie" }

/** **A sub-mind's config**, by kind: what a host's slot holds, whole, so a sub-mind is configured where it is chosen. */
export type SubMindConfig = LieConfig;

/** **The fighter**: tactics over skills over the command layers (`createMind`, `minds.ts`). */
export interface FighterMindConfig {
  readonly kind: "fighter";
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
}

/**
 * **A mind's config**, by kind: plain data, so it rides in a recipe, a save and a link. Each kind
 * of mind declares its own; a fight passes one through and reads nothing in it.
 */
export type MindConfig = FighterMindConfig;

/** The mind every body has unless its fight says otherwise. */
export const FIGHTER: FighterMindConfig = deepFreeze({ kind: "fighter", subs: [{ kind: "lie" }] });
```

## `src/core/mind/lie.ts`

```ts
/** **Lying still**: while its body is down (`BodyView.down`), it asks its muscles for nothing. */
export function lying(own: OwnBody, view: BodyView): SubMind {
  return {
    name: "lie",
    wants: () => view.down,
    begin() {},
    end() {},
    step() { own.muscles.activation.fill(0); own.muscles.velocity.fill(0); },
  };
}
```

It reads `down` from its host's view, which the host has read this step before it is asked
(`hosting`): one reading, the host's, so a body its host holds low on purpose is not taken from
it. It asks its assist nothing, so the assist gives nothing (`createAssist`'s `apply` gives the
step's ask and clears it).

## `src/core/mind/sub-minds.ts`

```ts
/** What makes a sub-mind for a body: its own body, and its host's view of it, read each step before the sub-mind is asked anything. */
export type SubMindMaker = (own: OwnBody, view: BodyView) => SubMind;

/** The sub-mind `config` names. */
export function subMind(own: OwnBody, view: BodyView, config: SubMindConfig): SubMind {
  switch (config.kind) {
    case "lie": return lying(own, view);
    default: return unknownKind(config);
  }
}

/** `configs`' sub-minds as a body takes them (`BodyOptions.subs`). */
export const subMindsOf = (configs: readonly SubMindConfig[]): readonly SubMindMaker[] =>
  configs.map((config) => (own: OwnBody, view: BodyView) => subMind(own, view, config));

/** A config's kind no maker knows: a compile error where the union is known, and a thrown one for a config read from a save or a link. */
function unknownKind(config: never): never {
  throw new Error(`no sub-mind of kind ${JSON.stringify((config as { kind?: unknown }).kind)}`);
}
```

## `src/core/mind/minds.ts`

```ts
/** **What a fight gives the mind it makes**, beside the body and the config. */
export interface MindWiring {
  readonly name: string;
  /** Its orders this step, or null when it is left to itself. `senses` are its own, this step's. */
  orders(senses: Senses): Orders | null;
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given. */
  readonly assist?: AssistCeiling;
}

/** What every kind of mind gives the fight that made it. */
interface MindedBody {
  readonly body: Body;
  /** The mind's memory above its body's (`src/core/state.ts`), saved and loaded with it. */
  readonly state: object;
}

/** A body under a fighter's mind: its skills, for whoever knows it is a fighter and reads their report. */
export interface FighterMind extends MindedBody {
  readonly kind: "fighter";
  readonly skills: Skills;
}

/**
 * **A body under a mind, by the mind's kind.** A fight holds one and reads what every kind gives,
 * the body and the memory; a reader that needs a kind's own narrows on `kind`.
 */
export type Minded = FighterMind;

/** `built` under the mind `config` names, wired to its fight. */
export function createMind(built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring): Minded {
  switch (config.kind) {
    case "fighter": return createFighter(built, world, config, wiring);
    default: return unknownKind(config);
  }
}

function createFighter(built: BuiltBody, world: World, config: FighterMindConfig, wiring: MindWiring): FighterMind {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist, subs: subMindsOf(config.subs) });
  const skills = driveBy(body, fighterTactics(wiring.name, (sight) => wiring.orders(sight.view.senses) ?? seekFoe(sight)));
  return { kind: "fighter", body, skills, state: skills.state };
}
```

`unknownKind` is this module's own, worded for a mind. What a fighter does when it has no orders
(`seekFoe`) is the one conduct there is; when there is a second (an archer's), which one is a
field of `FighterMindConfig`, a nested config by kind as its sub-minds are.

## `src/core/body.ts`

- `BodyOptions` gains

  ```ts
    /** The sub-minds the command layers hand the body to, in rank order (`hosting`): what its mind's config names (`subMindsOf`). */
    readonly subs?: readonly SubMindMaker[];
  ```

- `createBody` embodies the host:

  ```ts
  let command!: CommandMind;
  const { own, mind, state, dispose } = embody(built, world, (body) => {
    command = commandMind(body, options);
    return hosting(command, (options.subs ?? []).map((make) => make(body, command.view)));
  }, sense, options.assist);
  command.look(sense());
  ```

  and returns `view: command.view`, `drive: (next) => command.drive(next)`, and `get has() { return mind.has; }`.
  The body's `state.mind` is `hosting`'s: `{ has, host, subs }`, the command layers' under `host`.
- `Body` gains `readonly has: string` ("The name of the mind that has the body").
- `CommandMind extends HostMind`. Its step is its two halves, as it is written today:
  `look` as it is, and

  ```ts
  act(dt) {
    const next = driver?.(view, dt);
    if (next) obey(next);
    motor.control(muscles, dt);
    state.resumed = false;
  },
  step(senses, dt) { look(senses); this.act(dt); },
  resume() {
    motor.reset();
    goals.left = null; goals.right = null;
    state.resumed = true;
  },
  ```

  so the driver's first call after a hand-back sees `resumed`, and `down` is read against the
  body's standing height until a command asks another: the height asked is the stance goal motor
  control holds (`MotorControl.standing`), which `motor.reset()` clears.
- `BodyView` gains

  ```ts
    /** Whether another mind had the body until this step: whatever its driver had under way is over. */
    readonly resumed: boolean;
  ```

## `src/core/control/motor.ts`, `stance.ts`

- `MotorControl.reset()`: "Forget what was under way: no pushes, no stance, no hand's goal, and the
  stance's own memory (`StanceControl.reset`); the posture stays." It sets `state.pushes = []`,
  `state.standing = null`, each arm's `memory.goal = null`, and calls `stance.reset()`.
- `StanceControl.reset()`: "Forget the stance under way: the next command begins from the body as
  it is." It sets `plan.on = false`, `last = null`, `stride = null`, `striding = null`, the pace to
  zero, `step.swing = null`, `step.lifted = false`, `step.time = 0`, `step.held = 0`,
  `reading.phase = "stand"`, `reading.own = null`, and each foot's `memory.rolled = false`.
- `StanceReading.facing`: "The way the pelvis faces, rad about up, as a heading is counted (0 as in
  the reference pose, growing to the right)." `read` sets it: the reference pose's forward (0, 0, 1)
  turned by `turnOfToRef(pelvis)`, and `atan2(x, z)` of that (`src/core/math/real.ts`).

## The skills and the tactics

Every skill can be told the body is back, by one name, and the skills tell every one of them from
one list, so a skill added later (a bow's) cannot be left out of it:

```ts
/** What every skill answers to: the body was another mind's, and is back as `view` shows it. Whatever the skill had under way is over. */
export interface Skill {
  resume(view: BodyView): void;
}
```

- `Locomotion extends Skill`: `resume(view)` takes the heading from `view.stance.facing`;
  `setOff = null`, `pace = 0`, `placing = null`, `placed = false`. The reference height stays.
- `StrikeSkill extends Skill`: `resume()` ends the strike in hand, unthrown, and counts stillness
  from nothing: `if (state.hand) end(); state.still = 0;`.
- `createSkills` keeps `const all: readonly Skill[] = [legs, strikes]`, and `Skills.command` begins
  `if (view.resumed) for (const skill of all) skill.resume(view);`.
- `fighterTactics`' `decide` begins `if (sight.view.resumed) state.aim = null;`.

## The fights

- `duel.ts`: `DuelRecipe` gains

  ```ts
    /** Each side's mind, in place of the fighter every body has (`FIGHTER`): an experiment's, or a table's row. */
    readonly minds?: Readonly<Record<Side, MindConfig>>;
  ```

  and the constructor makes each side by

  ```ts
  const minded = createMind(built, world, recipe.minds?.[side] ?? FIGHTER, {
    name: `arena ${side}`, senses, assist,
    // Out of the fight it stands, as a side nobody orders does.
    orders: (sensed) => sensed.out ? null : given[side],
  });
  ```

  A `Duelist` is the rules' `Fighter` with `{ side, model, minded, body: minded.body, standing }`: the bout reads the
  body and saves the mind's memory, whatever kind the mind is. `SideState.skills` becomes
  `SideState.mind` (`minded.state`), and `Duelist.skills` goes; the tests that read a duelist's
  skills' report narrow first (`left.minded.kind === "fighter"`, then `left.minded.skills.report`).
  `recipeKey` is the recipe's JSON, so a save of one mind does not load into a bout of another.
  The verdict's `assist.withdraw()` stays: it is the fight's, and for both sides. Its comment in
  `judge` reads "The bout is over: neither body is given anything more."; the class comment's
  "the core has no rising, so a body down stays down" reads "a body down lies where it fell".
- `run.ts`: `drive` returns `createMind(built, this.world, FIGHTER, { name: \`crypt ${actor.side}\`, assist, orders: () => ... })`,
  the orders being what `tactics(actor)` hands `fighterTactics` today; `tactics` goes. An actor's
  `fighter` is `Fighter & { minded: Minded; body: Body }` (`Fighter` the rules', `blows.ts`) where
  it is `Fighter & { body; skills }`.
  `drop` and `alive` stay: a body that is down is dropped, and `drop`'s comment says its mind had
  already let go.
- `actor.ts`: `createBody(built, world, { servoSeconds: SERVO_SECONDS, assist, stance, subs: subMindsOf(FIGHTER.subs) })`.
- `mind-log.ts`: `watchHas(world: World, body: Body, log: MindLog): Hook`, an `afterStep` hook that
  notes `` `${body.has} has the body` `` whenever `body.has` is no longer what it last noted;
  `main.ts` adds it beside `logged` and disposes it with the run. `said`'s `fallen` goes: tactics
  do not decide while the body lies.

## Tests

`tests/core-sub-mind.test.mjs` (Node stand, Rapier, 120 Hz):

1. **`the first sub-mind that wants the body has it, and the host looks on`**: a written host and
   two written sub-minds under `embody(built, world, () => hosting(host, [a, b]))`, each recording
   its calls, `wants` among them; `a` wants steps 10 to 19, `b` wants steps 5 to 29. The whole
   record: every step opens with `host.look`, and then the sub-minds' `wants` in rank order, as
   far as the first that does; the host acts steps 0 to 4; `b.begin`; `b` steps 5 to 9, and the
   host does not act; `b.end`, `a.begin`; `a` steps 10 to 19; `a.end`, `b.begin`; `b` steps 20 to
   29; `b.end`, `host.resume`; the host acts from 30. `has` names each in turn.
2. **`a body that is down lies still`**: the Warrior under `createMind` and `FIGHTER`, shoved as
   `a shoved body reads down, lying` shoves it (`tests/core-ground.test.mjs`). From the step it is down: `body.has` is `"lie"`, every activation is 0, the
   stance's shortfall is zero, and 3 s on no segment's centre moves faster than 0.05 m/s. The
   control: under `{ kind: "fighter", subs: [] }` the same shove leaves `has` at `"command"` and a
   segment faster than ten times that.
3. **`a body handed back goes on from where it is`**: the Warrior, club in hand, ordered to walk
   east and attack a point ahead of it; a written sub-mind that holds every freedom (activation 1,
   speed 0) wants the body for 0.4 s from the step the strike's phase is `chamber`. The step it is
   handed back: `view.resumed` is true for that step alone, the strike's phase is null, the legs'
   heading is `view.stance.facing`; 4 s on it has not gone down, and has thrown a strike begun
   after the hand-back.
4. **`a sub-mind's config names its kind`**: `subMind(own, view, { kind: "lie" })` is named
   `"lie"`; `subMind(own, view, { kind: "nap" })` throws, naming `nap`.
5. **`a sub-mind reads its host's view of this step`**: a written host whose `look` counts the
   steps into a view, and a written sub-mind made with that view whose `wants` records the count
   it reads: each step it reads that step's count, not the one before.

Elsewhere:

6. `tests/arena-core.test.mjs`, **`a_bout's_minds_are_its_recipe's`**: a recipe with
   `minds: { left: { kind: "fighter", subs: [] }, right: FIGHTER }` builds; after the left falls,
   `duelists.left.body.has` is `"command"`; in the same bout without `minds`, `"lie"`.
   `a_load_is_of_the_same_recipe` (`arena-fork`) gains a save of the one refused by the other.
7. `tests/core-fork.test.mjs`, **`a_body_forks_as_it_goes_down_and_lying`**: `pulled`'s body,
   pulled until it falls, under `FIGHTER`'s sub-minds; forks every step across the hand-over and
   after. `mind > has` is sorted as needed under it; the paths under `mind` gain `host`. In
   `arena-fork` a side's `skills` paths are under `mind`.
8. `tests/core-ground.test.mjs`, `a body asked to hold itself low is not down at that height`: its body takes `FIGHTER`'s sub-minds
   (`subMindsOf(FIGHTER.subs)`), and `body.has` is `"command"` throughout the low hold; in its
   control, `"lie"` from the step `view.down` turns true.
9. `tests/lab-mind-log.test.mjs`: `watchHas` notes `lie has the body` once, at the fall.

## Mutations, each must go red

- `hosting` skips `host.look` while a sub-mind has the body: test 1's record; the arena never
  reaches a verdict by a fall (`a_bout_in_the_arena_runs_to_its_verdict` on a bout that ends by one).
- `hosting` asks `wants` before the host looks: tests 1 and 5.
- `hosting` lets the host act as well while a sub-mind has the body: test 1's record, test 2's
  activations.
- `hosting` takes the last sub-mind that wants the body: test 1.
- `hosting` does not call `resume`: tests 1 and 3.
- `hosting` keeps `has` outside its state: test 7.
- `lying` reads an `uprightness` of its own in place of the view: test 8.
- `lying.step` leaves the arrays as they were: test 2.
- `resume` does not reset the stance (`motor.reset` without `stance.reset`): test 3's last bar.
- `Skills.command` ignores `view.resumed`: test 3's phase and heading. `all` lacks the strikes:
  test 3's phase; lacks the legs: its heading.
- `state.resumed` is never cleared: test 3's "for that step alone".
- `createMind` ignores `config.subs`: tests 2 and 6.
- A fighter's `state` is a copy of its skills' and not theirs: `arena-fork`'s fork of a bout.
- The arena's `orders` drops the `sensed.out` test: `a_side_out_of_the_fight_is_no_longer_under_its_orders`.

## Documents

- `AGENTS.md`, in the core's rules, after "A mind reaches the world only through its body":
  "**A mind may hand its body to a sub-mind.** A sub-mind (`SubMind`,
  `src/core/mind/sub-mind.ts`) is a mind that says when it wants the body; its host reads the body
  every step, acts when the body is its own, and is told when it is its own again. A sub-mind
  reads whether its body is down from its host's view, never by a bar of its own. What a mind is
  made of is its config, plain data by kind (`MindConfig`, `src/core/mind/config.ts`): a fight
  passes it through, reads nothing in it, and holds what it gets by what every kind gives
  (`Minded`, `src/core/mind/minds.ts`). A skill answers `Skill.resume` and is in the one list
  the skills resume."
- `docs/architecture.md`: the Mind seam's row names sub-minds; the Minds section says how a host
  hands over and what `FIGHTER` holds; "is out of the fight: rising is not built yet" says the
  body lies still.
- `docs/roadmap.md`: the paragraph on the stance asking without bound past a fall goes; "a
  registry of minds a recipe can name" reads as built for the fighter (`DuelRecipe.minds`), with a
  learned mind still not built.
- `docs/reference/rising.md#lying`: the battery under `FIGHTER`, beside `#driven`: the same falls,
  `peak` and `asked`. `docs/reference/play.md#bodies-in-the-step`: what a lying body costs a step,
  measured again (`research/body-cost.mjs`).

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
node research/bout-trace.mjs                  # note the digest
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/bout-trace.mjs                  # the same digest
node research/core-rise.mjs
node research/core-rise.mjs --mind '{"kind":"fighter","subs":[]}'
```

The fingerprint's lines differ only from a case's first fall on. The lab's routine and run, where
nobody falls, are the same to the bit: a sub-mind that never wants the body changes no number.

**Eye gate.** The lab's Stance, a shove of 90 N s: the body goes down and lies. An arena bout
that ends by a fall: the loser lies, the winner stands.
