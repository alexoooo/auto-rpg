//! Deterministic math primitives.
//!
//! Everything the simulation computes runs through this crate, and it exists
//! for exactly one reason: **the same inputs must produce bit-identical
//! outputs on every platform we build for** -- x86-64 native, aarch64 native,
//! and wasm32 in a browser.
//!
//! IEEE-754 guarantees that `+ - * /` and `sqrt` are bit-exact everywhere, so
//! plain floats would *nearly* work. What breaks is everything else:
//!
//! * `sin`/`cos`/`exp`/`ln`/`powf` are libm implementations, and the libm
//!   compiled into a wasm binary is not the one in your platform's C library.
//!   A one-ULP difference is enough to diverge a chaotic simulation.
//! * FMA contraction (`a * b + c` fused into one instruction) changes results
//!   and is applied opportunistically per target.
//! * Auto-vectorised reductions change summation order.
//!
//! So the sim uses no floats at all. [`Fx`] is a 16.16 fixed-point number,
//! [`Angle`] is a 16-bit binary angle resolved through a committed sine table,
//! and [`Rng`] is a PCG32 with explicitly threaded state. `f32` appears in
//! exactly one place -- [`Fx::to_f32`] -- which is for rendering and printing
//! only and must never feed back into simulation state.
//!
//! ## Saturating, not wrapping
//!
//! Every operator saturates at [`Fx::MIN`]/[`Fx::MAX`] instead of wrapping or
//! panicking. This matters more than it looks: with wrapping arithmetic a
//! debug build panics where a release build silently wraps, so the two builds
//! would produce different histories. Saturating gives one behaviour in all
//! profiles. Saturation is still a bug -- it just fails loudly in the sim's
//! own assertions rather than in the arithmetic.

#![forbid(unsafe_code)]

mod angle;
mod fixed;
mod geom;
mod geom3;
mod hash;
mod rng;
mod sin_table;
mod vec2;
mod vec3;

pub use angle::{atan2, Angle};
pub use fixed::{energy, isqrt64, mul_div, sqrt_product, tangential_speed, Fx, FRAC_BITS, ONE_RAW};
pub use geom::{
    closest_point_on_segment, segment_circle, segment_segment, swept_segment_circle, SegmentHit,
    SWEEP_SUBSTEPS_MAX,
};
pub use geom3::{
    closest_points_on_segments, closest_points_segment_rectangle,
    combat_geometry_boundary_digest, combat_geometry_digest,
    conservative_first_clear, conservative_sweep_after_release_bracket, segment_plane,
    swept_segment_rectangle, swept_segment_rectangle_bracket, swept_segment_segment,
    swept_segment_segment_bracket, swept_segment_sphere, swept_segment_sphere_bracket,
    swept_segment_vertical_capsule, swept_segment_vertical_capsule_bracket, ClosestPoints,
    SegmentRectangleClosest, SweepBracket, TimeOfImpact,
};
pub use hash::Hash64;
pub use rng::Rng;
pub use sin_table::{SIN_TABLE, SIN_TABLE_LEN};
pub use vec2::Vec2;
pub use vec3::Vec3;
