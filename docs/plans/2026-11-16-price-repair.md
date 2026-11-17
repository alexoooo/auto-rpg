# The price repair

The Option Mind prices closing on a body like its own at three to four times the life it expects
to deal there, and standing a step out of reach at nothing. Aggression 4 (`AGGRESSION`,
`src/minds/option/objective.ts`) covers that; this plan repairs the prices, so a body closes
because the trade is worth it.

## The goal, in the owner's words

> now that we have a good Warrior punch, what's the next step for interesting and dynamic fights
> (we can stay with empty handed Warrior for now)?

> go ahead and land aggression 4, and write the price repair plan

Said before, and standing: "We shouldn't have any rules that prevent a Mind from doing what it
wants, the mind alone should decide the behaviors of the body." So the repair is to what the Mind
is told a choice brings, never a rule that makes it close.

**The owner has set no bar for this plan.** The bar below is the agent's, taken so the work can
run; the owner overrules it.

## What is known

Read on empty-handed Warrior mirror bouts (120 s, Node, 120 Hz, the Arena's rules), with the
Warrior's `straight-punch/moving` at band 0.15 and its profiles of `8f55482d5`; the readings are
in the message of `06e5bec91`.

- **Standing out of reach is priced at nothing.** At 1.1 to 1.4 m apart a hold reads 0 life taken
  over the whole 20 s horizon: the foe's pressure is nothing past its reach (`pressureRateAt`,
  `within`, `src/minds/option/percepts.ts`; about 1.07 m here), and the foe is taken never to
  come.
- **Walking into the punch's window is priced at a loss**: -0.5 to -12 % of a life, taking 1.5 to
  6 % on the one to two seconds in with nothing dealt, and what follows worth about nothing. In
  the window a punch reads 3.9 % dealt and 4.7 % taken in 0.84 s. The trials themselves took 1.2
  to 1.5 times what they dealt, so at aggression 2 a true trade is worth closing for.
- **A hand's profile is about 32 sparring trials** (the Warrior's at a Warrior: 31 and 33, of
  which 3 and 2 began against a foe striking), read by the ten nearest (`NEAREST`,
  `src/skills/framework/profile.ts`). The right hand's expected blow reads 0.75 hp at 0.6 m, 0.03
  at 0.7, 0.08 at 0.8 and 0.64 at 1.0.
- **The foe is priced by the most of its strikes at each range** (`pressureRateAt`), the body's
  own blow by the one hand that throws it: the most of two noisy readings runs high, so the noise
  leans against closing.
- **The edge of the foe's reach is its dearest range** in these profiles: 10.8 % of a life a
  second at 1.0 to 1.05 m, from five or six trials thrown running in. In band 0.2's profiles
  (`53f020d86`) the same range reads about 2.5 %, and there the mirror fought at aggression 2.
- **Not known**: whether band 0.2 fought by its window or by its profiles' draw; and whether the
  Mind's prices still run about three times what a fight gives both ways alike
  ([the approaches](../approaches.md#minds), `aee4b6342`), which was read on band 0.2.

## What done is

The agent's bar, until the owner gives one:

1. **The prices match the fight.** Over the mirror's bouts, the life the Mind expected to deal
   and to take in reach each read against what those seconds gave (as `aee4b6342` read them): the
   two ratios within a quarter of each other, so the error no longer leans one way.
2. **Two Warriors fight at aggression 2.** `AGGRESSION` back at 2, the mirror on 24 start gaps
   that chose nothing is no more silent than it is at 4 today: 37 % of a bout after its first
   punch in gaps over 3 s with no punch begun, 20 of 24 ended by knockout.
3. **The punch's bar holds** in the same bouts it was met in: a Warrior on `moving` against one
   on `drive`, at least five times the landed blows (0.5 hp or more), a median landed blow about
   1.0 hp.
4. **No other pairing is worse**: over Warrior, Rogue and Skeleton, each on each side, no
   pairing's winner changes and none throws less.
5. **The owner watches a Warrior mirror in the Arena and says it is a fight.**

Short of 2 with 1 met, aggression stays where the readings put it and the plan says why.

## The rules this plan is followed by

- **It is run as the punch was** ([the skill recipe](../recipes/skill.md), how the work is run): a
  worker under a goal, a reviewing session as `AGENTS.md` has it.
- **A price is changed, never a choice**: no rule that sends a body in, no floor on a strike, no
  charge for standing that the foe's measured strikes do not give.
- **A reading is believed on 24 to 48 bouts**, counts before ratios, the same gaps before and
  after. A profile's draw moves a bout reading: a change to prices is read on two draws of the
  profiles before it is believed.
- **No skill is trained and no record changed.** Profiles are measured again; `moving`'s stroke,
  window and network stay.
- **A run over half an hour is announced** with its price and what will differ when it ends.

## The steps

### 1. The readers, kept

The diagnosis's readers are scratch (`.tmp/standoff/`, deleted with day-old work). What the plan
reads moves into `research/`:

- **Bouts under a named mind**: `research/skills/strikes/strike-bouts.mjs` takes a mind for both
  sides (the chooser's objective at an aggression), and keeps each bout's winner.
- **Silence**: the share of a bout after its first punch spent in gaps over 3 s with no punch
  begun, punches and landed blows a bout, endings.
- **Expected against given**: in a bout, at each decision, each offer's terms (`engagement.offers`
  of a mind's report: duration, dealt, taken), and what the seconds it priced then gave; summed
  for the choices taken, in reach and closing apart.

**Gate**: the three readings on today's game at aggression 2 and 4, 24 gaps. They are the plan's
before.

### 2. The window apart from the draw

Band 0.15's profiles measured on another draw (`sparring-twin`, the same starts' other stream;
`strike-profiles.mjs` reads only `sparring` and `sparring-laid` today), in a worktree, the
installed profiles untouched. The mirror at aggression 2 on each draw.

- It fights on the other draw: the stand-off is the draw's, and step 3 is the whole repair.
- It stands on both: the window's geometry is in it too, and step 4 is needed.

### 3. A profile that rests on enough

A hand's profile from ten times the starts (`sparring-judge`'s size: 4800 starts a subject where
`sparring` has 480). The price of that run is read first on the 720 trials of the last
measurement and announced.

- Read: the expected blow by range, cell against cell, on two draws of the larger size; then
  step 1's three readings.
- If the run is too dear to repeat with each checkpoint, the lever is the reading instead: a
  wider span of range and more of the nearest (`NEAREST`), read the same way on the profiles as
  they are.

### 4. The prices themselves

Each a lever of its own, read on step 1's readings, in this order; one that adds nothing is
written down in a line and the next is tried.

- **The foe's pressure as the body's own blow is read.** The most of a foe's strikes at a range
  is the most of noisy readings; the foe throws one blow at a time. Read it as the body's own is:
  by the strike the foe would throw there, on pooled trials.
- **The approach.** What the walk in is charged before the body can deal: whether those seconds
  are the foe's whole cycle rate at the edge, or the part of one blow that can land in them.
- **Standing out of reach.** A foe that is priced as never coming makes a refuge of the range
  just past its reach. What the foe's own closing would bring is its to price; the lever is tried
  last, and only as the foe's measured strikes give it.

### 5. Aggression back, and the bar

`AGGRESSION` to 2, its comment and [the approaches](../approaches.md#minds) corrected; the bar's
five readings; profiles installed once, with the change that needs them. What worked goes into
the skill recipe and the approaches, and this plan is deleted.
