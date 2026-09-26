# Skill ceiling: overview

Ten sessions, 00 to 09. They replace the golem AI's four executors and twenty-one minds with one
control stack. They measure every body by how much a strong mind can get out of it, and change the
bodies and attributes until skill pays. Planned on 2026-09-25.

## The goal, in the owner's words

- A very skilled fighter can take down an unskilled fighter twice their size, as in real life.
- A body with enough control points gives a very high skill ceiling. A very advanced AI on a weak
  body should be able to defeat a strong body driven by a naive AI.
- A body that even the best AI cannot get much out of is a dead end and is removed.
- Every attribute contributes meaningfully, and the AI makes the most of whatever attributes it is
  given. Changing an attribute must not break a mind. Attributes may be changed, added or removed.

## What the record taught

Each item is a measured finding. The mind lessons are in `research/lab/LEARNING-LESSONS.md` and in
the notes of the style and matchup sets. The attribute figures are in
`docs/analysis/2026-09-23-attribute-measurements.md`.

1. **The body has capped the mind.** Ten minds sat inside one noise band until the wrist fix. After
   it they spread from 30 % to 67 %. The style set measured the body as worth about three times the
   mind.
2. **Most damage is not swung.** On `golem-reaper`, 55 % of cutting damage came from a blade held on
   guard or carried in by the feet (`tests/harness/stroke-phase.mjs`). Every executor treats the
   non-striking hand as a fallback.
3. **Perception was blind and nothing said so.** `strokeReader` read "idle" on 82 % of asks, and
   `theirReach` was a constant. Campaigns tuned rules that read them and got flat answers.
4. **The ruler was crooked:**
   - one scalar per bout of about 30 s;
   - a free blade clash at t = 0.067 s worth 13 to 16 % of the damage (the harness's settle only
     partly cures it);
   - v4 minds whose mirror is decided by side;
   - mirrored pools where four of seven weapon classes return exactly 0.500.
5. **Learning won only where the problem was narrow.** RL on the bout result measured an actor
   gradient cosine of about 0 against the fencer. What passed admission was:
   - residuals on the duelist's aim and reach;
   - two hand-written specialists.

   Distillation was starved of data. The teacher replays each bout from t = 0 because the world
   cannot be forked, so it produced four trajectories.
6. **The owner's eye follows structural measures.** Spacing, stalls and changes of lead match what
   the owner sees; scalar proxies did not. Stall and stand-off were measured and never priced in a
   reward.
7. **Freezing each executor to keep ratings comparable did not work.** Every physics change voided
   the ratings anyway. `src/policy-ratings.json` and every fitted table predate physical contact.
8. **Size is decided by the size law.** Size uses dynamic similarity: force goes as s³ and torque
   as s⁴ (`SIZE_LAW_POWER` in `src/golem/attributes.ts`). A larger body is therefore exactly as
   strong for its mass as a small one, and slower only by √s. Size is the strongest stat. It was
   measured only with the four probe minds, so nobody knows what it is worth against skill.

## The owner's decisions, 2026-09-25

- **A human commands and does not puppet.** A person picks whom to attack (click a unit or a
  location) and where to go (click, or WASD). The mind drives the body. The house rule "a policy
  plays with the controller a person plays with" is retired in session 06. Its authority half
  stays: a mind commands only what the body's actuators accept, within their physical limits.
- **Size follows biology.** Force goes as s² and torque as s³.
- **The expert has full knowledge first and a model second.** Inside its rollouts, the expert's
  first instrument runs the opponent's real mind with fresh random draws: full knowledge of the
  policy, no knowledge of its dice. The second instrument uses a model of the opponent. Both are
  kept. Their gap measures how much of a win came from reading one particular opponent.
- **Physics at 120 Hz if it holds.** On the owner's laptop 240 Hz was the bottleneck. Where 120 Hz
  breaks, design around it: a minimum part width, lower speeds, or a speed cap. The measurement
  (`docs/analysis/2026-09-25-physics-rate.md`) found that 120 does not tunnel and does detune every
  drive, and that control costs twice what Havok does. Session 01 therefore slows the control
  clock first, then tries 180, and treats 120 as a retune.
- **Every attribute must pay.** Attributes may be changed, added or removed.
- **A clean break.** The old executors and minds leave the tree once the new stack beats them.
  Git holds them.
- **Many morphologies, and each family may have its own AI.** The golem will get many more legs,
  bodies, weapons and heads. The skeleton gets the same kind of modularity with its own flavour.
  The human stays human. New families will come: animals, zombies, monster templates. Sharing
  across families is welcome and never required.
- **Physics rate and control rate are separate numbers.** A laptop may need the minds' control to
  run at 60 or 90 Hz under a faster solver. 120 Hz physics is free performance if a retune gives
  back everything the bodies and minds could do at 240. Whether it can is measured, not assumed.

