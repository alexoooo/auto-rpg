# Physical contact 10: re-measure, write up, and the owner's eye list

## Re-measure

1. **Rerun all nine stat sweeps** on stone with the four probe minds and on the skeleton duelist
   mirror, at 192 blocks and at their current row levels. Every earlier table was measured against
   the old contact model and is void.
2. **Rerun the three giant presets** against x1.
3. **Re-derive each attribute row's `min` and `max`** from the new benches where a bench set them.
   Record any row whose range moves.
4. **x1 balance against session 01:**
   - stone, skeleton and human mirrors;
   - knockdowns, damage, bout length, and time spent down;
   - the stuck-down and downed-target censuses;
   - the stun-lock figures, for the owner's call;
   - the idle-dummy matrix, which must have no cell at zero wins.

## Write-up

- **`docs/analysis/2026-09-23-attribute-measurements.md`** gets a new "Physical contact" part:
  - the baseline;
  - what each session moved;
  - the new sweep tables.

  Each old stat section gets one line saying it was measured against the old contact model, with the
  new table beside it.
- **Row comments** in `src/golem/attributes.ts` take the new figures.
- **`AGENTS.md`** gets a trap or a rule for anything this set paid for.

## Final report

For the owner, in this order:

1. **The headline numbers:**
   - giant against x1;
   - x1 balance;
   - the censuses;
   - the lift and push counts.
2. **Chosen on the owner's behalf.** Every owner-level choice a session made with the recommended
   default, each with where it lives and how to reverse it.
3. **Anything a session stopped on** or left open.
4. **The owner's eye list** below.

## What landed

Commits 9e25d3f to e762c74, 2026-09-25. Every figure names its harness in the measurements doc,
"Physical contact 10".

