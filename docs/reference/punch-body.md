# The punch's body

The arms, the trunk and the neck turn 2.5 times as fast unloaded as the curves read
(`UPPER_SPEED_IN_USE`, `src/core/human/speed.ts`; `owner-punch-body`, `src/core/sources.ts`): the
least of the factors tried at which a punch searched on the Strike drill lands at the bar
(`BAR`, `src/evaluation/strike/read.ts`) at 120 and 480 Hz. At the curves read, no straight punch
does ([a timed punch on the drill](../analysis/2026-10-08-punch-layer.md#a-timed-punch-on-the-drill)).

## What is used

`UPPER_SPEED_IN_USE` multiplies the unloaded speed of every exertion that is not a leg's (the legs
have their own, `LEG_SPEED_IN_USE`, [the run's body](run-body.md)); the curvature is the curve's.
Unloaded speed, rad/s, the men's and the women's columns:

| Exertion | Read, men | In use, men | Read, women | In use, women |
| --- | --- | --- | --- | --- |
| elbow extension (Frey-Law 2012 on Thelen's curvature) | 25.5 | 63.8 | 27.0 | 67.4 |
| elbow flexion; the shoulder, forearm and wrist borrow it | 20.7 | 51.8 | 22.6 | 56.4 |
| hip flexion's curve, which the trunk and neck borrow | 27.2 | 68.0 | 27.7 | 69.3 |

Frey-Law's column stops at 5.2 rad/s; a person's straight punch opens the elbow at 22 to 41 rad/s
(32.9 for professional boxers, Gait Posture 49S, 2016). At 2.5 the elbow's extensors give 15 % of
their isometric torque at 33 rad/s, where at the curve read they give none.

## Measurement

`research/punch-drill.mjs`: the Puncher's straight punch with a timed drive (`StraightPunch.timed`)
searched by CMA-ES, each candidate a trial of the drill's still rung (the Warrior's right hand at
the middle mark, square on, its gap searched) at 120 and at 480 Hz, scored by the worse. The
shoulder and the elbow are left off the schedule and pushed at the contact pose; the strike aims
at the chest's open surface (`--chest`). Node, Rapier. Each factor's best, read at the worse rate:

| Factor | Outcome | Speed, m/s | Mass, kg | Straight, cos | Along the arm, cos | Elbow from straight, rad | Chest from upright, rad |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.98 (as the legs) | weak, 120 Hz | 7.07 | 1.86 | 0.985 | 0.854 | 0.51 | 0.18 |
| 2.5 | **landed** at both | 7.01 | 6.35 | 0.981 | 0.824 | 0.32 | 0.25 |
| 3.0 | weak, 480 Hz | 7.86 | 1.79 | 0.968 | 0.798 | 0.48 | 0.34 |

The landed punch, read at 480 Hz: 7.90 m/s, 3.13 kg, straight 0.993, along 0.806, the elbow 0.50
rad from straight, the chest 0.25 rad from upright, first contact 0.22 s after the request. Its
schedule is `punch-body.json` (`node research/punch-drill.mjs --verify docs/reference/punch-body.json`);
rounded to six decimals, it no longer lands at 480 Hz.

It lands in its own cell alone. Read at gaps 0.85 to 1.05 m and offsets across of 0, 0.1 and 0.2
m, on the Warrior and the Rogue, at both rates (60 trials), it lands only at its own gap, square
on, on the Warrior: off it, the fist meets the target's guard or misses. A punch that lands across
them is the [Punch](../plans/2026-10-24-punch.md) plan's step 4.

What the factor moves (`scripts/fingerprint.mjs --experimental` against `3a472896`): every bout
and crypt fight, the Lab's run and routine and the learned rise and run move; no stand moves. Of
the 24 arena bouts without the reptile, 4 end in a fall and 4 in a fatal blow, against 4 and 3.

## Tried and not kept

- The elbow's curvature flattened (0.1, or its unloaded speed at 32.9 rad/s), the rest as read: the
  search lands only an overhead chop, at 120 Hz alone
  ([a timed punch on the drill](../analysis/2026-10-08-punch-layer.md#a-timed-punch-on-the-drill)).
- The trunk's axial rotation torque 2.5 and 4 times Pan's, the factor at 1.98: the best of each
  is weak at 120 Hz, 6.35 and 5.61 m/s, read with a 20-degree arm-line test.
- The fist driven along the line (`driven`) beside the timed trunk: on the line (along 0.98), at
  6.1 m/s at 120 Hz and 5.3 at 480.
- The head (the high mark): the searched punches are weak, 4.5 to 6.2 m/s.
