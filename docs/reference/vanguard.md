# Vanguard development panel

Vanguard remains unqualified against the requested field. Its explicit calibrated presets combine
committed point prediction, contact-driven attack/evasion choice and editable motor settings.
The Skeleton refreshes its opening through preparation and pins it at commitment;
this improves its four-case Options development panel from 0/4 to 2/4. The presets retain
the selected development configurations for the Warrior, Rogue and Skeleton. The preparation-aim
preset at `d68ad7e7` fails its fresh Options campaign with one win and three losses in four
completed cases. The four earlier qualification campaigns also fail. Equipment is unqualified.

The punching kit's 18/18 humanoid development wins and the supported-low kit's 8/8 panel wins
do not establish the requested rate across bodies, conditions and equipment. The records below
name each configuration; they are not pooled into qualification evidence.

## What is used

The punching kit is Vanguard with its committed punch (the `vanguard-punch` executor, `commitAim: true`
at the recorded commits) and its punch's `settle: 0.2`. The other kit
settings are the original Vanguard's. A punch follows one segment-local aim through its stroke,
then frees its hand to the continuous guard during recovery. The records carry both configurations
whole. They measure the punching kit; the current preset also includes low support and a low-only
punch.

## Measurement

[The paired record](../../assets/evaluations/tournament/2026-10-22-2a879fe0-bcf65967.jsonl)
names source commit `2a879fe0`, every recipe and each bout's pose digest. Harness: Node Arena Duel,
vendored `rapier-coordinate`, 120 Hz, matched Warrior bodies, empty hands, Balance 0/0, open stage,
4 m starting gap, each fighter on each side. Falls continue to injury or the ordinary 120 s cap.

| Opponent | Candidate wins | Injury / time-limit wins | Original Vanguard wins |
| --- | ---: | ---: | ---: |
| Counter-puncher | 2/2 | 2 / 0 | 2/2 |
| Options | 2/2 | 1 / 1 | 0/2 |
| Puncher | 2/2 | 2 / 0 | 1/2 |
| Original Vanguard, direct comparison | 0/2 | 0 / 0 | 2/2 |

All 14 bouts are valid; none draws. On the shared three-member panel the candidate's win share
is 1 and the original's is 0.5. The paired report is unsettled with three opponent pairs. These
are development conditions, with no held-out confirmation, other bodies, obstacle court or
equipment represented. The direct losses show that the gain depends on the matchup.

## Expanded humanoid field

[The expanded record](../../assets/evaluations/tournament/2026-10-22-30c74f89-960fa8de.jsonl)
uses the same candidate, played source and conditions. It contains 18 unique bouts, including
the six candidate-panel bouts above; these are reused, not additional trials. It adds both sides
against six more humanoid opponents. All 18 are valid wins: 11 by injury and seven at the cap.

| Opponent | Wins | Injury / time-limit wins |
| --- | ---: | ---: |
| Classic | 2/2 | 0 / 2 |
| Behaviours | 2/2 | 2 / 0 |
| Duellist | 2/2 | 0 / 2 |
| Scrapper | 2/2 | 2 / 0 |
| Tempo | 2/2 | 2 / 0 |
| Joint feedback (`direct`) | 2/2 | 0 / 2 |

The Reptile is outside this humanoid field. The results do not test other bodies, equipment,
the obstacle court or held-out starting gaps.

## Supported low fighting

[The supported-low paired record](../../assets/evaluations/tournament/2026-10-22-e21b930e-4b217807.jsonl)
names source commit `e21b930e` and the supported-low preset's complete configuration. It compares the
preset against the committed-aim punching kit under the same Node Arena Duel conditions above.
The Crawl and bite comparison uses the Warrior against the Reptile on its own body, both empty-handed.

| Opponent | Preset wins | Injury / time-limit wins | Punching kit wins |
| --- | ---: | ---: | ---: |
| Crawl and bite | 2/2 | 1 / 1 | 0/2 |
| Counter-puncher | 2/2 | 2 / 0 | 2/2 |
| Options | 2/2 | 1 / 1 | 2/2 |
| Scrapper | 2/2 | 2 / 0 | 2/2 |

All 16 bouts are valid. Each of the six humanoid bouts has the same complete pose digest for the
preset and the punching kit. Against the Reptile, the preset wins by injury at 21.425 s on the left
and at the cap on the right. Its ending bars are 0.999276 and 0.999529; the raw step readings record
zero Warrior falls in either bout. The four-pair panel report is unsettled. These are development
cases, with other bodies, stages, starts and equipment still outside this record.

## Refreshed point prediction

With its punch's `predict` (`predictAim: true` at the recorded commits), the punch projects its chosen point onto the sensed collider before
remembering it locally. Each control step predicts that point from the segment's current linear
and angular velocity, with a 0.12 s lead plus the sensed frame's age. The calibrated preset
enables this option; the editor also exposes it separately.

The [Skeleton record](../../assets/evaluations/tournament/2026-10-22-8047251e-aa0c393a.jsonl)
and [Warrior record](../../assets/evaluations/tournament/2026-10-22-8047251e-dbfb3163.jsonl)
compare the option with the previous supported-low preset at source commit `8047251e`. Each
record carries the full configurations, recipes and pose digests. Harness and conditions are
the Node Arena Duel, `rapier-coordinate`, 120 Hz, matched bodies, empty hands, Balance 0/0,
open stage, 4 m gap, each side, continuing after falls to injury or 120 s.

