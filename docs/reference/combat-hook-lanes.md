# Wider hook lane screening

Node unpinned core stand, Warrior fists, rapier-coordinate, 120 Hz, balance 0. Each eight-second
trial attacks the same fixed front face at height 1.63 m, forward 0.50 m and lateral +/-0.10 m,
through `combatStrike`. Startup is two seconds. The current hook requests 5 m/s contact velocity,
0.18 s swing, 0.12 m lateral chamber and 0.05 m curve. Overrides change the requested path;
they change no strength, solver profile, assistance or damage.

The 12-cell initial screen varies chamber 0.12/0.24 m and curve 0.05/0.10/0.15 m with both
hands. All cells remain upright and return without failures, but only the retained chamber/curve
combination repeatedly hits. It produces eight contacts and seven verified returns per hand.
Mean actual pre-contact forward closing speed is 3.150/3.220 m/s and measured effective contact
mass is 1.438/1.551 kg, right/left. These are normal-direction fixed-contact measurements, not
whole-body striking mass or damage predictions.

With the 0.12 m chamber, both wider curves miss completely. At 0.24 m chamber, the wider/smaller
curves produce zero to two contacts and much smaller measured masses at the contacts they do
make. The right-hand mean pre-contact path error rises from 0.0086 m for the reference to
0.0935/0.1000 m for the wider curves. Return success alone would conceal this loss of control.

A further 12-cell screen keeps the 0.12 m chamber and varies the wider curves' swing time over
0.24/0.30/0.36 s. All cells remain upright and return without failures. Ten miss completely;
the right 0.10 m curve at 0.36 s makes two contacts, while its left counterpart misses. It fails
bilateral repeatable contact admission. No wider hook is sent to an Arena tournament or retained
as a stronger primitive from these screens.

The complete cells, including all misses, phase histories, pre-contact speeds, contact masses
and tracking errors, are retained in [the chamber/curve screen](combat-hook-lanes.json.gz) and
[the duration screen](combat-hook-lane-timing.json.gz), compressed UTF-8 JSON. Their source
fingerprint is `7e7b4b8dd5884415212c129814ca4ff5803fef5f582704f1d16412da7d2afb04`.

A separate eight-cell screen applies elbow preferences 0.5/1.0 to curves 0.10/0.15 m
with the retained chamber and duration. Seven miss completely. The left 0.10 m curve with
full preference makes three contacts, while its right counterpart misses; it fails bilateral
repeatable contact admission. All remain upright and return without failures. Full rows
are in [the arm-preference screen](combat-hook-lane-arm.json.gz).
