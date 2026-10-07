# Core clean-up: body-neutral bodies, configurable controllers, one strike cycle

## Context

A review of the recent humanoid-attack work (punch, strike cycle, kicks) and the quadruped
(`40795acc`) found the following:

- `BodySpec` is family-neutral, but the layers above it are not. `Body`, `BodyCommand` and
  `motorControl` assume two hands, so the reptile assembles its own mind by hand beside them.
- Hands are carried twice: a hand façade beside the effectors.
- Three humanoid minds (Classic, Point, arena-fighter) are listed, matched to bodies and offered
  in three places, and two skill stacks are chosen by a 15-field flag bag.
- Punch, kick and bite each rebuild the code around the shared strike cycle.
- Foe targeting is written six times and aims at human segment names.
- The screens each assemble combatants and copy model data.

The owner wants all of it addressed: clean, simple, consistent and maintainable, with
refactoring along the way allowed.

**Owner decisions (2026-10-07):**
1. **Several controllers, each configurable for any body it fits.** Having more than one
   controller is not the problem; the requirement is that any controller can be configured for
   a given body within the compatibility rules, and that each is built cleanly from shared
   parts. Classic keeps its recipe blows and stays the default. The club check (chunk 2) stands
   as a record: the path fighter is far weaker than Classic with a club.
2. **Point control folds away.** Old `control=point-*` links fall back to the default.
3. **Every controller's settings are exposed.** The Arena offers each controller's named presets
   plus a settings panel; edited settings travel in links and replays.
4. **Options only tests use** are merged cleanly into the config. A truly small one-off may stay
   if it adds no incidental complexity.

## Working rules for every chunk

- **Gate:**
  - `npm test`, `npm run check`, `npm run build`;
  - the behaviour lock in compare mode;
  - the line-ending gate: `git diff --numstat` must equal `git diff --ignore-cr-at-eol --numstat`.

  Then commit to main; no side worktrees. Do not push unless asked. Re-run a dropped test count
  on a quiet machine before believing it.
- **Lock policy:** each chunk is either **bit-identical**, or an **intended change**.
  - Bit-identical: the pose digest is unchanged in every case. State may be reshaped only where
    the chunk says so.
  - Intended change: the lock diff stays within the named cases, and the chunk carries a paired
    battery and a `docs/reference/` record.
- **Don't break order:** keep these call orders, or a bit-identical chunk will not be:
  - `beforeStep` registration, per body, in this order: the hand-pose hook, then the mind hook,
    then the reading hook.
  - `hosting`: look first, then `wants` in rank order (it short-circuits), then release or end,
    then begin or resume.
  - The humanoid reads down from the previous `standing` before its driver runs. Its down is
    cached at look; the reptile's is read live.
  - The reptile acts in this order: decide, withdraw, crawl, bite, paws in declared order,
    `tracker.step`, `motor.control`.
- **Commit this plan** as `docs/plans/2026-10-07-core-cleanup.md`, keep it current, and delete it
  when the last chunk lands. Code never cites it.
- **Batteries:** time the rate first and price the run from it. Run each battery from a
  `git archive` snapshot in the scratchpad, with `node_modules` as a junction. Unlink the junction
  (`cmd /c rmdir`) before deleting the snapshot. This keeps edits in progress from contaminating
  a battery.

## Phase 0: behaviour lock (bit-identical by construction)

Extend `scripts/fingerprint.mjs`. It already has worker lanes, `traceOf`
(`tests/harness/trace.mjs`), Crypt seeds 1–2 and the lab routine.

- **New options:**
  - `--only <regex>` selects cases.
  - `--json <file>` writes `{harness, engine, cases:{name:{pose, state, physics, verdict, blows}}}`.
  - `--compare <file>` exits 1 on any `pose` difference, and reports `state` and `physics`
    differences without failing.
