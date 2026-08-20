//! One hand human, one hand AI, merged **before** submission.
//!
//! The pieces were already there: an embodied command carries independent left
//! and right `ArmTarget`, grip and release, and a policy returns a whole
//! command. What was missing is the join -- and the join cannot live
//! inside `sim`, because submission validation is **atomic on purpose**. A range
//! or missing-equipment failure replaces the *entire* request with one neutral
//! command; no valid arm or grip field leaks through. A half-command has no
//! meaning at that boundary and must never reach it.
//!
//! So composition happens strictly before submission, here, and what crosses
//! into `sim` is one complete command that a replay records as one. That is the
//! property [ADR 0002](../../../docs/decisions/0002-record-commands-in-replays.md)
//! exists for: a replay of a mixed fight reproduces it exactly without needing
//! either the human or the policy.

use sim::{Observation, CommandV1, LimbSlot};

use crate::neutral_world_command;

/// Which parts of a command a source is entitled to fill.
///
/// Navigation is one flag rather than two because `move_dir`, `body_yaw` and
/// `intent` are a single decision -- where the body is going and what it is
/// going there for. Splitting them would let two sources disagree about a fact
/// with one answer.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct CommandAuthority {
    pub navigation: bool,
    /// Indexed by [`LimbSlot`]: `arms[0]` is the left arm, `arms[1]` the right.
    pub arms: [bool; 2],
}

impl CommandAuthority {
    /// Everything. What a single-source controller claims, and what an existing
    /// whole-command policy is wrapped with so that the composed path can be
    /// asserted byte-identical to the direct one.
    pub const ALL: CommandAuthority = CommandAuthority { navigation: true, arms: [true, true] };

    pub const fn navigation_only() -> CommandAuthority {
        CommandAuthority { navigation: true, arms: [false, false] }
    }

    pub const fn arm(slot: LimbSlot) -> CommandAuthority {
        let mut arms = [false, false];
        arms[slot as usize] = true;
        CommandAuthority { navigation: false, arms }
    }
}

/// Fills the fields it owns and leaves the rest alone.
///
/// `contribute` takes the whole observation rather than a narrowed one, and
/// returns nothing rather than a partial command. Narrowing what a source
/// *sees* would make an off hand blind to the fight; narrowing what it *writes*
/// is what `authority` already does, and doing it twice would be two places to
/// disagree.
pub trait PartialCommandSource {
    fn authority(&self) -> CommandAuthority;

    fn contribute(&mut self, obs: &Observation, into: &mut CommandV1);

    /// Cleared before each run, on [`Policy::reset`]'s contract.
    ///
    /// [`Policy::reset`]: crate::Policy::reset
    fn reset(&mut self) {}
}

/// Why a set of sources cannot be composed.
///
/// Returned rather than printed, so a test can assert the sentence. This
/// repository has shipped ten controls that accepted an input they could not act
/// on and said nothing, and the refusal path no test could name is how the last
/// pair of them stayed green.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CompositionError {
    /// Two sources both claim navigation.
    NavigationClaimedTwice,
    /// Two sources both claim the same arm.
    ArmClaimedTwice(LimbSlot),
    /// Nobody claims navigation.
    NavigationUnclaimed,
    /// Nobody claims this arm.
    ArmUnclaimed(LimbSlot),
}

impl CompositionError {
    /// The refusal, in words, naming the offending input.
    pub fn message(self) -> &'static str {
        match self {
            CompositionError::NavigationClaimedTwice =>
                "two sources claim navigation; exactly one must",
            CompositionError::ArmClaimedTwice(LimbSlot::LeftArm) =>
                "two sources claim the left arm; exactly one must",
            CompositionError::ArmClaimedTwice(LimbSlot::RightArm) =>
                "two sources claim the right arm; exactly one must",
            CompositionError::NavigationUnclaimed =>
                "no source claims navigation; exactly one must",
            CompositionError::ArmUnclaimed(LimbSlot::LeftArm) =>
                "no source claims the left arm; exactly one must",
            CompositionError::ArmUnclaimed(LimbSlot::RightArm) =>
                "no source claims the right arm; exactly one must",
        }
    }
}

/// Composes sources into one command. Panic-free and total.
///
/// `Debug` reports the shape rather than the sources, because a `dyn` source has
/// nothing useful to print and the interesting fact is who claims what.
pub struct ComposedController {
    sources: Vec<Box<dyn PartialCommandSource>>,
}

impl core::fmt::Debug for ComposedController {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("ComposedController")
            .field("authorities", &self.sources.iter().map(|s| s.authority()).collect::<Vec<_>>())
            .finish()
    }
}

