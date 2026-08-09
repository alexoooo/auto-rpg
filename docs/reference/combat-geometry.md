# Articulated combat geometry

**Purpose:** Freeze the numeric and edge-case contract for deterministic XYZ combat geometry.
**Status:** current
**Canonical source:** [`Vec3`](../../crates/fx/src/vec3.rs) and the [`geom3` primitives](../../crates/fx/src/geom3.rs).
**Update when:** A coordinate convention, primitive, sweep, tie-break, bound, or field order changes.

## Coordinates and bounds

The articulated coordinate system is right-handed. `+x` is east, `+y` is north,
and `+z` is up from the floor. Planar `Vec2 { x, y }` lifts to
`Vec3 { x, y, z: Fx::ZERO }`. `Angle::ZERO` points along `+x`; positive angles
turn counter-clockwise when viewed from `+z`. Distances are world units and time
of impact is a fraction of the current tick.

Every constructible combat point must lie in `[-256, 256]` on each axis. A
constructible primitive radius, weapon segment length, or capsule half-height is in
`[0, 8]`. The vertical-capsule sweep accepts an effective contact radius in `[0,16]`
because weapon/body contact passes `weapon_radius + body_radius`; each immutable
source radius remains at most 8.
A shield half-width and half-height are each in `[0, 8]`, so either complete
rectangle edge may be in `[0, 16]`; this is the rectangle validator's distinct edge
bound. All other segment lengths are bounded by 8, and
an accepted per-tick endpoint displacement is at most `4`. These are validation
bounds, not clamps. Geometry remains total for arbitrary `Fx` inputs, but an
out-of-contract sweep conservatively returns `TimeOfImpact::ZERO`; reachable
authoritative state must never use that escape path.

`Vec3` is three public `Fx` fields. Component `+`, `-`, unary `-`, and scalar `*`
use the existing saturating `Fx` operators. `dot`, `length_sq`, and squared
distance stage raw products and sums in `i128`, shift once by 16, and saturate
only the returned `Fx`. `normalized_or_zero` returns zero for a zero vector and
otherwise divides by `length()` using the existing integer square root. No float
conversion is permitted.

## Public values and signatures

```rust
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default, Debug)]
pub struct Vec3 { pub x: Fx, pub y: Fx, pub z: Fx }

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct TimeOfImpact(Fx);

impl TimeOfImpact {
    pub const ZERO: Self;
    pub const ONE: Self;
    pub const fn new_clamped(value: Fx) -> Self;
    pub const fn get(self) -> Fx;
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ClosestPoints { pub a: Vec3, pub b: Vec3, pub distance_sq: Fx }
pub struct SegmentRectangleClosest {
    pub a: Vec3,
    pub b: Vec3,
    pub distance_sq: Fx,
    pub feature: u8,
    pub segment_parameter: TimeOfImpact,
    pub side_parameter: TimeOfImpact,
    pub up_parameter: TimeOfImpact,
}

pub fn closest_points_on_segments(a0: Vec3, a1: Vec3,
                                  b0: Vec3, b1: Vec3) -> ClosestPoints;
pub fn swept_segment_sphere(a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3,
                            c0: Vec3, c1: Vec3, radius: Fx)
                            -> Option<TimeOfImpact>;
pub fn swept_segment_vertical_capsule(a0: Vec3, a1: Vec3,
                                      a2: Vec3, a3: Vec3,
                                      centre0: Vec3, centre1: Vec3,
                                      half_height: Fx, radius: Fx)
                                      -> Option<TimeOfImpact>;
pub fn swept_segment_segment(a0: Vec3, a1: Vec3,
                             a2: Vec3, a3: Vec3, radius_a: Fx,
                             b0: Vec3, b1: Vec3,
                             b2: Vec3, b3: Vec3, radius_b: Fx)
                             -> Option<TimeOfImpact>;
pub fn closest_points_segment_rectangle(segment0: Vec3, segment1: Vec3,
                                        rectangle: [Vec3; 4])
                                        -> SegmentRectangleClosest;
pub fn swept_segment_rectangle(a0: Vec3, a1: Vec3,
                               a2: Vec3, a3: Vec3, radius: Fx,
                               rectangle0: [Vec3; 4],
                               rectangle1: [Vec3; 4])
                               -> Option<TimeOfImpact>;
pub fn segment_plane(a: Vec3, b: Vec3, plane_point: Vec3,
                     plane_normal: Vec3) -> Option<TimeOfImpact>;
```

For sweeps, `a0..a1` and `c0` are the previous pose; `a2..a3` and `c1` are the
current pose. Endpoints and centres interpolate linearly with tick fraction.
The vertical capsule axis at time `t` is from
`centre(t) - (0,0,half_height)` to `centre(t) + (0,0,half_height)`.

