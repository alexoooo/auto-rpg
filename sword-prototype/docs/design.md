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

### Learning stops at the same seam

The experiment deliberately chose a hierarchical controller before choosing a learning
algorithm. Havok has no cheap exact clone/restore seam, so combat-time look-ahead would have
to rebuild a scene for every branch. An end-to-end network would instead spend its first
experiment rediscovering the stable cut, cover, punch and shot geometry already expressed
through the player's controls. The first implemented compromise kept eight mutually
exclusive options. The current seam factorizes five movement choices from seven hand
actions, so closing or circling can compose with cover, cut, thrust, punch, shoot or bite --
and since session 17 the hand half also names the exact effector, the target region and the
body stance, which is tactic v2 below.
Scripted and learned controllers share those ordinary `Intent` producers and a bounded
persistence interval. Novelty descriptors cover range, guard, handedness and attack
transitions without granting the learner new authority.

The learned meta-controller does not produce poses. A frozen research artifact maps the
versioned 99-column v4 `FighterView` feature table to the tactic-v2 output contract: 26 numbers,
laid over the five frozen vocabularies by index -- 5 movement, 7 hand-action, 3 effector, 4 target,
6 stance and a bounded persistence interval. `META_OUTPUT_LAYOUT` in `learning/meta.ts` is the one
table that names those offsets and nothing infers one; before session 17 stage C1 the layout was
re-derived in five places, and one of them read the action block as "everything after the movements
except the last number", which is a wrong argmax over a correct vector the moment a second block
trails it. The columns include usable reach margin, facing and the current
factorized tactic, as v3 did, and session 16 added what a policy needs to tell an incoming
strike from a receding one: a nine-way one-hot over the selected threat's kind — arrows and
bites included — that threat's position and velocity in the observer's own right/up/forward
frame, its time to closest approach and closest miss distance, the opponent's posture, both
bodies' collision radius, crown and vital heights, and both bodies' bite reach, ready and
active. The misnamed single `time_since_damage` column became a pair, dealt and received,
derived from vitality deltas rather than from combat events. One function, `selectThreat`,
answers *what is worth answering* for the feature writer and the cover skills alike; there
were three divergent copies of that question and two of them drove motor execution, so a
policy could be guarding one blade while its perception watched another. It ranks a tip by
how fast it is going *and* how near its path takes it to the vitals, not by raw speed, and
the hand a scripted guard covers therefore moved -- measured, with the win rates either side
of it, in [measurements](measurements.md). Unsupported options
are masked before the argmax that chooses one -- `deployableActions` in `learning/meta.ts` is
the single copy of that mask, and `supportedActionIndices` in `learning/deployment.ts` is only
its projection onto the argmax's index space -- and the seam below it refuses an
unsupported action by name rather than substituting a legal one. The same rule extended to the
whole tuple in stage C2a: `deployableTactics` is `deployableActions` crossed with the effector and
target tables the executor itself refuses by, and `selectDeployableTactic` scores a tuple by the
**sum of its three logits over the legal tuples only**. Three independent argmaxes would name
`punch` on a sword hand or `low` on a punch, and there is nothing honest to do about that
afterwards -- refusing a decision the network meant, or repairing it into a tuple nobody chose,
which is the silent redirection tactic v2 exists to remove. Ties break on action index, then
effector, then target, and that order is walked rather than inherited from the legal set's
enumeration order: `tacticTargets("cover")` is `["threat", "vital"]`, so a scan of the legal set
would break a tie toward `threat`, which is the later name in the frozen table.
Reading a controller's diagnostic never runs it. A stale or wrong-feature artifact is refused by
the envelope before any network is built from its payload; there is no fallback that quietly turns
an experiment into `duelist`. The envelope refuses on the **output** vocabulary too: the header
carries `tacticVersion` and all five output name tables -- movement, action, effector, target,
stance, one per block of the contract -- beside `featureVersion` and the column
list, and the version comparison is written out by hand because `ResearchArtifact` rejects no
unknown key, so an artifact from before the header grew arrives with the field simply absent.
That comparison is `!==` rather than `!=` for a reason worth stating: `==` accepts a header whose
version is the right number written as a JSON *string*, which is precisely the hand-edited or
foreign artifact the gate exists for. The refused value is interpolated through `JSON.stringify`
so the sentence reads `tactic version "2" does not match runtime 2` rather than naming the same
number twice.

**"Single copy" was a claim about the runtime and was not true when it was written.** The mask
was spelled out three times -- in `deployment.ts`, `research-policy.ts` and `lookahead.ts` --
with the argmax reading the first and the *refusal* reading the second, which is precisely the
arrangement that masks one policy and executes another.

