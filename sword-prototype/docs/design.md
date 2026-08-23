# How the sword prototype is put together

A map, not a specification. Almost every argument in this directory is written beside the
code it decides, in the file that would be wrong without it -- `src/config.ts` for every
tuned number, `src/mind.ts` for the seam, `src/bout.ts` for what a bout is,
`scripts/check-warrior.mjs` for what a costume has to measure. This file exists so that
somebody who wants the shape of the thing does not have to read eleven modules to find it,
and so that the decisions belonging to no single file have a home.

`README.md` is the player's view and the install. `AGENTS.md` is the working contract and
the ledger of traps. `docs/measurements.md` is every number that has been taken, with the
harness that took it named, and the list of what is still owed.

## The seam everything hangs on

```ts
interface Mind { decide(view: FighterView, dt: number): Intent }
type Intent = InputState;
```

`Intent` is a **type alias** for the human controller's own state, deliberately rather than
a second interface of the same shape: two structurally identical declarations agree on the
day they are written and part company the first time only one of them is edited, and the
compiler says nothing.

So **a policy plays with the controller you play with.** It gets a cursor position, a
reach, a wrist roll, a thrust, a guard and three movement axes, and nothing else. It cannot
set a joint angle, place a blade, or ask for a pose the solver would refuse a person. That
is a constraint rather than a limitation: an AI that could pose the arm directly would be a
different game's AI, and beating it would say nothing about whether *this* arm is worth
fighting with.

Two things fall straight out of it. A human is a `Mind` like any other (`humanMind`), so
there is no branch anywhere in `Fighter` for "is this one the player". And taking over a
fighter mid-bout is a pointer swap -- `fighter.mind = humanMind` -- with no authority
transfer, because there was never an authority to transfer.

**Two things the seam refuses, and both are it working.**

- *Lock-on is not on the controller.* It is set by a click on an enemy, a UI act, and a
  policy that assigned `lockTarget` would be reaching past the controller to do the one
  thing the design forbids. Policies steer with the `turn` axis instead, proportionally to
  their heading error, and it costs them: `fighter.turnSpeed` is 2.5 rad/s against a
  locked-on player's 4.2.
- *`FighterView` carries no part positions* -- a ground point, a shoulder, a blade tip, and
  a health map with no coordinates attached. "The nearest soft part" is therefore not a
  question the view can answer, and the duelist aims at shoulder height plus 0.20 m
  instead. That 0.20 is anatomy, and it is only safe because both sides are the same unit
  today. **The day two fighters have different bodies, a policy has to be told how tall the
  thing in front of it is, and `FighterView` is where that belongs.**

`Fighter.observe` publishes the view in place, one object per fighter -- `decide` runs 240
times a second per side, and a freshly allocated view would be the largest single allocator
in the prototype. What `observe` may read is tightly constrained; see the render-id trap in
`AGENTS.md`, which is the most expensive lesson in this directory.

## One kind of body

`Fighter` is both driveable and hittable, and there are two of them. The torso is a
keyframed (`ANIMATED`) root, so locomotion goes exactly where it is steered and -- the
reason that matters most -- the sword arm's shoulder does not itself wobble. Everything
outward of the shoulder is genuinely simulated, and the head, pelvis, off arm and legs hang
off the torso as dynamic capsules on motorised joints: hittable, severable, rocked by a
blow.

The legs are real bodies whose joint targets come from the gait, so a leg can come off.
`__sword.config.body.gaitDrivesLegs = false` takes the stride off the joints live, with no
reload and no `applyTuning()`, if a knee ever chatters.

**Every pivot is written as an absolute height and both anchors are derived from it by
subtraction.** That is not tidiness. The training dummy this class replaced had a root
joint whose parent anchor sat at world 0.400 and whose child anchor sat at 0.850, with all
three linear axes locked, so the solver dragged the whole figure 450 mm down and held it
there -- and the sag looked exactly like a stiffness deficit for as long as nobody measured
it. It was not: every angular motor set to 40 000 N.m, over a thousand times the shipped
34, moved the head by zero. Two incompatible intents in one constraint.

`src/physics.ts` names ten layers: `WORLD`, `DEBRIS`, and four per side -- trunk, arm,
sword, shield. Each side's blade collides with the other side's everything, the world and
debris, but not with its own. Self-pass-through for a *blade* is kept **deliberately**: Die
by the Sword lets you cut yourself and it is one of the things people remember about it, but
turning it on changes every number the arm was tuned with, so it is a separate decision with
its own measurement.

