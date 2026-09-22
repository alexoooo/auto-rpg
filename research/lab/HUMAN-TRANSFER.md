# Golem policies in human bodies — September 22, 2026

**No researched golem policy transfers to human bodies.** On the same fixtures, all four lost to
the human duelist by 11 to 29 points, and every 95% interval lies below zero. They stay
golem-only in the picker. This is now a measured result, not merely an unmeasured case. The
human duelist's own adaptations are worth about 16 points over the unadapted golem Duelist, which
supports the working assumption that human bodies need human-built policies. Compute was 73.3
minutes on a 90-minute ledger; no cloud resources were used.

## Why this was measured

The human body family arrived in `f79238e`. The policy picker then checked only whether a body's
controls fit a policy, so every golem policy read "applicable" on human builds: the twin-blade
student on `human-dual-swords`, Needle and Paired on `human-warrior`, residual PPO on all four.
Nothing had measured any of them in a human body. The owner's working assumption was that human
bodies differ enough to need their own policies.

What differs, before any bout: the arm reach shells are close (human 0.24–0.65 m, default golem
0.25–0.78 m), so reach alone does not explain a difference. The human hand takes a full
orientation, which no golem policy commands. The one human-built policy, `humanoid-duelist`, is
the golem Duelist's tactics with strafing cut to a quarter, trunk twist to 35% and explicit hand
orientation.

## Picker change

`c24ba5f`: a policy declares the body family it was built and measured on. Absent means golem;
`humanoid-duelist` declares human. The picker refuses a policy on another family with "Built and
measured on golem bodies; not evaluated on human bodies." `idle` remains available everywhere.
Bouts are not gated, so a measurement can still cross families on purpose. `2d273bf` adds
`humanoid-duelist` to the lab's original-baseline pool so lab experiments can field it.

## Declared test

`research/human-transfer.mjs declare` froze everything below before any outcome (`da713dc`);
`evaluate` refuses a changed script or source. Raw evidence is in
`research/runs/human-transfer-2026-09-22/`; the compact record, which decodes to every comparison
below, is [results/human-transfer.json](results/human-transfer.json).

| Candidate | Human builds (where its controls fit) | Bouts |
| --- | --- | ---: |
| Student (twin blades) | dual swords | 192 |
| Needle | warrior, dual swords | 192 |
| Paired | warrior, dual swords, unarmed | 192 |
| Residual PPO | warrior, dual swords, unarmed, maul | 192 |

- Opponent: `humanoid-duelist` on each of the four human builds, both sides. The subject's mind
  always takes the fixture seed and the opponent's `seed ^ 0x123456`, on either side.
- Controls on the same fixtures: `humanoid-duelist` (primary) and `golem-duelist` (secondary),
  each covering the union of candidate fixtures: 400 bouts apiece. 1,568 bouts in all.
- A candidate transfers only on the admission bar: at least 128 bouts, a mean paired gain of at
  least +10 points over `humanoid-duelist`, and a strictly positive lower 95% bound. A transfer
  licenses a review of lifting the gate on the measured builds, not the lift itself.
- Secondary comparisons are descriptive: each candidate against `golem-duelist` in human bodies,
  and `golem-duelist` against `humanoid-duelist`.
- A pair containing a truncated bout is excluded from every comparison on its fixture.

**Ledger amendment (`5a870dc`).** The declared ledger was 45 minutes. Throughput measured about 21
bouts per minute, against about 45 estimated, so the stop would have left every candidate near
108 bouts, below the rule's 128-bout floor. The owner approved 90 minutes after 448 bouts, on
throughput alone, before any comparison was computed. Fixtures, policies, seeds and the rule are
unchanged. The first job stopped at its 45-minute deadline with 952 bouts, and a 28.3-minute
resume completed the rest. The declaration records the original source and the amendment.

## Results

All 1,568 bouts finished. No fixture was truncated; mean bout length was 115 s, 10.5% of bouts
were draws, and the left side won 47.1%. Scores count a win as 1 and a draw as 0.5.

| Candidate | Candidate | Human duelist, same fixtures | Gain, points (95% interval) | Against golem Duelist, same fixtures |
| --- | ---: | ---: | --- | --- |
| Student | 49.0% | 73.4% | −24.5 (−31.8 to −16.9) | −1.0 (−8.6 to +6.8) |
| Needle | 34.4% | 63.8% | −29.4 (−37.5 to −21.4) | −12.2 (−19.5 to −4.9) |
| Paired | 38.0% | 48.7% | −10.7 (−18.0 to −3.4) | +1.3 (−3.4 to +5.7) |
| Residual PPO | 31.0% | 48.4% | −17.4 (−25.3 to −9.6) | −3.1 (−8.9 to +2.1) |

Control scores differ by row because each candidate covers different builds. Dual swords is the
strongest human build here: the human duelist scores 73.4% on it across the four opponent builds.

Across all 400 control fixtures, the golem Duelist scored 41.1% against the human duelist's 57.0%:
−15.9 points (−21.5 to −10.3). The two share their tactics; the difference is the human
duelist's pose adaptation.

- **Nothing transfers.** All four fail the bar, and each is measurably worse than the human
  duelist, not just unproven.
- **The golem advantage does not survive the body change.** Against the golem Duelist in human
  bodies, the student, Paired and residual PPO are indistinguishable from it, and Needle is 12
  points worse. On golems the student beat Duelist by 12.5 points and residual PPO by 17.4.
- **Unexplained, not interpreted:** on its own fixtures the student deals more damage per bout
  than the human duelist does (0.92 against 0.69) yet scores 49% against 73%. It takes twice as
  much (0.39 against 0.18), but still deals more than twice what it takes, so damage totals alone
  do not account for its losses. Bout endings were not recorded; which damage decides a human
  bout remains open.

Per-build cells hold 48 to 96 bouts. They are in the compact record but are too small to read
individually; only the declared aggregates are decided.

## Decision

All four researched policies stay golem-only in the picker, as `c24ba5f` already has them. The
evidence supports the working assumption: human bodies need policies built for them. The human
duelist is the baseline a human policy must beat. The recipes that produced the golem gains, a
residual learner on top of a baseline and a teacher-trained student, are the natural candidates to
repeat on human bodies with the human duelist as the base. That is a new campaign and needs its
own authorization.

Limits: one opponent, the human duelist, and 192 bouts per candidate. The human duelist itself is
unrated and in no league, and the built-in golem policies other than Duelist were not measured in
human bodies; the gate refuses them on the same grounds.

## Harness note

`runBout` in its default (legacy) locomotion mode throws "supported pair must share one
world-query registry" for two human bodies. The game is unaffected: it chooses supported mode for
every golem-unit pair, human bodies included, and so do the lab and league tools. Pass
`locomotionMode: "supported"` when measuring human bodies with the test harness.