| Body / opponent | Prediction wins | Injury / time-limit wins | Previous preset wins |
| --- | ---: | ---: | ---: |
| Skeleton / Options | 1/2 | 1 / 0 | 0/2 |
| Warrior / Options | 2/2 | 1 / 1 | 2/2 |
| Warrior / Counter-puncher | 2/2 | 2 / 0 | 2/2 |

All 12 bouts are valid, without draws. The prediction option wins 5/6 against the previous
preset's 4/6; both panel reports are unsettled. It wins the right-side Skeleton bout by injury
at 54.85 s, without falling in the raw development reading. Its left-side Skeleton health
deficit at the cap grows from 0.004665 to 0.078327. This is a useful option with a remaining
weak side, rather than qualification against Options. Other bodies, starts, levels and equipment
are outside these paired records.

## Contact-driven policy

Vanguard's planner (`VANGUARD_PLAN`, `src/core/entrants/vanguard/plan.ts`) layers its settings
over a plan of any kind in its own slot. Its optional `adaptiveEvade` compares two ordinary behaviour policies, with and without the
configured evasion behaviour. `slowEvade` caps an evasive step at 0.2 m/s. Only onset, loaded,
non-guard contacts on the committed stroke's intended target region contribute: normal impulse
times preceding relative normal speed ranks those impacts. This is a contact heuristic, not
the foe's health or the rulebook's damage. Both policies keep independent memories.

The fighter compares six-second periods between strokes, weighting the latest period and its
earlier mean equally. `revisitEvade` retries the other policy after four consecutive periods
of the preferred policy, including when its initial trial scored zero. All feedback, timing
and policy memories fork with the fighter.

The [Skeleton record](../../assets/evaluations/tournament/2026-10-22-70df4389-cf2d165f.jsonl)
compares periodic re-evaluation with greedy contact learning. The
[Warrior record](../../assets/evaluations/tournament/2026-10-22-70df4389-c25f74c2.jsonl)
compares it with refreshed prediction alone. Both carry full configurations and recipes at
source commit `70df4389`. Harness and conditions are the Node Arena Duel, `rapier-coordinate`,
120 Hz, matched bodies, empty hands, Balance 0/0, open stage, 4 m gap, each side, continuing
after falls to injury or 120 s.

| Body / opponent | Re-evaluation wins | Injury / time-limit wins | Named reference wins |
| --- | ---: | ---: | ---: |
| Skeleton / Options | 2/2 | 0 / 2 | Greedy learning: 1/2 |
| Warrior / Options | 2/2 | 1 / 1 | Prediction alone: 2/2 |
| Warrior / Counter-puncher | 2/2 | 2 / 0 | Prediction alone: 2/2 |

All 12 bouts are valid, without draws or falls. Both panel reports remain unsettled. These six
candidate wins are development evidence; the per-opponent held-out target is still open.

## Fresh unarmed qualification

The frozen contact-driven configuration at `70df4389` fails the first Options campaign. Its
preregistered matrix has twelve bouts, both sides of the Warrior, Rogue and Skeleton on the
open stage and obstacle court, at distinct starts. More than 80% requires ten wins; draws do
not count. Harness is the Node Arena Duel, `rapier-coordinate`, 120 Hz, empty hands, matched
bodies, Balance 0/0 and the ordinary 120 s cap, continuing after falls.

| Completed case | Result | Ending | Candidate falls |
| --- | --- | --- | ---: |
| Rogue, open, 6.85 m, right | Draw, neither side damaged | 120 s | 3 |
| Skeleton, open, 4.35 m, right | Loss | Injury at 85.5333 s | 0 |
| Skeleton, open, 4.35 m, left | Loss | 120 s | 0 |

The run stops at the third non-win, with zero wins in three completed cases. The other nine
cases have no completed result and are not counted as losses. The complete manifest, decision,
case keys and row references are retained in
`research/runs/vanguard/qualification/campaign-1-options.json`; completed physical rows remain
in `research/runs/vanguard/bouts.jsonl`. This failed matrix is development evidence for a revised
fighter, which needs fresh confirmation.

### Calibrated campaign

The calibrated preset at `9b3fecd0` fails the second preregistered Options matrix, under the
same harness, rate, equal attributes, empty hands and ordinary cap. Its new starts are kept in
`research/runs/vanguard/qualification/conditions-2.json`.

| Body / level / gap | Left result | Right result |
| --- | --- | --- |
| Warrior / open / 2.15 m | Injury win, 85.4667 s | Incomplete |
| Rogue / open / 6.35 m | Injury win, 97.875 s | Win at 120 s |
| Skeleton / open / 3.85 m | Loss at 120 s | Loss at 120 s |
| Warrior / court / 5.15 m | Loss at 120 s, one fall | Win at 120 s |

The other six completed fighters remain upright. The third loss stops the campaign at four
wins in seven completed cases; five unfinished cases are not counted as losses. Full recipes,
keys, readings and row references are retained in
`research/runs/vanguard/qualification/campaign-2-options.json`. Those conditions are development
evidence for the next revision, not fresh confirmation.

### Body-specific timing campaign

