# Point control in the arena

`PointFighterConfig` selects an experimental gameplay controller independently of body anatomy.
It is selectable beside Classic for either contender. The ordinary `Duel` owns physics, sensing,
orders, contacts, damage, verdicts and replay; the page only selects the recipe and renders it.

## Controller and settings

- Locomotion, placement and balance use the reference body controller. Strength, inertia,
  assistance ceilings and the gameplay Rapier profile are unchanged. This does not install
  the optional coordinate-limit or Coulomb-friction engine profiles.
- The strike skill selects no searched torque recipes. It uses the anatomical point named by
  `aimOf`, the placed-strike reach and timing (`PLACED`, `STAND`, `APPROACH` in
  [blows](blows.md) and [human and strikes](human-and-strikes.md)), and the research `pointPath`
  quintic. Initial velocity is a difference of successive body-frame point observations at
  the control rate. IK samples this path and the shared muscle-bounded servo tracks it.
  Either hand can attack; alternating hands is sequential, not simultaneous coordination.
- Defense uses the same sensed hand/item rigid-point velocity as Classic cover, including
  angular velocity. `predictIntercept` projects constant velocity to a plane `GUARD_COVER.out`
  ahead of the head along the current threat direction. The horizon is `THREAT.within /
  THREAT.closing`; a point already inside the plane is covered immediately. These are derived
  from the existing threat and cover settings, not new force gains. This mode does not yet
  compensate delayed body observations, head motion, or predict angular acceleration.
- Recovery uses `supportEntryPolicy` for an empty-handed body with a measured fours pose.
  Research and gameplay share its settings and construction. Settings and acquisition limits
  are those of [support entry](support-entry.md#fixture-and-acceptance). The host's down reading
  triggers takeover, even with no useful support contacts. Other setups use `stagedRise`.
  No teleport, installed pose, new assist or body reconstruction occurs on takeover.

`recoverySeconds` is a bout rule: continuously down for that duration means defeat; wounds
can still defeat a body immediately. Standing resets its clock. Zero retains ordinary arena
rules. The UI offers 0, 15, 30 and 60 seconds as explicit player choices; links accept any finite
value from 0 to 60. Both sides receive the same allowance regardless of their controller. Classic retains its
passive lying sub-mind; the point fighter attempts recovery.

## Verification

Reproduce integration checks with:

```powershell
node --test tests/arena-point-control.test.mjs tests/core-orders.test.mjs
```

Harness: Node arena, vendored Rapier gameplay profile, 120 Hz, normal arena solids and damage,
Warrior versus Rogue, balance 0% on both sides (their sourced character values). These checks cover:

- Autonomous approach, placement, repeated attacks and measured trajectories from both hands.
- Actual hand contacts causing ordinary damage; a club's item point and damage identity.
- A fork during a club swing, comparing every segment pose at every subsequent step plus
  the entire bout state. Raw serialized engine bytes include internal bookkeeping and are
  not used as the motion fingerprint.
- An external shove from standing, recovery takeover, continued opponent sensing, expiration
  and exact replay of the recovery clock and physical motion.
- Repeated player orders to hit a static fixed collider, with a real hand/collider impulse.
- Controller/recovery link parsing, and a cover placed on the predicted intercept plane.

These are integration gates, not evidence of superiority. A completed requested strike is
not necessarily a hit, and a touch during a fall is not a successful driven attack. A standard
20-second unarmed comparison bout requests several attacks; club use can topple the fighter.
No win-rate or damage-quality claim is made from these fixtures.

## Remaining limits

The point controller is a hybrid, not the full experimental whole-body optimization policy.
It keeps the reference stance/IK execution path to make the primitives playable at game rates.
The independent observation/action and motion-policy interfaces remain available to other AI
approaches. Arena equipment still uses the existing compound right-hand club: separate items,
disarms and shared two-hand grips are not yet integrated with rendering and damage ownership.

Support acquisition is not standing recovery. The HUD explicitly distinguishes an acquisition
attempt or hand/shin support from upright combat. The staged fallback also has no reliability
guarantee. Reliable rising, impact-aware braking/re-planning, coordinated simultaneous attacks,
and measured defense effectiveness remain open.
