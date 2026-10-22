# General AI testbed

## Why

An AI idea is tried by replacing one part of a mind and reading the paired result. Today that
works only for a whole mind that writes its own muscles. The [swap scan](../analysis/2026-10-22-swap-scan.md)
put a trivial second implementation of each of 19 roles in from an entrant's folder: the others
needed shared edits, were silently replaced by the stock part, or could not be picked, linked,
matched, ablated or inspected. Its 133 rows come from six causes, and this plan fixes the causes,
not the rows:

1. Only minds register from outside the shared code.
2. Registering does not make a part run: hosts build the stock part themselves.
3. Interfaces are one implementation's shape.
4. Mistakes are silent.
5. Fit is mixed with a scenario's entry rules, and registering enrols in every pool.
6. Tools check kinds by name, and second lists are kept by hand.

What holds stays: fork and replay to the bit, the mind and Commander boundaries, the bout shared by
browser and Node, the direct-policy path.

**The rule this plan makes true:** a new implementation of any role is its own module in its
owner's folder and one line in a list. Configuration alone chooses it. Every screen, link, save,
match, evaluation, `--ablate`, fork and inspector carries it. A mistake in it is a fault with its
reason, never a substitute.

An abstraction earns its place by removing a row of the scan or by a stub of the swap test needing
it; no universal interface makes every role pretend to do the same work.

## Steps with checks

Each extraction that claims no behaviour change keeps the fingerprint against the commit before
it; one that moves cases names them. Scan rows are cited as `body 7`, `skills 5`, `decide N1`,
`team C1`.

### 1. The mechanism, on navigation, with the swap test

Navigation is the smallest role the scan found fully blocked (`decide N1`–`N4`, `N7`).

- **A part makes itself.** A role's module names its interface and its maker's signature; each
  part of the role carries its maker. For navigation: a `Navigator` interface (step, steer,
  resume, report, `state` as plain data), the visibility navigator and the local one each their
  own maker, no branch on the kind inside one function.
- **The host receives the part.** `skillSet` takes the constructed navigator; the quadruped's
  tactics take theirs. Nothing outside the assembly calls a navigator's maker.
- **A mind's own parts.** A controller may list parts of its own (`Controller.parts`). `partOf`,
  `treeFaults`, `kindsFor`, the editor and `--ablate` resolve a kind against the tree's own parts,
  then the toolkit's. An entrant's part is offered only in its own minds' slots, reaches only its
  own cases' code (`caseCoder` cuts at the controller as now), and `entrant-check` counts it as
  the entrant's.
- **The toolkit's role lists take `MIND_KINDS`' shape**: a module that holds its imports and its
  list and nothing else, read by `caseCoder` as a cut, so one part's edit re-keys only the cases
  that use it.
- **The swap test** (`tests/swap.test.mjs`, under 10 s): a fixture entrant outside `src/` holds a
  trivial stub of each converted role, chosen by configuration only. For each, it builds a mind,
  steps a short bout, and asserts that the stub's maker built the part in use, that its state forks
  and replays, and that the tree round-trips through a link. It grows a role at a time; a role
  is converted when its stub passes.

Check: the straight navigator is the swap test's first stub and walks into the obstacle court's
column; the visibility navigator's cases are unmoved.

### 2. Every host receives its parts

The same mechanism for each role, each landing on its own with its stub (`body 1`–`7`, `11`–`15`,
`21`; `skills 1`–`9`, `12`–`16`; `decide N5`, `P1`, `P2`, `P14`):

- **Executors**: an entrant's executor is an ordinary own part; `fighterSkills`' supplied-executors
  path goes, and with it Vanguard's punch posing as `straight-punch`.
