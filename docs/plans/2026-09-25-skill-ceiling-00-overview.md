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