The four-per-side split exists to buy exactly one pair: **a shield collides with its owner's
trunk.** A shield cuts nothing and has no such decision to make -- its whole job is to occupy
a rectangle, and a rectangle that can be commanded into its owner's chest is the one failure
a shield cannot have -- so it gets a bit of its own rather than the blade exemption being
lifted for everything. It stops at the trunk and does not see its owner's arms, because the
plate hangs 110 mm off the fist that holds it with its own forearm inside that gap: a shield
that collided with its own arm would be in permanent contact with the chain driving it, which
is the motor-versus-contact buzz this file warns about, with a 4 kg lever on it. Everything
else in the table is the two-layer version's exemptions, pair for pair, and
`tests/shield.test.mjs` drops a box on a box to say so.

## What a bout is

`src/bout.ts` is plain data and pure functions -- `select` -> `fight` -> `over` -- with no
DOM and no Babylon, so `tests/bout.test.mjs` can argue with the rules without starting a
browser. `src/main.ts` renders what is in there. Four rules, each with a test, each chosen
against a plausible alternative:

- **The winner is named by its own last blow**, not by the newest blow struck by anybody. A
  severed head's owner is often still swinging on the way down, and its hit landing after
  the decisive one must not end up in the sentence.
- **The clock cap is always a draw.** Deciding on accumulated damage means writing a
  scoring rule, and a scoring rule invented in passing by the function that needed a
  tie-break quietly becomes the balance of the game. `src/scoring.ts` is where one belongs,
  with a test, on the day anybody wants it.
- **Both sides down on one step is a draw**, for the same reason: there is no honest way to
  order two things that happened in one solver step, and picking the left one because it is
  checked first is the sort of accident that ends up being called a rule.
- **`over` does not stop the world.** Freezing would need either a branch in `Fighter` for
  "the bout is over" -- the same shape of branch as "is this one the player", which the seam
  exists to abolish -- or a keyframed torso left holding its last velocity, sliding across
  the arena forever.

One consequence is live and unjudged: the torso carries `attachment: null` and cannot be
severed, and "every part at zero" takes all twelve, so in practice nearly every bout ends
on a cut to the head. Whether that reads worse than a lethal torso -- the biggest target on
the body, and the one a swing finds by accident -- is a question for somebody who has
fought one to the end.

## The curtain, which is two screens and used to be one

`Space` paused a fight and then, from the state pausing had put you in, did something else
entirely. Three faults, and they chained:

- **`CONFIG.bout.capSeconds` was 60, and 60 is the bench's number.** Its own comment argued
  it entirely from bulk -- a hundred headless bouts at 250x real time cost twenty-five
  seconds of wall clock -- and none of that argument is about a person at a keyboard, who
  driving a body against `idle` is routinely still fighting after a minute. `advance` set
  `phase = "over"` underneath them, announced by one line of banner text competing with the
  lock, camera and takeover notices in the same element.
- **From `over`, `Space` ran `toSelect`.** So the character pickers came up over a fight
  that was still standing, with the only button on offer wired to `rebuild()`, which
  disposes both fighters. *"The game is gone."*
- **From `select`, the resume branch was unreachable.** It was written `phase === "fight"`,
  so every later press just re-paused something already paused. *"Pause doesn't un-pause."*

Underneath all three was one design fault: **the screen was inferred from the phase.**
`showCurtain(show: boolean)` derived which controls to show *and* what to write on the
button from `phase === "select"`, and a pause was the setup screen with two blocks hidden by
a class. So anything that moved the phase silently changed what you were looking at.

Two phases can want the same screen and one phase can want either, so a `Screen` is now
stated -- `showScreen("setup" | "paused" | null)`, and `#curtain[data-screen]` is the whole
of the CSS. The pause is its own section carrying a heading, Resume, Restart and Leave and
none of the setup screen's furniture, because a curtain offering to change the matchup over
a live fight reads as the fight having been discarded, which is what it used to mean.

The rule itself went to `bout.ts` as `pauseAction(phase, running)`, with a test, for the
reason everything else in that file is there: it is a rule, it was wrong, and it was wrong
in a way that could only be found by starting a browser and waiting sixty seconds. It
returns `pause`, `resume` or `nothing` and **never a phase** -- a key that pauses and a key
that abandons must not be the same key. Leaving is `R`'s, and the pause screen's Leave
button, and they are one function.

