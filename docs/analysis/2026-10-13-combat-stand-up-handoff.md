# Combat actions and stand-up implementation handoff

The owner requested both plans, combat actions first, with sub-agents, then asked to wrap up for
continuation on another computer. Do not start another implementation or measurement chunk as
part of this handoff. The locomotion work was fetched and merged as `cee7aae2`, including
`5719a9d4` and `e4afca39`; its code and documentation are preserved.
The implementation is committed as `ef94828a`, on top of the earlier protocol/readings commits
`8ee3dc31` and `bac07654`. The completed combat plan has been deleted.

## State of the work

Discrete combat actions are implemented: named actions and executor registrations, the
prepare/commit/release lifecycle, resource ownership, post-physics contact attribution and bounded
ledger, shared selectors and approach, identity-based game orders, migrated presets and reptile,
Lab/editor/inspector, research callers and tests. The old slot arbitration and tactics wrappers
are removed. Contacts and damage remain separate. Historical preset rankings are labelled as
historical; they were not remeasured.

Stand-up is **not physically successful or complete**. New ground readings, the Lab scenario,
placement/clearance, research bed/search, technique contracts, graph, supervisor and experimental
Stand up/Get away/Fight on the ground are implemented. These are selectable experiments, not
qualified replacements. Existing recovery defaults, character strength, Balance, and Crypt
fall-ending rules remain unchanged. Grit is not implemented. The frozen acceptance ref and
evaluator are untouched.

The original stand-up plan remains the authority:
[2026-10-13-stand-up.md](../plans/2026-10-13-stand-up.md).

## Physical results and limits

All figures here use the Node stand/core World/Rapier at 120 Hz, Balance 0 and no surge.

- The support-recovery reference bed has 324 disturbance cases on Warrior/Rogue/skeleton,
  empty/club, seeds 1–6. Eight complete, none within 6 or 12 seconds. There are only 139 actual
  takeovers: 175 shoves do not cause takeover within the observation window and ten drop draws
  are geometrically rejected. The eight completions take 21.15–28.75 seconds. Do not call this
  an 8/324 success rate on falls. Recorded assist impulses are zero.
- Experimental Stand up's separate owner target has **0/64 verified recoveries**, 0/16 in each
  group, with all cardinal directions failing. Every case takes over; the failure-capped median
  is 30 seconds. Assist impulses are zero. Roll completes 85/394 attempts, plant-up 0/187, sit-up
  0/33 and roll-back 7/51. A technique attempt is not a completed recovery.
- The two fixed searches each have an absolute budget of 34,560 episodes. No successful route
  has been found in their completed generations, including raised-strength stages so far. This
  does not establish anatomical impossibility or a required strength multiplier.
- Some search starts are geometrically rejected, especially Rogue's last waypoint. Rejections
  count against the budget and are candidate-independent. A separate geometry-only check found
  all 64 proposed hard-transition bar starts valid (16 front + 16 fours for each body); it is
  not a recovery measurement. The hard bar has not been run.
- A predecessor-harness error was corrected: it formerly skipped the candidate after a failed
  roll and charged predecessor time against the candidate clock. It now runs from every actual
  terminal predecessor state, including imperfect ends, with separate bounded clocks and no
  pose reset. Warrior's completed old predecessor stage is invalid evidence. Rogue's three old
  predecessor generations (288 cases) and 96 abandoned in-flight cases remain charged. The
  correction record and earlier checkpoints preserve this history; do not reset the budget or
  count those results as valid rise trials.

## Held work: do not mistake it for landed behavior

The transfer archive contains candidate16 Get away/roll-back patches and its real physical
handoff fixture. With a foe initially 1 metre away, it reaches 2.643 metres and transfers to
`stand up: flatten.flatten` at 19.017 seconds. It still records four failed return rolls and three
front completions. This proves limited separation and ownership transfer, not a working
alternating-roll technique or a rise. The patches are not applied. Its imported paths have been
adjusted to run from the archived directory under `research/runs/2026-10-13-wrap-up/`.

A mirror implementation for plant-up/sit-up/post-up is also held, not applied. Left-side operation
order is preserved; right-side postures, support shares, lead foot and posted hand are swapped.
Mirrored registry entries remain gated on their own physical bed. The current registry offers
only the sides already exercised; do not advertise helper functions as verified mirroring.

Get away's current `wants` retains any down body while active to survive transient `between`
readings. A follow-up must narrow this to lying/turnover states without losing safe yielding;
the plan gives one-foot and kneeling positions to Stand up.

## Verification

- TypeScript and browser build pass on the merged implementation. The build has the existing
  large-chunk warning.
- The final merged fast gate passed **805 tests, zero failures, two existing TODOs** (807 total).
  The relocated walking test also passed separately in 2.67 seconds. Do not confuse an
  interrupted pre-merge run with this completed gate.
- Arena fork: 6/6 pass, including real hits, clashes, severance, verdict, fresh-world replay and
  negative omitted-state controls. Its fixture explicitly overrides the supported sever margin
  to zero so a real fatal head blow exercises detachment; it does not inject damage.
- Contact/action instances: 12/12 pass, including exact whole terminal records and a real loaded
  contact fork with negative episode/aggregate omissions. Real target loss in preparation and
  commitment passes without substituting a nearer decoy.
- The physical walking-to-kick fixture passes: admission while actually walking, braking under
  ownership despite continuing walk intent, quiet loaded support, commitment, return, and
  restoration of the default gait. It is in `tests/kick-walking.test.mjs` so the other native
  cycle fixtures retain their small-file fast-test budget.
