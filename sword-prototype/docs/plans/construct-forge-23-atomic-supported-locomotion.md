# Session 23 -- atomically activate supported locomotion

## Status -- production activation and the complete physical matrix are green (2026-08-30)

Pair-atomic supported mode, symmetric carrier separation, real limb/contact gates, authored
stability release, ragdoll knockdown and bounded recovery are active for Fighters and the humanoid
Constructs. The canonical 26-cell report now runs the twelve Construct/Warrior cells, mirrored
Fighter/Fighter cells, physically scaled 0.90 m cells, ledge and slope limits, snag, occupied
recovery, held-weapon wall pressure and hit-interrupted recovery. A separate live-body 240 Hz
bracket proves below/at 0.006 m/s stagger and 0.014 m/s fall, including the real pelvis
ANIMATED-to-DYNAMIC release. Held sword/shield wall rows retain signed geometry clearance and a
separate penetration maximum; both measure zero against a frozen 0.020 m limit, while a forged
0.021 m result is rejected. The topic remains live for Session 24's qualification/balance handoff,
not for an unmeasured Session 23 physical cell.

One planned mechanism is superseded by measured evidence. Keeping the supported root DYNAMIC made
both humanoid bodies lose real foot evidence and fall inside the exact 0.10 s grace at rest. The
landed game carrier therefore admits an ANIMATED root while supported and releases the same root to
DYNAMIC on knockdown. `docs/design.md` owns the replacement safety argument; this plan's dynamic-root
sentences below remain as the rejected premise rather than being rewritten as if they had passed.

## Outcome

Activate symmetric separation, supported-root authority, passive-contact filtering, live limb
gates, knockdown and recovery together for Warrior/Broot/KayKit Fighter bodies and the three
humanoid Constructs. The Warrior-versus-small-golem failure becomes a green physical corpus while
real weapon knockdown remains possible. Centipede retains its crawler implementation; Warden raw
gait remains available but is not silently redefined in this session.

## Implement

1. Refactor `Fighter.steer` at `src/fighter.ts#L1841` to submit the shared request instead of
   writing pelvis velocity immediately. `walk` at `#L1932` advances gait phase from achieved
   allowed displacement, not requested speed. The timing is explicit: `driver.step` writes the
   current limb pose and request; pair resolution calls `afterLocomotionCommit` on both ports and
   latches achieved local distance/yaw for the **next** control boundary. Fighter and Construct
   gait consume that one-boundary-lag sample identically. A blocked body therefore stops cycling
   rather than trying to consume a result that does not exist until after `driver.step`.
   Convert Fighter's pelvis from ANIMATED to DYNAMIC under supported locomotion and let the bounded
   root motor follow the virtual carrier. `die` in `src/fighter.ts`, severance, verdict and recovery use the
   state transitions proven in Sessions 21--22.

2. Add `supported-biped-move`, `supported-biped-turn`, `supported-biped-brace` and
   `supported-biped-recover` in `src/construct/biped.ts#L70`. They issue the scoped request and
   still write real hip/knee/ankle/sole targets through `MotorWriter`; their phase also consumes the
   previous `afterLocomotionCommit` sample. No hand/root transform is a support limb. Register
   compatibility at `src/construct/controllers.ts#L86`.

3. Add move/turn/recover Actions to the existing locomotion groups in
   `src/construct/humanoid.ts#L229`, `twinblade.ts#L73` and `arbalest.ts#L112`. Preserve disjoint
   sword/launcher/posture ownership. Update authored programs to close, retreat, turn, brace and
   recover only through public Actions. At zero command supported brace plants the carrier.

4. `Construct.describe` continues to use the real torso/root for centre, aim and damage, but
   publishes carrier ground for navigation while assisted and retains actual feet/contact/slip in
   diagnostics/evidence. No range sensor is quietly redefined.

5. Enable the collision/runtime switch once, at the shared pair host, for both sides. Page,
   headless measure, Construct Lab, Workshop probe, construct training/qualification and mixed-bout
   scripts already share Session 20's two-phase step. A source scanner plus physical parity test
   rejects any surviving direct two-body stepping path.

   Mixed legacy bouts use one construction-time rule. The body registry advertises supported-port
   compatibility. Setup/build chooses `supported` only when **both** selected bodies advertise it
   and passes that immutable mode to both constructors; otherwise it constructs the whole pair in
   `legacy` mode. Thus Fighter-versus-Warden and Fighter-versus-Centipede retain Fighter's existing
   ANIMATED pelvis until those opponents gain compatible ports, while Fighter-versus-humanoid-
   Construct activates both dynamic root motors. No body is rebuilt or silently falls back after
   the bout starts.

