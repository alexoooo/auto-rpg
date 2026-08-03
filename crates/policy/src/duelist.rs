//! A policy that fights rather than merely attacks.
//!
//! [`UtilityPolicy`] picks a target and walks at it. That is the right shape
//! for a line of soldiers and the wrong shape for a duel, because under
//! geometric combat almost everything that decides a fight happens in the
//! second between two swings: where you stand relative to an arc, which way
//! your guard is pointing, and whether the blade coming at you has already
//! committed.
//!
//! So this policy does not choose a *destination*, it chooses a **stance**.
//! Eight of them score themselves against what is currently perceived, the
//! highest wins, and the winner drives the feet and both hands together. The
//! running stance gets a bonus so a fighter commits to a plan instead of
//! flickering between two that score within a hair of each other -- the same
//! job `commitment` does for target selection, one level up.
//!
//! [`UtilityPolicy`]: crate::UtilityPolicy

use crate::genome::PolicySpec;
use crate::swing;
use crate::Policy;
use fx::{Angle, Fx, Vec2};
use sim::{
    Action, Contact, EntityId, HandCommand, Intent, Observation, Order, Strike, Swing, SHIELD,
    SWORD,
};

pub const DUELIST_GENOME_LEN: usize = 16;

/// How few ticks of its own telegraph may be left before a feint is called off.
///
/// Small on purpose: a feint has to be *believed*, which means letting it run
/// nearly to the point of commitment. Pull out at half a windup and a defender
/// with any reaction speed simply waits it out.
const FEINT_COMMIT: u16 = 3;

/// How far outside its own dead zone a fighter insists on standing.
///
/// A margin, not a rounding allowance. `min_strike_range` is where a blow
/// begins to *register*, and damage there is zero by construction -- impact
/// minus the threshold is the whole of it. Standing exactly on that line is
/// indistinguishable from standing inside it, which is how a Skitterer ended up
/// hugging a Brute at 1.04 units, immune and harmless, losing sixty points of
/// win rate to a baseline that simply stood a little further back.
const STRIKE_MARGIN: Fx = Fx::from_ratio(125, 100);

/// How much an arriving blade suppresses the urge to close.
///
/// Not a gene, and not 1.0 either. Fully suppressing approach is the safe
/// reading and it costs real tempo: every tick spent not closing is a tick the
/// opponent's health is not going down, and against a big slow target that
/// arithmetic decides fights. This is set just high enough that a live blade
/// outscores the urge to walk into it, and no higher.
const APPROACH_CAUTION: Fx = Fx::from_ratio(85, 100);

/// How many more clean blows of size `bite` a bar sitting at `hp_frac` absorbs.
///
/// The unit both halves of the disengage decision are counted in. Health
/// fractions are not comparable across matchups and blow counts are: "two left"
/// means the same thing whoever is swinging, which is precisely what a flat
/// health threshold could never say.
///
/// `Fx::MAX` for a harmless opponent rather than a division by zero -- something
/// that cannot hurt you is something you can stand in front of indefinitely,
/// which is the correct answer and not a degenerate one. Written out rather than
/// left to `Fx`'s saturating division, because a reader should not have to know
/// that to trust the line.
fn blows_left(hp_frac: Fx, bite: Fx) -> Fx {
    if bite.is_positive() {
        hp_frac / bite
    } else {
        Fx::MAX
    }
}

/// What a duellist is doing this instant.
///
/// Not a state machine: nothing here is a transition, and any stance can follow
/// any other. They are competing *readings of the moment*, and which one wins
/// is recomputed from scratch every time the character is allowed to think.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Stance {
    /// Close the distance. Nothing else is possible from out of reach.
    #[default]
    Close,
    /// Hold the preferred range and swing.
    Trade,
    /// Orbit toward the side the enemy's shield is not on.
    Circle,
    /// Step out of the arc of a swing that is already on its way.
    Evade,
    /// Put the shield on the line the blade is going to arrive along.
    Guard,
    /// The enemy has overcommitted. Get in and hit it before it recovers.
    Punish,
    /// Extend without committing spin, to draw the guard, then swing elsewhere.
    Feint,
    /// Break off entirely.
    Retreat,
}

impl Stance {
    pub const ALL: [Stance; 8] = [
        Stance::Close,
        Stance::Trade,
        Stance::Circle,
        Stance::Evade,
        Stance::Guard,
        Stance::Punish,
        Stance::Feint,
        Stance::Retreat,
    ];

    pub const fn index(self) -> usize {
        match self {
            Stance::Close => 0,
            Stance::Trade => 1,
            Stance::Circle => 2,
            Stance::Evade => 3,
            Stance::Guard => 4,
            Stance::Punish => 5,
            Stance::Feint => 6,
            Stance::Retreat => 7,
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            Stance::Close => "close",
            Stance::Trade => "trade",
            Stance::Circle => "circle",
            Stance::Evade => "evade",
            Stance::Guard => "guard",
            Stance::Punish => "punish",
            Stance::Feint => "feint",
            Stance::Retreat => "retreat",
        }
    }
}

/// The evolvable knobs.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct DuelistWeights {
    /// How much nearness matters when picking a target.
    pub aggression: Fx,
    /// How much a wounded target is preferred.
    pub bloodlust: Fx,
    /// How strongly the player's `Focus` order overrides its own judgement.
    pub obedience: Fx,
    /// **How many clean blows it insists on keeping in hand.** Below this many
    /// left, and only while losing the race, it breaks off.
    ///
    /// Counted in blows rather than in health, which is what
    /// [`sim::Contact::threat`] bought: a health fraction means something
    /// different against every opponent, and this does not. `1.5` is "I will not
    /// stand here for two more of those" whether *those* are axe blows or knife
    /// cuts.
    pub caution: Fx,
    /// **The gene that decides the Brute fight.** How much reach to buy with
    /// exposure: `0` is the safest place this fighter can still strike from,
    /// `1` is the end of its own arm.
    ///
    /// It used to be measured from body contact, which made it a guess about
    /// where the enemy's weapon stopped biting. That figure is now *derived*
    /// from the perceived dead zone -- see `DuelistPolicy::preferred_range` --
    /// so the gene means the trade rather than the guess: impact is linear in
    /// the arm on both sides, so standing further out costs and pays at once.
    ///
    /// Four independent evolution runs against a Brute returned **0.000**, which
    /// is the least ambiguous result the lab has produced and is not the corner
    /// of the range it looks like: zero means "stand where its blade cannot
    /// reach and mine just can", and against a heavy weapon that is simply the
    /// right answer.
    pub standoff: Fx,
    /// Willingness to close the last of the distance to strike.
    pub lunge: Fx,
    /// Weight on covering the predicted line with the shield.
    pub guard: Fx,
    /// **How early in a telegraph a cut starts counting as real.**
    ///
    /// A multiplier on the urgency of an enemy windup, so a value near zero
    /// waits until the blade is practically on its way and a high one starts
    /// answering the instant the shoulder moves. Both ends are wrong in
    /// interesting ways: reading late leaves no time to do anything but eat the
    /// blow, and reading early means every feint in the game works on you.
    ///
    /// It used to be a count of ticks to extrapolate a free-spinning blade
    /// forward by. There is nothing to extrapolate any more -- the sim says
    /// outright that a cut is coming and how long there is -- so what is left to
    /// evolve is what to *do* about knowing.
    pub read_ahead: Fx,
    /// Weight on stepping out of an arc rather than covering it.
    pub evasion: Fx,
    /// How far off the swing plane it tries to be.
    pub sidestep: Fx,
    /// Weight on circling toward the enemy's shield-free side.
    pub flank: Fx,
    /// Weight on striking a blade that is out of position.
    pub punish: Fx,
    /// Willingness to bait a guard with an uncommitted blade.
    pub feint: Fx,
    /// Hysteresis: what a new stance must beat the running one by.
    pub resolve: Fx,
    /// Pull toward visible allies.
    pub cohesion: Fx,
    /// Preference for open ground over corners.
    pub wall_fear: Fx,
}

