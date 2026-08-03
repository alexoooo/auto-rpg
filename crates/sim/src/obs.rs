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
    /// **Distance from this enemy's centre inside which its blade cannot reach
    /// the speed a blow requires** -- its dead zone, as judged from here.
    ///
    /// The single most valuable geometric fact about an opponent, and until now
    /// the one thing a fighter could not work out. Impact is `spin x arm`, so
    /// every weapon is harmless close in and worst at the tip; a `Contact` said
    /// how *long* an enemy's blade was but nothing about how fast it could be
    /// swung, so its dead zone was not derivable and a policy had to be told
    /// where to stand by a hand-set gene. That was the open question in
    /// `DESIGN.md`, and this is the answer to it.
    ///
    /// Perceived, and blurred by the **un-scaled** perception noise rather than
    /// the range-scaled figure everything around it uses. That is deliberate
    /// and it is the one asymmetry in this struct worth arguing about: every
    /// other field here is a *measurement*, and measurements genuinely get
    /// easier as you close. This is a judgement about a capability, and
    /// standing nose to nose with someone tells you nothing new about how hard
    /// they can swing.
    ///
    /// The error it produces is asymmetric in a way that is worth knowing
    /// about, because it is the whole of what perception buys in a duel. Guess
    /// *low* and the floor in a policy's own spacing rule protects you. Guess
    /// *high* and you stand off a weapon you could have crowded, which against
    /// a Brute is the difference between four points a blow and thirty. A dim
    /// fighter respects a big weapon's reach and dies to it; a sharp one knows
    /// the thing is at its worst up close.
    pub min_strike_range: Fx,
    /// **What one clean blow from this enemy costs, as a fraction of the
    /// observer's own maximum health.**
    ///
    /// The exchange rate, from the receiving side. `0.32` is what a Brute's axe
    /// takes off a Warrior; the same axe against a Skitterer is `0.74`, and a
    /// Skitterer's knife against that Warrior is `0.08`. Those are four-to-one
    /// differences in what an exchange is worth risking, and until this field
    /// existed a policy could not tell them apart at all -- `power`, `weight`
    /// and `max_hp` are all absolute, none of them is in the observation, and
    /// none of them should be. This is the relative figure they exist to
    /// produce.
    ///
    /// Peak rather than expected: the tip, at top spin, through no shield. What
    /// a blow actually costs depends on where on the arc it lands and what the
    /// defender does about it, and those are the fight. This is the number you
    /// can size up before it starts.
    ///
    /// May exceed `1`, which reads as "this can kill you outright from full
    /// health" and is worth being able to say. Blurred by the **un-scaled**
    /// noise, for the reason argued at [`Contact::min_strike_range`].
    pub threat: Fx,
    /// **What one clean blow from the observer costs this enemy, as a fraction
    /// of *its* maximum health.**
    ///
    /// [`Contact::threat`] mirrored. Together they are the exchange rate in
    /// both directions, and neither is much use alone: knowing you are two
    /// blows from death is only half of the decision, because the answer is
    /// completely different depending on whether the thing in front of you is
    /// five blows from death or one.
    ///
    /// Note this is a fact about the *pairing* and not about the enemy, exactly
    /// as [`Contact::offset`] is. The same Brute is `0.11` frail to a Warrior
    /// and `0.05` to a Skitterer.
    pub frailty: Fx,
    /// Which way the body is heading, as perceived.
    /// Where this contact is going, world units per tick, blurred by
    /// perception like everything else about it.
    ///
    /// A *world-frame* velocity rather than a closing rate, because
    /// [`Observation::velocity`] is right there and the difference of the two is
    /// the closing rate -- while the reverse, recovering an absolute velocity
    /// from a closing one, is not possible at all. It is the raw quantity.
    ///
    /// This is what makes a moving enemy hittable. A cut takes its windup and
    /// its strike to arrive, an enemy at a walk covers most of a body in that
    /// time, and a fighter aiming at where its opponent *is* will keep cutting
    /// through the space behind it.
    pub velocity: Vec2,
    pub facing: Angle,
    /// Perceived bearing of the enemy's sword hand.
    pub sword_angle: Angle,
    /// Perceived angular velocity of that hand, raw angle units per tick.
    pub sword_reach: Fx,
    pub sword_spin: Fx,
    /// **What the enemy's sword hand is doing.** Arrives *exact*.
    ///
    /// Deliberately not blurred, and the asymmetry is the design. A blade
    /// hauled back over a shoulder is not a subtle cue -- anyone can see that a
    /// blow is coming. What separates fighters is knowing *when* it lands and
    /// *where*, and those two are blurred hard. A dim character is not blind to
    /// the attack; it is late and it guesses the line wrong, which is a much
    /// more interesting way to lose than not noticing.
    pub sword_swing: crate::hand::Swing,
    /// Perceived ticks left in that phase, and the single most valuable number
    /// in the observation.
    ///
    /// In [`Swing::Windup`] it is how long there is to answer -- to step off the
    /// line, get the shield across, or land something first. In
    /// [`Swing::Recover`] it is how long the enemy is helpless, which is the
    /// whole of a punish. Blurred in proportion to perception noise, so a dim
    /// character commits to its dodge at the wrong moment.
    ///
    /// [`Swing::Windup`]: crate::hand::Swing::Windup
    /// [`Swing::Recover`]: crate::hand::Swing::Recover
    pub sword_left: Fx,
    /// Perceived line the running attack is aimed along.
    ///
    /// Not the same as [`Contact::sword_angle`], and confusing the two is the
    /// mistake this field exists to prevent: during a windup the blade is
    /// *cocked away* from where it is going, so a defender that covers the
    /// blade covers the one bearing the cut is guaranteed not to arrive from.
    /// Reading the line off the pose is something a fighter genuinely can do, so
    /// the sim hands it over rather than making every policy reverse-engineer
    /// it -- blurred, because reading it well is the skill.
    pub sword_line: Angle,
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
    /// Own velocity, world units per tick. Exact rather than perceived: a body
    /// knows what its own feet are doing.
    pub velocity: Vec2,
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
    /// How much of [`Observation::velocity`] this body can change in one tick.
    ///
    /// The other half of [`Observation::move_speed`], and the one that decides
    /// whether a plan is still cancellable. `v^2 / 2a` is the distance a body
    /// needs to stop, which is what a fighter has to hold in mind before it
    /// steps toward anything.
    pub traction: Fx,
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
/// reach, shield direction (2), shield reach, dead zone, the exchange rate in
/// both directions (2), then the attack read -- swing phase one-hot (4), ticks
/// left in it, and the attack line (2).
///
/// Every angle enters as a `(cos, sin)` pair rather than as a number, and that
/// is not a rounding detail: a raw angle is discontinuous at the wrap, so a
/// blade at 359 degrees and one at 1 degree would look maximally different to
/// anything trying to learn from the slot. Two continuous components have no
/// seam to learn across.
///
/// The phase is a one-hot block and not a number for the same reason. The four
/// phases are not points on a scale -- a recovery is not "more" than a windup --
/// and encoding them as 0, 1/3, 2/3, 1 would ask a network to learn that the
/// most dangerous state and the most punishable one sit next to each other.
const FEATURES_PER_CONTACT: usize = 20 + crate::hand::Swing::COUNT + 3;