- **The balance response** (the owner's "do option 3"). A body walked into leans, steps back past its
  lean, and is tipped only when outrun, and the pair resolver follows a body that gives way; the
  equal-weight exception is gone. Stone walking into an idle stone for 3 s moves it 0.009 m at x1,
  0.99 m at weight x1.1 and 8.98 m at x2, and only the giant tips it (Node headless arena).
- **Every stat re-measured, twice.** Once at 567350a (`research/runs/pc10`) and once under the
  balance response at 231403a (`research/runs/pc10b`), 384 bouts a level, stone with the four probe
  minds and the skeleton duelist's mirror. No level of any stat moved outside its interval between
  the two, so the contact model's readings replicate. Each attribute row's duel paragraph now quotes
  them.
- **What the contact model did to the stats**, against the attributes set's readings: weight and size
  now win on both bodies (size is stone's strongest, 84.9 % at x1.25; weight x2 79.7 %), where stone
  used to lose by both; stability barely matters (46.1 % to 48.2 % across x0.5 to x2); recovery is a
  small cost below x1 and no gain above; toughness and the skeleton's armour are where they were.
- **The giant, the censuses and the idle matrix** did not move under the balance response: the giant
  wins 99.2 % at max, stone falls 0.33 times a body a bout and the skeleton 9.64, and the same seven
  idle cells are at zero outright wins.
- **Ranges**: no row's `min` or `max` moved. Recovery's ceiling stays x1.25, with stone above it read
  only in a 3 s window (see "Left open").

## Left open

- **Seven idle cells at zero**: the skeleton against stone, the human and the giant, and the human
  against every body. The overview's floor ("every body can beat an idle dummy") is not met; it was
  not met at session 01 either.
- **An idle stone body is felled on almost nothing** against a brawler: 56 falls in four 60 s bouts
  (67 at 567350a), most while it is still rising, the first from standing on a weakest-direction
  fall line of 0.014 m/s (`.review/pc10/idle-falls.mjs`, Node bout runner). Not caused by the
  balance response; not diagnosed.
- **Stone's modified corner falls more often at either end of the weight row** than in the control
  mirror (2.06 a bout at x0.8, about one from x1.1 up, against 0.52). Not explained.
- **Stone recovery above x1.25** was read with a 3 s window per shove against the 7 s below it. A 7 s
  re-read needs a Node load hook that the session's permission classifier blocked; it waits on the
  owner's approval.
- **The human's flat blade** and **the skeleton's stance** (sessions 08 and 09), both on the eye list.

## The owner's eye list

Collected from every session. Look at each on the dev server after the set is done. Each item names
the build and what to look for.

- **02:**
  - a body rising beside an opponent standing over it;
  - a body rising off a wall;
  - a skeleton knocked down mid-rise;
  - a grounded body swinging, worse than standing but not limp;
  - the worst stun-lock chain found, by build and seed. The owner decides whether physics alone is
    acceptable here;
  - stone, the wheel and the multileg lifted by the rise at the end of the 0.35 s dwell, before
    their fall has finished. Only the skeleton's table waits for rest; a general settle rule would
    be the follow-up if it reads as a puppet being picked up;
  - a maul from the floor: at `GROUNDED_TONE` it barely swings (3.8 m/s at the mark against 12.1
    standing, Node golem bench). Weak is the brief; check that it reads as weak and not as broken.
- **03:**
  - a standing golem finishing a fallen one with a blade, a mace and a fist;
  - the fallen one swinging and guarding back from the ground, weakly;
  - a skeleton finishing a skeleton: it touches the downed body in 87 % of the windows in reach and
    scores in a third of them, because its blows land under the energy floor.
- **04:**
  - the stone body walking, turning and falling at 247 kg, which is 2.7 times what it was. Its leg,
    waist, neck and wheel torques went up by the same factor, and the Node locomotion bench reads the
    walk as before; the owner has not seen it;
  - stone fights are shorter: a median x1 mirror ends in 13.4 s against 28.8 (mean 17.7 against
    32.9). A heavier trunk recoils less, so more blows land and each lands harder. Check that it reads
    as heavier bodies and not as a harder game.
- **05:**
  - **the capped socket barging** (`ram-capped`). Its bare cap is bolted to a 250 kg body, so what
    arrives behind it is a median 79 kg against the 0.567 kg it declared, and on the same contacts
    its summed shove damage is 40 times what it was. Check that it reads as a barge that ought to
    hurt, and not as a cap that one-shots;
  - **the ram at a fifth of its pace.** A lunge on a free post now arrives under the blunt floor
    and is filed as a shove. The ram had always declared the neck and trunk behind its plate, and
    every arm gained its chain for the first time, so one price across bodies moved it down. The
    lever is `HEAD_RAM.lunge.driveTorque`;
  - **the rest of the shelf, at one price across bodies.** Summed damage on the same contacts is
    x0.69 for the mace, x1.40 for the maul, x0.50 for the whip, x1.37 for bare fists and x1.53 for
    the skeleton's blade (Node harness, offline re-score). Check that the maul reads as heavy and
    the whip as light, rather than as broken;
  - **the heaviest blows are slow and near the hilt now.** The largest wound in 64 stone mirrors was
    6.48, a sword that was closing at 1.31 m/s and sliding at 27.8 m/s, 0.79 m from its tip, with
    14.9 kg behind it. The draw pays for it. Before, every blow above the 99th percentile was a tip
    moving at about 21 m/s. Check whether a drawn cut near the hilt reads as a blow;
  - **the human at half its pace.** Its light arm couples less than its blade declared (0.74 of it
    at the median contact), so its sword summed x0.51. Session 09 owns its stand-off.
- **06:**
  - no authored push is left: a blow moves a body by what the solver does with it, and a fall comes
    from the ledger. Check that a blade still reads as pushing;
  - a parry pushing the parrying body back;
  - stone mirrors spend about 21 % of a bout down, both bodies;
  - the x1 body against the max giant, down for half the bout;
  - the giant's stun-lock chains, up to 18 knockdowns each within 2 s of the rise before.
- **07:**
  - the all-max giant lifting and launching a x1 from below. Measured, it tips the x1 rather than
    launching it: 0.14 to 0.63 m/s upward and 9 to 37 mm of rise;
  - pushing one back;
  - two x1 bodies pressing together with neither lifting;
  - the x1 body against the max giant, down 75.5 % of a bout, with 84.1 % of its knockdowns within
    2 s of a rise and chains of up to 20;
  - a body walked into in the dungeon stops rather than being shoved.
- **08:**
  - **stone knockdowns are rare now**: an x1 stone mirror falls 0.49 [0.34, 0.66] times a body a
    bout, against session 01's 4.93, because every contact is filed at its physical impulse and the
    blow gain is gone. Check that it reads as heavy bodies rather than as a missing mechanic; a gain
    on a scored blow's filing is the lever if not;
  - **the skeleton on its feet, and a choice**: it falls 16.5 times a body in an x1 mirror and is
    down 64 % of the bout, a parry felling it as readily as a blow, because its centre of mass stands
    outside its feet in 36.3 % of its standing time. The mace skeleton's fall impulse is 0 at rest.
    A leg-rotation stance (not in the tree; see "Chosen on the owner's behalf") takes the knockdowns
    to 11.4 at the price of walk-start foot slip over budget. Watch a skeleton mirror and a mace
    skeleton standing still, and say whether its falls read as a top-heavy body or as a broken one;
  - stone, the wheel and the multileg lying until their fall has stopped, then rising in about
    2 s, where they used to rise after a frozen 0.35 s whether or not the fall had finished;
  - a blow to the head rocking a body more than one to the belt, and a blow at the shins barely
    at all.
- **09:**
  - **the human's flat blade**: its arm's roll is a quarter turn from the stroke table's, so its cuts
    lead with the flat (edge lead 0.28), and it holds at the very end of its reach. It still wins no
    idle cell outright. Turning the roll leads with the edge but misses by 0.40 m, so the fix is the
    arm's own orientation solve and not a constant;
  - a heavier body pressing a lighter one to push range: stone on a human or a skeleton, the giant on
    anything;
  - the heavy mauls swinging at the arm's pace and straying 125 to 173 mm off their anchor;
  - an outreached body holding at its own reach rather than outside the other's.
- **10:**
  - the all-max giant against a x1, which should look and win like a giant;
  - a heavier body walking a lighter one back, and a giant putting one down by walking into it;
  - two bodies of one weight shouldering, neither giving ground, and neither leaning visibly (the
    lean is read, not drawn).
- **Carried from the attributes set**, still unchecked:
  - the attribute sliders in the arena setup corners and the dungeon hero dialog, with Reset and a
    URL round trip through a navigation;
  - the read-only line in the HUD diagnostics;
  - foot slip at movement x1.5 and turning x1.5;
  - the whole body at size x0.8 and x1.25.

## Chosen on the owner's behalf

Each entry names the session, the choice, where it lives and how to reverse it.

- **01, "within band".** An x1 control is within session 01's band when its 95 % bootstrap interval
  over blocks overlaps 01's, for per-body damage and knockdowns a bout. `research/control-band.mjs`
  reads both. To reverse it, name a different criterion in the overview's gate list.
- **01, the idle floor is an outright win.** A win through the 60 s overtime drain is shown beside
  it and does not count. `summarizeIdle` in `research/idle-dummy.mjs`.
- **01, the idle matrix runs 12 side-swap blocks a cell** (24 bouts, `--blocks 12`), not 24 blocks.
- **02, rising belongs to the body.** `recover` left the command: once the fall has settled and the
  dwell has run, a body rises whatever its mind asks. `risingEligibility` in
  `src/supported-locomotion-state.ts`. Reversing it would put the house rule "recovery cannot
  require the support state it exists to restore" back at the mercy of a mind that holds still.
- **02, `RISE_POSTURE_DEADLINE` = 2.** A rise that has not reached posture by twice
  `RISING_DURATION_S` goes back to `fallen` and retries. `src/supported-locomotion-state.ts`;
  `Infinity` restores the old wait-for-ever.
- **02, the relocation ring.** A refused recovery searches rings `RECOVERY_RING_STEP_M` (0.1 m) apart
  with `RECOVERY_RING_ANGLES` (16) candidates each, out to the reach the rise's acceleration bound
  allows in its floor duration (48 m/s² x T² / 6), trying angles away from the nearest occupant
  first. `findRecoveryTarget` in `src/supported-locomotion-production.ts`.
- **02, a wall may be left.** A sweep that starts inside a wall's band may leave it inward and is
  refused only if it ends in the band or never clears it: the flat arena's wall in
  `flatSupportedWorldRegistry` and the dungeon's solid in `buildDungeonWorld`. Without it a body
  that fell against a wall could not rise.
- **02, the fall ledger is zeroed as the rise begins.** A rise is then felled by a fresh fall-level
  blow and not by the ledger of the fall it is rising from. The fallen-to-rising edge in
  `src/supported-locomotion-state.ts`. Carrying it would make every rise fall at the first touch.
- **02, `GROUNDED_TONE` = 0.55, and a grounded body keeps its whole command.** The lowest tone at
  which every arm's stroke stray stays within twice its standing figure; the table is on the
  constant in `src/golem/golem.ts`, from `research/grounded-tone.mjs`. It replaced the skeleton's
  limp 0.08 with a neutral command, and full strength on every other body. A different value is one
  number; going back to limp means re-adding a per-body tone and the `NEUTRAL` override in
  `Golem.applyIntent`.
- **02, a rising carrier stands still.** While a body rises, its carrier ignores the mind's walk
  request, as a fallen one does. The rise owns the root, and a carrier walked off the rise target
  led the other body into it and had the rise refused. `PhysicalSupportedLocomotionPort.proposal`
  in `src/supported-locomotion-production.ts`. Reversing it would need the rise target to move
  with the carrier instead.
- **03, "in reach" for the finishing target.** A one-second window counts toward the target if, at
  any frame of it, the standing side's socket came within its own published `reach` of the downed
  body's core. `inReach` in `research/census-worker.mjs`. A stricter reading (the whole window in
  reach) would shrink the denominator and raise every share.
- **03, a downed body publishes no reach to stand off from.** While the other body is `fallen` or
  `rising`, the stand-off floor that its reach sets is zero, so each mind holds at its own strike
  range, and every stroke aims at the live core. `standOffReach` and `finishPoint` in
  `src/downed.ts`, called by every golem executor. Reversing it is one line in each helper.
- **03, `CHAIN_REACH.liftMin` stays at -0.95.** Strokes already touched a downed body in 87 to 99 %
  of the in-reach windows, so lowering the envelope would buy contact that already happens.
  `src/golem/config.ts`.
- **04, stone's body density is 1300 kg/m3, and "an arm cannot lift a body" is read per arm.** Half
  of solid stone, the lightest round density at which the strongest x1 stone arm falls short of an
  x1 stone body's weight by 1.25. Two x1 arms together still lift an x1 body (3876 N against
  2425 N); holding that as well needs about 5.5 times the shipped body, which is past solid stone.
  `STONE_BODY_DENSITY` in `src/golem/config.ts`, with the table. A different density is one number;
  every body torque follows it through `onBody`.
