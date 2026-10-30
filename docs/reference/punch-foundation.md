# Punch execution qualification

The bounded-impact punch execution (`PUNCH_EXECUTION`, `src/core/skills/strikes/combat.ts`) and its search.
The selected input gains 17.1 % left and 8.9 % right in median impulse, below the 20 % both-hand
gate, and fails the low trials: it is not promoted. `ArenaFighterConfig.execution`
(`src/core/mind/config.ts@352fbe24`) runs it through the ordinary gameplay path.

Harness: Node Warrior stand (unpinned), vendored Rapier, symmetric sourced muscle bounds, 120 Hz,
balance 0. The matched apparatus gives native and compliant contacts through the same detached
hand-feedback contract; compliant tactile impulse is the applied material force times the step,
and the pad meter stays momentum balance. The original measurements compared against are
`docs/reference/punch-calibration.json.gz@8c59943b` (capsule hands).

## Execution limits

`PUNCH_EXECUTION` asks physical fists before launch and aims the named `strike` point on the hand's
surface. The wrist keeps the guard's neutral posture; elbow extension and thoracic rotation are
posture preferences within the joint limits and muscle bounds, with no added coactivation or
impedance actuator.

Intended contact is identified by a 0.04 s timer (`impactSeconds`, quantized to world steps) or a
0.04 m follow-through endpoint (`impactTravel`), with path-normal alignment of at least 0.5
(`normalAlignment`): engineering trial inputs, not human measurements. They bound the command;
inertia and continuing contact do not stop when the executor withdraws. The follow-through asks a
finite endpoint at zero speed; cancellation, lost support and blocked or unknown contact withdraw; a
miss keeps the ordinary stroke and verified return. Loaded or obstructed closure cannot authorize
a swing.

## Measured decision

Two coordinate passes over speed, duration, extension and torso order; each cell runs 8 s on each
hand and both straight and cross, and each of its four trials must pass three clean measured
impacts, three verified returns and no failed cycle, fall, trunk-floor contact, assistance or
excess pad travel. A cell scores the smaller hand's median clean impulse; promotion needs both
hands at least 1.2 times the matched baseline plus the Arena gates. Records:
`punch-foundation-search.json.gz` (every trial, waveform and failure, 98 stand runs with the
repeated 26-cell matrix and 12 fine-rate finalist trials) and `punch-arena.json`.

| Execution, 120 Hz | Left median impulse, N s | Right median impulse, N s | All four trials pass |
| --- | ---: | ---: | --- |
| Matched open-hand reference | 4.858 | 3.684 | yes |
| Closed fist, immediate withdrawal | 4.854 | 5.658 | yes |
| Closed fist, bounded impact, original posture | 5.391 | 5.456 | no |
| Selected bounded impact, extension 0.5 | 5.690 | 4.012 | yes |

The selected input is 5 m/s contact speed, 0.12 s swing, 0.5 elbow preference and 0.2 rad cross-path
thoracic preference; one of the thirteen bounded-impact cells qualifies. At first compliant contact
the commanded point sits 1.2–1.6 cm from the loaded support point against 9.0–9.4 cm for the
reference (a placement diagnostic). The gain does not hold at 480, 960 or 1920 Hz, read in
clock-aligned 120 Hz bins.

In the Arena (four mirrored pairs, eight 30 s bouts, two development and two held-out recipes,
against Scrapper) the candidate wins all eight on remaining health at the cap, no falls. In the
both-hand low and recovery trials two of four attackers fall and none passes every low gate.

```powershell
node research/punch-foundation.mjs
node research/punch-arena.mjs   # at ffdaaeea
node research/punch-mass-audit.mjs
```

The search used foremost-point pad admission, not the clipped-surface meter of
[trained-attack-force.md](trained-attack-force.md); under that meter the unplanted original posture
no longer gives three clean contacts in 6 s, and repeated-contact tests use the planted executor
with 0.5 elbow preference.

## Tried and not kept

- Higher speeds, other durations, full extension and less torso preference: fail repeatability or
  stroke gates; some high-impulse cells fall or fail their return.