6. Add `scripts/construct-warrior-locomotion.mjs`, report version 1. Exact cells cover
   Warrior/Warrior and Warrior versus each humanoid Construct, both side assignments, full 1.8995 m
   and synthetic 0.90 m scale, no-attack closure, wall brace, real combat knockdown, ledge, excessive
   slope, snag, held-weapon wall pressure and occupied recovery. Retain every step and recompute
   summary/qualifiers. Freeze these fixture constants in the report/config digest: 240 Hz, 8.0 s,
   2.40 m initial separation, 3.0 s inward dwell, 0.18 m step-height query, 35 degree accepted and
   50 degree refused slopes, 0.10 s support grace, at most 0.020 m footprint penetration, 0.120 m
   root-to-carrier lag, 0.080 m joint-frame error and 12.0 m/s part speed. Both side assignments and
   both scheduler call orders are physical cells, not only pure resolver tests.

   Build the 0.90 m body with a test-only `scaleLocomotionFixtureBlueprint` that applies
   `s = 0.90 / 1.8995` to part collider/visual dimensions, joint/socket/module translations and
   contact geometry, `s^3` to part/module mass and matching inertia, and leaves the ordinary held
   weapon unscaled. Validate the resulting blueprint and pin its canonical digest. This is real
   scaled physics, not a profile threshold relabelled 0.90 m.

## Acceptance

Every no-attack closure cell must:

- issue nonzero inward drive and reach the declared envelope;
- remain continuously valid under root-up + torso-height + head-order;
- respect footprint separation with no excessive passive-contact/penetration dwell;
- settle inward speed without launch, unbounded part speed, constraint stretch or carrier lag;
- produce zero damage/knockdown and allow commanded retreat;
- show real foot cycling, bounded stance slip and swing clearance based on achieved motion.

Combat cells must show a below-threshold shove staying supported, a strong/cumulative authored
shove releasing support in both mirrors, no extra drive on the release boundary, physical ragdoll
fall, and a clear-space supported recovery interruptible by a later hit. Fallen/dead bodies cannot
air-walk. Ledge loss releases after the frozen grace; an occupied wall/opponent volume refuses
recovery without phasing.

## Tests watched failing

- `Warrior_and_small_Construct_close_without_overlap_posture_loss_or_launch`
- `removing_pair_separation_reproduces_the_current_clinch_heap`
- `the_same_supported_body_moves_and_recovers_at_zero_pi_and_0_90_m_scale`
- `blocked_fighters_advance_gait_from_allowed_displacement_and_do_not_treadmill`
- `Fighter_and_Construct_gait_consume_the_same_previous_commit_sample`
- `a_snag_stalls_or_trips_before_joint_frame_error_exceeds_the_bound`
- `a_cliff_removes_support_and_an_excessive_slope_blocks_drive`
- `a_gameplay_knockdown_releases_in_one_safe_boundary_without_a_velocity_spike`
- `fallen_dead_and_zero_support_bodies_cannot_air_walk`
- `recovery_refuses_occupied_space_missing_support_and_is_hit_interruptible`
- `page_headless_Lab_Workshop_training_and_qualification_take_the_same_pair_path`
- `mixed_Warden_and_Centipede_pairs_choose_legacy_for_both_bodies_before_construction`
- `a_supported_humanoid_pair_enables_both_ports_or_refuses_never_one`
- `real_Havok_brackets_the_frozen_stagger_and_fall_thresholds_on_a_supported_body`
- `every_obstacle_cell_proves_its_fixture_intersects_the_declared_envelope`
- `held_shield_and_blade_wall_pressure_neither_phases_nor_launches_combat_geometry`

Mutation-prove deletion/one-sided separation, requested-speed gait, missing ground gate, assist
after knockdown, stale release drive, recovery through occupancy, missing hit interruption and a
root-up-only posture predicate.

## Measure and accept

Bracket shared behavior against Session 20's frozen pre-change report. No
feature/tactic/research contract digest moves. Over 120 `duelist-swinger` bouts, post-change
opportunity-attack and attack-contact rates may fall by at most 0.05 absolute from the frozen
baseline, mean damage must remain within 0.5x--2.0x, every numeric field stays finite and every bout
settles. These are compatibility bounds, not a claim of unchanged physics. Record every physical
result change and never copy old Arbalest/Twinblade counts onto assisted bodies. If reporting
timing, run control -> locomotion corpus -> control in each round and report the median paired
difference/range; a lone command is not a performance bracket.

```powershell
node --test tests/supported-locomotion-physical.test.mjs tests/supported-locomotion-stability-physical.test.mjs tests/construct-humanoid.test.mjs tests/construct-arbalest.test.mjs tests/construct-lab.test.mjs tests/integration.test.mjs
node scripts/construct-warrior-locomotion.mjs
npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823
npm run construct:qualify -- --out <fresh-directory> --workers 8 --expect rejected
npm test
npm run check
npm run build
```
