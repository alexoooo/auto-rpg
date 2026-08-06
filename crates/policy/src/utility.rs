use crate::genome::PolicySpec;
use crate::swing;
use crate::Policy;
use fx::{Fx, Vec2};
use sim::{Command, Contact, EntityId, Intent, Observation, Order};

/// Number of genes in the evolvable representation of [`UtilityWeights`].
pub const GENOME_LEN: usize = 8;

/// How much lateral drift a patrol takes on when it turns at a wall.
///
/// Not a gene, because it is not a preference. A patrol that retraces exactly
/// the same line back and forth sweeps a line; one that steps sideways at each
/// end sweeps a band, and a band is what finds somebody. Shared with
/// [`crate::DuelistPolicy`], which needs it for the same reason.
pub const SWEEP_LATERAL: Fx = Fx::from_ratio(6, 10);

/// How much room the ordered direction needs before a patrol turns around.
///
/// Roughly two body-lengths, so the turn happens at the wall rather than in
/// open ground where it would look like indecision.
pub const PATROL_TURN_CLEARANCE: Fx = Fx::from_int(2);

/// Which way along its standing order an agent is currently walking.
///
/// **One bit of memory, and it is what turns `Advance` into a search.** Without
/// it the rule has to be a pure function of position, and a memoryless agent at
/// a wall is stuck: whatever makes it step away from the wall stops applying the
/// moment it has stepped away, so it twitches on the spot in a band a unit and a
/// half wide. Measured on duels at the dim end of the skill range, two fighters
/// ordered to advance *at* each other cross over, arrive at opposite edges, and
/// pace two parallel lines twenty units apart for the rest of the run -- one
/// duel in six ended that way, at full health, with the clock stopped.
///
/// Remembering which way you were going costs a byte and turns that into a
/// fighter that walks back and finds the other one.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Patrol(i8);

impl Patrol {
    /// `+1` while following the order as given, `-1` on the return leg.
    #[inline]
    pub fn sign(self) -> Fx {
        if self.0 < 0 {
            -Fx::ONE
        } else {
            Fx::ONE
        }
    }

    #[inline]
    pub fn reverse(&mut self) {
        self.0 = if self.0 < 0 { 1 } else { -1 };
    }
}

/// Turns a standing heading into this tick's patrol leg, reversing at the wall.
///
/// Shared by both hand-authored policies so that "advance" means one thing.
/// Returns the direction to walk; `patrol` is updated in place when the leg
/// turns.
pub(crate) fn patrol_heading(obs: &Observation, heading: Vec2, patrol: &mut Patrol) -> Vec2 {
    if heading.is_zero() {
        return heading;
    }
    let leg = heading * patrol.sign();
    let clearance = {
        let horizontal = if leg.x.is_positive() {
            obs.wall_clearance[1]
        } else {
            obs.wall_clearance[0]
        };
        let vertical = if leg.y.is_positive() {
            obs.wall_clearance[3]
        } else {
            obs.wall_clearance[2]
        };
        horizontal * leg.x.abs() + vertical * leg.y.abs()
    };
    if clearance >= PATROL_TURN_CLEARANCE {
        return leg;
    }

    // At the end of the leg: turn, and step sideways on the way round so the
    // return sweeps new ground rather than retracing the outbound line.
    patrol.reverse();
    let along = leg.perp();
    let along = if obs.wall_clearance[3] >= obs.wall_clearance[2] {
        along
    } else {
        -along
    };
    (-leg + along * SWEEP_LATERAL).normalize()
}

/// How far along the floor something will follow an objective it cannot see.
///
/// **This is what keeps a dungeon room-by-room.** With no bound, everything on
/// the level starts walking at the hero on tick one and the whole floor arrives
/// as a single brawl -- which is not a dungeon, it is one fight held in a large
/// room. Roughly two rooms and the corridor between them, so a fight stays a
/// fight about the room you are in, and the thing three rooms away is a problem
/// you have not met yet.
///
/// Stated in world units along the *route*, not in a straight line: something
/// on the far side of one wall is genuinely further away than something at the
/// same distance down an open corridor, and the percept already knows which is
/// which.
pub(crate) const HUNT_RANGE: Fx = Fx::from_int(18);

/// The route to this faction's objective: which way to walk, and how much
/// ground is left along it.
///
/// `None` when there is nowhere to go -- no objective set, or one sealed behind
/// masonry -- which every caller reads as "stop", because it is.
///
/// Shared by both hand-authored policies for the same reason
/// [`patrol_heading`] is: so that "walk there" means one thing whichever policy
/// is driving. It is deliberately thin. Everything interesting happened in the
/// sim, which is the only thing that knows the floor plan; what is left here is
/// the *decision* to follow the answer, and that stays with the policy.
pub(crate) fn nav_step(obs: &Observation) -> Option<(Vec2, Fx)> {
    if obs.nav_dir.is_zero() || obs.nav_distance >= Fx::MAX {
        return None;
    }
    Some((obs.nav_dir, obs.nav_distance))
}

/// How far from an arrived destination a character is free to move.
///
/// An order names a *place to be near*, not a spot to be pinned to. The old rule
/// was a deadband of one tick of travel, which is not a tolerance so much as a
/// promise that any shove -- knockback, `World::separate`, a wall slide -- makes
/// the order live again and walks the character back mid-fight, with its own
/// footwork suppressed the whole way. A ring wide enough to circle in is the
/// difference between a fighter standing where it was told and a fighter standing
/// *still*.
pub(crate) const LEASH_ROAM: Fx = Fx::from_ratio(3, 2);

/// How much of its own footwork a character keeps at full stretch.
///
/// A lateral component of this size off a unit heading is some 17 degrees of
/// deviation: room to sidestep a blade and make small corrections, not room to
/// wander off the route. Zero here is the old behaviour -- a rail.
pub(crate) const LEASH_LANE: Fx = Fx::from_ratio(3, 10);

/// How much wider than its preferred range a focused fighter's ring is drawn.
///
/// An [`Order::Focus`] anchors on a ring around the quarry rather than on the
/// quarry itself, and this is what that ring is sized by: the fighter's own
/// standoff, out by half again. The slack is the band the fight is allowed to
/// work in before the pursuit starts pulling -- so the mind owns the feet out to
/// `1.5x` the range it wanted, and the order does not reach full strength until
/// `1.5x standoff + LEASH_ROAM`.
///
/// **Exactly `1.0` is the version that does not work**, and the failure is not
/// subtle. Keeping station is a two-sided correction: `station` pushes *out* when
/// a fighter is inside its range and pulls in when it is outside, and a circling
/// duellist crosses its own preferred range constantly. A ring drawn on that line
/// puts the pull's rim precisely where the footwork is busiest, so every step out
/// to make room re-arms an order that walks the fighter back in. The band is what
/// makes the two mechanisms answer different questions -- spacing inside it,
/// pursuit outside it -- rather than fighting over the same tenth of a unit.
pub(crate) const FOCUS_SLACK: Fx = Fx::from_ratio(3, 2);

/// Blends an order against the footwork the fighter wanted anyway.
///
/// `order` is the **brake-scaled** heading, not a raw unit vector: the spring and
/// the policy's own stopping-distance solve compose, and the brake is what damps
/// the spring instead of letting it orbit the anchor.
///
/// `gap` is how far the anchor still is. At zero the pull is zero and the fight
/// owns the feet completely -- that is the hover. At [`LEASH_ROAM`] and beyond the
/// order dominates and [`LEASH_LANE`] of own footwork survives -- that is the walk.
/// Quadratic rather than linear so the ring has a soft interior and a firm rim.
pub(crate) fn leash(order: Vec2, gap: Fx, own: Vec2) -> Vec2 {
    let slack = (gap / LEASH_ROAM).min(Fx::ONE);
    let pull = slack * slack;
    let free = Fx::ONE - pull * (Fx::ONE - LEASH_LANE);
    (order * pull + own * free).clamp_length(Fx::ONE)
}

/// The knobs behind the hand-authored behaviour.
///
/// Every field is exposed as a gene in `0..=1` and mapped into the range below,
/// which is what lets the lab run evolution over behaviour on day one -- no
/// autodiff, no Python, no network. The same fitness harness that ranks these
/// eight numbers will later rank a set of network weights, so the experiment
/// side of the project is exercised end to end before any learning exists.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct UtilityWeights {
    /// How much nearness matters when picking a target.
    pub aggression: Fx,
    /// How much a wounded target is preferred. High values finish kills.
    pub bloodlust: Fx,
    /// How strongly the player's `Focus` order overrides its own judgement.
    pub obedience: Fx,
    /// Bonus for the target it is already fighting; discourages dithering.
    pub commitment: Fx,
    /// Health fraction below which it disengages.
    pub caution: Fx,
    /// Preferred distance to the target as a fraction of its reach. Below 1 it
    /// crowds in; near 1 it hovers at the edge of its swing.
    pub spacing: Fx,
    /// Pull toward the centre of mass of visible allies.
    pub cohesion: Fx,
    /// Preference for open ground over corners.
    pub wall_fear: Fx,
}

const LABELS: [&str; GENOME_LEN] = [
    "aggression",
    "bloodlust",
    "obedience",
    "commitment",
    "caution",
    "spacing",
    "cohesion",
    "wall_fear",
];

