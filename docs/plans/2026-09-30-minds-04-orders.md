# Minds 04: orders

## Goal

A person fights a side of an arena bout: WASD walks, the pointer faces, the left button attacks
where it points. What the person gives is `Orders` (walk this way, face that way, attack that
point), the same three things the arena's AI makes for itself (`seekFoe`) and the crypt's run
makes for its fighters, so one set of tactics (`fighterTactics`) carries out all three. The page
turns the camera's view into world directions before the orders are made; nothing of the camera
reaches a mind.

Every order is recorded with the step it was given at (`Duel.tape`), so a bout a person fought is
its recipe and its tape, and plays again to the bit.

A bout nobody takes a side in is unchanged: its digests are the ones under "With senses" in
`docs/reference/bouts.md`.

## What walking while facing costs

Today a body walks forward and turns to its walk. Under orders it walks one way and faces
another, which the stance's envelope did not measure. Prototype, on today's tactics seam (Node
stand, Rapier, 120 Hz; each arena body with the club in its right hand; 8 s walks at eight world
bearings 45 degrees apart, the body starting facing +z; falls of 8):

| Pace | Facing | Warrior | Rogue | Skeleton |
|---|---|---|---|---|
| the fastest walk | the walk (today) | 0 | 0 | 0 |
| the fastest walk | ahead: no turn | 3 | 1 | 0 |
| the fastest walk | a quarter turn | 5 | 1 | 0 |
| the fastest walk | a half turn | 6 | 7 | 0 |
| 0.7 of it | ahead / a quarter / a half | 0 / 0 / 4 | 0 / 0 / 5 | |
| 0.5 of it | ahead / a quarter / a half | 0 / 0 / 1 | 0 / 0 / 1 | |
| 0.4 of it | ahead / a quarter / a half | 0 / 1 / 0 | 0 / 0 / 0 | |
| 0.3 of it | ahead / a quarter / a half | 0 / 0 / 0 | 0 / 0 / 1 | |
| the rule below | ahead / a quarter / a half | 0 / 0 / 1 | 0 / 0 / 2 | 0 / 0 / 0 |

The fastest walks are 0.7, 0.5 and 0.2 m/s, measured unarmed and walking forward
(`assets/core/stance-envelope.json`). So: across its heading or backward a clubbed body holds
half its fastest walk and not all of it, below half nothing more is gained, and what still drops
a body is a half turn made while it walks.

**The rule** (`STRAFE`): a body ordered to face where it is not walking walks at half its fastest
walk until it has turned to within 0.3 rad of that facing, and from then at half plus the other
half times the cosine of the angle between its heading and its walk, so straight ahead is the
whole walk and across or backward is half. Under it the Warrior covered 1.8 to 3.7 m in 8 s and
the Rogue 1.3 to 3.0 m. Three of 72 walks fell, all on a half turn; whether the assist
([plan 05](2026-09-30-minds-05-assist.md)) holds those has not been measured, and turning on the
spot is not in this set.

## Files

| File | Change |
|---|---|
| `src/core/mind/orders.ts` | New: `Orders`, `Heading`, `STAND_ORDERS`, `sameOrders`. |
| `src/core/mind/fighter.ts` | `FighterPlan` goes; `fighterTactics` carries out `Orders`; `STRAFE`; `seekFoe` returns `Orders`. |
| `src/arena/duel.ts` | `Duel.order`, `Duel.tape`, `Duel.steps`, `Duel.play`. |
| `src/arena/orders-input.ts` | New: keys and a pointer ray to orders, with no DOM in it. |
| `src/arena/matchup.ts` | `YOU_PARAM`, `readYou`, `youSearch`. |
| `src/arena/main.ts`, `index.html` | "You fight as"; the keys and the pointer; the help. |
| `src/dungeon/run.ts` | Its plan is `Orders`; it faces only while it stands, as today. |
| `research/bout.mjs` | `playBout(recipe, seconds, tape)`; the row carries the tape. |
| `research/orders-walk.mjs` | New: the table above, through `fighterTactics`. |
| `docs/reference/orders.md` | New: that table, with its harness. |
| `tests/core-orders.test.mjs` | New: three tests. |
| `tests/arena-core.test.mjs` | Three tests. |
| `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md`, `README.md` | Orders; how to play a side. |