The cap that ships is now a safety net at 600 s, and `scripts/measure.mjs` sets its own 60
at the top, where the argument for 60 lives.

The seventeen-row key list went with it, to a `?` overlay. It was on the curtain, above the
Fight button, on both screens -- `style.css` already capped the panel height and scrolled it
because the list plus the matchup overflowed a laptop window, which is a Fight button below
the fold. A controls sheet is also something you want mid-fight, which a curtain cannot be.

## Dying, which is not the same as losing

`over` not stopping the world was the right call about the *bout* and, for a long time, it
was also mistaken for a call about the *body*. `beaten()` has named the head since it was
written; nothing else ever listened. A decapitated fighter went on walking, turning, aiming
and swinging with a stump for a neck, and the only thing that changed was the banner.

So `Fighter` now has a second kind of loss beside `armLost`. `dead` is set from `sever` when
the head or the torso comes off, and it costs three things:

- **the mind is never asked again** -- `update` returns before `decide`, which is earlier
  than the `armLost` return, because a one-armed fighter still walks and a headless one does
  not;
- **the torso stops being keyframed.** It has carried `PhysicsMotionType.ANIMATED` since
  construction, which is what lets a fighter walk without wobbling under the weight of its
  own arm and is equally what would hold a dead one upright forever;
- **every body joint drops to `body.deadJointStrength`** of its usual ceiling. Zero was the
  obvious first guess and is wrong: a body with no torque anywhere in it lands as a bag of
  capsules rather than as a person who has just been killed.

The slackening goes through `applyTuning` rather than writing motor forces at the point of
death, and that is the whole design of it. `applyTuning` is the only path that pushes CONFIG
into native solver objects, so a ceiling set anywhere else is a number nobody can tune
afterwards -- the mistake the old dummy's `stiffen()` made, where every live experiment that
edited its stiffness was measuring nothing at all. Going through it means a corpse on the
floor is still tunable, and it means `die()` is four lines.

It also exposed a latent fault worth naming: `applyTuning` used to write into `grip` and
`elbowDrive` unconditionally, and `dropArm` disposes both. Nobody had hit it because nothing
called `applyTuning` after an arm came off. `die()` calls it on every death.

The two judgements stay apart. Whether a body is finished is `Fighter`'s business and
whether a bout is finished is `bout.ts`'s, and `tests/death.test.mjs` asserts them together
in one case, because the day they disagree is the day a corpse wins a fight.

## Blood, which decides nothing

`src/blood.ts` is on the presentation side of the directory and that is the entire point.
The house rule is that cosmetics carry no authority, and the cheapest way to break it here
would have been to hang an emitter off `Fighter.sever` -- one line, and from then on the
simulation half imports a renderer, `fighter.ts` stops loading under Node, and the headless
bench and four test files go with it.

Instead it reads the log `Combat` already keeps. Every report carries the contact point, the
blade's velocity there, the damage and whether the blow severed; `HitReport`'s own comment
says the world-space triple is held "because the log is the only record of a blow that
survives it", and this is simply the second reader of that record. Nothing in the simulation
half changed except one added field, `key`, so a report can be matched back to the limb it
was filed against.

Three decisions inside it:

- **It reads the log, not `lastHit`.** That is a single slot, and there are four control
  steps inside a rendered frame to have two contacts in. The one that goes missing is as
  likely as not the one that took an arm off.
- **It adds no nodes to the scene.** A burst emits from a bare world point; a stump emits
  from the severed limb's own mesh, offset to the cut through the emitter box. So there is
  nothing of ours to outlive the body it hung on, nothing for `refreshShadowCasters` to
  sweep up, and the mesh count in the readout does not wander during a fight.
- **Stopping and collecting are two moments**, a full particle lifetime apart. A stopped
  system goes on drawing what is already in the air, and disposing at the stop makes a
  severed arm's trail vanish in mid-fall.

The one texture is drawn with a `DynamicTexture` rather than fetched. A particle system with
no texture draws nothing, and the alternative was a PNG in `public/assets` -- a fetch script,
a digest pin, a licence line and one more thing that can be missing on a fresh clone, all
for a white dot with soft edges.

## The instrument, and why it landed before the costume

`G` draws what Havok is actually solving: collision shapes taken from `body.getGeometry()`
-- the shape, not the render mesh -- the two control anchors, the error between what the arm
was told and where it got to, joint frames, and recent contacts. It creates no body, no
shape and no constraint, and `__sword.rigview.audit()` is what says so rather than a
comment.

