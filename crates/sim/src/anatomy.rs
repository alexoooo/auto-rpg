//! Regional wound state, armor transfer, and the one articulated health query.
//!
//! The split this module exists to make is between *what a body is* and *what
//! has happened to it*. The first lives in [`BodyAnatomySpec`] -- scenario
//! owned, fingerprinted, and never written after construction. The second is
//! [`AnatomyState`], which is the only articulated health authority there is:
//! there is no articulated HP column and no regeneration cache, because a
//! second copy of "how hurt is this body" is a second thing to keep in step
//! with the first, and the legacy model already demonstrates the cost.
//!
//! Everything here is pure arithmetic over immutable specs. `World` owns the
//! group accumulation and the tick ordering; this file owns the numbers, so
//! the equations can be read, tested, and argued about without a tick loop.

use crate::combat::spec::{ArmorSpec, BodyAnatomySpec};
use crate::EntityId;
use fx::{Fx, Hash64, Vec3};

/// The regions are the V1 [`AnatomyRegion`](crate::AnatomyRegion), re-exported
/// rather than redeclared. A second region enum would be a second discriminant
/// order, and the immutable spec bytes already froze this one.
pub use crate::combat::spec::AnatomyRegion as BodyPart;

/// Health units bled per tick per unit of un-severed wound, `1/3600` rounded
/// down. A body carrying its whole torso as an open wound empties in an hour of
/// ticks; the constant is what makes a deep cut a clock rather than a number.
pub const BLEED_PER_WOUND: Fx = Fx::from_raw(18);

/// Health units bled per tick per unit of severed regional maximum, `1/1800`
/// rounded down -- twice the wound rate, because a severance is the whole
/// region's cross-section rather than a cut across part of it.
pub const BLEED_PER_SEVERED: Fx = Fx::from_raw(36);

/// Shock shed per tick, `1/600` rounded down: ten seconds from full shock to
/// none, with nothing else in the way.
pub const SHOCK_DECAY_PER_TICK: Fx = Fx::from_raw(109);

/// Health units of integrity loss per unit of penetrating contact energy.
///
/// Physically this is `Fx::from_int(96)`, whose raw representation is
/// 6,291,456. It is written as a plain integer because the two fixed-point
/// scales cancel: multiplying a 16.16 energy raw by 6,291,456 and dividing by
/// 65,536 is multiplying it by 96, and forming the wider product first is one
/// more place for an overflow that carries no information.
pub const WOUND_PER_ENERGY: u128 = 96;

/// One region's mutable state. `integrity` is structural and drives severance,
/// impairment, and the health query; `wound` is the open surface that bleeds.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct PartWoundState {
    pub integrity: Fx,
    pub wound: Fx,
    pub severed: bool,
}

/// Everything an articulated body carries that a fight can change.
///
/// `last_attacker` is authoritative rather than diagnostic: bleeding damage
/// resolved ticks after the blow is credited through it, so mutating it changes
/// a recorded metric and therefore has to be hashed.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct AnatomyState {
    pub parts: [PartWoundState; BodyPart::COUNT],
    pub blood: Fx,
    pub shock: Fx,
    pub last_attacker: EntityId,
}

impl AnatomyState {
    /// An unwounded body of the given specification.
    pub fn new(spec: &BodyAnatomySpec) -> AnatomyState {
        let mut parts = [PartWoundState { integrity: Fx::ZERO, wound: Fx::ZERO, severed: false };
                         BodyPart::COUNT];
        for part in 0..BodyPart::COUNT {
            parts[part].integrity = spec.integrity_maxima[part];
        }
        AnatomyState { parts, blood: spec.blood_max, shock: Fx::ZERO, last_attacker: EntityId::NONE }
    }

    /// The row a slot that was never given an anatomy hashes as. Not reachable
    /// through a validated articulated spawn -- every one of those has a spec --
    /// but the hash walks allocated slots rather than live ones, and a slot in
    /// a Legacy-shaped column still owes the stream a row.
    pub const EMPTY: AnatomyState = AnatomyState {
        parts: [PartWoundState { integrity: Fx::ZERO, wound: Fx::ZERO, severed: false };
                BodyPart::COUNT],
        blood: Fx::ZERO,
        shock: Fx::ZERO,
        last_attacker: EntityId::NONE,
    };

