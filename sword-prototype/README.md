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
Chrome does not paint WebGL in a genuinely hidden or backgrounded tab. The DOM overlay
keeps compositing, so it looks exactly like a broken renderer. Bring the window to the
front; `document.visibilityState` in the console tells you which it is. A screenshot tool
that merely takes focus is different: the game intentionally pauses, keeps the last arena
frame visible, and raises only the small pause controls.

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
| Left button | thrust — drive the point out. **Hold it with a bow**: draw, then let go to loose |
| Right button | guard — pull the blade in close |
| L | arm a lock-on, then click an enemy; strafe to circle it, Q/E to break |
| Middle drag | orbit the camera; hold Shift to pan within the room |
| Left Shift / arrows | crouch, lean and twist when direct posture is enabled |
| Z / X, T / Y | roll and bend the driven wrist when direct wrist is enabled |
| F | the mouse changes hands — the one it leaves goes back to its policy |
| C | arm a takeover, then click either fighter — you drive that one and the one you leave picks its policy back up |
| Wheel | zoom — the camera only; no fighter is asked for anything |
| V | camera — Overhead behind the fighter, or Fixed on a world bearing |
| `[` / `]` | swing the Fixed camera round the arena, 45 degrees at a time |
| Space / Esc | pause, and resume — the same key both ways, in a decided bout as much as a live one |
| R | the same bout again — both fighters, from nothing |
| Tab | toggle the readout |
| G | the rig — collision shapes, anchors, joints and contacts, with the costume off |
| ? | the controls — this list, over whatever is on screen |

**Half of that table is not a combat control.** The wheel, the middle drag and the two
bearing keys move the camera and nothing else: you and a policy issue exactly the same
command — locomotion, posture, and two hands — and how the arena is framed is yours alone.
That is why taking a body mid-bout changes nothing about the view, and why no policy can
zoom out to see further than you can.

**Pause is a mode in the arena, not another screen.** Space, Esc, focus loss and a
screenshot tool taking focus freeze physics, fighters, projectiles, blood and game-time
notices at the same instant. The canvas and HUD stay visible and a small control panel sits
at bottom-left; Space, Esc or Resume continues from that exact frame. Restart starts the
same bout again, while Setup is the explicit way back to the pickers. Returning focus never
resumes on its own, so preparing a screenshot cannot restart the fight behind the capture
tool.

This distinction exists because pause once reused the character-select curtain. A bout
could end underneath the player, the next Space put the pickers over a fight that was still
standing, and the key was dead from there. Separating the two screens fixed the state bug
but still obscured the very frame somebody wanted to show; the compact in-arena mode fixes
that presentation failure too.

A bout is chosen before it is fought. The curtain carries a left corner and a right corner —
a unit, a policy, and whether that side is driven by a mind or by you — and the Fight button
starts what is on it. There is one of you, so taking a side gives the other one back to its
policy. Four policies ship: **idle** stands there and can be cut apart, **swinger** walks
in and cuts on a fixed cadence without ever looking at your guard, **duelist** holds
measure, guards between exchanges, and commits when your point leaves the line, and
**archer** keeps its distance and shoots — give it a bow, or it will simply back away from
you all day. A bout ends when its one derived vitality bar reaches zero, or when the clock
runs out. Zero head or torso health is fatal by itself; serious combined wounds elsewhere
can spend the same bar without erasing the local health that drives severing and disability.
The banner names the winner and the blow that did it.

### Guided playtest

The setup screen's **Guided playtest** button runs the current human-feasibility protocol as
part of the game. It chooses every matchup and side, applies the 45-second research cap,
records the verdict, engagement gates, frame timing and focus integrity, and autosaves after
each bout. There is no console setup and no seed or file handling. The full sitting is one
excluded practice bout, 48 bouts you play and 12 hands-off specialist controls; allow about
an hour, or exit between bouts and resume later in the same browser. When finished, use
**Copy results for Codex** (or **Download report**) in the panel.

