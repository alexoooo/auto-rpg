# Sword prototype

A browser experiment in physically-simulated melee, after *Die by the Sword* (1998).

There is no attack button. Your sword arm is three constrained bones and a weighted
blade, driven by a spring at the hand — you swing by moving your arm, and you cut by
driving the edge through something at speed. A blow that lands with the flat is a shove;
a blow that lands edge-on at pace takes a limb off.

It shares this repository with the auto-rpg game and nothing else: no source, runtime,
asset, or build dependency. See [AGENTS.md](AGENTS.md).

```powershell
npm install
npm run asset:fetch     # one-time: the CC0 environment map, ~1.5 MB
npm run dev             # http://localhost:5180
```

## Controls

The mouse belongs to the **arm**, not to the camera. That is the central control decision
and the reason this reads as Die by the Sword rather than as a third-person action game;
turning is on the keyboard precisely so the mouse can be spent entirely on the blade.

| Input | Does |
| --- | --- |
| Mouse | moves the sword arm |
| W / S | walk forward and back |
| A / D | turn |
| Q / E | strafe |
| Left button | thrust — extend the reach |
| Right button | pull the guard in close |
| Wheel | roll the wrist — turns the edge |
| Space | reset the dummy |
| Tab | toggle the readout |
| Esc | release the mouse |

## How it is built

**Babylon.js** for rendering and **Havok** for physics, both running natively in the
browser — no export step, and the solver is native-speed WebAssembly with TypeScript only
orchestrating it.

The hero is deliberately split in two. The torso is **keyframed**: it goes exactly where
you steer it, because a body that wobbles under the weight of its own arm is not fun to
walk around. Everything from the shoulder outward is **genuinely simulated** — a ball
joint at the shoulder, a hinge at the elbow, a rolling wrist, and an arming sword that
balances a hand's width ahead of its guard.

The arm is driven at the hand rather than joint by joint. Solving per-joint angles means
getting three constraint frames exactly right and tuning a dozen gains; one spring-damper
at the end effector, with the constrained bones following, gives the same anatomy from six
numbers — and it is what produces the lag, overshoot and carried momentum the whole design
rests on. The blade is aimed by torque, using two cross products instead of quaternion
algebra, which is immune to getting a handedness convention backwards.

Damage comes from the blade's own speed at the contact point multiplied by how squarely
that motion lines up with the edge — not from the impulse the solver reports. The solver
impulse is real but dominated by how the contact resolved (mass ratios, penetration depth,
substep luck), so tuning against it is tuning against noise. Speed times alignment is the
quantity a player can feel themselves controlling. The impulse is still shown in the
readout, because when the two disagree that is worth seeing.

The dummy is a jointed figure rather than a block, because the interesting question is not
whether a hit registers — it is whether a hit that lands badly reads differently from one
that lands well. Its joints hold a pose with weak motors, so it rocks, twists, and
eventually comes apart.

## Tuning

`src/config.ts` is the entire tuning surface and is deliberately mutable. The page exposes
`window.__sword`, so the loop is:

```js
__sword.config.arm.stiffness = 1600   // takes effect on the next frame
__sword.config.sword.mass = 1.9
```

Find the number in the console, then write it back into the file.

`src/scoring.ts` holds the balance rule — what counts as a cut, a thrust, or a clang —
kept pure and free of Babylon so it can be argued with in `tests/scoring.test.mjs`.

## Assets

The environment map is `kloofendal_43d_clear` from [Poly Haven](https://polyhaven.com),
CC0, fetched and digest-pinned by `scripts/fetch-polyhaven.mjs`. Image-based lighting is
what makes a steel blade read as steel rather than as a grey box; without it the scene
still runs, just flatter.

Everything else is currently procedural geometry — the figures are capsules and boxes.
That is the next piece of work, not a finished state.

## Status

Working: the arm, the blade, contact scoring, dismemberment, the readout, and a build that
runs at 60 fps with physics under a millisecond.

Not yet done: the characters are untextured blockout geometry, and no one has tuned the
feel against an actual person playing it. Every number in `src/config.ts` is a first
guess.
