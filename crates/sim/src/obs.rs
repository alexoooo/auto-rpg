use crate::action::Order;
use crate::entity::{EntityId, Faction};
use crate::hand::Hand;
use crate::rules::MAX_CONTACTS;
use fx::{Angle, Fx, Vec2};

/// One perceived unit.
///
/// Everything here except `id` and the two size fields has already been
/// degraded by the observer's perception stat, so two characters looking at the
/// same enemy do not necessarily see it in the same place -- or see its blade
/// pointing the same way.
///
/// That last part is what makes `perception` a fighting stat rather than a
/// scouting one. Blocking and dodging are both bets on where a blade will be in
/// a few ticks, and the inputs to that bet are `sword_angle` and `sword_spin`.
/// A dim character does not merely block late; it blocks the wrong line.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Contact {
    pub id: EntityId,
    /// Position relative to the observer, as perceived.
    pub offset: Vec2,
    /// `offset.length()`, precomputed because every policy wants it.
    pub distance: Fx,
    /// Perceived health, `0..=1`.
    pub hp_frac: Fx,
    /// Body size. Not degraded by perception -- how big something is stays
    /// legible even when where it is does not. Policies need it to work out
    /// their own reach.
    pub radius: Fx,
    /// Blade length beyond the body at full extension. Like `radius`, a fact
    /// about the object rather than about its state, so it arrives clean: you
    /// can see how long a sword is well before you can read where it is going.
    pub weapon_length: Fx,
    /// Which way the body is heading, as perceived.
    pub facing: Angle,
    /// Perceived bearing of the enemy's sword hand.
    pub sword_angle: Angle,
    /// Perceived angular velocity of that hand, raw angle units per tick. The
    /// telegraph: sign says which way the swing is coming, magnitude says how
    /// much it will hurt and how long the recovery will be.
    pub sword_reach: Fx,
    pub sword_spin: Fx,
    /// Perceived bearing of the enemy's shield hand, and how far it is braced.
    /// Between them these say where the enemy *cannot* be hit.
    pub shield_angle: Angle,
    pub shield_reach: Fx,
}

/// Everything an agent knows when it decides.
///
/// This is the *entire* input side of the agent boundary. If a policy needs
/// something that is not in here, it cannot have it -- which is the point:
/// the sim can hold a hundred fields of ground truth, and what leaks into a
/// decision is exactly what perception allows.
#[derive(Clone, Debug)]
pub struct Observation {
    pub tick: u32,
    pub me: EntityId,
    pub faction: Faction,
    /// Own position, known exactly. Proprioception is free.
    pub position: Vec2,
    pub hp_frac: Fx,
    /// `0` the hand is dead from a blow just landed, `1` free to strike.
    pub attack_ready: Fx,
    /// Own body size. With [`Contact::radius`] this is enough for a policy to
    /// compute exactly how close it must get to land a hit.
    pub radius: Fx,
    /// Own blade length beyond the two radii, at full extension.
    pub weapon_length: Fx,
    /// Distance from its own centre inside which its blade cannot reach the
    /// speed a blow requires, however hard it swings.
    ///
    /// Every weapon has one, because impact is `spin x arm`: crowd close enough
    /// and there is no arm left to build speed on. It is the reason hugging a
    /// Brute works, and the reason hugging with a *Skitterer* does not -- its
    /// own dead zone is only a third of a unit, but so is its whole sword.
    ///
    /// Derived rather than perceived: a fighter knows how hard it can swing.
    pub min_strike_range: Fx,
    /// Own hands, exactly. Proprioception is free: you always know where your
    /// own sword is and how fast it is travelling, however dim you are.
    pub hands: [Hand; crate::hand::HANDS],
    /// Half-width of the observer's own shield arc at full extension, raw angle
    /// units. Fixed by the weapon, so a policy can work out what it is actually
    /// covering before it commits to covering it.
    pub shield_arc: u16,
    pub sight_range: Fx,
    /// World units per tick.
    pub move_speed: Fx,
    /// Ticks between this character's decisions -- its own reaction speed.
    ///
    /// Self-knowledge of the same class as [`Observation::position`]:
    /// proprioception is free. It is the one number that tells a policy how
    /// long it will be stuck with whatever it decides now, without which an
    /// agent cannot pace a final stride, because a stale action keeps running
    /// until the next decision tick.
    pub decision_period: u16,
    /// The player's standing order for this faction.
    ///
    /// A command, not a percept: it comes from the player rather than from the
    /// world, so unlike everything else here it is exact and untouched by
    /// perception noise.
    pub order: Order,

    enemy_slots: [Contact; MAX_CONTACTS],
    enemy_count: u8,
    ally_slots: [Contact; MAX_CONTACTS],
    ally_count: u8,

    /// Distance to the arena edge in `-x, +x, -y, +y`.
    pub wall_clearance: [Fx; 4],
}