## `src/core/mind/orders.ts`

```ts
import type { Vec3 } from "../spec/quantity.ts";

/** A direction on the ground, world. */
export interface Heading { readonly x: number; readonly z: number }

/**
 * **What a body is told to do**, by a person, a team's plan or its own tactics: plain data, in
 * the world's frame, naming no joint, pace or camera. Tactics that take orders carry them out
 * (`fighterTactics`); the body defends itself meanwhile.
 */
export interface Orders {
  /** Walk this way (its length is not read), at the body's own pace. Null stands. */
  readonly move: Heading | null;
  /** Face this way (its length is not read past 0.08). Null faces the walk, or, standing, as it stands. */
  readonly face: Heading | null;
  /** Attack this point, world, with what the right hand holds; the walk waits. Null guards. */
  readonly attack: Vec3 | null;
}

export const STAND_ORDERS: Orders = Object.freeze({ move: null, face: null, attack: null });

/** Whether two orders, or two absences of them, say the same thing. */
export const sameOrders = (a: Orders | null, b: Orders | null): boolean => JSON.stringify(a) === JSON.stringify(b);
```

## `src/core/mind/fighter.ts`

`FighterPlan` and `Heading` leave this file (`Heading` is imported from `orders.ts` wherever it
was imported from here).
`fighterTactics(name, orders: (sight: Sight) => Orders, strafe: typeof STRAFE = STRAFE)` reads
`{ move, face, attack }`; the attack branch is unchanged, and the code below reads `strafe`, the
argument, where it shows `STRAFE` (an experiment passes another; nothing sets the constant). The
rest:

```ts
/**
 * Walking one way while facing another (`fighterTactics`): the share of the fastest walk held
 * across the heading or backward, and how near its facing a body must have turned, rad, before
 * it walks any faster. Measured with the club in hand: `docs/reference/orders.md`.
 */
export const STRAFE = { share: 0.5, turned: 0.3 } as const;

const wrap = (a: number): number => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));
```

```ts
      aim = null;
      const hands = { left: GUARD_ACTION, right: GUARD_ACTION };
      const facing = face && Math.hypot(face.x, face.z) > 0.08 ? Math.atan2(face.x, face.z) : null;
      if (!move || !envelope) return { move: null, face: facing ?? report.heading, hands };
      const bearing = Math.atan2(move.x, move.z), walk = envelope.walk.value;
      // Facing its walk: the walk the envelope measured, forward, turning to it.
      if (facing === null) return { move: [walk, 0], face: bearing, hands };
      // Facing elsewhere: the walk's direction in the heading's frame, at the pace that holds.
      const off = bearing - report.heading;
      const share = Math.abs(wrap(facing - report.heading)) < strafe.turned
        ? strafe.share + (1 - strafe.share) * Math.max(0, Math.cos(off)) : strafe.share;
      return { move: [walk * share * Math.cos(off), walk * share * Math.sin(off)], face: facing, hands };
```

`report.heading` is the heading the stance is asked to face, which the walk turns toward
`Intent.face` at the rate the envelope holds (`locomotion`); the stance turns only while it
walks, so a standing body ordered to face does not turn.

`seekFoe` returns `Orders`: walking, `{ move: toward, face: null, attack: null }` (it faces its
walk, as today, so its bouts do not change); standing or attacking, `face: toward` where it
returned `look: toward`.

## `src/arena/duel.ts`

```ts
/** An order given: before which of the bout's steps, to which side, and what. Null hands the side back to itself. */
export interface OrdersEntry {
  readonly step: number;
  readonly side: Side;
  readonly orders: Orders | null;
}
```

