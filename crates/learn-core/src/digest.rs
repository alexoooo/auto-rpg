//! The number that holds two targets to the same logits.
//!
//! [`Model::forward`] argues that a frozen checkpoint's argmax is reproducible
//! on any host -- rectified linear rather than `tanh` so no libm call enters the
//! forward pass, IEEE-754 `f32` multiply and add which both targets mandate, a
//! summation order fixed by the loops, no FMA contraction anywhere in the build
//! profile, and ties resolved to the lowest index. Until v2-ui-08 that was a
//! claim with no second host to check it on, and it said so.
//!
//! wasm32 is the second host. This module is the corpus the two are compared
//! over and the digest that compares them.
//!
//! # Logits and not argmaxes, deliberately
//!
//! The five head indices are five bytes, and five bytes would hide a divergence
//! that had not yet crossed a decision boundary -- which is exactly the
//! divergence worth catching, because it is the one that is about to become a
//! different fight and has not yet. So every one of the [`LEARN_ACTION_LOGITS`]
//! output words is digested, as its IEEE-754 bit pattern rather than as a
//! rendering: a decimal comparison would agree to six digits while the argmax
//! diverged on the seventh.
//!
//! # Synthetic, and never simulation output
//!
//! The corpus is built here out of the repository's own integer RNG rather than
//! recorded off a fight, and that is what makes the pin ownable. A digest taken
//! over a run of [`sim`] would move whenever the simulation moved, so a move
//! would mean nothing in particular; taken over a fixed corpus, **a move means
//! the feature slice, the action table, the layer widths or the forward pass
//! changed -- or the two targets disagree**, which is the whole point. The
//! registry row in `docs/reference/hashes.md` says the same thing from the
//! other side.
//!
//! # What the corpus fills, and what it leaves blank
//!
//! Every column [`write_features`] reads is exercised, including the two the
//! shipped fixture leaves dead (the opponent's plate, features 39 and 40) and
//! the two rate columns that need two consecutive decisions to be anything but
//! zero. `every_feature_column_is_nonzero_somewhere_in_the_corpus` is what says
//! so rather than this paragraph.
//!
//! Three *unread* fields are filled anyway -- the subject's own wound fractions
//! and severed mask, and the arms' integrity -- and that is worth knowing rather
//! than tidying, because **their draws are load-bearing**: every one consumes
//! `Rng` state, so deleting a line that "nothing reads" reshuffles every case
//! after it and moves the pin.
//!
//! **A fourth unread field is filled and its line is *not* load-bearing, which
//! is the counterexample that keeps the rule above from being read as "every
//! assignment here matters".** `arms[..].target_hand` is set to the hand's own
//! position, and that assignment draws nothing -- so deleting it would move the
//! pin only by changing what `write_features` sees, and `write_features` does
//! not read the column at all. It is there because a hand and a target hand that
//! disagree by a random offset is a pose no actuator produces, and a fixture
//! that a reader cannot believe is worth less than one column of coverage. The
//! rule is "check the draw, not the assignment".
//!
//! What is left blank is the opponent's five swept region volumes, the subject's
//! own shield, and the arms' velocity triples. A session that
//! gives one of those a feature cannot do it quietly --
//! [`LEARN_FEATURE_COUNT`] is part of [`ModelShape`], so every existing
//! checkpoint stops loading in the same commit -- and it owes this corpus the
//! column in that commit.
//!
//! # The two caveats that travel with the number
//!
//! **A NaN logit's bits are not portable**, and [`portable_bits`] is what folds
//! them. `CheckpointError::NotFinite` refuses a non-finite *weight* and the
//! plan's ingredient table stopped there; a checkpoint of finite-but-enormous
//! weights can still overflow the first layer and produce a NaN in the second,
//! and WebAssembly leaves an arithmetic NaN's payload unspecified. That would
//! read as a portability failure and be none. See that function.
//!
//!
//! This holds for the repository's **baseline** targets: MSVC x86-64 with no
//! `target-cpu`, `target-feature` or fast-math in the profile, and the wasm MVP.
//! Baseline x86-64 has no FMA instruction and neither does the wasm MVP, which
//! is what closes contraction. Building native with `-C target-cpu=native` on a
//! host that has FMA re-opens it, and a fused multiply-add rounds once where the
//! loop below rounds twice. **That build is outside the guarantee**, and it is a
//! real hole rather than a footnote: nothing in the repository would notice
//! until this digest failed.
//!
//! **The caveat was tried rather than reasoned about, and this digest caught
//! it.** Seven mutations of [`Model::forward`] were run against the shipped
//! checkpoint: an identity activation, a dropped bias, a reversed summation
//! order and a `mul_add` contraction each move this number, and the three that
//! do not are semantically identical or differ below one ULP. All forty-one
//! feature columns move it, as do 3,855 of the 3,858 weights -- the three that
//! do not are masked by a rectified linear and move under any absolute nudge of
//! 1.0 or more. So the FMA hole above is an empirical hazard and not a
//! footnote: the exact instruction `-C target-cpu=native` would license was
//! substituted into the loop, and the pin saw it.

