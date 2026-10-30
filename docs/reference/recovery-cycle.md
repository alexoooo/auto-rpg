# Standing handover and subsequent control

The point fighter's recovery (`supportRecovery`, `src/core/recovery/rise/support-recovery.ts`): it runs
the reference `stagedRise`, then locomotion's gradual height restoration
([rising](rising.md#the-handover)), and hands the body back only once `recoveryReady`
(`src/core/control/recovery-ready.ts`) reads it standing. This records the handover's settings and
the development cases that run it through standing, walking and attack.

## Handover settings

`RECOVERY_VERIFY`, engineering acceptance settings chosen for development and validated by the
cases below, not anatomical measurements or an optimum:

| Setting | Value | What it is |
|---|---|---|
| `slow` | 0.1 m/s | the most any segment may move |
| `minUpNormal` | 0.9 | the least absolute vertical component of a contact's normal |
| `hold` | 0.5 s | how long the reading must hold unbroken |
| `limit` | 6 s | how long stabilisation runs before the reference route is retried |

`recoveryReady` reads detached body observations and support geometry: the host's upright reading,
positive fixed contacts at both feet, no other fixed supporting segment, the centre of mass inside
the feet's support polygon (`withinSupport`'s inset; feet give corners within `DOWN` of their lowest
corner), and every segment under `slow`. A pose request or a finished stage is not standing. Without
the upright check the handover acceptance test fails (`true` for a down body).

The supervisor captures the standing height before the fall, not from the low pose the riser hands
over in; without it and the gradual restoration, the handover can topple the body. Takeover and
retry require no support state. The host releases its commands on takeover and resumes only after
verified stabilisation; recovery keeps sensing the opponent. Clocks, counters, locomotion reference
and motor state are the body's replay state: tests save during stabilisation, replay into the same
and a fresh Duel, compare whole state and every segment's motion, and then walk.

## Measurement

Node arena Duel, vendored Rapier gameplay adapter 8, 120 Hz, symmetric actuation; the Warrior
against a stationary Rogue at 8 m, normal arena solids and damage, balance 0 % both sides. After 1 s
standing, 1.5 N s/kg horizontally at the middle trunk, along world +z, +x, -z, -x. A case needs a
real fall, allows 60 s after it, then commands 1 s walking and 2 s standing; a passing walk has
strides, travels over 0.15 m and never reads down. Every passing row acquires hand and shin support
on its actual rise.

```powershell
node research/arena-control-cycle.mjs docs/reference/recovery-cycle.json   # research/arena-control-cycle.mjs@a44f00e8
node --test tests/arena-control-cycle.test.mjs tests/arena-point-control.test.mjs   # both @a44f00e8
```

The runner selects `engagement: "reference"` (the game's Point control defaults to tracked
engagement) and writes all 19 development cases, failures included, to
[recovery-cycle.json](recovery-cycle.json), with the engine revision.

| Held | Direction | Fall to verified standing (s) | Walk travel (m) | Result |
| --- | --- | --- | --- | --- |
| Empty | +z | 25.617 | 0.329 | Pass |
| Empty | +x | 25.300 | 0.301 | Pass |
| Empty | -z | 27.525 | 0.343 | Pass |
| Empty | -x | 28.867 | 0.409 | Pass |
| Club | +z | 27.392 | 0.410 | Pass |
| Club | +x | 27.842 | 0.352 | Pass |
| Club | -z | No completion within 60 s | Not attempted | Fail |
| Club | -x | 28.025 | 0.404 | Pass |

The failed club case falls again and again in the later rise. Eight fixed cases are not a success
rate.

Two successive +z falls in one Duel, with walking after each, complete empty-handed (25.617 and
25.725 s) and with the club retained (27.392 and 25.617 s). In the 15 s attack window after, empty
hands meet four incoming impacts with four verified right-hand returns, the club four impacts with
three returns and one phase timeout; neither falls (strike cycle:
`docs/reference/arena-point-control.md@7f3ebcdb`). The root assist meter reads zero at completion.