/// `(min, max)` for each gene, in field order.
const GENE_RANGES: [(Fx, Fx); GENOME_LEN] = [
    (Fx::ZERO, Fx::from_int(2)),              // aggression
    (Fx::ZERO, Fx::from_int(2)),              // bloodlust
    (Fx::ZERO, Fx::from_int(3)),              // obedience
    (Fx::ZERO, Fx::from_int(1)),              // commitment
    (Fx::ZERO, Fx::from_ratio(6, 10)),        // caution
    (Fx::from_ratio(3, 10), Fx::from_int(1)), // spacing
    (Fx::ZERO, Fx::from_int(1)),              // cohesion
    (Fx::ZERO, Fx::from_int(1)),              // wall_fear
];

const BASELINE_VALUES: [Fx; GENOME_LEN] = [
    Fx::from_ratio(10, 10),
    Fx::from_ratio(6, 10),
    Fx::from_ratio(15, 10),
    Fx::from_ratio(3, 10),
    Fx::from_ratio(2, 10),
    Fx::from_ratio(85, 100),
    Fx::from_ratio(25, 100),
    Fx::from_ratio(3, 10),
];

impl UtilityWeights {
    /// This policy's knobs, for evolution, for reporting and for the browser's
    /// sliders.
    pub const SPEC: PolicySpec = PolicySpec::new(&LABELS, &GENE_RANGES, &BASELINE_VALUES);

    /// Hand-tuned starting point. Evolution should beat this; if it cannot,
    /// something is wrong with the fitness function, not the search.
    pub const BASELINE: UtilityWeights = UtilityWeights {
        aggression: BASELINE_VALUES[0],
        bloodlust: BASELINE_VALUES[1],
        obedience: BASELINE_VALUES[2],
        commitment: BASELINE_VALUES[3],
        caution: BASELINE_VALUES[4],
        spacing: BASELINE_VALUES[5],
        cohesion: BASELINE_VALUES[6],
        wall_fear: BASELINE_VALUES[7],
    };

    /// Maps `GENOME_LEN` genes in `0..=1` onto weight ranges. Values outside
    /// `0..=1` are clamped, so a mutation operator never has to care.
    pub fn from_genome(genes: &[Fx]) -> UtilityWeights {
        let gene = |i: usize| UtilityWeights::SPEC.value(i, genes);
        UtilityWeights {
            aggression: gene(0),
            bloodlust: gene(1),
            obedience: gene(2),
            commitment: gene(3),
            caution: gene(4),
            spacing: gene(5),
            cohesion: gene(6),
            wall_fear: gene(7),
        }
    }

    /// The weights themselves, in gene order. Pairs with
    /// [`UtilityWeights::labels`] for reporting.
    pub fn values(self) -> [Fx; GENOME_LEN] {
        [
            self.aggression,
            self.bloodlust,
            self.obedience,
            self.commitment,
            self.caution,
            self.spacing,
            self.cohesion,
            self.wall_fear,
        ]
    }

    pub fn to_genome(self) -> [Fx; GENOME_LEN] {
        let fields = self.values();
        let mut genes = [Fx::ZERO; GENOME_LEN];
        for (i, value) in fields.iter().enumerate() {
            genes[i] = UtilityWeights::SPEC.gene(i, *value);
        }
        genes
    }

    pub fn labels() -> [&'static str; GENOME_LEN] {
        LABELS
    }
}

impl Default for UtilityWeights {
    fn default() -> Self {
        UtilityWeights::BASELINE
    }
}

/// Weighted-score behaviour: pick a target, choose a stance, blend in a few
/// steering urges.
///
/// Holds one scrap of memory -- the previous target, per entity -- so that
/// `commitment` can mean anything. Memory is keyed by entity index rather than
/// by iteration position, so it stays deterministic.
#[derive(Clone, Debug, Default)]
pub struct UtilityPolicy {
    pub weights: UtilityWeights,
    last_target: Vec<EntityId>,
    /// Which leg of its patrol each entity is on; see [`Patrol`].
    patrol: Vec<Patrol>,
}

impl UtilityPolicy {
    pub fn new(weights: UtilityWeights) -> UtilityPolicy {
        UtilityPolicy {
            weights,
            last_target: Vec::new(),
            patrol: Vec::new(),
        }
    }

    /// The patrol leg for `me`, growing the table on demand. Keyed by entity
    /// index like every other scrap of memory here, so it stays deterministic
    /// under any iteration order.
    fn patrol_of(&mut self, me: EntityId) -> &mut Patrol {
        let index = me.index as usize;
        if index >= self.patrol.len() {
            self.patrol.resize(index + 1, Patrol::default());
        }
        &mut self.patrol[index]
    }

    pub fn baseline() -> UtilityPolicy {
        UtilityPolicy::new(UtilityWeights::BASELINE)
    }

    pub fn from_genome(genes: &[Fx]) -> UtilityPolicy {
        UtilityPolicy::new(UtilityWeights::from_genome(genes))
    }

    fn recall(&self, me: EntityId) -> EntityId {
        self.last_target
            .get(me.index as usize)
            .copied()
            .unwrap_or(EntityId::NONE)
    }

    fn remember(&mut self, me: EntityId, target: EntityId) {
        let index = me.index as usize;
        if index >= self.last_target.len() {
            self.last_target.resize(index + 1, EntityId::NONE);
        }
        self.last_target[index] = target;
    }