const LABELS: [&str; DUELIST_GENOME_LEN] = [
    "aggression",
    "bloodlust",
    "obedience",
    "caution",
    "standoff",
    "lunge",
    "guard",
    "read_ahead",
    "evasion",
    "sidestep",
    "flank",
    "punish",
    "feint",
    "resolve",
    "cohesion",
    "wall_fear",
];

const GENE_RANGES: [(Fx, Fx); DUELIST_GENOME_LEN] = [
    (Fx::ZERO, Fx::from_int(2)),                    // aggression
    (Fx::ZERO, Fx::from_int(2)),                    // bloodlust
    (Fx::ZERO, Fx::from_int(3)),                    // obedience
    (Fx::ZERO, Fx::from_int(3)),                    // caution
    (Fx::ZERO, Fx::ONE),                            // standoff
    (Fx::ZERO, Fx::ONE),                            // lunge
    (Fx::ZERO, Fx::from_int(3)),                    // guard
    (Fx::from_ratio(3, 10), Fx::from_int(3)),       // read_ahead
    (Fx::ZERO, Fx::from_int(3)),                    // evasion
    (Fx::ZERO, Fx::ONE),                            // sidestep
    (Fx::ZERO, Fx::from_int(2)),                    // flank
    (Fx::ZERO, Fx::from_int(3)),                    // punish
    (Fx::ZERO, Fx::ONE),                            // feint
    (Fx::ZERO, Fx::ONE),                            // resolve
    (Fx::ZERO, Fx::ONE),                            // cohesion
    (Fx::ZERO, Fx::ONE),                            // wall_fear
];

/// The starting point, from `lab evolve --arena duel --hero warrior --villain
/// brute`, four independent runs of sixty generations.
///
/// **Two of these reverse what the previous set said, and the reversals are the
/// point** -- they are the measurement that the mechanics underneath actually
/// changed rather than merely moved.
///
/// * `read_ahead` went from the *bottom* of its range to the *top*. The old
///   note here recorded, correctly for its time, that answering telegraphs was
///   a losing strategy: a shield covered an arc or it did not, covering was
///   instantaneous, and so reading a windup early bought nothing that flicking
///   the guard across at the last moment did not also buy -- while costing every
///   cut you did not throw. A guard has mass now
///   ([`sim::Hand::braced`]), and the telegraph buys the one thing that was
///   missing: time to *finish* moving. Reading early is the whole of blocking
///   well.
/// * `evasion` went from switched-off to real, and `punish` stayed high, for
///   the matching reason. A cut that touches nothing now costs its owner twenty
///   extra ticks of recovery, and a blow landing into a recovery does half again
///   its damage -- so stepping off a line is no longer merely *not being hit*,
///   it is the setup for the best exchange in the game.
///
/// `standoff` is **0.000**, and it is worth saying plainly: against a heavy
/// weapon, stand as close as your own blade allows. It reads like an extreme and
/// it is not one, because the gene no longer means "how close to its body" -- it
/// means how far *outside the safest place you can still fight from* to stand,
/// and that place is computed from the enemy's own dead zone. Zero is the
/// considered answer, not the corner of the range; see
/// `DuelistPolicy::preferred_range`. Held directly against the alternatives over
/// 240 duels with a naive Brute -- the fight the difficulty table is measured on
/// -- it is not close:
///
/// ```text
///   standoff   0.000  0.200  0.400  0.600  0.800  1.000
///   win rate     98%    87%    72%    40%    25%    17%
///   health      0.60   0.44   0.37   0.32   0.23   0.24
/// ```
///
/// **The opponent decides that answer completely, and this is the trap in the
/// duel arena.** Evolved against a *duellist* Brute rather than a naive one,
/// four independently seeded runs all came back with `standoff` between 0.68 and
/// 0.99 and `evasion` pinned at its ceiling, scoring 100% and 0.76 health -- and
/// those same genomes win 19% to 45% against the naive Brute. Standing off works
/// on an opponent that reads you and hesitates, and is suicide against one that
/// simply walks in swinging, because the tip of the arc is the worst place on it.
/// The evolved genomes are not better fighters, they are counters to one
/// opponent, and the fitness function cannot tell the difference. That is a
/// property of this arena worth remembering before trusting the next run of it.
///
/// Two values are nudged off what evolution returned, and this is the honest
/// note about it. `sidestep` came back at 0.01, which turns an evade into
/// backing straight into the swing. `caution` comes back near zero on every run
/// for a reason that is really about the arena rather than about fighting: in a
/// duel there is nowhere to break off *to*, and the clock is scored against you,
/// so the gene is free. `0.32` blows is what the previous set's `0.10` health
/// fraction worked out to against a Brute, so the shipped behaviour is
/// unchanged where it was measured and is now *also* right against everything
/// else. Measured across `0.16` to `0.48` the duel result does not move
/// (97%/0.60), so this is a free choice inside a flat region and it is spent on
/// keeping the stance alive: a stance that never fires is a stance nobody will
/// notice has rotted.
const BASELINE_VALUES: [Fx; DUELIST_GENOME_LEN] = [
    Fx::from_ratio(1828, 1000), // aggression
    Fx::from_ratio(1297, 1000), // bloodlust
    Fx::from_ratio(1282, 1000), // obedience
    Fx::from_ratio(320, 1000),  // caution, in clean blows rather than health
    Fx::from_ratio(0, 1000),    // standoff
    Fx::from_ratio(1000, 1000), // lunge
    Fx::from_ratio(912, 1000),  // guard
    Fx::from_ratio(3000, 1000), // read_ahead
    Fx::from_ratio(759, 1000),  // evasion
    Fx::from_ratio(200, 1000),  // sidestep
    Fx::from_ratio(560, 1000),  // flank
    Fx::from_ratio(2296, 1000), // punish
    Fx::from_ratio(637, 1000),  // feint
    Fx::from_ratio(1000, 1000), // resolve
    Fx::from_ratio(719, 1000),  // cohesion
    Fx::from_ratio(557, 1000),  // wall_fear
];

