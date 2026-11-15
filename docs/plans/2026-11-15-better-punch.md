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
   damage) and dramatically more often". Read as **at least twice the installed punch's, in the
   same bouts**: its landed blows a minute, and the median hp a landed blow takes. Twice is the
   agent's reading of "dramatically"; the owner's word changes it. Counts first: begun, thrown
   with a foot swinging, landed, missed, guarded, fell; then hp a landed blow, kg behind the fist
   and J on the mark.
3. **The Warrior holds it in the game.**

## The rules this plan is followed by

- **Every step changes `moving`** (its code, its record, its layout or its network) or is a look
  that takes minutes. A report names the files of `moving` that changed, or says none did.
- **Nothing re-measures or re-fits the installed punch.** Its readings are saved; they are read.
- **A run over half an hour starts on the owner's word**, given its price and what will be
  different in the game when it ends.
- **A gate that fails stops the work** with a report. The next step is then the owner's, not a
  wider search, a longer run or a new tool.
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

- **`straight-punch/moving`, registered**: `moving.json` holding today's punch exactly (`drive`'s
  settings with `MOVING` over them, `drive`'s network as its start), its meta and loader.
  `moving` reads it, not `drive`'s.
- **The tools take the variation**: the exporter (`punch-export.mjs`), the trainer's mind
  (`presetMind`, `research/case-learning-environment.mjs`), so that training writes `moving`'s
  record and never `drive`'s.
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
- **Gate**: the median hp of its landed blows is at least twice the installed punch's in step 1's
  bout (done, 2). Training is not counted on to double it: if walking into the punch on the step
  does not, the work stops here, before any training, and the owner chooses what next (a gait
  that steps in, trained once for every strike, among the ways).

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
  paired, its blows no lighter, toward twice the installed punch's landed blows a minute. On a plateau (5 M decisions with no kept gain) the run stops and
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
  720 land, 0.008 fall, a median 0.38 kg and 4.0 J. It has never been watched or read in a bout.
- **The installed punch in fights**: over 1,869 kept fight moments it lands 375, misses 752,
  meets the guard 370, never gets into its window 213 and falls 68.
- **Retraining the installed punch's network read flat** (0.95 of where it began): a run is not
  assumed to beat where it starts.
- **The risk**: `moving`'s weight came from the legs it no longer drives. Whether walking into
  the punch on the step doubles what the installed punch's landed blows take in a bout is read
  at step 4, before any training. The bar is the installed punch in bouts, where the owner sees
  it graze, not its 4.5 kg at a target that stands.

## Where the work stands

| Step | State |
| --- | --- |
| 1. Watch it, one bout | not begun |
| 2. Its own record | not begun |
| 3. Timing and the walk, before the blow | not begun |
| 4. The weight check | not begun |
| 5. Train it | not begun |
| 6. The bout and the owner's eye | not begun |
| 7. Land | not begun |