```ts
  /** What each side is ordered; null leaves it to its own tactics (`seekFoe`). */
  private readonly given: Record<Side, Orders | null> = { left: null, right: null };
  /** Every order given, in the order given: with the recipe, the whole of what made this bout. */
  readonly tape: OrdersEntry[] = [];
  private readonly startStep: number;

  /** Steps the bout has taken. */
  get steps(): number { return this.world.steps - this.startStep; }

  /** Order `side` from its next step on, or with null hand it back to itself. An order that repeats the last is not recorded. */
  order(side: Side, orders: Orders | null): void {
    if (sameOrders(this.given[side], orders)) return;
    this.given[side] = orders;
    this.tape.push({ step: this.steps, side, orders });
  }

  /** Orders still to give (`play`), in the order of their steps. */
  private readonly queued: OrdersEntry[] = [];

  /**
   * Give `tape`'s orders as the bout steps, each before the step it was given before, in place
   * of any tape still queued: with the bout's recipe, the same bout again, whoever steps the world.
   */
  play(tape: readonly OrdersEntry[]): void { this.queued.splice(0, this.queued.length, ...tape); }
```

and in the constructor, after the senses are made (so it runs after them in the step's sensing
phase, and before every mind):

```ts
    this.feeding = world.sense(() => {
      while (this.queued.length > 0 && this.queued[0]!.step <= this.steps) {
        const { side, orders } = this.queued.shift()!;
        this.order(side, orders);
      }
    });
```

`feeding` is removed in `dispose` with `judging`. `run` is unchanged: a page that advances the
world by real time plays a tape as a test's `run` does.

Each side's tactics:

```ts
      const skills = driveBy(body, fighterTactics(`arena ${side}`, (sight) => {
        const orders = this.given[side];
        // Out of the fight it stands, as a side nobody orders does.
        return orders && !sight.view.senses.out ? orders : seekFoe(sight);
      }));
```

A side under orders does only what it is ordered: it does not attack unasked. Its hands guard
whenever it is not attacking.

## `src/arena/orders-input.ts`

```ts
import type { Heading, Orders } from "../core/mind/orders.ts";
import type { Vec3 } from "../core/spec/quantity.ts";

export interface MoveKeys { readonly up: boolean; readonly down: boolean; readonly left: boolean; readonly right: boolean }

/**
 * The world direction the keys ask for under a camera looking along bearing `azimuth` (`orbit.ts`):
 * up the screen is the camera's bearing, (sin, cos), and right is (cos, -sin). Null when no key is
 * down or opposed keys cancel.
 */
export function keysToMove(keys: MoveKeys, azimuth: number): Heading | null {
  const up = Number(keys.up) - Number(keys.down), right = Number(keys.right) - Number(keys.left);
  if (up === 0 && right === 0) return null;
  const n = Math.hypot(up, right), s = Math.sin(azimuth), c = Math.cos(azimuth);
  return { x: (up * s + right * c) / n, z: (up * c - right * s) / n };
}

/**
 * Where a ray from `origin` along `direction` crosses the level plane at `height`, or null if it
 * never comes down to it. The plane is at the ordered body's centre of mass, not the ground: a
 * pointer over a body's chest, read on the ground, lands metres behind it.
 */
export function aimPoint(origin: Vec3, direction: Vec3, height: number): Vec3 | null {
  const t = (height - origin[1]) / direction[1];
  return direction[1] < 0 && t > 0 ? [origin[0] + t * direction[0], height, origin[2] + t * direction[2]] : null;
}

/** A person's orders for a body whose centre of mass is over `at`: walk the keys' way, face the point, and attack it while the button is down. */
export function personOrders(move: Heading | null, point: Vec3 | null, attacking: boolean, at: { readonly x: number; readonly z: number }): Orders {
  return {
    move,
    face: point ? { x: point[0] - at.x, z: point[2] - at.z } : null,
    attack: attacking && point ? point : null,
  };
}
```

## The page

`src/arena/matchup.ts`: `YOU_PARAM = "you"`; `readYou(search): Side | null` (`left`, `right`, or
null for anything else); `youSearch(search, you)` sets or deletes the parameter. A link
`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left` opens the bout with the person on
the left.

`index.html`, in the arena template's `#curtain` after `#matchup`: a field `You fight as` with
`<select id="you">` (`nobody`, `left`, `right`). The help's lede says a side is fought by its own
tactics unless you take it, and its list gains:

```html
            <dt>W A S D, or the arrows</dt><dd>walk, as the camera sees it</dd>
            <dt>Pointer</dt><dd>where your fighter faces while it walks</dd>
            <dt>Left button</dt><dd>attack where you point; hold to keep attacking</dd>
```

