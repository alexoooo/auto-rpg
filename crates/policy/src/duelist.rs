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
use sim::{Action, Contact, EntityId, HandCommand, Intent, Observation, Order, SHIELD, SWORD};

pub const DUELIST_GENOME_LEN: usize = 16;

/// How much warning, in world units outside the body, counts as an incoming
/// blow. A blade predicted to arrive on the skin scores full danger; one this
/// far out scores none.
///
/// Narrow on purpose. A wide band is permanently satisfied at fighting range,
/// so the defensive stances win every score, and a duellist that is always
/// defending is a duellist that never attacks: at a full unit it turtled
/// through entire fights, blocking thousands of blows and landing none.
const DANGER_BAND: Fx = Fx::from_ratio(45, 100);

/// Spin, in raw angle units per tick, at which an incoming blade is as
/// frightening as it gets. Roughly a Warrior's working speed.
const THREAT_SPIN: Fx = Fx::from_int(1500);

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
    /// Health fraction below which it breaks off.
    pub caution: Fx,
    /// **The gene that decides the Brute fight.** Preferred range as a fraction
    /// of the distance at which its own blade reaches the target's body.
    ///
    /// Measured in its *own* reach and not the enemy's, which is the second
    /// thing tried and the one that works. Scaling by the threat's reach reads
    /// better -- solve the enemy's geometry, not your own -- and puts a Scout
    /// 1.55 units from a Brute, where its own blade only just arrives and the
    /// Brute's is still moving fast enough to hurt. Own-reach scaling still
    /// finds the same hiding places, because a big enemy pushes the whole band
    /// outward through its radius, and it can never ask for a distance from
    /// which this fighter cannot strike back.
    pub standoff: Fx,
    /// Willingness to close the last of the distance to strike.
    pub lunge: Fx,
    /// Weight on covering the predicted line with the shield.
    pub guard: Fx,
    /// How many ticks ahead it extrapolates an incoming blade.
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
    (Fx::ZERO, Fx::from_ratio(6, 10)),              // caution
    (Fx::from_ratio(5, 10), Fx::from_ratio(16, 10)), // standoff
    (Fx::ZERO, Fx::ONE),                            // lunge
    (Fx::ZERO, Fx::from_int(3)),                    // guard
    (Fx::from_int(4), Fx::from_int(34)),            // read_ahead, ticks
    (Fx::ZERO, Fx::from_int(3)),                    // evasion
    (Fx::ZERO, Fx::ONE),                            // sidestep
    (Fx::ZERO, Fx::from_int(2)),                    // flank
    (Fx::ZERO, Fx::from_int(3)),                    // punish
    (Fx::ZERO, Fx::ONE),                            // feint
    (Fx::ZERO, Fx::ONE),                            // resolve
    (Fx::ZERO, Fx::ONE),                            // cohesion
    (Fx::ZERO, Fx::ONE),                            // wall_fear
];

