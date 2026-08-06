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
use crate::minds::{mind_for, MindMemory};
use crate::swing;
use crate::Policy;
use fx::{Angle, Fx, Vec2};
use sim::{
    Command, Contact, EntityId, Intent, LimbCommand, Observation, Order, Strike, Swing,

};

pub const DUELIST_GENOME_LEN: usize = 20;

/// Decision period the loadout hysteresis is calibrated at, in ticks.
///
/// A Fighter's, because a Fighter with a sword and a shield is the character
/// the whole loadout question was designed around. Everything sharper gets
/// proportionally stickier per decision and everything duller proportionally
/// looser, so that "how often do I change what is in my hand" is a fact about
/// the fighter rather than about how fast its clock runs.
const REFERENCE_PERIOD: i32 = 12;

/// How few ticks of its own telegraph may be left before a feint is called off.
///
/// Small on purpose: a feint has to be *believed*, which means letting it run
/// nearly to the point of commitment. Pull out at half a windup and a defender
/// with any reaction speed simply waits it out.
const FEINT_COMMIT: u16 = 3;

/// How far outside its own dead zone a fighter insists on standing.
///
/// A margin, not a rounding allowance. `min_strike_range` is where a blow falls
/// to a twelfth of what the same blade does at its tip, which is a scratch that
/// does not even spend the cut. Standing exactly on that line is
/// indistinguishable from standing inside it, which is how a Skitterer ended up
/// hugging a Brute at 1.04 units, immune and harmless, losing sixty points of
/// win rate to a baseline that simply stood a little further back.
///
/// 1.25 survived the switch to a squared damage law without moving, and that is
/// a stronger result than it looks. The margin is worth whatever *damage* it
/// buys, and it buys the same: at 1.25 dead zones a blow is worth 22% of peak
/// under the old speed-linear law and 22% under the energy law. Swept at 1.00
/// and 1.10 afterwards, both were worse -- a Brute gives up its whole matchup
/// against a Rogue at 1.00.
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
pub(crate) fn blows_left(hp_frac: Fx, bite: Fx) -> Fx {
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
    /// so the gene means the trade rather than the guess: a blow grows with the
    /// arm on both sides, so standing further out costs and pays at once. It
    /// grows with the *square* of the arm now, which sharpens the trade without
    /// changing its direction -- both ends of it steepened together.
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
    /// **How much of its own recoil to stand inside of.**
    ///
    /// Swinging drags you, and [`sim::Observation::recoil_drift`] says how far.
    /// This is what fraction of that a fighter sets up inside its mark for, so
    /// that the drift lands it where it wanted to be instead of carrying it out
    /// past its own reach.
    pub footing: Fx,
    /// **Weight on guarding against being moved, rather than against being
    /// hurt.**
    ///
    /// The second thing a planted shield buys ([`sim::BRACE_ANCHOR`]), and it
    /// needs its own gene because it ranks the roster differently from the
    /// first: the blow that hurts most is not the blow that throws you furthest,
    /// and a fighter light enough to be sent flying by a cut it could otherwise
    /// afford to eat has a reason to plant that `guard` alone cannot express.
    pub anchor: Fx,
    /// How much a fighter prefers to keep holding what it is already holding.
    ///
    /// Hysteresis on the loadout, and the direct analogue of `resolve` one
    /// level up. Two actions scoring within a hair of each other would
    /// otherwise have a fighter paying the draw cost every decision and
    /// spending the fight holding nothing at all.
    pub loyalty: Fx,
    /// How dearly a fighter prices the ticks a swap costs it.
    ///
    /// Multiplies `Observation::swap_ticks`, so a body that draws slowly is
    /// naturally more committed to what it brought than a quick one is --
    /// without anything here having to know which body it is on.
    pub thrift: Fx,
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
    "footing",
    "anchor",
    "loyalty",
    "thrift",
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
    (Fx::ZERO, Fx::ONE),                            // footing
    (Fx::ZERO, Fx::from_int(3)),                    // anchor
    (Fx::ZERO, Fx::from_int(5)),                    // loyalty
    (Fx::ZERO, Fx::from_int(5)),                    // thrift
];