`src/arena/main.ts`:

- `import "@babylonjs/core/Culling/ray.js";` for `scene.createPickingRay` (a side-effect import:
  without it the build compiles and the ray is missing at runtime).
- State: `you: Side | null` (from `readYou`, the select, and written back with `youSearch` in
  `begin`), `keys` (a mutable `MoveKeys`), `pointer: { x, y } | null` in canvas pixels,
  `attacking: boolean`.
- Keys: in the window's `keydown` and a new `keyup`, `w`/`ArrowUp`, `s`/`ArrowDown`,
  `a`/`ArrowLeft`, `d`/`ArrowRight` (either case) set the four flags, with `preventDefault` on
  the arrows; `blur` clears all four and `attacking`. `r` still replays.
- Pointer: on the canvas, `pointerdown`, `pointermove` and `pointerup` set
  `pointer = { x: event.offsetX, y: event.offsetY }` and `attacking = (event.buttons & 1) !== 0`
  (a level, since a release is not guaranteed); `pointerleave` sets `pointer = null` and
  `attacking = false`. The orbit stays on the middle and right buttons (`event.buttons & 6`).
- Each frame, before `world.advance`, while a bout is on, not paused and has no verdict:

```ts
    if (you) {
      const centre = duel.duelists[you].body.view.stance.centre;
      const ray = pointer ? scene.createPickingRay(pointer.x, pointer.y, null, camera) : null;
      const point = ray ? aimPoint(ray.origin.asArray(), ray.direction.asArray(), centre.y) : null;
      duel.order(you, personOrders(keysToMove(keys, azimuth), point, attacking, centre));
    }
```

  `azimuth` is the page's camera bearing: it goes into a world direction here and no further.
- The readout's label for the person's side ends `(you)`. Replay keeps `you`; Setup shows the
  select again.
- The page's comment loses "A person watches and gives no orders".

## `src/dungeon/run.ts`

`actor.plan` is `Orders` (`look` renamed `face`), and what the run hands its tactics faces only
while it stands, which is what `look` meant:

```ts
      const { move, face, attack } = actor.plan, head = attack?.fighter?.body.view.head;
      return actor.alive
        ? { move, face: move ? null : face, attack: head ? [head.x, head.y, head.z] : null }
        : { move: null, face, attack: null };
```

`actor.plan.attack` stays the run's own `DungeonActor`; only what is handed over is `Orders`.
The crypt's hero walking one way and facing another is not in this set.

## `research/bout.mjs`, `research/orders-walk.mjs`

`playBout(recipe, seconds = Infinity, tape = [])` calls `duel.play(tape)` before its loop, and
its row gains `tape: duel.tape`.

`research/orders-walk.mjs`: `node research/orders-walk.mjs [--seconds 8] [--workers 14]`. One
trial is one body on the stand (`coreStand(armed(modelSpec(model), "right", woodenClub()))`),
under `driveBy(body, fighterTactics("orders", () => orders))`, for `--seconds`; it reports whether
it fell and when, how far it went along the bearing ordered and across it, and how far its
pelvis's forward axis ended from the facing ordered, rad. Trials: each of `BODY_MODELS`, eight
bearings, and four facings (`face: null`; a far point ahead, to the right, and behind, each given
as the direction to it from where the body stands). It prints the harness, a row per model and
facing (falls of 8, least and most distance, worst facing error), and with `--shares 1,0.7,0.5`
the same with `{ ...STRAFE, share }` as `fighterTactics`' third argument.

## Tests

`tests/core-orders.test.mjs`.

