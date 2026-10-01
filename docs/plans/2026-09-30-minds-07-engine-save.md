# Minds 07: the engine saves and loads

## Goal

`PhysicsWorld.save()` gives a world's whole physical state as bytes, and `load(bytes)` puts the
world back there, in place: every body, joint and fixed collider the core holds keeps working,
and the world goes on from the load exactly as it went on from the save.

This is the physics half of a fork. The other half, every controller's memory, is
[plan 08](2026-09-30-minds-08-fork.md); this plan touches one module and its contract, and can
land at any time.

## What was measured

Node 24.19, Rapier 0.21 (simd-compat), 120 Hz, on a copy of `src/core/engine/rapier.ts` changed
as below.

- **A restored world continues to the bit.** Two limp clubbed humans dropped into each other (32
  bodies, 30 joints, 37 colliders, 421 body-to-body contacts with an impulse in the first 90
  steps): restored from a snapshot at step 90, all 416 pose and velocity values match the
  original after 1, 10, 60 and 360 steps; a snapshot of a restored world does too. Control: an
  impulse of 1e-4 N s on one body changes 70 of 96 coordinates after one step.
- **It is cheap**: 329 kB, 0.48 ms to take, 1.4 ms to restore, for that world. The timestep and
  the solver's iteration counts survive it.
- **A load under a driven bout is transparent.** The fighter-rogue bout at step 1200, loaded with
  its own bytes in place, or with the bytes of another world built from the same recipe and run
  to the same step: no step of the next 600 differs from a bout run straight through.
- **The last step's contacts survive.** A box resting on another, saved at step 60, knocked off,
  and loaded: `contactsOf` reads the same other body, impulse, point and normal as at the save,
  before any step is taken.

## Files

| File | Change |
|---|---|
| `src/core/engine/engine.ts` | `PhysicsWorld.save`, `PhysicsWorld.load`. |
| `src/core/engine/rapier.ts` | Both; its handles to Rapier's world, bodies and joints rebind on a load. |
| `tests/core-engine.test.mjs` | Three tests. |
| `tests/core-body.test.mjs` | One test: a jointed, driven body through a load. |
| `docs/architecture.md` | The engine contract's paragraph gains the clause. |

## `src/core/engine/engine.ts`

In `PhysicsWorld`:

```ts
  /**
   * The world's whole physical state as the last step left it: every body's pose and velocity,
   * every joint's motor, every contact. Opaque, the engine's own, and good only for `load` on a
   * world of this engine with the same bodies, joints and fixed colliders, made in the same order.
   */
  save(): Uint8Array;
  /**
   * Put the world where `bytes` (a `save`) left one, in place: every body, joint and fixed
   * collider it has stays the object it was, each node is written from its body, and the next
   * step is the step that followed the save. It throws, and changes nothing, if `bytes` is not a
   * save of a world with this one's bodies, joints and colliders. What the core set outside the
   * solver (`SegmentBody.massProperties`) is not in a save: a load between two worlds is between
   * two built from the same specs.
   */
  load(bytes: Uint8Array): void;
```

## `src/core/engine/rapier.ts`

Rapier restores a snapshot as a new `World`; every object the module holds from the old one (the
world, each rigid body, the joint set) is dead once the old world is freed, and handles are what
carry over. So the module keeps handles, and looks its objects up again on a load.

In `createRapierPhysics`:

```ts
  let raw = new R.World({ x: g[0], y: g[1], z: g[2] });
  /** What each body and joint does to find its engine object again in a world just loaded. */
  const rebinds: (() => void)[] = [];
```

`fixed` keeps its collider's handle, not the collider:

```ts
    const handle = raw.createCollider(contact(desc)).handle;
    let gone = false;
    return { dispose() { if (gone || freed) return; gone = true; raw.removeCollider(raw.getCollider(handle), false); } };
```

The world's object:

```ts
    engine: "rapier", rapier: R, get raw() { return raw; }, gravity: g,
    save() { return raw.takeSnapshot(); },
    load(bytes) {
      const next = R.World.restoreSnapshot(bytes);
      if (!next) throw new Error("these bytes are not a Rapier world");
      if (next.bodies.len() !== raw.bodies.len() || next.impulseJoints.len() !== raw.impulseJoints.len()
        || next.colliders.len() !== raw.colliders.len()) {
        next.free();
        throw new Error("that save is of a world with other bodies, joints or colliders");
      }
      raw.free();
      raw = next;
      for (const rebind of rebinds) rebind();
      writeNodes();
    },
```

`writeNodes` is the loop `step` ends with today (each node's position and rotation from its
body), named and called by both. `RapierPhysics.raw` becomes a getter in the interface's comment
too: "the world as it is now; a load replaces it, so read it afresh".

`addBody`: `let rigid = …`, and after `setMass(mass)`:

