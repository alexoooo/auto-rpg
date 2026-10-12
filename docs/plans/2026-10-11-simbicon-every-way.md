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

**Found.** The shares are `WENT` (`stance-envelope.ts`): along at least 0.7 of the pace asked,
across at most 0.35. The envelope battery's walks (Node stand, Rapier, 120 Hz, 600 walks), fastest
held by falls, then by these shares:

| Walk | Warrior | Rogue | Skeleton |
|---|---|---|---|
| stance's walk | 0.5, 0.5 | 0.4, 0.4 | 0.4, 0.4 |
| stride | 0.7, 0.7 | 0.5, 0.5 | 0.5, 0.5 |
| SIMBICON | 0.5, 0 | 0.4, 0 | 0, 0 |

At 0.5/0.5 and 0.6/0.4 the first two rows are the same; at 0.8/0.25 the stance's walk reads 0
everywhere. So at 0.7/0.35 the rule moves neither walk a bout uses, and it applies to every walk:
owner's choice 1 costs nothing in a bout. The SIMBICON walk fails at 0.2 m/s: backward it makes
0.09 to 0.12 m/s, and its sway across reaches 0.09. No asset is written: the SIMBICON asset is
measured again in session 06, and the other two would read the same.

The bed's baseline by its new figure (the fastest pace asked with no fall and every run making 0.7
of it along the track; 20 s, 3 seeds, calm and a 20 N gust a second; asked 0.3 to 1.4), the pace
made in brackets:

| Track | Warrior | Rogue | Skeleton |
|---|---|---|---|
| forward | 1.4 (1.24) | 1 (1.16) | 0.3 (0.38) |
| right, left | 0.7 (0.62) | none, 0.5 (0.44) | none |
| back | none (0.5 held, 0.26) | 0.3 (0.23) | none |
| square | 0.7 (0.63) | 0.5 (0.55) | none calm |
| circle | 1.4 (1.17) | 1 calm, 0.7 gusts | 0.3 calm, none gusts |

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

**Found.** The blend is `SIMBICON_WAYS` and `simbiconWays` (`simbicon.ts`), over the 21 settings of
`WAY_KEYS`. The part's `tuning` gives `side` and `back` as partial ways, and the faults refuse an
unknown or non-finite one. With side and back set to forward's, the bed's 360 runs came out exactly
as the baseline. The run reads its own settings and is not blended.

- **Back.** Driving the swinging thigh back early (`swingHip` at or below 0.1) lands the foot at
  once, and the walk falls. What carried it was the stance: the stance foot pointed (−0.15, so the
  body bears on the forefoot), the thigh's late angle at 0.1, and twice forward's velocity feedback
  (`cv` 0.4, `cvAnkle` 0.6).
- **Side.** No single setting helped: `swingHip`, `swingSpread`, `width`, `leadSide`, `cvSide` and
  `lean` each did as well as forward's or worse. Side stays forward's and goes to the search.

The bed by the new figure with these defaults (20 s, 3 seeds, calm and a 20 N gust a second, asked
0.3 to 1.4), the pace made in brackets:

| Track | Warrior | Rogue | Skeleton |
|---|---|---|---|
| forward | 1.4 (1.24) | 1 (1.16) | 0.3 (0.38) |
| right, left | 0.7 (0.64), 0.7 (0.62) | none, 0.5 (0.45) | 0.3 calm, none gusts; none |
| back | **0.7 (0.82)**, was none | **0.7 (0.89) calm, 0.5 (0.62) gusts**, was 0.3 | **0.7 (0.96) calm, 0.5 (0.67) gusts**, was none |
| square | 0.7 (0.66) | 0.5 (0.55) | none calm, 0.3 gusts |
| circle | 1.4 (1.17) | 1 calm, 0.7 gusts | 0.3 calm, none gusts |

Back now carries every body at 0.5 under gusts and the Warrior at 0.7. The Warrior falls at 1 m/s
back and to the side, and the side caps at 0.7. Forward moves on no body. `tests/simbicon.test.mjs`
walks the Warrior back and to its left at 0.5 m/s, each held by `wentAsAsked` over 3 s, and stops
it on the stance (its right was already held).

### 03: the search for each direction, if the owner asks

