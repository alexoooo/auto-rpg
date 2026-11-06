# Bonk courses and readings

The course constructor is [bonk-course.ts](../../src/skills/strikes/bonk-course.ts).
`BonkTechnique` supplies a joint bias, chamber and follow-through angles, and durations.
`BONK_LIMITS` supplies the immutable form and settling limits used by construction and reading.

## Construction

A course owns copies of its entry frame, observed target and technique. The frame carries the
body's reference coordinates into the world. The configured guard supplies the joint angles
and guard positions relative to the chest.

The contact solve moves the arm base and elbow toward the observed target with the wrist at
the declared posture. The joints between the root and the arm base stay at the guard's angles.
An unreachable contact returns a refusal.

The stroke rotates the whole arm about its base. Its plane contains the contact point and
world up. The chamber and follow-through lie on opposite sides of contact on that circle.
The elbow and wrist keep their contact angles through the stroke. The constructor checks
chamber height, descending contact tangent, shaft sweep, contact closure and joint ranges.
A single rotation below a half turn makes the stroke simple and prevents a repeated windup.

Preparation interpolates the guard's joint angles to the chamber's. Return interpolates from
the physical stroke end to the configured guard; its hand and club courses follow the chest.
Each coordinate uses a quintic course with zero endpoint velocity and acceleration. The stroke
uses that same progress law for its rotation. Preparation can update its observed target;
commitment freezes the stroke's frame and geometry.

## Reading

[bonk-read.ts](../../src/evaluation/strike/bonk-read.ts) reads native physics steps. It measures
chamber proximity and stillness before commitment, then projects the swell onto the declared
circular arc. Nearest-point ties choose the earlier progress. Decreases in progress accumulate
backward travel; the course stays fixed through a miss.

The reader compares club and chest orientations by shortest quaternion distance and sums
their angular increments for travel. Each wrist channel's signed increments are unwrapped.
Preparation and return use their declared joint direction; the stroke asks a stationary wrist,
so its wrist travel counts against the reversal allowance.

The physical stroke ends on crossing the follow-through endpoint within its tracking limits,
or on a measured impact stop followed by withdrawal. A deadline produces a failed return.
Executor phase names and an executor's completed outcome do not establish that endpoint or
guard recovery. The reader checks each resource release against the continuous guard hold.

The first physical impulse starts the collision interval. Contiguous contact and recoil bound
its end, subject to the collision cap. Path and angular tracking report both raw motion and
motion outside that interval. Safety, contact identity and recovery remain measured throughout.
The intended hit requires an impact from the swell collider on the requested head segment
during the physical stroke; the first qualifying impact supplies its energy once.
The measured chamber height, shaft sweep and pre-impact descending velocity also meet their
form limits; a valid reference alone does not establish those properties of the simulated stroke.

[selfClearance](../../src/core/bodies/build/clearance.ts) checks posed collision geometry without
using collision admission. Disjoint bounding boxes prove positive separation; overlapping
boxes receive a shape query. The result is a lower bound on positive separation, with negative
values from intersecting shapes. The reading names the least pair and its time, anatomical
joint exclusions, rigid item geometry and the holding hand's declared grip geometry.

The Strike drill's `bonk-reference` protocol binds the existing club Option to the high mark
with a centre aim. `BonkReading` keeps its course, physical phase intervals, values, limits,
contact collider, assistance readings and explicit coverage in the case record. Ratings shows
those fields in the case view and plays failed outcomes first. Its coverage fields distinguish
course and native-step observations from entry-window, fixture, repetition and cancellation
evidence; incomplete coverage cannot pass.

The `bonk-reference-480` protocol plays the head-target reference at 480 Hz with four command
delay steps. The 120 Hz reference uses one delay step, so both wait 1/120 s. Each saved bout
with explicit timing carries its rate and delay into Node execution and the browser worker.
Reels require matching rates and delays for trials played step for step.