- **04, the ram's plate is at the body's density.** `HEAD_RAM.plateMass` is `bodyKg` rather than
  `kg()`, and `impactMassKg` follows it, because under `kg()` no torque factor restored the lunge:
  the hinge's inertia grew by less than its torques. It is still an item to the weight and size stats
  (`RAM_SIZE` in `src/golem/head/head.ts`), which is a separate rule. `src/golem/config.ts`.
- **04, the holding repair is a per-family ratio, not a global rescale.** The plan said to rescale
  `STAGGER_SPECIFIC_IMPULSE_MPS` and `FALL_SPECIFIC_IMPULSE_MPS`. Those two literals are shared by
  every family, and the skeleton and the human did not get heavier, so a global rescale would have
  made them easier to fell. So each family names the factor its own supported mass grew by
  (`StabilityAuthority.stabilityMassRatio`, 2.727 for the stone biped, 2.809 for the wheel, 2.768
  for the multileg, and 1 pinned on the skeleton and the human). A shove is read against
  `supportedMassKg / stabilityMassRatio`, so every family falls at the newton-seconds it fell at
  before; the decay stays put, since it is in the same units as the ledger. Sessions 06 and 08
  replace the ledger, and the ratio goes with it. `stabilityMassKg` in
  `src/supported-locomotion-state.ts`.