/// Values per contact in the feature vector: direction (2), range, health,
/// size, weapon length, facing (2), sword direction (2), sword spin, sword
/// reach, shield direction (2), shield reach.
///
/// Every angle enters as a `(cos, sin)` pair rather than as a number, and that
/// is not a rounding detail: a raw angle is discontinuous at the wrap, so a
/// blade at 359 degrees and one at 1 degree would look maximally different to
/// anything trying to learn from the slot. Two continuous components have no
/// seam to learn across.
const FEATURES_PER_CONTACT: usize = 15;

/// Own-state values: health, attack readiness, radius, weapon length, minimum
/// strike range, decision rate, shield arc, then both hands as direction (2),
/// spin and reach.
const SELF_FEATURES: usize = 7 + 4 * crate::hand::HANDS;

/// Width of the flattened feature vector produced by
/// [`Observation::write_features`].
pub const FEATURE_COUNT: usize =
    SELF_FEATURES + Order::COUNT + 2 + (MAX_CONTACTS * FEATURES_PER_CONTACT) * 2 + 4;

/// Bumped whenever the layout of [`Observation::write_features`] changes shape
/// or meaning.
///
/// The layout is the contract a trained network is frozen against, so a change
/// here is a retraining bill. Recording the version is what lets a future
/// frozen network refuse to load against a vector it was not trained on,
/// instead of quietly reading the wrong number out of every slot.
pub const FEATURE_LAYOUT_VERSION: u32 = 3;

/// Spin, in raw angle units per tick, that normalises to `1` in the feature
/// vector. Above the fastest weapon in the game, so the clamp is a guard rather
/// than a routine flattening of the signal.
const SPIN_SCALE: Fx = Fx::from_int(4000);

/// A shield arc half-width as a fraction of a half turn, so it lands inside the
/// vector's `-1..=1` invariant like everything else.
#[inline]
fn arc_fraction(arc: u16) -> Fx {
    Fx::from_ratio(arc as i32, 32_768)
}

impl Observation {
    /// An observation of an empty battlefield.
    ///
    /// Public, with [`Observation::set_enemies`] and
    /// [`Observation::set_allies`], so a policy can be unit-tested against a
    /// hand-built situation instead of one coaxed out of a live world. Getting
    /// an agent into the exact circumstance you want to assert about is
    /// otherwise surprisingly hard, and tests that give up and assert something
    /// weaker are how behaviour regressions slip through.
    pub fn blank(
        tick: u32,
        me: EntityId,
        faction: Faction,
        position: Vec2,
        order: Order,
    ) -> Observation {
        Observation {
            tick,
            me,
            faction,
            position,
            hp_frac: Fx::ONE,
            attack_ready: Fx::ONE,
            radius: Fx::ZERO,
            weapon_length: Fx::ZERO,
            min_strike_range: Fx::ZERO,
            hands: [Hand::default(); crate::hand::HANDS],
            shield_arc: 0,
            sight_range: Fx::ONE,
            move_speed: Fx::ZERO,
            // One, never zero. `Fx` division by zero saturates to `Fx::MAX`
            // rather than panicking, so a zero period would turn a policy's
            // "how far can I travel before my next thought" term into a
            // silently disabled brake with nothing failing anywhere.
            decision_period: 1,
            order,
            enemy_slots: [Contact::default(); MAX_CONTACTS],
            enemy_count: 0,
            ally_slots: [Contact::default(); MAX_CONTACTS],
            ally_count: 0,
            wall_clearance: [Fx::ZERO; 4],
        }
    }

    /// Perceived enemies, nearest first.
    #[inline]
    pub fn enemies(&self) -> &[Contact] {
        &self.enemy_slots[..self.enemy_count as usize]
    }

    /// Perceived allies, nearest first. Does not include the observer.
    #[inline]
    pub fn allies(&self) -> &[Contact] {
        &self.ally_slots[..self.ally_count as usize]
    }

    #[inline]
    pub fn nearest_enemy(&self) -> Option<&Contact> {
        self.enemies().first()
    }

    /// The observer's own sword hand.
    #[inline]
    pub fn sword(&self) -> Hand {
        self.hands[crate::hand::SWORD]
    }

    /// The observer's own shield hand.
    #[inline]
    pub fn shield(&self) -> Hand {
        self.hands[crate::hand::SHIELD]
    }

    /// How far the observer's blade reaches from its own centre right now, at
    /// its current extension. What a policy needs to answer "can I hit that
    /// from here"; [`Observation::full_reach`] answers "could I ever".
    #[inline]
    pub fn reach_now(&self) -> Fx {
        self.radius + self.weapon_length * self.sword().reach
    }

    /// Reach from the observer's centre at full extension.
    #[inline]
    pub fn full_reach(&self) -> Fx {
        self.radius + self.weapon_length
    }

    /// Replaces the perceived enemies. Extra contacts beyond [`MAX_CONTACTS`]
    /// are dropped.
    pub fn set_enemies(&mut self, contacts: &[Contact]) {
        self.enemy_count = contacts.len().min(MAX_CONTACTS) as u8;
        self.enemy_slots[..self.enemy_count as usize]
            .copy_from_slice(&contacts[..self.enemy_count as usize]);
    }