## Definitions

These are used by every session. The arguments behind them are in each session file.

- **Naive ladder.** Fixed reference minds of increasing competence: `idle`; a *walker* that walks in
  and swings on a clock (new, in session 03); and `golem-duelist`, frozen as it is today.
- **The expert.** An offline search over the body's command space, run on forked worlds
  (session 04). It is an instrument and never ships. It is body-agnostic by construction, because
  it simulates whatever body it drives, so what it scores on a body is a fact about that body and
  not about whoever wrote a mind.
- **Headroom** of a body at a setting of its attributes: the expert's score on it minus the naive
  mind's score on it, against the same opponent.
- **The three orderings**, which must all hold:

  | matchup | wanted |
  |---|---|
  | equal minds, one body bigger | the bigger body wins, clearly |
  | equal bodies, one mind better | the better mind wins, clearly |
  | the expert at x1 against the naive mind at about 2x mass (size x1.25) | the expert wins most bouts |

  The numbers that "clearly" and "most" stand for are set in session 05 from the first
  measurement, and recorded there. They are not guessed here.
- **A meaningful attribute.**
  - With the expert on both sides, moving the attribute moves the result.
  - The expert's behaviour changes with it. For example, a mind with more reach stands off
    further, and a heavier one presses. That change is measured, not asserted.
  - A step of the attribute is worth about as much as a step of the others. The owner's
    "balance between" attributes is this condition.
- **Fraction of the expert.** How much of a body's headroom a shipped mind captures. It is the
  gate for shipped minds, taken across attribute sweeps. No cliffs are allowed.

## The architecture this set builds toward

```
orders (a person's clicks, or an auto-commander)
  -> decision   any school: rules, search, learned; runs on a compute budget
  -> skills     parametrised, own their channels (legs, trunk, each arm, natural striker), compose
  -> body command surface   task-space targets and footwork; the authority rule holds
  -> body       motors, physics
perception      one module, every reading truth-checked against the simulator
```

The mind decides 10 to 30 times a second, depending on its budget. Skills and servos run on the
control clock, which session 01 separates from the solver's.

## Many morphologies: what is shared and what a family owns

The set is built so that a new morphology costs a family its body and whatever AI it wants, and
nothing else.

| Shared by every family | Owned by a family |
|---|---|
| the fork (02): capture and restore through one interface that every module implements | its modules and their physics |
| drills (03), each declaring the capabilities it needs | which command channels it declares (06) |
| the expert (04), which drives any declared command surface | its skills (08), if it wants any |
| the headroom and attribute audits (05) | its decision minds (09), if it wants any |
| perception primitives, the body card bench, compute accounting (08) | family-specific readings |
| the league protocol and its gates | |

**The day-one AI for any morphology is a planner.** A family that has written no mind yet is
still played by the budgeted planner from session 09, searching its declared command surface
through a learned or fitted model. It is weaker than a family that has written its own skills,
but it works. That keeps the morphology count from being bounded by how many minds anyone has
time to write, and it gives every family's hand-written mind a measured floor to beat.

**Nothing that makes up a morphology can be special-cased.** No shared component may ask which
module, family or weapon it is looking at. It reads declared capabilities and channels. This is
today's rule for golem minds ("capabilities, never module ids", in `tactics.ts`), widened to the
fork, the drills, the expert and the audits.

**A test builds a body that exists nowhere else.** The fork, the drills, the expert and the body
card each run in the suite on a deliberately odd morphology, such as a three-legged,
one-armed build or a wheeled head-rammer. That proves no shared component assumes a biped with
two hands. It is the fixture rule from `AGENTS.md`: choose the fixture by what the defect needs.

**The headroom audit scales by sampling.** Modules combine, so session 05 does not measure every
build. It measures every module in a stratified sample of builds, plus every named build. A
module is flagged as a dead end when the builds containing it have low headroom across the
sample.

## How the set runs

**Front-loaded eye gates.** The owner looks at the fight after session 01 (new rate, new size law,
arms built at guard) and after session 06 (the commander controls). No other session needs the
owner's eye. Sessions 02 to 05 spend no training compute.

**Every session:**

- `npm test`, `npm run check` and `npm run build`, and the line-ending check (`git diff --numstat`
  equals the same with `--ignore-cr-at-eol`).
- New tests are mutation-checked: show each one going red on a deliberate break.
- Every figure names its harness.
- One commit per landable change.
- Before a knob enters a sweep or a search, prove something reads it (`isTableInertRow` in
  `src/golem/stroke-rows.ts`, `tests/harness/reading-variation.mjs`).

