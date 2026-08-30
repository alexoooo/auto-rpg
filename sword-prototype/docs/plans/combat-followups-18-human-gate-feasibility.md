# Session 18b -- point the promotion instrument at a person

## Status -- software complete, human sitting open (2026-08-30)

The shared label-free recorder, gate formatter, immutable 61-assignment protocol, autosave/resume
flow and **Guided playtest** UI are implemented. Their contract is durable in `docs/design.md`,
their implementation is in `src/playtest.ts`, and their measured construction evidence is in
`docs/measurements.md`. No official human row or gate-feasibility verdict exists yet. This file owns
only the person, readings and decision; the completed recorder plan was removed.

## Outcome

Measure whether a competent person can reach the exact engagement gates that will judge every
research artifact, in the visible harness the person plays. Then settle the open feel questions
while the game is still free to change. No compute rung is authorized until this lands.

The reason is measured: the scripted specialists reached 0.2282 opportunity-attack and scripted
meta reached 0.2031 against the frozen 0.65 gate. Nothing has shown that the gate is reachable. A
month of search is the wrong way to discover that a human cannot produce the target behaviour.

## Player procedure

1. Click **Guided playtest** on the ordinary Setup screen. Do not use DevTools, enter seeds or
   rebuild matchups manually.
2. The UI runs one excluded shakedown, then four human repeats on both sides of six cells (48
   official human rows), then one page-specialist control on both sides (12 control rows). Every
   assignment faces Warrior/sword+empty/Swinger. The scheduled human is honestly labelled
   `human+idle-spare`; `F` changes which hand is driven.
3. It is interrupt-friendly. Exit between bouts and reopen to resume the same assignment. Reloading
   mid-bout records an explicit abort and retries instead of advancing.
4. At completion use **Copy results for Codex** or **Download report**. Preserve all rows, aborted
   attempts, missing assignments, focus/frame evidence and feel answers; do not trim bad bouts.

The page and headless harness are known to differ by about 9% on one arm transient, and page clock
can run ahead of simulated motion during frame drops. Every table must name its harness and retain
frame/focus integrity. A page human row is compared first with the page specialist row, never
silently with a bench baseline.

## Readings

Take and record three exact sets under one dated heading in `docs/measurements.md`:

- human in the page harness, over every official assignment;
- specialist control in the page harness, over the identical cells;
- specialist control in the bench harness, re-derived on the same build.

Report the page-to-bench offset for every gate. If that offset is larger than the margin being
judged, the result is an instrument finding and the player verdict for that gate is inconclusive.
Use the shipped shared formatter for achieved value, threshold, signed margin and pass/fail; do not
recalculate a fourth version in a spreadsheet.

## Feel questions to settle in the same sitting

- fixed-camera body-relative aim, both zoom clamps and the full Fixed/Overhead side/hand matrix;
- walking/crouching material comparison and the 0.08-versus-0.3 corpse-strength pair;
- blood scale, bow draw under pressure and in-flight arrow-trace readability;
- axe play including its absent thrust;
- shield and buckler interception at the predicted arrow crossing;
- the now-playable `sword+axe` loadout and the 14.2-point duelist swing result.

Any changed number in `src/config.ts` needs its measured before/after table beside the constant.
Qualitative comments stay qualitative.

## Decide

Give every gate exactly one evidence-backed verdict:

- **Reachable and discriminating:** the person clears it and specialists do not; retain it.
- **Reachable but trivial:** both clear it comfortably; retain it but never cite it as binding.
- **Not reachable:** a competent person cannot clear it where specialists fail; correct it now,
  before any research run, and record exactly what the replacement measures.

If focus loss, frame integrity or harness offset prevents a comparison, record **inconclusive** and
repeat only the affected assignments. Do not convert missing evidence into a failure or a pass.

## Accept

- The exported report validates against the frozen protocol and accounts for all 60 official rows
  plus the excluded shakedown and every abort.
- Human/page-control/bench-control tables name their harness and include signed margins.
- Every gate has one verdict above, or a named inconclusive reason with owed assignments.
- Open feel findings and any tuned constants are recorded durably.
- `npm test`, `npm run check` and `npm run build` pass.

This session is person-run by construction. Automation may validate a supplied report but cannot
manufacture the human rows or substitute a hidden browser screenshot for play evidence.
