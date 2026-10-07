# Core clean-up: body-neutral bodies, one humanoid fighter, one strike skill

## Context

A review of the recent humanoid-attack work (punch, strike cycle, kicks) and the quadruped
(`40795acc`) found the following:

- `BodySpec` is family-neutral, but the layers above it are not. `Body`, `BodyCommand` and
  `motorControl` assume two hands, so the reptile assembles its own mind by hand beside them.
- Hands are carried twice: a hand façade beside the effectors.
- Three humanoid minds (Classic, Point, arena-fighter) overlap, with two skill stacks behind a
  15-field flag bag.
- Punch, kick and bite each rebuild the code around the shared strike cycle.
- Foe targeting is written six times and aims at human segment names.
- The screens each assemble combatants and copy model data.

The owner wants all of it addressed: clean, simple, consistent and maintainable, with
refactoring along the way allowed.

**Owner decisions (2026-10-07):**
1. **Recipe blows retire, gated on a club check.** There will be one humanoid fighter on the
   shared strike cycle for fists and clubs. Recipe machinery is deleted only if a paired club
   battery shows the path fighter is no worse than Classic with a club. If it fails, stop and
   report.
2. **Point control folds away.** Old `control=point-*` links fall back to the default.
3. **One humanoid fighter, configured by data.** The Arena exposes it as named presets plus a
   "Fighter settings" panel; edited settings travel in links and replays. The Crypt and the
   Arena default to it.
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
pooled against Classic with clubs (Wilson 0.071-0.119), every model's cell under 0.15. Chunks
3-10 go on; chunks 11 onward wait on the owner.

## Body, effector, motor and mind layers

### Chunk 3: hands are effectors (landed)

### Chunk 4: the down rule is body data (landed)

### Chunk 5: one mind skeleton (landed)

`mind/hosted.ts` `hostedBody` serves `createBody` and `createQuadrupedMind(built, world, wiring)`.
`SubMindMaker` stays typed on `BodyView`: the reptile builds its one sub-mind itself, so nothing
needs it generic.

### Chunk 6: hand poses in the build layer (bit-identical)

- Move `control/hand-poses.ts` to `build/hand-poses.ts`, which breaks the circular import with
  `build-body.ts`.
- `BuiltSegment.poses?` is a table made once from `handShapeAt` (`spec/body.ts`, the one rule).
  Three readers use it instead of re-deriving shapes: the `rigid` getter, the pose colliders, and
  the `uprightness` lows.
- No hook is registered when no segment can be posed, so the reptile loses its no-op hook.

### Chunk 7: reptile from data, with shared predicates (bit-identical)

**Body data**
- `EffectorSpec.support?: "sole"`.
- `body.json` declares the paws, head, wounds and down. Support endpoints are
  `spec.effectors.filter(e => e.support)`, in declared order, which replaces `PAWS`.
- One `soleGoal()` builder serves the crawl act and the rise in `recover`. It passes optional
  fields only when given.

**Recovery and bite read structure, not names**
- `recover.ts` finds each leg with `chainTo(paw)`. Joint roles come from position in the chain,
  and sides and signs from the reference positions. While changing it, assert them against
  today's name-based reading.
- `bite.ts` finds the jaw by its `bite` point, the hinge as the jaw's parent joint, and the neck
  as the joint carrying the head. Channel names come from `dofs[k].positive`.

**Shared predicates**
- Export `groundContact(contact, minUp)` from `control/support.ts`. It is used by
  `supported-motor`, `support-readiness` and `recover`. Keep each caller's comparison; the
  `<`/`<=` difference stays unless the lock allows it.
- Export `externalContact` there as well, for the bite's own-body contact test.

**Tuning and spec reader**
- Split `REPTILE_CONTROL` into `REPTILE_MOTOR`, `_CRAWL`, `_RECOVERY` and `_BITE`.
- The spec reader switches on the JSON `kind` with a `never` default.
- Drop the box `radius` from the JSON.
- Check each joint's reference angle against its range, as the human joints already do.

### Chunk 8: shared spec derivation (bit-identical)

- Add `massShare`, `cuboidMoments` and `cylinderMoments` to `spec/geometry.ts`, beside
  `ballMoment`.
- `human/segments.ts` and `reptile/spec.ts` use them, with each copy's operation order kept.

### Chunk 9: capabilities derived from the spec (bit-identical)

