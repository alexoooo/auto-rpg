# Skill ceiling: handoff, 2026-09-26

The skill-ceiling plan set (`docs/plans/2026-09-25-skill-ceiling-00..09`) was being run
unattended by Claude Code. That session was wound down here on the owner's word, and this file is
what the next agent, Codex, needs to carry on. Read `AGENTS.md` first: its traps and house rules all
apply.

## Continuation, 2026-09-26

The original wind-down landed at `597ecf36`, including both WIP merges. References below to
`4a33b10a` as main and to unmerged branches describe the earlier checkpoint.

The browser channel switch is now implemented: `?play=arena&channels=stance,step`, or the same
with `play=dungeon`. Its opt-in panel applies changes by navigation before bodies are constructed;
`channels=` switches everything off. No shipped defaults changed. Existing policies do not use
the new channels merely because they are enabled, so the expert eye check still needs a
browser-compatible preview. No long-running research jobs were resumed in this continuation.

The first task-space actuator is also implemented behind the off-by-default `effector` flag:
the anatomical hand with blade, fist or mace, world endpoint and hand orientation, bounded
speed and force, including exact-fork state. Stone/skeleton task actuators,
forearm shields, paired grips and expert proposals/headroom still remain. The bench and exact scope
are in `docs/analysis/2026-09-26-effector-target.md`. The original open lists below are retained as
the wind-down record; read this continuation first.

Validation: 1044/1044 tests, check and build; four deliberate breaks caught by the new URL tests.
Arena and dungeon browser startup, the arena switch, and the absence of the panel on a normal
page were checked on a temporary server on 5182. That server was stopped; 5180 was untouched.

After the actuator pilot: 1051/1051 tests, check and build, eleven caught task-test mutations,
and all 15 named six-second bout fingerprints unchanged with `effector` off or on but unwritten.
The final browser diagnostic was checked again and its temporary server stopped. The evidence
is in the main checkout's gitignored `research/runs/effector-target-continuation/`.

### Completed footwork continuation

The stance and ruler runs below are now complete: 256 stance bouts and 128 ruler controls,
no failures. Stance scores 44.5 % [32.8, 57.0] on stone and 56.3 % [43.8, 68.8] on skeleton
against the ruler, at 32 pairs each. Neither passes the enablement gate; stance and step stay off.
All 31 historical ruler repeats retain exact verdict, duration and vitality. See the updated
`docs/analysis/2026-09-26-command-surface.md` and
`research/results/2026-09-26-footwork-verdict.json`. Do not resume these completed jobs or the
superseded plain-step run. Latest code validation: 1081 tests, check/build; this follow-up only
archives evidence and updates the plans. Remote main fetched again: it includes `9a320286`;
local reporting commit `4d167705` is ahead and nothing incoming requires a merge.

### Release-2 resume and directory ownership

The historical fist-family run had 18 rows, 17 unique jobs and one duplicate with identical
physical results. Its deduplicated copy completed 32/32 bouts with no failures in
`research/runs/release2-continuation/family-fists-expert`; originals are untouched. Its old manifest
needed only `flags: {}` before the unchanged schedule/build/protocol checks passed. Fists won
4/4 with the expert against each armed family build, taking 83-96 s on average; armed experts
beat the fist duelist faster and retained more vitality. Two pairs per cell make this a mechanism
screen. The updated release-2 questions and `research/results/2026-09-26-skeleton-fists-family.json`
record the result, provenance and an exact historical replay.

Mace/maul size copies have 44/34 unique historical rows with no duplicates, under the same
`research/runs/release2-continuation/` parent. Mace completed 64/64 with no failures: size 1.1 wins 93.8 %, versus 62.5 % for the x1
mirror, a paired +31.3 points [12.5, 43.8]. Smaller sizes lose heavily. Maul is now running, then
`attr-expert-v-brawler` (a manifest but no historical result rows). Run only one campaign at a time.

The headroom CLI now holds the existing `lockRun` through scheduling, appends and summary writes,
including summary-only mode, and releases it in `finally`. This prevents the concurrent writers
that produced the historical duplicate. Tests cover live-owner refusal and cleanup after a bad
resume or successful summary; both missing-lock and leaked-lock mutations are caught.

