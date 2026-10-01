# Minds 05: the assist

## Goal

A second effector beside the muscles: a force and a moment on a body's root that no muscle
gives, with a ceiling that is a rule of the bout, the same for both sides, metered every step,
and zero unless the bout's recipe says otherwise. At zero it is absent and every digest is
unchanged.

The stance is its first user. Each step the stance works out the wrench the ground must give for
the accelerations it asks, shares it among the soles as far as soles can give it, and where they
cannot give it all it settles for the motion the lesser wrench makes
(`shareGroundWrench`, in `carry`). That shortfall is what the assist supplies, up to its ceiling,
inside the same solve: the root is then asked for what the soles and the assist give together.

This is a dial, not a decision. The plan lands it at zero with its table; turning it is a field
of a recipe, or two numbers in a link.

## What was measured

Harness for all of it: Node, the core world, Rapier, 120 Hz, on a copy of `src/` at `144961d4`
patched as this plan describes; force ceilings in body weights, moment ceilings in N m for every
body (the Warrior and the skeleton weigh 775 N, the Rogue 565 N).

**What the soles miss, with no assist** (the nine matchups at 4 m). Over a whole bout a body's
stance misses 0.01 to 0.10 of its weight and 6 to 79 N m on average, and asks more than the
soles give (over 0.05 weights or 5 N m) in 28 to 62 % of its steps. In the last second before it
falls, a body that falls misses 0.51 to 0.69 weights and 238 to 420 N m; one that does not, 0.001
to 0.10 weights and 0.3 to 63 N m.

**A pull the soles cannot hold.** The Warrior standing, unarmed, pulled at its root's centre by a
steady tenth of its weight for 2 s:

| Pull | Ceiling | Outcome | Recovery steps | Centre of mass travelled, m | Mean given, N and N m |
|---|---|---|---|---|---|
| forward | none | fell | 11 | 1.44 | |
| forward | 0.25 weights, 50 N m | held | 0 | 0.05 | 2.0, 1.9 |
| backward | none | held | 5 | 0.68 | |
| backward | 0.25 weights, 50 N m | held | 0 | 0.03 | 1.1, 1.0 |

At a fifth of its weight it falls all three ways tried with no assist (0.98 to 3.66 m), and
holds all three with it (0.10 to 0.78 m).

**Bouts**: every matchup at gaps of 3, 4 and 5 m, 27 bouts a cell, each to its verdict or the
120 s cap.

| Force, weights | Moment, N m | End by a fall | By a wound | At the cap | Bout time, s | Falls a minute | Wounding blows a minute | Mean given, N and N m |
|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 20 | 7 | 0 | 361 | 3.33 | 10.8 | |
| 0.1 | 25 | 16 | 11 | 0 | 731 | 1.31 | 26.8 | 7.9, 4.9 |
| 0.25 | 50 | 9 | 13 | 5 | 1460 | 0.37 | 21.2 | 7.4, 5.2 |
| 0.5 | 100 | 6 | 13 | 8 | 1588 | 0.23 | 19.0 | 8.1, 7.0 |
| 1 | 200 | 1 | 16 | 10 | 1652 | 0.04 | 14.3 | 8.0, 7.4 |
| 1 | 400 | 7 | 15 | 5 | 1339 | 0.31 | 17.9 | 8.4, 8.5 |
| 2 | 800 | 10 | 13 | 4 | 1371 | 0.44 | 29.3 | 8.8, 9.0 |
| 0 | 200 | 8 | 14 | 5 | 1256 | 0.38 | 19.0 | 0, 9.6 |
| 1 | 0 | 14 | 7 | 6 | 1329 | 0.63 | 9.7 | 11.1, 0 |

A quarter of a body's weight and 50 N m take falls from 3.3 a minute to 0.4, on a mean of 7 N
and 5 N m: about a hundredth of a body's weight. Most bouts then end by a wound or at the cap.
Past 1 weight and 200 N m the count of falls rises again; 27 bouts a cell cannot place that (1
against 7 is suggestive, not a rate), and this plan's sweep runs more bouts to read it.