The preset at `15dd986c` fails the third preregistered Options matrix, using the same harness,
rate, equal attributes, empty hands and ordinary cap. The starts are frozen by a hash rule in
`research/runs/vanguard/qualification/conditions-3.json` before any bout plays.

| Body / level / gap | Left result | Right result |
| --- | --- | --- |
| Warrior / open / 6.21 m | Loss at 120 s, one fall | Injury win, 90.3583 s |
| Rogue / open / 5.81 m | Win at 120 s | Injury win, 111.1167 s |
| Skeleton / open / 4.73 m | Loss at 120 s | Loss at 120 s |

The other five completed fighters remain upright. The third loss stops the campaign at three
wins in six completed cases, two by injury and one at the cap. All six court cases are unfinished
and are not losses. Full recipes, keys, readings and row references remain in
`research/runs/vanguard/qualification/campaign-3-options.json`; physical rows remain in
`research/runs/vanguard/bouts.jsonl`. This matrix is development evidence for the next revision.

### Braced-gait campaign

The landed preset at `8b0ef68e` fails the fourth preregistered Options matrix. The harness is
the Node Arena Duel, `rapier-coordinate`, 120 Hz, matched bodies, empty hands, Balance 0/0,
zero sense delay, falls continuing and the ordinary 120 s cap. Its conditions are frozen in
`research/runs/vanguard/qualification/conditions-4.json`, using a hash rule that excludes
previously played geometry without reading outcomes. The Skeleton cells play first to decide
the limiting result promptly.

| Body / level / gap | Left result | Right result |
| --- | --- | --- |
| Skeleton / court / 7.71 m | Loss at 120 s, one late fall | Loss at 120 s, no fall |
| Skeleton / open / 6.16 m | Loss at 120 s, two falls | Incomplete |

The third loss stops the campaign with zero wins in three completed cases. Nine unfinished
cases are not counted as losses. Full recipes, keys, pose digests and readings remain in
`research/runs/vanguard/qualification/campaign-4-options.json`, played source
`sha256:7700e2c53945a284a7785bb391cb595dcbd7dac983691cb113d61091fec54d9c`.
These failed conditions are development evidence; a revised fighter needs fresh confirmation.

## Conservative travel

