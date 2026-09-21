# Sword prototype

A browser game of physically-simulated melee, after *Die by the Sword* (1998) and
*One Must Fall* (1994).

There is no attack button. A fighter's arm is a chain of constrained bodies with a weighted
blade on the end, driven by a spring at the hand -- you swing by moving your arm, and you cut by
driving the edge through something at speed. A blow that lands with the flat is a shove; a blow
that lands edge-on at pace takes a limb off. Both fighters are golems: five slots of stone
bolted together, so a weapon is a body part rather than a held item, and what a fighter *is* is
as much a choice as how it fights.

This repository is the whole game. See [AGENTS.md](AGENTS.md) for the working notes.

## Play online

[Play the game](https://alexoooo.github.io/auto-rpg/) in your browser.
The [module bench](https://alexoooo.github.io/auto-rpg/bench.html) is also available.

GitHub Actions tests and builds each push to `main`, then publishes `dist/` to GitHub Pages.
In repository Settings > Pages, the deployment source must be **GitHub Actions**.
The workflow builds with `npm run build -- --base=/auto-rpg/`; public asset URLs follow
that base. Local `npm run dev` continues to serve at `/`.

## Running it

Requires **Node 22.13.0 or newer** (`node --version`). `.npmrc` sets `engine-strict=true`, so an
older Node makes `npm ci` refuse rather than warn.

```powershell
npm ci        # not `npm install` -- exact lockfile, identical on every machine
npm run dev   # http://localhost:5180, strictPort
```

Then open <http://localhost:5180/>, pick a matchup, and press **Fight**. Everything the page
needs is committed, so a fresh clone runs with no download step.

To confirm the tree is sound without opening a browser:

```powershell
npm run check     # tsc, no emit
npm test          # the rules, the minds and real headless bouts
npm run build     # production bundle
```

## Troubleshooting

**`Port 5180 is already in use`**
An earlier dev server is still alive. Find and stop it rather than using another port, or you
will edit one server while reading another:

```powershell
netstat -ano | findstr ":5180"
taskkill /F /PID <the pid>
```

**Black screen, but the overlay updates**
Chrome does not paint WebGL in a genuinely hidden or backgrounded tab. The DOM overlay keeps
compositing, so it looks exactly like a broken renderer. Bring the window to the front;
`document.visibilityState` in the console tells you which it is. A screenshot tool that merely
takes focus is different: the game intentionally pauses, keeps the last arena frame visible, and
raises only the small pause controls.

**`EBADENGINE` during install**
Node is older than 22.13.0.

## Controls

The mouse belongs to the **arm**, not to the camera. That is the central control decision and
the reason this reads as Die by the Sword rather than as a third-person action game; turning is
on the keyboard precisely so the mouse can be spent entirely on the blade.

The pointer is **not** captured. Where the cursor sits in the window is where the hand is asked
to be, so the middle of the window is always centre guard and the arm has a home you can find
again. An earlier version took a pointer lock and accumulated relative movement: the arm
drifted, centre was unrecoverable, and you could not get your mouse back.

| Input | Does |
| --- | --- |
| Mouse | moves one arm -- the cursor is where that hand goes |
| W / S | walk forward and back |
| A / D | strafe |
| Q / E | turn |
| Left button | thrust -- drive the point out |
| Right button | guard -- pull the blade in close |
| L | arm a lock-on, then click an enemy; strafe to circle it, Q/E to break |
| Middle drag | orbit the camera; hold Shift to pan within the room |
| Left Shift / arrows | crouch, lean and twist when direct posture is enabled |
| Z / X, T / Y | roll and bend the driven wrist when direct wrist is enabled |
| F | the mouse changes hands -- the one it leaves goes back to its policy |
| C | arm a takeover, then click either fighter -- you drive that one and the one you leave picks its policy back up |
| Wheel | zoom -- the camera only; no fighter is asked for anything |
| V | camera -- Overhead behind the fighter, or Fixed on a world bearing |
| `[` / `]` | swing the Fixed camera round the arena, 45 degrees at a time |
| Space / Esc | pause, and resume -- the same key both ways, in a decided bout as much as a live one |
| R | the same bout again -- both fighters, from nothing |
| Tab | toggle the readout |
| ? | the controls -- this list, over whatever is on screen |

**Half of that table is not a combat control.** The wheel, the middle drag and the two bearing
keys move the camera and nothing else: you and a policy issue exactly the same command --
locomotion, posture, and two hands -- and how the arena is framed is yours alone. That is why
taking a body mid-bout changes nothing about the view, and why no policy can zoom out to see
further than you can.

**Pause is a mode in the arena, not another screen.** Space, Esc, focus loss and a screenshot
tool taking focus freeze physics, fighters, blood and game-time notices at the same instant. The
canvas and HUD stay visible and a small control panel sits at bottom-left; Space, Esc or Resume
continues from that exact frame. Restart starts the same bout again, while Setup is the explicit
way back to the pickers. Returning focus never resumes on its own, so preparing a screenshot
cannot restart the fight behind the capture tool.

A bout is chosen before it is fought. The curtain carries a left corner and a right corner -- a
body, a policy, and whether that side is driven by a mind or by you -- and the Fight button
starts what is on it. There is one of you, so taking a side gives the other one back to its
policy.

A bout ends when a fighter's one derived vitality bar reaches zero, or when the clock runs out.
Zero head or trunk health is fatal by itself; serious combined wounds elsewhere can spend the
same bar without erasing the local health that drives severing and disability. The banner names
the winner and the blow that did it. Losing your head is the end of you as a body and not only
as a competitor: the trunk stops being steered and falls under its own weight, every joint drops
to a fraction of its strength so the thing crumples rather than toppling in one piece, and the
mind is never asked what it wants again. Blood follows the same rule the damage model does -- a
clean cut at pace sprays and a flat slap does not -- and a part that comes off goes on bleeding
as it falls.
## The golem

A golem has no hands, and that is the point of it. After *One Must Fall*: **weapons are body
parts.** There is no held item and no grip anywhere on it -- a sword is a blade at the end of an
arm and a shield is a plate at the end of an arm. The plate is the one piece that is not like
the others: it blocks what it meets, nothing ever wounds it, and it is no part of the vitality
bar, which is what an indestructible damage sink means. Every visual glitch a held weapon never
loses is an artefact of a grip: fingers clipping through a shield, a handle that was not visibly
held, a weld whose frame had to agree with a hand's. A golem has nothing to grip with, so it has
none of them. Cut an arm off and what falls on the floor is a real object.

It is **five slots, each filled by one pre-made module**, chosen on the curtain before the
fight:

| Slot | Picks from |
| --- | --- |
| **Legs** | biped -- two legs on a carrier; wheel -- one rolling body on a fork; multileg -- six short legs |
| **Trunk** | plain, or plated -- heavier, better armoured, and it leans and twists less |
| **Head** | plain, or ram -- a plate on the front and a lunge that fires with the left button |
| **Primary arm** and **Primary end** | the arm and what is on the end of it, picked separately |
| **Secondary arm** and **Secondary end** | the same shelf again |

An arm is a **chain** and the thing on its end is a **terminal**, and they are picked
independently because they answer different questions. The chain owns all of the motion:
`none` is a capped socket that can only shove, `pitch` is one hinge, `reach` puts the end
wherever you point, and `wrist` adds roll and bend on top of that. The terminal is a **blade**,
a **plate**, a **mace** or a **whip**, and it owns none of the motion -- only its weight, its
edge and its shape. A mace takes both sockets and fills them together; a whip is offered on the
wrist arm alone, because without a roll axis a lash has nowhere to start. That is eleven arms in
all, and every one of them is a different body rather than a worse version of the best one.

**Eleven minds** can drive it, and `C` takes it over mid-bout. The golem duelist knows nothing
about which modules it is wearing: it asks each arm what strokes it has and how far it reaches,
and every range it keeps is a fraction of that answer rather than a distance. Bolt something new
on and it needs no new mind.

| Mind | What it does |
| --- | --- |
| **idle** | stands there and can be cut apart |
| **golem duelist** | holds measure, guards between exchanges, commits with whatever it was built with |
| **golem fencer** | the duelist reading the other golem's arm -- a chamber, a commit and a recover are all visible in how far an arm is drawn, so it strikes into the recover, steps out of the commit, stop-hits a point that closes on a longer arm, and brings its second weapon in behind its first. The default |
| **golem planner** | the fencer with its triggers stood aside: it publishes what it could do this step and a search over a small fitted duel model names one of them |
| **golem champion** | the planner with the numbers an evolutionary search found, one vector per kind of arm, read off a committed table |
| **golem form** | the first of the styles -- fifteen options instead of eight, with a committed cut that walks the feet in through its own wind-up, a thrust along the reach axis, a parry that solves where their point crosses its guard shell, a two-handed shove, a duck, and a circle toward the side their weapon is not on |
| **golem skirmisher** | the opposite temperament: stands *outside* their reach, comes in for one committed cut on their recover, and owes itself a retreat the moment that exchange ends |
| **golem guardian** | the defensive one: answers their arm on the way *back*, before the stroke has started, by putting its spare hand on the bearing to their point, then ripostes into the recover |
| **golem brawler** | the only one that wants the distance every other mind is keeping: no stand-off at all, a walk in, and inside it shoves, strikes short with either hand, and puts the point at the head |
| **golem tactician** | no rules at all -- the parry, the cut, the shove and the void are equally open, and what decides between them is what each cost in that state across a few hundred thousand recorded half-second windows |
| **golem driver** | a fourth executor with no options at all. Its ask is a command -- nine numbers and three gates, twelve times a second: where to stand, which way to sidestep, how far to lean, whether to walk, where to put the mark, how far out to hold the guard, how round an arc to cut with, where along the blade to cross the mark, and then commit, abort and parry. A stroke already in flight is abandoned the step the abort gate goes up |

**Win a bout against a golem and whichever of its arms came off intact is yours** -- an arm cut
off at the shoulder is loot, an arm hacked to pieces is debris, and legs are neither, because a
body coming apart is not a part coming off. A **Parts bin** sits under the corners, kept in this
browser: each entry is a module and how much life it has left, and the *fitted from* picker
beside each arm puts one back on a new body at the durability it has. It looks second-hand,
because remaining durability drives the wear on its own stone. **Empty the bin** clears it. Be
warned that this is a loop and not yet a game -- nothing charges you for a new module, so a
salvaged one is strictly worse than buying the same thing fresh, and the only reason to fit one
is to see it.

### The bench page
<http://localhost:5180/bench.html> is a second page that stands **one module at a time** on a
fixed block, so that what you are judging is that module and not a whole fight. It is the
page the whole design is gated on: a person drives a module with the mouse for about a minute
and answers three questions -- does it read as a limb rather than a robot arm or a rope, does
its motion carry weight, and does anything look wrong. No measurement substitutes for that
answer, which is why the bench exists at all.

| Input | Does |
| --- | --- |
| Mouse, left button, right button | exactly as in the arena -- the cursor is where the module is asked to be, left thrusts, right guards |
| 1–9, 0, then Shift+1–9 | pick a module; the picker lists them in that order with the key beside each |
| P | pair -- put a second effector in the other socket. A two-socket module cannot share the stand and the picker says so |
| F | move the cursor to the other socket; the limb it leaves holds whatever it was last given |
| Arrows | lean and twist the trunk -- the bench hands you posture, which the arena does not |
| W / S, A / D, Q / E, Left Shift | walk, strafe, turn and crouch -- locomotion modules only |
| B | shove -- a measured impulse, locomotion modules only |
| Tab | the readout, which names its own harness on its first line |
| G | the rig overlay on the stand, with the shell off |
| R | rebuild the module from the file |
| Space / Esc | pause and resume; this stops physics, not just input |
| Middle drag, wheel | orbit and zoom the camera |

`__golem` on that page exposes the stand, the modules and a `step(frames)` that advances the
world by hand -- which is how it is measured in a background tab, since Chrome will not paint
one.
## How it is built

**Babylon.js** for rendering and **Havok** for physics, both running natively in the browser --
no export step, and the solver is native-speed WebAssembly with TypeScript only orchestrating
it.

Locomotion is **supported**: an invisible game carrier prevents two articulated bodies from
collapsing into an unsolvable clinch heap, but the body's real legs decide whether that carrier
is allowed to move. Break a required leg chain and full movement disappears; a one-leg limp can
take over at lower authority if that exact chain and foot contact survive. A hard hit, missing
ground or invalid trunk posture releases the body to its ordinary ragdoll. Recovery is
requested, not an automatic stand-up animation. The port's diagnostic names the live support
group, requested versus allowed movement, the reason movement was blocked, and recovery
progress. The fall thresholds are **specific impulses** -- metres per second of velocity change
per kilogram carried -- so they mean the same thing on a body of any mass.

The arm is driven by a single invisible keyframed **anchor**, joined to the end by a
six-degree-of-freedom constraint whose motors have a finite force budget. Move the anchor and
the solver drags the arm after it; the links follow because they are constrained. The lag,
overshoot and carried momentum come from that force ceiling being finite -- the motor simply
cannot drag a heavy blade instantly -- rather than from any tuned spring.

Physics runs on a **fixed 240 Hz timestep** with control sampled on the same clock rather than
the render clock. That is not an optimisation, it is the difference between a steady weapon and
one that shivers: a motorised joint stepped by the raw frame delta receives a slightly different
correction every frame, which reads as the blade trembling in the hand.

Nothing is animated, and **no force is applied from outside the solver**. That is not stylistic.
The first version ran a spring-damper on the hand with `applyForce` every frame and shook itself
to pieces: Babylon converts a force to an impulse using `getTimeStep()` while the world steps by
the real frame delta, so the effective gain flickered frame to frame. It also torqued the sword
toward an aim direction while the weld held the sword rigid to the hand -- a contradiction whose
only available answer is vibration.

Damage comes from the **energy that arrives**: half the reduced mass of striker and struck part,
times the square of the striker's speed along the contact normal, over a joules-per-damage
constant for the mechanism -- an edge, a point or something blunt -- with the edge's alignment
gating a cut. Not from the impulse the solver reports: that is real but dominated by how the
contact resolved (mass ratios, penetration depth, substep luck), so tuning against it is tuning
against noise. The impulse is still shown in the readout beside the arriving energy, because
when the two disagree that is worth seeing. Everything else follows from the masses rather than
from a per-weapon scale: a maul is barely a mace on a light arm link and several times itself on
a heavy trunk, and a blade sliding *along* a body pays only for the little that went into it.

The readout shows **one vitality bar per fighter**, not a row of competing limb-sized lives.
Expand its critical-injuries diagnostic when you need to see which local parts are severed or
close to failure. Once either vitality bar is exhausted, both minds and both contact scorers
stop immediately; the loser, blood and loose physics continue naturally.

Both sides are the same class: there is nothing in the simulation that knows which one you are
driving. A person and a policy hand a fighter the same `Intent`, and the camera is not part of
it.
## Tuning

`src/config.ts` is the tuning surface a person reaches, and is deliberately mutable. The page
exposes `window.__sword`, so the loop is:

```js
__sword.config.arm.linearMotorForce = 1600   // takes effect on the next frame
__sword.config.sword.mass = 1.9
```

`left` and `right` are getters rather than fields, because `R` replaces both fighters and a
console handle that quietly refers to a disposed body is worse than no handle. `__sword.right.mind`
is assignable, so a scripted sweep can be dropped onto either side without rebuilding anything.

The option layer is the one exception and it is on purpose: `ACTION_TUNING` in
`src/action-primitives.ts` and `TARGET_SPAN_FRACTION` in `src/options.ts` are frozen and
unreachable from `__sword.config`, because `options.ts` may not import `config.ts` -- a legality
or aim rule a console command can move is a rule a learned artifact can be trained against and
deployed without. `AGENTS.md` carries the full argument.

**Motor ceilings are the exception, and right now they are the rough edge.** They are set on
native solver objects at construction, so a number changed from the console does not reach them
until something calls `applyTuning()`. On a golem that method lives on each arm chain's
`AnchorDrive` (`src/golem/anchor-drive.ts`) and there is no one call that reaches every chain --
`__sword.left.applyTuning()` was the humanoid fighter's and went with it. Rebuilding the bout
with `R` is the reliable way to pick a new ceiling up until that is plumbed back.

Find the number in the console, then write it back into the file with the before/after table that
justifies it.

`src/scoring.ts` holds the balance rule -- what counts as a cut, a thrust, or a clang --
kept pure and free of Babylon so it can be argued with in `tests/scoring.test.mjs`.

## Assets

The environment map is `kloofendal_43d_clear` from [Poly Haven](https://polyhaven.com), CC0, and
is committed as `public/assets/env.hdr`. Image-based lighting is what makes a steel blade read
as steel rather than as a grey box; without it the scene still runs, just flatter.

`public/assets/textures` carries thirty-three digest-pinned CC0 1K maps: slate for the floor, and
albedo/normal/ORM families for worked steel, neutral cloth, brown leather, fine-grained wood,
worn brass, distressed painted board, timeworn stone walls, room timber and banner cloth.
`src/textures.json` is the registry `src/materials.ts` reads. A failed decode leaves the old
colour material drawable; the pipeline never attaches a texture that can make the mesh
disappear.

## Status

**Working**: the arena and its fight picker; golem bodies across five slots and eleven arms;
supported locomotion with limp and ragdoll; contact scoring, severing, one derived vitality
state, clean verdict shutdown and blood; eleven policies that fight with the controller you use;
live takeover of either body mid-bout; two cameras; the parts bin; and the module bench.

**Being worked on**, in this order:

1. **Making a hit feel like a hit.** A golem currently weighs about 560 kg at 1.9 m -- solid
   stone, derived honestly, and roughly six times too heavy for its size. So it moves at
   1.2 m/s, so contacts land at about 2 m/s, so a damage model priced at 11 m/s and squared
   bills a real blow at a few per cent of its design value, so a vitality bar is worth sixty
   clean cuts, so a fight is decided by the overtime clock rather than by the fighting. The work
   is to bring the body to human scale and re-price damage for **five to eight clean hits**. It
   is judged by playing, not by running a tournament: thirteen sessions of mind-versus-mind
   ratings could not detect that both minds were bad, because every number was relative.
2. **Four control modes.** Today you take a whole body or none of it. The intent is that
   movement and attack are separately yours: fully automated, WASD only, mouse only, or both.
3. **Wave mode.** A second game mode where one fighter meets waves of increasingly difficult
   enemies, which are different golem morphologies. `src/golem/roster.ts` holds the twelve named
   builds it will draw from.