### Human arm limit continuation

`research/human-arm-limits.mjs` now separates motor-ceiling and command-rate sensitivity over
36 impact-bench cells. Doubling torque at normal rate barely changes blade/mace free-stroke
speed; armSpeed 1.5 raises it by about 14 % / 47 %. No shipped tuning changed. A further 144-cell clamp sweep finds no useful normal-rate speed gain above 8 rad/s;
the default remains 8. All 36 original cells, six human bout fingerprints and 45 command-null
bouts remain identical. Sphere overlap invalidates 12 rows in the original impact sweep. Read
`docs/analysis/2026-09-26-human-arm-limits.md` before further tuning or research.

### Candidate-score continuation

The trace now records every evaluated candidate's score terms and both final vitality bars.
`research/effector-candidates.mjs` probes 18 warmed human states and plays each winner live;
all predicted pose hashes and vitality bars match. Each best target proposal ties at zero with
an earlier legacy proposal, so none is selected. This explains these openings, not full-bout
headroom. Contacts/blocks and contact-capable motion remain to diagnose. See
`docs/analysis/2026-09-26-effector-candidate-scores.md`; 1086 tests and check/build pass.

### Expert continuation, 2026-09-26

`expert-effector@c8,h1` now proposes endpoint trajectories with orientation, speed and force,
admitted by each live hand's declaration. Warm starts preserve trajectory phase. The original
expert remains unchanged. `research/headroom.mjs --exp channel --channel effector` selects the
three supported human audit bodies, and its worker reports actual target use.

This exposed and repaired a missing snapshot record in `humanoidDuelist`: its enclosed tactics
were not restored in exact forks. Full-model expert evaluations **against that policy** need
repetition; ordinary human bouts and expert evaluations against other policies are not invalidated
by this defect. See `docs/analysis/2026-09-26-humanoid-fork.md`.

Validation is now 1057/1057 tests, check and build; ten deliberate mutations caught; the original
45 command-null bouts and six additional human/stone control bouts are unchanged. A bounded
six-second paired screening run is recorded in `docs/analysis/2026-09-26-effector-expert.md`.
It is not a full headroom verdict, and `effector` remains off. No browser preview, other task
actuators, or original stance/ruler/release-2 research jobs were completed in this continuation.
All 36 screening bouts completed: fists and maces select targets, swords do not, and no full-bout
gain is established. The incoming audio/workshop changes at `1820d219` were merged; the combined
tree passes 1070 tests, check and build.

Next: use the screening evidence to refine the task proposal family, then run full-length paired
headroom with the corrected human opponent model. Stone/skeleton task mappings, forearm shields,
paired grips remain open. Owner body/default choices remain
deferred; sessions 08 and 09 have not begun.

### Browser proposal preview continuation

The preview is now implemented: `?play=arena&channels=effector&effector-preview=soft` (also
`sweep` or `point`), with a left human contender. The opt-in panel selects the proposal and
restarts while retaining matchup/seeds. It repeats one shared trajectory over the chosen policy;
it is not an online expert. See `docs/analysis/2026-09-26-effector-preview.md` for scope and checks.
Validation: 1073 tests, check/build, 45 identical command-null bouts, identical pre/post extraction
traces for all three proposals, four caught mutations and browser startup/switch/pause checks.
All channels remain off by default; full-length headroom and the owner's eye gate remain open.

The next diagnostic found a request-mapping gap before further headroom searches: in the
stationary human proposal bench, the primary blade point finishes 888 mm from its requested
endpoint while the physical blade follows the commanded endpoint within 2.5 mm. The orientation
fallback preserves a clamped palm target, which does not preserve the carried endpoint after
orientation changes. See `docs/analysis/2026-09-26-effector-proposal-geometry.md` and its 18-cell
record. Address endpoint-aware fallback and attainable proposals before the next long search;
this does not justify stronger motors or enabling the flag.