At `bf2bf77e`, the steady walk (`STEADY_WALK`, which a body profile's `steady` selects) bounds
stance-walk turns to 0.3 rad/s, with 0.2 rad/s for the first two moving seconds. Another body
takes it as its walk: the stance walk with that turn tuning, carried by a mind link.
The planner's `routeAround` responds to an unreachable exact attack entry by requesting another point in
the candidate's range, leaving geometric routing to the navigator. Its regression fixture runs
the actual navigator from an obstructed point through the feasible replacement and a state fork.

Paired 30 s development screens use the Node Arena Duel, `rapier-coordinate`, 120 Hz, empty
hands, matched bodies, Balance 0/0, both sides, Options as the opponent and the contact-driven
configuration as the reference. On the Rogue's open-stage 6.85 m start, the reference falls
before striking on both sides. Conservative travel has no falls and commits 20 punches on the
left and 15 on the right, but trails on health on both sides. On the Skeleton court's 6.15 m
start, it stays upright on both sides while the reference falls on each; it launches no punches
against the fallen opponent. This is a travel improvement, not a winning qualification.
The full recipes, rows and exact source are retained under
`research/runs/vanguard/rejected/entry-50.json` and `research/runs/vanguard/screen.jsonl`.

The fallen-body stall combines head-based low-support entry with centre-based range navigation,
then a planted support pose unable to travel to its reported punch window. Head-based travel,
rising to reposition, correction from measured facing and restricting the low repertoire do
not produce damaging strikes in the 30–60 s screens. Their exact rejected sources, readings and
diagnostics are retained in `research/runs/vanguard/rejected/entry-{51,53,54,55}.json`. Those
low-support revisions are not part of the retained implementation.

### Distant native travel

The Warrior calibration uses braced walking as its native Move fallback outside the close-combat
rules. The Rogue and Skeleton calibrations use their conservative stance walk. This avoids the Warrior's distant
run, without changing muscle strength or the common locomotion implementations.

On the failed 6.21 m Warrior open-stage start, the preceding configuration falls at 4.6333 s,
rises at 15.8583 s and first commits a punch at 21.3167 s. Changing only the fallback gait to
braced walking keeps it upright and brings the first commitment to 7.05 s. The two 30 s diagnostic
cases are retained in `research/runs/vanguard/diagnostics/distant-travel-fall.json`.

The full paired comparison wins 2/2 against the previous configuration's 1/2. The left wins at
120 s and the right by injury at 111.7667 s, with no candidate fall in either. Harness is the
Node Arena Duel, `rapier-coordinate`, 120 Hz, matched Warriors, empty hands, Balance 0/0 and
the ordinary 120 s cap, continuing after falls. Exact configurations, readings, digests and row
keys remain in `research/runs/vanguard/travel-full.json`, played source
`sha256:f813b1a8cc7cbcbffb6c0646994daf5a658663ec9a6e471ae41c9ff3afdfca23`.
These failed-campaign conditions are development evidence, not fresh qualification.

## Body motor profiles

The explicit calibrations in [Vanguard's controller](../../src/core/entrants/vanguard/mind.ts)
are `vanguard-warrior`, `vanguard-rogue` and `vanguard-skeleton`, each offered for its named body.
Their source profile table is `assets/entrants/vanguard/body-profiles.json@a9cddb72`; the measured
calibrated preset at `9b3fecd0` names its source below. A selected configuration runs its own walk,
planner flags and punch settings, without body-based overrides. Its complete settings travel in
an edited mind link.

The conservative `VANGUARD_WALK` uses `turnLimit: 0.3` rad/s, `turnStartupSeconds: 2` s and
`turnStartupLimit: 0.2` rad/s. Its ordinary fields preserve the calibration through editing and
links. The planner's `flank` selects its blocked step. A punch's `lead` is the delay in seconds
between trunk and arm drive; the Skeleton standing punch uses 0.025 s. Low-only punches keep
their own settings.

| Own body | Walk | Step after repeated blocks | Selected development result |
| --- | --- | --- | --- |
| Warrior | Configured Move | No | Options 2/2, Counter-puncher 2/2 |
| Rogue | Conservative stance walk | No | Options 2/2 |
| Skeleton | Conservative stance walk | Yes | Options 2/2 |

These full development cases use the Node Arena Duel, `rapier-coordinate`, 120 Hz, matched
bodies, empty hands, Balance 0/0, the open stage and both sides. The starts are 4 m on the
Warrior, 6.85 m on the Rogue and 4.35 m on the Skeleton. The Warrior wins three by injury and
one at the cap; the Rogue wins both at the cap; the Skeleton wins by injury at 83.55 s on the
left and at the cap on the right. None of these selected configurations falls. Their recipes
and rows remain in `research/runs/vanguard/bouts.jsonl`, played source
`sha256:8cde59e930cd70e4bcb456a4dfb4bb0259bf35f41eee70ab14c80efcf0c0c423`.

The combined dispatcher reproduces each selected configuration's complete pose digest through
an eight-second approach and exchange probe on the left side. Those six short cases and their
digests are retained in `research/runs/vanguard/profile-equivalence.json`; they are equivalence
checks, not additional full wins or fresh qualification.

The blocked-step policy reads the fighter's completed action ledger. Two blocked committed
strokes without a target hit request a one-second lateral step at 0.3 m/s, away from the widest
sensed blocking limb. It waits for live actions to end, preserves user movement, clears its
interrupted work on sub-mind return and forks its memory. It is useful on the Skeleton, but
forcing it on every body wins only 2/4 Warrior bouts with conservative walking and 3/4 with
the native gait, against the no-step reference's 4/4. A four-policy contact learner loses both
limiting right-side cases where the selected references win. Exact rejected implementations
are retained in `research/runs/vanguard/rejected/outer-block-step.json` and
`research/runs/vanguard/rejected/learned-block-step.json`.

At the failed 3.85 m Skeleton start, shortening the standing punch's arm-drive delay from 100 ms
to 25 ms changes the full pair from 0/2 to 1/2. The left wins at the cap; the right loses at the
cap with a fall. Applying the same timing to the Warrior at 4 m regresses Options from 2/2 to
1/2, without falls. The remaining Counter cases stop once this rejects a uniform timing change.
These Node Arena Duel, `rapier-coordinate`, 120 Hz, matched-body, empty-handed, Balance 0/0
cases and unfinished cases are retained in
`research/runs/vanguard/rejected/general-short-arm-lead.json`. The Skeleton profile selects the
shorter delay; this development gain does not establish qualification.

## Preparation aim

The Skeleton calibration's `anchorAtDrive: true` refreshes the chosen opening while the standing punch
prepares. The first committed step pins that surface point; its sensed rigid motion continues to
refresh the prediction during the drive. Low-only punches retain their planted aim behavior.
The field is available in the mind editor and travels with a linked mind. The Warrior and Rogue
calibrations retain their fixed preparation aim.

The paired prototype at source
`sha256:133f36aeef1ccd86f02fda6b604dbd30aa9080e9954dbbeb6aab14ea1ac6805c`
improves the Skeleton panel from zero to two wins in four cases. Harness: Node Arena Duel,
vendored `rapier-coordinate`, 120 Hz, matched Skeleton bodies, empty hands, Balance 0/0,
zero sense delay, falls continuing to injury or the ordinary 120 s cap. These are reused
development layouts, not fresh qualification cases. All configurations, pose digests and readings
remain in `research/runs/vanguard/contact-coverage.json`; exact prototype source remains in
`research/runs/vanguard/rejected/contact-modes-source.json`.
The simplified native profile and its previous-preset controls reproduce all eight corresponding
pose digests exactly, retained in `research/runs/vanguard/native-profile-panel.json`. Those
replays verify the implementation translation; they add no independent conditions.

| Level / gap | Side | Previous preset | Late preparation aim | Candidate falls |
| --- | --- | --- | --- | ---: |
| Open / 4.73 m | Left | Time-limit loss | Time-limit win | 0 |
| Open / 4.73 m | Right | Time-limit loss | Fatal-injury loss at 73.2167 s | 0 |
| Court / 7.71 m | Left | Time-limit loss | Time-limit win | 0 |
| Court / 7.71 m | Right | Time-limit loss | Time-limit loss | 3 |

Both wins contain committed punches and target contacts: 68 commits and 13 contacts on the open
stage, 67 and 17 on the court. The right court case has no committed punch under either preset;
both fall three times. The selected change improves preparation aim; the panel still exposes a
case that fails before a punch commits. Equipment and fresh conditions remain unqualified.

## Preparation-aim campaign

The frozen preset at `d68ad7e7` fails its fifth fresh Options matrix: one win and three losses
in four completed Skeleton cases. Eight Warrior and Rogue cases remain unplayed after the third
non-win makes ten wins in twelve impossible. This is a failed qualification campaign, not an
estimate of the complete opponent field's win rate.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched bodies, empty hands,
Balance 0/0, zero sense delay, falls continuing to injury or 120 s. The frozen recipe selection,
fighter, harness source and complete/unfinished case records remain in
`research/runs/vanguard/qualification/conditions-5.json`, `fighter-5.json`, `harness-5.json` and
`campaign-5-options.json`. Starting gaps are selected before playing by the recorded hash rule,
excluding retained development and diagnostic geometries; every selected nonce is zero.

| Level / gap | Side | Outcome | Candidate falls |
| --- | --- | --- | ---: |
| Court / 5.92 m | Left | Time-limit loss | 0 |
| Court / 5.92 m | Right | Fatal-injury loss at 118.75 s | 0 |
| Open / 3.24 m | Left | Time-limit win | 1 |
| Open / 3.24 m | Right | Time-limit loss | 1 |

Both court cases commit punches, so these losses do not depend on failing to enter a stroke.
The open-stage winner commits five punches and falls at 14.2167 s, staying down to the cap;
that win does not establish controlled recovery. These conditions become development evidence.

## Tried and not kept

The supported-low preset's additional normal-cap development bouts against Options use the same Node
Arena Duel, engine, rate, empty hands, Balance 0/0, open stage and 4 m gap. On the Rogue it wins
2/2 (one injury, one time limit); on the Skeleton it loses 2/2 at the time limit. Neither body
falls. Both Skeleton bouts lead at 30 s, so those short leads do not predict the full result.
These rows and complete recipes are retained in `research/runs/vanguard/bouts.jsonl`, played
source `sha256:867f9b0b750aab30dda66474101dcf6a836783de357420a9c3fb0ae7f73e3bee`.
On the obstacle court at 6 m, the same preset wins both Warrior bouts and splits the Skeleton
pair. These four bouts at the bell include fallen bodies; they do not establish controlled
recovery. The Rogue court pair is not scheduled after the Skeleton loss decides that screen.

Raw development rows, full recipes and source archives are kept under
`research/runs/vanguard/`; their environments distinguish implementations with the same config.

| Candidate | Finding |
| --- | --- |
| Two-punch combination | Splits Options; does not solve the matchup. |
| Delegating the spare hand before the second punch | Loses both full Options bouts. |
| Longer trunk lead | Weakens the 20 s exchange screen; no full bout follows. |
| Committed aim alone | Splits full Options bouts despite leading both at 20 s. |
| Alternating hands or aiming only at the head | Weakens one side of the 20 s exchange screen. |
| Committed aim with active return guard, 0.08 s preparation | Splits full Options bouts. |
| Preparation of 0, 0.08, 0.2 or 0.35 s, with active return guard | The 0.2 s candidate leads both 20 s exchanges by the largest margins and advances to the paired panel. |
| Routed downward strikes against the moving Reptile | No strike launches in the 20 s screen. |
| The downward strike's own approach and fold | It launches, but records no damaging hand contact in the screen. |
| Standard front kicks, or a smaller lift with proportionate chamber time | Both split the full Reptile bouts. |
| Faster kick preparation and recovery | Falls interrupt preparation before commitment. |
| Early low guard without approach, turning steps or a finite return | It stalls outside reach or cannot leave failed low support. |
| Alternating the supported-low preset's hands on the Skeleton | Weakens one side of the 30 s screen against Options. |
| Closing the upright covering hand on the Skeleton | Loses both full Options bouts, one with a fall; exact source is archived in `research/runs/vanguard/rejected/closed-upright-guard.json`. |
| Aiming the current standing punch at the Skeleton's head | Loses both full Options bouts, one with a fall. |
| Point-controlled arm acceleration on the Skeleton | Weakens both earlier 30 s exchanges. On the preparation-aim profile, full right court bouts at 5.92 m with requested acceleration 40 or 100 m/s² both lose at the cap without falling; the larger request deals less damage. The mode is not selected. Full paired readings remain in `research/runs/vanguard/rejected/driven-court-right.json` and `driven-100-court-right.json`. |
| Closer standing range on the Skeleton | Splits full Options bouts, with a fall in the winning bout. |
| Contact-ranked head/body attacks with either hand | Loses both full Skeleton bouts, one with falls. |
| A reachable low kick against the Skeleton | Loses support before commitment on both sides; the initial trunk target is an invalid fixture outside the kick's height band. |
| Half the hip and chest turn | Weakens both short Skeleton exchanges. |
| Hooks or overhands using the existing path skill | Produce few target contacts and weaken both short Skeleton exchanges. |
| Waiting for the actual reachable chamber and a slow fist | Weakens both short Skeleton exchanges and reduces damaging body contacts and body-hit energy; exact rejected source is archived in `research/runs/vanguard/rejected/measured-chamber.json`. |
| Opening-ranked body/head and shorter-range punches | Weakens the right Skeleton exchange at 3.85 m despite improving the left; retained in `research/runs/vanguard/rejected/repertoire-configurations.json`. |
| Choosing independently named hands by landed-contact rates | Weakens both short exchange margins at 3.85 m; retained with the repertoire configurations. |
| Replacing the Warrior's fallback run with the braced walk | Reproduces the failed court case's complete pose digest and fall exactly; the run is not its cause. |
| Ending a punch before its arm-drive lead | Not observed in the diagnostic's 13 committed strokes; no timing-rule change is kept on that hypothesis. |
| Clearing a guard with a free-hand muscle-driven point task | Captures on one side but weakens both exchanges; adding an entry step captures on both but causes a fall. Exact source is retained in `research/runs/vanguard/rejected/parry-no-entry.json` and `parry-entry.json`. |
| Body cover with a shorter arm-drive delay | Weakens both 30 s Skeleton exchanges at 3.85 m; retained in `research/runs/vanguard/rejected/body-cover-and-uppercuts.json`. |
| Mixed or exclusive uppercuts with a shorter arm-drive delay | Neither configuration records an uppercut target contact in the 30 s Skeleton exchanges; retained with the body-cover configurations. |
| Shared ground positioning and downward path strikes against a fallen humanoid | Neither side commits a downward strike within 60 s on the Skeleton court at 6.15 m. Both remain upright. Retained in `research/runs/vanguard/rejected/downward-ground-policy.json`. |
| Closer punch ranges with a 25 ms arm-drive delay | Ranges of 0.75, 0.80 and 0.85 of arm length all lose the left full Skeleton bout by injury at 3.85 m, without falling; the 0.95 reference wins that side. No opposite-side variants follow. Retained in `research/runs/vanguard/rejected/short-lead-punch-range.json`. |
| Replacing contact learning with a fixed policy | Fixed slow evasion loses both full Skeleton bouts at 4.73 m; fixed attack loses the first. The remaining fixed-attack side stops once neither can win both. Retained in `research/runs/vanguard/rejected/fixed-evasion-policies.json`. |
| Solving the arm from the current trunk pose | Full tracking changes the Skeleton pair at 4.73 m from 0/2 to 1/2, but its left loss becomes an injury loss at 99.3167 s. Current-pose shares of 0.75, 0.50 and 0.25 all lose the left at the cap, without falling; no opposite-side variants follow. The prototype is not kept. Exact sources and readings remain in `research/runs/vanguard/trunk-tracking-source.json`, `trunk-tracking-pair.json`, `trunk-blend-source.json` and `rejected/trunk-blend-*-left.json`. |
| Combining preparation aim with current-trunk solving | The combined variant loses both Skeleton bouts at 4.73 m at the cap, without falls. The standalone preparation-aim variant is selected for the Skeleton after its broader [development panel](#preparation-aim); the combined variant is rejected. Exact sources and readings remain in `research/runs/vanguard/late-opening-source.json`, `late-opening-pair.json`, `combined-opening-source.json` and `rejected/combined-opening.json`. |
| Shorter standing-punch preparation on the Skeleton | Preparation times of 0, 0.05 and 0.10 s all lose the limiting left full bout at 4.73 m without falling. No opposite-side variants follow. Retained in `research/runs/vanguard/rejected/settle-*-left.json`. |
| Preserving the complete measured low-strike placement | On the Skeleton court at 6.15 m, the right reaches readiness and commits one low punch, misses and falls; the left repeatedly repositions without committing. Both 60 s screens draw without damaging blows. Exact source and readings remain in `research/runs/vanguard/rejected/complete-ground-placement-source.json` and `complete-ground-placement.json`. |
| Learning early or late opening selection from target impacts | Loses both full Skeleton bouts at 4.73 m and introduces a left-side fall. The matched reference loses both without falling. Exact source and paired readings remain in `research/runs/vanguard/rejected/learned-opening-source.json` and `learned-opening.json`. |
| Holding the arm's first driven contact pose | Still loses the limiting full left Skeleton bout at 4.73 m without falling; no opposite-side variant follows. Exact source and paired readings remain in `research/runs/vanguard/rejected/fixed-arm-pose-source.json` and `fixed-arm-pose.json`. |
| Aiming exclusively at the lower trunk | Against an unassisted standing Skeleton guard, records three committed body contacts within 29.8833 s, versus the reference's one within 30 s. The live Options left bout at 4.73 m loses by fatal injury at 54.4917 s without falling. The diagnostic gain does not survive the fight. Retained in `research/runs/vanguard/diagnostics/abdomen-alignment.json` and `rejected/lower-trunk-target.json`. |
| Pricing the committed punch with shared option models | With the borrowed head-cover reflex, loses the full left Skeleton bout at 4.73 m by fatal injury at 53.1417 s. Restoring Vanguard's body ward extends the loss to the 120 s cap; neither falls. Both are rejected, with no opposite-side variants. Exact sources and paired readings remain in `research/runs/vanguard/rejected/valued-punch-source.json`, `valued-punch.json`, `valued-body-ward-source.json` and `valued-body-ward.json`. |
| Ordinary-speed evasion with the conservative Skeleton walk | Loses the limiting full left Options bout at 4.73 m by fatal injury at 95.85 s, without falling. No opposite-side variant follows. Retained in `research/runs/vanguard/rejected/fast-evasion.json`. |
| Releasing standing recovery controls during the cooldown | Loses the limiting full left Skeleton bout at 4.73 m by fatal injury at 104.05 s, without falling. No opposite-side variant follows. Exact source and paired readings remain in `research/runs/vanguard/rejected/mobile-return-source.json` and `mobile-return.json`. |
| Letting a standing punch finish its full drive after a blocked contact | Still loses the full left Skeleton bout at 4.73 m at the cap, without falling. No opposite-side variant follows. Retained in `research/runs/vanguard/rejected/follow-through-guard.json`. |
| Ranking openings along a straight fist lane | Loses the full left Skeleton bout at 4.73 m by fatal injury at 112.3333 s, without falling. No opposite-side variant follows. Exact source and paired readings remain in `research/runs/vanguard/rejected/straight-lane-aim-source.json` and `straight-lane-aim.json`. |
| Choosing the opening once when the punch commits | Preserves the steady preparation aim, but loses the full left Skeleton bout at 4.73 m by fatal injury at 109.4333 s, without falling. No opposite-side variant follows. Exact source and paired readings remain in `research/runs/vanguard/rejected/commit-opening-source.json` and `commit-opening.json`. |
| A 0.3 m/s forward step during the standing punch | In the Node Arena Duel standing-guard screen, three distinct punches touch the Skeleton's body by 10.7833 s, versus one by 30 s; driven body-impact damage is 0.2547 versus 0.0502 HP, without falls. The full left Options bout at 4.73 m still loses at the cap without falling. It is not selected. Exact source and readings remain in `research/runs/vanguard/rejected/stepping-punch-source.json`, `stepping-punch.json` and `diagnostics/step-*-alignment.json`. |
| A 0.3 m/s backward step during the standing punch | Loses the full left Skeleton bout at 4.73 m at the cap, without falling, with fewer target contacts than the forward step. Exact source and paired readings remain in `research/runs/vanguard/rejected/signed-step-source.json` and `counter-step.json`. |
| Increasing the forward punch step to 1 m/s | Three distinct body-hit punches take 18.2417 s instead of 10.7833 s, with similar summed body-impact damage and no falls. The slower body-impact rate rejects the candidate before a full bout. Retained in `research/runs/vanguard/rejected/fast-standing-step.json`. |
| A fixed arm contact pose during the forward step | Three distinct body-hit punches take 17.2 s instead of 10.7833 s; summed driven body damage falls from 0.2547 to 0.1265 HP, without falls. No full bout follows. Exact source and readings remain in `research/runs/vanguard/rejected/frozen-step-source.json` and `diagnostics/frozen-step-*.json`. |
| Joint calibration against four 20 s Skeleton exchanges | Sixteen configurations produce no candidate meeting the declared gate of four nonnegative margins and at least 0.02 opponent health lost in each case. Auditing the configuration with the highest short fitness in ordinary 120 s bouts yields two losses against Options at 4.73 m, with a fall on the left. The short score does not qualify a fighter or predict these full bouts. Plans, cases, checkpoints and harness source remain in `research/runs/vanguard/coordination/`; the paired audit remains in `rejected/coordination-full-audit.json`. |
| Full-bout joint calibration on the limiting left exchange | Five punch variations and the unchanged preset all lose the full Skeleton versus Options bout on the open stage at 4.73 m. The best variation narrows the final health deficit but does not win. All six complete bouts, configurations and the search checkpoint remain in `research/runs/vanguard/coordination-full/`. This is development, not qualification. |
| Full-bout calibration on merged main | Eleven further variations all lose the same limiting left Skeleton bout at `f339677b`. The earlier best is read again as the reference, reproducing its full pose digest `c4c678716e797f12` and loss exactly; it is not an additional independent case. The two generations do not improve on that reference. The full bouts, configurations, checkpoint and harness source remain in `research/runs/vanguard/coordination-full-main13/`. |
| Placing a staggered stance before the standing punch | The unassisted 120 Hz Skeleton stand takes a right-foot step to 0.30 m across and 0.15 m behind the left, staying upright. In the Node Arena Duel standing-guard screen, the entrant wrapper produces no driven body-hit strokes by 30 s, with no falls; four-second selector patience also fails to produce them. The ordinary punch reaches one body-hit stroke. Neither stance variant advances to a full bout. Exact sources and diagnostics remain in `research/runs/vanguard/rejected/stagger-source.json`, `stagger-patient-source.json` and `diagnostics/stagger-*.json`. |
| Alternating hands on the merged preset | The full left Skeleton versus Options bout at 4.73 m still loses at the cap without falling. This rechecks a change rejected by an earlier short screen against the ordinary full-bout outcome. The paired record remains in `research/runs/vanguard/rejected/alternate-full-left.json`. |
| Opening the preparing shoulder an additional 0.35 rad | The standing-guard screen improves from one to two distinct driven body-hit strokes in 30 s, summed body-impact damage from 0.0502 to 0.1366 HP, and first contact from 24.6167 to 16.45 s, without falls. The full left Options bout at 4.73 m still loses at the cap and falls at 98.05 s; it has fewer target contacts than the reference. The prototype is rejected. Exact source and paired readings remain in `research/runs/vanguard/rejected/outside-chamber-source.json`, `outside-chamber-full-left.json` and `diagnostics/outside-*.json`. |
| Clearing the guard through a following punch | Both the 0.35 s and 0.8 s outward presses lose the ordinary full left Skeleton versus Options bout at 4.73 m, without falling. The shorter press rechecks a prototype rejected by a short exchange; the longer spans a punch's preparation and drive. Neither advances. Exact source and all three full readings remain in `research/runs/vanguard/rejected/parry-full-source.json` and `parry-full-left.json`. |
| Selecting preparation aim or current-trunk solving by net contact impulse | Loses the full left Skeleton versus Options bout at 4.73 m without falling, while fixed preparation aim wins. Delivered fist impulse minus received head/trunk impulse favors the losing mode during part of its diagnostic prefix. The selector is rejected. Exact source, readings and the diagnostic remain in `research/runs/vanguard/rejected/contact-modes-source.json`, `contact-modes-left.json` and `diagnostics/contact-choice.json`. |
| Holding the standing guard pose instead of warding the weapon | Loses the full right Skeleton court bout at 5.92 m by fatal injury at 69.9833 s, versus 118.75 s for the preparation-aim reference, without falls. Rejected in `research/runs/vanguard/rejected/pose-guard-court-right.json`. |
| Forecasting the torso from its measured joint rates | A 0.12 s forecast loses the same right court bout by fatal injury at 115.6167 s without falling. The private executor is rejected; exact source and readings remain in `research/runs/vanguard/rejected/forecast-source.json` and `forecast-court-right.json`. |
| Alternating the preparation-aim punch's hands | Wins the right court case at 5.92 m without falling, but the full four-case Skeleton panel remains 1/4: it trades the prior open-left win for the court-right win. Both open-stage falls disappear. It is retained as development configuration, not selected as the default. The left-priority alternative loses the right court case. All paired cases remain in `research/runs/vanguard/hand-selection-court-right.json` and `alternate-coverage.json`. |
| Preparing the alternating punch from a wider range window | A 0.4 m band loses the full left court case at 5.92 m by fatal injury at 110.5667 s without falling, versus the alternating reference's cap loss. Rejected in `research/runs/vanguard/rejected/counter-band-court-left.json`. |
| Retaining a quiet standing punch through a brief tactical withdrawal | A bounded 0.4 s continuation reduces the left court case's final health deficit at 5.92 m, but still loses without falling. It commits 23 punches before a physical wall-clearance stall. Exact source and readings remain in `research/runs/vanguard/rejected/preparation-hold-source.json` and `preparation-hold-court-left.json`. |
| Turning and backing out of stalled wall clearance | The retained-preparation variant requests a 0.4 m/s sideways walk while making about 0.001 m/s progress in weight shift. A bounded turn and backstep restores attacks: 59 committed punches versus 23, with no falls. Both full left court bouts still lose. The prototype is not selected; exact source, paired readings and the unchanged-command observer remain in `research/runs/vanguard/rejected/clear-stall-source.json`, `clear-stall-court-left.json` and `diagnostics/clear-stall.json`. |
| Folding during exchanges with a standing opponent | A requested 0.3 m fold wins the right court case at 5.92 m at the cap, but falls at 19.0667 s and remains down. Shallower requests of 0.15 and 0.08 m both lose and add falls. None is selected. These ordinary 120 Hz Node Arena Duel bouts use the existing support skill and unchanged muscles, with Balance 0/0. Exact source and paired readings remain in `research/runs/vanguard/rejected/exchange-fold-source.json`, `exchange-fold-court-right.json` and `shallow-fold-court-right.json`. |
| Keeping each arm muscle's first drive direction until recovery | The selected preset and the latched-direction prototype reach no driven body-hit strokes within the 30 s standing-guard screen; the prototype adds a fall. Rejected before a full fight. Exact source and diagnostics remain in `research/runs/vanguard/rejected/ballistic-arm-source.json` and `diagnostics/ballistic-arm-*.json`. |
| Substituting the existing whole-body punch solver | The flat-out mode records one driven body-hit stroke within 30 s and falls. The timed mode falls at 9.8417 s before a driven body hit, ending its screen there. Both use unchanged muscle limits and are rejected before full fights. Recipes and diagnostics remain in `research/runs/vanguard/diagnostics/whole-body-*.json`. |
| A guard defined from each joint's anatomical zero | The Skeleton standing-guard screen reaches three distinct driven torso-hit strokes by 10.9083 s, versus none within 30 s, without falls. Their summed impact damage is 0.2364 HP and peak closing speed is 4.514 m/s. The full right Options court case at 5.92 m still loses by fatal injury at 98.7083 s without falling. Applying only the punch-preparation change produces no driven torso-hit strokes within 30 s. Both variants are rejected. Exact sources, paired readings and diagnostics remain in `research/runs/vanguard/rejected/anatomical-guard-source.json`, `anatomical-guard-court-right.json`, `anatomical-chamber-source.json` and `diagnostics/anatomical-*.json`. |

A short exchange is a development filter, not a win counted toward qualification.