**A body that is down.** Past a fall the stance goes on asking, and what it asks of the ground
grows without bound (read past 1e50 N on the stand, within 3 s of the fall). An assist answers
that ask at its full ceiling: the Warrior pulled over by 0.6 of its weight was 53 m from its start
3 s later under a ceiling of 2 weights and 400 N m, and 14 m with none (both had left the 20 m
floor). So the bout withdraws the assist at its verdict (below), an ask that is not finite is
given nothing, and the stance's ask after a fall is on the roadmap as a defect of its own.

## Files

| File | Change |
|---|---|
| `src/core/control/assist.ts` | New: `AssistCeiling`, `NO_ASSIST`, `Assist`, `createAssist`. |
| `src/core/mind/mind.ts` | `OwnBody.assist`; `embody` takes a ceiling and applies the assist after the mind's step. |
| `src/core/control/stance.ts` | `StanceReading.shortfall`; `stanceControl(built, tuning, assist)` asks the assist for it. |
| `src/core/control/motor.ts` | Hands the assist to the stance. |
| `src/core/body.ts` | `BodyOptions.assist`; `Body.assist`. |
| `src/arena/duel.ts` | `ASSIST`; `DuelRecipe.assist`; withdrawn at the verdict. |
| `src/arena/matchup.ts`, `src/arena/main.ts` | `&assist=force,moment` in a link. |
| `research/bout.mjs` | The row gains each side's mean assist. |
| `research/assist-need.mjs`, `research/assist-sweep.mjs` | New. |
| `docs/reference/assist.md` | New: the three tables, read on the landed code. |
| `tests/core-assist.test.mjs` | New: three tests. |
| `tests/arena-core.test.mjs` | One test. |
| `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md` | The rule; the effector; the walk's line. |

## Chunk A: what the soles miss, published

Lands by itself, changes no motion, and is read by `research/assist-need.mjs`.

`src/core/control/stance.ts`, in `StanceReading`:

```ts
  /**
   * What the last command asked of the ground and the bearing soles could not give
   * (`shareGroundWrench`): a force, and a moment about the root's centre of mass, world, N and N m.
   * None with no stance, or no sole bearing. The root was asked for the motion that the wrench
   * the soles can give makes, with whatever of this the assist supplies (`Assist`).
   */
  readonly shortfall: { readonly force: Vector3; readonly moment: Vector3 };
```

`reading` gains `shortfall: { force: new Vector3(), moment: new Vector3() }`; `command` sets both
to zero where it sets `aim.on = false`; and `carry`, straight after its `shareGroundWrench`:

```ts
        // `missed` is what the soles give beyond what was asked; the shortfall is its opposite.
        reading.shortfall.force.copyFrom(missed.force).scaleInPlace(-1);
        reading.shortfall.moment.copyFrom(missed.moment).scaleInPlace(-1);
```

`research/assist-need.mjs`: `node research/assist-need.mjs [--gaps 4] [--workers 14]`. Every
matchup at each gap through `bout-worker.mjs`, whose job gains an option `shortfall: true`: with
it `playBout` keeps, each step and for each side, the shortfall's force over the body's weight
and its moment's size, and its row gains for each side the bout's mean of each, the share of
steps over 0.05 weights or 5 N m, and the mean of each over the last second before the verdict.
It prints the harness and the first table above. Steps after the verdict are not read: past a
fall the ask has no bound.

Verification of the chunk: `node research/bout-trace.mjs` prints the digest it printed before.

## Chunk B: the effector

### `src/core/control/assist.ts`

```ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import { centreOfToRef } from "./support.ts";

/**
 * The most an assist gives a body: a force, in the body's own weights, and a moment, in its
 * weights times a metre. Scaled by the body so one ceiling is the same help to a light body and a
 * heavy one.
 */
export interface AssistCeiling { readonly force: number; readonly moment: number }

export const NO_ASSIST: AssistCeiling = Object.freeze({ force: 0, moment: 0 });

/**
 * **The assist: a force and a moment on a body's root that no muscle gives.** It is not anatomy:
 * its ceiling is a rule of the fight the body is in, the same for every side, and everything it
 * gives is metered. A mind asks it for a wrench each step as it asks its muscles; what it is
 * given is the ask shortened to the ceiling, applied at the root's centre of mass in the solver
 * step that follows, with the muscles' torques. Asked for nothing, it gives nothing.
 */
export interface Assist {
  /** Whether it gives anything: a ceiling above none, and not withdrawn. */
  readonly on: boolean;
  /** The most it gives this body, N and N m. */
  readonly most: { readonly force: number; readonly moment: number };
  /** `force` and `moment` as they would be given: each shortened to its ceiling; one that is not finite, none. */
  clipToRef(force: Vector3, moment: Vector3, givenForce: Vector3, givenMoment: Vector3): void;
  /** Ask for this wrench about the root's centre of mass, world, in the step about to be taken. The last ask of a step stands. */
  ask(force: Vector3, moment: Vector3): void;
  /** What the last step was given. */
  readonly given: { readonly force: Vector3; readonly moment: Vector3 };
  /** The steps metered, and the sums over them of the force's and the moment's sizes, N and N m: a mean is a sum over the steps. */
  readonly meter: { readonly steps: number; readonly force: number; readonly moment: number };
  /** Give nothing from now on: the fight this body's ceiling belonged to is over. */
  withdraw(): void;
}

/** `built`'s assist under `ceiling`, on `root`; `apply` gives the step's ask, and is the seam's to call (`embody`). */
export function createAssist(built: BuiltBody, root: BuiltSegment, ceiling: AssistCeiling): { assist: Assist; apply(dt: number): void } {
  const weight = [...built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0) * Math.hypot(...built.physics.gravity);
  const most = { force: ceiling.force * weight, moment: ceiling.moment * weight };
  const asked = { force: new Vector3(), moment: new Vector3() }, given = { force: new Vector3(), moment: new Vector3() };
  const meter = { steps: 0, force: 0, moment: 0 };
  const at = new Vector3(), impulse = new Vector3();
  let withdrawn = false;
  const on = (): boolean => !withdrawn && (most.force > 0 || most.moment > 0);
  const clip = (v: Vector3, limit: number, out: Vector3): void => {
    const size = v.length();
    if (!Number.isFinite(size) || size === 0 || limit <= 0) out.setAll(0);
    else out.copyFrom(v).scaleInPlace(Math.min(1, limit / size));
  };
  const assist: Assist = {
    get on() { return on(); },
    most, given, meter,
    clipToRef(force, moment, givenForce, givenMoment) { clip(force, most.force, givenForce); clip(moment, most.moment, givenMoment); },
    ask(force, moment) { asked.force.copyFrom(force); asked.moment.copyFrom(moment); },
    withdraw() { withdrawn = true; },
  };
  return {
    assist,
    apply(dt) {
      if (!on()) { given.force.setAll(0); given.moment.setAll(0); return; }
      assist.clipToRef(asked.force, asked.moment, given.force, given.moment);
      asked.force.setAll(0); asked.moment.setAll(0);
      meter.steps += 1; meter.force += given.force.length(); meter.moment += given.moment.length();
      if (given.force.lengthSquared() > 0) root.body.applyImpulse(impulse.copyFrom(given.force).scaleInPlace(dt), centreOfToRef(root, at));
      if (given.moment.lengthSquared() > 0) root.body.applyTorqueImpulse(impulse.copyFrom(given.moment).scaleInPlace(dt));
    },
  };
}
```

