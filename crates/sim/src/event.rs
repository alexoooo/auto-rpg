use crate::entity::EntityId;
use fx::{Angle, Fx, Vec2};

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
    /// An arrow left a bow.
    ///
    /// The flight itself is state, not an event -- a renderer finds the arrow in
    /// the frame like it finds a body. What this carries is the *moment*, for a
    /// string-snap and a flash at the nock, which is the same argument
    /// `hit_flash` makes against inferring a blow from health falling between
    /// frames. The lab reads it as the denominator of an accuracy figure.
    ///
    /// Deliberately without a partner for the arrow landing or expiring: a
    /// landed shot is an [`Event::Damage`] and a stopped one is an
    /// [`Event::Block`], so a listener that only cares about health never has to
    /// learn that archery exists. Note only that such a `Damage`'s `source` may
    /// name a fighter who has since died -- an arrow outlives the archer.
    Loose {
        source: EntityId,
        at: Vec2,
        line: Angle,
    },
}
