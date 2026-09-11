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

The arena-facing seam is now `ControlEndpoint`, not `Mind`. Every body publishes a surface tag,
an installed-driver getter and an optional recording port. The host observes both bodies before it
steps either installed driver; that ordering is the fairness rule, not an implementation detail.
The humanoid endpoint keeps `Mind`, `FighterView` and `Intent` together behind `humanoid-v1`, while
a later endpoint for a differently-shaped body can carry its own requests without fabricating a
humanoid view or widening `Intent` into an untyped command bag. Installing a driver whose surface tag differs is refused with
both surfaces named.

Definitions publish the drivers their surface can actually construct. Changing a body keeps an
incompatible saved choice visible and blocks Fight until the player chooses a valid driver; it does
not quietly install Idle. Human injection is a typed adapter supplied only by the page, with the
existing achieved-pose seed and hand-ownership source. Headless bodies omit it. Recording follows
the same capability rule: the humanoid endpoint owns the intent/view tap, and a surface with no
recording port is not sampled through a made-up `FighterView`.

```ts
interface Mind { decide(view: FighterView, dt: number): Intent }
class Controls { readonly state: Intent; readonly camera: CameraGestureState }
```

`Intent` is declared in `mind.ts`, and the human's controller is annotated as producing
one. It was the other way round until session 15 -- `type Intent = InputState`, an alias
onto the controller's own state, on the argument that two structurally identical
declarations part company the first time only one of them is edited and the compiler says
nothing. That argument was right; the direction was wrong. Aliasing made *whatever the
controller happened to hold* the definition of a combat command, and a person's controller
has a mouse wheel on it, so `zoom` -- a camera factor no fighter has ever read -- was a
field on every policy's command, a column in every movement partial, a key in the
intent-parity sweep and a number in the promotion evaluator's finiteness gate. A false
action dimension is worse than a duplicated field, because it gets measured and learned
against. One annotation buys the same drift protection with the fighter as the authority.

**The human and the AI share the combat command; camera gestures are host-only.** Wheel
zoom, orbit yaw and pitch, and pan live on `CameraGestureState` in `src/camera.ts`, which
`Controls` owns and `main.ts` frames every shot from. No mind can see them and no mind can
move them.

So **a policy plays with the controller you play with.** It gets forward, strafe and turn;
normalized crouch, trunk lean and trunk twist; and, for each hand, cursor position, reach,
anatomically bounded forearm roll, 0..90-degree wrist bend, thrust and guard. It cannot
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
- *`FighterView` carries no part positions* -- a ground point, shoulders, weapon tips,
  natural-attack reach, body scale facts and a health map with no part coordinates attached.
  "The nearest soft part" is therefore not a question the view can answer. Unit definitions
  publish crown, vital height, collision radius and legal reach, so policies can aim and
  judge opportunity across Warrior, Broot and Centipede without reading meshes or branching
  in the host.

Session 16 added the two facts a policy needed to tell an arriving strike from a departing
one, and neither of them is an interpretation. Every hand publishes `tipVelocity` beside
`tipSpeed`, because a blade withdrawing at 8 m/s and one arriving at 8 m/s are the same
number and every guard in the tree was built on that number. And `FighterView.projectiles`
carries every `live && !spent` shaft from both sides -- position, velocity, age and whether
it is yours -- in world space, with no `willHit`, no `timeToImpact` and no `aimedAt`. Turning
a position and a velocity into "will it reach me, and when" is the reader's job; doing it in
the view would be publishing a future collision, which is the one thing this seam has never
been allowed to do. The array is reused and trimmed rather than replaced, and each body owns
a pool of records per role it publishes in -- two pools, not one, because the same shaft is
`self` in its owner's view and `opponent` in the other's, and a shared pool would have the
second observation of a step rewrite the label the first had just published.

**`tipSpeed` changed meaning in the same session, and that is a behaviour change rather than
a widening.** A hand holding nothing used to publish a literal zero, so a bare fist was a
thing that could not be moving; it is the fist's own material-point speed now. Every v3-era
reader sees it -- `duelist`'s commit threshold, `swinger`'s, and the `*_tip_speed` feature
columns -- and what it does to the hand a scripted guard actually covers is measured under
"Threat selection, reconciled" rather than left to be found. Publishing it is also not free:
Havok's `getLinearVelocityToRef` allocates behind the name, so the view is written to a
budget of *boundary reads* -- two for a held weapon, one for a bare fist, one per shaft in
the air -- and a test counts them.

`Fighter.observe` publishes the view in place, one object per fighter -- `decide` runs 240
times a second per side, and a freshly allocated view would be the largest single allocator
in the prototype. What `observe` may read is tightly constrained; see the render-id trap in
`AGENTS.md`, which is the most expensive lesson in this directory.

### The option layer, and where a controller stops

The seam a policy plays through is not the seam a body is built at, and the layer between them is
`src/options.ts` over `src/action-primitives.ts`. Five movement choices compose with seven hand
actions, so closing or circling composes with cover, cut, thrust, punch, shoot or bite -- and
since session 17 the hand half also names the exact effector, the target region and the body
stance, which is tactic v2 below. Every producer of a decision hands the layer ordinary `Intent`
under a bounded persistence interval; nothing in it produces a pose directly.

**The learned half of this section went on 2026-09-04**, with `src/learning/`, the four research
runners and their artifact, mask and tournament machinery; see "What was removed on 2026-09 and
why" at the end of this file. What survives is what the option layer owns on its own, and the
central rule is one of those: an action, effector or target this body cannot perform is refused
**by name** rather than substituted with a legal one, because repairing a decision into a tuple
nobody chose is the silent redirection this layer exists to remove. `handActionOption` throws with
the tuple in the message and `tests/options.test.mjs` sweeps every action, effector and target
over six bodies to say so.

One function, `selectThreat` in `src/action-primitives.ts`, answers *what is worth answering* for
the cover skills; there were three divergent copies of that question and two of them drove motor
execution, so a policy could be guarding one blade while its perception watched another. It ranks a
tip by how fast it is going *and* how near its path takes it to the vitals, not by raw speed, and
the hand a scripted guard covers therefore moved -- measured, with the win rates either side of it,
in [measurements](measurements.md).

**Tactic v2: an action is not a decision until it says what performs it, at what, and how the
body stands.** Action v1 named an action and stopped, and three ambiguities rode on that
silence. A dual wielder could not ask for its off sword -- the option searched
`[preferred, other]` and answered with whichever hand could, so a request for the primary was
executed on the secondary and nothing said so. Every attack replayed one fixed aim at the
opponent's shoulder line. Crouch, lean and twist were animation welded to the action name.
Session 17 Stage B closed all three in the execution layer, and Stage C2a widened the deleted
learned controller's output contract from thirteen values to twenty-six so that it could name
what Stage B made namable. The execution layer is what remains, and it is the half that was
worth having:

- **The effector is exact, and since session 18 it is also honoured.** `handActionOption` is
  handed the effector it will use and either uses it or refuses by name; the silent search
  survives as `chooseEffector`, which is the *caller's* decision and is named at every call
  site. **Exactness is not the same as being obeyed, and for the two defensive skills it was
  not**: `cover` and `recover` put the named hand on the covering line and then put the *other*
  hand on the same line, so `cover` on the primary and `cover` on the secondary produced
  byte-identical arm poses -- `intent.actingHand` was the only field in the whole command that
  differed, and 24 bouts of each against `swinger` on a `sword+shield` body agreed to the digit.
  A shield in the off hand could never lead a guard even when the decision named it. The named
  hand now holds the line and the supporting hand steps outboard off it by
  `ACTION_TUNING.guardSpread`, which is `planOffHand`'s rule in `policies.ts` and its measured
  number; a bare supporting fist is excluded, because a fist is small and is already the nearest
  thing to the line. Leading with the shield rather than the sword is worth 87.5 blocks a bout
  against 63.6, of which the shield takes 56.9 against 32.0, and 13 deaths in 24 against 20
  (`.review/coverblock.mjs`, 24 bouts a cell; the 60-bout re-run is in `docs/measurements.md`).

  A two-handed weapon leaves one hand free to act -- `Fighter.update` drives the leading arm and
  sends the trailing one to a point on the same haft, ignoring its half of the command -- so an
  action named on the trailing hand is refused rather than posed and discarded. `punch` therefore
  stopped being advertised on a bow body, where it had always been posed onto an arm nothing
  reads; the look-ahead training schedule had never offered it there, so **the `bow+empty` row of
  the runtime mask now agrees with the training one**. That was one loadout of seven then -- two
  of the thirteen cells, one on each humanoid unit -- and the traffic went the other way as well:
  `sword+empty` and `axe+empty` leave a genuinely free off hand, so there the *schedule* was
  wrong and it was corrected there. All seven loadouts agreed as of stage C1, and all **eight**
  do now: `sword+axe` was added to the strata afterwards, because with it absent no loadout in
  the matrix gave an *attacking* action two legal effectors and the tuple contract's effector
  head could only be judged on the two weaponless cells. Seven loadouts became eight and thirteen
  cells became fifteen -- the two counts do not move together, which is a distinction this
  paragraph got wrong once already. **What that
  agreement covers is intact bodies**, because a schedule row keys on the loadout a body started
  with while the mask keys on what is still attached; capability loss is answered a layer down,
  by the look-ahead searching only cells it has a calibration for. The loadout table, the
  severed-hand masks and that filter are in `docs/measurements.md`.
- **The target is a body region derived from published facts, and it decides where a *point*
  goes.** `BodyView` publishes `vitalHeight` and `crownHeight` and nothing else about where a
  body's parts are, so `high` and `low` are three quarters of the vitals-to-crown span above and
  below the vitals and `vital` is the vitals. A fraction rather than a distance, because the
  rule has to work on a centipede 0.38 m tall as well as on a warrior 1.765 m tall; the fraction
  is chosen anatomically, and the band that puts `high` on a head and `low` in a pelvis on both
  humanoid bodies is 0.567 to 0.928, of which 0.75 is very nearly the midpoint.
  **The claim is checked against the contacted limb in a real bout.** On a `thrust` a named
  `high` takes a 0.48 head share against the measured aim's 0.09, and a named `low` a 0.82 low
  share against 0.12. `shoot` is a point like `thrust` and behaves like one, but lands two to
  four body contacts a bout in this harness, which is a hint and not a measurement.

  `cut` and `punch` are **strokes rather than points**, and how well they obey is a separate
  question with its own constant. The aim seeds an arc rather than a destination, and until
  session 18 that arc was a flat +-0.50 in cursor Y about the aim -- about +-0.85 m at the range
  a cut is delivered, more than twice the distance between two named regions -- so a stroke
  aimed at one region raked the next as readily as its own. `NAMED_STROKE_SPAN` is what fixed
  it: a stroke aimed at a *named* region now sweeps half a region spacing above and below it and
  no further, so two strokes aimed at adjacent regions never sweep through each other's aim
  point. Pooled over forty seeded bouts, a cut aimed `high` went from a 0.128 head share and a
  0.308 leg share to **0.166 and 0.239**, against `low`'s 0.019 -- so `high` against `low`
  separates 8.7x on head share where it separated 2.9x. It costs about a fifth of the cut's
  damage *rate*: less vertical travel in the same commit, so the blade arrives at 7.8 m/s rather
  than 10.1 and lands more, slower contacts. The measured line keeps its own +-0.50 and is not a
  named region, which is what keeps the scripted specialists and the `duelist-swinger` null
  control out of it. Stage B reported this defect the other way round -- a cut aimed `high`
  taking 0.045 against the measured aim's 0.071 -- from a single bout of 22 contacts, comparing
  two aims 0.012 cursor units apart. The tables both ways are in `docs/measurements.md`.
  `threat` is the existing threat-hand aim and belongs to `cover` and `recover` alone; it is
  refused by name on every other action rather than being quietly read as the measured line.
- **The stance is bounded and applied last.** Six named whole-body poses over the same
  normalized `PostureIntent` axes a person drives, applied *after* the skill's action posture
  and *before* `boundIntent`, which is the only legal slot: `applyActionPosture` zeroes all
  three axes on every call, so a stance applied above it is erased without trace, and
  `boundIntent` is what keeps the result inside the same envelope a person has.
  `action-default` is the skill's own pose; `upright` is 0/0/0; `compact` is crouch 0.55, lean
  -0.20, no twist; `extended` is crouch 0.10, lean +0.30, twist 0.55 toward the acting arm;
  `slip-left` and `slip-right` are crouch 0.25, lean -0.10, twist -0.65 and +0.65. These are
  initial numbers and are not claims -- session 23's held-out result decides whether they earn
  their place, and it should decide knowing that **`extended` is very nearly the existing
  `commit` posture** (0.12 / 0.30 / 0.68 x outboard), so during any committing action the
  six-name stance head offers five distinguishable choices rather than six.

The natural channel is the same argument one level down. A centipede
publishes `hands` as a frozen empty object and was driven entirely through
`Intent.primary.thrust` and `Intent.primary.guard` -- a hand slot it does not have was its
whole control surface, and every reader downstream carried the exception in a comment. A
command now carries `natural`, the old `Intent.driving` is renamed to
`actingHand: HandName | null`, and jaws answer `null`. That field means the same thing for a
person and for a policy -- "which hand is acting" is also what a mouse hand means -- so it is
one field with one meaning rather than the type split the plan asked for; `Controls.state`
narrows it to a `HandName`, because a cursor is always on a hand.

**A person drives the natural channel from the buttons that drive a hand**, and for one session
they did not. `Controls.state.natural` was initialised and never written again, and `splitMind`
took `natural` from the policy side -- so somebody who took a centipede from the setup screen,
which offers "you" for either side whatever the unit, could steer it and never close its jaws.
There is no second button to invent: a natural striker is aimed by turning the body, so the
same left and right mean the same two things to jaws as to a hand, and `applyButtonPose` in
`src/buttons.ts` writes one press onto both. Nothing switches on the unit -- a hand slot is
inert on a body with no hands and the natural channel is inert on a body with no natural
attack -- which is house rule 1 kept rather than a branch added.

### The integrated authority check

Every humanoid picker policy is built with every setup-reachable two-hand equipment choice,
stepped through the real Havok pair, taken to a verdict and disposed. Unit-specific suites
exercise Broot and Centipede compatibility, anatomy, damage, severing and disposal. Complete
bouts reject non-finite or out-of-envelope
body, cursor, roll and wrist commands. Running the same seeded bout in fresh solver instances
with every costume enabled versus disabled produces the exact same outcome, contact stream
and fight record. That is the executable form of “cosmetics carry no authority”: visibility
may change; physics and scoring may not.

## One combat seam, three body kinds

The host builds a typed `Combatant` from `UNIT_REGISTRY`; it does not switch on body kind.
Warrior and Broot are `Fighter` profiles with an animated pelvis locomotion frame and a
genuinely simulated torso on a motorised waist. Head, both arms and both legs are dynamic,
hittable and severable. Broot scales geometry, mass, health and joint force explicitly while
trading away walking and turning speed; it is not a cosmetic scale transform.

Centipede implements the same combat seam independently as a nine-body low crawler. It has
no hand slots, accepts only the crawler policy, and publishes a natural bite striker. Its
head and eight articulated segments own their own damage, sever and disposal lifecycle.
The setup projection and compatibility checks are derived from the registry, so an unknown
unit, incompatible policy or unsupported item is refused by name rather than silently
coerced to Warrior.

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
- **`over` revokes combat authority but does not freeze the world.** Both minds and both
  contact scorers stop on the edge. The animated pelvis and dynamic torso are settled, while
  corpses, blood and loose physics continue; freezing the scene would turn a verdict into a
  pause and prevent the fall that makes the result legible.

### Vitality is derived from local injury

There is no second mutable hit-point pool. Every limb keeps local `health` and `maxHealth`
for injury, gait and severing, while the one HUD vitality value is derived each time:

```text
injury(part) = 1 - clamp(part.health / part.maxHealth, 0, 1)
vitality = clamp(1 - sum(injury(part) * weight(part)), 0, 1)
```

Head and torso each weigh 1.0, pelvis 0.50, every upper arm, forearm and hand 0.10, and every
thigh and shin 0.125. Zero head or torso health is therefore fatal by itself, while a severe
combination of non-vital wounds can also exhaust the body. `src/config.ts` is the sole tuning
authority for those weights; `src/bout.ts` owns the pure formula and refuses an unknown part
instead of quietly giving it no effect. This is why arrows and fists can finish a bout without
being allowed to sever, and why local damage remains meaningful after the HUD stopped showing
twelve competing life bars.

### Combat values are low authoritative units

Combat-value ruleset v2 is a unit migration, not a display divisor. An ordinary Warrior part is
5 durability, its torso is 10 and its pelvis is 9; ordinary attacks are consequently measured in
roughly 0..3 damage. Any body's part durability and flat armour use the same unit at the
damage-authority boundary. A value around 6 is modest, 10 is good, 15 is a lot, and 100 is
effectively invincible in ordinary play.

The v1-to-v2 migration of the saved construct library, and the divide-by-20 that carried it, went
with the Forge on 2026-09-04. The unit above is what survived it.

### A blow is the energy that arrives, and a mechanism that spends it

Until 2026-09-07 `scoreHit` was a speed ramp. Every kind had a floor in metres per second, a
reference speed to divide by, a clamp at 1 and a per-weapon scale, and **the thing being hit did
not enter the calculation at all**. That is why a 48 kg maul and a 0.65 kg fist arriving at the
same speed differed only by whatever number somebody had written in the row that day; why the
same maul was worth the same on a 9.4 kg arm link as on a 139 kg trunk; and why every new striker
-- the ram plate, the stone fist, the whip bead -- needed a row and a reference mass of its own,
each argued on its own afternoon against a Warrior, with no rule anywhere relating a stone fist
to a sword.

There is one rule now, and it is the physics:

```text
mu = m M / (m + M)                 the reduced mass of striker and struck part
E  = 0.5 mu v^2                    v the striker's speed along the contact normal
damage = quality * E / joulesPerDamage
```

`impactEnergyJ` in `src/scoring.ts` is those two lines and nothing else. Three things follow that
were arguments before and are consequences now. **A heavier striker saturates**: `mu` tends to
`M` as `m` grows, so a 48 kg head can give a 9.4 kg link no more than the link's own share, and
only on a trunk does its mass pay in full -- on a limb a maul is a mace is a fist, and on a chest
it is four and a half times what it was on the limb. **A part that cannot move takes everything**:
Havok reports a mass of zero for a body it does not integrate, which means immovable rather than
weightless, so `Combat` hands `impactEnergyJ` an `Infinity` and the striker's whole kinetic
energy arrives. And **speed is squared**, so nothing saturates on that axis any more: a blade at
22 m/s is worth four times one at 11, where the ramp paid both the same.

Three mechanisms spend the energy, and a `BITE` row now carries a kind, a mechanism, a floor and
one constant:

- *blunt* -- club, whip, bare hand, stone fist, ram plate, plate bash -- `E / crushJoulesPerDamage`,
  quality 1, because there is nothing to place;
- *edge* -- sword, axe -- `quality * E / cutJoulesPerDamage`, the edge and blade alignment gating
  it exactly as before, so a badly placed cut still pays almost nothing;
- *point* -- thrust, arrow, a centipede's bite -- the projectile row's shape: the energy taken
  again at the *axial* speed, a floor subtracted rather than gated, and what is left over
  `PROJECTILE_PENETRATION_V1.joulesPerDamage`.

The three constants are anchored on the Warrior so that the game the prototype was tuned against
is still that game. A perfect 11 m/s cut with the 1.35 kg sword on a 68 kg torso is 2.3 damage
and a square club blow at the same speed is 1.7, both to the digit they were before; that fixes
`cutJoulesPerDamage` at 34.82 and `crushJoulesPerDamage` at 115.24, and the axe's 25.93 is the
same arithmetic on its own row. Every other number in the game follows from the masses. The
floors are the old speed floors restated: `cutFloorJ` 5.96 J is the sword's 3.0 m/s on a torso,
`crushFloorJ` 7.84 J is the club's 2.2, `pointFloorJ` 1.12 J is the arrow's 8.0. Stated in joules
they no longer answer only for the weapon they were derived from -- which is the whole point, and
also why a Warrior's *punch* moved: 0.65 kg of hand needs 4.94 m/s to clear the same 7.84 J that
3.4 kg of club clears at 2.2.

What was retired with the ramp: `damageScale`, `chopScale`, `crushScale`, `fistScale` and
`ramScale`; the nine speed floors and reference speeds those ceilings hung on; the three reference
masses `clubReferenceMassKg`, `fistReferenceMassKg` and `ramReferenceMassKg`; and the `mass` and
`impulse` mechanisms that existed only to write a mass ratio into a table. Every striker in the program
publishes `Striking.impactMassKg` and the field is required, so a striker with no mass is a
refusal rather than a zero.

**The closing speed is the striker's own, projected on the contact normal, and that is a
correction the measurements made to the plan.** The right physics is the striker's velocity less
the part's, and it is not available here: a collision callback runs *after* Havok has solved the
contact, so the part has already been given most of the striker's normal velocity by the time the
callback asks. Measured over a golem bout, the relative normal speed reads 1.56 m/s at the median
against the striker's own 2.25, and on a keyframed striker that cannot be slowed it collapses from
8.0 m/s to 0.39. What survives is the projection, and it is what ends the rake: a golem's median
contact arrives at 46 % of its tip speed, and squared that is a fifth of the energy, so a blade
sliding along a body is worth almost nothing where the ramp paid it a fraction of a cut.

**And one guard, because taking the lid off exposed something the lid was hiding.**
`CONFIG.combat.impossibleSpeed` is 40 m/s: above it a contact is refused as `impossible-speed`
rather than scored. The solver occasionally flings a striker -- 136 m/s in one measured fixture,
149 m/s on the *old* model in the same instant of the same fixture -- and the ramp threw those
numbers away by clamping at 11. Squared, they are a hundred and fifty times a clean cut and they
end a bout in a second. The bar is placed above every blow measured in 1,710 real contacts (the
fastest was 33.2 m/s) and far below every excursion, it is checked on the unprojected tip speed,
and projectiles are exempt because a bow authors an arrow's speed. It is a refusal rather than a
clamp so that a run can count how often it fires -- `runBout` passes `onRefusal` through for
exactly that, and it fires on 0.65 % of golem contacts.

**What the rule costs, which the reader of this section needs to know before using it.** The
model is right about relative worth and it made the golems stop finishing: three quarters of
every contact a golem lands is now under its own mechanism's floor, damage a stroke fell by a
factor of six, and four bouts in five run out the 60 s cap. No constant is responsible -- the
anchors are the Warrior's own unchanged numbers, and the club, the one striker with real mass
behind it, still pays properly. What is missing is arriving speed along the normal, and the
levers are the committed stroke shapes and the cap. The Session 03 entry of `measurements.md`
carries the distributions; the state is the owner's to accept or move at that session's gate.

### One claim per part per stroke, and the two ways to be blocked

A contact is billed once per part per `CONFIG.combat.hitCooldown`, 0.09 s, which is a rate rather
than an event: a blade that sweeps through a torso and stays against it books a wound eleven times
a second for as long as the two bodies are touching. On a Warrior that is rare, because an arm
that has swung carries the blade away. On a golem it was the normal case, and Session 00 of the
style set measured it -- **6.6 to 7.2 blows for one pass of one weapon** -- while the owner was
watching the same fights and calling them a flail. The scoring system was paying for the flail.

So a golem striker **claims a part for the length of a stroke**. `CONFIG.combat.strokeClaimSeconds`
is 0.20 s -- longer than the burst a 0.15 s commit produces, shorter than the 0.30 s recover, and
deliberately *inside* the 0.25 s gap at which the tournament's stroke instrument opens a new
stroke, because a weapon held against a part books a blow every window exactly and a window equal
to that gap would file each of a drag's blows as a stroke of its own. `Striking.strokeClaim` is an
optional flag, and `Combat.onContact` drops a contact from a weapon carrying it when that weapon
billed *this limb* inside the window, keyed by effector and limb key beside the existing per-limb
cooldown. It is checked after the cooldown rather than before, so a
contact the cooldown was going to drop never spends a claim. `RigidStrike` sets the flag for every
golem terminal there is or will be; the Warrior's weapons do not implement the field, which is why
every pinned Warrior cell in `tests/scoring.test.mjs` is byte-identical across the change.

The claim is **per part**, not per stroke, and that is the half that is easy to get wrong. A rule
that let one pass bill one part would have replaced a rake with a poke; a sword swept across a
body should reach an arm and then a chest. In the arena fixture in `tests/golem-arena.test.mjs` a
stroke bills 2.29 parts, and the tightest interval between two blows on one part by one weapon is
exactly the window.

**A plate is a shield.** The owner, 2026-09-06: "the shield is an indestructible damage sink". It
is not a large health number -- `Golem.limbFor` refuses a shield's body outright, so
`Combat.onContact` finds no limb to wound and takes the parry path a Warrior's shield has always
taken, and `Golem.parriedBy` answers `{ kind: "shield" }` so the contact is filed as a
`block:shield` report with zero damage. A plate is therefore untouched after forty blows or ten
thousand. Its vitality weight is zero for the other half of the same sentence: a part no blow can
reach that still carried 0.8 of a 3.6-point bar would have made a shielded golem 22 % unkillable,
which is a different thing from a damage sink. It keeps its mass, because the mass is what makes
it a wall.

**A held weapon is the other kind of block, and it is still wounded.** `Limb.guarding` is true for
every part of a module in a hand slot, set at assembly; `Combat` puts `guarded` on the report
event, and `src/recorder.ts` credits the defender with a block on the same de-duplication a
Warrior's shield gets, while the striker's own row books the contact and its damage. A blade that
meets a blade is a parry that costs the blade, which is what a weapon's health row is for.

Between them the two rules give the `blocks` column an identity rather than a threshold: every
block either body books is either a plate stopping a blow or a blow that found something the other
body was holding, and there is no third source. It also gives the column a value at all -- it read
zero on all 4,096 sides of the Session 00 baseline, because before this nothing a golem had could
block. The measured cost is longer bouts, and `docs/measurements.md` has the table.

## Setup is a screen; pause is a mode

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

Underneath all three was one design fault: **presentation was inferred from the phase.**
`showCurtain(show: boolean)` derived which controls to show *and* what to write on the
button from `phase === "select"`, and a pause was the setup screen with two blocks hidden by
a class. So anything that moved the phase silently changed what you were looking at.

The first repair stated two curtain screens explicitly. That fixed the state transition,
but a full-screen pause still replaced the game view and made a screenshot of a visual bug
impossible: the act of focusing the capture tool hid the evidence. Pause is therefore no
longer a screen at all. `ArenaPresentation` owns two independent targets: `#curtain`
replaces the arena only for setup, while its compact `#pause-menu` sibling sits inside the
visible game view. It has Resume, Restart and Setup actions, occupies no viewport backdrop,
and leaves the frozen canvas, HUD and composition readable.

The rule itself went to `bout.ts` as `pauseAction(phase, running)`, with a test, for the
reason everything else in that file is there: it is a rule, it was wrong, and it was wrong
in a way that could only be found by starting a browser and waiting sixty seconds. It
returns `pause`, `resume` or `nothing` and **never a phase** -- a key that pauses and a key
that leaves for setup must not be the same key. `R` restarts the same matchup; Setup in the
pause controls is the explicit exit.

The render loop keeps painting while paused, because a frozen frame that disappears cannot
be inspected. Middle-drag orbit, Shift+middle-drag pan, wheel zoom, `V` and the bracket bearing
keys remain host-owned presentation controls in that mode. `Controls.pauseCombat()` withdraws
combat authority without withdrawing camera authority, and `runHostFrame` places camera/occlusion
after the simulation gate. One host gate owns every game-time mutation, including presentation notices;
physics is disabled and blood particles use Babylon's zero-update-speed frozen state. Focus
loss and hidden visibility are idempotent pause edges and focus return never resumes. A
manual pause was refused during the timed portion of the guided playtest, which went on
2026-09-04; nothing refuses one now.

The cap that ships is now a safety net at 600 s, and `scripts/measure.mjs` sets its own 60
at the top, where the argument for 60 lives.

The seventeen-row key list went with it, to a `?` overlay. It was on the curtain above the
Fight button -- `style.css` already capped the panel height and scrolled it
because the list plus the matchup overflowed a laptop window, which is a Fight button below
the fold. A controls sheet is also something you want mid-fight, which a curtain cannot be.

## The matchup screen, which is the arena with the physics off

The setup screen used to be a form: a unit picker, two hand pickers, nine golem dropdowns, a
policy select. It told you what a golem was made of in the registry's own words and showed you
none of it, and the owner's request for this set was the opposite -- *see* two bodies, draw a
new one for either side, and start the fight. Four decisions carried it.

**A random build is a pure function of a seeded stream.** `randomGolemSetup` in
`src/golem/build.ts` draws one id per slot from the same option lists the dropdowns are filled
from -- three locomotions, two trunks, two heads, and a chain-and-terminal pair per socket from
the sixteen effectors the registry offers -- and then asks `golemSetupRefusal` the question the
screen asks of a hand-picked build. The lists only offer legal ids, so the refusal is a guard
rather than a search, and the test says so: four hundred draws, none refused. A two-socket
terminal drawn in either socket claims both, which is the maul rule from Session 02 applied at
draw time rather than repaired afterwards. The function reads the stream it is handed and
nothing else, which is what lets a seed be a name for a body: the corner records the draw as
`SideSetup.seed`, the caption under the build says *seed 2610147011*, and the URL carries it.
The moment a hand edits a drawn build the seed is dropped, because the build is no longer the
draw, and the caption says *picked by hand* instead. That rule lives in the reducers in
`src/bout.ts`, next to the two-socket mirror, for the reason everything in that file is there.

*(Session 01 of the learn set, 2026-09-09: the Randomize button draws through
`randomViableOpponent` now, which is that same function rejected until the drawn body and the one
already in the other corner are a pair that can finish each other. Everything in the paragraph
above still holds -- it is the same stream, the same refusal and the same seed -- and the section
on viability below says what is rejected and why. The nine pickers are unchanged.)*

**The showcase is the arena with the physics off.** A golem body exists only through Havok --
there is no mesh to preview without building the joints -- so the two bodies on the setup screen
are built at their start marks through the same `buildBout` path a fight uses, and the scene's
physics is simply disabled until Fight, the way `leave` already disables it when a fight is
abandoned. Randomize rebuilds through the same `rebuild` that a hand edit does, so the other
side is rebuilt identically and the bodies you see are exactly the bodies that will fight;
there is no second representation to drift. The camera is chosen by *phase*, not by camera
mode: while `state.phase` is `select`, `placeCamera` in `src/main.ts` frames the midpoint of
both fighters' feet from `CONFIG.camera.showcase` and walks round the pair once every 48 s,
and the owner's orbit and zoom gestures still apply on top. The look point is nearly at the
feet (0.15 m) rather than at the chest, because the sheet covers the bottom two fifths of the
window and a body centred on the frame stands with its knees behind the panel. It starts
side-on with the left fighter on the left of the frame, so the two corners of the sheet and the
two bodies above them read as the same pair.

**The sheet is a sheet over a live arena, not a curtain.** `#curtain` is still the element
`ArenaPresentation` shows for setup and hides for a fight, and `tests/host-run.test.mjs` still
reads the HTML as text for its balance, but it no longer paints over the arena: it is a
bottom-aligned grid with a gradient that is transparent through its middle, and its panel is a
full-width bottom sheet with two corners, a policy line, and Fight. The fight's HUD, the
tip-speed readout and the direct-controls checkboxes are hidden while the sheet is up, by a
selector on the body rather than by the host, because a readout for a fight that has not
started is noise on a showcase.

**Golem-only, with the dropdowns behind a toggle.** The unit picker and the hand pickers are
gone from the screen, by the owner's decision; the Warrior, the Broot and the Centipede stay
in code, in `withUnit`, in the URL codec and in the headless measure as regression cells, and
`golemMatchup` in `src/bout.ts` is what the screen opens with. Each corner's *Customize* button
reveals the nine per-slot selects and the parts bin, so a hand-picked build and the loot shelf
keep working exactly as before; the bin row only exists while a corner has its pickers open.
The matchup round-trips through `?matchup=<JSON>`: `matchupQuery` writes it and
`matchupFromQuery` reads it back, refusing by *shape* -- a missing side, a control that is
neither mind nor you, two of you, a seed that is not a number, a socket without a terminal --
and accepting a well-shaped link that names ids the registry does not have, because that is
`golemSetupRefusal`'s question and the host asks it next, falling back to the showcase pair
with a boot note that says which id was refused. The screen tells the host about a change
through one callback, `onSelection`, and the host rebuilds bodies only when a unit, a build or
the hands changed and nothing is refused; a policy or control change is a matchup change with
no body behind it.

## The tournament, which is the measure run a thousand times at once

Every policy the matchup set adds after this is judged on one instrument, and the instrument
had to exist before the first of them did. `npm run tournament` runs seeded golem-versus-golem
bouts across every hardware thread, over a pool of random and named builds, and prints an Elo
per policy and per policy-by-build-class with the structural columns beside each. Four
decisions, and one of them departs from the plan.

**The bout is the measure's bout, in a file of its own.** `runBout`, the arena builder, the
seed mixer and the per-side record moved from `scripts/measure.mjs` to `scripts/bout-runner.mjs`
without a line of them changing, and the measure imports them back and re-exports the two the
tests already used as a library. The golem section of the measure was run before and after the
move and printed the same tables to the digit, which is the only proof that an extraction
extracted. The runner sets no bout cap: the page's 600 s and the measure's 60 s each stay where
their arguments live, and the tournament passes its own on every job.

