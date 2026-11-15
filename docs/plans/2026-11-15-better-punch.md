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
  and the walk's site as well as steering the swing. Today it borrows the installed punch's
  record and network, trained standing.

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

A run, on the owner's word.

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
  paired, its blows no lighter, toward five times the installed punch's landed blows. On a plateau (5 M decisions with no kept gain) the run stops and
  the report goes to the owner.

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
- **The installed stroke's ceiling is under the bar.** Thrown by `moving` at a target that stands
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
  the pricing change is the owner's to decide; neither is done. Read nothing on the dense sweep,
  not kept: the elbow asked to brake once the fist is within 5 to 20 cm of the target along its
  line (asked for 0, 20, 30 or 35 rad/s in place of 40). At 5 cm and 35 rad/s, 47 of 105 at 0.5
  hp, a median 0.47 (near 16 of 33, between 11 of 24, far 20 of 48), 62 elbows held; against
  `drill-guard` 44 of 99, a median 0.43, beside 41 of 99 and 0.41 unbraked; at 0, every
  elbow held and 40 of 101, the fist slowed to 3.9 m/s; from 10 cm on, fewer, from 15 cm at 0
  rad/s none. An elbow held gives 5 to 8 kg, not 20: of the blows whose elbow held, the heavy
  (12 kg and more) and the light (under 6) hold alike in every freedom; the heavy land with the
  arm straighter (bent 25 degrees against 30 to 41) and the waist still bending forward (8 rad/s,
  holding 165 N m against 91 to 113). The installed punch's heavy blows are another case: at a
  standing target (0.87 to 0.98 m, 23 of 28 at 0.5 hp, a median 0.82, 10.6 kg at 5.6 m/s) every
  freedom is loose at the touch, the elbow too (17 N m), and the arm all but straight (bent 4
  degrees), so a blow along it turns the elbow little. The best blows land late in the extension, the elbow bent 30 to 50 degrees, slowing
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

| Step | State |
| --- | --- |
| 1. Watch it, one bout | bout read, gate passed; the owner's look to come |
| 2. Its own record | done: step 1's bouts replay to the bit, the fingerprint moves no pose |
| 3. Timing and the walk, before the blow | built (`onStep`, `deeper`, `Window.through`); the layout waits on step 4 |
| 4. The weight check | why it grazes is found (the fist ends short); no leg carries the body in; `moving`'s own stroke, the trunk first where the arm does not reach: blows of 0.5 hp from 0.62 to 0.87 m, the strict band 4 cm (the owner's number, 15 to 20 cm wanted); no bouts or Mind work until it is met; why one range gives anything is found (the elbow's hold is which way its motor pushed the step before the touch); braking it at the touch read nothing; the law and the pricing, and the body's travel, put to the owner |
| 5. Train it | not begun |
| 6. The bout and the owner's eye | not begun |
| 7. Land | not begun |
