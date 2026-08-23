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
| Mouse | moves one arm — the cursor is where that hand goes |
| W / S | walk forward and back |
| A / D | strafe |
| Q / E | turn |
| Z / X | roll the wrist — turns the edge into the cut |
| Left button | thrust — drive the point out |
| Right button | guard — pull the blade in close |
| Middle button / L | arm a lock-on, then click an enemy; strafe to circle it, Q/E to break |
| F | the mouse changes hands — the one it leaves goes back to its policy |
| C | arm a takeover, then click either fighter — you drive that one and the one you leave picks its policy back up |
| Wheel | zoom |
| V | camera — Overhead behind the fighter, or Fixed on a world bearing |
| `[` / `]` | swing the Fixed camera round the arena, 45 degrees at a time |
| Space / Esc | pause, and start again |
| R | the same bout again — both fighters, from nothing; and the setup screen once one has been decided |
| Tab | toggle the readout |
| G | the rig — collision shapes, anchors, joints and contacts, with the costume off |

A bout is chosen before it is fought. The curtain carries a left corner and a right corner —
a unit, a policy, and whether that side is driven by a mind or by you — and the Fight button
starts what is on it. There is one of you, so taking a side gives the other one back to its
policy. Three policies ship: **idle** stands there and can be cut apart, **swinger** walks
in and cuts on a fixed cadence without ever looking at your guard, and **duelist** holds
measure, guards between exchanges, and commits when your point leaves the line. A bout ends
when a fighter loses its head or is beaten to nothing everywhere, or when the clock runs
out, and the banner names the winner and the blow that did it.

Losing your head is also the end of you as a body, and not only as a competitor. The torso
stops being steered and falls under its own weight, every joint drops to a fraction of its
strength so the thing crumples rather than toppling in one piece, and the mind is never
asked what it wants again. Until recently only the banner noticed, and a decapitated fighter
went on walking and swinging with a stump for a neck. Blood follows the same rule the damage
model does — a clean cut at pace sprays and a flat slap does not — and a limb that comes off
goes on bleeding as it falls.

## Two hands

Each hand takes a **sword**, a **shield** or **nothing**, chosen per corner before the
fight. Both are real arms — three bones, a shoulder cone, an elbow hinge, a free wrist and
a keyframed anchor dragging the whole thing about — so a shield is not a state a fighter is
in, it is a plank of limewood with a steel rim welded into a fist, and it blocks by being
in the way. The collision layers already said an enemy blade and this side's weapons may
touch; blocking needed a shape, not a rule.

A shield is the one thing a hand carries that is **not aimed**. A blade leaves the fist
along the arm; a shield is strapped across the forearm, so its face is square to the arm and
can point at the enemy whatever the arm is doing. It is also the one thing its owner's own
trunk can stop — it has a collision layer of its own for that, while a blade still passes
through its owner, which is a decision the layer table argues at length. Where a shield
faces is the wrist roll, and zero roll is square to the fighter's own front.

There is also a **club**, which takes both hands. It has no edge, so nothing about how you
hold it matters and everything about how fast it arrives does — you cannot place a blow
with a club, you can only arrive with one. It hits harder than a badly-aimed cut and less
hard than a placed one, and it will take a head off.

You have one mouse and a fighter has two arms, so **`F`** moves the cursor from one to the
other and the hand you leave goes back to the side's own policy. Splitting the cursor
instead — half the screen each, or a modifier held down — would have made both hands worse
to control in order to avoid making a choice. The hand you arrive at is seeded from the
pose it is actually in, exactly as a takeover is, because the cursor is absolute and a hand
taken over without seeding snaps to wherever the mouse happens to be at the full 850 N the
grip can pull.

Lock-on exists because the mouse is spent entirely on the blade. With no hand left over for
the camera, keeping an enemy in front of you while you circle it is otherwise impossible —
so the fighter does it for you, and drops the lock the moment you touch the turn keys.

Which body is yours is not settled at the curtain. `C` arms a takeover, both fighters light
up as candidates, and a click puts you in that one — either side, any number of times, mid
swing. It is a swap of which mind a fighter reads from and the physics never notices it,
because a person and a policy were always producing the same `Intent`. What it *does* cost
is continuity: the cursor is absolute, so a body taken without care snaps its arm to
wherever your mouse happens to be at the full 850 N the grip can pull. Both directions of a
handover are therefore seeded from the pose they find — the cursor does not move, its
meaning is rebased — and `__sword.takeover.last` reports how far the hand was actually
asked to jump on the frame it changed hands.

## How it is built

**Babylon.js** for rendering and **Havok** for physics, both running natively in the
browser — no export step, and the solver is native-speed WebAssembly with TypeScript only
orchestrating it.