1. `tactics_turn_orders_into_an_intent` (no world). A sight is
   `{ report: { heading, strike: { thrown: { right: 0 } } }, envelope: { walk: { value: 0.7 } } }`.
   Intents compared whole, numbers within 1e-12:
   - heading 0, `{ move: { x: 0, z: 1 }, face: null }`: `move [0.7, 0]`, `face 0`;
   - heading 0, `{ move: { x: 1, z: 0 }, face: null }`: `move [0.7, 0]`, `face` a quarter turn;
   - heading 0, walking +x facing +z: `move [0, 0.35]`, `face 0`;
   - heading 0, walking +z facing +z: `move [0.7, 0]`;
   - heading 0, walking -z facing +z: `move [-0.35, 0]`;
   - heading 0, walking +z facing -z (not yet turned): `move [0.35, 0]`, `face` a half turn;
   - heading 0.2, walking +z facing +x (not yet turned): the pace is 0.35;
   - standing, facing +x: `move null`, `face` a quarter turn; standing, `face: null`: `face` is
     the heading;
   - `attack: [1, 1.6, 0]`: the right hand attacks that point and `move` is null;
   - no envelope: it stands.
2. `a_body_walks_one_way_while_it_faces_another` (Node stand, Rapier, 120 Hz; the Warrior, club
   in the right hand, 8 s): ordered to walk +x facing +z, it has not fallen, has gone between 1.6
   and 2.5 m along x (the prototype read 2.07) and under 0.3 m along z (0.04), and its heading
   asked is within 0.01 rad of 0. The control, the same walk with `face: null`: it goes beyond
   2.6 m (3.10) and its heading asked is within 0.02 rad of a quarter turn.
3. `sameOrders` tells apart null, standing orders, and orders that differ in one number.

`tests/arena-core.test.mjs`:

```js
test("a_side_under_orders_does_what_it_is_told_and_the_other_fights_on", async () => {
  const { world, dispose } = await arena();
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
  try {
    const { left, right } = duel.duelists, x = (duelist) => duelist.body.view.stance.centre.x;
    const start = x(left), there = x(right);
    duel.order("left", STAND_ORDERS);
    duel.run(4);
    // Read on today's bout with the left held so: it moved 0.005 m, and the right came 1.0 m nearer.
    assert.ok(Math.abs(x(left) - start) < 0.05, `ordered to stand, it stands: ${start} to ${x(left)}`);
    assert.ok(x(right) < there - 0.6, "while the other side walks at it");
    assert.equal(left.skills.report.strike.thrown.right, 0, "and it throws nothing unasked");
    assert.deepEqual(duel.tape, [{ step: 0, side: "left", orders: STAND_ORDERS }]);
    duel.order("left", { move: null, face: null, attack: null });
    assert.equal(duel.tape.length, 1, "an order repeated is not recorded again");
    duel.order("left", null);
    assert.deepEqual(duel.tape[1], { step: 480, side: "left", orders: null });
    const held = x(left);
    duel.run(3);
    // 0.49 m in those 3 s on today's bout: it steps back before it sets off.
    assert.ok(x(left) > held + 0.3, `handed back, it walks at the other side: ${held} to ${x(left)}`);
  } finally { duel.dispose(); dispose(); }
});

test("a_bout_plays_again_from_its_recipe_and_its_tape", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const back = { move: { x: -1, z: 0 }, face: null, attack: null };
  const tape = [{ step: 60, side: "left", orders: back }, { step: 300, side: "left", orders: null },
    { step: 420, side: "right", orders: { move: null, face: { x: -1, z: 0 }, attack: null } }];
  const first = await playBout(recipe, 8, tape), second = await playBout(recipe, 8, first.tape);
  assert.deepEqual(first.tape, tape);
  assert.deepEqual(second, first);
  // The controls: no tape, and the same orders a step later, are other bouts.
  assert.notEqual((await playBout(recipe, 8)).digest, first.digest);
  const late = tape.map((entry, i) => i === 0 ? { ...entry, step: 61 } : entry);
  assert.notEqual((await playBout(recipe, 8, late)).digest, first.digest);
});

test("keys_and_a_pointer_make_orders_in_the_world's_frame", () => {
  const near = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-12, `${JSON.stringify(a)} is ${JSON.stringify(b)}`);
  const keys = (names) => ({ up: names.includes("up"), down: names.includes("down"), left: names.includes("left"), right: names.includes("right") });
  // The camera looking along +z: up the screen is +z, right is +x.
  near(keysToMove(keys(["up"]), 0), { x: 0, z: 1 });
  near(keysToMove(keys(["right"]), 0), { x: 1, z: 0 });
  near(keysToMove(keys(["up", "right"]), 0), { x: Math.SQRT1_2, z: Math.SQRT1_2 });
  // Turned a quarter to the right, looking along +x: up is +x, right is -z.
  near(keysToMove(keys(["up"]), Math.PI / 2), { x: 1, z: 0 });
  near(keysToMove(keys(["right"]), Math.PI / 2), { x: 0, z: -1 });
  assert.equal(keysToMove(keys([]), 0), null);
  assert.equal(keysToMove(keys(["up", "down"]), 0), null);
  // The arena's camera at rest, over a point at chest height.
  assert.deepEqual(aimPoint([0, 5, -4], [0, -0.8, 0.6], 1), [0, 1, -1]);
  assert.equal(aimPoint([0, 5, -4], [0, 0.1, 1], 1), null, "a ray going up meets no plane below it");
  assert.deepEqual(personOrders({ x: 1, z: 0 }, [2, 1, 3], false, { x: 1, z: 1 }), { move: { x: 1, z: 0 }, face: { x: 1, z: 2 }, attack: null });
  assert.deepEqual(personOrders(null, [2, 1, 3], true, { x: 1, z: 1 }).attack, [2, 1, 3]);
  assert.deepEqual(personOrders(null, null, true, { x: 1, z: 1 }), { move: null, face: null, attack: null });
});
```