```ts
      const handle = rigid.handle;
      rebinds.push(() => { rigid = raw.getRigidBody(handle); });
```

with `get rigid() { return rigid; }` in the body, `byHandle.set(handle, body)`, and `removeBody`
deleting by `handle`. A removed body's rebind stays in the list and finds nothing, which nothing
reads: `removeBody` is the end of that body.

`addJoint`: the joint set is the world's, so it rebinds, and the joint is found by its handle:

```ts
      const handle = joint.handle;
      let set = raw.impulseJoints.raw;
      rebinds.push(() => { set = raw.impulseJoints.raw; });
      …
      return {
        get raw() { return raw.getImpulseJoint(handle); },
        setMotor(k, speed, ceiling) { … },
      };
```

`contactsOf`, `step`, `removeBody` and `dispose` read `raw` and `body.rigid` as they do now; both
are current after a load.

Nothing else in `src/` may hold a Rapier object across a step: check
`grep -rn "\.raw\b" src tests research` once the change is in, and make every holder read
through the getter (`core-rapier-probe.mjs` holds joints by `raw`; it takes no load, so it
stands).

## Tests

`tests/core-engine.test.mjs`, on the file's `box` fixture (Node, a NullEngine scene, 120 Hz):

1. `a world loaded from a save goes on as it went on from the save`: a box on another
   (`add(b, "top", [0.03, 1.5 * SIDE, 0])`), 60 steps, `save`. Then 30 steps, keeping each step's
   positions, rotations and velocities of both boxes (`trail`). Then an impulse of `[3, 2, 0]` on
   the top box and 60 steps (the control: its x is now beyond 1 m). `load`: both nodes are where
   they were at the save, to the bit; 30 steps give `trail` again, `assert.deepEqual` on the
   numbers. A second `save` taken straight after the load equals the first, byte for byte.
2. `a loaded world keeps the last step's contacts, its fixed colliders and its bodies' identity`:
   the same fixture: `contactsOf(top)` after the load deep-equals what it read at the save, with
   `other` the same object (`b.body`); `b.floor.dispose()` after a load takes the ground out (the
   lower box falls, as the file's test of a ground taken out reads it); a body added before the save takes an impulse after the load
   (`applyImpulse`, then its speed is the impulse over its mass).
3. `a save of another world is refused, and the world it was offered to is untouched`: bytes
   from a world with one box offered to a world with two: `assert.throws`, and then the
   two-box world steps on as a twin of it that was never offered them does. `load(new
   Uint8Array(8))` throws the same way.

`tests/core-body.test.mjs`, one test on the whole path, since a box has no joint:

4. `a driven body goes on from a load as it went on from the save`: the Warrior on the stand
   under `createBody` and a walk forward at half its envelope's pace
   (`driveBy(body, { name: "walk", decide: ({ envelope }) => ({ ...standIntent(0), move: [0.5 * envelope.walk.value, 0] }) })`). The fixture is a twin: two stands built alike and stepped 240 steps, `a` and
   `b`, whose traces agree (`traceOf`). Then `b.world.physics.load(a.world.physics.save())` and
   both step 240 more: their traces agree to the bit. Its control: load into `b` a save `a`
   took 10 steps earlier, and the traces differ at the first step after. The joints' motors work
   after the load: a `setMotor` on a loaded world moves its joint (the traces would part if not,
   and the body would fall limp: `report.fallen` is false at the end).

   This is the engine's half alone: the two stands' controllers are at the same step because
   both ran to it. Loading under controllers at another step is plan 08.

## Mutations, each must go red

- `load` does not run the rebinds: tests 1 and 4 throw on the freed world (Rapier reads a dead
  pointer: an exception, or with luck a wrong number; either is red).
- `load` does not write the nodes: test 1's "where they were at the save".
- A body's rebind is missing (`rigid` stays the old world's): test 2's impulse.
- The joint set's rebind is missing: test 4.
- `fixed` keeps the collider object: test 2's ground.
- `load` frees the old world before it checks the new one: test 3's "untouched".
- `byHandle` is cleared on a load: test 2's contacts.

## Documents

- `docs/architecture.md`, where the engine's contract is described: "A world saves its whole
  physical state and loads it in place (`PhysicsWorld.save`, `load`); a body, joint or collider
  the core holds survives a load as the object it was."
- The module comment of `rapier.ts` gains: "A snapshot restores as a new world, so the module
  holds handles and finds its objects again on a load (`rebinds`)."

## Verification

```powershell
npm test
npm run check
npm run build
node research/bout-trace.mjs     # the digest of the plan before: getters changed nothing
```

`CORE_ENGINE` names one engine today (`ENGINES`, `src/core/engine/engines.ts`); an engine that
joins later meets `save` and `load` through the same tests.
