# The SIMBICON walk every way and on every body

## Outcome

The SIMBICON walk (`src/core/skills/simbicon.ts`) walks forward at a person's pace on the Warrior.
This plan carries it to the other directions and the other bodies, with their own muscles and no
assist:

- **Every way, on each body, faster than the stride.** The envelope tactics plan by is the slowest
  walk held at every heading. The bar is to beat the stride's (0.7 m/s on the Warrior, 0.5 on the
  Rogue, 0.5 on the skeleton), measured under a rule that also reads where the body went. That bar
  decides whether the game can travel by this walk (`TRAVEL`, `config.ts`).
- **Forward on the Rogue and the skeleton**, toward the Warrior's 1.4 m/s scaled to their legs,
  without the Rogue's overspeed or its fall at 1.2.
- **The Warrior's forward walk and run do not get worse.** Each session reads them again on the
  bed's forward line.

And an answer either way. Where a body cannot reach the bar, the session that finds out names what
binds it, by probe (`--physique`, `--probe` on the bed). A body's limit is then named with a
measurement, and what to change in the body is the owner's.

## Why, from what is measured

Every figure is from the Node stand, Rapier, 120 Hz, and is in the
[roadmap](../roadmap.md#body-and-motor-control) with its harness.

- **One set of settings serves every direction and every body.** `SIMBICON` is the walk of Yin et
  al. 2007, adjusted on the Warrior walking forward. The swinging thigh always leans forward
  (`swingHip` 0.5 rad). To the side and backward the walk asked enters only through the landing
  (`lead`, `leadSide`, `width`) and the balance feedback. Times, the landing's offsets and the
  stance's angles are the same on every body.
- **The bed's lines show it** (`research/locomotion-run.mjs`, 20 s, 3 seeds, calm and 20 N gusts).

  | Line | Warrior: held (made) | Rogue: held (made) |
  |---|---|---|
  | forward | 2.5 m/s (2.06) | 1 (1.16) |
  | right, left | 0.7 (0.62) | 0.5 (0.43) |
  | back | 0.5 (0.26) | none at 0.5 |
  | square | 0.7 (0.63) | 0.5 (0.55) |

  Backward, the Warrior makes half the pace asked. The Rogue walks faster than asked forward and
  falls from 1.4, crouched with the ankle at its dorsiflexion stop.
- **The envelope is 0.5, 0.4 and 0 m/s** (`assets/core/simbicon-envelope.json`). The skeleton
  holds 9 walks of 10 at 0.2 m/s and gets no walk by it.
- **The envelope is blind to direction.** Its walk trial records the pace made along the line asked
  and across it (`along`, `across`, `research/core-stance-trials.mjs`), but the envelope's rule
  counts only falls (`walkHeld`, `research/core-stance-envelope.mjs`). Before the walk set off on
  the leading foot, it went left at 0.56 m/s when asked right at 0.5, and the battery called it
  held. A search scored on falls would find walks that stand and go nowhere.

## What is built

### A rule that reads where the body went

A walk trial is held when it does not fall **and** it makes the pace asked in the direction asked:
its pace along the line at least a share of the pace asked, and across it no more than a share.
The shares are a rule of the envelope (`src/core/control/stance-envelope.ts`, beside
`fastestHeld`), one predicate that the envelope battery, the bed's summary and the search's score
all read. They are the owner's to choose from the session 01 table. The same rule applies to every
walk, so it can move the stance's walk's and the stride's envelopes too (owner's choice 1).

### A gait for each direction, blended

Coros, Beaudoin and van de Panne (2010, "Generalized Biped Walking Control") walk every way with
gait settings that depend on the motion asked. Here:

- The settings the walk reads each step are a blend of three: **forward** (today's `SIMBICON`,
  unchanged), **side** and **back**. They are weighted by the walk asked, as the gait ramps it
  (`memory.forward`, `memory.right`): forward and back by the forward part's square, side by the
  sideways part's. Standing still reads forward's. The blend is continuous, so a turn from one
  direction to another changes no state.
