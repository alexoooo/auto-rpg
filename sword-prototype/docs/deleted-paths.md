# Deleted paths

Every path that once existed under `sword-prototype/` and does not exist now. It is the
register that lets `tests/docs.test.mjs` tell an accurate reference to a file this
prototype used to have from a typo, without anyone hand-maintaining a list of excuses.

**Why a register rather than an allowlist.** Most of the prototype's stale code-span file
references are *correct*: `src/learning/evaluation.ts:5-7` and `src/options.ts:1255`
name deleted scripts in order to say they were deleted, and a checker that demanded they
resolve would force falsifying accurate history. The difference between "names a file
that was deleted" and "names a file that never existed" is a fact git already holds, so
this file is derived from git rather than curated. Nobody gets to add a line to it to make
a test go green: if the path is not in the deletion log, the entry fails.

**Why the paths present today are excluded rather than listed.** A path can be deleted and
later re-added. `scripts/fetch-textures.mjs` is in the deletion log and exists today, and
that is why resolution checks the working tree *before* it consults this file, and why the
generating rule subtracts what exists rather than copying the log. A register that assumed
"in the deletion log" meant "absent now" would answer "deleted, fine" for a live file, and
a reference to a live file that had rotted would sail through.

**What this register cannot do, stated because it is load-bearing.** It answers "was this
path deleted", not "did the writer mean go and read it". `src/sword.ts` really was deleted,
so a reference to `sword.ts` passes -- and both of the ones this prototype had were
instructions to a reader (`src/main.ts:670` "for the reason `sword.ts` gives at length",
`docs/design.md:594` "because `sword.ts` adds"), which no reader can follow. Both were
re-pointed by hand on 2026-08-25. The register would have passed them forever. The same
hole exists one step further out: a reference that names the *wrong existing* file resolves
and is invisible to any check of this shape -- `src/options.ts:530` named `DESIGN.md` for an
argument that lives in `docs/measurements.md`, and only reading it found that.

## Regenerating

Run from the repository root and replace the generated block below verbatim:

```bash
git log --no-renames --diff-filter=D --name-only --pretty=format: -- sword-prototype/ \
  | grep -v '^$' | LC_ALL=C sort -u | sed 's|^sword-prototype/||' \
  | while read -r p; do [ -e "sword-prototype/$p" ] || echo "- \`$p\`"; done
```

**`LC_ALL=C` is not decoration.** The test compares this block against JavaScript's own
`.sort()`, which orders by UTF-16 code unit. A locale-aware `sort` folds case and ignores
punctuation, so under `en_US.UTF-8` it puts `training-evaluator.mjs` before
`train-meta-worker.mjs` and the test rejects the register on ordering alone -- with a diff
that reads as though the register were wrong. `LC_ALL=C` is byte order, which is what
`.sort()` does for these names.

`--no-renames` is not optional. With rename detection on, the two counts can differ and old
names that references in this tree still use disappear, because a rename is
recorded as one modification rather than as a deletion plus an addition. Measured 2026-08-25
at `503bd0a`; the exact counts were deliberately removed after later asset deletions made
them stale while leaving the argument unchanged.