- **Engine:** `CORE_ENGINE=rapier-coordinate` (the page's engine). Print it.
- **Cases:**
  - Standing: the 3 humanoids (`createBody` with `driveBy(standIntent)`, 120 + 1200 steps) and
    the reptile (1320 steps).
  - Arena bouts, with minds from `readMinds("?matchup=a,b&control=c,c")`:
    - every humanoid control (classic, combat, brawler, scrapper, kicker, point-*), as Warrior
      v Rogue, with club and with empty hands;
    - crawl, reptile v reptile;
    - crawl v classic, club and empty;
    - classic, Skeleton v Rogue.
    - Each bout records `pose` (trace every step), `state` (sha256 of
      `saveState(duel.save().state)`), `physics`, the verdict and blows, at the verdict and again
      2 s later.
  - The existing Crypt and lab cases.
- **Baseline:** taken at HEAD into the scratchpad (`lock-HEAD.json`). Re-baseline after each
  intended change.

## Chunk 1: quick wins (landed)

## Chunk 2: club check (landed: FAIL)

`research/club-check.mjs`, recorded in `docs/reference/club-check.md`: Scrapper scores 0.092
pooled against Classic with clubs (Wilson 0.071-0.119), every model's cell under 0.15. The
owner kept Classic and its recipe blows as a controller of their own (decision 1).

## Body, effector, motor and mind layers

### Chunk 3: hands are effectors (landed)

### Chunk 4: the down rule is body data (landed)

### Chunk 5: one mind skeleton (landed)

`mind/hosted.ts` `hostedBody` serves `createBody` and `createQuadrupedMind(built, world, wiring)`.
`SubMindMaker` stays typed on `BodyView`: the reptile builds its one sub-mind itself, so nothing
needs it generic.

### Chunk 6: hand poses in the build layer (landed)

### Chunk 7: reptile from data, with shared predicates (landed)

`externalContact` was not exported: the bite is its only reader.

### Chunk 8: shared spec derivation (landed)

The two task boxes (`tasks/collision.ts`, `tasks/swing-target.ts`) use `cuboidMoments` too; the club keeps its own until chunk 20.

### Chunk 9: capabilities derived from the spec (landed)

- The humanoid rows were one row once label and clothing left, so there is one `HUMANOID`.
- The character preview chooses its view by the body's proportions (taller than long: from the
  front), keeping today's framing numbers; scaling the framing by stature changes the menu
  picture and waits for an eye check.
- The Crypt reads its map first (`runMap`) and loads a skin for each model the run fields
  (`runModels`), the same rule the run spawns by.

### Chunk 10: per-body scratch and one centre-of-mass read (landed)

`lieOf` takes its work from its caller; the rise holds its own (`lying`). The step's time and
allocation, before and after, are in `docs/reference/step-cost.md`.

## Controllers, skills and screens

A controller is a mind kind: its config, its tactics and the skills it drives. There are four
after chunk 11: the **recipe fighter** (Classic: searched recipes, `skills/strike.ts`), the
**path fighter** (Combat, Brawler, Scrapper, Kicker: hand paths on the strike cycle,
`skills/combat.ts`), the **quadruped** (crawl and bite) and **direct** (joint targets, research
and the Lab). Each is a clean module of its own; what they share is shared code, not copies:
the body, the sub-minds, the order-following, foe targeting, the guard and cover, locomotion,
and the strike cycle wherever a blow runs on it.

### Chunk 11: Point control folds away (landed)

Only the six `point-*` cases left the lock. `research/arena-control-trials.mjs` stays and drives the
Combat fighter, which has the same support recovery, ordered attacks and cycle report. Point's
stricter cycle bars are `todo` tests there, each naming the gap the Combat fighter shows.
Fixtures that used Point as an opponent use Classic (the hugging fixture, clubs, 12 s) or
Combat (the openings fixture, 30 s).

### Chunk 12: controllers in one registry, each composing its own skills (bit-identical; state reshaped)

Today `createMind` switches over the kinds, `modelSupportsMind` keeps its own table of which kind
fits which body, `matchup.ts` keeps `CONTROLS` and `controlMind`, and `createSkills` picks one of
two skill stacks by which options are present.