- Only the settings that differ by direction are blended: the swinging leg's angles, the stance's
  angles, the lean, the landing's `lead` and `width`, and the balance gains. Times, strengths and
  the pelvis's hold stay forward's unless a session shows one must vary.
- **Side and back are the part's tuning** (`Part.tuning`, `src/core/mind/parts.ts`). A config
  without them walks exactly as today, so no preset and no bout moves until a session lands their
  defaults. Their defaults start from the paper's mirrored values, then are set by hand on the bed,
  then searched (session 03).
- The run stays forward only. Running backward or sideways is out of scope.

### A gait scaled to its body

A pendulum gait carries to a body of another size by dynamic similarity. Each setting with a
dimension is scaled by the body's leg length L against the Warrior's L₀:

- times by √(L / L₀): `seconds`, `longest`, `settle`, `pelvis`;
- distances by L / L₀: `width`;
- speeds by √(L / L₀): `run`, and the walk asked where `lead`, `leadSide` and the feedback read it,
  so that a step is the same share of a leg;
- angles and shares of strength unchanged.

L is the hip's centre to the ankle's in the reference pose, read from the body's spec. The rule is
one function the skill applies when it is built (`simbicon(body, settings)`). The settings stay
those of the Warrior, and the body scales them. If a body still needs its own after scaling, its
searched settings become a preset's config that fits that body (`Controller.fits`), not a branch
in the skill.

## Decided

- **Forward is not touched.** Its settings, its run and its readings stay. Each session reads the
  Warrior's forward line again and lands nothing that moves it.
- **Measure before tuning.** The rule that reads direction lands first, and no setting is searched
  under the old one.
- **Probe a body before tuning it** (isolate before tuning). The skeleton's fall at 0.2 m/s and the
  Rogue's crouch are read for cause first: twice the strength (`--physique '{"strength":2}'`), the
  ankles' torques doubled (`--probe '{"ankles":2}'`), the ankle's dorsiflexion stop widened (a `--probe`
  option the session adds), and the scaled gait. A cap that a probe lifts is the body's.
- **The rules hold:**
  - no assist (balance 0 %);
  - no strength raised for feel, and a probe is never a setting;
  - a skill's constants say what they do and are tuned freely, and the body's numbers keep their
    sources;
  - the core's arithmetic stays exact: the square root of the scaling is `Math.sqrt`, and the blend
    is products and sums.
- **Speed over ceremony.** Each session gates on `npm run check` and `npm test`. The SIMBICON tests
  of `tests/core-stance-envelope.test.mjs` and `tests/simbicon.test.mjs` run by name. A session
  reads its own lines on the bed. The envelope is measured again only where a session's outcome is
  the envelope (sessions 01 and 06). Eye gates are the owner's in the Lab; when the owner is away,
  they go on the final session's list.

## Owner's choices this plan puts

1. **The direction rule's shares, and whether they apply to every walk.** Applied to every walk, the
   stance's walk's and the stride's envelopes may fall. Those figures decide how fast tactics
   approach in every bout, so committing them moves bouts. The alternative is to apply the rule to
   the SIMBICON walk's envelope only, until the owner chooses.
2. **Whether to spend compute on the searches** (sessions 03 and 05). Each is a CMA-ES run on
   worker threads (`research/cma.mjs`, `research/rollout-pool.mjs`) of an hour or more. The
   hand-set side and back gaits of session 02 come first and may already clear the bar.
3. **What to change in a body that binds**: the Rogue's ankle range, strength, or the skeleton's
   build. The plan's answer is a measurement; the change is the owner's.
4. **Whether `TRAVEL` names the SIMBICON walk** once it clears the bar on every body (session 06).

## Sessions

Each session lands as its own commits, green on the gate, and adds what it found under its
heading. The plan is deleted when the last lands, and what lasts goes to the architecture and the
roadmap.

### 01: the rule that reads direction