**Bodies are versioned from session 01.** A *body release* is a commit whose body fingerprint
(`tests/harness/body-fingerprint.mjs`) is recorded in this set's measurements. Mind work measures
against a named release. A change to a body opens the next release and re-baselines. It never
silently moves the ground under a comparison.

## Sessions

| File | What |
|---|---|
| `-01-body-release-1.md` | A control clock apart from the solver, physics at the chosen rate, the biological size law, arms built at guard, a side-mirror gate. The owner looks. |
| `-02-fork.md` | A forkable world and snapshotable minds. How far a fork stays faithful. |
| `-03-drills-and-league.md` | Drills from constructed start states, the naive ladder, and the league protocol. |
| `-04-expert.md` | The reference expert: full knowledge, then model-only, and how its score grows with compute. |
| `-05-headroom-audit.md` | Headroom and the three orderings on every body; the skill-leverage and attribute audits. |
| `-06-commander-and-command-surface.md` | Orders from a person; the body command surface redesigned for control; the human-parity machinery retired. The owner looks. |
| `-07-body-release-2.md` | Act on the audit: remove dead ends, redesign attributes, add control points, re-measure. |
| `-08-control-stack.md` | Perception, skills and a decision layer; the duelist ported as a regression check; the body card. |
| `-09-shipped-minds.md` | Shipped minds on the stack under a compute budget, gated on their fraction of the expert; the old executors retired. |

## Carried in from physical contact

Session 10 of that set left these open (the file is in git at 30dcb8c). Each one lands in a
session here:

- **Seven idle cells at zero outright wins:**
  - the skeleton against stone, against the human and against the giant;
  - the human against every body.

  "Every body can defeat an idle dummy of every family" stays a gate. Session 05 measures it with
  the expert. That separates a body that cannot win from a mind that does not know how.
- **An idle stone body is felled on almost nothing** against a brawler, most of the time while it is
  rising. It was not diagnosed. Session 05's balance-as-state check covers it.
- **The human's flat blade**, whose edge lead is 0.28 on the stroke bench. Session 08's stroke skill
  owns it.
- **The owner's eye list from physical contact 10** was never walked. Session 01's eye gate replaces
  it, because 01 changes the rate and the size law under every item on it.

## What leaves the tree, and when

| Thing | Leaves in |
|---|---|
| `splitMind`, `handover`, the cursor/pose inverses, `src/buttons.ts`, the takeover UI, the `COMBAT_FIELDS` parity fixtures | 06 |
| `Intent` as the body's command | 06: replaced by the new surface; an adapter keeps the old minds running as benchmarks until 09 |
| `src/options.ts` and the recorder's use of it | 06 |
| `tactics.ts` to `tactics-v4.ts`, `pilot.ts`, the duel and style models, champion tables, style directors | 09 |
| The lab's pilot, direct and residual surfaces, `researched-*.json`, `src/policy-ratings.json` | 09 |
| `golem-duelist`, `golem-miser`, `golem-researched-needle-v1` | kept as frozen benchmark opponents until 09's minds beat them on drills and in the league; then removed |

## For the owner's return

The owner was away from 2026-09-25 and asked for the set to keep going. What needs their eye or
their choice is collected here instead of stopping the run. Each item names where its evidence is.

**Eye checks, on the dev server:**

- **The rise and the falls.** `docs/analysis/2026-09-25-falls-and-rise.md` section 7 lists seven
  things: the rise from each side, the first second after a stand, whether 1.1 to 1.6 s reads as
  slow, the skeleton mirror over a minute, a fallen body's blade, the arms during a rise, and a
  skeleton in a clinch.
- **120 Hz.** Session 01's eye gate: blades that still read as fast and solid, and nothing passing
  through anything.
- **The size trade-off.** Size now runs from x0.8 to x1.1, so the eye gate's x0.8 against x1.25 is
  x0.8 against x1.1.
- **The arrival reading's balance.** In the default mirror the duelist went from 52.1 % to 20.8 %
  and the miser from 40.6 % to 62.5 % (`docs/analysis/2026-09-25-release-120.md`). That was known
  and accepted at 240. It is listed so the fights are watched with it in mind.
- **Orders, in place of taking a body** (session 06, `docs/analysis/2026-09-26-orders.md`). In the
  arena:
  - click the enemy, click the floor, and right-click an attack-move. Orders should be obeyed
    promptly, and a body under a move order should still defend itself;
  - a holding body drifts between 0.3 and 0.8 m of its point while it fights. It should read as
    holding ground, not twitching;
  - WASD steering, which puts the destination 1.2 m ahead in the camera's frame;
  - the order markers.

  In the dungeon:
  - a party of the hero and two companions;
  - selection by key, by row and by click;
  - posts held, and F regrouping;
  - companions passing each other in corridors;
  - the spread when several are sent to one point;
  - the frame cost, especially on Firefox.

  And `/bench.html`'s puppet still drives a module by mouse.

