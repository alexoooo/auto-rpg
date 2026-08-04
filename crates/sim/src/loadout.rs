//! What a fighter brought, as opposed to what it is holding.

use crate::action::ActionKind;

/// Up to two actions. Which of them is in hand is [`crate::World`]'s business,
/// not this type's -- a loadout is what you own, a slot is what you drew.
///
/// `secondary` is an [`Option`] rather than a second [`ActionKind`] because a
/// fighter carrying one thing is a legal fighter, and the alternative -- a
/// sentinel action meaning "nothing" -- would put a swap target in every
/// observation that cannot actually be swapped to. A policy would have to learn
/// to recognise the sentinel; this way there is nothing to recognise.
///
/// Two and not more, for now. The number is not load-bearing anywhere except
/// [`Loadout::SLOTS`] and the width of the frame's loadout columns, but growing
/// it is a decision about how much a fighter can carry rather than a refactor.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Loadout {
    pub primary: ActionKind,
    pub secondary: Option<ActionKind>,
}

impl Loadout {
    /// How many slots a loadout has room for.
    pub const SLOTS: usize = 2;

    /// The byte an empty slot hashes and crosses the wasm wall as. Not a valid
    /// [`ActionKind::code`], and never will be -- the registry would have to
    /// reach 256 rows first.
    pub const EMPTY: u8 = 255;

    pub const fn single(primary: ActionKind) -> Loadout {
        Loadout {
            primary,
            secondary: None,
        }
    }

    pub const fn pair(primary: ActionKind, secondary: ActionKind) -> Loadout {
        Loadout {
            primary,
            secondary: Some(secondary),
        }
    }

    /// What is in slot `i`, or `None` if that slot is empty or does not exist.
    ///
    /// **Refused, not clamped.** A slot index out of range returns `None` rather
    /// than falling back to the primary, because a policy or a corrupt replay
    /// asking for slot 7 has made a mistake, and answering "you are already
    /// holding it" would turn that mistake into a deliberate-looking swap home
    /// that the caller never asked for. `World` reads this and simply declines
    /// to honour the request.
    pub const fn slot(self, i: usize) -> Option<ActionKind> {
        match i {
            0 => Some(self.primary),
            1 => self.secondary,
            _ => None,
        }
    }

    /// Whether `i` names an action this fighter actually has.
    pub const fn holds(self, i: usize) -> bool {
        self.slot(i).is_some()
    }

    /// How many slots are filled: 1 or 2.
    pub const fn len(self) -> usize {
        match self.secondary {
            Some(_) => 2,
            None => 1,
        }
    }

    pub const fn is_empty(self) -> bool {
        false
    }

    /// Replaces one slot. Setting slot 1 to `None` empties it; slot 0 cannot be
    /// emptied, because a fighter holding nothing has no rule to run.
    pub fn set(&mut self, i: usize, action: Option<ActionKind>) -> bool {
        match (i, action) {
            (0, Some(a)) => {
                self.primary = a;
                true
            }
            (1, a) => {
                self.secondary = a;
                true
            }
            _ => false,
        }
    }

    // Unused until the world grows a loadout column. See `ActionKind::hash_into`.
    #[allow(dead_code)]
    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        self.primary.hash_into(h);
        // The empty sentinel is written rather than skipped, so a one-action
        // loadout and a two-action one whose second slot happens to hold a
        // `Punch` are not the same bytes. They are not the same fighter: one of
        // them can change its mind.
        h.write_u8(self.secondary.map_or(Loadout::EMPTY, |a| a.code() as u8));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_slot_is_refused_rather_than_clamped() {
        let one = Loadout::single(ActionKind::Sword);
        assert_eq!(one.slot(0), Some(ActionKind::Sword));
        assert_eq!(one.slot(1), None, "an empty slot answered as full");
        assert_eq!(one.slot(2), None);
        assert_eq!(one.slot(usize::MAX), None);
        assert_eq!(one.len(), 1);

        let two = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        assert_eq!(two.slot(1), Some(ActionKind::Shield));
        assert_eq!(two.slot(2), None, "a loadout grew a third slot");
        assert_eq!(two.len(), 2);
    }

    #[test]
    fn an_empty_second_slot_is_not_the_same_fighter_as_a_full_one() {
        let hashed = |l: Loadout| {
            let mut h = fx::Hash64::new();
            l.hash_into(&mut h);
            h.finish()
        };
        assert_ne!(
            hashed(Loadout::single(ActionKind::Sword)),
            hashed(Loadout::pair(ActionKind::Sword, ActionKind::Punch)),
            "a fighter that can change its mind hashes the same as one that cannot"
        );
        assert_ne!(
            hashed(Loadout::pair(ActionKind::Sword, ActionKind::Shield)),
            hashed(Loadout::pair(ActionKind::Sword, ActionKind::Punch)),
            "two different second slots are indistinguishable to the state hash"
        );
        assert_ne!(
            hashed(Loadout::pair(ActionKind::Sword, ActionKind::Shield)),
            hashed(Loadout::pair(ActionKind::Shield, ActionKind::Sword)),
            "the order of a loadout does not reach the hash"
        );
    }

    #[test]
    fn the_primary_cannot_be_emptied() {
        let mut l = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        assert!(l.set(1, None));
        assert_eq!(l.secondary, None);
        assert!(!l.set(0, None), "a fighter was left holding nothing");
        assert_eq!(l.primary, ActionKind::Sword);
        assert!(!l.set(2, Some(ActionKind::Club)), "a third slot was written");
    }
}
