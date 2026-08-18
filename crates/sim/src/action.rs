//! What a fighter is holding, and what that does.
//!
//! A [`crate::Body`] is a size, a weight and a stat sheet. It is not a swordsman
//! and it is not a shield-bearer -- it fights with whatever is in its hand, and
//! *that* is an [`ActionKind`]. One action is active at a time, which is the
//! whole of what this module exists to say.
//!
//! The split fixes two things the old model could not express.
//!
//! **A Skitterer used to *be* a knife.** Body size, density, stats, weapon and
//! shield arc all hung off one enum variant, so "what does a Brute with a knife
//! play like" was a question with no representation. Now it is a loadout.
//!
//! **Blocking used to be free.** The shield was a passive geometry query against
//! an off-hand nothing charged for, so every policy held it out permanently, in
//! every stance, forever. A guard is an [`ActionKind`] now: holding one means
//! *not* holding a blade, and the swap between them is paid for in
//! [`ActionSpec::ready`] ticks. Defending and pressing are finally alternatives.

use fx::Fx;

/// What kind of thing an action is.
///
/// Decides which of the sim's limb rules applies, and nothing else -- every
/// number lives in the [`ActionSpec`]. Kept deliberately coarse: a role is a
/// branch in `World`, and a fifth one is a fifth code path through the tick.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum Role {
    /// A blade that deals blows in [`crate::Swing::Strike`]. Runs the phase
    /// machine. Cannot block.
    Strike,
    /// A guard that covers [`ActionSpec::arc`] and can be braced. No blade
    /// hitbox and no phases: a guard-role limb sits in [`crate::Swing::Guard`]
    /// until it is swapped away.
    Guard,
    /// Neither. Buys footspeed through [`ActionSpec::move_bonus`].
    Move,
    /// Runs a phase machine like [`Role::Strike`], but spends the strike on a
    /// projectile rather than on a segment sweep: one tick of release, and then
    /// the arrow is [`crate::World::resolve_shots`]'s problem. No blade hitbox,
    /// so it can neither cut nor parry nor be parried.
    Shoot,
}

impl Role {
    pub const ALL: [Role; 4] = [Role::Strike, Role::Guard, Role::Move, Role::Shoot];

    /// One-hot index for the neural feature encoder. Append-only, like
    /// [`crate::Strike::discriminant`].
    pub const fn discriminant(self) -> usize {
        match self {
            Role::Strike => 0,
            Role::Guard => 1,
            Role::Move => 2,
            Role::Shoot => 3,
        }
    }

    /// Number of distinct roles; the width of the one-hot block.
    pub const COUNT: usize = 4;

    /// Whether a limb holding this is a **blade segment**: something that can
    /// cut, be crossed, and be parried. The gate that replaced "every unit has a
    /// blade because every unit has a `Body`".
    ///
    /// Deliberately narrower than [`Role::can_attack`]. The two coincided while
    /// every attack was a swing, and [`Role::Shoot`] is what separates them: a
    /// bow attacks and has no hitbox anywhere on it.
    #[inline]
    pub const fn is_live_capable(self) -> bool {
        matches!(self, Role::Strike)
    }

    /// Whether a limb holding this runs the four-phase attack machine at all.
    ///
    /// Asks "can this thing attack", where [`Role::is_live_capable`] asks "is
    /// this thing a blade". Conflating them is the same class of mistake
    /// [`Role::blocks`] exists to have already fixed, and it has one especially
    /// quiet failure: `policy::swing::press` gates on this, so a role that
    /// attacks but reports otherwise would draw, aim, and never loose -- with
    /// nothing failing anywhere.
    #[inline]
    pub const fn can_attack(self) -> bool {
        matches!(self, Role::Strike | Role::Shoot)
    }

    /// Whether a limb holding this blocks. **The one line that makes blocking a
    /// choice** -- see [`crate::World::block_leak`].
    #[inline]
    pub const fn blocks(self) -> bool {
        matches!(self, Role::Guard)
    }

    pub const fn name(self) -> &'static str {
        match self {
            Role::Strike => "strike",
            Role::Guard => "guard",
            Role::Move => "move",
            Role::Shoot => "shoot",
        }
    }
}