There is no hidden learned policy in that picker. Three full population experiments were
run, and the validation-selected candidate then lost every held-out promotion bout across
sword, shield, axe, bow and bare hands. It spent 88% of its decisions disengaging and
failed seven predeclared gates, so it is recorded as an unpromoted experiment rather than
renamed `learned-v1`. Its loader, its trainer and its five-loadout evaluator have since been
deleted along with the option vocabulary they spoke — the four research directions run through
one artifact format and one blind tournament instead — and
[the measurement record](docs/measurements.md) carries the evidence they held. The current research roadmap has already added factual engagement
and anti-stall gates and factorized movement from hand action. Its remaining sessions compare
recurrent NEAT with quality diversity, DAgger imitation, recurrent PPO self-play and bounded
tactical look-ahead under one still-unopened held-out tournament.

Losing your head is also the end of you as a body, and not only as a competitor. The torso
stops being steered and falls under its own weight, every joint drops to a fraction of its
strength so the thing crumples rather than toppling in one piece, and the mind is never
asked what it wants again. Until recently only the banner noticed, and a decapitated fighter
went on walking and swinging with a stump for a neck. Blood follows the same rule the damage
model does — a clean cut at pace sprays and a flat slap does not — and a limb that comes off
goes on bleeding as it falls.

## Two hands

Each hand takes a **sword**, an **axe**, a **bow**, a **shield**, a **buckler** or **nothing**,
chosen per corner before the fight. Both are real arms — three bones, a shoulder cone, an elbow hinge, a bounded wrist and
a keyframed anchor dragging the whole thing about — so a shield is not a state a fighter is
in, it is a plank of limewood with a steel rim welded into a fist, and it blocks by being
in the way. The collision layers already said an enemy blade and this side's weapons may
touch; blocking needed a shape, not a rule.

Nothing is still a loadout: the visible simulated fist can punch, and the hand and forearm
can stop a blow by physically getting in its way. A clean fast punch crushes for much less
than steel and never cuts or severs; a slow one is only a shove. Policies use a bare fist
only when no held striking weapon remains, while a free off hand covers the threat line.
The draw hand of a two-handed bow stays on the bow rather than becoming a guard.

There are **two shields**, and they differ by how they are held rather than by size. A
**shield** is strapped across the forearm, so its face is square to the arm: it covers a lot,
and it covers whatever your forearm is lying across rather than whatever you are pointing at.
A **buckler** is gripped on a bar behind its boss and punched out on the end of a straight
arm, so it faces exactly where you point it and covers a third as much. Neither scores.
Both are the one thing its owner's own trunk can stop — they have a collision layer of their
own for that, while a blade still passes through its owner, which is a decision the layer
table argues at length.

Where a strapped shield faces is decided for you: the plate points away from your own centre,
along the surface of a sphere, as squarely as an arm lying across it allows. So the useful
thing to think about is not the shield's angle but **your elbow** — an arm pointed at the
enemy shows him the edge of the board, and an arm held across the line shows him the face of
it. Your wrist matters as much: `roll` slides the plate's face around the forearm within its
anatomical stops, and
a board held at the wrong roll throws away two thirds of itself.

The policies know all of that now. A fighter carrying a sword and a shield takes **160.8**
points of damage over 24 bouts against **284.5** with an empty hand, and dies none of the 24
times instead of seven. Two swords deal 42 % more damage and both hands do it, taking turns
at the attack while the idle one covers — which costs some defence, and that is the trade the
loadout is. Keep the shield in the **off** hand: measured against a right-handed opponent it
is worth twice as much there as in the leading one.

There is also a **club**, which takes both hands. It has no edge, so nothing about how you
hold it matters and everything about how fast it arrives does — you cannot place a blow
with a club, you can only arrive with one. It hits harder than a badly-aimed cut and less
hard than a placed one, and it will take a head off.