**Seven copies were found in the end, and the training side was the half that mattered**, since
a network trained under one legality table and deployed under another is being scored on a
controller nobody will run. The fourth was `research-rollout-worker.mjs`, which decodes every
NEAT and DAgger rollout; the fifth was inlined in `collectTacticalTrace`; the sixth and seventh
were in `train-ppo.mjs`, one of them for the league opponents and one -- **without even the
`cover` deletion the other kept** -- for the trajectory collector that PPO actually learns from.
All seven ask `deployableActions` now, or `supportedActionIndices`, which is that set projected
onto the argmax's index space.

**The "not even equivalent" charge against the fourth copy was investigated and is false.** It
tested `weapon === "sword"` for thrust where the runtime asks `hasPoint`, and an exclusion list
`!["empty","bow","shield","buckler"]` for cut where the runtime asks `isStriking && !== "empty"`
-- and over every kind a hand can hold those select the same sets, swept across all 49 ordered
weapon pairs rather than argued. They were still worth deleting, because a pointed spear is a
thrust the name test would refuse. Every *real* disagreement was the two-handed holder rule,
which neither rewrite knew about. The tables are in `docs/measurements.md`.

**Tactic v2: an action is not a decision until it says what performs it, at what, and how the
body stands.** Action v1 named an action and stopped, and three ambiguities rode on that
silence. A dual wielder could not ask for its off sword -- the option searched
`[preferred, other]` and answered with whichever hand could, so a request for the primary was
executed on the secondary and nothing said so. Every attack replayed one fixed aim at the
opponent's shoulder line. Crouch, lean and twist were animation welded to the action name.
Session 17 Stage B closed all three in the execution layer and Stage C2a widened the output
contract from thirteen values to twenty-six, so a learned controller can name what Stage B made
namable:

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
  the runtime mask now agrees with the training one**. That was one loadout of seven -- two of
  the thirteen cells, one on each humanoid unit -- and the traffic went the other way as well:
  `sword+empty` and `axe+empty` leave a genuinely free off hand, so there the *schedule* was
  wrong and it was corrected there. All seven loadouts agree as of stage C1. **What that
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

**Stage C2b is where the four trainers started writing and reading all of it**, and three
decisions in it are worth having here rather than only in a commit message.

The teacher's aim rule **varies only where a bout said varying it works**. `thrust` branches
three ways because a named region moves its head share 0.09 -> 0.48; `cut` and `punch` take the
constant `vital` with the measurement written beside them, because a named region on a stroke
does not point the arc, it drops it; `cover` answers `threat`, the one aim in the table that is
a moving point; `bite` has one legal region. The effector is **recovered** from the opportunity
row the teacher already chose for an attack, and for `cover` and `recover` -- which have no row,
because they are what a fighter does when there is nothing to attack -- it is the hand that
holds the better guard: a shield or buckler before a sword, axe or club, before a bare hand,
with hand order as the tie-break. The stance names a side -- `slip-left` away from a threat on
the local right, the same quantity as the `threat_local_right` feature column, pinned by a test
that builds the mirrored world at two facings rather than by reading the sign back.

The label histogram from a real run is in `docs/measurements.md`. Two things about it are worth
carrying here. **Its shares are one bout per cell at one budget with no seed replication**, and
they move with the budget -- `natural` is 15.7 % at 2400 solver steps and 39.2 % at 9600 -- so a
share quoted without its budget is a different number. And the effector head **was** a constant
`primary` for every humanoid decision: the record blamed `RESEARCH_STRATA` for putting no
striking weapon in the off hand, which is true for `cut` and was not the cause for `cover`. The
cover rule took the first legal hand, and hands come in a fixed order, so no schedule could have
changed it. `secondary` is 13.8 % now.

**PPO produces 25 of the 26 outputs, and that is a decision.** It gained effector, target and
stance heads and did not gain a persistence one: a learned persistence is a *continuous* action
with a different log-probability in the importance ratio, which is an algorithm change rather
than a contract change. PPO emits a label rather than a raw 26-vector, so the width contract
does not bind it; the artifact records `producedOutputs` 25 beside `contractOutputs` 26. Its
masks are **conditioned in contract order** rather than joint -- effector on the action just
sampled, aim on the same -- because a factorized policy's update has to be able to rebuild the
distribution each head was sampled from. NEAT-QD, which writes a raw vector and no
log-probabilities, takes the joint `selectDeployableTactic` sum instead, on both halves of its
decoder seam at once.

**The quality-diversity descriptor deliberately did not follow the widening.** Three outcome
measures at five bins is 125 cells; adding the chosen tuple would make it 9,000-10,500 against
10,240 genome evaluations at full budget, which is fewer than one elite per cell and stops it
being an archive. It is also an *outcome* descriptor and the tuple is an input to it.

