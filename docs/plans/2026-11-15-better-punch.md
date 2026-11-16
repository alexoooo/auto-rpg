# A better punch

`moving` made the better punch: v2 beside the installed punch (`drive`), thrown while the legs
walk, coordinated with them only indirectly, and trained to punch that way.

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

> i want `moving` as a better punch

> I just want to make sure of something: you're not just tweaking the existing broken punch
> motion, are you? Because that's precisely the pattern of failure that I want to break out of.
> Whatever you're doing, it must not be what the old punch does, because that is what we know
> doesn't work. Stop judging levers by landed count in six bouts; the unchanged punch ranges 6–19
> there. Judge each by the readings you already built over all ~150 punches: nearest pass to the
> aim, fist-side kg, closing speed, elbow bend at contact. Before any more window or walk levers,
> measure the ceiling: moving at its best range on a target that stands. If a clean blow is under
> 0.5 hp, the stroke itself must change (the arm straight and held at contact, the trunk's turn
> behind it), in code of moving's own. Close the 0.16 m by standing nearer, not by a lunge.

> We shouldn't have any rules that prevent a Mind from doing what it wants, the mind alone should
> decide the behaviors of the body.

> One number until it is met: on the standing-target sweep, how wide is the range where a clean
> blow takes at least 0.5 hp? It is 2 cm now. No bouts and no Mind work until it is 15–20 cm and
> includes where the fighters stand.

The sweep: `strike-bouts.mjs --drill stand`, `moving`'s window opened so it fires where it stands
(`inside`, `reach` 0.3, `band` 1), start gaps 0.55 to 1.25 m every 1.25 cm; the number is the
widest run of trunk-apart ranges whose every punch takes 0.5 hp. A lever is read on the dense
sweep: 100 start gaps from 0.75 to 1.00 m (the trunks 0.65 to 0.90 m apart at the fire), half a
minute; the share taking 0.5 hp near (0.65 to 0.72 m), between (0.72 to 0.78) and far (0.78 to
0.90). A sweep of 22 moves some 2 of 22 by itself.

Said before: a separate punch "to be able to see v1 vs v2 in a fight"; of the installed one, "it
kind of looked like dive jumping into the punch but in a very clumsy way which didn't look like a
serious punch".

## What `moving` is when it is done

- **Decoupled from the legs.** It claims the hand and the trunk, never the legs
  (`leavesLegs`, built). Whatever gait walks the legs keeps walking them under the blow, and no
  gait is trained for it.
- **Coordinated with the legs before the blow, indirectly.** A person punching on the move gets
  the weight from the body travelling into the blow and the fist landing as the lead foot does.
  So the coordination comes before the blow: once the punch is ready it waits, reading the legs
  (the gait's phase and which foot bears, already among its steer's inputs), and decides when to
  fire against the step and where to send the walk (its strike Option's site: how far into the
  target, which way to face), which any gait carries out. Today it fires at once and sends the
  walk nothing: its steer runs only from the swing (`straight-drive.ts`, `enter`) and its asks of
  the legs are dropped under `leavesLegs`.
- **Trained to punch while moving.** Its own network in its own record
  (`straight-punch/moving`), trained on blows thrown while the walk goes on, deciding the timing
  and the walk's site as well as steering the swing. Today its stroke takes a steer laid out by
  `moving.layout.json` (speeds added to the stroke's pushes on the trunk, the arm and the wrist,
  `steerPushes`), its record has no network yet and is not steered.

It is **done** when, on the Warrior:

1. **The owner watches it in the Arena beside the installed punch and says it is a punch.**
2. **In bouts, v2 against v1, each on each side, it lands dramatically more often and
   dramatically stronger**, takes more life than it gives, and falls no more. In the owner's
   words: "it needs to land dramatically stronger (currently it mostly jsut graxes dealing < 0.1
   damage) and dramatically more often", and then: "at least 5x more blows, and at least 2x damage
   per blow. that's what i would be happy with". So, **in the same bouts: at least five times the
   installed punch's landed blows, and at least twice the median hp a landed blow takes**. And:
   "if it can do even 20 [a minute] that would be amazing ... I want landing a blow to mean
   landing a blow. A gentle accidental graze to me is not a 'landed punch'". **A landed blow
   takes at least 0.5 hp** (`LANDED`, `strike-bouts.mjs`): half a solid punch (a hit point is
   100 J of blunt blow, `Rulebook.unit`), a twelfth of a Warrior's 6. Counts first: begun, thrown
   with a foot swinging, landed, missed, guarded, fell; then hp a landed blow, kg behind the fist
   and J on the mark.
3. **The Warrior holds it in the game.**

## The rules this plan is followed by

- **Every step changes `moving`** (its code, its record, its layout or its network) or is a look
  that takes minutes. A report names the files of `moving` that changed, or says none did.
- **Nothing re-measures or re-fits the installed punch.** Its readings are saved; they are read.
- **The work goes on until the bar is met or the owner stops it.** In the owner's words: "i
  didn't ask to try one thing and then stop. i asked for a better punch." A lever that adds
  nothing is written down in a line and the next lever is tried; no gate hands the work back.
  The work runs unattended: "there is no such thing as 'stop for a question for me'". Where a
  choice would be the owner's, the agent takes the one it would recommend, writes the choice and
  its reason in the plan, and goes on; the owner overrules after. A reviewing session's note is
  weighed, never a reason to stop.
- **A run over half an hour is announced** with its price and what will be different in the game
  when it ends, and stops at a plateau.
- **Short of the bar is not thrown away; spinning wheels is what is avoided.** In the owner's
  words: "if you don't get all the way there, then that doesn't mean that you need to throw away
  all of your work. it's fine if you discover something that allows us to proceed furhter. but
  the one thing i don't want, is just to spin our wheels for many more horus and achieve
  nothing". Each lever is read in the bar's bouts within minutes; a lever is not re-tuned and
  re-read in circles, and the installed punch is never the thing worked on.
- **Counts before ratios.**

## The steps

### 1. Watch `moving` as it stands, and one bout

