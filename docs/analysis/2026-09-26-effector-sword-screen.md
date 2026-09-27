# Revised sword proposal screen, 2026-09-26

The stationary endpoint gate passed, but the revised proposals still were not selected in this
early-bout sword screen. Keep the effector channel off. This does not invalidate the actuator
repair; it distinguishes reachable requests from requests that help win a bout.

Harness: Node/Havok bout runner through `research/headroom-worker.mjs`, supported human warrior,
one corner-swapped seed pair per cell, six simulated seconds, two worker lanes. Source is
`9a320286`; the snapshot repair, endpoint fallback and revised proposal defaults are all included.

```powershell
node research/headroom.mjs --exp channel --channel effector --bodies human-warrior --pairs 1 --lanes 2 --max-seconds 6 --tag attainable-sword-screen
```

All six bouts completed in 257 wall seconds while the stance study shared the machine. All ended
as time-cap draws. Target-bearing frame share was zero in every bout.

| Cell | Bouts | Mean subject bar margin | Target frame share |
|---|---:|---:|---:|
| channel expert vs original expert | 2 | 0 | 0% |
| channel expert vs human duelist | 2 | +0.000157746 | 0% |
| original expert vs human duelist | 2 | +0.000166178 | 0% |

The channel-minus-ruler margin difference against the duelist is -0.000008432 bars. One seed
pair at a six-second cap cannot support a full-bout effect estimate. The two original-expert
controls retain exactly the initial screen's same-seed vitality, outcomes and durations.
The compact record is `research/results/2026-09-26-effector-attainable-sword-screen.json`.

Next: measure the motion and candidate scores in contact-capable start states. The final hold
gate says nothing about cutting speed, edge lead or useful timing. Do not spend on a full-length
sword headroom campaign merely because the endpoint now arrives.

## Reporting correction

Adding bounded screens exposed a report defect: `command-surface-report.mjs` selected the first
matching policy label across all directories. Repeating a label after changing its proposals could
hide one run; using a short screen's ruler as a full run's control could compare different caps.

The report now keeps each run separate, prints the cap, prefers its own ruler, and allows an
external control only when its cap, settling, locomotion mode and harness match. Multiple external
controls are ambiguous unless `--ruler-run` names one. Head-to-head cross-run comparisons use the
same protocol check. `--include` selects run-directory suffixes explicitly, for example:

```powershell
node research/command-surface-report.mjs --include stance,stepadd,ruler --ruler-run ruler
```

The report also includes target frame share, speed and force. Effort means exclude bouts that
never used a target; absent measurements remain unavailable rather than becoming zero. Matching
protocols alone do not prove unchanged physics or policies: the named runs still need their
neutral-equivalence evidence. Four report tests and four caught mutations cover side attribution,
missing effort, run identity, control ambiguity and protocol boundaries. Reporting changes do not
alter simulation or search.
The full suite passes 1,081 tests; typecheck, production build and line-ending checks pass.