- The held predicate beside `fastestHeld`: no fall, along at least a share of the pace asked,
  across at most a share. `walkHeld` (`research/core-stance-envelope.mjs`) reads it. The bed's
  summary (`research/locomotion-run.mjs`) reports the fastest pace held by it beside the fastest
  with no fall.
- A test on recorded trials that shows the rule refusing a walk that went the wrong way and
  passing one that went right (a control for the detector).
- **Reading:** the three envelopes again by the new rule (`--legs stride|simbicon` and the stance's
  walk), as a table beside today's, at two or three candidate shares. Not written to the assets
  until owner's choice 1. The SIMBICON envelope by the new rule is the baseline every later session
  is read against.

### 02: side and back by hand

- The blend, and `side` and `back` as the part's tuning, with their bounds (`validSimbicon`).
- `back`: the swinging thigh leaning back of straight down, the knee lifting the foot clear, the
  landing behind, the trunk upright. `side`: the swinging hip's abduction leading, the landing out
  by the inverted pendulum, the thigh near straight down. Each starts from the paper's walk
  mirrored and is set by hand on the bed's right, left and back lines.
- `tests/simbicon.test.mjs`: the Warrior walks 3 m back and 3 m to each side and stands, each line
  held by the new rule.
- **Reading:** the bed's back, right, left, square and circle lines on the Warrior and the Rogue,
  0.3 to 1 m/s asked, calm and gusts, held by the new rule. The forward line again, unchanged.
- **Eye gate:** the owner watches the Warrior walk back and to each side in the Lab.

### 03: the search for each direction, if the owner asks

- CMA-ES over `back`'s and then `side`'s settings on the Warrior, on worker threads. The objective
  is the fastest pace held by the new rule on that line under gusts, with the square's falls as a
  constraint, each candidate on several seeds. The paired criterion is against session 02's hand
  settings (Cohen's d of the paired margin), never a candidate against its own noise.
- The best become the part's tuning defaults. The search's command and its table go in the commit.

### 04: scaled to the body

- Leg length from the spec, and the scaling rule in `simbicon(body, settings)`. On the Warrior L is
  L₀, so it walks exactly as before. `tests/simbicon.test.mjs` asserts that its settings come
  through unscaled.
- **Reading:** the Rogue and the skeleton on every bed line, scaled and unscaled. On the Rogue,
  forward overspeed and the fall at 1.2 to 1.4. On the skeleton, the walk at 0.2 to 0.5.
- **Probes** where a body still falls: `--physique '{"strength":2}'`, `--probe '{"ankles":2}'`, the
  ankle's stop widened, each leg channel's saturation from the bed's record. The reading names the body's cap or the
  controller's.

### 05: a body's own gait, if scaling falls short and the owner asks

- The search of session 03 on the Rogue, and on the skeleton if session 04 found its cap is the
  controller's. The best become a preset that fits that body, not a branch in the skill.

### 06: the envelope, and travelling by it

- The SIMBICON envelope measured again by the chosen rule
  (`research/core-stance-envelope.mjs --legs simbicon --write`), and its test by name.
- **Reading:** the every-way figure on each body against the stride's. Where it beats the stride on
  every body: owner's choice 4. If `TRAVEL` names it, run the smoke bout and the empty-hand league
  once (`research/empty-hand-league.mjs`), since every humanoid's travel changes.
- **Eye gate:** the owner watches the Rogue and the skeleton walk in the Lab, and travel at
  `&gap=8` in the Arena.

## Out of scope here

- A run with flight. The roadmap records that the body binds it (two legs pushing flat out lift
  the centre of mass at 0.88 m/s; the crouch is held by the ankle's stop). That is owner's choice 3,
  not a controller session.
- Running sideways or backward.
- Fighting on this gait: a blow's footing and a kick need the stance.
- The pelvis's chatter (about a fifth of steps, 2 mrad). It stays open in the roadmap unless a
  session finds it is what fells a direction.
