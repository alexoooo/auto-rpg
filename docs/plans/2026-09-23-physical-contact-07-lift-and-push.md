# Physical contact 07: contact force lifts and pushes

## Why

The owner's example: a giant attacking from underneath should lift the small body and launch it.

**Today the carrier ignores contact.**

- A standing carrier is `ANIMATED` and follows a virtual carrier, so the solver's contact forces
  cannot move it.
- `resolvePhysicalSupportedPair` keeps the two virtual discs apart symmetrically, and real body
  contact moves neither.
- Only an authored knockdown releases the pelvis to `DYNAMIC`.

**The fix keeps the carrier.** Dynamic-root balance was tried and failed (`biped.ts` header), so the
carrier stays keyframed while the body is standing. The physics decides when it stops standing.

## Changes

1. **Measure the force on a standing body.**
   - Sum, per solver step, the contact impulses the other body's parts put on this body's parts.
   - Use every part's `getCollisionObservable`, and exclude the floor and self contacts.
   - The biped already enables collision callbacks on its locomotion parts and counts contacts;
     extend that into a per-body accumulator every locomotion module shares.
   - Read the impulse through the observer's `impulse` and `normal`, never through a world matrix.
   - The rule about blows says the solver's impulse is dominated by how a contact was resolved.
     That is why a sustained force is taken over a window, not a single contact.
2. **Lifted.**
   - The trigger: the upward component of that force, averaged over a short window (0.1 s is the
     starting point, measured), exceeds the body's weight.
   - Then the body is lifted. It releases to ragdoll through the same path a knockdown takes
     (`releaseRoot`) and keeps the velocity the contact gave it.
   - From there the physics is real: the lifting arm carries and throws a `DYNAMIC` body.
3. **Pushed.**
   - The trigger: the horizontal component exceeds foot grip `mu * W`, with mu one constant with a
     stated source.
   - Then the virtual carrier accepts the displacement the net force implies over the step, and the
     excess feeds the stability accumulator as a stagger.
   - Both carriers take their share, so a heavier body pushing a lighter one moves it and is barely
     moved.
4. **Blows do not double-count.** A scored blow's momentum transfer (session 06) and the contact
   force from the same contact must not both reach the accumulator. Pick one source per contact and
   test that.

## Measure

- **Lift bench** (from 01), with a free standing target instead of a keyframed body:
  - x1 against x1 never lifts;
  - the giant lifts a x1;
  - report the launch speed.
- **Bouts:**
  - lifts and pushes a bout for x1 against x1 (target: about 0 lifts);
  - the giant preset against x1;
  - the opening blade clash, which lifts nothing.
- **x1 against x1 either side**, with the fingerprint diff.

## Owner's eye list (session 10)

- The giant lifting and launching a x1 from below.
- A giant pushing a x1 back.
- Two x1 bodies pressing into each other and neither lifting.
