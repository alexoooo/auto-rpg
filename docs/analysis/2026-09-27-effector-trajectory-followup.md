# Blade trajectory follow-up

2026-09-27. This extends the forced target screen in
`2026-09-26-effector-impact-screen.md`. It asks whether rotating the anatomical hand or drawing it
into a chamber before a sweep can raise the scored energy of the blade's contact. The experiment
changes plans in the Node/Havok harness only; the expert proposals and game defaults are unchanged.

Every trial uses the same equal-human, left-corner, seed-11/22 state after 0.75 s of normal shadow
policy commands. One legal `Program` then runs for one second. All 64 rows have the same warmup pose
hash and write a primary-hand task target. Reports count actual contacts and blocks from that hand;
energy and edge readings below are from the strongest **unblocked body** contact. They are scored
contact readings, not a free-stroke or weapon-tip speed estimate.

| Screen | Cells | Strongest body contact | Pre-armour wounds |
| --- | ---: | ---: | ---: |
| Hand tilt, roll and ending sweep bearing | 36 | 3.46 J | 0 |
| Two-phase chamber then sweep | 13 | 6.25 J | 0 |
| Rotate the strongest two-phase plan | 15 | 6.25 J, unchanged | 0 |

The earlier strongest single sweep was 3.31 J. Holding its 0.3 s duration, low mark and 0.95 reach,
the best orientation cell, tilt 0, roll 0 and ending bearing -0.5 rad, reaches 3.46 J. A 0.3 s
chamber at 0.45 reach and 0.8 rad outboard bearing, followed by a 0.3 s extension to 0.95 reach
and a sweep to -0.5 rad, raises the contact to 6.25 J. The two segments have the same commanded
reach and bearing at their boundary; the task actuator still enforces anatomical limits. The best
contact closed at 2.96 m/s, with edge alignment 0.404, blade alignment 0.319 and a 0.357 m tip
distance. Its scored kind was `weak`. The existing cut floor is 10.62 J, and pre-armour damage was
zero. Rotating the chamber and sweep together by the sampled tilt/roll angles did not improve it;
those other rotation cells produced no unblocked body contact in this state.

This is a local mechanism result. It neither shows task-space headroom nor rules out a useful
trajectory in a different engagement, corner, weapon orientation or opponent response. In
particular, the orientation rotation changes the requested carried-tip pose as well as edge lead,
so a missing body contact is not evidence that an aligned edge cannot cut. There is no candidate
here strong enough to promote to a full expert headroom run or to turn the channel on.

Evidence: `research/results/2026-09-27-effector-trajectory-screen.json` stores every plan and its
contact reading; `research/effector-orientation-screen.mjs`, `research/effector-chamber-screen.mjs`
and `research/effector-trajectory-report.mjs` reproduce it. The physical regression test compares
the identical warm states and confirms the chamber's measured change; three deliberately broken
chamber variants fail it. The current code gate is recorded in the handoff.