No code. Minutes.

- **The owner and the agent watch** a Warrior holding `moving` against one holding `drive` in the
  Arena (its skill editor ticks `straight-punch/moving`). The agent writes down, in the body's
  terms, what the trunk and the arm do and whether the legs are walking when the fist lands.
- **One bout**, each on each side: `npm run match -- <v2> <v1>`. The counts above, and how many
  of v2's blows are thrown with a foot swinging.
- **Gate**: in a bout, `moving`'s blows are thrown while the legs walk (the strike Option keeps
  the walk going under a blow that leaves the legs, `onTheWay`, `src/minds/option/strike.ts`). If
  they are all on stood legs, that is fixed first, in the Mind, before anything is built on it.
  If the Mind seldom begins it (fighters stand nearer than its window), its window is set in its
  record at step 2.
- **Output**: the counts here, and what the owner says of its look, which goes into step 5's
  reward.

### 2. Its own record

Code. Hours.

- **`straight-punch/moving`, registered**: `moving.json` holding today's punch exactly, each
  body's (`drive`'s settings with no hip turn and no wait for a quiet stance, its schedule
  without the legs' pushes it never threw, `drive`'s network as its start), its meta and loader.
  `moving` reads it, not `drive`'s.
- **The tools take the variation**: the trainer already does (an environment's `character` is a
  seat, `{ "variations": ["straight-punch/moving"] }`); the exporter writes `moving`'s record with
  `--out`, and takes a network alone with step 3's layout.
- **Checks**: the fingerprint is unchanged (the punch is the same numbers); asking for the
  table's saved rows plays nothing (a stale row is read, the owner's first obstacle).

### 3. Timing and the walk, before the blow

Code. Hours.

- **The punch waits ready.** Once admitted it holds its guard on the move and fires when its
  rule says, not at once: a fixed rule first, **firing as the foot opposite the striking hand
  lands** (`view.stance.ends`), within a longest wait so it never stands waiting.
- **It sends the walk into the punch.** While it waits and while its blow is live, it asks its
  strike Option's site to be **half a step deeper toward the target** than its window's spot, so
  the walk carries the body into the blow. The Option carries the ask into the site it gives the
  walk. No gait's code changes.
- **Its own layout** (`moving.layout.json`), so step 5 can learn what this step fixes: its steer
  runs from the moment it is ready, its outputs a fire-now and the site's asks (how far into the
  target, which way to face) beside the swing's pushes; its inputs keep the gait's phase and which
  foot bears. Here the fixed rule fills those outputs.
- **Check**: in the Arena, the walk goes on toward the deeper spot and the fist lands as the lead
  foot does, on the braced walk and on the footwork.

### 4. The weight check

No training. Minutes.

- **Read the fixed rule** of step 3: in the Arena, watched; and one bout, v2 against v1, its
  counts and the kg and J of its landed blows.
- **Read**: the median hp of its landed blows against the installed punch's in step 1's bout, the
  bar twice (done, 2). Training is not counted on to raise the weight: where a lever brings it up,
  training goes on from it; where none does, the next lever is found by reading why a committed
  blow grazes (range at the fire, what the fist meets, its speed at contact) and built.

### 5. Train it

A run, announced with its price, begun without waiting.

- **Its environment** (`environments/moving.json`): Option Mind's Warrior holding `moving`, on
  sparring's and the fights' cases, where the walk goes on under the blow; each episode from the
  moment the punch is ready to the stroke's end (`onward` false), so a run computes the wait and
  the stroke and little else; rewarded by the strike's value (landed, kg, J) and what the owner
  rejected at step 1.