An **axe** is the sword's opposite trade. It is a quarter of a metre shorter, so you have to
be *inside* the other fighter's range to use it at all, and its weight is out at the head, so
it takes real time to start and cannot be called back. What you get for that is a blow that
bites: over 24 bouts an axe lands **45 % fewer blows and each is 30 % heavier** than a
sword's. Two things it cannot do, and both are real. It has no point, so driving it forward
is a shove rather than a thrust — the left button does nothing useful with an axe in your
hand. And it has **one edge**: swing it backhand and it arrives poll-first, which is a lump
of steel and not a cut. Which way round the head is pointing is your wrist's business, and it
is the first weapon here where that is true.

Against a sword the axe is behind on the totals, and that is the honest answer rather than a
balance failure: in a fight decided by a blade meeting a body, a quarter of a metre of reach
beats a heavier head. **Give it a shield and it changes sides.** An axe and a shield kills 20
of 24 where a sword alone kills 17, and dies four times instead of seven — because the axe's
weakness is having to stand close, and a shield is the answer to standing close. Nobody
designed that; it falls out of the two things being in the same loadout.

A **bow** takes both hands and is the first thing here that hurts somebody it is not
touching. It aims the way everything else aims — the arrow goes where the arm points, so
there is no crosshair and no mode — and the left button becomes a *hold*: press it, watch
the string come back over about a second, and let go. Release early and the shot is
abandoned rather than taken, which is what makes a draw worth holding instead of a button
worth tapping. The bow shows you how far you have drawn, on the bow.
The arrow itself carries a bright orange head and fletch plus a short translucent flight
trace, so the shot remains followable without turning its path into a beam.

What it costs is everything else. It takes both hands, so no shield and no second blade; it
scores nothing swung, so at sword range you are carrying a stick; and a second of standing
still is a second a swordsman spends walking at you. An arrow that arrives is worth more
than a sword's best cut — **55 against 46** — and it arrives point-first every time, because
it flies along its own shaft.

Two things about it are worth knowing, and both are written up in
`docs/measurements.md`. A **held-out sword blocks arrows**, which nobody designed: a duelist
covers the line to its own chest and that is exactly where an archer aims, so only about one
arrow in ten gets through. An archer can now win through accumulated injury: each fighter
has one derived vitality bar, while the local wounds beneath it still decide severing and
lost limbs. A head or torso at zero exhausts the bar alone; combinations of pelvis and limb
wounds can exhaust it too. The old thirty-second bow corpus -- 275 damage against a
motionless fighter and no win -- remains the before measurement.

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

A humanoid fighter is deliberately split in two. **Warrior** is the baseline; **Broot** uses
the same articulated anatomy at 1.18x scale, with 1.64x mass, 1.30x local health and 1.35x
motor force, but 0.88x walking and turning speed. **Centipede** is a separate
nine-body low crawler with no hands or equipment: its head carries a natural bite, its eight
segments can be severed, and losing the head or exhausting weighted segment vitality is
fatal. The typed unit registry refuses incompatible policy and equipment selections by name.

The pelvis is **animated** as the planted locomotion frame; the torso is **genuinely
simulated** on a motorised waist, so it can lean and twist above the hips. Everything from
the shoulder outward is simulated too — a ball
joint at the shoulder, a hinge at the elbow, a rolling wrist, and whatever is welded into
the fist. Both arms are like that: two full chains, either of which can hold a sword, a
shield, a bow or nothing.

The arm is driven by a single invisible keyframed **anchor**, joined to the hand by a
six-degree-of-freedom constraint whose motors have a finite force budget. Move the anchor
and the solver drags the hand after it; the forearm and upper arm follow because they are
constrained, and the weapon follows because it is welded to the hand. The lag, overshoot and
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

The readout shows **one vitality bar per fighter**, not a row of competing limb-sized lives.
Expand its critical-injuries diagnostic when you need to see which local parts are severed
or close to failure. Once either vitality bar is exhausted, both minds and both contact
scorers stop immediately; the loser, blood and loose physics continue naturally.

A fighter is a jointed figure rather than a block, because the interesting question is not
whether a hit registers — it is whether a hit that lands badly reads differently from one
that lands well. A dynamic torso and head ride above the driven pelvis, with two simulated arms and legs on
motorised joints, so a struck body rocks, twists, and eventually comes apart. Both sides
are the same class: there is nothing in it that knows which one you are driving.