impl ComposedController {
    /// **Overlapping and missing authority are refused, by name, at
    /// construction**, which is the only place the answer is knowable without
    /// running a fight. Two sources both claiming `arms[1]`, or none claiming
    /// navigation, is a configuration error and not a runtime one.
    pub fn new(
        sources: Vec<Box<dyn PartialCommandSource>>,
    ) -> Result<ComposedController, CompositionError> {
        let mut navigation = 0usize;
        let mut arms = [0usize; 2];
        for source in &sources {
            let authority = source.authority();
            navigation += usize::from(authority.navigation);
            for slot in 0..2 {
                arms[slot] += usize::from(authority.arms[slot]);
            }
        }
        // Ordered so the *first* thing wrong is the thing reported, which is the
        // same rule submission validation follows.
        if navigation > 1 { return Err(CompositionError::NavigationClaimedTwice); }
        for (slot, name) in [(0, LimbSlot::LeftArm), (1, LimbSlot::RightArm)] {
            if arms[slot] > 1 { return Err(CompositionError::ArmClaimedTwice(name)); }
        }
        if navigation == 0 { return Err(CompositionError::NavigationUnclaimed); }
        for (slot, name) in [(0, LimbSlot::LeftArm), (1, LimbSlot::RightArm)] {
            if arms[slot] == 0 { return Err(CompositionError::ArmUnclaimed(name)); }
        }
        Ok(ComposedController { sources })
    }

    /// One command, from every source, in a fixed order.
    ///
    /// Starts from the **neutral command** -- the same one the world substitutes
    /// for a silent slot -- so a field nobody wrote is unclaimed rather than
    /// zero. Authority is disjoint by construction, so the order the sources
    /// were added in cannot matter; `composition_order_does_not_depend_on_the_order_sources_were_added`
    /// asserts that rather than assuming it.
    pub fn decide(&mut self, obs: &Observation) -> CommandV1 {
        let mut command = CommandV1::new(neutral_world_command(obs));
        for source in &mut self.sources {
            source.contribute(obs, &mut command);
        }
        command
    }

    pub fn reset(&mut self) {
        for source in &mut self.sources {
            source.reset();
        }
    }
}

/// **The inherent pair above are the implementation and these two forward to
/// them**, rather than the other way round, because a caller that holds a
/// `ComposedController` by value should not have to import a trait to drive it.
/// The trait exists so a *driver* can hold this or a scripted embodied policy
/// behind one `Box<dyn Policy>`, which is a different need and arrived
/// a session later.
impl crate::Policy for ComposedController {
    fn decide(&mut self, obs: &Observation) -> CommandV1 {
        ComposedController::decide(self, obs)
    }

    fn reset(&mut self) {
        ComposedController::reset(self);
    }
}

// **`PolicySource` stood here and went with the `ArticulatedPolicy` trait it
// was generic over.** It wrapped a whole-command articulated policy as a source
// that copied out only the fields its authority named, and writing the neutral
// swing plane for the arm it claimed was the interesting half: an articulated
// command has no plane, so without that write the plane would have been the one
// field of the command `CommandAuthority` did not divide, and a source claiming
// the left arm could have reached into the right arm's plane with nothing to
// refuse it. **That claim survives its adapter** -- it is a claim about
// `CommandAuthority` -- and `the_swing_plane_belongs_to_the_arm_and_not_to_navigation`
// is what still holds it, over sources that write their own planes.
//
// It had no caller outside this crate's own tests, which is why it is deleted
// rather than reseated onto [`Policy`]: a source that returns an
// `CommandV1` and then has most of it thrown away is a policy driven
// for one arm's worth of its answer, and `crates/policy/tests/composition.rs`
// writes the four lines that does directly, where the fight it is part of can
// see them.

#[cfg(test)]
mod tests {
    use super::*;
    use fx::{Angle, Fx, Vec2};
    use sim::{ArmTarget, CombatHeight, GripRequest, ReleaseRequest};

    /// A source that writes a recognisable constant into every field it owns, so
    /// a test can say which source a field came from by looking at it.
    struct Marker {
        authority: CommandAuthority,
        mark: u16,
        contributions: usize,
    }

    impl Marker {
        fn new(authority: CommandAuthority, mark: u16) -> Marker {
            Marker { authority, mark, contributions: 0 }
        }
    }

    impl PartialCommandSource for Marker {
        fn authority(&self) -> CommandAuthority { self.authority }