- **Started from step 3's fixed rule and step 2's network**, which already lands some cases
  (`moving` as it stands lands 0.454 of 720 sparring trials), as
  [training needs](../recipes/skill.md#training).
- **Before the run**, [the recipe's checks](../recipes/skill.md#before-the-first-run).
- **The run**: priced from its first chunk (0.8 M decisions an hour today; the shorter episodes
  are measured, not assumed, faster). Each 1 M checkpoint is played on held-out cases, and the
  best is installed in `moving`'s record at once, so the owner can watch it in the Arena while the
  run goes on.
- **Gate**: the chosen checkpoint lands more than step 4's fixed rule on the held-out cases,
  paired, its blows no lighter, toward five times the installed punch's landed blows. On a plateau (5 M decisions with no kept gain) the run stops, is
  written down, and the next lever is taken.

### 6. The bout and the owner's eye

- **The bar's bouts**, v2 against v1, counts first.
- **The owner watches.** On the owner's yes the Warrior holds `moving`, its profiles measured
  from its own sparring.

### 7. Land

The way a strike is made apart from the legs (its own record, timed against the step, asks
through its site, trained on blows thrown walking) goes into [the skill recipe](../recipes/skill.md),
for every strike after it. The Rogue and the Skeleton are a decision of their own. This plan is
deleted.

## What is known

- **`moving` as it stands**: the installed punch's settings and network with the legs let go.
  On the walk rung it lands 83 of 96 where `drive` lands 70, a median 0.23 s to the mark against
  1.59, the fist 7.1 m/s with 1.4 kg behind it against 4.5. In sparring on three bodies 0.454 of
  720 land, 0.008 fall, a median 0.38 kg and 4.0 J.
- **Step 1's bouts, the bar's baseline**: six Warrior bouts with bare fists, `moving` on each
  side in turn, 515 s
  (`research/skills/strikes/strike-bouts.mjs --models man --held empty --holds <side>=straight-punch/moving`).
  The installed punch committed 163, 16 with a foot off the ground, landed 102 (11.9 a minute),
  a median 0.058 and 0.051 hp a landed blow, none fell. `moving` committed 159, 96 with a foot
  off the ground, touched 67 (7.8 a minute), a median 0.034 and 0.023 hp, 11 fell within 2 s.
  **Landed (at least 0.5 hp): the installed punch 14 (1.6 a minute), `moving` 6 (0.7)**; the
  median committed punch takes 0.015 hp and 0. Every other blow of either is a graze. In the match
  (`npm run match -- option option+straight-punch/moving`) the installed punch's Warrior won 5 of
  the 6 bare-fisted Warrior bouts.
- **The installed punch in fights**: over 1,869 kept fight moments it lands 375, misses 752,
  meets the guard 370, never gets into its window 213 and falls 68.
- **Retraining the installed punch's network read flat** (0.95 of where it began): a run is not
  assumed to beat where it starts.
- **Step 3's levers, read at step 4** (the same six bouts, `moving`'s landed blows in about 8.5
  bout-minutes each): as it was 6 of 159 committed, the heaviest 1.25 hp; fired as the lead foot
  lifts (`onStep` 0.5) 2 of 154; the walk sent 0.3 m deeper (`deeper` 0.3) 5 of 185; both 1 of
  141. The rule did what it says (126 of 141 thrown as the lead foot lifted); neither lever adds
  weight to a blow of the arm and the trunk. Both stay in the code, unset in `moving`'s record.
- **Why a committed punch grazes** (the same bouts, `strike-bouts.mjs` reading each fist's
  contacts, the arm's shape at each and the fist's nearest pass to its aim): **the fist ends
  short**. Its nearest pass falls a median 0.24 m short of the aim along the line (`moving`; 0.17
  the installed punch), true up and down and left and right; every blow that landed passed within
  0.2 m, and of `moving`'s 127 that ended further off none did. A short fist meets what stands out:
  the guard's upper arms, the side of the head, the chest edge on, its line slanted. Where the
  shoulder-to-fist line meets the surface square (within 20 degrees), the fist meets it with a
  median 4.8 kg and 19 J (to 88 J); slanted past 40 degrees, more than half its contacts, 0.8 kg
  and 0.9 J: the graze. The cause is the reach: the fighters stand 0.9 m apart, trunk to trunk,
  each window keeping the two bodies clear with the guards counted (`clearAhead`); from there the
  foe's chest is about 0.77 m from the striking shoulder and the Warrior's arm is 0.61 m. Firing
  nearer (the guards left out of the clearance), aiming deeper (`reach`), the walk sent deeper
  on the approach, all read nothing: nearer, the arm is cramped and meets the guard; the walk
  arrives stopped (0.2 m/s at the fire) whatever its spot. **The body must travel some 0.15 to 0.2
  m toward the foe in the blow's 0.18 s**: a step into the punch.
- **No leg the game has carries the body into the blow in time.** In the 0.2 s from the fire the
  centre of mass goes nowhere toward the foe: the installed punch's 0.00 m (its legs brace against
  the throw), `moving`'s -0.01 (the arm's throw, some 4 kg at 7 m/s, pushes a body on free legs
  back). Of `moving`'s 370 punches read, the 7 that travelled 5 cm or more landed 2; none of the
  222 that went back did. The fighters already stand at the window's distance, so a punch fires
  standing, not out of an approach. Asked of the legs, through a claim the arbiter carried to the
  stance while no action held it: a step of the foot opposite the hand, 0.25 m toward the target
  (lifted at once, its capture point at the landing; or as a walk's step, a double support with the
  capture point carried forward and the other foot pushing off; the drive fired as the foot left
  the ground): the foot stepped (a median 0.18 m) and the body stayed, -0.01 m, more falls; the
  weight carried over that foot through the drive (`StanceGoal.centre`): -0.01 m. None kept.
  What carries a body 0.15 m in 0.2 s is a push-off of some 0.75 g: a leg action the stance does
  not have.
- **The drive's stroke as `moving` threw it falls under the bar** (`moving`'s record: no hip turn,
  the legs left to the walk, no quiet stance; not the installed punch, below). At a target that stands
  (the Strike drill's Commander and `drill-stand`, its window opened so it fires where it stands,
  `strike-bouts.mjs --drill stand`), 0.84 m apart, 25 punches: a median 0.27 hp, the best 0.70. It
  meets the target either fast (5 to 6 m/s) and light (about 1 kg) or held (15 to 24 kg) and slowed
  to 3 m/s, never both: its pushes have no speed, a torque source that gives the arm no strength
  against the blow (`MusclePush`).
- **`moving`'s own stroke** (`moving/stroke.ts`, the drive's window, preparation and return around
  it, `StraightDriveOptions.stroke`): the fist steered along the shoulder's line to the target, each
  freedom pushed at full level toward a finite speed, all held at speed nought from the touch.
  Per-joint pushes to the contact pose alone wandered (the shoulder swung, the fist peaked at
  0.06 s and crept in, a median 0.07 hp). Steered, at a target that stands from 0.45 to 1.15 m:
  **0.68 to 0.70 m trunk to trunk, 23 to 29 kg at 3.7 to 4.4 m/s, 0.55 to 0.86 hp**, the elbow 21
  to 29 degrees at the touch; nearer, the elbow bent 60 to 90 degrees and 1 to 4 kg; from 0.73 m,
  the arm straight short of the target. Read nothing: the chest and waist turned to their stops,
  the arm held until the trunk brought the shoulder near (the lean moves the shoulder nowhere: the
  stance keeps the weight over the feet).
- **The trunk carries the shoulder in only before the arm is thrown.** Its turn and lean bring the
  shoulder 0.10 to 0.12 m nearer in 0.14 s (the lean is most of the weight: with none, no blow
  anywhere takes 0.5 hp). An arm thrown while the trunk turns stalls the turn (the trunk's 49 N m
  against the throw) and pushes the shoulder back 1 to 5 cm; its fist goes low and ends short. So
  the stroke decides at the fire: the arm at once where the straight arm reaches, else the trunk
  first and the arm 0.14 s after. Swept (77 punches): **15 take 0.5 hp, from 0.62 to 0.87 m; in
  0.67 to 0.87 m, 11 of 18, a median about 0.6 hp; the strict band is 4 cm** (0.83 to 0.87), the
  dips at 0.72 to 0.74 m (the turned shoulder too near, the elbow bent 64 to 74 degrees, under a
  kilogram) and 0.78 to 0.82; past 0.88 m none reaches. Read nothing: launching on the shoulder's
  distance or its closing rate (it launches mid-turn), a turn scaled to the range, no lean or a
  deeper one, a middle mode for targets up to 4 cm past the arm (the drive's own turn and lean,
  the arm at 0.10 s: 0.74 to 0.78 m fell short, 0.01 to 0.11 hp). Between 0.65 and 0.90 m the
  stroke lands 13 of 22 at 0.5 hp, a median 0.63; against the guard 9 of 21, 0.40.