impl DuelistWeights {
    pub const SPEC: PolicySpec = PolicySpec::new(&LABELS, &GENE_RANGES, &BASELINE_VALUES);

    pub const BASELINE: DuelistWeights = DuelistWeights {
        aggression: BASELINE_VALUES[0],
        bloodlust: BASELINE_VALUES[1],
        obedience: BASELINE_VALUES[2],
        caution: BASELINE_VALUES[3],
        standoff: BASELINE_VALUES[4],
        lunge: BASELINE_VALUES[5],
        guard: BASELINE_VALUES[6],
        read_ahead: BASELINE_VALUES[7],
        evasion: BASELINE_VALUES[8],
        sidestep: BASELINE_VALUES[9],
        flank: BASELINE_VALUES[10],
        punish: BASELINE_VALUES[11],
        feint: BASELINE_VALUES[12],
        resolve: BASELINE_VALUES[13],
        cohesion: BASELINE_VALUES[14],
        wall_fear: BASELINE_VALUES[15],
    };

    pub fn from_genome(genes: &[Fx]) -> DuelistWeights {
        let g = |i: usize| DuelistWeights::SPEC.value(i, genes);
        DuelistWeights {
            aggression: g(0),
            bloodlust: g(1),
            obedience: g(2),
            caution: g(3),
            standoff: g(4),
            lunge: g(5),
            guard: g(6),
            read_ahead: g(7),
            evasion: g(8),
            sidestep: g(9),
            flank: g(10),
            punish: g(11),
            feint: g(12),
            resolve: g(13),
            cohesion: g(14),
            wall_fear: g(15),
        }
    }

    pub fn values(self) -> [Fx; DUELIST_GENOME_LEN] {
        [
            self.aggression,
            self.bloodlust,
            self.obedience,
            self.caution,
            self.standoff,
            self.lunge,
            self.guard,
            self.read_ahead,
            self.evasion,
            self.sidestep,
            self.flank,
            self.punish,
            self.feint,
            self.resolve,
            self.cohesion,
            self.wall_fear,
        ]
    }

    pub fn to_genome(self) -> [Fx; DUELIST_GENOME_LEN] {
        let mut genes = [Fx::ZERO; DUELIST_GENOME_LEN];
        for (i, value) in self.values().iter().enumerate() {
            genes[i] = DuelistWeights::SPEC.gene(i, *value);
        }
        genes
    }

    pub fn labels() -> [&'static str; DUELIST_GENOME_LEN] {
        LABELS
    }
}

impl Default for DuelistWeights {
    fn default() -> Self {
        DuelistWeights::BASELINE
    }
}

/// Per-entity scraps of memory. Keyed by entity index, like
/// [`crate::UtilityPolicy`]'s, so it stays deterministic under any iteration
/// order.
#[derive(Clone, Copy, Debug, Default)]
struct Memory {
    target: EntityId,
    stance: Option<Stance>,
    /// Which leg of its patrol this entity is on when nothing is in sight; see
    /// [`crate::utility::Patrol`]. Deliberately *not* cleared when a stance is
    /// forgotten -- losing sight of an enemy is precisely when it matters.
    patrol: crate::utility::Patrol,
}

#[derive(Clone, Debug, Default)]
pub struct DuelistPolicy {
    pub weights: DuelistWeights,
    memory: Vec<Memory>,
}

impl DuelistPolicy {
    pub fn new(weights: DuelistWeights) -> DuelistPolicy {
        DuelistPolicy {
            weights,
            memory: Vec::new(),
        }
    }

    pub fn baseline() -> DuelistPolicy {
        DuelistPolicy::new(DuelistWeights::BASELINE)
    }

    pub fn from_genome(genes: &[Fx]) -> DuelistPolicy {
        DuelistPolicy::new(DuelistWeights::from_genome(genes))
    }

    fn recall(&self, me: EntityId) -> Memory {
        self.memory
            .get(me.index as usize)
            .copied()
            .unwrap_or_default()
    }

    fn remember(&mut self, me: EntityId, memory: Memory) {
        let index = me.index as usize;
        if index >= self.memory.len() {
            self.memory.resize(index + 1, Memory::default());
        }
        self.memory[index] = memory;
    }