## Segment closest points

The implementation uses raw coordinates and `i128` intermediates. Let
`u=a1-a0`, `v=b1-b0`, `w=a0-b0`, and let `aa=u.u`, `bb=u.v`, `cc=v.v`,
`dd=u.w`, `ee=v.w`, `den=aa*cc-bb*bb`. A zero-length segment has squared
length zero in raw arithmetic, before conversion to `Fx`.

- Both zero length: return `(a0,b0)`.
- Only A is zero: A is `a0`; B uses `clamp(ee/cc,0,1)`.
- Only B is zero: B is `b0`; A uses `clamp(-dd/aa,0,1)`.
- `den == 0`: the pair is parallel or coincident. Evaluate the four endpoint
  projections `(a0,B)`, `(a1,B)`, `(A,b0)`, `(A,b1)`.
- Otherwise start with `s=(bb*ee-cc*dd)/den` and
  `t=(aa*ee-bb*dd)/den`, then perform exactly
  `s=clamp(s)`, `t=clamp((bb*s+ee)/cc)`,
  `s=clamp((bb*t-dd)/aa)`, `t=clamp((bb*s+ee)/cc)`.
  This is the only clamp/recompute order.

Parameters remain signed rational numerator/positive denominator until point
construction. Multiplication is divided with truncation toward zero. Candidate
pairs compare exact unshifted squared raw distance, then lexicographically by
`(a.x,a.y,a.z,b.x,b.y,b.z)` raw values. Thus coincident segments choose the
lexicographically smallest coincident point on A for both outputs. The public
`distance_sq` is produced only after the winning pair is chosen.

The exact path above is guaranteed for accepted construction-envelope inputs.
Arbitrary public `Fx` inputs remain total, but their determinant or analytic
numerator can exceed `i128` even though each raw dot product fits. A checked
overflow selects the same four endpoint-projection candidates as `den == 0`;
an overflow in a later linear rational recomputation selects parameter zero.
These are deterministic failure-containment answers, not accepted geometry.
Within the construction envelope algebraic cancellation keeps recompute
denominators bounded, and point construction uses an overflow-free binary
quotient/remainder multiply, so neither fallback is reachable.

## Conservative sweeps

Sweeps use conservative advancement, which may report contact one raw time unit
early and may never report it late. At time `t`, compute the closest distance
`d` between the moving segment and target primitive. Contact is `d <= radius`;
equality is a hit. For a sphere let `speed_bound` be
`max(length((a2-a0)-(c1-c0)), length((a3-a1)-(c1-c0)))`.
For a vertical capsule use the same formula with its centre displacement; both
axis endpoints have that displacement. This bounds every interpolated relative
point on the two segments. If separated, advance by

```text
floor_to_Fx((d - radius) / speed_bound)
```

with a minimum advance of `Fx::EPSILON`. `floor_to_Fx` means the non-negative
raw quotient; it must not round upward. If `speed_bound == 0`, return `None`.
After each advance, recompute the exact closest pair. Stop at `t == 1`.

Clamp an advance to the remaining fraction and test again at exactly one before
returning `None`. The loop is capped at 96 advances. Cap exhaustion returns the current `t` as a
conservative hit. The construction bounds above make exhaustion unreachable in
the shipped fixtures; `conservative_sweeps_finish_inside_the_iteration_cap`
asserts that fact over the exhaustive raw boundary vectors used by the tests.
Initial overlap returns zero. A tangent returns its first conservative time.
A zero-length moving segment is a moving point. A negative radius/half-height or
any other out-of-contract sweep input returns `Some(TimeOfImpact::ZERO)` before
arithmetic; scenario and command decoders reject it before authoritative state.

## Continuous equipment sweeps

V2-14 adds the two public functions above to `fx`; `sim` must not carry a private
copy. They share the accepted point/displacement/radius envelope, raw interpolation,
minimum-one-raw advance, exact endpoint test, 96-advance cap, and conservative-cap
return of the sphere/capsule sweeps.

For moving segment/segment, linearly interpolate all four endpoints at raw time `t`
and call `closest_points_on_segments`. Contact distance is
`radius_a + radius_b`. The speed bound is the maximum length of the following four
relative endpoint displacements, evaluated in this order:

```text
(a2-a0)-(b2-b0)
(a2-a0)-(b3-b1)
(a3-a1)-(b2-b0)
(a3-a1)-(b3-b1)
```