- **Why fast and heavy do not meet in the arm.** A freedom holds through a blow with the ceilings
  its muscles had the step before (`holdsOf`, `MuscleDriver.bounds`). Under the world's symmetric
  law, the game's and the drills', both ceilings are the strength of the side the motor was asked
  toward, at the freedom's speed (Hill's force and velocity), so what holds the elbow is which way
  its motor was pushing at that step, not how fast it ran. The stroke asks the elbow for 40 rad/s
  of extension: run past that (the motor braking, its flexors lengthening) it holds about 104 N m
  either way; short of it (the motor still driving, its extensors shortening) about 10. Traced at
  one range, two blows 5 mm apart: the elbow at 41 rad/s held 104 N m, 8.9 kg behind the fist,
  1.54 hp; at 30 rad/s, 11 N m, 1.7 kg, 0.16 hp. On the dense sweep (`HOLDS` in `strike-bouts`),
  the 32 blows whose elbow held over 50 N m: 25 at 0.5 hp, a median 0.77, 20 kg; the 72 held under
  it: 20 at 0.5 hp, a median 0.33, 2.6 kg, the fist as fast or faster (5.3 against 4.4 m/s). Under
  the directional law the elbow's hold against a blow pressing it bent is its extensors' own,
  about 7 N m, at either speed: the heavy fast blows are the symmetric law's, the braking side's
  ceiling held both ways (`driver.ts` calls that law a comparison control). Whether the law or
  the pricing change is the owner's to decide; neither is done. Under the directional law
  (`ACTUATION` in `strike-bouts`, the game unchanged), at a target that stands: `drive` lands none
  of 34 (23 of 31 under the symmetric), 9 touching at all, 5.5 kg, its arm straight short of the
  target (the law moves the arm too, not only the hold), the elbow holding 8 and 30 N m the two
  ways, the wrist 3 and 10, 14 and 7; `moving`'s stroke, 6 of 110 at 0.5 hp, a median 0.23 (45 of
  105 and 0.44), 2.7 kg against 4.4, the fist as fast (5.2 m/s), the side a blow presses holding
  little (the elbow 8 N m against 104 the other way, the wrist 12 and 10). Read nothing on the dense sweep,
  not kept: the elbow asked to brake once the fist is within 5 to 20 cm of the target along its
  line (asked for 0, 20, 30 or 35 rad/s in place of 40). At 5 cm and 35 rad/s, 47 of 105 at 0.5
  hp, a median 0.47 (near 16 of 33, between 11 of 24, far 20 of 48), 62 elbows held; against
  `drill-guard` 44 of 99, a median 0.43, beside 41 of 99 and 0.41 unbraked; at 0, every
  elbow held and 40 of 101, the fist slowed to 3.9 m/s; from 10 cm on, fewer, from 15 cm at 0
  rad/s none. An elbow held gives 5 to 8 kg, not 20: of the blows whose elbow held, the heavy
  (12 kg and more) and the light (under 6) hold alike in every freedom; the heavy land with the
  arm straighter (bent 25 degrees against 30 to 41) and the waist still bending forward (8 rad/s,
  holding 165 N m against 91 to 113). The best blows land late in the extension, the elbow bent 30 to 50 degrees, slowing
  and holding while the fist still runs 6 to 7 m/s: 0.8 to 1.5 hp. Bent 60 to 75 degrees (the shoulder brought too near), under 3 kg and
  0.3 to 0.6 hp; under 22 degrees, the fist past its peak, about 0.3 hp. Hence each regime's 10 cm.
  Read nothing on the sweep's share (13 of 22): the fist steered more loosely (its pose solved
  0.4 to 0.8 m ahead, the arm's freedoms to 100 rad/s: the fist no faster, 6 to 7 m/s, the arm's
  hold lost, 6 of 21); every trunk freedom the stroke does not drive held from the throw (the
  shoulder's 5 cm recoil gone, 11 of 22); that and the trunk frozen where it stands at a throw
  launched as the shoulder comes within reach (13 of 29, a median 0.43); the trunk stopped and held
  as the shoulder comes 4 or 6 cm inside the straight arm, the arm thrown 0.02 or 0.03 s after (10
  of 23, 12 of 22). Those shares are too few to tell such levers apart.
- **On the dense sweep, the stroke as it stands**: 45 of 105 take 0.5 hp, a median 0.44; near
  17 of 33, between 10 of 24, far 18 of 48. The strict band is 2 cm. **One range gives anything**:
  start gaps 2.5 mm apart, the commit at the same instant, give 1.50, 0.34, 0.16, 0.40, 1.54 hp at
  0.80 m. Near, the poor blows touch 0.017 to 0.025 s after the fire at 2.4 to 3 m/s, the fist
  starting on the target (the heads 0.78 to 0.83 m apart against 0.76 for the good, at 7.6 m/s);
  far, every blow is fast but the kg behind the fist runs 1.4 to 20 at the same bend, and a poor one
  (traced) had its shoulder 3 cm further at the throw (0.585 against 0.555 m: where the trunk's
  turn leaves it differs) and a quarter of its fist's speed off the line. Read on the dense sweep,
  not kept: a fist nearer the target than 0.25 to 0.35 m at the fire drawn back first (near 21 of
  33, 10 of 29, 25 of 40: not by the room given); the arm's pose solved 0.01 to 0.015 s ahead in
  place of 0.02 (far 21 to 23 of 48, near and between to 0 to 6, the trunk stiffened with it); far, the arm thrown once the shoulder is
  6 to 8 cm inside the straight arm after 0.10 to 0.12 s, at 0.18 to 0.20 s at the latest (42 to 46
  of 105). Against `drill-guard` 12 of 42 first touches are the guard's hands and forearms;
  touches on a guard are driven through (`ContactTarget.guard`), 9 to 12 blows of 0.5 hp, the strict
  band 7 cm (0.74 to 0.81).
- **The installed punch is heavy at a target that stands, and by the same law.** `drive`'s
  standing sweep (`HOLDS`, 100 gaps): it fires from 0.87 to 0.98 m, 23 of 31 at 0.5 hp, a median
  0.80, all 14 between 0.88 and 0.95 m; 10.6 kg behind the fist at 4.3 m/s (5.5 between 0.88 and
  0.92), the shoulder coming on at 0.7 m/s. The arm meets the target all but straight (bent 4
  degrees, the blow along it, the elbow holding 0 to 45 N m), and the wrist holds 35 N m in
  flexion and 39 in radial deviation either way: each motor braking the wrist's swing, the side
  pressed by the blow 1 to 4 N m of its own. Each of its parts removed from its record in turn,
  the record put back after: its legs' timed pushes or its quiet stance, the sweep the same to the
  bit (at a target that stands, its stance is already quiet; its legs' schedule moves nothing);
  its hips' turn (`hips` 0), 5 of 30, a median 0.13, 1.1 kg, the wrist's motors still driving
  (0 to 7 N m) and the shoulder faster (1.2 m/s; it fires nearer, 0.76 to 0.87 m, its window
  reckoning the turn); its network's steer (`steered` false), none of 31, 2.2 kg, the wrist the
  same. So its weight is a straight arm and a wrist braked at the touch, which the hips' turn and
  the network's steer time together, and the symmetric law prices.
- **`moving`'s stroke with the hips' turn** (read, not kept: the legs taken from the walk, `hips`
  0.6 and `halts` as the drive has them, its window opened; 160 gaps at a target that stands):
  from 0.74 to 0.845 m, 27 of 42 at 0.5 hp, a median 0.71 to 0.90 by 3.5 cm, against 23 of 42 with
  the legs taken and no turn (0.38 to 0.65); past 0.88 m none in either, the arm straight and the
  fist at 1 m/s short of the target. Taking the legs stops the walk the variation is for: whether
  `moving` asks the legs for a turn is the owner's.
- **In the bar's bouts the stroke was not better** (read before the trunk went first). At the record's window it fires from 0.82
  to 1.05 m trunk to trunk and ends short (a median 0.25 m), 1 landed of 196; its window set where
  the arm reaches (`inside`, `reach` 0.62, `band` 0.02) it commits 14 in 6.9 bout-minutes, all
  touching, none landed, the elbow bent past 70 degrees at most touches. A window 2 cm wide is a rule
  the fight seldom meets: where to throw it is the Mind's to decide, priced by range.
- **The risk**: `moving`'s weight came from the legs it no longer drives. Whether walking into
  the punch on the step raises what its landed blows take in a bout is read
  at step 4, before any training. The bar is the installed punch in bouts, where the owner sees
  it graze, not its 4.5 kg at a target that stands.

## Where the work stands

**Choices taken by the agent** (the owner overrules after):

- **The symmetric law stays.** Under the directional, both punches fall to almost nothing (0 of
  34, 6 of 110) and every skill trained so far would be retrained; the weight it gives is the
  game's as it plays now.
- **Next, `moving`'s stroke gets a learned steer, and is trained** (step 5), in place of more
  hand levers (some fifteen read inside the noise). The installed punch's weight is its
  network's: with its steer off it lands none of 31. `moving`'s stroke has none.
- **Its window is where its stroke lands**: `inside`, `reach` 0.6, `band` 0.2; walked in, it
  fires about 0.77 m trunk to trunk (0.76 to 0.78 from 1.4 to 2.4 m out; `reach` 0.3 fired at
  0.60 to 0.62, `reach` 0.75 at 0.84 to 0.91).
- **The first run** (`environments/moving.json`): the Strike drill's value on its training
  twins, `still-twin` and `walk-twin` (walked in and asked settled, or asked walking), on the
  Warrior, at 120 Hz; from scratch (its layout is new); the spread at the default, which an
  untrained steer survives (80 episodes with noise played through); its checkpoints chosen on the
  `still` and `walk` rungs, held out. Parity holds by construction: a nought steer adds nothing to
  a push.
- **On the Strike drill's rungs `moving` untrained already beats the installed punch** on the
  Warrior (`npm run evaluate -- strike <subject> --protocol still|walk`; blows taking 0.5 hp of
  those committed, the median hp a committed blow takes):

  | Rung | `drive` | `moving` |
  | --- | --- | --- |
  | still | 11 of 96, 0.12 | 17 of 85, 0.27 |
  | walk, asked settled | 8 of 95, 0.08 | 20 of 73, 0.34 |
  | walk, asked walking | 3 of 96, 0.11 | 19 of 96, 0.32 |

  The Rogue holding `moving` (its record the Warrior's stroke, untrained) lands none of 93 on
  `still`; `drive`, 1 of 96.
- **In the bar's six bouts the rungs' gain does not carry**: `moving` with its window set and no
  steer committed 129 and landed 4 (0.5 a minute), a touching blow a median 0.06 and 0.10 hp; the
  installed punch across from it committed 153 and landed 13 (1.7 a minute), 0.07 and 0.08. The
  rungs' target stands with its arms down; the bouts' foe guards and steps.
- **Run 1** (`environments/moving.json`, 32 workers of 4) rose from a value of 0.48 to 0.89 in
  1 M decisions (44 minutes). At 1 M, on the rungs: still 52 of 85 at 0.5 hp, a median 0.60;
  walk 50 of 73 and 58 of 96, 0.59 and 0.60. In the bar's bouts a touching blow takes a median
  0.21 and 0.18 hp (twice and more the untrained stroke's), but it landed 7 in 450 s where the
  installed punch across from it landed 18: the rungs teach weight, not a blow past a guard.
- **Run 2** (`environments/moving-fights.json`: `walk-twin` and `fights-drawn`, the Warrior's
  fight moments against Option Mind, from run 1's 1 M model) was stopped after one chunk (43.7
  minutes, 6.8 M world steps to run 1's 1.8 M): in a fight moment the stroke's learner often
  stopped before a blow landed, the mind threw again, and the reading credited that later blow,
  played with the steer at nought (166 such requests in one episode). The environment now steers a
  learner run again before the reading's end as the episode's next decision (`again`); played so,
  four fight moments read as the full play did, with 86, 18 and 55 decisions each.
- **Run 3** is run 2 with `again` (seed 3), screened on the rungs and the bar's bouts at each 1 M.
  A chunk costs 13.7 to 13.9 minutes (2.0 to 2.1 M world steps), 1 M about 55. Its value read
  0.54, 0.52, 0.45 over its first three chunks. In its fourth a world threw: the stance's swing
  foot was asked to land at a lean of NaN (`landingTurnToRef`, `stance.ts`), and the run ended.
  The environment now cuts the episode of a world that throws and writes its condition to
  `server.log` (`survive`), and run 3 continues from its last model; the fault is to be found
  from those conditions.
- **Run 3 at 2.1 M in the bar's bouts** reads as run 1 at 1 M: `moving` landed 8 where the
  installed punch landed 18; a touching blow a median 0.14 and 0.18 hp.
- **What `moving`'s blows meet in bouts** (`strike-bouts --save`, each committed punch's heaviest
  touch): at 2.1 M, 38 of 85 meet the upper trunk and 10 the middle; 7 of the 48 take 0.5 hp. The
  heavy ones meet square, the shoulder-to-fist line within 9 to 25 degrees of the surface's normal,
  with 9 to 13 kg behind the fist (100 J); the light ones meet slanted, 40 to 77 degrees, about
  as far as the foe's trunk is turned off the line between them (Option Mind's guard stands
  bladed), or with 1 to 4 kg behind the fist. The installed punch's heavy blows have 11 to 14 kg
  behind them. `moving`'s fist is fastest (8.4 to 8.6 m/s) about 0.19 s from the fire and meets
  the trunk at 0.21 s closing at 4.1 to 4.5 m/s along the contact: half its speed, the slant's
  share. The steer reads nothing of which way the foe's chest faces.
- **Run 3's reward was one value at the end of a fight moment**, several steered blows into it,
  and charged every second the legs' goal went unmet, which `moving`'s steer (no leg outputs) does
  not move; its value fell from 0.54 to 0.44 over its first four chunks. The Strike drill now has a
  percept `dealt`: the hit points the striker's hands deal in each step's blows, paying each blow
  once as it lands. **Run 4** continues run 3 (2.36 M) paid `dealt` and the end's value, `unmet`
  dropped.
- **The steer reads which way the target faces** (`target facing across/up/ahead`, its upper
  trunk's forward in the striker's body frame), so that it can meet a bladed foe's chest square;
  `moving`'s layout reads it (68 inputs). Run 4 never trained (the layout changed under its
  start); **run 5** begins from run 3's 2.36 M policy carried onto the new layout (`--start`,
  `--start-layout`), on `moving-fights.json` paid `dealt`. A chunk costs about 14.5 minutes.
- **Run 5 at 1 M is the first `moving` to out-land the installed punch in the bar's bouts**: 18
  blows of 0.5 hp and more (10 and 8 on its two sides) to 13 (8 and 5), 25.9 hp dealt by its
  punches to 18.1; a touching blow a median 0.16 and 0.09 hp to 0.06 and 0.09. Its upper-trunk
  blows on one side close at 5.6 m/s (4.1 at run 3's 2.1 M) and take a median 0.44 hp. The bar is
  5 times the blows: 1.4 so far.
- **Six bouts do not rank checkpoints; twelve are read from here** (`--gaps 2.5,3,3.5,4,4.5,5`,
  each on each side, every touch of 0.5 hp counted): run 5 at 1 M landed 28 of 187 committed to
  the installed punch's 28 of 252, a landed blow a median 0.73 hp to 0.73; at 2.1 M 24 of 189 to
  39 of 297, 0.81 to 0.68. Six bouts had read 18 to 13 and 15 to 18.
- **`moving` begins 13.3 punches a minute in those bouts to the installed punch's 19.3**, each
  alike in its parts (0.02 s preparing, 0.3 s committed, a median 1.2 s between) and alike in its
  long pauses (about 1,000 s over 3 s each); the gaps are the mind's. The bar's 1.4 hp median for
  a landed blow is about 140 J: 10 kg behind the fist at 6 m/s, met square.
- **Run 5 at 3.15 M** (its return 1.32 at the start, 2.23 now; its value 0.55 to 0.89): in the
  twelve bouts 38 landed of 195 committed to the installed punch's 32 of 281 (1.19), a landed blow
  a median 0.72 hp to 0.66, its punches' touches 54.9 hp to 47.1. 104 of its blows met the upper
  trunk, a median 0.34 and 0.41 hp, 35 of them landed.
- **Run 5 at 4.2 M** (return 2.6, value 1.09): 38 landed of 176 to 36 of 245 (1.06), a landed
  blow a median 0.71 hp to 0.69. From 1 M to 4.2 M its return doubled and the bouts held at 1.0
  to 1.2 times; its trunk blows keep 3.4 to 3.6 kg behind the fist. Paid by the hit point, ten
  0.3 hp grazes earn what one 3 hp blow earns; the bar counts the blow. The drill now has `heavy`,
  each blow's hit points squared, and **run 6** continues run 5 (4.4 M) paid `dealt`, `heavy`
  and the end's value.
- **Run 6 at 5.25 M**: 32 landed of 154 to 27 of 228 (1.19), a landed blow a median 0.81 hp to
  0.67; on one side its upper-trunk blows have 6.1 kg behind the fist (3.4 to 3.6 before) and take
  a median 0.47 hp, 17 of 36 landed.
- **The landed ratio does not rank checkpoints** (1.0, 0.62, 1.19, 1.06, 1.19 over five; a
  checkpoint's twelve bouts replay to the same count). What does, at run 6's 5.25 M:
  - *The rungs, clean blows*: still 63 of 85 at 0.5 hp, a median 0.79 hp (run 1's 1 M: 52, 0.60);
    walk settled 64 of 73, 0.96 (50, 0.59); walking 87 of 96, 0.92 (58, 0.60). Fight training
    made a clean blow heavier.
  - *The dense standing sweep* (trunks 0.65 to 1.0 m apart at the fire): 0.5 hp from 0.65 to 0.92
    m with gaps, nothing from 0.925 out.
  - *Where its commits went in the twelve bouts* (154): no touch 13%; the guard's arm 32% (1.6 kg
    behind the fist); the trunk slanted over 30 degrees 23%; the trunk square and light 10% (5.4
    kg, 3.9 m/s); landed 19% (8.1 kg, 6.5 m/s). Run 5 at 1 M read alike: 12, 32, 26, 14, 14.
  - *Where the fighters stand* (`strike-bouts.mjs` now keeps seconds by 2 cm of stance centres
    apart): 0.85 to 1.05 m for 40% of the bouts' time, 0.90 to 0.95 the most (14%); 0.85 m and
    nearer 12%. The installed punch fires 142 of its 228 from 0.90 to 1.00; `moving`, its window
    at reach 0.6, 13 of 154. The throw rate's gap is the window.
- **`moving`'s reach 0.6 to 0.8** (its band 0.2; the installed punch's reach 0.8, band 0.06), the
  same 5.25 M network, twelve bouts, by `strike-bouts.mjs`'s counts:

  | reach | `moving` begun, landed | installed begun, landed | `moving` fell | installed fell |
  | --- | --- | --- | --- | --- |
  | 0.6 | 167, 34 | 230, 32 | 3 | 12 |
  | 0.7 | 323, 35 | 263, 16 | 2 | 15 |
  | 0.8 | 537, 37 | 280, 2 | 12 | 10 |

  At 0.8 it begins 36 punches a bout-minute, and the installed punch's touching blows take a
  median 0.02 hp, smothered; `moving`'s landed blow is a median 0.73 hp to the bar's 1.4, and most
  of its touches are grazes from 0.9 m, out of its trained reach. `moving.json`'s reach is 0.8,
  and **run 7** continues run 6 (6.3 M) there, `dealt` and `heavy` paid, to land heavy from where
  the fighters stand.
- **Run 7 is read on `moving`'s own numbers**, since a smothered foe raises the ratio: landed a
  bout-minute, landed of committed, the median landed blow, falls within 2 s of a commit, and the
  standing sweep's share at 0.5 hp from 0.875 to 1.0 m. The 5.25 M network at reach 0.6, 0.7 and
  0.8: 2.00, 2.30 and 2.08 a minute; 19, 10 and 6% of committed; 0.81, 0.87 and 0.73 hp; 3, 2 and
  12 falls; the sweep's far band 9 of 44. If neither the minute nor the far band moves within two
  checkpoints, reach 0.7 is the record.
- **Run 7 at 7.09 M**: 3.34 landed a bout-minute (43 of 472 committed, 9%), a median 0.81 hp, 13
  falls; the far band 6 of 38. Of its commits 30% touch nothing and 36% the guard's arm.
- **Run 7 at 8.13 M**: 2.46 landed a bout-minute (34 of 449, 8%), a median 0.78 hp, 10 falls; the
  far band 14 of 38, the sweep landing from 0.65 to 0.925 m. The far band moved: reach 0.8 stays.
- **The landed blow's hp has not moved** through runs 5 to 7 (a median 0.73 to 0.87 in bouts, 0.65
  on the sweep's trunk blows at 8.5 kg and 5.9 m/s, the fist's peak 8.3 m/s 0.03 s before the
  touch). Not levers, on the sweep at 8.13 M: the record's `through` (`moving`'s stroke has its own
  `THROUGH`); the stroke's `SPEED` 15, `ARM_SPEED` 60, `HOLD` 0.15 or `TRUNK_FIRST` 0.10, each a
  median trunk blow of 0.47 to 0.63 hp to the stroke's 0.65. Nor the pace at the fire: in run 7's
  bouts a landed blow is 0.78 to 0.83 hp at any pace. 571 of its 921 commits drift back in the
  0.2 s from the fire and 19 go toward the foe.