    fn pick_target<'a>(&self, obs: &'a Observation, previous: EntityId) -> &'a Contact {
        let mut best: Option<(&Contact, Fx)> = None;
        for contact in obs.enemies() {
            let closeness = Fx::ONE - (contact.distance / obs.sight_range).clamp(Fx::ZERO, Fx::ONE);
            let mut score = self.weights.aggression * closeness
                + self.weights.bloodlust * (Fx::ONE - contact.hp_frac);
            if obs.order.focus() == Some(contact.id) {
                score += self.weights.obedience;
            }
            if contact.id == previous {
                // Switching targets mid-duel is how a duellist dies: the fight
                // is a running read of one person's blade, and it resets.
                score += Fx::HALF;
            }
            match best {
                Some((_, existing)) if existing >= score => {}
                _ => best = Some((contact, score)),
            }
        }
        best.expect("pick_target called with no visible enemies").0
    }

    /// Walk toward open ground; doubles as wall avoidance.
    fn open_ground(&self, obs: &Observation) -> Vec2 {
        let bias = Vec2::new(
            obs.wall_clearance[1] - obs.wall_clearance[0],
            obs.wall_clearance[3] - obs.wall_clearance[2],
        );
        let scaled = bias * (self.weights.wall_fear / obs.sight_range.max(Fx::ONE));
        scaled.clamp_length(self.weights.wall_fear)
    }

    fn ally_centre(&self, obs: &Observation) -> Vec2 {
        let allies = obs.allies();
        if allies.is_empty() {
            return Vec2::ZERO;
        }
        let mut sum = Vec2::ZERO;
        for ally in allies {
            sum += ally.offset;
        }
        sum * Fx::from_ratio(1, allies.len() as i32)
    }

    fn cohesion(&self, obs: &Observation) -> Vec2 {
        let centre = self.ally_centre(obs);
        if centre.length() > Fx::from_int(3) {
            centre.normalize() * self.weights.cohesion
        } else {
            Vec2::ZERO
        }
    }

    /// Nothing in sight: do as the player asked.
    fn march(&self, obs: &Observation, patrol: &mut crate::utility::Patrol) -> Action {
        let heading = match obs.order {
            Order::Advance(dir) => dir.normalize(),
            Order::Regroup => self.ally_centre(obs).normalize(),
            Order::Goto(dest) => {
                let wc = obs.wall_clearance;
                let lo = Vec2::new(
                    obs.position.x - wc[0] + obs.radius,
                    obs.position.y - wc[2] + obs.radius,
                );
                let hi = Vec2::new(
                    obs.position.x + wc[1] - obs.radius,
                    obs.position.y + wc[3] - obs.radius,
                );
                let to = dest.clamp_box(lo, hi) - obs.position;
                let distance = to.length();
                if distance <= obs.move_speed {
                    return Action::HOLD;
                }
                let stride = obs.move_speed * (obs.decision_period.max(1) as i32);
                let brake = (distance / stride).min(Fx::ONE);
                return Action::moving((to.normalize() * brake).clamp_length(Fx::ONE));
            }
            Order::Hold | Order::Focus(_) => Vec2::ZERO,
        };

        // Turn at the wall and come back, rather than grinding into it. Shared
        // with `UtilityPolicy` so that "advance" means one thing whichever
        // policy is driving.
        let heading = crate::utility::patrol_heading(obs, heading, patrol);

        Action::moving((heading + self.open_ground(obs)).clamp_length(Fx::ONE))
    }

    /// How far this duellist wants to be from `foe`'s centre.
    ///
    /// Three distances decide this, and all three are computed rather than
    /// guessed:
    ///
    /// * **The floor.** `min_strike_range x STRIKE_MARGIN + foe.radius` --
    ///   inside this a fighter is within its *own* dead zone and cannot hurt
    ///   what it is standing on top of. Exact, because proprioception is free.
    /// * **The lee.** `foe.min_strike_range + obs.radius` -- inside this the
    ///   enemy's blade cannot reach the impact threshold at the nearest surface
    ///   of this body. **Perceived**, and this is the whole of what
    ///   [`Contact::min_strike_range`] bought.
    /// * **Arm's length.** The far end of its own reach, where its own blows
    ///   land hardest and so do the enemy's.
    ///
    /// The safest place a fighter can still fight from is the larger of the
    /// first two, and `standoff` spends the distance between there and arm's
    /// length -- buying damage with exposure, since impact is linear in the arm
    /// on *both* sides.
    ///
    /// Sometimes the lee is beyond the floor and there is a genuine band in
    /// which a fighter can reach and cannot be reached. That band is not a
    /// fiction and it is not the same for everybody: a Skitterer has about a
    /// twentieth of a unit of it against a Brute, and a Warrior has none at all
    /// and must trade. Reading which of those you are in is now a decision the
    /// observation supports.
    ///
    /// The error is asymmetric on purpose, and it is where the difficulty
    /// ladder lives. Underestimate the lee and the floor catches you.
    /// Overestimate it and you stand off a weapon you could have crowded, which
    /// against a Brute is four points a blow against thirty. A dim fighter
    /// respects a big weapon's reach and is killed by it.
    fn preferred_range(&self, obs: &Observation, foe: &Contact) -> Fx {
        let floor = obs.min_strike_range * STRIKE_MARGIN + foe.radius;
        let lee = foe.min_strike_range + obs.radius;
        let arms_length = obs.full_reach() + foe.radius;

        let safest = lee.max(floor);
        let wanted = safest + (arms_length - safest).max(Fx::ZERO) * self.weights.standoff;
        // Clamped rather than merely floored: a wildly overestimated lee could
        // otherwise park a fighter beyond its own reach, where it is being hit
        // by something it cannot answer -- which is a way to lose, not a way to
        // fight badly.
        wanted.clamp(floor, arms_length.max(floor))
    }

    /// Scores every stance and returns the winner.
    fn choose(&self, obs: &Observation, foe: &Contact, running: Option<Stance>) -> Stance {
        let reach = obs.full_reach() + foe.radius;
        let ideal = self.preferred_range(obs, foe);

        // How frightening the other blade is right now, and how open it is.
        // Both come straight off the attack phase now. The version this
        // replaced sampled a free-spinning blade forward through five
        // extrapolated positions and thresholded how close it came, which was a
        // bet on a perceived spin and -- worse -- could not tell a fighter who
        // had decided to attack from one whose blade happened to be moving.
        let (urgency, _) = swing::incoming(obs, foe);
        let danger = (urgency * self.weights.read_ahead).min(Fx::ONE);
        let exposed = swing::overcommitted(foe);
        let in_reach = foe.distance <= reach;
        // Nothing worth calling an attack can start from a hand that is not free
        // to start one, so the offensive stances do not get to compete for the
        // decision while it is busy. Without this a duellist picks Trade,
        // achieves nothing because its hand is mid-recovery, and stands in
        // range doing it.
        let can_open = obs.can_strike() || obs.sword().swing.is_attacking();

        let mut scores = [Fx::ZERO; 8];
        // Out of reach, closing is the only thing worth doing, and it scales
        // with how far out of reach we are so it does not compete with the
        // close-quarters stances once we have arrived.
        //
        // Damped by danger, which is not decoration: without it a duellist
        // happily walks into a blade that is already on its way, because being
        // out of range makes every other stance score zero. Approach is the one
        // thing you must not do while something is arriving.
        scores[Stance::Close.index()] = if foe.distance > ideal {
            (((foe.distance - ideal) / reach.max(Fx::EPSILON)).min(Fx::TWO) + Fx::HALF)
                * (Fx::ONE - danger * APPROACH_CAUTION)
        } else {
            Fx::ZERO
        };
        // Trading is the default, and it has to be: every other stance is a
        // reason *not* to hit someone, and a fighter needs a reason to.
        scores[Stance::Trade.index()] = if in_reach && can_open {
            Fx::from_ratio(14, 10) - danger * Fx::HALF
        } else {
            Fx::ZERO
        };
        scores[Stance::Circle.index()] = self.weights.flank * (Fx::ONE - danger);
        scores[Stance::Evade.index()] = self.weights.evasion * danger;
        scores[Stance::Guard.index()] = self.weights.guard * danger;
        // The whole reward for reading a fight. An enemy in recovery cannot
        // attack, cannot parry and cannot get its guard back in time, and this
        // is the only stance that knows it.
        scores[Stance::Punish.index()] = if can_open {
            self.weights.punish * exposed
        } else {
            Fx::ZERO
        };
        scores[Stance::Feint.index()] = if in_reach && can_open && foe.shield_reach > Fx::HALF {
            self.weights.feint * (Fx::ONE - danger)
        } else {
            Fx::ZERO
        };
        // **Breaking off, counted in blows rather than in health.**
        //
        // This used to be `hp_frac < caution` -- a flat fraction, the same
        // against everything -- and a flat fraction is not a decision about the
        // fight, it is a decision about yourself. Twenty percent of a Warrior is
        // two more knife cuts from a Skitterer and most of the way through one
        // axe blow from a Brute. The same number cannot mean both.
        //
        // `threat` is what a clean blow costs here, so `hp_frac / threat` is how
        // many more this fighter can absorb, and `caution` is now how many it
        // insists on keeping in hand. The second clause is the other half of the
        // trade and the reason `frailty` exists: there is no point running from
        // someone who is closer to dying than you are. Losing a race you are
        // winning is how a duellist throws away a won fight.
        let mine = blows_left(obs.hp_frac, foe.threat);
        let theirs = blows_left(foe.hp_frac, foe.frailty);
        scores[Stance::Retreat.index()] = if mine < self.weights.caution && mine < theirs {
            Fx::from_int(10) // decisive: nothing else is worth doing this close to dead
        } else {
            Fx::ZERO
        };

        // Hysteresis. Without it a duellist flickers between two stances that
        // score within a hair of each other and does neither -- which looks
        // exactly like the swing dithering one level down, and costs the same.
        if let Some(running) = running {
            scores[running.index()] += self.weights.resolve;
        }

        // **Commitment**, and it is the single most important term here.
        //
        // A defensive stance commands the blade back to guard, and commanding a
        // blade back to guard *cancels a running windup*. So a duellist that
        // re-reads the situation every few ticks starts a cut, sees something it
        // does not like, calls it off, starts another, and lands nothing at all.
        // Measured: without this term the baseline won one duel in ten against
        // the policy it is supposed to beat, dying with its blade permanently
        // half-drawn.
        //
        // Two things stop it becoming stubbornness. Pulling out early is cheap
        // and pulling out late is not, so a cut that has barely begun is still
        // abandoned freely. And if this fighter's own telegraph runs out before
        // the enemy's, calling off is simply wrong -- the blow lands first, and
        // whatever was frightening about the other blade is a problem for
        // somebody who is about to be hit.
        let mine = obs.sword();
        if mine.swing.is_attacking() {
            let left = Fx::from_int(mine.swing_left as i32);
            let spent = Fx::ONE - (left / Fx::from_int(30)).min(Fx::ONE);
            let lands_first = mine.swing == Swing::Strike
                || !foe.sword_swing.is_attacking()
                || left < foe.sword_left;
            let keep = spent + if lands_first { Fx::ONE } else { Fx::ZERO };
            scores[Stance::Trade.index()] += keep;
            scores[Stance::Punish.index()] += keep;
        }

        let mut best = Stance::Close;
        let mut best_score = Fx::MIN;
        for stance in Stance::ALL {
            // Ties fall to the earlier stance in `ALL`, which is a fixed order.
            if scores[stance.index()] > best_score {
                best_score = scores[stance.index()];
                best = stance;
            }
        }
        best
    }

    /// Where an incoming cut will actually touch this fighter, as a bearing from
    /// its own centre.
    ///
    /// **Not the bearing of the enemy, and not the bearing of its blade.** A cut
    /// travels along the line it was thrown on and first touches a body well
    /// round from where its wielder is standing -- an overhead blow lands on top
    /// of you. And during a windup the blade is cocked *away* from that line, so
    /// covering the blade covers the one bearing the cut is guaranteed not to
    /// come from. Getting this wrong is not a small error; it is the difference
    /// between a shield and a decoration.
    ///
    /// The line is perceived, so this is a bet, and how good a bet it is depends
    /// on perception. That is the whole reason perception is a fighting stat: a
    /// dim character does not block late here, it blocks the wrong line.
    fn guard_line(&self, obs: &Observation, foe: &Contact) -> Angle {
        let bearing = foe.offset.angle();
        match swing::landing(obs, foe) {
            // Nothing coming, or coming and going to miss: cover the man.
            None => bearing,
            Some(at) if at.is_zero() => bearing,
            Some(at) => at.angle(),
        }
    }

    /// Turns a stance into feet and hands.
    fn act(&self, obs: &Observation, foe: &Contact, stance: Stance) -> Action {
        let toward = foe.offset.normalize();
        let bearing = foe.offset.angle();
        let ideal = self.preferred_range(obs, foe);
        let guard_line = self.guard_line(obs, foe);

        // Keep station: push out when too close, pull in when too far. The
        // deadband is a tenth of the range so a duellist is not permanently
        // correcting by a hair.
        //
        // The *pace* is the new half, and it is not a refinement. This used to
        // drive at the preferred range flat out and stop dead on arrival, which
        // a body with momentum cannot do: full speed into a deadband a tenth of
        // a unit wide overshoots it, reverses, overshoots the other way, and
        // leaves a duellist permanently sliding through the one distance it
        // wanted to be standing at.
        //
        // `sqrt(2 * a * d)` is the fastest approach from which a stop is still
        // possible. It is the same braking law `Hand::track` runs on the arm --
        // the arm has had momentum since the beginning, and this is the feet
        // catching up to it.
        let band = ideal * Fx::from_ratio(1, 10);
        let error = foe.distance - ideal;
        let station = if error.abs() <= band {
            Vec2::ZERO
        } else {
            let brakeable = fx::sqrt_product(obs.traction * Fx::TWO, error.abs() - band);
            let pace = (brakeable / obs.move_speed.max(Fx::EPSILON)).min(Fx::ONE);
            if error.is_positive() {
                toward * pace
            } else {
                -toward * pace
            }
        };

        let orbit = swing::shield_free_side(foe);

        // Which flank to cut at. A guard covers an arc, so the side a cut is
        // thrown from decides whether it arrives where the shield already is or
        // where the shield has to travel to be -- and a guard takes as long to
        // move as anything else does.
        let open = swing::open_side(foe);
        // Cut *through* the enemy's centre. The sim aims the far end of the arc
        // past that on its own, so the blade crosses the body at speed instead
        // of decelerating onto it.
        let attack = swing::press(obs, bearing, open);
        // Chambered, attacking nothing, and re-arming the hand for the next cut.
        // Not the same as putting the sword away: a guarding blade is still a
        // segment and still catches things.
        let ready = swing::guard(bearing);
        let cover = HandCommand::new(guard_line, Fx::ONE);

        let (feet, sword, shield) = match stance {
            // Closing with the blade chambered rather than swinging on the way
            // in. An attack thrown from out of range is a telegraph given away
            // for nothing, and it arrives in range mid-recovery -- which is the
            // exact state this policy is built to punish other people for.
            Stance::Close => (
                toward * (Fx::HALF + self.weights.lunge),
                ready,
                cover,
            ),
            Stance::Trade => (station, attack, cover),
            Stance::Circle => (
                (orbit * self.weights.flank + station * Fx::HALF).clamp_length(Fx::ONE),
                ready,
                cover,
            ),
            // Out of the arc, not merely away from it. Backing straight off is
            // the losing answer against anything with reach; the winning one is
            // to leave the plane the blade is sweeping through, which means
            // moving across it and, if anything, *inward*.
            //
            // The blade re-arms while evading rather than swinging. Stepping off
            // a cut is worth doing because of the answer that follows it, and
            // the answer needs a hand that is free to throw one.
            Stance::Evade => (
                (orbit * self.weights.sidestep - toward * (Fx::ONE - self.weights.sidestep))
                    .clamp_length(Fx::ONE),
                ready,
                cover,
            ),
            // Stand your ground and get the shield onto the line. Feet still,
            // because a braced guard that is walking is a guard in the wrong
            // place by the time the blow lands.
            //
            // Commanding `ready` here is also a *cancel*: if this fighter was
            // mid-windup when it read the incoming cut, the windup is called off
            // and the hand comes back clean. Eating a blow while committed to a
            // slower one of your own is how duels are lost.
            Stance::Guard => (Vec2::ZERO, ready, cover),
            // The blade has gone by and cannot come back yet. This is the only
            // stance that willingly gives up spacing.
            Stance::Punish => (toward, attack, cover),
            // Show the cut on the side the guard is *already* nearest, so
            // answering it drags the shield further that way -- and then the
            // real attack goes to `open_side`, which is the other one.
            Stance::Feint => {
                let bait = match open {
                    Strike::Widdershins => Strike::Sunwise,
                    _ => Strike::Widdershins,
                };
                (
                    station,
                    swing::feint(obs, bearing, bait, FEINT_COMMIT),
                    cover,
                )
            }
            Stance::Retreat => (
                (-toward + self.cohesion(obs) + self.open_ground(obs)).clamp_length(Fx::ONE),
                ready,
                cover,
            ),
        };

        let intent = if stance == Stance::Retreat {
            Intent::Flee
        } else {
            Intent::Attack(foe.id)
        };
        let mut hands = [HandCommand::TUCKED; sim::HANDS];
        hands[SWORD] = sword;
        hands[SHIELD] = shield;
        Action {
            move_dir: (feet + self.open_ground(obs) * Fx::HALF).clamp_length(Fx::ONE),
            intent,
            hands,
        }
    }

    /// The stance this policy last chose for `me`, for the HUD and for tests.
    pub fn stance_of(&self, me: EntityId) -> Option<Stance> {
        self.recall(me).stance
    }
}