        fn contribute(&mut self, _obs: &Observation, into: &mut CommandV1) {
            self.contributions += 1;
            if self.authority.navigation {
                into.core.move_dir = Vec2::new(Fx::from_raw(self.mark as i32), Fx::ZERO);
                into.core.body_yaw = Angle::from_raw(self.mark);
            }
            for slot in 0..2 {
                if self.authority.arms[slot] {
                    into.core.arms[slot] = ArmTarget {
                        bearing: Angle::from_raw(self.mark),
                        height: CombatHeight::MID,
                        reach: Fx::from_raw(self.mark as i32),
                        effort: Fx::from_raw(self.mark as i32),
                    };
                    into.core.grips[slot] = GripRequest::EquipSlot((self.mark & 1) as u8);
                    into.core.releases[slot] = ReleaseRequest::Loose;
                    // Rotated so the plane cannot be confused with the bearing
                    // the same mark writes two lines up: a `contribute` that
                    // filled the plane from the bearing would agree with an
                    // unrotated mark and this test would say nothing.
                    into.swing_plane[slot] = Angle::from_raw(self.mark.rotate_left(5));
                }
            }
        }

        fn reset(&mut self) { self.contributions = 0; }
    }

    /// Claims everything, writes one recognisable mark into every field it owns,
    /// and counts the resets it has been handed.
    ///
    /// The counter is what makes `reset` observable at all: a source's own state
    /// is behind a `Box<dyn PartialCommandSource>` the moment it is composed, so
    /// a forwarder that quietly dropped `reset` would look exactly like one that
    /// did not.
    struct Everything {
        mark: u16,
        resets: std::rc::Rc<std::cell::Cell<usize>>,
    }

    impl PartialCommandSource for Everything {
        fn authority(&self) -> CommandAuthority { CommandAuthority::ALL }

        fn contribute(&mut self, _obs: &Observation, into: &mut CommandV1) {
            into.core.body_yaw = Angle::from_raw(self.mark);
            for slot in 0..2 {
                into.core.arms[slot].bearing = Angle::from_raw(self.mark);
                into.swing_plane[slot] = Angle::from_raw(self.mark.rotate_left(5));
            }
        }

        fn reset(&mut self) { self.resets.set(self.resets.get() + 1); }
    }

    fn navigation_and_left_and_right(
        nav: u16, left: u16, right: u16,
    ) -> Vec<Box<dyn PartialCommandSource>> {
        vec![
            Box::new(Marker::new(CommandAuthority::navigation_only(), nav)),
            Box::new(Marker::new(CommandAuthority::arm(LimbSlot::LeftArm), left)),
            Box::new(Marker::new(CommandAuthority::arm(LimbSlot::RightArm), right)),
        ]
    }

    #[test]
    fn a_composed_command_takes_each_field_from_the_source_that_owns_it() {
        let mut controller = ComposedController::new(
            navigation_and_left_and_right(11, 22, 33)).expect("disjoint authority");
        let command = controller.decide(&Observation::BLANK);
        assert_eq!(command.core.body_yaw, Angle::from_raw(11));
        assert_eq!(command.core.move_dir.x, Fx::from_raw(11));
        assert_eq!(command.core.arms[0].bearing, Angle::from_raw(22));
        assert_eq!(command.core.arms[1].bearing, Angle::from_raw(33));
        // The embodied-only field divides the same way, which is the whole
        // reason it is claimed per arm: a plane owned by nobody would be a hole
        // in `CommandAuthority` that no refusal could name.
        assert_eq!(command.swing_plane[0], Angle::from_raw(22u16.rotate_left(5)));
        assert_eq!(command.swing_plane[1], Angle::from_raw(33u16.rotate_left(5)));
    }

    /// The plane is an *arm's* field and not navigation's, asserted where it can
    /// fail: the navigation source claims neither arm, so neither plane may
    /// carry its mark.
    #[test]
    fn the_swing_plane_belongs_to_the_arm_and_not_to_navigation() {
        let mut controller = ComposedController::new(
            navigation_and_left_and_right(11, 22, 33)).expect("disjoint authority");
        let command = controller.decide(&Observation::BLANK);
        for plane in command.swing_plane {
            assert_ne!(plane, Angle::from_raw(11u16.rotate_left(5)),
                       "navigation wrote an arm's swing plane");
        }
    }

    /// The unclaimed half. A field nobody writes must hold the value the world
    /// would have substituted, not a zero that happens to look like one.
    #[test]
    fn an_unclaimed_field_holds_its_neutral_value_rather_than_zero() {
        // `intent` is navigation's, and the navigation marker above does not
        // write it -- so it must survive from the neutral command.
        let neutral = neutral_world_command(&Observation::BLANK);
        let mut controller = ComposedController::new(
            navigation_and_left_and_right(11, 22, 33)).expect("disjoint authority");
        let command = controller.decide(&Observation::BLANK);
        assert_eq!(command.core.intent, neutral.intent);
        assert_eq!(command.core.arms[0].height, CombatHeight::MID);
    }

