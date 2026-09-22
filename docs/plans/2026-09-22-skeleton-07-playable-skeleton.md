# Skeleton 07 -- a skeleton you can play

**Depends on:** 06. **Moves:** no stone or human body. One addition is visible for stone: its
dungeon hero picker grows three entries. **Lands:** named skeleton builds, the dungeon hero and
its weapon picker, a crown height that knows the head is gone, and the first real fights.

After session 06 a skeleton can be picked on the arena setup screen, because the family button
and the module pickers come from the tables. It cannot be picked in the dungeon. It also fights
headless against an aim point that is no longer there. This session fixes both, then watches it
fight.

## 1. Named builds

In `src/golem/skeleton/presets.ts`:

```ts
export const SKELETON_BUILDS = [
  { name: "skeleton-warrior", setup: skeletonSetup() },
  { name: "skeleton-mace", setup: skeletonSetup("mace", "plate") },
  { name: "skeleton-dual-blades", setup: skeletonSetup("blade", "blade") },
];
```

Add `{ name: "skeleton-maul", setup: skeletonSetup("maul", "maul") }` only if
`effector.skeletal.maul` passed session 06's maul-grip gate and is registered.

In `src/golem/roster.ts`:

- `PLAYABLE_BUILDS = Object.freeze([...NAMED_BUILDS, ...HUMAN_BUILDS, ...SKELETON_BUILDS])`.
- The load-time refusal loop runs over `NAMED_BUILDS` only, so a human or skeleton build the
  registry has stopped offering fails in a fight rather than at import. Run it over
  `PLAYABLE_BUILDS` instead. The human builds pass today, so this moves nothing. Check that with
  `npm test` before adding the skeleton builds, so that a failure means only one thing.