**`models.ts`**
- `modelSupportsMind` uses exported predicates:
  - `commandable(spec)` (in `body.ts`);
  - `quadrupedFits(spec)` (in `reptile/mind.ts`).
- `canHold(spec, segment)` (`human/grip.ts`'s precondition) replaces the `hands` flag in
  `duel.ts`, `matchup.ts` and `arena/main.ts`.
- The humanoid rows come from one factory.
- The reptile's footprint is computed on demand, not when the module loads.

**Screens**
- `character-preview.ts` frames by `spec.stature`.
- `label` and `clothing` move to `src/render/models.ts`. `HEROES` in `dungeon/main.ts`, `MODELS`
  and `TINT` in the Lab, and `NAMES` in `dungeon/run.ts` all read it.
- The Crypt preloads dressers from its encounter models.

### Chunk 10: per-body scratch and one centre-of-mass read (bit-identical)

- `threatReader()` gives each mind its own scratch.
- `stagedRise` keeps its scratch in its closure.
- `massCentreToRef(...)` in `control/support.ts` is used by `stance.read`, `supportedMotor.read`
  and `physicalReading`, with the same operations in the same order.
- Time the step before and after (`docs/reference/step-cost.md`); `core-step-cost` must pass.

## Fighter, skills and screens (waiting on the owner: the club check failed)

### Chunk 11: retire Classic and Point; Scrapper becomes the default (intended change)

**Delete**
- `mind/point-fighter.ts` and `mind/engagement.ts`.
- `FighterMindConfig`, `PointFighterConfig`, `POINT_FIGHTER` and `FIGHTER`.
- The `seekFoe`, `bandAimed`, `EDGE` and attack branches of `fighterTactics`. What remains, the
  order-following part plus `STRAFE`, moves to `mind/ordered.ts` as `orderedTactics`.

**Change**
- `models.ts`: the default mind is Scrapper.
- `matchup.ts`: drop `classic`, `point-*`, `readGuard` and `&guard=`. Unknown values already fall
  back to the default.
- `research/arena-combat.mjs`: `combatMind` drops those names.
- `strike-hands.ts` and the HUD lose those cases.

**Tests:** delete `arena-point-control` and `arena-engagement`. Move `core-sub-mind`,
`core-orders`, `core-fork` and `arena-core` onto the presets.

**Lock:** the Classic and Point cases are removed; the presets stay bit-identical.

**Crypt:** report `research/crypt-blows.mjs` before and after over 8 seeds.

### Chunk 12: delete recipe blows; rebuild the Lab's Routine and Blow on the fighter (intended change, Lab only)

**Delete**
- `skills/strikes.ts`; `strikeSkill`, `rangeOf`, `POINT_RETURN` and `pointMotion`.
- `assets/core/strikes.json`. Its `SOURCES` entry becomes `path@<commit>`;
  `research/core-club-unit.json` stays.
- The recipe research scripts: `core-aim`, `core-blow*`, `core-placed*`, `core-strike-*`,
  `core-club-strike`, `core-routine-battery`, `strike-robustness`.
- Their tests.

**Move**
- `placedReach`, `PLACED`, `aimOf` and `heldIn` go to `skills/reach.ts`.

**Simplify**
- `createSkills` always builds the strike-cycle stack, and the recipe options leave
  `SkillOptions`.
- `StrikeReport` drops the fields nothing reads: `nets`, `chosen`, `distance` and `blow`.

**Lab**
- Routine and Blow give the unified fighter attack orders at the hung targets or the head, and
  read what lands.
- The recipe selection files `lab/blows.ts` and `targets.ts` go once nothing reads them.
- `tests/core-blows` attacks through the fighter's attack intent.

### Chunk 13: one `FighterConfig` and its presets (bit-identical for presets)

The kind becomes `fighter`, in a new `mind/fighter-config.ts`:

```ts
interface FighterConfig { kind:"fighter";
  hands:"left"|"right"|"alternate"; strikes:"linear"|"mixed"|"vertical"|"boxing";
  prefers:"head"|"body"; defence:"cover"|"predictive"; kicks:boolean; ground:boolean;
  combinations:"none"|"follow-up"|"overlap"; spacing:number; spacingStep:number;
  subs: readonly SubMindConfig[];      // [{kind:"support-recovery"}]; SubMindConfig gains it
  tuning?: { paths?; kick?; execution?; openings?; turnLimit?; turnStartup? } }  // research only
```

- **One `resolveFighter(config)`:** a frozen, merged `{paths, kick, execution, openings}`, read by
  both the tactics and the skills.
- **One `fighterFaults(config): string[]`**, read by `createMind` and by the link reader. It
  refuses:
  - combinations without alternate hands;
  - invalid range learning, paths, kick, execution, openings or turn settings;
  - kicks on a body without two foot effectors.
- **`PRESETS`:**

  | Preset | strikes | prefers | kicks | ground |
  |---|---|---|---|---|
  | Combat | linear | head | no | no |
  | Brawler | mixed | body | no | no |
  | **Scrapper** (default) | mixed | body | no | yes |
  | Kicker | mixed | body | yes | yes |

  - All four use hands alternate, defence cover, combinations none and spacing 0.
  - Kicker uses `ARENA_KICKS = {...KICK_PATH, swingSeconds:.3, contactSpeed:3}`.
  - `matchup.ts`, `models.ts` and `research/arena-combat.mjs` all read `PRESETS`.
- **Test-only options:**
  - `defenseMode`, `repertoire` vertical/boxing, `combinations`, `overlap`, `spacingStep` and
    `hand` become ordinary panel fields.
  - `paths`, `execution`, `turnLimit` and `turnStartup` move under `tuning` (research only).

### Chunk 14: targets by spec, and one tactics module (bit-identical)

**`mind/targets.ts`**
- `nearestFoe(senses, from, standingOnly)`: a strict `<` scan, which matches today's
  tie-breaks.
- `nearestSurface(foes, from, accept)`.
- They replace the copies in `mind/combat.ts`, `kick-combat.ts`, `reptile/tactics.ts` and
  `ground-*`.

**`BodySpec.marks`**
- `{high, middle[], legs[]}`; humans `head`, `[upperTrunk, middleTrunk]`, `[shank.*]`; the
  reptile its own segments.
- The observer's sourced `lowBelow` (.8 m) is used by `lowOpponent`.
- `openings`, `kick-combat` and `ground-*` read marks instead of human segment names, in the
  same order.

**One tactics module**
- `mind/combat.ts` becomes `fighterTactics(spec, config, resolved, orders)`.
- It has one state, `{strike, ground, kick, …}`.
- The kick folds in as a part rather than a decorator, keeping today's call order: an active
  kick returns early; otherwise base, then kick admission.
- One `nextHand(mode, counts)` predicate is exported from `intent.ts`.
- `kick-combat.ts` is deleted.

### Chunk 15: one attack vocabulary and one effector strike (pose bit-identical; state reshaped, except overlap)

**The vocabulary**

```ts
type Attack = {kind:"punch"; hand; target; family; targetId?; direction?; armExtension?}
            | {kind:"kick"; foot; target; targetId?} | {kind:"bite"; target; commit; targetId?};
```

- `Intent = {move, face, lower?, guard:Record<Side, Cover|null>, attack:Attack|null}`.
- `HandAction`, `CombatAction`, `KickAction`, `Intent.combat` and `Intent.kick` go.
- The skills switch on `attack.kind` with a `never` default.
- `Orders.attack` stays a world point, because tapes carry it; the fighter makes it a straight
  punch.

**`skills/effector-strike.ts`: `effectorStrike(body, def)` over `advanceStrike`**

- It owns, once:
  - endpoint velocity;
  - contact alignment;
  - the intended-target test (`contactResponse`);
  - the counters;
  - phase → `EffectorGoal`, with impact.
- `StrikeDef = {effector, point, frame, path, cycle, impact|null, support, prepared}`.
- `skills/strike-defs.ts` holds:
  - the punch definitions (path from `attackPath`);
  - the kick definition;
  - one `IMPACT` constant `{.04,.04,.5}` shared by punch and kick;
  - the limits records, made once.

**Punch**
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
- `SkillOptions` becomes `{fighter: ResolvedFighter}`, and `combatSkills` loses its positional
  parameters.
- `driveBy` always installs the release hook.

**Also update:** `research/arena-combat.mjs`'s witness readers.

### Chunk 16: bite and the control-tasks strike on the same cycle (intended change, reptile and control tasks)

- `reptile/bite.ts` becomes a `StrikeDef`: frame is the head, and `prepared` means the jaw is
  open. It uses the real alignment and intended-target tests.
- `quadrupedTactics` emits `{kind:"bite", commit}` (replacing `prepareBite`), and crawl takes the
  shared vocabulary.
- `control/point-strike.ts` stays for `/control-tasks.html`. Its phases map onto `advanceStrike`,
  and `docs/reference/point-strike*` is re-measured.
- **Battery:** `research/reptile-control.mjs` before and after, plus Reptile v Warrior/Scrapper at
  n=384, paired and side-split.

### Chunk 17: one combatant path and screen fixes (Arena bit-identical; Crypt intended)

- **New `core/combatant.ts`:** `enlist(world, {id, side, model, held, at, rules, senses, mind?,
  balance?, orders, contactIdentity?})` returns `{built, pool, minded, body}`. `duel.ts`,
  `dungeon/run.ts` and the Lab actor use it, keeping today's registration order.
- **Held items:** one `HELD` list and one `armedWith(spec, held)` replace `holding`, `equipped`
  and `itemOf`, and the four held vocabularies. `readHeld` and `Duel` agree on refusing a club
  for a body that cannot hold one.
- **`Orders.foe?: string`:**
  - The Crypt orders a sensed id. The fighter aims at the foe's `marks.high`, the reptile at
    `nearestSurface`.
  - This deletes `run.ts`'s private bite targeting and its `body.physical.head` read from
    outside the senses.
- **Crypt-only model fields** move to `dungeon/actors.ts`: radius, attackMetres,
  progressSeconds, fallEndsFight.
- **Smaller fixes:**
  - The HUD names the preset, marked "(edited)" when changed.
  - `strike-hands.ts` is one switch over `Minded` with no quadruped special case.
  - The reptile's eye positions come from spec points.

### Chunk 18: Arena "Fighter settings" panel and links (presets unchanged)

- **One table drives everything:** `arena/fighter-fields.ts` `FIGHTER_FIELDS` gives each field's
  label, options or range, `read` and `write`. It drives the panel, `readMinds` and the link
  writer.
- **Link schema:** `control=<preset>,<preset>` plus `&left.<field>=` / `&right.<field>=`
  overrides.
  - A bad value falls back to the preset's value.
  - A config `fighterFaults` refuses falls back to the preset, and the panel shows the fault.
  - `tuning` never travels in a link.
- **Panel:** a `<details>` under each humanoid side's Controller, with pointer-event rules per
  AGENTS.md.
- **Replays:** tapes replay with the same parameters.
- **Tests:** the matchup round trip, an old `point-*`/`classic` link, and refused combinations.
  Check in the browser (preview port, kill by PID).

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
  - Delete `docs/plans/2026-10-02-strikes.md`.
  - Rewrite `2026-10-06-arena-combat.md` and `2026-10-06-striking-and-kicks.md` around the one
    fighter, or delete what has landed.
  - Correct the rising plans' mentions of `FIGHTER` and Classic.
- **`docs/architecture.md`:**
  - the body-neutral body;
  - the effector-only command;
  - down as body data;
  - `hostedBody`;
  - the fighter config and presets;
  - the attack union;
  - the effector strike and its definitions.
- **README:**
  - the controller list and settings panel;
  - re-measured figures: a new `docs/reference/fighter-presets.md` round-robin of Combat,
    Brawler, Scrapper and Kicker on Warrior, fists and club, n=384 per cell, paired and
    side-split;
  - the Reptile text.
- **AGENTS.md:** its page parameters (`control`, `recovery`, `appearance`, the fighter fields).
- **Reference records** stay as history. Wherever they name deleted code, cite it as
  `path@<commit>`.

## Verification

- **Every chunk:** the gate above. The lock compare names exactly the expected moved cases (none
  for a bit-identical chunk). Fork tests stay green, and forgetting a required state field still
  fails.
- **Batteries for the intended changes:**
  - the club check (chunk 2);
  - Crypt blows before and after (chunk 11);
  - reptile control and Reptile v Scrapper (chunk 16);
  - one per chunk-20 item;
  - the preset round-robin (chunk 21).
- **Browser checks** on a private preview port, killed by PID:
  - an Arena bout per preset;
  - the settings panel, with an edited link and a replay;
  - Crypt with the reptile pack;
  - the Lab's Routine and Blow;
  - `/control-tasks.html`.
- **End state:**
  - `grep` finds no `hand.left`, `shank.`, `upperTrunk` or `"head"` literals in `src/core/mind`,
    `skills` or `control` outside the spec and marks;
  - `createMind` has three kinds: fighter, direct and quadruped;
  - one strike skill serves punch, kick and bite.
