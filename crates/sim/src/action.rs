use crate::entity::EntityId;
use crate::hand::{HANDS, SHIELD, SWORD};
use fx::{Angle, Fx, Hash64, Vec2};

/// Whether a sword hand is being asked to attack, and from which side.
///
/// The sides are named for the direction the blade **winds up** in, which is the
/// opposite of the direction it cuts: a cut has to start somewhere the target is
/// not in order to arrive somewhere it is, at speed. [`Strike::Widdershins`]
/// therefore cocks counter-clockwise and cuts clockwise through the line.
///
/// Choosing a side is a real decision and not a detail. A shield covers an arc,
/// so a cut thrown from the side the guard is *not* on arrives at a bearing the
/// defender has to move to cover -- and moving a guard takes as long as moving
/// anything else. [`Strike::Nearest`] declines the decision and takes the
/// shortest windup, which is what a fighter with nothing clever to say does.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Strike {
    /// No attack. Hold the line and guard.
    ///
    /// This is also what **re-arms** the hand: an attack begins only on a
    /// command that asked for one after a command that did not, so a policy
    /// that says "attack" forever throws exactly one attack. See
    /// [`crate::Hand::armed`] -- that rule is the whole of what stops the
    /// windmill from coming back as a slower windmill.
    #[default]
    None,
    /// Attack through the commanded line, winding up from whichever side the
    /// blade already happens to be on.
    Nearest,
    /// Wind up counter-clockwise of the line and cut clockwise through it.
    Widdershins,
    /// Wind up clockwise of the line and cut counter-clockwise through it.
    Sunwise,
}

impl Strike {
    /// Which way the windup goes: `+1` counter-clockwise, `-1` clockwise, `0`
    /// for [`Strike::None`]. [`Strike::Nearest`] resolves to `0` here and is
    /// settled by the sim against the blade's live position.
    pub const fn side(self) -> i32 {
        match self {
            Strike::None | Strike::Nearest => 0,
            Strike::Widdershins => 1,
            Strike::Sunwise => -1,
        }
    }

    pub const fn is_attack(self) -> bool {
        !matches!(self, Strike::None)
    }

    /// One-hot index for the neural feature encoder. Append-only, like
    /// [`Order::discriminant`].
    pub const fn discriminant(self) -> usize {
        match self {
            Strike::None => 0,
            Strike::Nearest => 1,
            Strike::Widdershins => 2,
            Strike::Sunwise => 3,
        }
    }

    pub const COUNT: usize = 4;
}

/// What an agent wants one hand to do.
///
/// The bearing is **absolute**, not relative to the body's facing. Two reasons,
/// and both bite immediately if you get it wrong: `facing` is derived from the
/// feet, so a facing-relative command would swing the blade bodily around every
/// time the character strafed; and absolute is exactly what a mouse bearing
/// gives you, so a human and a policy speak the same language here.
///
/// The two hands read different halves of this struct, which is the price of
/// keeping one type at the boundary:
///
/// * The **shield** reads `angle` and `reach` and ignores `strike`. It is a
///   braced guard, held wherever it is pointed, exactly as it always was.
/// * The **sword** reads `angle` and `strike` and ignores `reach`. `angle` is
///   the line it guards along, and the line an attack is thrown *through*;
///   `reach` is not an agent's business any more, because a blade's extension is
///   decided by which phase of an attack it is in. Letting a policy pin it at
///   full extension forever is exactly how the blade became a stick that
///   dangled.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct HandCommand {
    pub angle: Angle,
    /// Desired extension, **shield only**. Clamped to `0..=1` by the sim, so a
    /// policy handing back nonsense produces a tucked or a fully braced hand
    /// and never a panic.
    pub reach: Fx,
    /// Whether to attack along `angle`, **sword only**.
    pub strike: Strike,
}

impl HandCommand {
    /// A hand held in against the body, pointing nowhere in particular.
    pub const TUCKED: HandCommand = HandCommand {
        angle: Angle::ZERO,
        reach: Fx::ZERO,
        strike: Strike::None,
    };