**Choices:**

- **Size is a penalty only** under the biological law: a larger body is weaker and slower for its
  mass, with nothing on the other side of the scale. The plan's first ordering wants the bigger body
  to win between equal minds (`docs/analysis/2026-09-25-size-law.md`). Session 05 measures it and
  session 07 acts, but what size should buy is the owner's call.
- **Should a giant knock a default body down in open ground?** Today it walks it back at its own
  pace, because the tipping rule reads acceleration and not speed. Yes needs a speed rule for being
  pushed back.
- **The skeleton falls about 9 times a minute**, against a proposed band of 3 to 5. Stone and wheel
  are at about 1.4, inside their proposed band of 0.5 to 2. The human never falls. Should it?
- **The whip build loses about 99 % of its bouts** at both rates. It is a dead-end candidate for
  session 05, and the four-bead lash is a design choice.
- **Should the seeds reach the opening?** Today every bout of one mind pairing opens identically
  whatever its seeds, so float rounding between the two mirrored spawns decides a short fight. The
  miser leans left (59.4 % over 186 distinct bouts, pooled over two runs), and the guardian always
  wins from the left, because its fight ends before its seed first acts. Both are listed in
  `docs/analysis/2026-09-25-side-mirror.md`. A seeded spawn jitter would fix it, and would change
  every recorded number. Until then, comparisons play each pairing both ways round, which cancels
  the lean.
- **The expert as the ruler** (`docs/analysis/2026-09-25-expert.md`). Session 05 goes ahead on these
  defaults, and the owner may overrule any of them:
  - the expert is `expert@c8,h1` at 4 decisions a second, about 12x slower than real time;
  - session 05 reports full knowledge and the persistence model side by side, as the plan says,
    because their gap is how much of a win came from reading one opponent;
  - the drill objective keeps its weight on time. The expert then reaches the inside later than the
    walker (0.39 against 0.33 s at n 200). Its first blow on finish lands in 0.103 s, against the
    duelist's 0.096 (−0.007 ± 0.007), so the two are level;
  - or should a drill drop the bout's damage term from its rollouts instead? That term is why c32
    gets inside at 0.84 s against c8's 0.39: it trades 0.029 of task score for 0.065 of predicted
    damage;
  - should the fixed plan list be sized to fit the first round, or ordered per drill? The first
    round takes a prefix of the list: 6 plans at c8, all of them at c32. So the candidates axis
    also changes which plans are tried. back-off-then-cut, last on the list, is reached only by
    c32;
  - `-lag` (one decision stale) is the blinded-fork sanity check, since `-blind` is inert on
    survive-cut.
- **Judging balance on the carried base** is an option recorded by the rate-falls study and not
  taken.
- **Session 07's changes**: session 05's 17 proposals, in `docs/analysis/2026-09-26-headroom.md`
  section 6. Session 07's plan has the owner choose every change, so no body has been removed and
  no attribute retuned. The largest:
  - **Dead end:** `human-unarmed`. Take it off the shelf, keep it as a handicap build, or give the
    fist enough crush to matter.
  - **Cannot win against the reference:** `skeleton-fists`, `skeleton-whip`, and `ram-capped`. The
    capped ram cannot hurt a body that stands still.
  - **The humans kill slowly.** No human body takes down an idle dummy in 60 s. The human arm's tip
    peaks at 12.6 m/s, against stone's 31.5.
  - **The orderings: set the numbers for "clearly".**
    - Skill beats size at 100 % on both families, including the expert at x1 against the duelist at
      x1.1.
    - Size pays the expert on stone (84.4 %), but not on the skeleton (43.8 %).
    - Size hurts the walker on both families (32.3 %): its strokes land worse, at the same rate.
  - **The waist lean ceiling.** `TORSO_WAIST.leanTorque` (1852 N.m) is why an idle stone is felled on
    almost nothing. At its own doc table's 1500 there were 0 falls in 719 s, against 36 in 394 s.
    It has no table beside it.
  - **Attributes.**
    - Movement does not pay and runs backwards.
    - Stability and recovery are unreached in bouts that do not fall.
    - Armour pays about a seventh of the strong four a step.
    - Toughness, arm speed and weight pay a naive mind as much as the expert.

  The follow-up pass after session 05 measures the items the audit says to answer before choosing:
  - 2(b): the skeletons against their own family;
  - 5(b): why a bigger walker's strokes land worse;
  - 6: the waist sweep, with its table;
  - 13(a): stability and recovery where bodies fall;
  - 16: size with the expert on the mace and the maul;
  - 17: survive-cut on the humans.

  Each choice then comes with its table.
