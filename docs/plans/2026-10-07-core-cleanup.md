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

### Chunk 12: controllers in one registry, each composing its own skills (landed)

Bit-identical, state included. As built:
- `CONTROLLERS` (`mind/controllers.ts`) holds `fits`, `presets` and `create`, and `controllerOf`
  refuses an unknown kind. The presets list classic, combat, brawler, scrapper, kicker, crawl in that
  order, which the picker follows. `commandable` already needs box feet, so a kicker fits every
  body the path fighter fits.
- The kinds are `recipe-fighter` and `path-fighter` (`recipe-fighter.ts`, `path-fighter.ts`). The
  preset constants keep their names until chunk 13, and `fighter.ts` splits in chunk 14.
- `driveBy(body, tactics, make = recipeSkills)` takes a maker, so the callers that pass no skills
  are unchanged. A stack's `Skills.release` is what it does when a sub-mind takes the body:
  `combatSkills` resumes. `combatSkills` keeps its positional parameters until chunk 15.
- The body hands each sub-mind maker its world (`SubMindMaker`), so `subMindsOf` needs none.

### Chunk 13: each controller's config, validated once, with its presets (landed)

Bit-identical. As built:
- Each registry entry has `faults(config)`, which `createMind` reads (it throws the first). It
  takes no spec: whether a body can carry a config out is `fits`, and `commandable` already
  needs box feet, so a kicker fits every body the path fighter fits.
- The recipe fighter's config is `{kind, subs, guard, aim, range, tuning?: {covering, threat, edge}}`
  (`Edge`, `fighter.ts`); `RECIPE_FIGHTER` (lies) and `CLASSIC` (staged rise). The recipe
  skill's `repertoire`, `placed` and `steer` stay the Lab's `RecipeOptions`: no config sets them.
- The path fighter's config is as written above; `resolvePath` and `pathFaults` are in
  `path-fighter.ts`, and `combatTactics` takes the resolved settings. `BODY_OPENINGS` and
  `ARENA_KICKS` are in `config.ts`; `prefers: "body"` is `BODY_OPENINGS` under any tuned openings.
- `PRESETS` (`controllers.ts`) merges every controller's presets; `matchup.ts` and
  `research/arena-combat.mjs`'s `combatMind` read it.

### Chunk 14: shared tactics parts, and targets by spec (landed)

No pose moved; the path fighters' state is reshaped (no order-following memory, the kick a part).
As built:
- `mind/targets.ts`: `nearestFoe(senses, from, rule)`, `nearestSurface(senses, from, accept)` and
  `lyingAxis(foe)`, the head-to-base heading the three ground parts each wrote.