<!-- BEGIN GENERATED -->
- `asset-src/armour/quaternius-knight/KnightCharacter.obj`
- `asset-src/armour/quaternius-knight/ShoulderPads.obj`
- `asset-src/learning/baseline-v1.json`
- `asset-src/learning/engagement-baseline-v1.json`
- `asset-src/learning/unpromoted-v1.json`
- `docs/plans/00-overview.md`
- `docs/plans/01-vitality-and-a-clean-ending.md`
- `docs/plans/02-traceable-arrows.md`
- `docs/plans/03-anatomical-wrist.md`
- `docs/plans/04-articulated-trunk.md`
- `docs/plans/05-crouch-and-reactive-posture.md`
- `docs/plans/06-bare-hands.md`
- `docs/plans/07-texture-pipeline.md`
- `docs/plans/08-character-surfaces.md`
- `docs/plans/09-weapon-and-object-surfaces.md`
- `docs/plans/10-arena-surfaces.md`
- `docs/plans/11-action-options-and-evaluation.md`
- `docs/plans/12-neat-meta-training.md`
- `docs/plans/13-learned-meta-policy.md`
- `docs/plans/14-integration-and-playtest.md`
- `docs/plans/combat-followups-01-pause-and-restart.md`
- `docs/plans/combat-followups-02-verdict-settles-survivors.md`
- `docs/plans/combat-followups-03-spent-arrow-collisions.md`
- `docs/plans/combat-followups-04-shields-against-archers.md`
- `docs/plans/combat-followups-05-bare-duelist-combat.md`
- `docs/plans/combat-followups-06-authoritative-arena-walls.md`
- `docs/plans/combat-followups-07-middle-mouse-camera.md`
- `docs/plans/combat-followups-08-full-human-body-control.md`
- `docs/plans/combat-followups-09-unit-registry.md`
- `docs/plans/combat-followups-10-licensed-armour-adaptation.md`
- `docs/plans/combat-followups-11-broot-body.md`
- `docs/plans/combat-followups-12-centipede-body.md`
- `docs/plans/combat-followups-13-ai-evaluation-contract.md`
- `docs/plans/combat-followups-13-integration-and-playtest.md`
- `docs/plans/combat-followups-14-factorized-ai-contract.md`
- `docs/plans/combat-followups-15-host-command-boundary.md`
- `docs/plans/combat-followups-15-neat-qd-curriculum.md`
- `docs/plans/combat-followups-16-dagger-imitation.md`
- `docs/plans/combat-followups-16-policy-perception-v4.md`
- `docs/plans/combat-followups-17-ppo-self-play.md`
- `docs/plans/combat-followups-17-tactic-output-v2.md`
- `docs/plans/combat-followups-18-bounded-lookahead.md`
- `docs/plans/combat-followups-18-compute-contract-preflight.md`
- `docs/plans/combat-followups-18a-engagement-instrument.md`
- `docs/plans/combat-followups-19-held-out-ai-tournament.md`
- `docs/plans/combat-followups-19-neat-qd-curriculum.md`
- `docs/plans/combat-followups-19-run-legibility.md`
- `docs/plans/combat-followups-20-dagger-imitation.md`
- `docs/plans/combat-followups-20-promoted-ai-integration.md`
- `docs/plans/combat-followups-21-integration-and-playtest.md`
- `docs/plans/combat-followups-21-ppo-self-play.md`
- `docs/plans/combat-followups-22-bounded-lookahead.md`
- `docs/plans/combat-followups-handoff.md`
- `docs/plans/construct-forge-01-blueprint-contract.md`
- `docs/plans/construct-forge-02-control-host-seam.md`
- `docs/plans/construct-forge-03-physics-compiler.md`
- `docs/plans/construct-forge-04-action-runtime.md`
- `docs/plans/construct-forge-04-bronze-warden.md`
- `docs/plans/construct-forge-05-action-runtime.md`
- `docs/plans/construct-forge-05-bronze-warden.md`
- `docs/plans/construct-forge-06-quadruped-locomotion.md`
- `docs/plans/construct-forge-07-articulated-mounts.md`
- `docs/plans/construct-forge-08-damage-and-capabilities.md`
- `docs/plans/construct-forge-09-mind-program.md`
- `docs/plans/construct-forge-10-forge-blueprints.md`
- `docs/plans/construct-forge-11-action-workshop.md`
- `docs/plans/construct-forge-12-auto-battle-lab.md`
- `docs/plans/construct-forge-13-graph-observation-contract.md`
- `docs/plans/construct-forge-14-learning-runtime.md`
- `docs/plans/construct-forge-15-learning-rung.md`
- `docs/plans/construct-forge-17-humanoid-effigy.md`
- `docs/plans/construct-forge-19-human-scale-arbalest-curriculum.md`
- `docs/plans/construct-forge-20-supported-locomotion-evidence.md`
- `docs/plans/construct-forge-21-locomotion-authority-and-state.md`
- `docs/plans/construct-forge-22-carrier-and-collision-runtime.md`
- `docs/plans/construct-forge-23-atomic-supported-locomotion.md`
- `docs/plans/construct-forge-24-forge-ai-and-playtest.md`
- `scripts/evaluate-options.mjs`
- `scripts/promotion-evaluator.mjs`
- `scripts/train-meta-worker.mjs`
- `scripts/train-meta.mjs`
- `scripts/training-evaluator.mjs`
- `src/dummy.ts`
- `src/hero.ts`
- `src/learning/checkpoint.ts`
- `src/learning/promotion.ts`
- `src/sword.ts`
<!-- END GENERATED -->