For a rectangle, callers pass corners in lower-left, lower-right, upper-right,
upper-left order at both endpoint poses. Corners interpolate componentwise. The
public `closest_points_segment_rectangle` result is the least
`(distance_raw_squared,feature,a.x,a.y,a.z,b.x,b.y,b.z)`. Feature 0 is a segment-plane
intersection inside both finite extents; 1 and 2 are the first and second segment
endpoint projected to and clamped on the face; 3..6 are closest points against the
left, right, bottom, and top edges. Plane intersection calls `segment_plane`.
For an accepted row, `side=corner1-corner0`, `up=corner3-corner0`, face centre is the
widened componentwise midpoint of corners 0 and 2. The normal is the normalized
widened raw `side cross up`: retain its 32.32 `i128` components, take their widened
integer length, then convert each component once to 16.16 with truncation toward
zero. This is observably different from first narrowing the cross to `Vec3`; two
one-raw edges must still produce a nonzero normal. Declared nondegeneracy therefore
makes the published normal nonzero.
Projection subtracts `normal*dot(endpoint-centre,normal)` and clamps side/up rational
coordinates to `[0,1]`. Each raw parameter is
`clamp(dot(projected-corner0,axis)*65_536/dot(axis,axis),0,65_536)` in checked signed
`i128` with truncation toward zero; reconstruct side first, then up. Edge candidates
call `closest_points_on_segments`. A
A nonzero-length coplanar segment has no feature-0 crossing and is decided by
endpoint/edge candidates. A zero-length point on the plane uses feature 0; this is
the frozen segment/rectangle contact row below.
This candidate set is complete for a segment and a closed convex rectangle. It also
returns the winning feature and raw-clamped segment/side/up fractions; unused
fractions are zero. `swept_segment_rectangle` calls this helper at every step, and
`sim` calls it again at returned TOI. No caller privately repeats feature selection.

The rectangle speed bound is the maximum of the eight lengths
`weapon_endpoint_displacement-corner_displacement`, visiting hilt then tip and the
four corners in their declared order. Its contact distance is the segment radius.
At each conservative step form exact squared raw distance in checked `i128`, but form
the nonnegative `Fx` distance only for advancing. Both new functions use:

```text
advance_raw = max(1, floor((distance-contact_distance).raw * 65_536
                           / speed_bound.raw))
```

clamped to the remaining raw time. Initial contact returns zero. A zero speed bound
returns `None` after that test. Test exactly raw 65,536 before returning `None`; cap
exhaustion returns the current conservative time. Negative radii, malformed rectangle
corner order/nonplanarity, or any envelope violation return TOI zero before arithmetic.
Rectangle validation requires both endpoint quads to have equal lower/upper Z pairs,
opposite edges with identical raw deltas, nonzero side and height, and the declared
corner winding. Corresponding side and up vectors must have strictly positive raw
dot products across endpoint poses, so linear interpolation cannot degenerate or
reverse the face. Accepted one-tick shield construction satisfies it.

For a malformed rectangle, `closest_points_segment_rectangle` returns `a=segment0`,
`b=rectangle[0]`, their saturated public `distance_sq`, `feature=255`, and all three
parameters zero. The swept function performs its validation first and returns TOI
zero, so it never treats that containment row as accepted geometry.

At a returned TOI, callers recompute the winning closest pair. A closest point's
segment parameter is the checked signed-`i128` ratio
`clamp(dot(point-start,end-start)*65_536/length_raw_squared,0,65_536)` with truncation
toward zero; zero length uses zero. The rectangle candidate retains side/up raw
fractions and its point displacement is bilinear interpolation of the four corner
displacements, lower pair before upper pair. These details are part of the portable
contact corpus rather than a host-dependent reconstruction.

`segment_plane` normalizes no vector. Let `da=(a-plane_point).normal` and
`db=(b-plane_point).normal` in widened raw arithmetic. A zero normal returns
`None`. If `da == 0`, return zero, including a coincident segment. If `db == 0`,
return one. Equal nonzero signs return `None`; otherwise return the clamped exact
ratio `da/(da-db)`, truncated toward zero in 16.16. Swapping endpoints therefore
maps a strict interior hit from `t` to `1-t` up to one raw unit.

## Frozen test vectors

All values below are exact `Fx::from_int` values unless a raw value is shown.