use crate::model::{
    write_features, write_features_v2, FeatureMemory, Model, ModelShape, ModelShapeV2, ModelV2,
    HIDDEN_UNITS, LEARN_ACTION_LAYOUT_VERSION, LEARN_ACTION_LOGITS, LEARN_FEATURE_COUNT,
    LEARN_FEATURE_LAYOUT_VERSION, LEARN_V2_ACTION_LAYOUT_VERSION, LEARN_V2_ACTION_LOGITS,
    LEARN_V2_FEATURE_COUNT, LEARN_V2_FEATURE_LAYOUT_VERSION,
};
use fx::{Fx, Hash64, Rng, Vec3};
use policy::{TacticalContextV1, TacticalPhase};
use sim::{Observation, BodyPart, EntityId, SegmentPose};

/// The ASCII prefix every case is hashed behind.
///
/// A domain rather than a bare FNV of the words, on the precedent
/// `ARPG-STREAM-V1` set: two digests over different subjects that happened to
/// start with the same bytes would otherwise be comparable by accident.
pub const LEARNED_INFERENCE_DIGEST_DOMAIN: &[u8] = b"ARPG-LEARNED-V1";
pub const LEARNED_TACTICAL_INFERENCE_DIGEST_DOMAIN: &[u8] = b"ARPG-LEARNED-TACTICAL-V2";

/// How many observations the corpus is.
///
/// Sixty-four rather than a round thousand: the digest is a *portability* check
/// and not a statistical one, so what it needs is coverage of every branch in
/// [`write_features`] and of every column the network reads, which sixty-four
/// cases reach several times over. The cost matters because this runs behind a
/// `pub extern "C"` export -- sixty-four forward passes is about 247,000
/// multiply-adds, which is a diagnostic a page can call without thinking about
/// it, and sixty-four thousand would not be.
pub const LEARNED_INFERENCE_CASES: usize = 64;

/// The seed the corpus is drawn from. Arbitrary and frozen; it is part of the
/// fixture exactly as `abi-high-water`'s world seed is part of that one.
const CORPUS_SEED: u64 = 0x4152_5047_4c52_4e31;

/// Ticks between one case and the next.
///
/// **Not coprime with the script's 360-tick cycle, and an earlier version of
/// this comment claimed it was.** `gcd(57, 360)` is 3, so `i * 57 mod 360` has
/// period 120 and every phase the corpus visits is a multiple of three ticks.
/// What the number actually buys is what the corpus needs: sixty-four *distinct*
/// phases, spread over the circle rather than clustered, which 57 gives because
/// 64 is inside that period of 120. A step that shared a larger factor -- 60,
/// say -- would visit six points over and over.
///
/// It also keeps the tick strictly increasing, which is what the two rate
/// columns need: [`FeatureMemory::rates`] answers a pair of zeros when the clock
/// has not moved.
///
/// **The value is frozen and the reason is not the value.** Re-deriving 57 from
/// a coprimality that does not hold would move `LEARNED_INFERENCE_DIGEST` for no
/// behavioural reason at all, which is why the arithmetic is written out here
/// rather than asserted in a word.
const CASE_TICKS: u32 = 57;

