# Arms built at guard

Skill ceiling 01, part 3 (`docs/plans/2026-09-25-skill-ceiling-01-body-release-1.md`). Before is
0ca3565, the integrate-120 tree, and after is 548d0c5, which builds every arm at guard. All figures
come from the Node bout runner (`tests/harness/bout-runner.mjs`) at 120 Hz physics and control,
called directly unless the table says `research/runner.mjs`.

## What changed

Every arm used to be built hanging, with the stone reach chain's elbow bent a little forward, and
then driven up to guard by its own servos. Each of the three arm families is now built at the pose
its rest command holds:

- the stone reach chain (`arm-core.ts`), collar yaw included;
- the one-bone pitch chain (`pitch.ts`);
- the human arm (`humanoid/arm.ts`), which the skeleton also wears.

The rest command is `restCursor` in `src/golem/effectors/chains/arm-core.ts`, the same cursor that
`NEUTRAL` and `freshIntent` hold. Each weld is built in the frame it demands.

`an_arm_is_built_where_its_rest_command_holds_it` in `tests/golem-bench.test.mjs` pins the change.
It went red under each of these four mutations:

| Mutation | Tip reached |
|---|---|
| Stone reach chain built hanging (`swing 0, lift liftMin`) | 13.03 m/s |
| Pitch chain built at pitch 0 | 14.90 m/s |
| Human arm built at `ARM_REST` | 5.64 m/s |
| `restCursor`'s secondary `pointerY` set to 0 | the cursor check fails |

The pitch-chain mutation also turns rung 1 red.

## The opening, before and after

**Idle.** Each body stands 20 m from the other with nothing commanding it, and the reading is the
peak tip speed in the first 0.6 s. Every idle mirror was also run at `CONFIG.fighter.separation`
for 1 s.

| Build | Before | After |
|---|---|---|
| default, two-blades, ram-blade, wheel, multileg, plated | 12.77–12.81 m/s | 0.10 m/s |
| mace | 15.41 | 0.12 |
| maul | 8.52 | 0.74 |
| whip | 10.95 | 3.32 |
| fists | 7.91 | 0.06 |
| ram-capped | 0.00 | 0.00 |
| pitch-blade | 14.90 | 0.11 |
| human-warrior | 5.65 | 0.16 |
| human-dual-swords | 7.56 | 0.16 |
| human-unarmed | 2.89 | 0.07 |
| human-maul | 2.98 | 0.14 |
| skeleton-warrior | 9.55 | 0.11 |
| skeleton-mace | 8.25 | 0.15 |
| skeleton-dual-blades | 9.57 | 0.12 |
| skeleton-maul | 1.91 | 1.60 |
| Idle mirrors with a contact within 1 s | 3 of 20 (two-blades at t = 0, maul, skeleton-maul) | 0 of 20 |

Three builds still move after the change, and none of it is a construction artefact:

- **whip.** The lash hangs under gravity and settles.
- **maul and skeleton-maul.** The trailing hand travels to its grip on the haft. Building the trailing
  chain at its grip point would remove that too, and was not done.

The plan's 77 m/s was the Warrior's anchor keyframing onto its pose. On 0ca3565 the golem figure is
the 12.8 m/s sweep above.

**Probe-mind mirrors.** One bout per mirror, seeds 11 and 22.

- *Damage by 0.5 s* is each side's, in the bar's units (`GOLEM_ASSEMBLY.vitalityTotal` is 5.4).
- *Gap* is the tip-to-tip gap at t = 0.
- *Moved* is how far each body's ground point had moved by the first contact.

| Build, mind | Gap before | Gap after | First contact before | First contact after | Damage by 0.5 s before (L/R) | Damage by 0.5 s after (L/R) |
|---|---|---|---|---|---|---|
| default, champion | 0.69 m | 1.09 m | 0.117 s, blade on blade, moved 0.06 m | 0.267 s, blade on head, weak, moved 0.31 | 0 / 0 | 0 / 0 |
| default, miser | 0.69 | 1.09 | 0.117, blade on blade | 0.217, blade on shield, moved 0.17 | 0 / 0 | 0 / 0 |
| default, brawler | 0.69 | 1.09 | 0.117, blade on blade | 0.267, blade on blade, moved 0.31 | 0.934 / 0.722 | 0.166 / 0.166 |
| default, duelist | 0.69 | 1.09 | 0.117, blade on blade | 0.283, blade on blade, moved 0.35 | 0 / 0 | 0 / 0 |
| human-warrior, champion | 1.33 | 2.08 | 0.200, blade on blade | none within 1 s | 0 / 0 | 0 / 0 |
| human-warrior, miser | 1.33 | 2.08 | 0.217 | 0.800 | 0 / 0 | 0 / 0 |
| human-warrior, brawler | 1.33 | 2.08 | 0.700 | 0.467 | 0 / 0 | 0 / 0 |
| human-warrior, duelist | 1.33 | 2.08 | 0.200 | none within 1 s | 0 / 0 | 0 / 0 |
| skeleton-warrior, champion | 0.48 | 1.38 | 0.417 | 0.150, blade on blade, moved 0.10 | 0 / 0 | 0 / 0 |
| skeleton-warrior, miser | 0.48 | 1.38 | 0.117 | 0.150 | 0 / 0 | 0 / 0 |
| skeleton-warrior, brawler | 0.48 | 1.38 | 0.117 | 0.150 | 0.103 / 0.114 | 0 / 0 |
| skeleton-warrior, duelist | 0.48 | 1.38 | 0.417 | 0.150 | 0 / 0 | 0 / 0 |
| pitch-blade, all four | 2.68 | 0.82 | 0.417–0.500 | 0.417–0.483 | up to 0.070 | up to 0.093 |