    /// Who to fight.
    ///
    /// **A player who clicks an enemy is not making a suggestion.** The scoring
    /// loop below is how a fighter picks its own quarry, and a named one skips it
    /// entirely rather than entering it with a thumb on the scale -- which is what
    /// the `obedience` gene used to do, and what made obeying an order a matter of
    /// degree that an evolved number got to decide.
    ///
    /// Only while the named quarry is actually in sight. Out of sight there is no
    /// contact to return, so the fighter fights whatever is in front of it while
    /// the feet carry on pursuing: `ordered_feet` is still routing to the quarry
    /// through the sim, and a hero that walked past a monster with its hands down
    /// because the thing it was told to kill is round the next corner would be
    /// obeying the letter of the order and dying of it.
    fn pick_target<'a>(&self, obs: &'a Observation) -> &'a Contact {
        if let Some(named) = obs.order.focus() {
            // `obs.enemies()` is nearest-first, so `find` is exact and canonical
            // -- there is at most one contact with a given id and no tie to break.
            if let Some(contact) = obs.enemies().iter().find(|c| c.id == named) {
                return contact;
            }
        }

        let previous = self.recall(obs.me);
        let mut best: Option<(&Contact, Fx)> = None;
        for contact in obs.enemies() {
            let closeness = Fx::ONE - (contact.distance / obs.sight_range).clamp(Fx::ZERO, Fx::ONE);
            let mut score = self.weights.aggression * closeness
                + self.weights.bloodlust * (Fx::ONE - contact.hp_frac);
            // **Dead, and left standing here on purpose.** The early return above
            // is unconditional, so a focus order never reaches this line and
            // `obedience` now has no reader anywhere in the workspace.
            //
            // The gene itself stays where it is, and that is not sentiment: the
            // genome is a positional array. `from_genome` reads slot 2 by index
            // and so do `LABELS`, `GENE_RANGES` and `BASELINE_VALUES`, so pulling
            // it out renumbers every gene after it and silently repoints every
            // stored genome in the repository at the wrong knob. A dead branch is
            // cheap; a genome that means something different than it did is not
            // recoverable by reading it.
            //
            // Giving the slot a new job is a real question and a separate one --
            // the obvious candidate is scaling how far past its ring a fighter
            // will pursue, which would make a player's order grip harder or
            // softer depending on an evolved number. That is the wrong default and
            // it is not this change's to decide.
            if obs.order.focus() == Some(contact.id) {
                score += self.weights.obedience;
            }
            if contact.id == previous {
                score += self.weights.commitment;
            }
            // Ties keep the earlier candidate, and contacts arrive nearest
            // first, so equal scores resolve to the closer enemy.
            match best {
                Some((_, existing)) if existing >= score => {}
                _ => best = Some((contact, score)),
            }
        }
        // Callers only reach this with a non-empty contact list.
        best.expect("pick_target called with no visible enemies").0
    }

    /// Walk toward open ground. Doubles as wall avoidance and as a gentle pull
    /// to the middle of the arena, which is what stops two advancing lines from
    /// sliding past each other and stalemating in opposite corners.
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

    /// How far out this policy wants to stand from `foe`, and so the radius of
    /// the ring an [`Order::Focus`] on `foe` anchors at.
    ///
    /// Lifted out of `engage`, where it was two lines of arithmetic, for the same
    /// one-reader reason [`crate::minds::ActionMind::standoff`] gives: the ring
    /// and the approach have to be the same number or a focused fighter is pulled
    /// off the spacing it just chose, once per decision, forever.
    ///
    /// `spacing` is a fraction of the fighter's *own* reach, which is what makes
    /// this a crowder or a hoverer depending on the gene -- and it is the whole
    /// difference between this policy's ring and a bow's. `BowMind` measures out
    /// from the reach it is trying to stay outside of; this measures out from the
    /// reach it is trying to fight with. Both are honest about the weapon in hand
    /// and neither is a constant.
    fn standoff(&self, obs: &Observation, foe: &Contact) -> Fx {
        // The agent knows its own reach exactly: its weapon plus both bodies.
        let reach = obs.full_reach() + foe.radius;
        reach * self.weights.spacing
    }

    /// How a live [`Order::Goto`] or [`Order::Focus`] pulls on the feet, blended
    /// against the footwork `own` that the fighter wanted anyway.
    ///
    /// `None` means two things now and no longer three: the order does not name a
    /// place, or there is no route to the place it names (`nav_step` is silent, so
    /// no objective is set, or the destination is sealed behind masonry). *Arrival*
    /// used to be the third and is gone -- an arrived character is not a special
    /// case any more but the limit of the ordinary one, where [`leash`] has relaxed
    /// the pull to nothing and handed `own` straight back. Every caller still reads
    /// `None` as "the order has nothing to say", which is exactly what it means.
    ///
    /// **This is what makes a click a command rather than a suggestion.** It is
    /// read from two places: `march`, where it always was, and `decide`, where it
    /// now bends the feet of a fighter that has an enemy in front of it. A
    /// character that discarded the player's order the moment anything walked into
    /// view had, in practice, no order channel at all -- there is always something
    /// in view in a dungeon.
    ///
    /// **The two order kinds differ only in what the anchor is.** A `Goto` names a
    /// point and the whole route is the gap; a `Focus` names a body and the gap is
    /// the route less a ring around it. Everything after that line -- the brake,
    /// the spring, the `None` -- is one law, and deliberately: a player who clicks
    /// the ground and a player who clicks a monster have made the same kind of
    /// statement about where they want the character to be.
    fn ordered_feet(&self, obs: &Observation, own: Vec2) -> Option<Vec2> {
        let ring = match obs.order {
            Order::Goto(_) => Fx::ZERO,
            Order::Focus(id) => match obs.enemies().iter().find(|c| c.id == id) {
                // In sight: the anchor is not the quarry, it is a ring around it
                // at the range this fighter wants to fight from. Inside the ring
                // the pull is zero and the fight owns the feet -- which is what
                // makes an archer kite instead of walking onto a sword, and a
                // brawler keep its spacing instead of standing on top of one.
                //
                // **Not gated on `HUNT_RANGE`.** That leash is what keeps a
                // dungeon room-by-room for a monster nobody told anything; a
                // player who clicked an enemy said follow it, and consulting an
                // eighteen-unit rule of thumb here would silently cancel the order
                // at the far end of a long room.
                Some(foe) => self.standoff(obs, foe) * FOCUS_SLACK,
                // Out of sight there is no contact to size a ring from, and none
                // is needed. Every ring the roster produces is well inside the
                // sight range that has to be crossed to reach it -- the widest is
                // a bow's, six units against the shortest sight in the game at
                // 7.8 -- so a quarry becomes a visible contact comfortably before
                // it becomes a near one, and the hand-off from pursuit to fight
                // always happens on the way in rather than at the last moment. A
                // zero here is the pursuit, undiluted.
                //
                // The one arrangement that would break that is a standoff pinned
                // to its own sight cap, since `BowMind` caps at nine tenths of
                // sight and `FOCUS_SLACK` then puts the rim outside it: a fighter
                // would let go of a quarry it could still see. Nothing in the
                // roster comes close to the cap and `an_archer_will_not_stand_off
                // _further_than_it_can_see` records how far off it is, but a new
                // row in `ACTIONS` with long enough arms is where to look if a
                // pursuit ever stops early.
                None => Fx::ZERO,
            },
            _ => return None,
        };

        // `open_ground` reaches this function now, through `own`, and this is the
        // comment that used to forbid it. The old objection was arithmetic rather
        // than taste: the bias was *added* before a `clamp_length` that only ever
        // shortens, so a short sum passed through untouched, the bias never shrank
        // as the brake did, and the two balanced at a stable fixed point
        // `wall_fear * stride` short of the target -- 0.193 units short of every
        // click at baseline, anywhere in the arena. At the top of `wall_fear`'s
        // evolvable range it was worse: magnitude 1.0 exactly cancelled the unit
        // heading and the character stopped dead mid-room.
        //
        // The bias is weighted now, not added, and that answers both halves. At
        // full stretch it enters at `LEASH_LANE` and loses to a full-strength
        // order 1.0 against 0.3, so it can no longer cancel the heading and the
        // stops-dead-mid-room case cannot arise -- the leash is strictly safer
        // here than the code this comment was written against. And near the
        // anchor, where the bias would once have won, it is not in here on its
        // own at all: `march` hands this function a zero, so a character with
        // nothing in sight has the order as the only thing steering it and
        // closes on the mark itself, with nothing left that could park it short
        // of one. The taper is quadratic and the brake shrinks with the distance
        // too, so the last fraction of a unit is a crawl -- always inward, never
        // past, and measured tick by tick in `tests/goto.rs`.
        //
        // `open_ground` reaches the leash only folded into the footwork of a
        // fighter that has a fight on -- `engage` and `disengage` both add it to
        // `command.move_dir`, which is what `decide` passes in as `own` -- and
        // where *that* character comes to rest inside the ring is the fight's
        // business, bounded by `LEASH_ROAM`. That is the hover this whole
        // mechanism exists to buy, and it is bought for the case that has a
        // fight to spend it on.
        //
        // What is still barred is `patrol_heading`, and the leash does not touch
        // the reason: the wall sweep exists to stop an advancing line grinding
        // into a wall, and against a destination near an edge it would reverse
        // the leg at the first corridor wall and walk straight past the click.
        //
        // The route, not the bearing. What used to be here rebuilt the reachable
        // box out of `wall_clearance` and clamped the click into it, which was
        // right while the level *was* a box and is worse than merely wrong now:
        // inside a corridor those four numbers describe the corridor, so every
        // destination clamps into a one-unit box around the character and the
        // arrival test is satisfied before it has taken a step.
        //
        // What that clamp existed for -- an unreachable click must terminate
        // rather than leave the character pressing into a wall forever -- is now
        // answered by the sim, which is where it belongs: the collision rule
        // already lives there, so nothing else has to keep a second opinion
        // about where a body can stand. `nav_step` reports no route, and no
        // route is a stop.
        let (to, distance) = nav_step(obs)?;

        // **What is left to cover, which is not the same as how far the anchor
        // is.** Everything below reads `gap` and nothing below reads `distance`,
        // and that is the whole of what the ring costs: the brake is a
        // stopping-distance solve, and what it has to stop at is the rim, not the
        // body at the centre. Braking against `distance` under a focus order would
        // pace an approach that arrives at rest inside the quarry -- which is to
        // say it would run through the ring at full speed and hand the fight its
        // feet back only once it was already too close to use them.
        //
        // Floored at zero because the route is longer than the straight line
        // whenever the way round is not the way through, so a fighter already
        // inside the ring can still have a route several units long. A negative
        // gap is a fighter that has arrived, and arrived is what zero means
        // everywhere else in this function.
        let gap = (distance - ring).max(Fx::ZERO);

        // A command persists until the next decision, so pace the stride by how
        // much ground gets covered before the next thought. This is the
        // intellect stat as navigation: a dim character commits to a longer
        // stride and creeps in, a sharp one lands it. The brake is load-bearing
        // rather than polish -- without it the character ping-pongs across the
        // destination forever at an amplitude of one tick of travel.
        // A decision has to survive the whole period *and* leave room to stop,
        // and the character cannot re-brake until it is allowed to think again.
        // Budgeting only the travel -- the whole rule while a body could stop
        // dead -- lands it on the mark still moving, with its next chance to
        // reconsider several ticks after it has sailed past.
        //
        // Two bounds, because the body may be going faster or slower than what
        // is about to be asked of it, and each covers the case the other misses:
        //
        //   settled: `v*P + v^2/2a <= d`  ->  a * (sqrt(P^2 + 2d/a) - P)
        //   braking: `v0*P + v^2/2a <= d` ->  sqrt(2a * (d - v0*P))
        //
        // The first assumes the request is already in force, which is wrong
        // while the body is still shedding a faster speed -- the deceleration
        // ramp covers ground the formula never counted, and that is exactly the
        // overshoot. The second charges the whole period at the speed it is
        // *actually* doing. Neither alone is safe; the tighter of the two always
        // is.
        //
        // This is the intellect stat as navigation, and more sharply than
        // before: `P` sets how far ahead a character has to plan, so a dim one
        // approaches visibly more carefully than a sharp one, and neither
        // overshoots.
        //
        // `2d/a` saturates past about 28 units at the slowest traction in the
        // range. That is a long way off, the answer there is "go flat out", and
        // the clamp below already says so.
        let period = Fx::from_int(obs.decision_period.max(1) as i32);
        let root = (period * period + gap * Fx::TWO / obs.traction).sqrt();
        let settled = obs.traction * (root - period);
        let committed = gap - obs.velocity.length() * period;
        let braking = fx::sqrt_product(obs.traction * Fx::TWO, committed);
        let safe = settled.min(braking);

        // The brake is the whole magnitude, so it scales a heading that is
        // *already* a unit vector -- `nav_step` normalised it, and normalising it
        // again is not free. `Fx` truncates component-wise, so a second pass
        // through `normalize` moves a heading that was already correct by a raw
        // unit or two; over a few hundred ticks of standing on a destination
        // that is the difference between holding still and creeping.
        //
        // The braked vector rather than the raw heading is what `leash` is handed,
        // and deliberately: the spring and this stopping-distance solve compose,
        // and the brake is what damps the spring instead of leaving it to orbit
        // the anchor. The defensive clamp that used to close this function closes
        // `leash` instead, because that is where the last multiplication now
        // happens -- a normalised vector can come back marginally over one, and
        // `decisions_never_exceed_unit_movement` should hold unconditionally.
        let brake = (safe / obs.move_speed.max(Fx::EPSILON)).min(Fx::ONE);
        Some(leash(to * brake, gap, own))
    }

    /// Nothing in sight: do what the player asked.
    fn march(&self, obs: &Observation, patrol: &mut Patrol) -> Command {
        // Nothing in sight and nothing ordered, but the level itself has
        // somewhere to be: walk the route.
        //
        // Returns rather than folding into the steering below, for the same
        // reason the `Goto` arm returns -- `patrol_heading` would reverse the
        // leg at the first corridor wall it met, and `open_ground` is a *search*
        // urge for an agent with nowhere in particular to be. A route is the
        // opposite of not knowing where to go.
        //
        // Under `Objective::Hunt` this is a creature that knows where you are,
        // and that is a decision rather than an oversight: a dungeon whose
        // monsters lose you permanently behind one wall reads as broken rather
        // than as stealthy. The honest version -- something that tracks, loses
        // the trail and gives up -- is the open question `DESIGN.md` files
        // under "Search behaviour", and this is where that answer will go.
        //
        // Dead in every scenario the lab runs: objectives default to
        // `Objective::None`, so `nav_step` is silent unless somebody asked.
        if matches!(obs.order, Order::Hold) {
            if let Some((to, along)) = nav_step(obs) {
                if along <= HUNT_RANGE {
                    return Command::moving(to.clamp_length(Fx::ONE));
                }
            }
        }

        let heading = match obs.order {
            Order::Advance(dir) => dir.normalize(),
            Order::Regroup => self.ally_centre(obs).normalize(),

            // **Both of these name a place, so both of them route to it.**
            //
            // A `Focus` used to fall in with `Hold` below as "no heading", which
            // is where the pursuit quietly stopped: nothing is in sight on this
            // path, so a hero whose quarry had just gone round a corner dropped
            // through to the patrol sweep and wandered the room it was standing
            // in. Following something out of sight is the whole of what a lock is
            // for -- a quarry that can break the order by stepping behind masonry
            // is not locked on to.
            //
            // The `ring` is `Fx::ZERO` on this path by construction rather than
            // by a special case: `march` runs only with `obs.enemies()` empty, so
            // the quarry is never a visible contact here and `ordered_feet` finds
            // nothing to size a ring from. The pursuit is undiluted right up to
            // the moment the thing comes into view, which is the moment the ring
            // exists to start mattering.
            Order::Goto(_) | Order::Focus(_) => {
                // Arriving somewhere is not a variation on marching, and both of
                // the steering behaviours below are wrong for it -- which is why
                // this arm returns before reaching either of them. They are wrong
                // for different reasons and it is worth keeping the two apart.
                // `patrol_heading` would reverse the leg at the first corridor
                // wall and walk straight past the click; the comment block that
                // used to be here, now on `ordered_feet`, carries that argument.
                // `open_ground` is the one this comment is about.
                //
                // The leash is handed a zero, and the zero is the answer rather
                // than a hole in it. Nothing is in sight on this path -- that is
                // what `march` *is* -- so there is no footwork to blend, and,
                // more to the point, nothing to hover *for*. The hover exists so
                // that a fighter with a fight on can circle and keep station
                // inside the ring instead of standing on its mark taking hits,
                // and that fighter never arrives here: it comes through `decide`,
                // which hands `ordered_feet` the feet `engage` or `disengage`
                // already decided on. A character alone in a room has no such
                // footwork, and manufacturing a shuffle for the look of the thing
                // is a different problem with a worse answer.
                //
                // The answer tried and rejected was an idle drift: `open_ground`
                // at half strength, blended in here exactly as combat footwork is
                // blended in there. It does not shift the weight, it *leans*.
                // `open_ground` is a constant directional bias for the geometry
                // the character happens to be standing in -- it does not shrink
                // as the anchor is approached and it does not reverse past it, so
                // it simply balances the spring at a fixed offset, measured at
                // 0.50 units short of every click at baseline and always on the
                // open-ground side of it. **No strength of it parks the character
                // on the mark**, because a bias that does not vanish at the anchor
                // cannot; halving it only chooses which fraction of `LEASH_ROAM`
                // it stops at. Half a unit is comfortably inside the ring and
                // still visibly not where the player pointed, and the arrival
                // tolerances on the far side of the wasm boundary -- a fifth of a
                // unit for a click, three tenths for a route leg -- are what said
                // so out loud.
                return match self.ordered_feet(obs, Vec2::ZERO) {
                    Some(dir) => Command::moving(dir),
                    None => Command::HOLD,
                };
            }

            Order::Hold => Vec2::ZERO,
        };

        // Once the ordered direction runs out of arena, turn and come back
        // rather than grinding into the wall. This is the difference between a
        // fight and a timeout: without it, the last survivors of each side push
        // to opposite edges, stand there, and the run ends in a draw -- which is
        // both bad to watch and useless as a fitness signal.
        let heading = patrol_heading(obs, heading, patrol);

        Command::moving((heading + self.open_ground(obs)).clamp_length(Fx::ONE))
    }

    fn disengage(&self, obs: &Observation) -> Command {
        let away = match obs.nearest_enemy() {
            Some(threat) => -threat.offset.normalize(),
            None => Vec2::ZERO,
        };
        Command {
            move_dir: (away + self.cohesion(obs) + self.open_ground(obs)).clamp_length(Fx::ONE),
            intent: Intent::Flee,
            // Overwritten by `limb` before this leaves `decide`.
            ..Command::HOLD
        }
    }

    /// Where to put the limb, given everything else is already decided.
    ///
    /// Called last and applied over the top of whatever the movement logic
    /// produced, so adding swordplay to this policy did not move a single
    /// footstep -- `march_behaviour_is_byte_identical` is the proof, and it is
    /// worth keeping that way. It survived the collapse to one limb for exactly
    /// the same reason, and re-running it is the cheapest evidence that this
    /// refactor did not disturb navigation.
    ///
    /// **This is the naive swordsman, and it is meant to be beaten.** It attacks
    /// whenever it is able to, at whatever is nearest, from whichever side is
    /// nearest, and otherwise holds its guard at the enemy. Every one of those
    /// is a mistake a better fighter gets to punish:
    ///
    /// * It never chooses *not* to attack, so it spends its life in windups and
    ///   recoveries and can be hit at leisure by anyone who waits for one.
    /// * It cuts from the nearest side rather than the open one, so its blows
    ///   arrive wherever the geometry happens to put them.
    /// * It guards at the swordsman rather than at the blow, and a cut arriving
    ///   at an angle lands well round the body from where its wielder stands.
    /// * **It never changes what is in its hand.** It fights a whole battle with
    ///   its primary, so a Fighter holding one of these never raises its shield
    ///   and a fighter handed a shield as its primary never attacks at all.
    ///   Choosing an action is the whole of the new skill, and declining to make
    ///   that choice is what keeps this the baseline.
    fn limb(&self, obs: &Observation, command: &mut Command) {
        let threat = match obs.nearest_enemy() {
            Some(c) => c,
            None => return, // nothing about: the limb stays tucked
        };
        let bearing = threat.offset.angle();
        command.limb = if obs.role().can_attack() {
            swing::press(obs, bearing, sim::Strike::Nearest)
        } else {
            // Holding something that cannot cut: point it at the enemy and brace
            // it. For a guard that is the correct and only play; for anything
            // else it is harmless.
            sim::LimbCommand::new(bearing, Fx::ONE)
        };
    }

    fn engage(&self, obs: &Observation) -> Command {
        let target = self.pick_target(obs);
        // Asked of `standoff` rather than worked out again here: the ring a focus
        // order relaxes at and the distance this approach is steering to are the
        // same statement about where this fighter wants to be, and two copies of
        // it would be two chances to disagree.
        let ideal = self.standoff(obs, target);
        let toward = target.offset.normalize();

        let approach = if target.distance > ideal {
            toward
        } else if target.distance < ideal * Fx::from_ratio(7, 10) {
            -toward
        } else {
            Vec2::ZERO
        };

        Command {
            move_dir: (approach + self.cohesion(obs) + self.open_ground(obs)).clamp_length(Fx::ONE),
            intent: Intent::Attack(target.id),
            ..Command::HOLD
        }
    }
}