- **A miss falls short, and the walk sets how far** (run 7's bouts at 7.09 and 8.13 M, `moving`'s
  centre in the 0.2 s from the fire):

  | the centre | commits | touch nothing, its nearest pass short by | landed | a landed blow |
  | --- | --- | --- | --- | --- |
  | back over 3 cm | 187 | 47%, 0.34 m | 4% | 9.0 kg, 0.99 hp |
  | within 3 cm | 667 | 29%, 0.25 m | 8% | 15.4 kg, 0.81 hp |
  | forward over 3 cm | 62 | 8%, 0.21 m | 23% | 7.0 kg, 0.69 hp |

  The installed punch holds the legs and stands (212 of 223 within 3 cm, 10% landed).
- **The heaviest blows meet the trunk with the arm still opening** (the standing sweep at 8.13 M
  with each freedom read at the touch): its heaviest tenth, a median 1.74 hp, 13.6 kg behind the
  fist closing at 6.9 m/s, the elbow bent 54 degrees and opening at 43 rad/s, the fist 0.47 m from
  the shoulder; its middle fifth, 0.66 hp, 10.4 kg at 5.8 m/s, the elbow bent 44 degrees opening
  at 36 rad/s, 0.49 m out. Not a braking elbow: a target 2 cm nearer, met before the arm's end.