Every contact under 0.2 s was a "weak" one, below the scoring floor. Most early damage came from the
brawler's opening. On 0ca3565 it was already smaller than the plan's recorded table (0.45 to 0.89 of
a bar per side), which does not reproduce at 120 Hz.

After the change, the stone default's first contact comes 0.10–0.17 s later. It is always preceded
by 0.17–0.35 m of walking and a mind's first stroke, and it no longer lands identically across all
four minds.

The skeleton's 0.150 s contact is a driven one. The four minds give almost the same first command,
and the skeleton's reach clears its 1.38 m gap in 0.15 s. It scores nothing.

So the first contact now happens no earlier than the bodies can close under their own commands. What
remains in the first fifth of a second is the minds' identical opening, not construction. That
opening is part 1's question (seed-driven openings), not this one's.

## `settleSeconds`

A settle runs physics with no control, so it does not wait for the guard: `JointServo` drives a motor
only when `track` is called. With arms built at guard, a settle only lets them droop.

Each figure below is the mean of four seed pairs, both sides' damage summed.

| Build | Tip droop over a 0.6 s settle |
|---|---|
| stone | 1.29 m |
| human | 2.23 m |
| skeleton | 1.23 m |

| Mind (stone default) | Damage by 0.5 s, no settle | Damage by 0.5 s, 0.6 s settle |
|---|---|---|
| miser | 0.000 | 0.351 |
| duelist | 0.000 | 0.300 |
| champion | 0.165 | 0.090 |
| brawler | 0.332 | 0.349 |

On the skeleton, the settle moved the first contact from 0.15 s to 0.21 s and changed no damage by
0.5 s.

**The decision:** it is not needed, and it now does harm. `createBout` refuses any value but 0.
`PROTOCOL` and the fork harness already pass 0, so no recorded study changes meaning.

`WARMUP` in the bout runner stays at 0.6 s, although no startup transient is left to exclude from a
peak, so that its peaks stay comparable with earlier records.

The page never had this problem, because physics stays disabled until Fight.

## The ramp, `CHAIN_REACH.acquireSeconds`

The ramp is kept. It limits how fast a mind's *first* move can sweep the arm off its build pose.
Without it, the four probe minds' first guard commands cross the blades at 0.083–0.100 s on stone,
and 0.067 s on the skeleton.

One bout each, damage both sides by 0.5 s:

| Build, mind | With ramp | Without ramp |
|---|---|---|
| stone, champion | 0.267 s, 0.000 | 0.083 s, 0.687 |
| stone, miser | 0.217 s, 0.000 | 0.100 s, 0.729 |
| stone, brawler | 0.267 s, 0.332 | 0.100 s, 0.407 |
| stone, duelist | 0.283 s, 0.000 | 0.100 s, 0.480 |
| skeleton, all four minds | 0.150 s, 0.000 | 0.067 s, 0.000–0.149 |

The table is also in the ramp's doc comment in `src/golem/config.ts`.

## Paired bout set

The set ran through `research/runner.mjs`'s `runJobs`, the real bout runner in isolated workers,
under the `PROTOCOL` of `research/schedule.mjs`. Three builds were each played as a mirror:

- the stone default;
- human-warrior;
- skeleton-warrior.

Each build ran all 16 ordered pairings of the probe minds, with 8 seed pairs each, for 384 bouts a
side. Seeds are `seed("arms-at-guard", build, left, right, k, side)`, so the same job id on either
tree plays the same seeds, and the rows pair by id.

Each interval is 95 %, from a 10,000-draw bootstrap that resamples whole pairings: 16 per build and
48 pooled. The pairing is the unit because every bout of one pairing plays the same opening. The
replicates still differ: each pairing produced a mean 6.9 distinct (winner, length) outcomes of 8,
before and after alike.

- *Damage per second* is both sides' damage over the bout's length, averaged over bouts.
- *Win share* is the left corner's, with a draw counting a half.