impl Policy for DuelistPolicy {
    fn decide(&mut self, obs: &Observation) -> Action {
        if obs.enemies().is_empty() {
            // Losing sight resets the read. Whatever it was doing was about a
            // blade it can no longer see. The patrol leg survives, because that
            // is the memory this branch exists to use.
            let mut memory = self.recall(obs.me);
            memory.stance = None;
            let action = self.march(obs, &mut memory.patrol);
            self.remember(obs.me, memory);
            return action;
        }

        let mut memory = self.recall(obs.me);
        let foe = *self.pick_target(obs, memory.target);
        let stance = self.choose(obs, &foe, memory.stance);
        let action = self.act(obs, &foe, stance);

        memory.target = foe.id;
        memory.stance = Some(stance);
        self.remember(obs.me, memory);
        action
    }

    fn reset(&mut self) {
        self.memory.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{Faction, UnitKind};

    /// One clean blow from `by`, as a fraction of `to`'s health bar. The
    /// observer in these fixtures is a Scout; see `situation`.
    fn exchange(by: UnitKind, to: UnitKind) -> Fx {
        sim::peak_damage(arm_of(by), by.base_stats()) / to.base_stats().max_hp()
    }

    fn arm_of(kind: UnitKind) -> sim::Arm {
        sim::Arm::resolve(kind.weapon(), kind.base_stats(), kind.radius())
    }

    fn contact(kind: UnitKind, x: i32, y: i32) -> Contact {
        let offset = Vec2::from_ints(x, y);
        Contact {
            id: EntityId::new(1, 0),
            offset,
            distance: offset.length(),
            hp_frac: Fx::ONE,
            radius: kind.radius(),
            weapon_length: kind.weapon().length,
            // The real figures, unblurred: these fixtures are testing what a
            // policy does with a correct read, and the tests that care about a
            // wrong one set it themselves.
            min_strike_range: sim::dead_zone(arm_of(kind)),
            threat: exchange(kind, UnitKind::Scout),
            frailty: exchange(UnitKind::Scout, kind),
            velocity: Vec2::ZERO,
            facing: Angle::HALF,
            sword_angle: Angle::HALF,
            sword_reach: Fx::ONE,
            sword_spin: Fx::ZERO,
            sword_swing: sim::Swing::Guard,
            sword_left: Fx::ZERO,
            sword_line: Angle::HALF,
            shield_angle: Angle::HALF,
            shield_reach: Fx::ONE,
        }
    }

    /// A contact mid-windup: a cut declared on `line`, `left` ticks from going
    /// live. The situation the whole policy exists to answer.
    fn winding_up(kind: UnitKind, x: i32, y: i32, line: Angle, left: u16) -> Contact {
        let mut c = contact(kind, x, y);
        c.sword_swing = sim::Swing::Windup;
        c.sword_left = Fx::from_int(left as i32);
        c.sword_line = line;
        // A cocked blade sits `WINDUP_ARC` off the line it is aimed along, which
        // is the trap a defender that covers the *blade* walks into.
        c.sword_angle = line + Angle::from_raw(sim::WINDUP_ARC as u16);
        c
    }

    /// A contact that has just missed and cannot answer anything.
    fn recovering(kind: UnitKind, x: i32, y: i32, left: u16) -> Contact {
        let mut c = contact(kind, x, y);
        c.sword_swing = sim::Swing::Recover;
        c.sword_left = Fx::from_int(left as i32);
        c
    }

    fn situation(enemies: &[Contact]) -> Observation {
        let mut obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::from_ints(20, 14),
            Order::Hold,
        );
        obs.hp_frac = Fx::ONE;
        obs.radius = UnitKind::Scout.radius();
        obs.weapon_length = UnitKind::Scout.weapon().length;
        obs.shield_arc = UnitKind::Scout.weapon().shield_arc;
        // A Scout's real dead zone. Leaving it at the `blank` default of zero
        // would test a fighter that believes it can hurt someone from inside
        // its own hilt.
        obs.min_strike_range = Fx::from_ratio(265, 1000);
        obs.sight_range = Fx::from_int(14);
        obs.move_speed = Fx::from_ratio(657, 10_000);
        obs.decision_period = 10;
        obs.wall_clearance = [
            Fx::from_int(20),
            Fx::from_int(20),
            Fx::from_int(14),
            Fx::from_int(14),
        ];
        obs.set_enemies(enemies);
        obs
    }