    /// Replaces the perceived allies.
    pub fn set_allies(&mut self, contacts: &[Contact]) {
        self.ally_count = contacts.len().min(MAX_CONTACTS) as u8;
        self.ally_slots[..self.ally_count as usize]
            .copy_from_slice(&contacts[..self.ally_count as usize]);
    }

    /// Flattens into a fixed-layout feature vector for a neural policy.
    ///
    /// Nothing uses this yet -- the milestone-1 policy reads the struct
    /// directly. It exists now because the *layout* is the contract a trained
    /// network is frozen against, and it is much cheaper to get that boundary
    /// right before there are weights depending on it than after.
    ///
    /// Empty contact slots are zero-filled rather than omitted, so the vector
    /// is a constant width regardless of how much the observer perceives. A
    /// low-perception character's vector is mostly zeros, which is exactly the
    /// signal we want the network to condition on.
    ///
    /// All values are in roughly `-1..=1`. Returns [`FEATURE_COUNT`].
    pub fn write_features(&self, out: &mut [Fx]) -> usize {
        assert!(
            out.len() >= FEATURE_COUNT,
            "feature buffer too small: {} < {FEATURE_COUNT}",
            out.len()
        );
        out[..FEATURE_COUNT].fill(Fx::ZERO);

        let mut i = 0;
        out[i] = self.hp_frac;
        i += 1;
        out[i] = self.attack_ready;
        i += 1;
        out[i] = self.radius;
        i += 1;
        out[i] = self.weapon_length;
        i += 1;
        out[i] = self.min_strike_range;
        i += 1;
        // The decision *rate*, not the tick count: a period of 12 would blow
        // the -1..=1 invariant on its own, and "how often do I get to think"
        // is the quantity a network can act on anyway.
        out[i] = Fx::ONE / Fx::from_int(self.decision_period.max(1) as i32);
        i += 1;
        out[i] = arc_fraction(self.shield_arc);
        i += 1;

        for hand in self.hands {
            let dir = Vec2::from_angle(hand.angle);
            out[i] = dir.x;
            out[i + 1] = dir.y;
            out[i + 2] = (hand.spin / SPIN_SCALE).clamp(-Fx::ONE, Fx::ONE);
            out[i + 3] = hand.reach;
            i += 4;
        }

        out[i + self.order.discriminant()] = Fx::ONE;
        i += Order::COUNT;

        // Where the order points, relative to here and measured in sight
        // ranges. `Advance` carries a heading, so it normalises; `Goto` carries
        // a world-space destination, and putting one of those in the vector
        // straight would break the -1..=1 invariant the moment the arena is
        // wider than a unit -- and would make the same order mean different
        // things at different positions.
        let pointing = match self.order {
            Order::Advance(dir) => dir.normalize(),
            Order::Goto(dest) => {
                let sight = self.sight_range.max(Fx::ONE);
                let to = (dest - self.position).clamp_length(sight);
                Vec2::new(to.x / sight, to.y / sight)
            }
            Order::Hold | Order::Regroup | Order::Focus(_) => Vec2::ZERO,
        };
        out[i] = pointing.x;
        out[i + 1] = pointing.y;
        i += 2;

        for group in [self.enemies(), self.allies()] {
            for slot in 0..MAX_CONTACTS {
                let base = i + slot * FEATURES_PER_CONTACT;
                if let Some(c) = group.get(slot) {
                    let unit = c.offset.normalize();
                    let range = (c.distance / self.sight_range).clamp(Fx::ZERO, Fx::ONE);
                    let facing = Vec2::from_angle(c.facing);
                    let sword = Vec2::from_angle(c.sword_angle);
                    let shield = Vec2::from_angle(c.shield_angle);
                    out[base] = unit.x;
                    out[base + 1] = unit.y;
                    out[base + 2] = range;
                    out[base + 3] = c.hp_frac;
                    out[base + 4] = c.radius;
                    out[base + 5] = c.weapon_length;
                    out[base + 6] = facing.x;
                    out[base + 7] = facing.y;
                    out[base + 8] = sword.x;
                    out[base + 9] = sword.y;
                    out[base + 10] = (c.sword_spin / SPIN_SCALE).clamp(-Fx::ONE, Fx::ONE);
                    out[base + 11] = c.sword_reach;
                    out[base + 12] = shield.x;
                    out[base + 13] = shield.y;
                    out[base + 14] = c.shield_reach;
                }
            }
            i += MAX_CONTACTS * FEATURES_PER_CONTACT;
        }

        for (slot, clearance) in self.wall_clearance.iter().enumerate() {
            out[i + slot] = (*clearance / self.sight_range).clamp(Fx::ZERO, Fx::ONE);
        }
        i += 4;

        debug_assert_eq!(i, FEATURE_COUNT);
        FEATURE_COUNT
    }
}
