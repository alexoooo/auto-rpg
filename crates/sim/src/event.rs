use crate::entity::EntityId;
use fx::Fx;

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
}