**A job is plain data and a run is a function of its seed.** The pool is the twelve reference
builds in `scripts/tournament.mjs` -- the default, two blades, the mace, the maul, the whip, a
pair of fists, a ram head with capped arms, a ram head with the default arms, the wheel, the
multileg, the plated trunk, and a blade on the pitch chain -- plus as many seeded draws from
`randomGolemSetup` as `--random` asks for, each captioned by `describeGolemSetup` in the file's
header line. A pairing is two draws from that pool and one of the ordered policy pairs, and it
is run twice, sides and seeds swapped. Every seed in it comes from `--seed` alone, through
`mulberry32` for the draws and the measure's `seedFor` for the bouts, so a surprising row can
be replayed rather than argued about.

**One arena per worker thread, and a fresh Havok module per bout: the departure.** The plan
froze one Havok realm per worker with the bouts sequential inside it, and the bouts are
sequential; what `scripts/tournament-worker.mjs` adds is `freshHavok` before each one. Session
11 of the sword work found that a disposed world leaves allocator and solver history in the
module, enough to flip a winner between two bouts with identical commands, and a tournament
row that depended on which worker ran the job and what it had run before would not be the row
its seed names. Rows come back in whatever order thirty-two workers finish them and are written
in index order as the contiguous prefix grows, so the file two runs produce under one seed is
the same file to the byte below its header, and `tests/tournament.test.mjs` asks exactly that
of two workers over four bouts, twice. The instance costs about a twentieth of a bout. A worker
that throws fails the run rather than leaving a hole, because a tournament with a hole in it is
not the tournament its seed names either.

**Elo, walked in index order, per policy and per policy-by-class.** A build class is the
armed terminal crossed with the reach band its hand was published at -- `blade/long`,
`mace/mid`, `none/short` -- with the band read off the *hand's* reach and not the body's,
because `BodyView.reach` is the primary socket's and a capped primary with a whip behind it
publishes the cap's 0.24 m there while lashing at two. A mirror bout of one policy on one
class moves no rating and is kept for its columns. The columns travel with every row and are
printed beside every rating, because they are the measures that earned the owner's first yes
and a rating that rose while they fell would be a rating of the wrong thing: damage and
contacts a bout, severs, the winner's remaining bar, the fraction of samples spent inside one's
own inner radius, the fraction of bouts with a lead change, and the median length. Raw rows go
to a JSON-lines file under `tournaments/`, gitignored, refused on reading by version; what is
committed is the summary in `docs/measurements.md` with the seed that regenerates the file.

## The fencer, which reads the other arm and times its own against it

*Session 05 of the matchup set, 2026-09-06. Implemented; the human gate is open.*

A second scripted golem mind, `golem-fencer`, in `src/golem/tactics-v2.ts`, registered beside
the duelist in `src/golem/golem-policies.ts`, `src/mind.ts` and `src/units.ts`, and offered on
the same golem surface. The duelist does not move: it is the baseline every tournament reads the
fencer against, and the plan's rule that the new file *starts as a copy* is kept in the one
sense that matters and dropped in the other. The state machine is written out again in full,
because that is the thing that changes; the arithmetic under it -- `writeAim`, `aimAt`,
`reachForDistance`, `watch`, the stroke shapes and the capability predicates -- is imported
from the duelist's file with its behaviour untouched, because a second copy of the envelope rule
would be a second place for it to be wrong.

**It reads the duelist's view and nothing more.** The frozen choice from Session 00 stands: an
opponent publishes positions, tip speeds, its hands' weapons and reach, and per-part health, and
never its capabilities. Every one of the fencer's eight features is a constant in
`GOLEM_TACTICS_V2` with a switch, so a tournament can turn it off with `--override name=value`
and say what it was worth, and `golemFencer` takes the table as an argument so a test can hand
it a copy with one feature off. The features are: reading their stroke's phase; counter-timing
(strike into their recover, void during their commit, stop-hit a point that closes on a longer
arm); reach asymmetry (the longer arm holds the stand-off, the shorter one walks in on their
recover and stays inside once in); target selection by the slot with the least published
health; the ram chosen by matchup; a feint; the second weapon striking into the first one's
follow-through; and a guard distance chosen by their weapon kind.

**The phase is read from the arm's extension, not from the point's speed.** The plan said tip
speed -- rising is a chamber, the peak a commit, falling a recover -- and the first reader was
written that way and read a duelist's guard as a commit in seven samples of ten. The reason is
the body, not the reader: a golem's blade point rides 1.78 m out on a solver-driven arm, and its
published speed sits between 5 and 20 m/s in every stance, median 6.9 approaching, 9.8
chambering, 10.9 committing, 6.7 recovering. There is no threshold on it that separates
anything. What does separate the stances is the arm's *extension*, the distance from its point
to its own socket as a fraction of the hand's published reach: the duelist guards at about
0.88, chambers drawn in to 0.75, commits at 0.61 with the point closing on my socket, and
recovers extending back out to 0.85. So a commit is an arm drawn under a threshold whose point
is closing faster than a threshold; a chamber is an arm drawing in; a recover is the window
after either; idle is the rest. The confusion matrix against the duelist's true stance and the
quantile tables the thresholds sit on are in the reader's doc comment and in
`docs/measurements.md`. The lesson for the sessions after this one is the general one: a
signal the plan names is a hypothesis about the body, and the body is asked first.

**The tournament needs one body on both sides to see a mind at all.** Over random pairs of
bodies the body decides most bouts before either mind has done anything -- the Session 04
baseline had a maul winning 232 of 234 against anything that was not one -- and a policy rated
on that pool is rated on a coin the body already flipped: the fencer with every feature off
came within noise of the fencer with every feature on. `scripts/tournament.mjs` therefore
gained `--cross`, which spends the whole budget on bouts between different policies, and
`--mirror`, which puts one build on both sides of every pairing so that what differs across a
bout is the mind alone. The second draw is still made and discarded under `--mirror`, so one
seed names one walk through the pool whichever flags are on. What the mirror tournament says
about each feature is in `docs/measurements.md`, and is the only reason a feature is on: the
counter and the second weapon earn their keep, target selection by health lost bouts on the
vitality bar and ships off, and the rest are switches with a number beside them. Over 1024
mirrored bouts the fencer takes 527 to the duelist's 497, and on a long blade 121 to 73; on
the heavy weapons it is a coin, decided by whoever smashes first.

## The planner, which searches a duel it has only read about

Session 06 of the matchup set. The third golem mind, `golem-planner`, is the fencer with its
own triggers stood aside: between exchanges the fencer publishes what it can do this step and
what it reads, a *director* names one of the options, and the fencer runs it until the next
ask or until it has started an exchange, which then runs to its end as every exchange does.
The planner is the director that answers by searching a small model of the duel, and the model
is fitted from what the tournament logged.

**The model is four factors and eight options, and nothing in it is guessed.** A state is the
gap as two booleans (I can reach them; they can reach me), their phase as the fencer's reader
gives it, my own phase, and whether each armed hand holds a club: 48 states per weapon pair.
An option is one of the eight the fencer already executes: hold, close, withdraw, circle,
strike, wait for their recover, feint, ram. What the tables hold is, per state and option, the
damage dealt and taken over every logged window that began there under that option, and where
those windows ended; a thin cell is read shrunk toward the same cell without the weapon pair
and then toward the option's mean, and an option the log never saw is left out of the search
rather than valued at zero, which would make it look free. The search is finite-horizon
expectimax, six windows deep at a discount of 0.9, over all the states of the root's pair; the
tables are read out once per pair per process and a replan is a tenth of a millisecond against
a budget of five. `src/golem/duel-model.ts` holds the state, the fit and the search;
`src/golem/duel-model-tables.ts` is generated by `scripts/calibrate-duel-model.mjs` from
tournament rows that carry an exchange log, names its seed, date and counts in its header, and
is refused by version on load. `src/golem/planner.ts` is the director, and its constants --
horizon, discount, `aggression`, `caution`, `explore` -- are the whole of `GOLEM_PLANNER`.

**The log had to be an experiment before it could be a model.** A tournament row carried no
exchanges, so the harness gained `--exchanges`, a logger per fencer side that cuts the bout
into option windows. The first tables were fitted from the duelist's and the fencer's own
bouts, and they sent the planner backward out of both reaches for twenty seconds: the fencer
only closes where its rules close and gets hit walking in, and only rams when its arms are
capped, so the table said closing is where one gets hit and a ram is what a fighter with
nothing else does. A mind following its rules does not try the options; `explore` makes it,
answering that fraction of asks with a random open option, seeded, under `--override
explore=0.5` in a calibration run and zero in play. The second defect was in the windows: a
strike cut at half a second is a chamber and a commit, and the blow and the riposte landed in
the record after it. An exchange option's window now runs until the fencer is free again, and
a strike is one record of about a second that says what it earned, what it cost and where it
left the duel. The third was the fencer's own latch, rule 3 of Session 05, which had been
gating what the director was offered: the fencer reads an equal arm as the shorter one and
will not commit from outside its latch, so the planner stood at the edge of its reach with a
strike it was never handed. What a director is offered is now what the body can do; the latch
stays a tactic of the undirected fencer. All three are in `docs/measurements.md` with the
values that showed them.

**What the search values is where the bout's shape enters.** The model sees damage and not
results: in a mirror the expected dealt and taken of any exchange are equal, and a search that
weighed them evenly found nothing worth starting. `aggression` weighs dealt over taken from the
first step, because a bout is won on the bar at the cap and a draw is not a result the tables
can see; the lead moves the weights after that by `caution`, the leader guarding and the
trailer chasing. What it comes to, over 512 mirrored bouts a pair on the evaluation seed: the
planner takes 254 against the fencer and 250.5 against the duelist, level inside noise, with
the maul its one clear edge (45 to 29) and the long blade a fencer matched and not beaten (50
to 50). Over random pairs it trails both, 220 and 231.5 of 512, and the class rows say why: the
tables carry nothing of the other body but whether it holds a club, and a planner on a blade
facing a maul is searching a table fitted mostly from blades facing blades. The reach pair the
plan named and this session dropped for the table's size is the first thing the next
calibration puts back.

**What it does not do.** It writes no hand command and reads nothing the fencer does not; it
does not learn during a bout; it does not roll the physics forward, because there is no
snapshot of a Havok world in this tree and the arena's allocator history is not part of body
state. It is a chooser among the fencer's options, and the fencer is still what answers the
physics.

## The champion, which is the planner with its numbers moved by a tournament

Session 07 of the matchup set. The fourth golem mind, `golem-champion`, adds no tactic. It is
the planner of Session 06 over the fencer of Session 05 with the numbers of their two tables
replaced by a row of a checked-in table, `GOLEM_CHAMPIONS` in
`src/golem/tactics-champions.ts`, which `scripts/tune.mjs` writes and which is refused on load
by version and by any row the two tables no longer have. The mind reads which row is its own
off the first view it is handed: the *arm class* is the armed hand's weapon kind crossed with
the reach band its published reach falls in, with `paired-` in front when both sockets hold one
terminal, and a class the table has no row for plays the general vector. That is the class a
mind can read of itself and not the tournament's build class, which names the terminal module;
the frozen choice that a mind reads capabilities and a view and never module ids stands, and
the two things the tournament tells apart that fall together here -- a fist and a capped
socket are both `empty/short` -- fall together because to the mind they are both a hand that
holds nothing.

**The search is a (1+λ) evolution strategy, and what it climbs is the bar.** Every numeric row
of the fencer's table that the fencer reads and the four the planner plays with -- `explore`
stays zero, and the eight rows of the sword's stroke shape are read from the duelist's table
and not the fencer's, so a champion cannot move them -- sixty-two rows, each with a bound made
from its default, a quarter to four times a positive row and two scales either side of a zero
or negative one, a fraction capped at one, the horizon an integer; a child moves
each row with a small probability by a log-normal factor, and never moves nothing. The parent
and its λ children are scored together against a frozen league -- the duelist, the fencer, the
planner -- on the mirrored pool, where one body fights itself and the mind is the whole
difference, each contender's schedule drawn from the generation's seed alone so that all of
them meet the same bodies with the same streams. The fitness is the bar margin, a contender's
own vitality less its opponent's at the end, averaged; the points per bout are scored beside
it and are what the table reports. Not the Elo the plan named, because in a run where the
league's ratings float with every contender's results Elo is not a frozen scale, and the same
league at a fixed denominator orders the contenders the same way. A child replaces the parent
when it beats it by a margin on the shared seed, the seed changes every generation, and the
vector that comes out is scored once more against the defaults on a seed the search never saw,
which is the number the table carries: a winner is the best of several draws and its own
score is not to be believed. The search is per arm class after a general vector, on a census
of the pool that reads each build's class off a real body the way the mind will.

**What the noise allows.** A bout's outcome is chaotic past the first decision that
differs, so two vectors a hundredth of a percent apart on a control gain read as different as
two strangers, and the fitness of a vector at 384 bouts has a σ of 0.032 on the bar. The long
run of seed 20260907 -- sixteen generations for the general vector, six for each of eight arm
classes, about a hundred thousand bouts in five hours of the host -- bought a general vector
that confirms at 0.498 against 0.477 for the defaults on a seed the search never saw, one σ,
and six class rows that confirm above the defaults by between 0.007 and 0.062; the two that
confirmed below, `sword/long` after four acceptances and `empty/mid` after none, are the
winner's curse and are not in the table. The structural columns beside every rating stayed
inside the band the owner approved -- more damage a bout at the same contacts, less time inside
the inner radius, the lead changing in more bouts -- and the one row clear of the noise is the
whip's, which turned a third of its draws into wins by getting in a tenth closer and circling
wider. On the evaluation seed the search never saw, though, the champion is the planner it
was tuned from and a little more -- level with it head to head, behind the fencer by three to
five hundredths on both the mirrored pool and random pairs -- and the fencer's hand-set
numbers remain the best anyone has for a sword on a long chain, which is the biggest class.
What a run of this size cannot tell is a change worth less than a few
hundredths of the bar, and the table says so in every number it carries; `docs/measurements.md`
has the run, the confirmations with their structural columns, the rows each vector moved, and
a census that found nine rows the search had been moving for nothing.

**What it does not do.** It does not retune the duel model: the planner under the champion
searches tables fitted from a log of the default fencer, and a champion whose stroke timings
moved is searched with a model of the strokes that did not; a calibration run on the
champion's own log is owed. The switches of Session 05 stay where they were measured. And the
table is not what the owner's gate reads: a champion that rates higher and reads worse on the
structural columns beside every rating is reported in `docs/measurements.md` and not shipped.

## The neural contender, which is the fencer under a network that picks what the planner searched for

Session 08 of the matchup set. The fifth golem mind, `golem-neural`, adds no tactic and writes
no hand command. The fencer of Session 05 publishes, between exchanges, what it can do this
step and what it reads of the other arm; the planner of Session 06 answers by searching a duel
model; this mind answers by reading the same three things -- the open options, the reading, and
the view -- into fifty-six numbers, running a checked-in network forward, and naming the open
option with the highest logit. The fencer runs it until it asks again, on its own
`replanSeconds` cadence, or until it starts an exchange, which then runs to its end. That is the
plan's "the network picks one of the executor's options at about eight hertz; the executor runs
the exchange", and it has the same semi-Markov shape the planner has: a decision carries its
own duration, which is however long the fencer takes to ask again. The frozen choice that a
mind reads capabilities and a view and never module ids stands: the features are a pure
function of the reading, the open list and the view, versioned in
`src/golem/neural-features.ts`, and a table trained on another version of them is refused by
name.

**The network is small and owes nothing to anyone.** A multilayer perceptron in
`src/golem/neural-net.ts`, fifty-six inputs, two hidden layers of sixty-four with tanh, a linear
head of eight read through a softmax over the options that are open, 8,328 weights; seeded
initial weights, a forward pass that allocates nothing, and a backward pass forty lines long
checked against finite differences in `tests/neural.test.mjs`. The mask is the whole reason the
head is not a plain softmax: the network only ever competes among what the body can do this
step, so it is never trained toward, and can never name, a strike it cannot make. The choice is
the argmax and not a draw, so a bout under a seed is the bout.

**Where the weights come from is two steps, and the first is a departure from the plan.** The
plan said evolution strategies from scratch over the tuner's machinery. A network at
indifference loses every bout to the league, and a fitness that reads 0 for every child of a
loser has no gradient to climb, so the search would have spent its budget finding out that
hold is better than nothing. `scripts/train-neural.mjs` therefore first fits the network to the
champion: the champion plays the league on the mirrored pool with a hook on its director, every
ask is a sample -- the features, the option it took, which options were open -- and the network
is trained by gradient descent on the masked cross-entropy of those choices, a tenth held out
to say how often it agrees with the teacher on asks it never saw. Then the search: OpenAI-ES
over the weights, a population of antithetic pairs around the mean, each rated on the harness
against the frozen league exactly as the tuner rates a vector, rank utilities, a step of fixed
length along the estimated gradient, the seed changing every generation. Three candidates come
out -- the imitated network, the final mean, and the generation that rated highest -- and all
three are confirmed on a seed the search never saw beside the champion on the same schedule;
the one that confirms highest is what `NEURAL_WEIGHTS` in `src/golem/neural-weights.ts`
holds, with the versions, seed, date, teacher, agreement, and the confirmation it earned.

**What this bought.** A mind that cannot be told from its teacher. The champion recorded 31,919
asks over 384 mirrored bouts against the league; thirty epochs fitted the network to 99.7 % of
the held-out tenth of them, because a director that is a deterministic search over a few
hundred discretised states is a table this network learns to the last row. Twelve generations
of the search, 19,584 bouts, moved the weights by a fifteenth of their length and the answer on
nineteen of those asks: an imitation this confident has logit margins a σ 0.05 perturbation
cannot flip, so every child played the champion's game and the fitnesses were noise. On the
evaluation seed the search never saw, against the four shipped minds on the mirrored pool and
on random pairs, the neural mind is level with the champion head to head on the one and three
hundredths above it on the other, behind the fencer and the duelist by four to eight
hundredths exactly as the champion and the planner are, with the champion's structural
columns. It does not beat the hand-coded champion. It is the hand-coded champion, in a form
that can be trained, running on the fencer's default numbers rather than the tuned rows;
`docs/measurements.md` has the collection census, the imitation, the search, the confirmation
of three candidates and the evaluation.

**What it does not do.** It does not choose a target: the fencer's target selection is the
fencer's, as it is under the planner. It does not learn from its own play: the samples are the
champion's, the search is against a frozen league, and a run of the trainer that let the
network play itself would be a different session. And the policy-gradient trainer the plan
named as the fallback is not written: the honest reading of the run is that the budget's
limit is the noise of the harness and not the search, the same wall Session 07 hit, and a
second optimiser does not move that wall.

## The third executor, which has no tactics, and why the second one did not move

Session 04 of the style set. The owner watched two golems get into each other's face and flail,
and the diagnosis in the plan was not that the fencer chose badly -- it was that the fencer had
nothing else to choose. Eight options, all of them a stroke or a step, one distance to keep and a
strafe that flipped on a free timer. `src/golem/tactics-v3.ts` is a second executor beside
`tactics-v2.ts` with **fifteen** options, and the whole of its design is one sentence: *it decides
nothing.*

**Why a new file and not an edit.** `golem-fencer`, `golem-planner`, `golem-champion` and
`golem-neural` are all built on v2's eight options, and all three of the artifacts they read --
the champion's tuned vectors, the duel model's fitted tables, `NEURAL_LAYOUT.outputs` -- are keyed
to those eight by name and length. Widening v2's vocabulary would have made every one of them
refuse to load, which is what their version checks are for. So the four old minds go on fighting
in every tournament unchanged and rate the new ones, and the cost is a second executor of eleven
hundred lines. Whether v2 can be retired once the old minds are re-based on v3 is a question this
set records and does not answer.

**The seam, which is the frozen choice the set stands on.** v2 has seven reflexes: the void on a
read commit, the stop-hit on a closing point, the counter into a recover, patience, close-on-recover,
and the feint and ram rolls. Every one of them is a rule the executor applies before its director
is consulted, which means a v2 "style" is a director wearing somebody else's temper. In v3 all
seven are gone from the executor and are rules in a director. `golemStyled(seed, table, director)`
**throws on a null director** rather than falling back to a sensible default, because a default
would be a reflex with a longer name. One trigger survives inside the executor, and it is named as
such: `wait` is an option already chosen, held until their recover arrives.

**What the fifteen options are, and what an executor owning them means.** `hold`, `close`,
`withdraw`, `circle`, `void`, `retreat`, `strike`, `cut`, `feint`, `thrust`, `wait`, `parry`,
`shove`, `duck`, `ram`. Seven of those are new, and each is a shape the second executor could not
express:

- `cut` is the committed arc Session 02's bench found -- a 1.20 rad chamber drawn 0.20 back over
  0.32 s, swept in 0.20 -- with the feet walking in through the wind-up and the trunk leaning
  `cutLean` into it. It opens `cutReachMetres` further out than a strike, because a stroke that
  steps in is a stroke that may be started from outside the range it lands at.
- `thrust` runs the point out along the reach axis at their vital height, which is the one act
  that scores off tip speed without an arc; it is not offered to a terminal with no point.
- `parry` solves `|p + v t - S|^2 = r^2` for their tip against the spare hand's guard shell,
  takes the smallest positive root with the point closing, and sends the hand there through the
  same `writeAim` every other command goes through. No root, or one further ahead than
  `parryHorizon`, and the hand covers the closest approach instead -- a wall rather than a chase.
  This is the first act in the program with a success and a failure in it.
- `shove` puts both hands through their trunk fully extended and then recovers; `duck` is the
  void of a body that would rather not move its feet; `circle` strafes toward the side their
  weapon is *not* on; `void` steps back and off the floor normal of their tip's velocity.