- **The steer does not read the foe's hands**; the guard's arm takes 36% of the commits in bouts.
  It could read them as it reads the chest's facing (an input of the layout, a retrain).
- **The stroke asks the walk in: `deeper` 0.3.** While a blow is live, the Option Mind's walk goes
  to the strike's window spot moved `deeper` m toward the foe (`strike.ts`, the site's
  `through`); `moving.json` had none, so the walk held the spot and took back any travel into the
  blow. The legs stay the walk's. Twelve bouts, 8.13 M's network:

  | `deeper` | landed a bout-minute | landed of committed | a landed blow | fell | bout-minutes |
  | --- | --- | --- | --- | --- | --- |
  | none | 2.46 | 8% | 0.78 hp | 10 | 13.8 |
  | 0.15 | 4.01 | 9% | 0.73 | 2 | 11.2 |
  | 0.3 | 4.35 | 13% | 0.79 | 5 | 10.8 |
  | 0.5 | 3.31 | 10% | 0.73 | 4 | 11.8 |

  At 0.3 a commit going forward lands 36% (21 of 58). Run 7's 9.18 M with it: 6.29 a bout-minute
  (57 of 374, 15%), 0.75 hp, 4 falls, 9.1 bout-minutes; its touches 91.5 hp to the installed
  punch's 7.6, which lands 0 to 2. `moving.json`'s `deeper` is 0.3, and **run 8** continues run 7
  (9.18 M) with it. The landed blow's hp is the bar's half still unmoved.