    /// Head, torso, or blood gone. Checked as "not positive" rather than
    /// "equal to zero" because that is the predicate that stays right if a
    /// clamp is ever loosened, and it costs nothing.
    pub fn is_dead(&self) -> bool {
        !self.parts[BodyPart::Head as usize].integrity.is_positive()
            || !self.parts[BodyPart::Torso as usize].integrity.is_positive()
            || !self.blood.is_positive()
    }

    /// The sole articulated health query. Observation, the published frame, the
    /// timeout comparison, the outcome, and damage credit all call this one.
    pub fn health(&self, spec: &BodyAnatomySpec) -> Fx {
        if self.is_dead() { return Fx::ZERO; }
        max_health(spec) * blood_fraction(self, spec).min(weighted_regional_fraction(self, spec))
    }

    /// Whether this part can still drive a weapon, hold a shield, or carry a
    /// collider. A severed part is absent, not merely useless.
    pub fn present(&self, part: BodyPart) -> bool {
        !self.parts[part as usize].severed
    }

    pub(crate) fn hash_into(&self, h: &mut Hash64) {
        for part in self.parts {
            h.write_i32(part.integrity.raw());
            h.write_i32(part.wound.raw());
            h.write_u8(part.severed as u8);
        }
        h.write_i32(self.blood.raw());
        h.write_i32(self.shock.raw());
        self.last_attacker.hash_into(h);
    }
}

/// One anatomy row is `5*9 + 4 + 4 + 8` bytes. Named so the hash-shape test and
/// the reference can agree on one number rather than two arithmetic sums.
pub const ANATOMY_HASH_ROW_BYTES: usize = BodyPart::COUNT * 9 + 4 + 4 + 8;

/// The immutable maximum health: the same weighted sum the regional fraction
/// divides by six, left undivided. Written as repeated addition rather than
/// `torso * 2` so no fixed-point multiplication can round it.
pub fn max_health(spec: &BodyAnatomySpec) -> Fx {
    let m = spec.integrity_maxima;
    m[BodyPart::Head as usize]
        + m[BodyPart::Torso as usize] + m[BodyPart::Torso as usize]
        + m[BodyPart::LeftArm as usize]
        + m[BodyPart::RightArm as usize]
        + m[BodyPart::Legs as usize]
}

/// `(head + 2*torso + left_arm + right_arm + legs) / 6`, each term a regional
/// fraction. The torso is worth two because it is the region a fight is decided
/// on; the divisor is the sum of the weights, so an untouched body answers one.
pub fn weighted_regional_fraction(state: &AnatomyState, spec: &BodyAnatomySpec) -> Fx {
    let mut sum = Fx::ZERO;
    for part in 0..BodyPart::COUNT {
        let fraction = part_fraction(state, spec, part);
        sum += fraction;
        if part == BodyPart::Torso as usize { sum += fraction; }
    }
    sum / 6
}

pub fn part_fraction(state: &AnatomyState, spec: &BodyAnatomySpec, part: usize) -> Fx {
    let maximum = spec.integrity_maxima[part];
    if !maximum.is_positive() { return Fx::ZERO; }
    (state.parts[part].integrity / maximum).clamp(Fx::ZERO, Fx::ONE)
}

/// The open wound a region carries, as a fraction of that region's immutable
/// maximum -- the same denominator [`part_fraction`] divides by.
///
/// Two fractions rather than one because the two columns answer different
/// questions and are not complements: integrity is what is left to impair the
/// actuator with, wound is what is open to bleed, and a region can be nearly
/// intact and bleeding hard at the same time. Sharing the denominator is what
/// makes the pair comparable at a glance; using the wound's own scale would
/// make "half wounded" mean something different on a torso and on an arm.
pub fn part_wound_fraction(state: &AnatomyState, spec: &BodyAnatomySpec, part: usize) -> Fx {
    let maximum = spec.integrity_maxima[part];
    if !maximum.is_positive() { return Fx::ZERO; }
    (state.parts[part].wound / maximum).clamp(Fx::ZERO, Fx::ONE)
}

pub fn blood_fraction(state: &AnatomyState, spec: &BodyAnatomySpec) -> Fx {
    if !spec.blood_max.is_positive() { return Fx::ZERO; }
    (state.blood / spec.blood_max).clamp(Fx::ZERO, Fx::ONE)
}