**The registry: `src/core/mind/controllers.ts`**
- `CONTROLLERS: { [K in MindConfig["kind"]]: Controller<Extract<MindConfig, { kind: K }>> }`, a
  mapped type, so a kind without an entry is a compile error.
- `Controller<C> = { fits(spec, config: C): boolean; presets: Readonly<Record<string, { label:
  string; config: C }>>; create(built, world, config: C, wiring): Minded }`.
- `createMind` is `CONTROLLERS[config.kind].create(...)`, with `unknownKind` kept for a config
  read from a save or a link. `modelSupportsMind(model, config)` is `CONTROLLERS[kind].fits`:
  - `commandable(spec)` for both fighters, and two foot effectors as well for a path fighter
    with kicks;
  - `quadrupedFits(spec)` for the quadruped;
  - any body for `direct`.
- `matchup.ts`'s `CONTROLS` and `controlMind` are read from the presets. The ids are kept
  (`classic`, `combat`, `brawler`, `scrapper`, `kicker`, `crawl`), so old links still work.

**Names**
- The kinds are named for what they are, not for a screen: `"fighter"` becomes
  `"recipe-fighter"` (`RecipeFighterConfig`) and `"arena-fighter"` becomes `"path-fighter"`
  (`PathFighterConfig`).
- The files follow: `mind/recipe-fighter.ts` (`createFighter` and the recipe tactics out of
  `minds.ts` and `fighter.ts`), and `mind/path-fighter.ts` (out of `arena-fighter.ts`).

**Skills**
- Each controller composes its own skills. `createSkills`'s flag bag splits into:
  - `recipeSkills(body, {cover?, repertoire?, placed?, steer?})`;
  - `combatSkills(body, …)` as today.
- `SkillOptions` goes. `driveBy(body, tactics, skills)` takes the skills made. The release hook
  is installed by the path fighter, as today.

**Recovery**
- Recovery is configured, not hard-wired. `SubMindConfig` gains `{kind: "support-recovery"}`,
  and `subMind`/`subMindsOf` take the world.
- The path fighter's config gains `subs`, `[{kind: "support-recovery"}]` in every preset, which
  replaces its hard-wired `supportRecovery`.
- The recipe fighter keeps its `subs`: `lie` by default, `staged-rise` in the Arena's preset.

**Tests:** `core-fork` paths follow the renames; a new registry test asserts every
preset's `fits` against every model, the same table `controlsFor` gives today.

### Chunk 13: each controller's config, validated once, with its presets (bit-identical)

Each registry entry gains `faults(config, spec): string[]`, read by `createMind` (it throws on
the first fault) and by the link reader (chunk 18).

**The recipe fighter** (`RecipeFighterConfig`):

```ts
interface RecipeFighterConfig { kind:"recipe-fighter";
  subs: readonly SubMindConfig[];
  guard:"pose"|"cover"; aim:"head"|"pays"; range:"close"|"edge";
  tuning?: { threat?; covering?; edge?; repertoire?; placed?; steer? } }  // research only
```

- `guard`, `aim` and `range` are its player fields. `aim: "pays"` and `range: "edge"` work and
  have research behind them (`core-aim`, `core-range`), so they become panel fields.
- `threat`, `covering` and `edge`, and the recipe skill's `repertoire`, `placed` and `steer`,
  move under `tuning`: research and the Lab's Blow (`lab/blow.ts`) only.
- `&guard=` folds into the per-side settings (chunk 18). Until then, `readGuard` writes the
  `guard` field.
- Presets: Classic, `{subs: [staged-rise], guard: "pose", aim: "head", range: "close"}`, the
  default. The Crypt and every other default keep `FIGHTER` (renamed `RECIPE_FIGHTER`), with
  `subs: [lie]`.

**The path fighter** (`PathFighterConfig`):

