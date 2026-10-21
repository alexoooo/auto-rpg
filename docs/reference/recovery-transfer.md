# Recovery weight transfer

How `stagedRise` moves the weight off a limb a stage leaves (`transfer` in its state,
`src/core/mind/rise/staged.ts`; `RiseLimbs.bear`, `src/core/mind/rise/limbs.ts`), and the probe that
shows the weight moves.

## The rule

- **A departing limb is unloaded only when the weight is over the rest**: every retained limb down
  and the actual centre of mass inside their contracted support outline, read from bearing patches,
  not from airborne limbs whose point tasks are merely active.
- **The chain's redundant posture follows the stage's time constant** during such a stage, in place
  of the 0.1 s posture constant (`TAKES_SECONDS`).
- **A bounded integral of horizontal position error** removes the steady error posture tracking and
  contact leave. It integrates at the stage's inverse time constant, its position-equivalent
  magnitude capped at the body's standing height, and resets at every stage entry; completion
  measures the stage's target without it. It is controller conditioning, not force: the bearing
  solve and the muscles' ceilings still bound the motion.

## Measurement

Node stand, the Warrior toppled, symmetric muscles, 120 Hz, empty hands, balance 0; after `fours`, a
3 s stage pitched 0.9 rad bearing on the shins (0.4 each) and one hand (0.2), leaving the other. The
probe reads the support gap before physics advances, at the release step, and must start with the
centre of mass outside the three supports it keeps. On Rapier's own joints `fours` bears 0.28 on each
hand and 0.22 on each shin and the body leans over its hands; on the coordinate joints it keeps the
recipe's shares.

```powershell
node research/recovery-transfer.mjs
$env:CORE_ENGINE = 'rapier-coordinate'; node research/recovery-transfer.mjs
```

| Engine | Departing hand | Initial support gap (mm) | Release (s) | Support gap at release (mm) | Peak segment speed during transfer (m/s) | Assist force / moment sums |
|---|---|---:|---:|---:|---:|---|
| rapier | left | 4.38 | 0.4583 | 0 | 0.7716 | 0 / 0 |
| rapier | right | 1.62 | 0.3417 | 0 | 0.7502 | 0 / 0 |
| rapier-coordinate | left | 44.63 | 0.7083 | 0 | 0.6012 | 0 / 0 |
| rapier-coordinate | right | 62.74 | 2.5333 | 0 | 0.9665 | 0 / 0 |

Without the rule the left hand stays loaded through the stage, the centre of mass 15.4 mm outside
the retained supports at 2.75 s; relaxing the posture alone leaves 6.8 mm. These are support
handovers, not rises: the probe's posture is incomplete on purpose and still times out. The
asymmetric release times are measured, not a claimed mirror symmetry.