## Mutations, each must go red

- `fighterTactics` ignores `face` while walking (returns `[walk, 0]`, `face: bearing`): test 1's
  third case, and test 2's heading.
- It walks the whole pace whatever it faces (`share = 1`): test 1, and test 2's distance (and,
  some runs, its fall).
- It swaps forward and right (`[sin, cos]`): test 1's third case, and test 2 (it walks along z).
- `Duel` reads `seekFoe` whatever was ordered: the arena's first test.
- `Duel.order` records every call: the tape's length.
- `Duel.play`'s hook gives a taped order after the step it names (`<` for `<=`): the replay's
  digest, and the tape the replay records.
- The hook is a `beforeStep` hook, added after the bodies (the minds step first, and a taped
  order lands a step late): the same.
- `keysToMove` uses the dungeon's fixed camera in place of `azimuth`: the turned-camera cases.
- `aimPoint` reads the ground (`height` 0): its first case.

## Documents

- `AGENTS.md`: nothing new; the rule already says a person gives orders (`Orders`).
- `docs/architecture.md`: "Minds" gains orders and the tape; the standing decision "A person
  never commands muscles" names `Orders` as what a person's input is; the arena's screen says a
  person may take a side.
- `docs/roadmap.md`: "Orders a person can give a side" goes from The Arena; "turning on the
  spot" stays under Body and motor control, with one line: a standing body under orders does not
  turn to the pointer.
- `README.md`: how to take a side, and the controls.
- `docs/reference/orders.md`: `orders-walk.mjs`'s table and its harness line; `STRAFE`'s two
  numbers cite it.

## Verification

```powershell
npm test
npm run check
npm run build
node research/bout-trace.mjs                                   # 3ab8855dc81d4dfa: nobody was ordered
node research/orders-walk.mjs --workers 14 --shares 1,0.7,0.5,0.4,0.3  # into docs/reference/orders.md
npm run preview -- --port 5181                                 # then kill it by the PID that holds the port
```

- `orders-walk.mjs`, read against the table above: at the rule's share no body falls facing
  ahead or a quarter turn, and no more than 3 of 24 on the half turn. If more fall, lower
  `STRAFE.share` to the largest share of the sweep that meets that bar, and say so in the record.
- In the browser, at `?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`, with the tab
  visible: the left body walks with W A S D as the camera sees it, and after orbiting a quarter
  turn the same keys walk the new screen directions; it faces the pointer while it walks; the left
  button throws the club at the point; middle drag still orbits; the other side fights on.

**Eye gate: the owner fights a bout**, and says whether the body does what the hands ask. Two
things the owner will meet: standing still, the body does not turn to the pointer (a choice in
[the design](2026-09-30-minds-00-design.md#the-owners-choices)); and across or backward it walks
at half pace (a dial, `STRAFE`).