- **04, the human and the skeleton pin what they inherited from stone.** Leg, waist and neck torques,
  the bench shove and a ratio of 1, at the shipped values, because their masses did not move.
  `HUMAN_BIPED`, `HUMAN_WAIST` and `HUMAN_HEAD` in `src/golem/humanoid/body.ts`, `SKELETON_BIPED` in
  `src/golem/skeleton/body.ts`. The human's anthropometry check found nothing to correct; the
  skeleton was not re-tuned (see session 04's "What landed").
- **04, the skeleton keeps its mass, 25 % of the human's without items.** A reference man's skeleton
  is about a seventh of his body (ICRP 89), which would make it about 15 kg against 26.78. Lightening
  it would double the lift ratio session 04 was told to report rather than fix, and would move every
  skeleton baseline sessions 05 to 08 measure against. `SKELETON_*` masses in
  `src/golem/skeleton/body.ts`; to reverse, scale them by 0.56.
- **04, the knockdown gate is red and the set went on.** Stone's x1 knockdowns a bout fell out of
  session 01's band because stone bouts got shorter, not because a body got harder to fell: per
  second they rose. Restoring the count would need a per-second rate 60 % above session 01's, which
  is not a holding repair. The knockdown gate lapses at session 08, and session 05 recalibrates the
  energy a blow carries, so neither is served by moving a threshold here. To reverse it, rescale the
  ratios down by the bout length.
- **05, the effective mass reads the solver's inertia, not each part's solid.** The plan said the
  chains' floors (`jointInertiaFloor`, `castToCarried`, the human arm's `inertiaFloor`) were
  conditioning to leave out. The stroke overruled that. Into a 90 kg sphere, the solver's properties
  read 0.89 to 14.77 kg against a stroke's 0.96 to 11.76 (Node impact bench). The parts' own solids
  read a max wrist blade no heavier than an x1 one, 0.82 against 0.77, where the stroke reads 3.41
  against 1.47. `src/body-inertia.ts`. To reverse,
  pass `inertia: "geometric"` at `Combat`'s two `effectiveMassAt` calls.