/// Hand-tuned starting point.
///
/// `standoff` is the load-bearing one, and its range has a trap at *each* end
/// that is the reason it is a gene rather than a constant.
///
/// A blade's speed rises with distance from the shoulder, so crowding inside a
/// heavy weapon's arc is the safest place in the arena -- and crowd too far and
/// you are inside your *own* minimum effective radius, where your blade cannot
/// reach the impact threshold either. At 0.72 a Skitterer parked 1.0 from a
/// Brute contacted at arm 0.31, worth 0.082 against a threshold of 0.09: a
/// fighter that could not be hurt and could not hurt anything, which cost it
/// fifty points of win rate against an opponent the baseline beats handily.
/// 0.85 sits outside that on every archetype. The band between the two traps is
/// what evolution is being asked to find.
const BASELINE_VALUES: [Fx; DUELIST_GENOME_LEN] = [
    Fx::from_ratio(10, 10),  // aggression
    Fx::from_ratio(7, 10),   // bloodlust
    Fx::from_ratio(15, 10),  // obedience
    Fx::from_ratio(15, 100), // caution
    Fx::from_ratio(72, 100), // standoff
    Fx::from_ratio(6, 10),   // lunge
    Fx::from_ratio(14, 10),  // guard
    Fx::from_int(18),        // read_ahead
    Fx::from_ratio(11, 10),  // evasion
    Fx::from_ratio(7, 10),   // sidestep
    Fx::from_ratio(9, 10),   // flank
    Fx::from_ratio(20, 10),  // punish
    Fx::from_ratio(25, 100), // feint
    Fx::from_ratio(35, 100), // resolve
    Fx::from_ratio(2, 10),   // cohesion
    Fx::from_ratio(3, 10),   // wall_fear
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
    /// Which way the current feint is pretending to swing.
    feint_side: i8,
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
    fn march(&self, obs: &Observation) -> Action {
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

        // Sweep along a wall rather than grinding into it.
        let heading = if !heading.is_zero() {
            let clearance = {
                let horizontal = if heading.x.is_positive() {
                    obs.wall_clearance[1]
                } else {
                    obs.wall_clearance[0]
                };
                let vertical = if heading.y.is_positive() {
                    obs.wall_clearance[3]
                } else {
                    obs.wall_clearance[2]
                };
                horizontal * heading.x.abs() + vertical * heading.y.abs()
            };
            if clearance < Fx::from_int(2) {
                let along = heading.perp();
                if obs.wall_clearance[3] >= obs.wall_clearance[2] {
                    along
                } else {
                    -along
                }
            } else {
                heading
            }
        } else {
            heading
        };

        Action::moving((heading + self.open_ground(obs)).clamp_length(Fx::ONE))
    }

    /// How far this duellist wants to be from `threat`'s centre.
    ///
    /// A fraction of the distance at which its own blade arrives on the
    /// target's body, so the band always contains somewhere it can fight from.
    /// See [`DuelistWeights::standoff`] for why it is not the enemy's reach.
    fn preferred_range(&self, obs: &Observation, threat: &Contact) -> Fx {
        let wanted = (obs.full_reach() + threat.radius) * self.weights.standoff;
        // Never closer than its own blade can do anything from. Crowding in is
        // the answer to a heavy weapon right up until it is the answer to
        // nothing: past this line a fighter is inside its *own* dead zone,
        // unable to hurt what it is standing on top of. The floor is what lets
        // `standoff` be aggressive without being suicidal for the small
        // archetypes, whose whole sword is shorter than a Brute's dead zone.
        wanted.max(obs.min_strike_range * STRIKE_MARGIN + threat.radius)
    }

    /// Scores every stance and returns the winner.
    fn choose(&self, obs: &Observation, threat: &Contact, running: Option<Stance>) -> Stance {
        let reach = obs.full_reach() + threat.radius;
        let ideal = self.preferred_range(obs, threat);
        let ticks = self.weights.read_ahead.round_int().clamp(1, 60) as u16;
        let (closest, _) = swing::incoming(threat, ticks);
        // How close that blade is coming, `0..=1`, saturating once it is inside
        // the body. Keyed to a fixed band outside the body rather than to a
        // multiple of the body's own size: a Scout's radius is 0.35, so a
        // signal scaled by that only fires once the blade is already through,
        // far too late to answer.
        let proximity =
            ((obs.radius + DANGER_BAND - closest) / DANGER_BAND).clamp(Fx::ZERO, Fx::ONE);
        // ...and how fast it is travelling, because a blade parked next to you
        // is not a threat, it is furniture. Without this term a duellist reads
        // "enemy nearby" as "enemy attacking" and never stops defending.
        let speed = (threat.sword_spin.abs() / THREAT_SPIN).min(Fx::ONE);
        let danger = proximity * speed;
        let exposed = swing::overcommitted(threat);
        let in_reach = threat.distance <= reach;

        let mut scores = [Fx::ZERO; 8];
        // Out of reach, closing is the only thing worth doing, and it scales
        // with how far out of reach we are so it does not compete with the
        // close-quarters stances once we have arrived.
        //
        // Damped by danger, which is not decoration: without it a duellist
        // happily walks into a blade that is already on its way, because being
        // out of range makes every other stance score zero. Approach is the one
        // thing you must not do while something is arriving.
        scores[Stance::Close.index()] = if threat.distance > ideal {
            (((threat.distance - ideal) / reach.max(Fx::EPSILON)).min(Fx::TWO) + Fx::HALF)
                * (Fx::ONE - danger * APPROACH_CAUTION)
        } else {
            Fx::ZERO
        };
        // Trading is the default, and it has to be: every other stance is a
        // reason *not* to hit someone, and a fighter needs a reason to.
        scores[Stance::Trade.index()] = if in_reach {
            Fx::from_ratio(14, 10) - danger * Fx::HALF
        } else {
            Fx::ZERO
        };
        scores[Stance::Circle.index()] = self.weights.flank * (Fx::ONE - danger);
        scores[Stance::Evade.index()] = self.weights.evasion * danger;
        scores[Stance::Guard.index()] = self.weights.guard * danger;
        scores[Stance::Punish.index()] = self.weights.punish * exposed;
        scores[Stance::Feint.index()] = if in_reach && threat.shield_reach > Fx::HALF {
            self.weights.feint * (Fx::ONE - danger)
        } else {
            Fx::ZERO
        };
        scores[Stance::Retreat.index()] = if obs.hp_frac < self.weights.caution {
            Fx::from_int(10) // decisive: nothing else is worth doing at 15% health
        } else {
            Fx::ZERO
        };

        // Hysteresis. Without it a duellist flickers between two stances that
        // score within a hair of each other and does neither -- which looks
        // exactly like the swing dithering one level down, and costs the same.
        if let Some(running) = running {
            scores[running.index()] += self.weights.resolve;
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

    /// Turns a stance into feet and hands.
    fn act(&self, obs: &Observation, threat: &Contact, stance: Stance, memory: &mut Memory) -> Action {
        let toward = threat.offset.normalize();
        let bearing = threat.offset.angle();
        let ideal = self.preferred_range(obs, threat);
        let ticks = self.weights.read_ahead.round_int().clamp(1, 60) as u16;

        // Where the blade is going to be. Both the guard and the sidestep are
        // bets on this number, which is why perception is a fighting stat: the
        // spin being extrapolated was itself perceived through noise.
        let landing = swing::blade_tip_in(threat, ticks);
        let guard_line = if landing.is_zero() {
            bearing
        } else {
            landing.angle()
        };

        // Keep station: push out when too close, pull in when too far. The
        // deadband is a tenth of the range so a duellist is not permanently
        // correcting by a hair.
        let band = ideal * Fx::from_ratio(1, 10);
        let station = if threat.distance > ideal + band {
            toward
        } else if threat.distance < ideal - band {
            -toward
        } else {
            Vec2::ZERO
        };

        let orbit = swing::shield_free_side(threat);
        let swing_now = swing::swing(obs, bearing, Fx::ONE);
        let guard_now = HandCommand::new(guard_line, Fx::ONE);
        let guard_at_enemy = HandCommand::new(bearing, Fx::ONE);

        let (feet, sword, shield) = match stance {
            Stance::Close => (
                toward * (Fx::HALF + self.weights.lunge),
                swing_now,
                guard_at_enemy,
            ),
            Stance::Trade => (station, swing_now, guard_at_enemy),
            Stance::Circle => (
                (orbit * self.weights.flank + station * Fx::HALF).clamp_length(Fx::ONE),
                swing_now,
                guard_now,
            ),
            // Out of the arc, not merely away from it. Backing straight off is
            // the losing answer against anything with reach; the winning one is
            // to leave the plane the blade is sweeping through, which means
            // moving across it and, if anything, *inward*.
            //
            // The blade stays wound up while evading rather than being put
            // away. Tucking it turns every defensive moment into a wasted one,
            // and the whole value of stepping off a swing is the answer that
            // follows it.
            Stance::Evade => (
                (orbit * self.weights.sidestep - toward * (Fx::ONE - self.weights.sidestep))
                    .clamp_length(Fx::ONE),
                swing_now,
                guard_now,
            ),
            // Stand your ground and get the shield onto the line. Feet still,
            // because a braced guard that is walking is a guard in the wrong
            // place by the time the blow lands. The sword is held ready at half
            // extension: short enough not to be parried out of position,
            // extended enough to answer the moment the blow is off.
            Stance::Guard => (
                Vec2::ZERO,
                HandCommand::new(swing_now.angle, Fx::HALF),
                guard_now,
            ),
            // The blade has gone by and cannot come back yet. This is the only
            // stance that willingly gives up spacing.
            Stance::Punish => (toward, swing_now, guard_at_enemy),
            // Show the blade on one side without committing spin, then swing
            // from the other. The tucked reach is what makes it a feint rather
            // than an attack: nothing to parry, nothing to punish.
            Stance::Feint => {
                memory.feint_side = -memory.feint_side;
                let show = bearing
                    + Angle::from_raw((memory.feint_side as i32 * swing::OVERSHOOT) as u16);
                (station, HandCommand::new(show, Fx::HALF), guard_now)
            }
            Stance::Retreat => (
                (-toward + self.cohesion(obs) + self.open_ground(obs)).clamp_length(Fx::ONE),
                swing::guard_low(bearing),
                guard_now,
            ),
        };

        let intent = if stance == Stance::Retreat {
            Intent::Flee
        } else {
            Intent::Attack(threat.id)
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
            // blade it can no longer see.
            let mut memory = self.recall(obs.me);
            memory.stance = None;
            self.remember(obs.me, memory);
            return self.march(obs);
        }

        let mut memory = self.recall(obs.me);
        if memory.feint_side == 0 {
            memory.feint_side = 1;
        }
        let threat = *self.pick_target(obs, memory.target);
        let stance = self.choose(obs, &threat, memory.stance);
        let action = self.act(obs, &threat, stance, &mut memory);

        memory.target = threat.id;
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

    fn contact(kind: UnitKind, x: i32, y: i32) -> Contact {
        let offset = Vec2::from_ints(x, y);
        Contact {
            id: EntityId::new(1, 0),
            offset,
            distance: offset.length(),
            hp_frac: Fx::ONE,
            radius: kind.radius(),
            weapon_length: kind.weapon().length,
            facing: Angle::HALF,
            sword_angle: Angle::HALF,
            sword_reach: Fx::ONE,
            sword_spin: Fx::ZERO,
            shield_angle: Angle::HALF,
            shield_reach: Fx::ONE,
        }
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
    fn a_committed_swing_is_answered_rather_than_traded_with() {
        // A Brute mid-swing, blade about to arrive.
        let mut swinging = contact(UnitKind::Brute, 2, 0);
        swinging.sword_angle = Angle::HALF + Angle::from_raw(9_000);
        swinging.sword_spin = Fx::from_int(-700);
        let obs = situation(&[swinging]);

        let mut policy = DuelistPolicy::baseline();
        let stance = stance_for(&mut policy, &obs);
        assert!(
            matches!(stance, Stance::Evade | Stance::Guard),
            "walked into a live blade: {stance:?}"
        );
    }

    #[test]
    fn an_overcommitted_enemy_is_punished() {
        // Blade well past, still travelling away: a Brute has 0.66 seconds of
        // recovery to pay off and cannot answer anything.
        // The observer bears 180 degrees from the enemy, so a blade that has
        // swept *past* on a positive spin sits counter-clockwise of that.
        let mut spent = contact(UnitKind::Brute, 2, 0);
        spent.sword_angle = Angle::HALF + Angle::from_raw(20_000);
        spent.sword_spin = Fx::from_int(700);
        let obs = situation(&[spent]);

        let mut eager = DuelistPolicy::new(DuelistWeights {
            punish: Fx::from_int(3),
            ..DuelistWeights::BASELINE
        });
        assert_eq!(stance_for(&mut eager, &obs), Stance::Punish);
        // And it closes to do it, giving up spacing on purpose.
        assert!(eager.decide(&obs).move_dir.x > Fx::ZERO);
    }

    #[test]
    fn a_hurt_duellist_breaks_off_whatever_else_is_happening() {
        let mut swinging = contact(UnitKind::Brute, 2, 0);
        swinging.sword_spin = Fx::from_int(-700);
        let mut obs = situation(&[swinging]);
        obs.hp_frac = Fx::from_ratio(1, 20);

        let mut policy = DuelistPolicy::baseline();
        assert_eq!(stance_for(&mut policy, &obs), Stance::Retreat);
        let action = policy.decide(&obs);
        assert_eq!(action.intent, Intent::Flee);
        assert!(action.move_dir.x < Fx::ZERO, "fled toward the enemy");
    }

    #[test]
    fn resolve_stops_the_stance_flickering() {
        // Two stances scoring within a hair of each other. With no hysteresis a
        // duellist alternates and does neither.
        let mut threat = contact(UnitKind::Warrior, 2, 0);
        threat.sword_spin = Fx::from_int(-300);
        let obs = situation(&[threat]);

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
            let threat = contact(kind, 5, 0);
            let ideal = policy.preferred_range(&obs, &threat);
            assert!(
                ideal <= obs.full_reach() + threat.radius,
                "against a {} it wants {ideal}, past its own reach of {}",
                kind.name(),
                obs.full_reach() + threat.radius
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
