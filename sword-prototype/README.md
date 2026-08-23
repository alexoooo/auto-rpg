# Sword prototype

A browser experiment in physically-simulated melee, after *Die by the Sword* (1998).

There is no attack button. Your sword arm is three constrained bones and a weighted
blade, driven by a spring at the hand — you swing by moving your arm, and you cut by
driving the edge through something at speed. A blow that lands with the flat is a shove;
a blow that lands edge-on at pace takes a limb off.

It shares this repository with the auto-rpg game and nothing else: no source, runtime,
asset, or build dependency. See [AGENTS.md](AGENTS.md).

## Running it

Requires **Node 22.13.0 or newer** (`node --version`). The root `.npmrc` sets
`engine-strict=true`, so an older Node makes `npm ci` refuse rather than warn.

Run these four in order, **from inside this directory**. Verified from a wiped
`node_modules` on 2026-08-22.

```powershell
cd <repo>\sword-prototype
npm ci
npm run asset:fetch
npm run dev
```

Then open <http://localhost:5180/> and click **Click to take the sword**.

What each one is for, and why it is that command and not a near neighbour:

| Command | Why |
| --- | --- |
| `cd <repo>\sword-prototype` | Not optional. npm walks *up* to find a project, so running from the repo root builds the auto-rpg client instead and never installs this directory's dependencies. |
| `npm ci` | Not `npm install`. `ci` deletes `node_modules` and installs exactly what `package-lock.json` pins, so two machines get byte-identical trees. `install` may quietly resolve something newer. |
| `npm run asset:fetch` | One-time, ~1.5 MB. Downloads the CC0 environment map, which is a binary and not authored here. Digest-pinned and idempotent: run it again and it just verifies. |
| `npm run dev` | Serves on port 5180, `strictPort`, so a port collision fails loudly instead of silently moving to 5181 and leaving you reading a stale server. |

To confirm the whole thing is sound without opening a browser:

```powershell
npm run check     # tsc, no emit
npm test          # the scoring rules
npm run build     # production bundle
```

## Troubleshooting

**`The following dependencies are imported but could not be resolved: @babylonjs/havok`**
`node_modules` is missing here, so Vite resolved itself from the repo root instead — and
the root project has no Havok. `node_modules` is per-machine and never syncs between
computers. Fix: `cd sword-prototype` then `npm ci`.

**`Port 5180 is already in use`**
An earlier dev server is still alive. Find and stop it rather than using another port,
or you will edit one server while reading another:

```powershell
netstat -ano | findstr ":5180"
taskkill /F /PID <the pid>
```

**Black screen, but the overlay updates**
Chrome does not paint WebGL in a hidden or unfocused tab. The DOM overlay keeps
compositing, so it looks exactly like a broken renderer. Bring the window to the front.
`document.visibilityState` in the console tells you which it is.

**`EBADENGINE` during install**
Node is older than 22.13.0.

## Controls

The mouse belongs to the **arm**, not to the camera. That is the central control decision
and the reason this reads as Die by the Sword rather than as a third-person action game;
turning is on the keyboard precisely so the mouse can be spent entirely on the blade.

The pointer is **not** captured. Where the cursor sits in the window is where the hand is
asked to be, so the middle of the window is always centre guard and the arm has a home you
can find again. An earlier version took a pointer lock and accumulated relative movement:
the arm drifted, centre was unrecoverable, and you could not get your mouse back.

| Input | Does |
| --- | --- |
| Mouse | moves the sword arm — the cursor is where the hand goes |
| W / S | walk forward and back |
| A / D | strafe |
| Q / E | turn |
| Z / X | roll the wrist — turns the edge into the cut |
| Left button | thrust — drive the point out |
| Right button | guard — pull the blade in close |
| L | arm a lock-on, then click an enemy; strafe to circle it, Q/E to break |
| Wheel | zoom |
| Space | reset the dummy |
| Tab | toggle the readout |
| Esc | pause |

Lock-on exists because the mouse is spent entirely on the blade. With no hand left over for
the camera, keeping an enemy in front of you while you circle it is otherwise impossible —
so the hero does it for you, and drops the lock the moment you touch the turn keys.

## How it is built

**Babylon.js** for rendering and **Havok** for physics, both running natively in the
browser — no export step, and the solver is native-speed WebAssembly with TypeScript only
orchestrating it.

The hero is deliberately split in two. The torso is **keyframed**: it goes exactly where
you steer it, because a body that wobbles under the weight of its own arm is not fun to
walk around. Everything from the shoulder outward is **genuinely simulated** — a ball
joint at the shoulder, a hinge at the elbow, a rolling wrist, and an arming sword that
balances a hand's width ahead of its guard.

The arm is driven by a single invisible keyframed **anchor**, joined to the hand by a
six-degree-of-freedom constraint whose motors have a finite force budget. Move the anchor
and the solver drags the hand after it; the forearm and upper arm follow because they are
constrained, and the sword follows because it is welded to the hand. The lag, overshoot and
carried momentum come from that force ceiling being finite — the motor simply cannot drag a
1.35 kg sword instantly — rather than from any tuned spring.

Physics runs on a **fixed 240 Hz timestep** with control sampled on the same clock rather
than the render clock. That is not an optimisation, it is the difference between a steady
weapon and one that shivers: a motorised joint stepped by the raw frame delta receives a
slightly different correction every frame, which reads as the blade trembling in the hand.

Nothing is animated, and **no force is applied from outside the solver**. That is not
stylistic. The first version ran a spring-damper on the hand with `applyForce` every frame
and shook itself to pieces: Babylon converts a force to an impulse using `getTimeStep()`
while the world steps by the real frame delta, so the effective gain flickered frame to
frame. It also torqued the sword toward an aim direction while the weld held the sword
rigid to the hand — a contradiction whose only available answer is vibration.

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

Motor ceilings and damping are set on native solver objects at construction, so editing
those particular numbers needs `__sword.hero.applyTuning()` to push them across:

```js
__sword.config.sword.swordAngularDamping = 5
__sword.hero.applyTuning()
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
