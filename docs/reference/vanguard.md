# Vanguard development panel

Vanguard remains unqualified against the requested field. Its explicit calibrated presets combine
committed point prediction, contact-driven attack/evasion choice and editable motor settings.
The Skeleton also learns each hand's contact score per attempted second. This improves the
four-case Options development panel on the current locomotion from 1/4 to 2/4, without falls;
both wins are health leads at the cap ([contact exchanges](#contact-exchanges)). The presets retain
the selected development configurations for the Warrior, Rogue and Skeleton. Contact selection
fails its sixth fresh campaign with three losses in three completed cases. All five preceding
qualification campaigns fail too. A separate [Warrior body screen](#warrior-body-screen) wins
its four frozen fresh Options cases without falls; all four are health leads at the cap, not
injury wins. A seventh [torso-cover challenger](#torso-cover-challenger) campaign is incomplete
after one fatal loss and a price cut. A fresh [Warrior Counter-puncher screen](#warrior-counter-puncher-screen)
stops with an open-stage win and a court loss. The selected Warrior's [additional route room](#room-for-an-exchange)
turns that court loss into a win and clears all four Counter-puncher development cases while
preserving four Options wins. At that source, the [fresh Warrior screens](#fresh-warrior-field)
win four cases each against Counter-puncher and Options, but the wider field stops on a Reptile
loss. The selected [low-entry revision](#replanting-low-support) wins all four retained Reptile
cases by injury without Warrior falls. Source `fe1c139b` wins four [fresh Reptile cases](#fresh-body-screens)
on the Warrior and four fresh Options cases on the Rogue. The Rogue's [route buffer](#rogue-route-room)
clears four fresh cases each against Counter-puncher and Options, but its [wider field](#fresh-rogue-field)
stops on a chase-and-trip loss. Its selected [standing wait](#standing-wait-after-a-fall) converts
that loss and clears nine development cases. A [fresh wait screen](#fresh-standing-wait-screen)
wins all four Behaviours cases, then stops on a Reptile pilot loss with seven cases unplayed.
The Skeleton's additional route room
[does not repair its court loss](#skeleton-route-and-blocked-steps). The full field and equipment
remain unqualified. Standing misses and early aim-loss returns pass their physical return gate;
an already driven [low target-loss miss](#low-target-loss-miss) still fails it on the Warrior.

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
configured evasion behaviour. Adaptive evasion requires an `evade` behaviour in that plan;
removing it requires disabling adaptation and revisiting. `slowEvade` caps an evasive step at
0.2 m/s. Evasion, low-target approach, preparatory backsteps and flanking preserve any stricter
intent or ordered speed ceiling, including zero, for both routes and direct steps. Only onset, loaded,
non-guard contacts on the committed stroke's intended target region contribute: normal impulse
times preceding relative normal speed ranks those impacts. This is a contact heuristic, not
the foe's health or the rulebook's damage. Both policies keep independent memories over one
prepared kit. Layers consume the active policy's operational context, independently of the
inspection report; incompatible planner combinations are refused before construction
([tactics contract](../architecture.md#minds)).

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

## Resume panel

The [resume summary](../../research/runs/vanguard/resume/summary.json) names every recipe,
source hash, case key, pose digest and completed result. The full rows are retained in
`research/runs/vanguard/resume/rows.jsonl`; the harness and rejected implementations are archived
beside them. These are reused development geometries, not fresh qualification cases.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons, empty hands,
Balance 0/0, zero sense delay, falls continuing to injury or the ordinary 120 s cap. The stance
is the one at `3319b5ae`. The right-court control is paired with the disabled closing prototype;
its complete source is retained in `research/runs/vanguard/resume/close-source.json`.

| Level / gap | Left preset result | Right preset result |
| --- | --- | --- |
| Court / 5.92 m | Loss at 120 s | Win at 120 s |
| Open / 3.24 m | Fatal-injury loss at 91.125 s | Fatal-injury loss at 44.0917 s |

None of these four preset cases falls. The previous qualification campaign's right-court loss
does not describe this locomotion. The three remaining losses still reject qualification.

| Candidate | Full-bout result and decision |
| --- | --- |
| A half-second forward step at 0.2 m/s after two committed strokes without contact | Loses the right court case at the cap, where the paired preset wins. Target-hit strokes rise from 12 to 13, without falls. Rejected. |
| Evasion of predicted head or trunk contact at the retained 0.2 m/s cap | Loses the right open case by fatal injury at 89.5083 s, without falling. Rejected. |
| Body-aware evasion at the gait's ordinary speed, with policy adaptation disabled | Wins the right open case at the cap, then loses the mirrored left case at the cap; neither falls. Rejected after the mirrored check. |
| Comparing head and trunk openings on both hands by their geometric estimates | Loses the right open case by fatal injury at 62.3167 s, without falling. Only two completed strokes record target contact; most selected head shots meet the guard. Rejected. |
| Learning target-contact success separately for each hand and region | Loses the right open case at the cap by a bar margin of 0.001155, without falling. Its lead at 70 s does not survive the full bout. Rejected. |

A 20 s diagnostic samples five standing preparations once per second. The held target bearing
differs from the updated bearing by at most 0.173 rad in those samples, while the body's actual
facing differs from the updated bearing by as much as 0.542 rad. These are preparation readings;
the [commitment reading](#commitment-facing) checks the drive itself.
The diagnostic remains in `research/runs/vanguard/resume/baseline-open-3.24-right-20.json`.

## Commitment facing

Measured-facing admission does not improve the retained four-case Skeleton panel: it wins one
of four, trading the preset's right-court win for the right-open win. A physical turning step,
counter timing, a centred stroke and stock motor calibrations also fail their development gates.
None is selected. Full recipes, source hashes, keys, pose digests and decisions are in the
[study summary](../../research/runs/vanguard/facing/summary.json); its thirteen full bouts are
retained in `research/runs/vanguard/facing/rows.jsonl` and `cases/`, with the rejected sources and
harness beside them. These are development cases, not fresh qualification evidence.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons, empty hands,
Balance 0/0, zero sense delay, falls continuing to injury or the ordinary 120 s cap. The reference
is the [resume panel](#resume-panel), with the stance at `3319b5ae`.

Two of the first six standing-punch commitments show more than 0.4 rad between actual facing
and the followed target bearing: 0.565 and 0.576 rad. The requested heading already matches the
target at each commitment. All six have the requested fist shape applied. The hand-closure
hypothesis is rejected. These are two readings of the same deterministic prefix, retained in
`research/runs/vanguard/facing/commit-read.json` and `hand-read.json`, not independent trials.

| Candidate | Full-bout result and decision |
| --- | --- |
| Admission against measured facing rather than requested heading | At open / 3.24 m, wins on the right and loses on the left, both at the cap. At court / 5.92 m, loses both at the cap. The panel remains 1/4; no falls. Rejected. |
| A bounded backward step to turn the feet before a misaligned attack | Loses the right open / 3.24 m case at the cap, without falling. Rejected. |
| Holding new attacks while a head or trunk impact is predicted | Loses that right open case at the cap, without falling. Rejected. |
| A centred one-drive combination with Vanguard's retained motor settings and point tracking | Loses that right open case at the cap, without falling. Rejected. |
| The stock straight-punch motor settings with Vanguard's point tracking | Loses that right open case by fatal injury at 69.5167 s despite a bar lead, 0.4973 against 0.4476. Its head-targeting variant loses by fatal injury at 63.5667 s. Neither falls; both are rejected. |
| Independently replacing reach, penetration, lean or hip turn with its stock value | All four lose that right open case: reach by fatal injury at 62 s, penetration at 117.3083 s, hip turn at 94.4083 s, and lean at the cap. None falls. The four-worker screen completes in 135.3 wall seconds and has no winner to widen. |

## Contact exchanges

The Skeleton selects its own `vanguard-exchange` planner under the existing planner layers.
It ranks action, hand and target choices by observed contact score per attempted second,
samples untried choices and revisits the least sampled choice every four completed attempts.
The score is contact impulse times preceding relative normal speed, including guarded contacts;
it is a sensed-contact heuristic, not wound damage or measured work. Cancelled attempts consume
time too. Each policy credits only actions it admitted, and reads each completed physics step
once. Its plain decision state forks and its shared inspection details show the per-hand rates.

The [development summary](../../research/runs/vanguard/exchange/summary.json) retains the paired
reference, complete recipes, source hashes, case keys and pose digests. Full rows, prototype and
selected sources and the harness remain beside it. Harness: Node Arena Duel, vendored
`rapier-coordinate`, 120 Hz, matched Skeletons, empty hands, Balance 0/0, zero sense delay,
falls continuing to injury or the ordinary 120 s cap. The reference is the
[resume panel](#resume-panel), with the stance at `3319b5ae`.

| Level / gap | Side | Reference | Contact selection | Candidate falls |
| --- | --- | --- | --- | ---: |
| Open / 3.24 m | Left | Fatal-injury loss | Time-limit loss | 0 |
| Open / 3.24 m | Right | Fatal-injury loss | Time-limit win | 0 |
| Court / 5.92 m | Left | Time-limit loss | Time-limit win | 0 |
| Court / 5.92 m | Right | Time-limit win | Time-limit loss | 0 |

The net gain selects the planner for the Skeleton. `npm run compare` reads the saved before/after
records as two complete mirrored units: win share rises from 0.25 to 0.50 and mean bar margin
improves by 0.058. The imported records retain their original recipes and source hashes; the
comparison is descriptive because their complete source provenance is outside Git. It still
loses two of four, with no injury wins, and these reused geometries do not qualify it.

## Contact-selection campaign

The frozen presets at `df761155` fail the sixth fresh Options matrix with zero wins and three
losses in three completed Skeleton cases. All reach the ordinary 120 s cap without falls.
The third non-win makes ten wins in twelve impossible. The campaign record contains nine
unfinished entries, not losses; its four Warrior entries have a separate
[body screen](#warrior-body-screen). There are no invalid cases. The three completed cases' Wilson 95% interval is
0 to 0.561; this sequentially stopped subset does not estimate the unplayed field's win rate.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched bodies, empty hands,
default attributes, Balance 0/0, zero sense delay, falls continuing to injury or the cap.
The conditions, full preset configurations and harness freeze before any bout; their source
hash is `sha256:a4f7664de866ef7ce15fff93549fab86be54a3ed322d41034c57652d6bc4e3d6`.
The [campaign record](../../research/runs/vanguard/qualification/campaign-6-options.json)
names completed rows and all unfinished cases. `conditions-6.json`, `fighter-6.json`,
`harness-6.json` and `cases-6/` beside it retain the selection rule, recipes and physical rows.
The two-worker pool runs for 274.1 wall seconds, below its nine-minute cutoff.

| Level / gap | Side | Result | Own / opponent bar | Committed punches | Candidate falls |
| --- | --- | --- | --- | ---: | ---: |
| Court / 6.93 m | Left | Time-limit loss | 0.4854 / 0.5527 | 89 | 0 |
| Court / 6.93 m | Right | Time-limit loss | 0.6167 / 0.6354 | 73 | 0 |
| Open / 7.63 m | Left | Time-limit loss | 0.5712 / 0.8930 | 89 | 0 |

The saved-row reading (`reading-6-options.json`) finds damaging hand contacts in each case.
In the open case the opponent's recorded injury is confined to its arms, despite eleven strokes
recording non-guard contact with that body. Entering a stroke or registering a target touch is insufficient;
the body-only attack selection still fails to deliver effective injury through this guard.
These conditions become development evidence for the next candidate.

Adding a separately named head-punch choice to the contact selector still loses the full open-left
case at 7.63 m at the cap, without falling: own bar 0.5962 against 0.7677, with 80 committed
punches. The new action is sampled but produces no recorded head injury. The declared loss gate
rejects it without wider cases. The full recipe, source and paired reference key remain in
`research/runs/vanguard/targets/summary.json`, `head-choice-source.json` and `cases/`. This uses
the same Node harness, physics and rules as the campaign; it is development evidence.

Excluding guarded contacts from the per-hand score also loses that full open-left case at the
cap without falling: own bar 0.6998 against 0.7289, with 73 committed punches. The narrower
health deficit does not pass its declared win gate. No wider cases run and the prototype is
rejected. Its exact source, paired reference key and full row remain in
`research/runs/vanguard/guard-credit/implementation.json`, `summary.json` and `cases/`.

## Guarded stroke reading

The first six committed punches of the failed open-left case at 7.63 m develop forward fist
speed before meeting the opponent's arms. The step count's generic target-hit reset also accepts
an upper-arm contact outside the requested trunk region. It therefore need not mean the guard
has been passed.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons, empty hands,
default attributes, Balance 0/0, zero sense delay. The unchanged candidate's 14.175 s diagnostic
prefix at `ca6f04ad` is read twice with the same pose digest, `d24aef774da56f80`; these are readings
of one prefix, not independent bouts. The complete recipe, source hash, per-step samples and
harness are retained in `research/runs/vanguard/stroke/reading.json`, `reading-source.json`,
`reading-aim.json` and `reading-aim-source.json`.

| Punch | First loaded contact | Ledger target / block episodes |
| --- | --- | --- |
| Right, id 2 | Left forearm | 0 / 1 |
| Left, id 3 | Right forearm and upper arm | 1 / 1 |
| Right, id 4 | Left forearm | 0 / 1 |
| Right, id 5 | Left upper arm | 1 / 1 |
| Left, id 6 | Right forearm | 0 / 2 |
| Right, id 7 | None | 0 / 0 |

Driven forward-speed peaks before first contact range from 3.49 to 6.75 m/s. At those peaks the
prediction moves the followed anchor by 0.015 to 0.035 m. The reading does not support a large
prediction error as the main cause of these blocks. The ledger's `target` class means any
non-guard segment of the requested body (`actionInstances.observe`), while the requested
`middle` region contains only the upper and middle trunk (`human/spec.ts`).

Requiring a requested-region contact before resetting the blocked-stroke count wins the full
open-left case at 7.63 m, but regresses the five-case development panel from 2/5 to 1/5. All five
finish at the cap without falls. The policy trades two previous wins for that one new win and is
rejected. The [panel](../../research/runs/vanguard/stroke/panel.json), `region-source.json`,
`widen-source.json` and `cases/` retain the exact implementation, harness, recipes, reference keys
and pose digests. The pilot takes 115.6 wall seconds and the two-worker widening 285.8 s.
`npm run compare` reads the imported before/after records: only the 6.93 m court cell is a
complete mirrored unit, losing both sides under both policies; the other three cells remain
incomplete units. The five fixed-case outcomes below are descriptive development evidence.

| Level / gap | Side | Reference | Region-specific reset | Own / opponent bar |
| --- | --- | --- | --- | --- |
| Open / 7.63 m | Left | Loss | Win | 0.8255 / 0.7620 |
| Court / 6.93 m | Left | Loss | Loss | 0.5518 / 0.6537 |
| Court / 6.93 m | Right | Loss | Loss | 0.5523 / 0.6555 |
| Open / 3.24 m | Right | Win | Loss | 0.6344 / 0.7206 |
| Court / 5.92 m | Left | Win | Loss | 0.6364 / 0.6589 |

A physical preparation feint toward the head, followed by the committed body punch, loses the
full open-left case at 7.63 m at the cap without falling: own bar 0.7729 against 0.8373, with
68 committed punches. Its declared loss gate rejects it without wider cases. The source,
complete recipe, reference key and physical row remain in `research/runs/vanguard/feint/`.

Restricting the standing punch to `middleTrunk` loses the same full open-left case by fatal
injury at 50.9 s without falling: own bar 0.4833 against 0.7610, with 33 committed punches.
It is rejected without wider cases. The configuration, reference key, harness and physical row
remain in `research/runs/vanguard/mid-trunk/`.

Driving the free covering hand with a critically damped point-acceleration request, through
the unchanged muscle-limited motor, loses the full open-left case at 7.63 m at the cap without
falling: own bar 0.6894 against 0.7917, with 63 committed punches. The prototype preserves action
reservations, leaves folded support alone and uses Balance 0/0. It passes the type check but
fails its full-bout win gate, so no wider cases run and the implementation is removed. The
exact source, configuration, reference key and row remain in `research/runs/vanguard/point-guard/`.

## Upper-arm choices

Deliberate upper-arm targets do not solve the limiting Skeleton open-left bout at 7.63 m.
The candidate loses by fatal injury at 81.1083 s without falling; its four other development
geometries are unplayed. The selected configuration is unchanged.

The candidate adds two surface-aimed actions, one for each upper arm, alongside the body punch.
It retains the same executors, planner, locomotion, attributes and rules. The contact selector
admits 24 punches at the left upper arm and three at the right; the body action commits 22.
Exact time, hand and struck-segment joins attribute 0.1842 HP of accepted opponent injury to
the arm-directed actions and 0.2669 HP to body-directed actions. These are harness readings,
not inputs to the policy. More delivered injury does not prevent the candidate's fatal loss.

| Configuration / open left, 7.63 m | Ending | Own / opponent bar | Candidate falls |
| --- | --- | --- | ---: |
| Current selected baseline | Time-limit loss, 120 s | 0.5712 / 0.8930 | 0 |
| With upper-arm choices | Fatal-injury loss, 81.1083 s | 0.5050 / 0.8157 | 0 |

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0 and zero sense delay, falls continuing. Both versions
run at source `sha256:002cac7c7fe30ccf8eec941ce515e4e022f5b01b9674042c3158f0e6d30220fd`.
The baseline exactly repeats the earlier full pose digest, `628b197c866f37a9`, after equipment
support is added. The two-worker pilot takes 125.0 active wall seconds, below its nine-minute
cutoff. The failed pilot stops widening. `npm run compare` finds no complete mirrored unit;
these single-side readings establish neither a panel gain nor qualification. The exact recipes,
validated configuration, source, contact joins and full rows remain in
[the paired record](../../research/runs/vanguard/arm-targets/summary.json) and its directory.
The rejected arm actions are not installed in a preset.

## Post-stroke withdrawal

A bounded withdrawal after a completed standing punch narrows the limiting open-left deficit
at 7.63 m, but still loses. Adding the upper-arm choices to that prototype also loses and
weakens its final margin. Neither configuration is selected; the withdrawal implementation
is removed.

The layer waits for every native action to leave the live report, then uses the straight punch's
support-entry predicate. It requests 0.25 m along the direction away from the opponent at the
start, at most 0.3 m/s, and ends within two seconds. A one-second bound limits the support wait.
The existing navigator checks the retreat, the existing guard covers, and stricter intent or
ordered pace is retained. Explicit movement, low opponents and unavailable bodies cancel it.
No physical assistance, strength or wound rule changes.

The withdrawal-only body starts 24 retreats. Of the 23 completed before the bell, nine reach
the requested stance-centre displacement and fourteen reach the two-second bound. The remaining
retreat is underway when the ordinary bout ends. This measures the body's movement along the
initial direction; it does not establish that the pursuing opponent stays outside reach.

| Configuration / open left, 7.63 m | Ending | Own / opponent bar | Candidate falls |
| --- | --- | --- | ---: |
| Selected baseline | Time-limit loss, 120 s | 0.5712 / 0.8930 | 0 |
| Withdrawal after completion | Time-limit loss, 120 s | 0.6802 / 0.8633 | 0 |
| Withdrawal and upper-arm choices | Time-limit loss, 120 s | 0.5550 / 0.8389 | 0 |

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0 and zero sense delay, falls continuing. The prototype
source is `sha256:778b187e1e095148c741ded18d027a830a1e4183068491c650782d02043f30cd`.
With the layer disabled, the baseline repeats the full pose digest `628b197c866f37a9`. The
two-worker withdrawal pilot takes 129.4 active wall seconds. The combined candidate reuses the
exact withdrawal-only parent row and takes 120.5 s; each cohort is below its nine-minute cutoff.
Each failed pilot leaves its other four geometries unplayed. Neither has a complete mirrored
comparison unit or establishes a qualified win rate. Typecheck, entrant scope and detached
ownership, navigation, pace, resume and complete-state fork probes pass. Exact sources, recipes,
motion readings, physical rows and saved-row comparisons remain with the
[withdrawal record](../../research/runs/vanguard/withdraw/summary.json) and
[combined record](../../research/runs/vanguard/withdraw-arms/summary.json).
The selected runtime is restored exactly.

## Counter-window reading

The sensed returning-hand window does not earn a counter-gate trial. In the retained Skeleton
left-court winner at 5.92 m, it contains one accepted torso-hit attempt in fourteen admissions,
against two in thirty outside it. These small fractions provide no clear timing separation,
and the declared minimum of two torso-hit attempts in the window is unmet. No controller
change follows this diagnostic.

The window requires either opponent hand to extend more than 0.35 m toward the body from its
upper trunk while retracting faster than 0.25 m/s relative to the trunk's rigid-point motion.
Features are copied from granted senses at admission and commitment. Accepted injury is joined
from the harness afterward; it never enters the fighter. The screen stops at 32 ended committed
strokes, with at least eight admissions in each class: 56.1833 simulated seconds and 61.9 active
wall seconds. Its blow and action prefix exactly matches the retained bout, with pose digest
`e1d11339f9650da6`. It is a passive reading, not another independent result.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0 and zero sense delay. Source is
`sha256:002cac7c7fe30ccf8eec941ce515e4e022f5b01b9674042c3158f0e6d30220fd`.
The [reading](../../research/runs/vanguard/counter-window/reading.json), exact recipe, fixed decision
rule and observer source remain in `research/runs/vanguard/counter-window/`.

## Two-hand ward

Separately warding both opponent hands loses the limiting Skeleton open-left bout at 7.63 m
by fatal injury at 60.3 s, without falling. Own and opponent bars are 0.4969 and 0.7393. The
selected baseline loses at the ordinary 120 s cap, 0.5712 against 0.8930. The prototype fails
its win gate; its other four geometries are unplayed and the implementation is removed.

With both bare hands free, two unchanged threat readers each see one opponent hand through
detached filtered views. Lateral position assigns the two covers to the body's left and right
hand. A live or newly starting stroke keeps the ordinary ward; equipment and low support keep
their guards. The shared guard skill produces distinct point goals through the normal muscle
controller. The separate-cover path runs in 50.5% of the pilot's solver intervals. This verifies
that it executes, not that either hand reaches every moving cover.

Harness: the same Node Arena Duel conditions above, on the open stage at 7.63 m. Prototype source
is `sha256:9e4b54b69c5b1212b2f738be149fc4d0d71aa25fc9995d91f23c8c19f00ee9e7`;
the selected baseline row is reused at the preceding source. The one-worker pilot takes 59.5
active wall seconds, below its nine-minute cutoff. Typecheck, entrant-only scope, detached
physical-goal, ownership, immutable-senses, low-support, equipment and complete-state fork probes
pass. The [record](../../research/runs/vanguard/dual-ward/summary.json), exact sources, configuration,
physical row and saved-row comparison remain in `research/runs/vanguard/dual-ward/`.
There is no complete mirrored comparison unit and no qualification claim. The selected runtime
is restored exactly.

## Joint timing and cover

Twelve frozen configurations jointly vary standing-punch timing and geometry, cover, contact
selection patience and policy layers. None wins all four mirrored Skeleton development cases.
The [panel summary](../../research/runs/vanguard/joint-panel-1/summary.json), `manifest.json`,
`harness.json`, `runner-revision-2.json` and `cases/` retain the configurations, exact sources,
case keys and physical rows. Each configuration stops at its first non-win or candidate fall.
Fourteen bouts complete: two time-limit wins and twelve losses, with no candidate falls or
invalid cases; thirty-four cases remain unplayed. This screen does not qualify a fighter.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0, zero sense delay, falls continuing to injury or
the ordinary 120 s cap. The runtime is unchanged from the contact-selection campaign, at
`89b510e6`. The four-worker pilot prices the remaining work below the nine-minute cutoff;
the pilot and resumed pool use 495.1 active wall seconds in total.

Candidate 7 wins both open sides at 7.63 m, then loses the left court case at 6.93 m.
Its right court case is unplayed. Disabling only its blocked-stroke sidestep changes that left
court loss to an injury win, but the right court bout loses by injury at 38.05 s. The ablation
is rejected; its two open regressions are interrupted when the court loss decides the screen.
The [ablation summary](../../research/runs/vanguard/without-step/summary.json), `implementation.json`,
`widen-manifest.json`, `widen-source.json` and `cases/` retain both complete bouts and the
unfinished cases. The pilot and three-worker widening use 135.6 active wall seconds.

| Level / gap | Side | Candidate 7 | Without blocked-stroke stepping |
| --- | --- | --- | --- |
| Open / 7.63 m | Left | Win at 120 s | Interrupted |
| Open / 7.63 m | Right | Win at 120 s | Interrupted |
| Court / 6.93 m | Left | Loss at 120 s | Injury win at 113.0417 s |
| Court / 6.93 m | Right | Unplayed | Injury loss at 38.05 s |

Neither ablation bout has a fall. `npm run compare` reads the retained before/after records
as zero complete matched mirrored units: the original court-right case is absent and the
ablation's open cases are incomplete. The single-side court improvement is development evidence,
not a paired panel gain. Neither configuration is selected.

Keeping candidate 7's sidestep but changing its body cover to ward the sensed incoming weapon
also loses the left court case, by fatal injury at 97.4333 s without falling. Own and opponent
bars are 0.4908 and 0.5143. Its win gate rejects it without wider cases. The exact configuration,
source, complete row and saved-row comparison remain in `research/runs/vanguard/ward-cover/`;
the one-worker pilot takes 97.8 active wall seconds. The cover change is not selected.

An entrant-local evasion part reads predicted threats to the head-to-centre axis, instead of
only the head. A detached geometric fixture confirms that a trunk-directed fist trajectory
triggers its retreat while the ordinary head-only reader reports no threat. The prototype
still loses candidate 7's full left court case at the cap, without falling: own bar 0.5201
against 0.7051, versus the original's 0.6384 against 0.6647. The win gate rejects it without
wider cases. Typecheck and the entrant scope check pass; the implementation is removed after
the bout. Its exact source, fixture, configuration, physical row and saved-row comparison
remain in `research/runs/vanguard/body-evade/`. The one-worker pilot takes 104.0 active wall
seconds. This geometric sensing gap does not establish that broader evasion improves the fight.

## Arm drive

The unchanged Skeleton punch repeatedly reverses arm drives before first loaded contact.
In the six-stroke open-left prefix at 7.63 m, wrist push reversals range from ten to thirty-seven
per stroke before first contact or the drive's end; the shoulder and elbow drives reverse too.
The 14.175 s prefix repeats pose digest `d24aef774da56f80`, so it is another reading of the
[guarded strokes](#guarded-stroke-reading), not new independent evidence. The
[drive reading](../../research/runs/vanguard/speed-drive/summary.json), `reading.json`,
`reading-source.json` and `summary-source.json` retain the measured angles, rates, pushes,
contacts and harness. Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched
Skeletons, empty hands, default attributes, Balance 0/0, zero sense delay.

Returning wrist alignment to the ordinary posture servo reduces fresh loaded-contact strokes
from five of six to one of six, and non-guard target-body contact strokes from two to zero.
Its six committed strokes finish by 16.4833 s. Removing wrist pushes makes their push-reversal
count zero by construction; that does not establish steadier physical motion. The lost contact
rejects this variant before a full bout. Exact source and the diagnostic remain in
`research/runs/vanguard/servo-wrist/`.

A finite-speed wrist drive instead closes its angle errors over 0.025 s, converting angle rates
to joint-axis speeds through the body's own measured turning map. Muscle strengths and limits
are unchanged. It loses the full open-left case by fatal injury at 98.8417 s without falling:
own bar 0.4945 against 0.5484, with 59 committed punches. Its full-bout win gate rejects it;
the four regression cases remain unplayed. The exact source, configuration, full physical row,
paired reference key and saved-row comparison remain in `research/runs/vanguard/wrist-speed/`.
The one-worker pilot takes 96.1 active wall seconds. Both prototypes pass typecheck.

Applying the same 0.025 s finite-speed control to the shoulder, elbow and wrist still loses
the full open-left case at the cap without falling: own bar 0.6117 against 0.6676. The narrower
deficit does not pass its win gate, and the four regression cases remain unplayed. Exact source,
configuration, full physical row and saved-row comparison remain in
`research/runs/vanguard/arm-speed/`. The one-worker pilot takes 119.5 active wall seconds;
typecheck passes. The trunk drive and all muscle strengths are unchanged.

Both faster whole-arm intervals fail the same full limiting case without falling. Neither
earns the four regression cases; all eight remain unplayed. The two-worker screen takes
129.8 active wall seconds. Exact configurations, source, full rows and separate saved-row
comparisons remain in `research/runs/vanguard/arm-rate/`.

| Closing interval | Result | Own / opponent bar |
| --- | --- | --- |
| 0.005 s | Fatal-injury loss at 102.9083 s | 0.4996 / 0.6050 |
| 0.010 s | Time-limit loss | 0.6855 / 0.7210 |

The saved-record comparisons contain no complete matched mirrored unit for these single-side
pilots. Their narrower deficits are descriptive development evidence. No finite-speed variant
is selected, and all motor prototypes are removed. Repeated arm-drive reversals do not by
themselves establish the cause of the failed matchup.

## Surface selection

At commitment, all six punches in the limiting open-left prefix at 7.63 m anchor to the same
segment the surface selector chooses: `upperTrunk`. This reading does not reproduce a lost
segment identity, so the anchor assignment is unchanged. The 14.175 s diagnostic repeats pose
digest `d24aef774da56f80`; it is the same prefix, not six independent bouts. Exact queries,
selected surfaces, anchored segments, recipe and harness remain in
`research/runs/vanguard/anchor-identity/reading.json` and `reading-source.json`. Harness: Node
Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons, empty hands, default
attributes, Balance 0/0 and zero sense delay.

An entrant-local surface-grid aim samples a three-by-three grid at 90% of each target's local
half-extents. It ranks the striking point's lanes by the number of intervening natural body
colliders, then distance, querying hulls, capsules and the sensed hand envelopes. A geometric
fixture verifies a lane beside a central hull guard and a changed choice when the hand envelope
changes. The full limiting open-left bout still loses at the cap without falling: own bar
0.5136 against 0.5532. Its win gate rejects it without the four regression cases. Exact source,
fixture, configuration, full physical row and saved-row comparison remain in
`research/runs/vanguard/surface-grid/`. The one-worker pilot takes 126.1 active wall seconds.

Combining that aim with the 0.010 s [finite-speed arm drive](#arm-drive) wins the same open-left
case at the cap, without falling, but loses a retained left-court winner by fatal injury at
88.8833 s. The preservation gate rejects the combination and interrupts its three other
regressions. The [combined summary](../../research/runs/vanguard/surface-speed/summary.json),
`manifest.json`, `implementation.json`, `harness.json` and `cases/` retain the exact configuration,
source, complete rows and unfinished cases. The one-worker pilot and four-worker widening use
232.8 active wall seconds in total; the widening's first intervals price it below the
nine-minute cutoff.

| Level / gap | Side | Selected reference | Grid aim and finite-speed arm | Own / opponent bar |
| --- | --- | --- | --- | --- |
| Open / 7.63 m | Left | Time-limit loss | Time-limit win | 0.5020 / 0.4979 |
| Court / 5.92 m | Left | Time-limit win | Fatal-injury loss | 0.4213 / 0.8147 |

Neither completed combined bout has a fall. `npm run compare` reports zero complete matched
mirrored units; these two fixed-case outcomes are descriptive development evidence. Typecheck
and the entrant scope check pass for both prototypes. Neither is selected, and the implementations
are removed. The new open win does not outweigh losing a previous winner.

## Sensed impact balance

The contact-balance selectors do not qualify a new fighter. Starting with the standard stroke
preserves the court winner but loses the limiting open case; starting exposed loses the court.
The fixed profiles' complementary wins do not carry through these feedback-driven switches.

The feedback estimates dissipated energy as contact impulse times preceding relative normal
closing speed over two, splits it by the colliders' compliance and normalizes each side by its
nominal pool capacity. It reads the body's own contacts and the nearest observed counterpart
surface's motion and material, including guarded contacts. It reads no current injury state or
opponent policy. The figure is a contact score, not measured work or wound damage.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0 and zero sense delay. Two 30 s prefixes of the left
court case at 5.92 m score the known winning standard profile above the regressing exposed profile.
The diagnostic identifies every sampled counterpart correctly against the harness's trusted
identities, with no unmatched events. Exact inputs, queries, source and readings remain in
`research/runs/vanguard/contact-energy/`. These prefixes are diagnostics, not independent bouts.

| Fixed profile | Score given | Score taken | Net at 30 s | Loaded onset events |
| --- | ---: | ---: | ---: | ---: |
| Standard | 19.6056 | 18.2417 | 1.3639 | 109 |
| Surface grid and finite-speed arm | 23.0058 | 28.4550 | -5.4492 | 104 |

The selector retains a profile with nonnegative cumulative balance and samples or returns to
another only after a negative balance, between strokes. Its state includes both executors,
previous physical motion, contact episodes and profile scores. A detached contract probe verifies
that active strokes do not switch, positive balance retains a profile, inactive reach is refreshed
and a fork replays the whole decision state exactly (`attempt-feedback/probe.json` below).

| Review / initial profile | Court / 5.92 m / left | Open / 7.63 m / left | Active pool wall time |
| --- | --- | --- | ---: |
| Six-second trials / standard | Win at 120 s, bars 0.7074 / 0.6402 | Loss at 120 s, bars 0.6316 / 0.7151 | 263.5 s |
| Each completed attempt / standard | Win at 120 s, bars 0.7051 / 0.6286 | Loss at 120 s, bars 0.5857 / 0.6633 | 254.3 s |
| Each completed attempt / exposed | Loss at 120 s, bars 0.7255 / 0.8792 | Unplayed | 134.5 s |

All five complete bouts have no candidate falls; repeated conditions under different controllers
are not pooled into a win rate. Each standard-first controller leaves three regressions unplayed
after the open loss. Exposed-first leaves all four remaining cases unplayed after the court loss.
The timed open controller switches to exposed at 13.3083 s; per-attempt review switches at
7.3333 s. Both stay exposed for the rest of their losing open bouts. Exposed-first tries standard
on the court at 15.7 s and returns to exposed at 16.5833 s; it still loses.

Exact configurations, complete physical rows, mode histories and saved-row comparisons remain in
`research/runs/vanguard/balanced-stroke/`, `attempt-feedback/` and `exposed-first/`. Their source and
harness snapshots preserve the missing mode instrumentation in the timed court pilot separately
as `balanced-stroke/harness-pilot-1.json`. Typecheck and the entrant scope check pass; the full-bout
selection gates fail. `npm run compare` reports zero complete matched mirrored units for these
single-side trials. All three prototypes are rejected and removed.

## Low kick after blocks

A bounded low-kick response to repeated hand blocks fails the limiting open-left Skeleton bout
against Options at 7.63 m. It admits one kick at 17.05 s, reaches foot unloading at 18.4833 s and
commits no kick. Recovery takes over at 21.8083 s; the first fall follows at 21.8833 s. The bout
continues to the ordinary 120 s cap and loses, bars 0.9087 against 0.9281. The four regression
cases remain unplayed. The pilot rejects this entry into the shared kick, not the physical
capability established by its [stand record](front-kicks.md#harness-and-qualification).

The entrant-local planner waits for two guard-only blocked hand strokes and the live hand's
release, approaches for at most eight seconds at no more than 0.18 m/s, and then retains one
request through the kick's native transfer, strike and return. It uses the shared `ARENA_KICKS`
profile and leg-height aim at 0.4 m, with no anatomical or solver changes. A detached probe
verifies admission, ownership, bounded approach and exact whole-state replay; typecheck and the
entrant scope check pass. An initial setup using the hand-only surface aim is refused before
physics and retained as invalid setup, not a loss.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons, empty hands,
default attributes, Balance 0/0 and zero sense delay. The one-worker pilot takes 74.8 active wall
seconds. Exact source, configuration, lifecycle probe, full physical row, invalid setup and
saved-row comparison remain in `research/runs/vanguard/low-kick/`. The single-side comparison
contains no complete mirrored unit. The prototype is rejected and removed.

## Body hook repertoire

Adding the shared path strike's body hook to the Skeleton's contact-learning repertoire loses
the limiting full open-left Options bout at 7.63 m by fatal injury at 62.1833 s, bars 0.4110
against 0.7092, without falls. The fighter commits 35 straight punches and 14 hooks. None of its
ended hook records reports a target contact; three report blocks, and four time out on return.
The four regression cases remain unplayed. The extra trajectory does not pass either the win
gate or controlled recovery.

The candidate adds one `path-strike` executor with non-overlapping returns and one body-hook
action, both hands, middle-region surface aim and the shared trajectory settings unchanged.
The existing contact planner chooses the action; no planner, anatomy, attributes or physics
changes. Its [stand-qualified close hook](combat-strikes.md#close-hook) does not establish this
moving fight's outcome. Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched
Skeletons, empty hands, default attributes, Balance 0/0 and zero sense delay. The one-worker
pilot takes 63.2 active wall seconds.

The complete configuration, harness, physical row and saved-row comparison remain in
`research/runs/vanguard/body-hook/`. The single-side comparison contains no complete mirrored
unit. The configuration is rejected; the selected preset is unchanged.

## Warrior body screen

The unchanged Warrior preset wins all four frozen fresh Options cases across both levels and
sides, without candidate falls. All four wins are health leads at the ordinary 120 s cap; none
is an injury win. Its completed-only Wilson 95% interval is 0.510 to 1.000. Four bouts against
one opponent do not qualify the fighter across the requested field or establish its true win
rate above 80%. The Skeleton's three non-wins still reject the full twelve-case matrix.

The cases are the Warrior entries of `qualification/conditions-6.json`, with their original
keys and recipes. The source identity remains
`sha256:a4f7664de866ef7ce15fff93549fab86be54a3ed322d41034c57652d6bc4e3d6`;
the freeze verifies that the selected preset equals the archived Warrior configuration before
play. No candidate changes between cases. The first non-win or candidate fall rejects this
body screen; the left court pilot wins, so the other three cases run. The complete screen
passes, protecting the Warrior calibration while Skeleton development remains open.

| Level / gap | Side | Ending | Own / opponent bar | Candidate falls |
| --- | --- | --- | --- | ---: |
| Court / 7.93 m | Left | Time-limit win | 0.7626 / 0.6710 | 0 |
| Court / 7.93 m | Right | Time-limit win | 0.8973 / 0.5763 | 0 |
| Open / 4.94 m | Left | Time-limit win | 0.9396 / 0.9095 | 0 |
| Open / 4.94 m | Right | Time-limit win | 0.9435 / 0.9295 | 0 |

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Warriors, empty hands,
default attributes, Balance 0/0 and zero sense delay, falls continuing to injury or the cap.
The pilot and three-worker widening take 370.6 active pool wall seconds, below the nine-minute
cutoff; the widening's first intervals price the pool below that ceiling. Exact configuration,
source and harness snapshots, full physical rows, case keys, pose digests and uncertainty remain
in `research/runs/vanguard/warrior-fresh/`. The original campaign record retains its stopped
schedule; the separate body record supplies these four completed entries. No other opponent,
equipment, Rogue case or remaining Skeleton case is played by this screen.

## Warrior Counter-puncher screen

The frozen Warrior fails the fresh Counter-puncher screen: it wins the left open-stage bout by
injury, then loses the left court bout by injury. Both bodies remain upright in both completed
bouts. The two mirrored confirmations are interrupted when the court loss decides the screen;
there are no invalid cases. This does not qualify the matchup or establish a field win rate.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Warriors, empty hands,
default attributes, Balance 0/0, zero sense delay, continuing after falls to injury or the ordinary
120 s cap. Protocol `vanguard-warrior-counter-fresh-1` freezes both configurations before selecting
unused starting geometry. Source is `002cac7c`, based on commit `6ec0e0cb`; the complete source
identity, configurations, native case identities and recipes are in
`research/runs/vanguard/warrior-field/counter/manifest.json`.

The declared decision requires all four fresh cases to win, mirrored across both levels; the
first loss or draw stops it. The initial sequential price projection cuts an unfinished pilot.
Scheduling changes to one pilot followed by three parallel confirmations, retaining the same
frozen cases, criterion and cumulative nine-minute cap. Both executions use 112.6 active wall
seconds in total. Interrupted trials are not outcomes.

| Level / gap / side | Result | Vanguard / opponent ending bar | Falls, either side |
| --- | --- | --- | --- |
| Open / 4.18 m / left | Fatal-injury win at 105.2333 s | 0.7392 / 0.4944 | None |
| Court / 4.58 m / left | Fatal-injury loss at 20.6833 s | 0.6282 / 0.9350 | None |
| Open / 4.18 m / right | Interrupted | Unfinished | Unfinished |
| Court / 4.58 m / right | Interrupted | Unfinished | Unfinished |

The completed subset is 1/2, with a descriptive 95% Wilson interval of 0.0945–0.9055. Stopping on
the first nonwin leaves the matrix incomplete; that interval does not estimate the unplayed cases.
Full rows, blows, action ledgers, controller snapshots and the native evaluation record are retained
beside the manifest.

The court ledger contains three committed punches, the last ending at 9.0833 s. A passive replay
matches the complete pose digest `7d596808e603e51d` and every recorded blow exactly. All 22 half-second
samples from 10 to 20.5 s report wall clearance, with only 0.0545 m horizontal displacement between
the first and last. Navigation requests the sensed +z exit while the stance stays in weight shift;
most received injury is struck on the upper trunk. This identifies a clearance stall, without
establishing that a particular replacement will win. The diagnostic takes 9.0 wall seconds and
is retained as `clearance-diagnostic.json`.

A Warrior-only `vanguard-clear` prototype stops to face the sensed exit within 0.2 rad before a
forward walk capped at 0.3 m/s. It preserves live action requests and the earlier ordered movement.
It fails the paired court case by fatal injury at 23.35 s, with bars 0.6203 / 0.9852 and no falls.
Only one punch commits; the 10 s and 20 s snapshots remain in its turning phase. The declared
win gate rejects it, so the three other development cases are unplayed and the selected source
is restored exactly. Typecheck and the two-file entrant scope check pass. The trial takes 10.3
active wall seconds. Source `f4031fa1`, configurations, full row and harness are retained under
`research/runs/vanguard/warrior-exit/`. Its saved-record `npm run compare` reading has zero complete
mirrored units; the single-case failure is not a paired-panel improvement claim.

## Room for an exchange

The Warrior's selected navigator, `vanguard-navigation` (`navigation-part.ts`), gives approaches
an additional 0.1 m of horizontal obstacle room. It pads a detached copy of sensed solids for
the shared visibility navigator's route and steering; physical collision geometry, anatomy,
attributes, muscles and the ordinary clearance exit remain unchanged. The setting is editable
in the navigation slot, and zero uses the ordinary navigator. Rogue and Skeleton keep their
ordinary navigation. The new state contains the wrapped navigator and its frozen geometry cache;
an Arena save/load probe reproduces the complete tail state and pose digest exactly.

Selection requires all four retained Counter-puncher bouts to win and preservation of all four
earlier Warrior Options wins without candidate falls. A 0.2 m trial
clears Counter-puncher but loses the first Options court case at the cap, so it is rejected.
The 0.1 m trial clears both screens. These are known geometries, not fresh qualification.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Warriors, empty hands,
default attributes, Balance 0/0, zero sense delay, continuing after falls to injury or 120 s.
The ordinary navigator's two missing Counter-puncher sides are completed for the paired study;
its two existing rows are reused. The original stopped fresh-screen record is unchanged.

| Counter-puncher case | Ordinary navigator | Additional 0.2 m | Selected 0.1 m |
| --- | --- | --- | --- |
| Court / 4.58 m / left | Fatal loss at 20.6833 s | Fatal win at 65.3167 s | Fatal win at 53.9083 s |
| Court / 4.58 m / right | Fatal win at 94.5583 s | Fatal win at 34.6 s | Fatal win at 81.6417 s |
| Open / 4.18 m / left | Fatal win at 105.2333 s | Exact same bout | Exact same bout |
| Open / 4.18 m / right | Fatal win at 42.475 s | Exact same bout | Exact same bout |

Every Counter-puncher bout above has no falls on either side. The selected left-court bout
commits 30 completed punches instead of three; its ending bars are 0.8558 / 0.5632. Both open-stage
bouts preserve the ordinary navigator's complete pose digests. Saved-record `npm run compare`
reads two complete, fault-free mirrored units with no changed shared context: four wins rather
than three. Two conditions do not establish an opponent's true win rate.

| Options case | Additional 0.2 m | Selected 0.1 m, Vanguard / opponent bar |
| --- | --- | --- |
| Court / 7.93 m / left | Cap loss, 0.8518 / 0.9669 | Cap win, 0.8205 / 0.6570 |
| Court / 7.93 m / right | Unplayed after rejection | Cap win, 0.8381 / 0.6727 |
| Open / 4.94 m / left | Unplayed after rejection | Cap win, 0.9396 / 0.9095 |
| Open / 4.94 m / right | Unplayed after rejection | Cap win, 0.9435 / 0.9295 |

The selected Options cases have no falls on either side. Their two open-stage bouts match the
earlier [body screen](#warrior-body-screen) digests exactly; the changed court bouts preserve
wins. Counter-puncher and Options each supply four development wins, not eight independent
held-out wins. Their other starts, other opponents, bodies and equipment remain unqualified.

Complete recipes, sources, native rows, comparisons, decisions and harnesses are retained in
`research/runs/vanguard/warrior-room/` for the rejected 0.2 m setting and paired ordinary baseline,
and `research/runs/vanguard/warrior-room-10cm/` for the selected setting. Their full source hashes
start `2a1c976a` and `ba63a215`. The 0.2 m Counter-puncher pool takes 62.6 active wall seconds,
its Options rejection 58.6 s, and the two missing baseline rows 33.1 s. The selected setting's
Options pool takes 98.9 s and Counter-puncher 61.9 s. Each pool is priced below its nine-minute
cutoff. There are no invalid cases. The selected save/load probe also verifies unchanged sensed
geometry and a whole-config link round-trip.

Typecheck, all 116 tests, production build, entrant-only scope and the line-ending gate pass.
The production Arena briefly shows the selected navigator approaching and exchanging punches
beside the column, with advancing render frames and no console errors. The existing large-chunk
build warning remains; the temporary preview is stopped by its own PID.

## Fresh Warrior field

The frozen Warrior with 0.1 m additional route room wins all four fresh Counter-puncher cases
and all four fresh Options cases. Each opponent covers both Arena levels and mirrored sides.
None of these eight bouts has a fall on either side. The observed 4/4 for each opponent has a
descriptive 95% Wilson interval of 0.5101–1.000; it does not establish a true win rate above 80%.
Other bodies and equipment are outside these screens.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Warriors, empty hands,
default attributes, Balance 0/0 and zero sense delay, with falls continuing to injury or the
ordinary 120 s cap. Source `ba63a215` is frozen at commit `c947f6bd`, with both configurations
fixed before the starting gaps are selected. Each opponent requires four wins; a first loss or
draw stops its screen. The fixed hash selection excludes previous recorded Warrior geometry.

| Opponent / level / gap | Left assignment | Right assignment |
| --- | --- | --- |
| Counter-puncher / court / 4.23 m | Fatal win at 71.0583 s | Fatal win at 70.825 s |
| Counter-puncher / open / 4.34 m | Fatal win at 71.35 s | Cap win, 0.7202 / 0.5832 |
| Options / court / 4.70 m | Fatal win at 103.4583 s | Fatal win at 26.5167 s |
| Options / open / 6.77 m | Cap win, 0.8849 / 0.7908 | Cap win, 0.8921 / 0.7649 |

Cap rows give Vanguard's bar before its opponent's. Counter-puncher contributes three injury
wins and one health lead at the cap; Options contributes two of each. All five fatal blows
match the committed action's same-time hand/target observation. These are physical punch wins,
without changing the body's strength, granting an assist or reading the opponent's injury state
inside the controller. The screens take 71.2 and 92.9 active pool wall seconds, respectively,
with forecasts below their nine-minute caps. There are no invalid or unfinished cases.

Complete configurations, gap selection, exclusion lists, native case keys and records, full
blows and action ledgers, final live actions, pose digests and uncertainty are retained under
`research/runs/vanguard/warrior-room-fresh/`, in separate `counter/` and `options/` records.
The earlier development cases are not added to these fresh results.

The wider Warrior field uses the same frozen source and ordinary bout rules, with the Reptile
opponent on its own body. It stops on the Reptile open-right cap loss at 4.48 m: Vanguard's bar
is 0.8162 against 0.9859, without falls. No action launches in that bout. The other twenty
completed wider-field cases win, but seven cases remain unfinished. The Reptile's 3/4 fails the
declared per-opponent screen; other incomplete screens are not qualified by their wins so far.

| Remaining opponent | Wins / completed / planned | Injury / cap wins | Vanguard bouts with a fall | Completed-only 95% Wilson |
| --- | --- | --- | --- | --- |
| Crawl and bite, Reptile body | 3 / 4 / 4 | 2 / 1 | 1 / 4 | 0.301–0.954 |
| Duellist | 3 / 3 / 4 | 0 / 3 | 0 / 3 | 0.439–1.000 |
| Tempo | 3 / 3 / 4 | 3 / 0 | 0 / 3 | 0.439–1.000 |
| Scrapper | 3 / 3 / 4 | 3 / 0 | 0 / 3 | 0.439–1.000 |
| Behaviours | 3 / 3 / 4 | 2 / 1 | 0 / 3 | 0.439–1.000 |
| Puncher | 3 / 3 / 4 | 2 / 1 | 1 / 3 | 0.439–1.000 |
| Classic | 2 / 2 / 4 | 0 / 2 | 0 / 2 | 0.342–1.000 |

Humanoid opponents use matched Warriors. Joint feedback (`direct`) has no legal fight entrant:
`FIGHT_ENTRY` refuses it with “it strikes with nothing the body has”; it has no scheduled bout.
The unchanged screen requires all four wins against each legal opponent, with no aggregate
substitute and no fall-ending shortcut. Of the seven unfinished cases, two are interrupted
confirmations and five are unplayed. There are no invalid cases.
The stopped subsets and their intervals do not estimate the unfinished cases.

The whole-grid forecast price-cuts at 7.2 active wall seconds with one completed Reptile win.
Execution stages the remaining court-left pilots before their mirrored confirmations; frozen
cases, source, criterion and cumulative nine-minute cap stay fixed. The completed-pilot rates
price the confirmation pool at 475.6 s cumulative. The deciding loss stops it at 306.0 s total,
including the original price-cut execution. Complete headers, recipes, native rows, per-opponent
summaries, exclusion reason, phase logs and unfinished coverage are in
`research/runs/vanguard/warrior-field-fresh/`. These results belong to source `ba63a215` and are
not qualification evidence for the revised low-entry controller.

## Replanting low support

The Warrior's selected `replantLow` option releases a ready planted fold when its planner still
needs an attack entry for `REPOSITION_WAIT`, six seconds, with no live action. It requests the
ordinary standing height, waits for the fold's rise to finish, then lets the planner position
before folding again. It reads the planner's operational approach window and support report;
orders and owned strokes keep priority. Rogue and Skeleton leave the option off. Its decision
is visible as “rising to reposition low attack”.

The limiting Reptile bout reaches ready low support while the low punch still needs another
entry. Support keeps navigation unavailable; the body remains planted through the cap and
never launches an attack. Rising after only 0.3 s of that condition wins the failed right-open
case but loses the left-open winner and introduces a Warrior fall. The six-second setting
clears all four retained Reptile cases by injury, with no Warrior falls. It is selected as a
development gain, not fresh qualification. Body numbers, muscle limits, collision geometry and
Balance remain unchanged.

| Reptile case | Previous preset | Rapid 0.3 s rise | Selected six-second rise |
| --- | --- | --- | --- |
| Open / 4.48 m / left | Fatal win at 28.1833 s | Cap loss | Exact previous bout |
| Open / 4.48 m / right | Cap loss; no attacks | Cap win; one Warrior fall | Fatal win at 86.35 s; seven completed punches |
| Court / 5.43 m / left | Fatal win at 19.3833 s | Fatal win at 54.6667 s | Exact previous bout |
| Court / 5.43 m / right | Cap win; one Warrior fall | Interrupted after rejection | Fatal win at 41.5583 s; no Warrior fall |

Harness and ordinary bout rules are those of the fresh Warrior field above: Node Arena Duel,
vendored `rapier-coordinate`, 120 Hz, Warrior against the Reptile's own body, empty hands,
default attributes, Balance 0/0 and zero sense delay. Both earlier left-side winners preserve
their complete pose digests. The new right-open ending bars are 0.8613 / 0.7972. The right-court
Reptile falls once; all Warrior trials in the selected four-case panel remain upright. Its
native saved-record comparison reads two complete, fault-free mirrored units against the
previous preset, with no changed shared context: four wins rather than three. The rapid-rise
comparison has only one complete mirrored unit; the remaining side stays unfinished.

The rapid trial takes 63.6 active pool wall seconds and stops after two wins and one loss, with
one interrupted case. The selected trial takes 32.4 s and completes all four cases; both are
priced below their nine-minute caps. Sources `8ea50032` and `fe1c139b`, complete configs, native
rows, action ledgers, comparisons, decisions and harnesses are retained under
`research/runs/vanguard/warrior-low-replant/` and `warrior-low-replant-delayed/`. The selected
configuration's fresh Reptile confirmation is below; the preceding source's humanoid field is not
pooled with this development panel. Its descriptive 4/4 Wilson interval is 0.5101–1.000.

Typecheck, all 117 tests, production build, four-file entrant scope and the line-ending gate
pass. The added fast regression holds the planted-entry exit, rise completion, state fork,
orders and live action ownership; all 21 existing Vanguard tests remain intact. The production
Arena briefly shows the rise and a subsequent committed low punch, with advancing frames and
no console errors. The existing large-chunk build warning remains; its temporary preview is
stopped by PID.

## Fresh body screens

The frozen selected source `fe1c139b`, at commit `51387ee9`, wins four fresh Reptile bouts on the
Warrior and four fresh Options bouts on matched Rogues. Each screen has three injury wins and
one health lead at the ordinary 120 s cap. Vanguard never falls in either screen; Options never
falls, while the Reptile falls in three bouts. All six fatal blows match the committed punch's
same-time hand and target observation.

| Body / opponent / level / gap | Left assignment | Right assignment |
| --- | --- | --- |
| Warrior / Reptile / court / 7.89 m | Fatal win at 27.3833 s | Fatal win at 19.8417 s |
| Warrior / Reptile / open / 2.24 m | Fatal win at 22.1417 s | Cap win, 0.9995 / 0.9140 |
| Rogue / Options / court / 6.24 m | Fatal win at 94.9583 s | Fatal win at 91.8167 s |
| Rogue / Options / open / 3.12 m | Cap win, 0.8087 / 0.5674 | Fatal win at 57.8 s |

Cap rows give Vanguard's bar first. Harness: Node Arena Duel, vendored `rapier-coordinate`,
120 Hz, empty hands, default attributes, Balance 0/0 and zero sense delay, falls continuing.
The Reptile uses its own body. Configurations freeze before a hash selects gaps, excluding
previous recorded geometry for the named humanoid body. Both protocols require four wins;
the first non-win stops the screen. Neither has invalid or unfinished cases. They take 33.5
and 88.2 active pool wall seconds, below their nine-minute caps.

Each descriptive 4/4 Wilson interval is 0.5101–1.000. These small body/opponent screens do not
establish a true win rate above 80% or qualify the full field and equipment. Complete recipes,
selection exclusions, native rows, ledgers, blows, source identities, harnesses and summaries
remain in `research/runs/vanguard/warrior-replant-fresh/` and `rogue-options-fresh/`. Earlier
development cases and results from other sources are not added to these results.

## Rogue route room

The Rogue uses 0.15 m of additional route room. That setting wins all twelve retained
Counter-puncher and Options cases without falls, including the right-court loss of its 0.1 m
setting, and clears the two [fresh opponent screens](#fresh-rogue-field). The Warrior keeps
0.1 m and the Skeleton keeps stock navigation.

The 0.1 m setting converts a retained
left-court Counter-puncher loss at 6.04 m into an injury win, clearing four Counter-puncher cases
while preserving all four Options wins. No bout in either before/after panel has a fall.
One Options court win changes from an injury ending to a health lead at the cap; the other
seven candidate wins comprise six injury wins and the unchanged open-left cap win.

The selected reference fails its fresh Counter-puncher screen after one injury win and one
injury loss, with both right-side cases interrupted. The original stopped screen stays intact.
Its court-left bout commits only three punches: all five snapshots from 10 through 50 s remain
in wall clearance and weight shift, with stride count 15 and about 0.02 m of centre travel.
The buffered challenger commits 41 punches there and wins at 68.6583 s. Its ending bars are
0.9185 / 0.6122, against the reference loss's 0.5949 / 0.9076, Vanguard first.

| Opponent / level / gap | Side | Selected reference | Additional route room |
| --- | --- | --- | --- |
| Counter-puncher / court / 6.04 m | Left | Fatal loss at 58.6333 s | Fatal win at 68.6583 s |
| Counter-puncher / court / 6.04 m | Right | Fatal win at 92.775 s | Fatal win at 98.2 s |
| Counter-puncher / open / 2.83 m | Left / right | Fatal wins at 42.2 / 99.5667 s | Exact reference bouts |
| Options / court / 6.24 m | Left | Fatal win at 94.9583 s | Fatal win at 39.85 s |
| Options / court / 6.24 m | Right | Fatal win at 91.8167 s | Cap win, 0.8898 / 0.6715 |
| Options / open / 3.12 m | Left | Cap win, 0.8087 / 0.5674 | Exact reference bout |
| Options / open / 3.12 m | Right | Fatal win at 57.8 s | Exact reference bout |

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Rogues, empty hands,
default attributes, Balance 0/0 and zero sense delay, with falls continuing to injury or the
ordinary 120 s cap. Both configurations run at source `fe1c139b`. Only the candidate's navigator
changes. It uses the shared extra-room part with `room: 0.1`; physical geometry, muscles, assists,
guard, actions and planner settings remain fixed. These are development geometries.

Six complete reference rows are reused exactly. The candidate's eight wins earn the two missing
reference Counter-puncher sides; the new readings take 163.4 active pool wall seconds, below
the nine-minute cap. The preceding stopped fresh screen takes 43.7 s. There are no invalid or
unfinished comparison cases. `npm run compare` reads two complete fault-free mirrored units
per opponent, with no changed shared context: Counter-puncher improves from 3/4 to 4/4; Options
stays 4/4. All four open-stage full pose digests remain exact. Every candidate injury win matches
its committed punch's same-time hand and target observation. Each descriptive 4/4 Wilson
interval is 0.5101–1.000 and does not establish the full target.

The 0.1 m production preset at `54cb5fa2`, source `2e67516f`, exactly matches that challenger config.
The Warrior and Skeleton configs are unchanged; the Skeleton explicitly keeps stock navigation.
The whole Rogue mind round-trips through its edited link. Typecheck, all 117 tests, production
build, the one-file entrant scope and the line-ending gate pass. The production Arena briefly
shows a committed punch beside the pillar, with advancing frames and no console errors or
warnings. The existing large-chunk build warning remains; the temporary preview is stopped
by PID. Complete configurations, native rows, full ledgers and blows, comparisons, source
identities, selection probe, browser observation and harnesses remain in
`research/runs/vanguard/rogue-counter-fresh/` and `rogue-route-room/`.

### Fifteen centimetres

The 0.1 m preset fails its fresh Counter-puncher body screen with three injury wins and one
right-court cap loss at 6.82 m, bars 0.8380 / 0.8618. None falls. The failed bout commits only
21 punches; snapshots from 20 through 80 s remain in wall clearance at stride count 17. Its
other fresh starts are the mirrored open stage at 4.89 m. All three fatal wins match committed
punch observations. The screen takes 75.1 active pool wall seconds. Its four preselected Options
cases are unplayed when the deciding loss stops execution. Frozen configs, exclusions, rows,
unfinished coverage and the harness remain in `research/runs/vanguard/rogue-room-fresh/`.

The 0.15 m trial changes only the Rogue's `navigation.room`. It wins that right-court case at
the cap, 0.8183 / 0.5952, with 94 committed punches, and preserves the other eleven recorded
wins. The resulting twelve cases comprise nine injury wins and three health leads at the cap.
All candidate and reference bouts have no falls; all six open-stage pose digests remain exact.

| Court / opponent / gap | Side | 0.1 m room | Selected 0.15 m room |
| --- | --- | --- | --- |
| Counter-puncher / 6.82 m | Left | Fatal win at 56.975 s | Fatal win at 82.75 s |
| Counter-puncher / 6.82 m | Right | Cap loss | Cap win, 0.8183 / 0.5952 |
| Counter-puncher / 6.04 m | Left | Fatal win at 68.6583 s | Cap win, 0.9041 / 0.6070 |
| Counter-puncher / 6.04 m | Right | Fatal win at 98.2 s | Fatal win at 100.15 s |
| Options / 6.24 m | Left | Fatal win at 39.85 s | Fatal win at 56.15 s |
| Options / 6.24 m | Right | Cap win | Fatal win at 40.5083 s |

The six open-side results above stay exact. Native saved comparisons read two complete,
fault-free mirrored units in each of the three groups, with no changed shared context. The
6.82 m Counter-puncher group improves from 3/4 to 4/4; both preservation groups remain 4/4.
Each candidate injury win matches its committed punch's same-time hand and target observation.
All twelve reference rows are reused; the new candidate cases take 189.1 active pool wall
seconds, below the nine-minute cap. There are no invalid or unfinished comparison cases.
These known cases do not establish a held-out win rate or qualify the other bodies and equipment.

Harness and rules are the matched-Rogue Node Arena Duel above. The prototype runs at source
`2e67516f`; the selected preset at `be2499e2`, source `2d449164`, exactly matches its config.
Both other Vanguard presets remain exact, and the edited mind link round-trips. Typecheck,
all 117 tests, build, one-file entrant scope and line endings pass. The brief production browser
look shows approach and repeated punches beside the pillar with advancing frames and no console
errors; its preview is stopped by PID. Full configs, rows, ledgers and blows, native comparisons,
source and selection identities, browser record and harness remain in
`research/runs/vanguard/rogue-room-15cm/`. Candidate header commit metadata names the actual
`54cb5fa2` source; correcting the inherited older commit labels changes no raw physics or recipe.

## Fresh Rogue field

The frozen 0.15 m Rogue at source `2d449164`, commit `a1f2e9d1`, wins all four fresh cases
against Counter-puncher and all four against Options. Counter-puncher ends four times by injury;
Options contributes three injury wins and one health lead at the cap. The Options left-court
cap win includes two Rogue falls, at 60 and 90.975 s, and nine opponent fall episodes. The other
seven bouts have no falls. All seven fatal blows match committed punch observations.

| Opponent / level / gap | Left assignment | Right assignment |
| --- | --- | --- |
| Counter-puncher / court / 4.76 m | Fatal win at 57 s | Fatal win at 71.35 s |
| Counter-puncher / open / 6.96 m | Fatal win at 72.8333 s | Fatal win at 51.275 s |
| Options / court / 6.69 m | Cap win, 0.8911 / 0.7217 | Fatal win at 43.8167 s |
| Options / open / 3.27 m | Fatal win at 117.8083 s | Fatal win at 23.85 s |

Cap rows give Vanguard's bar first. Harness: Node Arena Duel, vendored `rapier-coordinate`,
120 Hz, matched Rogues, empty hands, default attributes, Balance 0/0 and zero sense delay,
falls continuing to injury or 120 s. Configs freeze before hash-selected gaps exclude prior
Rogue geometry. Each opponent's four-case screen stops at its first non-win. The screens take
48.4 and 75.5 active pool wall seconds, with no invalid or unfinished cases. Each descriptive
4/4 Wilson interval is 0.5101–1.000; these small screens do not establish the full target.
Complete recipes, exclusions, rows, ledgers, blows, source identities and harnesses remain in
`research/runs/vanguard/rogue-15cm-fresh/`.

The remaining seven-opponent field stops on the left-court Behaviours loss at 6.57 m, by fatal
injury at 28.025 s. Behaviours falls at 18.2083 s; the Rogue falls at 24.2583, 25.275 and
26.6333 s. The other two complete cases win: Crawl and bite at left court 4.44 m at the cap,
with one Rogue fall, and Scrapper at left court 5.02 m by injury at 39.4667 s, without falls.
Twenty-five cases remain unfinished: two interrupted and twenty-three unplayed. There is no
invalid case. No incomplete opponent screen is qualified by these wins so far.

The full-cap projection cuts at 38.7 active wall seconds when its forecast exceeds 600 s,
with one completed Reptile win. The six remaining court-left pilots retain the frozen source,
cases and criterion, carrying that time into the same nine-minute active limit. Their deciding
loss stops the pool at 70.4 cumulative wall seconds, before confirmation pricing or play.
The Reptile uses its own body; humanoids use matched Rogues. Joint feedback (`direct`) is refused
by `FIGHT_ENTRY`: “it strikes with nothing the body has”. It is explicitly excluded, not silently
dropped. Full source and recipes, raw rows, both execution phases, exclusion, incomplete coverage
and harnesses remain in `research/runs/vanguard/rogue-field-fresh/`. These records belong to the
route-room setting without the selected standing wait.

## Standing wait after a fall

The Rogue's selected `waitFallen` layer holds a standing guard while its sensed low target is
down. It finishes owned strokes without admitting another, preserves explicit movement orders,
and completes an existing rise before resuming approach. It reads the granted physical fall
state, not the opponent's injury or controller. The Warrior and Skeleton leave the option off.

An unchanged reader of the Behaviours loss preserves the complete blow prefix through the first
Rogue fall at 24.2583 s, digest `37bde5a22b8cc0cb`. Support stays at `stand`: the fold never starts.
At 18.05 s the head remains 1.0838 m away while the body centre is 0.6009 m away. Navigation
reports arrival at the centre-based range while low admission still waits for head range.
Foot-to-foot contacts begin at 19.2167 s and recur before the fall. The reader stops at that
fall in 6.9 wall seconds. Its recipe, samples, contacts and source remain in
`research/runs/vanguard/rogue-low-entry-reading/`.

The selected wait reaches the same opponent collapse and preserves every preceding blow,
then converts the deciding loss into a cap win without a Rogue fall. All nine played development
cases win: four against Behaviours, four against the Reptile and the Options court-left collapse
case. They comprise four injury wins and five health leads at the cap. No Behaviours bout or
the Options bout has a Rogue fall; three Reptile bouts still do. The retained Reptile left-court
win preserves its full pose digest, `9bbdba252562093a`.

| Opponent / level / gap | Left assignment | Right assignment |
| --- | --- | --- |
| Behaviours / court / 6.57 m | Cap win, 0.9400 / 0.9230 | Cap win, 0.9565 / 0.7394 |
| Behaviours / open / 4.35 m | Cap win, 0.8277 / 0.8255 | Fatal win at 99.1833 s |
| Reptile / court / 4.44 m | Exact retained cap win; one Rogue fall | Fatal win at 64.55 s |
| Reptile / open / 3.23 m | Cap win, 0.9442 / 0.9224; one Rogue fall | Fatal win at 118.4167 s; one Rogue fall |
| Options / court / 6.69 m | Fatal win at 109.4667 s; no Rogue fall | Unchanged reference without an opponent fall |

The Options reference wins at the cap with two Rogue falls. Three candidate injury endings
match committed punches. The Options ending is a right-hand impact on the upper trunk while
the live action reports release; it is not credited as a committed fatal stroke. Its earlier
68 joined committed impacts deliver 1.4153 HP of accepted injury. The close Behaviours open-left
cap win remains a narrow development result, not a robust-rate claim.

Eight retained wins have no opponent fall: four Counter-puncher, three Options and one Scrapper.
The new branch cannot activate there. A contract through the configured planner holds every
intent field and the complete saved state equal with the option on or off over 240 varied
decisions without an opponent fall. These references are preserved by that conditional equality;
they are not replayed or counted as newly played cases. The nine candidate cases take 129.2
active pool wall seconds, below their nine-minute cap, with no invalid or unfinished cases.
The before records are incomplete mirrored panels; native saved comparisons report zero complete
paired units. The deciding case, the exact Reptile case and the Options collapse case are
single-side before/after readings. This selection is development evidence; the fresh screen below
does not qualify the full field.

Harness and ordinary bout rules are those of the fresh Rogue field above. Prototype source is
`f38a1f78`; the selected config at `c82542a7`, source `c1130f3d`, matches it exactly. Both other
Vanguard preset configs remain exact, and the whole Rogue mind round-trips through its link.
Typecheck, all 118 tests, build, four-file entrant scope and line endings pass. The added
configuration-path regression takes 3.9 ms and holds the standing wait, owned-action identity,
orders, rise completion, state fork and neutral path. A production browser look shows the Rogue
standing beside its fallen target at 20 s, with advancing frames and no console errors; its
preview is stopped by PID. Complete configurations, implementation snapshots, rows, observations,
comparisons, selection probe, browser record and harnesses remain in
`research/runs/vanguard/rogue-wait-fallen/`. The full field, other bodies, equipment and broader
miss recovery remain unqualified.

### Fresh standing-wait screen

The frozen standing-wait Rogue wins all four fresh Behaviours cases, with no Rogue falls:
two injury wins and two health leads at the cap. Both injury endings match committed right-hand
punches on the upper trunk. The next opponent's court-left Reptile pilot loses at the cap,
also without a Rogue fall. The stop rule leaves three Reptile cases and all four Options cases
unplayed; there are no invalid or interrupted cases.

| Opponent / level / gap | Left assignment | Right assignment |
| --- | --- | --- |
| Behaviours / court / 5.60 m | Cap win, 0.9808 / 0.9499 | Fatal win at 55.7833 s |
| Behaviours / open / 4.72 m | Cap win, 0.9629 / 0.7479 | Fatal win at 106.5250 s |
| Reptile / court / 4.31 m | Cap loss, 0.8128 / 0.9329 | Unplayed |
| Reptile / open / 2.70 m | Unplayed | Unplayed |
| Options / court / 5.47 m | Unplayed | Unplayed |
| Options / open / 6.91 m | Unplayed | Unplayed |

Cap rows give Vanguard's bar first. The standing wait activates in both left-side Behaviours
cases and the Reptile loss. That loss completes fifteen low punches, but repeated samples show
ready low support, an unmet attack-entry window and unavailable navigation. The Rogue's feet
remain at 23 strides from 10 s through the cap. Avoiding a fall does not make this low attack
effective.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, empty hands, default attributes,
Balance 0/0 and zero sense delay, falls continuing to injury or 120 s. Behaviours uses the matched
Rogue; the Reptile uses its own body. Source `c1130f3d`, at commit `7f0ebd6d`, freezes all fighter
configurations before hashing fresh gaps, excluding recorded Rogue geometry. Four wins earn
the next opponent; a first non-win stops the pool. Its five completed bouts take 85.8 active
pool wall seconds, below the nine-minute cap. The Behaviours 4/4 descriptive Wilson 95% interval
is 0.5101–1.000; this screen does not establish a true win rate above 80%, and the stopped Reptile
pilot does not estimate its unplayed cases. Full configurations, exclusions, recipes, native
rows, ledgers, blows, snapshots and harnesses remain in `research/runs/vanguard/rogue-wait-fresh/`.
Other opponents, bodies, equipment and broader miss recovery remain open.

### Rogue replant trial

Enabling the existing six-second `replantLow` option on the standing-wait Rogue does not
preserve its Reptile winners. It converts the 4.31 m court-left loss into an injury win at
74.6917 s without a Rogue fall, and both retained 4.44 m court sides win by injury without
Rogue falls. The retained 3.23 m open-right injury win becomes a cap loss, bars 0.9386 against
0.9505, with a Rogue fall at 77.7667 s. That loss rejects the configuration. Open-left is
interrupted; all four Behaviours cases and the Options collapse case remain unplayed.

The deciding pilot actually rises to reposition at 41.4917 s. The four completed bouts contain
three injury wins and one cap loss, with no invalid cases. Native saved-record comparison has
one complete mirrored unit, the retained court pair; the converted pilot and open regression
are single-side readings. The pool takes 77.5 active wall seconds, below its nine-minute cap.
Harness, bodies, physical rules and source `c1130f3d` are the fresh wait screen's, with only
the candidate config flag changed. Full configurations, rows, comparisons and harnesses remain
in `research/runs/vanguard/rogue-low-replant/`. The selected Rogue leaves `replantLow` off.

## Skeleton route and blocked steps

Selecting the Warrior's navigator with its additional 0.1 m route room does not repair the
Skeleton's retained left-court Options loss at 6.93 m. Both versions lose at the ordinary
120 s cap without falls: the selected preset ends at 0.4854 / 0.5527, the challenger at
0.5531 / 0.7206, Vanguard first. The selected preset exactly repeats pose digest
`56ce391ad7eabd4e`. The deciding loss rejects the challenger; six mirrored or preservation
cases remain unplayed. No production setting changes. The two-worker pilot takes 32.5 active
wall seconds, without invalid cases. Full configs, native rows and the decision remain in
`research/runs/vanguard/skeleton-room/`; there is no complete mirrored comparison unit.

An unchanged replay of that selected loss finds that the first two one-second blocked-stroke
steps move the centre laterally by only 0.0148 and 0.0113 m. They begin at 12.1 and 27.975 s;
both finish before a 0.05 m lateral displacement. The first stays in weight shift and the second
ends during a foot swing. The reader stops at 28.975 s after these two steps, in 7.2 wall seconds,
with prefix digest `559fa4b8ae1f3d1e`. It establishes the timer's short physical travel, not the
effect of a longer step on winning. The recipe, per-step samples, criterion and reader remain
in `research/runs/vanguard/blocked-step-reading/`.

Both readings use the Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons,
empty hands, default attributes, Balance 0/0 and zero sense delay. Source is `fe1c139b`.

A displacement-governed alternative keeps the original sensed ground direction until the centre
travels 0.15 m sideways or four seconds pass. It still loses the deciding left-court bout,
by fatal injury at 115.0667 s, bars 0.4720 / 0.6062, without falls. It commits 58 punches against
the selected reference's 89. The fatal impact lands on its right forearm from the opponent's
left hand. The win gate rejects it before its three other candidate cases or the remaining
baseline comparison play; the selected one-second rule is restored exactly. Greater requested
lateral travel does not establish a better exchange.

The candidate's typecheck passes. Source `cb033aaf`, the changed module, source diff, exact
configuration, full row, action ledger, native records, decision and reader remain in
`research/runs/vanguard/skeleton-displacement/`. Its one-worker pilot takes 29.2 active wall
seconds, with a pool forecast below the nine-minute cap. There is no invalid case or complete
mirrored comparison unit; `npm run compare` reports zero paired units.

### Rogue kit on the Skeleton

The complete selected Rogue kit, unchanged on the Skeleton body, loses the limiting Options
court-left case at 6.93 m by fatal injury at 88.0583 s, without falls. Own and opponent bars
are 0.4773 and 0.8538; the fighter completes 55 committed punches. The loss rejects this kit
transfer and leaves the other three preservation cases unplayed. Native saved-record comparison
has no complete mirrored unit. This does not change the selected Skeleton calibration.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons, empty hands,
default attributes, Balance 0/0 and zero sense delay, falls continuing to injury or 120 s.
Source `c1130f3d`, at commit `862243b9`, freezes the whole candidate and its four development
cases before the pilot. The one-worker pilot takes 24.4 active wall seconds, below its
nine-minute cap. Its config, physical row, comparison and harness remain in
`research/runs/vanguard/skeleton-rogue-kit/`.

## Guard-forearm choices

Adding direct forearm targets to the selected Skeleton's repertoire does not repair its left-court
Options loss at 6.93 m. It loses at the ordinary 120 s cap, bars 0.6004 / 0.6476, without falling.
Options falls once at 108.5 s. The candidate commits 30 body punches, 18 at the left forearm and
22 at the right. The deciding loss rejects the configuration; its other three candidate cases
remain unplayed. The extra actions are not installed in the preset.

Only two actions are added, both using the unchanged straight-punch executor and surface aim.
The contact learner may choose either named forearm or the existing body target. Anatomy,
strength, physics, assists, navigation, guard and planner settings remain fixed. Source is
`fe1c139b`, at commit `da3c2ae2`. Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz,
matched Skeletons, empty hands, default attributes, Balance 0/0 and zero sense delay, falls
continuing. The one-worker pilot takes 30.0 active wall seconds, priced below the nine-minute cap.
There is no invalid case or complete mirrored comparison unit. The selected reference row is
reused; `npm run compare` reports zero paired units. Whole configurations, exact recipes, native
rows, full action ledger and blows, harness and decision remain in
`research/runs/vanguard/forearm-choices/`. This is rejected development evidence, not qualification.

## Absorbed contact scores

Estimating absorbed injury turns the fresh left-court Skeleton loss at 6.93 m into a win,
but the mirrored case adds a fall and rejects the candidate. Braking its low-target turn and
removing anticipatory low guard each win that mirrored bout at the cap, but both still fall.
All three development screens fail their declared physical gate; none changes the selected preset.

The saved-row audit joins impact rows to committed hand observations at exactly the same time,
with the same striking hand and struck segment. It excludes unmatched and noncommit contacts;
accepted injury is harness-only validation, never a policy input. Four of five audited cases
rank the same hand by learned contact score and observed injury per attempted second. On the
left court at 6.93 m the contact rates favor the right hand, 4.765 against 3.551, while observed
injury rates favor the left, 0.01471 against 0.01308 HP/s. Exact inputs, join counts and source
remain in `research/runs/vanguard/score-audit/`.

The prototype scores onset impulse times preceding normal closing speed over two, shares that
energy by the natural surfaces' compliance, subtracts bare-hand protection and normalizes the
nominal blunt price by the target body's fixed pool capacity. Its preceding observed motion,
completed-sample identity and action credit live in its plain decision state. It reads no live
health, opponent policy or engine handle. A detached probe verifies material sharing, protection,
preceding motion, sample deduplication and complete decision-state replay. Typecheck and the
entrant scope check pass.

| Controller / case | Result | Own / opponent bar | First candidate fall |
| --- | --- | --- | --- |
| Absorbed score / court 6.93 m, left | Time-limit win | 0.6289 / 0.5624 | None |
| Absorbed score / court 6.93 m, right | Time-limit loss | 0.9115 / 0.9116 | 28.6333 s |
| Low-turn braking / court 6.93 m, right | Time-limit win | 0.8186 / 0.8060 | 28.5083 s |
| Without anticipatory low guard / court 6.93 m, right | Time-limit win | 0.9076 / 0.8640 | 30.6750 s |

All bouts continue to the ordinary 120 s cap. The absorbed-score widening interrupts its other
three cases after the fall; neither ablation starts its four remaining cases. Unfinished cases
are not results. The first cohort takes 191.6 active pool wall seconds, braking 66.2 and removal
75.8, each below its nine-minute cutoff. No injury win is recorded.

The 28.6333 s replay exactly preserves the saved physical blow prefix and has pose digest
`e75d3a875cd15f0c`. No flank step is commanded before the fall. Low guard asks a backward turn,
support remains in its standing stage, and the observed body keeps accelerating during contact
before recovery takes over. This is contact-laden motion, not a driven-speed qualification.
The ablations do not establish that low guard alone causes the fall. Stability around a
collapsing opponent remains unresolved.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0 and zero sense delay. Exact source, configurations,
probes, full rows, replay and saved-row comparisons remain in `research/runs/vanguard/absorbed-score/`,
`absorbed-turn-brake/` and `absorbed-without-low/`. The first comparison has one complete mirrored
unit, a descriptive change from zero to one win in two; the single-side ablations have none.
The rejected implementations are removed.

## Collapse clearance

Physical torso cover prevents the measured right-court collapse fall and preserves the opposite
court win, but the combined candidate loses a selected court winner. It is not selected. Recent
contact weighting does not recover that winner. These screens use selected reference
`sha256:a4f7664de866ef7ce15fff93549fab86be54a3ed322d41034c57652d6bc4e3d6`.

The warning observes a naturally upright opponent's head descending faster than 0.2 m/s below
its nominal standing chest height, over the body's local support. On the absorbed-score right
court at 6.93 m, it precedes the 28.6333 s fall by 1.7 s. The passive replay preserves the exact
physical blow prefix and digest `e75d3a875cd15f0c`; this is a diagnostic, not another bout.

Clearance withdraws preparation through native return and preserves committed and returning
action identities. It holds its heading and standing height, checks the configured navigator
before the opponent-foot sweep, and requests at most 0.5 m/s while retaining stricter upstream
and ordered pace. Settled release requires two grounded quiet feet and a quiet or upright
opponent. Separating it from low guard avoids inheriting the latter's 0.2 m/s turning cap.
The velocity-shaped variant chooses a straight escape by closest predicted approach over two
seconds. Torso cover uses the existing guard to put free hands between the sensed falling torso
and the body's chest; the action compositor retains each live stroke's ownership. No strength,
assistance, physics or wound rule changes.

| Right court, 6.93 m / controller | Ending | Own / opponent bar | First candidate fall |
| --- | --- | --- | --- |
| Two-second clearance | Time-limit win | 0.8766 / 0.8764 | 29.0333 s |
| Clearance until settled | Time-limit win | 0.8766 / 0.8764 | 29.0333 s |
| Clearance exclusive of low-target turning | Time-limit loss | 0.8718 / 0.8733 | 29.5500 s |
| Velocity-shaped escape | Time-limit loss | 0.8729 / 0.8740 | 29.6583 s |
| Escape with physical torso cover | Time-limit win | 0.8877 / 0.8707 | None |

Replacing the deadline leaves the first fall unchanged. Its exact saved-prefix replay has digest
`494d367b8972df41`. Separation begins at 27.2333 s; the opponent closes from about 0.8 m to
0.4 m while low-target turning limits the requested walk to 0.2 m/s. Removing that competing
mode delays the fall without preventing it. Neither walking-only change passes its physical gate.

The cover screen completes three cases: both court sides at 6.93 m win without falls, while the
selected left court winner at 5.92 m loses, 0.6478 against 0.6643, also without falls. That loss
rejects the declared preservation gate. Both open cases are interrupted, not results. All wins
are health leads at the ordinary 120 s cap; none is an injury win. The saved-row comparison has
one complete mirrored unit, descriptively improving from zero to two wins, and an unmatched
single-side regression. It is development evidence, not qualification.

In the losing 5.92 m case, exact same-time, hand and struck-segment joins attribute 52 impacts to
committed strokes and exclude 287 unmatched hand impacts. The right hand deals more accepted
injury per attempted second in the first 30 s, the left afterward; no joined hand injury reverses
that ranking. Injury is harness-only evidence. Weighting recent completed attempts halves each
choice's preceding estimated work and time while retaining true exploration counts. That pilot
still loses the left court at the cap, 0.6416 against 0.6629 without falls; its other four cases
are unplayed. The recency candidate is rejected.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0 and zero sense delay. The timed, settled, exclusive,
velocity-shaped, cover and recency cohorts take respectively 70.1, 69.5, 66.7, 77.9, 234.5 and
134.4 active pool wall seconds, each below its nine-minute cutoff. Recipes, exact sources,
contract probes, physical rows and saved-row comparisons remain in
`research/runs/vanguard/collapse-read/`, `collapse-yield/`, `settled-collapse/`,
`exclusive-collapse/`, `trajectory-clearance/`, `collapse-cover/` and `recent-contacts/`.
Typecheck and the detached composition, ownership and complete-state replay probes pass; the
source changes stay within Vanguard. The rejected implementations are removed.

## Torso-cover challenger

Fresh qualification of the absorbed-contact and torso-cover challenger remains undecided.
The three-worker pool is cut on price after one fatal-injury loss; two cases are interrupted
and nine unplayed. This is an incomplete matrix, not a seventh failed qualification gate or
a reason to select the challenger. Its older 5.92 m court preservation failure remains recorded.
The selected presets are unchanged and the prototype source is removed.

The three body configurations freeze before fresh starts are generated. The Warrior and Rogue
retain their selected configurations; the Skeleton enables absorbed contact scoring and physical
torso-cover clearance. Current equipment integration remains present. Source is
`sha256:ed74799e002c8174d13e24cb004c4ce97a6e793f7fc0f733451fb46ef5c3d953`.
Before fresh generation, the right court bout at 6.93 m repeats the archived prototype's full
digest `9f724d9c02e478c0`, verdict, bars and falls exactly. That replay is not an independent win.

Protocol `vanguard-unarmed-heldout-7` schedules twelve mirrored bouts against Options: the
Warrior, Rogue and Skeleton on both levels. Ten wins and complete valid mirrored coverage are
required; three nonwins reject. Starts use the protocol/model/level hash rule, excluding 52 prior
geometries without consulting outcomes. All twelve recipes build valid worlds without stepping.

| Completed case | Ending | Own / opponent bar | Candidate falls |
| --- | --- | --- | ---: |
| Skeleton / left court / 5.62 m | Fatal-injury loss, 96.8333 s | 0.4552 / 0.7287 | 0 |

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched bodies, empty hands,
default attributes, Balance 0/0 and zero sense delay, falls continuing to injury or 120 s.
After the first nonwin, the remaining pool projects about fourteen minutes. The declared price
cut stops it at 116.1 active wall seconds, below its nine-minute hard limit. There are no invalid
cases. Eleven unfinished cases are not losses, and the completed subset estimates no field rate.

Typecheck, the full 116-test gate, five-file entrant scope and the composed clearance/low-guard
probe pass. The selected runtime is restored exactly. Frozen fighters, fresh starts, full source,
the identity replay, checks, one complete physical row and all unfinished statuses remain with
[the campaign](../../research/runs/vanguard/challenger-7/campaign-options.json).

## Net contact selection

Whole-body contact value does not restore the selected left-court winner at 5.92 m. Applying it
to the attack/evasion policy, or conditioning hand choice on the preceding completed stroke,
also loses that case. All three candidates fail their pilot; their other four cases are unplayed.
None changes the selected unarmed calibration.

The retained and absorbed-score bouts share 31 completed action records and 179 impact records.
At 41.3417 s the retained selector chooses the right hand, the absorbed-score selector the left.
Across the shared prefix, accepted injury dealt per attempted second favors the left, but injury
dealt less full-body injury received favors the right. Accepted injury is harness-only evidence.

The estimator uses the body's own detached contacts, their permitted identities and preceding
observed rigid-point motion. Natural surface compliance, nominal blunt prices and bare-hand
protection price both sides; no live wound pool or opponent policy is read. The unchanged
41.35 s prefix preserves every saved impact and has digest `f52ec73ce41a404a`. All 143 sampled
contacts resolve through permitted identities. Estimated net value favors the right hand too;
that agreement does not carry through to a winning online policy.

| Left court, 5.92 m / selector | Loss ending | Own / opponent bar | Candidate falls |
| --- | --- | --- | ---: |
| Net value per hand | Fatal injury at 98.2417 s | 0.4834 / 0.5775 | 0 |
| Net value for hands and attack/evasion | Time limit at 120 s | 0.5441 / 0.7206 | 0 |
| Net value by preceding completed hand | Fatal injury at 112.1167 s | 0.4942 / 0.7690 | 0 |

The first fatal impact strikes the upper trunk; wound allocation empties the head. Fixed nominal
capacity does not model depleted anatomical pools and their transfers. The policy variant counts
received impacts even before an own commitment, retains switches between released strokes and
shares one saved sampler with both child policies. The transition variant captures its previous
hand at admission, advances it only after an ended committed stroke, and refreshes the candidate
table immediately. Its recorded conditional hand preferences do not produce a winning controller.

Extending the selected guard's covering point from 0.3 to 0.5 m, with the same 0.15 s response,
also loses its pilot: left open at 7.63 m, 0.6636 against 0.7666 at the ordinary 120 s cap, without
falls. Its other four cases are unplayed. A detached probe verifies the configuration reaches
the actual guard goal without changing its reference posture, timing or hand pose. It is rejected.

Harness: Node Arena Duel, vendored `rapier-coordinate`, 120 Hz, matched Skeletons against Options,
empty hands, default attributes, Balance 0/0 and zero sense delay, falls continuing. The net-hand,
net-policy, transition and forward-cover cohorts take 108.2, 122.3, 118.8 and 119.0 active pool
wall seconds, each below its nine-minute cutoff. Sources, probes, exact physical rows and saved-row
comparisons remain in `research/runs/vanguard/selector-divergence/`, `net-value/`, `net-policy/`,
`transition-value/` and `forward-cover/`. Typechecks, ownership and complete-state replay probes
pass. The rejected source variants and guard configuration are removed.

## Standing miss return

The standing punch regains its physical guard and planted stance after an unloaded miss with
each hand on the Warrior, Rogue and Skeleton. All six strokes commit, complete and return without
falls. `RETURN_LIMITS` in `tests/entrant-vanguard.test.mjs` keeps the criterion fixed: the striking
point is within 0.05 m of the settled guard, world speed at most 0.6 m/s, and both feet carry a
quiet upright base without substitute support for 0.05 s, within 1.2 s after lifecycle completion.
These are the [shared path return limits](combat-strikes.md#trajectory-settings), applied to the
standing punch's actual return rather than its phase label.

The fixture uses each named calibration's complete physical kit, built in its own guard, and
the shared action compositor. A script asks an empty-space point at torso height within the
executor's admission window, retains the request through release, then measures the guard
point and physical support. A stroke that never commits or meets a collider is an invalid
fixture before the recovery assertions. No body pose, velocity, strength or assistance is added.

| Body | Right / left return after completion | Right / left guard error |
| --- | --- | --- |
| Warrior | 0.2583 / 0.2750 s | 0.0320 / 0.0312 m |
| Rogue | 0.2833 / 0.2833 s | 0.0309 / 0.0285 m |
| Skeleton | 0.3250 / 0.2083 s | 0.0432 / 0.0477 m |

Harness: Node core stand, vendored `rapier-coordinate`, 120 Hz, default attributes, empty hands,
Balance 0. Complete recipes, declared limits, records and source remain in
`research/runs/vanguard/miss-return/`. The regression check runs in under ten seconds. Its scope
is stationary empty-space standing punches; it does not qualify low punches, moving-target
misses, equipment or collision-laden combat recovery, and it does not erase the failed bout gates.

## Low target-loss miss

Vanguard checks that its aim is still sensed while the trunk leads the arm. Losing it before
the arm drive enters the stroke's normal guard return, rather than driving at the last point.
All six early-loss low punches, both hands on Warrior, Rogue and Skeleton, regain their physical
guard and planted base without falls. Each holds the return gate for 0.05 s after lifecycle
completion, inside the unchanged 1.2 s deadline. No pose, velocity, strength or assist is added.

| Body | Right / left guard error | Right / left speed |
| --- | --- | --- |
| Warrior | 0.0325 / 0.0071 m | 0.0495 / 0.0069 m/s |
| Rogue | 0.0220 / 0.0198 m | 0.0650 / 0.0475 m/s |
| Skeleton | 0.0093 / 0.0047 m | 0.0147 / 0.0167 m/s |

The selected rule leaves a hand already driving on its ordinary cycle. A stronger fixture keeps
the target until the hand leaves its guard by more than 0.05 m, exceeds 0.6 m/s and passes its
configured arm lead. The Warrior's right hand still fails that clean driven-loss miss:
it remains 0.0651 m from its settled low guard at the 1.2 s return deadline,
against the unchanged 0.05 m limit. Its speed is 0.2944 m/s, below the 0.6 m/s limit, but its
centre of mass lies outside its feet: it does not regain the required planted base. It stays
upright. The first driven-loss failure stops that screen; the other driven-loss hand and bodies
remain unplayed. Its full pose trace, `c30374b1f946ea3b`, physics snapshot and whole saved state
stay exact against the dormant API at `86bedcc4`.

Braking every lost committed aim passes the early cases but worsens the driven-loss guard error
to 0.2943 m, so that broader prototype is rejected. The selected check applies only during the
trunk lead. Complete early and late observations, source snapshots and this rejected prototype
remain under `research/runs/vanguard/` in `arm-aim-check/`, `lost-drive-return/`,
`lost-drive-late-return/` and `lost-drive-late-before/`. They are recovery evidence, not bout wins.

The early-loss fixture waits for ready low support and a guard that stays within 0.05 m over a full 1.2 s
window before admission. A fixed Reptile mannequin provides sensed low-body geometry. Its
initial placement uses the punch's public entry window; it is removed at the first committed
step, making the stroke miss. Every attacker segment is checked for apparatus contact, and
the action ledger has zero external contacts in preparation, drive and release. A no-punch
control over the exact admission-to-deadline window drifts only 0.0085 m and has no apparatus
contacts. The attacker receives ordinary intent and muscle control throughout.

| Candidate / stable-reference fixture | Right-hand result at the deadline | Base |
| --- | --- | --- |
| Reference low punch, source `c1130f3d` | 0.0651 m error, 0.2944 m/s | Outside feet; no fall |
| Low punch without trunk turn | 0.2331 m error, 0.0755 m/s | Planted |
| Dedicated point-following guard | 0.1724 m error, 0.1219 m/s | Planted |
| Body return at the stroke's recovery response | Falls at 7.9417 s, before the deadline | Failed |

The three alternatives are rejected. The point-following guard gives an uncovered empty hand
its ordinary arm response while carrying its guard on the actual trunk; explicit cover retains
priority. The body-response overlay keeps the same fold and uses the configured stroke recovery
time during release. These requests change no anatomy, muscle strength, assists or physics.
Their source snapshots remain beside their rows; these three prototype controllers are removed.

An earlier fixture samples its guard at 3 s while that guard is still settling: a no-punch
control drifts 0.1963 m over its reading window. Its apparent recovery failure and four
return-control prototypes have an invalid guard reference and do not establish a recovery
result. The stable-reference fixture corrects this setup without easing the return limits.

Harness: Node core stand, vendored `rapier-coordinate`, 120 Hz, Warrior, empty hands, default
attributes, Balance 0, a requested 0.5 m low fold. The baseline and no-turn candidate use source
`c1130f3d`; manifests retain their full, distinct configs. The guard and body-response prototypes
use sources `041bc65f` and `235a35e0`. Each stable-reference fixture takes under one wall second.
Limits are the [standing miss return's](#standing-miss-return); setup controls and full readings
remain in `research/runs/vanguard/low-miss-control-settled/`, `low-miss-return-settled/`,
`low-miss-without-turn/`, `low-miss-guard-part/` and `low-miss-body-return/`. The invalid setup
and its control remain in `low-miss-return/` and `low-miss-control/` under the same run root.
These reference rows establish the original failure. The selected aim check at `5f0f22e4`, source
`0c8590c0`, fixes early target loss; driven, moving and loaded miss recovery remain open.

The toolkit API lands separately at `86bedcc4`, disabled by default. All ten scoped fingerprint
records for Puncher, Counter, Tempo and the three Vanguard presets preserve pose, physics and
saved state against `eef26399`; no case moves. These are the fingerprint script's Arena cases,
using the vendored `rapier-coordinate` bout engine. The entrant enables the check in its own
executor. Typecheck, all 119 tests, build, two-file entrant scope and line endings pass. The new
physical regression fails on the original missing brake and passes all six early-loss returns
in 3.7 s. A production Arena smoke check has visible advancing frames and no console errors;
it also shows the Warrior recovering from a combat fall at 32.4 s. That unfinished smoke case
is not qualification or a new win. Its screenshot and observations remain with the record,
and the temporary preview is stopped by PID.

## Equipment path

Vanguard carries equipped attacks through the shared fighter and Lab kit. Its `vanguard-weapon`
part delegates held-item recipe strikes to the common executor and excludes empty hands. Shared
`blade-cut` and `blade-thrust` executors supply directed edge and point actions. The weapon actions
precede the punches where both are usable; ordinary arming removes them from an empty-handed kit.
Each calibration retains its committed standing and low punches for hands that hold nothing.

The loadout contract compiles every catalog assignment for the Warrior, Rogue and Skeleton and
offers each calibration with the representative loadouts. A physical Node stand exercises club,
sword-cut and sword-thrust actions with a buckler in the other hand: each action admits, commits
and drives a held endpoint through the ordinary compositor and muscle controller. The checks
live in `tests/entrant-vanguard.test.mjs` and run in under ten seconds. They establish equipment
execution, not a winning rate or complete equipment miss-recovery qualification. Equipment bout
qualification remains open.

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