An impulse of the force over one step, at the centre of mass, before the solver's step: the
solver then treats it with the motors' torques. An explicit righting torque computed from the
root's tilt and applied the same way went unstable at 120 Hz
([the design](2026-09-30-minds-00-design.md#what-was-measured-before-this-was-written)); this one
is a share of a wrench the stance already solved for, and the table above is its test.

### `src/core/mind/mind.ts`

`OwnBody` gains `readonly assist: Assist`, described as "the force and the moment on its root
that its fight allows it beyond its muscles (`Assist`): none unless the fight says so". `embody`
takes the ceiling last:

```ts
export function embody<M extends Mind>(built: BuiltBody, world: World, make: MindMaker<M>,
  sense: () => Senses = clockSenses(world), ceiling: AssistCeiling = NO_ASSIST): Embodied<M> {
  let mind: M | null = null, help: ReturnType<typeof createAssist> | null = null;
  const muscles = driveMuscles(built, world, (_, dt) => { mind!.step(sense(), dt); help!.apply(dt); });
  help = createAssist(built, muscles.dynamics.root.segment, ceiling);
  const own: OwnBody = { spec: built.spec, built, muscles, assist: help.assist };
  mind = make(own);
  return { own, mind, dispose: () => muscles.dispose() };
}
```

### `src/core/control/stance.ts`

`stanceControl(built: BuiltBody, tuning: StanceTuning = {}, assist: Assist | null = null)`, and
beside `missed`:

```ts
  /** What the assist is asked this step: the soles' shortfall, within its ceiling. */
  const helped = { force: new Vector3(), moment: new Vector3() };
```

`command` zeroes `helped` with the shortfall. In `carry`, after chunk A's two lines and before
the test of `missed`:

```ts
        // What the soles cannot give, the assist may, up to its ceiling: the root is then asked
        // for the motion the two give together.
        if (assist?.on) {
          assist.clipToRef(reading.shortfall.force, reading.shortfall.moment, helped.force, helped.moment);
          missed.force.addInPlace(helped.force);
          missed.moment.addInPlace(helped.moment);
        }
```

In `bear`, the ground is asked for the wrench less what the assist gives, and the assist is
asked for its share:

```ts
        force.set(W[3]!, W[4]!, W[5]!);
        moment.set(W[0]!, W[1]!, W[2]!);
        if (assist?.on) { force.subtractInPlace(helped.force); moment.subtractInPlace(helped.moment); }
```

and at the end of `bear`, after the legs' torques: `if (assist?.on) assist.ask(helped.force, helped.moment);`.

With no assist, or one that is off, no line above runs: the arithmetic is today's, and so is the
digest. The stance's doc comment's last paragraph gains: "With an assist (`Assist`) the root may
be given what the soles miss, up to the fight's ceiling; with none, nothing holds the body up
that the legs' muscles do not."

`motorControl` takes the assist as its last argument and hands it to `stanceControl`;
`commandMind` passes `own.assist`.

### `src/core/body.ts`, `src/arena/duel.ts`, the page

- `BodyOptions.assist?: AssistCeiling` (passed to `embody`); `Body.assist: Assist`, "for its
  meter; the fight that set its ceiling withdraws it".
- `src/arena/duel.ts`:

```ts
/**
 * The arena's assist: none. A bout's recipe may name another (`DuelRecipe.assist`), which both
 * sides get. What each ceiling does to how bouts end: `docs/reference/assist.md`.
 */
export const ASSIST: AssistCeiling = NO_ASSIST;
```

  `DuelRecipe.assist?: AssistCeiling`; each side's `createBody` is given
  `assist: this.recipe.assist ?? ASSIST`; and `judge`, on the step it sets the verdict, calls
  `body.assist.withdraw()` on both sides: a body that is down still has a stance that asks, and
  an assist that answered it would throw the body about.
- `src/arena/matchup.ts`: `ASSIST_PARAM = "assist"`, `readAssist(search): AssistCeiling | undefined`
  (two numbers, each finite and not negative, else undefined). `src/arena/main.ts` puts it in the
  recipe, and while a bout has one the clock's cell ends ` · assisted`.
- `research/bout.mjs`: the row gains
  `assist: SIDES.map((side) => meanOf(duel.duelists[side].body.assist.meter))`, each `[N, N m]`.

## Chunk C: the sweep

`research/assist-sweep.mjs`:
`node research/assist-sweep.mjs [--cells "0,0;0.1,0.03;0.25,0.065;0.5,0.13;1,0.26;1,0.52;2,1.03;0,0.26;1,0"] [--gaps 3,3.2,3.4,3.6,3.8,4,4.2,4.4,4.6,4.8,5] [--workers 14]`.
Each cell is a ceiling (force in weights, moment in weight-metres: 0.065 is 50 N m on the
Warrior); its bouts are every matchup at every gap, 99 by default, through `bout-worker.mjs`.
For each cell it prints the bouts by ending, the bout time, **falls a minute of bout time**,
wounding blows a minute, the share of bouts at the cap, and the mean assist given; then the same
by model. Each worker writes nothing: rows come back as messages, so no two share a file.

`docs/reference/assist.md`: the harness line, the commit, `assist-need.mjs`'s table, the pull
(read by the test below), and the sweep's table. It says of each cell how many bouts it is, and
that a difference between two cells under about 0.3 falls a minute is not read at 99 bouts.

## Tests

`tests/core-assist.test.mjs`. Node stand, Rapier, 120 Hz; the Warrior, unarmed.

1. `the_assist_gives_what_a_mind_asks_up_to_its_ceiling_and_nothing_at_none`: in a bare world
   (`createWorld(scene, await freshEngine())`: gravity, no ground), limp, under `embody` with a
   mind that asks every step for a force of two weights straight up and a moment of 10
   weight-metres about up. A body's weight is its segments' rigid masses, what they hold
   included, times gravity.
   - Ceiling `{ force: 1, moment: 0.05 }`: after 0.5 s the centre of mass (the mass-weighted mean
     of the segments' centres) is within 0.01 m of where it began, since the assist's weight of
     force cancels gravity's; `given.force` is `[0, weight, 0]` within 1e-9 and `given.moment`'s
     size is `0.05 * weight`; `meter.steps` is 60 and `meter.force / 60` is the weight.
   - Ceiling none (the default): `own.assist.on` is false, the meter stays at zero, and the
     centre of mass has fallen 1.23 m, within 0.02 (half of g over 0.5 s squared).
   - An ask of `NaN` gives nothing, and the body falls as with none.
   - Withdrawn after 0.25 s: it falls from there, and the meter stops at 30 steps.
2. `a_pull_the_soles_cannot_hold_fells_a_body_and_the_assist_holds_it`: on the ground, under
   `createBody` and `driveBy(body, { name: "stand", decide: () => standIntent(0) })`. One second
   to settle; then for 2 s the test applies, before each step, an impulse of a tenth of the
   body's weight times the step, along +z, at the root's centre of mass; then 2 s more.
   - No assist: it falls (`report.fallen`, its centre of mass under 0.5 m at its lowest; the
     prototype read 0.18), travels more than 1 m (1.44) and takes five recovery steps or more
     (11). `view.stance.shortfall` is above 0.05 weights at some step: the fixture reaches the
     path.
   - `assist: { force: 0.25, moment: 0.065 }`: it does not fall, its centre of mass travels under
     0.15 m (0.05), it takes no recovery step, and its meter's means are above zero and under
     10 N and 10 N m (2.0 and 1.9).
3. `the_stance_asks_the_assist_for_what_the_soles_miss_and_no_more`: test 2's assisted body, with
   a ceiling small enough to bind (`{ force: 0.002, moment: 0.002 }`). At every step
   `assist.given.force` is `shortfall.force` shortened to the ceiling (the same direction, the
   lesser size, within 1e-9), likewise the moment; at some step each is at its ceiling, and at
   some step under it.

`tests/arena-core.test.mjs`:

```js
test("a_bout's_assist_is_its_recipe's_the_same_for_both_sides_and_none_unless_given", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const plain = await playBout(recipe, 10), none = await playBout({ ...recipe, assist: { force: 0, moment: 0 } }, 10);
  assert.equal(none.digest, plain.digest);
  assert.deepEqual(plain.assist, [[0, 0], [0, 0]]);
  const helped = await playBout({ ...recipe, assist: { force: 0.25, moment: 0.065 } }, 10);
  assert.notEqual(helped.digest, plain.digest);
  for (const [force, moment] of helped.assist) assert.ok(force > 0 && moment > 0, `each side is given some: ${force}, ${moment}`);
  // One ceiling for both, in each body's own weight.
  const { world, dispose } = await arena();
  const duel = new Duel(world, { ...recipe, assist: { force: 0.25, moment: 0.065 } });
  try {
    const weight = (duelist) => [...duelist.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0) * 9.80665;
    for (const duelist of Object.values(duel.duelists)) {
      assert.ok(Math.abs(duelist.body.assist.most.force / weight(duelist) - 0.25) < 1e-9);
      assert.ok(duelist.body.assist.on);
    }
    duel.run();
    for (const duelist of Object.values(duel.duelists)) assert.equal(duelist.body.assist.on, false, "withdrawn at the verdict");
  } finally { duel.dispose(); dispose(); }
});
```

## Mutations, each must go red

- `apply` gives the ask unclipped: test 1 (the body rises), test 3.
- `apply` gives the impulse at the root's node, not its centre of mass: test 1's body turns, and
  its centre of mass still holds, so check `given` by hand once; the pull's table moves.
- `embody` applies the assist before the mind's step: test 1's first step gives nothing
  (`meter.force` reads one weight short), and test 3 lags a step.
- `carry` does not add `helped` to `missed` (the assist is given, the root is not asked for
  it): test 2's assisted body takes recovery steps.
- `bear` does not take `helped` from the ground's wrench (the soles and the assist both give
  it): test 2's assisted travel.
- `stanceControl` ignores `assist.on`: the arena test's first bar, and `bout-trace.mjs`'s digest.
- `Duel` gives the ceiling to one side: the arena test's loop.
- `judge` does not withdraw: the arena test's last bar.
- `clip` passes a `NaN`: test 1's third case.

## Documents

- `AGENTS.md`: "An assist is not anatomy", as in
  [the design](2026-09-30-minds-00-design.md#the-rules-this-changes).
- `docs/architecture.md`: the mind seam's effectors are the muscles and the assist; the stance
  section says what it asks the assist for; "Rules and wounds" says a bout's ceiling is its
  recipe's and none by default.
- `docs/roadmap.md`, "Body and motor control", under "Walking", after the next step: "The assist
  supplies the moment the soles miss, as a cheat with a ceiling (`docs/reference/assist.md`)."
  The line on the stance's ask past a fall is there already.

## Verification

```powershell
npm test
npm run check
npm run build
node research/bout-trace.mjs                       # the digest of the plan before: the arena's ceiling is none
node research/assist-need.mjs --workers 14
node research/assist-sweep.mjs --workers 14        # 891 bouts; the long cells run to the cap
npm run preview -- --port 5181                     # then kill it by the PID that holds the port
```

- Read the sweep against the prototype's table: falls a minute at none near 3.3, and at
  `0.25,0.065` under 1. If the landed code does not show that drop, the stance is not asking the
  assist what the prototype asked: find that before anything is tuned.
- In the browser, with the tab visible:
  `?play=arena&matchup=workshop-fighter,workshop-fighter&assist=0.25,0.065` runs past 8 s, where
  the same bout with no assist ends by a fall before any blow.

**Eye gate: the owner watches assisted bouts**, at `&assist=0.25,0.065` and `&assist=1,0.26`,
against none: whether bodies that are helped still read as bodies standing on their own feet. The
arena's ceiling (`ASSIST`) stays none until the owner turns it.
