# A better punch

The one plan: what the better punch is, when it is done, and the stages that get there in order.
Each stage ends in something the owner can see in the game or in a stop with a report; none ends
in a number about the installed punch.

## The goal, in the owner's words

> my goal is to increase development velocity, to build a better punch.
> we identified these obstactles:
> - skills were keyed incorrectly, which resulted in needless repeated re-calculations
> - skills were coupled to the legs, which meant re-learning leg control repeatedly
> - the punch in a fight mostly just waited, it didn't actually punch much
> - the braced walk is not particularly effective
>
> we determined these potential resolutions:
> - skills should be keyed by that changes them, and always fall back to existing stale entries
>   instead of re-calculating (i.e. re-calculate only on request or when absolutely necessary)
> - new punch should be decoupled from the legs, sending them indirect commands, to avoid
>   re-learning legs for a strike
> - train the new punch to be thrown in (indirect) coordination with the legs, to punch while
>   moving (like a human) instead of wasting time on steadying

> i don't have any constraints on the punch reading the legs, i just don't want to have to
> repeatedly re-train footwork as part of every skill -- we will have dozens of skills and i
> want to increase development velocity (right now we've spent weeks and don't even have 1 good
> strike yet).

> what i want is a comprehensive plan that you will follow to create a better punch -- if the
> output is just another broken punch, then that would be another failure.

Said of the punch before: a separate punch "to be able to see v1 vs v2 in a fight"; and of the
installed one, "it kind of looked like dive jumping into the punch but in a very clumsy way
which didn't look like a serious punch".

## What the better punch is

The straight punch's `moving` variation (`src/skills/strikes/straight-punch/moving/`), made a
punch of its own:

- **Its own motion**: a schedule of timed pushes of the trunk and the striking arm, and a rule
  for when it fires against the step under it, both in its own folder and its own record
  (`straight-punch/moving`). Today it has neither: it is 12 lines that set two settings over the
  installed punch's record and network.
- **Its own steer**: a network trained on blows thrown while the legs walk, with a layout of its
  own.
- **No legs**: it claims the hand and the trunk. Whatever Option claims the legs walks them. It
  sends the walk a site (`Spot`: where to go and which way to face) and reads the body's state,
  the gait's phase included. It never pushes a leg and gives the stance no goal.

It is **done** when all four hold, on the Warrior first:

1. **In bouts** between a Warrior holding `moving` and one holding the installed punch, each on
   each side, it begins more punches, lands more, and takes more life than it gives up, each
   beyond the spread of one side read twice, with no more falls. Reported as counts first:
   begun, thrown with the legs walking, landed, missed, guarded, fell; then the weight behind
   the fist (kg), the energy on the mark (J) and the life taken (hp).
2. **Its landed blows are no lighter** than the installed punch's on the same body (the kg its
   fist meets on its own side, the J on the mark).
3. **The owner watches it** in the Arena beside the installed punch and says it is a punch.
4. **The Warrior holds it in the game**, its profiles measured from its own sparring.

The bar is this plan's, not the owner's words: the owner's word changes it.

## Why the tries before this failed, and what this plan does about each

| What went wrong (12 to 15 Nov) | What this plan does |
| --- | --- |
| The motion was never changed. Each request became a measurement or a re-fit of the installed punch (its settings searched, its network retrained, its steer searched), and that was called the new punch | Work on the punch is a change to `moving/` or to `moving`'s record. A report that names neither says the punch was not worked on. Nothing in this plan re-fits or re-measures `drive`: its readings are saved and found |
| The design was the limit and was treated as a tuning problem: three re-fits read level (1.08, 0.95, and one stopped unjudged) | Stage 3 reads what the body can do with this design before anything is searched or trained, and stops the work if the design cannot be heavy |
| Every blow was trained and read on legs that stand. The Strike drill's order to strike is an order to stand, on every rung | Stage 2 adds the case the game needs: a blow ordered while the walk goes on. The search, the training and the bar all play it |
| Results were ratios against the installed punch, so "level with a punch that mostly misses" read as fine | Counts come first, in the game's own units. The comparison is the bout the owner asked to see, v1 against v2 |
| Each failure produced tooling instead of a look at the blow | Stage 1 is looking, with no code. Tooling is built only where a stage names it as what blocks that stage |
| Long runs were started on the agent's own plan | A run over half an hour starts on the owner's word for that run, given its price and what will be different in the game when it ends |
| A failed try was followed by a wider try of the same kind | Each stage has a gate. A gate that fails stops the work with a report of what was read; the next step is then the owner's |