```ts
interface PathFighterConfig { kind:"path-fighter";
  subs: readonly SubMindConfig[];
  hands:"left"|"right"|"alternate"; strikes:"linear"|"mixed"|"vertical"|"boxing";
  prefers:"head"|"body"; defence:"cover"|"predictive"; kicks:boolean; ground:boolean;
  combinations:"none"|"follow-up"|"overlap"; spacing:number; spacingStep:number;
  tuning?: { paths?; kick?; execution?; openings?; turnLimit?; turnStartup? } }  // research only
```

- **One `resolvePath(config)`:** a frozen, merged `{paths, kick, execution, openings}`, read by
  both the tactics and the skills.
- **`faults`** refuses:
  - combinations without alternate hands;
  - invalid range learning, paths, kick, execution, openings or turn settings;
  - kicks on a body without two foot effectors.
- **Presets:**

  | Preset | strikes | prefers | kicks | ground |
  |---|---|---|---|---|
  | Combat | linear | head | no | no |
  | Brawler | mixed | body | no | no |
  | Scrapper | mixed | body | no | yes |
  | Kicker | mixed | body | yes | yes |

  - All four use hands alternate, defence cover, combinations none and spacing 0.
  - Kicker uses `ARENA_KICKS = {...KICK_PATH, swingSeconds:.3, contactSpeed:3}`.
  - `matchup.ts`, `models.ts` and `research/arena-combat.mjs` read the registry's presets.
- **Test-only options:**
  - `defenseMode`, `repertoire` vertical/boxing, `combinations`, `overlap`, `spacingStep` and
    `hand` become ordinary fields.
  - `paths`, `execution`, `turnLimit` and `turnStartup` move under `tuning`.

### Chunk 14: shared tactics parts, and targets by spec (bit-identical)

**`mind/targets.ts`**
- `nearestFoe(senses, from, rule)`: a strict `<` scan, which matches today's tie-breaks.
  - `rule: "standing"` skips a foe that is out.
  - `rule: "standing-first"`, Classic's `seekFoe`, takes one that is out only when none stands.
- `nearestSurface(foes, from, accept)`.
- They replace the copies in `seekFoe`, `mind/combat.ts`, `kick-combat.ts`,
  `reptile/tactics.ts` and `ground-*`.

**`BodySpec.marks`**
- `{high, middle[], legs[]}`: for humans `head`, `[upperTrunk, middleTrunk]` and `[shank.*]`;
  for the reptile, its own segments.
- The observer's sourced `lowBelow` (.8 m) is used by `lowOpponent`.
- `seekFoe` (with the recipe bands, `BANDS`, now read as `marks.high` and `marks.middle[0]`),
  `openings`, `kick-combat` and `ground-*` read marks instead of human segment names, in the
  same order.

**Order-following is one part**
- The order-following half of `fighterTactics` (walk, strafe, face, guard or cover) becomes
  `orderedTactics` in `mind/ordered.ts`, with `STRAFE`.
- The recipe fighter's tactics are `orderedTactics` plus its own attack memory and `seekFoe`.
  The path fighter's tactics use `orderedTactics` where they call `fighterTactics` today.

**The path fighter's tactics are one module**
- `mind/combat.ts` becomes `pathTactics(spec, config, resolved, orders)`, with one state,
  `{strike, ground, kick, …}`.
- The kick folds in as a part rather than a decorator, keeping today's call order: an active
  kick returns early; otherwise base, then kick admission. `kick-combat.ts` is deleted.
- One `nextHand(mode, counts)` predicate is exported from `intent.ts`.

### Chunk 15: one attack vocabulary and one effector strike (pose bit-identical; state reshaped, except overlap)

**The vocabulary**

```ts
type Attack = {kind:"blow"; hand; target; targetId?; path?: {family; direction?; armExtension?}}
            | {kind:"kick"; foot; target; targetId?} | {kind:"bite"; target; commit; targetId?};
```