This prototype used to have almost no divergence between what was drawn and what was
simulated: each collision shape was built *from* its render mesh, so the capsules you saw
were the capsules Havok held. An authored warrior destroys that property, and the moment a
knight covers those capsules "is that a hit?" stops being answerable by eye. Building the
costume first and the x-ray second is how a feel prototype quietly becomes a thing you tune
through a costume -- so the overlay landed first, and the sharpest check on it is still that
the sword draws as **three** boxes with the pommel protruding, because `sword.ts` adds
three shapes for five meshes. If it draws as five, the overlay is showing render meshes and
is worthless.

## The camera, and the one real decision under it

Two framings keyed by name in `CONFIG.camera`, so `CONFIG.camera[CONFIG.camera.mode]` is
the whole of the lookup and there is no table in between: `overhead` trails the fighter's
own facing, `fixed` holds a constant world bearing. `V` switches. `[` and `]` turn the
fixed bearing in 45-degree steps and are deliberately silent under Overhead, because a key
that changes a number the camera is not reading reads as broken rather than as
inapplicable.

**Aim stays body-relative**, and a fixed camera is what makes that visible: the cursor at
the right edge of the window still means "arm out to the body's right", which after a turn
may point at the bottom of the screen. Body-relative is what Die by the Sword does, it is
what makes the arm feel attached to a person rather than to the screen, and it is what
every measured number in `config.ts` was tuned against. **The verdict is provisional until
somebody has turned under a fixed camera with a sword in hand.** If it reads badly the
honest fix is a stronger aim indicator, not a rebased aim frame -- rebasing quietly turns
this into a twin-stick game, because the body stops mediating between your hand and the
blade.

## Taking a body

`C` arms it, a click takes that body, and the one you leave picks its policy back up.
`Takeover` sits beside `Targeting` rather than becoming a fourth `TargetMode`, because a
lock and a takeover are not alternatives -- you can be locked on and want to change bodies,
and folding them into one enum would have made that a state nobody had thought about. They
share the cursor, and exactly one of them may own the outline at a time.

Who is driving is a **matchup field, not a mode**: `bout.ts`'s `takeBody(state, side)` is
`withControl` and nothing else, because the matchup already answers who the camera follows,
which body the aim indicator draws for and which pair `Targeting` is pointed at. There is
one of you, so `withControl` hands the body you left back to its policy in the same breath.

The hazard is that `aimArm` maps the **absolute** cursor position to a hand target, which is
the whole reason the arm has a home you can find again. So a body taken without care snaps
its arm to wherever your mouse happens to be sitting, at the full 850 N the grip can pull.
The fix is continuity in two parts, and the second is the one the original plan for this
work got wrong:

- **The seed** inverts `spread()` so the cursor does not move but its meaning is rebased,
  and the takeover *frame* then commands exactly the pose the policy had left. Measured at
  exactly 0.000 mm, in both directions.
- **The rebase** is what makes it survive the frame after. A person's next mouse event
  writes the absolute cursor straight back in about twenty milliseconds later, and a policy
  has nothing to seed at all -- a fresh `swinger` parks at centre guard and a `duelist` on
  the covering line, regardless of the pose either is handed. So `handover(inner, pose,
  seconds)` walks the commanded cursor linearly from the found pose to whatever the new mind
  is asking for and then becomes transparent. Linearly, precisely so that it has an end.

The inner mind is driven every step of the window at its own `dt`; a policy whose cadence
stopped for a quarter of a second while its hand was rebased would be a different policy,
and the difference would show up as a swing that arrived late rather than as anything
anybody could name.

`takeover.rebaseSeconds = 0` leaves exactly the seed and nothing else, and is kept working
on purpose as the control condition for any argument about whether the rebase earns its
place. A severed sword arm refuses the **seed**, not the takeover: the body still walks, is
still hittable and is still worth driving, and `__sword.takeover.last.taken.refused` names
why rather than failing silently.

There are **three copies of the cursor mapping** in the tree -- `fighter.ts`'s `spread` and
the two directions in `policies.ts` -- and they cannot be shared, because `fighter.ts`
imports Babylon and `policies.ts` deliberately imports nothing but `config.ts`. What guards
the drift is `tests/handover.test.mjs`, which builds a real `Fighter` on real Havok and
measures the commanded jump, not a comment.