/// `floor(value * f)` for a `[0,1]` fraction, widened so the product cannot
/// wrap and narrowed back only after the divide.
///
/// The fraction is clamped rather than trusted. `validate_armor` bounds every
/// spec-built coefficient to `[0,1]`, but this is public and takes a raw `Fx`,
/// and an above-one factor here would make the armor ledger *create* energy --
/// which is the one thing the whole transfer promises it cannot do.
pub fn fraction(value: u64, f: Fx) -> u64 {
    let scale = f.raw().clamp(0, Fx::ONE.raw()) as u128;
    ((value as u128 * scale) / 65_536) as u64
}

/// The armor ledger for one incident energy budget. The invariant that gives
/// this struct its reason to exist is `deflected + absorbed + penetrating ==
/// incoming`: armor may move energy between columns and may never add a raw
/// unit to the total.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct ArmorTransfer {
    pub deflected: u64,
    pub absorbed: u64,
    pub penetrating: u64,
}

/// How square the blow is, in `[0,1]`: one is a perpendicular strike and zero a
/// graze along the surface.
///
/// The weapon's relative velocity is negated before normalising, so a weapon
/// travelling *into* the body produces a vector pointing back out along the
/// outward normal. Normalisation floors, which is why the result is clamped:
/// a dot of two floored unit vectors can land one raw unit past one.
pub fn squareness(weapon_relative_velocity: Vec3, outward_normal: Vec3) -> Fx {
    let approach = (-weapon_relative_velocity).normalized_or_zero();
    approach.dot(outward_normal).abs().clamp(Fx::ZERO, Fx::ONE)
}

/// Deflection, absorption, and what is left to wound the region.
///
/// The order is exactly the reference's, and it is not interchangeable.
/// Deflection is billed first, against the *whole* incident budget, and scaled
/// by `1-square` so a shallow angle sheds more than a square hit -- that is the
/// entire mechanical argument for wearing a curved plate. Absorption then takes
/// its share of what deflection left, not of the original, so the two cannot
/// between them claim more than the blow carried.
pub fn armor_transfer(incoming: u64, armor: ArmorSpec, square: Fx) -> ArmorTransfer {
    let glance = Fx::ONE - square.clamp(Fx::ZERO, Fx::ONE);
    let deflected = fraction(fraction(fraction(incoming, armor.coverage), armor.hardness), glance);
    let remainder = incoming - deflected;
    let absorbed = fraction(fraction(remainder, armor.coverage), armor.absorption);
    ArmorTransfer { deflected, absorbed, penetrating: remainder - absorbed }
}

/// The unclamped integrity loss one penetrating budget implies, in raw health
/// units and still widened. The caller clamps against the pre-group integrity
/// before narrowing, because clamping earlier would throw away the exactness
/// the widening bought.
pub fn integrity_loss_raw(penetrating: u64) -> u128 {
    penetrating as u128 * WOUND_PER_ENERGY
}

/// The share of an integrity loss that opens a bleeding wound.
///
/// Integrity is structural and takes the whole blow; a wound is what the
/// *cutting* part of it leaves behind, so it is the loss scaled by the incident
/// cut/thrust ratio. Thrust is not returned because it is exactly the
/// remainder: computing cut and subtracting is what makes the two shares sum to
/// the loss with no rounding escaping into either column.
pub fn cut_share(loss_raw: u128, cut_raw: u64, incoming: u64) -> u128 {
    if incoming == 0 { return 0; }
    loss_raw * cut_raw as u128 / incoming as u128
}

/// Shock added by one group's integrity loss on one body: half the loss as a
/// fraction of maximum health, and never past a full shock.
pub fn shock_gain(state: &AnatomyState, spec: &BodyAnatomySpec, integrity_loss: Fx) -> Fx {
    let maximum = max_health(spec);
    if !maximum.is_positive() { return Fx::ZERO; }
    ((integrity_loss / maximum) / 2).min(Fx::ONE - state.shock).max(Fx::ZERO)
}

/// One tick of bleeding and shock decay, run once after every contact group in
/// the tick has been applied.
///
/// The answer is the blood actually lost, so the caller can credit it. Bleeding
/// is billed before the decay so a body that was shocked this tick still bleeds
/// at this tick's wounds -- the two are independent clocks and the order only
/// matters because both are written here.
pub fn bleed_and_decay(state: &mut AnatomyState, spec: &BodyAnatomySpec) -> Fx {
    let mut open = Fx::ZERO;
    let mut severed = Fx::ZERO;
    for part in 0..BodyPart::COUNT {
        if state.parts[part].severed {
            severed += spec.integrity_maxima[part];
        } else {
            open += state.parts[part].wound;
        }
    }
    let demand = open * BLEED_PER_WOUND + severed * BLEED_PER_SEVERED;
    let bleed = demand.min(state.blood).max(Fx::ZERO);
    state.blood -= bleed;
    state.shock = (state.shock - SHOCK_DECAY_PER_TICK).max(Fx::ZERO);
    bleed
}