/// One case of the corpus, a pure function of its index.
///
/// **A function of the index and not a walk**, so that a failing case can be
/// rebuilt on its own from the number the failure prints without replaying the
/// sixty-three before it. Each case draws from its own [`Rng::from_stream`] for
/// that reason.
///
/// **That is a property of this function and emphatically not of the digest.**
/// An earlier version of this paragraph went on "so that a caller can digest the
/// corpus in any order it likes", which is false and would be a bad idea:
/// [`learned_inference_digest`] chains a [`FeatureMemory`] from one case to the
/// next on purpose, because two of the forty-one columns are rates and a reset
/// corpus would digest sixty-four zeros in each of them. Measured on the shipped
/// checkpoint: the ascending walk gives `0xbdba8d64d340ce32`, reversing it gives
/// `0x5004b7f19df2d8a6`, and swapping one adjacent pair gives a third number
/// again. There is exactly one caller and it walks ascending; the ordering is
/// part of the fixture in the way `CORPUS_SEED` is.
///
/// Everything is drawn through the repository's integer PCG32 and converted with
/// `Fx` arithmetic, so the corpus itself is portable by the same argument
/// everything under `crates/fx` is -- which it has to be, or a digest
/// disagreement would not distinguish a divergent network from a divergent
/// fixture.
pub fn learned_inference_case(index: usize) -> Observation {
    // Case zero is the blank observation, exactly as it arrives: a stale
    // identity, a corpse and a Legacy world all answer it, so it is the one
    // input every body is guaranteed to see and the one a corpus must not skip.
    if index == 0 {
        return Observation::BLANK;
    }

    let mut rng = Rng::from_stream(CORPUS_SEED, index as u64, 0);
    let mut obs = Observation::BLANK;
    obs.tick = index as u32 * CASE_TICKS;
    obs.subject = EntityId::new(0, 0);
    obs.capabilities = Observation::MOVEMENT
        | Observation::TURNING
        | Observation::LEFT_GRIP
        | Observation::RIGHT_GRIP
        | Observation::RIGHT_WEAPON
        | Observation::SHIELD;

    // Inside a 24x16 room, which is the arena the configured duel opens. The
    // absolute placement reaches the slice only through differences, but a body
    // outside its own room is a fixture a reader would stop trusting.
    obs.body_position = Vec3::new(
        Fx::from_int(12) + rng.signed_unit() * Fx::from_int(8),
        Fx::from_int(8) + rng.signed_unit() * Fx::from_int(6),
        Fx::ZERO,
    );
    obs.body_yaw = rng.angle();
    // A shove is faster than a walk and `SPEED_SCALE` is 0.25, so a range of
    // +/- 0.3 reaches 1.2 in the feature and stays well inside the clamp. The
    // clamp is a guard here rather than a normalisation, and a corpus that sat
    // on it would be comparing two saturated constants.
    obs.body_velocity = Vec3::new(
        rng.signed_unit() * Fx::from_ratio(3, 10),
        rng.signed_unit() * Fx::from_ratio(3, 10),
        Fx::ZERO,
    );
    obs.blood_fraction = rng.unit();
    obs.shock = rng.unit();
    for part in 0..BodyPart::COUNT {
        obs.integrity_fraction[part] = rng.unit();
        obs.wound_fraction[part] = rng.unit();
    }
    obs.severed_mask = rng.below(1 << BodyPart::COUNT as u32) as u8;

    for arm in 0..2 {
        let hand = Vec3::new(
            obs.body_position.x + rng.signed_unit() * Fx::from_ratio(6, 10),
            obs.body_position.y + rng.signed_unit() * Fx::from_ratio(6, 10),
            Fx::from_ratio(6, 10) + rng.unit(),
        );
        obs.arms[arm].hand = hand;
        obs.arms[arm].target_hand = hand;
        obs.arms[arm].fatigue = rng.unit();
        obs.arms[arm].integrity_fraction = rng.unit();
        // Row 0 carries the plate and row 1 the sword, which is the shipped
        // Fighter's loadout and what `compose` reads to decide which arm swings.
        obs.arms[arm].equipment = Some(if arm == 0 { 2 } else { 1 });
    }

    // Every eleventh case has nobody in sight. The fixture spawns 10.8 apart
    // against a 9.6 sight range, so the opening seconds of every real fight are
    // spent blind, and thirty-six of the forty-one columns are zero there --
    // which makes it the case a corpus is likeliest to forget and the network
    // likeliest to meet.
    if index % 11 == 0 {
        return obs;
    }
    obs.opponent_count = 1;
    let other = &mut obs.opponents[0];
    other.id = EntityId::new(1, 0);
    // Half a unit to nine, which straddles `RANGE_SCALE` and puts cases either
    // side of the sight range that admitted them.
    let bearing = rng.angle();
    let range = Fx::from_ratio(1, 2) + rng.unit() * Fx::from_ratio(17, 2);
    other.body_position = Vec3::new(
        obs.body_position.x + bearing.cos() * range,
        obs.body_position.y + bearing.sin() * range,
        Fx::ZERO,
    );
    other.body_yaw = rng.angle();
    other.body_velocity = Vec3::new(
        rng.signed_unit() * Fx::from_ratio(3, 10),
        rng.signed_unit() * Fx::from_ratio(3, 10),
        Fx::ZERO,
    );
    other.contact_timing = rng.unit();
    other.severed_mask = rng.below(1 << BodyPart::COUNT as u32) as u8;

    // The blade. Every third case leaves the right grip empty and every fifth
    // fills the left, which makes four states rather than two and all four are
    // wanted: two blades (the only thing that exercises `live_blade`'s
    // nearest-tip rule, since the shipped roster fills the right slot on both
    // bodies and never reaches it), the ordinary right-hand blade, a *left*-hand
    // blade on the multiples of fifteen, and nothing at all -- which is what
    // makes feature 30 a live column rather than a constant one.
    //
    // `the_corpus_exercises_every_branch_the_feature_writer_has` counts all four
    // rather than trusting this arithmetic, because an earlier version of this
    // comment said "every third case is disarmed" and the multiples of fifteen
    // are not.
    if index % 3 != 0 {
        other.weapons[1] = Some(blade(&mut rng, other.body_position));
    }
    if index % 5 == 0 {
        other.weapons[0] = Some(blade(&mut rng, other.body_position));
    }
    // And the plate, on half the cases. **Features 39 and 40 are structurally
    // dead on the shipped fixture** -- the probe puts the candidate on the
    // Fighter and the Fighter's only opponent is a plateless Brute -- so this
    // is the only place in the repository that puts a number through those two
    // columns at all.
    if index % 2 == 0 {
        other.shield.present = true;
        other.shield.centre = Vec3::new(
            other.body_position.x + rng.signed_unit() * Fx::from_ratio(1, 2),
            other.body_position.y + rng.signed_unit() * Fx::from_ratio(1, 2),
            Fx::from_ratio(7, 10) + rng.unit(),
        );
        other.shield.normal = Vec3::new(other.body_yaw.cos(), other.body_yaw.sin(), Fx::ZERO);
        other.shield.half_width = Fx::from_ratio(1, 4);
        other.shield.half_height = Fx::from_ratio(1, 2);
    }
    obs
}