- `Intent = {move, face, lower?, guard:Record<Side, Cover|null>, attack:Attack|null}`.
- `HandAction`, `CombatAction`, `KickAction`, `Intent.combat` and `Intent.kick` go.
- The recipe fighter emits `{kind:"blow", hand:"right", target}`; the recipe skill carries it
  out and reads no `path`. The path fighter always gives `path`.
- The skills switch on `attack.kind` with a `never` default, and refuse a kind they do not
  carry out.
- `Orders.attack` stays a world point, because tapes carry it.

**`skills/effector-strike.ts`: `effectorStrike(body, def)` over `advanceStrike`**

- It owns, once:
  - endpoint velocity;
  - contact alignment;
  - the intended-target test (`contactResponse`);
  - the counters;
  - phase → `EffectorGoal`, with impact.
- `StrikeDef = {effector, point, frame, path, cycle, impact|null, support, prepared}`.
- `skills/strike-defs.ts` holds:
  - the path blows' definitions (path from `attackPath`);
  - the kick definition;
  - one `IMPACT` constant `{.04,.04,.5}` shared by blow and kick;
  - the limits records, made once.

**Path blows**
- One instance per hand. Overlap is the other instance still returning: the `returning` copy
  goes, and the missing `released` check comes back. That is an intended change to overlap only,
  a test-only option.

**Kick**
- Keeps its stages, with the strike stage on the instance.
- One `capture()` replaces the duplicated capture block.
- `placementReading` is deleted, and the per-step `Quaternion`s become scratch.

**Smaller fixes**
- One `smoothElbow()` replaces the duplicated elbow smoothstep.
- The combat skill's cycle fields nest under `cycle`, as in kick and bite.
- `combatSkills(body, resolved)` loses its positional parameters.
- `StrikeReport` keeps what a reader reads; each skill fills what it has. The recipe skill's
  `nets`, `chosen` and `distance` are read by `seekFoe` and the Lab. The path skill's fixed
  `nets`/`chosen: null` fill-ins go behind an optional field.

**Also update:** `research/arena-combat.mjs`'s witness readers.

### Chunk 16: bite and the control-tasks strike on the same cycle (intended change, reptile and control tasks)

- `reptile/bite.ts` becomes a `StrikeDef`: frame is the head, and `prepared` means the jaw is
  open. It uses the real alignment and intended-target tests.
- `quadrupedTactics` emits `{kind:"bite", commit}` (replacing `prepareBite`), and crawl takes the
  shared vocabulary.
- `control/point-strike.ts` stays for `/control-tasks.html`. Its phases map onto `advanceStrike`,
  and `docs/reference/point-strike*` is re-measured.
- **Battery:** `research/reptile-control.mjs` before and after, plus Reptile v Warrior/Classic
  and Reptile v Warrior/Scrapper at n=384, paired and side-split.

### Chunk 17: one combatant path and screen fixes (Arena bit-identical; Crypt intended)

- **New `core/combatant.ts`:** `enlist(world, {id, side, model, held, at, rules, senses, mind?,
  balance?, orders, contactIdentity?})` returns `{built, pool, minded, body}`. `duel.ts`,
  `dungeon/run.ts` and the Lab actor use it, keeping today's registration order.
- **Held items:** one `HELD` list and one `armedWith(spec, held)` replace `holding`, `equipped`
  and `itemOf`, and the four held vocabularies. `readHeld` and `Duel` agree on refusing a club
  for a body that cannot hold one.
- **`Orders.foe?: string`:**
  - The Crypt orders a sensed id. A fighter aims at the foe's `marks.high`, the reptile at
    `nearestSurface`.
  - This deletes `run.ts`'s private bite targeting and its `body.physical.head` read from
    outside the senses.
- **Crypt-only model fields** move to `dungeon/actors.ts`: radius, attackMetres,
  progressSeconds, fallEndsFight.
- **Smaller fixes:**
  - The HUD names the preset, marked "(edited)" when changed.
  - `strike-hands.ts` is one switch over `Minded` with no quadruped special case.
  - The reptile's eye positions come from spec points.