    fn stance_for(policy: &mut DuelistPolicy, obs: &Observation) -> Stance {
        policy.decide(obs);
        policy.stance_of(obs.me).unwrap()
    }

    #[test]
    fn the_genome_round_trips() {
        let genes = DuelistWeights::BASELINE.to_genome();
        let restored = DuelistWeights::from_genome(&genes);
        for (a, b) in restored
            .values()
            .iter()
            .zip(DuelistWeights::BASELINE.values().iter())
        {
            assert!((*a - *b).abs() < Fx::from_ratio(1, 100), "{a} vs {b}");
        }
    }

    #[test]
    fn out_of_reach_it_closes() {
        let far = contact(UnitKind::Brute, 9, 0);
        let obs = situation(&[far]);
        let mut policy = DuelistPolicy::baseline();
        assert_eq!(stance_for(&mut policy, &obs), Stance::Close);
        // ...and it walks toward the enemy while doing so.
        assert!(policy.decide(&obs).move_dir.x > Fx::ZERO);
    }

    #[test]
    fn a_declared_cut_can_be_answered_rather_than_traded_with() {
        // The defensive stances fire on a telegraph, and the weights are named
        // explicitly rather than taken from the baseline **because the baseline
        // deliberately does not do this**.
        //
        // That is worth recording, because it was a surprise and it is the most
        // interesting thing measurement said about this model. Every value of
        // `read_ahead` above its floor made the duellist *worse*: over 120 seeds
        // against a Brute, 0.3 takes it 92% of the time and finishes on 0.73
        // health, 0.8 falls to 77% and 0.50, and 1.4 to 57% and 0.37. Answering
        // telegraphs is a losing strategy against anyone who declares one on
        // nearly every tick, because every answer is a cut you did not throw.
        // What actually beats a Brute is keeping the guard on the right line and
        // continuing to attack -- the shield is braced every tick regardless of
        // stance, so defending and pressing are not the alternatives they look
        // like.
        //
        // So this pins the *mechanism* rather than the tuning: a fighter that
        // wants to answer a cut can, and knows when there is one to answer.
        let obs = situation(&[winding_up(UnitKind::Brute, 2, 0, Angle::HALF, 3)]);
        let mut nervous = DuelistPolicy::new(DuelistWeights {
            guard: Fx::from_int(3),
            evasion: Fx::from_int(3),
            read_ahead: Fx::from_int(3),
            ..DuelistWeights::BASELINE
        });
        let stance = stance_for(&mut nervous, &obs);
        assert!(
            matches!(stance, Stance::Evade | Stance::Guard),
            "walked into a declared cut: {stance:?}"
        );

        // ...and the same fighter is not frightened of a blade that is doing
        // nothing. Reset first: `resolve` is at the top of its range, so a
        // running stance carries a full point of hysteresis into the next
        // decision and would answer this on its own.
        nervous.reset();
        let calm = situation(&[contact(UnitKind::Brute, 2, 0)]);
        let stance = stance_for(&mut nervous, &calm);
        assert!(
            !matches!(stance, Stance::Evade | Stance::Guard),
            "defended against a blade that was doing nothing: {stance:?}"
        );
    }

