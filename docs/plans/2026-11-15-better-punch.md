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
| 4. The weight check | why it grazes is found (the fist ends short; the body must travel into the blow); no leg the game has carries it there in time; next: a push-off into the blow |
| 5. Train it | not begun |
| 6. The bout and the owner's eye | not begun |
| 7. Land | not begun |