### Chunk 18: Arena controller settings panel and links (presets unchanged)

- **Each controller declares its fields:** `Controller.fields` gives each field's label, options
  or range, `read` and `write`. The fields drive the panel, `readMinds` and the link writer, for
  every controller:
  - the recipe fighter: guard, aim, range and recovery;
  - the path fighter: the chunk 13 fields and recovery;
  - the quadruped: none yet.
- **Link schema:** `control=<preset>,<preset>` plus `&left.<field>=` / `&right.<field>=`
  overrides.
  - A bad value falls back to the preset's value.
  - A config `faults` refuses falls back to the preset, and the panel shows the fault.
  - `tuning` never travels in a link.
  - `&guard=` is read once more, as both sides' `guard`, then dropped from written links.
- **Panel:** a `<details>` "Settings" under each side's Controller, shown when the controller
  has fields, with pointer-event rules per AGENTS.md.
- **Replays:** tapes replay with the same parameters.
- **Tests:** the matchup round trip for each controller, an old `point-*` or `&guard=` link, and
  refused combinations. Check in the browser (preview port, kill by PID).

### Chunk 19: one `Side` union (landed)

### Chunk 20: merges that move the lock (each an intended change, measured)

Each lands as its own commit, with a lock diff limited to the named cases and a reference
record:

- **`holdPose`** (`stance.ts`, used by kicks) runs on `supportedMotor`'s supported-pose solve.
  Kicker cases move.
- **The club's inertia** comes from `cylinderMoments`. Every club case moves.
- **Reptile recovery readiness** uses `control/recovery-ready.ts` `recoveryReady` with the paws
  as supports, and the reptile's lie reading uses the shared one. Reptile cases move.
- **One down timing for every body:** cached at look. The reptile's verdict step may move.

### Chunk 21: documents and figures

- **Plans:**
  - Delete `docs/plans/2026-10-02-strikes.md` if it has landed, or correct it to the recipe
    fighter's names.
  - Rewrite `2026-10-06-arena-combat.md` and `2026-10-06-striking-and-kicks.md` around the
    controllers, or delete what has landed.
  - Correct the rising plans' mentions of `FIGHTER`.
- **`docs/architecture.md`:**
  - the body-neutral body;
  - the effector-only command;
  - down as body data;
  - `hostedBody`;
  - the controller registry, each controller's config and presets;
  - the attack union;
  - the effector strike and its definitions.
- **README:**
  - the controller list and settings panel;
  - re-measured figures: a new `docs/reference/controller-presets.md` with each path preset
    against Classic on Warrior, fists and club, n=384 per cell, paired and side-split;
  - the Reptile text.
- **AGENTS.md:** its page parameters (`control`, `recovery`, `appearance`, the per-side fields).
- **Reference records** stay as history. Wherever they name deleted code, cite it as
  `path@<commit>`.

## Verification

- **Every chunk:** the gate above. The lock compare names exactly the expected moved cases (none
  for a bit-identical chunk). Fork tests stay green, and forgetting a required state field still
  fails.
- **Batteries for the intended changes:**
  - the club check (chunk 2);
  - reptile control, and the Reptile against both fighters (chunk 16);
  - one per chunk-20 item;
  - the presets against Classic (chunk 21).
- **Browser checks** on a private preview port, killed by PID:
  - an Arena bout per preset;
  - the settings panel for both fighters, with an edited link and a replay;
  - Crypt with the reptile pack;
  - the Lab's Routine and Blow;
  - `/control-tasks.html`.
- **End state:**
  - `createMind` dispatches through `CONTROLLERS`, which is also the one source of what fits a
    body, the presets and the settings.
  - Each controller composes its skills itself; there is no flag bag choosing a stack.
  - One strike cycle serves path blows, kicks and bites; the recipe skill serves the recipe
    fighter.
  - `grep` finds no `hand.left`, `shank.`, `upperTrunk` or `"head"` literals in `src/core/mind`,
    `skills` or `control` outside the spec, the marks and the recipe data.