    #[test]
    fn a_telegraph_only_just_begun_is_not_yet_a_reason_to_stop_fighting() {
        // The other half, and the one that decides whether this policy ever
        // wins anything. A Brute that has just started a windup is nearly a
        // second away from being dangerous, and a fighter that treats that as
        // an emergency spends the entire fight defending and lands nothing.
        let obs = situation(&[winding_up(UnitKind::Brute, 2, 0, Angle::HALF, 40)]);
        let mut policy = DuelistPolicy::baseline();
        let stance = stance_for(&mut policy, &obs);
        assert!(
            !matches!(stance, Stance::Guard | Stance::Retreat),
            "cowered at a telegraph that had barely started: {stance:?}"
        );
    }

    #[test]
    fn a_recovering_enemy_is_punished() {
        // A Brute that has just missed is helpless for three quarters of a
        // second and cannot attack, parry or move its guard in time.
        let obs = situation(&[recovering(UnitKind::Brute, 2, 0, 40)]);

        let mut eager = DuelistPolicy::new(DuelistWeights {
            punish: Fx::from_int(3),
            ..DuelistWeights::BASELINE
        });
        assert_eq!(stance_for(&mut eager, &obs), Stance::Punish);
        // And it closes to do it, giving up spacing on purpose...
        assert!(eager.decide(&obs).move_dir.x > Fx::ZERO);
        // ...with an actual attack, not a pose.
        assert!(eager.decide(&obs).sword().strike.is_attack());
    }

    #[test]
    fn the_guard_covers_the_line_and_not_the_blade() {
        // The read that separates this policy from the naive one, and the one
        // that is least obvious. During a windup the blade is cocked a long way
        // *off* the line it is going to travel, so covering where the blade is
        // covers the one bearing the cut cannot arrive from.
        let line = Angle::HALF;
        let foe = winding_up(UnitKind::Brute, 2, 0, line, 3);
        let obs = situation(&[foe]);

        let mut policy = DuelistPolicy::new(DuelistWeights {
            guard: Fx::from_int(3),
            evasion: Fx::ZERO,
            ..DuelistWeights::BASELINE
        });
        let action = policy.decide(&obs);
        assert_eq!(policy.stance_of(obs.me), Some(Stance::Guard));

        let covered = action.shield().angle;
        assert!(
            covered.delta(foe.sword_angle).abs() > 6_000,
            "the guard went to the cocked blade at {:?} rather than to the line",
            foe.sword_angle
        );
    }

    #[test]
    fn closing_is_done_with_the_blade_chambered() {
        // An attack thrown from out of range is a telegraph spent for nothing,
        // and it arrives in range mid-recovery -- which is precisely the state
        // this policy punishes other people for being in.
        let obs = situation(&[contact(UnitKind::Brute, 9, 0)]);
        let mut policy = DuelistPolicy::baseline();
        let action = policy.decide(&obs);
        assert_eq!(policy.stance_of(obs.me), Some(Stance::Close));
        assert!(
            !action.sword().strike.is_attack(),
            "swung at something four body-lengths away"
        );
    }