- Named allocation/composition checks pass. The action feature increases allocations: five
  fresh-process fixture reads give a standing maximum of 111.691 KiB/body/step and bout maximum
  240.928. The existing 25% margin gives ceilings of 140 and 302; down remains 206.
  `docs/reference/step-cost.md` records the increase and the allocation-only refactor's unchanged
  fingerprints. This is not a claim of unchanged feature cost or a timing improvement.
- Lab routine/targets pass (12 passes, three existing TODOs); impossible preparation is now an
  explicit bounded stall. Lab ground tests include one attempt per restart and a genuine failed
  predecessor feeding the next technique. The real `strike-bouts.mjs` worker CLI ran an 8-second
  bout and consumed the neutral action/ledger interface successfully.
- Built Attack and On the ground pages were briefly inspected in a visible browser. The preview
  server was stopped by its own PID; the owner's port 5180 was not touched. Three 30-second Crypt
  seed runs remained playing but produced no contacts, so they are not a combat qualification.

No full `test:all` or frozen evaluator run was requested or claimed. The owner's visual judgment
of recovery and any assisted effort remains outstanding.

## Continue in this order

1. Read the final checkpoint/transfer status below, unpack the transfer archive, and install the
   locked dependencies with Node 24.15.0 and `npm ci`. Keep outputs under `research/runs/`.
2. Finish only the remaining fixed-budget searches, preserving CMA state, RNG, charged abandoned
   cases and exact source provenance. A current-stage source hash mismatch is intentional: use
   the supplied snapshot materializer, not a relaxed hash check. Raw source bytes matter across
   machines with different line endings.
3. Run the unchanged hard bar after both budgets finish: plant-up from 16 valid front and 16
   valid fours starts per body, Balance 0, six-second reached limit plus two-second survival.
   Do not substitute a waypoint after the hard transition. Report a stall honestly if either
   body misses 12/16 in either group.
4. Complete the held-out everyday comparison (seeds 7–12) for both candidate and support-recovery.
   Keep no-takeover shoves and rejected drops separate from actual falls. The completed target
   failure is already recorded and must remain visible.
5. If the fixed-budget hard bar stalls, write the plan's report before the conditional help
   work. Grit is a separate metered joint-torque assist, default zero. Preserve sourced
   `strength()`, clear requests every control step/idle/takeover, distinguish grants from
   delivered torque, and include the explicit granted capacity in the opted-in servo/bearing
   solve. Merely raising driver caps leaves the solve saturated at the old limit. The tendon
   branch needs its own-capacity accounting. A failed raised-strength search gives no measured
   factor to prescribe. Root pushes require the stricter support/extension/effort gates in H.
6. Qualify the other route, mirrors, escape and fight-to-rise on their own evidence. Promote
   defaults and change Crypt fall rules only at the plan's gates. Nonzero character Grit or
   Balance is the owner's later decision, supported by a concrete smallest-help report and eye
   gate. No helped result satisfies the unassisted or frozen goal.

## Transfer and final checkpoint status

All search/bed/archive processes are stopped. No validation runs were launched. The owner
explicitly chose checkpoint-and-stop; each search charges one allocated but unfinished
96-case generation inside its unchanged cap, and preserves its optimizer state and pre-stop
checkpoint. These are charged allocations, not claims that every episode completed.

| Search | Charged | Remaining | Checkpoint |
|---|---:|---:|---|
| Warrior | 22,464 | 12,096 | stage 7, strength-3, generation 13 |
| Rogue | 10,848 | 23,712 | stage 2, predecessor, generation 31 |

The candidate everyday bed is **159/324 cases, incomplete**, with zero completed hand-backs in
those rows. Stopping its queued validation shell also eventually ended its current child during
execution-session cleanup. Its JSONL rows and metadata are preserved; there is no completed
candidate report and no valid paired superiority claim. The bed CLI does not resume partial
JSONL files: use a new output path when rerunning it, keeping the partial record intact.

The portable archive is [research/checkpoints/2026-10-13-ground.zip](../../research/checkpoints/2026-10-13-ground.zip).
It contains checkpoints, exact historical source blobs, baseline/target/partial-bed results,
correction history, held mirror and escape work, and a validated snapshot materializer.
Large unchanged vendored files are supplied by the matching Git checkout, not duplicated.
The archive has 70 files, 1,193,335 bytes, and SHA-256
`11e4453820c83c476ed9ab5b502bd00a955509257ee6c33c06ead144c7d442e6`.
The two active checkpoint runtimes have complete, hash-verified source reconstruction. Some
older diagnostic/reference manifests name source bytes that were not retained; the archive's
manifest lists any such historical gaps explicitly. Their measurements and hashes are retained,
but do not claim full exact-source replay for an incomplete historical manifest.

On the receiving machine, from the repository root:

```powershell
npm ci
Expand-Archive -LiteralPath research/checkpoints/2026-10-13-ground.zip -DestinationPath research/runs/2026-10-13-wrap-up
node research/runs/2026-10-13-wrap-up/resume-snapshot.mjs --checkpoint research/runs/2026-10-13-wrap-up/rising/warrior.json
node research/runs/2026-10-13-wrap-up/resume-snapshot.mjs --checkpoint research/runs/2026-10-13-wrap-up/rising/rogue.json
```

Read the extracted `README.txt`, then run the commands each materializer prints when ready to
continue. Materializing source does not start a search. Each search resumes in an isolated exact
runtime and leaves current production code alone. All its remaining stages use that recorded
snapshot, with the model's own CMA/RNG and remaining allocation. Do not weaken the source-hash
check or run two writers on one checkpoint.

Generated logs and probes are now under ignored `research/runs/2026-10-13-wrap-up/`; the root
`.snap` directory and all generated root files have been removed by moving their contents there.
The search's default output was changed to `research/runs/rising/warrior`. Start future logs,
probes and experiment outputs under `research/runs/` as well.
