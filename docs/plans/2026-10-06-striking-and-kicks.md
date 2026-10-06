# Shared striking, stability and trained-adult performance

Implement in order, with physical qualification before promotion. Warrior empty handed is the
first qualified body/loadout. Trained adults are the performance target; independently measured,
source-backed body and actuator corrections are authorized.

1. Generalize `control/motor.ts` and its kinematic solve to named effectors with independent
   orientation and measured point motion. Keep hand wrappers and existing trajectories. Describe
   capabilities from body data; add foot strike sites derived from existing collision envelopes.
   Extend detached observations, contact feedback and replay. Physical chain/orientation tests,
   boundary/provenance tests, then the full suite, check and build gate the commit.
2. Extract the common chamber/swing/impact/return cycle from `skills/combat.ts`, retain the hand
   overlap adapter, and qualify orientation/support corrections. Both hands must pass standing
   straight/cross impact-return, miss/block/cancellation and stationary/recovering low-target
   gates without falls or assistance. Remove force-improvement criteria from stability admission.
3. Use the same cycle for either-foot front kicks, with measured transfer/unloading and verified
   placement/recentering. Stance owns the bearing leg, tracking the free leg; guard retains arms.
   Cancellation and loss of support withdraw or yield to recovery. Add ordinary Arena configuration
   and tactical selection; downed-opponent attacks retain qualified low punches. Verify real Arena
   replay, contacts, blocks, falls and recovery before exposing a selectable configuration.
4. Generalize the independent strike apparatus to capsule and box contact. Preserve momentum
   measurement and whole waveforms; freeze apparatus assumptions before tuning. Record primary
   trained-adult references and protocol differences. Run finite reproducible search batches and
   120/480/960/1920 Hz whole-system comparisons with common-rate force bins. Parity requires
   per-limb performance, stability, directional bounds and convergence; it remains open if unmet.

Every landing runs `npm test`, `npm run check`, `npm run build`, and the line-ending gate. Browser
QA uses a private preview port and stops its verified server PID. Commit each green chunk. Durable
measurements belong in `docs/reference/`; update architecture/roadmap and delete this plan only
when all implementation phases land. Roundhouse kicks, stomps and jumping attacks are later work.
