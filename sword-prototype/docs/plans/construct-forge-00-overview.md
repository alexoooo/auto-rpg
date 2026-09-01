# Construct Forge -- live roadmap

> **2026-08-31 implementation status.** Sessions 20--24 landed their runtime, production activation,
> physical evidence and technical handoff, but the topic is not closed. The 26-cell Havok locomotion
> matrix is green. The fresh assisted-Warden qualification was run and honestly rejected: all eight
> rows time-capped, one lacked bilateral damage and none exercised the required move/brace Actions.
> The Arbalest's one-cell idle targeting debt is closed by an authored-clearance mount and
> separately measured prone lane while preserving its 8/8 qualified corpus. Improving the Warden
> rejection, the red Twinblade curriculum and Session 16's human verdict remain named work. The
> original continuous-DYNAMIC-root premise was rejected by a real at-rest bracket and is superseded
> by the supported-ANIMATED -> knocked-down-DYNAMIC boundary in `docs/design.md`.

## Current status -- assisted locomotion is the next architecture (2026-08-30)

The Body, Actions, Mind, Forge, Lab, diagnostics, physical learning smoke and separately
selectable Swordbearer, Twinblade and Arbalest implementations have landed. Their contracts and
negative/positive results are durable in `docs/design.md`, `docs/measurements.md`, `README.md` and
`AGENTS.md`; their completed session plans have been removed.

A visible Warrior-versus-small-golem fight exposed the next structural blocker. The Warrior uses
an animated pelvis locomotion root while the Construct is entirely dynamic. They close, the
Warrior acts as an effectively infinite-mass pusher, and the bodies can collapse into a living
clinch heap from which neither presentation nor policy recovers cleanly. The old humanoid raw gait
had already been measured falling and travelling backward. More motor tuning or ML does not make
that a good game foundation.

Sessions 20--24 replace accidental solver balance with supported locomotion: a collision-aware,
limb-authorized virtual carrier supplies a walking target while bounded motors, anatomy, weapons,
impacts, severance, knockdown and death remain physical. This is a narrow game-authority exception,
not permission for a Mind or debugger to write transforms.

## Frozen design choice

```ts
export interface LocomotionRequest {
  readonly localForward: number; // -1..1
  readonly localRight: number;   // -1..1
  readonly yaw: number;          // -1..1
  readonly recover: boolean;
}

export type SupportState = "supported" | "staggered" | "fallen" | "rising";
```

The request is the complete public command. A separate engine-owned, non-persisted authority
envelope is derived from the admitted Action/controller descriptor and carries carrier identity,
live support bindings, brace multiplier and degraded-gait stability scale. A controller cannot
forge it and runtime never switches on controller names.

- A player or Mind still submits `Intent` or a saved `ConstructCommand`. Neither receives a body,
  transform, constraint or joint handle.
- A scheduler-scoped locomotion writer may submit one bounded request per carrier for the current
  control boundary. Every locomotion Action claims `resource:balance`; the host clears before
  scheduling and commits only after both sides have decided.
- The carrier is derived from configured support topology. A Construct has no saved `leg`,
  `pelvis` or hidden body-class field. Renaming parts cannot change the answer.
- Real support chains determine admission. Losing a required joint, its attachment path or its
  installed contact module cancels full locomotion on that same safe control boundary. A detached
  grounded foot cannot authorize movement.
- Full, limp, crawl and other degraded gaits are explicit Actions over explicit smaller groups.
  The engine does not silently enumerate every surviving limb subset or substitute an unbound
  limb.
- The virtual carrier/navigation envelope is a query/controller aid and never a body, trigger or
  combat geometry. It cannot be hit,
  parry, occlude an arrow or own damage.
- Carrier-versus-carrier separation is resolved symmetrically after both requests. No left-first,
  right-first or kinematic-body bulldozer rule is permitted.
- A dedicated locomotion footprint is derived and recorded separately from
  `BodyView.collisionRadius`; the latter remains a combat/perception feature.
- Stability comes from the authored shove computed in `Combat.resolve`, not Havok's noisy
  `solverImpulse`. Damage callbacks queue a transition for the next safe pre-physics boundary.
- Adapter-specific composite dynamic anatomy owns posture. Fighter uses pelvis-up, torso height and
  head order; Construct controllers declare a topology-derived `balance-chain`. An upright virtual
  carrier cannot call a folded body standing, and v1 gains no hidden torso/head names.
