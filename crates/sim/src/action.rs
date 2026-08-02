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
}

impl Order {
    /// One-hot index used by the neural feature encoder.
    pub const fn discriminant(self) -> usize {
        match self {
            Order::Hold => 0,
            Order::Advance(_) => 1,
            Order::Regroup => 2,
            Order::Focus(_) => 3,
        }
    }

    /// Number of distinct order kinds; the width of the one-hot block.
    pub const COUNT: usize = 4;

    pub const fn direction(self) -> Vec2 {
        match self {
            Order::Advance(dir) => dir,
            _ => Vec2::ZERO,
        }
    }

    pub const fn focus(self) -> Option<EntityId> {
        match self {
            Order::Focus(id) => Some(id),
            _ => None,
        }
    }

    pub(crate) fn hash_into(self, h: &mut Hash64) {
        h.write_u8(self.discriminant() as u8);
        let d = self.direction();
        h.write_i32(d.x.raw());
        h.write_i32(d.y.raw());
        if let Order::Focus(id) = self {
            id.hash_into(h);
        }
    }
}
