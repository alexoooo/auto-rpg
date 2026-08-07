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
        /// Where it landed, in world units.
        ///
        /// Carried rather than looked up, because by the time a listener reads
        /// this the target may not exist: `World::reap_dead` recycles a lethal
        /// blow's slot before `step` returns, so `World::view(target)` answers
        /// `None` for exactly the blow a renderer most wants to draw. The same
        /// argument [`Event::Loose`] makes for the moment of a release.
        at: Vec2,
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
    /// A body was moved by something other than its own feet.
    ///
    /// The one thing in this list that a listener genuinely cannot derive from
    /// state. A velocity delta across a tick mixes the blow's impulse with the
    /// body's own traction-limited acceleration, and separating the two from
    /// outside would be a heuristic dressed up as a measurement -- so the
    /// magnitude is reported where it is known, which is where it is applied.
    ///
    /// Three sources, and `entity` is always the body that *gains* `impulse`:
    /// a blow shoving its target, an arrow shoving its target, and an
    /// attacker's own recoil kicking it off its feet. `shover` names the other
    /// party where there is one and is [`EntityId::NONE`] for a recoil, which
    /// has nobody to blame.
    ///
    /// **Not** emitted for body-on-body jostling. Two bodies leaning on each
    /// other exchange an impulse every tick for as long as they lean, which is
    /// a state and not an event, and would be the one thing in this list
    /// capable of flooding it.
    ///
    /// **`impulse` is never zero**, and all three sites test for it rather than
    /// two: a shove of nothing is not a thing that happened. The test is not
    /// theoretical at any of them -- fixed-point multiplication truncates, so
    /// every one of the three can produce a vector that rounds away in both
    /// components, and this is the highest-rate variant in the list.
    Shove {
        entity: EntityId,
        shover: EntityId,
        /// Velocity added to `entity`, world units per tick.
        impulse: Vec2,
        at: Vec2,
    },
}