    /// A braced hand. The shield's whole vocabulary; for the sword this is a
    /// guard along `angle` that declines to attack, and therefore also the
    /// command that re-arms it.
    pub const fn new(angle: Angle, reach: Fx) -> HandCommand {
        HandCommand {
            angle,
            reach,
            strike: Strike::None,
        }
    }

    /// A sword hand asked to cut through `line`.
    pub const fn attack(line: Angle, strike: Strike) -> HandCommand {
        HandCommand {
            angle: line,
            reach: Fx::ONE,
            strike,
        }
    }
}

/// What an agent decided to do. This is the *entire* output side of the agent
/// boundary -- a hand-written utility AI, a neural policy, a replay log and a
/// human at a mouse all produce exactly this and nothing else.
///
/// An action persists until the agent's next decision tick, so a slow-witted
/// character keeps executing a stale plan while a sharp one re-plans up to 60
/// times a second. With hands on the action that cuts deeper than it used to:
/// a stale plan is now a stale *swing*, still travelling.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct Action {
    /// Desired movement direction. Magnitude above 1 is clamped, so this is
    /// effectively "which way, and how hard".
    pub move_dir: Vec2,
    pub intent: Intent,
    /// Where to drive each hand, indexed by [`SWORD`] and [`SHIELD`].
    pub hands: [HandCommand; HANDS],
}

impl Action {
    pub const HOLD: Action = Action {
        move_dir: Vec2::ZERO,
        intent: Intent::Hold,
        hands: [HandCommand::TUCKED; HANDS],
    };

    pub const fn moving(dir: Vec2) -> Action {
        Action {
            move_dir: dir,
            intent: Intent::Hold,
            hands: [HandCommand::TUCKED; HANDS],
        }
    }

    /// Closes on a target with both hands tucked.
    ///
    /// Kept for the many call sites that only care about movement and
    /// targeting. It does **not** swing: damage is geometric now, so an
    /// `Intent::Attack` with tucked hands closes the distance and then stands
    /// there. Use [`Action::swinging`] to actually fight.
    pub const fn attacking(dir: Vec2, target: EntityId) -> Action {
        Action {
            move_dir: dir,
            intent: Intent::Attack(target),
            hands: [HandCommand::TUCKED; HANDS],
        }
    }

    /// The full form: move, target, and drive both hands.
    pub const fn swinging(
        dir: Vec2,
        target: EntityId,
        sword: HandCommand,
        shield: HandCommand,
    ) -> Action {
        let mut hands = [HandCommand::TUCKED; HANDS];
        hands[SWORD] = sword;
        hands[SHIELD] = shield;
        Action {
            move_dir: dir,
            intent: Intent::Attack(target),
            hands,
        }
    }

    #[inline]
    pub const fn sword(&self) -> HandCommand {
        self.hands[SWORD]
    }

    #[inline]
    pub const fn shield(&self) -> HandCommand {
        self.hands[SHIELD]
    }