- **05, the tolerances.**
  - Against the bench's edge tap, the walk must agree within 5 %. This is what the joints-free model
    and the tap both measure, and `the_walk_reads_what_the_solver_does_at_an_edge_tap` pins it.
  - Against a stroke, the model is within about a quarter either way. The worst cases are the x1
    wrist blade (1.11 against 1.47) and the max maul (14.77 against 11.76). This is reported, not
    pinned, because a stroke also carries what the next choice leaves out.
- **05, a joint on its stop is not modelled.** The joints are free at the instant of contact. With
  the stops left in place, the max mace gave up 7.51 kg against the walk's 4.50. Modelling a stop
  means knowing which joints are on one at the contact. `src/body-inertia.ts`.
- **05, the price anchor holds pace, not damage per bout.** The vitality bar binds damage per bout,
  so the anchor is the summed contact damage of x1 bouts. Those were recorded on the declared-mass
  tree and re-scored offline through `scoreHit`.
  - The edge factor is x1.783, anchored on the default build (13879 contacts).
  - The blunt factor is x3.786, pooled over default, mace and maul (41189 contacts). The default
    alone read 3.660, the mace 3.085 and the maul 4.974.
  - Each floor moves by the same factor as its price.
  - `chopJoulesPerDamage` takes the edge's factor, because no live striker chops.
  - The point floor stays, because the only point is an arrow, and an arrow's mass is still its
    own.
  - Where: `CONFIG.combat` in `src/config.ts`, whose header has the table. Per-build anchors,
    rather than one price for every body, would be a rule about bodies in a table about blows.
- **05, no ceiling on a big body's strike mass.** In `tests/attributes.test.mjs`, size must never
  lower what a blow arrives with, and must raise it behind a ram and a capped socket. No test caps
  it. An item keeps its length while the joints behind it move out, so the lever changes shape as
  well as size: a skeletal fist reads 3.46 times heavier at x1.25. Weight does keep its ceiling (at
  most xL), because it scales masses and no lengths.
- **05, the ram is left weak.** A lunge on a free post arrives under the blunt floor, and the ram's
  summed pace is x0.20. It had always declared the mass behind its plate, and every arm gained its
  chain for the first time. The lever is `HEAD_RAM.lunge.driveTorque`, which is left for a session
  that sets the ram's pace on purpose. The ram's test now pins the lunge as a shove.
- **06, nothing is applied to a struck body.** The solver pushes it already, and what `J` would
  add on top was measured at 0.23 of `J` against a quiet frame's 5.92 N.s of motion. The transfer
  goes to the ledger only. `Combat.transfer` in `src/combat.ts`. To reverse, apply `J` at the
  struck point there.
- **06, restitution 0.** Session 01's impact bench read every impulsive stroke off a free sphere at
  -0.17 to +0.09, median -0.02, which brackets zero; the whip's 0.27 is a rope's rebound and is left
  out. `CONTACT_RESTITUTION` in `src/scoring.ts`, one constant for every pair.
- **06, one factor for all three ledger lines**, 20, read off stone x1 knockdowns. The decay is
  scaled with the two thresholds because it is in the same units. `SUPPORTED_LOCOMOTION_V1` in
  `src/supported-locomotion-state.ts`, with the sweep. Session 08 replaces the ledger.
- **06, fixtures moved with the push.** The searches in `tests/research-physical.test.mjs` take the
  seeds and the mind they now stop on, and every count is re-pinned rather than loosened.