/// A held segment somewhere around a body, hilt near it and tip out in front.
fn blade(rng: &mut Rng, at: Vec3) -> SegmentPose {
    let bearing = rng.angle();
    let hilt = Vec3::new(
        at.x + rng.signed_unit() * Fx::from_ratio(1, 2),
        at.y + rng.signed_unit() * Fx::from_ratio(1, 2),
        Fx::from_ratio(1, 2) + rng.unit(),
    );
    let reach = Fx::from_ratio(3, 4) + rng.unit() / 2;
    SegmentPose {
        hilt,
        tip: Vec3::new(
            hilt.x + bearing.cos() * reach,
            hilt.y + bearing.sin() * reach,
            hilt.z + rng.signed_unit() * Fx::from_ratio(1, 2),
        ),
        radius: Fx::from_ratio(1, 25),
    }
}

/// `LEARNED_INFERENCE_DIGEST`: FNV-1a-64 over the logits this model produces on
/// the corpus above.
///
/// The stream is the domain prefix, then the three contracts a checkpoint is
/// frozen against, then the case count, then per case its index and every one of
/// its output words as an IEEE-754 bit pattern. **The contracts are in the
/// stream deliberately**: they are what decides who owns a move, so a layout
/// bump moves the number loudly rather than through whatever the weights
/// happened to do afterwards.
///
/// **Allocates nothing, and that is counted rather than argued.** The corpus is
/// generated a case at a time and the three buffers are fixed-width locals,
/// which matters because the caller is a wasm export and a heap that grew
/// mid-call would detach every typed array the page holds.
/// `the_cross_target_digest_allocates_nothing` in
/// `crates/learn/tests/allocation.rs` drives this function through the counting
/// `#[global_allocator]`, on the argument that file's header makes: sixty-four
/// `Observation`s are `Copy` and land on the stack *today*, and
/// "today" is the qualifier a counter removes.
///
/// The [`FeatureMemory`] is carried from case to case rather than reset, because
/// two of the forty-one columns are rates and a reset corpus would digest
/// sixty-four zeros in each of them.
pub fn learned_inference_digest(model: &Model) -> u64 {
    let mut hash = Hash64::new();
    hash.write_bytes(LEARNED_INFERENCE_DIGEST_DOMAIN);
    hash.write_u32(LEARN_FEATURE_LAYOUT_VERSION);
    hash.write_u32(LEARN_ACTION_LAYOUT_VERSION);
    let shape = ModelShape::CURRENT;
    hash.write_u32(shape.inputs as u32);
    hash.write_u32(shape.hidden as u32);
    hash.write_u32(shape.outputs as u32);
    hash.write_u32(LEARNED_INFERENCE_CASES as u32);

    let mut features = [0.0f32; LEARN_FEATURE_COUNT];
    let mut hidden = [0.0f32; HIDDEN_UNITS];
    let mut logits = [0.0f32; LEARN_ACTION_LOGITS];
    let mut memory = FeatureMemory::EMPTY;
    for index in 0..LEARNED_INFERENCE_CASES {
        let obs = learned_inference_case(index);
        memory = write_features(&obs, memory, &mut features);
        model.forward(&features, &mut hidden, &mut logits);
        hash.write_u32(index as u32);
        for logit in logits {
            hash.write_u32(portable_bits(logit));
        }
    }
    hash.finish()
}