- Humanoid Fighters request recovery by giving nonzero locomotion input after the fallen dwell.
  Constructs request their explicit saved `recover` Action. Both pass through the same clearance,
  support and interruption gates; neither rises automatically while idle.

## Live session order

| session | landable result | depends on |
| --- | --- | --- |
| [16](construct-forge-16-integration-and-playtest.md) | final player/product verdict after the technical blocker closes | 24 |
| [18](construct-forge-18-adversarial-balance-curriculum.md) | physically witnessed Twinblade competence, remeasured after locomotion | 24 |
| [20](construct-forge-20-supported-locomotion-evidence.md) | reproduce the pile-up, freeze honest evidence, and establish one two-phase pair boundary | -- |
| [21](construct-forge-21-locomotion-authority-and-state.md) | dormant scoped requests, live support adapters, stability and recovery contract | 20 |
| [22](construct-forge-22-carrier-and-collision-runtime.md) | dormant carrier, query collision, passive-contact policy and fist preservation | 21 |
| [23](construct-forge-23-atomic-supported-locomotion.md) | atomically activate the shared system for Fighters and humanoid Constructs | 22 |
| [24](construct-forge-24-forge-ai-and-playtest.md) | damaged-limb Actions, Forge exposure, AI/balance reruns and technical handoff | 23 |

Sessions 20--22 deliberately keep every new authority dormant. Session 23 activates pair
separation, passive-contact filtering, supported-root motion and knockdown together for both body
families. Enabling only one family recreates the current asymmetry; enabling an always-supported
root motor before knockdown exists trades pile-up for invulnerability. Session 24 lands technical
evidence and hands the build to Session 16; only Session 16 owns the human/product verdict.

Assistance is selected once before construction and is pair-atomic: both selected bodies must
advertise compatible supported ports or both are built in legacy locomotion mode. This keeps
Fighter-versus-Warden/Centipede coherent until those bodies gain a supported adapter.

Session 21 introduces the exact v1 stability/recovery constants: decay 0.020 m/s per second,
stagger at 0.006 m/s specific impulse, fall at 0.014 m/s, brace multiplier 1.50, fallen dwell
0.35 s, support grace 0.10 s and rising duration 0.45 s. The real-Havok bracket in
`tests/supported-locomotion-stability-physical.test.mjs` now pins below/at on a live supported body;
lowering the at-stagger input by 0.000001 m/s made it fail before restoration. These thresholds are
not tuning folklore.

## Version and digest prediction

Blueprint v1, Action v1, Program v1, Observation v2 and Policy v2 remain valid only if no persisted
field is added. New registered controller IDs and changed saved action/program instances move their
canonical digests without changing grammar versions. If implementation needs a saved carrier or
optional-member field, stop and version the control grammar rather than slipping it into v1.

- No root-workspace golden applies to this standalone prototype.
- Sessions 20--22 must not move existing Body, control, program, sensor, observation or policy
  digests because the runtime is dormant. Every source-changing Session 20--23 invalidates the
  broad Construct qualification fingerprint and runs a fresh qualification before landing; a
  replacement rejected source fingerprint is recorded from evidence, never guessed.
- Session 23 changes shared stepping, collision and Fighter locomotion. The documented
  `duelist-swinger` null-control bracket is mandatory. Research contract/feature/tactic digests must
  not move because the public command vocabulary is unchanged; physical bout results may move.
- Sessions 23--24 leave humanoid Construct blueprints unchanged but move control/program digests
  where supported Actions and rules are added. Arbalest/Twinblade curriculum evidence and broad
  qualification source identities are invalidated and must be remeasured.
- `arbalest-fatal-arrow-v1` remains a historical physical-foot-support qualifier. Assisted support
  requires a new explicitly versioned qualifier; v1 evidence must not be silently reinterpreted.

## Gate for every session

From `sword-prototype/`:

```powershell
npm test
npm run check
npm run build
```

Any shared execution/physics session also brackets:

```powershell
npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823
```

The final session additionally runs the supported-locomotion corpus, Arbalest curriculum, fresh
eight-worker Construct qualification, root `git diff --check -- sword-prototype`, and a visible
human playtest. No development server remains running.