impl Policy for UtilityPolicy {
    fn decide(&mut self, obs: &Observation) -> Command {
        let mut command = if obs.enemies().is_empty() {
            let mut patrol = *self.patrol_of(obs.me);
            let command = self.march(obs, &mut patrol);
            *self.patrol_of(obs.me) = patrol;
            command
        } else if obs.hp_frac < self.weights.caution {
            self.disengage(obs)
        } else {
            self.engage(obs)
        };
        // **The player's order bends the footwork, and that is the whole of the
        // input channel meaning anything.** Every branch above owns the feet
        // unconditionally, so a character with an enemy in view discarded a `Goto`
        // entirely -- and in a dungeon there is always an enemy in view.
        //
        // A blend rather than an override, because an order names a place to be
        // *near*. Far from it the order wins outright and the character walks;
        // at the anchor the fight gets its feet back, instead of a fighter pinned
        // to the mark by a hair-thin deadband that any shove re-arms. `leash`
        // carries the whole of that argument.
        //
        // Only the feet. The intent, the target memory and `limb` below are
        // untouched, so this is a fighter walking where it was told while it goes
        // on fighting, and not a fighter that stopped fighting.
        //
        // **This includes the `disengage` branch above**, deliberately: a player
        // who clicks while the character is hurt is answering the same question
        // `caution` was going to answer, and the player wins. Somebody looking for
        // why a wounded fighter did not bolt will look at `disengage`, so this is
        // the line that has to tell them.
        //
        // Inert everywhere but the browser: it needs an `Order::Goto` or an
        // `Order::Focus`, neither of which any lab scenario issues (`runner.rs`
        // orders `Advance`), and `nav_step` is additionally silent unless an
        // `Objective` is set, which defaults to `None`. `LAB_HASH` not moving is
        // the proof. If a lab scenario ever starts issuing either of them, that
        // proof lapses with it.
        if let Some(dir) = self.ordered_feet(obs, command.move_dir) {
            command.move_dir = dir;
        }
        self.limb(obs, &mut command);
        if let Intent::Attack(target) = command.intent {
            self.remember(obs.me, target);
        }
        command
    }