- **A heavy blow is met at the fist's peak.** On the sweep at 8.13 M the heaviest tenth (1.74 hp)
  peaks at 0.200 s and touches at 0.208, 7.0 m/s along the normal, its elbow over-running the
  stroke's 40 rad/s ask (43, braked, 104 N m held); the middle fifth (0.67 hp) peaks at 0.183 and
  touches at 0.217, slowed to 5.4 m/s as the arm runs out of reach. Both fire from about 0.79 m
  with the fist dipping 10 degrees. The shoulder at the touch holds 30 N m of its 133, swinging
  at 15 rad/s, in both. Not levers, read once each: the elbow's ask at 30 or 35 rad/s (12.7 kg
  at 5.0 m/s, 0.60 hp; 9.1 kg at 5.4, 0.64; the stroke's 8.5 at 5.9, 0.65); in bouts with
  `deeper` 0.3 at 9.18 M, the arm thrown at 0.20 s (6.47 a bout-minute, 0.76 hp, to 6.29 and
  0.75) or held until the target is within the arm's reach up to 0.25 s (5.01, 0.66); the
  shoulder held at speed nought once the fist is within 5 or 10 cm of the target (6.4 kg, 0.61
  hp; 6.1 kg, 0.41). The steer's shoulder outputs span 20 rad/s either side of the stroke's ask,
  enough to ask the shoulder for nought at the touch.
