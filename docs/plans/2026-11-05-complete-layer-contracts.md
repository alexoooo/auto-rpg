# Complete layer contracts and invariant ownership

## Goal and scope

Make the declared boundaries hold in the code that builds, runs, saves and reads a bout, with the
simplest general rule at each owner. Generality means any valid body and any Option work through
the same code: a body keeps its declared identifiers and capabilities through the whole stack, and
no control path assumes one body's anatomy. Each owner validates what it consumes, saves what it
retains and disposes what it owns.

The [fresh audit](../analysis/2026-11-05-fresh-layer-boundary-audit.md) supplies the failure recipes;
its [file ledger](../analysis/2026-11-05-fresh-layer-boundary-files.md) the producers and consumers.
All 56 confirmed findings and six open questions are closed here, each by its simplest correct fix.
A violation exposed along the same path is fixed in the same work.

## Design rules

- **The simplest rule that holds.** No protocol, capability declaration, compatibility check or
  extension hook for a consumer that does not exist. A role with one provider is scoped to that
  provider; it opens when a second provider needs it. Removing code beats guarding it.
- **Reuse what exists**: owner predicates, `deepFreeze`, `constructionScope`, `workerJobs`. Share a
  helper only where real consumers share a rule.
- **Resolve configuration once at its owner**; admission and execution read the same resolved
  settings. An unsupported input is a named refusal returned before allocation; a defect stays a
  throw, caught only at a reporting boundary with its message.
- **Body identifiers are opaque to general code.** Control reads what the body declares, never a
  stock name.
- **Durable values live in the owner's state object**; shared constants are frozen when published.
  Change detection compares values, not producer identity.
- **Missing, faulted and unreached work stays explicit** through every reader.

## Work ownership

| Work area | Confirmed findings |
| --- | --- |
| Body generality | FF03, BH-01, BH-03, BH-05, BH-15 |
| State and immutable values | FF01, FF04, BH-02, BH-10, BH-12, BH-14, EVD-005, APPF-004 |
| Admission and geometry | FF02, FF07, FF10, BH-06, BH-07, BH-08, BH-09, BH-11, BH-13, APPF-009 |
| Lifetimes | FF06, APPF-001, APPF-005, APPF-006, APPF-007, APPF-010, EVD-004, EVD-006, TOOL-001, RF01, RF02, RF05 |
| Evidence | BH-04, EVD-001, EVD-002, EVD-003, EVD-007, EVD-008, APPF-008, RF03, RF04, BR-06 |
| Research callers | BR-01, BR-02, BR-03, BR-04, BR-05 |
| Small corrections | FF05, FF08, APPF-002, APPF-003, TOOL-002, DOC-001 |

## Order

1. **Trust and hangs**: FF01, BH-11, BH-10, then EVD-001, EVD-003 and EVD-008, so later readings
   and table cells can be believed. These need no training or broad run.
2. **Body generality and state**, which later admission and evidence fixes read.
3. **Admission, lifetimes, research callers** in any order; one active editor per shared file.
4. **The remaining evidence fixes** against the corrected facts.