The constrained endpoint fallback is now implemented. It includes the carried offset in a
position-only solve and accepts only improving steps within the palm envelope and joint stops.
Primary sword point error falls from 888 mm to 185 mm in that stationary diagnostic; all final
physical-following errors are under 3.3 mm. Impossible requests still miss, and several sweep
cells are unchanged. Both 45-bout null runs (flag off/on but unused), focused physical/fork tests,
five caught mutations, all 1076 tests and check/build pass. See `docs/analysis/2026-09-26-effector-endpoint-fallback.md`.
Next remains attainable proposals and a new bounded paired screen, not a default change.

The shared defaults now use shorter extension, upward hand tilt and an outboard-to-centre sweep
(reversed for soft). All 18 weapon/hand/proposal final endpoints pass a 10 mm stationary physical
gate; the largest miss is 5.63 mm. The expert explores tilt and end bearing, and older plans stay
loadable. See `docs/analysis/2026-09-26-effector-attainable-proposals.md`. This is an endpoint
result, not a combat-headroom claim. The stance run has also resumed from its saved 182/256 bouts
in the main checkout (`headroom-channel-stance`); keep that process/run separate from the new
effector screens.
Validation: 1077 tests, check/build, 45 identical null bouts and four caught proposal mutations.

The revised six-bout sword screen is complete: all six-second draws and no selected task targets.
Reachability improved, but no combat benefit is demonstrated. See
`docs/analysis/2026-09-26-effector-sword-screen.md`. The report now separates repeated runs and
protocols, and reports target use; do not mix short screens with the full headroom study.

The stance run has completed 256/256 with no failures: head-to-head score is 44.5% [32.8, 57.0]
on stone and 56.3% [43.8, 68.8] on skeleton, 32 pairs each. Neither interval clears 50%, so stance
stays off. The 128-bout ruler-versus-duelist control run is now active in the main checkout at
`research/runs/headroom-channel-ruler`; once it completes, update the command-surface analysis and
plan with the complete paired margins. The earlier wind-down instructions below remain historical.

## The owner's standing instructions

- **Keep going session to session.** The owner asked for the AI work to go on while they are away
  ("take the wheel").
- **Defer eye gates and owner-only choices.** They go on one list, "## For the owner's return" in
  `docs/plans/2026-09-25-skill-ceiling-00-overview.md`, instead of stopping the run.
- **Push `main` only when all of these hold:**
  - `npm test`, `npm run check` and `npm run build` are green;
  - `git diff --numstat` equals `git diff --ignore-cr-at-eol --numstat`, because the repo is LF and
    Windows tools write CRLF;
  - the change is one landable commit or a clean merge.
- **Fix the root cause, not the symptom.** Check the instrument and the premise before the
  threshold.
- **Every figure names its harness.** A new test is mutation-checked before it is trusted.
- **Never touch the owner's dev server on port 5180.** If you need a server, use another port and
  kill it by PID afterwards.
- **Session 07's plan has the owner choose every body and attribute change.** Do not remove a body
  or retune a shipped default without that choice. Measurements, counterfactuals and flagged
  experiments are fine.

## Where things stand

- **`main` is at 4a33b10a**, pushed. It includes the owner's own dungeon feedback work. The last
  full gate run passed: 1015/1015 tests, check and build.
- **Done and on main:**
  - release 120: 120 Hz physics, arrival contact reading, the falls and rise retune, the size law,
    arms built at guard;
  - session 01, body release 1;
  - session 02, the exact fork;
  - session 03, drills and league;
  - session 04, the reference expert `expert@c8,h1` (`tests/harness/expert.mjs`,
    `docs/analysis/2026-09-25-expert.md`);
  - session 05, the headroom audit (`docs/analysis/2026-09-26-headroom.md`, whose section 6 holds
    the 17 proposals);
  - session 06's orders half (`docs/analysis/2026-09-26-orders.md`).
- **Two work-in-progress branches, local only and not pushed.** Each has its own git worktree under
  `.claude/worktrees/`, with a real `node_modules`:
  - `worktree-agent-a2839c7b55a39942a`: session 06's command-surface half. Status below.
  - `worktree-agent-ab2c4459397f43305`: the measurements to take before session 07's choices.
    Status below.
- **Integration worktree:** `C:\Users\ostro\RustroverProjects\integrate-120`, on branch
  `integrate-120` with a real `node_modules`.
  - Branches are merged there, the gates run there, and then `main` is fast-forwarded to it and
    pushed.
  - Merging there keeps the main checkout, which the owner's dev server watches, out of the churn.