**Not in `NAMED_BUILDS`.** That list is the enemy pool of the dungeon (`DungeonRun`'s spawns)
and of the waves mode (`src/waves.ts`), and `tests/research*.test.mjs` schedules its jobs over
it. Adding a skeleton there changes every run's enemy draw and the research tests' schedules, and
that is a decision about the game rather than about the body. Session 08 lists it for the owner.

## 2. The dungeon hero

`src/dungeon/main.ts` offers `PLAYABLE_BUILDS` (except the wheel) as the hero, so the three builds
appear with no change. What does need a change is the weapon picker. It is human-only by name:

- `need("human-equipment").hidden = !setup || bodyFamily(setup) !== "human"`
- the option labels come from `humanEquipment(terminal).label`
- `selectedEquipment` is `humanSetup(humanPrimary.value, humanSecondary.value)`

Generalise it by family, not by adding a second branch:

- In `src/golem/family-setup.ts`, next to `FAMILY_SETUP`:

  ```ts
  /**
   * The families whose hands hold chosen weapons, and how to arm one. A stone golem is absent on
   * purpose: its weapons are its build, and the hero picker already chooses between builds.
   */
  export const ARMED_SETUP: Readonly<Partial<Record<BodyFamily, (primary: string, secondary: string) => GolemSetup>>> =
    Object.freeze({ human: humanSetup, skeleton: skeletonSetup });
  ```

- In `dungeon.html`, rename `human-equipment`, `human-primary` and `human-secondary` to
  `hero-equipment`, `hero-primary` and `hero-secondary`. Grep `src/` and `tests/` for the old ids
  first. Nothing outside `src/dungeon/main.ts` should read them.
- In `src/dungeon/main.ts`, `updateEquipment` looks up `ARMED_SETUP[bodyFamily(setup)]`. When
  there is none, the panel is hidden. When there is one, the panel is shown and both pickers are
  refilled from `golemTerminalOptions(setup.primary.chain)` in `src/golem/build.ts`. That is what
  the arena setup screen offers: every terminal registered on that chain, labelled through the
  chain's `fitTerminal`. It follows that a skeletal maul left off the shelf in session 06 is not
  offered here either. Refill on each change of hero, so the pickers always offer what the hero's
  own chain offers. The labels themselves do not differ between families: `fistDefinition` labels
  every fist "fist". The `EFFECTOR_TERMINALS` loop at the top of the file and the `humanEquipment`
  import then have no reader; delete them.
- The start handler sets `selectedEquipment` to `arm(heroPrimary.value, heroSecondary.value)`, or
  `undefined` when the panel is hidden.
- The maul rule (a maul in either hand disables the second picker) stays as it is. Both setup
  functions already make both hands a maul.

The dungeon's policy comes from `FAMILY_POLICY[bodyFamily(setup)]` since session 03, so a
skeleton hero gets `golem-duelist` with no change here.

## 3. A crown that knows the head is gone

`Golem.geometry.crownHeight` is fixed at build as `standHeight + torso reach + head reach`, and
`describe` publishes it every perception step. Policies aim with it: tactics v2, v3 and v4 aim at
`(crownHeight + shoulder.y) / 2`, and `lab-needle`, the driver style and the reaper style read it
too. On a stone golem a severed head ends the bout, so the stale number is never read against a
living body. On a headless skeleton it is: the aim point is the air where the neck used to be.

In `src/golem/golem.ts`:

- Add `readonly headlessCrown: number` to the private `geometry` field's inline type, beside
  `crownHeight`, and compute it where that record is frozen in the constructor, as
  `standHeight + this.torsoModule.envelope().reach`, which is the neck socket. Do not add it to
  `blankBody()` near the top of the file. That returns a `BodyView`, which has no such field, so
  the key would be a `tsc` excess-property error. `headlessCrown` is private geometry, and only
  `crownHeight` is published.
- In `describe`:

  ```ts
  // A body that lost its head and lives on (a skeleton, today) is aimed at from its neck socket.
  // A stone body never reads this branch: losing its head ends it.
  into.crownHeight = this.alive && this.headModuleRecord().severed
    ? this.geometry.headlessCrown
    : this.geometry.crownHeight;
  ```

  `headModuleRecord()` is whatever lookup the file already has for a slot's `AssembledModule`. The
  `modules.find((module) => module.slot === "head")` in the constructor is one. Keep the lookup out
  of the per-step path if it allocates: store the record once at build.

The `this.alive` guard keeps stone identical. A decapitated stone golem is dead, and its
opponent's `describe` of it keeps publishing the build-time crown as it does today. Whether any
fingerprint bout actually decapitates somebody is not known, so the fingerprint cannot be relied
on to catch a missing guard. Test 1 below is what catches it.

`vitalHeight` needs no change: it is the core's height, and for a skeleton that is the ribcage,
which is fatal and exactly what a policy should aim at.

### Occlusion

`occlusionPoints()` includes the head's `mesh.position`, and `src/main.ts` copies the list into
the room-occlusion targets once, at bout start. A skeleton's severed skull therefore stays in the
occlusion set after it has rolled away. The cost is that a wall between the camera and the skull
fades. Look for it in the page check below. If it is visible, make `Golem.sever` remove the head
point from `this.occlusion`, and make the host read `occlusionPoints()` each frame rather than
once. Do not do this speculatively: it changes the host's per-frame work for every body.

## 4. Skeleton bouts in the fingerprint

Session 06 put the skeleton's benches into the fingerprint, because the benches are read from the
registry. Its bouts are not in it yet. Append two rows to `BOUTS` in
`tests/harness/body-fingerprint.mjs`:

| Section | Left | Right | Policies |
| --- | --- | --- | --- |
| `bout:skeleton-warrior~default` | `skeleton-warrior` | `default` | golem-duelist / golem-duelist |
| `bout:skeleton-mace~human-warrior` | `skeleton-mace` | `human-warrior` | golem-duelist / humanoid-duelist |

Seeds follow the table's rule by row index, so appending moves no existing row's seeds. Both
sections read `new` in this session's comparison. From then on they are what shows a later change
to shared code moving a skeleton, and what session 08 is allowed to move with `--may-move`.

## Tests

1. In `tests/golem-arena.test.mjs`: `a_headless_skeleton_publishes_its_neck_as_its_crown`. Stand
   a skeleton, read `view.self.crownHeight` after `describe`, sever the neck, `describe` again,
   and assert that the crown fell by the head module's `envelope().reach` to within 1e-9. On a
   stone golem, repeat the sever and assert that the crown is unchanged (the dead-body branch).
   Mutation: drop the `this.alive` guard and watch the stone half go red.
2. In `tests/golem-arena.test.mjs`: `a_skeleton_reaches_a_verdict_from_either_corner`. Use the
   existing `a_golem_reaches_a_verdict_against_a_live_opponent_from_either_corner` as the template:
   `leftGolem`/`rightGolem` set to `skeletonSetup()` and the stone default, `golem-duelist` on
   both sides, `locomotionMode: "supported"`, and 12 s. Assert a verdict, no thrown error, and that
   both sides landed at least one blow. Do not assert who won.
3. In `tests/humanoid.test.mjs`, or a new `tests/skeleton-dungeon.test.mjs` if that file is the
   wrong home: `a_skeleton_hero_walks_the_dungeon`. Model it on the human maul test:
   `new DungeonRun(arena.scene, 42, "skeleton-warrior", false)`, advance 300 steps, strafe
   right for 60, and assert that it moved more than 0.5 m and that vitality is still 1. A light
   biped that buzzes at rest loses health to its own contacts, and this is where that shows.
4. `every_playable_build_is_accepted_at_load` -- importing `src/golem/roster.ts` does not throw,
   and `PLAYABLE_BUILDS` names are unique. Put it wherever the roster is already tested; grep for
   `roster.ts` in `tests/`.

## Verification

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json   # before editing
npm test
npm run check
npm run build
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
```

Every stone and human section must be `same`. If a bout moved, the crown's `alive` guard is the
first suspect.

Then look at it, because this is the first session in which a skeleton fights. Start `npm run dev`
with `run_in_background` and do the following:

- **Arena (`/`)**: choose Skeleton for one corner and Stone golem for the other, both on
  `golem-duelist`, and watch three bouts. Then do the same against Human warrior. Note, by eye and
  from the fight log:
  - whether blades visibly pass through the thin bones (tunnelling, session 08's first
    question);
  - how often a skeleton is knocked down, and by what. Session 06 predicts nearly every landed
    blow at the stone `braceCapacityMultiplier`, and measured the line;
  - whether a skeleton can be kept on the ground. A blow that lands while a body is rising sends
    it back to fallen (`recoveryHitInterrupted` in `src/supported-locomotion-production.ts`), and
    for a skeleton that takes about 0.21 N.s, which nearly any blow exceeds;
  - whether blows that look as if they pass between the ribs, but strike the solid ribcage box,
    look wrong;
  - whether a shove or a blocked blow flings a skeleton;
  - whether a decapitated skeleton fights on and is aimed at sensibly;
  - whether the skull shows up as a room-occlusion target;
  - how long a bout lasts.
- **Arena, you**: play a skeleton by hand for one bout. The owner will; it should be possible
  first.
- **Dungeon (`/dungeon.html`)**: start a run as `skeleton-mace`. Check that the weapon picker
  shows for the skeleton and offers the skeletal chain's terminals, that it offers the
  anatomical chain's after switching to a human build, and that it hides for a stone build.
- Take screenshots of each for the commit. If the tab is hidden, use the step-and-render recipe
  in `AGENTS.md`.

Write what you saw into `.review/skeleton-first-fights.md`, one line per observation. Session 08
starts from it. Stop the server and kill it by PID. Commit.
