use crate::action::Order;
use crate::entity::{EntityId, Faction};
use crate::rules::MAX_CONTACTS;
use fx::{Fx, Vec2};

/// One perceived unit.
///
/// Everything here except `id` has already been degraded by the observer's
/// perception stat, so two characters looking at the same enemy do not
/// necessarily see it in the same place.
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
    /// `0` just swung, `1` ready to swing.
    pub attack_ready: Fx,
    /// Own body size. With [`Contact::radius`] this is enough for a policy to
    /// compute exactly how close it must get to land a hit.
    pub radius: Fx,
    /// Reach beyond the two radii, from the observer's own stats.
    pub attack_range: Fx,
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

/// Width of the flattened feature vector produced by
/// [`Observation::write_features`].
/// Values per contact in the feature vector: direction (2), range, health,
/// size.
const FEATURES_PER_CONTACT: usize = 5;

pub const FEATURE_COUNT: usize =
    4 + Order::COUNT + 2 + (MAX_CONTACTS * FEATURES_PER_CONTACT) * 2 + 4;

/// Bumped whenever the layout of [`Observation::write_features`] changes shape
/// or meaning.
///
/// The layout is the contract a trained network is frozen against, so a change
/// here is a retraining bill. Recording the version is what lets a future
/// frozen network refuse to load against a vector it was not trained on,
/// instead of quietly reading the wrong number out of every slot.
pub const FEATURE_LAYOUT_VERSION: u32 = 2;

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
            attack_range: Fx::ZERO,
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
        // The decision *rate*, not the tick count: a period of 12 would blow
        // the -1..=1 invariant on its own, and "how often do I get to think"
        // is the quantity a network can act on anyway.
        out[i] = Fx::ONE / Fx::from_int(self.decision_period.max(1) as i32);
        i += 1;

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
                    out[base] = unit.x;
                    out[base + 1] = unit.y;
                    out[base + 2] = range;
                    out[base + 3] = c.hp_frac;
                    out[base + 4] = c.radius;
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
