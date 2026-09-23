# Attribute measurements

What each golem stat does, measured. One section per stat, in the order the plan set
(`docs/plans/2026-09-23-attributes-00-overview.md`) lands them, each with its bench table and its
bout sweep. The same tables sit in the stat's row doc comment in `src/golem/attributes.ts`.

**Every figure names its harness.** Unless a table says otherwise, a sweep is
`research/stat-sweep.mjs` on the Node harness, research runner, supported locomotion, with the
research `PROTOCOL` cap of 150 s, the `default` build on both corners, and the four probe minds
`golem-champion`, `golem-miser`, `golem-brawler` and `golem-duelist` in every ordered pairing.
A bench reading names its own harness beside it.

## How to read a sweep

- **A block** is one mind pair on one seed pair, played twice: the modified corner on the left,
  then on the right, each corner keeping its own mind seed. Arena side cancels inside a block.
- **Win %** is the modified corner's, with a draw as half, and a 95 % bootstrap interval over
  blocks. `Left / right` splits it by the side the modified corner was on; a real effect moves
  both, and a side-only move is a seeding bug (memory `probe-minds-need-side-correct-seeds`).
- **Margin** is the modified corner's final bar (`Golem.vitality`) minus the other's, averaged
  over a block. `d` is its mean over its standard deviation across blocks -- the criterion in
  memory `paired-effect-size-criterion`.
- **vs control** is the same margin minus the control level's on the same block. Every level
  plays the same blocks, so this subtracts the variance that comes from which minds and seeds a
  block drew -- **when the level's blocks track the control's**, which is what a small multiplier
  should do. When the change swamps the matchup it does not: `ram-capped` below loses almost every
  block whoever the minds are, its own margin has little spread, and subtracting the control adds
  the control's spread back, so its paired d (-1.61) is *smaller* than its own (-2.48). Read both;
  the two d's measure different things and are not to be compared with each other.
- **Dealt** and **taken** are damage per bout by and to the modified corner, from the combat log.
- **Only a comparison inside one sweep means anything.** Seed bases differ by more than the
  effects measured here (memory `mind-sweeps-need-big-n`).

## The instrument (session 02)

### Null control

Level x1 only, the modified corner carrying `attributes: { movement: 1 }` explicitly, 192
blocks, seed 20260923. `research/runs/stat-null`.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x1.00 | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | 1 | 28.1 | 7.60 | 7.68 |

Every bout ended `exhausted`. **This is the noise floor**: at 192 blocks on this seed base the
win rate's interval is about +-5.4 points and the margin's about +-0.05 of a bar. The control
level of both edge runs below played the same 384 bouts and reproduced this row exactly.

The mind pairs spread from 25.0 % to 83.3 % *inside the null row*, where both bodies are
identical: `golem-duelist` against `golem-miser` is 83.3 %, and `golem-miser` against
`golem-champion` is 25.0 %. That is the minds' own non-transitivity, not a stat, and it is why
a per-pair column can only be read against the same pair's control.

### Known edges

The modified corner is a whole named build from `NAMED_BUILDS` against `default`, beside a control
level where both are `default`. Same blocks, same seed.

| Modified build | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ram-capped` | 384 | 5.1 [3.1, 7.3] | 6.0 / 4.2 | -0.661 [-0.700, -0.623] | -2.48 | -0.653 [-0.710, -0.596] | -1.61 | 45.6 | 1.47 | 7.36 |
| `ram-blade` | 384 | 54.0 [48.7, 59.8] | 55.2 / 52.9 | 0.035 [-0.010, 0.086] | 0.10 | 0.044 [-0.014, 0.101] | 0.11 | 29.2 | 7.89 | 7.68 |

`ram-capped` -- a ram head and no arms -- is the known edge the plan asked for, and it reads as
one on both sides, in the win rate, the margin and the damage columns alike: it deals a fifth of
what it takes. That proves the columns are wired to the modified corner.

`ram-blade` was tried first because the published league (`research/results/baseline.json`)
scores it 0.737 over its cells, the highest of any build. Against `default` head to head it is
+5 points and d 0.11, inside the noise. The league's figure is an average over cross-build
cells, not a head-to-head edge, and the two are not the same question.
