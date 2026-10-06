# Punch execution qualification

The Node unpinned Warrior stand uses vendored Rapier, symmetric sourced muscle bounds,
120 Hz and balance zero. The retained original apparatus measurements are in
`punch-calibration.md`; the new matched apparatus supplies both native and compliant contacts
through the same detached hand-feedback contract. Compliant tactile impulse is the explicitly
applied material force times the step. The independent pad meter remains momentum balance.

## Execution limits

`PUNCH_EXECUTION` requests physical fists before launch and aims the named capsule-surface
`strike` point. The wrist preference remains the guard's neutral posture; elbow extension and
thoracic rotation are posture preferences within the existing joint limits and muscle bounds.
This does not add antagonist coactivation or an impedance actuator.

Identified intended contact uses a 0.04 s timer, quantized to world steps, or a 0.04 m
follow-through endpoint, with path-normal alignment of at least 0.5. These are engineering
trial inputs, not human measurements. The bounds apply to the command; inertia and continuing
material contact do not disappear when the executor withdraws.
The follow-through asks for a finite endpoint with zero terminal speed. Cancellation, loss of
support and blocked/unknown contact withdraw. A miss retains the ordinary finite stroke and
verified return. Loaded or obstructed closure cannot authorize a swing.

The bounded search uses two coordinate passes in speed, duration, extension and torso order.
Promotion requires both-hand median clean impulse at least 1.2 times the matched retained
baseline, no additional failed cycles, falls or assistance, and the Arena qualification gates.
Raw records: `punch-foundation-search.json.gz` contains every trial, diagnostic, force waveform,
failure and both coordinate passes; `punch-arena.json` contains the gameplay qualification.
The original `punch-calibration.json.gz` is retained. The new record also repeats its 26-cell
matrix and adds 12 matched fine-rate finalist/reference trials: 98 physical stand runs total.

## Measured decision

Each search cell runs eight seconds on each hand and both straight/cross paths. Each of its four
trials must independently pass three clean measured impacts, three verified returns, no failed
cycles, falls, trunk-floor contact, assistance or excess pad travel. Scores take the median of
all clean impacts per hand across both families. Feasible cells maximize the smaller hand's
median; ties retain the earlier cell. Cached identical settings are measured once.

| Execution, 120 Hz | Left median impulse, N s | Right median impulse, N s | All four trials pass |
| --- | ---: | ---: | --- |
| Matched open-hand reference | 4.858 | 3.684 | yes |
| Closed fist, immediate withdrawal | 4.854 | 5.658 | yes |
| Closed fist, bounded impact, original posture | 5.391 | 5.456 | no |
| Selected bounded impact, extension 0.5 | 5.690 | 4.012 | yes |

The selected input is 5 m/s contact speed, 0.12 s swing, 0.5 elbow preference and 0.2 rad
cross-path thoracic preference. Its improvements are 17.1% left and 8.9% right, below the 20%
both-hand gate. Higher speeds, alternate durations, full extension and reduced torso preferences
fail individual repeatability or stroke gates. Some high-impulse cells fall or fail their return;
they remain failures. Only one of the thirteen distinct bounded-impact cells qualifies.

At first compliant contact, Euclidean distance between the commanded point and the loaded
capsule support point falls from about 9.0–9.4 cm on the reference to 1.2–1.6 cm on the selected
candidate. This is a contact-placement diagnostic, not a measurement of real fist anatomy.
Finer-step straight punches do not sustain the improvement: candidate medians remain below
their matched references at 480, 960 and 1920 Hz. Forces are also retained averaged into
clock-aligned 120 Hz bins, so a fine-step spike is not presented as a game-step force.

The exploratory Arena comparison uses four distinct mirrored pairs (eight 30-second bouts),
two development and two held-out geometric/delay/order recipes, versus retained Scrapper.
The candidate wins eight times by remaining health at the cap; neither side falls in those
bouts. This small screen establishes no finite Elo estimate or broad league superiority.
Both-hand low/recovery trials still fail: two of four attackers fall, and none completes all the
existing low-hit/standing-return gates. Assistance remains zero.

**Do not promote this configuration.** Brawler and Scrapper retain their qualified settings.
`ArenaFighterConfig.execution` permits the experiment through the ordinary gameplay path,
with physical presentation reading the applied pose. Recovery still hands the body to the
shared recovery controller. No promoted Arena controller or human-equivalent punch claim
follows from these results. The next mechanical questions are fist orientation under tracking,
support stability during close/low contact and timing that survives the finer-rate check.

Reproduction:

```powershell
node research/punch-foundation.mjs
node research/punch-arena.mjs
node research/punch-mass-audit.mjs
```

The search record names its source fingerprint and each trial's engine adapter/rate. The Arena
runner loads the selected recorded inputs, uses one sequential loop per worker, and refuses a
source change during the run.