- **Against the installed punch's own figures**, from bouts where it was not smothered (2.3 to 2.6
  landed a bout-minute, a landed blow a median 0.67 to 0.75 hp): `moving` at 9.18 M with `deeper`
  0.3 lands 6.29 a bout-minute, 2.4 to 2.7 times; its landed blow 0.75 hp, 1.0 to 1.1 times.
- **Run 9 pays weight first**: `dealt` 0.25 and `heavy` 2 (it was 1 and 1, under which two 0.7 hp
  grazes earned 2.38 to a 1.4 hp blow's 3.36; now 1.33 to 4.27). The heavy tenth shows the stroke
  meets at the fist's peak when timed, and the steer reads what times it (the target from the
  shoulder, the fist's velocity). Run 9 continues run 7 (9.18 M) with `deeper` 0.3; run 8, the
  same under the old reward, was stopped before its first chunk.
- **Run 9 at 10.23 M**: on the standing sweep a landed blow is a median 0.96 hp (0.81 at 5.25 M,
  0.80 at 8.13 M), 64 of 126 landed; from 0.875 to 0.95 m 19 of 24, the bins' medians 0.54 to
  0.99. In the twelve bouts 5.47 landed a bout-minute (51 of 425, 12%), a median 0.76 hp, no
  falls; of its commits 25% touch nothing and 32% the guard's arm.
- **Run 9 at 11.02 M**: in the twelve bouts 5.47 landed a bout-minute (52 of 389, 13%), a median
  0.87 hp (12.9 kg behind the fist at 5.6 m/s), 4 falls; on the sweep 0.85 hp, 67 of 133. The
  bouts' landed blow moved (0.76 to 0.87), so run 9 goes on a checkpoint more before the steer
  reads the guard (`guard inside`, `guard outside`, in code since `f4e4e1525`).
- **Run 9 at 12.07 M**: 7.25 landed a bout-minute (67 of 390, 17%), 2.8 to 3.2 times the
  installed punch's own; a landed blow 0.76 hp, 4 falls; on the sweep 1.02 hp. The bouts' weight
  went back (0.87 to 0.76), and the guard's arm still takes 32%.
- **Run 10 reads the guard**: `moving.layout.json` reads the target's forearms (74 inputs), and run
  10 starts from run 9's 12.07 M policy through the 68-input layout, its kept starts moved aside
  (they hold the learner's inputs), the reward as run 9's.

| Step | State |
| --- | --- |
| 1. Watch it, one bout | bout read, gate passed; the owner's look to come |
| 2. Its own record | done: step 1's bouts replay to the bit, the fingerprint moves no pose |
| 3. Timing and the walk, before the blow | built (`onStep`, `deeper`, `Window.through`); the layout waits on step 4 |
| 4. The weight check | why it grazes is found (the fist ends short); no leg carries the body in; `moving`'s own stroke, the trunk first where the arm does not reach: blows of 0.5 hp from 0.62 to 0.87 m, the strict band 4 cm (the owner's number, 15 to 20 cm wanted); no bouts or Mind work until it is met; why one range gives anything is found (the elbow's hold is which way its motor pushed the step before the touch); braking it at the touch read nothing; the installed punch's weight is a straight arm and a braked wrist, timed by its hips' turn and its network's steer; the hips' turn helps `moving` from 0.74 to 0.845 m only, and takes the legs; the law and the pricing, the body's travel and a turn asked of the legs put to the owner |
| 5. Train it | not begun |
| 6. The bout and the owner's eye | not begun |
| 7. Land | not begun |