/// Own-state values: health, attack readiness, radius, weapon length, minimum
/// strike range, decision rate, shield arc, then both hands as direction (2),
/// spin and reach, then the sword's own attack state -- phase one-hot (4),
/// ticks left, whether the hand is armed -- and finally how braced the shield
/// is.
///
/// That last one is not derivable from anything else here. A shield's bearing
/// and spin say where it is and how fast, and neither says how long it has been
/// *there*, which is what decides whether it stops a blow or is merely near
/// one.
const SELF_FEATURES: usize = 10 + 4 * crate::hand::HANDS + crate::hand::Swing::COUNT + 3;

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
///
/// Version 4 was the phased attack. A contact went from fifteen numbers to
/// twenty-two, because a defender that can see a blade's bearing and speed but
/// cannot see whether that blade is *committed* has no way to tell a feint from
/// a cut, or a recovery from a guard.
///
/// Version 5 adds one number to each contact and one to the self block, and
/// both are about where to stand. [`Contact::min_strike_range`] is the enemy's
/// dead zone, without which the strongest answer to a heavy weapon in the game
/// is not derivable from the observation at all; the self block gains how
/// braced the shield is, without which a network could not tell a guard that
/// has been planted on a line from one still travelling toward it, and those
/// two block very differently.
///
/// Version 6 adds two numbers to each contact, and they are the first entries
/// in the vector that are neither a measurement nor a state -- they are the
/// *stakes*. [`Contact::threat`] and [`Contact::frailty`] say what one clean
/// blow is worth in each direction, as a fraction of the bar it comes off.
/// Everything a policy could previously read was scale-free by construction
/// (positions, angles, health fractions), which was the right instinct and left
/// one hole: `power`, `weapon.weight` and `max_hp` are all absolute, all
/// correctly kept out of the observation, and between them they decide whether
/// a given exchange is a scratch or a third of the fight. A fighter that cannot
/// tell a Brute's axe from a Skitterer's knife except by its length is not
/// reading the fight, and no amount of perception was going to fix that.
///
/// Paid now, while there are still no weights: the same bill after a training
/// run is the training run.
/// Version 7 is momentum. Bodies carry velocity across ticks now, so where
/// something *is* stopped being the whole story about where it will be, and
/// three numbers per contact and three about the self exist to close that gap:
/// [`Observation::velocity`], [`Observation::traction`] and
/// [`Contact::velocity`].
///
/// The version bump is doing real work here rather than bookkeeping. Every
/// earlier layout described a world in which a body could stop dead on any
/// tick, so a policy trained against one has no representation for commitment
/// at all -- not a missing input, a missing *concept*. Its notion of "I can
/// step back if this goes wrong" is simply false in version 7, and it would
/// fail in a way that looks like bad tactics rather than like a stale contract.
pub const FEATURE_LAYOUT_VERSION: u32 = 7;