/// One mechanic, named.
///
/// **Append-only.** These codes cross the wasm wall, key a one-hot block in the
/// feature vector, and reach [`crate::World::state_hash`]; a reshuffle voids
/// every recorded run and every trained network at once.
///
/// [`ActionKind::Run`] and [`ActionKind::Bow`] were named and priced here a
/// release before they had rules, so that landing them moved no discriminant, no
/// feature layout and no frame stride. It worked -- `FEATURE_LAYOUT_VERSION` did
/// not move for either -- which is the argument for reserving the next one the
/// same way. Ask [`ActionKind::PLAYABLE`] for what the sim will actually run.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Default)]
pub enum ActionKind {
    /// The floor. No weapon at all, barely reaches past the knuckles, and
    /// cheaper to bring up than anything else in the game.
    #[default]
    Punch,
    /// Short, dense, hafted well forward. The answer to another knife.
    Knife,
    /// The reference blade, and the reference everything: a Fighter holding one
    /// is what every ratio in [`crate::rules`] is measured against.
    Sword,
    /// Long, heavy, tip-weighted. Announces itself for more than half a second
    /// and makes you pay for the whole of it if you miss.
    Club,
    /// A guard. Covers an arc, brakes a blow, and cannot answer one.
    Shield,
    /// Footspeed, and nothing in your hands. The only loadout in the game that
    /// can neither cut, block nor parry.
    Run,
    /// Reach without a blade, paid for in telegraph -- and in standing still to
    /// draw it, which is where the price actually lands. See `BowMind`.
    Bow,
    /// Hilt-heavy and short: the lowest inertia of anything with a real edge, so
    /// it is the one blade that reaches the arm's ceiling early and coasts.
    ///
    /// **Appended, not planned.** The Rogue's blade was to retire into
    /// [`ActionKind::Knife`] and the body keep its identity through stats alone.
    /// Measured, that put a duelling Rogue at 6.7% against a Brute -- 0.75 units
    /// of total reach against 2.15 is not an archetype, it is a body that cannot
    /// participate. Handing it a [`ActionKind::Sword`] instead fixed the number
    /// (48%) and cost the thing the number was for: a Rogue swinging a Fighter's
    /// arming sword is a small Fighter, not a quick one.
    ///
    /// So the retired Scout blade comes back as a row of its own, which is what
    /// the registry is for -- a weapon nobody else in the roster wants is a line
    /// of table rather than a special case in a body.
    Shortsword,
}

impl ActionKind {
    pub const ALL: [ActionKind; 8] = [
        ActionKind::Punch,
        ActionKind::Knife,
        ActionKind::Sword,
        ActionKind::Club,
        ActionKind::Shield,
        ActionKind::Run,
        ActionKind::Bow,
        ActionKind::Shortsword,
    ];

    /// Everything the sim will actually run today. The UI reads this rather than
    /// [`ActionKind::ALL`], so a reserved row cannot be handed to a fighter that
    /// has no rule for it.
    ///
    /// Appended to rather than re-ordered when a row lands, because
    /// `web::action_code` hands the page an *index* into this array and a
    /// reshuffle would move every menu entry sideways.
    pub const PLAYABLE: [ActionKind; 8] = [
        ActionKind::Punch,
        ActionKind::Knife,
        ActionKind::Sword,
        ActionKind::Club,
        ActionKind::Shield,
        ActionKind::Shortsword,
        ActionKind::Run,
        ActionKind::Bow,
    ];

    /// Number of distinct actions; the width of the one-hot block.
    pub const COUNT: usize = 8;

    /// Append-only. Indexes [`ACTIONS`], crosses the wasm wall, and is the byte
    /// [`ActionKind::hash_into`] writes.
    pub const fn code(self) -> u32 {
        match self {
            ActionKind::Punch => 0,
            ActionKind::Knife => 1,
            ActionKind::Sword => 2,
            ActionKind::Club => 3,
            ActionKind::Shield => 4,
            ActionKind::Run => 5,
            ActionKind::Bow => 6,
            ActionKind::Shortsword => 7,
        }
    }

    /// Total, because this is what a replay and the page both come in through.
    /// An unknown code is refused rather than clamped -- a corrupt loadout must
    /// not silently become a punch.
    pub const fn from_code(code: u32) -> Option<ActionKind> {
        match code {
            0 => Some(ActionKind::Punch),
            1 => Some(ActionKind::Knife),
            2 => Some(ActionKind::Sword),
            3 => Some(ActionKind::Club),
            4 => Some(ActionKind::Shield),
            5 => Some(ActionKind::Run),
            6 => Some(ActionKind::Bow),
            7 => Some(ActionKind::Shortsword),
            _ => None,
        }
    }

