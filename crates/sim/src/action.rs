use crate::entity::EntityId;
use fx::{Hash64, Vec2};

/// What an agent decided to do. This is the *entire* output side of the agent
/// boundary -- a hand-written utility AI, a neural policy and a replay log all
/// produce exactly this and nothing else.
///
/// An action persists until the agent's next decision tick, so a slow-witted
/// character keeps executing a stale plan while a sharp one re-plans up to 60
/// times a second.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct Action {
    /// Desired movement direction. Magnitude above 1 is clamped, so this is
    /// effectively "which way, and how hard".
    pub move_dir: Vec2,
    pub intent: Intent,
}

impl Action {
    pub const HOLD: Action = Action {
        move_dir: Vec2::ZERO,
        intent: Intent::Hold,
    };

    pub const fn moving(dir: Vec2) -> Action {
        Action {
            move_dir: dir,
            intent: Intent::Hold,
        }
    }

    pub const fn attacking(dir: Vec2, target: EntityId) -> Action {
        Action {
            move_dir: dir,
            intent: Intent::Attack(target),
        }
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
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Intent {
    /// Move (or stand) without engaging.
    #[default]
    Hold,
    /// Close on the target and strike whenever it is in reach and the weapon
    /// is off cooldown. Approach and attack are one intent on purpose: the
    /// agent commits to a target rather than re-deciding every tick.
    Attack(EntityId),
    /// Disengage. Mechanically identical to `Hold` today; carried separately
    /// so the renderer and the fitness function can tell retreat from advance.
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