/// The impairment factor a region contributes: how intact it is, scaled by what
/// shock leaves of it.
///
/// The two are combined here, once, and the actuator reads the product. That is
/// a contract and not an implementation detail: shock is a whole-body term, and
/// an actuator that multiplied it in again would square it on every limb.
pub fn authority(state: &AnatomyState, spec: &BodyAnatomySpec, part: BodyPart) -> Fx {
    if state.parts[part as usize].severed { return Fx::ZERO; }
    part_fraction(state, spec, part as usize) * (Fx::ONE - state.shock).clamp(Fx::ZERO, Fx::ONE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::spec::{brute_anatomy, fighter_anatomy, Material};

    fn plate(coverage: Fx, hardness: Fx, absorption: Fx) -> ArmorSpec {
        ArmorSpec { coverage, hardness, absorption, material: Material::Steel }
    }

    #[test]
    fn body_part_discriminants_and_hash_order_are_stable() {
        assert_eq!(BodyPart::COUNT, 5);
        assert_eq!(
            BodyPart::ALL.map(|part| part as u8),
            [0, 1, 2, 3, 4],
            "the immutable spec bytes froze this discriminant order",
        );
        assert_eq!(
            (BodyPart::Head as u8, BodyPart::Torso as u8, BodyPart::LeftArm as u8,
             BodyPart::RightArm as u8, BodyPart::Legs as u8),
            (0, 1, 2, 3, 4),
        );
        assert_eq!(BodyPart::from_index(4), Some(BodyPart::Legs));
        assert_eq!(BodyPart::from_index(5), None);

        // The row is written part-major, in `BodyPart` order, and the widths
        // are what the reference's 61 bytes are counted from.
        let spec = fighter_anatomy();
        let mut state = AnatomyState::new(&spec);
        state.parts[BodyPart::RightArm as usize].wound = Fx::ONE;
        let mut plain = Hash64::new();
        state.hash_into(&mut plain);
        let mut reordered = Hash64::new();
        let mut swapped = state;
        swapped.parts.swap(BodyPart::LeftArm as usize, BodyPart::RightArm as usize);
        swapped.hash_into(&mut reordered);
        assert_ne!(plain.finish(), reordered.finish(), "part order left the hash");
        assert_eq!(ANATOMY_HASH_ROW_BYTES, 61);
    }

    #[test]
    fn an_unwounded_body_answers_its_immutable_maximum() {
        for (spec, expected) in [(fighter_anatomy(), 12), (brute_anatomy(), 18)] {
            let state = AnatomyState::new(&spec);
            assert_eq!(max_health(&spec), Fx::from_int(expected));
            assert_eq!(state.health(&spec), Fx::from_int(expected));
            assert_eq!(weighted_regional_fraction(&state, &spec), Fx::ONE);
            assert_eq!(blood_fraction(&state, &spec), Fx::ONE);
            assert!(!state.is_dead());
        }
    }

    #[test]
    fn health_is_the_lesser_of_blood_and_the_weighted_regional_fraction() {
        let spec = fighter_anatomy();
        let mut state = AnatomyState::new(&spec);
        // One arm at half integrity is one sixth of the weighted sum halved.
        state.parts[BodyPart::LeftArm as usize].integrity = Fx::ONE;
        assert_eq!(weighted_regional_fraction(&state, &spec), Fx::from_ratio(11, 12));
        // Eleven less eight raw units, and the eight are not a defect: 11/12 is
        // not representable in 16.16, so the fraction floors and the product
        // carries the floor. Pinned rather than rounded off, because a change
        // to the divide would otherwise show up only as a moved digest.
        assert_eq!(state.health(&spec).raw(), Fx::from_int(11).raw() - 8);
        // Blood below that takes over, and neither term is averaged with the
        // other -- the query is a minimum, not a blend.
        state.blood = Fx::from_int(6);
        assert_eq!(state.health(&spec), Fx::from_int(6));
        // A lost head is dead however much blood is left.
        state.blood = spec.blood_max;
        state.parts[BodyPart::Head as usize].integrity = Fx::ZERO;
        assert!(state.is_dead());
        assert_eq!(state.health(&spec), Fx::ZERO);
    }

    #[test]
    fn armor_transfer_conserves_the_incident_energy_budget_exactly() {
        let cases = [
            (0u64, plate(Fx::ZERO, Fx::ZERO, Fx::ZERO), Fx::ONE),
            (1, plate(Fx::ONE, Fx::ONE, Fx::ONE), Fx::ZERO),
            (65_537, plate(Fx::from_ratio(3, 4), Fx::from_ratio(1, 2), Fx::from_ratio(1, 3)), Fx::from_ratio(1, 7)),
            (u32::MAX as u64, plate(Fx::ONE, Fx::from_ratio(1, 2), Fx::ONE), Fx::from_ratio(9, 10)),
            (u64::MAX / 65_536, plate(Fx::ONE, Fx::ONE, Fx::ONE), Fx::ZERO),
        ];
        for (incoming, armor, square) in cases {
            let ledger = armor_transfer(incoming, armor, square);
            assert_eq!(ledger.deflected + ledger.absorbed + ledger.penetrating, incoming,
                       "armor moved energy off the ledger for {incoming}");
        }
        // And a coefficient the validator would never build cannot add energy
        // either, because `fraction` clamps rather than trusting its factor.
        let rogue = ArmorSpec { coverage: Fx::from_int(4), hardness: Fx::from_int(4),
                                absorption: Fx::from_int(4), material: Material::Steel };
        let ledger = armor_transfer(1_000, rogue, Fx::ZERO);
        assert_eq!(ledger.deflected + ledger.absorbed + ledger.penetrating, 1_000);
    }

    #[test]
    fn absorption_is_billed_on_what_deflection_leaves() {
        // Conservation alone cannot see the order -- every permutation of these
        // factors conserves -- so the triple is pinned outright. Three distinct
        // coefficients, because a fixture that reuses one makes swapping it a
        // literal no-op and would report a reordering as caught when it is not.
        //
        // What this pins is the order of the two *stages*: deflection is billed
        // first and against the whole incident budget, absorption second and
        // against what deflection left. The order of the factors *within* the
        // deflection chain is not observable at any values tried -- fixed-point
        // multiplication commutes and the intermediate floor lands in the same
        // place -- so this test does not claim to catch it, and the exact
        // triple below is the only thing that would.
        let armor = plate(Fx::from_ratio(1, 3), Fx::from_ratio(2, 3), Fx::from_ratio(1, 5));
        let ledger = armor_transfer(1_000_000, armor, Fx::from_ratio(1, 4));
        assert_eq!((ledger.deflected, ledger.absorbed, ledger.penetrating),
                   (166_661, 55_554, 777_785));
        assert_eq!(ledger.deflected + ledger.absorbed + ledger.penetrating, 1_000_000);

        let absorbed_on_incident = fraction(fraction(1_000_000, Fx::from_ratio(1, 3)),
                                            Fx::from_ratio(1, 5));
        assert_eq!(absorbed_on_incident, 66_664);
        assert!(ledger.absorbed < absorbed_on_incident,
                "absorption was billed against the incident budget");
        // The two coefficients in the deflection chain are separately clamped
        // and separately floored, so a plate that is all coverage and no
        // hardness sheds nothing at all.
        assert_eq!(armor_transfer(1_000_000, plate(Fx::ONE, Fx::ZERO, Fx::ZERO), Fx::ZERO),
                   ArmorTransfer { deflected: 0, absorbed: 0, penetrating: 1_000_000 });

    }

    #[test]
    fn shallow_plate_deflects_more_than_a_square_hit_without_adding_energy() {
        let armor = plate(Fx::ONE, Fx::from_ratio(3, 4), Fx::from_ratio(1, 4));
        let square = armor_transfer(1_000_000, armor, Fx::ONE);
        let shallow = armor_transfer(1_000_000, armor, Fx::from_ratio(1, 8));
        assert_eq!(square.deflected, 0, "a perpendicular hit has nothing to skid off");
        assert!(shallow.deflected > square.deflected);
        assert!(shallow.penetrating < square.penetrating);
        for ledger in [square, shallow] {
            assert_eq!(ledger.deflected + ledger.absorbed + ledger.penetrating, 1_000_000);
        }
        // Squareness is the geometry that feeds it: straight in is one, along
        // the surface is zero, and the sign of the approach does not matter.
        assert_eq!(squareness(-Vec3::X, Vec3::X), Fx::ONE);
        assert_eq!(squareness(Vec3::X, Vec3::X), Fx::ONE);
        assert_eq!(squareness(Vec3::Y, Vec3::X), Fx::ZERO);
        assert_eq!(squareness(Vec3::ZERO, Vec3::X), Fx::ZERO);
    }

    #[test]
    fn a_cut_opens_the_wound_a_thrust_only_crushes() {
        // Cut and thrust split the same loss in the incident ratio, and thrust
        // is the remainder so the two are exactly the loss.
        let loss = integrity_loss_raw(1_000);
        assert_eq!(loss, 96_000);
        assert_eq!(cut_share(loss, 0, 1_000), 0, "a pure thrust opens no wound");
        assert_eq!(cut_share(loss, 1_000, 1_000), loss, "a pure cut is all wound");
        let mixed = cut_share(loss, 333, 1_000);
        assert_eq!(mixed, 31_968);
        assert_eq!(loss - mixed, 64_032, "thrust did not take the remainder");
    }

    #[test]
    fn shock_scales_control_and_decays_by_the_documented_raw_amount() {
        let spec = fighter_anatomy();
        let mut state = AnatomyState::new(&spec);
        // Half maximum health of integrity loss is a quarter of a shock.
        assert_eq!(shock_gain(&state, &spec, Fx::from_int(6)), Fx::from_ratio(1, 4));
        // And it saturates rather than exceeding one.
        state.shock = Fx::from_ratio(7, 8);
        assert_eq!(shock_gain(&state, &spec, Fx::from_int(12)), Fx::from_ratio(1, 8));

        state.shock = Fx::ONE;
        assert_eq!(authority(&state, &spec, BodyPart::Legs), Fx::ZERO,
                   "a fully shocked body has no authority left to spend");
        assert_eq!(bleed_and_decay(&mut state, &spec), Fx::ZERO, "an unwounded body did not bleed");
        assert_eq!(state.shock.raw(), Fx::ONE.raw() - SHOCK_DECAY_PER_TICK.raw());
        // 602 ticks in total from a full shock, not 600: the constant is
        // `1/600` *rounded down*, so 601 steps of 109 raw leave 27 raw behind
        // and the last one floors at zero rather than running negative.
        for _ in 0..600 { bleed_and_decay(&mut state, &spec); }
        assert_eq!(state.shock.raw(), 27);
        bleed_and_decay(&mut state, &spec);
        assert_eq!(state.shock, Fx::ZERO);

        // Authority is integrity times what shock leaves, combined once.
        state.shock = Fx::from_ratio(1, 2);
        state.parts[BodyPart::LeftArm as usize].integrity = Fx::ONE;
        assert_eq!(authority(&state, &spec, BodyPart::LeftArm), Fx::from_ratio(1, 4));
        assert_eq!(authority(&state, &spec, BodyPart::RightArm), Fx::from_ratio(1, 2));
        state.parts[BodyPart::RightArm as usize].severed = true;
        assert_eq!(authority(&state, &spec, BodyPart::RightArm), Fx::ZERO);
    }

    #[test]
    fn bleeding_drains_wounds_and_severances_at_the_documented_rates() {
        let spec = fighter_anatomy();
        let mut state = AnatomyState::new(&spec);
        state.parts[BodyPart::LeftArm as usize].wound = Fx::from_int(2);
        assert_eq!(bleed_and_decay(&mut state, &spec), Fx::from_int(2) * BLEED_PER_WOUND);

        // A severance bleeds off the regional maximum at twice the rate, and
        // the wound the same part still carries stops counting: the region is
        // gone, so it cannot also be an open surface.
        let mut severed = AnatomyState::new(&spec);
        severed.parts[BodyPart::LeftArm as usize].wound = Fx::from_int(2);
        severed.parts[BodyPart::LeftArm as usize].severed = true;
        assert_eq!(bleed_and_decay(&mut severed, &spec), Fx::from_int(2) * BLEED_PER_SEVERED);

        // Bleeding stops at empty rather than running blood negative.
        let mut nearly = AnatomyState::new(&spec);
        nearly.parts[BodyPart::Torso as usize].wound = Fx::from_int(2);
        nearly.blood = Fx::from_raw(1);
        assert_eq!(bleed_and_decay(&mut nearly, &spec), Fx::from_raw(1));
        assert_eq!(nearly.blood, Fx::ZERO);
        assert!(nearly.is_dead());
        assert_eq!(bleed_and_decay(&mut nearly, &spec), Fx::ZERO);
    }
}