/// Speed, in world units per tick, that normalises to `1` in the feature
/// vector. Comfortably above any archetype's top speed, so it is the knockback
/// case that approaches the clamp rather than ordinary walking.
const SPEED_SCALE: Fx = Fx::from_ratio(25, 100);

/// Spin, in raw angle units per tick, that normalises to `1` in the feature
/// vector. Above the fastest weapon in the game, so the clamp is a guard rather
/// than a routine flattening of the signal.
const SPIN_SCALE: Fx = Fx::from_int(4000);

/// Ticks that normalise to `1`. One second, which comfortably covers the
/// longest phase in the game (a Brute's 44-tick recovery).
const TICK_SCALE: Fx = Fx::from_int(60);

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
            velocity: Vec2::ZERO,
            hp_frac: Fx::ONE,
            attack_ready: Fx::ONE,
            radius: Fx::ZERO,
            weapon_length: Fx::ZERO,
            min_strike_range: Fx::ZERO,
            hands: [Hand::default(); crate::hand::HANDS],
            shield_arc: 0,
            sight_range: Fx::ONE,
            move_speed: Fx::ZERO,
            // Never zero, for the same reason `decision_period` is not: a
            // policy dividing by it to get a stopping distance would saturate
            // rather than fail.
            traction: Fx::ONE,
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

    /// Whether a strike command would actually start a cut this tick.
    ///
    /// Both halves matter and a policy that checks only one is broken in a way
    /// that is hard to see from a fight: the hand must be back at guard *and*
    /// re-armed by a command that was not asking to attack. Asking to attack
    /// forever throws one attack; see [`crate::Hand::armed`].
    #[inline]
    pub fn can_strike(&self) -> bool {
        let sword = self.sword();
        sword.swing == crate::hand::Swing::Guard && sword.armed
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
        out[i] = (self.velocity.x / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
        out[i + 1] = (self.velocity.y / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
        i += 2;
        // Traction against top speed, which is the reciprocal of "ticks to get
        // going" and lands near 0.07. The absolute figure would be four decimal
        // places of nothing; the ratio is the quantity a policy acts on.
        out[i] = (self.traction / self.move_speed.max(Fx::EPSILON)).min(Fx::ONE);
        i += 1;

        for hand in self.hands {
            let dir = Vec2::from_angle(hand.angle);
            out[i] = dir.x;
            out[i + 1] = dir.y;
            out[i + 2] = (hand.spin / SPIN_SCALE).clamp(-Fx::ONE, Fx::ONE);
            out[i + 3] = hand.reach;
            i += 4;
        }

        // The character's own attack, exactly. `armed` is not introspection for
        // its own sake: it is the difference between a policy that fights and
        // one that throws a single cut and then stands holding the button down
        // forever, and nothing else in the vector implies it.
        let sword = self.sword();
        out[i + sword.swing.discriminant()] = Fx::ONE;
        i += crate::hand::Swing::COUNT;
        out[i] = (Fx::from_int(sword.swing_left as i32) / TICK_SCALE).min(Fx::ONE);
        i += 1;
        out[i] = if sword.armed { Fx::ONE } else { Fx::ZERO };
        i += 1;
        out[i] = self.shield().brace_fraction();
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
                    // Where this enemy's blade stops being dangerous. A raw
                    // distance like `radius` and `weapon_length` beside it, and
                    // on the same scale, so the three can be compared.
                    out[base + 15] = c.min_strike_range;
                    // The stakes, both ways. Clamped at one because past that
                    // the distinction stops mattering -- a blow worth 1.4 bars
                    // and one worth 1.0 are both simply fatal -- and the
                    // vector's -1..=1 invariant is worth more than a difference
                    // nothing can act on.
                    out[base + 16] = c.threat.min(Fx::ONE);
                    out[base + 17] = c.frailty.min(Fx::ONE);
                    // Where it is going. On the same scale as the self block's
                    // velocity, so the two subtract into a closing rate without
                    // anything having to learn a conversion first.
                    out[base + 18] = (c.velocity.x / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
                    out[base + 19] = (c.velocity.y / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);

                    // The attack read. The line is a separate pair from
                    // `sword` above on purpose: during a windup the blade is
                    // cocked away from where the cut is going, so the two point
                    // in different directions and collapsing them would hide
                    // the only thing worth knowing.
                    out[base + 20 + c.sword_swing.discriminant()] = Fx::ONE;
                    let read = base + 20 + crate::hand::Swing::COUNT;
                    out[read] = (c.sword_left / TICK_SCALE).clamp(Fx::ZERO, Fx::ONE);
                    let line = Vec2::from_angle(c.sword_line);
                    out[read + 1] = line.x;
                    out[read + 2] = line.y;
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