    #[test]
    fn two_sources_claiming_one_arm_are_refused_by_name_at_construction() {
        let mut sources = navigation_and_left_and_right(1, 2, 3);
        sources.push(Box::new(Marker::new(CommandAuthority::arm(LimbSlot::RightArm), 4)));
        let error = ComposedController::new(sources).unwrap_err();
        assert_eq!(error, CompositionError::ArmClaimedTwice(LimbSlot::RightArm));
        assert_eq!(error.message(), "two sources claim the right arm; exactly one must");
    }

    #[test]
    fn two_sources_claiming_navigation_are_refused_by_name_at_construction() {
        let mut sources = navigation_and_left_and_right(1, 2, 3);
        sources.push(Box::new(Marker::new(CommandAuthority::navigation_only(), 4)));
        let error = ComposedController::new(sources).unwrap_err();
        assert_eq!(error, CompositionError::NavigationClaimedTwice);
        assert_eq!(error.message(), "two sources claim navigation; exactly one must");
    }

    #[test]
    fn a_composed_controller_with_no_navigation_source_is_refused_by_name() {
        let sources: Vec<Box<dyn PartialCommandSource>> = vec![
            Box::new(Marker::new(CommandAuthority::arm(LimbSlot::LeftArm), 1)),
            Box::new(Marker::new(CommandAuthority::arm(LimbSlot::RightArm), 2)),
        ];
        let error = ComposedController::new(sources).unwrap_err();
        assert_eq!(error, CompositionError::NavigationUnclaimed);
        assert_eq!(error.message(), "no source claims navigation; exactly one must");
    }

    #[test]
    fn a_composed_controller_with_an_undriven_arm_is_refused_by_name() {
        let sources: Vec<Box<dyn PartialCommandSource>> = vec![
            Box::new(Marker::new(CommandAuthority::navigation_only(), 1)),
            Box::new(Marker::new(CommandAuthority::arm(LimbSlot::RightArm), 2)),
        ];
        let error = ComposedController::new(sources).unwrap_err();
        assert_eq!(error, CompositionError::ArmUnclaimed(LimbSlot::LeftArm));
        assert_eq!(error.message(), "no source claims the left arm; exactly one must");
    }

    /// Authority is disjoint by construction, so this cannot fail -- which is
    /// exactly why it is asserted rather than assumed. A future `contribute`
    /// that read a field another source had already written would break it.
    #[test]
    fn composition_order_does_not_depend_on_the_order_sources_were_added() {
        let mut forward = ComposedController::new(
            navigation_and_left_and_right(11, 22, 33)).expect("disjoint");
        let mut reversed = {
            let mut sources = navigation_and_left_and_right(11, 22, 33);
            sources.reverse();
            ComposedController::new(sources).expect("disjoint")
        };
        let obs = Observation::BLANK;
        assert_eq!(forward.decide(&obs).payload_bytes(), reversed.decide(&obs).payload_bytes());
    }

    #[test]
    fn resetting_a_composed_controller_resets_every_source() {
        let seen = std::rc::Rc::new(std::cell::Cell::new(0));
        let mut controller = ComposedController::new(
            vec![Box::new(Everything { mark: 3, resets: seen.clone() })])
            .expect("total authority");
        controller.reset();
        controller.reset();
        assert_eq!(seen.get(), 2);
    }

    /// **Behind a `Box<dyn>`, which is the only thing the trait buys.** A driver
    /// that could name `ComposedController` never needed a trait; one that has
    /// to hold either this or a scripted embodied policy in the same slot does,
    /// and object safety is what makes that possible rather than a second
    /// generic parameter on every harness. Both methods go through the box, so a
    /// forwarder that dropped `reset` would be caught here rather than by a
    /// rollout that leaked its predecessor's opinions.
    ///
    /// **It drove a `PolicySource` wrapping an articulated policy until session
    /// 05 deleted both**, and the substitution is not a weakening: what the box
    /// has to carry is `decide` and `reset`, and a source that answers a
    /// recognisable mark and counts its resets shows both arriving, where a
    /// wrapped whole-command policy showed only the first.
    #[test]
    fn a_composed_controller_drives_through_a_boxed_embodied_policy() {
        use crate::Policy;

        let seen = std::rc::Rc::new(std::cell::Cell::new(0));
        let sources: Vec<Box<dyn PartialCommandSource>> =
            vec![Box::new(Everything { mark: 4_321, resets: seen.clone() })];
        let mut boxed: Box<dyn Policy> =
            Box::new(ComposedController::new(sources).expect("total authority"));
        let command = boxed.decide(&Observation::BLANK);
        assert_eq!(command.core.body_yaw, Angle::from_raw(4_321));
        assert_eq!(command.swing_plane[1], Angle::from_raw(4_321u16.rotate_left(5)));
        boxed.reset();
        assert_eq!(seen.get(), 1, "`reset` did not reach the source through the box");
    }
}
