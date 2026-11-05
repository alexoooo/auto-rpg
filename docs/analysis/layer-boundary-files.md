# File review ledger

The [audit findings](layer-boundary-audit.md) supply the evidence and repair obligations; the
[plan](../plans/clean-layer-boundaries.md) supplies sequencing. Every executable inventory path
below has a full-content review. The supplemental table distinguishes authored configuration
from code. A dash means no finding recorded, rather than a proof of correctness.

## Authored vendor overlay

| File | Responsibility | Outcome |
| --- | --- | --- |
| [vendor/rapier/auto-rpg.patch](../../vendor/rapier/auto-rpg.patch) | Author-owned changes to pinned Rapier Rust solver and JS/WASM bindings | [VO01](layer-boundary-audit.md#vo01) |
| [vendor/rapier/build.sh](../../vendor/rapier/build.sh) | Pinned vendored package source checkout, patch, deterministic WASM/JS build and packaging | — |
| [vendor/rapier/rustc-wrapper.cjs](../../vendor/rapier/rustc-wrapper.cjs) | Pinned-build Cargo metadata identity and rustc invocation | — |

## Root pages and build entrypoint

| File | Responsibility | Outcome |
| --- | --- | --- |
| [character-lab.html](../../character-lab.html) | Presentation templates/styles or authored build/asset configuration | — |
| [index.html](../../index.html) | Presentation templates/styles or authored build/asset configuration | [APP-SCREEN-CSS](layer-boundary-audit.md#app-screen-css) |
| [physics-bench.html](../../physics-bench.html) | Presentation templates/styles or authored build/asset configuration | — |
| [vite.config.ts](../../vite.config.ts) | Browser presentation, editing or application setup | — |

## public

| File | Responsibility | Outcome |
| --- | --- | --- |
| [public/coi-sw.js](../../public/coi-sw.js) | Browser presentation, editing or application setup | — |

## research

| File | Responsibility | Outcome |
| --- | --- | --- |
| [research/arena-combat-league.mjs](../../research/arena-combat-league.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/arena-combat-run.mjs](../../research/arena-combat-run.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/arena-combat.mjs](../../research/arena-combat.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/assist-need.mjs](../../research/assist-need.mjs) | Assist shortfall bout analysis | — |
| [research/assist-sweep.mjs](../../research/assist-sweep.mjs) | Assist allowance parameter sweep | — |
| [research/bare-recipe.mjs](../../research/bare-recipe.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/bite-load.mjs](../../research/bite-load.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/blow-shares.mjs](../../research/blow-shares.mjs) | Combat material-share reference calculation | — |
| [research/body-plan-regression.mjs](../../research/body-plan-regression.mjs) | Cross-tree body/duel refactor diagnostic | — |
| [research/bout-baseline.mjs](../../research/bout-baseline.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/bout-pool.mjs](../../research/bout-pool.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/bout-trace.mjs](../../research/bout-trace.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/bout-worker.mjs](../../research/bout-worker.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/bout.mjs](../../research/bout.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/bvh.mjs](../../research/bvh.mjs) | CMU BVH motion-capture import | — |
| [research/call-count-hook.mjs](../../research/call-count-hook.mjs) | Node instrumentation load hook | — |
| [research/call-count.mjs](../../research/call-count.mjs) | Explicit call-count profiling runner | — |
| [research/cap-series.mjs](../../research/cap-series.mjs) | Research bout, fork, training and profiling diagnostics | [MG19](layer-boundary-audit.md#mg19) |
| [research/case-learning-environment.mjs](../../research/case-learning-environment.mjs) | Research bout, fork, training and profiling diagnostics | [MG14](layer-boundary-audit.md#mg14) |
| [research/cma.mjs](../../research/cma.mjs) | Seeded offline parameter search and worker pool | — |
| [research/combat-locomotion.mjs](../../research/combat-locomotion.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/combat-records.mjs](../../research/combat-records.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/contact-friction.mjs](../../research/contact-friction.mjs) | Synthetic sliding contact model diagnostic | [FND-001](layer-boundary-audit.md#fnd-001) |
| [research/contact-linked.mjs](../../research/contact-linked.mjs) | Synthetic articulated-contact diagnostic | [FND-001](layer-boundary-audit.md#fnd-001) |
| [research/contact-projection.mjs](../../research/contact-projection.mjs) | Coupled-equipment friction diagnostic | — |
| [research/contact-step.mjs](../../research/contact-step.mjs) | Contact-transition predictor diagnostic | [FND-001](layer-boundary-audit.md#fnd-001) |
| [research/contact-stops.mjs](../../research/contact-stops.mjs) | Contact and angular-stop predictor diagnostic | [FND-001](layer-boundary-audit.md#fnd-001) |
| [research/core-posture-runs.mjs](../../research/core-posture-runs.mjs) | Explicit capability research harness or artifact authoring | [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/core-posture-trials.mjs](../../research/core-posture-trials.mjs) | Explicit Warrior posture search, static equilibrium solve, engine hold and stance handover diagnostics | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api) |
| [research/core-posture-worker.mjs](../../research/core-posture-worker.mjs) | Sequential research worker reporting boundary | — |
| [research/core-posture.mjs](../../research/core-posture.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/core-rapier-probe.mjs](../../research/core-rapier-probe.mjs) | Raw solver convention diagnostic | — |
| [research/core-reach-map.mjs](../../research/core-reach-map.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/core-stance-envelope.mjs](../../research/core-stance-envelope.mjs) | Explicit capability research harness or artifact authoring | [ROOT-TOOLS](layer-boundary-audit.md#root-tools), [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/core-stance-sweep.mjs](../../research/core-stance-sweep.mjs) | Explicit capability research harness or artifact authoring | [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/core-stance-trials.mjs](../../research/core-stance-trials.mjs) | Explicit capability research harness or artifact authoring | [ROOT-TOOLS](layer-boundary-audit.md#root-tools), [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api) |
| [research/core-stance-worker.mjs](../../research/core-stance-worker.mjs) | Sequential research worker reporting boundary | — |
| [research/crypt-blows.mjs](../../research/crypt-blows.mjs) | Research bout, fork, training and profiling diagnostics | [MG21](layer-boundary-audit.md#mg21) |
| [research/crypt-plan.mjs](../../research/crypt-plan.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/crypt-step.mjs](../../research/crypt-step.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/empty-hand-league.mjs](../../research/empty-hand-league.mjs) | Research bout, fork, training and profiling diagnostics | [MG20](layer-boundary-audit.md#mg20) |
| [research/engine-adapter-cost.mjs](../../research/engine-adapter-cost.mjs) | Paired engine adapter benchmark | [FND-002](layer-boundary-audit.md#fnd-002) |
| [research/entrant-recipes.mjs](../../research/entrant-recipes.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/jump-test.mjs](../../research/jump-test.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/lag.mjs](../../research/lag.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/learning-speed.mjs](../../research/learning-speed.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/locomotion-pair.mjs](../../research/locomotion-pair.mjs) | Paired locomotion reading aggregation | — |
| [research/locomotion-run.mjs](../../research/locomotion-run.mjs) | Explicit locomotion diagnostic or policy training/export tool | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api), [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/locomotion-scorecard.mjs](../../research/locomotion-scorecard.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/locomotion-wrench.mjs](../../research/locomotion-wrench.mjs) | Explicit locomotion diagnostic or policy training/export tool | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api), [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/lying.mjs](../../research/lying.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/man-posture-starts.mjs](../../research/man-posture-starts.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/man-postures.mjs](../../research/man-postures.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/man-toe-solver.mjs](../../research/man-toe-solver.mjs) | Passive toe solver study | — |
| [research/mind-make.mjs](../../research/mind-make.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/mind-split-hook.mjs](../../research/mind-split-hook.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/mind-split.mjs](../../research/mind-split.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/minds-apart.mjs](../../research/minds-apart.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/minds/pending-control.mjs](../../research/minds/pending-control.mjs) | Research Mind pending-output buffer | — |
| [research/mocap-import.mjs](../../research/mocap-import.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/oracle-spread.mjs](../../research/oracle-spread.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/oracle.mjs](../../research/oracle.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/pad-surface.mjs](../../research/pad-surface.mjs) | Live pad/collider geometry projection | — |
| [research/physics-bakeoff/candidates.mjs](../../research/physics-bakeoff/candidates.mjs) | Candidate-engine parameter ranking | — |
| [research/physics-bakeoff/case-c.mjs](../../research/physics-bakeoff/case-c.mjs) | Whole-body engine comparison case | — |
| [research/physics-bakeoff/engines.mjs](../../research/physics-bakeoff/engines.mjs) | Experimental engine factories | — |
| [research/physics-bakeoff/fidelity.mjs](../../research/physics-bakeoff/fidelity.mjs) | Cross-engine fidelity sweep | — |
| [research/physics-bakeoff/load-cost.mjs](../../research/physics-bakeoff/load-cost.mjs) | Cold load and memory benchmark | — |
| [research/physics-bakeoff/mujoco-armature.mjs](../../research/physics-bakeoff/mujoco-armature.mjs) | Experimental MuJoCo conditioning study | — |
| [research/physics-bakeoff/perf.mjs](../../research/physics-bakeoff/perf.mjs) | Offline scaling/GC benchmark | [FND-003](layer-boundary-audit.md#fnd-003) |
| [research/physics-bakeoff/run-perf.sh](../../research/physics-bakeoff/run-perf.sh) | Explicit alternate-engine performance experiment | — |
| [research/physics-bakeoff/summarize-fidelity.mjs](../../research/physics-bakeoff/summarize-fidelity.mjs) | Fidelity result aggregation | — |
| [research/physics-bakeoff/summarize-perf.mjs](../../research/physics-bakeoff/summarize-perf.mjs) | Performance result aggregation | — |
| [research/physics-bakeoff/thresholds.mjs](../../research/physics-bakeoff/thresholds.mjs) | Engine-comparison protocol thresholds | — |
| [research/physiques.mjs](../../research/physiques.mjs) | Offline physique-grid construction | — |
| [research/posture-limits.mjs](../../research/posture-limits.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/punch-drill.mjs](../../research/punch-drill.mjs) | Explicit capability research harness or artifact authoring | [ROOT-TOOLS](layer-boundary-audit.md#root-tools) |
| [research/punch-export.mjs](../../research/punch-export.mjs) | Explicit capability research harness or artifact authoring | [ROOT-TOOLS](layer-boundary-audit.md#root-tools) |
| [research/punch-mass-audit.mjs](../../research/punch-mass-audit.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/punch-objective.mjs](../../research/punch-objective.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/punch-policy-check.mjs](../../research/punch-policy-check.mjs) | Explicit capability research harness or artifact authoring | [ROOT-TOOLS](layer-boundary-audit.md#root-tools), [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/punch-reshape.py](../../research/punch-reshape.py) | Learned network layout migration | — |
| [research/rapier-package-parity.mjs](../../research/rapier-package-parity.mjs) | Explicit installed-vs-stock solver comparison | — |
| [research/reach-bed.mjs](../../research/reach-bed.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/real-against-engine.mjs](../../research/real-against-engine.mjs) | Exact arithmetic diagnostic | — |
| [research/reptile-combat.mjs](../../research/reptile-combat.mjs) | Explicit capability research harness or artifact authoring | — |
| [research/rest-probe.mjs](../../research/rest-probe.mjs) | Owned recovery/strike research harness and evidence authoring | [SK-RESEARCH-ASSIST-API](layer-boundary-audit.md#sk-research-assist-api) |
| [research/rollout-pool.mjs](../../research/rollout-pool.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/rollout-worker.mjs](../../research/rollout-worker.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/rollouts.mjs](../../research/rollouts.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/run-cycle-search.mjs](../../research/run-cycle-search.mjs) | Run calibration search, clip extraction or trainer server | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api), [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/run-cycle.mjs](../../research/run-cycle.mjs) | Run calibration search, clip extraction or trainer server | — |
| [research/run-feasibility.mjs](../../research/run-feasibility.mjs) | Explicit locomotion diagnostic or policy training/export tool | — |
| [research/run-learning-server.mjs](../../research/run-learning-server.mjs) | Run calibration search, clip extraction or trainer server | [RSR-SERVER-FAULT](layer-boundary-audit.md#rsr-server-fault) |
| [research/run-train.py](../../research/run-train.py) | Explicit locomotion diagnostic or policy training/export tool | [RSR-EXPORT](layer-boundary-audit.md#rsr-export), [SK-RESEARCH-WORKER-ERROR](layer-boundary-audit.md#sk-research-worker-error) |
| [research/skill-search.mjs](../../research/skill-search.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/framework/skill-records.mjs](../../research/skills/framework/skill-records.mjs) | Record authoring tool with application-wide skill writer composition | — |
| [research/skills/recovery/core-rise-trials.mjs](../../research/skills/recovery/core-rise-trials.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/core-rise-worker.mjs](../../research/skills/recovery/core-rise-worker.mjs) | Sequential research worker reporting boundary | — |
| [research/skills/recovery/core-rise.mjs](../../research/skills/recovery/core-rise.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/edge-profile-trial.mjs](../../research/skills/recovery/edge-profile-trial.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/edge-profiles.mjs](../../research/skills/recovery/edge-profiles.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/implementations/staged/core-rise-poses.mjs](../../research/skills/recovery/implementations/staged/core-rise-poses.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/implementations/staged/recovery-transfer.mjs](../../research/skills/recovery/implementations/staged/recovery-transfer.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/implementations/staged/rise-search.mjs](../../research/skills/recovery/implementations/staged/rise-search.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/implementations/staged/rise-trace.mjs](../../research/skills/recovery/implementations/staged/rise-trace.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/implementations/staged/sit-back.mjs](../../research/skills/recovery/implementations/staged/sit-back.mjs) | Owned recovery/strike research harness and evidence authoring | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api), [SK-RESEARCH-STATE](layer-boundary-audit.md#sk-research-state) |
| [research/skills/recovery/implementations/staged/staged-submind.mjs](../../research/skills/recovery/implementations/staged/staged-submind.mjs) | Research decision-phase staged adapter | — |
| [research/skills/recovery/rising-bed.mjs](../../research/skills/recovery/rising-bed.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/rising-budget.mjs](../../research/skills/recovery/rising-budget.mjs) | Owned recovery/strike research harness and evidence authoring | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api) |
| [research/skills/recovery/rising-provenance.mjs](../../research/skills/recovery/rising-provenance.mjs) | Recovery implementation identity adapter | — |
| [research/skills/recovery/rising-worker.mjs](../../research/skills/recovery/rising-worker.mjs) | Sequential research worker reporting boundary | — |
| [research/skills/recovery/witness/climb-search.mjs](../../research/skills/recovery/witness/climb-search.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/skills/recovery/witness/climb.mjs](../../research/skills/recovery/witness/climb.mjs) | Owned recovery/strike research harness and evidence authoring | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api) |
| [research/skills/recovery/witness/crouch-steady.mjs](../../research/skills/recovery/witness/crouch-steady.mjs) | Owned recovery/strike research harness and evidence authoring | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api) |
| [research/skills/recovery/witness/rise-witness.mjs](../../research/skills/recovery/witness/rise-witness.mjs) | Owned recovery/strike research harness and evidence authoring | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api), [SK-RESEARCH-STATE](layer-boundary-audit.md#sk-research-state) |
| [research/stance-stagger.mjs](../../research/stance-stagger.mjs) | Owned recovery/strike research harness and evidence authoring | [SK-RESEARCH-STANCE-API](layer-boundary-audit.md#sk-research-stance-api) |
| [research/step-garbage.mjs](../../research/step-garbage.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/step-time.mjs](../../research/step-time.mjs) | Research bout, fork, training and profiling diagnostics | — |
| [research/strike-bouts.mjs](../../research/strike-bouts.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/strike-profiles.mjs](../../research/strike-profiles.mjs) | Strike evaluation record-to-profile compiler | — |
| [research/swing-drill.mjs](../../research/swing-drill.mjs) | Owned recovery/strike research harness and evidence authoring | — |
| [research/touches.mjs](../../research/touches.mjs) | Contact/audio measurement runner | — |
| [research/yaw-pitch-roll.mjs](../../research/yaw-pitch-roll.mjs) | Research orientation adapter | — |

## scripts

| File | Responsibility | Outcome |
| --- | --- | --- |
| [scripts/arena-view-browser-check.mjs](../../scripts/arena-view-browser-check.mjs) | Arena view integration diagnostic | — |
| [scripts/art/assets.mjs](../../scripts/art/assets.mjs) | Deterministic art compression and delivery build | — |
| [scripts/art/blender.py](../../scripts/art/blender.py) | Blender source export adapter | — |
| [scripts/art/paths.mjs](../../scripts/art/paths.mjs) | Lossless art artifact lookup | — |
| [scripts/art/source_images.py](../../scripts/art/source_images.py) | Content addressed original texture extraction | — |
| [scripts/art/tools.mjs](../../scripts/art/tools.mjs) | Pinned authoring tool download and process runner | — |
| [scripts/build-identity.d.mts](../../scripts/build-identity.d.mts) | Declarations for Node build-identity adapter | — |
| [scripts/build-identity.mjs](../../scripts/build-identity.mjs) | Build and case source identity | [SCR-007](layer-boundary-audit.md#scr-007) |
| [scripts/character-lab/anatomy-review.mjs](../../scripts/character-lab/anatomy-review.mjs) | Workshop visual anatomy screenshot diagnostic | — |
| [scripts/character-lab/browser-check.mjs](../../scripts/character-lab/browser-check.mjs) | Workshop controls and resource browser diagnostic | — |
| [scripts/character-lab/contact-report.mjs](../../scripts/character-lab/contact-report.mjs) | Authored grip contact geometry report | — |
| [scripts/character-lab/contact.mjs](../../scripts/character-lab/contact.mjs) | Posed rendered surface sampling | — |
| [scripts/character-lab/geometry-report.mjs](../../scripts/character-lab/geometry-report.mjs) | Workshop authored motion clearance report | — |
| [scripts/character-lab/grip-review.mjs](../../scripts/character-lab/grip-review.mjs) | Grip closeup screenshot diagnostic | — |
| [scripts/character-lab/realistic-grips.mjs](../../scripts/character-lab/realistic-grips.mjs) | Workshop realistic grip screenshot capture | — |
| [scripts/character-lab/realistic/build.py](../../scripts/character-lab/realistic/build.py) | Workshop MPFB anatomy and authored costume builder | — |
| [scripts/character-lab/realistic/grip_fit.py](../../scripts/character-lab/realistic/grip_fit.py) | Offline hand skin grip fitting | — |
| [scripts/character-lab/realistic/morph_export.py](../../scripts/character-lab/realistic/morph_export.py) | Portable authored morph animation insertion | — |
| [scripts/character-lab/realistic/motion.py](../../scripts/character-lab/realistic/motion.py) | Authored workshop skeletal/equipment action generation | — |
| [scripts/character-lab/realistic/phases.py](../../scripts/character-lab/realistic/phases.py) | Shared authored bow timeline | — |
| [scripts/character-lab/realistic/rebuild.ps1](../../scripts/character-lab/realistic/rebuild.ps1) | Pinned MPFB authoring bootstrap | — |
| [scripts/character-lab/realistic/refresh_deformation.py](../../scripts/character-lab/realistic/refresh_deformation.py) | Rebake authored deformation helpers | — |
| [scripts/character-lab/realistic/refresh_motion.py](../../scripts/character-lab/realistic/refresh_motion.py) | Reauthor workshop equipment/motion on fitted source | — |
| [scripts/character-lab/realistic/rig.py](../../scripts/character-lab/realistic/rig.py) | Art deformation helper bones and skin weights | — |
| [scripts/character-lab/validation.mjs](../../scripts/character-lab/validation.mjs) | Workshop skin/contact measurement algorithms | — |
| [scripts/character-lab/visual-review.mjs](../../scripts/character-lab/visual-review.mjs) | Workshop art repair screenshot capture | — |
| [scripts/clean.mjs](../../scripts/clean.mjs) | Repository generated garbage cleanup | — |
| [scripts/compare-evaluations.mjs](../../scripts/compare-evaluations.mjs) | Read-only paired historical evidence comparison | — |
| [scripts/core/glb.mjs](../../scripts/core/glb.mjs) | Shared lossless glTF accessor reader | — |
| [scripts/core/hand-envelope.mjs](../../scripts/core/hand-envelope.mjs) | Workshop-human contact hand geometry extraction | [SCR-006](layer-boundary-audit.md#scr-006) |
| [scripts/core/man-envelope.mjs](../../scripts/core/man-envelope.mjs) | Man bare foot and hand contact solid extraction | [SCR-006](layer-boundary-audit.md#scr-006) |
| [scripts/core/workshop-envelope.mjs](../../scripts/core/workshop-envelope.mjs) | Workshop-human clothed envelope extraction | [SCR-006](layer-boundary-audit.md#scr-006) |
| [scripts/documents.mjs](../../scripts/documents.mjs) | Document citation and source-comment checks | — |
| [scripts/dungeon/build-kit.py](../../scripts/dungeon/build-kit.py) | Modular crypt appearance geometry builder | — |
| [scripts/dungeon/build-reference.py](../../scripts/dungeon/build-reference.py) | Authored crypt reference chamber builder | — |
| [scripts/dungeon/crypt_geometry.py](../../scripts/dungeon/crypt_geometry.py) | Shared crypt art primitive helpers | — |
| [scripts/dungeon/crypt_stone.py](../../scripts/dungeon/crypt_stone.py) | Crypt fractured masonry and paving authoring | — |
| [scripts/dungeon/crypt_surfaces.py](../../scripts/dungeon/crypt_surfaces.py) | Crypt material map synthesis | — |
| [scripts/dungeon/fetch-textures.mjs](../../scripts/dungeon/fetch-textures.mjs) | Poly Haven texture provenance registration | [SCR-005](layer-boundary-audit.md#scr-005) |
| [scripts/dungeon/print-level.mjs](../../scripts/dungeon/print-level.mjs) | Text visualization of generated levels | — |
| [scripts/entrant-check.mjs](../../scripts/entrant-check.mjs) | Entrant change ownership classification | [SCR-001](layer-boundary-audit.md#scr-001) |
| [scripts/evaluate-worker.mjs](../../scripts/evaluate-worker.mjs) | Node worker adapter for evaluation jobs | — |
| [scripts/evaluate.mjs](../../scripts/evaluate.mjs) | Node evaluation scheduling, persistence and reporting | — |
| [scripts/evaluation-import.mjs](../../scripts/evaluation-import.mjs) | Import historical tournament provenance and rows | [SCR-002](layer-boundary-audit.md#scr-002) |
| [scripts/evaluation-subjects.mjs](../../scripts/evaluation-subjects.mjs) | CLI subject parsing and configured ablations | — |
| [scripts/fingerprint.mjs](../../scripts/fingerprint.mjs) | Explicit cross-system behavior preservation diagnostic | — |
| [scripts/forge/build-assets.py](../../scripts/forge/build-assets.py) | Authored Forge appearance assets | — |
| [scripts/humanoid/export-workshop.py](../../scripts/humanoid/export-workshop.py) | Lossless workshop humanoid asset/profile extraction | — |
| [scripts/lab/fist-fit.mjs](../../scripts/lab/fist-fit.mjs) | Offline workshop fist authoring search | — |
| [scripts/lab/fist-probe.mjs](../../scripts/lab/fist-probe.mjs) | Offline workshop CPU skin and penetration sampling | — |
| [scripts/lab/haft-fit.mjs](../../scripts/lab/haft-fit.mjs) | Offline workshop club grip authoring search | — |
| [scripts/lab/haft.mjs](../../scripts/lab/haft.mjs) | Club physical-to-art grip coordinate measurement | — |
| [scripts/links.mjs](../../scripts/links.mjs) | Static relative import/export validation | — |
| [scripts/pull-merge.mjs](../../scripts/pull-merge.mjs) | Main fetch/merge/validation workflow | [SCR-003](layer-boundary-audit.md#scr-003) |
| [scripts/rat/build-assets.mjs](../../scripts/rat/build-assets.mjs) | Rat appearance source fitting and skinning | — |
| [scripts/rat/fit.mjs](../../scripts/rat/fit.mjs) | Rat body asset derivation from quadruped source and art | — |
| [scripts/rat/landmarks.mjs](../../scripts/rat/landmarks.mjs) | Shared rat art/body fitting landmarks | — |
| [scripts/reptile/build-assets.mjs](../../scripts/reptile/build-assets.mjs) | Grass-lizard appearance bake and skinning | — |
| [scripts/reptile/fit.mjs](../../scripts/reptile/fit.mjs) | Grass-lizard body asset fitting | — |
| [scripts/reptile/pose.mjs](../../scripts/reptile/pose.mjs) | Shared grass-lizard fitting landmarks and source posing | — |
| [scripts/reptile/retopo.py](../../scripts/reptile/retopo.py) | Visual lizard decimation and normal/colour bake | — |
| [scripts/reptile/source.mjs](../../scripts/reptile/source.mjs) | Pinned grass-lizard source archive reader | — |
| [scripts/robot-browser-check.mjs](../../scripts/robot-browser-check.mjs) | Robot appearance browser diagnostic | — |
| [scripts/skeleton/bone-fit.mjs](../../scripts/skeleton/bone-fit.mjs) | Skeleton physical solid/hull measurement | [SCR-006](layer-boundary-audit.md#scr-006) |
| [scripts/skeleton/build-assets.py](../../scripts/skeleton/build-assets.py) | Fit authored skeleton visual source to body binds | — |
| [scripts/skeleton/prepare-source.py](../../scripts/skeleton/prepare-source.py) | Extract pinned anatomical skeleton art source | — |
| [scripts/skills/recovery/righting/righting-forks.mjs](../../scripts/skills/recovery/righting/righting-forks.mjs) | Capture righting recipe fight forks | [SCR-004](layer-boundary-audit.md#scr-004) |
| [scripts/skills/recovery/righting/righting-worker.mjs](../../scripts/skills/recovery/righting/righting-worker.mjs) | Private righting stand/fight candidate execution | — |
| [scripts/skills/recovery/righting/righting.mjs](../../scripts/skills/recovery/righting/righting.mjs) | Righting recipe search and record writer | [SCR-004](layer-boundary-audit.md#scr-004) |
| [scripts/source-boundary.mjs](../../scripts/source-boundary.mjs) | Structural source dependency/runtime ownership check | — |
| [scripts/table.mjs](../../scripts/table.mjs) | CLI table evidence lookup and baseline persistence | — |
| [scripts/test.mjs](../../scripts/test.mjs) | Recursive retained test runner | — |
| [scripts/workspace.mjs](../../scripts/workspace.mjs) | Repository strays and ignore ownership inspection | — |

## src/app

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/app/apart/box.ts](../../src/app/apart/box.ts) | Shared reply ring, atomic ownership and message capacity | [APP-RING](layer-boundary-audit.md#app-ring) |
| [src/app/apart/catalogs.ts](../../src/app/apart/catalogs.ts) | Transport catalog identity binding to app registrations | — |
| [src/app/apart/codec.ts](../../src/app/apart/codec.ts) | Exact plain-data serialization and tag/key collision contract | [APP-CODEC](layer-boundary-audit.md#app-codec) |
| [src/app/apart/host.ts](../../src/app/apart/host.ts) | Seat and spec transport lifecycle, answer/decision ordering | [APP-RING](layer-boundary-audit.md#app-ring) |
| [src/app/apart/thread.ts](../../src/app/apart/thread.ts) | Worker batch ordering, report copying and reporting-boundary failures | [APP-RING](layer-boundary-audit.md#app-ring) |
| [src/app/apart/wire.ts](../../src/app/apart/wire.ts) | Shared counters, messages and thread timeout semantics | — |
| [src/app/browser/app.css](../../src/app/browser/app.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/app.ts](../../src/app/browser/app.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/arena/camera.ts](../../src/app/browser/arena/camera.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/case-link.ts](../../src/app/browser/arena/case-link.ts) | Arena or Crypt presentation, player input and worker readouts | [APP-REFUSAL](layer-boundary-audit.md#app-refusal) |
| [src/app/browser/arena/crowd.css](../../src/app/browser/arena/crowd.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/arena/crowd.ts](../../src/app/browser/arena/crowd.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/fighter-hud.ts](../../src/app/browser/arena/fighter-hud.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/forge-assets.ts](../../src/app/browser/arena/forge-assets.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/forge-room.ts](../../src/app/browser/arena/forge-room.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/forge-style.ts](../../src/app/browser/arena/forge-style.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/forge-ui.css](../../src/app/browser/arena/forge-ui.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/arena/keys-input.ts](../../src/app/browser/arena/keys-input.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/main.ts](../../src/app/browser/arena/main.ts) | Arena or Crypt presentation, player input and worker readouts | [APP-REFUSAL](layer-boundary-audit.md#app-refusal) |
| [src/app/browser/arena/measure.ts](../../src/app/browser/arena/measure.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/orbit.ts](../../src/app/browser/arena/orbit.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/reel.ts](../../src/app/browser/arena/reel.ts) | Arena or Crypt presentation, player input and worker readouts | [APP-REFUSAL](layer-boundary-audit.md#app-refusal) |
| [src/app/browser/arena/room.ts](../../src/app/browser/arena/room.ts) | Arena or Crypt presentation, player input and worker readouts | [APP-FLAGS](layer-boundary-audit.md#app-flags) |
| [src/app/browser/arena/scene.ts](../../src/app/browser/arena/scene.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/side-highlights.ts](../../src/app/browser/arena/side-highlights.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/style.css](../../src/app/browser/arena/style.css) | Presentation templates/styles or authored build/asset configuration | [APP-SCREEN-CSS](layer-boundary-audit.md#app-screen-css) |
| [src/app/browser/arena/trial-overlay.ts](../../src/app/browser/arena/trial-overlay.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/arena/view.ts](../../src/app/browser/arena/view.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/asset-url.ts](../../src/app/browser/asset-url.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/audio/game-audio.ts](../../src/app/browser/audio/game-audio.ts) | Crypt worker presentation, visibility, input or audio | [APP-FLAGS](layer-boundary-audit.md#app-flags) |
| [src/app/browser/build-identity.ts](../../src/app/browser/build-identity.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/character-lab/main.ts](../../src/app/browser/character-lab/main.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/character-lab/style.css](../../src/app/browser/character-lab/style.css) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/context.ts](../../src/app/browser/context.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/browser/dom.ts](../../src/app/browser/dom.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/dungeon/camera.ts](../../src/app/browser/dungeon/camera.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/crypt-weathering.ts](../../src/app/browser/dungeon/crypt-weathering.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/fire.ts](../../src/app/browser/dungeon/fire.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/fog-plugin.ts](../../src/app/browser/dungeon/fog-plugin.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/hover.ts](../../src/app/browser/dungeon/hover.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/light-proxy.ts](../../src/app/browser/dungeon/light-proxy.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/lighting.ts](../../src/app/browser/dungeon/lighting.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/look-probe.ts](../../src/app/browser/dungeon/look-probe.ts) | Arena or Crypt presentation, player input and worker readouts | — |
| [src/app/browser/dungeon/main.ts](../../src/app/browser/dungeon/main.ts) | Crypt worker presentation, visibility, input or audio | [APP-BUILD](layer-boundary-audit.md#app-build), [APP-FLAGS](layer-boundary-audit.md#app-flags) |
| [src/app/browser/dungeon/masonry.ts](../../src/app/browser/dungeon/masonry.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/dungeon/reference-look.ts](../../src/app/browser/dungeon/reference-look.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/dungeon/run-attributes.ts](../../src/app/browser/dungeon/run-attributes.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/dungeon/run-minds.ts](../../src/app/browser/dungeon/run-minds.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/dungeon/run-view.ts](../../src/app/browser/dungeon/run-view.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/dungeon/scenery-visibility.ts](../../src/app/browser/dungeon/scenery-visibility.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/dungeon/stone.ts](../../src/app/browser/dungeon/stone.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/dungeon/style.css](../../src/app/browser/dungeon/style.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/dungeon/world.ts](../../src/app/browser/dungeon/world.ts) | Crypt worker presentation, visibility, input or audio | — |
| [src/app/browser/environment/crypt-kit.ts](../../src/app/browser/environment/crypt-kit.ts) | Crypt worker presentation, visibility, input or audio | [APP-FLAGS](layer-boundary-audit.md#app-flags) |
| [src/app/browser/evaluation.ts](../../src/app/browser/evaluation.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/browser/game.ts](../../src/app/browser/game.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/browser/isolate.ts](../../src/app/browser/isolate.ts) | Browser presentation, editing or application setup | [APP-SW-SCOPE](layer-boundary-audit.md#app-sw-scope) |
| [src/app/browser/lab/attack-scenario.ts](../../src/app/browser/lab/attack-scenario.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/camera.ts](../../src/app/browser/lab/camera.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/ground-disc.ts](../../src/app/browser/lab/ground-disc.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/ground-scenario.ts](../../src/app/browser/lab/ground-scenario.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/history.ts](../../src/app/browser/lab/history.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/hud/character-section.ts](../../src/app/browser/lab/hud/character-section.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/hud/controls-section.ts](../../src/app/browser/lab/hud/controls-section.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/hud/scenario-section.ts](../../src/app/browser/lab/hud/scenario-section.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/hud/sections.ts](../../src/app/browser/lab/hud/sections.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/hud/thinking-section.ts](../../src/app/browser/lab/hud/thinking-section.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/hud/transport.ts](../../src/app/browser/lab/hud/transport.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/hud/view-section.ts](../../src/app/browser/lab/hud/view-section.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/lab-scenario.ts](../../src/app/browser/lab/lab-scenario.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/locomotion-scenario.ts](../../src/app/browser/lab/locomotion-scenario.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/main.ts](../../src/app/browser/lab/main.ts) | Browser Lab, character presentation and Ratings | [APP-BUILD](layer-boundary-audit.md#app-build) |
| [src/app/browser/lab/mind-log.ts](../../src/app/browser/lab/mind-log.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/reach-scenario.ts](../../src/app/browser/lab/reach-scenario.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/setup.ts](../../src/app/browser/lab/setup.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/sound-log.ts](../../src/app/browser/lab/sound-log.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/stance-scenario.ts](../../src/app/browser/lab/stance-scenario.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/lab/style.css](../../src/app/browser/lab/style.css) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/menu.css](../../src/app/browser/menu.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/physics-bench/cases.ts](../../src/app/browser/physics-bench/cases.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/physics-bench/chosen.ts](../../src/app/browser/physics-bench/chosen.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/physics-bench/control.ts](../../src/app/browser/physics-bench/control.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/physics-bench/engines/mujoco.ts](../../src/app/browser/physics-bench/engines/mujoco.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/physics-bench/engines/rapier.ts](../../src/app/browser/physics-bench/engines/rapier.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/physics-bench/engines/types.ts](../../src/app/browser/physics-bench/engines/types.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/physics-bench/main.ts](../../src/app/browser/physics-bench/main.ts) | Explicit independent physics comparison harness | [APP-BENCH-RUN](layer-boundary-audit.md#app-bench-run) |
| [src/app/browser/physics-bench/math.ts](../../src/app/browser/physics-bench/math.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/physics-bench/model.ts](../../src/app/browser/physics-bench/model.ts) | Explicit independent physics comparison harness | — |
| [src/app/browser/ratings/analysis.ts](../../src/app/browser/ratings/analysis.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/ratings/main.ts](../../src/app/browser/ratings/main.ts) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/ratings/records.ts](../../src/app/browser/ratings/records.ts) | Browser Lab, character presentation and Ratings | [AE01](layer-boundary-audit.md#ae01) |
| [src/app/browser/ratings/style.css](../../src/app/browser/ratings/style.css) | Browser Lab, character presentation and Ratings | — |
| [src/app/browser/render/art-assets.ts](../../src/app/browser/render/art-assets.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/asset-cache.ts](../../src/app/browser/render/asset-cache.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/body-deformation.ts](../../src/app/browser/render/body-deformation.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/body-shapes.ts](../../src/app/browser/render/body-shapes.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/camera-math.ts](../../src/app/browser/render/camera-math.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/character-preview.ts](../../src/app/browser/render/character-preview.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/club-grip.ts](../../src/app/browser/render/club-grip.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/drawn-body.ts](../../src/app/browser/render/drawn-body.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/dress.ts](../../src/app/browser/render/dress.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/fire.ts](../../src/app/browser/render/fire.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/fist.ts](../../src/app/browser/render/fist.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/glb.ts](../../src/app/browser/render/glb.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/materials.ts](../../src/app/browser/render/materials.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/post.ts](../../src/app/browser/render/post.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/puppet.ts](../../src/app/browser/render/puppet.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/ready.ts](../../src/app/browser/render/ready.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/robot-futuristic.ts](../../src/app/browser/render/robot-futuristic.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/robot-geometry.ts](../../src/app/browser/render/robot-geometry.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/robot-industrial.ts](../../src/app/browser/render/robot-industrial.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/robot-skin.ts](../../src/app/browser/render/robot-skin.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/robot-steampunk.ts](../../src/app/browser/render/robot-steampunk.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/scene-profile.ts](../../src/app/browser/render/scene-profile.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/skeleton-skin.ts](../../src/app/browser/render/skeleton-skin.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/skin-apart.ts](../../src/app/browser/render/skin-apart.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/skin-slot.ts](../../src/app/browser/render/skin-slot.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/skin-view.ts](../../src/app/browser/render/skin-view.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/skin.ts](../../src/app/browser/render/skin.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/skinned-art.ts](../../src/app/browser/render/skinned-art.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/solid-geometry.ts](../../src/app/browser/render/solid-geometry.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/strike-hands.ts](../../src/app/browser/render/strike-hands.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/render/surface.ts](../../src/app/browser/render/surface.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/setup.ts](../../src/app/browser/setup.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/browser/ui/action-readout.ts](../../src/app/browser/ui/action-readout.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/attribute-editor.ts](../../src/app/browser/ui/attribute-editor.ts) | Browser presentation, editing or application setup | [APP-REFUSAL](layer-boundary-audit.md#app-refusal) |
| [src/app/browser/ui/attributes.css](../../src/app/browser/ui/attributes.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/ui/choices.ts](../../src/app/browser/ui/choices.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/controls.ts](../../src/app/browser/ui/controls.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/editor-inputs.ts](../../src/app/browser/ui/editor-inputs.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/frame-meter.css](../../src/app/browser/ui/frame-meter.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/ui/frame-meter.ts](../../src/app/browser/ui/frame-meter.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/inputs.ts](../../src/app/browser/ui/inputs.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/mind-editor.ts](../../src/app/browser/ui/mind-editor.ts) | Browser presentation, editing or application setup | [APP-EDITOR](layer-boundary-audit.md#app-editor) |
| [src/app/browser/ui/mind-ground.ts](../../src/app/browser/ui/mind-ground.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/mind-inspector.ts](../../src/app/browser/ui/mind-inspector.ts) | Browser presentation, editing or application setup | [APP-INSPECTOR](layer-boundary-audit.md#app-inspector) |
| [src/app/browser/ui/mind-notes.ts](../../src/app/browser/ui/mind-notes.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/mind-regions.ts](../../src/app/browser/ui/mind-regions.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/mind.css](../../src/app/browser/ui/mind.css) | Presentation templates/styles or authored build/asset configuration | — |
| [src/app/browser/ui/readiness.ts](../../src/app/browser/ui/readiness.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/screen.ts](../../src/app/browser/ui/screen.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/ui/view-controls.ts](../../src/app/browser/ui/view-controls.ts) | Browser presentation, editing or application setup | — |
| [src/app/browser/worker/client.ts](../../src/app/browser/worker/client.ts) | Worker protocol/lifecycle and browser application binding | [APP-PENDING](layer-boundary-audit.md#app-pending), [APP-REQUESTS](layer-boundary-audit.md#app-requests) |
| [src/app/browser/worker/mind.worker.ts](../../src/app/browser/worker/mind.worker.ts) | Worker protocol/lifecycle and browser application binding | [APP-LOADERS](layer-boundary-audit.md#app-loaders), [APP-RING](layer-boundary-audit.md#app-ring) |
| [src/app/browser/worker/minds.ts](../../src/app/browser/worker/minds.ts) | Worker protocol/lifecycle and browser application binding | [APP-RING](layer-boundary-audit.md#app-ring) |
| [src/app/browser/worker/serve.ts](../../src/app/browser/worker/serve.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/browser/worker/world.worker.ts](../../src/app/browser/worker/world.worker.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/catalog.ts](../../src/app/catalog.ts) | Application catalog and model defaults/refusals | — |
| [src/app/commanded-body.ts](../../src/app/commanded-body.ts) | Explicit standalone stock motor assembly | — |
| [src/app/context.ts](../../src/app/context.ts) | Immutable game context binding | — |
| [src/app/data/registration.ts](../../src/app/data/registration.ts) | Application aggregation of implementation-owned loaders | — |
| [src/app/entrants.ts](../../src/app/entrants.ts) | Application entrant manifest registration | — |
| [src/app/evaluation.ts](../../src/app/evaluation.ts) | Evaluation factories bound to one supplied context | — |
| [src/app/game.ts](../../src/app/game.ts) | Gameplay factories bound to one supplied context | — |
| [src/app/mind-kinds.ts](../../src/app/mind-kinds.ts) | Application controller registration | — |
| [src/app/node/build-identity.ts](../../src/app/node/build-identity.ts) | Node build-identity adapter | — |
| [src/app/node/context.ts](../../src/app/node/context.ts) | Node binding of runtime-neutral context | — |
| [src/app/node/evaluation.ts](../../src/app/node/evaluation.ts) | Node evaluation facade and factory exports | — |
| [src/app/node/game.ts](../../src/app/node/game.ts) | Node gameplay facade and same-constructor type exports | — |
| [src/app/node/mind-worker.ts](../../src/app/node/mind-worker.ts) | Node worker lifetime, startup data loading and atomic signaling | [APP-LOADERS](layer-boundary-audit.md#app-loaders) |
| [src/app/node/minds.ts](../../src/app/node/minds.ts) | Node worker factory, wait/stop and resource cleanup | — |
| [src/app/node/setup.ts](../../src/app/node/setup.ts) | Node scenario/configuration facades | — |
| [src/app/node/worker-threads.d.ts](../../src/app/node/worker-threads.d.ts) | Local ambient Node transport declarations | — |
| [src/app/option-controller.ts](../../src/app/option-controller.ts) | Concrete application registration and default assembly | — |
| [src/app/option-defaults.ts](../../src/app/option-defaults.ts) | Concrete application registration and default assembly | — |
| [src/app/quadruped-parts.ts](../../src/app/quadruped-parts.ts) | Concrete application registration and default assembly | — |
| [src/app/recovery-leg-adapters.ts](../../src/app/recovery-leg-adapters.ts) | Concrete application registration and default assembly | — |
| [src/app/recovery-selections.ts](../../src/app/recovery-selections.ts) | Concrete application registration and default assembly | — |
| [src/app/recovery-techniques.ts](../../src/app/recovery-techniques.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/aims.ts](../../src/app/registration/aims.ts) | Concrete application registration and default assembly | [ROOT-AIMS](layer-boundary-audit.md#root-aims) |
| [src/app/registration/balances.ts](../../src/app/registration/balances.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/executors.ts](../../src/app/registration/executors.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/gait-parts.ts](../../src/app/registration/gait-parts.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/guards.ts](../../src/app/registration/guards.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/locomotions.ts](../../src/app/registration/locomotions.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/motors.ts](../../src/app/registration/motors.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/move-rules.ts](../../src/app/registration/move-rules.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/navigations.ts](../../src/app/registration/navigations.ts) | Concrete application registration and default assembly | — |
| [src/app/registration/supports.ts](../../src/app/registration/supports.ts) | Concrete application registration and default assembly | — |
| [src/app/standing-skills.ts](../../src/app/standing-skills.ts) | Concrete application registration and default assembly | — |
| [src/app/toolkit.ts](../../src/app/toolkit.ts) | Concrete application registration and default assembly | — |
| [src/app/worker/crypt-stage.ts](../../src/app/worker/crypt-stage.ts) | Worker protocol/lifecycle and browser application binding | [APP-BUILD](layer-boundary-audit.md#app-build) |
| [src/app/worker/duel-stage.ts](../../src/app/worker/duel-stage.ts) | Worker protocol/lifecycle and browser application binding | [APP-BUILD](layer-boundary-audit.md#app-build) |
| [src/app/worker/frame.ts](../../src/app/worker/frame.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/worker/inspection.ts](../../src/app/worker/inspection.ts) | Worker protocol/lifecycle and browser application binding | — |
| [src/app/worker/protocol.ts](../../src/app/worker/protocol.ts) | Worker protocol/lifecycle and browser application binding | [APP-REQUESTS](layer-boundary-audit.md#app-requests) |
| [src/app/worker/stage.ts](../../src/app/worker/stage.ts) | Worker protocol/lifecycle and browser application binding | [APP-BUILD](layer-boundary-audit.md#app-build) |

## src/combat

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/combat/blows.ts](../../src/combat/blows.ts) | Contact impact/load injury publication | [FND-010](layer-boundary-audit.md#fnd-010) |
| [src/combat/impact.ts](../../src/combat/impact.ts) | Relative closing impact energy | — |
| [src/combat/points.ts](../../src/combat/points.ts) | Directed mechanism cone predicate | — |
| [src/combat/pool.ts](../../src/combat/pool.ts) | Life/limb wound policy and physical wound effects | — |
| [src/combat/rulebook.ts](../../src/combat/rulebook.ts) | Fight scoring, injury and assist rules | [FND-009](layer-boundary-audit.md#fnd-009) |
| [src/combat/share.ts](../../src/combat/share.ts) | Compliance energy sharing | — |
| [src/combat/touches.ts](../../src/combat/touches.ts) | New physical contact events and pricing | [FND-018](layer-boundary-audit.md#fnd-018) |

## src/control

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/control/approach.ts](../../src/control/approach.ts) | Control approach implementation/contract | — |
| [src/control/balance-part.ts](../../src/control/balance-part.ts) | Control balance-part implementation/contract | — |
| [src/control/bearing.ts](../../src/control/bearing.ts) | Arbitrary limb bearing and bounded torque solve | — |
| [src/control/body.ts](../../src/control/body.ts) | Command-layer Body/BodyView contracts | — |
| [src/control/contact-wrench.ts](../../src/control/contact-wrench.ts) | Unilateral/friction contact wrench distribution | — |
| [src/control/effector-feedback.ts](../../src/control/effector-feedback.ts) | Physical endpoint contact feedback and strike-response predicates | [FND-013](layer-boundary-audit.md#fnd-013) |
| [src/control/effector-tracker.ts](../../src/control/effector-tracker.ts) | Control effector-tracker implementation/contract | — |
| [src/control/effectors.ts](../../src/control/effectors.ts) | Control effectors implementation/contract | — |
| [src/control/gait.ts](../../src/control/gait.ts) | Stance-private biped footstep planner | [FND-021](layer-boundary-audit.md#fnd-021), [FND-022](layer-boundary-audit.md#fnd-022) |
| [src/control/ground-reading.ts](../../src/control/ground-reading.ts) | Declared-support posture and ground observations | — |
| [src/control/ground.ts](../../src/control/ground.ts) | Control ground implementation/contract | — |
| [src/control/held.ts](../../src/control/held.ts) | Control held implementation/contract | — |
| [src/control/kinematics.ts](../../src/control/kinematics.ts) | Generic chain forward/inverse kinematics | — |
| [src/control/motor-part.ts](../../src/control/motor-part.ts) | Control motor-part implementation/contract | — |
| [src/control/motor.ts](../../src/control/motor.ts) | Whole-body motor contracts and implementation | — |
| [src/control/observation.ts](../../src/control/observation.ts) | Detached trusted physical observations | [FND-011](layer-boundary-audit.md#fnd-011) |
| [src/control/point-path.ts](../../src/control/point-path.ts) | Control point-path implementation/contract | — |
| [src/control/quadruped/fit.ts](../../src/control/quadruped/fit.ts) | Paw motor fit and bite jaw fit | [FND-013](layer-boundary-audit.md#fnd-013) |
| [src/control/quadruped/motion.ts](../../src/control/quadruped/motion.ts) | Control quadruped/motion implementation/contract | — |
| [src/control/quadruped/paw-motor.ts](../../src/control/quadruped/paw-motor.ts) | Paw support motor implementation | — |
| [src/control/quadruped/paws.ts](../../src/control/quadruped/paws.ts) | Control quadruped/paws implementation/contract | — |
| [src/control/quadruped/tuning.ts](../../src/control/quadruped/tuning.ts) | Control quadruped/tuning implementation/contract | — |
| [src/control/recovery-measurement.ts](../../src/control/recovery-measurement.ts) | Two-foot recovery/Lab handover measurement | [FND-014](layer-boundary-audit.md#fnd-014) |
| [src/control/recovery-ready.ts](../../src/control/recovery-ready.ts) | Physical recovery support gate | — |
| [src/control/servo.ts](../../src/control/servo.ts) | Computed-torque servo | [FND-015](layer-boundary-audit.md#fnd-015) |
| [src/control/solve.ts](../../src/control/solve.ts) | Whole-body floating goal-to-torque solver | — |
| [src/control/stance-balance.ts](../../src/control/stance-balance.ts) | Control stance-balance implementation/contract | — |
| [src/control/stance-envelope.ts](../../src/control/stance-envelope.ts) | Calibration schema, interpolation, protocol and asset providers | [FND-012](layer-boundary-audit.md#fnd-012) |
| [src/control/stance-state.ts](../../src/control/stance-state.ts) | Control stance-state implementation/contract | [FND-021](layer-boundary-audit.md#fnd-021) |
| [src/control/stance-tuning.ts](../../src/control/stance-tuning.ts) | Stance controller tuning contract/defaults | — |
| [src/control/stance.ts](../../src/control/stance.ts) | Bilateral stance motor implementation and goals | [FND-022](layer-boundary-audit.md#fnd-022) |
| [src/control/support-readiness.ts](../../src/control/support-readiness.ts) | Stomp striking base readiness | [FND-013](layer-boundary-audit.md#fnd-013) |
| [src/control/support.ts](../../src/control/support.ts) | Bilateral box-sole geometry and shared support helpers | [FND-019](layer-boundary-audit.md#fnd-019), [FND-020](layer-boundary-audit.md#fnd-020), [ROOT-SUPPORT](layer-boundary-audit.md#root-support) |
| [src/control/supported-motor.ts](../../src/control/supported-motor.ts) | Arbitrary support-chain motor solve | — |
| [src/control/swing-leg.ts](../../src/control/swing-leg.ts) | Biped stance swing timing/reaction model | [FND-020](layer-boundary-audit.md#fnd-020) |
| [src/control/swing-path.ts](../../src/control/swing-path.ts) | Control swing-path implementation/contract | — |
| [src/control/whole-body-motor.ts](../../src/control/whole-body-motor.ts) | Control whole-body-motor implementation/contract | — |
| [src/control/whole-body/intercept.ts](../../src/control/whole-body/intercept.ts) | Plane prediction and interception reference policy | — |
| [src/control/whole-body/joint-stops.ts](../../src/control/whole-body/joint-stops.ts) | Control whole-body/joint-stops implementation/contract | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/control/whole-body/point-motion.ts](../../src/control/whole-body/point-motion.ts) | Control whole-body/point-motion implementation/contract | — |
| [src/control/whole-body/tasks.ts](../../src/control/whole-body/tasks.ts) | Control whole-body/tasks implementation/contract | [EXP-001](layer-boundary-audit.md#exp-001) |

## src/core

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/core/bodies/assist.ts](../../src/core/bodies/assist.ts) | Metered delayed non-muscle wrench | — |
| [src/core/bodies/bilateral.ts](../../src/core/bodies/bilateral.ts) | Bilateral anatomy vocabulary | — |
| [src/core/bodies/body-control.ts](../../src/core/bodies/body-control.ts) | Mind physical command contract | — |
| [src/core/bodies/build/build-body.ts](../../src/core/bodies/build/build-body.ts) | Spec-to-engine construction and initial kinematics | — |
| [src/core/bodies/build/collider.ts](../../src/core/bodies/build/collider.ts) | Spec geometry to adapter collider representation | — |
| [src/core/bodies/build/configurations.ts](../../src/core/bodies/build/configurations.ts) | Declared physical collision configuration changes | — |
| [src/core/bodies/build/constrained-mass.ts](../../src/core/bodies/build/constrained-mass.ts) | Diagnostic constrained rigid mobility | — |
| [src/core/bodies/build/contact-mass.ts](../../src/core/bodies/build/contact-mass.ts) | Floating physical impact mobility and held-muscle yielding | [FND-018](layer-boundary-audit.md#fnd-018) |
| [src/core/bodies/build/contact-step.ts](../../src/core/bodies/build/contact-step.ts) | Offline fixed-plane contact prediction | — |
| [src/core/bodies/build/coupled-dynamics.ts](../../src/core/bodies/build/coupled-dynamics.ts) | Diagnostic coupled body/item acceleration model | — |
| [src/core/bodies/build/dynamics.ts](../../src/core/bodies/build/dynamics.ts) | Body/root mass and velocity-bias model | — |
| [src/core/bodies/build/joint-coordinate.ts](../../src/core/bodies/build/joint-coordinate.ts) | Diagnostic measured joint coordinate motion | — |
| [src/core/bodies/build/joint-kinematics.ts](../../src/core/bodies/build/joint-kinematics.ts) | Spec joint axes and signs | — |
| [src/core/bodies/build/joint-state.ts](../../src/core/bodies/build/joint-state.ts) | Joint angles, rates and kinematic transforms | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/core/bodies/build/planar-support.ts](../../src/core/bodies/build/planar-support.ts) | Diagnostic plane support geometry | — |
| [src/core/bodies/build/read-view.ts](../../src/core/bodies/build/read-view.ts) | Physical read-only adapter projections | [FND-017](layer-boundary-audit.md#fnd-017) |
| [src/core/bodies/build/rigid.ts](../../src/core/bodies/build/rigid.ts) | Compound rigid mass and shape ownership | — |
| [src/core/bodies/build/segment-shapes.ts](../../src/core/bodies/build/segment-shapes.ts) | Physical configuration/toe shape variants | — |
| [src/core/bodies/build/toes.ts](../../src/core/bodies/build/toes.ts) | Passive quantized toe geometry | — |
| [src/core/bodies/character-attributes.ts](../../src/core/bodies/character-attributes.ts) | Character attribute declaration, validation and editor metadata | [FND-006](layer-boundary-audit.md#fnd-006) |
| [src/core/bodies/command-pipeline.ts](../../src/core/bodies/command-pipeline.ts) | Delayed physical assist/configuration commands | — |
| [src/core/bodies/contact-identity.ts](../../src/core/bodies/contact-identity.ts) | Detached physical contact identity | — |
| [src/core/bodies/equipment.ts](../../src/core/bodies/equipment.ts) | Independent item and grip physics | — |
| [src/core/bodies/human/attributes.ts](../../src/core/bodies/human/attributes.ts) | Human capability sourcing and haste scaling | — |
| [src/core/bodies/human/endpoints.ts](../../src/core/bodies/human/endpoints.ts) | Human knuckle endpoint lookup | — |
| [src/core/bodies/human/envelope.ts](../../src/core/bodies/human/envelope.ts) | Measured workshop collision envelope | — |
| [src/core/bodies/human/figure.ts](../../src/core/bodies/human/figure.ts) | Human figure assembly input contract | — |
| [src/core/bodies/human/gait.ts](../../src/core/bodies/human/gait.ts) | Sourced human gait references | — |
| [src/core/bodies/human/grip.ts](../../src/core/bodies/human/grip.ts) | Human physical haft assembly | — |
| [src/core/bodies/human/hand-configurations.ts](../../src/core/bodies/human/hand-configurations.ts) | Human hand collision vocabulary | — |
| [src/core/bodies/human/hands.ts](../../src/core/bodies/human/hands.ts) | Measured human hand geometry | — |
| [src/core/bodies/human/joints.ts](../../src/core/bodies/human/joints.ts) | Human joint anatomical construction | — |
| [src/core/bodies/human/landmarks.ts](../../src/core/bodies/human/landmarks.ts) | Human rig anatomical landmarks | — |
| [src/core/bodies/human/model.ts](../../src/core/bodies/human/model.ts) | Workshop body scale and mass | — |
| [src/core/bodies/human/muscle.ts](../../src/core/bodies/human/muscle.ts) | Human peak torque derivation | — |
| [src/core/bodies/human/physique.ts](../../src/core/bodies/human/physique.ts) | Human figure physical modifiers | — |
| [src/core/bodies/human/rig.ts](../../src/core/bodies/human/rig.ts) | Workshop rig source adapter | — |
| [src/core/bodies/human/segments.ts](../../src/core/bodies/human/segments.ts) | Human segment mass, inertia and contact geometry | — |
| [src/core/bodies/human/skeleton.ts](../../src/core/bodies/human/skeleton.ts) | Skeleton physical figure and motor body variant | — |
| [src/core/bodies/human/spec.ts](../../src/core/bodies/human/spec.ts) | Human body-plan assembly | — |
| [src/core/bodies/human/speed.ts](../../src/core/bodies/human/speed.ts) | Human force-velocity derivation | — |
| [src/core/bodies/human/tables/abe-2003.ts](../../src/core/bodies/human/tables/abe-2003.ts) | Sourced human anatomical reference table | — |
| [src/core/bodies/human/tables/contact-stiffness.ts](../../src/core/bodies/human/tables/contact-stiffness.ts) | Sourced human anatomical reference table | — |
| [src/core/bodies/human/tables/de-leva-1996.ts](../../src/core/bodies/human/tables/de-leva-1996.ts) | Sourced human anatomical reference table | — |
| [src/core/bodies/human/tables/densities.ts](../../src/core/bodies/human/tables/densities.ts) | Sourced human anatomical reference table | — |
| [src/core/bodies/human/tables/force-velocity.ts](../../src/core/bodies/human/tables/force-velocity.ts) | Sourced human anatomical reference table | — |
| [src/core/bodies/human/tables/joint-torques.ts](../../src/core/bodies/human/tables/joint-torques.ts) | Sourced human anatomical reference table | — |
| [src/core/bodies/human/tables/range-of-motion.ts](../../src/core/bodies/human/tables/range-of-motion.ts) | Sourced human anatomical reference table | — |
| [src/core/bodies/human/toes.ts](../../src/core/bodies/human/toes.ts) | Human toe anatomy | — |
| [src/core/bodies/human/workshop.ts](../../src/core/bodies/human/workshop.ts) | Workshop human figure assembly | — |
| [src/core/bodies/human/wounds.ts](../../src/core/bodies/human/wounds.ts) | Human wound groups and character pools | — |
| [src/core/bodies/index.ts](../../src/core/bodies/index.ts) | Published body contract entrypoint | — |
| [src/core/bodies/items/buckler.ts](../../src/core/bodies/items/buckler.ts) | Sourced physical buckler specification | — |
| [src/core/bodies/items/club.ts](../../src/core/bodies/items/club.ts) | Sourced physical club specification | — |
| [src/core/bodies/items/held.ts](../../src/core/bodies/items/held.ts) | Bilateral equipment assembly and rating loadouts | [FND-008](layer-boundary-audit.md#fnd-008) |
| [src/core/bodies/items/sword.ts](../../src/core/bodies/items/sword.ts) | Sourced sword geometry and directed contact regions | — |
| [src/core/bodies/models.ts](../../src/core/bodies/models.ts) | Concrete model catalog, physical resolution and equipment defaults | [FND-007](layer-boundary-audit.md#fnd-007) |
| [src/core/bodies/muscle/driver.ts](../../src/core/bodies/muscle/driver.ts) | Delayed muscle actuation and levels | — |
| [src/core/bodies/muscle/force-velocity.ts](../../src/core/bodies/muscle/force-velocity.ts) | Shared muscle force/speed law | — |
| [src/core/bodies/object-senses.ts](../../src/core/bodies/object-senses.ts) | Explicit external geometry grants and delayed object readings | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/core/bodies/own-body.ts](../../src/core/bodies/own-body.ts) | Mind-owned physical facts and read contract | — |
| [src/core/bodies/quadruped/physique.ts](../../src/core/bodies/quadruped/physique.ts) | Quadruped physical modifiers | — |
| [src/core/bodies/quadruped/spec.ts](../../src/core/bodies/quadruped/spec.ts) | Quadruped asset-to-body construction | — |
| [src/core/bodies/read-body.ts](../../src/core/bodies/read-body.ts) | Read-only body and contact contracts | — |
| [src/core/bodies/read-motion.ts](../../src/core/bodies/read-motion.ts) | Physical mass/motion readings | — |
| [src/core/bodies/senses.ts](../../src/core/bodies/senses.ts) | Detached perception contracts | — |
| [src/core/bodies/sources.ts](../../src/core/bodies/sources.ts) | Physical and policy quantity source catalog | — |
| [src/core/bodies/spec/body.ts](../../src/core/bodies/spec/body.ts) | Body/segment/effector/physical configuration declarations | — |
| [src/core/bodies/spec/clearance.ts](../../src/core/bodies/spec/clearance.ts) | Reference shape intersection validation | — |
| [src/core/bodies/spec/constants.ts](../../src/core/bodies/spec/constants.ts) | Shared physical constants | — |
| [src/core/bodies/spec/geometry.ts](../../src/core/bodies/spec/geometry.ts) | Spec geometric derivation formulas | — |
| [src/core/bodies/spec/hull.ts](../../src/core/bodies/spec/hull.ts) | Convex hull construction | — |
| [src/core/bodies/spec/pose.ts](../../src/core/bodies/spec/pose.ts) | Named angle pose type | — |
| [src/core/bodies/spec/quantity.ts](../../src/core/bodies/spec/quantity.ts) | Sourced and derived immutable quantities | — |
| [src/core/bodies/spec/shape-bounds.ts](../../src/core/bodies/spec/shape-bounds.ts) | Reference/local shape bounds | — |
| [src/core/bodies/spec/vec.ts](../../src/core/bodies/spec/vec.ts) | Spec tuple vector arithmetic | — |
| [src/core/data/store.ts](../../src/core/data/store.ts) | Declared keyed immutable-data loader cache | — |
| [src/core/math/active-kernel.ts](../../src/core/math/active-kernel.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/active-quadratic.ts](../../src/core/math/active-quadratic.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/flat.ts](../../src/core/math/flat.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/index.ts](../../src/core/math/index.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/learning/learner.ts](../../src/core/math/learning/learner.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/learning/recovery-network.ts](../../src/core/math/learning/recovery-network.ts) | Numeric network inference and validation | [FND-016](layer-boundary-audit.md#fnd-016) |
| [src/core/math/linalg.ts](../../src/core/math/linalg.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/quadratic.ts](../../src/core/math/quadratic.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/random.ts](../../src/core/math/random.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/real.ts](../../src/core/math/real.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/rng.ts](../../src/core/math/rng.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/turn.ts](../../src/core/math/turn.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/math/vector.ts](../../src/core/math/vector.ts) | Deterministic numeric/vector/optimization primitive | — |
| [src/core/physics/engine.ts](../../src/core/physics/engine.ts) | Physics adapter contract | — |
| [src/core/physics/engines.ts](../../src/core/physics/engines.ts) | Physics engine/profile catalog | — |
| [src/core/physics/rapier.ts](../../src/core/physics/rapier.ts) | Vendored Rapier adapter | [FND-017](layer-boundary-audit.md#fnd-017) |
| [src/core/world/clock.ts](../../src/core/world/clock.ts) | Read-only live clock projection | — |
| [src/core/world/command-delay.ts](../../src/core/world/command-delay.ts) | Saved command delay ring | — |
| [src/core/world/index.ts](../../src/core/world/index.ts) | Public plain-state utilities | — |
| [src/core/world/recording.ts](../../src/core/world/recording.ts) | Content/protocol/configuration identity | — |
| [src/core/world/senses.ts](../../src/core/world/senses.ts) | World-owned delayed body sensing | — |
| [src/core/world/state.ts](../../src/core/world/state.ts) | Plain state serialization and restoration | [FND-004](layer-boundary-audit.md#fnd-004), [FND-005](layer-boundary-audit.md#fnd-005) |
| [src/core/world/world.ts](../../src/core/world/world.ts) | Fixed-step world and hook phases | — |

## src/entrants

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/entrants/bare/index.ts](../../src/entrants/bare/index.ts) | Entrant-owned manifest and fighter configuration or direct network computation | — |
| [src/entrants/bare/mind.ts](../../src/entrants/bare/mind.ts) | Entrant-owned manifest and fighter configuration or direct network computation | — |
| [src/entrants/option/index.ts](../../src/entrants/option/index.ts) | Entrant-owned manifest and fighter configuration or direct network computation | — |
| [src/entrants/option/mind.ts](../../src/entrants/option/mind.ts) | Entrant-owned manifest and fighter configuration or direct network computation | — |
| [src/entrants/option/options.ts](../../src/entrants/option/options.ts) | Entrant-owned manifest and fighter configuration or direct network computation | — |
| [src/entrants/walker/index.ts](../../src/entrants/walker/index.ts) | Entrant-owned manifest and fighter configuration or direct network computation | [MG02](layer-boundary-audit.md#mg02) |

## src/evaluation

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/evaluation/baseline/cases.ts](../../src/evaluation/baseline/cases.ts) | Evaluation core, identity, scheduling and world builders | [MG14](layer-boundary-audit.md#mg14) |
| [src/evaluation/baseline/index.ts](../../src/evaluation/baseline/index.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/bout.ts](../../src/evaluation/bout.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/code.ts](../../src/evaluation/code.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/compare.ts](../../src/evaluation/compare.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/contest.ts](../../src/evaluation/contest.ts) | Evaluation core, identity, scheduling and world builders | [MG22](layer-boundary-audit.md#mg22) |
| [src/evaluation/court/cases.ts](../../src/evaluation/court/cases.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/court/index.ts](../../src/evaluation/court/index.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/cover/cases.ts](../../src/evaluation/cover/cases.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/cover/index.ts](../../src/evaluation/cover/index.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/cover/read.ts](../../src/evaluation/cover/read.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/crowd/cases.ts](../../src/evaluation/crowd/cases.ts) | Evaluation core, identity, scheduling and world builders | [MG16](layer-boundary-audit.md#mg16) |
| [src/evaluation/crowd/index.ts](../../src/evaluation/crowd/index.ts) | Evaluation core, identity, scheduling and world builders | [MG16](layer-boundary-audit.md#mg16) |
| [src/evaluation/crypt-clear/cases.ts](../../src/evaluation/crypt-clear/cases.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/crypt-clear/index.ts](../../src/evaluation/crypt-clear/index.ts) | Evaluation core, identity, scheduling and world builders | [MG10](layer-boundary-audit.md#mg10) |
| [src/evaluation/crypt.ts](../../src/evaluation/crypt.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/drill-opponents.ts](../../src/evaluation/drill-opponents.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/evaluation.ts](../../src/evaluation/evaluation.ts) | Evaluation core, identity, scheduling and world builders | [MG22](layer-boundary-audit.md#mg22) |
| [src/evaluation/evaluations.ts](../../src/evaluation/evaluations.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/fall.ts](../../src/evaluation/fall.ts) | Evaluation core, identity, scheduling and world builders | [APP-BUILD](layer-boundary-audit.md#app-build), [MG12](layer-boundary-audit.md#mg12) |
| [src/evaluation/history.ts](../../src/evaluation/history.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/lanes.ts](../../src/evaluation/lanes.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/locomotion/cases.ts](../../src/evaluation/locomotion/cases.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/locomotion/index.ts](../../src/evaluation/locomotion/index.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/locomotion/read.ts](../../src/evaluation/locomotion/read.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/lone.ts](../../src/evaluation/lone.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/match/cases.ts](../../src/evaluation/match/cases.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/match/index.ts](../../src/evaluation/match/index.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/play.ts](../../src/evaluation/play.ts) | Evaluation core, identity, scheduling and world builders | [APP-BUILD](layer-boundary-audit.md#app-build) |
| [src/evaluation/rating.ts](../../src/evaluation/rating.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/record-comparison.ts](../../src/evaluation/record-comparison.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/record.ts](../../src/evaluation/record.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/rise/cases.ts](../../src/evaluation/rise/cases.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/rise/index.ts](../../src/evaluation/rise/index.ts) | Skill drills and current stock capability table | [MG17](layer-boundary-audit.md#mg17) |
| [src/evaluation/rising-target/cases.ts](../../src/evaluation/rising-target/cases.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/rising-target/index.ts](../../src/evaluation/rising-target/index.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/rising.ts](../../src/evaluation/rising.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/run.ts](../../src/evaluation/run.ts) | Evaluation core, identity, scheduling and world builders | [MG12](layer-boundary-audit.md#mg12) |
| [src/evaluation/schedule.ts](../../src/evaluation/schedule.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/settle.ts](../../src/evaluation/settle.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/sha256.ts](../../src/evaluation/sha256.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/stand/cases.ts](../../src/evaluation/stand/cases.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/stand/index.ts](../../src/evaluation/stand/index.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/stand/read.ts](../../src/evaluation/stand/read.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/stats.ts](../../src/evaluation/stats.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/strike/cases.ts](../../src/evaluation/strike/cases.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/strike/index.ts](../../src/evaluation/strike/index.ts) | Skill drills and current stock capability table | [MG14](layer-boundary-audit.md#mg14), [MG23](layer-boundary-audit.md#mg23) |
| [src/evaluation/strike/read.ts](../../src/evaluation/strike/read.ts) | Skill drills and current stock capability table | [MG23](layer-boundary-audit.md#mg23) |
| [src/evaluation/strike/score.ts](../../src/evaluation/strike/score.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/table/cells.ts](../../src/evaluation/table/cells.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/table/judge.ts](../../src/evaluation/table/judge.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/technique.ts](../../src/evaluation/technique.ts) | Evaluation core, identity, scheduling and world builders | [APP-BUILD](layer-boundary-audit.md#app-build), [MG12](layer-boundary-audit.md#mg12), [MG18](layer-boundary-audit.md#mg18) |
| [src/evaluation/tournament/cases.ts](../../src/evaluation/tournament/cases.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/tournament/entrants.ts](../../src/evaluation/tournament/entrants.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/tournament/index.ts](../../src/evaluation/tournament/index.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/tournament/notes.ts](../../src/evaluation/tournament/notes.ts) | Skill drills and current stock capability table | — |
| [src/evaluation/trace.ts](../../src/evaluation/trace.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/unseen/cases.ts](../../src/evaluation/unseen/cases.ts) | Evaluation core, identity, scheduling and world builders | [MG16](layer-boundary-audit.md#mg16) |
| [src/evaluation/unseen/index.ts](../../src/evaluation/unseen/index.ts) | Evaluation core, identity, scheduling and world builders | [MG16](layer-boundary-audit.md#mg16) |
| [src/evaluation/world-builders.ts](../../src/evaluation/world-builders.ts) | Evaluation core, identity, scheduling and world builders | — |
| [src/evaluation/worlds.ts](../../src/evaluation/worlds.ts) | Evaluation core, identity, scheduling and world builders | — |

## src/game

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/game/appearance/appearance.ts](../../src/game/appearance/appearance.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/appearance/characters.ts](../../src/game/appearance/characters.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/appearance/models.ts](../../src/game/appearance/models.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/appearance/view.ts](../../src/game/appearance/view.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/arena/choice-watch.ts](../../src/game/arena/choice-watch.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/context.ts](../../src/game/arena/context.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | — |
| [src/game/arena/duel.ts](../../src/game/arena/duel.ts) | Arena bout lifecycle, recording identity, orders, verdict and state root | [MG22](layer-boundary-audit.md#mg22) |
| [src/game/arena/end-rule.ts](../../src/game/arena/end-rule.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | — |
| [src/game/arena/ends.ts](../../src/game/arena/ends.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | — |
| [src/game/arena/ends/damage.ts](../../src/game/arena/ends/damage.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | — |
| [src/game/arena/ends/down.ts](../../src/game/arena/ends/down.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | — |
| [src/game/arena/ends/drain.ts](../../src/game/arena/ends/drain.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | — |
| [src/game/arena/fighter-readout.ts](../../src/game/arena/fighter-readout.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/levels.ts](../../src/game/arena/levels.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/matchup.ts](../../src/game/arena/matchup.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/orders-input.ts](../../src/game/arena/orders-input.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/playback.ts](../../src/game/arena/playback.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/rail.ts](../../src/game/arena/rail.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/shove.ts](../../src/game/arena/shove.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/solids.ts](../../src/game/arena/solids.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/arena/team-bout.ts](../../src/game/arena/team-bout.ts) | Team arena gameplay, physical level policy and furnishing geometry | — |
| [src/game/arena/team.ts](../../src/game/arena/team.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | [MG10](layer-boundary-audit.md#mg10) |
| [src/game/arena/trial-trace.ts](../../src/game/arena/trial-trace.ts) | Arena stage geometry, input picking, replay/playback, readouts and drill fixtures | — |
| [src/game/attribute-link.ts](../../src/game/attribute-link.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/audio/body-sounds.ts](../../src/game/audio/body-sounds.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/audio/cues.ts](../../src/game/audio/cues.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/combatant.ts](../../src/game/combatant.ts) | Gameplay context, combatant enlistment, end rules and Commander delivery adapter | — |
| [src/game/dungeon/actors.ts](../../src/game/dungeon/actors.ts) | Crypt run and character placement | [MG13](layer-boundary-audit.md#mg13) |
| [src/game/dungeon/attribute-placement.ts](../../src/game/dungeon/attribute-placement.ts) | Crypt run and character placement | [MG12](layer-boundary-audit.md#mg12) |
| [src/game/dungeon/bearing.ts](../../src/game/dungeon/bearing.ts) | Crypt run and character placement | — |
| [src/game/dungeon/commands.ts](../../src/game/dungeon/commands.ts) | Crypt run and character placement | — |
| [src/game/dungeon/crypt-archetypes.ts](../../src/game/dungeon/crypt-archetypes.ts) | Crypt generation, geometry and presentation data | — |
| [src/game/dungeon/crypt-dungeon.ts](../../src/game/dungeon/crypt-dungeon.ts) | Crypt generation, geometry and presentation data | [MG12](layer-boundary-audit.md#mg12) |
| [src/game/dungeon/crypt-plan.ts](../../src/game/dungeon/crypt-plan.ts) | Crypt generation, geometry and presentation data | — |
| [src/game/dungeon/decals.ts](../../src/game/dungeon/decals.ts) | Crypt generation, geometry and presentation data | — |
| [src/game/dungeon/door-approach.ts](../../src/game/dungeon/door-approach.ts) | Crypt generation, geometry and presentation data | — |
| [src/game/dungeon/dressing.ts](../../src/game/dungeon/dressing.ts) | Crypt generation, geometry and presentation data | — |
| [src/game/dungeon/encounters.ts](../../src/game/dungeon/encounters.ts) | Crypt run and character placement | [MG12](layer-boundary-audit.md#mg12) |
| [src/game/dungeon/fog.ts](../../src/game/dungeon/fog.ts) | Crypt generation, geometry and presentation data | — |
| [src/game/dungeon/hearing.ts](../../src/game/dungeon/hearing.ts) | Crypt run and character placement | — |
| [src/game/dungeon/level.ts](../../src/game/dungeon/level.ts) | Crypt generation, geometry and presentation data | [MG12](layer-boundary-audit.md#mg12) |
| [src/game/dungeon/map.ts](../../src/game/dungeon/map.ts) | Crypt generation, geometry and presentation data | [MG13](layer-boundary-audit.md#mg13) |
| [src/game/dungeon/party-placement.ts](../../src/game/dungeon/party-placement.ts) | Crypt run and character placement | — |
| [src/game/dungeon/reference.ts](../../src/game/dungeon/reference.ts) | Crypt run and character placement | — |
| [src/game/dungeon/run.ts](../../src/game/dungeon/run.ts) | Crypt run and character placement | [MG10](layer-boundary-audit.md#mg10), [MG11](layer-boundary-audit.md#mg11), [MG13](layer-boundary-audit.md#mg13) |
| [src/game/dungeon/solids.ts](../../src/game/dungeon/solids.ts) | Crypt run and character placement | — |
| [src/game/environment/furniture.ts](../../src/game/environment/furniture.ts) | Team arena gameplay, physical level policy and furnishing geometry | — |
| [src/game/lab/actor.ts](../../src/game/lab/actor.ts) | Lab scenario composition and instruments | [MG12](layer-boundary-audit.md#mg12) |
| [src/game/lab/attack-mode.ts](../../src/game/lab/attack-mode.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/attack-target.ts](../../src/game/lab/attack-target.ts) | Lab scenario composition and instruments | [MG14](layer-boundary-audit.md#mg14) |
| [src/game/lab/commands.ts](../../src/game/lab/commands.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/dummy-spec.ts](../../src/game/lab/dummy-spec.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/gait-meter.ts](../../src/game/lab/gait-meter.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/ground-environment.ts](../../src/game/lab/ground-environment.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/ground-meter.ts](../../src/game/lab/ground-meter.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/ground-mode.ts](../../src/game/lab/ground-mode.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/ground-starts.ts](../../src/game/lab/ground-starts.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/loadout.ts](../../src/game/lab/loadout.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/locomotion-mode.ts](../../src/game/lab/locomotion-mode.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/player.ts](../../src/game/lab/player.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/scenarios.ts](../../src/game/lab/scenarios.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/stance-mode.ts](../../src/game/lab/stance-mode.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/targets.ts](../../src/game/lab/targets.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/track.ts](../../src/game/lab/track.ts) | Lab scenario composition and instruments | — |
| [src/game/lab/wind.ts](../../src/game/lab/wind.ts) | Lab scenario composition and instruments | — |
| [src/game/levels.ts](../../src/game/levels.ts) | Team arena gameplay, physical level policy and furnishing geometry | — |
| [src/game/part-label.ts](../../src/game/part-label.ts) | Presentation metadata, pure link/route helpers and sound observations | — |
| [src/game/route.ts](../../src/game/route.ts) | Presentation metadata, pure link/route helpers and sound observations | — |

## src/minds

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/minds/apart.ts](../../src/minds/apart.ts) | Runtime-neutral mirror seat execution and world-side mind construction | — |
| [src/minds/catalog.ts](../../src/minds/catalog.ts) | Generic catalog registration, tree validation and scope/code/data traversal | [MG07](layer-boundary-audit.md#mg07) |
| [src/minds/choice.ts](../../src/minds/choice.ts) | Shared choice selection and delayed command-layer Mind adapter | — |
| [src/minds/command-layers.ts](../../src/minds/command-layers.ts) | Shared choice selection and delayed command-layer Mind adapter | [ROOT-SUPPORT](layer-boundary-audit.md#root-support) |
| [src/minds/command/beats.ts](../../src/minds/command/beats.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/clearer.ts](../../src/minds/command/clearer.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/commander.ts](../../src/minds/command/commander.ts) | Team-command contracts, shared geometry and concrete Commander policies | [MG10](layer-boundary-audit.md#mg10) |
| [src/minds/command/commanders.ts](../../src/minds/command/commanders.ts) | Team-command contracts, shared geometry and concrete Commander policies | [MG10](layer-boundary-audit.md#mg10) |
| [src/minds/command/commands.ts](../../src/minds/command/commands.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/delivery.ts](../../src/minds/command/delivery.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/drill.ts](../../src/minds/command/drill.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/goals.ts](../../src/minds/command/goals.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/independent.ts](../../src/minds/command/independent.ts) | Team-command contracts, shared geometry and concrete Commander policies | [MG11](layer-boundary-audit.md#mg11) |
| [src/minds/command/kind.ts](../../src/minds/command/kind.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/mob.ts](../../src/minds/command/mob.ts) | Team-command contracts, shared geometry and concrete Commander policies | [MG11](layer-boundary-audit.md#mg11) |
| [src/minds/command/party.ts](../../src/minds/command/party.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/spread.ts](../../src/minds/command/spread.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/stand.ts](../../src/minds/command/stand.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/command/team.ts](../../src/minds/command/team.ts) | Team-command contracts, shared geometry and concrete Commander policies | — |
| [src/minds/config-link.ts](../../src/minds/config-link.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/config.ts](../../src/minds/config.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/controller.ts](../../src/minds/controller.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/decider.ts](../../src/minds/decider.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/minds/embodiment.ts](../../src/minds/embodiment.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/engagement.ts](../../src/minds/engagement.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | [EXP-001](layer-boundary-audit.md#exp-001), [ROOT-ESTIMATE](layer-boundary-audit.md#root-estimate) |
| [src/minds/entrant.ts](../../src/minds/entrant.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/execution.ts](../../src/minds/execution.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/host.ts](../../src/minds/host.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | [MG01](layer-boundary-audit.md#mg01) |
| [src/minds/hosted-body.ts](../../src/minds/hosted-body.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/index.ts](../../src/minds/index.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/mind.ts](../../src/minds/mind.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/minds.ts](../../src/minds/minds.ts) | Runtime-neutral mirror seat execution and world-side mind construction | [MG01](layer-boundary-audit.md#mg01), [MG08](layer-boundary-audit.md#mg08) |
| [src/minds/mirror.ts](../../src/minds/mirror.ts) | Body mirror number transport and command/state views | — |
| [src/minds/option/chooser.ts](../../src/minds/option/chooser.ts) | Concrete Option decision, search, walk/rest and value models | — |
| [src/minds/option/choosers.ts](../../src/minds/option/choosers.ts) | Option extension contracts, component registry lists and stock limb/profile components | [MG06](layer-boundary-audit.md#mg06) |
| [src/minds/option/cover.ts](../../src/minds/option/cover.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | — |
| [src/minds/option/decider.ts](../../src/minds/option/decider.ts) | Concrete Option decision, search, walk/rest and value models | [ROOT-TABLES](layer-boundary-audit.md#root-tables) |
| [src/minds/option/down.ts](../../src/minds/option/down.ts) | Option extension contracts, component registry lists and stock limb/profile components | — |
| [src/minds/option/index.ts](../../src/minds/option/index.ts) | Option extension contracts, component registry lists and stock limb/profile components | [MG05](layer-boundary-audit.md#mg05) |
| [src/minds/option/kinds.ts](../../src/minds/option/kinds.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | [MG03](layer-boundary-audit.md#mg03), [MG04](layer-boundary-audit.md#mg04), [ROOT-TABLES](layer-boundary-audit.md#root-tables) |
| [src/minds/option/limbs.ts](../../src/minds/option/limbs.ts) | Option extension contracts, component registry lists and stock limb/profile components | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/minds/option/mind.ts](../../src/minds/option/mind.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | [MG02](layer-boundary-audit.md#mg02), [MG03](layer-boundary-audit.md#mg03), [MG04](layer-boundary-audit.md#mg04), [MG07](layer-boundary-audit.md#mg07), [ROOT-TABLES](layer-boundary-audit.md#root-tables), [SK-NAV-DEFAULT](layer-boundary-audit.md#sk-nav-default) |
| [src/minds/option/objective.ts](../../src/minds/option/objective.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | — |
| [src/minds/option/objectives.ts](../../src/minds/option/objectives.ts) | Option extension contracts, component registry lists and stock limb/profile components | [MG06](layer-boundary-audit.md#mg06) |
| [src/minds/option/option-kinds.ts](../../src/minds/option/option-kinds.ts) | Option extension contracts, component registry lists and stock limb/profile components | [MG06](layer-boundary-audit.md#mg06) |
| [src/minds/option/option.ts](../../src/minds/option/option.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | — |
| [src/minds/option/orders.ts](../../src/minds/option/orders.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | — |
| [src/minds/option/parts.ts](../../src/minds/option/parts.ts) | Option extension contracts, component registry lists and stock limb/profile components | [MG05](layer-boundary-audit.md#mg05) |
| [src/minds/option/percepts.ts](../../src/minds/option/percepts.ts) | Option recovery, strike, perception and situation implementations | [MG05](layer-boundary-audit.md#mg05) |
| [src/minds/option/places.ts](../../src/minds/option/places.ts) | Concrete Option decision, search, walk/rest and value models | — |
| [src/minds/option/predictions-part.ts](../../src/minds/option/predictions-part.ts) | Option extension contracts, component registry lists and stock limb/profile components | — |
| [src/minds/option/predictions.ts](../../src/minds/option/predictions.ts) | Option extension contracts, component registry lists and stock limb/profile components | [MG06](layer-boundary-audit.md#mg06) |
| [src/minds/option/record.ts](../../src/minds/option/record.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | — |
| [src/minds/option/rest.ts](../../src/minds/option/rest.ts) | Concrete Option decision, search, walk/rest and value models | — |
| [src/minds/option/rise-memory.ts](../../src/minds/option/rise-memory.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | — |
| [src/minds/option/rise.ts](../../src/minds/option/rise.ts) | Option recovery, strike, perception and situation implementations | [MG04](layer-boundary-audit.md#mg04), [MG09](layer-boundary-audit.md#mg09) |
| [src/minds/option/situation.ts](../../src/minds/option/situation.ts) | Option recovery, strike, perception and situation implementations | — |
| [src/minds/option/strike.ts](../../src/minds/option/strike.ts) | Option recovery, strike, perception and situation implementations | [MG09](layer-boundary-audit.md#mg09) |
| [src/minds/option/value.ts](../../src/minds/option/value.ts) | Concrete Option decision, search, walk/rest and value models | — |
| [src/minds/option/walk.ts](../../src/minds/option/walk.ts) | Option framework assembly/validation and concrete support, record, objective and decision components | — |
| [src/minds/physical-body.ts](../../src/minds/physical-body.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/report.ts](../../src/minds/report.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/sheets.ts](../../src/minds/sheets.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |
| [src/minds/sub-mind.ts](../../src/minds/sub-mind.ts) | Mind contracts, hosting, physical lifecycle, reports, replay and decider adapters | — |

## src/parts

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/parts/fields.ts](../../src/parts/fields.ts) | Part configuration, metadata, field editors and lookup contracts | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/parts/index.ts](../../src/parts/index.ts) | Part configuration, metadata, field editors and lookup contracts | — |
| [src/parts/lookup.ts](../../src/parts/lookup.ts) | Part configuration, metadata, field editors and lookup contracts | — |
| [src/parts/parts.ts](../../src/parts/parts.ts) | Part configuration, metadata, field editors and lookup contracts | [MG07](layer-boundary-audit.md#mg07) |

## src/skills

| File | Responsibility | Outcome |
| --- | --- | --- |
| [src/skills/action-config.ts](../../src/skills/action-config.ts) | Configuration-to-aim/executor assembly | — |
| [src/skills/assembly.ts](../../src/skills/assembly.ts) | Registered skill service composition | — |
| [src/skills/config.ts](../../src/skills/config.ts) | Extensible skill configuration contracts | — |
| [src/skills/framework/action-instances.ts](../../src/skills/framework/action-instances.ts) | Action lifecycle, resource admission and contact attribution | — |
| [src/skills/framework/action-resources.ts](../../src/skills/framework/action-resources.ts) | Concrete control ownership compilation | [SK-ASSIST-OWNERSHIP](layer-boundary-audit.md#sk-assist-ownership) |
| [src/skills/framework/action.ts](../../src/skills/framework/action.ts) | Action protocol and targets | [SK-ASSIST-OWNERSHIP](layer-boundary-audit.md#sk-assist-ownership) |
| [src/skills/framework/aim-part.ts](../../src/skills/framework/aim-part.ts) | Registered aim contract | [ROOT-ESTIMATE](layer-boundary-audit.md#root-estimate) |
| [src/skills/framework/aims.ts](../../src/skills/framework/aims.ts) | Stock centre/surface/leg-height aim implementations | [ROOT-AIMS](layer-boundary-audit.md#root-aims), [SK-SURFACE-AIM-FIT](layer-boundary-audit.md#sk-surface-aim-fit) |
| [src/skills/framework/arbiter.ts](../../src/skills/framework/arbiter.ts) | Skill arbitration and service composition | [SK-ASSIST-OWNERSHIP](layer-boundary-audit.md#sk-assist-ownership) |
| [src/skills/framework/executor-part.ts](../../src/skills/framework/executor-part.ts) | Registered executor contract | — |
| [src/skills/framework/hold.ts](../../src/skills/framework/hold.ts) | Guard held-item upright policy | [SK-HOLD-PLACEMENT](layer-boundary-audit.md#sk-hold-placement) |
| [src/skills/framework/leg-adapter.ts](../../src/skills/framework/leg-adapter.ts) | Registered locomotion adapters | — |
| [src/skills/framework/locomotion-part.ts](../../src/skills/framework/locomotion-part.ts) | Registered locomotion/gait contracts | — |
| [src/skills/framework/menu.ts](../../src/skills/framework/menu.ts) | Action kit and currently admissible menu | [SK-WINDOW-TWO-SUPPORTS](layer-boundary-audit.md#sk-window-two-supports) |
| [src/skills/framework/profile.ts](../../src/skills/framework/profile.ts) | Measured profile validation, interpolation and identity | [SK-DATA-DIGEST](layer-boundary-audit.md#sk-data-digest), [SK-PROFILE-EXIT](layer-boundary-audit.md#sk-profile-exit), [SK-PROFILE-RECOVERY-OWNERSHIP](layer-boundary-audit.md#sk-profile-recovery-ownership) |
| [src/skills/framework/records.ts](../../src/skills/framework/records.ts) | Per-body immutable skill record lookup | — |
| [src/skills/framework/skill.ts](../../src/skills/framework/skill.ts) | General skill/legs goals and common reports | — |
| [src/skills/framework/skills.ts](../../src/skills/framework/skills.ts) | Published skill runtime/report contract | — |
| [src/skills/framework/support.ts](../../src/skills/framework/support.ts) | Support service contract | — |
| [src/skills/guard/guard-part.ts](../../src/skills/guard/guard-part.ts) | Stock guard parts and applicability | [SK-HOLD-PLACEMENT](layer-boundary-audit.md#sk-hold-placement) |
| [src/skills/guard/guard.ts](../../src/skills/guard/guard.ts) | Cover/shield guard kinematics and saved ward motion | [SK-GUARD-RESUME](layer-boundary-audit.md#sk-guard-resume) |
| [src/skills/intent/action-aim.ts](../../src/skills/intent/action-aim.ts) | Target region expansion and aim data | [ROOT-ESTIMATE](layer-boundary-audit.md#root-estimate) |
| [src/skills/intent/action-window.ts](../../src/skills/intent/action-window.ts) | Action windows, settling and paths beside downed targets | [SK-WINDOW-TWO-SUPPORTS](layer-boundary-audit.md#sk-window-two-supports) |
| [src/skills/intent/conditions.ts](../../src/skills/intent/conditions.ts) | Shared distance/follow-up condition predicates | — |
| [src/skills/intent/cover-hand.ts](../../src/skills/intent/cover-hand.ts) | Bilateral defensive-hand selection | — |
| [src/skills/intent/intent.ts](../../src/skills/intent/intent.ts) | World intent vocabulary and selected-set merge | — |
| [src/skills/intent/movement.ts](../../src/skills/intent/movement.ts) | Detached movement requests and geometry | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/skills/intent/ordered.ts](../../src/skills/intent/ordered.ts) | External orders converted into navigation intent | — |
| [src/skills/intent/orders.ts](../../src/skills/intent/orders.ts) | Orders validation and action restrictions | — |
| [src/skills/intent/targets.ts](../../src/skills/intent/targets.ts) | Sensed target regions/surfaces/lying axis | — |
| [src/skills/intent/travel.ts](../../src/skills/intent/travel.ts) | Movement braking and corner speed | — |
| [src/skills/kit.ts](../../src/skills/kit.ts) | Role-resolved skill kit and adapters | [EXP-001](layer-boundary-audit.md#exp-001) |
| [src/skills/locomotion/arm-swing.ts](../../src/skills/locomotion/arm-swing.ts) | Biped arm swing during walk/run | — |
| [src/skills/locomotion/cycle-run.ts](../../src/skills/locomotion/cycle-run.ts) | Mocap-based biped run tracking | [SK-RUN-VALIDATOR](layer-boundary-audit.md#sk-run-validator), [SK-WALK-RUN-FIT](layer-boundary-audit.md#sk-walk-run-fit) |
| [src/skills/locomotion/distance-rule.ts](../../src/skills/locomotion/distance-rule.ts) | Distance-based Move selector rule | — |
| [src/skills/locomotion/gait-assist.ts](../../src/skills/locomotion/gait-assist.ts) | Optional gait root assist | — |
| [src/skills/locomotion/gait-scale.ts](../../src/skills/locomotion/gait-scale.ts) | Biped gait scaling and joint geometry | — |
| [src/skills/locomotion/gaits.ts](../../src/skills/locomotion/gaits.ts) | Stock Move gait presets and open name contract | — |
| [src/skills/locomotion/locomotion.ts](../../src/skills/locomotion/locomotion.ts) | Two-foot stance locomotion | [FND-019](layer-boundary-audit.md#fnd-019) |
| [src/skills/locomotion/move-part.ts](../../src/skills/locomotion/move-part.ts) | Registered gait selector composition | [SK-MOVE-APPLICABILITY](layer-boundary-audit.md#sk-move-applicability) |
| [src/skills/locomotion/move-rule-part.ts](../../src/skills/locomotion/move-rule-part.ts) | Move-rule registry contract and stock field choices | — |
| [src/skills/locomotion/move.ts](../../src/skills/locomotion/move.ts) | Gait selection and handover | — |
| [src/skills/locomotion/navigation/clear-step.ts](../../src/skills/locomotion/navigation/clear-step.ts) | Stock solid clearance and fallen-body escape | — |
| [src/skills/locomotion/navigation/crowd.ts](../../src/skills/locomotion/navigation/crowd.ts) | Crowd velocity steering and saved fallen footprints | — |
| [src/skills/locomotion/navigation/held-clearance.ts](../../src/skills/locomotion/navigation/held-clearance.ts) | Current held-equipment and directional body clearance | [SK-HELD-CLEARANCE-CAPABILITY](layer-boundary-audit.md#sk-held-clearance-capability), [SK-SENSED-CONFIGURATION](layer-boundary-audit.md#sk-sensed-configuration) |
| [src/skills/locomotion/navigation/local-navigation.ts](../../src/skills/locomotion/navigation/local-navigation.ts) | Local navigation part | — |
| [src/skills/locomotion/navigation/navigation.ts](../../src/skills/locomotion/navigation/navigation.ts) | Route navigation control and saved progress | [SK-HELD-CLEARANCE-CAPABILITY](layer-boundary-audit.md#sk-held-clearance-capability), [SK-NAV-TRUNK-NAMES](layer-boundary-audit.md#sk-nav-trunk-names) |
| [src/skills/locomotion/navigation/navigator.ts](../../src/skills/locomotion/navigation/navigator.ts) | Navigation contracts and fallback construction | [SK-NAV-DEFAULT](layer-boundary-audit.md#sk-nav-default) |
| [src/skills/locomotion/navigation/route-search.ts](../../src/skills/locomotion/navigation/route-search.ts) | Visibility router and immutable-solid footprinter | — |
| [src/skills/locomotion/navigation/sensed-bounds.ts](../../src/skills/locomotion/navigation/sensed-bounds.ts) | Sensed physical geometry and own body clearance | [EXP-001](layer-boundary-audit.md#exp-001), [SK-NAV-TRUNK-NAMES](layer-boundary-audit.md#sk-nav-trunk-names), [SK-WINDOW-TWO-SUPPORTS](layer-boundary-audit.md#sk-window-two-supports) |
| [src/skills/locomotion/navigation/visibility-navigation.ts](../../src/skills/locomotion/navigation/visibility-navigation.ts) | Visibility route navigation registration | [SK-HELD-CLEARANCE-CAPABILITY](layer-boundary-audit.md#sk-held-clearance-capability) |
| [src/skills/locomotion/quadruped/crawl.ts](../../src/skills/locomotion/quadruped/crawl.ts) | Crawl paw gait | — |
| [src/skills/locomotion/quadruped/parts.ts](../../src/skills/locomotion/quadruped/parts.ts) | Paw gait role and reach metadata | [SK-PAW-GAIT-COMPOSITION](layer-boundary-audit.md#sk-paw-gait-composition) |
| [src/skills/locomotion/quadruped/paw-legs.ts](../../src/skills/locomotion/quadruped/paw-legs.ts) | Registered paw gait composition | [SK-PAW-GAIT-COMPOSITION](layer-boundary-audit.md#sk-paw-gait-composition) |
| [src/skills/locomotion/quadruped/travel.ts](../../src/skills/locomotion/quadruped/travel.ts) | Private paw travel contract | — |
| [src/skills/locomotion/quadruped/trot.ts](../../src/skills/locomotion/quadruped/trot.ts) | Trot paw gait | — |
| [src/skills/locomotion/quadruped/tuning.ts](../../src/skills/locomotion/quadruped/tuning.ts) | Private immutable controller tuning | — |
| [src/skills/locomotion/stance-feet.ts](../../src/skills/locomotion/stance-feet.ts) | Bilateral stance end adapter | — |
| [src/skills/locomotion/stance-walk-part.ts](../../src/skills/locomotion/stance-walk-part.ts) | Registered explicit stance walk | [FND-019](layer-boundary-audit.md#fnd-019) |
| [src/skills/locomotion/standing-rule.ts](../../src/skills/locomotion/standing-rule.ts) | Standing gait selector registration | — |
| [src/skills/locomotion/support-fold.ts](../../src/skills/locomotion/support-fold.ts) | Planted biped low-support fold | — |
| [src/skills/locomotion/support-part.ts](../../src/skills/locomotion/support-part.ts) | Support role and planted fold registration | — |
| [src/skills/locomotion/walk-run-part.ts](../../src/skills/locomotion/walk-run-part.ts) | Walk/run per-body record registration | [SK-WALK-RUN-FIT](layer-boundary-audit.md#sk-walk-run-fit) |
| [src/skills/locomotion/walk-run.ts](../../src/skills/locomotion/walk-run.ts) | Walk/run handover coordinator | [SK-WALK-RUN-FIT](layer-boundary-audit.md#sk-walk-run-fit) |
| [src/skills/locomotion/walk-run/data/registration.ts](../../src/skills/locomotion/walk-run/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/locomotion/walk-run/data/walk-run.ts](../../src/skills/locomotion/walk-run/data/walk-run.ts) | Frozen lazy asset reader | — |
| [src/skills/perception/default-strike-limbs.ts](../../src/skills/perception/default-strike-limbs.ts) | Explicit fallback attack perception model | — |
| [src/skills/perception/downed/route.ts](../../src/skills/perception/downed/route.ts) | Downed-body target route | — |
| [src/skills/perception/hull-entry.ts](../../src/skills/perception/hull-entry.ts) | Pure convex ray-entry geometry | — |
| [src/skills/perception/openings.ts](../../src/skills/perception/openings.ts) | Target collider geometry and boxing opening selection | [EXP-001](layer-boundary-audit.md#exp-001), [SK-SENSED-CONFIGURATION](layer-boundary-audit.md#sk-sensed-configuration), [SK-SURFACE-AIM-FIT](layer-boundary-audit.md#sk-surface-aim-fit), [SK-TUNING-REFUSAL](layer-boundary-audit.md#sk-tuning-refusal) |
| [src/skills/perception/threat.ts](../../src/skills/perception/threat.ts) | Physical threat perception | — |
| [src/skills/recovery/data/edge-profiles.ts](../../src/skills/recovery/data/edge-profiles.ts) | Frozen lazy asset reader | — |
| [src/skills/recovery/data/registration.ts](../../src/skills/recovery/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/recovery/held-body.ts](../../src/skills/recovery/held-body.ts) | Held recovery actuator adapter | [SK-HELD-CONTROL](layer-boundary-audit.md#sk-held-control) |
| [src/skills/recovery/implementations/flatten/clearance.ts](../../src/skills/recovery/implementations/flatten/clearance.ts) | Flatten posture clearance | — |
| [src/skills/recovery/implementations/flatten/index.ts](../../src/skills/recovery/implementations/flatten/index.ts) | Flatten technique registration | — |
| [src/skills/recovery/implementations/modes/index.ts](../../src/skills/recovery/implementations/modes/index.ts) | Mode-recovery part registrations | — |
| [src/skills/recovery/implementations/modes/steady.ts](../../src/skills/recovery/implementations/modes/steady.ts) | Mode-recovery player | — |
| [src/skills/recovery/implementations/roll-back/index.ts](../../src/skills/recovery/implementations/roll-back/index.ts) | Backward roll technique | [SK-TECHNIQUE-SIDES](layer-boundary-audit.md#sk-technique-sides) |
| [src/skills/recovery/implementations/roll/index.ts](../../src/skills/recovery/implementations/roll/index.ts) | Forward roll technique | [SK-TECHNIQUE-SIDES](layer-boundary-audit.md#sk-technique-sides) |
| [src/skills/recovery/implementations/staged/bearing-policy.ts](../../src/skills/recovery/implementations/staged/bearing-policy.ts) | Private paw travel contract | — |
| [src/skills/recovery/implementations/staged/data/registration.ts](../../src/skills/recovery/implementations/staged/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/recovery/implementations/staged/data/sit-back.ts](../../src/skills/recovery/implementations/staged/data/sit-back.ts) | Frozen lazy asset reader | — |
| [src/skills/recovery/implementations/staged/data/step-up.ts](../../src/skills/recovery/implementations/staged/data/step-up.ts) | Frozen lazy asset reader | — |
| [src/skills/recovery/implementations/staged/index.ts](../../src/skills/recovery/implementations/staged/index.ts) | Staged public registration exports | — |
| [src/skills/recovery/implementations/staged/limbs.ts](../../src/skills/recovery/implementations/staged/limbs.ts) | Staged bearing end adapters | [SK-STAGED-LIMB-STATE](layer-boundary-audit.md#sk-staged-limb-state) |
| [src/skills/recovery/implementations/staged/lowering.ts](../../src/skills/recovery/implementations/staged/lowering.ts) | Staged lowering leg adapter | [SK-HOT-BUFFERS](layer-boundary-audit.md#sk-hot-buffers) |
| [src/skills/recovery/implementations/staged/records.ts](../../src/skills/recovery/implementations/staged/records.ts) | Staged settings and recipe composition | [SK-STAGED-VALIDATION](layer-boundary-audit.md#sk-staged-validation) |
| [src/skills/recovery/implementations/staged/roll-coast.ts](../../src/skills/recovery/implementations/staged/roll-coast.ts) | Staged roll forecast | — |
| [src/skills/recovery/implementations/staged/staged.ts](../../src/skills/recovery/implementations/staged/staged.ts) | Staged recovery player | [SK-HOT-BUFFERS](layer-boundary-audit.md#sk-hot-buffers), [SK-STAGED-LIMB-STATE](layer-boundary-audit.md#sk-staged-limb-state) |
| [src/skills/recovery/implementations/staged/stages.ts](../../src/skills/recovery/implementations/staged/stages.ts) | Staged recipe schema, stock routes and validator | [EXP-001](layer-boundary-audit.md#exp-001), [SK-STAGED-VALIDATION](layer-boundary-audit.md#sk-staged-validation) |
| [src/skills/recovery/implementations/staged/steady.ts](../../src/skills/recovery/implementations/staged/steady.ts) | Stance recovery finish | — |
| [src/skills/recovery/implementations/staged/techniques.ts](../../src/skills/recovery/implementations/staged/techniques.ts) | Staged route segment registrations | — |
| [src/skills/recovery/righting/data/registration.ts](../../src/skills/recovery/righting/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/recovery/righting/data/righting.ts](../../src/skills/recovery/righting/data/righting.ts) | Frozen lazy asset reader | — |
| [src/skills/recovery/righting/righting.ts](../../src/skills/recovery/righting/righting.ts) | Paw righting algorithms | [SK-HOT-BUFFERS](layer-boundary-audit.md#sk-hot-buffers), [SK-TUNING-REFUSAL](layer-boundary-audit.md#sk-tuning-refusal) |
| [src/skills/recovery/righting/tuning.ts](../../src/skills/recovery/righting/tuning.ts) | Private immutable controller tuning | — |
| [src/skills/recovery/skills.ts](../../src/skills/recovery/skills.ts) | Technique-to-action binding | [SK-RECOVERY-END-BINDING](layer-boundary-audit.md#sk-recovery-end-binding), [SK-TECHNIQUE-SIDES](layer-boundary-audit.md#sk-technique-sides) |
| [src/skills/recovery/stand-up.ts](../../src/skills/recovery/stand-up.ts) | Stand-up readiness predicate | — |
| [src/skills/recovery/technique.ts](../../src/skills/recovery/technique.ts) | Recovery technique role contract | [SK-HELD-CONTROL](layer-boundary-audit.md#sk-held-control), [SK-TECHNIQUE-SIDES](layer-boundary-audit.md#sk-technique-sides) |
| [src/skills/strikes/arm-reach.ts](../../src/skills/strikes/arm-reach.ts) | Bilateral human arm reach adapter | [SK-SURFACE-AIM-FIT](layer-boundary-audit.md#sk-surface-aim-fit) |
| [src/skills/strikes/attack-path.ts](../../src/skills/strikes/attack-path.ts) | Human blow-family path policy | — |
| [src/skills/strikes/bite/data/bite.ts](../../src/skills/strikes/bite/data/bite.ts) | Frozen lazy asset reader | — |
| [src/skills/strikes/bite/data/registration.ts](../../src/skills/strikes/bite/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/strikes/bite/index.ts](../../src/skills/strikes/bite/index.ts) | Jaw bite executor and data schema | [SK-BITE-APPLICABILITY](layer-boundary-audit.md#sk-bite-applicability), [SK-TUNING-REFUSAL](layer-boundary-audit.md#sk-tuning-refusal) |
| [src/skills/strikes/bite/jaw-aim.ts](../../src/skills/strikes/bite/jaw-aim.ts) | Jaw-specific surface aim | [SK-SENSED-CONFIGURATION](layer-boundary-audit.md#sk-sensed-configuration) |
| [src/skills/strikes/bite/jaw.ts](../../src/skills/strikes/bite/jaw.ts) | Jaw geometry adapter | [SK-BITE-APPLICABILITY](layer-boundary-audit.md#sk-bite-applicability) |
| [src/skills/strikes/data/registration.ts](../../src/skills/strikes/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/strikes/data/strike-profiles.ts](../../src/skills/strikes/data/strike-profiles.ts) | Frozen lazy asset reader | — |
| [src/skills/strikes/effector-strike.ts](../../src/skills/strikes/effector-strike.ts) | Effector strike physical lifecycle adapter | — |
| [src/skills/strikes/face-aligner.ts](../../src/skills/strikes/face-aligner.ts) | Held-face wrist orientation solver | — |
| [src/skills/strikes/held-blow.ts](../../src/skills/strikes/held-blow.ts) | Straight held-blow assembly and records | — |
| [src/skills/strikes/held-blow/data/registration.ts](../../src/skills/strikes/held-blow/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/strikes/held-blow/data/sword-thrust.ts](../../src/skills/strikes/held-blow/data/sword-thrust.ts) | Frozen lazy asset reader | — |
| [src/skills/strikes/held-strike.ts](../../src/skills/strikes/held-strike.ts) | Human held/empty fist policy | — |
| [src/skills/strikes/learned-punch.ts](../../src/skills/strikes/learned-punch.ts) | Learned bilateral punch features and steering | — |
| [src/skills/strikes/punch-part.ts](../../src/skills/strikes/punch-part.ts) | Straight punch registration | — |
| [src/skills/strikes/stomp-part.ts](../../src/skills/strikes/stomp-part.ts) | Stomp registration and tuning | [SK-STOMP-APPLICABILITY](layer-boundary-audit.md#sk-stomp-applicability), [SK-TUNING-REFUSAL](layer-boundary-audit.md#sk-tuning-refusal) |
| [src/skills/strikes/stomp.ts](../../src/skills/strikes/stomp.ts) | Bilateral stomp executor | [SK-STOMP-APPLICABILITY](layer-boundary-audit.md#sk-stomp-applicability) |
| [src/skills/strikes/stomp/data/registration.ts](../../src/skills/strikes/stomp/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/strikes/stomp/data/stomp.ts](../../src/skills/strikes/stomp/data/stomp.ts) | Frozen lazy asset reader | — |
| [src/skills/strikes/straight-punch.ts](../../src/skills/strikes/straight-punch.ts) | Straight whole-body punch executor | [SK-TUNING-REFUSAL](layer-boundary-audit.md#sk-tuning-refusal) |
| [src/skills/strikes/straight-punch/data/records.ts](../../src/skills/strikes/straight-punch/data/records.ts) | Straight punch data records | — |
| [src/skills/strikes/straight-punch/data/registration.ts](../../src/skills/strikes/straight-punch/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/strikes/straight-punch/data/straight-punch.ts](../../src/skills/strikes/straight-punch/data/straight-punch.ts) | Frozen lazy asset reader | — |
| [src/skills/strikes/strike-cycle.ts](../../src/skills/strikes/strike-cycle.ts) | Reusable measured strike state machine | — |
| [src/skills/strikes/strike-window.ts](../../src/skills/strikes/strike-window.ts) | Stance-specific strike admission window | — |
| [src/skills/strikes/swing-part.ts](../../src/skills/strikes/swing-part.ts) | Held swing registrations and data | — |
| [src/skills/strikes/swing.ts](../../src/skills/strikes/swing.ts) | Human held-swing executor | — |
| [src/skills/strikes/swing/data/club-blow.ts](../../src/skills/strikes/swing/data/club-blow.ts) | Frozen lazy asset reader | — |
| [src/skills/strikes/swing/data/cut.ts](../../src/skills/strikes/swing/data/cut.ts) | Frozen lazy asset reader | — |
| [src/skills/strikes/swing/data/registration.ts](../../src/skills/strikes/swing/data/registration.ts) | Implementation-owned loader contribution | — |
| [src/skills/strikes/timed-push.ts](../../src/skills/strikes/timed-push.ts) | Timed muscle-push window arithmetic | — |

## tests

| File | Responsibility | Outcome |
| --- | --- | --- |
| [tests/core-boundary.test.mjs](../../tests/core-boundary.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/documents.test.mjs](../../tests/documents.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/evaluation/fixtures/swap/hooks.mjs](../../tests/evaluation/fixtures/swap/hooks.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/evaluation/fixtures/swap/kinds.mjs](../../tests/evaluation/fixtures/swap/kinds.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/evaluation/fixtures/swap/mind.mjs](../../tests/evaluation/fixtures/swap/mind.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/evaluation/swap.test.mjs](../../tests/evaluation/swap.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/fixtures/real-sweep.mjs](../../tests/fixtures/real-sweep.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/harness/core-stand.mjs](../../tests/harness/core-stand.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/harness/garbage.mjs](../../tests/harness/garbage.mjs) | Test gate, diagnostic fixture or harness | [AE02](layer-boundary-audit.md#ae02) |
| [tests/harness/preload-data.mjs](../../tests/harness/preload-data.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/harness/step-allocation.mjs](../../tests/harness/step-allocation.mjs) | Test gate, diagnostic fixture or harness | [AE02](layer-boundary-audit.md#ae02) |
| [tests/minds/contract.test.mjs](../../tests/minds/contract.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/minds/option/lying.test.mjs](../../tests/minds/option/lying.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/minds/stance-ownership.test.mjs](../../tests/minds/stance-ownership.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/script-links.test.mjs](../../tests/script-links.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/skills/profiles.test.mjs](../../tests/skills/profiles.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/skills/recovery/implementations/staged/rise-control.test.mjs](../../tests/skills/recovery/implementations/staged/rise-control.test.mjs) | Test gate, diagnostic fixture or harness | — |
| [tests/workspace.test.mjs](../../tests/workspace.test.mjs) | Test gate, diagnostic fixture or harness | — |

## Supplemental authored configuration and provenance

| File | Review scope | Outcome |
| --- | --- | --- |
| [.gitattributes](../../.gitattributes) | Full authored content reviewed against page entrypoints, routing scopes, dependency ownership and consuming schema. Generated lockfile resolved through package declarations rather than line-by-line dependency payload review. | — |
| [.github/workflows/pages.yml](../../.github/workflows/pages.yml) | Full authored content reviewed against page entrypoints, routing scopes, dependency ownership and consuming schema. Generated lockfile resolved through package declarations rather than line-by-line dependency payload review. | [APP-SW-SCOPE](layer-boundary-audit.md#app-sw-scope) |
| [.gitignore](../../.gitignore) | Full authored content reviewed against page entrypoints, routing scopes, dependency ownership and consuming schema. Generated lockfile resolved through package declarations rather than line-by-line dependency payload review. | — |
| [package.json](../../package.json) | Full authored content reviewed against page entrypoints, routing scopes, dependency ownership and consuming schema. Generated lockfile resolved through package declarations rather than line-by-line dependency payload review. | — |
| [research/core-club-unit.json](../../research/core-club-unit.json) | Full authored content and consumer ownership reviewed; concrete body choices remain research-owned. | — |
| [research/data/man-postures.json](../../research/data/man-postures.json) | Full authored content and consumer ownership reviewed; concrete body choices remain research-owned. | — |
| [research/environments/bare-warrior.layout.json](../../research/environments/bare-warrior.layout.json) | Full authored content and consumer ownership reviewed; concrete body choices remain research-owned. | — |
| [research/environments/bout.json](../../research/environments/bout.json) | Full authored content and consumer ownership reviewed; concrete body choices remain research-owned. | — |
| [research/environments/gait.json](../../research/environments/gait.json) | Full authored content and consumer ownership reviewed; concrete body choices remain research-owned. | — |
| [research/environments/punch-schedule.json](../../research/environments/punch-schedule.json) | Cell, channels and consumer interpretation reviewed; numeric candidate vectors checked finite and dimensions, historical score/search-log payload excluded from semantic replay. | — |
| [research/environments/punch.json](../../research/environments/punch.json) | subjectFor smoke probe resolves mind.options.1.skill to intended steered executor; schema path remains valid. | — |
| [research/environments/skeleton-punch-schedule.json](../../research/environments/skeleton-punch-schedule.json) | Cell, channels and consumer interpretation reviewed; numeric candidate vectors checked finite and dimensions, historical score/search-log payload excluded from semantic replay. | — |
| [research/environments/sword-thrust.json](../../research/environments/sword-thrust.json) | subjectFor smoke probe resolves mind.options.1.skill to intended steered executor; schema path remains valid. | — |
| [research/learned-puncher.json](../../research/learned-puncher.json) | Full authored content and consumer ownership reviewed; concrete body choices remain research-owned. | [SK-RESEARCH-LEGACY-CONFIG](layer-boundary-audit.md#sk-research-legacy-config) |
| [research/sword-thrust-search.json](../../research/sword-thrust-search.json) | Cell, channels and consumer interpretation reviewed; numeric candidate vectors checked finite and dimensions, historical score/search-log payload excluded from semantic replay. | — |
| [src/app/browser/render/textures.json](../../src/app/browser/render/textures.json) | Full authored content reviewed against page entrypoints, routing scopes, dependency ownership and consuming schema. Generated lockfile resolved through package declarations rather than line-by-line dependency payload review. | — |
| [tsconfig.json](../../tsconfig.json) | Full authored content reviewed against page entrypoints, routing scopes, dependency ownership and consuming schema. Generated lockfile resolved through package declarations rather than line-by-line dependency payload review. | — |
| [vendor/rapier/README.md](../../vendor/rapier/README.md) | Source/archive provenance, overlay behavior and rebuild procedure | — |

Generated dependency lock entries are reviewed through [package declarations](../../package.json)
and first-party import/build ownership. Asset and archived result rows are covered at the
[audit scope boundary](layer-boundary-audit.md#scope-and-method).