| operation | input | required output |
|---|---|---|
| closest | A `(0,0,0)..(4,0,0)`, B `(2,-2,0)..(2,2,0)` | both `(2,0,0)`, distance `0` |
| parallel | A `(0,0,0)..(4,0,0)`, B `(0,1,0)..(4,1,0)` | `(0,0,0)` and `(0,1,0)`, distance squared `1` |
| coincident | A `(0,0,0)..(4,0,0)`, B `(3,0,0)..(1,0,0)` | both `(1,0,0)` |
| point/segment | A `(3,2,0)..(3,2,0)`, B `(0,0,0)..(4,0,0)` | `(3,2,0)` and `(3,0,0)`, distance squared `4` |
| sphere sweep | segment `(0,-1,0)..(0,1,0)` translates to `(4,-1,0)..(4,1,0)`, sphere centre `(2,0,0)`, radius `1/2` | `Some(t)` with `t <= 3/8` and `3/8-t <= Fx::EPSILON` |
| initial tangent | segment `(0,-1,0)..(0,1,0)`, sphere `(1,0,0)`, radius `1` | `Some(ZERO)` |
| capsule sweep | point `(0,0,1)` translates to `(4,0,1)`, capsule centre `(2,0,1)`, half-height `1`, radius `1/2` | same `3/8` bound |
| plane | segment `(0,0,-1)..(0,0,3)`, point zero, normal `+z` | `TimeOfImpact(Fx::from_ratio(1,4))` |
| segment/segment sweep | zero-length A moves `(0,0,0)` to `(2,0,0)`; zero-length B stays `(1,0,0)`; both radii zero | `Some(Fx::HALF)` |
| segment/rectangle sweep | zero-length segment moves `(1,0,0)` to `(-1,0,0)`, radius zero; stationary X=0 rectangle corners `(0,-1,-1),(0,1,-1),(0,1,1),(0,-1,1)` | `Some(Fx::HALF)`; closest helper at contact has A/B zero, distance 0, feature 0, segment parameter 0, side/up `Fx::HALF` |

The wasm equality check exports the test-purpose-only
`combat_geometry_digest_lo/hi`. Tests compare every table output field first; its
writer then hashes the frozen corpus payload below, including `None`/`Some`, for
these ten vectors. `tools/wasm_check.js` compares that digest
with the native `fx` test fixture; inert geometry is therefore covered before
`World` consumes it. The export is present in release wasm because `wasm_check.js`
tests the release artifact, but no mechanic consumes it.

The portable corpus is exactly the ten table rows above in table order; no
generated/random cases enter its pin. Tests construct each input independently and
first compare every actual output field with the literal expected row. They then
hash only those actual outputs as follows: prefix ASCII `ARPG-GEOM3-V1`; for each
case write its zero-based `u8` ordinal; closest-point cases 0..3 write A x/y/z, B
x/y/z, and distance-squared as seven little-endian `i32`; optional-TOI cases 4..7
and 8..9 write presence `u8=1` then TOI raw `i32`. The stream is 165 bytes and its
required FNV-1a-64 digest is `0x9d15344883cf6e9c`. This is the authorized paired
native/wasm move from `0x56fb8704002a1a61`: the appended literal bytes are
`08 01 00 80 00 00 09 01 00 80 00 00`. The expected bytes are hand-authored from
the analytic integer cases, not recorded from the geometry implementation.

The finite boundary corpus is separate and unpinned. Its prefix is ASCII
`ARPG-GEOM3-BOUNDARY-V1`; every case first writes a monotonically increasing
little-endian `u32` ordinal, then writes its output in the frozen format above.
`ClosestPoints` writes seven raw `i32` values and every optional TOI writes its
presence byte and, when present, its raw `i32` value.

The scalar set, in order, is
`{Fx::MIN, -Fx::ONE, Fx::ZERO, Fx::EPSILON, Fx::ONE, Fx::MAX}`. “One vector at a
time” means one-hot, not a Cartesian product: for each vector argument, visit x,
y, then z and place each scalar in that component while every other component and
argument is zero. Visit functions in this order:

1. closest points, its four vector arguments;
2. segment-plane, its four vector arguments;
3. sphere sweep, its six vector arguments, then its radius scalar;
4. vertical-capsule sweep, its six vector arguments, then half-height and radius;
5. segment/segment sweep, its eight vector arguments, then both radii;
6. segment/rectangle sweep, its four segment vectors, then each endpoint rectangle
   corner in declaration order, then radius.

Next visit all eight `+/-256` XYZ corners in binary sign order (x is the low bit),
writing a degenerate closest-points case, stationary radius-zero sphere case, and
stationary zero-height/radius capsule case at each corner. Finally visit component
x/y/z then displacement `-4,+4`; a zero-length point moves from zero by that axial
displacement toward the stationary point at half the displacement, once for the
radius-one-half sphere and once for the zero-height, radius-one-half capsule.

This corpus proves totality and widened-advance behavior and is compared only
between independently computed native threads. It deliberately has no committed
digest: the ten hand-built rows are the semantic native/wasm pin, while the
boundary result is a diagnostic portability witness rather than a second golden.