    fn reset(&mut self) {
        self.last_target.clear();
        self.patrol.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{Faction, Scenario, Stats, World};

    fn contact(index: u32, x: i32, y: i32, hp: Fx) -> Contact {
        Contact {
            id: EntityId::new(index, 0),
            offset: Vec2::from_ints(x, y),
            distance: Vec2::from_ints(x, y).length(),
            hp_frac: hp,
            radius: Fx::from_ratio(4, 10),
            action_length: Fx::from_ratio(9, 10),
            min_strike_range: Fx::from_ratio(5, 10),
            // An even trade, since nothing in `UtilityPolicy` reads these and a
            // lopsided fixture would only invite someone to assert on it.
            threat: Fx::from_ratio(25, 100),
            frailty: Fx::from_ratio(25, 100),
            knockback_taken: Fx::from_ratio(4, 10),
            knockback_dealt: Fx::from_ratio(4, 10),
            heft: Fx::ONE,
            velocity: Vec2::ZERO,
            facing: fx::Angle::ZERO,
            limb_angle: fx::Angle::ZERO,
            limb_reach: Fx::ZERO,
            limb_spin: Fx::ZERO,
            limb_swing: sim::Swing::Guard,
            limb_left: Fx::ZERO,
            limb_line: fx::Angle::ZERO,
            action: sim::ActionKind::Sword,
            action_arc: 0,

        }
    }

    /// An agent standing in the middle of a 40x28 arena.
    fn situation(enemies: &[Contact]) -> Observation {
        let mut obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::from_ints(20, 14),
            Order::Hold,
        );
        obs.hp_frac = Fx::ONE;
        obs.attack_ready = Fx::ONE;
        obs.radius = Fx::from_ratio(45, 100);
        obs.action_length = Fx::from_ratio(9, 10);
        obs.sight_range = Fx::from_int(10);
        obs.move_speed = Fx::from_ratio(5, 100);
        // A Fighter's reaction speed. Set explicitly because `blank` defaults
        // it to 1, and a fixture left on that default would quietly test a
        // character that re-plans every tick -- which is not the character any
        // of these numbers were chosen for. Stride is 12 x 0.05 = 0.6 units.
        obs.decision_period = 12;
        obs.wall_clearance = [
            Fx::from_int(20),
            Fx::from_int(20),
            Fx::from_int(14),
            Fx::from_int(14),
        ];
        obs.set_enemies(enemies);
        obs
    }

    #[test]
    fn genome_round_trips() {
        let genes = UtilityWeights::BASELINE.to_genome();
        let restored = UtilityWeights::from_genome(&genes);
        // Range mapping is lossy at the last bit or two; each weight should
        // land within a thousandth of where it started.
        for (a, b) in [
            (restored.aggression, UtilityWeights::BASELINE.aggression),
            (restored.bloodlust, UtilityWeights::BASELINE.bloodlust),
            (restored.obedience, UtilityWeights::BASELINE.obedience),
            (restored.commitment, UtilityWeights::BASELINE.commitment),
            (restored.caution, UtilityWeights::BASELINE.caution),
            (restored.spacing, UtilityWeights::BASELINE.spacing),
            (restored.cohesion, UtilityWeights::BASELINE.cohesion),
            (restored.wall_fear, UtilityWeights::BASELINE.wall_fear),
        ] {
            assert!((a - b).abs() < Fx::from_ratio(1, 1000), "{a} vs {b}");
        }
    }

    #[test]
    fn genes_outside_the_unit_interval_are_clamped() {
        let wild = [Fx::from_int(-5); GENOME_LEN];
        let w = UtilityWeights::from_genome(&wild);
        assert_eq!(w.aggression, Fx::ZERO);
        assert_eq!(w.spacing, Fx::from_ratio(3, 10));
        let wild = [Fx::from_int(9); GENOME_LEN];
        let w = UtilityWeights::from_genome(&wild);
        assert_eq!(w.aggression, Fx::from_int(2));
        assert_eq!(w.spacing, Fx::ONE);
    }

    #[test]
    fn a_short_genome_is_tolerated() {
        let w = UtilityWeights::from_genome(&[Fx::ZERO]);
        assert_eq!(w.aggression, Fx::ZERO);
        // Missing genes default to the middle of their range.
        assert_eq!(w.bloodlust, Fx::ONE);
    }