| Build | Bouts (pairings) | Length before | Length after | Change | Damage/s before | Damage/s after | Change | Decided before / after | Left win share before | Left win share after | Change |
|---|---|---|---|---|---|---|---|---|---|---|---|
| default | 128 (16) | 22.2 s | 24.2 s | +2.0 [−1.7, +5.4] | 1.095 | 0.996 | −0.099 [−0.244, +0.039] | 0.99 / 0.98 | 0.480 | 0.430 | −0.051 [−0.180, +0.094] |
| human-warrior | 128 (16) | 116.9 | 116.9 | +0.1 [−0.6, +0.9] | 0.0080 | 0.0075 | −0.0004 [−0.0024, +0.0012] | 0.70 / 0.70 | 0.480 | 0.484 | +0.004 [−0.082, +0.105] |
| skeleton-warrior | 128 (16) | 54.6 | 54.7 | +0.1 [−3.5, +3.6] | 0.0817 | 0.0808 | −0.0009 [−0.0083, +0.0067] | 1.00 / 1.00 | 0.516 | 0.508 | −0.008 [−0.109, +0.094] |
| pooled | 384 (48) | 64.5 | 65.3 | +0.7 [−1.0, +2.4] | 0.395 | 0.361 | −0.034 [−0.086, +0.012] | 0.90 / 0.90 | 0.492 | 0.474 | −0.018 [−0.081, +0.048] |

Each probe mind's score share leaves its own mirror out. Each per-build row rests on 6 pairings, and
the pooled row on 18.

| Build | Mind | Before | After | Change |
|---|---|---|---|---|
| default | brawler | 0.625 | 0.417 | −0.208 [−0.500, +0.063] |
| default | champion | 0.542 | 0.604 | +0.063 [−0.104, +0.229] |
| default | duelist | 0.250 | 0.188 | −0.063 [−0.208, +0.083] |
| default | miser | 0.583 | 0.792 | +0.208 [−0.063, +0.500] |
| human-warrior | brawler | 0.833 | 0.875 | +0.042 [−0.083, +0.229] |
| human-warrior | champion | 0.615 | 0.427 | −0.188 [−0.323, −0.063] |
| human-warrior | duelist | 0.219 | 0.229 | +0.010 [−0.125, +0.125] |
| human-warrior | miser | 0.333 | 0.469 | +0.135 [+0.052, +0.219] |
| skeleton-warrior | brawler | 0.333 | 0.292 | −0.042 [−0.229, +0.167] |
| skeleton-warrior | champion | 0.563 | 0.604 | +0.042 [−0.063, +0.146] |
| skeleton-warrior | duelist | 0.333 | 0.333 | 0.000 [−0.188, +0.188] |
| skeleton-warrior | miser | 0.771 | 0.771 | 0.000 [−0.083, +0.083] |
| pooled | brawler | 0.597 | 0.528 | −0.069 [−0.208, +0.063] |
| pooled | champion | 0.573 | 0.545 | −0.028 [−0.125, +0.069] |
| pooled | duelist | 0.267 | 0.250 | −0.017 [−0.108, +0.073] |
| pooled | miser | 0.563 | 0.677 | +0.115 [+0.010, +0.233] |

**What this says:**

- **Bout-level figures.** No interval on bout length, damage per second or left win share excludes
  zero, per build or pooled. The change removes the opening artefact without moving what a bout is.
  - The stone default's damage per second falls 9 % (−0.099, interval −0.244 to +0.039), which is
    the direction the removed opening clash predicts. It is not resolved at this n.
- **The miser.** It is the one mind whose pooled share moves with an interval clear of zero: +0.115,
  from 0.563 to 0.677. Two per-build rows also clear zero on the human: the miser up, the champion
  down.
- **Caveats.** Those intervals rest on 6 or 18 pairings, and a cluster bootstrap on that few is
  optimistic. The table has sixteen rows, so one excursion at 95 % is expected by chance. Read them
  as where to look, not as findings. The mind standings the rest of the plan measures against should
  be re-taken on the after tree, not carried over.

## Fixtures the change moved

- **The dungeon routing probe** (`tests/dungeon-physical.test.mjs`). It read its contact point off the
  struck limb. With the hero's arm at guard, the lever from blade to limb put 12 m/s under the
  club's floor, and the probe scored a slap. It now reads the point off the striker's own centre and
  scores a crush, 0.123.
- **The two research-physical seed searches** (`tests/research-physical.test.mjs`).
  - *Sever:* no pair from 50 to 71 severs in ten seconds, and the search now starts at 72.
  - *Knockdown:* the x0.5 stability body no longer falls more than x1 on any pair from 44 to 91. The
    fixture is now two bouts that differ only in the idle body's stability, with the control being
    whichever fell less.
  - Both were mutation-checked against the worker's counters. Counting every fallen frame, and
    reading one corner's count for both, each turned them red.
