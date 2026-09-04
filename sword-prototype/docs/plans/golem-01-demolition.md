# Session 01 -- demolition

**Status (2026-09-04): implemented, human gate not yet asked.** The Forge, every construct, every
learning tree, the KayKit unit, the guided playtest and the old plan set are deleted; the three
salvages landed in `src/golem/`, `src/engagement.ts` and `scripts/golem-headless-arena.mjs`; the
tree is 46 `.ts` files and 25,842 lines under `src/` against 150 and 50,862, 11 scripts against 53,
and 36 test files and 511 tests against 97 and 1,334. Step 10's look at the page is the coordinator's and the owner's, not this
agent's.

**Three corrections to what is written below**, recorded because the next reader will otherwise
believe the file. (1) The expected-survivor list undercounts: 68 test files imported doomed code,
not "about 56", and eight of those had a surviving *subject* and were operated on rather than
deleted -- `death`, `options`, `policy-perception`, `recorder`, `supported-fist-trigger`, `units`,
`host-run` and `bout`. (2) `scripts/golem-headless-arena.mjs` keeps the default arena geometry
rather than deleting it with the construct lab populate path: the two surviving callers of the
harness need a floor, so the geometry is inlined from the deleted `src/construct/lab-arena.ts`
unchanged. (3) The Warrior and Broot units *do* declare `supportedLocomotionPort`, so
`src/supported-locomotion-production.ts` has live consumers; what has no writer is its scheduler
seam (`authority`/`stage`), kept for session 05 with that named in its own header.

## Outcome

The Forge, every construct, every learning tree, the KayKit unit, the guided playtest and the old
plan set are gone, with their scripts, tests, npm commands and documentation sections. What
survives compiles, tests green, builds, and runs a Warrior-versus-Warrior bout in the page exactly
as before. Three pieces are salvaged into their future homes first, so nothing the golem sessions
need is lost with the trees that held it.

Not deleted, on purpose: `src/host-run.ts` (the arena host: pause, resume, restart, presentation;
it imports nothing from the doomed trees), `src/bodies/centipede.ts` and its unit (a working
non-humanoid that fights through the natural-attack channel the ram head will use), Broot, and
every measurement already in `docs/measurements.md` (history stays; only its anchors move).

## The deletion set

Trees: `src/forge/`, `src/construct/` (including `src/construct/learning/`), `src/learning/`.
Files: `src/kaykit-figure.ts`, `src/kaykit-adapter.ts`, `src/kaykit-profile.ts`, `src/playtest.ts`.
Plans: every `docs/plans/combat-followups-*.md` and `docs/plans/construct-forge-*.md`.

Scripts under `scripts/` that import from those trees (measured 2026-09-04, re-grep before
deleting): every `construct-*.mjs`, `train-*.mjs`, `watch-construct.mjs`,
`run-construct-bouts.mjs`, `qualify-construct-learning-entry.mjs`, every `research-*.mjs`,
`tournament-*.mjs`, `evaluate-ai.mjs`, `collect-dagger.mjs`, `measure-engagement.mjs`,
`measure-supported-locomotion.mjs`, `arbalest-warrior-qualifier.mjs`, every `effigy-*.mjs`,
`scaled-locomotion-fixture.mjs`, `supported-locomotion-boundaries.mjs`,
`supported-locomotion-physical-obstacles.mjs`, `warden-locomotion-ab.mjs`,
`derive-kaykit-knight.mjs`. Keep `scripts/measure.mjs` and the asset, texture and armour scripts.

npm scripts to remove from `package.json`: `construct:lab`, `construct:train`, `construct:watch`,
`construct:qualify`, the five `ai:*` entries, `kaykit:derive`, `kaykit:verify`,
`measure:engagement`. Keep `dev`, `build`, `check`, `test`, `measure`, `asset:*`, `texture:*`,
`armour:*`.