## Tuning

`src/config.ts` is the tuning surface a person reaches, and is deliberately mutable. The page
exposes `window.__sword`, so the loop is:

```js
__sword.config.arm.stiffness = 1600   // takes effect on the next frame
__sword.config.sword.mass = 1.9
```

The option layer is the one exception and it is on purpose: `ACTION_TUNING` in
`src/action-primitives.ts` and `TARGET_SPAN_FRACTION` in `src/options.ts` are frozen and
unreachable from `__sword.config`, because `options.ts` may not import `config.ts` -- a legality
or aim rule a console command can move is a rule a learned artifact can be trained against and
deployed without. `AGENTS.md` carries the full argument.

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

The local texture registry now carries thirty-three digest-pinned CC0 1K maps: slate for the
floor and albedo/normal/ORM families for worked steel, neutral cloth, brown leather,
subtle skin detail, fine-grained wood, worn brass, distressed painted board, timeworn stone
walls, room timber and banner cloth. `npm run texture:verify` checks provenance, license, colour space and
both directions of the registry. A failed decode leaves the old colour material drawable;
it never attaches a texture that can make the mesh disappear. The earlier failed normal-map
experiment and why this pipeline does not repeat it are recorded in `docs/design.md`.

The warriors are authored: `public/assets/warrior.glb` is built from
`asset-src/build_warrior.py` by `npm run asset:build`, which needs Blender, and the result
is committed so a fresh clone runs without one. It is one continuous skinned Ranger, divided
into twenty-nine anatomical render regions that share one thirteen-bone skeleton; it is not a
person assembled from rigid costume chunks. `G` is what takes the costume off.
The Python holds no duplicated **rig** dimensions: live joints and body envelopes come from
`asset-src/dimensions.json`, regenerated out of `src/config.ts` and `src/figure.ts` on each
build. Donor landmarks and fitting ratios stay beside the pinned donor geometry, so a bone
that moves without a rebuild fails `npm run asset:verify` instead of quietly stretching a
warrior. The tunic, coat-skirts, belts, hood, sleeves, bracers, pauldron, trousers, boots,
arms and hands come from Quaternius's CC0 Modular Character Outfits - Fantasy Ranger. Its
native skin supplies the continuous shoulders and limbs; its finger rig is baked into closed
weapon grips before being remapped onto the physics rig. Quaternius's CC0 Animated Knight
Helmet3 closes the face and is fitted inside the hood.
The pinned sources, exact objects, extracted-mesh digests and transformations live in
`asset-src/armour-sources.json`; `npm run armour:verify` checks that provenance. Imported
geometry remains render-only. Region names and cross-boundary skin weights make severance
local without reintroducing visible rigid seams. The shipping builder refuses any generated
form.
The rounded/blockout meshes in `figure.ts` are retained only as a load-failure diagnostic;
the committed healthy-load asset contains none of their triangles.

`KayKit Knight (Experimental)` is a fourth, separate unit rather than a costume or replacement
for Warrior. Its committed CC0 KayKit Adventurers 1.0 derivative keeps the creator's continuous
skin, armour, helmet, cape, one-handed sword and round shield. The body uses native joint and
region measurements for its real colliders, while the source animation clips are stopped and the
same solver controller drives the skin. Its sword and shield collision hulls and the sword's
scoring frame are derived mechanically from the selected creator geometry, so hits occur on the
objects shown. Its only admitted loadout is sword plus buckler and its
only admitted policies are idle, swinger and duelist. `npm run kaykit:verify` reproduces and
checks the derivative without Blender or mesh editing. If that exact asset cannot be fetched,
parsed or qualified, the setup option is disabled with the reason; no primitive substitute is
shown as if it were the Knight.

## Status

Working: Warrior, Broot and Centipede combatants, plus the separate experimental KayKit Knight;
articulated arms, anatomically bounded
wrists, moving trunks and crouch; blades,
shields, bows and bare hands, contact scoring, dismemberment, one derived vitality state,
clean verdict shutdown, blood, policies that fight with the controller you use, live
takeover of either body, two cameras, the rig overlay and authored arena and equipment
surfaces. The learned controller remains an unpromoted experiment rather than a setup option.

