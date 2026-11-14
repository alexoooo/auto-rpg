# Many skills, faster

Notes on making a skill cheap enough that dozens of them are practical. They hold four parts,
each of which stands alone and is taken up on the owner's request by a brief of its own. A part
describes a design under consideration; nothing in it is built.

## Goal

- **A new variation of a skill takes days.** A fight needs dozens of skills, and one good strike
  on one body takes weeks.
- **Footwork and balance are a concern of their own.** A skill uses them and does not learn them
  again.
- **A variation shares as much or as little as it chooses.** Sharing code is a matter of style.
  The structure never decides it: a variation's code, record, network and what it needs of the
  body are its own to declare.
- **Approaches are developed side by side** and read against each other on the same cases.
- **A change rebuilds only what depends on it.**

## Why a skill is slow

- **A strike solves three problems together**: staying up, making the motion and landing it.
  - The straight punch never drives a leg muscle, and it is still tied to the stance. Its network
    reads 20 leg-joint angles and speeds among its 59 inputs, and four of its 12 outputs ask the
    stance: a heading turn, the centre of mass ahead and across, and whether the walk goes on
    (`assets/skills/strikes/straight-punch/drive.layout.json`, `stanceAsks` and `keepsWalk` in
    `src/skills/strikes/shared/steer.ts`).
  - It sets the legs goal from its stand to its return, and begins only once the stance has
    stood quiet (`straightDriveExecutor`, `quietToStrike` in `shared/strike-window.ts`).
  - The bonk steps each foot to a searched place before its windup (`Swing.footing`,
    `shared/swing.ts`); those steps are most of its time
    ([the approaches](../approaches.md#weapon-strikes)).
- **Each skill is searched and trained on each body**: a CMA-ES search, then 20 to 50 M decisions
  of PPO ([the approaches](../approaches.md#every-skill)).
- **A change under a trained actor makes it a seed to retrain**: the body, the stance, the
  observation layout ([the training recipe](../recipes/training.md#before-the-first-run)). An
  actor that reads the legs is under every change to the legs.
- **The fight is read last**, and it holds the facts that shape a skill: the states a blow is
  committed from, how often the mind begins it, where fighters stand. The punch's fight
  commitments each hold an input outside every range its drill plays
  ([the punch's notes](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)),
  and the mind begins few punches in `fights`
  ([the same notes](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)).

## Part 1: variations that stand alone

**Where it stands.** A variation's maker returns any executor (`ExecutorVariations`,
`src/skills/framework/variations.ts`), and a variation imports only its own folder and the area's
shared code (`scripts/source-boundary.mjs`). A character holds several variations of one skill,
each an Option of its own, and an evaluation's subject names them
(`option/straight-punch+straight-punch/from-guard`).

What ties variations together is on the skill's part, declared once for all of them
(`PUNCH_PART`, `src/skills/strikes/straight-punch/index.ts`):

| Declared per skill | Where | What it ties |
| --- | --- | --- |
| The record | `reads`, `dataOf("straight-punch/drive")` | one file of settings and one network |
| The layout | `PUNCH_LAYOUT` | one set of network inputs and outputs |
| The settings' shape | `tuning`, `STRAIGHT_DRIVE_KEYS` | one shape a search can vary |
| The fit | `recordFault` over `PUNCH_BODIES` | a body holds a variation only with the drive's record |
| What it needs of the body | `requires`, `effectors`, `strikesWith` | one support reference, one set of limbs |

`from-guard` shows it. Its own code is one readiness rule (`from-guard/from-guard.ts`); it runs
the drive's executor on the drive's record and network. Adding it moves no case of `drive`, and
any change to the drive's record, network or executor moves `from-guard`.

Whether a variation calls shared code or keeps its own is its author's choice
([the skill recipe](../recipes/skill.md#an-options-code)). The five rows above are shared
whatever a variation chooses.

**The design.** Each of the five rows is declared by the variation. A variation may name
another's record or layout, and then it shares it by choice. The research tools that write a
record take the variation they write (`punch-export.mjs` writes the drive's;
`punch-sparring.mjs` takes `--variation`).

**Open.**

- Whether a variation has a row of [the table](../reference/the-table.md) or is read as a subject
  against its skill's row.

## Part 2: a layer under the skills

**Where it stands.** The control layer holds the pieces ([motor
control](../architecture.md#motor-control)): the stance (`stance-balance.ts`), the whole-body
solve (`solve.ts`) and the assist (`assist.ts`), a root force and moment metered against the
character's Balance. The Warrior's and the Rogue's Balance is 0
(`src/core/bodies/human/attributes.ts`), and a bout's recipe sets each side's
(`DuelRecipe.balance`).

The layer carries out what each skill asks step by step (`LegsGoal`, `StanceGoal`) and reacts to
a blow's push only once the body moves. So a strike's network learns to place the centre of mass
before the blow, and each strike learns it again.

Balance and motor each have one registered kind (`BALANCES`, `MOTORS`,
`src/app/registration/`). They are slots of a mind's config, so a skill's variation chooses
neither.

**The design: a contract with more than one implementation.**

- **Down, from the skill**: the limbs it takes; what it wants of the pelvis (a turn, a drive
  forward); and the push it is about to make, declared before it makes it. A timed push schedule
  is known ahead, so its reaction is measured once and kept as a small table per variation and
  body.
- **Up, to the skill**: whether the layer can brace this now and how soon if not, and the
  shoulder's frame and velocity. No leg joint.
- **Inside the layer**: whether to lean, widen, step, keep walking or ask the assist.

Three implementations, each a balance kind behind the same contract and so playable side by side:

| Kind | What it is | Its cost |
| --- | --- | --- |
| Assisted | the stance with the assist's ceiling raised | the least work; a skill tuned with an assist is read again without it before it is called unassisted |
| Feed-forward | the stance reads the declared push and leans before it | balance engineering of the kind the approaches record falling short |
| Learned base | one actor over the stance, trained once against random pushes on the upper body, following pelvis commands | one training run of the learned run's size, shared by every strike |

Provenance: forces at the root added to a controller's actions (Yuan & Kitani, "Residual Force
Control for Agile Human Behavior Imitation and Extended Motion Synthesis", NeurIPS 2020); legs
that follow a commanded velocity under whatever the upper body does (Cheng et al., "Expressive
Whole-Body Control for Humanoid Robots", RSS 2024).

**What it would bring.** A strike's network stops reading the legs, so a change to the stance or
the legs leaves it valid. A new strike is braced without learning to be. A strike that leaves the
legs alone runs beside a walk: the mind runs together Options whose resources do not overlap
([Option Mind](../architecture.md#minds)).

**Where the separation stops.**

- A blow's worth is the mass behind the fist, so a strike still asks for a hip turn and a drive.
  That is why the pelvis stays in the contract.
- The stomp, a kick and a way up take the legs themselves, as the ground skills do.
- A change to how the stance answers an existing ask moves every trained actor on it. A new
  optional ask that no installed variation sends moves none, which the fingerprint shows.

**Open.**

- Whether skills are built with an assist first, the unassisted skill a later tier. The roadmap's
  order is competencies first, without assistance
  ([where the project is going](../roadmap.md#where-the-project-is-going)).
- How much of the punch's learning is in its stance outputs. Unmeasured; read by zeroing those
  four outputs of the installed network on the Strike drill.
- The declared push's form, and the learned base's commands.

## Part 3: the pipeline

**Where it stands.** A skill is searched and trained on its drill's twin, its profile is measured
sparring, and it is read in fights last ([the steps](../recipes/skill.md#the-steps)).

- **Sparring forces the blow** from drawn starts at a foe that fights back, so a profile does not
  wait on the mind choosing the strike. Its starts are drawn from set ranges of gap, offset,
  approach, speed and time (`SPARRING`, `src/evaluation/strike/cases.ts`), not from states a fight
  reaches. A subject's 720 trials play in a few minutes:
  `npm run evaluate -- strike option/straight-punch --protocol sparring --workers 30`.
- **The `fights` rung** plays a bout from its start for each trial, until the mind begins its
  `moment`th action aimed at a body (`FIGHTS`). A moment is one the mind chose to act at.
- **A save loads on its own commit alone.** `Duel.load` requires the save's build
  (`requireRecordingIdentity`, `src/core/world/recording.ts`), which is the commit checked out,
  and a mark made anew each run where a build input is uncommitted (`currentBuildIdentity`,
  `scripts/build-identity.mjs`). A tape replayed step for step needs that; a state to start a
  trial from does not.
- **Steps 2 to 4 of the skill recipe describe one way of making a skill**: a push schedule, a
  CMA-ES search, a learned actor correcting it.

**The design.**

- **A stand-in first.** A crude variation, made by hand or assisted, plays in fights before any
  training. Its fights say where and in what state the mind commits it and how often: what the
  skill is to be built for.
- **A library of fight states.** A set of bouts is played once and saved at intervals wherever
  the foe is within reach and a margin, whatever the mind is doing. A trial loads a state, forces
  the strike and plays two or three seconds. It costs a drill's trial and starts where fights
  are. A profile is a table of outcomes by start, so it needs the starts fights visit covered,
  not their frequencies.
- **Readings with no physics.** Each state loaded and the strike's entry asked gives the share of
  fight moments the strike can begin from. The chooser asked there gives whether the mind would
  pick it under a new profile.
- **A library keyed by what it depends on.** A state is unusable after a change to the body, the
  engine, the rate or command delay, or the bout's recipe: the changes that void a trained actor
  as well. It survives a change to a strike's code, settings or network, the mind's pricing and
  an evaluation's code. The key is a hash of those dependencies; `implementationOf`
  (`scripts/build-identity.mjs`) hashes every file a set of modules imports.
- **Physics saved, memory rebuilt.** A load restores the bodies and starts the minds and skills
  fresh, as when a body comes back from another mind. A change to a field of saved memory then
  costs nothing. States are saved with both feet bearing and no action under way, since a stance
  loaded mid-step loses its plan.
- **The recipe names the gates, and a variation its method.** A variation runs as an executor and
  has a sparring reading; how it was made is its own.

**The same keying elsewhere.** Played evaluation rows are kept under their commit and found again
on that commit alone (`.tmp/evaluations/<id>/<commit>/`). A technique's profile is keyed by its
body's whole record, so one loadout's settings changed leave every loadout of that body without
its profile ([the recipe's traps](../recipes/skill.md#traps)). Each keyed by the files and data it
reads would be replayed less often, and trusted on that hash in place of the whole commit.

**Open.**

- How much a physics-only load disturbs the first moments after it. Unmeasured.
- Whether one sparring run gives the skill's reading as well as its profile. The claim is a
  still-target cell so that how a body throws a move is read apart from what the move brings in a
  fight ([the claim](../recipes/skill.md#the-claim)).
- Whether a result is trusted on the hash of what it read.

## Other candidates

Each is an idea, untested here.

- **One aimed strike for several narrow ones**: a strike takes its target point as an input
  (distance, height, side). Its Option is unchanged and its profile gains those dimensions. The
  learned punch's window is suspected of lying off where fighters stand
  ([the approaches](../approaches.md#unarmed-strikes)).
- **A strike as a clip under a learned tracker**, as the run is
  ([the approaches](../approaches.md#travel)). A network rewarded for matching a clip leads it,
  where a tracking controller lags (Peng et al., "DeepMimic: Example-Guided Deep Reinforcement
  Learning of Physics-Based Character Skills", SIGGRAPH 2018). Its cost is still tens of millions
  of decisions a clip.
- **Weapons before fists**: a fist is a light mass on a short lever, and the club's blows came
  more readily than the punch.
- **More decisions a second**: many bodies simulated at once on a graphics processor. Rapier in
  Node does not do it, and another engine voids every record on every body.

## How the parts depend

- Part 1 stands alone. A variation with a network of its own waits on it.
- Part 2's contract comes before a second balance kind is compared with the stance. The assisted
  kind tests the contract's form at the least cost.
- Part 3's library stands alone and waits on a save keyed by its dependencies.

## To pick it up

- **Variations**: `src/skills/framework/variations.ts`; a skill's part, as
  `src/skills/strikes/straight-punch/index.ts`; its records `straight-punch/data/`; the boundary
  `scripts/source-boundary.mjs`; a variation read against another,
  `research/skills/strikes/straight-punch/punch-sparring.mjs`.
- **The layer**: `src/control/` (`stance/`, `solve.ts`, `bearing.ts`, `balance-part.ts`,
  `motor-part.ts`); the assist `src/core/bodies/assist.ts` and its ceiling
  `src/combat/rulebook.ts`; what a strike asks of the legs, `LegsGoal` in
  `src/skills/framework/skill.ts` and `shared/steer.ts`; the registrations
  `src/app/registration/balances.ts` and `motors.ts`.
- **The pipeline**: the Strike drill's rungs `src/evaluation/strike/cases.ts`; saving and loading
  `src/game/arena/duel.ts` and `src/core/world/recording.ts`; the build's identity
  `scripts/build-identity.mjs`; the profiles `research/skills/strikes/strike-profiles.mjs`.

## Completion

A part that lands puts what worked into the recipe for its kind of work and what it changed into
the architecture. These notes are deleted once every part has landed or been dropped.