Tests: the direct importers (about 56 of 95 files on 2026-09-04) and the indirect ones that go
through a deleted script or through `units.ts` entries that vanish. The list is found, not
remembered: `grep -l` every `tests/*.test.mjs` for `construct/`, `forge/`, `learning/`, `kaykit`,
`playtest`, `effigy`, `warden`, `arbalest`, `twinblade`, and for each deleted script's name. The
expected survivors are the pure suites (`scoring`, `bout`, `aim`, `arena`, `arrow`, `blood`,
`buttons`, `camera`, `figure-skin`, `handover`, `human-ownership`, `humanoid-qualification`,
`integration`, `materials`, `minds`, `projectile-physical-score`, `shield`, the three
`supported-locomotion-{obstacles,runtime,state}` suites, `supported-root-drive`, `view`,
`warrior-textures`, `warrior-warrior-locomotion`, `weapons`, `docs`). `integration.test.mjs`
imports `src/options.ts`, so it survives only if step 1 has already moved the engagement file.

## Implement

1. **Salvage before deleting.** Copy, then cut the imports so each file compiles on its own:
   - `src/construct/materials.ts` to `src/golem/materials.ts`. Replace the blueprint `ShellStyle`
     import with a local `GolemShellStyle` union carrying the same six names (`plate`, `collar`,
     `bearing`, `piston`, `core`, `support`). Keep the four shared recipes and the per-side albedo.
   - `src/construct/procedural-surface.ts` to `src/golem/procedural-surface.ts`, with its
     `PROCEDURAL_STONE_V1` and `PROCEDURAL_DAMAGE_WEAR_V1` constants and the mapped-PBR fallback.
     Its seed function took a blueprint part id; make it take a string.
   - `src/learning/engagement.ts` to `src/engagement.ts`. Update the import in `src/options.ts`.
     The test `options_and_features_have_no_mutable_config_backdoor` reads the source text of
     `src/options.ts` and `src/learning/features.ts`; drop the second file from it.
   - `scripts/construct-headless-arena.mjs` to `scripts/golem-headless-arena.mjs`. Keep
     `createConstructHeadlessArena`'s shape under a new name (`createHeadlessArena`), keep
     `populateFixture`, delete the construct lab populate path and its imports.
   - The type-only imports: `src/hud.ts` imports `MetaDiagnostic` from the learning meta module
     for one telemetry field; delete the field and whatever in `src/main.ts` fed it.
     `src/supported-locomotion-production.ts` imports `ActionSpec` and `ControlGroupSpec` from
     the construct actions module and `LocomotionAuthorityToken`, `LocomotionSchedulerPort`,
     `LocomotionSubmission` from the construct scheduler. Move those five declarations into
     `src/supported-locomotion-production.ts` itself. Then check whether the Warrior or Broot
     unit declares `supportedLocomotionPort`; if neither does, the production module has no
     consumer until Session 05, and that is fine, but write it in the file header so nobody
     deletes it as dead.
2. **Delete the trees and files** in the deletion set. Delete the old plan files in the same
   change: the docs test pins anchored references into deleted files over `docs/plans/` at zero,
   and the old plans carry about forty-four of them.
3. **Unwire `src/main.ts`.** The forge overlay (`ForgeScreen`, `ControlEditor`, `ProgramEditor`,
   `ConstructLabScreen`, `showForgeSection`, `closeForge`, the library storage key and codec),
   the construct diagnostics panel and the effigy tactical line, the playtest overlay and its
   seven veto and reporting hooks threaded through pause, restart, takeover, the per-frame step
   and the verdict, the learning diagnostics (`metaDiagnostic`, engagement gate formatting,
   champion loading, `requireLiveResearchBout`), and the construct bout job builders. The screen
   state machine in `src/bout.ts` (`select`, `fight`, `over`) is untouched; the forge and playtest
   were overlays, not phases.
