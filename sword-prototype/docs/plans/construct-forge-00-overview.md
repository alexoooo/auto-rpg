# Construct Forge -- live roadmap

> **2026-09-01 implementation status.** Supported locomotion and its damaged-limb fallbacks are
> complete. Their closed Sessions 20--24 have been removed: the authority and recovery contract is
> durable in [`docs/design.md`](../design.md#supported-walking-is-a-game-carrier-authorized-by-physical-limbs),
> the rejected dynamic-root premise and 26-cell Havok corpus are in
> [`docs/measurements.md`](../measurements.md#supported-locomotion-activation-and-ai-rerun----2026-08-30),
> and the operational traps are in `AGENTS.md`. Sessions 25--30 are approved but unimplemented.
> Session 18 remains red, and Session 16 still requires the final guided human/product verdict.

## Current boundary

The Body, Actions, Mind, Forge, Lab, diagnostics, physical learning smoke and separately selectable
Swordbearer, Twinblade, Arbalest and Warden implementations have landed. Supported V1 now supplies
pair-atomic carrier movement for Fighters and compatible Constructs while keeping limb authority,
weapons, knockdown, severance, recovery and death physical. That architecture is a completed
prerequisite, not work retained in this plan set.

The continuation begins at combat units. The visible build established three connected debts:

- combat is internally a high-number game despite its normalized HUD;
- projectile wounds use speed and unsigned shaft alignment but ignore mass and contact zone; and
- authored Construct Minds do not yet make every morphology pursue, turn and use its simultaneous
  weapons dynamically.

Sessions 25--30 replace those rules with low-number localized durability, axial-energy projectiles,
morphology-specific combined arms and procedural stone/bronze fragment effects. Session 30 returns
one integrated build to Sessions 18 and 16; it does not claim either the physical qualification or
the player's product verdict in advance.

## Frozen continuation choices

```ts
export const COMBAT_VALUE_UNIT_VERSION = 2 as const;
export const PROJECTILE_PENETRATION_V1 = Object.freeze({
  axialSpeedFloorMps: 8,
  joulesPerDamage: 34,
  maximumDamage: 3,
});
```

A Warrior torso has 10 durability and its head/ordinary parts have 5. Health stays local to parts,
joints and modules; vitality remains derived and normalized. A projectile wound uses mass, cached
arrival speed, signed point-first alignment and an actual head-contact zone. At 0.12 kg and 42 m/s
a clean Construct bolt is exactly 3 damage before armour. One hundred durability remains legal but
is outside ordinary content and is effectively invincible on this weapon scale.

Construct locomotion and combat Actions remain ordinary public commands. The continuation may add
new declared Actions and hardware, but no Mind, shader, debugger or saved program receives a body,
transform, constraint, collision or joint handle. Presentation remains one-way: authoritative
damage may update render metadata, while render state can never feed physics, targeting, AI,
collision, picking or saved content.

## Live session order

| session | landable result | depends on |
| --- | --- | --- |
| [25](construct-forge-25-low-number-combat-units.md) | localized v2 combat units, saved-content migration and low-number UI | completed supported V1 |
| [26](construct-forge-26-physical-projectiles.md) | capped axial-energy arrow and bolt wounds | 25 |
| [27](construct-forge-27-morphology-combined-arms.md) | dynamic morphology-specific pursuit, turning and concurrent attacks | 26 |
| [28](construct-forge-28-procedural-stone-pbr.md) | shared procedural PBR stone/bronze plugin with mapped fallback | 25 |
| [29](construct-forge-29-surface-binding-and-damage.md) | semantic per-part grain, carved relief and one-way damage wear | 28 |
| [30](construct-forge-30-qualification-and-handoff.md) | competitive corpus, shader evidence, durable record and human handoff | 27, 29 |
| [18](construct-forge-18-adversarial-balance-curriculum.md) | close the red Twinblade physical-competence gate on the integrated rules | 30 |
| [16](construct-forge-16-integration-and-playtest.md) | guided player/product verdict and topic close-out | 30 |

Sessions 25--26 deliberately separate unit migration from projectile balance. Session 25 leaves an
exact `/20` bridge for old arrow scoring so melee/unit migration is independently provable;
Session 26 removes that bridge and introduces the physical equation. Session 27 owns Actions and
Minds but not final competitive claims. Sessions 28--29 are presentation-only and must be provably
isolated from authority. Session 30 is the only continuation session allowed to select durability
rungs or publish the 0/8 idle, 6/8 active qualification claim.

The two branches after Session 25 may be implemented independently: 26 -> 27 owns combat and AI,
while 28 -> 29 owns presentation. They join only in Session 30. A rejected qualification returns
to the owning implementation session; a new source digest is never qualification by itself.

## Version and digest prediction

Session 25 intentionally advances Blueprint and SavedConstruct to v2 because health/armour units
change. Session 26 advances Blueprint, SavedConstruct and the library envelope to v3 when persisted
projectile `damageScale` becomes bounded `penetrationEfficiency`; v1 imports chain through both
verified migrations. Session 27 advances them to v4 for the explicit zero-wound mounted-contact
striker used by the Warden shield. Action and Program grammar versions do not move merely because
instances gain Actions or rules.

- No root-workspace golden applies to this standalone prototype.
- Session 25 moves every built-in/Forge blueprint, persisted report identity and any program with
  an absolute maximum-health comparison. Control digests must not move: the body-neutral reporting
  surface tag advances, but `canonicalControlJson` contains only the unchanged Action graph.
  Exact-`/20` fixtures preserve arithmetic; deliberately re-authored Construct cores move outcomes
  and require fresh evidence.
- Session 26 moves every blueprint digest because the root grammar becomes v3, moves the balance
  digest when `pierceScale` is removed, and invalidates ordinary Archer as well as Construct
  projectile evidence. Controls/programs must not move.
- Session 27 moves every blueprint digest for v4, the Warden shield hardware digest,
  Arbalest/Warden controls and every edited morphology program.
- Sessions 28--29 must move no authoritative digest or physical trace. Their conservative broad
  qualification source fingerprints do move because that owner hashes every `src/**/*.ts`.
- Session 30 may commit the measured per-morphology health-only durability multipliers selected by
  the frozen all-rungs ratchet; those production blueprint digests are expected to move. It may not
  tune an unrecorded constant merely to turn a rejected row green.

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

Session 30 additionally runs the supported-locomotion and five-morphology combat corpora, fresh
eight-worker Construct qualification, `git diff --check -- .`, and a visible WebGL audit. Session
16 separately owns the visible human product-feel playtest. No development server remains running
unless the user explicitly asks for one and receives its PID and port.
