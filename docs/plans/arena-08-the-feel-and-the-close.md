# Arena 08 -- the fight, the documents, and the close

**Status:** ready once session 07 has passed every control drill. Closes the topic.

Sessions 05 and 06 prove that input reaches an independently controlled hand. Session 07
proves that the owner can deliberately place guards and name repeatable cuts against a
neutral body. This session asks the harder question in the owner's original words: **does
it control well in a fight?** It then moves the plan's knowledge into durable documents
and deletes the plan set.

## The controlled body remains legible

The diagnostic shell built in 07 remains available during a fight and answers:

1. **Whose body am I?** The controlled side and primary/off-hand authority are named.
2. **What did I ask for, and what did the body achieve?** Desired and achieved hand
   markers plus bearing, height, reach, effort and elbow plane. The distinction prevents
   a slow actuator being blamed on the mouse mapping or vice versa.
3. **Am I forcing the stance?** Body yaw, hip yaw, twist and step fractions.
4. **Am I still fighting?** Both health fractions and outcome, with no outcome invented
   while the fight is still being produced.

Keep it a restrained diagnostic shell. Compact carved frames, final health hierarchy and
impact art remain the concept-production topic's work.

## The foreground fight protocol

`AGENTS.md` is explicit that rendering performance cannot be measured from an automated
browser tab. Control feel is even less substitutable. Run `npm run dev` in the foreground,
own its cleanup, and record the answers rather than a screenshot.

1. Open `#/arena`. Configure Fighter with sword and shield on the left and Brute with club
   on the right, both `tactical`. Press **Fight**. The first frame must arrive immediately
   and the fight must read as live production rather than a recording appearing later.
2. Pause mid-fight with Space and resume. No elapsed pause time may become catch-up ticks,
   and no held key or powered drag may survive the pause.
3. Follow A. Zoom to the helmet, orbit, promote each eye camera and **Refit**. None may
   stage an arm command or lose the fight.
4. Return to selection. Set the left side to **you**, off hand `tactical`, right side
   `tactical`. Press **Take controls** and fight to an outcome twice in 3/4 view.
5. Repeat once with the controlled eye camera promoted.
6. During those fights deliberately perform, rather than merely observe:
   - a parked high or lateral guard that intercepts an incoming weapon physically;
   - left-to-right, right-to-left, overhead and diagonal cuts;
   - a slow cut and a fast cut whose achieved traces and impacts differ;
   - a slow probing extension and a fast thrust with the point on line, in both views;
   - a cut while advancing and the same cut while retreating;
   - a body turn while keeping the same stored arm target; and
   - a camera orbit followed by a cut, with no weapon jump at the transition.
7. Record foreground frame time against
   [the arena matrix](../performance/v2-arena-matrix.md), which still owes rows to a
   person. This is performance evidence, not the control verdict.

**Only the owner's answer to steps 4 to 6 closes this topic.** A green suite proves that it
runs; the neutral drills prove that gestures are reproducible. Neither proves the fight
is enjoyable. If the answer is no, record exactly what reads wrong and insert a session
before this one. Do not lower the drill bar or delete the plan files.

Findings must distinguish at least these classes:

- **Mapping:** desired marker or classified path is not what the hand intended.
- **Actuator:** desired path is right and achieved hand cannot follow it.
- **Camera:** the hand is controllable until follow/orbit/first-person changes the view.
- **Footwork:** deliberate body turning produces a surprising forced step or stall.
- **Feedback:** the physical result occurs but contact, injury or ownership is illegible.
- **Cadence:** success disappears when recorded human commands are thinned to policy
  cadence.

The first, third and feedback findings can extend this browser topic. An actuator,
footwork or other mechanics change is a different measured session and predicts the
appropriate hash moves before code is edited.

## The durable documents

Seven implementation sessions changed the browser's shape. Each result has one durable
home:

| what | where |
|---|---|
| streaming transport, fixed-time controlled drive, input messages and chunk-relative indices | `docs/reference/worker-protocol.md` |
| the arena's selection/fight phases, owned camera, pointer-lock lifecycle and three disjoint input claims | `docs/architecture/browser-runtime.md` |
| human body/arm composition and the browser replay recorder still owed | `docs/architecture/policy.md` |
| the arena config at layout 3 and its refusal table | `docs/reference/articulated-abi.md` |
| what a human hand may ask for, relative-delta conversion, the extension channel and its encodable envelope, physical minimum reach and signed elbow plane | `docs/reference/embodied-command-v1.md` and `docs/design/combat.md` |
| fixed-refresh proof, chosen feel constants, desired/achieved traces, drills, cadence control and owner verdict | `docs/performance/arena-human-control.md` |