- **07, an arm's torques follow the weight stat.** The reach core's yaw, shoulder and elbow torques,
  the pitch hinge's torque and the human arm's `TORQUES` scale with it, alongside the links' masses;
  the wrist's roll and bend turn the item and do not. The plan's "torque follows length" was read
  off a split that blamed length, and the bench says weight: at size x1.25 the reach blade held
  2656 N, and with weight x2 as well, 1844 N. `withWeight` in `src/golem/attributes.ts`. To
  reverse, take the torques out of its list.
- **07, arm speed cuts lift, and nothing was done about it.** Size x1.25 with arm speed x1.5 holds
  1969 N against 2656 without it (Node lift bench). `JointServo.track` is a velocity motor, and a
  rate should not cut force. It is open.
- **07, a contact is a blow for its first 50 ms** (`CONTACT_PRESS.BLOW_S`, `src/contact-press.ts`),
  past the longest impulsive stroke session 01 measured (38 ms). Within it, `Combat`'s transfer
  files the contact; after it, the press does. One source per contact.
- **07, a body that is not standing presses nothing.** A leg set down on a heap read 3.64 times the
  standing body's weight upward, because the standing carrier holds its height by keyframe.
  `PressSource.standing`. To reverse, count fallen and rising sources, and expect lifts from every
  body that steps on a downed one.
- **07, a source pushes no harder than its grip and lifts no more than its weight.** The solver's
  reading failed both ways: a keyframed carrier pushed at up to 9.3 times an x1 body's grip, and
  limbs squeezed between two carriers "lifted" x1 bodies at up to 2.09 W, where a whole x1 arm holds
  0.80 W. `GRIP` is 0.55, the sole's friction. With both caps, two bodies of one weight can never
  push or lift each other, which replaces the plan's reading that two x1 arms lifting is the rule
  working. `ContactPress` in `src/contact-press.ts`.
- **07, walking into a body is a grip rule, not a mass split.** *Superseded by session 10's balance
  response below.* A closing body pushed the other with its own grip, and each carrier resisted with
  its mass, so an equal walker never shoved -- and a walker any heavier tipped what it walked into,
  because what was past the grip went to the ledger whole. Keyframed trunks report no contact to each
  other (0 events in 16 bouts), so the solver cannot decide this.
- **07, the dungeon has no pair push.** Its group resolver stops a body that is walked into; an arm's
  press still reaches it. `src/dungeon/run.ts`.
- **05, the capped socket's shove is accepted as physics.** Its summed damage on the same contacts
  is x40: a bare cap bolted to a 250 kg body arrives with a median 79 kg behind it. On the eye list.
- **08, a blow files its physical impulse, and the blow gain is gone.** The first commit filed
  seven times every contact's impulse (`TIPPING.BLOW_GAIN`), because an x1 stone mirror all but
  never fell without it, and it was calibrated to session 01's band. Two things were wrong under
  that reading: a blow's height never reached the ledger, and the gain reached every contact rather
  than the scored blows its record named. With the height repaired and no gain, the x1 stone mirror
  falls 0.56 [0.45, 0.68] times a body a bout (192 blocks), and a standing skeleton falls on 40 of
  the 124 scored blows it takes standing, and on 85 of the 234 parries (Node research runner and
  `.review/fall-cause.mjs` on the bout runner; the measurements doc has the tables). So
  neither of the plan's failure conditions holds and no rule comes back. Holding session 01's band
  was itself against the plan ("the knockdown rate is not held"). Knockdowns are now rare for stone,
  which is on the eye list; a gain on a scored blow's filing, applied after `scoreHit`, is the rule
  to reach for if the owner wants them back.
- **08, a biped does not stand its feet under its centre of mass; left for the owner.** A standing
  skeleton's centre of mass is outside its base in 36.3 % of its standing samples (stone's in none),
  which is why it falls 16.4 [15.4, 17.4] times a body in an x1 mirror (48 pairs, Node research
  runner). Turning each whole leg about the hip toward the low-passed centre of mass, clamped to the
  hip's room and held per leg through the swing, took that share to 4.0 % and the knockdowns to
  11.4 [10.6, 12.2] -- and made the legs unequal in length while they stood apart, which handed the
  support to the swing foot at the start of a walk: short-walk sole slip rose from 186-214 to 229-355
  mm/s on the biped and from 180-285 to 217-360 on the skeleton (Node locomotion bench, means over
  eleven stand durations), over the 300 mm/s budget at x1.5. A slip regression for a knockdown rate
  the owner has not asked to move is not a trade to take on their behalf, so the term is not in the
  tree; it is kept at `.review/biped.balance-variants.ts` in the session's worktree record, and the
  choice is on the eye list above.