    pub(crate) fn hash_into(self, h: &mut Hash64) {
        h.write_i32(self.move_dir.x.raw());
        h.write_i32(self.move_dir.y.raw());
        match self.intent {
            Intent::Hold => h.write_u8(0),
            Intent::Attack(id) => {
                h.write_u8(1);
                id.hash_into(h);
            }
            Intent::Flee => h.write_u8(2),
        }
        // Appended after the intent block, so the bytes an `Order` contributes
        // are untouched. Hand commands are the difference between a fight and
        // two people standing next to each other, so a replay that dropped them
        // would reproduce the walking and none of the swordplay.
        //
        // `strike` is hashed even though only the sword hand reads it, because
        // the alternative is a hash that depends on which slot a command landed
        // in -- and a replay that cannot tell "attack" from "guard" apart
        // reproduces the footwork and none of the fight.
        for hand in self.hands {
            h.write_u16(hand.angle.raw());
            h.write_i32(hand.reach.raw());
            h.write_u8(hand.strike.discriminant() as u8);
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Intent {
    /// Move (or stand) without engaging.
    #[default]
    Hold,
    /// Close on the target. Approach and attack are one intent on purpose: the
    /// agent commits to a target rather than re-deciding every tick.
    ///
    /// Note what this no longer does: it does not cause damage. Blows are
    /// resolved from blade geometry, so an intent is a *statement about who is
    /// being fought*, which the renderer, the fitness function and target
    /// memory all want, and not a request to hit anything.
    Attack(EntityId),
    /// Disengage. Like [`Intent::Hold`] mechanically; carried separately so the
    /// renderer and the fitness function can tell retreat from advance.
    Flee,
}

/// The player's input channel: a standing order for a whole faction.
///
/// This is the "rough directions" half of the auto-battler contract. The
/// player never issues a per-tick command; they set an order, it lands in
/// every observation, and the agents interpret it with whatever wits they
/// have. Interpretation is the policy's job -- the sim only carries it.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Order {
    /// Fight what comes, hold position.
    #[default]
    Hold,
    /// Push in a direction.
    Advance(Vec2),
    /// Fall back toward the faction's centre of mass.
    Regroup,
    /// Concentrate on one enemy.
    Focus(EntityId),
    /// Walk to a point in the arena and stand there.
    Goto(Vec2),
}

impl Order {
    /// One-hot index used by the neural feature encoder. Append-only: the
    /// numbers are part of the feature layout a trained network is frozen
    /// against, so a new kind takes the next free index and never a reshuffle.
    pub const fn discriminant(self) -> usize {
        match self {
            Order::Hold => 0,
            Order::Advance(_) => 1,
            Order::Regroup => 2,
            Order::Focus(_) => 3,
            Order::Goto(_) => 4,
        }
    }

    /// Number of distinct order kinds; the width of the one-hot block.
    pub const COUNT: usize = 5;

    /// The heading an order pushes in, if it is a heading at all.
    ///
    /// [`Order::Goto`] deliberately gives [`Vec2::ZERO`]: its payload is a
    /// world-space destination, and a destination read as a heading sends the
    /// character marching off toward the far corner from wherever it happens
    /// to stand. Conflating the two is the exact bug that variant exists to
    /// prevent, so use [`Order::point`] when you want the payload without a
    /// claim about what it means.
    pub const fn direction(self) -> Vec2 {
        match self {
            Order::Advance(dir) => dir,
            _ => Vec2::ZERO,
        }
    }

    /// The `Vec2` an order carries, whatever it means.
    pub const fn point(self) -> Vec2 {
        match self {
            Order::Advance(v) | Order::Goto(v) => v,
            _ => Vec2::ZERO,
        }
    }

    pub const fn focus(self) -> Option<EntityId> {
        match self {
            Order::Focus(id) => Some(id),
            _ => None,
        }
    }

    /// Spelled out as an explicit match rather than routed through
    /// [`Order::point`] on purpose. This layout is the only part of `Order`
    /// that reaches [`World::state_hash`], so every recorded run in the
    /// repository depends on it byte for byte. Written this way, a new variant
    /// does not compile until someone has chosen where its payload lands --
    /// which is the alternative to a `Goto` whose destination silently never
    /// reaches the hash, leaving two different destinations indistinguishable
    /// to replay verification.
    ///
    /// [`World::state_hash`]: crate::World::state_hash
    pub(crate) fn hash_into(self, h: &mut Hash64) {
        h.write_u8(self.discriminant() as u8);
        match self {
            Order::Hold | Order::Regroup => {
                h.write_i32(0);
                h.write_i32(0);
            }
            Order::Advance(v) | Order::Goto(v) => {
                h.write_i32(v.x.raw());
                h.write_i32(v.y.raw());
            }
            Order::Focus(id) => {
                h.write_i32(0);
                h.write_i32(0);
                id.hash_into(h);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::Fx;

    fn hashed(order: Order) -> u64 {
        let mut h = Hash64::new();
        order.hash_into(&mut h);
        h.finish()
    }

    /// The byte sequence `hash_into` is required to produce, written out
    /// independently of the code under test.
    fn expected(discriminant: u8, x: Fx, y: Fx, focus: Option<EntityId>) -> u64 {
        let mut h = Hash64::new();
        h.write_u8(discriminant);
        h.write_i32(x.raw());
        h.write_i32(y.raw());
        if let Some(id) = focus {
            id.hash_into(&mut h);
        }
        h.finish()
    }

    #[test]
    fn discriminants_are_append_only() {
        assert_eq!(Order::Hold.discriminant(), 0);
        assert_eq!(Order::Advance(Vec2::X).discriminant(), 1);
        assert_eq!(Order::Regroup.discriminant(), 2);
        assert_eq!(Order::Focus(EntityId::NONE).discriminant(), 3);
        assert_eq!(Order::Goto(Vec2::X).discriminant(), 4);
        assert_eq!(Order::COUNT, 5);
    }

    #[test]
    fn order_hash_layout_is_frozen() {
        // Every variant that existed before `Goto` must hash exactly as it did
        // then, or `GOLDEN_STATE_HASH` and every recorded replay are void. The
        // expectation is spelled out rather than recorded, so this fails at the
        // line that moved instead of as a mismatched constant three crates away.
        let v = Vec2::new(Fx::from_ratio(3, 2), Fx::from_int(-7));
        let id = EntityId::new(9, 3);
        for (order, want) in [
            (Order::Hold, expected(0, Fx::ZERO, Fx::ZERO, None)),
            (Order::Advance(v), expected(1, v.x, v.y, None)),
            (Order::Regroup, expected(2, Fx::ZERO, Fx::ZERO, None)),
            (Order::Focus(id), expected(3, Fx::ZERO, Fx::ZERO, Some(id))),
        ] {
            assert_eq!(hashed(order), want, "{order:?} hashes differently now");
        }
    }

    #[test]
    fn hand_commands_reach_the_action_hash() {
        // Same shape as `goto_hashes_its_destination`, and for the same reason:
        // state the sim acts on but the hash ignores makes two different runs
        // indistinguishable to replay verification. Two swings in opposite
        // directions are about as different as two runs get.
        let hashed = |a: Action| {
            let mut h = Hash64::new();
            a.hash_into(&mut h);
            h.finish()
        };
        let target = EntityId::new(2, 0);
        let east = HandCommand::new(Angle::ZERO, Fx::ONE);
        let west = HandCommand::new(Angle::HALF, Fx::ONE);
        let tucked = HandCommand::TUCKED;

        assert_ne!(
            hashed(Action::swinging(Vec2::ZERO, target, east, tucked)),
            hashed(Action::swinging(Vec2::ZERO, target, west, tucked)),
            "two opposite swings are indistinguishable to the state hash"
        );
        assert_ne!(
            hashed(Action::swinging(Vec2::ZERO, target, east, tucked)),
            hashed(Action::swinging(Vec2::ZERO, target, tucked, east)),
            "sword and shield commands are interchangeable to the state hash"
        );
        assert_ne!(
            hashed(Action::swinging(Vec2::ZERO, target, east, tucked)),
            hashed(Action::attacking(Vec2::ZERO, target)),
            "an extended blade hashes the same as a tucked one"
        );
    }

    #[test]
    fn goto_hashes_its_destination() {
        let a = Vec2::from_ints(3, 4);
        let b = Vec2::from_ints(4, 3);
        assert_ne!(
            hashed(Order::Goto(a)),
            hashed(Order::Goto(b)),
            "two destinations are indistinguishable to the state hash"
        );
        assert_ne!(
            hashed(Order::Goto(a)),
            hashed(Order::Advance(a)),
            "a destination and a heading are indistinguishable to the state hash"
        );
    }
}
