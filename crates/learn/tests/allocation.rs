//! Does frozen inference allocate?
//!
//! v2-19 says "inference uses preallocated buffers", and that is a claim about
//! the machine rather than about the source: a `Vec` that grows once per
//! decision reads perfectly well and turns a training run into a fight with the
//! allocator. The only honest way to check it is to count.
//!
//! # The one `unsafe` block in this repository, and why it is here
//!
//! `AGENTS.md` records that `fx`, `sim` and `policy` are
//! `#![forbid(unsafe_code)]` and that `web` contains zero `unsafe {}` blocks.
//! `learn` is `#![forbid(unsafe_code)]` too. This file is not the library; it
//! is a test binary, it ships in nothing, and it contains exactly one `unsafe`
//! item -- the `GlobalAlloc` impl below, which `std` requires to be `unsafe`
//! because a global allocator has to promise things the compiler cannot check.
//!
//! There is no safe alternative. `std::alloc` exposes no allocation counter and
//! no hook, so the choice is between counting through a wrapper and asserting
//! the claim from the source, and asserting it from the source is not a test:
//! the whole failure mode is a `Vec` somebody added later that the reader's eye
//! slides over. If a future session would rather delete this file than carry
//! the `unsafe`, delete the file and the claim together -- keeping the claim
//! with a weaker test would be worse than either.

// Deliberately not `forbid(unsafe_code)`; see the module header. The narrower
// lint below still holds every `unsafe fn` body to writing its own block.
#![deny(unsafe_op_in_unsafe_fn)]

use fx::{Fx, Rng, Vec3};
use learn::{LearnedArticulatedPolicy, Model};
use policy::ArticulatedPolicy;
use sim::{ArticulatedObservation, EntityId, SegmentPose};
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);
static COUNTING: AtomicBool = AtomicBool::new(false);

/// The system allocator with a counter in front of it.
///
/// Counts allocations and reallocations and ignores frees, because the question
/// is "did this call ask the allocator for anything", not "did the heap grow".
/// A gate rather than an unconditional counter so that the test harness's own
/// traffic -- and there is a great deal of it, on every thread -- does not
/// drown the region under measurement.
struct Counting;

// SAFETY: every method forwards to `System`, unchanged, with the same layout it
// was handed. The counter is an atomic add on a `static` and allocates nothing,
// so it cannot re-enter the allocator.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if COUNTING.load(Ordering::Relaxed) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        if COUNTING.load(Ordering::Relaxed) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.realloc(ptr, layout, new_size) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if COUNTING.load(Ordering::Relaxed) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.alloc_zeroed(layout) }
    }
}

#[global_allocator]
static ALLOCATOR: Counting = Counting;

/// Counts what `body` asks the allocator for.
///
/// Single-threaded by construction: the gate is a process-wide flag, so a
/// second test allocating on another thread while this one is open would be
/// counted here. That is why this file holds exactly one test.
fn allocations_during<R>(body: impl FnOnce() -> R) -> (R, usize) {
    ALLOCATIONS.store(0, Ordering::Relaxed);
    COUNTING.store(true, Ordering::Relaxed);
    let out = body();
    COUNTING.store(false, Ordering::Relaxed);
    (out, ALLOCATIONS.load(Ordering::Relaxed))
}

/// A Fighter looking east with a Brute four units away, holding a blade.
///
/// Built once, outside the measured region, and varied only by tick -- so the
/// measurement is of `decide` and not of whatever building an observation
/// costs. `ArticulatedObservation` is `Copy` and allocates nothing anyway,
/// which is what makes that possible.
fn facing(tick: u32) -> ArticulatedObservation {
    let mut obs = ArticulatedObservation::BLANK;
    obs.tick = tick;
    obs.subject = EntityId::new(0, 0);
    obs.capabilities = ArticulatedObservation::MOVEMENT
        | ArticulatedObservation::TURNING
        | ArticulatedObservation::LEFT_GRIP
        | ArticulatedObservation::RIGHT_GRIP
        | ArticulatedObservation::RIGHT_WEAPON
        | ArticulatedObservation::SHIELD;
    obs.arms[0].equipment = Some(2);
    obs.arms[1].equipment = Some(1);
    obs.opponent_count = 1;
    obs.opponents[0].id = EntityId::new(1, 0);
    obs.opponents[0].body_position = Vec3::new(Fx::from_int(4), Fx::ZERO, Fx::ZERO);
    obs.opponents[0].weapons[1] = Some(SegmentPose {
        hilt: Vec3::new(Fx::from_int(4), Fx::ZERO, Fx::from_ratio(9, 10)),
        tip: Vec3::new(Fx::from_int(3), Fx::ZERO, Fx::from_ratio(9, 10)),
        radius: Fx::from_ratio(1, 20),
    });
    obs.opponents[0].shield.present = true;
    obs.opponents[0].shield.centre = Vec3::new(Fx::from_int(4), Fx::ZERO, Fx::from_ratio(9, 10));
    obs
}

#[test]
fn frozen_inference_allocates_nothing_after_warmup() {
    let mut rng = Rng::new(2026);
    let mut policy = LearnedArticulatedPolicy::new(Model::random(&mut rng));

    // Warmup is one decision, and it is a real warmup rather than a courtesy:
    // the first call is where `FeatureMemory` goes from empty to primed, so it
    // is the one call whose control flow differs. Everything the policy needs
    // was allocated by `new` above, which is outside the region below.
    policy.decide(&facing(0));

    let observations: Vec<ArticulatedObservation> = (1..=2_000).map(facing).collect();
    let (last, allocations) = allocations_during(|| {
        let mut last = None;
        for obs in &observations {
            last = Some(policy.decide(obs));
        }
        last
    });
    assert!(last.is_some());
    assert_eq!(
        allocations, 0,
        "two thousand decisions asked the allocator for {allocations} blocks"
    );

    // The counter is not vacuous: the same region with one `Vec` in it counts.
    // Without this a broken gate -- a flag that never turns on -- would make
    // the assertion above pass forever.
    let (_, control) = allocations_during(|| vec![0u8; 64]);
    assert!(control > 0, "the allocation counter is not counting");
}