    #[test]
    fn aggression_picks_the_near_enemy_and_bloodlust_picks_the_wounded_one() {
        let near_healthy = contact(1, 2, 0, Fx::ONE);
        let far_wounded = contact(2, 8, 0, Fx::from_ratio(1, 10));
        let obs = situation(&[near_healthy, far_wounded]);

        let mut brawler = UtilityPolicy::new(UtilityWeights {
            aggression: Fx::from_int(2),
            bloodlust: Fx::ZERO,
            commitment: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        assert_eq!(
            brawler.decide(&obs).intent,
            Intent::Attack(near_healthy.id),
            "an aggressive agent should take what is in front of it"
        );

        let mut vulture = UtilityPolicy::new(UtilityWeights {
            aggression: Fx::ZERO,
            bloodlust: Fx::from_int(2),
            commitment: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        assert_eq!(
            vulture.decide(&obs).intent,
            Intent::Attack(far_wounded.id),
            "a bloodthirsty agent should chase the kill"
        );
    }

    /// **A named quarry is fought, and no gene gets a vote.**
    ///
    /// This test used to be called `an_obedient_agent_follows_a_focus_order_
    /// against_its_own_judgement`, and its claim was that `obedience` at the top
    /// of its range outweighed the scoring -- with the corollary, asserted on the
    /// last line, that an agent with the gene at zero went on fighting whatever
    /// it liked. Both halves are gone, and the corollary is what they were gone
    /// *for*: a player who clicks an enemy has not cast a vote in the scoring
    /// loop, and an order whose grip depended on an evolved number was an order
    /// only in the cases where evolution happened to agree.
    ///
    /// The two agents here are the extremes of that gene, and the point is that
    /// they are now indistinguishable under an order. What still separates them is
    /// what the gene was always really for, which is judgement in the absence of
    /// one -- so the wilful agent is asked both questions and gives two different
    /// answers, which is what makes this a test of the lock rather than of a
    /// policy that stopped reading its observation.
    #[test]
    fn a_named_quarry_is_fought_whatever_the_agent_thinks_of_it() {
        let near = contact(1, 2, 0, Fx::ONE);
        let far = contact(2, 9, 0, Fx::ONE);
        let mut obs = situation(&[near, far]);

        let mut wilful = UtilityPolicy::new(UtilityWeights {
            obedience: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        // Left to itself it takes what is in front of it: `aggression` scores
        // closeness and the far one is seven units further off.
        assert_eq!(wilful.decide(&obs).intent, Intent::Attack(near.id));

        obs.order = Order::Focus(far.id);
        let mut obedient = UtilityPolicy::new(UtilityWeights {
            obedience: Fx::from_int(3),
            ..UtilityWeights::BASELINE
        });
        assert_eq!(
            obedient.decide(&obs).intent,
            Intent::Attack(far.id),
            "the player's order was ignored"
        );
        assert_eq!(
            wilful.decide(&obs).intent,
            Intent::Attack(far.id),
            "the order held only for an agent that happened to be born obedient"
        );

        // And the lock is on the *named* enemy rather than on having been given
        // an order at all: point it at somebody who is not in sight and the
        // scoring gets its job back, which is what stops a hero standing there
        // with its hands down while the thing it was told to kill is elsewhere.
        obs.order = Order::Focus(EntityId::new(77, 0));
        assert_eq!(wilful.decide(&obs).intent, Intent::Attack(near.id));
    }

    #[test]
    fn commitment_stops_an_agent_dithering_between_equal_targets() {
        let left = contact(1, -3, 0, Fx::ONE);
        let right = contact(2, 3, 0, Fx::ONE);
        // Equidistant, equally healthy: only memory can break the tie.
        let obs = situation(&[left, right]);

        let mut steady = UtilityPolicy::new(UtilityWeights {
            commitment: Fx::from_ratio(9, 10),
            ..UtilityWeights::BASELINE
        });
        let first = steady.decide(&obs).intent;
        for _ in 0..10 {
            assert_eq!(steady.decide(&obs).intent, first, "the agent dithered");
        }

        // Reset clears the memory but the tie still resolves the same way,
        // because ties fall to the nearer (earlier) contact.
        steady.reset();
        assert_eq!(steady.decide(&obs).intent, first);
    }

    #[test]
    fn a_cautious_agent_disengages_when_hurt_and_a_reckless_one_does_not() {
        let enemy = contact(1, 2, 0, Fx::ONE);
        let mut obs = situation(&[enemy]);
        obs.hp_frac = Fx::from_ratio(1, 10);

        let mut cautious = UtilityPolicy::new(UtilityWeights {
            caution: Fx::from_ratio(5, 10),
            ..UtilityWeights::BASELINE
        });
        let fleeing = cautious.decide(&obs);
        assert_eq!(fleeing.intent, Intent::Flee);
        assert!(
            fleeing.move_dir.x < Fx::ZERO,
            "fled toward the enemy: {:?}",
            fleeing.move_dir
        );

        let mut reckless = UtilityPolicy::new(UtilityWeights {
            caution: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        assert_eq!(reckless.decide(&obs).intent, Intent::Attack(enemy.id));
    }

    #[test]
    fn an_agent_closes_when_out_of_reach_and_stops_closing_once_inside_it() {
        let mut policy = UtilityPolicy::baseline();

        let distant = contact(1, 6, 0, Fx::ONE);
        let closing = policy.decide(&situation(&[distant])).move_dir;
        assert!(closing.x > Fx::ZERO, "did not advance: {closing:?}");

        // Reach is radius 0.45 + 0.4 + range 0.9 = 1.75, so at 1.0 away this
        // agent is already inside its swing and has no reason to keep walking
        // into the target.
        let adjacent = contact(1, 1, 0, Fx::ONE);
        let holding = policy.decide(&situation(&[adjacent])).move_dir;
        assert!(
            holding.x <= Fx::ZERO,
            "kept crowding a target already in reach: {holding:?}"
        );
    }

    #[test]
    fn nothing_in_sight_means_following_the_standing_order() {
        let mut policy = UtilityPolicy::baseline();

        let mut obs = situation(&[]);
        obs.order = Order::Hold;
        let held = policy.decide(&obs);
        assert_eq!(held.intent, Intent::Hold);
        assert!(
            held.move_dir.length() < Fx::from_ratio(1, 100),
            "hold moved"
        );

        obs.order = Order::Advance(Vec2::X);
        let advancing = policy.decide(&obs);
        assert_eq!(advancing.intent, Intent::Hold);
        assert!(advancing.move_dir.x > Fx::from_ratio(5, 10));
    }

    #[test]
    fn wall_fear_steers_away_from_a_corner() {
        let mut obs = situation(&[]);
        obs.order = Order::Hold;
        // Jammed into the bottom-left corner.
        obs.wall_clearance = [
            Fx::from_ratio(5, 10),
            Fx::from_int(39),
            Fx::from_ratio(5, 10),
            Fx::from_int(27),
        ];
        let mut policy = UtilityPolicy::new(UtilityWeights {
            wall_fear: Fx::ONE,
            ..UtilityWeights::BASELINE
        });
        let escape = policy.decide(&obs).move_dir;
        assert!(
            escape.x > Fx::ZERO && escape.y > Fx::ZERO,
            "did not leave the corner: {escape:?}"
        );
    }

    /// A `Goto` order for a point `offset` away from where the agent stands,
    /// with the route the sim would have computed across open ground.
    ///
    /// The route has to be stated because the policy no longer derives one. It
    /// reads `nav_dir`/`nav_distance`, which the sim fills from the floor plan,
    /// and an observation that leaves them blank is saying "there is no way
    /// there" -- which the policy correctly answers by standing still. On open
    /// ground the sim's answer is exactly the straight line, so that is what
    /// these fixtures state.
    fn heading_for(offset: Vec2) -> Observation {
        let mut obs = situation(&[]);
        obs.order = Order::Goto(obs.position + offset);
        obs.nav_dir = offset.normalize();
        obs.nav_distance = offset.length();
        obs
    }

    #[test]
    fn goto_brakes_instead_of_overshooting() {
        // Half a stride out. A command persists for `decision_period` ticks, so
        // the quantity that must not exceed the remaining distance is the whole
        // committed walk, not one tick of it.
        let target = Fx::from_ratio(3, 10);
        let obs = heading_for(Vec2::new(target, Fx::ZERO));
        let moved = UtilityPolicy::baseline().decide(&obs).move_dir;

        let committed = moved.length() * obs.move_speed * (obs.decision_period as i32);
        assert!(
            committed <= target + Fx::from_ratio(1, 1000),
            "committed to walking {committed} to cover {target}"
        );
        assert!(committed.is_positive(), "braked to a standstill: {moved:?}");
    }

    #[test]
    fn goto_at_the_click_itself_stands_perfectly_still() {
        // A click on the spot the character is already standing on gives the sim
        // nothing to route to, so this arrives via `nav_step` reporting no route
        // rather than via any arrival rule of the policy's own -- there is no
        // longer an arrival rule to arrive by. The leash tapers to nothing at the
        // anchor, but "nothing" is a very short vector rather than no vector, and
        // the sim still turns a character to face a step that moves it nowhere.
        // Exactly `Command::HOLD` is what keeps a hero standing on its own marker
        // from spinning on the spot.
        let obs = heading_for(Vec2::ZERO);
        let command = UtilityPolicy::baseline().decide(&obs);
        assert_eq!(command.move_dir, Vec2::ZERO, "fidgeted on arrival");
        assert_eq!(command.intent, Intent::Hold);
    }

    #[test]
    fn goto_runs_flat_out_when_far() {
        let obs = heading_for(Vec2::from_ints(10, 0));
        let moved = UtilityPolicy::baseline().decide(&obs).move_dir;
        assert!(
            (moved.length() - Fx::ONE).abs() < Fx::from_ratio(1, 1000),
            "dawdled sixteen strides from the target: {moved:?}"
        );
    }

    #[test]
    fn goto_holds_when_there_is_no_way_there() {
        // What the reachable-box reconstruction used to buy, now bought by the
        // sim: a destination that cannot be reached has to *terminate*, not
        // leave the character pressing into a wall forever waiting on an
        // arrival test it can never satisfy. The sim says so by reporting no
        // route, and this is the policy honouring it.
        let mut obs = situation(&[]);
        obs.order = Order::Goto(Vec2::from_ints(10, 14));
        obs.nav_dir = Vec2::ZERO;
        obs.nav_distance = Fx::MAX;

        let command = UtilityPolicy::baseline().decide(&obs);
        assert_eq!(command.move_dir, Vec2::ZERO, "walked at an unreachable click");
        assert_eq!(command.intent, Intent::Hold);
    }

    #[test]
    fn goto_follows_the_route_and_not_the_bearing() {
        // The route and the straight line disagree, which is the whole reason
        // the percept exists: the destination is due east and the way round is
        // south. A policy still reading the bearing would walk into the wall.
        let mut obs = situation(&[]);
        obs.order = Order::Goto(obs.position + Vec2::from_ints(6, 0));
        obs.nav_dir = Vec2::Y;
        obs.nav_distance = Fx::from_int(12);

        let moved = UtilityPolicy::baseline().decide(&obs).move_dir;
        assert!(moved.y.is_positive(), "took the bearing, not the route: {moved:?}");
        assert_eq!(moved.x, Fx::ZERO);
    }

    #[test]
    fn goto_ignores_the_wall_sweep() {
        // The agent stands 0.5 from the left wall -- close enough that an
        // `Advance` in that direction sweeps along the wall instead of grinding
        // into it. Half of this test used to check that a `Goto` past the same
        // wall did not sweep; that clamp now lives in the sim, and what it
        // bought is asserted by `goto_holds_when_there_is_no_way_there`. What
        // remains is the `Advance` behaviour, which is unchanged.
        let near_wall = [
            Fx::from_ratio(5, 10),
            Fx::from_int(39),
            Fx::from_int(14),
            Fx::from_int(14),
        ];

        let mut obs = situation(&[]);
        obs.wall_clearance = near_wall;

        // An `Advance` that has run out of arena turns the patrol
        // round and comes back, with a lateral step so the return leg sweeps
        // new ground instead of retracing the outbound line.
        obs.order = Order::Advance(-Vec2::X);
        let turning = UtilityPolicy::baseline().decide(&obs).move_dir;
        assert!(
            turning.x > Fx::ZERO,
            "an advance into the wall kept pushing into it: {turning:?}"
        );
        assert!(
            turning.y.abs() > Fx::ZERO,
            "the turn took no lateral step, so the return leg retraces: {turning:?}"
        );
        assert!(
            turning.x.abs() > turning.y.abs(),
            "the turn was more sideways than backwards: {turning:?}"
        );
    }

    /// **A click is a command, not a suggestion**, and these four are the whole
    /// of the order channel. Before `ordered_feet` reached `decide`, every one of
    /// them would have answered with the fight's footwork: `march` is the only
    /// reader of `Order::Goto` and `march` is only reached with nothing in sight,
    /// so in a dungeon -- where there is always something in sight -- the player
    /// had no order channel at all.
    ///
    /// All five route *north* while the enemy stands *east*, which is what makes
    /// the two answers distinguishable component by component: from dead centre
    /// `engage` and `disengage` both move along x alone, and the route moves
    /// along y alone. They reuse `heading_for`, so what is being tested is the
    /// same observation the `goto_*` fixtures above drive, plus a contact.
    ///
    /// The route's component is no longer the *only* one, and it is not meant to
    /// be. At full stretch the leash keeps `LEASH_LANE` of the fighter's own
    /// footwork, which is the room to sidestep a blade that the spring exists to
    /// buy. So what these assert is the proportion rather than a zero: the route
    /// wins better than three to one, and the fight is still visibly in there.
    #[test]
    fn a_click_moves_the_feet_with_an_enemy_in_sight() {
        let enemy = contact(1, 2, 0, Fx::ONE);
        let mut obs = heading_for(Vec2::from_ints(0, 10));
        obs.set_enemies(&[enemy]);

        let command = UtilityPolicy::baseline().decide(&obs);
        assert!(
            command.move_dir.x.is_positive() && command.move_dir.x <= LEASH_LANE,
            "the fight should keep `LEASH_LANE` of the feet and no more: {:?}",
            command.move_dir
        );
        assert!(
            command.move_dir.y > Fx::from_ratio(9, 10),
            "did not walk the route: {:?}",
            command.move_dir
        );
        // **Only the feet.** `Intent` is a statement about what is being fought
        // rather than a request to hit anything, so the HUD, the fitness function
        // and target memory all still see a fighter in a fight.
        assert_eq!(command.intent, Intent::Attack(enemy.id));
    }

    #[test]
    fn an_order_with_no_objective_leaves_the_fight_alone() {
        let enemy = contact(1, 2, 0, Fx::ONE);
        let mut ordered = heading_for(Vec2::from_ints(0, 10));
        // **The lab's case, and the regression test for the hash contract.** An
        // `Order::Goto` with no objective set behind it has no route, and a
        // policy that acted on the order rather than on the route would move
        // every recorded run and every pinned hash in the repository. `LAB_HASH`
        // and `GOLDEN_STATE_HASH` make the same claim three crates away; this
        // makes it where it can fail at the line that broke.
        ordered.nav_dir = Vec2::ZERO;
        ordered.nav_distance = Fx::MAX;
        ordered.set_enemies(&[enemy]);

        assert_eq!(
            UtilityPolicy::baseline().decide(&ordered).move_dir,
            UtilityPolicy::baseline().decide(&situation(&[enemy])).move_dir,
            "an order with nowhere to go moved the feet anyway"
        );
    }

    #[test]
    fn an_arrived_order_hands_the_feet_back() {
        let enemy = contact(1, 2, 0, Fx::ONE);
        let mut arrived = heading_for(Vec2::from_ints(0, 10));
        // A fifth of the way into the ring. There is no bound to sit on any more
        // -- `LEASH_ROAM` is where the pull starts letting go and zero is where
        // it has let go entirely -- and a fifth of the way in the order is down
        // to a twenty-fifth of its strength, because the taper is quadratic
        // precisely so the interior is this soft. The heading is still there, so
        // this is the leash relaxing and not `nav_step` reporting no route.
        arrived.nav_distance = LEASH_ROAM * Fx::from_ratio(1, 5);
        arrived.set_enemies(&[enemy]);

        let moved = UtilityPolicy::baseline().decide(&arrived).move_dir;
        let fighting = UtilityPolicy::baseline().decide(&situation(&[enemy])).move_dir;
        // Not byte-identical any more, and that is the change rather than a
        // tolerance being waved through: the order has not switched off, it has
        // relaxed. What has to hold is whose answer this is, and the two axes
        // separate it -- nearly all of the fight's east, a twentieth of the
        // route's north.
        assert!(
            (moved.x - fighting.x).abs() < Fx::from_ratio(5, 100),
            "the fight did not get its feet back: {moved:?} against {fighting:?}"
        );
        assert!(
            moved.y < moved.x * Fx::from_ratio(1, 10),
            "still walking the route instead of fighting: {moved:?}"
        );
        // ...and the answer it went back to is the fight's, which is east.
        assert!(moved.x > Fx::ZERO, "handed the feet back and then froze: {moved:?}");
    }

    /// A `Focus` on `enemy`, with the route the sim would have computed for it
    /// across open ground -- straight at the body, since that is what
    /// `nav_goal_point` resolves a quarry to.
    ///
    /// Shaped like `heading_for` and stated for the same reason: an observation
    /// with `nav_dir` left blank is the sim saying there is no way there.
    fn locked_on(enemy: &Contact) -> Observation {
        let mut obs = situation(&[*enemy]);
        obs.order = Order::Focus(enemy.id);
        obs.nav_dir = enemy.offset.normalize();
        obs.nav_distance = enemy.distance;
        obs
    }

    /// **The brake stops at the ring, not at the body.**
    ///
    /// The stopping-distance solve is the same one a `Goto` runs, and under a
    /// focus order every distance it reads has to be the gap to the *rim*. Braking
    /// against the route's full length instead would pace an approach that comes
    /// to rest on the quarry -- which is to say it would cross the ring at full
    /// speed and hand the fight its feet back only once it was already too close
    /// to use them.
    ///
    /// Asked of `ordered_feet` directly and handed a zero for its own footwork,
    /// because the point is the pull in isolation: at a third of a unit outside
    /// the rim the leash has already relaxed to a twentieth of its strength, so a
    /// blend against real footwork would be measuring `engage` and not the brake.
    ///
    /// The stride here is 0.6 units and the gap is 0.3, so a policy reading the
    /// route's whole 2.5 would commit to more than eight times what is left.
    #[test]
    fn the_focus_brake_solves_for_the_ring_and_not_for_the_body() {
        let policy = UtilityPolicy::baseline();
        let probe = contact(1, 4, 0, Fx::ONE);
        // Reach is radius 0.45 + range 0.9 + their radius 0.4 = 1.75, and
        // `spacing` is 0.85 of it. The ring is that again by half.
        let ring = policy.standoff(&situation(&[probe]), &probe) * FOCUS_SLACK;
        let slack = Fx::from_ratio(3, 10);

        let mut obs = locked_on(&probe);
        obs.nav_distance = ring + slack;
        let dir = policy
            .ordered_feet(&obs, Vec2::ZERO)
            .expect("a focus with a route has something to say");

        let committed = dir.length() * obs.move_speed * (obs.decision_period as i32);
        println!("ring {ring}, gap {slack}, committed {committed}");
        assert!(
            committed <= slack + Fx::from_ratio(1, 1000),
            "committed to walking {committed} to cover the last {slack} to the ring"
        );
    }

    /// At the rim the pull is exactly nothing, and inside it the fight has the
    /// feet byte for byte.
    ///
    /// The gap is floored at zero and the taper is quadratic in it, so this is not
    /// a tolerance being waved through -- it is the shape of the arithmetic. Worth
    /// pinning as an equality rather than a bound: a residual pull of a few
    /// hundredths, always inward, is exactly the sort of thing that would survive
    /// a loose assertion for a long time and then turn up as a fighter that
    /// crowds.
    #[test]
    fn a_quarry_inside_the_ring_leaves_the_footwork_untouched() {
        let policy = UtilityPolicy::baseline();
        let enemy = contact(1, 2, 0, Fx::ONE);
        let ring = policy.standoff(&situation(&[enemy]), &enemy) * FOCUS_SLACK;
        assert!(
            enemy.distance < ring,
            "the fixture put the enemy outside the ring, so it tests nothing"
        );

        let free = UtilityPolicy::baseline().decide(&situation(&[enemy])).move_dir;
        let ordered = UtilityPolicy::baseline().decide(&locked_on(&enemy)).move_dir;
        assert_eq!(
            (ordered.x.raw(), ordered.y.raw()),
            (free.x.raw(), free.y.raw()),
            "the order went on pulling from inside its own ring"
        );
    }

    /// Far off, a focus order is a walk, and the same walk a click on the ground
    /// would have been.
    ///
    /// Nine units out is well past `ring + LEASH_ROAM`, so the pull is saturated
    /// and only `LEASH_LANE` of the fight survives -- which is the same three-to-one
    /// `a_click_moves_the_feet_with_an_enemy_in_sight` states for a `Goto`. One law
    /// for both order kinds is the point; they differ in where the anchor is and in
    /// nothing else.
    #[test]
    fn a_quarry_beyond_the_ring_is_walked_at() {
        let enemy = contact(1, 9, 0, Fx::ONE);
        let command = UtilityPolicy::baseline().decide(&locked_on(&enemy));
        assert!(
            command.move_dir.x > Fx::from_ratio(9, 10),
            "did not set off after the quarry: {:?}",
            command.move_dir
        );
        assert_eq!(command.intent, Intent::Attack(enemy.id));
    }

    /// **Pursuit is not gated by `HUNT_RANGE`.**
    ///
    /// That eighteen-unit leash is what keeps a dungeon room-by-room for a monster
    /// nobody has told anything, and `march` consults it for exactly that case --
    /// an `Order::Hold` with an objective behind it. A player who clicked an enemy
    /// said follow it, and a rule of thumb about how far a wandering monster should
    /// care is not entitled to cancel that at the far end of a long floor.
    ///
    /// Twice the leash, and with nothing in sight, which is the state a hero is in
    /// midway through a chase across a generated level.
    #[test]
    fn a_focus_is_followed_past_the_range_a_monster_would_give_up_at() {
        let mut obs = situation(&[]);
        obs.order = Order::Focus(EntityId::new(77, 0));
        obs.nav_dir = Vec2::Y;
        obs.nav_distance = HUNT_RANGE * Fx::TWO;

        let moved = UtilityPolicy::baseline().decide(&obs).move_dir;
        assert!(
            moved.y > Fx::from_ratio(9, 10),
            "gave up on a quarry {} away: {moved:?}",
            obs.nav_distance
        );

        // The control, and the reason the two cannot be collapsed: a standing
        // order with the same route is still bounded, because nobody asked for
        // that one.
        obs.order = Order::Hold;
        assert_eq!(
            UtilityPolicy::baseline().decide(&obs),
            Command::HOLD,
            "a wandering monster followed a route past `HUNT_RANGE`"
        );
    }

    /// **The bug this session exists to fix, stated as a test.**
    ///
    /// A character that had arrived and was then shoved -- by knockback, by
    /// `World::separate`'s body shove, by a wall slide -- found its order live
    /// again, because the old deadband was one tick of travel and any
    /// displacement at all cleared it. It then walked back onto the mark with its
    /// own footwork switched off the whole way, which in a fight means standing
    /// still and being hit. No arrangement of the old code passes this.
    #[test]
    fn a_shove_off_the_mark_does_not_walk_the_fighter_back() {
        // Knocked a third of a unit east: off the mark, and *toward* the enemy it
        // is fighting, so the route home points due west and is directly against
        // the footwork the fight wants. The two answers are opposed rather than
        // perpendicular, which is what makes this decidable.
        let enemy = contact(1, 2, 0, Fx::ONE);
        let shove = Fx::from_ratio(33, 100);
        let mut shoved = situation(&[enemy]);
        shoved.order = Order::Goto(shoved.position - Vec2::new(shove, Fx::ZERO));
        shoved.nav_dir = -Vec2::X;
        shoved.nav_distance = shove;

        let moved = UtilityPolicy::baseline().decide(&shoved).move_dir;
        // Six times the old deadband, so the old rule made this a full-strength
        // override and the answer was due west. Under the leash it is a
        // twenty-second of the pull and the fight keeps the feet.
        assert!(
            moved.x > Fx::from_ratio(9, 10),
            "walked back to the mark instead of fighting: {moved:?}"
        );
    }

    #[test]
    fn a_wounded_fighter_still_obeys() {
        let enemy = contact(1, 2, 0, Fx::ONE);
        let mut obs = heading_for(Vec2::from_ints(0, 10));
        obs.set_enemies(&[enemy]);
        obs.hp_frac = Fx::from_ratio(1, 10);

        let mut cautious = UtilityPolicy::new(UtilityWeights {
            caution: Fx::from_ratio(5, 10),
            ..UtilityWeights::BASELINE
        });
        let command = cautious.decide(&obs);
        // `disengage` would have fled west, directly away from the enemy. The
        // player is answering the same question `caution` was going to answer,
        // and the player wins -- 1.0 of order against `LEASH_LANE` of flight,
        // which is the same three-to-one the enemy-in-sight case above states.
        assert!(
            command.move_dir.x < Fx::ZERO && command.move_dir.x.abs() <= LEASH_LANE,
            "bolted rather than obeying: {:?}",
            command.move_dir
        );
        assert!(
            command.move_dir.y > Fx::from_ratio(9, 10),
            "did not walk the route: {:?}",
            command.move_dir
        );
        // And it is still saying it wanted to break off, which is honest: that
        // *is* what it wanted to do.
        assert_eq!(command.intent, Intent::Flee);
    }

    #[test]
    fn a_patrol_turns_at_the_wall_and_comes_back() {
        // The one bit of memory in this policy, and what it is for. Two sides
        // ordered to advance *at* each other cross over, reach opposite edges,
        // and -- without a patrol leg to remember -- pace two parallel lines
        // twenty units apart until the clock runs out. Measured at the dim end
        // of the skill range that was one duel in six, both fighters at full
        // health, scored a draw because by then it was one.
        let mut policy = UtilityPolicy::baseline();
        let mut obs = situation(&[]);
        obs.order = Order::Advance(Vec2::X);

        // Open ground: follow the order as given.
        assert!(policy.decide(&obs).move_dir.x > Fx::ZERO);

        // Up against the far wall: turn.
        obs.wall_clearance = [
            Fx::from_int(39),
            Fx::from_ratio(5, 10),
            Fx::from_int(14),
            Fx::from_int(14),
        ];
        assert!(
            policy.decide(&obs).move_dir.x < Fx::ZERO,
            "ground into the wall instead of turning"
        );

        // ...and it *stays* turned once it is back in open ground, which is the
        // whole point of remembering. A rule that is a pure function of position
        // flips back the moment the wall is no longer close, and the character
        // twitches on the spot in a band a unit and a half wide.
        obs.wall_clearance = [
            Fx::from_int(20),
            Fx::from_int(20),
            Fx::from_int(14),
            Fx::from_int(14),
        ];
        for _ in 0..8 {
            assert!(
                policy.decide(&obs).move_dir.x < Fx::ZERO,
                "forgot which way it was walking as soon as it left the wall"
            );
        }

        // A fresh run starts a fresh patrol.
        policy.reset();
        assert!(policy.decide(&obs).move_dir.x > Fx::ZERO);
    }

    #[test]
    fn march_behaviour_is_byte_identical() {
        // `Goto` shares `march` with every order that came before it, and the
        // four of them are what every recorded run and every evolved genome in
        // the repository was measured on. Pinned raw values rather than a state
        // hash three crates away, so a regression fails at the line that moved.
        // Recorded from `march` as it stood before `Goto` was navigable.
        let mut policy = UtilityPolicy::baseline();
        let focus = Order::Focus(EntityId::new(1, 0));

        // Dead centre: the wall clearances cancel, so these are the steering
        // terms with `open_ground` contributing nothing.
        for (order, x, y) in [
            (Order::Hold, 0, 0),
            (Order::Advance(Vec2::X), 65536, 0),
            (Order::Regroup, 0, 0),
            (focus, 0, 0),
        ] {
            let mut obs = situation(&[]);
            obs.order = order;
            let moved = policy.decide(&obs).move_dir;
            assert_eq!((moved.x.raw(), moved.y.raw()), (x, y), "{order:?} moved");
        }

        // Jammed into the bottom-left corner with an ally behind it, so that
        // `open_ground`, the patrol turn and `ally_centre` all contribute.
        //
        // Three rows have moved from the figures this test was first written
        // against, and all three on purpose. `Advance(-X)` and `Regroup` are the
        // two headings that run into the corner here, and a heading that has run
        // out of arena used to sweep along the wall and now turns the patrol
        // round -- that was the memory `march` grew.
        //
        // `Focus` is the third and it is this session's. It used to share this
        // arm with `Hold` and so answered with a corner-escaping shuffle, which
        // is the wrong answer twice over: a fighter that has been told to go and
        // kill something specific is not idling, and edging away from a wall is
        // not pursuing. It routes now, and here it has nowhere to route -- these
        // fixtures leave `nav_dir` blank, which is the sim saying there is no way
        // there -- so it holds. **That the two orders no longer agree is the
        // claim**, and it is worth pinning rather than deleting: the day a
        // `Focus` starts wandering the room again is the day the pursuit has
        // fallen back through to the patrol sweep, which is exactly the fault
        // this arm was moved to fix.
        for (order, x, y) in [
            (Order::Hold, 16194, 11146),
            (Order::Advance(Vec2::X), 64935, 8855),
            (Order::Advance(-Vec2::X), 62565, -19507),
            (Order::Regroup, 62067, 21039),
            (focus, 0, 0),
        ] {
            let mut policy = UtilityPolicy::baseline();
            let mut obs = situation(&[]);
            obs.order = order;
            obs.wall_clearance = [
                Fx::from_ratio(5, 10),
                Fx::from_int(39),
                Fx::from_ratio(5, 10),
                Fx::from_int(27),
            ];
            obs.set_allies(&[contact(9, -6, -6, Fx::ONE)]);
            let moved = policy.decide(&obs).move_dir;
            assert_eq!((moved.x.raw(), moved.y.raw()), (x, y), "{order:?} moved");
        }
    }

    #[test]
    fn decision_period_reaches_the_policy() {
        // The brake is paced by this number, and `Observation::blank` defaults
        // it to 1. If the world ever stopped filling it in, every `Goto` would
        // silently commit to a stride twelve times too short and the failure
        // would look like sluggishness, not like a bug.
        let world = World::new(&Scenario::room(), 1);
        let hero = world.alive_ids(Faction::Heroes)[0];
        assert_eq!(world.observe(hero).decision_period, 12);
        assert_eq!(
            world.observe(hero).decision_period,
            Stats::decision_period(world.view(hero).unwrap().stats)
        );
    }

    #[test]
    fn decisions_never_exceed_unit_movement() {
        // The sim clamps anyway, but a policy handing back a 4-long vector is
        // a bug that would silently become "runs at full speed diagonally".
        let mut policy = UtilityPolicy::baseline();
        let enemies = [
            contact(1, 3, 1, Fx::ONE),
            contact(2, -2, 4, Fx::from_ratio(3, 10)),
        ];
        for order in [Order::Hold, Order::Advance(Vec2::X), Order::Regroup] {
            let mut obs = situation(&enemies);
            obs.order = order;
            obs.set_allies(&[contact(9, -6, -6, Fx::ONE)]);
            let command = policy.decide(&obs);
            assert!(
                command.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                "{order:?} produced {:?}",
                command.move_dir
            );
        }
    }
}