4. **Unwire `index.html`.** The forge stylesheet link, the open-forge and guided-playtest buttons,
   the whole forge workspace dialog, the effigy tactical line, the construct diagnostics
   container, and the playtest host. `vite.config.ts` needs no change: there is one entry.
5. **Unwire the registry.** In `src/units.ts` remove the `centipede`-adjacent construct entries
   `bronzeWarden`, `swordbearerEffigy`, `twinbladeEffigy`, `arbalestEffigy` and the
   `kaykitKnight` entry with their model builders, part tables and loadout helpers; shrink
   `UnitKind` accordingly (keep `centipede`). In `src/fighter.ts` remove the `KayKitFigure` import
   and the `"kaykit-knight"` members of its unions. `src/mind.ts` keeps `crawlerMind`.
6. **Doc surgery, sections first.** `README.md`: delete "Guided playtest" and "Construct Forge
   and auto-battle", the KayKit paragraph under Assets, the learned-policy paragraphs under
   Status except one sentence pointing at the measurements record, and the Markdown link to the
   combat-followups overview near the end (the root `tools/check_docs.js` walks this tree's
   Markdown links and would go red). `docs/design.md`: delete the construct sections from
   "Construct body blueprints" through "Construct Lab and onboarding evidence", plus
   "Research-run lifecycle", "Engagement instrument" (the instrument moved; leave one paragraph
   saying where), "Learning stops at the same seam" and "The asset-native Knight is a separate
   body". Keep "Supported walking is a game carrier authorized by physical limbs" whole.
   `AGENTS.md`: delete "Research runs" and prune the npm command list. Add one dated paragraph to
   `docs/design.md` under a new heading "What was removed on 2026-09 and why", four sentences
   long, pointing at `docs/measurements.md` for the evidence those experiments left.
7. **Doc surgery, anchors second.** Line-anchored references into deleted files have no exemption
   in the docs gate. On 2026-09-04 there were nine in `docs/measurements.md` (into the tournament,
   lookahead, PPO, meta and research-policy modules), one in `AGENTS.md` (into the
   quality-diversity module) and one in the prose header of `docs/deleted-paths.md` (into the
   learning evaluation module). Strike each number and date the supersession, per the house rule
   "never re-point an anchor inside a superseded sentence"; do not delete the sentences.
   Un-anchored backticked references to deleted files pass once the register is regenerated, so
   leave those alone.
8. **Re-measure the pins in `tests/docs.test.mjs`.** `PLAN_SURFACE` (anchored-into-deleted over
   `docs/plans/` returns to zero once the old plans are gone, and this session's new plans carry
   no anchors), `SCRATCH_SHARE_OF_DURABLE` (the denominator shrinks far more than the numerator;
   re-take the band from the tree, do not guess), and `NOT_A_PATH_TARGETS` (two of its entries
   name candidate JSON files written by deleted scripts and tests; trim to the survivors).
9. **Two commits.** First: everything above, with `npm run check`, `npm run build` and every
   surviving non-docs test green. The docs suite is necessarily red at this point because
   `docs/deleted-paths.md` is derived from *committed* deletions. Second: regenerate the register
   with the command in its own header, run from the repository root, and commit. Now the docs
   suite is green. Say so in the commit message; the next person to see a red docs suite between
   two commits should find the explanation in `git log`.
10. **Look at it.** `npm run dev`, then: the setup screen offers Warrior, Broot and Centipede and
    nothing else; a Warrior duelist against a Warrior duelist runs to a verdict; `G` shows the
    rig; pause, restart and takeover work; the console shows no failed import and no missing
    element. Stop the server and confirm port 5180 has no listener.

## Verification

```powershell
npm run check
npm test
npm run build
git diff --check -- .
cd .. ; node tools/check_docs.js ; cd sword-prototype
```

Record in the landing note: the test-file count before and after, the surviving npm scripts, and
the size of `src/` before and after, measured rather than quoted from this file.
