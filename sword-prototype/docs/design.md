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

`src/physics.ts` names six layers -- `WORLD`, `LEFT_BODY`, `LEFT_SWORD`, `RIGHT_BODY`,
`RIGHT_SWORD`, `DEBRIS` -- and each side's blade collides with the other side's body, the
world and debris, but not with its own. Self-pass-through is kept **deliberately**: Die by
the Sword lets you cut yourself and it is one of the things people remember about it, but
turning it on changes every number the arm was tuned with, so it is a separate decision
with its own measurement.

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

## The house rules this work was done under

The full list is in `AGENTS.md`. The three that shaped the code rather than the process:

- **Cosmetics never carry authority.** `figure.ts` owns no collision and decides no hit.
- **The overlay creates nothing.** Pinned by `__sword.rigview.audit()`, not asserted in a
  comment.
- **No feel complaint is fixed by raising a motor ceiling without a measured before/after
  table beside the number in `config.ts`.** Every number in the `arm` block was set that
  way and each one carries its table.