- **08, the stagger line is a stated fraction of the fall line.** A rigid body on a rigid floor
  rocks from any blow at all, so no physical reading gives a stagger a threshold of its own. The
  fraction keeps the ratio the two frozen lines had, 0.12 to 0.28 (0.43). `TIPPING.STAGGER_FRACTION`.
- **08, a body rocks and is righted as a rigid body, in the small-angle approximation.** Gravity
  takes a lean off the ledger at g r / h along the lean's own direction, and a body that has rocked
  back is taken as upright, forgetting the lean a second blow would find at the peak. The radius of
  gyration is the parts' point masses about the centre of mass, each part's own inertia left out.
  `src/tipping.ts`.
- **08, a body's base is its stance, lifted feet included,** together with anything else of it
  within `TIPPING.CONTACT_BAND_M` (0.03 m) of its lowest point. A foot in the air is on its way down,
  so a biped's line does not flicker with its stride. A lying body's base is what of it is within the
  band. `readTipping` in `src/supported-locomotion-production.ts`.
- **08, the wheel's patch is a square as wide as the wheel,** centred on the contact and turned with
  the axle. A line contact has no fore-aft base at all. Its fall line is 0.30 m/s against the
  biped's 0.95 (shove bench). `supportPatch` in `src/golem/locomotion/wheel.ts`.
- **08, a rising body is judged on the stance it rises onto.** It uses the last standing base that
  held its centre of mass, around where that centre of mass is now, at its live height and gyration.
  The rise is keyframed, and what is on the floor during it spans nothing under the centre of mass:
  measured on stone x1 mirrors (`.review/rise-base.mjs`, Node bout runner), the fall line read 0
  from 0.2 s into every rise, so any touch put the body down. No blow is exempt from the standing
  hull. `readTipping`; to reverse, drop the `standingHull` branch.
- **08, every body runs the skeleton's knockdown table, settled on descent.** It is settled once
  the centre of mass has come down half its starting height and its descent has stayed at or under
  0.3 m/s for 0.2 s, or once it has lain 2.5 s. The rise peaks at 0.9 m/s. `KNOCKDOWN` and
  `KnockdownSettle` in `src/golem/locomotion.ts`. Stone, the wheel and the multileg now lie until
  their fall has stopped, which is on the eye list.
- **08, one bench rise budget, 2.50 s, for every table.** The slowest scripted rise is 1.954 s (the
  biped), and 2.50 keeps the skeleton's half-second argument. `riseBudgetSeconds` in
  `src/golem/config.ts`.
- **08, the pair corpus's fallen body lies 0.1 s.** Under the full lie the pair resolver has already
  separated the two carriers (0.897 m apart at the rise), so the corpus no longer exercised a
  relocated rise. The fixture's stated edit caps the lie, in
  `physical_corpus_two_bipeds_share_one_registry_and_a_fallen_one_rises_clear_of_the_other`.
- **08, at stability x2 the stat test brackets the fall from 0.85 of the line, not 0.95.** A real
  impulse moves the carried mass toward the edge as well as rocking it, and at x2 the bodies fall
  at 0.87 to 0.98 of the line their standing geometry gives (shove bench). The test is
  `the_stability_stat_moves_both_thresholds_on_every_body_and_nothing_staggers_on_its_own_gait_at_the_floor`.
- **08 retires 04's holding ratio and 06's factor of 20.** `stabilityMassRatio` and the frozen
  `STAGGER_SPECIFIC_IMPULSE_MPS`, `FALL_SPECIFIC_IMPULSE_MPS` and decay are deleted, along with every
  brace multiplier and gait curve. A heavier body is now harder to fell because it has more mass over
  the same geometry.
- **09, `PRESS_MASS_RATIO` = 1.5.** A body at least 1.5 times the other's published mass closes to
  push range instead of standing off; nothing sweeps it. At 1.5 no two stone builds press each other
  (the widest pair is 1.33), while stone presses a human (2.2) and a skeleton (8), and the all-max
  giant presses every x1 body. `presses` in `src/downed.ts`; `Infinity` turns pressing off.
- **09, the stand-off is the shorter arm.** An outreached body holds at its own reach, not outside
  the longer one, so it can strike a body that never recovers. This retires the v2 fencer's "hold
  outside and go in on their recover" for the stand-off; the recover rule still decides the walk
  inside it. `standOffReach` in `src/downed.ts`; returning `them.reach` restores the old stand-off.