    #[test]
    fn a_cut_is_thrown_at_the_side_the_guard_is_not_on() {
        // Enemy due east with its guard swung well off the line between us.
        // Two mirrored situations must produce two different sides, or the
        // choice is not being made at all.
        let mut left = contact(UnitKind::Warrior, 1, 0);
        left.shield_angle = Angle::from_degrees(135);
        let mut right = contact(UnitKind::Warrior, 1, 0);
        right.shield_angle = Angle::from_degrees(-135);

        let mut policy = DuelistPolicy::baseline();
        let a = policy.decide(&situation(&[left])).sword().strike;
        policy.reset();
        let b = policy.decide(&situation(&[right])).sword().strike;
        assert!(a.is_attack() && b.is_attack(), "{a:?} / {b:?}");
        assert_ne!(a, b, "the same side was chosen against opposite guards");
    }

    #[test]
    fn a_hurt_duellist_breaks_off_whatever_else_is_happening() {
        let mut obs = situation(&[winding_up(UnitKind::Brute, 2, 0, Angle::HALF, 3)]);
        obs.hp_frac = Fx::from_ratio(1, 20);

        // On the shipped weights on purpose. Breaking off is the one stance a
        // duel arena will never select for -- there is nowhere to break off to
        // and the clock is against you -- so `caution` is hand-set, and a
        // hand-set gene with no test on it is a gene that quietly rots.
        let mut policy = DuelistPolicy::baseline();
        assert_eq!(stance_for(&mut policy, &obs), Stance::Retreat);
        let action = policy.decide(&obs);
        assert_eq!(action.intent, Intent::Flee);
        assert!(action.move_dir.x < Fx::ZERO, "fled toward the enemy");
    }

    #[test]
    fn breaking_off_is_counted_in_blows_and_not_in_health() {
        // The same fighter, the same wound, two different opponents. A flat
        // health threshold cannot tell these apart and that was the bug: 30% of
        // a Scout is most of the way through one blow from a Brute and a
        // comfortable two from a Skitterer, and only one of those is a reason to
        // leave.
        let mut careful = DuelistPolicy::new(DuelistWeights {
            caution: Fx::ONE,
            ..DuelistWeights::BASELINE
        });

        let mut against = |kind| {
            let mut obs = situation(&[contact(kind, 2, 0)]);
            obs.hp_frac = Fx::from_ratio(3, 10);
            careful.reset();
            stance_for(&mut careful, &obs)
        };
        assert_eq!(against(UnitKind::Brute), Stance::Retreat);
        assert_ne!(
            against(UnitKind::Skitterer),
            Stance::Retreat,
            "left a fight it was two clean blows from surviving"
        );
    }

    #[test]
    fn nobody_runs_from_someone_closer_to_dead_than_they_are() {
        // The other half of the trade, and the reason `frailty` is in the
        // observation at all. Losing a race you are winning is how a duellist
        // throws away a fight it had already won.
        let mut careful = DuelistPolicy::new(DuelistWeights {
            caution: Fx::ONE,
            ..DuelistWeights::BASELINE
        });

        let mut against = |enemy_hp| {
            let mut foe = contact(UnitKind::Brute, 2, 0);
            foe.hp_frac = enemy_hp;
            let mut obs = situation(&[foe]);
            obs.hp_frac = Fx::from_ratio(3, 10);
            careful.reset();
            stance_for(&mut careful, &obs)
        };
        assert_eq!(against(Fx::ONE), Stance::Retreat);
        assert_ne!(
            against(Fx::from_ratio(3, 100)),
            Stance::Retreat,
            "ran from a Brute that was one cut from falling over"
        );
    }

    #[test]
    fn resolve_stops_the_stance_flickering() {
        // Two stances scoring within a hair of each other. With no hysteresis a
        // duellist alternates and does neither.
        let obs = situation(&[winding_up(UnitKind::Warrior, 2, 0, Angle::HALF, 10)]);

        let mut steady = DuelistPolicy::new(DuelistWeights {
            resolve: Fx::ONE,
            ..DuelistWeights::BASELINE
        });
        let first = stance_for(&mut steady, &obs);
        for _ in 0..20 {
            assert_eq!(stance_for(&mut steady, &obs), first, "the duellist dithered");
        }
    }

    #[test]
    fn the_preferred_range_is_always_somewhere_it_can_strike_from() {
        // The bug this replaced: scaling by the *enemy's* reach parked a Scout
        // 1.55 units from a Brute, where its own 0.90 of reach only just
        // arrives on a 0.70 body and the Brute's blade is still moving fast
        // enough to hurt. A duellist must never choose a distance from which it
        // cannot fight back.
        let policy = DuelistPolicy::baseline();
        let obs = situation(&[]);
        for kind in UnitKind::ALL {
            let foe = contact(kind, 5, 0);
            let ideal = policy.preferred_range(&obs, &foe);
            assert!(
                ideal <= obs.full_reach() + foe.radius,
                "against a {} it wants {ideal}, past its own reach of {}",
                kind.name(),
                obs.full_reach() + foe.radius
            );
        }
        // A bigger body still pushes the whole band outward, so the enemy's
        // geometry has not stopped mattering -- it enters through the radius.
        assert!(
            policy.preferred_range(&obs, &contact(UnitKind::Brute, 5, 0))
                > policy.preferred_range(&obs, &contact(UnitKind::Skitterer, 5, 0))
        );
    }

    #[test]
    fn losing_sight_forgets_the_read() {
        let obs = situation(&[contact(UnitKind::Brute, 3, 0)]);
        let mut policy = DuelistPolicy::baseline();
        policy.decide(&obs);
        assert!(policy.stance_of(obs.me).is_some());

        let empty = situation(&[]);
        policy.decide(&empty);
        assert!(
            policy.stance_of(empty.me).is_none(),
            "kept a stance about a blade it can no longer see"
        );
    }

    #[test]
    fn every_decision_is_a_legal_action() {
        // Fuzz the awkward geometry: contacts on top of the observer, blades at
        // every bearing, absurd spins. Nothing here may panic and no movement
        // vector may exceed one.
        let mut policy = DuelistPolicy::baseline();
        for step in 0..64i32 {
            let mut c = contact(UnitKind::Brute, step % 7 - 3, step % 5 - 2);
            c.sword_angle = Angle::from_raw((step * 1024) as u16);
            c.sword_spin = Fx::from_int((step - 32) * 200);
            c.shield_angle = Angle::from_raw((step * 2048) as u16);
            c.sword_reach = Fx::from_ratio(step % 4, 3);
            let mut obs = situation(&[c]);
            obs.hp_frac = Fx::from_ratio(step % 11, 10);
            let action = policy.decide(&obs);
            assert!(
                action.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                "step {step}: {:?}",
                action.move_dir
            );
        }
    }
}