/// From `lab evolve --arena roster --cross --cross-with duelist`, thirty
/// generations of twenty-eight, on four **genuinely** independent master seeds.
///
/// Both of those flags are load-bearing and both exist because of mistakes this
/// comment used to record as successes. `--arena roster` scores all sixteen
/// archetype pairings, because one set of weights ships to the whole roster and a
/// single-pairing fitness cannot see what it trades away: the geometry fix below
/// took a duelling Rogue from 18% to 99% against a Fighter and cost a Brute half
/// its matchup against the same Fighter, and `--arena duel` would have scored
/// that as a clean win. `--cross` plays every seed set twice, against the naive
/// policy and against a duellist, and keeps the **worse** average -- because the
/// previous round's winners beat a duelling Brute 100% while winning 19% to 45%
/// against a naive one, and called that a better fighter.
///
/// **What four independent runs agreed about**, which is the part worth trusting:
///
/// * `standoff` is **positive now, 0.23 to 0.49**, where it was 0.000 across the
///   previous set. That is the geometry correction in
///   [`DuelistPolicy::preferred_range`] showing up as behaviour: 0.000 was the
///   right answer to a floor computed as a sum, which stood every fighter up to
///   half a body further out than it meant to. Given the true distance, a
///   duellist buys some reach back.
/// * `punish` stays at the top, 1.79 to 3.00, as it has through every rebuild of
///   the physics. Hitting something that cannot answer is the best exchange in
///   the game and nothing has made it less so.
/// * `sidestep` came back at 0.98, 1.00, 1.00 and 0.31. It used to need
///   hand-setting off 0.01 -- which turned an evade into backing straight into
///   the swing -- and no longer does.
/// * **`read_ahead` collapsed to the floor of its range**, 0.30 to 0.90, having
///   been pinned at the *ceiling* of 3.00 in the previous set. It is the second
///   time this gene has reversed and the second time the reversal is a
///   measurement rather than noise. It went to the top when a guard gained mass,
///   because a telegraph bought time to *finish* moving the shield. It has come
///   back down now that `Trade` is damped by how blunted the blade is and
///   `standoff` is positive: a fighter standing further out with a reason to keep
///   cutting has less use for a stance whose whole content is *not attacking*.
/// * `lead` came back **0.000, 0.000, 0.059, 0.000** and was removed. See
///   [`DuelistPolicy::act`].
/// * `barge` came back 0.35, 0.69, 0.83 and 2.07 -- four values with no
///   agreement between them, which is the signature of a gene evolution had *no
///   gradient on*. It turned out the stance could not be chosen at any value in
///   its range, so every one of those four numbers was noise. Removed; the
///   reasoning is in [`DuelistPolicy::choose`]. Worth remembering as a reading
///   skill: four runs disagreeing wildly is not a weak signal, it is usually no
///   signal, and the difference matters.
///
/// **Three values are hand-set off what evolution returned, and each is a
/// different kind of reason.**
///
/// `caution` comes back near zero on every run, for a reason about the arena
/// rather than about fighting: in a duel there is nowhere to break off *to* and
/// the clock is scored against you, so the gene is free. `0.32` blows is what an
/// older `0.10` health fraction worked out to against a Brute, so the shipped
/// behaviour is unchanged where it was measured and is now also right against
/// everything else. A stance that never fires is a stance nobody will notice has
/// rotted.
///
/// `standoff` at **0.25** and `resolve` at **0.70** are chosen against a
/// criterion the fitness function does not contain, and this is the honest note
/// about it. Fitness measures *how good the policy is*. The difficulty ladder
/// measures *how much its quality depends on the character's wits* — and
/// maximising the first flattens the second, because a policy that fights well
/// with bad reads is exactly a policy whose dim sheet wins. Taken raw, the best
/// genome here puts the `int 1 / per 1` rung at 48% where the product wants it
/// under 55% and falling from there, and one run put it at 74%.
///
/// Both were picked off measured sweeps, and the choice cost nothing:
///
/// ```text
///   standoff 0.25, resolve   0.38   0.55   0.70   0.85   1.00
///   matrix mean               71%    71%    70%    67%    68%
///   dull rung (int 1/per 1)   68%    55%    35%    19%    30%
///   worst mirror draw rate     0%     1%     0%     0%     0%
/// ```
///
/// At 0.70 the roster mean is a point *above* the raw genome's 69% and the ladder
/// is monotone with no draws on it. `standoff` 0.25 is doing the second half of
/// the job: at the evolved 0.49 a Rogue mirror stalls, drawing one duel in ten at
/// 59% health, and the draw rate climbs to 29% by 0.56. Standing at the tip of
/// your own arc is where two symmetric fighters stop resolving.
const BASELINE_VALUES: [Fx; DUELIST_GENOME_LEN] = [
    Fx::from_ratio(1854, 1000), // aggression
    Fx::from_ratio(2000, 1000), // bloodlust
    Fx::from_ratio(275, 1000),  // obedience
    Fx::from_ratio(320, 1000),  // caution, hand-set: in clean blows, not health
    Fx::from_ratio(250, 1000),  // standoff, hand-set for the ladder
    Fx::from_ratio(244, 1000),  // lunge
    Fx::from_ratio(1501, 1000), // guard
    Fx::from_ratio(905, 1000),  // read_ahead
    Fx::from_ratio(2204, 1000), // evasion
    Fx::from_ratio(1000, 1000), // sidestep
    Fx::from_ratio(667, 1000),  // flank
    Fx::from_ratio(1786, 1000), // punish
    Fx::from_ratio(626, 1000),  // feint
    Fx::from_ratio(700, 1000),  // resolve, hand-set for the ladder
    Fx::from_ratio(919, 1000),  // cohesion
    Fx::from_ratio(474, 1000),  // wall_fear
    Fx::from_ratio(768, 1000),  // footing
    Fx::from_ratio(456, 1000),  // anchor
    // Both hand-set, and both against the difficulty ladder rather than against
    // fitness -- the same call the three values above record, for the same
    // reason. A re-evolution over the full roster returned `loyalty 1.28,
    // thrift 0.94` at a held-out fitness of 75 against this table's 41, and it
    // was not adoptable: it also drove `evasion` to its ceiling and `caution` to
    // zero, producing a fighter that wins the roster by running away. It drew a
    // third of its mirror matches and its dim sheet won 68% of its duels, which
    // is a difficulty ladder with the bottom rung above the top.
    //
    // What the search was right about is the shape: moderate hysteresis, not
    // none. At `0.3` a fighter thrashes between blade and guard and pays the
    // draw cost every decision (measured: 11% against a Brute). At `1.5` it
    // never swaps at all and the guard is decorative (80%, and zero blocks).
    // `0.6` sits where it blocks between one and two blows a fight and still
    // out-fights the naive baseline nearly three to one.
    Fx::from_ratio(600, 1000), // loyalty, hand-set for the ladder
    Fx::from_ratio(600, 1000), // thrift, hand-set for the ladder
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
        footing: BASELINE_VALUES[16],
        anchor: BASELINE_VALUES[17],
        loyalty: BASELINE_VALUES[18],
        thrift: BASELINE_VALUES[19],
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
            footing: g(16),
            anchor: g(17),
            loyalty: g(18),
            thrift: g(19),
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
            self.footing,
            self.anchor,
            self.loyalty,
            self.thrift,
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

    /// Which blade this duel is about.
    ///
    /// **A player who clicks an enemy is not making a suggestion.** The scoring
    /// loop below is how a duellist picks its own quarry, and a named one skips it
    /// entirely rather than entering it with a thumb on the scale -- which is what
    /// the `obedience` gene used to do, and what left obeying an order a matter of
    /// degree for an evolved number to settle.
    ///
    /// Only while the named quarry is actually in sight. Out of sight there is no
    /// contact to return, so the duellist reads whatever blade is in front of it
    /// while the feet carry on pursuing; `ordered_feet` is still routing to the
    /// quarry through the sim. A fighter that declined to defend itself because
    /// the thing it was told to kill is round the next corner would be obeying the
    /// letter of the order and dying of it.
    fn pick_target<'a>(&self, obs: &'a Observation, previous: EntityId) -> &'a Contact {
        if let Some(named) = obs.order.focus() {
            // `obs.enemies()` is nearest-first, so `find` is exact and canonical
            // -- there is at most one contact with a given id and no tie to break.
            if let Some(contact) = obs.enemies().iter().find(|c| c.id == named) {
                return contact;
            }
        }

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
            // it out renumbers all twenty knobs after it and silently repoints
            // every stored genome in the repository at the wrong one. A dead
            // branch is cheap; a genome that means something different than it did
            // cannot be recovered by reading it.
            //
            // Giving the slot a new job is a real question and a separate one --
            // the obvious candidate is scaling how far past its ring a fighter
            // will pursue, which would make a player's order grip harder or softer
            // depending on an evolved number. That is the wrong default and it is
            // not this change's to decide.
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
    pub(crate) fn open_ground(weights: &DuelistWeights, obs: &Observation) -> Vec2 {
        let bias = Vec2::new(
            obs.wall_clearance[1] - obs.wall_clearance[0],
            obs.wall_clearance[3] - obs.wall_clearance[2],
        );
        let scaled = bias * (weights.wall_fear / obs.sight_range.max(Fx::ONE));
        scaled.clamp_length(weights.wall_fear)
    }

    pub(crate) fn ally_centre(obs: &Observation) -> Vec2 {
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

    pub(crate) fn cohesion(weights: &DuelistWeights, obs: &Observation) -> Vec2 {
        let centre = Self::ally_centre(obs);
        if centre.length() > Fx::from_int(3) {
            centre.normalize() * weights.cohesion
        } else {
            Vec2::ZERO
        }
    }

    /// How a live [`Order::Goto`] or [`Order::Focus`] pulls on the feet, blended
    /// against the footwork `own` that the mind wanted anyway.
    ///
    /// [`crate::UtilityPolicy`]'s own `ordered_feet` carries the whole argument
    /// for why this exists, for why `None` means "the order has nothing to say",
    /// for why arrival stopped being one of the things it means, for why the
    /// reachable-box reconstruction that used to sit in the arm below had to go,
    /// and for why the two order kinds differ only in what the anchor is.
    /// **What is deliberately not shared is the brake**: this policy paces a
    /// destination off one stride's worth of travel and the other one solves the
    /// stopping distance, they were never the same law, and unifying them here
    /// would be a behaviour change smuggled in under a refactor. The *blend* is
    /// shared, and that is a different kind of thing: `leash` is one statement
    /// about what an order is, and a duellist and a brawler had better not
    /// disagree about that.
    ///
    /// **The ring comes from the mind holding the limb**, which is what makes an
    /// order mean the right thing to whatever this fighter has actually drawn.
    /// A duellist told to fight a Brute closes to sword range; the same duellist
    /// with a bow in the same hand stops well outside it, because `BowMind` says
    /// so and nothing here second-guesses it. Reading `obs.held` rather than the
    /// selector's winner is the same choice `decide` makes one level up and for
    /// the same reason: the two differ for the whole length of a swap, and
    /// pursuing at the range of a weapon that is not yet in hand would walk a
    /// mid-swap archer onto a sword.
    fn ordered_feet(&self, obs: &Observation, own: Vec2) -> Option<Vec2> {
        let ring = match obs.order {
            Order::Goto(_) => Fx::ZERO,
            Order::Focus(id) => match obs.enemies().iter().find(|c| c.id == id) {
                Some(foe) => {
                    mind_for(obs.held.role(), self.weights).standoff(obs, foe)
                        * crate::utility::FOCUS_SLACK
                }
                // Out of sight there is nothing to size a ring from and nothing
                // to hold back for; see `UtilityPolicy::ordered_feet`.
                None => Fx::ZERO,
            },
            _ => return None,
        };
        let (to, distance) = crate::utility::nav_step(obs)?;
        // The rim, not the body at the centre. Every use of the route's length
        // below is of what is left to cover *to the ring*, because the brake is a
        // stopping-distance solve and stopping on the quarry is the one thing a
        // standoff exists to prevent.
        let gap = (distance - ring).max(Fx::ZERO);
        let stride = obs.move_speed * (obs.decision_period.max(1) as i32);
        let brake = (gap / stride).min(Fx::ONE);
        // Already a unit heading, and braked before it is leashed; see
        // `UtilityPolicy::ordered_feet` for why normalising it twice is not free
        // and for why the spring is handed the braked vector rather than the raw
        // one.
        Some(crate::utility::leash(to * brake, gap, own))
    }

    /// Nothing in sight: do as the player asked.
    fn march(&self, obs: &Observation, patrol: &mut crate::utility::Patrol) -> Command {
        // The route, when the level has one to offer. Shared with
        // `UtilityPolicy` so that "walk there" means one thing whichever policy
        // is driving, and returning rather than steering for the reason that
        // function's own doc gives.
        if matches!(obs.order, Order::Hold) {
            if let Some((to, along)) = crate::utility::nav_step(obs) {
                if along <= crate::utility::HUNT_RANGE {
                    return Command::moving(to.clamp_length(Fx::ONE));
                }
            }
        }

        let heading = match obs.order {
            Order::Advance(dir) => dir.normalize(),
            Order::Regroup => Self::ally_centre(obs).normalize(),
            // A destination and a quarry both name a place, so both of them route
            // to it. A `Focus` used to sit with `Hold` below as "no heading",
            // which is where a pursuit round a corner quietly turned back into a
            // patrol -- and something that stops following the moment its quarry
            // steps behind masonry was never locked on. See
            // `UtilityPolicy::march`'s arm, which carries the argument in full.
            Order::Goto(_) | Order::Focus(_) => {
                // Arriving somewhere is not a variation on marching, and the
                // steering below is still wrong for it -- which is why this arm
                // returns before reaching any of it. See `ordered_feet`, which is
                // where the code that used to be here now lives, and
                // `UtilityPolicy::march`'s arm for the derivation: for why the
                // wall sweep stays out, and for why the footwork handed to the
                // leash here is a zero rather than an idle drift toward open
                // ground. The short of it is that nothing is in sight on this
                // path, so there is nothing to blend and nothing to hover for --
                // the hover is for a duellist with a duel on, and that one gets
                // here through `decide` with the mind's own feet already in hand.
                // A steady bias here would not shift the weight, it would lean,
                // and a lean that does not vanish at the anchor parks the
                // character short of every click at any strength you pick.
                //
                // Nothing in sight also means no ring: `ordered_feet` sizes one
                // off a visible contact, and on this path there are none.
                return match self.ordered_feet(obs, Vec2::ZERO) {
                    Some(dir) => Command::moving(dir),
                    None => Command::HOLD,
                };
            }
            Order::Hold => Vec2::ZERO,
        };

        // Turn at the wall and come back, rather than grinding into it. Shared
        // with `UtilityPolicy` so that "advance" means one thing whichever
        // policy is driving.
        let heading = crate::utility::patrol_heading(obs, heading, patrol);

        Command::moving((heading + Self::open_ground(&self.weights, obs)).clamp_length(Fx::ONE))
    }

    /// How far this duellist wants to be from `foe`'s centre.
    ///
    /// Three distances decide this, and all three are computed rather than
    /// guessed:
    ///
    /// * **The floor.** Inside this a fighter is within its *own* dead zone and
    ///   cannot hurt what it is standing on top of. Exact, because
    ///   proprioception is free.
    /// * **The lee.** Inside this the enemy's blade cannot reach past a graze on
    ///   this body. **Perceived**, and this is the whole of what
    ///   [`Contact::min_strike_range`] bought.
    /// * **Arm's length.** The far end of its own reach, where its own blows
    ///   land hardest and so do the enemy's.
    ///
    /// **The first two are hypotenuses and not sums, and that correction is the
    /// whole of what this phase fixed here.**
    ///
    /// They were sums, on the reading that a blow lands on the nearest surface of
    /// the body it strikes -- a body at distance `D` struck at `D - r` along the
    /// arm. That is not what the sim bills. `fx::segment_circle` measures to the
    /// body's *centre*, and a sweep bills the first sub-step that connects, which
    /// is while the blade is still `arcsin(r/D)` off the line of centres -- so the
    /// blow lands at `sqrt(D^2 - r^2)`, capped by the tip. Each distance is
    /// therefore a *leg* of a right triangle whose hypotenuse is the range, and
    /// adding the legs overstates it by up to a body radius. Measured against the
    /// predicate itself to three decimals: a Rogue crowding a Fighter strikes at
    /// 0.663 and not at 0.350.
    ///
    /// It was a Phase 3 bug and it survived two phases because small dead zones
    /// hid it. The energy damage law grew every dead zone by about a third and
    /// made it expensive: a duellist Rogue's matchup against a naive Fighter fell
    /// from 97% to 18% on the percept alone, with the damage law held fixed.
    /// Correcting it against the *old* genes made things worse across the roster
    /// -- mirrors ran out the clock untouched -- which is why the fix and the
    /// re-evolution of `standoff` had to land together, and did.
    ///
    /// The safest place a fighter can still fight from is the larger of the
    /// first two, and `standoff` spends the distance between there and arm's
    /// length -- buying damage with exposure, since a blow grows with the arm on
    /// *both* sides.
    ///
    /// **Then it stands inside that by what its own swing is about to cost it.**
    /// Recoil drags a swinging body along its own arc, which is across the line
    /// to the enemy rather than along it -- and a lateral step off a circle of
    /// radius `d` lands you at `sqrt(d^2 + s^2)`, which is *further out*, never
    /// nearer. So a fighter that swings and does not allow for it drifts
    /// steadily toward the far end of its own reach, which is the one place its
    /// spacing decision was trying not to be. `footing` is how much of
    /// [`sim::Observation::recoil_drift`] to set up inside for; the exact
    /// correction is second order in `s/d` and this is first order in it, so the
    /// gene is absorbing a shape as well as a scale. Floored at `floor` like
    /// everything else, because no amount of drift is worth standing inside your
    /// own hilt for.
    ///
    /// Sometimes the lee is beyond the floor and there is a genuine band in
    /// which a fighter can reach and cannot be reached. That band is not a
    /// fiction and it is not the same for everybody: a Skitterer has about a
    /// twentieth of a unit of it against a Brute, and a Fighter has none at all
    /// and must trade. Reading which of those you are in is now a decision the
    /// observation supports.
    ///
    /// The error is asymmetric on purpose, and it is where the difficulty
    /// ladder lives. Underestimate the lee and the floor catches you.
    /// Overestimate it and you stand off a weapon you could have crowded, which
    /// against a Brute is four points a blow against thirty. A dim fighter
    /// respects a big weapon's reach and is killed by it.
    pub(crate) fn preferred_range(weights: &DuelistWeights, obs: &Observation, foe: &Contact) -> Fx {
        // Bodies do not pass through each other, and a fighter that asks for a
        // distance shorter than the two radii is asking for something the sim
        // will spend every tick undoing. Correcting the floor to a hypotenuse
        // made that reachable for the first time -- `hypot(a, b)` is smaller
        // than `a + b`, and for the light archetypes it came out *inside*
        // contact, so a Rogue mirror drove permanently into itself, ground along
        // `World::separate`'s impulse at walking pace, and timed out at full
        // health on both sides.
        let touching = obs.radius + foe.radius;
        let floor = Self::bite_range(obs, foe).max(touching);
        let lee = Vec2::new(foe.min_strike_range, obs.radius).length();
        let arms_length = obs.full_reach() + foe.radius;

        let safest = lee.max(floor);
        let wanted = safest + (arms_length - safest).max(Fx::ZERO) * weights.standoff;
        let wanted = wanted - obs.recoil_drift * obs.radius * weights.footing;
        // Clamped rather than merely floored: a wildly overestimated lee could
        // otherwise park a fighter beyond its own reach, where it is being hit
        // by something it cannot answer -- which is a way to lose, not a way to
        // fight badly.
        wanted.clamp(floor, arms_length.max(floor))
    }

    /// **The nearest range from which this fighter's own blade still bites.**
    ///
    /// Its own dead zone plus [`STRIKE_MARGIN`], as a distance between *centres*
    /// -- so it is a hypotenuse, for the reason set out at
    /// [`DuelistPolicy::preferred_range`]: the sim bills a blow at
    /// `sqrt(D^2 - r^2)` and each of the two terms here is a leg of that
    /// triangle.
    ///
    /// Deliberately **not** floored at body contact, unlike the floor in
    /// `preferred_range` that is built from it. This one answers "is my sword
    /// doing anything from here", and the honest answer against a big weapon and
    /// a small opponent is sometimes no even when the two are touching. Flooring
    /// it would quietly report that a fighter who cannot possibly be crowded any
    /// harder is not crowded at all.
    pub(crate) fn bite_range(obs: &Observation, foe: &Contact) -> Fx {
        Vec2::new(obs.min_strike_range * STRIKE_MARGIN, foe.radius).length()
    }

    /// Scores every stance and returns the winner.
    pub(crate) fn choose_blade_stance(weights: &DuelistWeights, obs: &Observation, foe: &Contact, running: Option<Stance>) -> Stance {
        let reach = obs.full_reach() + foe.radius;
        let ideal = Self::preferred_range(weights, obs, foe);

        // How frightening the other blade is right now, and how open it is.
        // Both come straight off the attack phase now. The version this
        // replaced sampled a free-spinning blade forward through five
        // extrapolated positions and thresholded how close it came, which was a
        // bet on a perceived spin and -- worse -- could not tell a fighter who
        // had decided to attack from one whose blade happened to be moving.
        let (urgency, _) = swing::incoming(obs, foe);
        let danger = (urgency * weights.read_ahead).min(Fx::ONE);
        let exposed = swing::overcommitted(foe);
        let in_reach = foe.distance <= reach;
        // Nothing worth calling an attack can start from a hand that is not free
        // to start one, so the offensive stances do not get to compete for the
        // decision while it is busy. Without this a duellist picks Trade,
        // achieves nothing because its hand is mid-recovery, and stands in
        // range doing it.
        let can_open = obs.can_strike() || obs.limb.swing.is_attacking();
        // **How far inside its own dead zone this fighter is standing**, and a
        // fact it has always had and never used: every stance that swings has
        // scored the same whether the blade could reach past a graze or not.
        //
        // Small, and worth saying how small rather than implying otherwise. Body
        // contact is as crowded as anyone can get, and for twelve of the sixteen
        // pairings the two bodies touching still leaves the blade outside its own
        // dead zone -- so this is exactly zero there. It reaches 0.13 for a Brute
        // with a Skitterer against its chest and 0.09 with a Rogue, and nothing
        // else in the roster gets past 0.04.
        //
        // Kept anyway, because it is the correct model of a real effect that this
        // roster's body sizes happen to suppress, it costs one multiply, and the
        // alternative is a policy that is confidently wrong the moment a weapon
        // with a longer dead zone or a body with a smaller radius is authored.
        let blunted = {
            let bite = Self::bite_range(obs, foe);
            if bite.is_positive() {
                (Fx::ONE - foe.distance / bite).clamp(Fx::ZERO, Fx::ONE)
            } else {
                Fx::ZERO
            }
        };

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
            (Fx::from_ratio(14, 10) - danger * Fx::HALF) * (Fx::ONE - blunted)
        } else {
            Fx::ZERO
        };
        scores[Stance::Circle.index()] = weights.flank * (Fx::ONE - danger);
        scores[Stance::Evade.index()] = weights.evasion * danger;
        // **Two reasons to plant a shield, and they are not the same reason.**
        //
        // `guard` is the old one: a braced guard leaks a fifth of what a
        // travelling one does, so covering the line is worth what the blow
        // costs in *health*. `anchor` is the other half of what bracing buys --
        // `sim::BRACE_ANCHOR` takes seven tenths of the shove out of a blow the
        // shield caught -- and it needs its own term because the roster ranks
        // the two differently on purpose. A Skitterer's knife is among the least
        // dangerous things in the game and the second heaviest for its speed:
        // eating one costs a Fighter almost nothing and moves it further than
        // its own sword moves anybody. Folding this into `guard` would say those
        // are the same decision.
        scores[Stance::Guard.index()] =
            danger * (weights.guard + weights.anchor * foe.knockback_taken.min(Fx::ONE));
        // The whole reward for reading a fight. An enemy in recovery cannot
        // attack, cannot parry and cannot get its guard back in time, and this
        // is the only stance that knows it.
        scores[Stance::Punish.index()] = if can_open {
            weights.punish * exposed
        } else {
            Fx::ZERO
        };
        scores[Stance::Feint.index()] = if in_reach && can_open && foe.limb_reach > Fx::HALF {
            weights.feint * (Fx::ONE - danger)
        } else {
            Fx::ZERO
        };
        // **Breaking off, counted in blows rather than in health.**
        //
        // This used to be `hp_frac < caution` -- a flat fraction, the same
        // against everything -- and a flat fraction is not a decision about the
        // fight, it is a decision about yourself. Twenty percent of a Fighter is
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
        scores[Stance::Retreat.index()] = if mine < weights.caution && mine < theirs {
            Fx::from_int(10) // decisive: nothing else is worth doing this close to dead
        } else {
            Fx::ZERO
        };
        // **There is no body-check here, and that is a measured result rather
        // than an omission.**
        //
        // A ninth stance was built for it: walk through somebody who has come
        // inside the distance you chose and weighs less than you do, scored
        // `barge * crowded * lighter` with `lighter = 1 - heft`, because
        // `World::separate` splits a collision on the mass ratio and nothing
        // else. It never fires, and it cannot -- the ceiling is algebra, not
        // tuning. `crowded` is largest when bodies are touching, which is as
        // close as anyone can get, and even there it reaches only 0.32 (a Brute
        // with a Skitterer against its chest); `lighter` is zero in nine of the
        // sixteen pairings, because most of what you meet is not lighter than
        // you. The best product available anywhere in the roster, with the gene
        // at the top of its range, is **0.838** against `Trade` sitting at 1.4.
        //
        // The reason underneath it is the interesting part, and it is the same
        // fact `blunted` is built on: **you cannot be crowded into uselessness
        // in this roster, because bodies are wider than the gap.** A shoulder
        // beats a sword only where the sword has stopped working, and the sword
        // never quite stops -- a Brute with a Skitterer pressed against it is
        // still swinging at 1.08 dead zones, worth a seventh of its best blow
        // rather than nothing. Trading is the right answer and the score says so.
        //
        // `Contact::heft` stays in the observation, exactly as
        // `Contact::velocity` stayed after leading a target was measured and
        // removed. The percept is a fact about the world; the gene was a bet
        // about what to do with it.

        // Hysteresis. Without it a duellist flickers between two stances that
        // score within a hair of each other and does neither -- which looks
        // exactly like the swing dithering one level down, and costs the same.
        if let Some(running) = running {
            scores[running.index()] += weights.resolve;
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
        let mine = obs.limb;
        if mine.swing.is_attacking() {
            let left = Fx::from_int(mine.swing_left as i32);
            let spent = Fx::ONE - (left / Fx::from_int(30)).min(Fx::ONE);
            let lands_first = mine.swing == Swing::Strike
                || !foe.limb_swing.is_attacking()
                || left < foe.limb_left;
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
    pub(crate) fn guard_line(obs: &Observation, foe: &Contact) -> Angle {
        let bearing = foe.offset.angle();
        match swing::landing(obs, foe) {
            // Nothing coming, or coming and going to miss: cover the man.
            None => bearing,
            Some(at) if at.is_zero() => bearing,
            Some(at) => at.angle(),
        }
    }

    /// **A duellist cuts at where the enemy is standing, and there is no gene for
    /// doing otherwise. That is a measurement, not an oversight.**
    ///
    /// Leading a target was implemented here as a `lead` gene and a horizon built
    /// from the two delays the observation can state -- the telegraph still to
    /// run, exact off this fighter's own hand, and the wait for its own next
    /// thought -- with the range running to 2 so the gene could carry the third
    /// delay, the front of the cut, which nothing in an [`Observation`] states.
    /// The drift was relative rather than the enemy's alone, so it also covered
    /// this fighter's own footwork and its own recoil.
    ///
    /// Four evolution runs on genuinely independent master seeds returned
    /// **0.000, 0.000, 0.059, 0.000**, and a direct sweep is monotonically
    /// non-positive: 48% mean win rate at zero, 47% at a quarter, 45% at a half,
    /// 44% at one, 29% at two. The gene was removed rather than shipped at zero,
    /// for the reason the first version of it was removed two phases ago -- an
    /// unused knob costs every future evolution run a dimension.
    ///
    /// The mechanism is the same one that killed it the first time and it is
    /// worth keeping written down: a cut sweeps 146 degrees and the sim already
    /// aims the far end of the arc past the target, so the swept area barely
    /// moves -- while the lead is computed partly from a *perceived* velocity and
    /// adds its error to an aim that was fine. [`sim::Contact::velocity`] stays in
    /// the observation for a network to find a use for.
    ///
    /// Turns a stance into feet and hands.
    /// Footwork that holds `ideal` distance from `foe` and arrives at rest.
    ///
    /// Push out when too close, pull in when too far, with a deadband a tenth of
    /// the range wide so a fighter is not permanently correcting by a hair.
    ///
    /// The *pace* is the load-bearing half. This used to drive at the preferred
    /// range flat out and stop dead on arrival, which a body with momentum
    /// cannot do: full speed into a tenth-of-a-unit deadband overshoots it,
    /// reverses, overshoots the other way, and leaves a fighter permanently
    /// sliding through the one distance it wanted to be standing at.
    /// `sqrt(2 * a * d)` is the fastest approach from which a stop is still
    /// possible -- the same braking law [`sim::Hand::track`] runs on the arm.
    ///
    /// **Lifted out of `drive_blade_stance` rather than copied into `BowMind`.**
    /// An archer keeps station too, and the alternative was a second transcription
    /// of this law in `minds.rs` -- which is precisely the drift that module's own
    /// header warns about, and that `rules::MUSCLE_SPIN` has a post-mortem about.
    ///
    /// Reads `obs.move_speed`, which carries `ActionSpec::move_bonus`: a runner
    /// paced against a walker's top speed would brake far too late.
    pub(crate) fn station(obs: &Observation, foe: &Contact, ideal: Fx) -> Vec2 {
        let band = ideal * Fx::from_ratio(1, 10);
        let error = foe.distance - ideal;
        if error.abs() <= band {
            return Vec2::ZERO;
        }
        let toward = foe.offset.normalize();
        let brakeable = fx::sqrt_product(obs.traction * Fx::TWO, error.abs() - band);
        let pace = (brakeable / obs.move_speed.max(Fx::EPSILON)).min(Fx::ONE);
        if error.is_positive() {
            toward * pace
        } else {
            -toward * pace
        }
    }

    pub(crate) fn drive_blade_stance(weights: &DuelistWeights, obs: &Observation, foe: &Contact, stance: Stance) -> (Vec2, LimbCommand) {
        let toward = foe.offset.normalize();
        let bearing = foe.offset.angle();
        let ideal = Self::preferred_range(weights, obs, foe);
        let _guard_line = Self::guard_line(obs, foe);

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
        let station = Self::station(obs, foe, ideal);

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

        let (feet, limb) = match stance {
            // Closing with the blade chambered rather than swinging on the way
            // in. An attack thrown from out of range is a telegraph given away
            // for nothing, and it arrives in range mid-recovery -- which is the
            // exact state this policy is built to punish other people for.
            Stance::Close => (toward * (Fx::HALF + weights.lunge), ready),
            Stance::Trade => (station, attack),
            Stance::Circle => (
                (orbit * weights.flank + station * Fx::HALF).clamp_length(Fx::ONE),
                ready,
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
                (orbit * weights.sidestep - toward * (Fx::ONE - weights.sidestep))
                    .clamp_length(Fx::ONE),
                ready,
            ),
            // Stand your ground with the blade chambered. Feet still, because a
            // guard that is walking is a guard in the wrong place by the time
            // the blow lands.
            //
            // Commanding `ready` here is also a *cancel*: if this fighter was
            // mid-windup when it read the incoming cut, the windup is called off
            // and the hand comes back clean. Eating a blow while committed to a
            // slower one of your own is how duels are lost.
            //
            // **This stance is now nearly empty, and that is the finding rather
            // than a regression.** It used to also brace a shield -- except the
            // shield was braced in all eight stances regardless, so it never
            // did. Defending was never an alternative to pressing, which is
            // exactly why answering a telegraph measured as a losing play. The
            // content this stance always should have had belongs to a guard
            // action, and it gets it when the minds land.
            Stance::Guard => (Vec2::ZERO, ready),
            // The blade has gone by and cannot come back yet. This is the only
            // stance that willingly gives up spacing.
            Stance::Punish => (toward, attack),
            // Show the cut on the side the guard is *already* nearest, so
            // answering it drags the shield further that way -- and then the
            // real attack goes to `open_side`, which is the other one.
            Stance::Feint => {
                let bait = match open {
                    Strike::Widdershins => Strike::Sunwise,
                    _ => Strike::Widdershins,
                };
                (station, swing::feint(obs, bearing, bait, FEINT_COMMIT))
            }
            Stance::Retreat => (
                (-toward + Self::cohesion(weights, obs) + Self::open_ground(weights, obs)).clamp_length(Fx::ONE),
                ready,
            ),
        };

        (
            (feet + Self::open_ground(weights, obs) * Fx::HALF).clamp_length(Fx::ONE),
            limb,
        )
    }

    /// Whether a stance means this fighter has decided to break off.
    ///
    /// Split out because the intent is a fact about the *stance* and the stance
    /// is chosen inside a mind, while the intent has to be attached to the
    /// command the selector assembles.
    pub(crate) fn stance_is_flight(stance: Stance) -> bool {
        stance == Stance::Retreat
    }

    /// The stance this policy last chose for `me`, for the HUD and for tests.
    pub fn stance_of(&self, me: EntityId) -> Option<Stance> {
        self.recall(me).stance
    }
}

impl Policy for DuelistPolicy {
    fn decide(&mut self, obs: &Observation) -> Command {
        if obs.enemies().is_empty() {
            // Losing sight resets the read. Whatever it was doing was about a
            // blade it can no longer see. The patrol leg survives, because that
            // is the memory this branch exists to use.
            let mut memory = self.recall(obs.me);
            memory.stance = None;
            let command = self.march(obs, &mut memory.patrol);
            self.remember(obs.me, memory);
            return command;
        }

        let mut memory = self.recall(obs.me);
        let foe = *self.pick_target(obs, memory.target);

        // ---- the meta selector: what should be in this hand?
        //
        // Every filled slot is appraised by the mind that knows how to use it,
        // and the two corrections below are what stop the raw scores from being
        // acted on directly.
        let mut mind_memory = MindMemory {
            stance: memory.stance,
        };
        let mut best = obs.slot;
        let mut best_score = Fx::MIN;
        for slot in 0..2u8 {
            let Some(kind) = obs.loadout_slot(slot) else {
                continue;
            };
            let mut score = mind_for(kind.role(), self.weights).appraise(obs, &foe);
            if slot == obs.slot {
                // Hysteresis. Without it a fighter pays the draw cost over and
                // over for two actions scoring within a hair of each other, and
                // spends the whole fight with nothing in its hand -- the stance
                // dithering the `resolve` gene exists to stop, except with a
                // price tag attached to every flip.
                //
                // **Scaled against how often this fighter thinks**, and that is
                // not a refinement -- without it the ladder inverts. Stickiness
                // applied per *decision* means a sharp fighter, re-deciding
                // twelve times as often as a dim one, flips its loadout twelve
                // times as readily and spends the fight mid-swap. Measured on
                // the three character sheets: dull 14%, capable 73%, sharp
                // **46%**. More intellect made a worse fighter, which is the
                // exact opposite of what every stat in this game is for.
                //
                // A swap costs the same number of ticks whoever throws it, so
                // what has to be constant is flips per *second*, not per
                // decision. `decision_period` is in the observation precisely so
                // a policy can convert between the two.
                // Floored at one, never below. Scaling *down* for a slow thinker
                // is the mirror mistake and it is worse: a swap costs the same
                // fifteen ticks whoever throws it, so a fighter deciding once
                // every thirty ticks that flips half the time is dormant a
                // quarter of the fight. Measured, unfloored, the dim sheet fell
                // from 14% to 6%. The reference cadence is a floor on
                // commitment, not a target to be scaled around.
                let sharpness = (Fx::from_int(REFERENCE_PERIOD)
                    / Fx::from_int(obs.decision_period.max(1) as i32))
                .max(Fx::ONE);
                score += self.weights.loyalty * sharpness;
            } else {
                // And the price itself. A swap that costs twenty-five ticks has
                // to be worth twenty-five ticks; `swap_ticks` is in the
                // observation precisely so this line can read it rather than
                // assume a constant.
                score -= self.weights.thrift * Fx::from_int(obs.swap_ticks as i32)
                    / Fx::from_int(30);
            }
            if score > best_score {
                best_score = score;
                best = slot;
            }
        }

        // ---- and then fight with what is actually in hand.
        //
        // **Not with the winner.** The two differ for the whole length of a
        // swap, and driving the winner would mean issuing sword commands to a
        // shield for fifteen ticks at a stretch.
        let held = obs.held;
        let (feet, limb) = mind_for(held.role(), self.weights).drive(obs, &foe, &mut mind_memory);

        let intent = match mind_memory.stance {
            Some(stance) if Self::stance_is_flight(stance) => Intent::Flee,
            _ => Intent::Attack(foe.id),
        };

        memory.target = foe.id;
        memory.stance = mind_memory.stance;
        self.remember(obs.me, memory);
        Command {
            // The player's order bends the mind's footwork rather than replacing
            // it; see `UtilityPolicy::decide` for the whole of that argument.
            move_dir: self.ordered_feet(obs, feet).unwrap_or(feet),
            intent,
            limb,
            slot: best,
        }
    }

    fn reset(&mut self) {
        self.memory.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{Faction, Body};

    /// One clean blow from `by`, as a fraction of `to`'s health bar. The
    /// observer in these fixtures is a Rogue; see `situation`.
    fn exchange(by: Body, to: Body) -> Fx {
        sim::peak_damage(arm_of(by), by.base_stats()) / to.base_stats().max_hp()
    }

    fn arm_of(kind: Body) -> sim::Arm {
        sim::Arm::resolve(kind.legacy_weapon(), kind.base_stats(), kind.radius())
    }

    /// Ground one clean blow from `by` costs `to`, in `to`'s body radii.
    /// `World::knockback`, re-derived here so the fixture stays a fixture.
    fn ground(by: Body, to: Body) -> Fx {
        let dv = sim::peak_impulse(arm_of(by)) / to.mass();
        let stop = fx::mul_div(dv, dv, to.base_stats().traction() * Fx::TWO);
        stop / to.radius()
    }

    fn contact(kind: Body, x: i32, y: i32) -> Contact {
        let offset = Vec2::from_ints(x, y);
        Contact {
            id: EntityId::new(1, 0),
            offset,
            distance: offset.length(),
            hp_frac: Fx::ONE,
            radius: kind.radius(),
            action_length: kind.legacy_weapon().length,
            // The real figures, unblurred: these fixtures are testing what a
            // policy does with a correct read, and the tests that care about a
            // wrong one set it themselves.
            min_strike_range: sim::dead_zone(arm_of(kind)),
            threat: exchange(kind, Body::Rogue),
            frailty: exchange(Body::Rogue, kind),
            knockback_taken: ground(kind, Body::Rogue),
            knockback_dealt: ground(Body::Rogue, kind),
            heft: kind.mass() / Body::Rogue.mass(),
            velocity: Vec2::ZERO,
            facing: Angle::HALF,
            limb_angle: Angle::HALF,
            limb_reach: Fx::ONE,
            limb_spin: Fx::ZERO,
            limb_swing: sim::Swing::Guard,
            limb_left: Fx::ZERO,
            limb_line: Angle::HALF,

            action: sim::ActionKind::Sword,
            action_arc: 0,
        }
    }

    /// A contact mid-windup: a cut declared on `line`, `left` ticks from going
    /// live. The situation the whole policy exists to answer.
    fn winding_up(kind: Body, x: i32, y: i32, line: Angle, left: u16) -> Contact {
        let mut c = contact(kind, x, y);
        c.limb_swing = sim::Swing::Windup;
        c.limb_left = Fx::from_int(left as i32);
        c.limb_line = line;
        // A cocked blade sits `WINDUP_ARC` off the line it is aimed along, which
        // is the trap a defender that covers the *blade* walks into.
        c.limb_angle = line + Angle::from_raw(sim::WINDUP_ARC as u16);
        c
    }

    /// A contact that has just missed and cannot answer anything.
    fn recovering(kind: Body, x: i32, y: i32, left: u16) -> Contact {
        let mut c = contact(kind, x, y);
        c.limb_swing = sim::Swing::Recover;
        c.limb_left = Fx::from_int(left as i32);
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
        obs.radius = Body::Rogue.radius();
        obs.action_length = Body::Rogue.legacy_weapon().length;
        obs.action_arc = Body::Rogue.legacy_weapon().arc;
        // A Rogue's real dead zone. Leaving it at the `blank` default of zero
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

    /// Puts `held` in the observer's hand, with a sword in the other slot.
    ///
    /// `action_length` and `action_arc` move with it, because they are columns
    /// of the thing being held and not of the body -- an observation claiming a
    /// shield in hand and a sword's reach is a fighter no `World` can produce,
    /// and every mind reads both.
    fn holding(obs: &Observation, held: sim::ActionKind) -> Observation {
        let mut obs = obs.clone();
        let spec = held.spec();
        obs.held = held;
        obs.slot = 0;
        obs.stowed = Some(sim::ActionKind::Sword);
        obs.swap_ticks = spec.ready;
        obs.action_length = spec.length;
        obs.action_arc = spec.arc;
        obs
    }

    /// The same situation under a live `Order::Goto`, routed along `offset`.
    ///
    /// The route has to be stated because the policy does not derive one: it
    /// reads `nav_dir`/`nav_distance`, which the sim fills from the floor plan,
    /// and an observation that leaves them blank is saying "there is no way
    /// there". On open ground the sim's answer is exactly the straight line, so
    /// that is what this states -- the same fixture `UtilityPolicy`'s `goto_*`
    /// tests use, shaped like `holding` because it is the same kind of edit.
    fn heading_for(obs: &Observation, offset: Vec2) -> Observation {
        let mut obs = obs.clone();
        obs.order = Order::Goto(obs.position + offset);
        obs.nav_dir = offset.normalize();
        obs.nav_distance = offset.length();
        obs
    }

    /// The same situation under a live `Order::Focus` on `foe`, with the route
    /// the sim would have computed for it across open ground -- straight at the
    /// body, since that is what `nav_goal_point` resolves a quarry to.
    ///
    /// Shaped like `heading_for` because it is the same kind of edit, and stated
    /// for the same reason: an observation with `nav_dir` left blank is the sim
    /// saying there is no way there, which the policy correctly answers by not
    /// pursuing.
    fn locked_on(obs: &Observation, foe: &Contact) -> Observation {
        let mut obs = obs.clone();
        obs.order = Order::Focus(foe.id);
        obs.nav_dir = foe.offset.normalize();
        obs.nav_distance = foe.distance;
        obs
    }

    /// **The click that means two different things, and the whole reason the ring
    /// is the mind's own number rather than a constant.**
    ///
    /// One fixture, one distance, one order: a Brute three units off, named. What
    /// changes between the two halves is the thing in the fighter's hand, and the
    /// footwork comes out opposed -- the swordsman closes and the archer gives
    /// ground. Neither mind knows anything about orders; `ordered_feet` asks
    /// whichever one is holding the limb where it wants to stand and anchors the
    /// pull at a ring that size, so a bow's answer of four units puts three
    /// comfortably inside the ring while a blade's of 1.13 puts it well outside.
    ///
    /// This is the property session 3 exists for, stated at the level where it is
    /// one line of arithmetic. `tests/focus.rs` states the same thing the
    /// expensive way, over hundreds of ticks of a real world, and that one is what
    /// catches a ring that is right for a decision and wrong for a fight.
    #[test]
    fn a_focus_means_close_to_a_swordsman_and_stop_there_to_an_archer() {
        let foe = contact(Body::Brute, 3, 0);
        let fighting = situation(&[foe]);

        let sword = locked_on(&holding(&fighting, sim::ActionKind::Sword), &foe);
        let closing = DuelistPolicy::baseline().decide(&sword).move_dir;
        assert!(
            closing.x > Fx::from_ratio(9, 10),
            "a swordsman told to fight something three units away did not close: {closing:?}"
        );

        let bow = locked_on(&holding(&fighting, sim::ActionKind::Bow), &foe);
        let standing = DuelistPolicy::baseline().decide(&bow).move_dir;
        assert!(
            standing.x < Fx::ZERO,
            "an archer walked onto the Brute it was told to shoot: {standing:?}"
        );
    }

    /// **Inside the ring the order is not merely weaker, it is gone.**
    ///
    /// The taper is quadratic in the gap and the gap is floored at zero, so a
    /// focused fighter that is already inside its ring gets its own footwork back
    /// byte for byte -- not approximately, and not most of it. That exactness is
    /// worth pinning rather than bounding: it is what makes the mechanism safe to
    /// leave switched on during a fight, and the alternative -- a residual pull of
    /// a few hundredths, always inward -- is precisely the kind of thing that
    /// would go unnoticed for a long time and then show up as an archer that
    /// creeps.
    ///
    /// The unordered control is the same policy on the same observation with the
    /// order taken off, so a failure here is the leash and cannot be the fixture.
    #[test]
    fn a_quarry_inside_the_ring_leaves_the_footwork_untouched() {
        let foe = contact(Body::Brute, 3, 0);
        let fighting = holding(&situation(&[foe]), sim::ActionKind::Bow);
        let locked = locked_on(&fighting, &foe);

        let free = DuelistPolicy::baseline().decide(&fighting).move_dir;
        let ordered = DuelistPolicy::baseline().decide(&locked).move_dir;
        assert_eq!(
            (ordered.x.raw(), ordered.y.raw()),
            (free.x.raw(), free.y.raw()),
            "the order went on pulling from inside its own ring"
        );
        // ...and the answer it was left with is a real one rather than a stand
        // still, which is what stops this passing for the wrong reason.
        assert!(
            free.x < Fx::ZERO,
            "the fixture stopped being about an archer with ground to give: {free:?}"
        );
    }

    /// A quarry that is not a visible contact is pursued at full strength.
    ///
    /// There is no ring to size without a contact, and none is wanted: sight range
    /// is longer than any standoff in the stat range, so the hand-off from pursuit
    /// to fight always happens on the way in and never at the last moment. The
    /// fighter here can see one enemy and has been told to kill a different one,
    /// which is the state a hero is in for the whole of a chase round a corner --
    /// it defends itself against what is in front of it while the feet carry on
    /// toward what it was sent after.
    #[test]
    fn a_quarry_out_of_sight_is_pursued_and_not_stood_off_from() {
        let seen = contact(Body::Brute, 3, 0);
        let mut obs = holding(&situation(&[seen]), sim::ActionKind::Bow);
        // Named, and not among the contacts: `find` comes back empty and the ring
        // is a zero.
        obs.order = Order::Focus(EntityId::new(77, 0));
        obs.nav_dir = Vec2::Y;
        obs.nav_distance = Fx::from_int(10);

        let mut policy = DuelistPolicy::baseline();
        let command = policy.decide(&obs);
        assert!(
            command.move_dir.y > Fx::from_ratio(9, 10),
            "gave up the pursuit the moment the quarry left sight: {:?}",
            command.move_dir
        );
        // And it is still fighting the thing in front of it, which is the half of
        // the rule that keeps a pursuing hero alive.
        assert_eq!(command.intent, Intent::Attack(seen.id));
    }

    /// Nothing in sight at all, which is `march`'s case and where the pursuit used
    /// to quietly stop.
    ///
    /// A `Focus` shared an arm with `Hold` here and so produced no heading, fell
    /// through to `patrol_heading`, and swept the room the hero was standing in
    /// while its quarry walked away. Something that can be shaken off by stepping
    /// behind a wall was never locked on to.
    #[test]
    fn a_quarry_round_a_corner_is_still_walked_after() {
        let mut obs = situation(&[]);
        obs.order = Order::Focus(EntityId::new(77, 0));
        obs.nav_dir = Vec2::Y;
        obs.nav_distance = Fx::from_int(10);

        let moved = DuelistPolicy::baseline().decide(&obs).move_dir;
        assert!(
            moved.y > Fx::from_ratio(9, 10),
            "wandered instead of following the route to the quarry: {moved:?}"
        );
    }

    /// **A click is a command, not a suggestion**, and these four are the whole
    /// of the order channel. Before `ordered_feet` reached `decide`, every one of
    /// them would have answered with the mind's footwork: `march` is the only
    /// reader of `Order::Goto` and `decide` returns out of it the moment anything
    /// is in sight, so in a dungeon the player had no order channel at all.
    ///
    /// All four route *north* while the enemy stands *east*, which is what makes
    /// the two answers distinguishable component by component: from dead centre
    /// every stance's footwork lies along x alone, and the route lies along y
    /// alone.
    ///
    /// The route's is no longer the only surviving component. At full stretch the
    /// leash keeps `LEASH_LANE` of the mind's own footwork -- room to sidestep a
    /// blade on the way -- so these assert the proportion rather than a zero.
    #[test]
    fn a_click_moves_the_feet_with_an_enemy_in_sight() {
        let foe = contact(Body::Brute, 9, 0);
        let obs = heading_for(&situation(&[foe]), Vec2::from_ints(0, 10));

        let command = DuelistPolicy::baseline().decide(&obs);
        assert!(
            command.move_dir.x.abs() <= crate::utility::LEASH_LANE,
            "closed on the enemy instead of walking the route: {:?}",
            command.move_dir
        );
        assert!(
            command.move_dir.y > Fx::from_ratio(9, 10),
            "did not walk the route: {:?}",
            command.move_dir
        );
        // **Only the feet.** The stance, the target memory and the limb are
        // untouched, so this is a duellist walking where it was told while it
        // goes on fighting.
        assert_eq!(command.intent, Intent::Attack(foe.id));
    }

    #[test]
    fn an_order_with_no_objective_leaves_the_fight_alone() {
        let foe = contact(Body::Brute, 9, 0);
        let fighting = situation(&[foe]);
        let mut ordered = heading_for(&fighting, Vec2::from_ints(0, 10));
        // **The lab's case, and the regression test for the hash contract.** No
        // scenario the lab runs sets an objective, so `nav_step` is silent even
        // where an order exists, and a policy acting on the order rather than on
        // the route would move every pinned hash in the repository.
        ordered.nav_dir = Vec2::ZERO;
        ordered.nav_distance = Fx::MAX;

        // A policy each: the stance carries hysteresis between decisions, so a
        // shared one would answer the second observation differently for a
        // reason that has nothing to do with the order.
        assert_eq!(
            DuelistPolicy::baseline().decide(&ordered).move_dir,
            DuelistPolicy::baseline().decide(&fighting).move_dir,
            "an order with nowhere to go moved the feet anyway"
        );
    }

    #[test]
    fn an_arrived_order_hands_the_feet_back() {
        let foe = contact(Body::Brute, 9, 0);
        let fighting = situation(&[foe]);
        let mut arrived = heading_for(&fighting, Vec2::from_ints(0, 10));
        // A fifth of the way into the ring. There is no bound to sit on any more
        // -- the pull tapers from `LEASH_ROAM` to nothing at the anchor -- and a
        // fifth of the way in leaves the order a twenty-fifth of its strength.
        // The heading is still there, so this is the leash relaxing rather than
        // `nav_step` reporting no route; the two still share an answer, which is
        // why it can stay an `Option` rather than becoming an enum.
        arrived.nav_distance = crate::utility::LEASH_ROAM * Fx::from_ratio(1, 5);

        let moved = DuelistPolicy::baseline().decide(&arrived).move_dir;
        let duelling = DuelistPolicy::baseline().decide(&fighting).move_dir;
        // Not byte-identical any more, and that is the change rather than a
        // tolerance being waved through: the order has relaxed, not switched off.
        // The two axes are what separate whose answer this is.
        assert!(
            (moved.x - duelling.x).abs() < Fx::from_ratio(5, 100),
            "the duel did not get its feet back: {moved:?} against {duelling:?}"
        );
        assert!(
            moved.y < moved.x * Fx::from_ratio(1, 10),
            "still walking the route instead of fighting: {moved:?}"
        );
        // ...and the answer it went back to is the fight's: at nine units a
        // duellist closes.
        assert!(moved.x > Fx::ZERO, "handed the feet back and then froze: {moved:?}");
    }

    #[test]
    fn a_wounded_fighter_still_obeys() {
        // The fixture from `a_hurt_duellist_breaks_off_whatever_else_is_happening`,
        // which is the one thing this policy calls flight. `caution` is counted in
        // blows rather than in health, and a twentieth of a Rogue is well inside
        // one from a Brute's club.
        let mut hurt = situation(&[winding_up(Body::Brute, 2, 0, Angle::HALF, 3)]);
        hurt.hp_frac = Fx::from_ratio(1, 20);
        let obs = heading_for(&hurt, Vec2::from_ints(0, 10));

        let mut policy = DuelistPolicy::baseline();
        let command = policy.decide(&obs);
        assert_eq!(
            policy.stance_of(obs.me),
            Some(Stance::Retreat),
            "the fixture stopped being about a fighter that wanted to run"
        );
        // `Stance::Retreat`'s footwork is due west, straight away from the
        // enemy. The player is answering the same question and the player wins,
        // 1.0 of order against `LEASH_LANE` of flight.
        assert!(
            command.move_dir.x < Fx::ZERO
                && command.move_dir.x.abs() <= crate::utility::LEASH_LANE,
            "bolted rather than obeying: {:?}",
            command.move_dir
        );
        assert!(
            command.move_dir.y > Fx::from_ratio(9, 10),
            "did not walk the route: {:?}",
            command.move_dir
        );
        // And it still says it is breaking off, which is honest: that *is* what
        // it wanted to do.
        assert_eq!(command.intent, Intent::Flee);
    }

    /// **Legs run away.** The word means one thing, and the mind that answers
    /// for it used to read the distance both ways and sprint *at* an enemy it
    /// could not touch when it was far enough off. See `RunMind`.
    #[test]
    fn legs_carry_a_fighter_away_from_the_fight_and_never_into_it() {
        let mut policy = DuelistPolicy::baseline();
        // Every distance a contact can be at, including the ones the old mind
        // treated as an argument for charging.
        for x in [1, 3, 6, 9, 12] {
            let obs = holding(&situation(&[contact(Body::Brute, x, 0)]), sim::ActionKind::Run);
            let command = policy.decide(&obs);
            assert!(
                command.move_dir.x < Fx::ZERO,
                "legs carried a fighter *toward* an enemy {x} units away: {:?}",
                command.move_dir
            );
            // And it says so. A runner reported as attacking is a HUD lying
            // about the one thing on screen it can see for itself.
            assert_eq!(command.intent, Intent::Flee, "a fighter in flight reported otherwise");
        }
    }

    /// **A guard never closes.** Giving ground is a judgement it is allowed to
    /// make; walking in behind a shield is not one, because there is nothing on
    /// the other side of that walk it could spend the distance on.
    #[test]
    fn a_guard_never_walks_into_the_blade_it_is_covering() {
        let mut policy = DuelistPolicy::baseline();
        for x in [1, 2, 3, 6, 9] {
            for foe in [
                contact(Body::Brute, x, 0),
                // The case the footwork is actually about: a cut declared and
                // on its way. `Angle::HALF` is the line back toward the
                // observer, so this one is genuinely aimed.
                winding_up(Body::Brute, x, 0, Angle::HALF, 20),
                recovering(Body::Brute, x, 0, 10),
            ] {
                let obs = holding(&situation(&[foe]), sim::ActionKind::Shield);
                let command = policy.decide(&obs);
                assert!(
                    command.move_dir.x <= Fx::ZERO,
                    "a guard closed on an enemy {x} units away: {:?}",
                    command.move_dir
                );
            }
        }
    }

    /// The half of the guard's footwork that the damage law decides: a retreat
    /// is worth making only when it finishes, because a blow is worth `1/2 m v^2`
    /// at the radius it lands on and half a pace back slides the contact toward
    /// the tip. See `GuardMind::drive`.
    #[test]
    fn a_guard_gives_ground_to_a_cut_it_can_clear_and_stands_to_one_it_cannot() {
        let mut policy = DuelistPolicy::baseline();
        // A Brute's club reaches 1.45 past two bodies, so a Rogue standing at 2
        // is a little under a unit inside it. At 40 ticks of telegraph there is
        // ground and time to spare; at 2 there is neither.
        let long = winding_up(Body::Brute, 2, 0, Angle::HALF, 40);
        let late = winding_up(Body::Brute, 2, 0, Angle::HALF, 2);

        let early = policy.decide(&holding(&situation(&[long]), sim::ActionKind::Shield));
        assert!(
            early.move_dir.x < Fx::ZERO,
            "a guard stood in front of a cut it had forty ticks to walk out of"
        );

        let caught = policy.decide(&holding(&situation(&[late]), sim::ActionKind::Shield));
        assert_eq!(
            caught.move_dir,
            Vec2::ZERO,
            "a guard took a step it could not finish, which lands the blow \
             further out on the blade than standing still would have"
        );
    }

    #[test]
    fn out_of_reach_it_closes() {
        let far = contact(Body::Brute, 9, 0);
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
        let obs = situation(&[winding_up(Body::Brute, 2, 0, Angle::HALF, 3)]);
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
        let calm = situation(&[contact(Body::Brute, 2, 0)]);
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
        let obs = situation(&[winding_up(Body::Brute, 2, 0, Angle::HALF, 40)]);
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
        let obs = situation(&[recovering(Body::Brute, 2, 0, 40)]);

        let mut eager = DuelistPolicy::new(DuelistWeights {
            punish: Fx::from_int(3),
            ..DuelistWeights::BASELINE
        });
        assert_eq!(stance_for(&mut eager, &obs), Stance::Punish);
        // And it closes to do it, giving up spacing on purpose...
        assert!(eager.decide(&obs).move_dir.x > Fx::ZERO);
        // ...with an actual attack, not a pose.
        assert!(eager.decide(&obs).limb.strike.is_attack());
    }

    #[test]
    fn the_guard_covers_the_line_and_not_the_blade() {
        // The read that separates this policy from the naive one, and the one
        // that is least obvious. During a windup the blade is cocked a long way
        // *off* the line it is going to travel, so covering where the blade is
        // covers the one bearing the cut cannot arrive from.
        let line = Angle::HALF;
        let foe = winding_up(Body::Brute, 2, 0, line, 3);
        let obs = situation(&[foe]);

        let mut policy = DuelistPolicy::new(DuelistWeights {
            guard: Fx::from_int(3),
            evasion: Fx::ZERO,
            ..DuelistWeights::BASELINE
        });
        let command = policy.decide(&obs);
        assert_eq!(policy.stance_of(obs.me), Some(Stance::Guard));

        let covered = command.limb.angle;
        assert!(
            covered.delta(foe.limb_angle).abs() > 6_000,
            "the guard went to the cocked blade at {:?} rather than to the line",
            foe.limb_angle
        );
    }

    #[test]
    fn closing_is_done_with_the_blade_chambered() {
        // An attack thrown from out of range is a telegraph spent for nothing,
        // and it arrives in range mid-recovery -- which is precisely the state
        // this policy punishes other people for being in.
        let obs = situation(&[contact(Body::Brute, 9, 0)]);
        let mut policy = DuelistPolicy::baseline();
        let command = policy.decide(&obs);
        assert_eq!(policy.stance_of(obs.me), Some(Stance::Close));
        assert!(
            !command.limb.strike.is_attack(),
            "swung at something four body-lengths away"
        );
    }

    #[test]
    fn a_cut_is_thrown_at_the_side_the_guard_is_not_on() {
        // Enemy due east *holding a shield*, swung well off the line between
        // us. Two mirrored situations must produce two different sides, or the
        // choice is not being made at all.
        //
        // The enemy has to be holding a guard for this question to exist at
        // all. With one limb there is no separate shield bearing to read, so
        // "which side is open" is a question about a guard-role action -- and
        // against a blade the honest answer is that there is no wrong side,
        // which `a_cut_at_an_unguarded_enemy_takes_the_short_way_round` pins.
        let guarded = |degrees: i32| {
            let mut c = contact(Body::Fighter, 1, 0);
            c.action = sim::ActionKind::Shield;
            c.action_arc = sim::ActionKind::Shield.spec().arc;
            c.limb_angle = Angle::from_degrees(degrees);
            c
        };

        let mut policy = DuelistPolicy::baseline();
        let a = policy.decide(&situation(&[guarded(135)])).limb.strike;
        policy.reset();
        let b = policy.decide(&situation(&[guarded(-135)])).limb.strike;
        assert!(a.is_attack() && b.is_attack(), "{a:?} / {b:?}");
        assert_ne!(a, b, "the same side was chosen against opposite guards");
    }

    #[test]
    fn a_cut_at_an_unguarded_enemy_takes_the_short_way_round() {
        // The other half of the rule above. An enemy holding a blade has no
        // flank that is safer than the other, so committing to a side would
        // cock the blade the long way round to answer a question nobody asked.
        let mut c = contact(Body::Fighter, 1, 0);
        c.action = sim::ActionKind::Sword;
        c.limb_angle = Angle::from_degrees(135);
        assert_eq!(swing::open_side(&c), Strike::Nearest);
        c.limb_angle = Angle::from_degrees(-135);
        assert_eq!(swing::open_side(&c), Strike::Nearest);
    }

    #[test]
    fn a_hurt_duellist_breaks_off_whatever_else_is_happening() {
        let mut obs = situation(&[winding_up(Body::Brute, 2, 0, Angle::HALF, 3)]);
        obs.hp_frac = Fx::from_ratio(1, 20);

        // On the shipped weights on purpose. Breaking off is the one stance a
        // duel arena will never select for -- there is nowhere to break off to
        // and the clock is against you -- so `caution` is hand-set, and a
        // hand-set gene with no test on it is a gene that quietly rots.
        let mut policy = DuelistPolicy::baseline();
        assert_eq!(stance_for(&mut policy, &obs), Stance::Retreat);
        let command = policy.decide(&obs);
        assert_eq!(command.intent, Intent::Flee);
        assert!(command.move_dir.x < Fx::ZERO, "fled toward the enemy");
    }

    #[test]
    fn breaking_off_is_counted_in_blows_and_not_in_health() {
        // The same fighter, the same wound, two different opponents. A flat
        // health threshold cannot tell these apart and that was the bug: 30% of
        // a Rogue is most of the way through one blow from a Brute and a
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
        assert_eq!(against(Body::Brute), Stance::Retreat);
        assert_ne!(
            against(Body::Skitterer),
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
            let mut foe = contact(Body::Brute, 2, 0);
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
        let obs = situation(&[winding_up(Body::Fighter, 2, 0, Angle::HALF, 10)]);

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
        // The bug this replaced: scaling by the *enemy's* reach parked a Rogue
        // 1.55 units from a Brute, where its own 0.90 of reach only just
        // arrives on a 0.70 body and the Brute's blade is still moving fast
        // enough to hurt. A duellist must never choose a distance from which it
        // cannot fight back.
        let policy = DuelistPolicy::baseline();
        let obs = situation(&[]);
        for kind in Body::ALL {
            let foe = contact(kind, 5, 0);
            let ideal = DuelistPolicy::preferred_range(&policy.weights, &obs, &foe);
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
            DuelistPolicy::preferred_range(&policy.weights, &obs, &contact(Body::Brute, 5, 0))
                > DuelistPolicy::preferred_range(&policy.weights, &obs, &contact(Body::Skitterer, 5, 0))
        );
    }

    #[test]
    fn the_preferred_range_is_never_inside_the_two_bodies() {
        // The trap in correcting the floor to a hypotenuse: `hypot(a, b)` is
        // smaller than `a + b`, and for the light end of the roster it comes out
        // *inside contact* -- a distance the sim spends every tick undoing. A
        // Rogue mirror asking for it drove permanently into itself and timed out
        // at full health on both sides, which reads as a policy that will not
        // fight and was a policy asking for somewhere it could not stand.
        let policy = DuelistPolicy::baseline();
        let obs = situation(&[]);
        for kind in Body::ALL {
            let foe = contact(kind, 5, 0);
            let ideal = DuelistPolicy::preferred_range(&policy.weights, &obs, &foe);
            assert!(
                ideal >= obs.radius + foe.radius,
                "against a {} it wants {ideal}, inside the {} the two bodies take up",
                kind.name(),
                obs.radius + foe.radius
            );
        }
    }

    #[test]
    fn a_moving_enemy_is_still_cut_at_where_it_is_standing() {
        // **Pins a measured negative**, which is the only reason a test asserts
        // that nothing happens. Leading a target was built here twice and
        // measured worse both times; see `DuelistPolicy::act` for the numbers.
        // Without this, the next person to notice `Contact::velocity` sitting
        // unused rediscovers it, and the arc is wide enough that the loss is
        // small enough to miss.
        let mut walking = contact(Body::Fighter, 2, 0);
        walking.velocity = Vec2::new(Fx::ZERO, Fx::from_ratio(6, 100));
        let still = contact(Body::Fighter, 2, 0);

        let mut policy = DuelistPolicy::baseline();
        let moving_aim = policy.decide(&situation(&[walking])).limb.angle;
        policy.reset();
        let still_aim = policy.decide(&situation(&[still])).limb.angle;
        assert_eq!(
            moving_aim, still_aim,
            "led a moving target, which four evolution runs and a direct sweep \
             both say costs win rate"
        );
    }

    #[test]
    fn a_fighter_sets_up_inside_the_mark_its_own_swing_will_drift_it_out_of() {
        // Recoil drags a swinging body along its own arc, which is *across* the
        // line to the enemy -- and a lateral step off a circle of radius `d`
        // lands you at `sqrt(d^2 + s^2)`, further out and never nearer. A
        // fighter that does not allow for it drifts steadily toward the far end
        // of its own reach.
        //
        // `standoff` is off the floor here on purpose: at zero the fighter is
        // already standing as close as it can and the clamp has the last word,
        // which is the correct behaviour and would make this test vacuous.
        let foe = contact(Body::Fighter, 3, 0);
        let mut obs = situation(&[foe]);
        obs.recoil_drift = Fx::ONE; // a whole body radius of ground

        let spendthrift = DuelistPolicy::new(DuelistWeights {
            standoff: Fx::HALF,
            footing: Fx::ZERO,
            ..DuelistWeights::BASELINE
        });
        let careful = DuelistPolicy::new(DuelistWeights {
            standoff: Fx::HALF,
            footing: Fx::ONE,
            ..DuelistWeights::BASELINE
        });
        assert!(
            DuelistPolicy::preferred_range(&careful.weights, &obs, &foe) < DuelistPolicy::preferred_range(&spendthrift.weights, &obs, &foe),
            "budgeted no ground at all for a swing worth a body radius of it"
        );

        // And a fighter whose weapon does not move it stands where it always did.
        obs.recoil_drift = Fx::ZERO;
        assert_eq!(
            DuelistPolicy::preferred_range(&careful.weights, &obs, &foe),
            DuelistPolicy::preferred_range(&spendthrift.weights, &obs, &foe)
        );
    }

    #[test]
    fn nobody_can_be_crowded_far_enough_in_for_a_shoulder_to_beat_a_sword() {
        // **Pins the second measured negative of the phase.** A body-check was
        // built as a ninth stance -- walk through somebody inside the distance
        // you chose who weighs less than you -- and it never fires. The ceiling
        // is algebra rather than tuning, and this is that algebra, held against
        // the roster so it fails if the roster ever moves far enough to make the
        // stance worth rebuilding.
        //
        // The most crowded anyone can be is bodies touching. `Trade` scores 1.4.
        let policy = DuelistPolicy::baseline();
        let mut best = Fx::ZERO;
        for me in Body::ALL {
            let mut obs = situation(&[]);
            obs.radius = me.radius();
            obs.action_length = me.legacy_weapon().length;
            obs.min_strike_range = sim::dead_zone(arm_of(me));
            for them in Body::ALL {
                let mut foe = contact(them, 5, 0);
                foe.heft = them.mass() / me.mass();
                foe.distance = obs.radius + foe.radius; // touching
                let ideal = DuelistPolicy::preferred_range(&policy.weights, &obs, &foe);
                let crowded = (Fx::ONE - foe.distance / ideal).clamp(Fx::ZERO, Fx::ONE);
                let lighter = (Fx::ONE - foe.heft).clamp(Fx::ZERO, Fx::ONE);
                best = best.max(Fx::from_int(3) * crowded * lighter);
            }
        }
        assert!(
            best < Fx::from_ratio(14, 10),
            "a body-check is worth {best} at the top of its range against a \
             Trade score of 1.4 -- the roster has moved and the stance removed \
             in the policy phase is worth rebuilding"
        );
    }


    #[test]
    fn a_blow_that_throws_you_is_worth_planting_for_even_when_it_barely_hurts() {
        // The second thing a braced shield buys. `sim::BRACE_ANCHOR` takes seven
        // tenths of the shove out of a blow the guard caught, and the roster
        // ranks *hurting* and *moving* differently on purpose -- so a fighter
        // reading only `threat` has no reason to plant against a weapon that
        // will not wound it and will send it across the arena.
        // A Brute rather than something actually light, because the archetype is
        // beside the point and its reach is not: at this range a Fighter's cut
        // does not arrive, `swing::landing` correctly says so, and there would
        // be nothing to plant against.
        let mut light = winding_up(Body::Brute, 2, 0, Angle::HALF, 3);
        light.threat = Fx::from_ratio(2, 100); // a scratch
        light.knockback_taken = Fx::ZERO;
        let mut heavy = light;
        heavy.knockback_taken = Fx::ONE; // ...that puts you a body away

        let mut anchored = DuelistPolicy::new(DuelistWeights {
            guard: Fx::ZERO,
            evasion: Fx::ZERO,
            anchor: Fx::from_int(3),
            read_ahead: Fx::from_int(3),
            ..DuelistWeights::BASELINE
        });
        assert_eq!(stance_for(&mut anchored, &situation(&[heavy])), Stance::Guard);
        anchored.reset();
        assert_ne!(
            stance_for(&mut anchored, &situation(&[light])),
            Stance::Guard,
            "planted against a blow that neither hurt it nor moved it"
        );
    }

    #[test]
    fn losing_sight_forgets_the_read() {
        let obs = situation(&[contact(Body::Brute, 3, 0)]);
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
            let mut c = contact(Body::Brute, step % 7 - 3, step % 5 - 2);
            c.limb_angle = Angle::from_raw((step * 1024) as u16);
            c.limb_spin = Fx::from_int((step - 32) * 200);
            c.limb_angle = Angle::from_raw((step * 2048) as u16);
            c.limb_reach = Fx::from_ratio(step % 4, 3);
            let mut obs = situation(&[c]);
            obs.hp_frac = Fx::from_ratio(step % 11, 10);
            let command = policy.decide(&obs);
            assert!(
                command.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                "step {step}: {:?}",
                command.move_dir
            );
        }
    }
}