- **Run data** is in `research/runs/`, which is gitignored and resumable from each run's
  `results.jsonl`. Each worktree has its own `research/runs/`.

## Work in progress

Both branches below were merged into `main` at wind-down, so nothing lives only on a local branch.
Their docs carry WIP marks where a reading is missing. No research process is running. The owner's
dev server on 5180 (PID 71396) was left alone.

Both runners resume from `results.jsonl`. Keep each command's arguments exactly as below, or the
schedule hash won't match. Run them from the repo root: the main checkout holds copies of the
command-surface run directories, and the release2 runs are still only in their worktree.

### Session 06, the command-surface half

The write-up is `docs/analysis/2026-09-26-command-surface.md`, and the session 06 plan has its
Result block.

- **What landed:**
  - `BodyCommand`;
  - channels declared per module from shared kinds;
  - the `Intent` adapter;
  - a stance channel, with `research/stance-bench.mjs`;
  - a step-target channel, `src/step-target.ts`, with `research/step-bench.mjs`;
  - the expert proposing on both.
- **Both flags are off by default** (`DEFAULT_CHANNEL_FLAGS`). The null control was bit-identical
  in 45 of 45 bouts, by trajectory hash, across nine runs (`research/command-null.mjs`).
- **Step: not on by default.**
  - Against the ruler it wins 40.6 % on stone and 43.8 % on skeleton, over 32 pairs each.
  - The first `-step` run's loss was traced to its swapped proposal list, not to the channel.
  - At a fair speed the channel and the keys are level.
- **Stance: undecided.** The head-to-head run stopped at 182 of 256 bouts. It stands at 41.3 % on
  stone (23 pairs) and 54.8 % on skeleton (21 pairs).
- **To finish:**
  1. Resume the stance run, about 0.7 h:
     `node research/headroom.mjs --exp channel --channel stance --skip-ruler --pairs 32 --lanes 6`
  2. Fill the ruler-against-duelist cells, about 0.4 h:
     `node research/headroom.mjs --exp channel --channel ruler --flags step --ruler-only --pairs 32 --lanes 6`
  3. Run `node research/command-surface-report.mjs`.
  4. Stance goes on only if its head-to-head interval clears 50 % with no loss against the
     duelist.
  5. Fill the analysis's partial section 4 and section 5, and remove its WIP marks.
- **`headroom-channel-step` was stopped on purpose** at 123 of 512. `-stepadd` supersedes it; do
  not resume it.
- **Not built:**
  - effector targets in world task space, with a speed and a stiffness. Effectors still take
    envelope coordinates;
  - a page switch for the channel flags. Today they are reachable only from Node, through
    `setChannelFlags`.
- **Eye gate, deferred.** It needs that page switch.
  - The stances read as stances: attack staggered and weighted forward, cover wider. Check stone,
    human and skeleton.
  - A step-target move arrives and stops.
  - An `expert-stepadd` bout does not look worse than one on the keys.

### The questions before session 07's choices

The write-up is `docs/analysis/2026-09-26-release-2-questions.md`, with a status table at its top.
Session 07's plan has a "Before the owner chooses" block. Every counterfactual is a harness
override (`research/overrides.mjs`); no shipped default changed.

- **Answered:**
  - **6, the waist lean ceiling.** 1200 raw against the shipped 600:
    - stone falls down 45 %;
    - re-falls within 2 s down from 15–28 % to 9–10 %;
    - the brawler mirror down from 4.41 to 2.31 falls a body a bout;
    - naive shares move within noise;
    - the maul's stroke strays 58 mm further.

    The doc comment's table is from a linkage that no longer exists. The recommendation is 1200,
    but only after the owner watches a trunk blow at 1200 against 600. This is the "fewer falls"
    mandate, and the owner's choice.
  - **5(b), the bigger walker.** Its hold at 0.80 of reach rests its blade on the other body's head,
    so its strokes jam there. Accept the result. Hold 0.88 is a candidate repair to the naive
    ladder.
  - **17, survive-cut on the humans.** It was void because the idle body's rest guard meets the cut
    first. An opt-in `admission: "arrival"` scores it, and those bodies pass at rest. Report them
    as "passes at rest".
  - **4(a), human arm energy.** The human arm delivers 1/4 to 1/10 of the stone arm's momentum. The
    gap is speed. Before any change to `TORQUES`, find which limit binds: `TORQUES`, the 8 rad/s
    clamp, or `RATES`.