- **Guard**: built by its maker, and the one source of the guard posture. The arbiter's default,
  the executors' returns (`straight-punch`, `combination`, `blade`, `combat`, `whole-body-strike`,
  `strike`, `skills`), recovery (`stand-up`, `step-up`, `post-up`, `plant-up`,
  `support-recovery`) and a controller's `builtIn` ask the configured guard, not `guardPosture`.
  Settings read from the guard (`hold`, the Lab's cover) go through it.
- **Support**: the configured support is built, not the fold for any kind; the arbiter reads what
  a support declares (whether the legs may walk), not the fold's stage names.
- **Behaviours**: each behaviour's logic, keys, validation and memory move behind its
  registration; `actionTactics` keeps priority and composition. Helpers behaviours share
  (walking, spacing) are exported for them.
- **Planner**: `driveFighter` receives its tactics; `tacticsOf`'s switch goes.
- **Motor**: `motorOf` delivers the config to the maker.
- **Recovery**: a sub-mind's maker receives the mind's motor, legs and guard; the stand-up's
  techniques and the options fighter's down list are configured parts (`TECHNIQUES`, `DOWN`, a
  `subs` key); the ground fight is assembled from the mind's parts, not a second copy.
- **The arbiter** keeps lifecycle, ownership and command composition: conflicting writes refused,
  relinquished controls returned to their declared defaults, operation order kept.

Check: each role's stub passes the swap test; with the motor stub chosen, recovery runs it; with
the guard stub chosen, a punch returns to that guard; a save or load during takeover or handback
resumes exactly.

### 3. Each role's interface is the role's, not one implementation's

(`body 9`, `10`, `16`, `17`, `23`; `skills 3`, `10`, `18`, `19`; `decide N2`, `P3`, `P7`, `P8`,
`S2`, `S3`; `team B1`–`B8`)

- **Motor**: balance is a part of its own, not inside the whole-body motor. The motor's required
  interface drops the IK vocabulary; a motor states which goals it carries out, and a skill that
  needs one it does not carry is a fault at construction.