Specific corrections that must not be missed:

- `docs/architecture/browser-runtime.md`'s sentence that the arena "needs an input path
  that exists in no layer" became past tense in 05. Rewrite it rather than deleting the
  history of why the path exists.
- **There is one inward command buffer, not two**: `embodied_command_ptr` at
  `crates/web/src/lib.rs:6033`. The articulated one went with its model, so an instruction
  to tell the two apart is an instruction to look for something that is not there. The
  inward-buffer paragraph names that single buffer and **keeps it documented distinctly
  from the outward frame publication**, which is the distinction the paragraph exists for;
  losing the inward/outward split along with the plurality would be the wrong repair. Do
  not describe a deleted model in the present tense.
- The control document must say keyboard body, a primary-drag cut and a secondary-drag
  extension on the relative mouse hand, and camera-only middle/wheel. A sentence saying
  "the pointer aims the body" -- or one still giving the camera the secondary button --
  is a stale copy of a rejected design and `rg` must find none.
- The worker reference must say 60 simulation ticks per second independent of rAF. "One
  tick per input frame" is the rejected refresh-rate bug and must find none outside the
  correction record.
- `ARM_MIN_REACH_RAW` has one Rust owner and a wasm capability export. Durable prose must
  not introduce another literal quarter as though the client owned it.

## Names, after the topic that renames them

The embodied fight's session 06 drops `Articulated` out of every surviving name and
collapses `CommandGrammar`. Every identifier in this plan set was first surveyed at
`b0fc80a`, before that rename landed -- **and the whole set was trued up against the tree
at `81bdf6f`**, which is when the rename and the deletions it rode in with had landed:
every path, line and symbol re-checked, thirty-five moved line numbers corrected, two
citations rewritten around types that no longer exist, and the stale spellings replaced.
So a session does not owe the bulk of that work again, and `81bdf6f` is the commit to diff
against when asking how stale these files have become since.

**The discipline survives the pass that discharged it, which is why this section stays.**
Re-anchor names and line numbers against the tree you actually open on, and do not trust a
citation because it is written down: these were accurate when written and wrong within
five commits. This close verifies no durable document restores a superseded name.

## The close

1. Confirm every row of the durable-document table has landed.
2. Record the owner's answer to the fight protocol in
   `docs/performance/arena-human-control.md`, in their words, with every complaint assigned
   to mapping, actuator, camera, footwork, feedback or cadence.
3. `rg` for the two rejected contracts: pointer-derived body yaw and one-tick-per-rAF.
   Only the historical correction paragraphs may remain.
4. Delete `docs/plans/arena-*.md` -- the overview plus sessions 01 through 08, nine files.
5. Repoint the roadmap links in `AGENTS.md`, `README.md`, `DESIGN.md` and `docs/README.md`
   at the next live topic, respecting `checkDurablePlanAuthority`.
6. Say in the commit message which knowledge moved into which durable document.

## Acceptance

1. The owner can deliberately guard, cut in named directions, vary achieved blow speed,
   move the body independently and transition cameras during real fights against
   `tactical`.
2. The owner has answered *does it control well?* in a foreground browser, and the answer
   is recorded in their words with any finding classified by cause.
3. The controlled body, desired hand, achieved hand, stance and health remain legible with
   the diagnostic overlay on, and the fight remains playable with it off.
4. `node tools/check_docs.js` is green, with no durable document describing the rejected
   coupled-yaw or refresh-rate-dependent contracts as current behavior.
5. All nine `docs/plans/arena-*.md` files are deleted and the four roadmap links repointed.

## Hash expectations

**Nothing moves.** A final play pass, prose and plan deletions do not reach authoritative
state. If a mechanics session was inserted because 07 or 08 found one necessary, that
session owns and predicts its own hash movement before this close resumes.

The browser goldens that once caught accidental authoritative changes are retired, so the
client suites, both wasm checks and `EMBODIED_CORPUS_DIGEST` are the automated cover worth
naming here.

## Verification

```powershell
cargo test
cargo test -p sim -p lab --features cartesian-recoil
cargo build --release
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_CARTESIAN_RECOIL=1; node --test tools/wasm_check.js
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --seeds 200
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
npm run dev        # foreground: run the fight protocol, record the verdict, stop and verify the port is free
```
