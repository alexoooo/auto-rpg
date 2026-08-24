# Session 13 -- adversarial close-out of the expanded arena

## Outcome

Exercise every new lifecycle, control, unit and art path together; run an independent
adversarial review; record all durable evidence; then delete this plan set in the finishing
commit. A green compile is not acceptance for pause, camera, armour or body feel.

## Automated integration

1. Extend `tests/integration.test.mjs` to build every registered unit on both sides with every
   supported loadout/policy, refuse every incompatible cell by name, step a complete bout and
   dispose to baseline.
2. Run 25 restarts per compatible unit/loadout, 100 pooled arrows across flying/spent/parked
   states, every camera gesture/ownership toggle and every severable body. Census meshes,
   materials, textures, instances, bodies, constraints, active observers, particles, trails
   and DOM/pointer listeners.
3. Compare uninterrupted seeded AI bouts with pause/resume inserted at three timestamps;
   removing wall time must yield the same fight record. Camera gestures and all costumes
   enabled/disabled must also be record-identical.
4. Predeclare three seeds each for bare Duelists, shield/buckler-versus-archer, Broot-versus-
   Warrior and Centipede matchups. Record outcomes, duration, vitality, contacts, blocks,
   attacks, posture and unit-specific events directly rather than from `Combat.log`.
5. Run the old three unpromoted-checkpoint visible probes only through the explicit
   `--checkpoint` route (291337 melee left, 291338 bow right, 291339 bare left). Do not create
   a picker route or reinterpret them as promotion evidence.

## Visible matrix

In Fixed and Overhead views, both zoom clamps and both sides:

- pause during walk, strike, arrow flight and post-verdict fall; restart each state;
- winner arm settling, twenty-arrow floor behaviour, shield and buckler interception, and
  repeated fist exchanges;
- wall approaches/corners, middle orbit/pan/cancel, lock on `L`, and every direct body/wrist
  control across takeover and hand swap;
- Warrior/Broot/Centipede silhouette, targeting, collision, death and severing;
- fallback versus imported armour while standing, walking, crouching, leaning and twisting;
- the still-open historical checks: rig overlay, body-relative Fixed-camera aim, corpse 0.08
  versus 0.3, broader blood scale, bow pressure, axe thrust and normal-rate arrow trace.

Frame cost uses bracketed control -> subject -> control rounds on two visible machines and
reports median per-round differences with range. A hidden/software browser is not performance
evidence.

## Adversarial review

Assign a reviewer who did not implement the session to inspect:

- state/host disagreement at pause and restart;
- stale keyframed velocity after authority loss;
- asymmetric collision masks and tests that only read masks rather than cause contacts;
- policies that accept a capability they cannot act on;
- camera input leaking into hand input;
- unit fallback, hard-coded Warrior anatomy and incomplete vitality tables;
- cosmetic physics, missing license/digest provenance and GLB dead payload;
- resource census mistakes caused by Babylon's asynchronous observer removal or Havok's
  historical constraint map.

For every session, rerun at least one documented mutation and record the observed failing test
before restoration. Review findings are fixed or named as open; "no issue noticed" is not an
adversarial result.

## Final gate

```powershell
npm ci
npm run texture:verify
npm run asset:verify
npm test
npm run check
npm run build
npm run measure -- --seed 20260824
npm run ai:evaluate -- --seed 20260824
```

Stop the attached dev server and verify port 5180 has no listener. Update `README.md`,
`docs/design.md`, `docs/measurements.md`, asset provenance and reusable `AGENTS.md` traps.
Delete `combat-followups-00-overview.md` through this file only when every required result is
durable and every intentionally open human judgement is named outside the plan.