The skinned warriors now separate flesh, neutral woven cloth, leather and worked
steel with authored UVs and shared PBR maps. Only the surcoat/skirt material is constructed per
fighter, so crimson and blue remain independent while their images stay shared; rebuilding
a bout disposes those materials. A corrected 2026-08-27 review rejected the former rigid
PASS because it reduced visual judgement to presence and attachment-point distances. The
shipping game was visibly a disconnected mannequin with a floating horror face. The
replacement review requires both authored turntable views and the actual arena with sword,
buckler and a moving pose. The 2026-08-27 arena pass found a continuous adult silhouette,
closed helmet and collar, joined shoulders and arms, trousers, boots and weapon grips. The
long rear hood and partly obscured buckler hand remain polish notes rather than structural
failures.

Weapons, shields, arrows and ring posts use the same registry without changing their
geometry or physics. A total 35-part table assigns forged steel, brass, worn leather,
fine-grained wood as the ash/yew visual proxy, and painted board. It rotates each mesh's own
UVs where grain direction
requires it. Polished edges, bosses, bow strings and the nocked/flying arrow remain brighter
than the surface detail. Carried objects borrow arena-owned materials and never dispose a
shared map when one weapon or pooled arrow leaves the scene.

The arena now has the scale cues and authoritative boundary of a training hall. The original
60 m ground slab and fourteen post colliders remain, and four 0.24 m WORLD wall colliders are
derived from the same placements as the visible room edges. Their inner faces align with the
wall scrims at x/z = +/-13 m, including closed corners. The browser and headless evaluation
harness consume the same wall table. A separate visual floor, translucent wall scrims,
overhead beams and banners occupy the room, while flat timber-coloured rack/debris markings
add floor detail without presenting a pass-through volume. They own no physics body. Repeated dressing is instanced. Its
stone, timber and cloth UVs are scaled from the Poly Haven material's physical metre span, and
`__sword.arena.audit()` reports only its owned resource census and visual/collider pairs.

The first whole-body playtest is in: a human can beat `swinger`, its timing stays where it
is, the gait-driven knees look good, and the implemented vitality, posture, bare-hand,
surface and action-option work has its durable record in
[docs/design.md](docs/design.md) and [docs/measurements.md](docs/measurements.md). The three
full learned-policy experiments are also closed there as a negative result: no checkpoint
earned promotion and no `learned-v1` option is advertised.

The mechanics, controls, unit and evaluation-contract sessions of the current topic are
implemented: pause/restart correctness, projectile and shield behaviour, unarmed engagement,
solid arena bounds, middle-drag camera control, whole-body human control, Broot, Centipede,
licensed clothing adaptation, factual engagement gates and factorized AI actions. Four real-Havok
research runners now implement recurrent NEAT-QD, DAgger, recurrent PPO and calibrated bounded
look-ahead, with deterministic artifacts, resume and one shared deployment/tournament boundary.
PPO has a repeated collect/update/validation outer loop rather than the retired four-bout probe,
and all four runners use the same ledger/finalization lifecycle and fail-fast research preflight.
Tournament safety is measured from each executed bout rather than filled with passing defaults.
These are execution foundations, not evidence that a controller has passed.
Only engineering smokes have run; the full three-seed budgets, blind tournament, possible
promotion and final playtest remain sequenced in
[docs/plans/combat-followups-00-overview.md](docs/plans/combat-followups-00-overview.md). The older
whole-body plan set was deleted when that topic closed; completed plans are not a second
authority for the game.

The integrated headless contract covers all four humanoid policies with all 27 reachable
two-hand loadouts, finite anatomical commands over complete bouts, the exact verdict edge,
identical fight records with costumes enabled or disabled, 25 fighter rebuilds and 100 pooled
arrows. Registry, Broot and Centipede suites separately cover compatibility, scaled anatomy,
bite, severing, death and disposal. These are authority and lifecycle results, not
substitutes for the open visual judgements.

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