/// The tactical V2 network's cross-target receipt over the same synthetic
/// observation walk as V1. It is additive: the V1 digest continues to name the
/// shipped V1 checkpoint and cannot be re-recorded because a second artifact
/// was promoted beside it.
pub fn learned_tactical_inference_digest(model: &ModelV2) -> u64 {
    let mut hash = Hash64::new();
    hash.write_bytes(LEARNED_TACTICAL_INFERENCE_DIGEST_DOMAIN);
    hash.write_u32(LEARN_V2_FEATURE_LAYOUT_VERSION);
    hash.write_u32(LEARN_V2_ACTION_LAYOUT_VERSION);
    let shape = ModelShapeV2::CURRENT;
    hash.write_u32(shape.inputs as u32);
    hash.write_u32(shape.hidden as u32);
    hash.write_u32(shape.outputs as u32);
    hash.write_u32(LEARNED_INFERENCE_CASES as u32);

    let mut features = [0.0f32; LEARN_V2_FEATURE_COUNT];
    let mut hidden = [0.0f32; HIDDEN_UNITS];
    let mut logits = [0.0f32; LEARN_V2_ACTION_LOGITS];
    let mut memory = FeatureMemory::EMPTY;
    for index in 0..LEARNED_INFERENCE_CASES {
        let obs = learned_inference_case(index);
        memory = write_features_v2(
            &obs,
            memory,
            TacticalContextV1 {
                phase: TacticalPhase::Seek,
                plan: None,
                threat: None,
                opponent_recovering: false,
            },
            &mut features,
        );
        model.forward(&features, &mut hidden, &mut logits);
        hash.write_u32(index as u32);
        for logit in logits {
            hash.write_u32(portable_bits(logit));
        }
    }
    hash.finish()
}

