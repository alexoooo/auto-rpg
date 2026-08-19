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
//! `learn` and `learn-core` are `#![forbid(unsafe_code)]` too, and since
//! v2-ui-08 the code under measurement here lives in the second of them --
//! which is also the one that ships inside `web.wasm`, so an allocation on this
//! path would be a `LearnedArticulatedPolicy` growing linear memory mid-frame
//! and detaching every typed array a page holds. The claim got sharper; the
//! test did not have to change, because it drives the `learn` re-export.
//! This file is not the library; it
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
use policy::{ArticulatedPolicy, EmbodiedPolicy};
use sim::{ArticulatedObservation, EntityId, SegmentPose};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

// **The gate and the counter are per thread, and that is a correctness fix
// rather than a tidy-up.** They were a `static AtomicBool` and a
// `static AtomicUsize`, and the comment below `allocations_during` said in as
// many words what that costs: "a second test allocating on another thread while
// this one is open would be counted here. That is why this file holds exactly
// one test." v2-ui-08 then added a second test, libtest runs the two on two
// threads, and the file became flaky at about 7% a run -- the sharpest kind of
// wrong comment, one that had already diagnosed the bug it was about to be
// broken by. Serialising the two with a `Mutex` was considered and rejected: the
// window it leaves is real, because libtest's own bookkeeping for the test that
// just released the lock allocates on *its* thread while the next one measures.
// Counting only the measuring thread closes it instead of narrowing it.
//
// `Cell<usize>` and `Cell<bool>` are `Copy` with no `Drop`, so `thread_local!`
// with a `const` initialiser compiles to a plain thread-local read: no lazy
// initialisation, no destructor registration, and therefore no allocation on a
// path that runs *inside* the allocator. A type that needed dropping here would
// re-enter `alloc` on first touch and deadlock or recurse.
thread_local! {
    static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
    static COUNTING: Cell<bool> = const { Cell::new(false) };
}

/// Adds one to this thread's counter when this thread has the gate open.
fn note_allocation() {
    if COUNTING.with(Cell::get) {
        ALLOCATIONS.with(|count| count.set(count.get().wrapping_add(1)));
    }
}

/// The system allocator with a counter in front of it.
///
/// Counts allocations and reallocations and ignores frees, because the question
/// is "did this call ask the allocator for anything", not "did the heap grow".
/// A gate rather than an unconditional counter so that the test harness's own
/// traffic -- and there is a great deal of it, on every thread -- does not
/// drown the region under measurement.
struct Counting;

// SAFETY: every method forwards to `System`, unchanged, with the same layout it
// was handed. The counter is a thread-local `Cell` update and allocates nothing,
// so it cannot re-enter the allocator.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        note_allocation();
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        note_allocation();
        unsafe { System.realloc(ptr, layout, new_size) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        note_allocation();
        unsafe { System.alloc_zeroed(layout) }
    }
}

#[global_allocator]
static ALLOCATOR: Counting = Counting;

/// Counts what `body` asks the allocator for, **on this thread only**.
///
/// The scope is the thread and not the process, so this file may hold more than
/// one test and libtest may schedule them together: another test's `Vec`, and
/// the harness's own traffic on every other thread, are invisible here. What it
/// still cannot see is an allocation `body` makes on a thread it spawned, which
/// is exactly right for frozen inference -- `decide` is a call, not a runtime.
fn allocations_during<R>(body: impl FnOnce() -> R) -> (R, usize) {
    ALLOCATIONS.with(|count| count.set(0));
    COUNTING.with(|gate| gate.set(true));
    let out = body();
    COUNTING.with(|gate| gate.set(false));
    (out, ALLOCATIONS.with(Cell::get))
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

    // **And the same claim through the frame adapter, which is what every
    // corpus in this repository actually drives.** Since session 05 the training
    // loop, the held-out evaluation and `lab learn-probe` all hold a
    // `LearnedEmbodiedPolicy`, so a `Vec` added inside `into_torso_frame` or
    // inside the adapter would be paid for once per decision by every one of
    // them and the measurement above would not see it. The adapter is four lines
    // of `Fx` arithmetic on `Copy` values today, and "today" is the qualifier a
    // counter removes.
    let mut rng = Rng::new(2026);
    let mut embodied = learn::LearnedEmbodiedPolicy::new(Model::random(&mut rng));
    embodied.decide(&facing(0));
    let (last, allocations) = allocations_during(|| {
        let mut last = None;
        for obs in &observations {
            last = Some(embodied.decide(obs));
        }
        last
    });
    assert!(last.is_some());
    assert_eq!(
        allocations, 0,
        "two thousand embodied decisions asked the allocator for {allocations} blocks"
    );
}

#[test]
fn frozen_tactical_inference_allocates_nothing_after_warmup() {
    let mut rng = Rng::new(2028);
    let mut policy = learn::LearnedTacticalPolicyV2::new(learn::ModelV2::random(&mut rng));
    policy.decide(&facing(0));
    let observations: Vec<ArticulatedObservation> = (1..=2_000).map(facing).collect();
    let (last, allocations) = allocations_during(|| {
        let mut last = None;
        for obs in &observations { last = Some(policy.decide(obs)); }
        last
    });
    assert!(last.is_some());
    assert_eq!(allocations, 0, "two thousand tactical decisions asked the allocator for {allocations} blocks");
}

#[test]
fn the_cross_target_digest_allocates_nothing() {
    // **The same claim about the other public entry into frozen inference, and
    // this one is a browser export.** `crates/web`'s
    // `learned_inference_digest_lo/_hi` says in as many words that it "allocates
    // nothing, so a second call cannot grow linear memory", and that sentence is
    // the whole justification for it being callable mid-fight and for not being
    // cached the way `articulated_stream_digest_lo` is. If it were wrong, a
    // diagnostic call between two frames would grow wasm memory and detach every
    // typed array the page holds -- which is the failure this repository has
    // measured before and sized three fixed arrays around.
    //
    // It is not obviously true from the source, either: the function builds
    // sixty-four whole `ArticulatedObservation`s. They are `Copy` and land on
    // the stack today, and "today" is exactly the qualifier a counter removes.
    let mut rng = Rng::new(2027);
    let model = Model::random(&mut rng);
    // The first call is the warmup, on the reason above: `Hash64` and the three
    // buffers are locals, but the corpus generator has never run in this process
    // and neither has anything it calls.
    let _ = learn::learned_inference_digest(&model);
    let (digest, allocations) = allocations_during(|| learn::learned_inference_digest(&model));
    assert_eq!(
        allocations, 0,
        "one digest over {} cases asked the allocator for {allocations} blocks",
        learn::LEARNED_INFERENCE_CASES,
    );
    assert_eq!(digest, learn::learned_inference_digest(&model));
}