- **Partial:**
  - **2(b), the skeletons against their own family.** The naive cells are done. The fists expert
    cells are not.
  - **13(a), stability and recovery.** The expert-against-brawler run is not done. So far, recovery
    pays only the expert on the skeleton.
- **Not measured:** 16, size with the expert on the mace and the maul.
- **To finish, run from that branch's worktree**,
  `C:\Users\ostro\RustroverProjects\auto-rpg\.claude\worktrees\agent-ab2c4459397f43305`, because
  the runs live in its `research/runs/release2/`. Run one at a time.
  1. **Check two directories for duplicate job ids first:** `family-fists-expert` and
     `size-maul-expert`. `research/headroom.mjs` takes no run lock, and two runners wrote into each
     of those at once.
  2. Resume the runs:
     - `node research/headroom.mjs --exp attributes --attributes size --build mace --levels 0.8,0.9,1.1 --minds "expert@c8,h1" --pairs 8 --lanes 4 --out research/runs/release2/size-mace-expert`
     - the same command with `--build maul --out research/runs/release2/size-maul-expert`
     - `node research/headroom.mjs --exp family --bodies skeleton-fists --minds "" --pairs 2 --lanes 3 --out research/runs/release2/family-fists-expert`
     - `node research/headroom.mjs --exp attributes --attributes stability,recovery --minds "expert@c8,h1" --opponent golem-brawler --pairs 8 --lanes 4 --out research/runs/release2/attr-expert-v-brawler`
  3. Summarise each run with `--summary --out <dir>`.
  4. Run `node research/release2-attr-falls.mjs <dir>` on the attribute runs.
  5. Fill section 5 and the partial marks in sections 3 and 4.
- **One known gap in a test:** the survive-cut admission test does not catch a mutation that counts
  the subject's own contacts, because no fixture start has the idle subject touching anything.

## What comes next

1. **Finish and land session 06's command-surface half** from its branch:
   - merge `main`, run the gates, and read its analysis;
   - a channel is on by default only if the expert's headroom rose with it;
   - every channel off must be bit-identical to `main`;
   - its eye gate goes on the owner's list.
2. **Finish the session 07 questions** from its branch, and land its doc and scripts. It changes no
   shipped default.
3. **Session 07, body release 2,** acts only on the owner's choices from session 05's list. With the
   owner away, prepare each candidate change as a flagged or harness-override experiment with its
   before/after table, and leave the choice on the list.

   The one change with a direct owner mandate is fewer falls, from 2026-09-25. That is the waist
   lean ceiling, `TORSO_WAIST.leanTorque`, and it still needs the house rule's table before it
   moves.
4. **Sessions 08 (the control stack) and 09 (the shipped minds)** follow, per their plan files.

## Traps paid for in this run

These are not yet in `AGENTS.md`.

- **A worker module must never import another worker module.** `research/league-worker.mjs`
  registers a `parentPort` handler when it is imported, so a worker that imports a helper from it
  runs every job twice, and the answers shift by one job.
- **Parallel Havok bouts only through `runJobs`**, one arena per worker realm. On this host
  (16 cores), about 10x effective parallelism. Price every run from a small pilot first. The expert
  is about 12x slower than real time per lane.
- **Every bout of one mind pairing opens identically, whatever its seeds.** So cluster by pairing,
  and play each pairing both ways round (`docs/analysis/2026-09-25-side-mirror.md`).
  `golem-guardian` is side-decided: do not measure against it.
- **Two timing tests flake under full CPU load:** `lab-bridge`'s 15 s timeout, and `style-model`'s
  5 ms replan budget. A dropped test count under load means a timeout; re-run on a quiet box.
- **Before `git worktree remove`, check that the worktree's `node_modules` is not a junction.** A
  junction deleted with the worktree empties the main checkout's `node_modules`.