- **Executors and actions**: the maker's types and the action config carry no path or kick
  fields (those move to their executors' configs); an action names a target and an aim only
  where its executor asks for them; resources are declared at construction; an aim rule is a
  registered part.
- **Hands**: the guard and the arbiter speak of the body's hand chains, not two literal sides; the
  free hand's pose is the guard's.
- **Locomotion**: a minimal interface; the stance walk's vocabulary is its own.
- **The humanoid command layer is explicit.** `BodyView`'s fists, head and stance, `Intent`'s two
  guarding hands and `commandable` belong to it, apart from the general body (segments, joints,
  effectors, contacts, actuators). A part's `fits` names what it uses, so legs are refused for
  lacking feet, not fists. Model-name branches (`fighter-readout`, `models`, `dungeon/actors`,
  `render/dress`) read body capabilities. The fall world takes any body and mind. The reptile's
  motor, gaits, bite, tactics and navigator become parts on the same mechanism.

Check: the stubs fabricate no field; a stock locomotion part on the reptile is refused at
construction with what it lacks; existing humanoid controllers keep their fingerprints.

### 4. Fit apart from entry; registering does not enrol

(`body 18`; `skills 21`, `22`; `decide P12`, `P13`; `team B3`, `E1`–`E5`)

- **Fit** is whether the body can carry out what the tree commands. Using what it holds and
  being able to attack are a scenario's entry rules, stated in its recipe or protocol: an Arena
  bout and a match require an attack; a course or a stand does not. A mind may carry what it
  never uses.
- **Pools read the stage.** Tournament, unseen and fingerprint subjects default to `game` parts;
  an `experimental` one is registered, shown and chosen by name, and enters a pool when asked.
- A match or evaluation that drops a condition says which and why in its result.

Check: the hold-still stub carrying a club runs a stand, and is refused from a bout with the
bout's reason; a throwaway mind is in no default pool.

### 5. Mistakes are faults, said where they happen

(`body 8`, `22`, `26`; `skills 14`, `21`; `team S4`, `S7`)

- `Part.keys` is required: no fallback to a central list, no `TypeError` for a part without one.
- An unknown resource, an undelivered setting or a bad cross-reference is a fault before motion
  state is built.
- The Duel keeps the refusal's reason; an Arena link whose tree has a fault shows it and does not
  play another mind in its place.
- One faulted case does not suppress an evaluation's summary for the rest.

Check: each case the scan hit gives its reason where it is used: the page, the link, the match,
the evaluation.

### 6. Lists come from their owner; tools ask for what they need

(`body 24`, `25`; `skills 17`, `27`, `28`, `30`, `31`; `decide P9`–`P11`; `team C2`, `S2`, `S6`,
`S7`)

- The Crypt's Commander pickers read `COMMANDERS`; `--ablate` takes any slot path of the tree,
  `tactics` and `subs` included, read from its parts; `unshown` and the link's gap range come from
  the recipe and the level; the boundary test's world-builder list comes from the import closure
  of `WORLD_BUILDERS`.
- The Lab, the fall evaluations and the action editor accept a mind by what they need of it (its
  slots, its capabilities), not `kind === "fighter"`; the special editors are keyed by role.
- Phase labels and inspector rows come from the part that reports them.

Check: a new Commander appears in the Crypt's picker; the stub minds open in the Lab where they
have what it needs; adding a recipe field the pickers do not show is reported.

### 7. Commanders, evaluations and bout rules open the same way

(`team C1`, `C3`–`C7`, `S1`, `S3`, `S5`, `S8`)

- `COMMANDERS` is a list of imported values with an exported entry type, a cut in `caseCoder`
  and a scope in `entrant-check`; pages pass a Commander's config, not its kind; `crypt-clear`'s
  enemy Commanders are a case parameter.
- One evaluation registry, not `CASES` and `EVALUATIONS` twice; a world kind's step-and-trace loop
  is written once; a lone-body world kind.
- A bout's end rules and verdict, and its start arrangement, are named in the recipe, not closed
  in `Duel` and the levels.

Check: a stub Commander, evaluation and end rule each land as their own folder and one line.

### 8. The mind owns inspection and one owner per responsibility

(`body 27`, `28`; `skills 11`; `decide N6`, `N8`, `P4`–`P6`, `I2`, `O2`, `O4`, `O5`; `team B6`)

- The composed mind holds each component's state and publishes each one's report; the common
  report holds common facts (active actions, held resources, refusal reasons), and a planner's
  own details are an extension any planner may publish. A policy or hosted mind can publish.
  The Commander's member view comes from the mind, not the skills runtime.
- Obstacle avoidance lives in the navigator: the arbiter's `steer`, the action controller's
  footwork and the options walker use it, so replacing the navigator replaces it.
- Order following is a shared piece planners use; a mind declares whether it obeys orders, and a
  person who takes a side whose mind does not is told.

Check: the planner stub's own details show in the readout; the straight navigator's stub changes
how every planner walks round a column.

### 9. Vanguard as component choices

Vanguard's flags (committed aim, prediction, adaptive evasion, routing and the rest) become its
own parts in its slots, with body calibration as named data. Its first client is step 1's
mechanism; it is converted as each role is.

Check: its planner, punch executor, navigation or recovery is replaced alone by `--ablate`, with
the other settings, conditions and permissions kept. No claim is made that Vanguard meets its own
target ([Vanguard](2026-10-21-vanguard.md)).

### 10. The documents say what the code does

(`body 29`–`31`; `skills 32`–`35`; `decide D1`–`D3`; `team D1`–`D4`)

The architecture's layer table, Minds, "Adding a Mind", Navigation, Command, Evaluations and the
case-key claim; `AGENTS.md`'s exact-math and entrant lines; the comments that cite `seekFoe` and
`recipe-tactics.ts`. Each is corrected by the step that makes it true.

## Order

Step 1, then step 2 role by role; steps 3 to 8 after the roles they touch, in any order; step 9
as each Vanguard part's role is converted; step 10 with each step. Small changes on main, one
role or one rule at a time.

## Done when

- The swap test holds a stub of every role, Commander, evaluation and bout rule, each chosen by
  configuration from outside the shared code, and passes.
- No host builds a part of a role it receives; no shared code calls the stock guard's posture,
  the stock motor or the stock navigator directly.
- An entrant's change to its own parts is the entrant's (`entrant-check`) and re-keys only its own
  cases.
- Fit is separate from entry; no default pool enrols an experimental part.
- Every scan row is fixed, or its requirement is held elsewhere and named in the commit.
- `npm run check`, `npm test` and `npm run build` pass; the architecture describes the boundaries
  as built; this plan and the swap scan record are deleted.