- CMA-ES over `back`'s and then `side`'s settings on the Warrior, on worker threads. The objective
  is the fastest pace held by the new rule on that line under gusts, with the square's falls as a
  constraint, each candidate on several seeds. The paired criterion is against session 02's hand
  settings (Cohen's d of the paired margin), never a candidate against its own noise.
- The best become the part's tuning defaults. The search's command and its table go in the commit.

**Found.** `research/locomotion-search.mjs --kind simbicon --way back|side|forward` searches a way's
21 settings (`WAY_DIMS`) by diagonal CMA-ES, 16 candidates a generation, each on 3 seeds under
20 N gusts. A ladder climbs the paces until one falls or does not go as asked. The start's ladders
are a floor: each pace a body's line or square holds short of the start's, on its worst seed,
costs 1 of the score. Each search took 12 to 28 minutes. Judged on 16 fresh seeds (11 to 26),
paired by seed and line:

- **Back, on the Warrior alone:** 0.82 → 1.40 m/s, d 5.1, better on all 16. But on the skeleton
  this gait falls at every pace where the hand gait walked 0.5. One gait serves every body, so the
  search ran again over all three.
- **Back, on all three:** against the Warrior's gait, the Warrior 1.36 → 1.22, the Rogue
  0.72 → 0.91, the skeleton 0 → 1.39 (d 0.71, better in 33 of 48). On their worst seeds: the Warrior
  0.7, the Rogue 0.5, the skeleton 1. This is the default.
- **Side, on all three:** against forward's, the Warrior 0.63 either way, the Rogue 0.47 → 0.62,
  the skeleton 0.10 → 0.54 (d 0.72, better in 83 of 96). On the Warrior's worst seeds under gusts,
  0.5 where forward's held 0.7. This is the default.

### 04: scaled to the body

- Leg length from the spec, and the scaling rule in `simbicon(body, settings)`. On the Warrior L is
  L₀, so it walks exactly as before. `tests/simbicon.test.mjs` asserts that its settings come
  through unscaled.
- **Reading:** the Rogue and the skeleton on every bed line, scaled and unscaled. On the Rogue,
  forward overspeed and the fall at 1.2 to 1.4. On the skeleton, the walk at 0.2 to 0.5.
- **Probes** where a body still falls: `--physique '{"strength":2}'`, `--probe '{"ankles":2}'`, the
  ankle's stop widened, each leg channel's saturation from the bed's record. The reading names the body's cap or the
  controller's.

**Found.** `legOf` (`simbicon.ts`) measures hip to ankle: Warrior 0.8815 m, Rogue 0.7789, skeleton
0.7900. The Rogue's leg is 0.884 of the Warrior's, so its times go ×0.94. `SimbiconSettings.leg`
names the leg a gait was set for, so a gait searched on another body carries its own. `scaledGait`
scales each setting by its dimension (`DIMENSION`). It also scales the run and each way. On the
Warrior k is exactly 1, and the settings come through as the same object.

Scaled against unscaled, with the Warrior-searched back (bed, gusts, worst of 3 seeds):

| Line | Rogue scaled, unscaled | Skeleton scaled, unscaled |
|---|---|---|
| forward | 0.7, 1 | none, 0.3 |
| right, left | 0.5 and 0.5, none and 0.5 | none, none |
| back | 0.5, 1 | none, none |
| square | 0.5, 0.5 (calm 0.7, 0.5) | none, 0.3 |
| circle | 1, 0.7 | none, none |

Scaling is a 6 % change in time, and it moves each line by a pace either way. The skeleton is on a
knife edge: it falls within 3 s of setting off, its hip and knee at full activation in 79 % of steps.
The rule is kept, since it is the physics. The searches above ran with it, on all three bodies.

Probes on the Rogue and the skeleton (bed, gusts, forward, right, back):

- Twice the strength (`--physique '{"strength":2}'`) is worse. The Rogue walks nowhere forward
  (0.21 m/s at 0.5 asked), and the skeleton stands at 0.3 and 0.5 and falls past them.
- Twice the ankles' torque (`--probe '{"ankles":2}'`) lets the Rogue walk back at 0.7. It costs the
  Rogue forward and right, and moves the skeleton only to 0.3 to the right.
- The ankles' dorsiflexion stop at 0.6 rad (`--probe '{"dorsiflexion":0.6}'`, new) takes the Rogue
  to the right and back from 0.5 to 0.7. The skeleton does not move.

So the skeleton's cap is the controller, not its body: no strength, ankle or stop lets the
Warrior's forward gait walk it. The Rogue is held partly by its ankle stop (0.35 rad), which is the
body's and the owner's choice 3.

### 05: a body's own gait, if scaling falls short and the owner asks

- The search of session 03 on the Rogue, and on the skeleton if session 04 found its cap is the
  controller's. The best become a preset that fits that body, not a branch in the skill.

**Findings.** The cap was the controller's, so forward's gait was searched on all three bodies at
once, which made a preset per body unnecessary
(`research/locomotion-search.mjs --kind simbicon --way forward --models workshop-fighter,workshop-rogue,crypt-skeleton`,
25 generations of 16, seeds 1–3, 20 s, 20 N gusts).

- The first search (`s05-fwd3`) gained a lot (paired on fresh seeds 11–26: Warrior +0.19 m/s,
  Rogue +0.47, skeleton +1.13; d 1.33, 47 of 48 better) but could not stop. Asked for no walk, it
  walked on at 0.35–0.46 m/s, and since every way's blend comes to rest on forward's gait, no way
  stopped. The simbicon and travel tests caught it.
- The objective then gained a stop: on each body, line and seed, a calm walk at 0.3 m/s is asked
  to stand after 6 s, and each run that falls or still goes faster than 0.1 m/s over its last
  second costs 1. Searched again (`s05-fwd3s`), paired on seeds 11–26 against the hand gait:
  Warrior +0.16 m/s (14 better, 2 worse), Rogue +0.47 (16/0), skeleton +1.08 (16/0); d 1.35,
  46 of 48 better, every stop at rest. On their worst seeds forward holds 1.7 m/s on the Warrior
  and the Rogue and 1.2 on the skeleton. It is `SIMBICON`'s forward gait.
- The envelope battery walked off its 20 m ground at 1.4 m/s and read the fall as the gait's. Its
  ground is now 60 m (`GROUND` in `core-stance-trials.mjs`).
- The owner watched the square in the Lab: it overshot each corner, fell strafing right when asked
  faster than the side holds, and at a slower pace tripped walking back. Built for it:
  - the envelope keeps each way's fastest walk (`byWay`, `StanceEnvelope.ways`);
  - a locomotion skill takes a walk asked past what the body holds that way at the most it holds
    (`paceToward`, an ellipse between the ways);
  - the Run brakes for a corner (`BRAKE`, `CORNER_PACE` in `run-mode.ts`);
  - turns are measured walking forward up to the fastest walk forward, not the slowest way's.
- What the battery shows next: slow walks miss `WENT`. Asked for 0.2 m/s back, the Warrior with the
  club makes 0.7 and drifts 0.19 across; at 45° every body drifts left of the way; the skeleton
  falls walking left. So the every-way walk is 0 on each body.
- A step-to-step integral on the speed's error, trimming the landing, was tried at gains from
  0.03 to 0.3 m per m/s, on one step and on the stride. Every gain did worse than none: 45 of 60
  slow trials held with none, 42 to 0 with the trim. Its sign was checked by flipping it, which
  sent the side walks the wrong way. It is not kept.

### The Run's three scenarios (the owner's standing directive)

The owner asked for robustness and speed as the Lab's Run measures it: the circle, the shuttle and
the square, on all three bodies. The bed is the Lab as played
(`research/locomotion-run.mjs --played`: the envelope's caps, the Run's own pacing), 60 s, paces
asked 0.5, 1, 1.5 and 2.5 m/s, calm and 20 N gusts on seeds 1–6. A run's score is the way it made
in 60 s over 60 s, a fall stopping it where it fell.

- **A turn holds only if the body faced round** (`TURNED`, 0.5 rad behind the heading asked as the
  turn ends). The SIMBICON walk turns its heading no faster than its `swerve` over its speed, so
  the old battery read turns of up to 4 rad/s that the walk never took; the Run then asked paces
  for them and swung 5 m wide of the shuttle's half-turns.
- **Turning while setting off falls.** The turn battery's falls at slow walks were turns begun in
  the set-off shift, whose mark across the heading moved as the heading turned: the Rogue at
  0.2 m/s turning 0.5 rad/s fell on 5 of 56, all begun in the first quarter second. The heading
  now holds through the shift, and the Warrior's and the Rogue's turns at 0.2–0.5 m/s read
  1 rad/s (from 0.7 and 0.35). Turns begun in the shift at 1.2–1.4 m/s fall more on the Warrior
  as the heading catches up after it (0.5 → 0.35 and 0.25 → 0 rad/s); the Run never sets off
  into a turn. `swerve` is 1.6 m/s² (0.5, 0.85, 1.2, 1.6, 2.5 and 4 read on the bed, the
  envelope as it was: 0.723 to 0.737, then the Warrior falling on the shuttle), separate from
  `speedup`, and reads the body's own speed where it is faster than the walk asked.
- **Searches that did not carry to the bed.** The forward gait searched on the walk and turn
  batteries (`b3-fwd`, 40 generations, 1.99 → 2.41) read 0.654 against 0.705: the skeleton lost
  its 45° walk and fell on 18 of 28 squares. The side and back searched on the Run itself
  (`--objective played`, under the envelope as it was) read 0.723, but neither sets off from
  standing (backward falls; the side drifts past `WENT`), so the envelope measured again holds no
  side or back walk; their gain was the `swerve` the search took with them.
- **A NaN fell the Rogue on the shuttle**: a straight's radius times a turn of 0 (`carried`).
- **The run overshoots.** Asked 1.4 m/s it goes 1.9–2.0, and the walk it gives way to brakes at
  `speedup`, so it reached the half-turn at 1.8 and fell. It ran at all because a walk capped at
  1.4 came out one unit in the last place over the run's 1.4; the run now needs the walk asked
  `past` it. It gave way only once the body was slower than the run's pace, which it never was;
  now once the walk asked is `below` it. Its landing's speed gain at 0.15, 0.3 and 0.5 changed
  little (forward line, 1.5–2.5 m/s asked).
- **The Run's pace**: braking for each bend over the whole distance it takes, from where it is
  (a look back crawled the shuttle's first 6 s after each half-turn at the half-turn's pace); and,
  facing along the track, no faster than its turns carry it round the arc from its heading to the
  point it aims at.
- **The slow back walk** was searched on the walk battery itself (`--objective battery`: each
  hold's `quality`, near misses earning part, and no faster than `OVER` of the pace asked):
  every body now walks back as asked from 0.2 m/s, the Warrior and the Rogue to 1.7 and the
  skeleton to 2 (calm, `b1-back`, 60 generations of 20).
- **The side walk** was searched the same way on the right, the left and 45° (`b2-side`), and the
  envelope read at finer rates (the SIMBICON's turns at 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2 and 4 rad/s).
- **Setting off facing away fell.** A walk asked with the face 90° off the body's heading turned
  the heading while the first step shifted the weight onto one foot, and the body fell back at any
  turn rate; the travel test's Warrior, built side-on to its foe, never closed. Past `SET_OFF`
  (0.35 rad) the stance now turns the body where it stands, and the walk sets off once it faces
  near the way asked. Walking the way asked in the world while the heading lagged (the walk turned
  into the heading's frame) fixed the travel too, but the shuttle's half-turns then asked the
  skeleton's weak side walk, and it fell 27 times in 28.
- **What made no gain.** A trim of the walk the feedback aims at by a share of each step's speed
  error (0.3, at most half the pace) made the Warrior's side walk exact to 0.7 m/s and felled it at
  1, where it had made 0.73; the skeleton's side walk, steady only near its own pace, fell from
  0.3 m/s; and the forward walk's overspeed at 0.7 did not move. A `speedup` and Run `BRAKE` of
  1 m/s² felled 78 of 252 (0.539).
- **The 45° walk drifts forward** because the forward gait overspeeds at slow paces (0.2 asked goes
  0.35–0.39, 0.5 goes 0.6–0.74), and the side and back are now accurate.

| bed | circle W / R / S | shuttle W / R / S | square W / R / S | falls |
|---|---|---|---|---|
| before (3 seeds) | 0.92 / 0.84 / 0.91 | 0.41 / 0.29 / 0.61 | 0.13 / 0.52 / 0.11 | 22 of 144 |
| run, pace, swerve | 0.92 / 0.84 / 0.91 | 0.53 / 0.47 / 0.55 | 0.13 / 0.52 / 0.12 | 13 of 252 |
| back searched | 0.92 / 0.84 / 0.91 | 0.53 / 0.47 / 0.55 | 0.69 / 0.61 / 0.20 | 8 of 252 |
| no look back | 0.92 / 0.84 / 0.91 | 0.57 / 0.55 / 0.57 | 0.69 / 0.61 / 0.20 | 8 of 252 |
| side searched, fine rates, set-off turn | 0.97 / 0.84 / 0.91 | 0.58 / 0.56 / 0.57 | 0.64 / 0.56 / 0.51 | 11 of 252 |
| Run braking 0.3 m/s² | 0.97 / 0.84 / 0.91 | 0.65 / 0.62 / 0.62 | 0.65 / 0.58 / 0.51 | 10 of 252 |
| swerve 1.6, heading held through the set-off shift | 0.98 / 0.84 / 0.91 | 0.77 / 0.71 / 0.78 | 0.65 / 0.58 / 0.51 | 10 of 252 |
| faced 1.25 m ahead along the track (`AIM_ALONG`) | 0.98 / 0.84 / 0.92 | 0.79 / 0.74 / 0.81 | 0.65 / 0.58 / 0.51 | 10 of 252 |
| braking for bends 0.3 s early (`LEAD`) | 0.98 / 0.84 / 0.92 | 0.81 / 0.75 / 0.82 | 0.65 / 0.58 / 0.51 | 10 of 252 |

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
