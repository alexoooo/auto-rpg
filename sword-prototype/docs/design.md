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
comment and a passing unit test, **never ran in an actual fight**. A second copy of a rule in
a caller is the same defect as a missing row, and it is harder to see because nothing about
it looks like a table.

**The answer is two tables and no comparisons.** `hands.ts` holds `GRIPS`, one row per kind,
which is the *shape* of the thing: how many hands, how it is carried, what it is for, whether
it has a point, whether it cuts on both sides of its edge axis. `scoring.ts` holds `BITE`,
which is what a blow with it is *worth*: a floor, a scale and a sever bar, each as an
accessor on the tuning so that the tuning stays a parameter. Both are `Record<..., ...>` over
the union, so a kind without a row does not compile, and every predicate above them is a
field read. Adding the axe turned four of the six holes into `tsc` errors in one run.

`Striker` stopped being a hand-maintained copy of `WeaponKind` and became an alias of it.
`scoring.ts` restated the union because `weapon.ts` imports Babylon and the whole value of
that module is that it does not -- but `hands.ts` imports **nothing at all**, so the copy had
no job left.

**An axe is a sword's row with one number changed, plus two facts about its shape.** It hits
harder (`chopScale`), and that is the only thing in the damage table that differs. What it
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

**The first two rungs of the chain ladder exist and neither is accepted.** Rung 0 (`none`) is a
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
**mace** that claims both effector sockets, and a **whip** that is a chain of bodies. A terminal is
a body, a weld, a striker, a layer and a shell, and if a terminal file ever reads `HandIntent` the
chain/terminal factoring has leaked.

**A terminal may narrow the chain that carries it, and that is the one thing it decides about
control.** `EffectorTerminalDefinition.limits` is a total record of nullable numbers — the
reachable shell plus the wrist's two — and a chain applies each as a *tightening* against its own,
so a terminal can never grant reach it does not have. Null is "this terminal takes nothing from
this axis", said once rather than by transcribing the chain's constants. Nothing about it is a
refusal branch: the chain clamps into the narrowed shell before the anchor is ever handed a target,
which is frozen rule 3 with a second author. A mace pins the yaw, the roll and the bend and keeps
the lift and reach; a plate gives up two thirds of the wrist's flexion and keeps everything else; a
whip gives up 0.40 rad of elevation and keeps the roll it needs.

**The two-socket seam is `ModuleBuild.companion` and `BuiltChain.unmotorise`, and neither is a
control channel.** `effectorModule` builds the driven chain in `ctx.socket` with the terminal's
limits, builds a second chain of the same definition in `ctx.companion` with none, calls
`unmotorise` on it, and hands both welds to the terminal. The trailing chain is stepped and never
commanded: stepping keeps its own joint motors' ceilings written, and commanding it would be the
second motor. `unmotorise` is not `sever` — every joint and every stop stays, and rung 3's wrist
pair stays on at its zero targets, because a wrist left free would add two unconstrained axes to a
loop that three grip constraints already determine exactly.

The refusals are refusals rather than fallbacks and there are four: a chain that carries its own
terminal cannot be given one, a chain that hands out a weld must be given one, a two-socket
terminal must be given a second socket that is not the first, and a terminal must offer at least
one striker. A mace that quietly built a one-handed bar would be the shield-that-shipped-as-a-club
failure with the sockets swapped.

**`BuiltTerminal.strikers` is a list now, business end first.** A whip's bite is its last three
beads: one that scored only with the final capsule would mostly miss, and one that scored with all
six would bruise with its own handle. The first entry is where the tip and the edge are read from,
so a rigid terminal's one-entry list is the old contract unchanged.

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

**A mace is a closed kinematic loop, and its grip separation is measured rather than configured.**
Both chains are built in the same pose mirrored by their sockets' own `outboard`, so the two weld
points are exactly the socket separation apart and the bar is built to span whatever they are — a
grip that did not coincide with its weld at construction would be a constraint born violated, which
is the violation the solver clears by flinging the thing. It is also the one terminal that composes
its own mount rather than taking the chain's: a bar runs *across* from grip to grip where every
other terminal runs *along* the limb, and that frame offset is the terminal's to declare.

**A whip is physics rather than control.** No lash controller, no per-segment target, no stroke of
its own; the first bead is welded so `roll` is which way the lash starts, and the rest are on
limited spherical joints so the chain cannot fold through itself. It is offered on the wrist chain
alone, because without a roll axis a lash has no start.

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
question this session states rather than settles.