## The costume

`figure.ts` wears `public/assets/warrior.glb` by **swapping authored vertex data in
underneath the same mesh**, not by cloning nodes. `Fighter` snapshots the costume's meshes
into the set that answers `owns()`, `main.ts` snapshots them into the shadow map's render
list, and the rig overlay hides them by reference and puts back exactly what it hid -- all
three snapshots taken before an asynchronous load can have finished. A costume made of
*new* meshes would have arrived unpickable, shadowless and invisible to `G`. The fallback
falls out of that for free: a piece the asset does not name is simply never re-skinned, so a
missing, corrupt or 404'd asset leaves primitives standing and nothing throws.

No dimension is written down twice. `asset-src/dimensions.json` is generated from
`src/config.ts` and `figure.ts`'s exported `costumePieces()`, committed so the numbers the
committed `.glb` was cut to are on the record beside it, and recomputed by
`npm run asset:verify` -- so a `config.ts` edit that moves a bone without a rebuild fails a
check instead of stretching a warrior.

`scripts/check-warrior.mjs` asserts **distances in metres**, not glTF structure. Structural
validity is not what can go wrong here, because a container Blender cannot write is a build
that failed loudly; a crown 90 mm too high loads perfectly, validates perfectly, and is
wrong.

Per-side colour is applied in `figure.ts` rather than authored into the asset, because
there is one asset and two fighters, so an authored colour could only ever have been one of
the two and the wrong one would have looked deliberate.

## Two arms, and what is in them

The seam was one hand for as long as there was one arm. `Intent` carried nine flat fields,
`Fighter` carried eleven singular arm fields, and the off arm was two capsules on gait-driven
motors with no hand, no anchor and no grip -- it counterswung while you walked and there was
nothing you could put in it.

Three things changed, in this order, each landing green:

**`Arm` came out of `Fighter`.** Two hundred lines of constructor and four per-step methods,
moved wholesale. It is a class because every piece of state it carries -- the pose scalars,
the previous frame's basis, the commanded spin the grip damper measures against -- is state
two arms must not share; one `prevX` serving two chains is the second arm being handed the
first one's history every step. The acceptance was that the arm did not move, and it did
not: 45.27 mm of peak commanded-to-actual error before and after, identical to the
hundredth of a millimetre. Every name the outside used -- `fighter.sword`, `fighter.grip`,
`fighter.handAnchor` -- is a getter onto `arms.primary` now, which is why the overlay and
sixteen handover tests needed no edit.

**`Intent` grew a hand.** `HandIntent` is the five fields that belong to a hand -- two
cursor axes, the wrist, thrust and guard -- and `InputState` is the four that belong to the
body plus two of those and a `driving`. Splitting them out rather than adding a second set
of differently named fields is what keeps the two hands alike: there is no `pointerX` and
`offPointerX`, no hand that is the real one and a hand that is the afterthought, and `Arm`
takes one without caring which it is.

The vocabulary lives in `mind.ts` and not beside `InputState` in `input.ts`, and the
direction of that import is load-bearing. `mind.ts` takes `InputState` as a **type**, which
erases, so the DOM never reaches a headless harness. Declaring `HANDS` on the far side and
importing its *value* back reversed that in one line and took `fighter.ts` out of Node's
reach with it -- five test files failed at once with "Cannot find module .../src/config".

**One mouse, two hands.** `splitMind` runs a person and a policy every step, takes the feet
and the driven hand from the person and the other hand from the policy, and `F` moves the
cursor between them. Splitting the *cursor* instead -- half the screen each, or a modifier
held down -- was the obvious alternative and is worse: the mouse being spent entirely on one
blade is the whole reason this reads as Die by the Sword, and halving it would make both
hands worse to control in order to avoid making a choice. The spare hand takes the side's
*own* policy, the one it becomes the moment you step out of it, so there is nothing new to
choose on the screen. House rule 1 survives: what reaches the fighter is still one `Intent`
of the same shape a person produces.

## What is in a hand

`Weapon` replaced `Sword`. Three kinds and an `empty`, all sharing one local frame -- +Y
along the weapon, +X the edge, +Z the flat -- which is what lets `Combat` ask the same four
questions of any of them without a branch.

