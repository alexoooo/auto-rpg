# Skill implementations

## Goal

A skill's behaviour is specialised per body without changing any other skill or body. Shared code
names no body and holds no skill's decisions; a body's specialisation is an implementation of the
skill that its record selects. A change to one implementation moves only the cases that run it,
and that is checked before the change lands.

## Where it stands

- **Per-body variation is data only.** A skill reads its body's record (`SkillRecord`,
  `src/skills/framework/records.ts`, by `bodyKey`): its settings and, where trained, its network
  (`tunedSettings`, `recordFault`). The code that runs a skill is one executor for every body.
- **Two executors run more than one skill:**

  | Executor | Skills it runs |
  | --- | --- |
  | `straightPunchExecutor`, `src/skills/strikes/straight-punch.ts` | the straight punch (`punch-part.ts`) on every body, the sword thrust (`held-blow.ts`) |
  | `swingExecutor`, `src/skills/strikes/swing.ts` | the club blow and the bonk (`swing-part.ts`) |

  A change to either executor's decisions (when it commits, what posture it prepares in) changes
  every skill and body it runs.
- **Modules shared across strikes:** `learned-punch.ts` (the steer's layout: punch, thrust,
  swings), `strike-window.ts` and `timed-push.ts` (both executors), `face-aligner.ts` (the held
  blows), `strike-cycle.ts` (stomp, bite, `effector-strike.ts`), `contact-response.ts` (bite,
  `effector-strike.ts`).
- **A body-specific behaviour has two routes now**, both wrong for it: a change to the shared
  executor, which moves every caller, or a new skill only that body fits
  ([the skill recipe](../recipes/skill.md#the-rules), "No body is named in control code"), which
  is a new Option and a new table row for what is the same skill.
- **Recovery already separates its wiring from its implementations**
  ([the architecture](../architecture.md#the-layers): "Recovery's shared wiring never imports
  implementations; each implementation owns its algorithms, tuning, data and caches"),
  `src/skills/recovery/implementations/`. The target extends that to every skill.
- **The fingerprint names the cases that moved** (`node scripts/fingerprint.mjs --compare`), not
  which skill and implementation each case ran, so it cannot say a move is outside a change's
  scope.

## The target

### Three layers

| Layer | Holds | Never holds | Where |
| --- | --- | --- | --- |
| Skill | what an Option names and the table reads: its effectors, aims, what it meets, its fit, its records | an implementation's code | `src/skills/<area>/<skill>/` |
| Implementation | one skill's decisions: when it commits, the posture it prepares in, how it drives and returns; its settings' type and validation; its network's layout | an import of another implementation; a body's name | `src/skills/<area>/<skill>/implementations/<name>/` |
| Library | mechanisms: the reach solve, the face aligner, timed pushes, the strike window, the prepare, commit and release lifecycle taking its decisions as functions from the implementation | a skill's or a body's name; a decision | `src/skills/<area>/library/` |

Where a change goes: a decision is an implementation's; a capability every caller is meant to get
is the library's, and its fingerprint shows that every case it moves runs it.

### The record selects the implementation

Every per-body record names its implementation beside its settings:

```json
"workshop-fighter+toes": { "implementation": "drive", "made": "…", "settings": { }, "network": null }
```

- The field is required: a record with no implementation, or one its skill does not have, is a
  fault the skill's fit reports (`recordFault`), and the settings are validated by the
  implementation the record names.
- An implementation is named by what it does, never by a body. A body's specialisation is a new
  implementation and its record's line; another body adopts it by its own record.
- The tools that write records write the field: `research/skills/skill-records.mjs`, the
  exporters it lists (`punch-export.mjs` among them).

### What holds it

- **Source boundaries** (`scripts/source-boundary.mjs`, `tests/core-boundary.test.mjs`): an
  implementation imports the library and the framework, never another implementation; the
  library imports no implementation; a skill imports its own implementations only.
- **A scoped fingerprint**: each case records the skill and implementation pairs it ran, and
  `--compare` given a changed implementation fails on a moved case that does not run it.
- **Every skill owns its code**: the thrust, the club blow and the bonk each have their own
  implementation, built from the library, and run no other skill's.

### The order

Each step plays the game as before: `node scripts/fingerprint.mjs --compare` identical,
`npm run check`, `npm test`, `npm run build`.

1. **Records**: `implementation` in `SkillRecord`, its loaders and `recordFault`; every record of
   every skill (the strikes, the righting, the staged ways up) names the implementation it runs
   now; the record writers write it.
2. **The split**: `straight-punch.ts` into the library, `straight-punch/implementations/drive` and
   `sword-thrust/implementations/drive`; `swing.ts` into the library,
   `club-blow/implementations/swing` and `bonk/implementations/swing`; the shared strike modules
   above into the library.
3. **The checks**: the source boundaries and the scoped fingerprint.
4. **The documents**: the skill recipe's "No body is named in control code", the architecture's
   "Tuned per body" and its source boundaries, and rule 7 of [AGENTS.md](../../AGENTS.md#the-rules),
   each saying that shared code is general and a body's specialisation is an implementation its
   record selects.

## Open

- **Evaluation's cache**: a case's code is the import closure of what it plays (`caseCoder`,
  `scripts/build-identity.mjs`), so moving files re-keys every strike case and evaluate plays them
  again instead of replaying them. Saved readings stay as read. The price is said before step 2.
- **The Skeleton's guard** asks for angles past its joint limits (`guardPosture`,
  `src/skills/guard/guard.ts`: shoulder abduction -0.2 rad below its 0 minimum, elbow flexion
  1.3 rad past its 0.84 maximum). The guard is the mind's, read by every skill, so it is a
  question of its own.
- **The Warrior's punch from its guard**, the strike committing only with the arm at its prepare
  posture, is an implementation of the straight punch its record selects, read in a run of its own
  once the structure lands.