/// One logit's bits, with the one value whose bits are **not** portable folded
/// onto a constant.
///
/// **The last hole in the cross-target argument, and it is not the one the plan
/// anticipated.** `CheckpointError::NotFinite` refuses a non-finite *weight*, so
/// the plan's ingredient table wrote "NaN cannot enter" and stopped there. A NaN
/// *logit* is a different animal: [`crate::CheckpointError`] admits any finite
/// weight including `3e38`, so a hand-built checkpoint can overflow the first
/// layer to an infinity and then produce `Inf + (-Inf)` in the second -- and
/// **WebAssembly leaves an arithmetic NaN's payload bits unspecified**, so
/// `to_bits()` of that logit is the one quantity in this stream that two
/// conforming targets may legitimately disagree about. It would report a
/// portability failure that is nothing of the kind.
///
/// Folded onto `f32::NAN`, which is a compile-time constant with the same
/// `0x7fc0_0000` on every target rather than a runtime result. Infinities need
/// no fold: IEEE-754 fixes their bits exactly.
///
/// **This cannot move `LEARNED_INFERENCE_DIGEST`.** The shipped checkpoint
/// produces 1,152 finite logits, `the_shipped_corpus_produces_only_finite_logits`
/// is what says so, and a finite `f32` takes the untouched branch.
#[inline]
fn portable_bits(logit: f32) -> u32 {
    if logit.is_nan() {
        f32::NAN.to_bits()
    } else {
        logit.to_bits()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::LearnedActionV1;

    #[test]
    fn the_corpus_exercises_every_branch_the_feature_writer_has() {
        // A digest over a corpus that never reaches a branch is a digest that
        // cannot tell you the branch diverged. Each of these is a `if` or a
        // `match` arm in `write_features` or in `live_blade`, and the counts are
        // lower bounds rather than exact numbers so that re-seeding the corpus
        // is a decision about coverage and not a re-record.
        let (mut blind, mut disarmed, mut right_only, mut left_only, mut two_blades) =
            (0, 0, 0, 0, 0);
        let mut plated = 0;
        for index in 0..LEARNED_INFERENCE_CASES {
            let obs = learned_inference_case(index);
            let Some(other) = obs.opponents().first() else {
                blind += 1;
                continue;
            };
            match (other.weapons[0].is_some(), other.weapons[1].is_some()) {
                (false, false) => disarmed += 1,
                (false, true) => right_only += 1,
                (true, false) => left_only += 1,
                (true, true) => two_blades += 1,
            }
            if other.shield.present {
                plated += 1;
            }
        }
        assert!(blind >= 5, "only {blind} cases have nobody in sight");
        assert!(disarmed >= 10, "only {disarmed} cases face a disarmed opponent");
        assert!(right_only >= 20, "only {right_only} cases carry an ordinary right-hand blade");
        // The multiples of fifteen: the left grip filled and the right empty,
        // which is the case the shipped roster never produces and the one an
        // earlier comment here miscounted as "disarmed".
        assert!(left_only >= 3, "only {left_only} cases carry a blade in the off hand");
        assert!(
            two_blades >= 5,
            "only {two_blades} cases reach live_blade's nearest-tip comparison",
        );
        assert!(plated >= 20, "only {plated} cases put a number through features 39 and 40");
        assert_eq!(
            learned_inference_case(0),
            Observation::BLANK,
            "case zero is the blank observation every body is guaranteed to see",
        );
    }

    #[test]
    fn every_feature_column_is_nonzero_somewhere_in_the_corpus() {
        // The claim the digest rests on: a divergence in *any* column shows up
        // in a logit, which it can only do if the column carries a number. The
        // two dead-on-the-fixture plate columns are the ones this is really
        // about, and the two rate columns are the ones it is easiest to leave
        // at zero by accident -- they need two consecutive cases with a blade
        // in both and a clock that moved between them.
        let mut seen = [false; LEARN_FEATURE_COUNT];
        let mut features = [0.0f32; LEARN_FEATURE_COUNT];
        let mut memory = FeatureMemory::EMPTY;
        for index in 0..LEARNED_INFERENCE_CASES {
            memory = write_features(&learned_inference_case(index), memory, &mut features);
            for (column, value) in features.iter().enumerate() {
                assert!(value.is_finite(), "case {index} feature {column} is not finite");
                seen[column] |= *value != 0.0;
            }
        }
        let dead: Vec<usize> = (0..LEARN_FEATURE_COUNT).filter(|&i| !seen[i]).collect();
        assert!(dead.is_empty(), "the corpus never moves features {dead:?}");
    }

    #[test]
    fn a_nonportable_logit_is_folded_and_the_shipped_one_is_never_reached() {
        // Two halves, and the second is what says the fold cannot have moved
        // the pin. A NaN's payload bits are unspecified in WebAssembly, so two
        // conforming targets may hash different words for the same broken
        // network; every distinguishable NaN has to leave this function as one
        // value.
        for raw in [0x7fc0_0000u32, 0x7fff_ffff, 0xffc0_0001, 0x7f80_0001] {
            let nan = f32::from_bits(raw);
            assert!(nan.is_nan(), "{raw:#010x} is not a NaN");
            assert_eq!(portable_bits(nan), f32::NAN.to_bits(), "{raw:#010x} was not folded");
        }
        // Everything else passes through, infinities included: IEEE-754 fixes
        // their bits and there is nothing to canonicalise.
        for value in [0.0f32, -0.0, 1.0, -1.0, f32::MIN, f32::MAX, f32::INFINITY, f32::NEG_INFINITY]
        {
            assert_eq!(portable_bits(value), value.to_bits());
        }
        // `0.0` and `-0.0` are equal and have different bits, which is the
        // reason this digest reads bits at all rather than comparing numbers.
        assert_ne!(portable_bits(0.0), portable_bits(-0.0));
    }

    #[test]
    fn the_digest_is_a_function_of_the_weights_and_of_nothing_else() {
        // Twice over the same model is the same number -- which is the property
        // a cross-target pin is -- and one weight moved is a different one,
        // which is what says the corpus reaches the network at all.
        let mut rng = Rng::new(19);
        let model = Model::random(&mut rng);
        let digest = learned_inference_digest(&model);
        assert_eq!(digest, learned_inference_digest(&model));
        assert_ne!(digest, learned_inference_digest(&Model::zeros()));

        let mut nudged = model.clone();
        nudged.weights_mut()[1_234] += 1.0;
        assert_ne!(digest, learned_inference_digest(&nudged), "a moved weight is invisible");
    }

    #[test]
    fn the_digest_would_notice_a_divergence_the_argmax_hides() {
        // The reason the stream carries logits. A perturbation small enough to
        // leave all five head indices where they were still moves the number,
        // which is exactly the near-boundary divergence a five-byte digest would
        // report as agreement.
        let mut rng = Rng::new(23);
        let model = Model::random(&mut rng);
        let mut nudged = model.clone();
        for weight in nudged.weights_mut() {
            *weight *= 1.0 + 1.0 / 1_048_576.0;
        }

        let mut features = [0.0f32; LEARN_FEATURE_COUNT];
        let mut hidden = [0.0f32; HIDDEN_UNITS];
        let mut logits = [0.0f32; LEARN_ACTION_LOGITS];
        let mut memory = FeatureMemory::EMPTY;
        let mut nudged_memory = FeatureMemory::EMPTY;
        for index in 0..LEARNED_INFERENCE_CASES {
            let obs = learned_inference_case(index);
            memory = write_features(&obs, memory, &mut features);
            model.forward(&features, &mut hidden, &mut logits);
            let chosen = LearnedActionV1::from_logits(&logits);
            nudged_memory = write_features(&obs, nudged_memory, &mut features);
            nudged.forward(&features, &mut hidden, &mut logits);
            assert_eq!(
                chosen,
                LearnedActionV1::from_logits(&logits),
                "case {index}: the perturbation was large enough to cross a boundary, \
                 so this test is no longer about the divergence it names",
            );
        }
        assert_ne!(
            learned_inference_digest(&model),
            learned_inference_digest(&nudged),
            "a divergence that has not yet reached an argmax is invisible to the digest",
        );
    }
}