- A **shield** is a plate whose face normal is +Y. It scores nothing and blocks nothing by
  rule: the collision layers had said since they were written that an enemy blade and this
  side's weapons may touch, so blocking needed a shape and not a rule. What it did need was a
  *record* -- `limbFor` answers nothing for a weapon body, so a blade stopped dead and a blade
  that missed produced the same readout, which is none. `Combat.parried` files the difference.

  It is also the one kind that is **held rather than aimed**, and getting that wrong was the
  whole of why it looked like a toy. See below.

### A shield is held, not aimed

Every weapon welds into the fist through one frame, and for a long time it was the blade's:
the weapon's +Y went out along the arm. For a shield that is a lollipop. Its +Y is the face
normal, so the plate faced wherever the arm pointed -- a hand resting at its owner's side
laid the plate flat like a table top through his hip, and a hand on a guard faced the plate
at the floor. A shield has to be able to face the front from any pose an arm can be in, and
the only mount that allows that is the real one: strapped across the forearm, face square to
the arm rather than along it. `mountFor` in `weapon.ts` is that decision, one pair of axes
per kind, and `roll` -- which turns the hand about the arm -- becomes *where the shield
faces*, with zero square to the fighter's own front.

Two things fell out of it, and the second was a real bug rather than a matter of taste.

**Every weapon was being built in the wrong frame.** A weld between two frames that disagree
at construction is a violation the solver clears on the first step, and it clears it by
flinging the thing. Peak tip speed in the first fifth of a second of a fighter standing
perfectly still, before and after building each kind in the frame its own weld demands:
sword 48.3 -> 23.9 m/s, club 80.4 -> 19.1, shield 26.8 -> 3.5. The policy table's "struck"
column has always carried that flick in it, because a peak over a bout is a maximum and the
flick happened on frame one of every bout ever measured.

**And a shield deadlocked its own arm.** The plate stands 110 mm off the fist along the
hand's +X; a hand built in the torso's frame has its +X pointing *at* the torso; so the off
hand's shield was built inside its owner's pelvis, on the layer that says the two may not
overlap. The contact pinned the arm at full extension before it had lifted once, so the hand
never re-orientated, so the overlap never cleared. A shield arm tracked its anchor 350 mm
away where a sword arm tracked it to nothing -- and every visible symptom of that was a
*pose*, so no amount of looking at the pose was going to find it. `handFrame` builds a
shield hand already turned to the front, and the stray goes to zero.
- A **club** has no edge, so `scoring.ts` never asks about its +X and a blow is worth what
  its speed is worth. It hits harder than an unaimed cut and less hard than a placed one,
  and it severs -- because a club that could never sever could only win by flattening all
  thirteen parts, which is not a weapon so much as a chore.

`scoring.ts` took the kind as a **defaulted third parameter**, which is why all eleven of
its original cases still call it with one argument and still pass unedited. The damage model
this prototype was tuned against is still exactly the damage model.

### Two shields, because there are two ways to hold one

The strapped shield above was still wrong, and the way it was wrong is the same shape as the
lollipop: one hold was being asked to be two.

A **buckler** is not a small shield, it is a *differently held* one. It is gripped on a bar
behind its boss and punched out on the end of a straight arm, so its face runs **along** the
arm -- which is the blade's mount, the very mount a heater shield had to be taken out of. It
therefore needs none of the strapped shield's machinery: no `handFrame`, no square-to-the-
front hand, no conditioning. It faces wherever the arm points, which is always directly away
from its owner, and that is the whole of the rule the owner asked for. `mountFor("buckler")`
is `mountFor("sword")`, and `tests/shield.test.mjs` asserts they are the same object's worth
of numbers so nobody "fixes" it later.

Two predicates rather than one string comparison in five places: `isShield` (covers, scores
nothing, goes on the layer its owner's trunk can stop) and `isStrapped` (mounted across the
forearm, and everything that costs). They are different questions and a buckler answers them
differently.

**The strapped shield's frame is seeded from the radial now.** It used to be seeded from the
torso's *forward*, and that was wrong in the commonest pose rather than in a corner. A plate
whose normal is square to the forearm cannot face forward while the forearm points forward,
so an arm held out at the enemy collapsed the seed and its direction became solver noise.
Worse at rest: an unused hand sits sixty degrees below the horizontal, and the component of
*forward* square to an arm pointing down points sixty degrees **up** -- the plate faced the
sky, which is exactly what "angled almost randomly, often just vertically pointed up"
describes. Seeding from `hand - torsoCentre` is the owner's own rule, facing away from the
holder on the surface of a sphere, and it is degenerate only where the arm points along the
shoulder's offset from the chest, which is one corner of the envelope rather than its middle.