- **09, a stroke is timed by the slower of the arm's rate and its load against its torque.** The
  arm's rate is its reach chain's anchor rate over reach against the chain's shipped table, which
  works out to arm speed over the square root of size. Its torque is the shoulder's against the
  table, which works out to weight times size to the fourth. The plan's floor survives as the rate
  term: a light load never times a stroke quicker than the arm's rate does, but a faster arm strokes
  faster than the benched shape. The all-max giant times its strokes at 0.76 to 1.30, depending on
  the terminal (Node stroke bench). `strokeTimeScale` in `src/golem/tactics.ts`.
- **09, `armRate` is the first angular axis's rate times reach**: a tip speed the arm's rate limit
  carries, not a measured one. `geometry` in `src/golem/golem.ts`.
- **09, `soak` is priced as a cut into the core**: one minus the core's armour against a cut, over
  `cutJoulesPerDamage` times its health. A body whose armour differs by damage kind reads its cut
  figure. `soak` in `src/golem/golem.ts`.
- **09, `stabilityImpulseNs` is the weakest of 32 directions** of the fall line times the supported
  mass, and 0 until the body's base has been read at its first control step.
- **09, v4 keeps its own stand-off.** The miser's hold is a searched multiple of the other body's
  reach, and the executor floors it at nothing by design, so neither the shorter-arm rule nor
  pressing reaches it. Routing `holdFor` in `src/golem/tactics-v4.ts` through `standOffReach` and
  `presses` would apply them, and would move a searched table.
- **10, a body walked into leans, steps back, and is tipped only when it is outrun.** The owner asked
  for the equal-weight exception to go ("it seems arbitrary") and chose the balance response. The
  body driven stands against the push with its lean over its base's whole depth, `W * depth / y`, and
  no more than its grip; what is past that drives its carrier back, and its legs follow at the
  carrier's own `maxAccelerationMps2`. Only a step's drive past that goes to the ledger, at the height
  the two bodies meet. Measured (`.review/pc10/walk-into.mjs` and `walk-giant.mjs`, Node headless
  arena, stone walking 3 s into an idle stone): of one weight it moves 0.009 m; a tenth heavier walks
  it back 0.99 m, twice as heavy 8.98 m at up to 3.2 m/s, and size x1.25 10.0 m, none of them tipping
  it; x0.8 moves it 0.001 m; and the giant (size x1.25, weight x2) tips it at 0.38 s. `readContact` in
  `src/supported-locomotion-production.ts`. To go back to lean alone, file the driven body's whole
  excess over its lean hold and do not slide it; that version felled a brawler mirror 4.4 times a body
  a bout against 1.2 (Node bout runner, 16 bouts).
- **10, a walker pushes with no more than its grip and what it holds leaning into the reaction.** The
  reaction is filed on its own ledger past that hold, so it never pushes itself over. The closing
  momentum the resolution takes off it past that is its own legs', as walking into a wall is, and is
  not a blow. `pushCapN` and `pairDriveNs`. The alternative, the whole `M dv`, turns every meeting at
  a walk into a tackle.
- **10, a lean is read, not rendered.** The carriers are rigid keyframes, and the waist's full lean
  moves stone's centre of mass 0.10 m of the base's 0.34 (`.review/pc10/lean-room.mjs`, Node headless
  arena), so the hold credits a balance the body is not drawn doing. `leanHoldN` in `src/tipping.ts`.
  A body standing against a push does not visibly lean; it is on the eye list below.
- **10, the resolver follows a body that gives way.** Two footprints that meet now lose only what would
  still overlap at the end of the step, so a walker behind a body moving off keeps up with it. Before,
  it stopped where they touched, left a gap for the next step, and broke every sustained push into
  one step on and one off, which the feet's brake then won. `resolveCarrierPair` in
  `src/supported-locomotion-runtime.ts`; to reverse, sum the two closings again.

- **10, the knockdown fixture runs fifteen seconds.** Its rule -- the first seed pair from 44 up on
  which an idle stone body at stability x0.5 falls at least twice and more often than at x1 -- found
  no pair to 123 for any probe mind inside ten seconds under the balance response, because each mind
  plays an idle body out almost alike whatever the seed. At fifteen seconds the rule's first pair is
  44 and 45. `the worker counts a corner's knockdowns ...` in `tests/research-physical.test.mjs`; the
  sever fixture kept its seeds and re-pinned its contact counts.
