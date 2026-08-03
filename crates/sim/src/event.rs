use crate::entity::EntityId;
use fx::{Fx, Vec2};

/// Something that happened during a tick.
///
/// Events are the sim's only outbound channel besides state itself. The
/// renderer turns them into hit flashes and sound; the experiment lab turns
/// them into fitness terms. Neither can influence the sim by consuming them.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Event {
    Damage {
        source: EntityId,
        target: EntityId,
        amount: Fx,
        /// True if this blow reduced the target to zero.
        lethal: bool,
    },
    Death {
        entity: EntityId,
        killer: EntityId,
    },
    /// A blow that arrived inside the defender's shield arc.
    ///
    /// `absorbed` is what the shield ate, not what leaked through -- the
    /// leaked remainder arrives separately as a [`Event::Damage`], so a
    /// listener that only cares about health never has to know blocking
    /// exists.
    Block {
        attacker: EntityId,
        defender: EntityId,
        absorbed: Fx,
        at: Vec2,
    },
    /// Two blades crossed and both swings were thrown off line.
    ///
    /// Reported once per pair with `a`'s index below `b`'s, so a listener
    /// counting parries counts events and not participants.
    Parry { a: EntityId, b: EntityId, at: Vec2 },
}