A fighter is deliberately split in two, and there are two of them in the ring, of one kind.
The torso is **keyframed**: it goes exactly where you steer it, because a body that wobbles under the weight of its own arm is not fun to
walk around. Everything from the shoulder outward is **genuinely simulated** — a ball
joint at the shoulder, a hinge at the elbow, a rolling wrist, and whatever is welded into
the fist. Both arms are like that: two full chains, either of which can hold a sword, a
shield or nothing.

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

A fighter is a jointed figure rather than a block, because the interesting question is not
whether a hit registers — it is whether a hit that lands badly reads differently from one
that lands well. A head, a pelvis, a free arm and two legs hang off the driven torso on
motorised joints, so a struck body rocks, twists, and eventually comes apart. Both sides
are the same class: there is nothing in it that knows which one you are driving.

## Tuning

`src/config.ts` is the entire tuning surface and is deliberately mutable. The page exposes
`window.__sword`, so the loop is:

```js
__sword.config.arm.stiffness = 1600   // takes effect on the next frame
__sword.config.sword.mass = 1.9
```

Motor ceilings and damping are set on native solver objects at construction, so editing
those particular numbers needs `__sword.left.applyTuning()` to push them across:

```js
__sword.config.sword.swordAngularDamping = 5
__sword.left.applyTuning()
```

Find the number in the console, then write it back into the file.

`src/scoring.ts` holds the balance rule — what counts as a cut, a thrust, or a clang —
kept pure and free of Babylon so it can be argued with in `tests/scoring.test.mjs`.

## Assets

The environment map is `kloofendal_43d_clear` from [Poly Haven](https://polyhaven.com),
CC0, fetched and digest-pinned by `scripts/fetch-polyhaven.mjs`. Image-based lighting is
what makes a steel blade read as steel rather than as a grey box; without it the scene
still runs, just flatter.

There are **no other textures**, and that is a finding rather than an omission: four CC0
tiling normal maps were fetched, pinned and wired in, and every material that carried one
stopped rendering — the warriors lost their helms, pauldrons and breastplates while the
untextured flesh kept drawing. `src/arena.ts` and `docs/measurements.md` record it.

The warriors are authored: `public/assets/warrior.glb` is built from
`asset-src/build_warrior.py` by `npm run asset:build`, which needs Blender, and the result
is committed so a fresh clone runs without one. Twenty-four pieces now, where there were
twenty-one: both arms are simulated and both are therefore dressed, where the sword arm
used to be left bare as the subject of the measurement. `G` is what takes the costume off. The Python holds **no dimensions** — every
number comes from `asset-src/dimensions.json`, regenerated out of `src/config.ts` and
`src/figure.ts` on each build, so a bone that moves without a rebuild fails
`npm run asset:verify` instead of quietly stretching a warrior. Delete the `.glb` and the
page still boots, still plays, and shows the blockout primitives it replaced.

## Status

Working: two fighters of one kind, the arm, the blade, contact scoring, dismemberment, death
on a lost head, blood, policies that fight with the controller you use, live takeover of
either body, two cameras, the rig overlay, the authored armour, and a build that runs at
60 fps with physics under a millisecond.

**The warriors still do not look good.** They are twenty-four welded primitives in four
flat colours — both arms properly dressed now, where the sword arm used to be bare, but no
better surfaced than before. Getting further means either a modelled and hand-textured
character, or adopting a pre-built one and re-fitting the rig to its proportions — the good
free ones are all stylized low-poly, so that is a change of art direction rather than a
change of mesh. `docs/measurements.md` records it as owed rather than pretending
otherwise.

Not yet done: **nobody has played it.** Every number in `src/config.ts` is a first guess
tuned against a measurement rather than against a person, and the questions that decide
whether any of it is any good — is `swinger` beatable and not trivially so, does
body-relative aim read under the fixed camera, do the two warriors read apart at range —
are listed at the foot of [docs/measurements.md](docs/measurements.md).

## Where the work is written down

Almost every argument is beside the code it decides: `src/config.ts` for each tuned number
and the table that set it, `src/mind.ts` for the seam the whole thing hangs on,
`src/bout.ts` for what a bout is, `scripts/check-warrior.mjs` for what a costume has to
measure. Two documents carry what belongs to no single file:

| Document | Holds |
| --- | --- |
| [docs/design.md](docs/design.md) | the map — each subsystem, and the decisions that span several of them |
| [docs/measurements.md](docs/measurements.md) | every number taken, the harness that took it, and what is still owed |
| [AGENTS.md](AGENTS.md) | the working contract, the house rules, and the traps that have already cost time |

Two commands beyond the usual, both from this directory and both deliberately outside
`npm test`, because a default test run that takes minutes is one nobody runs:

```powershell
npm run measure        # runs bouts headlessly and prints the policy table, about 90 s
npm run asset:verify   # checks the committed warrior.glb still fits the rig
```
