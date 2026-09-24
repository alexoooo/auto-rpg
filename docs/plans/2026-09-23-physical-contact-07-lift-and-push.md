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
4. **Body against body goes through the pair resolver, not the solver.** Two keyframed carriers
   produce no contact impulse between them, so the accumulator in change 1 sees only arms, items and
   ragdolls pressing. Walking into the other body is resolved by `resolvePhysicalSupportedPair`, which
   splits the overlap equally today.
   - Split it by mass instead: each disc gives way in proportion to the *other* body's supported
     mass, so a heavy body walking into a light one moves it and is barely moved.
   - The light body's displacement feeds its stability accumulator the same way a push does in
     change 3. It is one push rule with two sources.
   - Confirm with a probe, before relying on it, that keyframed trunk-on-trunk really reports no
     impulse. If it does report one, it goes into change 1 and the pair split stays equal.
5. **Blows do not double-count.** A scored blow's momentum transfer (session 06) and the contact
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

## Inputs from session 04

On the Node lift bench, against the x1 stone body's 2425 N at `STONE_BODY_DENSITY` 1300:

- **One x1 arm cannot lift an x1 body, and two together can.** The strongest single arm, the reach
  blade, lifts 1938 N (0.80). Two of them lift 3876 N. So "x1 against x1 never lifts" holds for one
  arm and not for a two-armed press. The owner's rule was read per arm (session 10's "Chosen"), so
  read the bench both ways: a lift by one arm is a defect, and a lift by two is the rule working.
- **The max giant lifts an x1 body with its fists and not with its blades.**
  - Fists: reach 2 x 2500 N, wrist 2 x 2031 N.
  - Blades: reach 2 x 1125 N, wrist 2 x 719 N.
  - `max` lengthens a blade chain more than it strengthens it, so a max blade arm lifts less than an
    x1.25 one (reach blade 2875 N).
  - "The giant lifts a x1" will therefore hold for a fist giant and fail for the default blade giant,
    unless the arm's torque is made to follow its length. Settle that first.
  - The body's density is not the lever: it was chosen once and is not moved again.

## Owner's eye list (session 10)

- The giant lifting and launching a x1 from below.
- A giant pushing a x1 back.
- Two x1 bodies pressing into each other and neither lifting.

## What landed, 2026-09-24

Every figure is in `docs/analysis/2026-09-23-attribute-measurements.md` "Physical contact 07:
contact force lifts and pushes", with its harness. Two commits, 733bf12 and 4df55cc. What differs
from the plan above:

- **Torque follows weight, not length.** The lift split showed that weight and arm speed, not
  length, were what cut a max arm's lift. The reach core's yaw, shoulder and elbow torques, the pitch
  hinge and the human arm's drives now follow the weight stat, and the max giant's reach blade holds
  4250 N where it held 781. Arm speed also cuts lift, which is not explained and not chased.
- **Change 1 is `ContactPress`** (`src/contact-press.ts`). Every part's collision events from
  another body's parts are averaged over 0.1 s per source body.
  - A contact's first 50 ms is a blow, not a press, and a contact the press reads is not filed again
    by `Combat` (change 5).
  - A source that is fallen or rising presses nothing: a leg set down on a heap read 3.64 W upward.
- **The solver's reading failed, so each source is capped.**
  - Sideways at its own grip (0.55 W), because a keyframed carrier pushed at up to 9.3 times an x1
    body's grip.
  - Upward at its own weight, because four x1 bodies in eight bouts read as lifted by limbs squeezed
    between two keyframes, at up to 2.09 W, where a whole x1 arm holds 0.80 W at most.
  - Two bodies of one weight can therefore never push or lift each other. That replaces the plan's
    "two x1 arms lifting is the rule working".
- **Change 4 is a grip rule, not a mass split.** Keyframed trunk against keyframed trunk reports no
  contact (0 events in 16 bouts), so the pair resolver decides the push. A closing body pushes the
  other with its own grip, each carrier resists with its mass, and an equal walker never shoves. The
  dungeon's group resolver has no pair push: a body walked into there is stopped, not shoved.
- **A lift tips rather than launches**: 7 lifts from the max giant ended with a peak upward speed of
  0.14 to 0.63 m/s and a rise of 9 to 37 mm. x1 against x1 lifted and pushed nothing in 16 bouts.
- **Stone falls less, 4.14 [3.86, 4.42] a bout against 4.95**, out of session 01's band, because a
  sustained blade no longer re-files its momentum every step. Session 08 replaces the ledger's lines.
- **Against the giant, 84.1 % of knockdowns are repeats**, in chains of up to 20, and the x1 is down
  three quarters of a bout. It is on session 10's eye list, with no authored cure.
- The sever fixture in `tests/research-physical.test.mjs` moved back to seeds 50 and 51.