    /// Whether the sim has a rule for this yet.
    ///
    /// Every row is playable as of `Run` and `Bow` landing, so this is `true`
    /// throughout. **Kept anyway, along with [`ActionKind::PLAYABLE`]**: the
    /// seam is what lets the next row be priced, hashed and feature-encoded a
    /// release before it has a rule, which is the whole reason those two landed
    /// without moving a discriminant or a layout version.
    pub const fn is_playable(self) -> bool {
        true
    }

    #[inline]
    pub const fn spec(self) -> ActionSpec {
        ACTIONS[self.code() as usize]
    }

    #[inline]
    pub const fn role(self) -> Role {
        self.spec().role
    }

    pub const fn name(self) -> &'static str {
        match self {
            ActionKind::Punch => "punch",
            ActionKind::Knife => "knife",
            ActionKind::Sword => "sword",
            ActionKind::Club => "club",
            ActionKind::Shield => "shield",
            ActionKind::Run => "run",
            ActionKind::Bow => "bow",
            ActionKind::Shortsword => "shortsword",
        }
    }

    // Unused until the world grows a loadout column; written here so the
    // registry arrives complete rather than half-defined.
    #[allow(dead_code)]
    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u8(self.code() as u8);
    }
}

/// An action's physical character.
///
/// This is the old `rules::Weapon` with the shield arc renamed, a [`Role`], and
/// two new columns. Every field it inherited means exactly what it meant: reach,
/// inertia and recovery are still separate knobs, so "long and slow" and "short
/// and quick" are still genuinely different problems rather than two points on
/// one difficulty axis.
///
/// What changed is who owns it. These numbers used to hang off the *archetype*,
/// which made a body and its weapon the same fact. They hang off the action now,
/// and [`crate::rules::Arm::resolve`] joins the two at the point of use.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ActionSpec {
    pub role: Role,
    /// Blade -- or guard -- length beyond the body surface at full extension,
    /// world units.
    pub length: Fx,
    /// How heavy it is, with a Fighter's body as the unit. Swing speed is
    /// derived from this and [`ActionSpec::balance`], so a heavier thing is
    /// slower because it is heavier. See [`crate::rules::grip_limit`].
    pub mass: Fx,
    /// Where the mass sits: `0` at the hilt, `1` at the tip. The single best
    /// knob for how a weapon *feels*, because moment of inertia goes as its
    /// square.
    pub balance: Fx,
    /// Guard arc half-width at full extension, raw angle units. **Zero unless
    /// [`Role::Guard`].**
    ///
    /// This field is the whole reason for the split. It used to live on the
    /// weapon, on the archetype, so every character in the game carried a shield
    /// for free whether or not it was holding one.
    pub arc: u16,
    /// **The telegraph.** Ticks the blade spends cocked back before a cut comes
    /// forward, at agility multiplier 1; see [`crate::rules::phase_ticks`].
    ///
    /// Best read against the *opponent's* [`crate::Stats::decision_period`]
    /// rather than against the other rows: it is how long they have to notice,
    /// decide and answer. Meaningless for [`Role::Guard`] and [`Role::Move`].
    pub windup: u16,
    /// Ticks to bring a spent limb back to guard, at agility multiplier 1. The
    /// punish window, and the price of missing.
    pub recovery: u16,
    /// **What it costs to bring this into your hand**, in ticks of
    /// [`crate::Swing::Swap`] at agility multiplier 1, during which nothing is
    /// live -- no blade, no guard, no parry.
    ///
    /// The single knob that decides whether a swap is a read or a spam, and it
    /// is set against the telegraphs above rather than against feel: a Fighter
    /// can bring a shield up inside a Club's 33-tick announcement and cannot
    /// inside a Knife's 7. Heavy weapons are therefore blockable *and*
    /// punishable, fast ones are neither, and the answer to a knife is to be
    /// holding one.
    ///
    /// Deliberately not spelled `windup`. A swap has no blow and no side, and
    /// reusing that field would make [`crate::Hand::phase_progress`] mean two
    /// different things depending on which phase asked.
    pub ready: u16,
    /// Multiplier on [`crate::Stats::move_speed`] while this is held. [`Fx::ONE`]
    /// for everything that is not [`ActionKind::Run`]; the column exists now so
    /// that landing `Run` is a table edit rather than a change to
    /// `World::apply_articulated_movement`.
    pub move_bonus: Fx,
}