- `BodySpec.marks` is `{high, middle[], base, legs[]}`: `base` (a human's lower trunk) is the far
  end of the long axis, and the ground parts' quiet check reads `[...middle, base]`. The reptile's
  are in its data; a Lab dummy's are its one part. The opening preferences stay keyed by segment
  name (`OpeningTuning`), a part without one at 0; `lowOpponent` keeps its sourced `LOW_HEAD`,
  read at the high mark.
- `mind/ordered.ts`: `STRAFE`, `guarding(guard, threat)` and `orderedIntent(sight, orders, hands,
  strafe)`, a function rather than tactics, since the recipe fighter reads its guard once a step
  for both of its branches. `fighter.ts` is `recipe-tactics.ts` (`recipeTactics`, `seekFoe`,
  `markOf`).
- `mind/path-tactics.ts` `pathTactics(spec, name, config, resolved, orders)`; the kick is
  `kickTactics(tuning)` (`kick-tactics.ts`), a part with `during` and `after`, its state at
  `state.kick`. The rest of the state stays flat. `nextHand(mode, cycles)` is in `intent.ts`.

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

**As built (15a, landed): the vocabulary.** No pose moved; the path fighters' state is
reshaped. `Intent.guard` is `Record<Side, Cover | null>` with `NO_COVER`; `Attack` is
`BlowAttack | KickAttack` (the bite joins in chunk 16), a blow's `path` a `BlowPath`. The recipe
skill refuses a kick; the path skill refuses a blow without a path (`PathBlow`) and a kick
without a kicking skill. `Opening` is its own record and `openingAction` makes its blow.

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

**As built (15b, landed): one effector strike.** No pose moved, the kicker's included; the path
fighters' state is reshaped.
- `effectorStrike(def)` takes no body: its definition names the effector and point, the limits
  (made once by each skill) and the chamber and return times. It gives `read`, `begin`, `step`,
  `seconds`, `goal`, `renew` (a kick's placing goals) and `reset`. Its state (the cycle, the
  point's last place, the counts) hangs on the skill's: `state.hands[hand].cycle` in the path
  skill, `state.kick.strikes[foot]` in the kick.
- No `strike-defs.ts` and no shared `IMPACT`: the impact numbers stay each controller's settings
  (`CombatExecution`, `KickTuning`), which an experiment overrides
  (`research/punch-foundation.mjs` runs `impactSeconds: 0`). The kick's alignment divides by the
  contact velocity's length rather than `contactSpeed`.
- `combatSkills(body, driving, settings)` takes its settings by name (`CombatSettings`), as
  `recipeSkills` takes its options. `StrikeReport`'s `chosen`, `distance` and `nets` are
  optional and the path skill leaves them out; a fighter aiming at what pays aims high without
  them. The path skill's `since` is `-Infinity` with no strike under way.
- Overlap: the returning hand's elbow eases by the one `smoothElbow` too. The overlap record
  names the copy its measurements were taken with.

### Chunk 16: bite and the control-tasks strike on the same cycle (intended change, reptile and control tasks)

- `reptile/bite.ts` becomes a `StrikeDef`: frame is the head, and `prepared` means the jaw is
  open. It uses the real alignment and intended-target tests.
- `quadrupedTactics` emits `{kind:"bite", commit}` (replacing `prepareBite`), and crawl takes the
  shared vocabulary.
- `control/point-strike.ts` stays for `/control-tasks.html`. Its phases map onto `advanceStrike`,
  and `docs/reference/point-strike*` is re-measured.
- **Battery:** `research/reptile-control.mjs` before and after, plus Reptile v Warrior/Classic
  and Reptile v Warrior/Scrapper at n=384, paired and side-split.

**As built (16, landed): no change, and why.** Both already run on the shared cycle
(`advanceStrike`); what `effectorStrike` adds around it would not be shared:
- The bite measures its tip's velocity physically, relative to the head that carries it, in the
  head's frame; its stroke is the jaw's scalar path, with the head's mouth point a tracker reach
  beside it. Its contact is any outside contact of either jaw, never a held impact. Nothing of
  `effectorStrike`'s finite-difference velocity, alignment, intended-target test or phase goals
  fits it; as a `StrikeDef` it would be an adapter as long as itself.
- `{kind: "bite", commit}` in the attack union would not carry today's bite: the jaw opens on
  `prepareBite` without a stroke asked, and a returning bite asks a stroke without preparing.
  A union member that cannot say both moves the reptile's pose for a name. The quadruped's intent
  stays `Orders` with `prepareBite`; the humanoid `Attack` stays `BlowAttack | KickAttack`.
- `control/point-strike.ts` is `/control-tasks.html`'s measured reference: several effectors,
  one shot, and phases (`prepare`, `strike`, `follow`, `return`, `complete`) that are not the
  cycle's. Moving it onto `advanceStrike` re-measures a reference to share no code.

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

**As built (17, landed): one combatant path.** The Arena is bit-identical (the path fighters'
state only reshaped); the two Crypt cases moved, and `docs/reference/crypt-foe.md` records why
and the paired battery (32 seeds, the hero dead in 10 either way).
- `enlist(world, {id, side, spec, at, rules, senses, solids?, out, mind, balance?, percent?, name,
  orders, contactIdentity?})` takes the spec already armed, so the Arena's stiffened surfaces stay
  the Arena's. The Lab actor does not enlist: it drives a body by a mode's script, with no pool,
  senses or mind config.
- A body's granted solids are a field of what the senses carry (`Sensed.solids`), not a copy of
  its senses made by the Arena.
- `HELD`, `heldItem` and `armedWith(spec, hand, held)` are in `src/core/items/held.ts`;
  `armedWith` refuses a hand that cannot close on what it is given. The Arena's check before
  building and the link's fallback (`readHeld`) stay, since both run before any spec is armed.
- `Orders.foe` resolves in each controller through `aimedOrders(orders, senses, aim)`
  (`targets.ts`): `highMark` for both fighters, `surfaceOn` from the mouth for the reptile.
- `cryptModel` (`src/dungeon/actors.ts`) holds the Crypt's fields; `modelInfo` is
  `{mind, held}`.
- The HUD's controller is `controllerLabel(search, side)` (`matchup.ts`): the preset's name,
  `(edited)` where the link's config differs from it (today `&guard=`).
- `fighterHands` reads the strike report through one switch; a quadruped's hands relax as a
  direct mind's do.

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

**As built (18, landed): settings in the panel and the link.** No pose moved.
- `src/core/mind/fields.ts` builds the fields (`choice`, `toggle`, `number`, `down`); a field's
  `write` returns null for a value it does not take. `down` is the one sub-mind of `subs`.
- `settled(control, setting)` (`matchup.ts`) applies a side's values to its preset and names the
  faults; `linkedSettings` is what a link writes, faults and all, which the panel shows;
  `readMinds` gives the preset where there is a fault. `settingsSearch` writes only a value that
  differs from the preset, as its field reads it (`0.50` is written `0.5`). `readGuard` is gone:
  an old `&guard=` is read under the side's own `guard` and never written.
- The spacing's panel bounds (0 to 1 m, step 0 to 0.2 m) are numeric settings.
- Checked in the browser on a preview port: a refused link shows its values and the fault, a
  bout's link carries the settings and the HUD marks both sides edited, and a reptile's side hides
  its settings.

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

**As built (20a, landed): one approach law, bit-identical.** `holdPose` already ran on the shared
bearing solve (`makeBearing`, `carryRoot`, `limbMotion`, `bearLimbs`); what it copied was the
critically damped goal. `control/approach.ts` holds it once: `approachToRef` for a point and
`turnToRef` for a frame, which `holdPose` (centre, pelvis, anchored soles), the walking stance's
pelvis and `supportedMotor` (centre, root, turned endpoints) ask by. The same operations in the
same order, so no case moved: the lock against chunk 17, and a 2400-step front kick's trace before
and after (both moved by a 1e-9 perturbation of the helper, so both run through it). The goals
stay each caller's: a planted pose's free sole is damped at its rate and pressed down, a supported
endpoint damped at twice its rate, and making them one would change the kick for sameness alone.
The staged rise keeps its own turn, since it reads the steady spin again to know the turn is done.

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