Small corrections land whenever their file is open. [Option Mind control and
evidence](2026-11-03-option-mind-general.md) owns skill behaviour and its paired readings;
[Option Mind's speed](2026-11-04-option-mind-speed.md) and the roadmap's
[framework](../roadmap.md#framework) allocation goal own storage rewrites. Skill training stays in
[its own plan](2026-11-03-options-training.md).

## Body generality

- **FF03**: `partRequirements` uses the open `Requirement` type.
- **BH-01**: support resources come from the bearing chain the body declares, not from an optional
  foot effector. A body with feet and no foot effectors assembles its skills.
- **BH-03**: a resource carries its kind (segment, service, pose channel), so any segment name is
  valid. The encoding stays private to the resource compiler.
- **BH-05**: the guard and the strikes read the hand configuration names they need from the body's
  declaration and fit only a body that declares them; generic configuration commands are unchanged.
- **BH-15**: the percept and prediction roles are declared as the profile model's own, typed on its
  `Seen`. No generic input protocol.

Check: a stock fighter with its foot effectors removed, and one with a segment named `assist`,
assemble and stand; a hand declaring only `neutral` gets a named guard refusal.

## State and immutable values

- **FF01**: the physics save digest includes gravity and rate; a mismatched load is refused before
  anything changes.
- **FF04, BH-14**: completed equipped specs and the roll poses are deep-frozen before they are
  cached or exported.
- **BH-02**: skill assembly constructs each configured aim once and roots its state in
  `Skills.state`, on the default path too.
- **BH-10**: effector-goal equality lives with `EffectorGoal` and compares every field. Stomp, effector
  strikes and paw legs set `unbend`, `firm` and the moving frame, so this can change behaviour: name the moved fingerprint cases and read the affected skills paired.
- **BH-12, APPF-004**: the decider keeps a copy of the orders it read; the gait transport compares
  gait values, not object identity.
- **EVD-005**: the Lone, fall and Crypt scripts keep cue indices, orders and progress in their
  state objects. They gain no save/load.

## Admission and geometry

- **BH-06, BH-07, BH-08**: each part's fit resolves stock plus override and runs the same predicate
  its constructor runs (guard tuning shape, staged channels, stomp, trot, crawl and bite
  durations). Divisors must be positive; legitimate zero settings stay valid.
- **FF07**: paw fit checks the declared support point and its patch shape.
- **FF10**: joint frames reject non-orthogonal axes.
- **FF02**: capsule-to-hull and hull-to-hull clearance compute true distance (closest point;
  edge-cross-edge axes for hulls, as the box branch already does).
- **APPF-009**: a zero-length capsule draws as a sphere.
- **BH-13**: a fallen body's footprint takes its height from its observed segments.
- **BH-11**: a zero attainable pace gives no walk option; sampling is bounded by the decision
  horizon for tiny paces too.
- **BH-09**: a zero-length failed trial reads as a failure with a finite rate.

Check each with the audit's recipe: the supported side runs, the unsupported side returns its
reason before allocating.

## Lifetimes

- `try/finally` for one resource, `constructionScope` for several: core body construction (FF06),
  Duel and TeamBout (APPF-006), technique trials (EVD-006, which also checks its predecessor
  first), the learning environment (RF05, which checks save/load before calling them), the browser
  benchmarks (APPF-010), Dungeon warming (APPF-007) and worker startup (APPF-005).
- Host disposal attempts every stop even when one post throws (APPF-001).
- Worker pools settle every job once on any failure and reject work after close. Research and
  tooling pools (RF01, RF02, TOOL-001) move onto `workerJobs` rather than each gaining its own
  handling; evaluation lanes (EVD-004) stop every worker before rejecting. Lane counts are
  validated before scheduling.

Check: acquired equals disposed and submitted equals settled after a failure following a completed
sibling.

## Evidence

- **EVD-001**: a subject is normalized once with its body restrictions and attributes; every
  adapter, `recordedSubject` and the previous-subject path read that. Old records lacking those
  facts are incompatible.
- **EVD-002, BH-04**: code identity follows a subject's declared parts and the selected aim's data,
  not a list of known prefixes.
- **EVD-008**: `readRecord` validates whole rows; one shared indexer checks duplicate agreement for
  the CLI, history pools, Ratings and Arena reels.
- **EVD-003**: a cell is met only with all its protocol's case keys present and passing; partial
  records merge and their missing cases are played; fault rows count as failed coverage.
- **EVD-007**: Cover records that the attack was attempted; a fixture that never attacks reads as
  unreached.
- **RF03**: a combat run refuses publication when the source fingerprint differs from its record's.
- **APPF-008, RF04**: report the measured worker cost and the engine actually built; no zero-step
  division.
- **BR-06**: locomotion pairing keys on every scenario field, hold and duration included, and
  refuses duplicates.

## Research callers

Posture and stance-envelope paths resolve from their real directories (BR-01, BR-03); the posture
handover reads `body.built.spec` (BR-02); the locomotion tools look feet up by end id and convert
to a side only for bilateral signs (BR-04); recovery searches report errored trials instead of
scoring them (BR-05). Check each with a bounded run to its first handover or landing.

## Small corrections

`UpReadOnly` returns a frozen vector (FF05); senses key bodies in a `Map` (FF08); the reply ring
takes its offset modulo capacity in BigInt (APPF-002) and completion waits compare with wrap-aware
sequence arithmetic (APPF-003); the unused geometry-tool exports become private (TOOL-002); the
isolation worker cites `src/app/browser/isolate.ts` (DOC-001).

## Open questions

| Question | Resolution |
| --- | --- |
| Q-ALLOC | Moves to the roadmap's framework allocation goal; no change here. |
| Q-REQUIREMENTS | Each technique declares only the capabilities it reads; inert landing and pose-only modes declare no support reference, so recovery does not require the support it restores. |
| Q-MOTOR | No capability declaration on the motor factory. Where a stock motor lacks a goal a recovery path requests, that skill's fit refuses the body. |
| Q-GAIT | Deduplicate gaits on their complete configuration; remove the `runs` deletion if walk/run continuity holds without it. |
| Q-DATA | The data store deep-freezes what it publishes. |
| Q-CONTACTS | Closed: contacts describe the last completed interval, and the audit found no defect against that. |

## Completion

Each landable change names its findings, its checks and any moved fingerprint case, and runs the
[gates its change requires](../../AGENTS.md#doing-the-work). A retained test is added only for an
observed regression lacking coverage, and is listed in the [test inventory](../../tests/README.md).
Behaviour changes get paired readings of their affected cells; skill claims need watched drills.

Done when every finding is closed in the code, the architecture describes the resulting contracts,
and the gates pass. Commit each change on main without pushing; delete this plan and the audit
documents when the work lands.