It is also **body-relative and knows nothing about the enemy**, which is what keeps it out of
the seam. A plate that turned to face an incoming blade would be defensive aim-assist, and
`Arm` has no view to do it with even if that were wanted.

The board comes in as well: `standOff` halved, the fist slid back along it, and a **reach
ceiling** so the elbow is bent. That last one is not the knob the previous session removed --
that was a *floor* under `reachGuard`, refuted because lifting the reach moved the plate
closer to the head. This is the opposite bound and that measurement argues for it.

**What none of it fixes is placement**, and the numbers in `docs/measurements.md` are blunt
about it: an arm pointed at the enemy shows him 0.033 m^2 of a 0.26 m^2 board, and an arm
held across the line shows him 0.190. The mount decides what the plate *can* do and only
whoever is aiming the arm decides what it *does*. That is the next session and it is the same
change as teaching a policy to fight with both hands.

### The two-handed club, which was wrong twice

The design was two motorised grips pulling one haft, so that the 850 N ceilings add up on
their own and "the strength of both arms" needs no number. It is refuted by measurement,
and the two ways it was wrong are both worth keeping.

The first version handed both arms the same `HandIntent`. Each arm builds its target from
its *own* shoulder, so one pose became two targets 0.42 m apart across the body, on a haft
that holds the fists 0.26 m apart. Mean hand error went from 5.95 mm one-handed to 95.70 mm.

The second version sent the trailing hand to a point the leading one computed -- which is
right, and still not enough. Sweeping the trailing grip from nothing to full found **no
setting at which the second motor helps**. It cannot: the two chains disagree about which
poses are reachable, and two position motors asked for poses their chains disagree about
pull against each other. The falling reversal count as it strengthened is what says it was a
tug-of-war and not the chatter it would be easy to mistake it for.

So the trailing hand is a passive linkage -- welded to the haft, adding mass and inertia and
no force -- and the strength of both arms is carried by `club.leadGrip` on the hand that has
the weapon. Set to exactly two arms' worth, which is also, on the sweep, where it measures
best: the club then tracks at 4.95 mm mean against the sword's 4.21.

## The costume, second time

Both arms are dressed now, where the sword arm was deliberately bare. That exemption was
right when there was one simulated arm and it was the subject of every measurement; with
two, it leaves a fighter in half a shirt, which reads as a bug rather than as an instrument.
`G` is the instrument, and it takes the whole costume off.

### The textures that were tried, and are not there

The asset briefly gained UVs and tangents and the palette briefly gained four CC0 tiling
maps. All of it is reverted, and the way it failed is worth more than the feature was.

Two things were wrong and only the second mattered. A **diffuse** map multiplies
`albedoColor` in Babylon rather than replacing it, and a photographic diffuse averages well
below white, so the whole scene came out at about a third of its brightness and both
fighters read as black cutouts -- the palette colours are the identity of each surface and
the thing a surcoat is tinted with, so the half to give up was the photograph. Dropping to
**normal maps alone** fixed the brightness and then did something much worse: every material
carrying one stopped rendering. The warriors lost their helms, pauldrons, collars and
breastplates while the untextured flesh and the cloth beneath kept drawing, so a fighter
became a head and a surcoat with arms floating beside it.

**Every piece was present, visible, and in exactly the right place throughout.** Bounding
boxes proved it, at the build pose and driven. That is what made it expensive: three
separate wrong diagnoses came from probing state instead of looking -- a stale HMR scene, a
`scene.materials` list that does not contain every material, and `Material.isReady(mesh)`,
which returns false for everything outside a render pass and is not the question anybody
thinks it is. What settled it in one step was stripping the maps at the console and taking a
screenshot.

**It is still not good enough.** Twenty-four welded primitives in flat colour is not
finished art, and both arms being dressed is the only part of this that survived.
`docs/measurements.md` records what the two ways forward actually cost.

## The house rules this work was done under

The full list is in `AGENTS.md`. The three that shaped the code rather than the process:

- **Cosmetics never carry authority.** `figure.ts` owns no collision and decides no hit.
- **The overlay creates nothing.** Pinned by `__sword.rigview.audit()`, not asserted in a
  comment.
- **No feel complaint is fixed by raising a motor ceiling without a measured before/after
  table beside the number in `config.ts`.** Every number in the `arm` block was set that
  way and each one carries its table.