The last two are worth being precise about, because both are a sign and a sign is where this kind
of code goes wrong quietly. A body's world right is its local `+X`, which is `(cos facing, -sin
facing)` in the floor plane, and `HandView.outboard` is `+1` on the fighter's own right; the same
vector is what `Fighter` applies `intent.strafe` along. So their armed hand's `outboard` and their
`facing` give the world side their weapon is on, one dot product converts it into my frame, and
the circle goes the other way. The void takes the floor normal of their tip velocity and signs it
toward the side my own socket is on, so the step is off the line rather than across it. Both are
tested by flipping the input and asserting the output flips.

**Asks on events, not only on a cadence.** v2 asks its director every `replanSeconds`, 0.167 s.
That is fine for choosing a stroke and useless for answering one: their commit is 0.22 s long, so
a fixed cadence answers it on average an eighth of a second late. v3 asks at once when their read
phase changes, when my own exchange ends, and when a parry releases, and it asks *mid-chamber*
when `chamberAbort` is on and their phase has just turned to commit -- with only the exchange in
progress, `parry` and `retreat` on the list, and choosing either abandoning the chamber at half
cooldown. Commit, recover, ram and shove run to their end whatever happens, because a body that
can take back a stroke it is already swinging is a body with no commitment in it at all.

**A style, then, is a director and a table.** `src/golem/styles/form.ts` is `golem-form`, the
first one, and it is ninety lines: seven rules in the order they are asked, and no eighth. Its
table is `GOLEM_TACTICS_V3` with seven rows moved, reachable from the tournament as
`--override form.cutLean=0.8` -- a bare `--override cutLean=0.8` moves the executor's default
table and not the style's copy, which is a distinction the first draft of the override block got
wrong. Two of those seven rows exist only so the control row can be written on a command line:
`parryOnCommit` off is v2's reflex exactly, and `quickStrokes` on is v2's stroke shapes, which is
the part of the control that no single number could reach. `docs/measurements.md` under Session 04
has what each of the seven costs.

### The second style, which defends a range rather than a line

Session 05. `src/golem/styles/skirmisher.ts` is the same executor under a different temper, and
it is the first evidence that the frozen choice pays: a whole second fighting style is one file of
rules and three numbers, because the body it drives already knows how to cut, leave and step off a
line. Its rules, in the order they are asked: step off a committed point; pay off a retreat if one
is owed; stop-hit if my arm is the longer one and their point is closing; cut into their recover,
which is the only way in; cut on patience; and otherwise circle while nothing is happening and
stand still while something is being drawn.

Two of those are worth the ink. **The retreat is owed rather than taken**: it is raised the moment
an exchange is named and lowered only by the gap exceeding their reach and slack, so the director
re-answers `retreat` at every ask in between rather than naming it once and hoping. And the flag
watches what the director *said*, not what the reading shows, which is a distinction that would
have failed silently the other way round -- the executor asks its director only in the
interruptible stances and every one of those reads `mine` as `free`, so the exchange-to-free
transition is never sampled at an ask and the debt would never have been raised.

**A shorter arm gets different rules**, because "stand outside their reach" is not a sentence an
arm that cannot then reach back can act on. It alternates leaving and cutting, and answers their
recover with `wait` -- a decision taken early and held, which fires the quick stroke the moment
the opening arrives -- rather than with an arc that chambers for 0.32 s before it starts to
sweep. A paired grip is offered no cut from outside its own strike range at all, so a skirmisher
on a maul is a maul that circles and leaves; that is written into the file rather than hidden.

The league says two things about all of that which the plan did not expect, and both are in
`docs/measurements.md` under Session 05. The paired grip was written down as the style's weak
class and is not one: `paired-club/long` is where the *fencer* is worst and where both v3 styles
are ahead of it. The shorter arm's branch is the real defect. Out-reached, the skirmisher spends
eight seconds of a sixty-second bout inside their point with nothing landing either way, against
three for the fencer and the form, and the cause is in the rules above: a retreat by the shorter
arm cannot clear a reach it does not have, so it times out still inside their point and the cut
goes in from there. It costs almost nothing on the bar and a great deal on the eye, which is the
wrong way round for a set whose whole purpose is how the fight reads.

### The third style, and the rule the executor could not say

Session 06. `src/golem/styles/guardian.ts` is the defensive direction: it stands at their reach
rather than outside it, answers their arm with its spare hand rather than with its feet, ripostes
into the recover with a cut and no step behind it, shoves what gets inside its inner
radius, and only after all of that -- three seconds of nothing, the longest patience in the set --
opens something of its own.

Writing it found the first thing in this set that a style could not say. The plan's first rule is
"their chamber: `parry`", and the executor answered it by never offering `parry` at all. The parry
is a solved crossing: `solveIntercept` takes their published `tipVelocity`, intersects the ray
with my guard shell, and returns null unless the tip is closing on the shell. An arm drawing back
to chamber has a tip going the wrong way by construction, so the branch fell through on every ask
it was written for, silently, and the style was not the style.

What that is really saying is that the plan's open question -- intercept or wall -- was already
decided, and not by the bench. Session 02 measured the plate taking 0.89 s to settle over 0.40 m
against a commit that runs in 0.20, which says a true intercept of a *committed* stroke is not
available to this body. The chamber says something stronger: for a stroke that has not started
there is no crossing to solve in principle, because the quantity the solver reads points away.
So `wallOnChamber` is a new row on the executor's table, off by default so that the two older
styles and the four v2 minds are byte-identical without it, and when it is on the executor places
the spare hand on the bearing from my socket to their tip at the shell radius and calls that an
intercept at `t = 0`. `Intercept` gained a `wall` flag so a placed bearing and a solved crossing
can be told apart in a test and in a log rather than only in prose. A wall shipped, not an
intercept.

It is a capability and not a reflex, which is the set's third frozen choice applied to the
executor for the first time: the executor learned a new thing it *can* do, and every rule about
when to do it is still in the director. `golem-form` and `golem-skirmisher` run with the row off
and are unchanged to the byte.

The measured effect is in `docs/measurements.md` under Session 06, and the shape of it is this:
with the row on, 132 of the guardian's 235 parries go out during a chamber; with it off only
fourteen do, and the chamber is answered by `duck` and `void` instead -- the body rather than the
hand. **On the bar it is worth nothing**, measured twice on two different tables at six tenths of
a standard error each time, and both times in favour of switching it off. It books four more blows
a bout on a hand slot and takes 0.7 more damage, which is the trade written out: a hand placed on
a bearing catches a little more and leaves the body standing where it was, and the evasions it
displaces took the whole body off the line. The capability is free, not good, and the honest thing
to say about a session built around it is that its own control row is the most interesting number
in it.

Two further things about this style are worth carrying here rather than leaving in the entry. Its
riposte ships as the **committed cut and not the quick stroke**, against the plan's own frozen
choice, on two independent seeds at 3.6 standard errors combined -- the plan's argument was that a
riposte is the half second their arm is out of position and a cut chambers for 0.32 s, and the
arithmetic was right about a window it had measured as 0.40 s when `recoverSeconds` 0.30 plus
`cooldown` 0.30 makes it 0.60. And **all four of the signatures the plan predicted for it fail**,
including the one that is a rate rather than a count: of the eight minds that ship, the guardian's
opponents have the *lowest* fraction of their strokes caught on its hand slots. The mind built to
put a hand in the way of a stroke is the one whose hands are in the way least often. What it does
own is the complaint this whole set exists for -- it clinches 1.04 s a bout in the mirror against
a field of 1.1 to 1.8, and 1.39 on random pairs against 2.0 to 3.1.

### The fourth style, and a row that could be swept without moving a byte

Session 07. `src/golem/styles/brawler.ts` is the inside direction, and it is the opposite of the
other three in the only thing they all agree on. `standOffFraction` is 0 and `holdFraction` is low
enough that the hold falls through to its own floor -- the inner radius plus slack, which
`styleRanges` derives rather than tunes -- so the distance every other mind is keeping is the
distance this one is trying to get past. From outside that floor it closes. Inside it shoves; on
the radius it strikes short with either hand; when the head is the softest thing it can reach it
thrusts; a body whose only weapon is its head charges. It never names `withdraw` or `retreat`, and
the one evasion it allows itself is a step off a committed point from *outside* their reach --
inside it there is no ground behind it to step into, and it keeps coming.

Three of the plan's rules for it turned out to be rules the executor already keeps, which is worth
recording because each of them looked like work: the spare hand's bash is `comboFraction`, which
has been 1.0 for every mind since v2 and is already skipped for a paired grip; a paired shove is
already both channels; and `crowdedSeconds` -- which the plan asked to be set high so the crowding
withdrawal would never fire -- is a v1 reflex that the third executor does not read at all.

The two that were not free are both the same shape as Session 06's, and one of them is worse.

`strikeBite` was asked for at 0.80 and glossed "the arm stays drawn". The row does the opposite:
`reachForDistance` subtracts `overhang * (1 - bite)` from the distance to the mark, so a larger
bite subtracts less and asks the anchor for *more*. That is a documentation error and it would
not be worth a paragraph, except that chasing it down found the thing that is: the anchor axis
clamps, and it clamps at `reachMax + overhang * (1 - bite)` metres, which for every value in the
plan's sweep is *inside* this style's own strike band. At the range the brawler actually strikes
from, all three swept bites command the same fully extended anchor to the digit. The row is not
mis-tuned, it is inert, and a test pins both halves so the sweep rows can be read as the noise
they are rather than as a preference.

`thrustByHealth` is the other, and it took two goes to make it real. `targetByHealth` has steered
strikes and cuts to the least-healthy reachable slot since v2 and has always left a thrust on the
trunk, so the plan's rule "thrust at the head when the head is the weakest slot" had nowhere to
land. A new capability row on the executor's table -- off by default, so the three older styles
and the four v2 minds are byte-identical without it -- let `weakestReachable` choose a thrust's
slot as well. It changed nothing. Swept on and off over 512 bouts it produced a **byte-identical
log**, while the option census said the head was the weakest reachable slot at three asks in ten
and the style was thrusting. The reason is that a thrust's mark is built in a different place from
its slot, and the branch that built it never looked: `if (exchanging && thrusting)` put the mark
at the trunk's vital height whatever the chosen slot was. The fix is to make that branch say what
it means -- it is the trunk's own rule, that a point driven along the reach axis goes where the
body is thickest -- so it now reads `thrusting && target === "trunk"` and every other slot takes
its own mark like every other stroke. The lesson is not the bug. It is that **a sweep row that
comes back at exactly zero deserves a look at the mechanism before it is reported as noise**: the
first draft of this session's table would have reported a capability as worthless with a
straight face.

What it is worth is two things and neither of them is a constant. In the mirrored league of nine
minds it is third on points, spends **31.6 % of the bout inside its own inner radius** against
19.3 % for the next mind, and clinches **0.77 s a bout, the lowest of the nine** -- getting inside
and standing there doing nothing turn out to be different, and this style does the first without
the second. And on random pairs it wins the one build class nothing else in the set can finish a
bout on: a paired maul, which is offered no parry, no cut and no combination stroke, and which
every other style spends the bout circling. The brawler shoves it with both channels for +0.574 on
the bar over 22 bouts, and **22.7 % of those bouts end on the 60 s cap against 80 % everywhere
else**. Meanwhile every one of the nine swept rows -- the plan's four constants and the session's
own three controls -- comes back inside two standard errors paired, and the two that looked like
something were asked again on a held-out seed, where one of them changed sign. Four of this set's
five sessions have now ended that way, which is worth saying in one place: on this executor the
constants are not where the wins are, and a new *rule* is worth more than a swept number.

## The decision log, and what a reward is

The four styles are hand-written and the three minds after them are not; what stands between the
two halves of this set is a *signal*. The matchup set's learned mind had one number a bout — the
bar margin at the end — against a per-bout spread of 0.44, and its record says the search hit a
noise wall rather than a ceiling. A bout is about five hundred and fifty director asks. Attributing
the bout's outcome to all of them equally is what made the wall; attributing it to each of them
separately is this section.

**A decision is the window from one ask to the next.** The third executor asks its director when
nothing is directed, when the cadence elapses, on an event — their arm's phase turning, a parry
releasing — and when an exchange ends; between two asks the mind does exactly what the first one
said, so nothing happens in that window that is not attributable to it. That is what makes the
recorder a hook on the director and nothing else: it needs no join with the exchange log and no
second reading of the bout. It closes the open decision with the two vitalities as they stand,
opens the next with the same two numbers on the same step, and marks the last one `done` at the
bout's end.

**A reward is `dealt − taken` over that window**, each read off the bar rather than off the
combat records: their vitality when the decision was taken less their vitality when the next one
was, and mine likewise. Because each close reads the same two numbers the next open records, the
windows telescope, and the sum of a side's rewards over a bout is its bar margin — to a part in
ten to the ninth, which is a test on a real bout in `tests/tournament.test.mjs` and the one
mechanical claim of the session. If that identity ever broke, every value fitted to this log
would be fitted to a reward that is not the score, and it would not show up as anything but a
slightly worse mind.

**Nothing is read that the mind could not read.** The two vitalities and the clock are on the
view the director was handed. The features are the same: `src/golem/style-features.ts` is the
neural set of the matchup set rebuilt over the wider reading — the same fifty-six columns, an
open block over fifteen options rather than eight, and six columns for a rhythm that no
hand-written style consults and that any of them could have. The fourteen things the third
executor's reading adds over the second's, rhythm aside, are deliberately *not* columns: almost
all of them are already in the open mask, and the ones that are not are the readings the styles
were written around, which a learner has no business being handed for free.

**Exploration is a wrapper, and its order matters.** A log taken from a director that always
answers the same way has no rows at all for the options that style refuses, and a value fitted to
it can say nothing about them. So a recorded side may answer a fraction of its asks with a
uniform draw from what is *open*, which keeps every row a row the body could have played. The
wrapper sits between the director and the hook rather than the other way round, so the log
records the option that was **played** and pays it the reward that followed; the other order
would have logged the style's preference against the exploration's outcome, which is the one
mistake here that no later number would reveal. The director is asked either way and its answer
thrown away on an exploring ask, so a style with a stream of its own walks the same stream at
either setting, and at zero there is no wrapper at all — the recorded mind is the shipped one, to
the byte, which a run of the harness checks by comparing the rows.

**The clock a window is measured on is the view's**, which advances a rendered frame at a time
while the executor is stepped four times a frame. So two asks inside one frame — the cadence, and
then an event as their arm turns over — are zero seconds apart, and a window may legitimately have
no duration. That is the honest number rather than a rounding of it: a blow is stamped off the same
clock, so nothing can have been booked between them either. A discount over these durations has to
be able to take a zero.

**The file is columns and lives beside the run.** `scripts/decision-log.mjs` owns the format:
seven arrays end to end behind a JSON header — the features single precision, because they are
readings of a physical body good to four digits at best, and the three reward columns double,
because they are differences of two vitalities a few thousandths apart whose sum has to come back
as the bar margin exactly. Version 1, the matchup set's three arrays with no rewards and an
eight-bit mask, is refused by name and has no converter: a fitted-Q iteration handed one would
train on rewards of zero and never say so.

## The tactician, which is the planner over a vocabulary three times as wide

Session 09 of the style set. The matchup set's planner searches a fitted duel model over eight
options and forty-eight states a weapon pair; `golem-tactician` searches the same dynamic program
over the third executor's fifteen options and a state that also knows whose arm is longer. It is
the first mind in the set that can name a parry, a cut, a shove and a void without a rule saying
when — every one of those is an act one of the four styles was written to make, and the tactician
has none of their rules and all of their vocabulary.

**The model was parametrised rather than copied.** `src/golem/duel-model.ts` gained a
`ModelVocabulary`: a name, an option list, a key, a family, and the depth of the key's prefix.
Everything below the fit — the three-level shrinkage, the successor counts, the finite-horizon
expectimax — is one implementation reading that record, and `src/golem/style-model.ts` is data.
The alternative was a second nine-hundred-line file with two constants changed, which is the
shape a pair of tables drift apart in. That the refactor moved nothing is a test and not a
claim: the checked-in `duel-model-tables.ts` is byte for byte what the parametrised renderer
writes from the tables it holds, all 113,005 of them.

**The state gains one dimension, and it is in the prefix.** Whether my arm is longer than theirs,
shorter, or neither, at the same `reachEdge` every style already reads: a hundred and forty-four
states a weapon pair instead of forty-eight. It sits beside the weapon pair in the key rather than
in the coarse part, because neither reach nor weapon changes inside a bout — so a successor never
leaves its family, and a replan still searches forty-eight states however many the tables hold.
The reason for the dimension is the whole style set: the skirmisher has two sets of rules and the
difference between them is the reach edge, the form's stand-off is a multiple of *their* reach,
and Session 05 measured a reach advantage being converted. A model blind to it fits those bouts
together and reports their average.

**The third segment of the state is, in practice, a constant.** `mine` may read `free`,
`exchange` or `recover`, and every window ever logged -- 742,012 under this vocabulary and
291,669 under the duel model's -- reads `free`. `exchangeLogger` closes a window only at a
settled sample and opens the next one there, and a settled sample is one where my phase is free,
so no other value can begin a window. The rule is right; the constant is its side effect. What it
means for the search is that sixteen of a family's forty-eight states can carry a cell and the
other thirty-two resolve through the coarse and option levels of the shrinkage, which is what the
shrinkage is for. Removing the segment would change `stateKey` and move v2, so it did not happen
in the session that found it.

**Its tables come from the styles' own exploring log**, fitted from a tournament run at
`--explore` by `scripts/calibrate-style-model.mjs`, for the reason the planner's were: a style's
unexplored log says only that a style's rules are what a style does, and a value fitted to it
says that closing is where one gets hit. Session 09 had to retake that log rather than reuse
Session 08's, because Session 08's windows were keyed with the *duel* model's four-segment state
— the worker learned the fifth segment in this session, and a calibration script that quietly
fitted the old keys would have fitted every reach pair together while claiming to tell them
apart. It refuses them by name instead.

## The selector, which is a mind that picks a mind

Also Session 09. Nine minds ship and the league of Session 08 says none of them is best
everywhere; `golem-selector` reads its own arm class and the class of the arm in front of it at
its first view, looks the ordered pair up in a table fitted from a tournament, and is the winner
of that cell for the rest of the bout. It adds no tactic at all. What it adds is the admission
that "which mind is best" was always the wrong question and "which mind is best against that" is
the one the harness can actually answer.

**Reading the other body's class is the part that could have been wrong.** `armClass` reads
capabilities — which hand can thrust, whether one terminal fills both sockets — and an opponent
view carries none of that, by the frozen choice the golem set has kept since its Session 00. Both
facts have a published shadow: the armed hand is the longest live hand that is not a shield, since
a capped socket publishes its cap's 0.24 m against a blade's 1.4; and a paired grip is one
effector in two sockets, so both hands publish the same socket in world space and their shoulders
coincide to the millimetre. That the two reads agree is a *measurement* over the reference pool in
`tests/selector.test.mjs` — one short bout per pair of builds, so every build stands on both sides
of a view — and not an argument.

**The winner's curse is the only real difficulty.** With a hundred ordered class pairs and nine
candidates, the best raw cell mean is a maximum over nine noisy numbers and is biased upward by
about the noise; a table of raw cell winners would look excellent on its own fit and level on a
held-out seed. Two rules answer it, both carried from the matchup set's tuning session. The score
is shrunk cell toward my class toward the candidate's marginal, with a pseudo-count of thirty-two
bouts a level — the same arithmetic the duel model shrinks an outcome cell by, with bouts where
that has windows. And a cell's own winner then has to beat the *marginal* winner **at that cell**
by 0.03 points a bout before it is allowed to play at all. On three bouts to nothing, the shrunk
sweep still leads by about two thousandths of a point, and the margin rule is what refuses it.

**Fixed at the first ask, and that is a decision.** Every candidate is a director over one of two
executors, so switching mid-bout is a line of code. It is not this line: a cell has a few hundred
bouts behind it, and a per-ask choice would need that much evidence per *state*. The selector is
also the one golem mind that publishes neither `fencer` nor `styled`, so the exchange log skips
it — a log labelled `golem-selector` would name an option vocabulary that changes with the body.

## The learner, which is fitted to what each decision earned

Session 10. `golem-learner` is the
same network shape as `golem-neural` -- the style feature count in, two hidden layers of
sixty-four, one output an option -- read as *values* rather than as logits: what naming this
option in this state is worth from here to the end of the bout, in bar units. The mind is three
lines. Everything that matters is where the numbers came from.

**The optimiser was never the problem.** The matchup set's neural entry is a record of a wall:
one scalar a bout, sigma 0.032 points at 384 bouts, and an evolution strategy that could not move
a confident imitation off the teacher it had copied. The natural next move is a better search.
The move this set made instead was Session 08's: replace the *signal*. A side asks its director
about 253 times a bout, each ask is paid the damage the two bars took until the next one, and the
payments telescope to the bar margin exactly. That is three orders of magnitude more numbers out
of the same tournament, and it is what makes a value function fittable at all.

**The discount is by duration, not by step.** `gamma = 2^(-seconds / halfLife)` with a half-life
of eight seconds, so a window that occupies six hold-lengths of the bout is discounted six holds'
worth. This is not a detail. A per-step discount pays a mind for taking *many short decisions*,
which is precisely the flail this whole set exists to remove: a committed cut is one decision
that occupies half a second, and against a per-step discount it competes with six holds that
occupy the same half second and are each discounted once. The semi-Markov form is the only one in
which a slow act and a fast one are comparable, and it costs one line.

**The target, and what is not in it.** For every decision, its own reward plus the discounted best
of the *previous iteration's* values over the options that were open at the next decision; on the
last decision of a side, the reward alone. The loss is the squared error at the taken option only
-- nothing is said about the fourteen options that were not played, so nothing is learned about
them from that row, which is what makes the fit off-policy and what lets the whole corpus of
Session 08 be data even though a style wrote it. The optimiser is Adam at 1e-3, batch 128, three
epochs an iteration, thirty iterations a fit, warm started between rounds.

**The terminal bonus is defined on the bar and not on the winner, and that is a departure.** The
plan asked for a bonus on the bout's result. The samples format was frozen in Session 08 and has
no winner column, and the corpus on disk cost half an hour of the host to make, so what the file
can answer is the sum of the side's own rewards -- which telescopes to its bar margin. Its sign
is not always the recorded winner: a bout is also won by a kill. At `winBonus` zero, which is
what ships, the two definitions cannot differ; a sweep off zero would be measuring the bar's
sign, and it has not been run.

**Two read-outs a sweep, and one of them is not a residual.** A falling training residual says
nothing on its own -- a network with ten thousand weights can memorise sixty thousand rows -- so a
tenth of the decisions take no gradient at all and are scored anyway. They are drawn by a shuffle
of the whole buffer rather than by taking the last tenth of the file, because the file is ordered
by bout and by side and its last tenth is a handful of matchups. The other column is the one that
actually says whether the iteration has converged: how many decisions changed their *greedy*
answer since the previous sweep. A residual can fall while the policy churns, and the policy is
the only part of the fit that ever reaches the arena.

**That the fit is correct is a claim tested away from the arena.** `tests/learner.test.mjs` builds
a six-state semi-Markov chain -- durations of one or two seconds, one action closed in two states,
and a root where the action paying a whole point immediately is worth 1.0 against the patient
action's 2^(3/4) -- generates episodes under a uniform draw from what is open, and runs the
trainer's own `fittedQ` on them. It recovers the optimal action in every state and every open
value to within 0.05 of exact value iteration, in about a second and a half. The point of it is
what it rules out: if a real fit does not learn, the fit is not what is wrong.

**And it was never fitted, on purpose.** The trainer ran fifteen minutes of a three-hour fit
against Session 08's corpus and was stopped. The reason is the league's own finding, read one step
further than Session 08 read it: 903 of 4,096 bouts decided, points a bout within noise of one
half for every mind in the run, and seven of the nine spanning 0.024 points. That is not a hard
problem to learn -- it is a flat objective, and a value function fitted against it is fitted
against a constant. A fit is worth its three hours only after a bout can be won, so the
`LEARNER_WEIGHTS` on disk are zeros: the mind loads, the picker offers it, and every number in it
is still owed. What the session leaves behind that is worth having is the machinery either side of
the artifact -- the value gradient in `src/golem/neural-net.ts`, the paired-difference
confirmation, and the chain test that separates "the fit is wrong" from "the arena has nothing to
learn".

## What makes a bout decidable, and the two numbers that decide it

Session 11 of the style set. Eight sessions had put the 60 s cap in front of the owner's gate and
Session 08 said what it costs: 78 % of a mirrored league ends on the clock, eight of eleven build
classes decide no bout at all, and seven of nine minds span 0.024 points. The learner section
above stops one paragraph short of the consequence, and this is the consequence: **a value
function fitted against a league that cannot rank its own minds is fitted against a constant**, so
the first thing to fix is not the mind but the thing the mind is being scored on.

**A criterion had to be chosen before anything moved, because the fight cannot be judged by
watching it.** The owner's instruction was that the current fighting is too poor for variations of
it to be told apart by eye, so the response here is Cohen's d on a **paired bar margin**: two
minds that ought to differ, run over one body and one seed twice with the corners swapped, and the
pair -- not the bout -- is the unit, because the corner a body stands in decides more of a single
bout than the mind in it does. d is the right functional for a reason that is not taste: bouts
needed to see a difference go as 1/d^2, which is exactly what the session was asked to buy, and it
**fails at both ends**. A bout that never ends has no numerator. A bout decided by one blow has no
numerator either, because which body swings first is then a coin flip -- the mean collapses and
the spread does not. A criterion that punishes both a stalemate and a stomp is one it is safe to
maximise.

**The gap has to be between two minds and not between one mind and its own noise.** The sweep was
first built on a style played greedily against the same style at explore 1.0 -- a uniform draw
from whatever is open, which is the flail itself -- and that gap answers the lever inconsistently:
0.150 rising to about 0.22 across one seed's pool, 0.316 falling to 0.301 across another's, with
intervals that never separate. Both corners of it are the same executor naming the same fifteen
frozen bundles, so what the bar is being asked to resolve is a difference in *timing*, which is
precisely the thing the option
vocabulary cannot express. The decision was retaken on `golem-brawler` against `golem-duelist`,
the two ends of Session 08's league, which is the difference a league actually has to resolve.

**The lever is lethality and it is reached through the body, not the scoring.**
`CONFIG.combat.cutJoulesPerDamage` and its two siblings would do the same job in one number, and
they are refused: they are the Warrior's scoring as well, and `tests/scoring.test.mjs` pins it.
What is golem-only is `GOLEM_ASSEMBLY.healthScale` -- what a point of declared part health is
worth -- and `GOLEM_ASSEMBLY.vitalityTotal` -- how much bar a destroyed part takes with it. Both
moved, and **the reason both moved is that they do different jobs.**

- `healthScale` decides **how many bouts end at all**: 25 % to 43 % of them as it falls from 0.25
  to 0.10 at a fixed bar. It buys that by making an individual blow more decisive, which is why
  the winner's own remaining bar *rises* with it -- 0.567 to 0.628 -- and why bouts over inside
  eight seconds go from none to six per cent. Pushed alone it converts a stalemate into a stomp,
  which the criterion is built to notice.
- `vitalityTotal` decides **how much a mind's choices are worth when a bout does end**. It changes
  when a body counts as beaten rather than how hard a blow lands: the bar concedes at partial
  destruction instead of near-total, which shortens fights without making any single blow a coin
  flip. d rises monotonically along it, 0.163 to 0.305, and the winner's bar *falls* -- those are
  hard fights, not stomps.

**It was not taken to the best d, and the column that stopped it is dismemberment.** Scaling the
declared weights to a larger total means a bar empties on a smaller fraction of the body: at 10.8
that fraction is 9.3 %, which is less than any single module, so the bar empties *before*
anything comes off. One per cent of decided bouts end with a part severed, against seventy-five
today. A fight would end with two intact-looking bodies, one of which falls over. **A bar that no
longer describes the body it is drawn over is a worse defect than a small effect size**, so the
choice is 5.4 -- which also stays under **5.95**, the total at which a severed primary arm would
empty a default golem's whole bar on its own and `tests/golem-arena.test.mjs` would stop being
able to say that a golem fights on with the other one. That ceiling is arithmetic and not taste: a
module of share `s` carries weight `s * total`, so it empties a bar alone once `total >= 1 / s`,
and the default build's primary is 16.8 % of its bar. Running that test file at 5.9 passes and at
6.0 does not.

**One hypothesis that was good and was wrong, kept because it was made.** The diagnostic that
opened the session found 41.7 % of a golem's declared bar sitting on legs that absorb 7.5 % of the
injury, every stroke going to the trunk mark at shoulder height while `targetByHealth` is off in
every table but the brawler's. The obvious inference is that the bar is diluted by weight nothing
can reach, and that moving it onto the arm and the head would concentrate the signal. Measured, a
pure reallocation *lowers* the effect size -- 0.130 against the control's 0.210 -- because the
inert weight was **damping the variance rather than diluting the signal**: concentrating the bar
makes one sever swing more of it, and the denominator grows faster than the numerator. Pooled over
all 208 sides of the diagnostic, **93.7 % of declared weight sits on part keys that took injury in
at least one of them**, against 57.9 % inside any single bout, so nothing on a golem is
structurally out of reach either. What the legs have is a low rate, not a wall.

**What no bar setting buys is a body that cannot hurt another one.** Thirteen of the fifty-two
reference builds -- a quarter of the pool -- decide none of their 140 screening bouts at any total
tried, up to a `vitalityTotal` of 25.2, which is seven times the shipped one; `ram-capped` and
`pitch-blade` are two of them. That is Session 08's "eight of eleven build classes decide none"
measured again per draw. It is a fact about weapons and reach, and it is not this number's to fix.

**What it bought, on the thing it was aimed at.** The whole league -- twelve minds, 4,096 bouts,
seed 20260906 -- was run at both settings, the old one reached through the override below rather
than by editing the source, so the two logs differ in those two rows and nothing else. Mirrored,
1,544 bouts decide against 913 and the spread from the best mind to the worst goes 0.093 to 0.176;
on random pairs, 1,806 against 970 and 0.060 to 0.098. The ordering survives -- Spearman's rho
0.67 and 0.80, the same mind first and the same one last on both pools -- and on each pool
**exactly one mind moves by more than two standard errors, and it is the one that is not a mind**:
`golem-learner`, whose table is still the zeros of Session 10, so its head is a constant and it
names the first open option at every ask. Mirrored it loses 0.0655 +- 0.0095 of a point against
its own self at the old settings, and sits 13.8 standard errors below zero on the bar where
Session 08's whole league held nothing further from zero than 5.2. A value function fitted here is
no longer being fitted against a constant.

**The harness reaches the body through `--override body.<row>`**, beside the `form.` prefix that
reaches a style's table. It is deliberately not a bare name: every other override in the tournament
changes what a mind decides, and this one changes what it is deciding about.

## The fourth executor, whose command is a vector, and the mind that can stop its own swing

Session 12 of the style set. The third executor's fifteen options are a **partition**: naming `cut`
names a stand-off, a lean, a target, a reach and an arc all at once, at values a table froze before
the bout began. Every style in this set is therefore a different rule for picking among the same
fifteen frozen bundles, and Session 11 measured what that costs — the paired criterion separates a
mind from a mind that does nothing at d 0.70, and two hand-coded minds at 0.235. There is nothing
left to choose between. `src/golem/tactics-v4.ts` replaces the vocabulary with numbers.

**The command is nine numbers and three gates**, each clamped to its own declared range and each
already something `writeAim` consumes: `standOff` as a fraction of *their* reach, `strafe`, `lean`,
`advance`, `targetHeight` and `targetLateral` as a point on their body, `reach` as a fraction of
the arm's, `swing` as a position between the thrust's arc and the committed cut's, and `bite`; then
`commit`, `abort` and `parry`, which are the three things that cannot be continuous because an
exchange either starts or does not. A `Pilot` in `src/golem/pilot.ts` is asked at **12 Hz** and on
the same three events v3 is asked on, and the executor clamps every axis and counts every clamp, so
that a mind writing outside the envelope is a number in a table rather than a body in an
impossible pose. Twelve refusal counters over 1,418 s of real fighting read zero.

**12 Hz is measured rather than preferred.** Three timescales in the body converge on about twenty
asks a second and none supports more: the phase read is low-passed at `readSeconds` 0.05, a plate
crosses its own guard shell in about 0.05 s at `CHAIN_REACH.anchorRate` 5 m/s, and the commit phase
is 0.22 s long. Twelve is inside all three with room.

**What is actually new is that the ask does not stop.** v3's executor owns an exchange once it has
started; the only place it will take one back is mid-chamber, under `chamberAbort`, and once the
arm is committed nothing can reach it. v4 asks through the whole stroke. Measured on the same 52
bodies, `golem-form` is asked 5.20 times a second and `golem-driver` 14.52, and the difference is
entirely asks inside strokes that v3 could not have interrupted. That is the feature: a feint, a
stop-hit and a parry that abandons a swing already travelling are all now the same act — raise
`abort` — rather than three named options with three frozen shapes.

**`golem-driver` exists to make that claim falsifiable.** It is `golem-form` written out again as
numbers: the same five rules in the same order, the same table rows, deviating in exactly three
places its own doc names. The test that holds it is the strongest one available — a swing of 1.0 at
its gates must reproduce v3's committed cut **command for command**, and `tests/tactics-v4.test.mjs`
compares seven channels frame by frame through a whole exchange and asserts the spans are equal.
142 frames agree.

Four defects had to be fixed before they did, and the interesting thing about all four is that none
is visible in a bout. The arc was interpolated as `a + s(b − a)`, which is not exact at `s = 1`. The
half of the arc to write was picked from the clock rather than from the stance, and v3 transitions
*after* writing. Two of v3's range gates lived in the executor and had not moved into the mind, so
a ram-headed body could never charge and a maul could thrust. And the mark, the aim and the crouch
were computed one step **before** the ask that wrote them.

That last one is the class worth naming, because it is the failure mode this whole architecture
invites: **on a surface where the mind writes and the executor reads, every quantity has a step at
which it is read, and a quantity read one step early is a quantity from the last decision.** The
mark was not wrong; it was the previous ask's mark, which is a perfectly plausible mark. Only a
frame-exact comparison against something that already worked can find it, which is the argument for
transcribing an existing style before writing a new one.

**What the driver is worth is nearly nothing, and that is the result.** Its paired bar margin over
the style it copies is −0.0069 ± 0.0811 on random pairs and −0.0218 ± 0.0262 mirrored, both
containing zero, both smaller than the gap between the fencer and form — which itself changes sign
between the two pools. The surface is proven *expressive*, not proven better, and the census says
why: four of nine numbers are ever moved, `targetLateral` is zero at every ask, and the commit gate
is raised at `swing` 1.000 in 1,452 of 1,452 gates. A transcription of a fifteen-option style is
still a fifteen-option style. What it does differently is take back 41.7 % of its strokes against
form's 23.5 %, on a fixed 15 % feint roll and an unconditional parry rule, and that is free
everywhere except on a long one-handed mace — the one body with a spare hand and a stroke worth
1.21 damage — where it costs −0.174 ± 0.134. *When* to abandon a swing is a decision, and this is
the first measurement in the set that says so.

## The reward that pays every step, and the first mind fitted to win

Session 13 of the style set. Every learned mind before this one was fitted to *imitate* — the
neural mind to a hand-coded style's choices, the learner to a value function over fifteen names —
and every one of them was scored, in the end, by one number a bout. `src/golem/reward.ts` and
`src/golem/policy.ts` replace both halves of that: a reward that pays at every ask, and a policy
that writes Session 12's nine numbers and three gates itself.

**The reward's first term is not a choice.** It is `dealt - taken` between one ask and the next,
in bar units, which is Session 08's decision reward differenced finer, and it telescopes for the
same reason: each window closes on the two vitalities the next one opens on, so the undiscounted
sum over a side is its final bar less its opponent's, *exactly*. `tests/reward.test.mjs` asserts
that on a real two-worker run to 1e-9. A per-step reward that did not sum to the outcome would be
a proxy, and this repository has one expensive memory of what proxies cost.

Three things are laid over it, and each has to earn its place against the thing it is added to.
`win` 0.5 is paid once, at the last window, to the winner and against the loser: the bar margin is
already an outcome but a *continuous* one, and at the settings Session 11 landed, 493 of 1,024
random-pair bouts decide and the rest end on the clock with both bars up, so a policy paid only in
bar has no reason to prefer the last tenth that kills. `clinch` 0.004 a second and `idle` 0.004 a
metre are charged on the two pathologies Session 00 built columns for — and they are charged from
*those columns*, poured out of the tournament worker's own accumulators into whichever ask was
open when the sample went by, rather than defined a second time. A policy paid to stop clinching
is therefore paid against the number the league table will print about it. Both are small on
purpose, because a mind paid to stop clinching can stop clinching by standing at the far wall, so
every iteration reports what share of the return the penalties accounted for and a run where a
penalty dominated is a run to throw away.

Nothing is shaped toward a stroke, a parry, a stand-off, a target or a contact speed. Those are
the decisions the policy exists to make.

**The head is twelve numbers over two hidden layers of 256.** The first nine are the means of nine
independent Gaussians in a normalised coordinate where each axis runs −1 to +1 across its own
published range; the last three are the logits of three independent Bernoullis, which is what
`commit`, `abort` and `parry` are. The spread is one `logSigma` an axis, a parameter and not an
output, because a state-dependent spread collapses on the states a fit visits most and the states
this one visits most at the start are the ones where nothing is happening. **A sample is clipped,
not squashed**: the density the trainer differentiates is the density of the raw draw, so the
surrogate is exact, and the executor's own clamp — which Session 12 built and counted — is what
makes the command legal. A `tanh` squash would make the log-probability a function of the action's
own value, and the one thing this arrangement must not do is let the number the trainer reads
disagree with the number the body did. The shipped mind plays the mean; only the trainer draws.

Width is the one free parameter that was never tried. `golem-neural`'s 2×64 over eight names could
not be moved by an evolution strategy and `golem-learner`'s 2×64 over fifteen was stopped before
its fit because the objective was flat; neither failure was diagnosed as width, and 256 is taken
on the owner's instruction while the vocabulary and the signal are both being replaced, not as a
claim that width was the problem.

### Two things the trainer had to be rewritten around

**The self-play return is not a progress curve, and cannot be.** `scripts/train-ppo.mjs` collects
mirrored self-play — the same policy in both corners, both sides recorded — which is what makes
the opponent improve with the agent, and the hand-coded league is held out entirely because a
policy trained against the fencer learns the fencer. But the two sides of a mirrored bout have bar
margins that are exact negatives, so the mean return over a rollout is zero up to the penalties
*whatever the policy learns*. A session that plotted it would be plotting its own arithmetic. The
curve is therefore the **rating**: the paired bar margin against a held-out contender over the same
bodies and the same seeds, taken every `--evaluate` iterations and at iteration zero, so that the
first point is the untrained policy rather than the first fitted one.

The contender that makes the rating a null hypothesis is `uniformPilot` — a mind that draws every
axis uniformly across its published range and every gate on a coin, out of a stream of its own so
it never shares a draw with a fitted mind. It is not a good fighter and is not meant to be. It is
the answer to "is this policy doing anything at all", which is the question a first fitted mind
has to answer before any other.

**Adam's step is ±`rate` per weight, so the rate and the batch are one knob.** Adam normalises by
its own second moment, so a step is the learning rate in magnitude whatever the gradient's size,
and a coherent move of ±`rate` across a 256-wide last layer is a head move of order `256 · rate ·
E|h|` — which at rate 3e-4 is about 0.18 nats of KL in one step. With a 512-sample minibatch and a
0.02 KL trust region, exactly **one** minibatch fitted inside the budget: the fit was spending 512
of the 57,000 samples it had collected and throwing the rest away. The trust region was not the
bug — with it removed, a real iteration diverged to a KL of 69.9 — the step geometry was. The
calibration is in the Session 13 entry of `docs/measurements.md`; what it landed on is a batch of
4,096 and a rate of 1e-4, at which all fifty-six minibatches of four epochs are applied and the
fit ends at a KL of 0.008 with 6 % of samples clipped.

The trust region itself is checked per minibatch, *before* the step, on the k2 estimator
`½(log r)²`. The plain difference of log-probabilities is not a KL and goes negative, so a strict
target would let the first minibatch through on a negative number; k3, `exp(d) − 1 − d`, is
unbiased but exponentially heavy-tailed, and one sample at `d = 5` contributes 142 nats and trips
a 4,096-sample batch at random. k2 is biased low and quadratic, and it is being compared against a
threshold rather than reported as a quantity, which is the case where that trade is the right one.

`logSigma` gets its own step size, ten times the head's by default. Both travel ±`rate` an update
because Adam does not care that one of them is nine numbers and the other eighty-seven thousand,
but the head's rate is set by how far the *policy* may move in one fit, and at the calibrated 1e-4
the spread could cross 0.17 over a whole run, which is a spread that cannot sharpen.

### What the first fit landed on

Sixty iterations, 1,920 mirrored bouts, 3.35 million asks, under two hours. The mind that came out
**misses the bar the session set itself and rises toward it**: against the uniform command over
1,030 bouts a contender it is +0.0871 ± 0.0247 of bar, d +0.216, where the plan asked for the
d 0.235 that separates `golem-brawler` from `golem-duelist`; a weighted fit through the thirteen
rating points climbs at +1.29e-3 ± 2.53e-4 of bar an iteration, t 5.10, and has not flattened by
iteration 60. Rated at the same thousand bouts, the untrained head is worth +0.0030 ± 0.0209 over
the uniform command — nothing, as exactly as the instrument can say it — so the whole
+0.0841 ± 0.0324 between the two ends of the curve was put there by the fit. It ends level with
`golem-driver`, −0.0145 ± 0.0206 of bar against −0.0987 ± 0.0213 at iteration zero — a mind
fitted from a random head closing the whole distance to a hand-coded style on a reward with four
coefficients and nothing shaped toward a stroke.

What it does to get there is not what a designer would have shaped for, and that is the part worth
keeping. It throws the fewest strokes of the three contenders, gets the least speed into them and
deals the least total damage — and it loses least, draws most, and ends a win with **half its bar
left**, 0.512 against the driver's 0.362. Paired against its own opponents' rows, the whole of its
advantage over the uniform command is on the taking side: random commands deal 23.98 a bout and
take 31.03, and the fitted policy deals 20.54 and takes 20.46. A reward whose first term is
`dealt − taken` moved the second term and not the first. It is the two penalised columns, clinch and idle travel,
that it is *worst* on: charged 0.004 apiece, they cost it about 0.027 of a bar a bout and it pays
them, which says the standing and the sideways travel buy more than they cost. A reward table whose
charged terms go up over sixty iterations is a table whose coefficients were argued rather than
swept, and the artifact ships that table in its header so the next fit can be told apart from this
one.

### What a mirrored self-play reward can and cannot pay for

Session 14's calibration, which is the first thing that asked the fitted mind to finish something.

Put a golem against **itself** with one side on `idle` — a body that never moves, never blocks and
never strikes back — and a bout asks one question with nothing in it but that one. Over 52 builds
at four bouts each, `golem-driver` kills that dummy 46 times, a flat random command 11, and the
fitted mind 9 — the fit is **less able to finish a stationary opponent than the uniform baseline it
was rated against**, and it deals less damage than that baseline on every weapon class there is.
Rolled up by the weapon in the armed hand the answer is sharper still: seven maul builds, and the
driver finishes all twenty-eight of their bouts, leaving the dummy at 0.087 of its bar in a mean 21
s; fourteen blade builds, and it finishes 2 % of them, because a blade deals 13.3 damage in 60 s
where a maul deals 64.3, against a bar that costs somewhere between 55 and 80 damage to empty
depending on where the damage lands. **Some layouts are decisive and it is the weapon that decides
which** — the driver's blade leaves the `default` dummy at 0.626 of its bar after 60 s, which at
that rate is about 160 s to finish, so a blade bout inside a 60 s cap is a draw before either mind
has done anything wrong.

What the fitted mind does on the bodies that *can* finish is the part that is about the reward. On
the default blade body against that motionless opponent it holds station at **2.27 times its
opponent's reach** (`hold = them.reach * command.standOff`, and the axis roof of 3 is out past
their reach on purpose), leans back, steps back, aims four-fifths of the way to one side, and
raises the commit gate on 99.5 % of asks — 56 strokes a bout, zero aborts, peak driven tip speed
40.7 m/s, **0 contacts and 0.0 damage** across two full-length bouts. It is not a mind that will
not commit. It is a mind that has learned to shadow-box out of range.

The reward permitted that, and the reason is the identity the section above treats as a reporting
problem. In a mirrored bout the two sides' bar margins are exactly negated, so the margin term sums
to zero over the rollout; `win` is paid to one side and charged to the other, so it sums to zero
too. **The only terms whose mean over both sides is not zero by construction are `clinch` and
`idle` — and both are charges, and both charge for engaging.** The symmetric part of the reward,
which is the only part a mirrored fit can move in the mean, is therefore maximised at exactly zero,
by a policy that never enters their reach and never travels sideways; and swinging at air is free,
because nothing in the table pays for a stroke. `src/golem/reward.ts` names this exact failure as
the one it was watching for — *"a policy paid to stop clinching can stop clinching by standing at
the far wall"* — and made both charges small to prevent it. Small was not the protection it needed:
in mirrored self-play, small and *the only thing that averages* beats large and cancelling.

Two knobs follow from that, both in `scripts/train-ppo.mjs`. The four reward coefficients became
flags, which is possible only because `mergeRollouts` applies the table in the main thread over
packs that carry `dealt`, `taken`, `seconds`, `clinch` and `idle` raw — so the same collected bouts
pay differently under a different table and no worker has to know; `--out` refuses a fit paid under
anything but `GOLEM_REWARD`, because the generated module names the shipped table and would
otherwise be a lie nobody could catch. And `--opponent` puts a fixed mind on the other side instead
of a copy of the fit, in both corners, which is the one arrangement in which the mean return is not
zero by construction. The second is also the one-opponent case of what Session 14's league needs.

The calibration also found a defect that is a coordinate rather than a reward, and it is the
shorter half of the explanation. `commandFromAction` maps a normalised axis onto its published
range by the range's midpoint, and `COMMAND_RANGES.standOff` is `[0, 3]`, so the zero of that axis
— what a head with no signal emits, and what a flat draw averages to — is **1.5 times the
opponent's reach**. A stroke opens at `max(reach * strikeFraction, near + slack)` with
`strikeFraction` 0.92, so a blow in a mirror needs the socket inside about 0.92 of a reach; and the
closing axis cannot make the difference up, because the feet settle at `hold − advance / closeGain`
and `closeGain` is 1.8, so a *saturated* `advance` buys 0.56 m, which is 0.31 of a golem's 1.78 m
arm. **From the zero of the action space, with the closing axis pinned at its maximum, a body
stands at 1.19 of the opponent's reach and cannot touch them.** The roof of 3 is argued in
`tactics-v4.ts` as out past any fight on purpose; the measurement says the *midpoint* of that range
is already out of it, which puts the cost of the roof's generosity at the zero and not at the edge.

Two readings of one set of weights follow from that, and they are not the same fighter.
`golemPolicy`'s `sample` defaults false, so **the shipped `golem-policy` plays the head's mean
command** — and the mean is standing at 2.27 of their reach. Drawn instead at the spread the head
carries, the same weights kill the idle dummy 31 times in 208 rather than 9: three times the
uniform baseline and two thirds of `golem-driver`'s 46. The mind has learned to strike and has not
learned to stand where striking works, and shipping its mean is shipping the half of it that
cannot reach. Narrowing the range changes what every number in `src/golem/policy-weights.ts` means
and so needs a `POLICY_VERSION` bump and a refit; that and the choice of read are both Session
14's, recorded here with their numbers so the choice is not made again by default.

### The league: a main agent, its own frozen past, and two hunters

`scripts/league.mjs`. The calibration above says what a mirrored fit is paid for and the answer was
"disengaging", so the league is not a nicety on top of self-play — it is the arrangement that makes
the return mean anything at all. Three roles, and each of them exists to break a different way the
previous arrangement could be gamed.

The **main** is the agent being trained. Every iteration it plays a declared mixture of a frozen
copy of itself, a draw from the stored past, and the current exploiters, and takes one PPO step on
the rollout it recorded from its own side alone. The **pool** is every Nth checkpoint of the main,
frozen, never trained, capped and thinned. The **exploiters** are policies seeded from the main and
trained against a frozen copy of it and nothing else; the main trains back against them.

**The mixture is slot counts and not probabilities.** `leaguePairs` turns `{name, weight}` into a
cycle with one entry per slot, `scheduleJobs` walks that cycle with `pairing % cycle.length`, and
`collectLeague` rounds the pairing count *up to a whole number of cycles*. Both halves matter. A
share drawn from a random stream would be the declared share only in expectation, and an iteration
is thirty two pairings, so "half the bouts against the pool" would land somewhere between a third
and two thirds of them on any given night; and a cycle that does not divide the pairings gives its
first entries an extra slot each, which is a bias that changes shape every time the pool grows. The
few extra bouts the rounding buys are much cheaper than reasoning about either afterwards. What the
pool's share is declared *for* is the group and not the entry — eight checkpoints at one slot each
would be eight ninths of an iteration spent on frozen minds — so `spreadSlots` hands the group's
slots out among its members and rotates the remainder with the iteration number, which is what
stops the same members sitting out every time.

**The past is thinned from the middle, not from the front.** The obvious rule — keep the newest K —
is wrong for the claim the pool exists to support. Beating the mind you were four iterations ago is
what a cycling pair does too; the claim worth checking is that the main beats *every* checkpoint
older than K, and a window that slides forward throws away the long baseline that makes it worth
anything. So `thinPool` never drops the oldest entry or the newest, and repeatedly removes whatever
middle entry sits closest to its predecessor, which leaves a spacing that widens with age. Nothing
is deleted from disk: an entry that has left the sparring cycle is still a row of the matrix, and
the state file keeps `taken` — every snapshot ever written — beside the playing `pool`.

**An exploiter is reset on best-against-best and not on its last rollout.** A hunter that has
stopped gaining is a stale opponent taking a share of every iteration, so it is re-seeded from the
current main, its Adam moments dropped with it. The rule is: the best of its last three margins
against the frozen main does not beat the best of everything before them by 0.02 of a bar. Reading
the last value alone would reset a healthy exploiter about as often as a stalled one, because a
sixty four bout rollout has a standard error worth several hundredths and the margin being watched
is worth a few.

**A hand-coded anchor is a fourth opponent and not a fourth role.** `--anchor <policy>` puts a
shipped mind in the mix at `--share-anchor` slots and is off by default. The three roles above are
the design; this is a hedge, and it costs no machinery because an opponent with no contender is
already a policy played by name. What it hedges is the calibration's own finding — a league of
selves is still one lineage, and both refits that moved this session moved against `golem-driver`
rather than against a mirror. An anchored run can overfit to that single opponent, which is exactly
what the exploiters are there to punish, so it stays a flag with a share rather than a default and
a run that used it says so in its header.

**Resumability is a requirement and not a convenience.** An overnight is hours of a machine and
this session has already lost a long run to a V8 fatal, which takes the process and leaves the last
write on disk as the only recovery. So the main and the exploiters ride in one state file under
`--dir`, each pool entry is its own file beside it, and a killed run continues from `--resume`.
Adam's moments are deliberately *not* saved, for the reason `train-ppo.mjs` gives: they are the
shape of the last few gradients and not the mind, and a resumed role rebuilding them costs an
iteration or two of a dip that the log shows and this paragraph explains. `--from` starts a fresh
league's main from a trainer checkpoint, so an overnight need not re-learn what a day of
single-opponent runs already paid for.

**The matrix is the measurement, and the tripwire is what the matrix cannot see.** `--matrix` plays
every stored pair from both corners with both sides greedy, and `matrixBreaks` names every pair
where a newer mind fails to beat an older one — a run that progressed reads as one sign below the
diagonal, and a cycling pair reads as a sign that changes as you walk it. A matrix is quadratic in
its rows and a night at `--pool-every 4` takes thirty of them, so `--matrix-cap` thins the rows
with the same `thinPool` the sparring cycle uses, which keeps the oldest and the newest so that the
longest baseline in the run is always a row of the answer. That is a real claim and
it is also a claim a mind can satisfy by getting better at not fighting, which is precisely the
failure the calibration measured. So four columns are read every time the matrix is: the decided
fraction, blows per stroke, the abort fraction, and the idle-dummy kill rate by weapon class. The
first three come off the matrix's own rows for nothing — Session 14 added `strokesStarted` and
`aborts` to the tournament row for them, on the `arm` precedent, because every other stroke column
in that file is built from contact reports and a stroke that lands nothing lands nothing to count.
The fourth is a separate probe and is the one that caught Session 13's fit, so it is worth its
bouts; `scripts/idle-probe.mjs` is that probe, promoted out of `.review/` when the plan made its
rollup a permanent column, because a tripwire in a gitignored directory is not one.

**A rating during a run and a rating after it are the same instrument only if they are told to
be.** `--evaluate n` spends bouts the fit would otherwise have had, so a night set to rate every
twenty-five iterations leaves three points and no curve; and a run that stops when the morning
comes never reaches its last iteration, so it never plays `--final-bouts` and never writes
`--out`. Both are answered by the pool files, which already hold the weights of every snapshot the
run took. `scripts/rate-snapshots.mjs` rates them afterwards on a machine that is no longer
training, at whatever budget the morning can afford, through the same `ratePolicy` against the same
two baselines on the same evaluation pool — the arm's own seed exclusive-or'd with `0xc0f1c0f1`,
which is the derivation the runner uses. That last clause is the whole point of the script rather
than a detail of it: a rating is only comparable to another rating taken on the same pool, so its
rows sit beside the rows the run printed and beside the other arms, and beside nothing else.

**Shipping a mind is not the same as shipping the last one.** `--out` at the end of a run writes
whatever the main happened to be on the final iteration. That is the right default and the wrong
answer whenever the rating and probe curves say an older snapshot was the better mind — and those
curves are read after the run, when `--out` is long gone. `--ship <n|main> --out <path>` writes any
snapshot the arm took, refusing an iteration it did not take and naming the ones it has, and it
reads the run without writing anything back into it, so it is safe beside an arm still training.
Three things about the header it writes are worth naming. The first was a live defect: the
end-of-run path passed all twelve fit knobs into the module header, where `PolicyWeights` declares
four — an object literal carrying the other eight is an excess property, so `npm run check` would
have refused the file the ship had just written. It had never fired because no league had yet
reached its last iteration. The second and third are hazards a later ship has that an end-of-run
one does not: the provenance would have to be retyped on the shipping command line, so a night at
`--entropy 0.0003` could be recorded under the trainer's default 0.003, and the bouts and asks to
hand are the arm's totals now rather than what that snapshot saw. Both are answered by reading the
run's own log — its header row for the knobs, the anchor and the emphasis, its iteration rows
summed to the snapshot for the spend. The pool the sentence names is the pool as it stood *before*
the shipped iteration, since a snapshot from iteration 8 of a run that has since taken five past
selves sparred with none of them.

## The fit on K threads, which has to be the same fit

Session 05 of the learn set. `scripts/fit-worker.mjs`, and `FitPool` in `scripts/train-ppo.mjs`.

**What was binding.** The record's 109 s `train-ppo` iteration is 23 s of collection on thirty
worker threads and 86 s of `ppoFit` on one, and Session 04 measured the same fact from the other
end: three arms at ten collectors apiece did 2.15 times the work of one arm at thirty, because
about two thirds of a league iteration is the fit and the bookkeeping and no collector touches
either. Adding collectors had run out of road. `backwardFrom` in `src/golem/neural-net.ts` adds one
sample's gradient into the caller's array, and that is the seam a data-parallel fit needs: a
minibatch's gradient is a sum over samples, and a sum splits.

**The arrangement.** A minibatch is cut into K contiguous slices by index. Each shard walks its
slice with the body of `ppoFit`'s inner loop -- `load`, `forward`, `surrogateGrad`, `backwardFrom`,
the critic's pass, and the four running sums the read-out is made of -- into its own gradient triple
in shared memory, and counts up a barrier. The main thread then adds the K partials into one triple
**in shard order 0..K-1**, takes the three Adam steps, and goes on. The shuffle, the advantage
standardisation, the trust region, the `stopped` path where a failing minibatch is discarded, and
the read-out are where they were, on the thread they were always on.

**The shard order is the design and not a detail of it.** Floating-point addition is not
associative, so splitting a sum of four thousand terms K ways and adding the partials moves the
answer in its last bits whatever order they go in. What a *fixed* order buys is that the move is the
same move every time: the same seed gives the same weights on a busy host and on an idle one, and
the equality test is a test rather than a coin. A pool that summed in completion order would pass
every assertion in `tests/ppo.test.mjs` -- the effect is 1e-14 against a 1e-9 bar -- and would
quietly make a run irreproducible. That is why the order is argued in the code and said again here.

**The observation normalisation is frozen for the fit, and the shards get a copy of it.**
`extendNormalisation` runs after the fit in both callers and never during it, so the mean and
variance a shard reads are the ones the rollout was collected under; they cross once an iteration in
`FitPool.bind` and no step can move them. The equality test loads a rollout whose normalisation is a
real run's rather than the identity, because an identity normalisation is exactly the case that
would hide getting this wrong: `normalise` would be the identity map and a shard reading a stale
normalisation would agree with one reading a fresh one.

**Shared memory, and what crosses when.** The rollout's `x`, `a` and `logp`, the standardised
advantages, the returns, the frozen normalisation and the two surrogate constants cross once an
iteration; the weights, the critic's weights and the nine spreads cross once a *step*, because Adam
has just moved them -- three memcpys against four thousand backward passes. The shards block on
`Atomics.wait` and are advanced by `Atomics.notify`, never returning to their event loops, because a
step is milliseconds and a message round trip is a scheduler's decision. The one thing that must be
a message is the binding, since a `SharedArrayBuffer` reaches another thread only through the port;
a shard takes it with `receiveMessageOnPort` from inside the wait, which is what keeps `bind`
synchronous and therefore `ppoFit` synchronous. An async `ppoFit` would have pushed `async` up
through `trainRole` and every caller of it for no reason a number could see.

**The pool lives for the run.** Unlike `runJobs`'s collectors, which are started per call, the fit
shards are opened once and closed at the end: a minibatch step is milliseconds and a thread start is
not, and there are forty of them in an iteration. `scripts/league.mjs` opens one pool and every
role's turn -- the main's and each exploiter's -- steps through it, because a pool that lived for a
turn would pay a thread start per role per iteration.

**K is a flag and its default is the knee, which is eight.** Both trainers take `--shards` and both
default to eight: on the measured curve the first eight threads return 83 % of themselves and the
next eight return 27 %, so eight beside twenty-two collectors is the shipped configuration and
sixteen is the fastest one. `scripts/sweep.mjs` defaults to *one* instead and writes the resolved
number onto every arm's command line, because a sweep divides one host between arms and an arm that
silently took the trainers' eight would be spending its neighbours' collectors; the runner subtracts
K from each arm's budget, but only above one, so a `--shards 1` sweep is the same arithmetic
Session 04 measured its throughput bar with. The curve, the knee and what the shipped configuration
does end to end are in `docs/measurements.md`.

## The style set read as one document, and the three claims it actually established

Session 15, the set's close-out. The sections above were each written by the session that did the
work, and each is scoped to the pool it ran on — nine minds in Session 08, twelve in Session 11,
fourteen at the end. **A ranking does not survive a change of pool and none of them claims it
does.** What follows is the part that survives all three, read off the final table in
`measurements.md`: fourteen policies, both pools, 4,096 bouts each, seed 20260906.

**One: the arena can tell a mind from a non-mind, and can barely tell two minds apart.** The
learned artifact that was never fitted — `golem-learner`, whose table on disk is still zeros, so
the mind names the first open option at every ask — is last on both pools by 0.115 and 0.096 of a
bar, while the thirteen real minds span 0.067 and 0.110 between themselves. Two hand-written
styles differ from each other by less than a non-mind differs from the worst of them. That is the
same result Session 11 selected the decidability lever on and it is the set's most durable single
number; it is also the standing reason to gate a change on a *paired* difference between two
designed minds rather than on a mind against its own noise.

**Two: the body is worth about three times the mind, and the pool total is a maul statistic.** By
the build's armed terminal, a mind's own spread across the seven classes averages 0.515 of a point
and the spread across all fourteen minds inside a class averages 0.18. Every mind in the set wins
a long maul and loses a whip. Spearman's ρ between a mind's overall standing and its rank inside a
column runs maul +0.80, blade +0.56, mace +0.54, plate +0.42, unarmed +0.29, whip +0.16 and fist
+0.06 — so a pool average is a faithful statement about who fights well with a maul and says
nothing whatever about who wins a fist fight. **Report a fit by weapon class; a pool total is a
weighted opinion about the pool.** This is why Session 08's build-class reading is repeated in
every session after it rather than summarised away.

**Three: every instrument in the loop mirrors the body, and four of seven classes cannot decide in
a mirror.** On identical bodies, plate decides 2 % of its bouts, fist 2 %, whip and unarmed none at
all — 1,816 of 4,096 bouts, four in nine, returning exactly 0.500 for all fourteen minds. On random
pairs the same classes decide 19 % to 33 %, because two different bodies is enough asymmetry for
one of them to get through. Training is mirrored self-play; the league's opponents meet the main on
its own body; `ratePolicy` mirrors; `scripts/idle-probe.mjs` is a build against a copy of itself.
The one pool that is not mirrored is the one the matchup screen draws, and it is the pool on which
the set's shipped fit comes thirteenth of fourteen while coming fifth on the mirror. **A fit is
only as general as the least mirrored instrument that chose it, and this set had none.**

### What the set shipped, and the one thing a person said about it

`src/golem/policy-weights.ts` carries a 71 → 256 → 256 → 12 head, 87,308 numbers, fitted by PPO
over 93 league iterations against eleven of its own frozen past selves, two exploiters and
`golem-driver`. Against the fit it replaced it gains +0.0251 ± 0.0209 points a bout on held-out
asymmetric pairs, paired bout for bout, t 2.35 — the run improved the matchup the game has, on a
pool nothing in the training loop optimises for, and the mind it produced is still second from
last on that pool. Both halves belong in the same sentence and the set closes with both.

The owner watched it and accepted with a hedge: *"kind of OK … I can see it eventually turning
into something good."* They named two behaviours unprompted — the golems stood just outside each
other's reach, or hugged — and both are **instrumented and unpriced**. `nearRangeStallSeconds` and
`retreatOutsideReachSeconds` in `src/engagement.ts` have counted exactly those two things since
Session 00 and the tournament prints them; `RewardTable` in `src/golem/reward.ts` charges `clinch`
only inside reach, `idle` only on the tangential component, and ships `tick` at zero. Ninety-three
iterations optimised happily around behaviours nothing in the objective charges for, and the
measured fit stalls 6.4 s a bout against the hand-coded fencer's 1.7 while deciding 35 % of its
bouts against 52 %.

**The general form of that, which is the sentence this set is worth keeping for:** an instrument
that is only printed is one the optimiser is free to ignore, and the gap between "we measure it"
and "it is paid for" is where a person's eye keeps landing. The causal test — one run with `tick`
above a small positive number, scored on the two columns that already print — is designed, cheap
and unrun, and is named here rather than in a plan file because the plan files are gone.

## Viability: which pairs can end a bout, and every pool drawn through it

Session 01 of the learn set, and the direct answer to the third claim above. The owner's brief for
that set opens with one sentence -- *"only look at viable matchups, including the Random setup in
the UI -- no time on layouts that can't kill"* -- and before this session there was nowhere in
`src/` that sentence could be written down. `poolFor` in `scripts/train-ppo.mjs` could narrow a
*training* pool by armed terminal and was the only thing in the tree that could; the rating, the
two probes, the league and the screen's Random button all drew from the whole fifty-two.

**What a viable pair is.** `src/golem/viability.ts` holds two measured constants and two
predicates over them. `VIABLE_TERMINALS` is the weapon classes a pool draws from; `viableBuild`
asks whether a body carries one, through `armedTerminal`, which classes a build by the terminal on
the hand that fights and which moved here from `scripts/tournament.mjs` in the same change (that
file re-exports it, so no caller moved with it). `VIABLE_PAIRS` is the unordered class pairs that
can finish each other, keyed by `pairKey`; `viablePair` asks that of two bodies. Two questions and
not one, deliberately: a class can be worth putting in a pool and still be a poor matchup against
one particular other class, which is the case a plate against a maul makes.

**The rule the constants were read off, which is two rules.** A class is viable when a hand-coded
reference mind on it kills a motionless copy of itself in at least half its bouts, **or** when a
random pair of it against an already-viable class decides at least half. The first is the floor: a
class that cannot finish something which never moves, never blocks and never steps away finishes
nothing. The second is what lets a plate fight a maul, and it is applied to a fixed point rather
than in one pass, so the answer does not depend on the order the classes happen to be listed in.
Both tables are `golem-driver`'s -- hand-written, and not a learned mind, because a viability set
fitted around whatever the current fit is good at would move every time the fit moved and the pool
a mind trains on would then be a function of that mind. `scripts/viability.mjs` regenerates both
and prints the literal; the measured tables are in `measurements.md`.

**The class is the unit, not the draw.** A draw index is a fact about one seed. "A maul finishes
and a whip does not" is a fact about weapons, and it survives a change of seed, of pool size and of
mind. The cost of that choice is stated rather than hidden: a class is admitted or refused whole,
so a viable class carries a few builds that are individually hopeless and a refused one loses a few
that were not. `scripts/viability.mjs` also lists by name any build that decided nothing at all,
which is what a per-build column is for; on the 2026-09-09 table there were none, so the thirteen
the record has counted since the matchup set are thirteen the *pairing* wasted rather than thirteen
bodies that cannot fight.

**What the measurement said, which is not what the plan expected.** The idle floor admitted `maul`
at 98 % and `mace` at 53 % and nothing else -- a blade kills a motionless copy of itself once in a
hundred and eleven bouts. Then the second rule admitted **every remaining class through the maul**:
a maul decides 98 % against a blade, 97 % against a fist, 93 % against a plate, 87 % against a whip
and 71 % against a body carrying no terminal at all. So `VIABLE_TERMINALS` is the whole shelf,
`viableBuild` refuses nothing, and the predicate the set actually runs on is `VIABLE_PAIRS` --
eleven of the twenty-eight unordered class pairs, with the floor falling cleanly between `blade vs
mace` at 63 % and `mace vs plate` at 36 %. **No class is dead weight; only pairs are.** That is the
frozen unit being wrong rather than the rule misfiring, and it is written here because two things
follow from it that would otherwise look like bugs: a `--terminals` default that cuts nothing, and
a Random button that has to draw an opponent rather than a body.

**Every pool draws through it, and the whole pool has one word.** `poolFor` defaults `terminals` to
`VIABLE_TERMINALS` and `ratePolicy` runs the same filter on whatever pool it is handed, so a rating
and a rollout are on the same builds; `scripts/rate-snapshots.mjs`, `scripts/probe-snapshots.mjs`,
`scripts/idle-probe.mjs` and `scripts/league.mjs` take the same default and the same
`--terminals all` back to the fifty-two. On the measured table the *class* filter leaves the same
fifty-two, so by itself it bought a route and not a cut. The tournament is the exception and takes
`--pairs viable` as an opt-in instead, because it is the harness the record's whole-pool tables were
taken in and a default that quietly changed its pool would invalidate them. The empty list still
means the whole pool everywhere -- what moved is the default, not the meaning -- because
`POLICY_WEIGHTS` carries an empty one from the run that fitted it and a build that reinterpreted
that field would rewrite a shipped table's header into a claim about a pool it never saw.

**The mirror is where the cut actually falls, and it is a narrow pool.** Almost every bout the tree
runs is *mirrored* -- `collectRollouts` and `collectLeague` schedule with `mirror: true`, so do
`ratePolicy` and `leagueMatrix`, and an idle probe is a build against a motionless copy of itself --
which means the pair a bout is fought on is `(class, class)` and the predicate that governs it is
neither `viableBuild` nor a pairing rejection. `viableMirror(setup)` is `viablePair(setup, setup)`
said once with a name, and `VIABLE_MIRRORS` is its class form, derived from the self-pairs of
`VIABLE_PAIRS` rather than measured again. **Two classes have a viable mirror**, `maul` at 100 % and
`mace` at 74 %; `blade|blade` at 36 %, `whip|whip` at 7 %, `plate|plate` at 4 %, `fist|fist` at 1 %
and `none|none` at 0 % do not. So `poolFor({..., mirror: true})` and `keepViable(pool, terminals,
mirror)` keep 15 of the 52 builds at seed 20260906 and 20 of 52 at the league's evaluation seed: a
mirrored pool is a maul-and-mace pool, and a mind trained through one never mirrors a blade. That
cost is named rather than hidden, and the reason it is worth paying is that the record had already
priced those bouts -- mirrored, a blade decides 41 % of its bouts, a plate and a fist 2 %, a whip
and an unarmed body 0 %, so they were buying amplified critic residual in a rollout and half a point
by construction in a rating. Measured after the change, a 64-bout mirrored tournament of the three
minds decides 87.5 % of its bouts on the mirror pool against 31.3 % on the whole one. `--terminals
all` restores the fifty-two for the mirror exactly as for the class, which is the one word the
close-out's final tables need; and `--terminals blade` on a script whose bouts are mirrored is
refused by name -- *no build armed with blade can finish a copy of itself* -- rather than run for a
night against the answer nobody wanted.

**Random redraws; the menus do not shrink.** `randomViableGolemSetup` is `randomGolemSetup` over
the same seeded stream, rejected until `viableBuild` accepts, so a drawn body is still a pure
function of its seed and the caption's seed still names it. Because that predicate turned out to
accept everything, the screen calls `randomViableOpponent` instead whenever there is already a
golem in the other corner: same stream, same seed caption, redrawn until `viablePair` accepts the
pair the owner is about to watch. Both throw past thirty-two refusals naming the class they last
refused, the way the plain draw throws after eight. The nine pickers behind Customize are untouched
and still offer everything: the owner can build anything by hand, a hand-built pair the predicate
refuses is fought with one line of caption saying *these two cannot finish each other*, and Begin
stays enabled. Restricting a menu is a different act from redrawing a draw and only the second one
was asked for.

**The one pair the app still opens on that this refuses.** `defaultGolemSetup` is a blade and
`blade vs blade` decides 36 %, so the showcase mirror `src/main.ts` opens is a pair `viablePair`
turns down. It is left standing on purpose: that build is the reference body a dozen sweeps in
`measurements.md` were taken on, and moving it would strip the provenance off every constant they
chose to improve one screen. `tests/bout.test.mjs` asserts the refusal rather than the acceptance,
so the number is in front of whoever decides.

## The curve page, and the rule that a series carries its pool

Session 02 of the learn set, and the first of the three things the owner's brief asked for before
any learning idea. `curve.html` is a third Vite page beside the arena and the bench, named in
`vite.config.ts` for the reason the other two are: Vite's default input is `index.html` alone, and
a page that works under `npm run dev` and is absent from `dist` is a config failure wearing a
routing failure's clothes.

**The data stays where it is.** `tournaments/` is gitignored and outside `public/`, and copying a
run into `public/` would either commit a night's logs or make the page lie about what it is
showing. A dev-only plugin in `vite.config.ts` serves that directory read-only under `/runs/` with
a JSON listing; it has no `build` hook, so the built page's listing fetch fails, and *that failure
is how the page learns it has no run server* and offers a drop zone and a file input instead. A
curve can therefore be shown on a machine that has never had this repository on it.

**Readers are DOM-free and tested; the drawing is not.** `src/curve/runs.ts` is every row parser
and every series builder as pure functions over text, because nothing here can be wrong in a way a
screenshot shows -- a reader that takes `clipFraction` where it meant `kl`, or that drops the last
row of a run still being written, draws a perfectly convincing line. `src/curve/chart.ts` is inline
SVG over the arrays those functions return and decides nothing; `src/curve/main.ts` owns the
elements. The rule is stated in the module rather than left as a habit: a function here that needs
an element is in the wrong file, and one there that needs to know what a column means is too. No
chart library, because six kinds of line and a band is not a dependency, and a dependency is
something the docs gate would have to learn about.

**Every series carries its pool, and that is the load-bearing rule rather than a label.**
`scripts/rate-snapshots.mjs` has said it in its own header since the style set: a rating is only
comparable to another rating on the same pool. A bar margin over fifty-two draws and a bar margin
over the fifteen bodies a mirror admits are two instruments printing the same units, so `onePool`
refuses to draw a set whose labels disagree and names the ones that differ. The label is built out
of what the file said -- seed, random-pair count, terminal classes, build count -- rather than out
of what a run of that name usually means, so two labels compare equal only when the two files said
the same things. A refusal costs a click and a false overlay costs a conclusion.

**Two fidelity facts a later column has to respect.** A `train-ppo` row and a league row are not
the same row (`retSem` and `collectSeconds` belong to one, `byOpponent`, `shares`, `pool` and
`snapshot` to the other), and one `Iteration` type carries both with `null` where the file said
nothing -- never a zero, because a zero draws. And an iteration is not always a number: both curve
scripts end their file with a row whose `iteration` is the string `main`, the live weights rather
than a snapshot, which on an arm that stopped between snapshots is the only rating of where the run
actually got to.

## `golem-snapshot`: any checkpoint, playing in the arena

Session 03 of the learn set. Nothing in `src/` had ever loaded a fitted table at run time.
`golemPolicyMind` hard-wires `POLICY_WEIGHTS`, so the only mind a person could watch was the one a
session had already decided to keep, and every intermediate a fit passed through sat in
`tournaments/` as JSON readable only by a script that prints numbers. The owner asked for the
opposite -- a way to watch the policy, or at least snapshots of it -- and watching iteration 8
beside iteration 93 on one matchup is a question about behaviour that no rating column answers.

**One policy name and a slot behind it.** `Policy.create(seed)` in `src/mind.ts` is synchronous and
the setup screen renders its picker from `driverOptions` before any bout exists, while a table is a
two-megabyte fetch. So the table is fetched first, installed by `installSnapshot` in
`src/golem/snapshot.ts`, and the factory reads `installedSnapshot()`; an async factory would have
made nineteen other policies async to serve one. `golem-snapshot` is in `GOLEM_POLICIES` in
`src/units.ts` always and in `driverOptions` only when something is installed, which is the one
place those two lists are deliberately not the same list. The slot holds one snapshot; a second
slot -- two of them fighting each other -- is a one-line generalisation nobody has wanted yet.

**Every table goes through `checkPolicyWeights`.** A snapshot is `weights`, `logSigma` and a
normalisation, assembled by `freshPolicyTable` and handed to the same nine refusals the shipped
table is loaded under. The three formats carry different amounts of provenance and the module
invents none: `saveLeague` writes `policy` and `features` beside the weights so a league state is
refused by version outright, while a `train-ppo` checkpoint carries neither and is read under this
build's versions with the four shape checks catching a moved surface. That is honest rather than
ideal, and it is written down because a change that moved no shape at all would be a rescaling of a
column -- exactly what `PILOT_FEATURES_VERSION` exists for and exactly what a version-less file
cannot be checked against.

**Greedy and drawn are two fighters**, as the idle probe measured: the same weights drawn finish
three and a half times as many bouts against a motionless dummy as the head's mean does. The
readout names which one is playing, because a readout that did not would be a readout of an unnamed
mind.

**The readout is player-owned and off by default**, per this file's diagnostics rule: a `<details>`
the player opens that no state change reopens. It shows what the mind asked the executor for beside
what it got -- commanded stand-off against the gap actually held, advance, strafe, lean, the three
gates, the stroke phase, asks a second -- and the two engagement seconds accruing from the bout's
own `EngagementTracker`, so the behaviour the owner complained about is visible as a number while
it is happening rather than only in a table afterwards. The diagnostics-only `x2`/`x4` skim beside
it multiplies the fixed-step count a frame and moves no physics: the step is the same step, so a
sixty-second bout can be watched in fifteen without any reading changing.

## The sweep runner: several experiments at once

Session 04 of the learn set. `scripts/sweep.mjs` takes a manifest of arms, starts them all at once
off one seed and one starting checkpoint, divides the host's threads between them, restarts an arm
that dies from its last checkpoint, and rates every arm on one pool when they stop. Every learning
session in this set is a manifest for it, and the four that ran are committed under `docs/sweeps/`.

**Why it exists.** Each open question the set is made of is a pair of arms differing in one flag,
and a run needs about one core for four fifths of its wall clock. The owner called running several
at once the highest-value option; the record had already measured it by hand at 2.6 times the
answers an hour for the same host.

**Processes, not threads.** An arm is a child `node scripts/train-ppo.mjs` or `node
scripts/league.mjs` with its own worker pool, and the manifest is a list of command lines with the
shared parts factored out -- every flag in it is a flag those scripts already parse. A runner that
reached inside the fit would be a second trainer with its own numbers, and the set's ninth frozen
choice is that neither the sweep runner nor the sharded fit may change a number.

**The worker budget is arithmetic and it is printed**: `floor((availableParallelism - 2) / arms)`
collectors an arm, minus `--shards` when that is above one, with two threads left for the host. The
runner's own shard default is *one* where both trainers default to eight, and it writes the
resolved number onto every arm's command line, because a trainer's default is the knee of a curve
measured with the whole host to itself and a sweep is precisely the case where the host is not one
run's.

**Nothing is rated during the run.** Every arm launches with `--evaluate 0`: a rating steals the
cores the collection is paying for, and a rating taken mid-run on a busy host is a rating on a
different clock. `rateArms` afterwards puts every arm on one pool at one seed, and `ratePaired`
puts every arm *in one call*, so arm-minus-arm is a paired difference over the same bodies under
the same streams rather than a difference of two means from two calls. That is the set's criterion
made into a function, and Session 04's own verification is its calibration: three arms differing in
nothing produced a paired margin of exactly `+0.0000 of bar`.

**A resumed arm is the same run.** The checkpoints carry the Adam moments as flat arrays from this
session on -- which took a checkpoint from about 0.8 MB to about 4.7 MB -- so an arm restarted after
a V8 fatal continues the same optimiser rather than starting a warm one, and the restart is
appended to the arm's log as a row rather than hidden. A fit resumed with its moments equals the
uninterrupted fit to 1e-9 over two iterations and one resumed without them does not, which is the
whole argument for the size.

## The axis probe: is each command axis buying what it claims

Session 07 of the learn set. `scripts/axis-probe.mjs` pins one command axis to one value on every
ask, over `uniform` or `golem-driver` on every other axis, and prints what the executor did with
it beside what the record *predicted* it would do. The record had derived each of those claims --
the feet settle at `hold - advance / closeGain`, a saturated advance buys 0.56 m, a stroke opens
inside 0.92 of a reach -- off `src/golem/tactics-v4.ts` and had never put one in front of a body.

**It measures the executor and never the learner**, deliberately and at some cost in realism. A
fitted policy compensates for a bad axis -- it learns to write 1.4 where the axis means 0.9 -- and
a rating taken over one hides the defect entirely, which is how a surface with a dead axis in it
survives a whole plan set.

**A cell is one pin and every cell fights the same bodies.** The pairings, the builds and the two
per-side seeds are drawn once by `scheduleJobs` from the run's seed alone and replayed for every
cell with only the probed corner's policy name changed, so two rows differ by their pin and by
nothing else. The pin lands through a `pinned` contender in `scripts/tournament-worker.mjs`, and the
row records the per-field minimum, mean and maximum of what the executor was actually handed -- so
"this cell pinned exactly one axis" is read back out of the recording rather than trusted from the
code.

**There are two harnesses and they are never mixed in a column.** Against `golem-driver` the gap is
a two-body outcome and the probed side gets roughly half a vote, which put every `standOff` cell at
about 1.6 m in a smoke run; `idle` gives the probed side the whole vote, which is what "measure the
executor" means. Every number the session recorded says which harness it came from.

**Three candidate rows landed on `GOLEM_TACTICS_V4` and none of them ships.** `holdMetres`,
`closeGain` and `strokeOutOfRange` are spread per cell rather than assigned, default to what ships,
and widen nothing: a surface change is a version bump and a paired arm, never a silent edit, so a
finding here becomes an arm in a later session and only an arm that clears a bar ships. None did.

## The four rows that charge for how a bout is fought

Session 06 of the learn set, and the direct answer to the sentence two sections up: *an instrument
that is only printed is one the optimiser is free to ignore.* `RewardTable` in
`src/golem/reward.ts` had four rows — `win`, `clinch`, `idle`, `tick` — and the owner's two
complaints landed on behaviours none of them touch. Standing just outside reach costs nothing:
`clinch` is charged inside reach only, `idle` is the tangential component of a drift and a fighter
holding station at 2.6 m is not drifting. Hugging costs `clinch`, which is 0.004 a second against a
bar margin whose whole range is one point. So the table grew four rows, all of them shipped at
zero, and each one is a coefficient on a quantity `src/engagement.ts` was already accumulating for
the tournament to print.

- **`closing`** pays `radialClosingMetres` — the metre of approach, radial component only, taken
  ask to ask. It is a **credit** and the only one in the table.
- **`stall`** charges `nearRangeStallSeconds`, the second spent inside striking distance without
  striking.
- **`outside`** charges `retreatOutsideReachSeconds`, the second spent backing away from an
  opponent already out of reach.
- **`swing`** charges a stroke that *finished* and landed nothing.

**`closing` is the load-bearing one, and the reason is the mirror.** The identity this whole
objective is built on is that `Σ(dealt − taken)` over a side telescopes to that side's final bar
margin; every shaping row is laid over the top of it and none of it telescopes. In a mirrored bout
the two sides' bar margins are equal and opposite and so is the `win` term, so averaging a mirrored
pair annihilates both — and what survives is exactly the shaping. Every row the table had before
this session is a *charge*, so the symmetric part of a mirror was a number that could only be made
larger by doing less: the cheapest mirrored pair is two fighters who never approach, never clinch,
never drift and never swing. Ninety-three iterations found that, which is what the owner was
looking at. `closing` is the first row that pays a positive number for engaging, so it is the first
row whose symmetric part rewards a pair for closing the distance rather than for standing still.
`tests/reward.test.mjs` pins that property directly: the symmetric part of a mirrored pair under a
non-zero `closing` is positive when both sides close and zero when neither does.

**Why `swing` counts a finished stroke and not a started one.** The obvious definition is *a stroke
that started and drew no blood*, and it is the wrong one. Over a uniform policy 99.2 % of strokes
started are aborted before they commit, so any empty-stroke count taken that way is measuring the
abort gate in `src/golem/tactics-v4.ts` and nothing else — it would charge a mind hardest for the
one part of the executor that is working. `emptyStrokeInstrument` in
`scripts/tournament-worker.mjs` therefore watches the stance machine rather than the contacts: a
stroke opens when `strokes` advances, closes unscored when `aborts` advances, and books an empty
only when the stance returns to `free` with no blow recorded in between. It has to be a second
instrument beside `strokeInstrument` because that one is built from contact events and a stroke
that lands nothing raises no event to be built from.

**The rows are priced in the main thread, which is why they are flags rather than a rebuild.**
Rollout packs carry the raw quantities — `PACK_COLUMNS` in `scripts/train-ppo.mjs` names all ten —
and `mergeRollouts` multiplies by the table when the packs come home. One night's rollouts can be
priced under five tables; a sweep arm is a coefficient on a command line. A pack written before
this session is refused by the *name* of the column it lacks, because the alternative failure is
silent: `undefined` times a coefficient is `NaN`, one `NaN` reward poisons every advantage in its
episode through the backwards discount, and the log of such a run looks like a fit that simply
stopped learning.

**The share is reported per row.** `penaltyShare` stays the scalar it was, because `src/curve/runs.ts`
reads it as one and a curve that silently blanks is worse than a curve with less in it;
`penaltyRows` rides beside it with the seven shaping rows named. A run under a non-zero `closing`
reports a *negative* contribution from that row, and that is deliberate — a share that took an
absolute value per row would report a mind as more heavily shaped the more it was paid to fight,
which is the opposite of the warning the share exists to give.

## Three things a fit can walk across its iterations

Session 08 of the learn set. A run's start distance, its opponent and its weapon pool were three
constants; they are now three schedules, and a schedule is a string. `parseSchedule` in
`scripts/train-ppo.mjs` reads `value:from` pairs separated by commas into `[{from, value}]`, and
`scheduled(schedule, iteration)` returns the value of the last stage whose `from` is at or below
the iteration. The grammar is small on purpose and refuses four things by name: a first stage that
does not start at 0, boundaries that do not strictly increase, a `from` that is not a whole
iteration count, and an empty value. A run whose curriculum was mis-typed should stop before it
spends an hour, not after.

**A constant is a one-stage schedule, which is what makes the old flags survive.** `--separation
1.2` and `--separation-schedule 1.2:0` parse to the same `[{from: 0, value: 1.2}]` and are the same
run, so nothing that passed a scalar had to change and nothing that reads a header has two shapes
to handle. The pair is refused together -- naming both is a person saying one thing twice and
possibly disagreeing with themselves -- and the resolved schedule goes into the header row, with
the value in force written into every iteration row beside the numbers it produced. That last part
is the one that matters six months later: a curve read off a log can say which stage a row was
collected under without anybody having to re-derive it from the flags.

- **`--separation-schedule`** is metres between the corners at the start of a bout, or the word
  `default` for `CONFIG.fighter.separation`. It reaches the bout through the job: `scheduleJobs`
  in `scripts/tournament.mjs` writes `separation` onto every job of an iteration,
  `scripts/tournament-worker.mjs` hands it to `runBout`, and `runBout` in
  `scripts/bout-runner.mjs` places the right corner there. **The config does not move**, and a job
  without the field is a job that starts where every harness in this repository has always started
  -- which is why the arena, the bench and every measurement already taken are untouched by this.
  `runBout` refuses a non-positive or non-finite separation by name rather than clamping it,
  because a schedule that parsed a stage wrongly would otherwise start two bodies inside one
  another and read as a physics failure three files away.
- **`--opponent-schedule`** takes `idle`, `uniform`, any `golem-` driver, `self`, or `league`.
  `self` is the fit playing its own current weights, which is what a lone `train-ppo` run has
  always done. `league` in `scripts/league.mjs` hands the iteration to the pool machinery -- the
  declared mix of self, pool snapshots, exploiters and the anchor -- and in a lone `train-ppo` run
  it means self-play, because there is no league pool beside a lone fit and the alternative was to
  refuse a stage that a reader of the plan would reasonably write.
- **`--terminals-schedule`** takes class lists joined with `+`, or the word `viable` for the whole
  viable shelf. It sits *beside* `--terminals` rather than replacing it, and that is load-bearing
  under the sweep runner: `armArgs` in `scripts/sweep.mjs` writes the sweep's one declared pool
  onto every arm, because two arms rated on two pools are two instruments. So the schedule narrows
  what an arm *trains* on while the pool it is *rated* on stays the sweep's, which is the only
  arrangement in which a class curriculum can be compared to an arm that had none.

**In a league the three touch the main's collection alone.** The exploiters and the pool are
unaffected, because a curriculum for an opponent whose entire job is to find what the main cannot
do is not a curriculum -- it is a handicap on the instrument. The one thing a class schedule does
reach is which builds an exploiter is fitted over, and only when a schedule was actually asked for.

## Four shapes a policy may be, and three rows an arm may drive

Session 09 of the learn set. The owner asked for a different network or a different algorithm; what
landed is a menu of single changes, each behind a version and a flag, so that the shipped table
still loads and every one of them can be run as an arm beside an unchanged control. Nothing here
is the default. `POLICY_VERSION` is 3 and `PILOT_FEATURES_VERSION` is 2, and the mind that ships is
still a version-2 table over seventy-one columns with a Gaussian head -- which is the point: a
build that could only read what it writes could not have put the control and its nine alternatives
in one process, and the paired rating the whole session rests on would not have been possible.

**The action vector is twelve numbers wide under every head and that is what makes this cheap.**
What a head changes is the width of the *network's output row*, not the width of what it produces:
`sampleAction` writes nine axis values and three gates whether an axis is a Gaussian mean, nine bin
logits or two Beta shapes, so `commandFromAction`, the rollout pack's stride, the executor and every
recorded run are untouched. `HeadSpec` in `src/golem/policy.ts` is the whole of the bookkeeping --
one entry an axis saying which kind it is, where its parameters start in the row and how many it
owns, plus where the gates start and where the state-dependent spreads start if there are any --
and it is built once per table by name and shared, because a fit builds one per shard and a bout
builds one per mind.

`checkPolicyWeights` refuses nine things now rather than six, and three of them are new: a table
whose declared version is older than the field it is using, a head name this build does not have,
and a spread name it does not have. The first of those is not a typo check. A version-2 table that
names a head is either a file somebody edited by hand or a *reader* that pasted its own default
onto a file which never made that claim, and the shape a table declares has to be the shape it was
fitted under or its weights mean something else. `assemble` in `src/golem/snapshot.ts` therefore
deletes the head fields from a checkpoint that declares version 2 rather than defaulting them.

### The two heads that are not Gaussians

- **`--head mixed`** puts a nine-bin categorical on `standOff` and `advance` and leaves the other
  seven axes Gaussian. Those two are the axes that decide range, and Session 07 measured why a
  unimodal density is a poor way to ask about them: the bottom third of `standOff` is a physical
  floor -- the executor settles two bodies at about 1.17 m however small the command -- so a
  Gaussian that wants to put mass both at the floor and at a stand-off outside their reach has to
  put mass in the middle as well, and the middle is where a body is hit. Nine bins can put mass on
  two separated distances and nothing between them. `binCentre` tiles the published -1..+1 range
  and `binOf` closes both ends, because a Gaussian axis is *clipped* at the range and a categorical
  one has to answer for a value sitting exactly on it.
- **`--head beta`** puts a Beta on `targetHeight`, `swing` and `bite`, which are exactly the three
  axes whose published range is the unit interval. Under a Gaussian their draw is clipped, and a
  clip is a lie the trainer is told: the body plays a value on the boundary while the density the
  gradient is taken of says the draw was somewhere outside it, so every clipped draw contributes a
  log-probability for an action that never happened. The shapes are `1 + softplus`, which keeps the
  density unimodal and finite at both ends, and the greedy read is the *mode* rather than the mean
  -- a Beta leaning hard on one end has a mean well inside the interval and a mode at the end, and
  it is the end the policy is asking for. It costs `digamma`, `trigamma` and a Marsaglia-Tsang
  gamma sampler, all of which are in `policy.ts` beside the head that needs them.

### The spread, which may now be an output rather than a parameter

`--sigma state` moves the nine spreads out of `logSigma` and into the network, one output an axis,
squashed by a sigmoid into the same floor and roof the constant spread is clamped into. The
argument *against* it is in `policy.ts` and has not changed: a spread that is a parameter is nine
numbers a reader can print, and a spread that is a function of seventy-one columns is not. What
changed is that the argument had never been measured, and an arm is how this repository settles
that. Under the flag the `logSigma` Adam step is skipped entirely -- the gradient goes into the head
through the squash, whose derivative is `(roof - floor) * p * (1 - p)` -- and the policy's own nine
numbers are neither read nor written, which the gradient test asserts directly by checking that
nothing lands in them and that moving them does not move the objective.

### Nine columns of history

`--features 2` widens the observation from seventy-one columns to eighty. The nine are three
quantities -- the gap, its rate, and their tip speed -- each carried at three exponential decays of
0.5, 0.75 and 0.875, which are memories of about two, four and eight asks: a sixth of a second, a
third, and two thirds. Four asks is the number the plan named; the other two are there because the
right window is not known, and the honest way to supply a middle whose width nobody has measured is
to supply three and let the weights choose. The three quantities are the closing geometry and
nothing else -- a trace of a one-hot phase is a fraction of the last few asks it was set, which is a
quantity with a meaning but not one this session has an argument for.

**This is the first thing in `pilot.ts` that is not a pure function of the reading**, and it is not
being broken quietly. The nine live in a `PilotTrace` the mind owns for the length of a bout;
`golemPolicy` makes one and hands the same one to every ask. A caller that made a fresh trace each
ask would get nine copies of the raw column and no error anywhere, so an eighty-wide observation
with no trace is refused by name rather than filled with zeros -- zeros are what a trace looks like
at the start of every bout, and a silently traceless run would read as a fit that learned nothing
from nine columns it never had. The first ask seeds all three decays at the reading itself rather
than at zero, because a trace climbing out of its own initial transient would spend the first two
thirds of a second of every bout describing itself.

Version 2 **appends**: the first seventy-one columns are version 1's, unmoved, in the same order.
`PILOT_FEATURES_DEFAULT` is 1 and `PILOT_FEATURES_VERSION` is 2, which are deliberately two
different numbers -- the version a fit takes unless asked is not the newest one, because the
default is what every table on disk means.

### Entropy by a target, and entropy by a schedule

The record measured the entropy bonus's gradient on `logSigma` as exactly one per axis whatever the
state, which makes the coefficient a constant push against whatever the surrogate wants, and the
drift's sign flips somewhere between 0.003 and 0.0003. Two ways out, and they are two arms because
neither has been measured:

- **`--entropy-target -1.0`** replaces the constant with a controller. The per-axis differential
  entropy of the current spread is read off the fit -- `mean(logSigma) + (log 2*pi + 1) / 2` -- and
  the coefficient is multiplied by `exp(rate * (target - H))` each iteration, which is Schulman's
  dual on the temperature written multiplicatively so it cannot go negative. `--entropy-rate`
  defaults to 0.05. It is refused together with `--sigma state`, by name, because the controller
  reads a number that only exists when the spread is a parameter.
- **`--entropy-anneal 0.003:0,0.0003:20`** is the same knob moved the cheap way, through the same
  `parseSchedule` the three curricula use. Both are refused together with `--entropy` and with each
  other, for `parseSchedule`'s usual reason: naming a constant and a schedule for one quantity is a
  person saying one thing twice and possibly disagreeing with themselves.

The coefficient in force and the per-axis entropy are written into every iteration row, so a curve
read off a log can say what the fit was being paid without anybody re-deriving it from the flags.

### A critic that sees both sides

`--critic central` doubles the value network's input: this body's seventy-one columns and the
opponent's, in that order. It is centralised training with decentralised execution -- the *policy*
reads nothing extra, so the mind that would ship is unchanged and the artifact is unchanged; what
changes is that the baseline subtracted from the return knows what the other body was doing, which
is the standard remedy for a critic whose target is noisy because half the world is hidden from it.
The peer columns come from a per-bout holder the two recorders share: each side's raw observation is
left there as it is computed and read by the other at its next ask, so a peer column is one ask
stale at worst and zero on the very first ask of a bout. That is a training artifact and is allowed
to be approximate; it is gated on the run actually asking for it, so a run without the flag
allocates and writes exactly what it did before.

### Three executor rows, driven for one contender only

Session 07 landed four candidates on `GOLEM_TACTICS_V4` as flags that default off. This session
adds a fifth, `holdMyReach`, and -- more importantly -- a way to drive any of them **for the
learner alone**.

`--tactics holdMyReach=true` is not `--override`. An override moves `GOLEM_TACTICS_V4` inside the
worker and therefore moves it for *both* corners, which measures what happens when the arena
changes. `--tactics` moves the table one contender is built over, so the arm fights a shipped
executor with a changed one: `contenderShape` carries the rows on the contender record and
`pilotMind` in `scripts/tournament-worker.mjs` spreads them over the module table, which is the
pattern `pinnedMind` was already using. That is the only arrangement in which "would this row help
the mind that learned under it" is a question with an answer, and every row named must already
exist on the table, because a misspelled row would otherwise be a flag that did nothing and an arm
that measured its own control twice.

**`holdMyReach` is the row the owner's complaint is actually about.** The complaint is that a mind
cannot say "just inside my own range". Session 07 measured why: the stroke's own gate opens at
`max(reach * strikeFraction, near + slack)`, which is 0.92 of *my* arm, while `standOff` -- the axis
that decides where the feet stand -- is a multiple of *theirs*. Those are not close to being the
same coordinate: over the viable pool their reach spans 17 % and mine spans a factor of 3.4, so the
fraction of my own arm that the stroke gate is written in is a quantity no output of the policy can
express. Under the flag `hold = me.reach * standOff` instead of `them.reach * standOff`. `holdMetres`
wins if both are up, and the range on the axis does not move, so under this flag the reachable
stand-offs are zero to twice my own arm -- narrower in metres than the reach multiple gives on the
pool's shortest arm and wider on its longest, which is the whole of the difference.

The other two are Session 07's own findings driven for the learner: `strokeOutOfRange=false`, which
that session measured at +29 % damage against a fighting opponent and -18 % against a motionless
one, and `closeGain=0.9`. The second is the plan's candidate with its sign corrected. The feet are a
proportional controller, `forward = clamp(clamp((gap - hold) * closeGain, -1, 1) + advance)`, so
they settle at `hold - advance / closeGain`: **raising** the gain makes a saturated `advance` buy
*less* distance, not more, and what widens the window the closing axis can reach is lowering it.

## A share of the bouts that is not a mirror, and a rating that is taken twice

Session 10 of the learn set. A pool of frozen past selves breaks the identity in the *reward* --
that is the argument the league was built on, three sections up -- and it leaves a second identity
standing, which is quieter and which nothing in this repository had ever questioned: **every
pairing any trainer here has ever scheduled put one build in both corners.** A mirrored rollout is
one body fighting a copy of itself, so nothing the fit ever saw distinguished its own reach from
the reach in front of it, and an error that only exists when the two differ cost it exactly
nothing. The record has both halves of that written down before this session went looking:
Session 06 measured the `outside` row at 0.007 of the return, and Session 07 found the stand-off
axis anchored to *their* reach while the stroke gate opens inside 0.92 of *mine*. Neither could
have been priced by a distribution in which the two are the same number.

### The mirror share

`--share-random 1` on `scripts/league.mjs`, or `--mirror-share 0.5`, which is the same knob said
the other way and is the spelling `scripts/train-ppo.mjs` takes. The share table's spelling counts
slots against the mirror's implicit one, so `--share-random 1` is half the bouts and
`--share-random 3` is a quarter of them left mirrored; the fraction spelling names what the
scheduler actually takes. A run may not pass both, because a header carrying two answers to "how
much of this was a mirror" is worse than a header carrying none.

`boutSplit` and `mixedSchedule` in `scripts/train-ppo.mjs` are the whole of the mechanism and they
are four properties rather than a number:

- **The split is in whole cycles of the opponent table.** `mixedSchedule` walks the same
  `leaguePairs` cycle in both halves, so the declared opponent mix is the realised one on each side
  of the split and an arm at half a mirror is not also an arm at a different opponent mix. The
  arrangement and the opponent are two axes, and the test that says so is the one that counts bouts
  by opponent at a share of one and a share of a half and finds the same table.
- **One and zero are not rounded.** A share of exactly 1 returns the mirrored schedule and nothing
  else, so every run in the record schedules byte-identically to the day it was run; a share of
  exactly 0 returns no mirrored bouts at all rather than one cycle left over by arithmetic. A share
  strictly between them always leaves at least one cycle of each, because a run whose header claims
  both and whose bouts are all one is a run that says something its numbers do not.
- **The two halves are two draws of the same pool, from one seed.** The mirrored half draws from
  `poolFor({..., mirror: true})` -- the builds `viableMirror` accepts, which is 13 of 52 at the
  league's evaluation seed -- and the random half from `poolFor({..., mirror: false})`, the
  class-filtered list, *at the same seed*. Same bodies, two arrangements, and the random half's
  bout seeds moved off the mirrored half's stream by a fixed constant so that the two are not the
  same fights twice.
- **The random half rejects at the draw, through `viablePair`.** A pair predicate cannot be a
  filter on a list of single builds, which is the distinction the viability section above is built
  on: `scheduleJobs` redraws until the pair is one that can finish itself, and refuses by name
  after a bounded number of tries rather than settling for the last refusal.

`runJobs` places a finished row at `row.index` in an array of `jobs.length`, so the two schedules
are renumbered as they are concatenated. That is not a detail: two concatenated schedules that both
started at zero would overwrite each other's first half and lose it without an error anywhere.

The exploiters stay mirrored whatever the main does. An exploiter exists to find a hole in the main,
and the cheapest way to lose that job is to spend half its bouts on a second axis of variation; the
main's arrangement is the experiment and an exploiter is an instrument pointed at it.

### The second anchor

`--anchor` takes a list. `golem-driver,golem-fencer` is two slots of hand-coded mind in the
opponent cycle at `--share-anchor 1`, not one slot split between them -- the second anchor is there
to be met as often as the first, not to halve the first. They are the two designed minds that top
the random-pairs table, and the owner's condition on *new* bots is untouched, because neither of
these is new.

The header field is still called `anchor`, singular, and holds the list as the comma string it was
given. Every run already in `tournaments/` wrote a single name there, and renaming the field would
have made those headers unreadable rather than merely older. `anchorList` is the reader, one name
is a list of one, and `opponentSentence` -- which writes the provenance line into the shipped
module -- names every anchor the mind actually met. A reader told "golem-driver" about a mind that
also sparred a fencer has been told something false about what the weights in front of them were
fitted against.

### Rated on both, selected on one

Every rating a league takes is now taken under **both** arrangements out of one `ratePolicy` call
and printed side by side, and `--select random|mirror` says which of the two the ship step reads.
`RATING_POOLS` is `["mirror", "random"]`, `ratingSeed(seed, "mirror")` is the identity -- so a
mirrored rating taken today is the same measurement the record's old numbers were taken with -- and
the random half is moved off that stream. `ratePolicy` narrows the pool it is handed at each
arrangement's own question, `viableMirror` for one and the class filter for the other, which is why
callers now hand it the class-filtered list: it can shrink a list and it cannot grow one, and a
league that handed over its thirteen mirrorable builds was quietly rating the random half on
thirteen bodies drawn two at a time.

The asymmetry between "rated on both" and "selected on one" is the whole of the design. A mind that
wins the thirteen builds a mirror admits and loses the fifty-two the game draws is a real failure
mode -- the record found one, in a held-out split, months after shipping it -- and the cure is not
to stop measuring the mirror but to stop *deciding* on it. So both numbers are printed at every
snapshot, where a specialist is visible the day it appears; the pool the selection reads is one of
them; and the shipped module's provenance quotes the pool that did the selecting, because a header
whose `score` came off the mirror while the snapshot was chosen on random pairs would name a
different measurement than the decision it records.

`--ship best` is the selection rule made into a flag: out of the rating rows a run wrote, the
snapshot the named pool ranks first by bar margin over the driver. Ties go to the *older* snapshot,
because a later one is not evidence of anything by being later. A rating row written before this
session carries `differences` and no `byPool`, and what it measured was the mirror -- so asked for
its mirrored number it answers and asked for its random-pairs number it says it has none, rather
than handing back the mirror under the other label.

### The same axis on the two curves

`scripts/rate-snapshots.mjs` and `scripts/probe-snapshots.mjs` take `--pools mirror,random` where
the first took `--mirror 1|0` and the second took nothing, and both write **one row a pool a
snapshot** with the arrangement inside the row's `pool` block, which is where `src/curve/runs.ts`
keys a series' label. `Pool.mirror` is a third fact beside the classes and the build count and it
governs the label with them, because the same fifty-two draws played mirrored and played as random
viable pairs are two different sets of bodies. `--out` with two pools writes two files rather than
one: `readCurve` refuses two pools in one curve file and is right to, and a script that wrote a
file its own page will not open would be making a person do the split by hand.

The idle probe grew the same axis, and there it changes what the floor means. Mirrored, the
motionless body is a copy of the fighter's own and the row answers "can this mind on this body
finish an opponent that never moves". On random pairs the motionless body is a different one
`viablePair` accepts, and the row answers the question the record could not ask. The partners are
walked in pool order rather than drawn, because a floor that moved with a draw index is a floor
nobody could re-test, and a build with no viable partner is probed against itself with a count of
how often that happened -- dropping it instead would silently change which bodies the class rollup
is a mean over, which is the one thing a tripwire may not do.

### What the paired table gained

`ratePaired` in `scripts/sweep.mjs` is the instrument the set's criterion is stated on, and until
this session it could not be pointed at a league at all: it read a `train-ppo` checkpoint beside
each arm's log, which a league never writes, so every league arm fell out of the loop and the mode
refused with "no arm of this sweep has left a checkpoint to rate". It reads `league.json` now. Two
further things came with that. `--rate-seed` takes the table at a named seed, because a bar stated
in a plan names its own seed and is taken at that seed or it is not that bar. And every row carries
`barD` beside `d`: `d` is the arm minus the control arm and asks "did this change help", `barD` is
the arm's own bar margin against the designed mind in the other corner and asks "does it beat it".
They are different criteria, the line labels both, and a set that wants to take the screen's
default off `golem-fencer` has to answer the second one.

A third thing came with it, from the same session, and it is a naming trap rather than a feature.
**The `features` field means two different things in the two headers a sweep reads.**
`scripts/train-ppo.mjs` writes the run's own `--features` there: the version of the observation its
weights are shaped by, 1 for 71 columns and 2 for 80. `scripts/league.mjs` writes
`PILOT_FEATURES_VERSION`, which is a compatibility stamp saying what feature code the build could
load, and that has read 2 for every league ever run in this tree -- including the one that fitted
the shipped mind over 71 columns. A reader that takes the second spelling for the first builds an
80-column net over 87308 numbers, and the failure does not surface in the reader: it is raised
inside a tournament worker, one process away, naming two counts and no arm, after the pool has been
drawn and the bouts have started. Both headers also record the layout they ran, which is the number
the weights on disk are actually shaped by, so `shapeOfLog` reads the shape off the layout and lets
it settle the disagreement, and `checkShape` asserts shape against weights before a worker is
spawned. The general rule the trap is an instance of: **where a header records both a claim and the
thing the claim is about, the reader takes the thing.**

## The curve page as a window rather than a report

`curve.html` was written to draw a run that had finished. Session 11 of the learn set runs one
league for a night and rates its snapshots from a second process as they appear, and the first
thing the owner asked this whole set for was progress visibility -- which a page you have to
reload is not. So the page re-reads, on a timer, through the same `readRun` a click goes through.

**A timer and not a protocol.** There is no socket, no incremental parse and no second reader: the
`live` box in the header arms a `setInterval` that re-fetches /runs/index.json and every ticked
run that came off that server, and hands each one to the reader that already exists. A league log
at four hundred iterations is a couple of megabytes and the dev server is the same machine, so
re-reading the whole of it every ten seconds costs less than any of the machinery that would avoid
doing so. The interval is not a setting, for the reason a number a person can turn up usually
becomes a number somebody turns up to one second and then reports the page as slow.

**The one judgement in it is whether to draw**, and it is `reachMoved` in `src/curve/runs.ts`
rather than anything in `src/curve/main.ts`, because the page's own file has no logic a test could
reach. A redraw rebuilds every panel's SVG and takes the cursor readout out from under whoever is
reading it; twelve hours of ten-second ticks is four thousand chances to do that to somebody. So a
re-read is drawn only when its `Reach` -- iterations, ratings, resumptions, and the half-written
last line -- differs from the drawn one's. The test is difference and not growth on purpose:
`scripts/rate-snapshots.mjs` writes a curve file *whole* rather than appending to it, so a re-take
caught mid-write is a file that got shorter, and a page that only drew growth would sit on the
previous take of a curve until something appended to it, which for a curve file is never.

**A failed fetch is silence.** The same whole-file rewrite means there is a moment in every re-take
where the file is short or briefly absent, and a page that turned that into a red status line would
spend a night shouting about a condition that clears itself in milliseconds. What says a file has
stopped moving is the clock on the status line, which is the last time anything was read.

The control is hidden outright when the listing fetch fails, which is the built page: that failure
is already how this page learns it has no run server behind it and offers a drop zone instead, and
a timer re-fetching files nothing serves is a control that can do nothing. A run the person dropped
onto the page is left exactly as it was for the same reason -- it has no path to re-fetch.

## The learn set read as one document, and the four claims it established

Session 12, the set's close-out. The sections above were each written by the session that did the
work. What follows is the part that survives all twelve, and the first thing to say about it is
the plainest: **twelve sessions, fourteen-plus paired arms, and not one learning arm cleared its
bar.** That is a result and it is written in the same voice a success would be.

**One: the mirror is not a weak signal, it is blind in one specific direction -- and every defect
this set found lay in that direction.** The style set's close-out already said four of seven armed
classes cannot decide a mirrored bout. This set found the sharper thing. `standOff` is a multiple
of *their* reach while the stroke's own gate opens inside 0.92 of *mine*, and in a mirror those two
are equal by construction (Session 07). Retreat outside reach is 0.2 s a bout mirrored and 3.2 to
4.7 s a bout on random viable pairs, so the reward row written to charge for it came to 0.007 of
the return and scaling the coefficient scales 0.007 (Session 06); the close-out re-takes the same
asymmetry over fourteen minds and 8,192 bouts and reads a median of 0.20 s mirrored against 2.58 s
on random viable pairs, while near-range stall -- the row beside it -- is 0.65 s and 0.74 s, which
is no difference at all. Across ten arms fitted from
scratch and six continued from the shipped mind, **every arm that gained on random viable pairs
lost the mirror, and none went the other way** (Sessions 09 and 10). And the mechanism has a
positive form as well as a negative one: the critic's explained variance is *higher* off the mirror
-- 0.86 to 0.88 for the half-random arms against 0.765 for the two that stayed in one -- because in
a mirror nothing in the observation predicts the winner, so a mirror hides the *information* that
depends on the bodies differing as well as the errors that do. **A mirror cannot see any error that
depends on the two bodies being different, and a mind fitted in one cannot learn the columns that
would.**

**Two: the compute worked and the learning did not, and the two are separately true.** The sharded
fit is the single thread's answer to 6e-14 against a 1e-9 bar over 87,308 weights and 44 Adam
steps, and it took the shipped configuration's iteration from 109 s to 27.6 s; the sweep runner
missed its 2.4x bar at 2.08 on a clean re-take and reaches 3.46x with the shards switched on.
Everything downstream of that throughput ran: ten arms in one night, six arms in another, four
hundred iterations in a third, zero restarts in all three. **The bars that were about seconds were
met and the bars that were about learning were not**, and no session in the set was short of
compute at the point where it failed.

**Three: more training is not what it needed, and this is now a t rather than an opinion.** Four
hundred iterations, from scratch, at the configuration the set chose. Over the last hundred, three
of twenty-five per-iteration columns are past two sigma and all three are the same column three
ways -- the policy's own spread widening under a fixed entropy coefficient, mean `logSigma` at
t 67, against a training margin at t 0.91 and a margin against the fencer at t -0.33. The record's
own null expectation is about two of twenty-four past two sigma when nothing is happening. **The
first two hundred iterations bought what there was to buy and the second two hundred bought the
spread.**

**Four, and it is the previous set's sentence proved rather than restated: an instrument that is
only printed is one the optimiser is free to ignore -- and over a long enough run it will go the
other way.** The same four hundred iterations took near-range stall from 2.57 to 6.27 seconds a
bout, retreat outside reach from 5.29 to 9.16, and the decided fraction from 0.683 down to 0.550,
while leaving a motionless dummy at 0.791 of its bar where iteration 8 left it at 0.613. The `stall`
and `outside` coefficients were zero in that configuration, so nothing ever charged for either. A
mind trained that long against an unpriced behaviour does not merely fail to improve it; it learns
to stand further away, wait longer, swing less often and finish fewer fights, because those are
free. Session 06's bar was two-sided for exactly this reason, and this run is the largest instance
of the thing it was written to catch.

### What the set shipped, which is nothing, and the best thing it found

**No weights, no reward value, no executor row and no default moved.** `src/golem/policy-weights.ts`
is still the table the style set's league fitted; `GOLEM_REWARD` still carries `closing`, `stall`,
`outside` and `swing` at zero; `GOLEM_TACTICS_V4` has every candidate row off; `src/units.ts` still
screens `golem-fencer`, which frozen choice 7 says stays the default until a learned mind clears
Session 10's bar. What the set shipped is instruments: a predicate, a page, a snapshot slot, a
sweep runner, a sharded fit, four reward rows, three schedules, four policy shapes, three executor
rows, a mirror share and a second anchor -- all of them measured, all of them off.

**The best single result is Session 10's arm c**: half the rollout on random viable pairs with
`golem-fencer` as a second anchor beside `golem-driver`, which takes the control's -0.0981 against
the fencer on random viable pairs to -0.0051 -- **d +0.301 over its own control, the largest
arm-minus-control effect anywhere in the set**, and one of only two whose interval excludes zero.
It is still not the bar, because Session 10's bar asks for d 0.2 *over the fencer* rather than over
a control. That distinction is worth keeping as a methodological finding in its own right: **this
set stated two kinds of bar and they are not the same kind.** Sessions 06, 08 and 09 asked for a d
over a control arm, which is a question about a change; Sessions 10 and 11 asked for a d over a
designed mind, which is a question about the state of the art. An arm can be the largest effect in
the record on the first reading and level-at-best on the second, and arm c is.

**And the two halves of the fencer bar came apart.** Every one of Session 10's six arms, the
control included, beat `golem-driver` on the fifteen bodies a mirror admits and lost to
`golem-fencer` on the fifty-two the game draws. The criterion was written to catch a specialist
arm; it caught the entire table including the configuration that shipped, which says the specialism
is in the training distribution rather than in any change made to it.

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
- **the pelvis stops being animated.** It is the planted locomotion root while alive; death
  changes it to `PhysicsMotionType.DYNAMIC`, which lets the already-dynamic torso and the
  rest of the jointed body fall together;
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
the sword draws as **three** boxes with the pommel protruding, because `weapon.ts` adds
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
anybody could name. Both hands are rebased on the one clock, because the cursor is absolute
and the hand it is not on is also being commanded from a pose the taker knows nothing about.

**A takeover changes who is driving a body, and nothing about how the arena is framed.**
The zoom, the orbit bearing and the pan are the host's `CameraGestureState` throughout; they
used to ride on the command and be passed through by name for the whole rebase window, which
was true and pointless. What crosses the seam is the combat command, and that is all there is
to hand over.

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

`figure.ts` wears `public/assets/warrior.glb` as one skinned graph. `main.ts` awaits the
container before constructing either fighter, so the cloned meshes exist before `Fighter`
snapshots ownership, the shadow list records casters, or the rig overlay records what `G`
hides. A late skin swap is forbidden: it would publish one mesh identity and render another.
A missing, corrupt or structurally wrong asset therefore fails closed to the primitive
diagnostic figure before a bout begins.

The visual skeleton has exactly the thirteen authoritative body names and hierarchy. It is
not authoritative state. Each render caches the authored bone bind `B0` and physics-part
bind `P0`, reads the current part pose `P`, and drives the skin with
`B0 * inverse(P0) * P`. Preserving the authored basis this way matters: copying a physics
quaternion directly into a Blender joint can be numerically tidy and anatomically inside
out. The twenty-nine mesh regions name the bone that owns their triangles. On severance,
weights that cross the cut are redirected to the nearest retained or detached root and
renormalized from the original weights, so a second cut does not inherit the first rewrite.
Those regions are always selected as active meshes. Their CPU bounds describe the authored bind
pose, while the physical bones can move vertices an entire body length away after a fall; frustum
culling against the stale bounds made a coherent fallen Warrior disappear at one camera distance
and reappear at another while independently rendered boots and weapons remained. The fixed set of
twenty-nine draw candidates is the deliberate correctness cost.

No dimension is written down twice. `asset-src/dimensions.json` is generated from
`src/config.ts` and `figure.ts`'s exported `costumePieces()`, committed so the numbers the
committed `.glb` was cut to are on the record beside it, and recomputed by
`npm run asset:verify` -- so a `config.ts` edit that moves a bone without a rebuild fails a
check instead of stretching a warrior.

`scripts/check-warrior.mjs` asserts both structure and **distances in metres**: one skin,
the exact hierarchy, finite normalized weights, meaningful influence from all thirteen
bones, region ownership, joint origins at physics centres, adult-sized hands and grip-marker
alignment. Mutation fixtures move a forearm origin and reject the old disconnected asset
digest. Those checks still cannot award an art-direction PASS; a crown 90 mm too high can
remain structurally valid and visibly wrong.

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

**`Intent` grew a hand.** `HandIntent` is the six fields that belong to a hand -- two
cursor axes, bounded forearm roll, independent wrist bend, thrust and guard -- and the
command carries locomotion, whole-body posture, two hands, a natural channel and an
`actingHand` selector, none of them the camera's. Splitting the hands out rather than adding
a second set of differently named fields is what keeps the two alike: there is no `pointerX`
and `offPointerX`, no hand that is the real one and a hand that is the afterthought, and
`Arm` takes one without caring which it is. (The count was written out here as "seven fields"
and went stale twice; `COMBAT_FIELDS` in `tests/fixtures/intent.mjs` names the set and is
asserted against every producer of a command, which is the copy that cannot. It said
`tests/minds.test.mjs` while there were **six** hand-written copies of that literal across five
test files, which is a single-sourcing claim that was not true; there is one now and the five
files import it.)

The whole vocabulary lives in `mind.ts` -- `Intent`, `HandIntent`, `PostureIntent`, the hand
names -- and the direction of the imports across that boundary is load-bearing. `input.ts`
takes `Intent` as a **type**, which erases, and `mind.ts` takes only `HumanOwnership` back
the same way, so the DOM never reaches a headless harness. Declaring `HANDS` on the far side
and importing its *value* back reversed that in one line and took `fighter.ts` out of Node's
reach with it -- five test files failed at once with "Cannot find module .../src/config".

**One mouse, two hands.** `splitMind` runs a person and a policy every step. The person owns
locomotion plus the driven hand's cursor and buttons; the policy owns both wrists, lean,
twist, crouch and the other hand. `F` moves the cursor between hands. This ownership is why
the extra anatomical degrees of freedom can make human play move naturally without asking
one mouse to command the whole body at once. Splitting the *cursor* instead -- half the
screen each, or a modifier
held down -- was the obvious alternative and is worse: the mouse being spent entirely on one
blade is the whole reason this reads as Die by the Sword, and halving it would make both
hands worse to control in order to avoid making a choice. The spare hand takes the side's
*own* policy, the one it becomes the moment you step out of it, so there is nothing new to
choose on the screen. House rule 1 survives: what reaches the fighter is still one `Intent`
of the same shape a person produces.

Roll is pronation/supination with anatomical stops, not an angle that can accumulate through
full turns. `wristBend` maps 0..1 onto 0..90 degrees about the mirrored local lateral axis.
The pelvis is the locomotion frame: lean and twist move the trunk and shoulder sockets over
planted hips, while cursor positions remain expressed against world vertical and pelvis
heading. A body can therefore crouch, lean or turn its shoulders without silently remapping
where the centre of the screen asks a hand to be.

## What is in a hand

`Weapon` replaced `Sword`. Six kinds and an `empty`, all sharing one local frame -- +Y
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

### Self-clearance is part of the controller

An owner collision filter cannot turn an impossible two-hand request into a good pose. A sword
anchor driven through a shield anchor leaves two strong motors pressing into one contact; general
self-collision is worse, because the adjacent capsules of every articulated chain overlap at their
joint seams. The accepted boundary is selective and sits below both player and policy intent.

Both ordinary arms now plan before either commits. A sword centreline is tested against the
planned, expanded shield box together with the sword hand, forearm and their achieved-to-command
sweeps. A crossing routes the sword hand to the nearest clear outboard, over or under pose while
preserving both authored reaches; if every straight route remains obstructed, it holds the last
achieved physical pose for that step rather than committing the final rejected candidate. A
strapped shield command more than 0.60 rad across its own side
is refused to a mirrored 0.45 rad outboard carry; that refusal also reverses the requested wrist
turn so the plate still faces the line it was commanded to cover. The elbow pole mirrors only for
that refused pose. This is anatomical execution below player and policy intent, not defensive aim
assist: it reads neither an opponent nor an incoming weapon.

There is deliberately no new collision leaf, mass, inertia or debris. The visible board remains
the shield's one physical leaf and the existing same-owner sword/shield filters remain exempt;
making two high-force anchors solve that contact pinned the board after its visible geometry had
already cleared. The articulated bodies still have to carry the corrected targets. Tests read the
achieved blade, hand and forearm on every physics step while both hands sweep, in both factions and both loadout orders,
then discard the same one-leaf shield through the ordinary debris path.

**What none of it fixes is placement**, and the numbers in `docs/measurements.md` are blunt
about it: an arm pointed at the enemy shows him 0.033 m^2 of a 0.26 m^2 board, and an arm
held across the line shows him 0.190. The mount decides what the plate *can* do and only
whoever is aiming the arm decides what it *does*. That is the next session and it is the same
change as teaching a policy to fight with both hands.

### Two hands that fight

The transport was symmetric from the day `Intent` grew a hand: `HandIntent`, `HANDS`,
`Fighter.update`, `Arm`, `handover` and `Controls` all take either hand without caring
which. What was not symmetric was everything above it, and three faults made "two swords use
only one hand" and "the AI holds its shield strangely" the same bug.

**A policy planned one hand and the other was furniture.** `handOf(intent)` was read *once*
at construction, `blankIntent` sets `actingHand: "primary"`, and nothing ever wrote it -- so
the off hand kept the rest pose it was built with for the whole bout. `attackHand(view, prefer)`
replaces it and is asked every step, because the answer changes: an arm gets cut off, a hand
holding a shield is never the one that swings, and two blades take turns.

**`splitMind` handed the policy's *attack* to whichever arm the person was not using.** It
copied `theirs[theirs.actingHand]`, which was right for exactly as long as a policy planned one
hand -- whatever it had, it wanted its arm to do. It is wrong the moment a hand's plan
depends on what the hand holds. Pick a sword and a shield, take the sword, and the old rule
ran `swinger`'s commit stroke *on the shield arm*: the board was being swung like a bat, for
the whole bout, in every game anybody played. It copies `theirs[spare]` now, and the fix is
that one word.

**`FighterView` had no hands.** `HandView` is eight fields -- what the hand holds, where its
shoulder is, the point of what it holds, how fast that point is moving *and which way*, how
far the hand can put it out, whether the arm is still attached, and **which side of the body
it is on**. That last one is the whole of what makes "a shield guard is an arm held
*across*" expressible: across is a direction, and a direction has to know which side it
started on. The count in this paragraph read "five" while there were seven, because `reach`
came back a session after being deleted and nobody re-counted; `tipVelocity` is session 16's
and makes eight.

It was eight fields. A hand position, a reach and a `face` -- the world direction of the
hand's own +X, which for a strapped shield is the plate's normal -- were carried for a servo
that turned the wrist toward whatever it was covering. The servo lost to a constant by a
factor of two (`docs/measurements.md`), and the three fields went out with it rather than
staying as things a view offers and nothing takes.

**The vocabulary moved again**, and for the same reason it moved the first time. `HandName`,
`HANDS` and `otherHand` lived in `mind.ts`, which imports `policies.ts` at run time; a
policy that has to name the other hand would have closed a real cycle reaching back for
them. They live in `src/hands.ts` now with `WeaponKind` and its three predicates, and that
file **imports nothing at all**. Both halves are things a policy has to be able to say --
which hand, and what is in it -- and `weapon.ts` and `mind.ts` re-export their halves, so
nothing that already asked either of them had to change.

**What a hand does is decided by what is in it.** One table, shared by both policies,
because two copies of a rule is one copy somebody edits:

| the hand holds | what it does |
| --- | --- |
| a striking weapon, and it is the attacking hand | exactly what it did before |
| a shield or a buckler | interposes: arm across the line, forearm rolled to bring the plate round |
| a striking weapon, not attacking | covers on the guard line, and takes the next exchange |
| nothing | rests |

What differs between the policies is the *threat* they hand in, and that difference is their
characters rather than the table's business. `swinger` never reads the other fighter's blade
-- that is its whole documented point -- so its shield covers the chest it is already walking
at. `duelist` covers whichever of their hands can actually hurt it, which also stops it
guarding against a shield they happen to be carrying in the primary.

**Both hands aim from their own shoulder.** The two sockets are 420 mm apart and
`BodyView.shoulder` is the primary's, so a policy aiming everything from it was aiming its
other hand from the wrong side of the chest. It is not a rounding error: a fighter fighting
left-handed dealt twice the damage of the right-handed one and killed nobody in 24 bouts,
because it landed on torsos rather than on the head that ends a bout.

**A shield's placement is two numbers and a sign, and none of them was guessed.** The arm is
swung across the line of the blow by `GUARD.across`, carried *below* the bearing to the
threat by `GUARD.lift`, and the wrist is turned by `GUARD.roll` in the direction the arm was
swung. The geometry derives the first at 0.785 rad and the sweep agrees at 0.80. The second
was derived with the *wrong sign* on a perfectly good argument and the sweep caught it: a
board held high covers the head and opens everything under it, and the head is worth less
than the rest of the body put together. The third is a constant because the placement is
defined relative to the threat, so the turn that brings the plate round is very nearly fixed
-- and because the servo that computed it exactly walked the wrist into a limit it cannot
pass. Every number has its table beside it in `config`-style comments and in
`docs/measurements.md`.

### The bow, and the difference between a thing in a hand and a thing that hits you

A bow is the first weapon here that hurts somebody it is not touching, and the first
whose damage comes from an object no hand holds. Both halves of that sentence turned
out to be load-bearing.

**The aiming is the aiming that already exists.** A bow takes the blade's mount, so
its +Y runs out along the arm -- and an arrow loosed along +Y therefore goes exactly
where a sword's point would have gone. There is no second control surface, no
crosshair and no mode. The stave lies on +X, which is the axis the wrist's `roll`
turns the weapon about, so a wrist at zero holds the bow upright and a rolled one
cants it. Neither of those was arranged; they fall out of the local frame the other
five kinds already share, once you put the stave where an axe's edge goes.

**Draw is a level and loose is the edge where it ends**, which is `buttons.ts`'s
subject rather than a new one. It rides `thrust`, so `HandIntent` is still five
fields and `NEUTRAL`, `blankIntent`, `copyHand`, the handover blend and every policy
are untouched. `nextDraw` is fed the boolean rather than the button, which is why
`archer` charges a bow through exactly the code a hand on a mouse does and the arena
has no way to tell them apart. Below `minDraw` a release abandons the shot instead
of taking it -- that is what makes a draw worth *holding* rather than a button worth
tapping.

**`Striker` came apart from `WeaponKind` one session after being collapsed into it.**
Session 04 found the two lists identical and made one an alias of the other, on the
evidence available, and an arrow is the counter-example: a thing that hits somebody
and is not a thing a hand takes. What keeps this from being a hand-maintained copy
again is the direction of the derivation -- `GRIPS` is keyed by `Striker` and
`WEAPON_KINDS` is *computed* as the rows nobody carries, so the narrow list follows
the wide table rather than sitting beside it. The lesson is worth more than the type:
**two unions that are equal today are not the same union**, and the test is not
whether they currently agree but whether you can name the member that is coming. It
is the same shape as `HandView.reach`, deleted for having no reader and restored the
next session.

**Nothing is created while a bout is running.** A quiver builds every arrow with the
fighter and parks it; `loose` wakes one. The master plan expected the opposite -- a
body per shot, and a `watch`/`unwatch` pair on `Combat` to go with it -- and a pool
makes that unnecessary, which is strictly better: an observable is never touched at
240 Hz and no arrow can outlive the observer watching it. It was chosen on a
measurement rather than on taste (24 parked arrows cost **-0.0015 ms/frame**, below
the bench's own noise) and it makes the session's acceptance check true by
construction rather than by careful disposal.

### Four things that were already wrong, and one weapon that asked

A bow asks questions no melee weapon had ever asked -- *do the layers work, can a
body be moved without being pushed, how fast was it going when it arrived, and can
you run away* -- and four of them had wrong answers. `docs/measurements.md` has the
tables; what belongs here is why they were invisible.

**A `PhysicsShapeContainer`'s collision filter does nothing.** Havok filters on the
leaf shapes, so every weapon in the program had carried the default filter -- collide
with everything -- since the file was written. A sword swept through its envelope
logged 1687 contacts against its own upper arm; a shield logged 725 and 669 against
its owner's two arms, which is permanent contact between a 4 kg lever and the chain
driving it, and is the exact failure the four-layers-per-side split was invented to
prevent. It hid because **the symptom is friction rather than a hole**: an arm that
tracks its anchor a little worse than it should, in a prototype whose entire subject
is how well an arm tracks its anchor. Reading the mask back does not catch it either
-- a container hands you garbage.

**Two watchers on one body, and the order they were added decides the outcome.** An
arrow watches its own collisions to know it has struck; `Combat` watches the same
body to score the blow. The arrow's observer is added first, so marking it spent
inside that callback marks it spent *before* the watcher that scores it runs -- and
every arrow in the game scored nothing, silently, with a flight that looked
perfectly healthy. The fix is to promote the flag one control step later, after
which neither watcher needs to know the other exists.

The same promotion edge owns impact damping. A body-hit arrow receives its 0.92 damping once,
changes to the world-only spent layer and then remains an ordinary dynamic body under gravity.
Applying the same damping on every 240 Hz control step also damped away each new increment from
gravity, so spent arrows appeared to hang in space for their six-second collection lifetime.
World hits are different by construction: they plant STATIC where they landed.

**`velocityAt` is the right question for a blade and the wrong one for a
projectile.** `linear + w x r` is what a sword's contact point moves at, because the
rotation is the arm's and is there before the contact. An arrow has no rotation in
flight, so any it has at the contact was put there *by* the contact -- and over a
0.36 m half-shaft that cancelled a 48 m/s shot down to 5.6. Copying a blade's
accessor because both are "things that hit people" is the same class of mistake as
copying a blade's `referenceSpeed`, and the same session made both.

**A fighter retreated at a dead run**, because `steer` multiplied `input.forward` by
`walkSpeed` whatever its sign. Nobody noticed while the only policy that backed up
did it in bursts. A ranged policy lives on that difference, so it became the whole
fight: a fighter that retreats as fast as its pursuer advances cannot be caught, and
the first archer bench was a 0-0 stalemate that no amount of tuning the bow could
have touched.

### Damage and lethality turn out to be different systems

`beaten()` ends a bout on a **severed** head or torso, or on all twelve parts at
zero. Every weapon until now was a chopping weapon, so nothing had ever tested the
difference -- and an arrow deliberately never severs, because taking a limb off wants
an edge and a swing, and giving a projectile that power would make the bow strictly
better than the axe at the one thing the axe is for.

The consequence is that **an archer cannot win a bout**, and it is not a balance
number: shooting a fighter that stands still and does nothing, for thirty seconds,
sixteen times, it deals 274.7 damage a bout and kills nobody. Raising the arrow's
damage to where two of them exceed a whole torso does not change it.

That is a real gap in the model rather than a missing feature of the bow: there is
no notion here of *killed without dismemberment*. `beaten()`'s docstring already
named the alternative and reserved the choice for whoever plays a bout to the end,
which was the right call when nothing depended on it. Something does now, and
`docs/measurements.md` item 16 has the number.

### An archer, because a weapon nobody uses is a weapon nobody can measure

`isStriking` is false for a bow -- you do not swing one -- so `duelist` and `swinger`
handed one find no hand to attack with and fall through to the branch two shields
already take. That is a fighter who has brought a bow to a sword fight, which is a
true thing about the world and not a policy for the weapon. Session 04's most
expensive finding was that a kind every policy declines to pick up ships looking
complete, so `archer` is part of the weapon rather than a follow-up.

It stands off, faces, draws, and looses, and it does exactly one thing the other two
do not: **it computes its own ballistics**. The lift is `g range^2 / 2 v^2`, derived
rather than tuned, which is unusual for that file and is the exception that proves
the rule -- every other constant in `policies.ts` is a judgement about how a fighter
behaves, and where a thrown thing lands is not a judgement. Reading `CONFIG.arrow`
from a policy is the same liberty `SWINGER.engage` already takes with the sword's
length: house rule 1 is about what a policy may *do*, not what it may know.

Handed a sword instead of a bow it keeps its distance and never attacks. That is
deliberate rather than unfinished -- the moment it grows a melee branch it stops
being a measurement of what a bow is worth.

### The axe, and the tables that had been answering for kinds they did not know

Adding a fifth kind was meant to be a builder and a config block. What it actually did was
find six places that answered a question about a weapon by comparing its **name**, with a
default for the names they had not heard of -- and every one of those defaults was a
plausible lie rather than a crash.

Two of them cost real things. `isStriking` was `kind === "sword" || kind === "club"`, and
session 03 made it the question a policy asks to decide *which hand it attacks with*: its
default is `false`, so a fully built weapon -- mesh, builder, config, picker entry -- would
have been one every policy in the program silently declines to swing, with a fighter
standing in the ring holding it and nothing anywhere saying why. `scoreHit` fell past its two
`by === "club"` branches into the sword's arithmetic, so a new weapon was not broken, it was
**an arming sword with a different mesh**.

The sixth is the one worth generalising from, because it is not a missing branch at all.
`combat.ts` skipped the damage model for a contact too slow to matter -- a sound optimisation
-- and skipped it on `minCutSpeed`, hard-coded, in a file with no business holding an opinion
about a weapon's floor. So the club's own lower floor, which has a paragraph of config
comment and a passing unit test, **never ran in an actual fight**. (The floors are joules now and
the early-out asks `biteFloorJ` and `biteMechanism` for both halves of the answer, so there is
still exactly one copy of the rule; what changed is only what it is measured in.) A second copy of a rule in
a caller is the same defect as a missing row, and it is harder to see because nothing about
it looks like a table.

**The answer is two tables and no comparisons.** `hands.ts` holds `GRIPS`, one row per kind,
which is the *shape* of the thing: how many hands, how it is carried, what it is for, whether
it has a point, whether it cuts on both sides of its edge axis. `scoring.ts` holds `BITE`,
which is what a blow with it is *worth*: a mechanism, a floor, a joules-per-damage constant and
a sever bar, each as an accessor on the tuning so that the tuning stays a parameter. (It was a
floor, a *scale* and a sever bar until 2026-09-07, when the scale became arithmetic; the shape of
the table is what survived, and it survived three new striker kinds.) Both are `Record<..., ...>` over
the union, so a kind without a row does not compile, and every predicate above them is a
field read. Adding the axe turned four of the six holes into `tsc` errors in one run.

`Striker` stopped being a hand-maintained copy of `WeaponKind` and became an alias of it.
`scoring.ts` restated the union because `weapon.ts` imports Babylon and the whole value of
that module is that it does not -- but `hands.ts` imports **nothing at all**, so the copy had
no job left.

**An axe is a sword's row with one number changed, plus two facts about its shape.** It costs
fewer joules a point of wound (`chopJoulesPerDamage` 25.93 against the sword's 34.82 -- a hand's
width of edge carries the same energy further in than 840 mm of it), and that is the only thing
in the damage table that differs. Since 2026-09-07 it also hits harder for a second reason the
table cannot see: it weighs 1.40 kg against 1.35, and mass is in the physics now. What it
pays is not in the table: no point, so a thrust is a shove; one edge, so a backhand arrives
poll-first and is worth nothing; 27 % less reach; and its mass out at the head. The last two
are `config.ts` meeting the arm's force ceiling, which is where a weapon's feel belongs.

The axe was drafted with its own speed floor and its own sever bar as well, on arguments that
sounded good, and the bench refused both -- the sever bar returned byte-identical numbers at
0.2 and at 0.4. They are gone. `docs/measurements.md` has the tables, and the fact that a
knob was tried and dropped is the part worth keeping.

### A policy that knows how long its weapon is

Six literals across the two policies were the sword's reach written down without saying so:
`duelist.hold = 1.40` ("just inside the 1.45 m the point of the blade reaches"),
`duelist.strike = 1.48`, `swinger.engage = 1.30`. Handed an axe that reaches 1.13, `duelist`
stood a quarter of a metre outside its own range and swung at the air -- 31 blows in twelve
bouts where a sword landed 398.

`HandView` carries a `reach` again, and the arc is a caution about the rule that removed it a
session ago. That rule -- a view field with no reader is a field that will drift -- was right,
and the field it replaces really had gone three sessions unread. But a field with no reader
and a field with no reader *yet* look identical from inside one session, and the only thing
that distinguishes them is whether somebody can name the reader that is coming.

The shift is an offset, not a ratio: a weapon 255 mm shorter is carried 255 mm closer, not to
82 % of the distance, because the numbers being shifted are all "shoulder to shoulder, at
which my point lands on them" and a body's depth does not scale with what is swung at it. For
a hand holding a sword the shift is exactly zero, bit for bit, which is what lets every
figure taken before today go on naming the same fighter.

**`rollForStroke` was folding the bit into the poll.** It derived the wrist roll that lays
the edge along the stroke and then folded the answer into +-pi/2, because a sword is
double-edged and `roll` and `roll +- pi` are the same cut. That is exactly false for a
single-bitted weapon, and the fold's tie-break -- whichever is closer to zero -- is no
tie-break at all: measured, both policies and both hands came out **exactly half a turn out**,
so an axe arrived poll-first on 64 % of its contacts. The fold is now conditional on
`cutsBothWays`, defaulted to the blade's answer so every existing caller means what it meant.

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

### The texture pipeline that replaced the failed experiment

The first texture attempt is still the useful warning: an albedo map multiplied an already
dark palette colour, then directly attached normal maps held several materials unready and
made their meshes disappear. Probing `scene.materials` and `Material.isReady` outside a
render pass produced three wrong diagnoses before stripping maps and looking settled it.

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

The replacement makes those failure modes contracts. `asset-src/textures.json` is the only
map registry and pins CC0 source, digest, colour space, tangent basis and consumer. The
runtime builds the old PBR colour first and attaches a decoded map only from its success
callback; failure therefore leaves a drawable fallback. The GLB carries UVs and tangent
frames but no authoritative textures, and `scripts/check-warrior.mjs` refuses a node whose
material role is outside the authored costume set or whose embedded image competes with the
runtime palette.

Steel, neutral cloth, brown leather and subtle skin detail now have separate
albedo/normal/ORM families. The side colour is one per-Figure material derived from neutral cloth:
crimson and blue own only their tint while all texture objects remain palette-shared, and
`Figure.dispose()` releases the material on a bout rebuild. The visible art-direction verdict
is intentionally not inferred from the headless checks. The 2026-08-24 pre-adaptation
default-zoom Fixed and Overhead material comparison kept the four material families, team
colours, open faces and waist join readable. It did not judge the Ranger geometry below;
those still-open camera, zoom and motion judgements live only in `docs/measurements.md`.

The current character silhouette is adapted rather than invented from primitives.
`asset-src/armour-sources.json` pins two selected creator-published CC0 sources. Quaternius's
complete Ranger supplies the continuous tunic, coat-skirts, belts, hood, sleeves, bracers,
asymmetric pauldron, trousers, boots, arms and hands. Its native deformation and finger rig
are retained long enough to lower the arms and bake closed grips, then its weights are
remapped onto the thirteen physics-named visual bones. Quaternius's Animated Knight
Helmet3 supplies the closed great helm inside the hood. Authored material roles and UVs are
retained without embedding the source-resolution textures; all geometry remains render-only.
`npm run armour:extract` reconstructs the pinned source extracts and
`npm run armour:verify` checks the original files and every selected extract before
`asset-src/build_warrior.py` fits them.

The 2026-08-27 rigid adaptation was a false PASS. Its checks proved that thirty-four parts
existed and that nominal attachment points were close; they did not prove that the result
looked like a person. The shipping camera exposed a floating face without a neck, tiny hands,
detached arms and shoulder plates, merged clothing and an implausible pelvis. Even the
isolated review images contained malformed arms and a horror face. That failure retired the
rigid-piece architecture rather than adding more cuffs to conceal it.

The replacement review has two layers. Blender views judge front, three-quarter, back,
helmet and grip silhouettes. The actual shipping arena must then load the skin, show sword
and buckler contact, and hold together in a moving pose. This second layer immediately found
that Babylon adds `_primitiveN` to multi-primitive mesh names: the first runtime parser read
that suffix as part of the region name, rejected the skin, and silently restored the
mannequin. The real-GLB integration test now reproduces that loader naming. After the fix,
the arena and an independent adversarial review passed the structural plausibility bar:
continuous adult silhouette, closed helmet/collar, joined shoulders and limbs, ordinary
trouser rise, grounded boots and connected grips under motion. The long rear hood and the
buckler obscuring its hand remain visible polish notes. This is not a claim of final or AAA
character art; it is the narrower claim the rejected build could not meet—a plausible,
connected human rather than abstract body parts.

A nominally CC0 plate-armour candidate was rejected during adversarial provenance review:
its source blend packed a distinctive third-party armour concept as a reference, so the
uploader's CC0 declaration did not establish a clean rights chain for the design. No geometry
from that candidate ships. The two selected Quaternius records above are the narrower claim
this repository can actually prove.

An untouched-asset replacement has a separate numerical admission gate. It may receive one
profile-declared whole-body axis normalization, one uniform scale and one rigid translation,
but no vertex edit, weight painting, animation authoring or proportional stretch. The axis
mapping is fixed from the creator format before any landmark is measured; it is not optimized
per limb. `npm run asset:qualify -- --candidate <id>` checks the pinned creator authority and
exits nonzero when a joint landmark is more than 25 mm from the authoritative physics rig.
Provenance/integrity, source technical validity, both creator-authored grips, anatomy and the
mechanical severance path are separate hard gates. A small numerical error cannot rehabilitate
an asset that fails one of the others.

`asset-src/humanoid-candidates.json` is the durable candidate and bundle authority. It separates
an archive from the outfits inside it, pins every report to the qualification contract and the
`dimensions.json` digest, and appends a new evaluation rather than overwriting history when the
rig changes. Candidate-local reports preserve every landmark, limb, pose and protected source
digest. The executable ledger test refuses drift between those reports, their provenance and
the ledger summaries; `docs/measurements.md` transcribes the comparison vector for people. The
comparison orders qualified candidates first, then lower
maximum error and lower RMS error, while retaining weapon-arm reach and grip support explicitly.
"Closest" therefore means only closest measured geometry and never means qualified. Changing
combat reach to match an art asset remains a gameplay decision, not an asset-pipeline
convenience.

The qualifier executes rather than merely labels the coordinate contract. Creator glTF profiles
are identity-axis only because their root already carries the format conversion; a non-identity
mapping is applied while reading its authoritative blend metadata. Shoulder and limb,
hip and leg, and ankle and leg-end declarations must agree, with the primary source shoulder on
positive X. Height is decoded from transformed vertices of the profile's required active meshes,
so an unreachable mesh or forged accessor bounds cannot improve a fit. The generic glTF gate also
decodes positions, normals, UVs, indices, joints, weights and inverse-bind matrices before calling
the source technically clean. A candidate that clears those checks still cannot become qualified
while severance remains deferred.

The committed `*-creator.gltf` and creator binary hashes preserve the exact archive members. The
smaller `*-source.gltf` qualification representation changes only the buffer URI and removes image,
texture, sampler and material texture-binding records; its material-structure digest therefore pins
that declared representation, not an untouched creator-material document. Geometry, skin and
animation accessors remain the creator streams, and their separate digests are the no-mesh-edit
evidence.

The glTF loader owns the asset's handedness conversion; the runtime does not rewrite tangent
buffers. The asset checker validates finite authored UV and tangent payload rather than
trusting Blender source comments.

Babylon-built weapons remain a separate material authority. Forged steel deliberately reuses
the session-08 worked-steel maps, worn leather reuses its matching character maps, and
fine-grained wood is the ash/yew visual proxy. These are scene-shared primary families;
brass and distressed painted board have
their own pinned CC0 albedo/normal/ORM sets rather than being colour-only aliases. The
polished edge and bow-string variants follow the steel and leather map objects, including a
decode that completes late, so those functional highlights cost no duplicate wrapper.
Propagated attachments are rebroadcast, which keeps a figure -> weapon -> highlight chain
whole. All use the Babylon-LH normal basis; nothing reaches back into imported geometry to
change its tangents.

`OBJECT_PART_SURFACES` is the total 35-row assignment for swords, axes, bows, arrows,
shields, bucklers, clubs and ring posts. It changes only an existing mesh's material
reference and its own UV buffer. Long wood cylinders retain texture V along local Y; the
bow stave turns once so V follows local X; grip wraps turn around their cylinder. The shared
Texture is never rotated per mesh. The polished sword blade/point, axe bit/edge, shield
bosses, bow string, nocked arrow and pooled arrow accent retain the contrast needed to read
combat function. `Weapon` and `Arrow` dispose bodies and nodes but not arena-owned materials
or maps; scene disposal remains the sole palette owner.

The room is deliberately two worlds that occupy the same place. `arena-room.ts` owns the
authoritative world -- one 60 m ground box, fourteen ring posts and four 0.24 m boundary
walls derived from the visible edge placements -- separately from a cosmetic floor,
translucent wall scrims, overhead beams, banners, racks and debris. The cosmetic owner
creates no aggregate. The posts remain scale cues rather than the boundary; the four walls
close their broad gaps and align their inner faces at x/z = +/-13 m. An opaque placement
below a conservative 3.6 m reach ceiling is refused unless it
names an existing collider. Distance past the slab is not
a safety argument because the animated fighter can keep walking. Beams clear that ceiling;
racks/debris are zero-height floor markings rather than volumes. The visible floor names
`ground`, and every post names itself. Every placement that declares a collider automatically
emits a pair and the ordinary build resolves its live body and overlapping bounds.

Five source meshes feed 27 instances. Four room materials share their scene-owned maps, and
generated primitive UVs are projected from local metres rather than stretched from a unit
square: slate repeats every 2.4 m, wall stone every 2.1 m, timber every 2.0 m and banner cloth
every 0.4 m. Room fallback colours are less saturated than either team cloth, while the arrow
accent remains unlit and brighter than every declared room fallback. Those are structural
hierarchy checks. The live occlusion list holds pelvis, torso and head centres for both
fighters plus each live pooled arrow root and both trace endpoints. Those `Vector3`s and the
list are cached at bout construction rather than allocated in the render loop. Segment/AABB
checks cover both camera presets, both zoom clamps, eight bearings and translations spanning
the supported floor, including opponent/arrow scenarios outside the old local stencil. An
overhead beam crossing one of those actual rays is culled per instance; non-crossing beams
remain opaque and visible. A shadow refresh retains a temporarily culled solid beam so reveal
does not leave it shadowless. The first browser sample found the room and combatants readable
at default zoom; the broader visible matrix remains an explicitly human measurement.

`__sword.arena.audit()` reads owned mesh, reachable material/texture, instance and live-body
counts plus the named visual/collider pairs. Repeated calls update private counters behind
one frozen stable getter view and allocate no result or Babylon resource. Foreign scene resources do not enter its
census, and disposal unregisters every owned shadow caster.

## Engagement instrument

`src/engagement.ts` is the label-free attack instrument: opportunity rows, intent edges and
contact attribution, with `ENGAGEMENT_INSTRUMENT_VERSION` in `src/recorder.ts` stamping any change
to those semantics. The page and the headless bench share it through `BoutRecorder`, and
`__sword.engagement` reads the per-side record of the current bout.

It was `src/learning/engagement.ts` until 2026-09-04 and moved here when the learning tree was
deleted, because `src/options.ts` imports it and the golem bench will. What did *not* move is
`learning/gates.ts` -- the eight ordered gate rows and their human-facing table -- because those
were thresholds a research run was scored against and there is no research run. The instrument is
the measurement; the gates were a verdict on it.

## What was removed on 2026-09 and why

Three body experiments ran in this prototype between sessions 08 and 35 and none produced a
fighter the owner wanted to look at: the Construct Forge with its free-form blueprints, authored
Actions, player-authored Minds and learning ladder; the fixed Effigy constructs built on that
framework; and the asset-native KayKit Knight. All three were deleted on 2026-09-04 along with
`src/learning/`, the guided playtest, the research runners, their tests and their npm commands.
The finding they share, and the reason the golem plan set that replaces them reverses the order of
work, is that **each was gated by a scalar proxy that turned green while the owner's judgement
stayed red** -- anchor stray in millimetres, dynamism path length, stuck-step counts. Nothing they
measured is lost: [measurements](measurements.md) keeps every number and the harness that took it,
and `docs/deleted-paths.md` is the register of what the files were called. Three pieces were
salvaged rather than deleted -- the stone/bronze material recipes and the procedural stone shader
now in `src/golem/`, the engagement instrument above, and the headless arena harness now in
`scripts/golem-headless-arena.mjs`.

## Supported walking is a game carrier authorized by physical limbs

Supported locomotion deliberately separates *where a combatant may walk* from the full ragdoll
problem. A body still needs its declared hip/knee/ankle/sole chains, live joints, installed contact
modules, fresh standable contact and a valid upright torso chain. Those facts authorize an invisible
virtual carrier; they do not become decorative proof after a hidden root transform has already
moved. The carrier is query-only geometry and owns no Havok body, shape, damage target or combat
contact. Pair resolution commits both carriers together, so scheduler call order cannot let one
side enter space the other side still owns.

The construction-time pair handshake is atomic. Both selected unit definitions must advertise the
same supported-port version or both retain legacy locomotion for the entire bout. Warrior, Broot,
KayKit and the three humanoid Constructs use supported V1 together. The assisted Bronze Warden is
a separately authored control graph; its old raw four-beat gait remains selectable for measured A/B
evidence. A supported body cannot silently fall back to legacy after damage.

Movement still crosses ordinary public Actions. Full biped movement owns both named support chains
and the balance chain. A one-support fallback owns exactly its surviving left or right chain, has
lower speed/strafe/yaw and stability authority, and is inadmissible while full movement is live.
Two fallbacks cannot spend `resource:balance` together. Assisted Warden control declares four
explicit three-of-four crawl groups; each group still requires every joint and contact module in
its named three limbs plus the balance chain. Its lower 0.55 m/s, capped-yaw, 0.65-stability
controller is distinct from both full assisted movement and the retained raw gait. The same
descriptor data drives scheduler admission, Forge choices, save/reload, Probe and visible fights;
the UI has no controller-name exception. Warden support groups follow the same all-members-required
rule rather than treating "at least three" as hidden optional membership.

Support is a four-state boundary machine: supported, staggered, fallen and rising. Only authored
horizontal combat shove enters stability; Havok's solver impulse is diagnostic. Losing fresh
standable contact for more than 0.35 s, losing the declared chain/posture, or exceeding the frozen
specific-impulse threshold releases assisted anatomy to an ordinary dynamic ragdoll. A Fighter asks
to rise with deliberate movement; a Construct must run its public recover Action. The 0.45 s rise
is occupancy-checked and interruption-sensitive on every boundary. Fallen and dead bodies receive
no carrier drive. A living fallen root nevertheless re-anchors its query-only footprint at each
safe boundary: being lower does not make the body absent, and an opponent may walk around it but
may not stand through it and occupy the space required to rise. A detached/dead root reserves
nothing. Fighter movement remains a recovery request throughout both fallen and rising;
its fencing motors are neutral during that interval, the pelvis follows an acceleration-bounded
orientation path, and reattachment clears residual limb velocity once. The decaying stability
ledger explains the prior fall but does not impersonate a new hit after rising begins; a fresh
nonzero authored shove still aborts at the next safe boundary. A zero-magnitude authored
contact is not an interruption, and standable support must be within the terminal's step-height
envelope rather than merely sharing its horizontal projection while supported. A fallen body may
begin its bounded rise without pretending one folded foot is already planted: live support
topology, verified standable ground under the recovery footprint, occupancy and the acceleration
bound admit that path. Fresh terminal contact is required again before the completed body may
return to `supported`.

Supported V1 freezes the whole stability scale together: specific impulse decays by 0.020 m/s each
second, staggers at 0.006 m/s and falls at 0.014 m/s; brace multiplies both thresholds by 1.50; the
fallen dwell is 0.35 s, support grace is 0.35 s and rising lasts 0.45 s. The live-Havok threshold
bracket and its one-millionth mutation proof are recorded in `docs/measurements.md`; these values
are one measured contract rather than independently tunable feel constants.

The original plan required a continuously DYNAMIC supported root. A real 240 Hz bracket rejected
that premise: both the humanoid Construct and Warrior lost physical foot evidence inside the exact
then-current 0.10 s grace and fell at rest. Supported walking therefore uses an ANIMATED physical root only while
the carrier remains admitted, with finite-speed carrier motion and symmetric footprint collision;
knockdown changes that same root to DYNAMIC. This is the game's intentional locomotion assistance,
not invulnerable combat anatomy: real weapons remain physical, authored shove releases support, and
recovery must earn reattachment. The animated-root choice supersedes the earlier dynamic-root plan
in the durable architecture.

An admitted Construct carrier also removes collision tilt through that ordinary live root drive.
Above root-up 0.995 it retains the proven velocity/yaw drive; below the threshold it advances the
same carrier velocity while converging toward world-up at no more than 1.2 rad/s. A one-step upright
snap was rejected because it pushed the correction through every attached joint as an unbounded
impulse. Moving the bounded target to a root-only post-verdict callback was rejected too: after pair
and joint control had stopped, it pulled the surviving assembly away from the visible fight rather
than settling it. On the verdict edge both command drivers and pair control stop. A surviving
Construct instead captures every still-attached part in the achieved root-relative pose, changes
that finite set to ANIMATED presentation bodies, and rotates the entire assembly toward upright at
the same bound. Pairwise geometry therefore cannot be left behind by a root correction, and no
scheduler, locomotion request or combat authority is revived. Detached debris and a defeated
Construct remain ordinary dynamic bodies.

Diagnostics expose immutable support state, specific impulse, active and alternative support
groups with binding-level refusal reasons, requested and allowed motion, blockage/release reason and
recovery progress. They expose no body or shape handle. Arena and physical Forge Probe retain the
same transition timeline, so a final supported row cannot hide a fall or failed rise.

## The house rules this work was done under

The full list is in `AGENTS.md`. The three that shaped the code rather than the process:

- **Cosmetics never carry authority.** `figure.ts` owns no collision and decides no hit.
- **The overlay creates nothing.** Pinned by `__sword.rigview.audit()`, not asserted in a
  comment.
- **No feel complaint is fixed by raising a motor ceiling without a measured before/after
  table beside the number in `config.ts`.** Every number in the `arm` block was set that
  way and each one carries its table.

## The golem, and the order of work it exists to reverse

*The golem work, 2026-09-04 to 2026-09-05, in eleven landed sessions. **No human gate in it has
been asked.** Nothing in any of the sections below is a verdict, no number quoted in them is a
regression floor, and every threshold those sessions pinned into a test is marked provisional in
that test.*

**A golem is a fixed body plan of five slots, each filled by one pre-made module.** Three body
experiments came before it and the section above records why all three were closed. The finding
they share is the one this design is built on: **each was gated by a scalar proxy that turned green
while the owner's judgement stayed red** — anchor stray in millimetres, dynamism path length,
stuck-step counts. So the order of work is reversed here. A person looks first, and a metric becomes
a regression floor only after a person has said yes.

| slot | reads from `Intent` | options built |
| --- | --- | --- |
| locomotion | `forward`, `strafe`, `turn`, `posture.crouch` | `locomotion.biped`, `locomotion.wheel`, `locomotion.multileg` |
| torso | `posture.trunkLean`, `posture.trunkTwist` | `torso.plain`, `torso.plated` |
| primary effector | `primary: HandIntent` | a chain and a terminal, picked independently |
| secondary effector | `secondary: HandIntent` | the same shelf; a two-socket terminal claims both |
| head | `natural: NaturalIntent` | `head.plain`, `head.ram` |

Those five channels are the existing `Intent` split exactly, so a mouse and a scripted mind drive a
golem through the seam they already drove a Warrior through. **`Intent` was not widened for any of
it**, which is the one-seam rule holding under a body plan it was not designed for: `Golem.applyIntent`
fans the same eight fields onto five modules and every module *narrows*. The golem's control
endpoint, `src/golem/golem-control.ts` on the surface tag `golem-v1`, is a clone of the humanoid one
rather than a shared base class — and the clone is the decision. The tag exists so a driver built
for one body cannot be installed on the other, and a base class both inherited would make its
`install` check the only thing keeping them apart. `ControlEndpoint` in `src/control-host.ts` is
already the shared abstraction, and it is an interface.

**The human-first gate, and why the proxies came second.** A module is accepted by the owner driving
it on the bench with the mouse for about a minute and answering three questions: does it read as a
limb rather than as a robot arm or a rope; does its motion carry weight — lag, follow-through,
recoil; does anything look wrong — pose flips, jitter, self-contact, a stroke that does not stop
where it should. The answers are the verdict and no measurement substitutes for them. What the
benches are *for* is the other half: they say what the code does, they catch the defects an eye
cannot see (a mask that admits a pair, a motor that keeps hauling a severed chain, a peak taken
during a contact), and they are what makes a regression detectable **once** a person has said yes.
That is the whole of the reordering — the proxies were not dropped, they were demoted from gate to
instrument. The stop rule goes with it: a rung or a module gets at most two correction sessions, and
if the owner still says no the record says so and the ladder stops at the last accepted rung, rather
than tuning against a number until it goes green.

**The chain ladder, and why every rung stays.**

| rung | chain | driven axes | what the chain is given | terminals offered on it |
| --- | --- | ---: | --- | --- |
| 0 | `none` | 0 | nothing; the socket carries its own cap | none — it is its own terminal |
| 1 | `pitch` | 1 | one pitch angle from `pointerY` | blade, plate, mace |
| 2 | `reach` | 3 | a point, from pointer azimuth/elevation and reach | blade, plate, mace |
| 3 | `wrist` | 5 | rung 2 plus roll and bend | blade, plate, mace, whip |

Eleven effector options, which is not the full grid: `none` pairs with nothing because rung 0
carries its own cap, and the whip is offered on rung 3 alone because without a roll axis a lash has
no start. The pairing is a `Record` over the legal pairs, so an unbuilt pair is a compile error
rather than a silent substitution — the failure that once put a shield in the arena as a club.

**The ladder is an order of construction, not a replacement sequence, and every rung stays a
pickable option.** Rung 3 is not "the good one" with three drafts behind it. Rung 0 is what makes
the body plan complete without effectors and gives the bench a noise floor measured on something
that cannot move. Rung 1 is one hinge and one angle, and a body built from two of them is a
different fighter rather than a worse one. Rung 2 is where the pose becomes unique. Only rung 3 can
be asked to turn an edge or start a lash without moving the hand, and it is also the only rung that
rings. Each rung is a trade a person picks, so the shelf is the design; a ladder that discarded its
lower rungs would have three fewer bodies in it and exactly one arm.

## The golem module contract, and the bench that judges one module at a time

A golem is a fixed body plan of five slots — locomotion, torso, two effectors and a head — each
filled by one pre-made module. `src/golem/module.ts` is the contract every slot's option
implements, and it is deliberately the whole of it: a module is a physics chain of slender
colliders, an authored shell parented to those colliders, a controller that runs every physics
substep, a declared envelope, a mass, per-part health and vitality weight, and a severing rule.
`docs/plans/golem-00-overview.md` carries the design argument; this is what landed.

**An effector is a chain and a terminal, chosen independently, and the split is the point.** The
chain owns everything about motion — the driven axes, the drive, the envelope, the mouse mapping
and the strokes. The terminal is what sits on the end: a collider, a mass, a striker kind through
the existing bite table, a collision layer against the enemy, and a shell. It contributes nothing
to control, and if a terminal file ever reads `HandIntent` the factoring has leaked. That is why
every chain is benched with the same blade: what is being judged is the chain.

`src/golem/effectors/effector.ts` is the whole of the glue and it switches on nothing, so there is
no branch in it that could substitute one option for another — the failure that once put a shield
in the arena as a club. What it does decide is a *refusal*: a chain that carries its own terminal
cannot be given one, and a chain that hands out a weld has to be given one. Both throw at build.

**Weapons are body parts.** There is no held item and no grip. A terminal is welded once to the
chain's last link, in the frame that weld demands, because a weld whose two frames disagree at
construction is a violation the solver clears by flinging the thing. The chain supplies the mount,
not the terminal, because the chain is what knows which way its own swing plane lies: rung 1
points the blade's edge along the tangent of its own arc, which is a fact about the chain and not
about the steel.

**A golem's own parts never collide with each other, by construction rather than by aspiration.**
`golemLayers` derives a module's masks from the existing per-side table: links sit on the side's
arm layer and terminals on its sword layer, and neither mask contains the other or the trunk. So
no self-pair is ever admitted to the solver. The bench counts self-contacts anyway, and the count
is what it is — a check that no pair was admitted by accident, not evidence of physicality, which
is the correction the construct experiment already paid for.

**`bench.html` is a second page and it carries no list of what it can show.** It reads the option
set from `src/golem/registry.ts` and builds its picker from it, grouped by the mode each
registration declares, with the number keys selecting from the registry's own order. A later
session adds its file and one line to `GOLEM_MODULES`; nothing in the middle of the page changes,
which is what lets two sessions extend it at once. `src/golem/config.ts` is one exported block per
module id for the same reason — a flat file of `export const`s puts a new session's numbers at the
end rather than in the middle of somebody else's object — and every number in it carries the sweep
or the arithmetic that set it, with the date, exactly as `CONFIG.arm` does.

**The drive is soft, force-capped and rate-limited.** `src/golem/anchor-drive.ts` is a copy-and-cut
of what `src/arm.ts` does in its anchor construction, `driveAnchor` and `applyTuning`, standing on
its own so a chain can have one without importing `Arm`. What is new is the rate limit: a
Warrior's anchor is teleported to wherever the cursor says, which is why a Warrior arm keyframes
onto its commanded pose on the first control step and reads 77 m/s of tip speed while standing
still. A golem's command is bounded in how fast it may move, so the first step is a move.

**The first two rungs of the chain ladder exist and neither is accepted.** *(Session 02 wrote that
on 2026-09-04, when they were the only two. Corrected 2026-09-05: all four rungs exist — rungs 2
and 3 are the section immediately below — and none of the four is accepted, because no human gate
in this work has been asked.)* Rung 0 (`none`) is a
capped socket with no driven axis, and it is there so the body plan is complete without effectors
and so the bench has a noise floor measured on something that cannot move. Rung 1 (`pitch`) is one
hinge, a short stone link and a blade. For a one-axis chain task space and joint space are the
same number, so the joint-space position motor the overview names as a candidate cause is
unavoidable there; what makes it not a robot arm is the torque cap, the target rate limit and the
stroke shape, and the bench measures exactly those three. `docs/measurements.md` has the sweeps,
with the harness named on every figure. **Whether it reads as a limb is the owner's answer and no
number in this directory can stand in for it** — that is the whole reason this plan set exists.

## Unique pose by construction: the reach and wrist chains

Rungs 2 and 3 are the ones the anchor idea had to survive. The recorded Warrior defects — an elbow
that wrapped around the back, a shield hand that swung behind the trunk — are the overview's
*candidate* explanation of a seven-axis chain asked for a six-axis pose: a spare axis means a
command near the envelope's edge resolves to the least-violation pose rather than to the pose
anybody meant. These two rungs remove the redundancy and look at what is left.

**Three driven axes against a three-dimensional target.** `src/golem/effectors/chains/arm-core.ts`
builds a yaw collar at the socket, an upper arm pitching about the collar's lateral and an elbow
bending about that same lateral, and pins the forearm's far end with a **position-only** anchor.
Both shoulder pivots sit exactly on the socket, so the whole arm lies in one vertical plane and the
yaw chooses the plane — and a yaw-then-pitch gimbal *is* spherical coordinates about the socket,
which is what makes the mapping from a target point to a pose one line of trigonometry rather than
a solver. Three axes against three linear constraints leaves nothing over, so the elbow's position
is a single-valued function of the hand target. That is asserted rather than claimed: a grid of the
envelope visited twice from opposite directions puts the elbow **0.34 mm** apart, against
**17.08 mm** with the shoulder opened to three axes.

**Two hinges in series rather than one two-axis joint, twice, for two different reasons.** At the
shoulder the envelope arithmetic depends on the decomposition being exactly yaw-then-pitch, and a
`Physics6DoFConstraint` with two free angular axes decomposes in an order this directory has never
established. At the wrist both axes are motorised so the order matters less, but a decomposition
that is gimbal-locked somewhere in the working range would be a wrist that stops answering at one
particular roll. A hinge — one free angular axis, the other two locked — cannot be either.

**Ownership is split by axis, not doubled.** On rung 3 the anchor drives three linear axes and no
angular ones; the wrist's two motors drive two angular axes and no linear ones. There is no
six-axis hand pin anywhere in a golem. The Warrior's wrist was left angularly *free* precisely
because its grip motor already owned orientation and the two fought, and when a roll sign was wrong
the shoulder cone refused the twist and the solver paid for the orientation out of the position —
504 mm of hand-to-anchor stray. Here an orientation the wrist cannot reach costs the position
nothing, measured at 0.03 mm of stray while the roll is driven past its own stop.

**The envelope is the mechanism, not a guard.** `ModuleEnvelope.reachable` is a sphere shell about
the socket — two radii, a swing range, a lift range and a minimum outboard carry — and the mapping
clamps into it *before the anchor is ever handed a target*. The carry is what makes "hand across
the sternum" not a pose a controller refuses but a pose that is not in the envelope: it couples the
swing to the reach and the lift, so a long cross-body command is clamped where a short one is
allowed. The Warrior does the opposite — `Arm.aim` reads an azimuth, decides it is impossible and
substitutes another — and that substitution is a controller arguing with a command. Nothing
downstream of the clamp has a refusal branch, which is frozen rule 3 in one sentence.

**Everything outboard-signed, so there is one mirror and it is stated once.** `swing` is the
azimuth times the socket's own outboard sign, so one envelope record and one set of stroke rates
serve both sockets. The roll is the one quantity that genuinely mirrors — the mirror image of a
rotation about the limb's own axis is its negative — and the bend deliberately does not, because a
rotation about the arm plane's lateral is a motion inside that plane. Both halves are asserted by
driving one command into both sockets and comparing the tips as reflections.

**A stroke is a velocity event here too, said the other way round.** Rung 1 switches its hinge
motor to VELOCITY and drops the torque; an anchor has no velocity mode, so its stroke lifts the
*rate* ceiling for the drive and drops the *force* ceiling for the follow, and the limb
decelerates against gravity rather than against the drive. The thrust carries 47.1 mm past where
its drive left it against 13.6 mm with the follow phase removed; the cut carries 0.371 rad against
0.050. Both numbers stop short of a joint stop on purpose, and both tables record the setting that
did not.

### The terminal shelf, and the seam a two-socket terminal needed

Session 04 filled the shelf the overview names: a **plate** that blocks by being in the way, a
**mace** that claimed both effector sockets, and a **whip** that is a chain of bodies. The matchup
set's Session 02 (2026-09-06) reworked two of those and added a third: the mace is one-handed now,
the two-socket bar is the **maul** and both hands hold it at one point, and the whip is twice the
lash it was. A terminal is a body, a weld, a striker, a layer and a shell, and if a terminal file
ever reads `HandIntent` the chain/terminal factoring has leaked.

**A terminal may narrow the chain that carries it, and that is the one thing it decides about
control.** `EffectorTerminalDefinition.limits` is a total record of nullable numbers — the
reachable shell plus the wrist's two — and a chain applies each as a *tightening* against its own,
so a terminal can never grant reach it does not have. Null is "this terminal takes nothing from
this axis", said once rather than by transcribing the chain's constants. Nothing about it is a
refusal branch: the chain clamps into the narrowed shell before the anchor is ever handed a target,
which is frozen rule 3 with a second author. A maul pins the yaw half a radian inboard and, on a
wrist chain, the roll and the bend, and keeps a 6 cm band of reach and most of the lift; a mace
pins the wrist's bend and nothing else; a plate gives up two thirds of the wrist's flexion and
keeps everything else; a whip gives up 0.30 rad of elevation and keeps the roll it needs.

**The two-socket seam is `ModuleBuild.companion`, `BuiltChain.commandWeldTo` and
`ChainCrossing`, and the second motor is aimed at the first motor's point.** The bar this
replaced was two grips on two straight arms, and its whole record was the reason it went: two
position motors on one rigid body fight, so the trailing arm was unmotorised and the terminal
pinned three axes to keep the loop determined, and what was left could be aimed with the trunk
alone -- 8.3 damage a bout against the blade's 72.6. The maul is one grip, and the argument is
one sentence: two motors asked for different poses fight, two motors asked for the same point add.
`effectorModule` builds the driven chain in `ctx.socket` with the terminal's limits, builds a
second chain of the same definition in `ctx.companion` with no limits and the terminal's
*crossing*, and every step sends the trailing chain's weld to the driven chain's *commanded* weld
through `commandWeldTo` -- the commanded point and not the achieved one, so the two anchors pull
the same target and the second is never chasing the first's error. The trailing chain keeps its
motors. The terminal welds the bar to the driven hand at build and watches the trailing hand
close on the grip; on the first step it is within `TERMINAL_MAUL.joinWithin` a ball joint is made
with its frames composed from where the two bodies actually are, so it is born satisfied. Until
then `gripStray` is null and the bench reports when it stopped being so (0.25 s on the reach
chain, 0.46 s on the wrist chain). A ball joint and not a weld, and the difference is a degree
count: the trailing chain has three axes and a point constraint spends exactly three, so the loop
is determined and the driven wrist's own roll and bend stay its own.

**The crossing is the one widening in the module contract.** Two ordinary arm envelopes cannot
meet: each keeps its hand a tenth of a metre outboard of the centreline, so two hands are never
closer than 0.20 m. The maul stands its grip at the driven chain's inboard edge, and the trailing
chain is granted `ChainCrossing` -- a swing floor and a carry floor past the centreline -- in place
of its own. It replaces the floors and nothing else, and only a terminal that claims both sockets
can hand one out; a one-socket terminal has no trailing chain to grant it to.

The refusals are refusals rather than fallbacks and there are six: a chain that carries its own
terminal cannot be given one, a chain that hands out a weld must be given one, a two-socket
terminal must be given a second socket that is not the first, a chain that cannot bring its hand
to a point cannot share a grip (the pitch chain has one axis and no anchor, so it is not offered
a maul), a two-socket terminal must grant its second hand a crossing, and a terminal must offer at
least one striker. A maul that quietly built a one-handed bar would be the
shield-that-shipped-as-a-club failure with the sockets swapped.

**`BuiltTerminal.strikers` is a list now, business end first.** A whip's bite is its last four
beads: one that scored only with the final capsule would mostly miss, and one that scored with all
eight would bruise with its own handle. The first entry is where the tip and the edge are read
from, so a rigid terminal's one-entry list is the old contract unchanged.

**A chain is cast to its load.** `EffectorChainDefinition.build` is handed the terminal's mass,
and the wrist chain floors its ring and link at `CHAIN_WRIST.carryRatio` of it. The number this
was bought with: an 18 kg mace on a 1.8 kg ring stood the ring 36 degrees off the forearm at
rest with every axis of that hinge but the roll locked, because Havok solves a locked axis
iteratively and a light body between a heavy one and the world is thrown the residual every step.
Nothing was commanded wrong and no motor was short; the same links at four times the mass held
the bar to 3 degrees, and the blade's wrist, under the floor, did not move. The reach chain's
8.8 kg forearm held a 27 kg bar to 1.3 mm and ignores the number until a bench says otherwise.

**Layers: golem modules reuse the existing `*_ARM` and `*_SWORD` side bits and take none of their
own.** The decision and its argument live in `src/physics.ts` beside the table they are about. The
part worth repeating here is why a plate is refused the `*_SHIELD` bit: the four-layers-per-side
split exists to buy exactly one pair — a shield collides with its owner's trunk — and that pair is
the one thing a golem plate must not have. The held shield needed it because a redundant seven-axis
arm could be commanded into its owner's chest; a low-axis chain with a published envelope cannot,
so a board through its own torso is an envelope fault fixed in the chain. That also makes the whip
possible at all: six capsules on spherical joints overlap at every seam by construction, and they
sit on a layer whose collide mask does not contain that layer.

**A plate is held the way a buckler is, not the way a heater shield is.** Its own +Y is the face
normal and it welds through the chain's ordinary mount, so it faces wherever the arm points, which
is always directly away from its owner — the rule the owner asked for, and the reason
`mountFor("buckler")` is `mountFor("sword")`. On a wrist chain the roll and the *bend* together are
what point the face: rolling about the limb's own axis spins a board about its own normal and shows
nothing, so the roll picks the direction the face tips and the bend picks how far. On rungs 1 and 2
the facing is a function of the pose, which is the same honest limitation rung 2 already has about
a blade's edge.

**A mace is a blade at fourteen times the mass, and the wrist cannot hold it bent.** One socket,
one capsule welded at its butt along the limb exactly as the blade is, 0.80 m and 18 kg balanced
0.63 of the way out, a bronze head drawn 40 mm proud of a collider that bites along the haft's own
line. It takes the wrist's bend and nothing else: `CHAIN_WRIST.bendTorque` is 120 Nm and the head
at its lever is 89, and the bench with the bend free had the wrist folded past its own stop at
rest and overshooting by half a radian when commanded. Pinned, the stop closes to the margin and
the constraint carries the load, and a mace is swung straight off the forearm -- which is what a
person does with one too. It swings and rolls with its arm. Its blow is the club's row with the
mass put back, so a bench-speed mace is worth five Warrior clubs.

**A maul is the strongest thing on the shelf, and what it costs is the yaw.** 1.30 m and 48 kg,
both hands on one grip 0.35 m from the butt, a ball at the head; `club`, scored by impulse at
fourteen Warrior clubs. The bar runs out along the driven limb from the grip, which is the blade's
frame unchanged, so the terminal composes no mount of its own and the striker's tip is the head.
What it gives up is the argument above: one azimuth, half a radian inboard, and the mind turns
the body to aim it. On the wrist chain the ring is cast to 19 kg to carry it and the wrist's
roll and bend are pinned, because 48 kg at 0.66 m is 310 Nm against a 120 Nm motor and the first
bench hung the head at a right angle.

**A whip is physics rather than control.** No lash controller, no per-segment target, no stroke of
its own; the first bead is welded so `roll` is which way the lash starts, and the rest are on
limited spherical joints so the chain cannot fold through itself. It is offered on the wrist chain
alone, because without a roll axis a lash has no start. Eight beads of 0.16 m since the matchup
set's Session 02, 1.28 m built straight, and it publishes 1.09 m -- the peak distance from the weld
to the tip over a scripted lash and carry, measured, because `tacticalRanges` stands a golem where
its tip lands and a lash published at its straightened length stood 0.3 m too far out and lashed
at air. It is its own `WeaponKind` now, `whip`, so the mind can tell a lash from a smash; the
kind is held and not offered, so the Warrior's shelf does not grow by it, and its scoring row is
the club's ramp deliberately blind to mass, because a bead is half a kilogram and a lash's whole
bite is speed.

**The stroke is the weapon's.** Until this session the mind had one arc, a cut, and applied it to
a plate, a club and a lash alike. `STROKE_SHAPES` in `src/golem/tactics.ts` is a total record
over `WeaponKind`: a sword cuts as before (its row reads `GOLEM_TACTICS` live, so the sweeps
beside those constants still describe the numbers the blade uses); a club is chambered high and
drawn in, brought down through the mark and past it over a longer stroke, with the feet closing
under the blow by a `stepIn` the commit adds to whatever the range asked for; a fist punches
straight out from a chamber drawn all the way in; a shield bashes -- almost no arc, the reach axis
and a step; a whip is chambered wide with the wrist wound one way and swept across the mark with
it reversed, which is what cracks it. Every number that is not the sword's has a sweep row in
`docs/measurements.md`. The mind picks the row by `HandView.weapon` and still reads no module
id; which club it holds -- one hand or two -- it learns from one new capability,
`GolemCapabilities.pairedHands`, and when that is true it treats the pair as one attacker and
writes the second hand's seven fields as the first's every step, so a bar the body drives from the
primary socket is never asked by the secondary for a guard on the other side.

**And since 2026-09-06 the stroke can be measured before a bout, which is how we found out that
none of them lands.** `scripts/golem-bench.mjs --stroke` puts one module on the stand, transcribes
`driveStroke` frame for frame through `strokeSequence`, and reads the closest approach of the whole
anchor-to-tip segment to a mark at `tacticalRanges(...).strike`. On the shipped shapes a wrist
blade comes no nearer than 0.63 m to what it was swung at, a mace 0.73 and a maul 1.29, and each
reaches its highest speed on the way past. The cause is one thing: the stroke begins with the arm
drawn fully in and asks it to be 1.64 m out a sixth of a second later, the anchor drive cannot
extend that fast, and by the time the arm is out the azimuth has swept past the mark and taken the
weapon with it. `--stroke --sweep stroke` runs the plan's 64-cell grid over the four shape axes and
says what fixes it: a **wider chamber**, which starts the azimuth far enough outboard that the
sweep is still crossing the mark when the arm has finished extending, and a **shallower draw**.
Together they take the blade from 0.63 m to 0.070 m at 22 m/s. What they do not fix is a club —
no cell of the grid brings a mace inside 0.47 m, and its anchor stray runs to 864 mm, which is the
chain losing the head rather than the shape being wrong. `COMMITTED_SHAPE_CANDIDATES` carries the
three kinds that do, each with the bench row that chose it; `docs/measurements.md` has the grid.

**A cover is a wall and not an intercept, and that is measured too.** `--parry` holds the guard,
commands it a quarter of a metre across as an *angle* on the swing axis — which is the only thing
a mind can ask for — and reads how long it takes to settle. The fastest cover on the stand is a
blade at 0.59 s; the plate a guardian would actually hold takes 0.89 s to travel 0.40 m and
overshoots its resting place by 153 mm on the way. Nothing here can be solved against an incoming
point mid-commit, so a parry has to be pre-positioned off the chamber read. The arrival is read
against where the cover *ends up* rather than against `commandedTip`, because a plate on a static
cover command rests 0.119 m short of it and stays there: an arrival measured against the command
never happens, however long the hold, which is what the first version of that probe reported.

**Two effectors on the bench at once.** `P` puts a module in each socket and `F` then moves the
*cursor* rather than the module, so the limb the cursor left holds whatever it was last given —
which is what an arena fighter's off hand does, and the only way to ask whether a blade and a plate
on one stand read as one body. A module that claims both sockets cannot share the stand and the
picker says so.

## The locomotion slot, and why it is the one that is not a chain

Every other golem slot is a driven chain of stone on a socket. Locomotion is not, and the reason is
a measurement rather than a preference: **continuous dynamic-root balance was tried at 240 Hz and
both humanoid bodies lost foot evidence and fell inside the then-current grace at rest.** So a golem
moves the way the Warrior and the Broot already move — on the supported carrier in the four
`src/supported-locomotion*.ts` files — and the locomotion module's job is to fill that system's own
records in from its own anatomy rather than to invent a second one. Nothing in those four files
changed shape for the golem; what was added to them is one provenance label
(`golem-bind-geometry`), because a golem's footprint is measured from its own bind pose exactly as
a fighter's is and calling it a construct's would name a body plan this tree no longer has.

**What the pieces are.** A bodyless `VirtualLocomotionCarrier` resolves where the golem is *allowed*
to be, against a `StandableWorldRegistry` of query colliders and, in a pair, against the other
carrier's footprint. The admitted physical root — the biped's pelvis — is `ANIMATED` and is
keyframed onto what the carrier resolved. The legs are ordinary driven, hittable, severable bodies:
they publish the support evidence, they carry the gait, and they are what a blade meets. An authored
knockdown above the frozen specific-impulse threshold releases the root to `DYNAMIC`, and the whole
assembly is a ragdoll until a bounded `RisingActuator` frame brings it back. `AGENTS.md` says
plainly that "restoring physics" by deleting `driveAnimatedRoot` recreates the pile-up this system
exists to avoid.

**The contract is `src/golem/locomotion.ts` and it adds five things to the module contract**: the
carrier's own ceilings, a height range, a navigation footprint, the support bindings, and a
`BuiltLocomotion` that publishes the root body, a `SupportedRootAdapter`, the port, the registry,
`postureEvidence()` and `gait(dt)`. Its `Command` is the existing `LocomotionRequest` plus `crouch`
from `Intent.posture` — the field `mind.ts` has carried marked "reserved for session 05" since the
posture record was split out. `Intent` is not widened for any of it; `locomotionCommand` narrows,
which is the direction the one-seam rule allows.

### Three decisions in that contract that are not obvious

**`recover` is derived from what the person is asking for, never from what the carrier achieved.**
A fallen carrier zeroes its own translation, so a `recover` read back off the committed movement is
false for exactly as long as the body is fallen and the body is therefore trapped for ever. The rule
is the game's existing one — deliberate movement input after the fallen dwell is the request to get
up.

**Crouch is a carrier property rather than a pose.** The biped has a height range and Session 06's
wheel will not, and a mind asking either of them to crouch is asking about the carrier. The
`VirtualLocomotionCarrier` is horizontal-only by construction — its `commit` preserves `y` — so the
vertical belongs to the module, which drives it to the height its own leg solve implies.

**A pair owns its own carrier resolution and the module owns everything else.** `step(dt)` is
`beginSubstep`, a solo world-clip resolution, `gait(dt)`, `endSubstep(dt)`, which is right for one
module on a bench and wrong for two golems, because both carriers have to be proposed before either
is committed. The two halves are published so `resolvePhysicalSupportedPair` can go between them,
and `tests/golem-locomotion.test.mjs` drives a real pair of bipeds through exactly that.

### The biped, and the gait rule in one paragraph

A pelvis carrier on two legs of thigh, shin and foot, standing 1.02 m at the socket on 0.84 m of
leg. The stride phase advances with the **carrier's committed** speed rather than the root's, so a
golem stopped by a wall stops stepping instead of marching on the spot; the cadence is per metre
travelled, so the feet keep pace with the ground; the swing amplitude fades to nothing at rest, so
standing still straightens the legs with no idle pose and no blend to get wrong; and the crouch is
solved through the law of cosines for the height the carrier wants, so the sole stays on the floor
while the hip drops. That is `legPose` in `src/fighter.ts`, rewritten against this body's numbers
with an ankle added that keeps the sole level. Every number in it was swept and carries its table.

**Legs never collide with each other or with the torso; feet collide with the world**, and that is
true by construction rather than by aspiration: the whole module sits on the side's own body layer,
whose collide mask contains the world and the far side and contains neither itself nor the trunk. A
self-contact count of zero proves nothing about pairs the filters never admitted, so the test that
reports it also reports a positive world-contact count, which is what says the feet solve against
the floor at all.

**A knockdown relaxes the legs and that was measured.** A ragdoll whose leg motors go on driving
their gait targets at full torque holds itself up: a shove 51 times the golem's own braced fall
threshold tipped the root to an up-dot of 0.816 and dropped the assembly 0.23 m. At
`fallenTorqueScale` the same shove takes it past horizontal.

### The bench fixture seam, which is a generalisation rather than a special case

`src/bench/main.ts` draws its readout from `EffectorView` and drives everything through
`command(intent)`. Both are exactly right for an effector and empty for a module with no tip: a
locomotion readout is a support state, a carrier speed and a foot slip, and none of those is an
`EffectorView` field. A dispatch on `GolemBenchMode` would be the thing Sessions 05, 06 and 07 all
had to edit, which is what that union's own comment says must not happen. So a registration may
supply a `BenchFixture` — extra readout lines, and what the bench's shove key does — and the bench
shows and calls it without knowing what kind of thing it is.

Two smaller seams go with it. `ModuleBuild.world` carries the world-query registry, optional because
only one slot of the five navigates and on `ModuleBuild` because a *pair* must share exactly one
registry. And the bench stand now takes the slot it is about to carry: for four slots it is the
fixed `ANIMATED` anchor Session 02 built, and for locomotion it is a real `DYNAMIC` torso block on a
soft motorised waist, because a locomotion module is the base and the slab is its load. Session 07
will replace that stand-in with a torso module, and who then owns the waist joint is an open
question this session states rather than settles. *(Settled 2026-09-04 by the assembly, under "The
assembled golem" below: build order forces it and the torso owns the waist.)*

## The torso and the head, and the option that gambles its own fatal part

Session 07 filled two of the five slots. The torso is the part that carries the three upper
sockets and the vitality core; the head is the fatal part, and in one of its two options it is
also the only attack a golem makes with something that can kill it.

**Torso options are mechanical, and the shape of the code is what enforces it.** A `TorsoTuning`
block is a size, a mass, an armour fraction, three socket frames and a waist range — there is no
mesh in it, no silhouette and no style, so an option that "looks different" is not a thing this
seam can express. `torso.plain` is 139 kg with 24 degrees of lean and 32 of twist and keeps a
tenth of a blow off its core; `torso.plated` is 236 kg with 16 and 19 and keeps a third. The one
visible difference — how proud the armour slabs stand — is computed from `coreArmour` rather than
chosen, so it cannot drift away from what the armour actually does.

**The waist motor is shared between them on purpose.** Frozen rule 4 says weight comes from a
finite force budget against real mass, so the same 1500 N·m against 236 kg has to lag more than it
does against 139, and giving the heavier option a bigger motor would be the move the house rule
forbids. What the sweep found is that a trunk is an **inverted pendulum**: its centre of mass is
above the lean hinge, so gravity deepens a lean rather than restoring it and the motor is holding
the trunk *back*. At 900 N·m the plain trunk carries 0.2025 rad past a 0.42 rad target — which is
exactly its own joint stop — and the setting is 1500 because that is where it stops arriving
there. The twist needs far less (900, saturated) for a reason that is not tuning: the twist axis
is the vertical, so weight exerts no moment about it at all.

**The socket frames are geometry and they change reach and cover honestly.** A torso hands out
`primary`, `secondary` and `head` as `GolemSocket`s on its own core — the same record
`buildGolemStand` hands out — so an effector bolted to a plated trunk really is held 40 mm wider
and 20 mm higher, and it moves when the trunk leans because its mount is the core. That one
call is also what Session 08 mounts on: there is no second seam for assembly.

### Armour is a number on a part and a rule in the damage model

The plated torso does not have a branch anywhere. `GolemPart` carries an optional `armour`
fraction, `armouredDamage` in `src/scoring.ts` is the rule, and `Combatant.applyDamage` — which
already existed for a body to turn raw scoring damage into applied damage — is where it is spent.
The ordering is a decision rather than an implementation detail: armour runs *after* `scoreHit`
and never inside it, so it changes what a blow costs and not what a blow *was*. Fold it into the
score instead and a plated torso would quietly become harder to dismember as well as harder to
hurt, which is two mechanics wearing one number.

### The ram, and what it found in the damage model

The ram's lunge is a velocity event through the neck: the pitch motor switches to VELOCITY, drives
the head forward and down, then the torque drops to a ninth and 102 kg of head and plate coasts.
It is fired from `Intent.natural.thrust`, which is the channel a centipede's jaws already use, and
the writer on the person's side is `applyButtonPose` — the same left button that thrusts a blade.
The bench sets `Controls.ownership.posture` so the arrow keys reach the trunk, because on a bench
there is no policy to own posture and a channel with no writer is a button a person cannot press.

Two things about it are worth carrying forward.

**A lunge goes down, not across.** Measured, a nod carries the plate about 35 mm further forward
and 460 mm further down: the plate traces an arc about a hinge already behind and below it. The
forward half of a lunge is the *waist*, which the head does not own and does not need to — a
person leans with the arrow keys and fires with the button, and the two arrive as one `Intent`.

**And it does not reach a hand weapon's speeds, which broke the damage model rather than the
ram.** The plate lands at 1.3–1.8 m/s at the contact, under the club's 2.2 m/s floor, so scored on
the club's row the whole option did literally nothing. That floor is a statement about 3.4 kg on
the end of an arm; a head on a hinge presents an effective mass of about 37 kg and arrives slowly.
`ram` was therefore given a `Striker` row of its own, with the club's two speeds carried across at
equal kinetic energy (×0.303), and it never severs.

**All four of the numbers that fix cost went with the ramp on 2026-09-07, and the row is now the
club's exactly.** Two speeds, a reference mass and a scale of 9 were four ways of writing down
what `0.5 mu v^2` says once: 74 kg into a 139 kg trunk core at 1.5 m/s is 54 J, which clears
`crushFloorJ` six times over and is worth about half a point of wound. That is a long way below
what `ramScale` paid, and it is the model's answer rather than a tuning — a ram is most of a body
arriving *slowly*, and slowly is the term that is squared. The lever that would make a lunge hurt
is how hard a hinged head can be driven, which lives in `HEAD_RAM.lunge.driveTorque` and in front
of the owner, not in a scoring row. What the ram found in the damage model is still the same
finding, twice over: a table written for one kind answers wrongly for every kind it does not
know, and `BITE.arrow` makes the argument in the other direction — "`combat.referenceSpeed` is
11 m/s and that is a **blade's** number".

**The risk is the design.** A ram golem puts its fatal part into the contact every time it
attacks. `head.plain` keeps the same neck, the same block and the same guard with no plate and no
lunge, so the trade is a real one and the control for measuring it is exact.

### The ram that did not hurt, and the impulse row

The owner watched the ram and asked whether it did no damage because it had too little force or
because health was too high. Neither, quite: it landed, and it was worth a fifth of a blade
stroke, and the reasons were on both sides of the contact.

**The damage model was mass-blind.** `scoreHit` was a speed ramp for every kind: the ram row
above scored 37 kg of head and plate exactly as it would have scored a fist, because nothing on
the striker said what was arriving. The first fix was a fifth bite mechanism, **`impulse`**,
beside `edge`, `point`, `mass` and `none`: the row's speed ramp times the mass the striker
publishes over the row's reference mass. A striker that published nothing got a ratio of one,
which is why every Warrior number stayed byte-identical, and `ramScale` was then set by sweep so
that a landed lunge was two blade strokes at the median and four at the ninetieth percentile;
the tables are in `docs/measurements.md` under Session 01 of the matchup set.

**That was a mass ratio written into a table, and on 2026-09-07 it became arithmetic.** `impulse`
and `mass` are both gone, along with the two reference masses and the three scales, because
`0.5 mu v^2` says all of it and says the half a ratio could not: what is being *hit*. The lasting
part of that session is `Striking.impactMassKg`, which is now **required** of every striker in the
program rather than optional — `RigidStrike` carries it, the Warrior's weapons read it off their
own bodies, and the ram plate publishes 74 kg, its own 37 with one hinge-mass of trunk behind it,
because the trunk is what a leaned lunge throws.

**The mind fired half a lunge, once.** `natural.thrust` was written as a level in the stances
where the trunk was upright, and the head fires on the rising edge: a golem rammed once a bout,
with its waist doing nothing. The ram is now an **exchange** in `src/golem/tactics.ts`, a stance
of its own between the gate and `recover`: the trunk leans to `ramLean`, the feet drive in, the
hands go to cover, and the neck is fired once the lean has had `ramLeanSeconds` to start the head
moving and the other body is inside `ramBite` of the plate. Two findings from the sweep are the
opposite of what was expected. A deep lean *slows* the blow, because the hinge goes down with the
trunk and the plate meets the body on the descending half of its arc, so the lean is shallow. And
a golem with arms never rams in a mirror bout, because two golems hold at each other's reach and
a plate reaches 0.68 m; the entry gate is narrow on purpose, since a wide one made an armed golem
charge from its hold and never close (five charges a bout, none fired, two more losses). A capped
golem fights at the ram's own range instead of the stand-off floor, chest to chest, which is the
risk the option is.

**And the plate scored things that were not blows.** A plate is a weapon for the length of a
lunge and a brow the rest of the time, and unguarded it scored the other fighter's blade for
hitting it and a guard it was leaning on once every `hitCooldown` -- eleven scored contacts per
lunge. `RigidStrike` now takes an optional **gate** in `Combat`'s own refusal vocabulary: the
head refuses every contact outside `armedSeconds` of a drive as `inactive-action`, and claims
one blow per lunge, refusing the rest as its own attribution. `tests/golem-torso-head.test.mjs`
drives the same post both ways.

### The fist

A stone ball on the end of a chain. Rung 0's cap already says what a golem's bare hand is worth
— 3.5 kg bolted to a socket that cannot move, so a shove — and the fist is the hand a chain can
throw: eight kilograms at 0.09 m radius, striker kind `empty`, scored on the same blunt row as a
Warrior's punch and differing from it only by mass. (It reads eight kilograms again since
2026-09-07: `TERMINAL_FIST.mass` had drifted to 18 in commit `e1ff978` with the comment that
derives 8 from stone at its radius left untouched, and under a row that could only multiply
nothing noticed. Under energy the two fists are 0.64 kg and 7.56 kg of reduced mass against a
torso, so the stone one is worth about twelve times the punch there and about five times it on a
light limb — the ratio falls where the thing being hit can move, which is the half a scale could
never express.) It has no control code and narrows nothing; a punch
is whatever stroke the chain makes, which for the mind is the straight short stroke a hand with
nothing in it makes, because `TERMINAL_DESCRIPTION` describes it as `empty` to a policy. Offered
on every chain that hands out a weld.

## The assembled golem

Five modules bolted together, driven through one `Intent`, and hittable. `src/golem/golem.ts` is
the only thing in the tree that knows what a golem *is*: every module already knows how to be
built, commanded, stepped, measured and cut off, and none of them knows what it is bolted to.

**Build order is forced, and forcing it settled the open question.** Locomotion first, because the
root is what decides where the ground is; then the torso on the locomotion root; then the head and
both effectors on the torso's own sockets. A joint can only be built by the module that has both
bodies in hand, so it belongs to whichever of the two is built *second* — and the torso must be
second, because it reads its mount's live transform every substep to know where its own commanded
pose is. **So the torso owns the waist.** It is the right owner on the merits too: the waist is the
joint a person turns with `Intent.posture`, the torso publishes its lean and twist on its own
envelope, and the locomotion module's waist exists only to carry a bench block that has no module
of its own. The biped's own rule — a `DYNAMIC` mount is a load and gets a waist, an `ANIMATED` one
is a frame and is left alone — already yields it, because the assembly hands the root an inert
`ANIMATED` base frame. What locomotion gets in exchange is `carry`: the mass it holds up and the
body the posture predicate's third signal is measured against.

**Sockets.** A golem has exactly two effector sockets and they are exactly the two hand names, so
`HandName` fits without a third vocabulary, `splitMind` has a hand to give the person, and the
hand-keyed behaviour record keeps working. A head files its blows with `hand` null through the
body-neutral channel, as a centipede's jaws do. A **maul claims both**: one module built into the
primary socket with the secondary handed over as `ModuleBuild.companion`, so `effectorPlan.secondary`
is null and nothing else is built there. The reducer fills both sockets when a two-socket terminal
is picked, which is the club's two-handed rule with a different subject, and `golemSetupRefusal`
states the same rule again where a build that never went near the screen is checked.

**A golem is not a `Fighter`, and the takeover stopped asking whether it was.** `isArticulatedCombatant`
was the gate on human takeover, which was the same question for as long as the only takeable body
was a Warrior. `Combatant.humanDriver` is the capability port now: a body that can report where a
person's cursor would have to sit and accept a driver. `DrivenPose` is what it answers — the cursor
seed, the refusal when there is none, the commanded business end in the body's own trunk frame, and
the live tip — and both `Fighter` and `Golem` answer it from completely different anatomy. **The
seeding rule is unchanged**: the cursor's meaning is rebased onto the pose the body is in, so a
taken body never snaps its effector at full force. What made one rule serve two bodies is that the
seed crossing the seam is a **cursor** rather than a pose: a Warrior's inverse is `cursorForPose`
and a golem chain owns its own, and `handoverFromCursors` takes the answer instead of the question.
`isArticulatedCombatant` survives for the question it actually asks — `scripts/measure.mjs` uses it
to reach `Fighter.armed`.

**Severing is breaking the socket joint, and the module is the severable unit.** Cutting through
any piece of an arm takes the whole arm off at the shoulder, which is the Warrior's own rule for a
body whose arm is a module rather than three bones. What it leaves on the floor is real: every part
re-layers onto `DEBRIS` on its own leaf shape, the terminal marks itself spent so a blade lying on
the ground scores nothing, and the module's drives let go — a motor still hauling a chain that has
come off is the haunting the Warrior's anchors produce. **A golem does not bleed.** Nothing on the
sever path calls `src/blood.ts`; the blood system reads the combat log and decides for itself, and
what a stone body should throw off is a decision for somebody looking at it.

**Death is a collapse rather than a crumple.** A Warrior folds because a corpse has joints with no
strength in them. A golem is not soft enough to fold: losing its head or its pelvis releases the
carrier, the legs' drives go, and the assembly comes apart under its own weight.

**Vitality is scaled at assembly, because a module cannot know what it is bolted to.** The Warrior's
weight table is a fixed anatomy summing to 3.6 with a ruined head or torso worth the whole bar; a
golem's parts are whatever its five modules declare. So the declared points are normalized to
`GOLEM_ASSEMBLY.vitalityTotal` and a part is worth its share of the golem it is part of — a body's
bar is its own body. `PartState.vitalityWeight` is the field that carries it, which is the escape
hatch the bout's weight table already had for a body whose keys it does not know.

**The substep is the locomotion contract's order with two ends.** `stepControlledPair` runs
`observe` on both bodies, then `beginControlStep`, then both drivers, then the paired carrier
resolution, then `afterLocomotion` — a new optional member on `ControlledBody` that a `Fighter`
does not implement. A golem refreshes its root velocity sample in `observe`, which is the first
call of the substep, and runs the gait, the substep close-out **and every upper module's `step`**
in `afterLocomotion`, which is the first moment the carrier has agreed where the golem is. Stepping
the arms before it would drive them at a shoulder the world had not yet placed.

## The wheel and the multileg, and what the locomotion contract had to carry

Session 06 put two more options into the locomotion slot. They were not built to fill a shelf:
they exist to answer whether the contract Session 05 landed carries a real difference in feel, or
whether every option through it is a biped with a different mesh. **The answer is the two
comparisons rather than either option's own numbers** — the shove the biped survives puts the
wheel down, and the shove that fells the biped leaves the multileg standing — and both arrive
through the `StabilityAuthority` a module publishes per boundary and through nothing else.
Mutation-proven: give the wheel the biped's brace and gait scale and the first comparison goes
red; take the multileg's brace away and the second does.

### Three bodies, one contract, and where the difference actually lives

| | biped | wheel | multileg |
| --- | ---: | ---: | ---: |
| module mass | 203.20 kg | 368.30 kg | 275.40 kg |
| socket stands / crouches to | 1.020 / 0.860 m | 1.160 / 1.160 | 0.640 / 0.640 |
| carrier speed, acceleration | 1.2 m/s, 4.0 m/s2 | 2.0, 6.5 | 0.8, 3.0 |
| carrier yaw | 1.6 rad/s | 2.6 | 0.7 |
| footprint radius | 0.34 m | 0.42 | 0.50 |
| brace capacity x standing gait scale | 1.5 x 1.00 | 1.0 x 0.70 | 2.6 x 1.00 |
| fall threshold, standing | 0.0210 m/s | 0.0098 | 0.0364 |
| ...in newton-seconds on the bench | 11.76 | 7.11 | 23.02 |
| support bindings | 2 soles | 1 tread | 6 pads |

**Nothing in `src/supported-locomotion*.ts` changed.** The contract was allowed to grow and did
not have to: `LocomotionHeightRange.crouchM === standM` was already what "this carrier does not
crouch" meant, `StabilityAuthority` already carried both multipliers, and the support-binding list
was already of any length. The one thing that did move is the *bench*: `buildGolemStand` takes the
module's own `heightRange.standM` as `socketHeight` instead of the frozen 1.02, because three
options stand at three heights and the height is the trade rather than a fixture detail.

### The wheel: a spin derived from the carrier, and what makes it a wheel rather than a skid

One `ANIMATED` yoke, one `DYNAMIC` cylinder under it on a free hinge, and a `VELOCITY` motor whose
target is `carrier speed / wheelRadius`. **The spin is derived from the carrier and never from the
wheel's own rotation**, which is the same no-feedback rule the biped's gait follows and for the
same recorded reason. The wheel is the only part of the golem that touches the world.

The reading that says whether it works is the **material velocity of the piece of tread against
the floor**, `v + omega x r` — not the wheel's own velocity, which is the carrier's speed whether
the thing rolls or is dragged. It is differenced from transforms rather than read across the
plugin boundary, so it costs nothing per substep.

Two decisions worth carrying forward. **A wheel cannot strafe**, so the module clamps
`localRight` to zero and publishes a strafe axis whose range is `0..0`: frozen rule 3, a command
clamped into the envelope before the carrier sees it, with no refusal branch anywhere. And **the
shell is not decoration on this one option** — a featureless disc turning about its own axis looks
exactly like a disc standing still, so the bronze spokes and rim cleats are what let a person
answer the gate's own question at all.

### The multileg: a tripod is the gait and the support proof at once

Six short legs on a low wide chassis, in two groups of three half a cycle apart — left-front,
left-rear and right-middle against the other three. Because an alternating tripod always has three
pads down, being mid-stride costs this body almost nothing where it costs a biped a foot, and that
is why its gait stability scale falls only to 0.90 against the biped's 0.75. The same field says
two different true things about two bodies.

**Foot contact does not prove a body is standing, and this is the body that bites hardest**,
because it always has something touching the floor. The posture claim is the same three signals
together — root-up, root-above-pads and stack-above-root — and the pad count sits beside them as
sensor evidence, never as a verdict.

**What the option costs is published rather than hidden.** The socket sits at 0.640 m against the
biped's 1.020, so an effector socket that a biped puts at 1.800 m lands at 1.420 and everything
above it moves with it; and the navigation footprint is 0.50 m against 0.34, so it stops further
from every wall and needs more room to pass another golem. Those are in `LOCOMOTION_MULTILEG`
beside the numbers that cause them, and `tests/golem-locomotion.test.mjs` asserts the arithmetic.

### One thing all three blocks now say, and it was not expected

**A threshold crossed and a body on the floor are different questions.** The state machine's
boundary is a decaying ledger in mass-independent units; whether a person sees a knockdown is mass
against base geometry, and the two are not the same size. The bench shove each module ships with
is 51x its own threshold for the biped, 104x for the multileg and 225x for the wheel — so each
module's `shoveImpulseNs` is chosen for the *drop* and its threshold is bracketed separately. A
multileg shoved at thirty-nine times its threshold is still standing at an up-dot of 0.95, because
a 0.80 m wide base 0.64 m tall is shunted rather than tipped.

## The central mind, which knows capabilities and not modules

*Session 09, 2026-09-04. Implemented; the human gate has not been asked.*

One scripted policy, `golem-duelist`, in `src/golem/tactics.ts` with its name and registration in
`src/golem/golem-policies.ts`. Frozen rule 9 says there is no learning in this work — three full
learned runs failed promotion under the construct experiment and the ladder never opened — so the
mind is a state machine, and if learning ever comes back it comes back as parameter tuning of this
machine rather than as a second kind of mind.

**Six stances, and half of them run to the end once started.** `GolemStance` is
`approach | measure | withdraw | chamber | commit | recover`. Range and opening decide the first
three; `chamber`, `commit` and `recover` test no range at all and hand over on their own clocks,
which is what stops a mind changing its mind at 240 Hz. `withdraw` returns before the chamber test,
so a golem backing out of its own reach cannot commit on the way. The one rate the file keeps
between steps about the world is the low-passed closing speed; everything else is recomputed.

**It reads module-declared capability and never a module id.** There is no chain name, no terminal
name and no switch on an id anywhere in it, and `EffectorCapability` carries no `id` field
precisely so that there cannot be. What the mind asks is `strokes.includes("thrust")` and the same
for `"cover"`, whether the published `reachable` shell has any swing width at all, and whether
`rollMax` and `bendMax` are above zero. A pinned yaw is a mace and the mind never learns the word.
**A new option on the shelf must need no new mind**, and that is the test of whether the module
contract was worth having.

**Every range is a fraction of a published reach, never a distance**, and the trap it avoids is
recorded rather than imagined: the Warrior duelist's `hold` is a constant "just inside the 1.45 m
the point of the blade reaches", and handed an axe the same policy stood a quarter of a metre
outside its own range and swung at the air — 31 blows against a sword's 398. **The inner radius
of the module's own reach shell is a floor on that fraction**, because a hold inside it is a
distance at which the arm is already past the mark — without the floor the default build held
1.39 m against an inner radius of 1.36 and churned in its own hysteresis band.

**It is not a servo.** The aim is a function of two published positions and the clock; it never
reads where the limb *got to* and steps the command toward it. That controller winds up and the
measurement is in `AGENTS.md`: 237 of 420 steps pinned against a stop with the hand 137 mm off its
own anchor. The one achieved value it does read, the trunk's twist, is used only as a coordinate
transform.

**The two seams that let one mind read three bodies.** Threat selection walks the opponent's two
hand records and skips a shield, which works against a Warrior, a Broot and another golem alike
because a golem fills `hands` with its own effector records rather than inventing a second list.
And the aim mark is a column over the opponent's ground position at their *published* shoulder
height, so a body on the floor brings the mark down and the crouch derives itself — there is no
`downed` branch.

**One golem policy, not two, and the omission is a decision.** `idle` in `src/mind.ts` already
stands a golem up with its cursor centred; `Policy.surface` is null for it because standing still
is a command any body executes, and every baseline figure was taken on it. A second idle under a
golem name would be two names for one behaviour and would split the control condition in half.
`Policy.surface` is also the whole of the gate, and it runs both ways: it keeps `swinger`,
`duelist`, `archer` and `crawler` out of a golem's picker and keeps `golem-duelist` out of a
Warrior's. The list in `src/mind.ts` *is* the registry the setup screen builds from, so a policy
that exists is selectable and a policy that is selectable exists.

## Body parts as loot

*Session 10, 2026-09-04. Implemented; the human gate has not been asked.*

The One Must Fall loop, closed at prototype scale: a module severed in a bout survives the verdict
as a thing, the winner keeps the ones that came off intact, and the next bout's setup offers them
as options to fit. Modding the unit replaces finding equipment.

### The loot rule, and the three existing facts it reads

**A severed module is loot if its socket joint broke and the module's own parts still have health
above zero. A module cut to pieces is debris.** No damage model was added for it; the rule reads
what was already true and `src/golem/parts-bin.ts` is where it is written down.

- **Which joint broke.** `Golem.sever` breaks a module's socket when a blow destroys a piece of it;
  `Golem.die` breaks the locomotion module's when the body stops being a golem. Only the first is a
  part coming off. The second is a stone body falling apart, and a pair of legs collected from every
  corpse would be a reward for winning rather than for cutting something off.
- **What was left of it at that instant.** `severs` in `src/scoring.ts` refuses to sever a piece
  whose health is still above zero, so **the struck piece is always at zero when the socket
  breaks** — which is why the rule cannot be read as "every part". It is read as *every part but
  the one the blow destroyed*: cut an arm off at the shoulder and the blade and forearm are still
  worth having; hack the same arm apart and two pieces are down, which is debris. That premise is
  asserted against `severs` itself in `tests/golem-loot.test.mjs` rather than assumed.
- **How worn it is.** The module's remaining health as a fraction of what it was built with, summed
  over its parts so a slab counts for more than a bearing.

The facts stop existing one line later — `sever` zeroes every part of the module on its way past —
so the snapshot is taken **inside `sever`, before the zeroing**, and `Golem.moduleReport` publishes
it. That accessor is the only one Session 10 added to `src/golem/golem.ts`, and it is one rather
than two because the same walk answers the other half: how worn a module still on the body is, which
is what a fitted bin entry has to carry back into the bin.

The loot unit is the whole module, chain and terminal together. **A terminal snapped off its chain
is not loot, because no weld has health yet** — there is no fact to read, and inventing one would be
the damage model this rule exists without. And the two effector slots are the only ones a module can
be salvaged from: a severed torso is a golem coming apart, and a bin entry no picker could fit would
be a stored field with no reader.

### The parts bin

Per browser, in `localStorage`, checksummed, as the construct library was: a list of module option
ids with their remaining durability and nothing else. It does **not** store a build, a matchup, a
shell, a part-by-part health record or which piece the blow found. There is no import and no export,
because losing it costs nothing that cannot be rebuilt by winning another bout.

The codec **refuses damaged data rather than substituting defaults** — the guided playtest's save
refused a stale record rather than repairing it, and a ternary chain with a default branch is not a
dispatch table. Every clause returns a sentence naming the field it refused; the screen shows that
sentence rather than reading a damaged bin as an empty one, which are two different states.
`localStorage` can throw and can come back empty, so every read and write is wrapped and the bin may
have no storage at all.

A **reset control** sits under both corners of the setup screen, because a prototype without one is
a prototype somebody has to clear from the console. It empties the bin and takes every salvage pick
off the screen with it; a socket naming an entry that is *gone* is refused by name instead, because
quietly rebuilding it new hands somebody a fresh module they did not earn.

### Wear is visible, and it never feeds anything

Remaining durability drives `PROCEDURAL_DAMAGE_WEAR_V1` on the module's shell through
`src/golem/wear.ts`, so a fitted second-hand blade looks second-hand and a module cracks as it is
hacked at. The binding is a plain record on a shell mesh's `metadata`, the plugin copies its
`healthRatio` into a uniform, and nothing in the game reads it back: presentation reads authority
and never feeds it.

**Two things were found by turning it on.** `GolemSurfaceBinding.healthRatio` had a reader and no
writer at all — nothing in the tree had ever written one. And the golem asked for `mapped-pbr`, so
the salvaged shader had never been compiled here; when it finally was, it failed to link, because
`GLSL_DEFINITIONS` declared two uniforms that the plugin's own `getUniforms` already declares. Both
are fixed. The lesson is the one this directory keeps paying for: `tsc`, the build and every
headless test passed with the shader unbuilt, because `NullEngine` has no standard derivatives and
the audit falls back before the shader is reached. It took looking at it in a browser.

### Written down as ideas rather than built

- **In-arena pickup.** No mid-bout pickup this session: the winner collects at the verdict, once.
  Picking a part up while the fight is on is a different game — it needs a reach test against a
  loose body, a socket that is empty rather than broken, and a decision about what happens to the
  module already in that socket. It is an idea, and this is where it is written down.
- **The shelf is free, so salvage is currently a pure loss.** A fitted module at 0.87 is the same
  module as a new one with 13 % of its life already spent, and it costs the whole body a slice of
  its vitality bar. Nothing in the prototype charges for a shelf part, so there is no reason to fit
  a salvaged one except to see it. The loop is *closed*; it is not yet a *game*, and what would make
  it one is scarcity on the shelf rather than any change to the rule above.
- **A refit is a uniform scale over the module's parts**, not a per-part record. The bin holds "one
  of these, this worn". A per-part save would be a body description format, which is exactly what
  the salvaged surface and material files were cut free of.