/// The registry: one row per [`ActionKind`], indexed by [`ActionKind::code`].
///
/// `Knife`, `Sword` and `Club` are the retired Skitterer, Fighter and Brute
/// weapons field for field, so the four default loadouts reproduce the old
/// roster's damage, reach, spin, dead zone and telegraph exactly. The only
/// things this split changes are *who may hold what* and *what a guard costs* --
/// which is what makes the swap tuning below measurable against a known board
/// rather than against a fresh one.
pub const ACTIONS: [ActionSpec; ActionKind::COUNT] = [
    // Punch. Barely past the knuckles, and the one action nobody can be
    // disarmed of. Its `mass` is not flavour: at anything much lighter the grip
    // limit lets a fast body whip the fist past half a body-width in a tick and
    // the sweep test starts working for its living. See the tunnelling sweep in
    // `entity.rs`.
    ActionSpec {
        role: Role::Strike,
        length: Fx::from_ratio(18, 100),
        mass: Fx::from_ratio(65, 100),
        balance: Fx::from_ratio(30, 100),
        arc: 0,
        windup: 5,
        recovery: 7,
        ready: 2,
        move_bonus: Fx::ONE,
    },
    // Knife -- the Skitterer's. Dense for its size and hafted well forward,
    // which is what keeps a blade on a very short arm worth anything at all.
    // Seven ticks of telegraph is less than the fastest swap in the game, so a
    // knife is the one attack that cannot be answered by changing your mind.
    ActionSpec {
        role: Role::Strike,
        length: Fx::from_ratio(40, 100),
        mass: Fx::from_ratio(125, 100),
        balance: Fx::from_ratio(75, 100),
        arc: 0,
        windup: 7,
        recovery: 8,
        ready: 5,
        move_bonus: Fx::ONE,
    },
    // Sword -- the Fighter's arming sword, and the reference for everything.
    ActionSpec {
        role: Role::Strike,
        length: Fx::from_ratio(95, 100),
        mass: Fx::from_ratio(124, 100),
        balance: Fx::from_ratio(55, 100),
        arc: 0,
        windup: 14,
        recovery: 16,
        ready: 10,
        move_bonus: Fx::ONE,
    },
    // Club -- the Brute's long two-handed axe. Six times a sword's blade inertia
    // and 33 ticks of announcement on the body that carries it by default. What
    // it does *not* do is hit harder for being heavy: mass cancels out of
    // `rules::blow_damage` exactly. It hits hardest because it is long, and
    // weight buys the shove instead.
    ActionSpec {
        role: Role::Strike,
        length: Fx::from_ratio(145, 100),
        mass: Fx::from_ratio(223, 100),
        balance: Fx::from_ratio(61, 100),
        arc: 0,
        windup: 26,
        recovery: 34,
        ready: 18,
        move_bonus: Fx::ONE,
    },
    // Shield. The Fighter's old arc, now something you have to be holding.
    //
    // No windup and no recovery because it has no attack to have them for: a
    // guard-role limb never leaves `Swing::Guard`. Its whole cost is `ready`,
    // and this is the number the entire loadout design turns on.
    //
    // **It is set against the window a blow actually leaves, which is not the
    // telegraph.** The first cut at this was `8`, derived from the windups in
    // the rows above -- a Club announcing for 33 ticks and a Knife for 7. Both
    // are real numbers and neither is the operative one: a cut has to *travel*
    // after it is declared, and contact lands well into the strike phase. The
    // measured windows from declaration to contact are **24 ticks for a knife
    // and 62 for a club**, nearly triple the telegraph -- and against those, a
    // Fighter drawing in 8 could get a guard up against anything in the game.
    // The ladder had no rungs on it at all.
    //
    // At `14` a Fighter spends 12 ticks noticing (its decision period) and 15
    // drawing, which puts a guard up around tick 27: comfortably inside a club's
    // 62 with most of the brace still to spend, and comfortably outside a
    // knife's 24. The separation is the point, and so is the margin -- `12` also
    // separates them, by a single tick, which is luck rather than a design.
    //
    // A Rogue thinks every 10 and draws in 12, so it lands right on the knife's
    // edge. That is the correct shape for the quick body: answering a fast
    // weapon is *its* trick and nobody else's.
    //
    // Asserted in `World::tests::a_club_can_be_answered_by_swapping_to_a_guard`
    // and its twin, through a live world rather than on paper, because on paper
    // is exactly how it was got wrong the first time.
    ActionSpec {
        role: Role::Guard,
        length: Fx::from_ratio(45, 100),
        mass: Fx::from_ratio(90, 100),
        balance: Fx::from_ratio(35, 100),
        arc: 11_264, // +/- 61.9 deg
        windup: 0,
        recovery: 0,
        ready: 14,
        move_bonus: Fx::ONE,
    },
    // Run -- RESERVED, not yet implemented. Priced so the row does not move when
    // it lands.
    ActionSpec {
        role: Role::Move,
        length: Fx::ZERO,
        mass: Fx::from_ratio(20, 100),
        balance: Fx::ZERO,
        arc: 0,
        windup: 0,
        recovery: 0,
        ready: 4,
        move_bonus: Fx::from_ratio(135, 100),
    },
    // Bow. `length` is the **draw**, not the range: an arrow carries as far as
    // its archer can see (`World::loose`), so reach is bought with perception
    // rather than with a column here.
    //
    // **`move_bonus` stays at one, and that is a measured decision rather than a
    // default.** Landing this row, an archer beat a sword-and-board mirror 80%
    // of the time where every sword loadout scores 47%, and the cause was
    // kiting: `BowMind` keeps station about three units out, and a fighter
    // backing away at exactly its pursuer's speed can never be closed on, so
    // thirty ticks of draw and twenty-two of recovery were being charged to an
    // account that never came due.
    //
    // Slowing the row down was the obvious answer and it is a trap. Measured
    // across three values it is a **cliff, not a slope** -- 0.70 wins 80%, 0.50
    // wins 16%, 0.35 wins 2% -- because outrunning a pursuer is a threshold and
    // not a gradient. Any number here is either "uncatchable" or "dead", there
    // is no defensible middle, and the row would be hypersensitive to a footspeed
    // change made anywhere else in the game for any other reason.
    //
    // The price belongs where the guard's already is: a drawing archer plants
    // its feet, exactly as `GuardMind` does and for the same reason -- see
    // `BowMind::drive`. Repositioning and shooting become alternatives, which is
    // the trade this row was always supposed to be about.
    ActionSpec {
        role: Role::Shoot,
        length: Fx::from_ratio(30, 100),
        mass: Fx::from_ratio(80, 100),
        balance: Fx::from_ratio(50, 100),
        arc: 0,
        windup: 30,
        recovery: 22,
        ready: 22,
        move_bonus: Fx::ONE,
    },
    // Shortsword -- the retired Scout blade. Hilt-heavy and short, so the
    // lowest inertia of anything with an edge: speed limited rather than
    // work limited, and therefore the lightest hitter of the real blades.
    ActionSpec {
        role: Role::Strike,
        length: Fx::from_ratio(55, 100),
        mass: Fx::from_ratio(86, 100),
        balance: Fx::from_ratio(50, 100),
        arc: 0,
        windup: 8,
        recovery: 9,
        ready: 7,
        move_bonus: Fx::ONE,
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_registry_is_append_only_and_total() {
        for (i, kind) in ActionKind::ALL.iter().enumerate() {
            assert_eq!(kind.code() as usize, i, "{} moved", kind.name());
            assert_eq!(ActionKind::from_code(kind.code()), Some(*kind));
        }
        assert_eq!(ActionKind::ALL.len(), ActionKind::COUNT);
        assert_eq!(ACTIONS.len(), ActionKind::COUNT);
        // Total at the edges: this is what a replay and the page come in
        // through, and a panic there is a poisoned wasm instance.
        assert_eq!(ActionKind::from_code(ActionKind::COUNT as u32), None);
        assert_eq!(ActionKind::from_code(u32::MAX), None);

        for kind in ActionKind::PLAYABLE {
            assert!(kind.is_playable(), "{} is playable but not marked so", kind.name());
        }
        for kind in ActionKind::ALL {
            assert_eq!(
                kind.is_playable(),
                ActionKind::PLAYABLE.contains(&kind),
                "{} disagrees with PLAYABLE",
                kind.name()
            );
        }
    }

    /// The four rows the old roster is measured against must be numerically the
    /// weapons it was measured with, or every balance figure in `DESIGN.md` is a
    /// claim about a game that no longer exists.
    ///
    /// The arc is **deliberately excluded**: it moved off the weapon and onto
    /// `Shield`, which is the entire point of the split. `Sword` carrying the
    /// Fighter's 11264 would be the bug this refactor exists to fix.
    #[test]
    fn the_legacy_weapons_survived_the_split() {
        let legacy = [
            // (action, length, mass, balance, windup, recovery) from the retired
            // `Body::weapon()` table.
            (ActionKind::Knife, 40, 125, 75, 7, 8),
            (ActionKind::Sword, 95, 124, 55, 14, 16),
            (ActionKind::Club, 145, 223, 61, 26, 34),
        ];
        for (kind, length, mass, balance, windup, recovery) in legacy {
            let spec = kind.spec();
            assert_eq!(spec.length, Fx::from_ratio(length, 100), "{}", kind.name());
            assert_eq!(spec.mass, Fx::from_ratio(mass, 100), "{}", kind.name());
            assert_eq!(spec.balance, Fx::from_ratio(balance, 100), "{}", kind.name());
            assert_eq!(spec.windup, windup, "{}", kind.name());
            assert_eq!(spec.recovery, recovery, "{}", kind.name());
            assert_eq!(spec.arc, 0, "{} kept a shield arc it should have lost", kind.name());
        }
        // The arc it lost, found where it belongs.
        assert_eq!(ActionKind::Shield.spec().arc, 11_264);
    }

    #[test]
    fn a_role_decides_exactly_one_thing_about_a_limb() {
        for role in Role::ALL {
            // A role that both cut and blocked would make the loadout pointless,
            // because one action would answer every question.
            assert!(
                !(role.is_live_capable() && role.blocks()),
                "{} both cuts and blocks",
                role.name()
            );
        }
        for (i, role) in Role::ALL.iter().enumerate() {
            assert_eq!(role.discriminant(), i, "{} moved", role.name());
        }
        assert_eq!(Role::ALL.len(), Role::COUNT);
    }

    /// Every row has to be physically resolvable, whatever holds it. A zero mass
    /// is a division somewhere in `Arm`, and a guard with no arc covers nothing
    /// while still costing a slot.
    #[test]
    fn no_row_is_degenerate() {
        for kind in ActionKind::ALL {
            let spec = kind.spec();
            assert!(spec.mass.is_positive(), "{} weighs nothing", kind.name());
            assert!(spec.ready > 0, "{} is free to draw", kind.name());
            match spec.role {
                Role::Strike | Role::Shoot => {
                    assert!(spec.length.is_positive(), "{} has no reach", kind.name());
                    assert!(spec.windup > 0, "{} does not announce", kind.name());
                    assert!(spec.recovery > 0, "{} is free to miss with", kind.name());
                    assert_eq!(spec.arc, 0, "{} is not a guard", kind.name());
                }
                Role::Guard => {
                    assert!(spec.arc > 0, "{} covers nothing", kind.name());
                }
                Role::Move => {
                    assert!(
                        spec.move_bonus > Fx::ONE,
                        "{} is a movement action that does not move",
                        kind.name()
                    );
                    assert_eq!(spec.arc, 0, "{} is not a guard", kind.name());
                }
            }
            // **Only a movement action may make you faster.** The bound is
            // one-sided rather than an equality: a `Bow` is deliberately slower
            // than empty hands, because an archer that retreats at its pursuer's
            // speed can never be closed on and its telegraph costs it nothing.
            // What must stay impossible is a row that quietly buys footspeed
            // without being about footspeed.
            if !matches!(spec.role, Role::Move) {
                assert!(
                    spec.move_bonus <= Fx::ONE,
                    "{} quietly buys footspeed without being a movement action",
                    kind.name()
                );
            }
            assert!(
                spec.move_bonus.is_positive(),
                "{} cannot be moved in at all",
                kind.name()
            );
        }
    }
}