## What is known

Each with the command that reads it again. None of these is played again by this plan.

**The installed punch (`drive`)**

- **It waits, then dives.** It begins only from a quiet stance and halts the walk (`poised`,
  `halts`), then turns the hips 0.6 rad through the stance and pushes the hips, knees and ankles
  on a schedule beside the trunk and the arm (`assets/skills/strikes/straight-punch/drive.json`).
  The weight behind its fist comes from those.
- **At a target that stands it is a punch**: on the mark in 78 of 96, the fist at 6.94 m/s (a
  person's rear hand 6.8) (`npm run evaluate -- table --body man --skill punch`).
- **In fights it is not.** Of 144 `fights` trials 132 never reach their moment and 2 land. Over
  1,869 kept fight moments it lands 375, misses 752, meets the guard 370, never gets into its
  window 213 and falls 68. Every failed commitment read holds inputs outside every range its
  training played (`punch-sparring.mjs --commitments`).
- **Its schedule alone lands 20 of 240 sparring where the network with it lands 105**: the
  steer does most of the landing, so a new schedule needs a steer trained on it.
- **Fighters stand about 0.6 m apart, inside its 0.89 to 1.01 m window**
  ([the skill recipe](../recipes/skill.md#5-widen-and-confirm), *suspected*).

**`moving` as it stands**

- **The installed record and network with the legs let go**: no hip turn, no wait for a quiet
  stance, none of the schedule's leg pushes (`StraightDriveOptions.leavesLegs`,
  `src/skills/strikes/shared/straight-drive.ts`). The network was trained standing with all of
  those.
- **It begins sooner and hits like a tap.** On the walk rung, asked still walking, it lands 83
  of 96 where the drive lands 70, a median 0.23 s to the mark against 1.59, the fist as fast
  (7.1 m/s) with 1.4 kg behind it against 4.5
  (`npm run evaluate -- strike option-drill/straight-punch option-drill/straight-punch+straight-punch/moving --protocol walk`).
  Sparring on three bodies, 0.454 of 720 land, 0.806 are admitted, 0.008 fall, a median 0.38 kg
  behind the fist and 4.0 J on the mark
  (`npm run evaluate -- strike option/straight-punch+straight-punch/moving --protocol sparring`).
- **It has never been read under a walk or in a bout**, and no character holds it.

**The legs and the Mind**

- **Only the Option that claims the legs commands them.** A walk is an Option that claims the
  legs, one for each gait (`walkBy`, `src/minds/option/places.ts`); following orders claims
  them too (`src/minds/option/orders.ts`). A blow that claims none is thrown beside it, and its
  Option keeps its site while its blow is live, so the walk goes on to it (`onTheWay`,
  `src/minds/option/strike.ts`).
- **A drill's order to strike stands the legs** (`strike`, `src/minds/command/drill.ts`: its
  move is null), and every rung of the Strike drill throws its blow on that order, sparring
  and the fights' moments included (`src/evaluation/strike/cases.ts`).
- **Two gaits walk short steps**: the braced walk (335 of 480 short steps arrive, a median
  2.4 s) and the footwork (427 of 480, 2.0 s)
  (`npm run evaluate -- locomotion option option+stance-walk/footwork --protocol step`). No
  character holds the footwork, and it is priced by the braced walk's envelope.

**What has made a strike here** ([the skill recipe](../recipes/skill.md#the-steps),
[the approaches](../approaches.md#weapon-strikes))

- **Timed pushes, searched, then one trained actor correcting them**, 20 to 50 M decisions,
  from a controller that already succeeds on some held-out cases. A controller that succeeds on
  none stays flat under training.
- **A controller that tracks a path cannot throw a blow at a person's speed** (4 to 6 m/s
  against 6.8), and a blow driven so carries a tenth of a swing's energy.
- **A strike scored on energy alone yields a motion the owner rejects**: the score holds the
  form from the first search.

**What a try costs**

- **A training run steps about 0.8 M decisions an hour** (240 a second), so 20 M is about a
  day. The steered stroke is about a fifteenth of what a run computes: the rest is the walk in,
  the play on after the stroke, the foe's mind and the learner's update. One reading on 15 Nov
  had 32 workers no faster than 16.
- **A sparring reading of 720 trials plays in about 200 s** on 30 workers; a candidate beside
  the installed punch on 240 held-out starts in under 80 s and on 2,400 in about 480 s
  (`research/skills/strikes/straight-punch/punch-sparring.mjs --bar`).
- **A new variation's record plays every case of its body whose mind names the skill once
  more**, the other variations' among them: a case's key covers every record its mind's tree
  names (`treeData`, `loadsOf`, `variationReads`).
- **A kept fight start is refused for a striker holding another variation**
  (`DuelRecipe.skills`), so `moving`'s fights are played whole once (about 7 s a trial) and
  kept from then (`research/starts.mjs`).
- **The tools write the installed punch's record**: the exporter's default
  (`punch-export.mjs`), the registration (`straight-punch/data/registration.ts`), the
  trainer's mind (`presetMind`, `research/case-learning-environment.mjs`), and
  `punch-sparring.mjs` on the fights' rungs.

## Where the weight can come from

The installed punch gets its weight from the legs. `moving` may not push them, so its weight has
to come from somewhere else, and which of these carries it is not known. Stage 3 reads them in
this order and keeps the first that is enough:

1. **The trunk turned above the pelvis and the arm lined up behind the fist**, pushed flat out
   on a schedule. Wholly the punch's own.
2. **The step**: the fist arriving as the lead foot lands, so the blow meets the body's motion
   and a leg that bears. Read up from the gait's phase; the punch decides only when it fires.
3. **The site's facing**: the punch's site asks the walk to carry the striking side back before
   the blow, so the trunk has further to turn. An indirect command any gait carries out.

If none reaches the installed punch's weight, the punch cannot be heavy without the legs
driving it, and the work stops there for the owner. The way through that keeps the legs apart
is a gait of its own that steps in (trained once, used by every strike), which is a decision
and a piece of work of its own.

## The stages

In order. A stage's output is the next one's input.

### 1. Look

No code in `src/`.

- **Bouts**: a Warrior holding `moving` against one holding the installed punch, each on each
  side, on the braced walk and on the footwork (`npm run match`, the subject
  `option+straight-punch/moving`; the lifecycles and contacts read by
  `research/skills/strikes/strike-bouts.mjs`).
- **Read**, for each punch: begun a minute; of those, thrown with a foot swinging or the centre
  moving; landed, missed, guarded, fell; kg and J; the range the fighters stand at and where
  that falls in its window.
- **Watch**: the same bout in the Arena, stepped through its blows. Written down in the body's
  terms: what the trunk does, whether the arm is lined up at contact, where the body is going
  when the fist arrives.
- **Output**: the counts in [where the work stands](#where-the-work-stands), and a link the
  owner opens to watch the same bout.
- **What it can change**: if the Mind seldom begins `moving`, its window and its pricing come
  before its motion, as the first part of stage 4. If its blows are all thrown on stood legs,
  how the Mind runs the walk beside the blow comes before stage 2.
- **Cost**: minutes.

### 2. A blow under a walk can be read

- **The Strike drill gets a rung whose order to strike keeps its move**
  (`DrillCommanderConfig`, `src/minds/command/drill.ts`; `src/evaluation/strike/cases.ts`): the
  striker walks at a pace toward and past a place in its window and is ordered to strike the
  first step it is ready, the walk going on under the blow. At a target that stands, and at one
  that steps in and out. With a training twin and draws of its own, the rung itself held out
  ([research scores on its drill](../recipes/skill.md#an-options-code)).
- **Checks**: the fingerprint moves no existing case; a punch that claims the legs is read on
  it once, as the baseline, and that row is saved.
- **Output**: `moving` as it stands read on the rung beside the installed punch, counts first.
- **Gate**: the rung throws blows while a foot swings. If it cannot (the walk stops for every
  blow whatever the order), the stop is in the Mind or the gait and is found before going on.

### 3. What the body can do

[The recipe's second step](../recipes/skill.md#2-what-the-body-can-do), on stage 2's twin.

- **The trunk's and the arm's channels pushed free of any schedule, the legs left to the walk**
  (`punch-drill.mjs --free --without <the legs' channels>`, taught to take the variation),
  scored on the strike's value. Then the two further sources in
  [where the weight can come from](#where-the-weight-can-come-from), each one search, only if
  the one before falls short.
- **Read**: the best blow's fist speed, kg, J and landings, beside the installed punch's on the
  same cases.
- **Gate**: a blow no lighter than the installed punch's is reachable. Then stage 4. If not,
  the work stops with the three ceilings reported, and the owner chooses: a lighter punch that
  lands more, or the step-in gait.
- **Cost**: priced from its first generation; over half an hour, on the owner's word.

### 4. The motion

[The recipe's third step](../recipes/skill.md#3-a-native-controller-that-succeeds-on-some-cases).

- **First, a new record costs nothing old**: a case's key covers only the variation its body
  holds, so `moving`'s record plays no case of `drive`'s again. Checked by asking for `drive`'s
  rows after the record is added and seeing none played.
- **`moving` gets its record** (`straight-punch/moving`, registered): its window, its schedule
  of trunk and arm pushes, its firing rule in `moving/`, no network. The exporter and the drill
  search take the variation.
- **Searched** with CMA-ES on stage 2's twin by the graded score, the form in it, until its
  plateau (`--patience 30`), from stage 3's best.
- **Gate**: with no network it lands some of the held-out rung's cases, thrown walking, its
  blows no lighter than the installed punch's. A schedule that lands none is not trained:
  the controller is changed.
- **Output**: the record installed, its profiles measured from its own sparring, and a link:
  the owner watches the new motion beside the old one before any training. What the owner
  rejects in its look goes into the score, and the search is run again, before stage 5.

### 5. The steer

[Training](../recipes/skill.md#training), once the motion under it has stopped changing.

- **A layout of its own** (`moving.layout.json`): the pushes of the trunk and the arm, and no
  ask of the stance; the stroke's readings, the target's and the centre's velocity, the gait's
  phase.
- **An environment of its own**: stage 2's training draws and sparring's, the body holding
  `moving` and its gait, started from kept starts at the first decision and ended at the
  stroke's end (`onward` false), so a run computes the stroke and little else. The trainer
  seats that character and writes `moving`'s record.
- **Before the run**, [the recipe's seven checks](../recipes/skill.md#before-the-first-run):
  the cases named, the schedule's own reading as the baseline, parity, the spread, the reward
  the value.
- **The run**: priced from its first chunk and profiled if slower than 1 M decisions in 45
  minutes. Started on the owner's word. A checkpoint every 1 M, each played on the development
  cases as it lands, the best installed in the game at once and watched there.
- **Gate**: the chosen checkpoint lands more than the schedule alone on the held-out rung,
  paired, its blows no lighter. On a plateau (5 M decisions with no kept gain) the environment
  is checked first, then one thing is changed and run as a new question. A second plateau is
  the controller's limit: back to stage 4, not a third run.

### 6. The bout and the owner's eye

- **The bar's bouts**, v1 against v2, counts first.
- **The gait under it**: the one the bouts favour. If it is the footwork, its own envelope is
  measured so the Mind prices it, and the Warrior holds it.
- **The owner watches.** On the owner's yes the Warrior holds `moving` in the game.
- **Then the Rogue and the Skeleton**, each a record of its own from the same search and the
  same environment. The Skeleton's fist meets 0.09 to 0.22 kg whatever its speed; its bar is
  its own installed punch.

### 7. Land

What worked goes into [the skill recipe](../recipes/skill.md) as the way a strike is made
apart from the legs: the walking rung, a variation's own record and tools, the stroke-only
environment. This plan is deleted.

## How the plan is followed

- **One stage at a time, in order.** A stage is finished when its output exists and its gate
  is read, and its line in [where the work stands](#where-the-work-stands) says so.
- **A report on the punch names what changed in `moving/` or in `moving`'s record**, or says
  that nothing did.
- **Before a run**: what will be different in the game when it ends, and its price. Over half
  an hour, the owner's word for that run; the owner may give it for a stage ahead.
- **A gate that fails stops the work.** The report says what was read. It is not followed by a
  wider search, a longer run or a tool.
- **Nothing here re-fits or re-measures the installed punch.** Its one new reading is its
  baseline on stage 2's rung.
- **Counts before ratios**, in every report.

## Where the work stands

| Stage | State |
| --- | --- |
| 1. Look | not begun |
| 2. A blow under a walk can be read | not begun |
| 3. What the body can do | not begun |
| 4. The motion | not begun |
| 5. The steer | not begun |
| 6. The bout and the owner's eye | not begun |
| 7. Land | not begun |

Built before this plan and standing: the legs are let go (`leavesLegs`); only the Option that
claims the legs commands them; every gait is a walk Option of its own; a saved result is found
by the question it answers and a stale one is read until asked again.
