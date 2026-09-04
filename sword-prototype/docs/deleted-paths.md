# Deleted paths

Every path that once existed under `sword-prototype/` and does not exist now. It is the
register that lets `tests/docs.test.mjs` tell an accurate reference to a file this
prototype used to have from a typo, without anyone hand-maintaining a list of excuses.

**Why a register rather than an allowlist.** Most of the prototype's stale code-span file
references are *correct*: `src/learning/evaluation.ts` ~~:5-7~~ and `src/options.ts:1255`
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
- `docs/plans/combat-followups-00-overview.md`
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
- `docs/plans/combat-followups-18-human-gate-feasibility.md`
- `docs/plans/combat-followups-18a-engagement-instrument.md`
- `docs/plans/combat-followups-19-held-out-ai-tournament.md`
- `docs/plans/combat-followups-19-neat-qd-curriculum.md`
- `docs/plans/combat-followups-19-run-legibility.md`
- `docs/plans/combat-followups-20-dagger-imitation.md`
- `docs/plans/combat-followups-20-promoted-ai-integration.md`
- `docs/plans/combat-followups-20-throughput-and-ceilings.md`
- `docs/plans/combat-followups-21-integration-and-playtest.md`
- `docs/plans/combat-followups-21-ppo-self-play.md`
- `docs/plans/combat-followups-21-research-ladder.md`
- `docs/plans/combat-followups-22-bounded-lookahead.md`
- `docs/plans/combat-followups-22-scaled-runs.md`
- `docs/plans/combat-followups-23-held-out-ai-tournament.md`
- `docs/plans/combat-followups-24-promoted-ai-integration.md`
- `docs/plans/combat-followups-25-integration-and-playtest.md`
- `docs/plans/combat-followups-99-found-not-fixed.md`
- `docs/plans/combat-followups-handoff.md`
- `docs/plans/construct-forge-00-overview.md`
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
- `docs/plans/construct-forge-16-integration-and-playtest.md`
- `docs/plans/construct-forge-17-humanoid-effigy.md`
- `docs/plans/construct-forge-18-adversarial-balance-curriculum.md`
- `docs/plans/construct-forge-19-human-scale-arbalest-curriculum.md`
- `docs/plans/construct-forge-20-supported-locomotion-evidence.md`
- `docs/plans/construct-forge-21-locomotion-authority-and-state.md`
- `docs/plans/construct-forge-22-carrier-and-collision-runtime.md`
- `docs/plans/construct-forge-23-atomic-supported-locomotion.md`
- `docs/plans/construct-forge-24-forge-ai-and-playtest.md`
- `docs/plans/construct-forge-25-low-number-combat-units.md`
- `docs/plans/construct-forge-26-physical-projectiles.md`
- `docs/plans/construct-forge-27-morphology-combined-arms.md`
- `docs/plans/construct-forge-28-procedural-stone-pbr.md`
- `docs/plans/construct-forge-29-surface-binding-and-damage.md`
- `docs/plans/construct-forge-30-qualification-and-handoff.md`
- `docs/plans/construct-forge-31-dynamism-contract.md`
- `docs/plans/construct-forge-32-athletic-effigy-chassis.md`
- `docs/plans/construct-forge-33-stateful-effigy-duelist.md`
- `docs/plans/construct-forge-34-live-dynamism-parity.md`
- `docs/plans/construct-forge-35-visible-effigy-handoff.md`
- `public/assets/kaykit-knight.glb`
- `public/assets/kaykit-knight.profile.json`
- `scripts/arbalest-warrior-qualifier.mjs`
- `scripts/collect-dagger.mjs`
- `scripts/construct-bout-engine.mjs`
- `scripts/construct-bout-worker.mjs`
- `scripts/construct-checkpoint-bundle.mjs`
- `scripts/construct-combined-arms-qualification.mjs`
- `scripts/construct-combined-arms-runner.mjs`
- `scripts/construct-combined-arms-worker-engine.mjs`
- `scripts/construct-combined-arms-worker.mjs`
- `scripts/construct-headless-arena.mjs`
- `scripts/construct-rollout-engine.mjs`
- `scripts/construct-rollout-worker.mjs`
- `scripts/construct-warrior-bout.mjs`
- `scripts/construct-warrior-curriculum.mjs`
- `scripts/construct-warrior-locomotion.mjs`
- `scripts/derive-kaykit-knight.mjs`
- `scripts/effigy-gauntlet-contact.mjs`
- `scripts/effigy-warrior-dynamism.mjs`
- `scripts/evaluate-ai.mjs`
- `scripts/evaluate-options.mjs`
- `scripts/measure-engagement.mjs`
- `scripts/measure-ppo-workers.mjs`
- `scripts/measure-supported-locomotion.mjs`
- `scripts/ppo-rollout-worker.mjs`
- `scripts/promotion-evaluator.mjs`
- `scripts/qualify-construct-learning-entry.mjs`
- `scripts/research-havok.mjs`
- `scripts/research-ledger.mjs`
- `scripts/research-preflight.mjs`
- `scripts/research-rollout-worker.mjs`
- `scripts/research-runner.mjs`
- `scripts/run-construct-bouts.mjs`
- `scripts/scaled-locomotion-fixture.mjs`
- `scripts/scaled-supported-locomotion.mjs`
- `scripts/supported-locomotion-boundaries.mjs`
- `scripts/supported-locomotion-physical-obstacles.mjs`
- `scripts/tournament-executor.mjs`
- `scripts/tournament-safety.mjs`
- `scripts/train-construct.mjs`
- `scripts/train-lookahead.mjs`
- `scripts/train-meta-worker.mjs`
- `scripts/train-meta.mjs`
- `scripts/train-neat-qd.mjs`
- `scripts/train-ppo.mjs`
- `scripts/training-evaluator.mjs`
- `scripts/warden-locomotion-ab.mjs`
- `scripts/watch-construct.mjs`
- `scripts/watch-research.mjs`
- `src/construct/actions.ts`
- `src/construct/arbalest.ts`
- `src/construct/assisted-locomotion.ts`
- `src/construct/biped.ts`
- `src/construct/blueprint.ts`
- `src/construct/canonical.ts`
- `src/construct/capabilities.ts`
- `src/construct/codec.ts`
- `src/construct/compile.ts`
- `src/construct/construct.ts`
- `src/construct/control.ts`
- `src/construct/controllers.ts`
- `src/construct/damage-target.ts`
- `src/construct/damage.ts`
- `src/construct/durability.ts`
- `src/construct/humanoid-chassis.ts`
- `src/construct/humanoid-locomotion-program.ts`
- `src/construct/humanoid-scale.ts`
- `src/construct/humanoid.ts`
- `src/construct/integrity.ts`
- `src/construct/lab-arena.ts`
- `src/construct/lab-bout.ts`
- `src/construct/lab-config.ts`
- `src/construct/lab-job.ts`
- `src/construct/lab-report.ts`
- `src/construct/lab-runner.ts`
- `src/construct/launcher.ts`
- `src/construct/learning/candidates.ts`
- `src/construct/learning/checkpoint.ts`
- `src/construct/learning/contract.ts`
- `src/construct/learning/corpus.ts`
- `src/construct/learning/ladder.ts`
- `src/construct/learning/mirror.ts`
- `src/construct/learning/network.ts`
- `src/construct/learning/observation.ts`
- `src/construct/learning/policy.ts`
- `src/construct/learning/ppo.ts`
- `src/construct/learning/rollout.ts`
- `src/construct/learning/schedule.ts`
- `src/construct/learning/teacher.ts`
- `src/construct/live-state.ts`
- `src/construct/locomotion.ts`
- `src/construct/matchup.ts`
- `src/construct/materials.ts`
- `src/construct/mind.ts`
- `src/construct/mounts.ts`
- `src/construct/playtest.ts`
- `src/construct/procedural-surface.ts`
- `src/construct/program.ts`
- `src/construct/recorder.ts`
- `src/construct/render.ts`
- `src/construct/resources.ts`
- `src/construct/runtime.ts`
- `src/construct/scheduler.ts`
- `src/construct/sensors.ts`
- `src/construct/striker.ts`
- `src/construct/swordbearer-duelist.ts`
- `src/construct/swordbearer-tactics.ts`
- `src/construct/twinblade-combat.ts`
- `src/construct/twinblade-duelist.ts`
- `src/construct/twinblade.ts`
- `src/construct/view.ts`
- `src/construct/warden.ts`
- `src/dummy.ts`
- `src/forge/catalog.ts`
- `src/forge/control-editor.ts`
- `src/forge/diagnostics.ts`
- `src/forge/forge.css`
- `src/forge/lab-host.ts`
- `src/forge/lab-screen.ts`
- `src/forge/library.ts`
- `src/forge/model.ts`
- `src/forge/onboarding.ts`
- `src/forge/probe.ts`
- `src/forge/program-editor.ts`
- `src/forge/reconcile.ts`
- `src/forge/screen.ts`
- `src/forge/starter.ts`
- `src/hero.ts`
- `src/kaykit-adapter.ts`
- `src/kaykit-figure.ts`
- `src/kaykit-profile.ts`
- `src/learning/artifact.ts`
- `src/learning/checkpoint.ts`
- `src/learning/dagger.ts`
- `src/learning/deployment.ts`
- `src/learning/engagement.ts`
- `src/learning/evaluation.ts`
- `src/learning/features.ts`
- `src/learning/gates.ts`
- `src/learning/genome.ts`
- `src/learning/jobs.ts`
- `src/learning/lookahead.ts`
- `src/learning/meta.ts`
- `src/learning/network.ts`
- `src/learning/persistence.ts`
- `src/learning/ppo.ts`
- `src/learning/promotion.ts`
- `src/learning/quality-diversity.ts`
- `src/learning/recurrent-neat.ts`
- `src/learning/recurrent-network.ts`
- `src/learning/research-matrix.ts`
- `src/learning/research-policy.ts`
- `src/learning/research.ts`
- `src/learning/rng.ts`
- `src/learning/safety.ts`
- `src/learning/specialist.ts`
- `src/learning/stance.ts`
- `src/learning/tactical-model.ts`
- `src/learning/tactical-teacher.ts`
- `src/learning/tournament.ts`
- `src/playtest.ts`
- `src/sword.ts`
- `tests/action-workshop.test.mjs`
- `tests/ai-contract.test.mjs`
- `tests/ai-evaluation.test.mjs`
- `tests/ai-tournament.test.mjs`
- `tests/construct-actions.test.mjs`
- `tests/construct-arbalest-qualifier.test.mjs`
- `tests/construct-arbalest.test.mjs`
- `tests/construct-assisted-locomotion.test.mjs`
- `tests/construct-blueprint.test.mjs`
- `tests/construct-combined-arms-qualification.test.mjs`
- `tests/construct-combined-arms.test.mjs`
- `tests/construct-damage.test.mjs`
- `tests/construct-effigy-dynamism.test.mjs`
- `tests/construct-effigy-gauntlet-contact.test.mjs`
- `tests/construct-humanoid.test.mjs`
- `tests/construct-lab.test.mjs`
- `tests/construct-learning.test.mjs`
- `tests/construct-library.test.mjs`
- `tests/construct-locomotion-fallbacks.test.mjs`
- `tests/construct-locomotion.test.mjs`
- `tests/construct-materials.test.mjs`
- `tests/construct-mind.test.mjs`
- `tests/construct-mounts.test.mjs`
- `tests/construct-observation.test.mjs`
- `tests/construct-perception.test.mjs`
- `tests/construct-physical-fallbacks.test.mjs`
- `tests/construct-procedural-surface.test.mjs`
- `tests/construct-runtime.test.mjs`
- `tests/construct-swordbearer-duelist.test.mjs`
- `tests/construct-swordbearer-tactics.test.mjs`
- `tests/construct-tournament.test.mjs`
- `tests/construct-twinblade-policy.test.mjs`
- `tests/construct-twinblade.test.mjs`
- `tests/construct-warrior-curriculum.test.mjs`
- `tests/construct-warrior-evidence.test.mjs`
- `tests/construct-workshop-complete.test.mjs`
- `tests/dagger.test.mjs`
- `tests/deployment.test.mjs`
- `tests/engagement.test.mjs`
- `tests/fixtures/calibration-record.mjs`
- `tests/fixtures/combined-arms-isolated-engine.mjs`
- `tests/fixtures/construct-lab-engine.mjs`
- `tests/fixtures/label.mjs`
- `tests/fixtures/ppo-worker-exits-cleanly.mjs`
- `tests/fixtures/scaled-locomotion-blueprint.mjs`
- `tests/forge-integration.test.mjs`
- `tests/forge-model.test.mjs`
- `tests/forge-screen.test.mjs`
- `tests/kaykit-adapter.test.mjs`
- `tests/kaykit-knight-asset.test.mjs`
- `tests/kaykit-runtime.test.mjs`
- `tests/learning.test.mjs`
- `tests/ledger.test.mjs`
- `tests/lookahead.test.mjs`
- `tests/neat-qd.test.mjs`
- `tests/plateau.test.mjs`
- `tests/playtest.test.mjs`
- `tests/ppo.test.mjs`
- `tests/preflight.test.mjs`
- `tests/scaled-supported-locomotion.test.mjs`
- `tests/supported-locomotion-evidence.test.mjs`
- `tests/supported-locomotion-physical-obstacles.test.mjs`
- `tests/supported-locomotion-physical.test.mjs`
- `tests/tournament-executor.test.mjs`
- `tests/tournament-safety.test.mjs`
- `tests/warden-assisted-locomotion.test.mjs`
- `tests/warden.test.mjs`
<!-- END GENERATED -->