The natural channel arrived with them, and it is the same argument one level down. A centipede
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

Loading a learned policy is deliberately separate from shipping one. Registration requires,
in `learning/tournament.ts`'s `assessTournamentCandidate`: held-out macro score above both the
scripted-meta and random-option controls; per cell, non-zero meaningful engagement, the five
engagement thresholds (opportunity-attack, attack-contact, near-range stall, first-attack p90,
symmetric time-cap) and a 15-point specialist bound; at least three non-recover actions each
holding 8% of decisions; and five safety flags -- finite/anatomical commands, capability
masking, no post-verdict action, no stuck action, and lifecycle. The first three full runs
failed that rule: the validation-selected network disengaged for 88% of decisions and won none
of its 120 held-out bouts. Consequently `POLICIES` has no `learned-v1` entry and no candidate
is bundled. This is the important direction of the boundary: evidence authorizes a picker
entry; the existence of bytes does not.

**Transition diversity was in that list and is not a gate.** `MIN_STRONGER_MOTIFS` -- "fewer
than two transition motifs are more common than scripted baseline" -- lived in `promotion.ts`,
which session 17 deleted with the controller it judged, and `tournament.ts` has no `motif` or
`transition` concept at all. Worth knowing before anyone rebuilds it: the one candidate ever
measured against that gate **passed** it, with six motifs ahead of scripted where two were
required, while failing seven other gates including option diversity and stuck-option safety.
A gate that only ever agreed with the verdict the other gates had already reached is not
evidence it worked.

**Session 17 deleted the machinery that ran that first experiment**, and the deletion is the
point rather than a loss. There were two action vocabularies, two checkpoint formats and two
promotion gates in the tree at once: the standalone `checkpoint.ts` codec, its trainer and its
`promotion.ts` thresholds served one superseded controller, while the four research directions
run entirely through `ResearchArtifact` and the blind tournament in `learning/tournament.ts`.
The old trainer had in fact never produced a loadable checkpoint at all -- it wrote an
eight-name option table into a codec that required twelve -- which is what a second vocabulary
kept "for compatibility" buys. Everything that experiment measured is in
[measurements](measurements.md) under "Session 17 Stage A"; the thresholds it failed now live
beside the tournament that will ask them next.

Innovation allocation, mutation, crossover, speciation and evaluation are all seeded. Work
items carry their genome index through a bounded worker pool and are sorted before selection,
so worker completion order cannot become evolutionary state. Run state is written atomically
and resumes only when feature, action and training-config versions agree. The trainer remains
outside runtime inference; a browser can validate and run a frozen network without importing
the population machinery that created it.

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
exported family disagrees with `costumePieces()` or whose embedded material competes with
the runtime palette.

Steel, neutral cloth, brown leather and subtle skin detail now have separate
albedo/normal/ORM families. The side colour is one per-Figure material derived from neutral cloth:
crimson and blue own only their tint while all texture objects remain palette-shared, and
`Figure.dispose()` releases the material on a bout rebuild. The visible art-direction verdict
is intentionally not inferred from the headless checks. The first default-zoom Fixed and
Overhead comparison kept the four material families, team colours, open faces and waist join
readable; the still-open zoom and motion judgements live only in `docs/measurements.md`.

The final armour silhouette is adapted rather than invented entirely from primitives.
`asset-src/armour-sources.json` pins Quaternius's CC0 Animated Knight Pack archive, license,
retrieval date and the three selected OBJ sources. `npm run armour:verify` checks the archive
digest and selected files before `asset-src/build_warrior.py` splits breastplate, helmet and
shoulder geometry at the existing rigid costume-piece boundaries. Its armature, animation,
weapons and source materials are discarded; the adapted meshes inherit the runtime palette
and remain render-only. This preserves severability and the cosmetics/no-authority contract
without pretending the imported character rig is the simulated one.

Imported tangent xyz is negated once when `Figure.wear()` replaces a primitive's
vertices, normalizing the glTF right-handed frame to the same Babylon-LH basis the fallback
primitive used. Every authored island is area-normalized to 0.300 UV units per metre before
the family-level texture repeat is applied; the asset checker measures that ratio from the
exported triangles and UVs rather than trusting Blender source comments.

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

## The house rules this work was done under

The full list is in `AGENTS.md`. The three that shaped the code rather than the process:

- **Cosmetics never carry authority.** `figure.ts` owns no collision and decides no hit.
- **The overlay creates nothing.** Pinned by `__sword.rigview.audit()`, not asserted in a
  comment.
- **No feel complaint is fixed by raising a motor ceiling without a measured before/after
  table beside the number in `config.ts`.** Every number in the `arm` block was set that
  way and each one carries its table.
