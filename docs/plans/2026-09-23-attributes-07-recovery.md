# Attributes 07 -- recovery

Recovery scales how long a knocked-down body spends on the floor. It follows the per-stat protocol
in `-00-overview.md`.

## First: is there anything to recover from?

**Stone has `knockdown: null`.** Only the skeleton sets a `Knockdown` table:
`restSpeedMps` 0.3, `restSeconds` 0.2, `maxLyingSeconds` 2.5, `risePeakMps` 0.9,
`riseHoldsThroughHits` true. Stone and human bodies go down through the shared supported-locomotion
path and come back up through its floors:
- `SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S` (0.35 s);
- `RISING_DURATION_S` (0.45 s).

The state machine refuses a rise shorter than that, and the dwell is hard.

So before wiring anything, measure the time spent down per bout for the stone default and for the
skeleton, using session 06's knockdown columns. If stone bouts almost never go down, recovery is a
skeleton stat in practice, and the table says so rather than presenting a flat stone row as a
result.

## The knob

- **Scale the `Knockdown` table where one exists.**
  - Recovery above 1 means faster:
    - `risePeakMps × r`;
    - `restSeconds / r`;
    - `maxLyingSeconds / r`.
  - `riseHoldsThroughHits` is a boolean, and the stat does not touch it.
- **Make the two shared floors per body.** Today `FALLEN_DWELL_S` and `RISING_DURATION_S` are
  constants that the state machine reads directly. Pass them in with the module's authority, the
  way brace is passed, and divide them by the stat. That way recovery above 1 can get faster on
  stone too.
  - Session 06 adds `stabilityScale` in the same place. Take the one design both need, rather than
    two parallel paths.
- **Never remove the lying cap.** House rule: recovery cannot require the support state it exists
  to restore. `maxLyingSeconds` is what keeps a body that is still being struck from lying there
  for ever. Recovery may shorten it and nothing may make it infinite. `attributesRefusal` already
  refuses a value outside the range, so the range is where that guarantee lives.
- **Keep the check that the rise does not start from a pose it cannot rise from.** A faster rise
  must still wait for the fall to finish, where finished means the rest speed is met or the cap is
  reached.
- **Mind the tone.** On a body whose locomotion names a `fallenTone` (the skeleton), the motor tone
  climbs back across the rise. A shorter rise is a faster climb, so the arm must not snap: check
  the stroke bench's stray during a rise at the top level.

## Bench (Node harness)

- **Time from fall to standing.** Knock the body down with the bench shove above its fall
  threshold, then time from the fall to standing at 0.75, 1.0, 1.25 and 1.5. Do this on the
  skeleton and the stone biped.
- **Rise count.** Record the rises completed against the rises interrupted, and make sure every
  level rises eventually.

## Sweep

Run the protocol levels on the skeleton build (`--build`), which is where knockdowns live, and on
the stone default as its own table. The columns: time down per bout, knockdowns per bout, and win
rate and d.

## Done when

- Recovery is `live` with a measured range.
- The floors are per body.
- The lying cap still holds at the top level. Prove that with a test: a body struck continuously
  still rises by `maxLyingSeconds / r`.
- The fingerprint reads all `same` at 1.00.
