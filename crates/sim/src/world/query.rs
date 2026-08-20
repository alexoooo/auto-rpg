//! What a reader may ask a `World`, and nothing that changes one.
//!
//! Perception lives here too -- `observe`, `observe` and the
//! `Contact` builder -- because an observation is a read of authoritative state
//! and not a phase of the tick. The one thing in this file that takes `&mut` is
//! a `#[cfg(test)]` mutator that exists to prove a hash covers a column.

use super::*;

/// The perception-noise stream domain for [`World::observe`]:
/// ASCII `ARTOBS1`, frozen by the articulated ABI.
///
/// It is folded into `Rng::from_stream`'s *seed* argument rather than into one
/// of the two coordinates, because both coordinates are already spoken for --
/// tick and full identity -- and the articulated stream draws at exactly the
/// same pair as the legacy one. XOR into the seed is enough: `from_stream`
/// mixes the seed in linearly and then runs the result through SplitMix64,
/// which is a bijection, so a nonzero domain can never collide with the legacy
/// stream for any (tick, entity).
const ARTICULATED_OBSERVATION_DOMAIN: u64 = 0x4152_544f_4253_31;

/// The `BodyPart` a non-body collider slot belongs to, or `None` for a slot
/// that names no limb.
/// Bit `part as u8` per severed region, in [`BodyPart`] order.
///
/// One writer for the two published masks -- the pose row's and the
/// observation's -- because two loops over the same five booleans are two
/// chances to disagree about which bit `Legs` is.
fn severed_mask_of(state: &AnatomyState) -> u8 {
    let mut mask = 0u8;
    for part in 0..BodyPart::COUNT {
        if state.parts[part].severed { mask |= 1 << part; }
    }
    mask
}

/// A raw hip-to-torso twist as a signed fraction of the budget, `[-1, 1]`.
///
/// One writer for the two published fractions -- the subject's and every
/// perceived opponent's -- for the reason [`severed_mask_of`] is one writer for
/// the two masks: two divisions by the same constant are two chances to disagree
/// about which way the sign runs, and the sign is the whole of what a policy
/// reads off this column.
///
/// The clamp is a guard rather than a routine flattening. `drive_stance` cannot
/// leave a twist outside the budget -- `world::mod`'s
/// `a_torso_cannot_turn_past_its_hips_by_more_than_the_twist_budget` asserts
/// it -- while a hand-built world can, and the vector's `-1..=1` invariant is
/// worth more than a number nothing can act on.
fn twist_fraction(twist_raw: i32) -> Fx {
    Fx::from_ratio(twist_raw, actuator::STANCE_TWIST_LIMIT_RAW).clamp(-Fx::ONE, Fx::ONE)
}

/// Bounded "k nearest" accumulator: insertion sort into a fixed array, ties
/// broken by entity index so the result never depends on scan order.
struct Nearest {
    items: [(Fx, usize); MAX_CONTACTS],
    len: usize,
    cap: usize,
}

impl Nearest {
    fn new(cap: usize) -> Nearest {
        Nearest {
            items: [(Fx::ZERO, 0); MAX_CONTACTS],
            len: 0,
            cap: cap.clamp(1, MAX_CONTACTS),
        }
    }

    fn offer(&mut self, key: Fx, index: usize) {
        if self.len == self.cap && (key, index) >= self.items[self.len - 1] {
            return;
        }
        let mut p = self.len.min(self.cap - 1);
        while p > 0 && self.items[p - 1] > (key, index) {
            self.items[p] = self.items[p - 1];
            p -= 1;
        }
        self.items[p] = (key, index);
        if self.len < self.cap {
            self.len += 1;
        }
    }

    #[inline]
    fn len(&self) -> usize {
        self.len
    }

    #[inline]
    fn items(&self) -> &[(Fx, usize)] {
        &self.items[..self.len]
    }
}

impl World {
    /// The resolutions the last solved tick completed, sorted by
    /// `(group_ordinal, ContactKey)`. Evidence and not a second authority:
    /// v2-15 consumes each group as it is produced, and nothing may rebuild
    /// state by summing these rows.
    pub fn contact_resolutions(&self) -> &[ContactResolution] {
        self.contact.as_ref().map_or(&[], |contact| contact.resolutions.as_slice())
    }

    /// The sweep this tick's contact phase was asked about, for one held
    /// segment: `(previous, requested)`.
    ///
    /// This is the question, and [`World::contact_resolutions`] is the answer.
    /// The distinction is worth a published accessor because the two are easy
    /// to confuse and expensive to confuse: an observer reading the weapon pose
    /// back after [`World::step`] gets the *contact-solved* blade, since
    /// `commit_contact_row` writes the solved endpoint onto the arm, so a
    /// swept test rebuilt from an observation sweeps a shorter arc than the
    /// blade requested and answers "no crossing" about a tick the solver
    /// resolved as a hit. Three lab oracles were wrong that way at once.
    ///
    /// A [`SegmentPose`] pair rather than the collider row, because the row is
    /// the contact phase's business and the pose is already published: this
    /// hands a reader the geometry and none of the solver's vocabulary.
    ///
    /// `None` when the entity was not articulated, held no segment in that hand,
    /// or when no tick has run. It is matched against the snapshot's own
    /// `EntityId` rather than resolved against the live columns on purpose: the
    /// question is about a body as the tick found it, and a body killed by that
    /// tick's own contact would otherwise stop being able to answer for the
    /// blow that killed it.
    pub fn swept_weapon(&self, id: EntityId, limb: LimbSlot) -> Option<(SegmentPose, SegmentPose)> {
        let slot = limb as u8;
        self.contact.as_ref()?.swept.iter().find_map(|row| {
            if row.entity != id || row.slot != slot { return None }
            let ContactShape::Segment { previous_hilt, previous_tip,
                                        requested_hilt, requested_tip, radius } = row.shape
                else { return None };
            Some((SegmentPose { hilt: previous_hilt, tip: previous_tip, radius },
                  SegmentPose { hilt: requested_hilt, tip: requested_tip, radius }))
        })
    }

    /// The swept volumes this tick's contact phase was asked about, each as its
    /// `(previous, requested)` shape. The companion to
    /// [`World::swept_weapon`], and it exists for the same reason: a volume
    /// rebuilt from a post-step pose is one endpoint of the sweep, not the
    /// sweep, and one rebuilt from an *observation* is not even that --
    /// perception noise displaces it by more than a body's width.
    ///
    /// **Grown from five to [`BODY_VOLUME_COUNT`] rather than left at five and
    /// truncated, and the choice is the whole reason this doc comment moved.**
    /// The promise here is "what the solver swept", and after the elbow that is
    /// seven capsules on an embodied body. A five-wide answer would have silently
    /// dropped the two the fight is most likely to be decided by -- a forearm is
    /// the part of an arm a blade meets first -- and every caller of this is an
    /// oracle checking the solver's own answer, which cannot check a row it
    /// cannot see. [`ObservedOpponent::regions`](crate::ObservedOpponent::regions)
    /// makes the opposite call for the opposite reason; see `observed_opponent`.
    ///
    /// Indexed by swept volume, which is the same order the collider builder
    /// filled and the same order [`crate::body_region_volumes`] returns: volumes
    /// `0..5` are the five [`BodyPart`]s and `5`/`6` are the two forearms. Use
    /// [`crate::volume_region`] to go the other way.
    pub fn swept_regions(&self, id: EntityId)
        -> Option<[(RegionVolume, RegionVolume); BODY_VOLUME_COUNT]>
    {
        self.contact.as_ref()?.swept.iter().find_map(|row| {
            if row.entity != id { return None }
            let ContactShape::Body { parts, .. } = row.shape else { return None };
            Some(parts.map(|part| (
                RegionVolume { lower: part.previous_lower, upper: part.previous_upper,
                               radius: part.radius, present: part.present },
                RegionVolume { lower: part.requested_lower, upper: part.requested_upper,
                               radius: part.radius, present: part.present },
            )))
        })
    }

    /// How many ticks have exhausted the group cap. Hashed; zero in Legacy.
    pub fn contact_cap_hits(&self) -> u32 {
        self.contact.as_ref().map_or(0, |contact| contact.state.cap_hits)
    }

    /// How many ticks the contact solver refused outright. Not hashed; zero in
    /// Legacy, and zero on the articulated duel fixture.
    ///
    /// The companion to [`World::contact_resolutions`] rather than a second
    /// reading of it: a rejected tick publishes no rows at all, so a caller
    /// auditing the ledger those rows carry is auditing only the ticks that
    /// succeeded. Anything but zero here says the audit had a blind spot and
    /// how wide it was.
    ///
    /// The first time it was asked, on 2026-08-10, it answered 236 of every
    /// 3,600 ticks under the twelve-phase script, every one of them
    /// [`ResolutionError::Projector`] -- 6.5% of the fight computed, rejected
    /// and silently rolled back. The cause was [`ContactProjector::project`]
    /// re-deriving *every* equipment row through the joint's inexact inverse
    /// map at every alpha including zero, so the round trip's own drift read as
    /// created energy. Checkpoint B fixed it there, by recognising an unmoved
    /// hand as unmoved; the number is kept because a counter that has only ever
    /// been zero proves nothing, and this one has already paid for itself once.
    pub fn contact_solver_rejections(&self) -> u32 {
        self.contact.as_ref().map_or(0, |contact| contact.rejections)
    }

    /// Why the first refused tick was refused, if any was.
    pub fn first_contact_rejection(&self) -> Option<ResolutionError> {
        self.contact.as_ref().and_then(|contact| contact.first_rejection)
    }

    #[cfg(feature = "cartesian-recoil")]
    pub fn first_exact_contact_rejection(&self)
        -> Option<ExactContactRejectionDiagnostic>
    {
        self.contact.as_ref().and_then(|contact| contact.first_exact_rejection)
    }

    #[cfg(feature = "cartesian-recoil")]
    pub fn exact_contact_group_diagnostics(&self)
        -> &[crate::ExactContactGroupDiagnostic]
    {
        self.contact.as_ref().map_or(&[], |contact|
            contact.scratch.exact_group_diagnostics())
    }

    #[cfg(feature = "cartesian-recoil")]
    pub fn exact_scan_pair_rejection(&self)
        -> Option<crate::ExactScanPairRejectionDiagnostic>
    {
        self.contact.as_ref().and_then(|contact|
            contact.scratch.exact_scan_pair_rejection())
    }

    #[cfg(feature = "cartesian-recoil")]
    pub fn recoil_external_energy(&self, entity: EntityId, limb: LimbSlot)
        -> Option<RecoilExternalEnergy>
    {
        let i = self.resolve(entity)?;
        let limb = match limb { LimbSlot::LeftArm => 0, LimbSlot::RightArm => 1 };
        self.contact.as_ref()?.recoil_external.get(i).map(|row| row[limb])
    }

    #[cfg(feature = "cartesian-recoil")]
    pub fn exact_external_energy(&self) -> &[ExactExternalEnergyRow] {
        self.contact.as_ref().map_or(&[], |contact| contact.exact_external_energy.as_slice())
    }

    // ---------------------------------------------------------------- agent boundary

    /// Entities whose decision clock has come due. Ask each one for a command
    /// via [`World::observe`] + [`World::submit`], then [`World::step`].
    #[inline]
    pub fn pending_decisions(&self) -> &[EntityId] {
        &self.pending
    }

    /// What `id` can perceive of the articulated fight.
    ///
    /// The subject-scoped twin of [`World::observe`], and total in exactly the
    /// same way: a stale identity, a corpse, or a Legacy world answers
    /// [`Observation::BLANK`] rather than panicking, because callers
    /// driving a replay may name the dead. Deadness is the query's own answer
    /// and not a consequence of when it was asked, for the reason
    /// [`World::pose`] gives.
    ///
    /// It is called once per [`World::observe`] and used to land in the legacy
    /// observation's `articulated` field, where it returned on the model check
    /// before touching a column. That was not free to a Legacy world: the legacy
    /// observation carried the 2032-byte block by value, so every observation
    /// copied it twice and zero-filled a vector twice as wide. Measured at 6% of
    /// `lab bench`; guarding the call on the model did not recover it, because
    /// the cost was the embedding rather than the call -- and the embedding is
    /// what went away. The separate entry point
    /// exists for the articulated policy seam, which wants the subject picture
    /// without the legacy one.
    ///
    /// **Selection is on ground truth**, exactly as the legacy contact list is:
    /// you notice what is genuinely nearest, and noise is applied afterwards to
    /// what was noticed. What differs from the legacy path is the cap --
    /// [`MAX_OPPONENTS`], not [`Stats::tracked_contacts`] -- because
    /// this block's width is a fixed wasm row stride before it is a percept, and
    /// a dim character's rows are blurred rather than fewer.
    ///
    /// Opposing faction only. There is no ally block in the articulated ABI at
    /// all, and inventing one here would be a width change rather than a
    /// selection change.
    ///
    /// [`Stats::tracked_contacts`]: crate::Stats::tracked_contacts
    pub fn observe(&self, id: EntityId) -> Observation {
        let Some(i) = self.resolve(id) else { return Observation::BLANK };
        let Some(state) = self.wounds.get(i).copied() else { return Observation::BLANK };
        if state.is_dead() { return Observation::BLANK; }
        let Some(spec) = self.anatomy_spec(i) else { return Observation::BLANK };

        let me = self.pos[i];
        // **The floor the body is standing on, exactly as
        // [`World::pose`] reads it**, and it used to be `Fx::ZERO`
        // here while the pose row used `ground_z`. The observation and the pose
        // disagreed about where a body was, which on a sculpted floor plan puts
        // every column of this block a hill's height away from the geometry the
        // renderer and the contact phase use.
        //
        // Correcting the origin rather than appending a "ground height relative
        // to the opponent's" column is the whole of the fix, and the rejected
        // alternative is why: every *other* spatial column here -- opponent
        // capsules, weapon endpoints, hand positions -- would still have been
        // flattened onto z = 0, so a fighter on a hill would have read the
        // height difference in one column and seen a level opponent in twenty.
        // The relative ground now falls out of the positions that were always
        // supposed to carry it.
        //
        // **It is free today and the golden registry is what says so**: every
        // shipped scenario is flat, `ground_z` is zero everywhere, and not one
        // existing column moves. `lab articulated --seeds 400 --mirrored`
        // reads commands derived from this block, so a change on a flat world
        // would land in its `script` digest.
        let body = Vec3::new(me.x, me.y, self.ground_z[i]);
        let command = self.command_core[i].unwrap_or_else(|| self.neutral_core(i));
        let targets = self.commanded_targets(i, spec, &command);
        // Proprioception is free, so every column below is ground truth. The
        // rule is the legacy observation's `position` column's and it does not
        // weaken because
        // the body grew joints: a fighter knows where its own hand is however
        // dim it is.
        let arms = core::array::from_fn(|limb| {
            let arm = self.arms[i][limb];
            let part = limb_body_part(limb as u8).expect("a limb slot") as usize;
            ObservedArm {
                hand: body + arm.hand,
                target_hand: body + targets[limb],
                // Body-relative, matching `PosedArm::velocity`. See its doc for
                // why the sum is not published instead.
                velocity: arm.linear_velocity,
                fatigue: arm.fatigue,
                integrity_fraction: anatomy::part_fraction(&state, spec, part),
                severed: state.parts[part].severed,
                // What the grip actually holds, resolved through the carried
                // slot the same way `equipment_in_grip` resolves it.
                //
                // **Deliberately not subject to the one-collider ownership
                // rule**, unlike the weapon capability bits and the drawn
                // geometry beside them: a two-handed item is in both grips,
                // both grip bits are set for exactly that reason, and this
                // field answers "what is this hand holding" rather than "who
                // owns the collider". A reader wanting the owner asks the
                // weapon bit; a reader wanting the hand asks this.
                equipment: self.grips[i][limb].equipment_slot.and_then(|slot| {
                    self.body_carried[i].get(slot as usize).copied().flatten()
                }),
            }
        });
        let mut weapons = [None; 2];
        for limb in 0..2 {
            let Some(item) = self.equipment_in_grip(i, limb) else { continue };
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            weapons[limb] = geometry::segment_pose(body, self.arms[i][limb], item);
        }

        let stats = self.stats[i];
        let sight = stats.sight_range();
        let mut seen = Nearest::new(MAX_OPPONENTS);
        for j in 0..self.alive.len() {
            if j == i || !self.alive[j] { continue; }
            if self.faction[j] == self.faction[i] { continue; }
            let delta = self.pos[j] - me;
            if delta.length() > sight { continue; }
            // Rock stops eyes, the same predicate and the same reason as the
            // legacy list. Free and bit-identical on an uncarved plan.
            if !self.dungeon.sees(me, self.pos[j]) { continue; }
            // An articulated body with no anatomy cannot be built into a row,
            // and construction never produces one. Filtered here rather than
            // handled below so a retained row is always a complete row -- the
            // noise stream draws per retained row, and a row that blanked
            // itself afterwards would leave a hole in the middle of the list.
            if self.anatomy_spec(j).is_none() { continue; }
            // The reference's key. `length_sq` and not `length`: it saturates
            // past ~181 units and no arena is that wide, and the two order
            // identically apart from where fixed-point rounding separates a
            // tie. The stated tie-break is (index, generation) and `Nearest`
            // breaks on the slot index, which is the same order -- a live slot
            // has exactly one generation, so generation can never be reached.
            seen.offer(delta.length_sq(), j);
        }

        // A stream of its own, and that is the entire point of the domain: this
        // draws at the same (seed, tick, entity) as the legacy observation, so
        // without a domain the two would hand the same body the same numbers
        // and a policy reading both would see one error twice. Folded into the
        // seed argument because `from_stream` has only two coordinates and both
        // are already spoken for.
        let mut rng = Rng::from_stream(
            self.seed ^ ARTICULATED_OBSERVATION_DOMAIN,
            self.tick as u64,
            ((i as u64) << 32) | self.generation[i] as u64,
        );
        let noise = stats.perception_noise();
        let mut opponents = [ObservedOpponent::BLANK; MAX_OPPONENTS];
        for (slot, &(_, j)) in seen.items().iter().enumerate() {
            opponents[slot] = self.observed_opponent(i, j, noise, &mut rng);
        }

        Observation {
            tick: self.tick,
            subject: id,
            capabilities: self.body_capabilities(i, &state),
            body_position: body,
            body_yaw: self.body_yaw[i].angle,
            body_velocity: Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO),
            arms,
            shield: match self.shield_pose[i] {
                Some(pose) => ObservedShield {
                    present: true,
                    centre: body + pose.centre,
                    normal: pose.normal,
                    half_width: pose.half_width,
                    half_height: pose.half_height,
                },
                None => ObservedShield::BLANK,
            },
            blood_fraction: anatomy::blood_fraction(&state, spec),
            shock: state.shock,
            integrity_fraction: core::array::from_fn(|part| anatomy::part_fraction(&state, spec, part)),
            wound_fraction: core::array::from_fn(|part| anatomy::part_wound_fraction(&state, spec, part)),
            severed_mask: severed_mask_of(&state),
            opponent_count: seen.len() as u8,
            opponents,
            standing_height: spec.standing_height,
            arm_length: spec.arm_length,
            hand_radius: spec.hand_radius,
            weapons,
            stance: self.observed_stance(i),
        }
    }

    /// The subject's own legs and joints, or [`ObservedStance::BLANK`].
    ///
    /// **Every column is a fraction, and the divisor is what stays inside.**
    /// `STANCE_TWIST_LIMIT_RAW`, `PELVIS_HEIGHT_RAW` and `STANCE_STEP_TICKS` are
    /// `pub` in `crate::combat::actuator` and are not re-exported from `sim`, so
    /// a policy handed the raw numbers could not turn them into anything. The
    /// ratio is the half that carries the meaning and this is the only place it
    /// can be taken.
    ///
    /// The `get` below is the whole guard now. A model guard stood in front of
    /// it so that a legless world paid nothing at all -- not the two
    /// `posed_anatomy` clones below, and not the pair of `reachable_extent`
    /// calls inside `reach_headroom` -- and every world has legs now, so the
    /// only slot that can still miss is one with no row, which the `get`
    /// answers. The articulated observation is measured at 6% of `lab bench`, so
    /// the cost is real; there is simply nobody left who is not paying it.
    fn observed_stance(&self, i: usize) -> ObservedStance {
        let Some(stance) = self.stance.get(i).copied() else { return ObservedStance::BLANK };
        let yaw = self.body_yaw[i].angle;
        // The posed anatomy, so the shoulder the elbow is measured from is the
        // one the collider builder and the sweep use. Reading the immutable row
        // would put the joint a pelvis-drop above the arm it belongs to, on
        // exactly the model that has a pelvis to drop -- the same argument
        // `arm_elbows` makes one layer down, and the reason it is the value
        // both of them read.
        let anatomy = self.posed_anatomy(i);
        let links = crate::combat::limb::Elbow::of(&anatomy);
        let elbows = self.arm_elbows(i);
        let arm_length = anatomy.arm_length;
        let over_arm = |v: Fx| {
            if arm_length.is_positive() { (v / arm_length).clamp(-Fx::ONE, Fx::ONE) } else { Fx::ZERO }
        };
        ObservedStance {
            present: true,
            // The hips measured from the torso: the frame an embodied command is
            // given in. See `ObservedStance::hip_yaw` for why this and the
            // fraction below are opposite in sign and why both are published.
            hip_yaw: stance.hip_yaw - yaw,
            twist_fraction: twist_fraction(stance.twist(yaw)),
            // Clamped although the driver cannot produce a pelvis above the
            // standing one: a hand-built world can, and a column outside the
            // vector's invariant is worse than a saturated one.
            pelvis_fraction: (stance.pelvis / Fx::from_raw(actuator::PELVIS_HEIGHT_RAW))
                .clamp(Fx::ZERO, Fx::ONE),
            step_fraction: Fx::from_ratio(
                stance.step_left as i32, actuator::STANCE_STEP_TICKS as i32,
            ).clamp(Fx::ZERO, Fx::ONE),
            elbow: core::array::from_fn(|limb| match elbows[limb] {
                // An embodied hand is clamped into the annulus before it is
                // integrated, so the joint always closes and `None` is a bug
                // rather than a case. Zero is what it writes, and zero is a
                // pose no real elbow takes -- the joint sits an upper link away
                // from the shoulder, never on it.
                Some(joint) => {
                    let d = joint - crate::combat::limb::shoulder(&anatomy, yaw, limb);
                    Vec3::new(over_arm(d.x), over_arm(d.y), over_arm(d.z))
                }
                None => Vec3::ZERO,
            }),
            reach_headroom: core::array::from_fn(|limb| {
                crate::combat::limb::reach_headroom(
                    &anatomy, self.arms[i][limb].height, self.arms[i][limb].reach, links,
                )
            }),
        }
    }

    /// An opponent's legs, or [`ObservedOpponentStance::BLANK`].
    ///
    /// **Exact, and the argument is `body_yaw`'s**: the twist is the angle
    /// between two halves of one silhouette, and a fighter that can read where a
    /// body faces can read that it is wound up. See [`ObservedOpponentStance`]
    /// for what that concedes and why it is the right concession.
    fn observed_opponent_stance(&self, j: usize) -> ObservedOpponentStance {
        let Some(stance) = self.stance.get(j).copied() else { return ObservedOpponentStance::BLANK };
        ObservedOpponentStance {
            present: true,
            twist_fraction: twist_fraction(stance.twist(self.body_yaw[j].angle)),
            stepping: stance.step_left > 0,
        }
    }

    /// What this body can currently do, as the reference's eight bits.
    ///
    /// Every rule is a **presence** fact -- a region is attached, a grip holds
    /// something, an item has a geometry -- and never a threshold on a
    /// continuous column, because the reference calls these bits categorical
    /// and noise-free and a bit derived from `arm_authority` would flicker as
    /// shock crossed a boundary. Each constant's doc argues its own rule and
    /// names what was rejected.
    fn body_capabilities(&self, i: usize, state: &AnatomyState) -> u32 {
        let mut bits = 0u32;
        if state.present(BodyPart::Legs) {
            bits |= Observation::MOVEMENT | Observation::TURNING;
        }
        let grip = [Observation::LEFT_GRIP, Observation::RIGHT_GRIP];
        let weapon = [Observation::LEFT_WEAPON, Observation::RIGHT_WEAPON];
        for limb in 0..2 {
            if self.grips[i][limb].equipment_slot.is_some() { bits |= grip[limb]; }
            let Some(item) = self.equipment_in_grip(i, limb) else { continue };
            // The pose row's ownership rule, repeated because a set bit and a
            // drawn weapon that disagreed about a two-handed item would put a
            // second sword in the fight.
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            if matches!(item.geometry, EquipmentGeometry::Segment { .. }) { bits |= weapon[limb]; }
        }
        // Read off the derived pose rather than off the grips, so one face is
        // one bit however many hands are on it.
        if self.shield_pose[i].is_some() { bits |= Observation::SHIELD; }
        if self.two_handed(i) { bits |= Observation::TWO_HANDED; }
        bits
    }

    /// One perceived opponent row, drawn against `rng` in the reference's
    /// order.
    ///
    /// **Seven draws, always seven.** Body position XYZ, body velocity XYZ,
    /// timing -- and all seven whatever this body happens to be carrying,
    /// because a row that drew fewer when a shield was missing would shift
    /// every row after it. What one fighter perceives would then depend on what
    /// somebody else is holding, which is not a perception model, it is a bug
    /// with a plausible story.
    ///
    /// Z is drawn along with X and Y even though a body has no vertical degree
    /// of freedom today. The stream is an ABI and it does not get to depend on
    /// which axes the physics currently uses; the day a body leaves the floor,
    /// nothing about the numbering moves.
    ///
    /// **The geometry is translated, never re-derived.** Every region, weapon
    /// and shield is built at the *measured* body origin, which is exactly the
    /// reference's "keeps its exact local shape and is translated by
    /// measured-minus-true". Blurring each point separately would shear a body
    /// into disconnected parts -- an arm three feet from its shoulder -- and
    /// that is not what poor eyesight does to a silhouette.
    fn observed_opponent(&self, i: usize, j: usize, noise: Fx, rng: &mut Rng) -> ObservedOpponent {
        // `Rng::signed_unit` is the reference's conversion under its own name:
        // `(draw >> 15) as i32 - 65_536`, read as an `Fx` raw, giving a
        // fraction in [-1, 1). Writing it out again here would be a second copy
        // of a formula `fx` already owns and tests.
        let mut jitter = [Fx::ZERO; 7];
        for draw in jitter.iter_mut() { *draw = rng.signed_unit(); }

        // The perceived body origin, on the floor it is standing on. The Z term
        // used to be the noise alone, which said every opponent stands at z = 0
        // however far up or down the plan it is -- the same disagreement with
        // [`World::pose`] the subject's own origin carried, and it
        // has to be corrected in both places or a fighter on a hill would see
        // itself raised and everybody else level.
        let measured = Vec3::new(
            self.pos[j].x + jitter[0] * noise,
            self.pos[j].y + jitter[1] * noise,
            self.ground_z[j] + jitter[2] * noise,
        );
        // A quarter of the positional error. Velocity is a difference of two
        // positions a tick apart, so an eye that misplaces a body by a stride
        // does not misjudge its heading by a stride per tick.
        let velocity = Vec3::new(
            self.vel[j].x + jitter[3] * noise / 4,
            self.vel[j].y + jitter[4] * noise / 4,
            jitter[5] * noise / 4,
        );

        let anatomy = self.posed_anatomy(j);
        let anatomy = &anatomy;
        let state = self.wounds.get(j).copied().unwrap_or(AnatomyState::EMPTY);
        let present: [bool; BodyPart::COUNT] =
            core::array::from_fn(|part| !state.parts[part].severed);
        let yaw = self.body_yaw[j].angle;
        // **The first five volumes and deliberately not all seven, which is the
        // one place in the crate where a swept-volume list is narrowed to
        // anatomy on purpose.** An observation is a targeting view: a policy
        // picks a `BodyPart` to aim at, and a forearm is not separately
        // targetable -- it has no armour row, no integrity, and no severance of
        // its own, so a sixth and seventh row would be two more capsules a
        // policy could name and no new decision it could make.
        //
        // Keeping it five is also what leaves the observation layout still.
        // `ARTICULATED_OPPONENT_FEATURES` counts region words, so widening this
        // moves `FEATURE_LAYOUT_VERSION`, every trained checkpoint's input shape
        // and `LEARNED_INFERENCE_DIGEST` -- which is session 09's business and
        // not a rider on a collider change. The truncation is safe by
        // construction rather than by luck: volumes `0..5` are the five regions
        // in `AnatomyRegion::ALL` order and always will be, which is exactly what
        // `forearm_volume` appending rather than interleaving buys.
        let regions = geometry::body_region_volumes(
            measured, anatomy, yaw,
            [self.arms[j][0].hand, self.arms[j][1].hand], present);
        let regions = core::array::from_fn(|part| regions[part]);

        let mut weapons = [None; 2];
        for limb in 0..2 {
            let Some(item) = self.equipment_in_grip(j, limb) else { continue };
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            weapons[limb] = geometry::segment_pose(measured, self.arms[j][limb], item);
        }

        // The reference's timing formula, read off the observation's own
        // columns and in the written order. The opponent terms are the measured
        // ones and the subject's are exact, so a policy that recomputed this
        // from the published numbers gets the published answer back -- which it
        // would not if the sim quietly used ground truth here and blurred the
        // positions beside it.
        let delta_xy = Vec2::new(measured.x, measured.y) - self.pos[i];
        let distance = delta_xy.length();
        // `Vec2::normalize` is the reference's `normalized_or_zero`: same
        // function, and `fx` names it asymmetrically between two and three
        // dimensions. Adding an alias so the call site could match the prose
        // would be a duplicate for a spelling.
        let closing = (self.vel[i] - Vec2::new(velocity.x, velocity.y)).dot(delta_xy.normalize());
        let timing = if !closing.is_positive() {
            Fx::ONE
        } else {
            (distance / closing.max(Fx::from_ratio(1, 256))).clamp(Fx::ZERO, Fx::ONE)
        };

        ObservedOpponent {
            id: self.id_of(j),
            body_position: measured,
            body_velocity: velocity,
            body_yaw: yaw,
            regions,
            weapons,
            shield: match self.shield_pose[j] {
                Some(pose) => ObservedShield {
                    present: true,
                    centre: measured + pose.centre,
                    normal: pose.normal,
                    half_width: pose.half_width,
                    half_height: pose.half_height,
                },
                None => ObservedShield::BLANK,
            },
            severed_mask: severed_mask_of(&state),
            // An eighth of the positional error, and applied to both branches:
            // the "nothing is closing" one is a judgement like any other, and
            // skipping it there would make the noise term mean two things.
            //
            // **At the shipped duel's stats this column is a coin flip as a
            // boolean, and so is the `closing` sign above it.** Two separate
            // facts, measured 2026-08-18 and recorded here because a policy
            // reaches for this column first: the saturating branch sits exactly
            // at `ONE`, so symmetric noise pushes it below one on half of all
            // draws at every range; and `velocity` is already blurred by a
            // quarter of the positional error, which for a Fighter's eye is
            // 0.225 world units per tick against a whole closing range of
            // 0.0994. Nothing here changes -- the model is right and the eyes
            // are dim -- but a reader deciding whether to gate on either should
            // know it before spending a session on it. The measurement is
            // `docs/performance/embodied-tactical-policy.md`; the design
            // consequence is `docs/design/navigation-visibility.md`.
            contact_timing: (timing + jitter[6] * noise / 8).clamp(Fx::ZERO, Fx::ONE),
            // Exact, and drawn against nothing: the stream stays seven draws.
            stance: self.observed_opponent_stance(j),
        }
    }

    pub fn objective(&self, faction: Faction) -> Objective {
        self.objectives[faction.index()]
    }

    /// Everything needed to draw one articulated body, in world space.
    ///
    /// One query rather than an accessor per column, and that is the whole
    /// design: a caller that assembled a pose out of a dozen getters would be
    /// free to mix the body-relative frame the actuator works in with the
    /// absolute frame the geometry lives in, which is precisely the mistake
    /// `combat::geometry` exists to make impossible. Here the conversion
    /// happens once, on the way out, and [`Pose`] states the frame.
    ///
    /// `None` for a stale identity or a dead body; total for everything else.
    /// Deadness is checked here rather than left to the reap
    /// phase catching up, because "no pose for a corpse" should be a property
    /// of the query and not a property of when it happened to be called.
    ///
    /// Ground truth, with no perception noise and no visibility filtering. It
    /// is the host's job to decide who may see which row.
    pub fn pose(&self, id: EntityId) -> Option<Pose> {
        let i = self.resolve(id)?;
        let state = *self.wounds.get(i)?;
        if state.is_dead() { return None; }
        let spec = self.anatomy_spec(i)?;
        // The floor the body is standing on, which is zero on every flat
        // dungeon and is why the pose row needed no ABI change to carry it: its
        // words 2..4 have published body XYZ since the layout was frozen.
        let body = Vec3::new(self.pos[i].x, self.pos[i].y, self.ground_z[i]);
        let yaw = self.body_yaw[i].angle;
        // The same substitution `drive_arms` makes, so the target
        // published is the one the arm is actually being driven toward. A slot
        // that never had a command is holding its neutral pose, not chasing
        // nothing, and a zero here would draw a reach line to the map origin.
        let command = self.command_core[i].unwrap_or_else(|| self.neutral_core(i));
        let targets = self.commanded_targets(i, spec, &command);

        // Solved once for the pair, because `arm_elbows` clones a posed anatomy
        // and derives both link lengths from it; asking per limb inside the
        // closure below would do that work twice for one answer.
        let elbows = self.arm_elbows(i);
        let arms = core::array::from_fn(|limb| {
            let arm = self.arms[i][limb];
            PosedArm {
                hand: body + arm.hand,
                // Into world space here, with `hand`, because the frame this row
                // promises is world and `arm_elbows` answers in the body's.
                elbow: elbows[limb].map(|joint| body + joint),
                velocity: arm.linear_velocity,
                fatigue: arm.fatigue,
                target_hand: body + targets[limb],
            }
        });
        let mut weapons = [None; 2];
        for limb in 0..2 {
            let Some(item) = self.equipment_in_grip(i, limb) else { continue };
            // The collider builder's ownership rule, and it has to be the same
            // one: one item is one collider and one drawn weapon, owned by the
            // right arm.
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            weapons[limb] = geometry::segment_pose(body, self.arms[i][limb], item);
        }
        let shield = self.shield_pose[i]
            .map(|pose| ShieldPose { centre: body + pose.centre, ..pose });
        let severed_mask = severed_mask_of(&state);
        Some(Pose {
            id,
            body,
            body_yaw: yaw,
            body_velocity: Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO),
            arms,
            weapons,
            shield,
            integrity_fraction: core::array::from_fn(|part| anatomy::part_fraction(&state, spec, part)),
            wound_fraction: core::array::from_fn(|part| anatomy::part_wound_fraction(&state, spec, part)),
            blood_fraction: anatomy::blood_fraction(&state, spec),
            shock: state.shock,
            severed_mask,
            // Read off the geometry above rather than off the grips, so a set
            // bit and a drawn item cannot disagree about a two-handed weapon,
            // a shield in a weapon slot, or an arm that just came off.
            equipment_mask: weapons[0].is_some() as u8
                | (weapons[1].is_some() as u8) << 1
                | (shield.is_some() as u8) << 2,
            intent: command.intent,
            hints: core::array::from_fn(|limb| self.animation_hint(i, limb, &state)),
        })
    }

    /// Every live articulated body's pose, in ascending full identity.
    ///
    /// A slot holds at most one live body, so ascending slot index *is*
    /// ascending `(index, generation)`. That is the order the browser
    /// boundary's pose buffer publishes rows in, and stating it here is what
    /// stops the host inventing a second one.
    ///
    /// An iterator and deliberately not a `Vec`: the only caller is the
    /// publication path in `crates/web`, where an allocation grows linear
    /// memory and growing linear memory detaches every typed array the page is
    /// holding.
    /// One embodied body's stance, in the shape a publication reads it.
    ///
    /// A view rather than the `StanceState` column, for the reason
    /// [`Pose`] is a view rather than the arm columns: what crosses
    /// this boundary is what a reader needs, and the integrator's residues are
    /// not that. `twist_raw` is derived here rather than stored, so a consumer
    /// cannot be handed a twist that disagrees with the two angles it is a
    /// function of.
    pub fn stance(&self, id: EntityId) -> Option<StanceView> {
        let i = self.resolve(id)?;
        if !self.alive[i] { return None; }
        let stance = *self.stance.get(i)?;
        Some(StanceView {
            id,
            hip_yaw: stance.hip_yaw,
            pelvis: stance.pelvis,
            twist_raw: stance.twist(self.body_yaw[i].angle),
            step_left: stance.step_left,
        })
    }

    /// Every live embodied body's stance, in slot order.
    ///
    /// Empty for a model with no legs, which is what lets a publication write a
    /// zero-length section unconditionally rather than branching on the model.
    pub fn stances(&self) -> impl Iterator<Item = StanceView> + '_ {
        let slots = self.alive.len();
        (0..slots).filter_map(|i| {
            if !self.alive[i] { return None; }
            self.stance(self.id_of(i))
        })
    }

    pub fn poses(&self) -> impl Iterator<Item = Pose> + '_ {
        let slots = self.alive.len();
        (0..slots).filter_map(|i| {
            if !self.alive[i] { return None; }
            self.pose(self.id_of(i))
        })
    }

    /// Where the actuator is driving each hand, in the **body-relative** frame
    /// the joint works in.
    ///
    /// Extracted so [`World::pose`] and
    /// [`World::observe`] cannot answer differently: a renderer
    /// drawing a reach line and a policy reading where its own hand is going
    /// are asking one question, and a second copy of this is a second thing to
    /// keep in step with the integrator.
    ///
    /// It repeats `integrate_arm`'s own reach clamp rather than trusting it.
    /// A published target the joint would refuse is a point the hand never
    /// reaches, so the arm reads as though it never arrived.
    fn commanded_targets(
        &self,
        i: usize,
        spec: &BodyAnatomySpec,
        command: &CommandCoreV1,
    ) -> [Vec3; 2] {
        let yaw = self.body_yaw[i].angle;
        let mut targets = [Vec3::ZERO; 2];
        for limb in 0..2 {
            // **Through the same door the arm driver goes through, and it was
            // not.** `world_arm_target` is where a torso-relative bearing
            // becomes a world one and where the annulus clamp bites; this read
            // `command.arms[limb]` raw. Under the retired world frame the two
            // were the same value and nothing moved, which is why it stood --
            // but read from the torso the published target was a whole body yaw
            // off the pose the integrator was actually chasing, and the field's
            // own doc says the two "agree by construction". They did not.
            let arm = self.world_arm_target(i, limb, command.arms[limb]);
            let reach = arm.reach.clamp(Fx::from_raw(actuator::ARM_MIN_REACH_RAW), Fx::ONE);
            targets[limb] = actuator::hand_position(spec, yaw, limb, arm.bearing, arm.height, reach);
        }
        if self.two_handed(i) {
            targets[0] = actuator::mirror_hand(spec, yaw, targets[1]);
        }
        targets
    }

    /// One arm's animation hint, in the reference's priority order.
    ///
    /// The order is the argument. Severance outranks everything, because a
    /// missing arm has no pose to be busy in. Both contact codes outrank both
    /// motion codes, because a tick that touched something is about the touch
    /// whatever the actuator meant to be doing. And the two contact codes are
    /// separated by whether the commit actually wrote the joint: an arm that
    /// was named in a resolution and came through it unmoved held its ground,
    /// which is a different thing to draw than one that was hauled.
    fn animation_hint(&self, i: usize, limb: usize, state: &AnatomyState) -> AnimationHint {
        let part = limb_body_part(limb as u8).expect("a limb slot");
        if state.parts[part as usize].severed { return AnimationHint::Severed; }
        let overrode = self.contact.as_ref().and_then(|contact| contact.entry.get(i))
            .is_some_and(|entry| entry.contact_overrode[limb]);
        if overrode { return AnimationHint::Recoiling; }
        let entity = self.id_of(i);
        let named = self.contact_resolutions().iter().any(|row| {
            let key = row.fact.key;
            (key.a == entity && key.a_slot as usize == limb)
                || (key.b == entity && key.b_slot as usize == limb)
        });
        if named { return AnimationHint::Contact; }
        let arm = self.arms[i][limb];
        let moving = arm.bearing_speed_turns != Fx::ZERO
            || arm.height_speed != Fx::ZERO
            || arm.reach_speed != Fx::ZERO;
        if moving { return AnimationHint::Chasing; }
        let shielded = self.equipment_in_grip(i, limb)
            .is_some_and(|item| matches!(item.geometry, EquipmentGeometry::Shield { .. }));
        if shielded { AnimationHint::Braced } else { AnimationHint::Idle }
    }

    #[cfg(test)]
    pub(crate) fn pose_test_view(&self, id: EntityId) -> Option<PoseTestView> {
        let i = self.resolve(id)?;
        Some(PoseTestView {
            body_yaw: self.body_yaw[i],
            arms: self.arms[i],
            grips: self.grips[i],
            shield_pose: self.shield_pose[i],
            move_authority: self.move_authority[i],
            turn_authority: self.turn_authority[i],
            arm_authority: self.arm_authority[i],
        })
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn exact_trajectory_remainder_view(&self, id: EntityId)
        -> Option<(bool, bool)>
    {
        let owner = self.exact_owners.get(self.resolve(id)?)?.as_ref()?;
        let mut momentum = owner.common_response.momentum.iter()
            .any(|word| word.remainder != 0);
        let mut position = owner.common_response.at_group.iter()
            .any(|word| word.remainder != 0);
        for held in owner.held_response.iter().flatten() {
            momentum |= held.affine.momentum.iter().any(|word| word.remainder != 0);
            position |= held.affine.at_group.iter().any(|word| word.remainder != 0);
        }
        Some((momentum, position))
    }

    /// Corrupts one real retained remainder so the digest test can demonstrate
    /// that authority, rather than only its summary witness, is load-bearing.
    #[cfg(all(test, feature = "cartesian-recoil"))]
    pub(crate) fn mutate_exact_owner_remainder_for_test(&mut self) -> bool {
        for owner in self.exact_owners.iter_mut().flatten() {
            for word in &mut owner.common_response.momentum {
                if word.remainder != 0 {
                    word.remainder ^= 1;
                    return true;
                }
            }
            for word in &mut owner.common_response.at_group {
                if word.remainder != 0 {
                    word.remainder ^= 1;
                    return true;
                }
            }
            for held in owner.held_response.iter_mut().flatten() {
                for word in &mut held.affine.momentum {
                    if word.remainder != 0 {
                        word.remainder ^= 1;
                        return true;
                    }
                }
                for word in &mut held.affine.at_group {
                    if word.remainder != 0 {
                        word.remainder ^= 1;
                        return true;
                    }
                }
            }
        }
        false
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn anatomy_diagnostic_view(&self, id: EntityId) -> Option<AnatomyState> {
        self.wounds.get(self.resolve(id)?).copied()
    }

    #[cfg(all(test, feature = "cartesian-recoil"))]
    pub(crate) fn anatomy_test_view(&self, id: EntityId) -> Option<AnatomyState> {
        self.anatomy_diagnostic_view(id)
    }

    /// The floor plan. Read-only: a level change is a new [`World`].
    pub fn dungeon(&self) -> &Dungeon {
        &self.dungeon
    }

    /// The doorways on this level and whether each stands open, in the order
    /// [`Dungeon::doorways`] found them.
    ///
    /// **The one thing the floor plan cannot answer.** A *shut* door is `DOOR`
    /// in the grid and an *open* one is `OPEN`, indistinguishable from the floor
    /// it was cut into -- so a renderer working from the tiles alone watches the
    /// doorway vanish the moment somebody walks through it, which reads as a bug
    /// rather than as a door. This is what the browser's furniture buffer is
    /// filled from (`crates/web/src/lib.rs`, `write_furniture`).
    ///
    /// Presentation only, and deliberately not `pressed`: how hard somebody is
    /// leaning on a door is simulation state that the page has no picture for,
    /// and publishing it would invite one that moved sixty times a second off a
    /// buffer that is read once a level.
    pub fn doorways(&self) -> impl ExactSizeIterator<Item = (Door, bool)> + '_ {
        self.doors.iter().map(|d| (d.door, d.open))
    }

    /// Door authority including sustained-push progress for a physical leaf.
    pub fn door_objects(&self) -> impl ExactSizeIterator<Item = DungeonObjectView> + '_ {
        self.doors.iter().enumerate().map(|(identity, state)| {
            let mut lo_x = i32::MAX;
            let mut hi_x = i32::MIN;
            let mut lo_y = i32::MAX;
            let mut hi_y = i32::MIN;
            for &cell in state.door.cells() {
                let (tx, ty) = self.dungeon.tile_at(cell);
                lo_x = lo_x.min(tx); hi_x = hi_x.max(tx);
                lo_y = lo_y.min(ty); hi_y = hi_y.max(ty);
            }
            let horizontal = hi_x != lo_x;
            DungeonObjectView {
                kind: DungeonObjectKind::Door,
                identity: identity as u32,
                state_flags: u32::from(state.open),
                position: Vec2::new(
                    Fx::from_ratio(lo_x + hi_x + 1, 2),
                    Fx::from_ratio(lo_y + hi_y + 1, 2),
                ),
                yaw: Angle::from_raw(if horizontal { 0 } else { 16_384 }),
                half_extents: if horizontal {
                    Vec2::new(Fx::from_ratio(hi_x - lo_x + 1, 2), Fx::from_ratio(1, 10))
                } else {
                    Vec2::new(Fx::from_ratio(1, 10), Fx::from_ratio(hi_y - lo_y + 1, 2))
                },
                hp: Fx::ZERO,
                max_hp: Fx::ZERO,
                progress: Fx::from_ratio(state.pressed as i32, rules::DOOR_TICKS as i32),
                material_code: 1,
            }
        })
    }

    /// Physical props in stable identity order, including broken tombstones.
    pub fn dungeon_objects(&self) -> impl ExactSizeIterator<Item = DungeonObjectView> + '_ {
        self.dungeon_props.iter().map(|prop| DungeonObjectView {
            kind: prop.kind,
            identity: prop.identity,
            state_flags: u32::from(prop.broken),
            position: prop.position,
            yaw: prop.yaw,
            half_extents: prop.half_extents,
            hp: prop.hp,
            max_hp: prop.max_hp,
            progress: Fx::ZERO,
            material_code: match prop.kind {
                DungeonObjectKind::Barrel => 2,
                DungeonObjectKind::Pottery => 3,
                DungeonObjectKind::Web => 4,
                DungeonObjectKind::Water => 5,
                _ => 0,
            },
        })
    }

    /// Whether a body of this radius can stand here without overlapping
    /// masonry -- or the outside, which [`Dungeon::solid`] reports as masonry
    /// too, so this covers the arena boundary without a second test.
    ///
    /// Delegates rather than reimplements, so a caller that has to place
    /// something -- the browser's spawn ring, say -- asks the same question the
    /// collision resolver answers, instead of growing a second opinion about
    /// what a legal position is.
    pub fn is_walkable(&self, p: Vec2, radius: Fx) -> bool {
        self.dungeon.is_clear(p, radius)
    }

    /// The nearest place a body of this radius can stand. Total; see
    /// [`Dungeon::nearest_clear`].
    pub fn nearest_walkable(&self, p: Vec2, radius: Fx) -> Vec2 {
        self.dungeon.nearest_clear(p, radius)
    }

    pub fn order(&self, faction: Faction) -> Order {
        self.orders[faction.index()]
    }

    /// What `id` is carrying.
    pub fn loadout(&self, id: EntityId) -> Option<Loadout> {
        self.resolve(id).map(|i| self.loadout[i])
    }

    /// Which loadout slot `id` currently has in hand, and what that is.
    pub fn held(&self, id: EntityId) -> Option<(u8, ActionKind)> {
        self.resolve(id).map(|i| (self.slot[i], self.action_of(i)))
    }

    /// What `id`'s attributes are.
    pub fn stats(&self, id: EntityId) -> Option<Stats> {
        self.resolve(id).map(|i| self.stats[i])
    }

    // ---------------------------------------------------------------- queries

    #[inline]
    pub fn tick(&self) -> u32 {
        self.tick
    }

    #[inline]
    pub fn seed(&self) -> u64 {
        self.seed
    }

    #[inline]
    pub fn arena(&self) -> Vec2 {
        self.arena
    }

    /// `None` while both sides still stand.
    pub fn outcome(&self) -> Option<Outcome> {
        let heroes = self.alive_count(Faction::Heroes);
        let monsters = self.alive_count(Faction::Monsters);
        match (heroes, monsters) {
            (0, 0) => Some(Outcome::MutualDestruction),
            (0, _) => Some(Outcome::MonstersWin),
            (_, 0) => Some(Outcome::HeroesWin),
            _ => None,
        }
    }

    /// How a fight that reached its tick limit is scored: on points, to
    /// whichever side is holding more of the health it started with.
    ///
    /// A draw was the honest answer while the clock was the only thing that
    /// could end a fight neither side was winning. It is the wrong answer for a
    /// *difficulty* ladder, because every step down that ladder converts a loss
    /// into a timeout rather than into a defeat: measured, a Fighter slowed to a
    /// 40-tick decision period drew 12% of its fights and one slowed to 60 drew
    /// 20%, so the bottom of the range stopped being "loses" and became
    /// "wanders off". A fighter that spent two and a half minutes being carved
    /// up has lost, and saying so costs nothing and reclaims the whole bottom of
    /// the range.
    ///
    /// A genuine tie is still a [`Outcome::Draw`], and
    /// [`Outcome::is_decisive`] still tells the two apart -- a decision is a
    /// win, and it is not the same win as a kill. `lab::fitness` prices it
    /// accordingly, or evolution would learn to chip once and run out the clock.
    pub fn timeout(&self) -> Outcome {
        let heroes = self.health_fraction(Faction::Heroes);
        let monsters = self.health_fraction(Faction::Monsters);
        if heroes > monsters {
            Outcome::Decision(Faction::Heroes)
        } else if monsters > heroes {
            Outcome::Decision(Faction::Monsters)
        } else {
            Outcome::Draw
        }
    }

    pub fn alive_count(&self, faction: Faction) -> usize {
        (0..self.alive.len())
            .filter(|&i| self.alive[i] && self.faction[i] == faction)
            .count()
    }

    pub fn alive_ids(&self, faction: Faction) -> Vec<EntityId> {
        (0..self.alive.len())
            .filter(|&i| self.alive[i] && self.faction[i] == faction)
            .map(|i| self.id_of(i))
            .collect()
    }

    /// Total remaining health of a faction, as a fraction of what it started
    /// with. A fitness signal that rewards winning *cleanly*.
    pub fn health_fraction(&self, faction: Faction) -> Fx {
        let mut current = Fx::ZERO;
        let mut total = Fx::ZERO;
        for i in 0..self.alive.len() {
            if self.faction[i] != faction {
                continue;
            }
            total += self.max_health_of(i);
            if self.alive[i] {
                current += self.health_of(i).max(Fx::ZERO);
            }
        }
        if total.is_zero() {
            Fx::ZERO
        } else {
            current / total
        }
    }

    pub fn damage_dealt(&self, faction: Faction) -> Fx {
        let mut total = Fx::ZERO;
        for i in 0..self.alive.len() {
            if self.faction[i] == faction {
                total += self.damage_dealt[i];
            }
        }
        total
    }

    pub fn is_alive(&self, id: EntityId) -> bool {
        self.resolve(id).is_some()
    }

    pub fn view(&self, id: EntityId) -> Option<UnitView> {
        self.resolve(id).map(|i| self.view_at(i))
    }

    /// Everything a renderer needs, and nothing it can write back.
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            tick: self.tick,
            arena: self.arena,
            units: (0..self.alive.len())
                .filter(|&i| self.alive[i])
                .map(|i| self.view_at(i))
                .collect(),
        }
    }

    /// Live articulated arrows in stable slot order.
    pub fn projectiles(&self) -> impl Iterator<Item = ProjectileView> + '_ {
        (0..self.projectile_alive.len())
            .filter(move |&slot| self.projectile_alive[slot])
            .map(move |slot| ProjectileView {
                slot: slot as u32,
                generation: self.projectile_generation[slot],
                owner: self.projectile_owner[slot],
                position: self.projectile_pos[slot],
                velocity: self.projectile_vel[slot],
                radius: self.projectile_radius[slot],
                remaining_range: self.projectile_range[slot],
            })
    }

    fn view_at(&self, i: usize) -> UnitView {
        UnitView {
            id: self.id_of(i),
            kind: self.kind[i],
            faction: self.faction[i],
            stats: self.stats[i],
            position: self.pos[i],
            facing: self.facing[i],
            radius: self.radius[i],
            velocity: self.vel[i],
            mass: self.mass[i],
            hp: self.health_of(i).max(Fx::ZERO),
            max_hp: self.max_health_of(i),
            // **Off the live articulated command**, which is what the pose row
            // beside this one already publishes as `POSE_INTENT`. It used to
            // read the legacy submitted column, and nothing could write that:
            // `Intent::Hold` went out under `UNIT_INTENT` on every frame of
            // every fight while the pose row carried what the body was actually
            // trying to do, so two published words that name the same thing
            // disagreed by construction. The column is gone and they agree.
            intent: self.command_core[i].map_or(Intent::Hold, |command| command.intent),
            limb: self.limb[i],
            action: self.action_of(i),
            spec: self.action_of(i).spec(),
            loadout: self.loadout[i],
            slot: self.slot[i],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    /// The same phases, but with the closing bodies actually *travelling* the
    /// step rather than standing in each other and carrying a velocity.
    ///
    /// The difference is not cosmetic and it took a fixture to find. A pair that
    /// already overlaps at tick start resolves at time zero, where v2-14's
    /// normal rule has no geometry to read and answers world +X unconditionally
    /// -- so of two mirrored blows exactly one is closing and the other is
    /// separating, and a symmetric fixture built that way can never be
    /// symmetric. Giving the sweep real extent puts the contact at a positive
    /// time, where the normal comes off the geometry and both blows land.
    fn resolve_advancing(world: &mut World, closing: &[(usize, Fx)]) {
        world.retain_contact_entry();
        for &(i, speed) in closing {
            world.pos[i] += Vec2::new(speed, Fx::ZERO);
            world.vel[i] = Vec2::new(speed, Fx::ZERO);
        }
        world.record_contact_locomotion();
        world.resolve_contact();
        world.settle_anatomy();
        world.reap_dead_bodies();
    }

    /// [`World::swept_weapon`] and [`World::swept_regions`] publish the question
    /// the contact phase was asked, and `colliders` after a solve is its answer.
    ///
    /// Both ways of confusing the two have already been written by somebody.
    /// `advance_to` walks the driver's rows to each mapped time and `finish_all`
    /// lands them, so previous and requested end the tick on one pose and a
    /// sweep read off them has no extent left; and pass three of the wound
    /// application switches a region off inside the tick that severed it, so
    /// the same reader is told the blade swept a body that had no such region.
    /// The fixture below produces both conditions at once, which is why it is
    /// the one this test uses.
    #[test]
    fn the_published_sweep_is_the_question_and_not_the_solver_s_own_answer() {
        let scenario = fragile_scenario(&[1]);
        let mut world = World::new(&scenario, 1000);
        brace_weapon(&mut world, 0);
        resolve_advancing(&mut world, &[(1, -Fx::ONE)]);
        let defender = EntityId::new(1, 0);
        let region = world.contact_resolutions().iter()
            .find(|row| row.fact.key.kind == ContactKind::WeaponBody && row.severed)
            .expect("the advancing fixture severed no region").fact.volume as usize;

        let live = world.contact.as_ref().expect("an articulated contact runtime")
            .colliders.iter().copied()
            .find(|row| row.entity == defender && matches!(row.shape, ContactShape::Body { .. }))
            .expect("the defender's live body row");
        let ContactShape::Body { parts: solved, previous_origin, requested_origin } = live.shape
            else { unreachable!() };
        assert!(!solved[region].present,
                "the fixture left the severed region switched on, so the check below is vacuous");
        assert_eq!(previous_origin, requested_origin,
                   "the fixture left the live rows unadvanced, so the check below is vacuous");

        let published = world.swept_regions(defender).expect("the tick published its body sweep");
        let (before, after) = published[region];
        assert!(before.present && after.present,
                "the accessor answered from the driver's rows rather than from the snapshot");
        assert_ne!(before.lower, after.lower,
                   "the published region sweep has no extent, so it is an advanced row");
        // And the snapshot is this tick's, not a retained copy of an earlier
        // one: its entry end is where the body started this tick.
        assert_eq!(before.lower.z, after.lower.z, "a region swept vertically");
    }

    // ------------------------------------------------------------- published pose

    #[test]
    fn a_pose_is_refused_for_a_stale_identity_and_a_corpse() {
        // The strongest case is gone with the model: a Legacy world published no
        // pose because it allocated no pose columns at all. What is left is a
        // world that has them, refusing the two handles that name nobody.

        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let fighter = EntityId::new(0, 0);
        assert!(world.pose(fighter).is_some(), "the fixture has no live fighter");
        assert_eq!(world.pose(EntityId::new(0, 1)), None, "a stale generation resolved");
        assert_eq!(world.pose(EntityId::new(9, 0)), None, "an unallocated slot resolved");

        // Deadness is the query's own answer and not a consequence of when it
        // was asked: a body that has bled out is a corpse on the tick it
        // happens, several phases before the reap that clears `alive`.
        world.wounds[0].blood = Fx::ZERO;
        assert!(world.wounds[0].is_dead());
        assert_eq!(world.pose(fighter), None, "an unreaped corpse published a pose");
        world.step();
        assert_eq!(world.pose(fighter), None, "a reaped slot published a pose");
    }

    #[test]
    fn a_published_pose_is_world_space_throughout() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        // Moved off both axes, so a missing translation cannot pass by landing
        // on a zero component.
        world.pos[0] = Vec2::new(Fx::from_ratio(37, 4), Fx::from_ratio(13, 8));
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        let pose = world.pose(EntityId::new(0, 0)).expect("a live fighter");
        assert_eq!((pose.id, pose.body, pose.body_yaw), (EntityId::new(0, 0), body, Angle::ZERO));

        for limb in 0..2 {
            assert_eq!(pose.arms[limb].hand, body + world.arms[0][limb].hand);
            assert_eq!(pose.arms[limb].fatigue, world.arms[0][limb].fatigue);
            // The one field that is deliberately not converted, and the field
            // doc says why. Asserted rather than left implicit, because a later
            // "make it all world space" would otherwise look harmless.
            assert_eq!(pose.arms[limb].velocity, world.arms[0][limb].linear_velocity);
        }

        let stored = world.shield_pose[0].expect("the fighter carries a shield");
        let shield = pose.shield.expect("the fighter carries a shield");
        assert_eq!(shield.centre, body + stored.centre);
        assert_eq!(shield, ShieldPose { centre: shield.centre, ..stored },
                   "translating the centre disturbed the frame-independent fields");

        let sword = world.equipment_in_grip(0, 1).expect("the fighter holds a sword");
        assert_eq!(pose.weapons[1], geometry::segment_pose(body, world.arms[0][1], sword));
        assert_eq!(pose.weapons[1].expect("a drawn sword").hilt, pose.arms[1].hand,
                   "the hilt is not the hand it is held in");
        // A shield is not a segment, so the weapon slot it occupies stays empty
        // and the mask agrees with the geometry rather than with the grip.
        assert_eq!(pose.weapons[0], None);
        assert_eq!(pose.equipment_mask, 0b110);
    }

    #[test]
    fn the_target_hand_is_the_pose_the_actuator_is_chasing() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let fighter = EntityId::new(0, 0);
        let spec = world.anatomy_spec(0).cloned().expect("articulated anatomy");
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);

        // No command has ever been accepted. The answer is the neutral command
        // the arm driver substitutes -- not a zero, which would draw a reach
        // line to the map origin, and not the current hand either.
        let neutral = world.neutral_core(0);
        let pose = world.pose(fighter).expect("a live fighter");
        assert_eq!(pose.intent, Intent::Hold);
        for limb in 0..2 {
            // The neutral reach is zero and comes back at the joint minimum,
            // which is the integrator's clamp repeated on this side.
            let expected = actuator::hand_position(&spec, Angle::ZERO, limb,
                neutral.arms[limb].bearing, neutral.arms[limb].height,
                Fx::from_raw(actuator::ARM_MIN_REACH_RAW));
            assert_eq!(pose.arms[limb].target_hand, body + expected);
        }

        // With a command stored it is that command's hand, at the yaw the body
        // has turned to by now -- the shoulder rotates, so a target frozen at
        // the yaw the order was given would drift off the arm.
        //
        // **Two embodied facts are folded into the expectation, and both are the
        // subject rather than noise.** The bearing is torso-relative, so the yaw
        // is added on the way in; and an elbow cannot straighten past the annulus
        // it permits, so the fixture's `Fx::ONE` comes back shorter. Both are
        // taken from `reachable_extent` -- the clamp `world_arm_target` itself
        // applies -- rather than written down, because a fitted pair would have
        // to be re-fitted every time the anatomy moved and would by then be
        // saying nothing about the frame.
        let command = command_core();
        assert!(matches!(
            world.submit(fighter, crate::CommandV1::new(command)),
            crate::SubmitOutcome::Stored { rejection: None, .. }),
            "the command was refused, so the pose below is the neutral one");
        for _ in 0..3 { world.step(); }
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        let pose = world.pose(fighter).expect("a live fighter");
        assert_eq!(pose.intent, command.intent);
        let anatomy = world.posed_anatomy(0);
        let elbow = crate::combat::limb::Elbow::of(&anatomy);
        let yaw = world.body_yaw[0].angle;
        for limb in 0..2 {
            let arm = command.arms[limb];
            let (height, reach) =
                crate::combat::limb::reachable_extent(&anatomy, arm.height, arm.reach, elbow);
            assert!(reach < arm.reach,
                    "the elbow permitted the whole reach, so the clamp is not measured");
            assert_eq!(pose.arms[limb].target_hand, body + actuator::hand_position(
                &spec, yaw, limb, yaw + arm.bearing, height, reach));
            assert_ne!(pose.arms[limb].hand, pose.arms[limb].target_hand,
                       "the arm arrived, so this fixture no longer separates the two");
        }
    }

    /// The published target is the pose the arm is chasing, which it was not
    /// once a bearing stopped being absolute.
    ///
    /// `commanded_targets` read `command.arms[limb]` raw while the arm driver
    /// reads it through `World::world_arm_target`. Those were the same value in
    /// the retired world frame, which is why the sibling test above passed
    /// throughout and why nothing caught this: the two frames agreed everywhere
    /// the articulated fixtures looked. Read from the torso a bearing is an
    /// offset and the yaw is added on the way in, so a published target was a
    /// whole body yaw off the pose the integrator converged to.
    ///
    /// Driven at a **non-zero** yaw on purpose. At yaw zero the two frames are
    /// the same map and this fixture would have proved nothing -- which is the
    /// shape of the accident that let the bug stand.
    #[test]
    fn an_embodied_target_hand_is_read_in_the_torso_frame() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let fighter = EntityId::new(0, 0);
        let spec = world.anatomy_spec(0).cloned().expect("embodied anatomy");

        // Turn the body first, so the frame conversion has something to do.
        let mut turn = crate::CommandV1::new(world.neutral_core(0));
        turn.core.body_yaw = Angle::from_raw(16_384);
        world.submit(fighter, turn);
        for _ in 0..200 { world.step(); }
        let yaw = world.body_yaw[0].angle;
        assert_ne!(yaw, Angle::ZERO, "the body never turned, so the frames still agree");

        // A relative bearing of zero is directly ahead of the torso at every
        // yaw, which is the whole of what the torso frame means.
        let mut ahead = crate::CommandV1::new(world.neutral_core(0));
        for limb in 0..2 {
            ahead.core.arms[limb] = crate::ArmTarget {
                bearing: Angle::ZERO,
                height: crate::CombatHeight::MID,
                reach: Fx::HALF,
                effort: Fx::ONE,
            };
        }
        world.submit(fighter, ahead);
        world.step();
        let yaw = world.body_yaw[0].angle;
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, world.ground_z[0]);
        let pose = world.pose(fighter).expect("a live fighter");
        for limb in 0..2 {
            let expected = actuator::hand_position(
                &spec, yaw, limb, yaw, crate::CombatHeight::MID, Fx::HALF);
            assert_eq!(pose.arms[limb].target_hand, body + expected,
                       "arm {limb}'s published target is not the torso-relative one");
            // And it is not the answer the raw read gave, which is the bearing
            // taken as a world one -- zero, due east, whatever the body faces.
            let raw = actuator::hand_position(
                &spec, yaw, limb, Angle::ZERO, crate::CombatHeight::MID, Fx::HALF);
            assert_ne!(pose.arms[limb].target_hand, body + raw,
                       "arm {limb}'s target was read as a world bearing");
        }
    }

    /// A neutral embodied arm is asked for "ahead", and "ahead" is zero in the
    /// frame it will be read in.
    ///
    /// `neutral_core` wrote `body_yaw` into the arm bearing, which was
    /// right in the retired world frame and asks for twice the yaw when the
    /// bearing is read from the torso. It was inert -- a neutral command carries zero effort and the
    /// actuator moves nothing without authority -- and it still reached the
    /// published target of every slot nobody had commanded.
    ///
    /// **The world-frame half of this test went with the articulated model.**
    /// It stood a second fixture beside this one and asserted that a neutral arm
    /// *there* still answered the absolute yaw, so that closing the hole for one
    /// frame could not close it for the other. There is one frame left, and a
    /// second fixture under it would be this one twice.
    #[test]
    fn a_neutral_embodied_command_points_the_arm_ahead_and_not_twice_the_yaw() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let fighter = EntityId::new(0, 0);
        let mut turn = crate::CommandV1::new(world.neutral_core(0));
        turn.core.body_yaw = Angle::from_raw(16_384);
        world.submit(fighter, turn);
        for _ in 0..200 { world.step(); }
        let yaw = world.body_yaw[0].angle;
        assert_ne!(yaw, Angle::ZERO);

        let neutral = world.neutral_core(0);
        assert_eq!(neutral.arms[0].bearing, Angle::ZERO,
                   "a neutral embodied arm is not asked for straight ahead");
        assert_eq!(neutral.body_yaw, yaw, "a torso is measured relative to itself");
    }

    #[test]
    fn a_two_handed_item_publishes_one_right_hand_weapon_and_a_mirrored_target() {
        let mut world = World::new(&both_scenario(), 1);
        assert!(world.two_handed(1), "the brute is not holding the club in both hands");
        assert!(matches!(
            world.submit(EntityId::new(1, 0),
                crate::CommandV1::new(reaching_command(Angle::HALF, Fx::ONE))),
            crate::SubmitOutcome::Stored { rejection: None, .. }),
            "the brute's reaching command was refused, so nothing below is its pose");
        world.step();

        let pose = world.pose(EntityId::new(1, 0)).expect("a live brute");
        assert_eq!(pose.weapons[0], None, "one club was drawn from both hands");
        assert!(pose.weapons[1].is_some(), "the owning arm published no club");
        assert_eq!(pose.equipment_mask, 0b010, "the mask disagreed with the drawn geometry");

        // The off hand chases nothing of its own -- the tick mirrors it off the
        // right arm -- so its published target is that same reflection.
        let spec = world.anatomy_spec(1).cloned().expect("articulated anatomy");
        let yaw = world.body_yaw[1].angle;
        let body = Vec3::new(world.pos[1].x, world.pos[1].y, Fx::ZERO);
        assert_eq!(pose.arms[0].target_hand - body,
                   actuator::mirror_hand(&spec, yaw, pose.arms[1].target_hand - body));
        assert_ne!(pose.arms[0].target_hand, pose.arms[1].target_hand,
                   "the mirror is the identity here, so it proves nothing");

        // And a one-handed pair is not mirrored: the fighter in the same world
        // answers each arm's own command.
        let command = command_core();
        assert!(matches!(
            world.submit(EntityId::new(0, 0),
                crate::CommandV1::new(command)),
            crate::SubmitOutcome::Stored { rejection: None, .. }),
            "the fighter's command was refused, so the pose below is the neutral one");
        world.step();
        let fighter = world.pose(EntityId::new(0, 0)).expect("a live fighter");
        let spec = world.anatomy_spec(0).cloned().expect("articulated anatomy");
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        // The torso-relative bearing and the elbow's annulus, the same pair the
        // sibling target-hand fixture folds in; see it for why both are read off
        // `reachable_extent` rather than written down as numbers.
        let anatomy = world.posed_anatomy(0);
        let yaw = world.body_yaw[0].angle;
        let arm = command.arms[0];
        let (height, reach) = crate::combat::limb::reachable_extent(
            &anatomy, arm.height, arm.reach, crate::combat::limb::Elbow::of(&anatomy));
        assert_eq!(fighter.arms[0].target_hand, body + actuator::hand_position(
            &spec, yaw, 0, yaw + arm.bearing, height, reach));
    }

    #[test]
    fn the_severed_and_equipment_masks_name_their_own_bits() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        let fighter = EntityId::new(0, 0);
        assert_eq!(world.pose(fighter).unwrap().equipment_mask, 0b110,
                   "a right-hand sword and a left-hand shield are not bits 1 and 2");
        assert_eq!(world.pose(fighter).unwrap().severed_mask, 0);

        // The three rigid regions, marked without emptying them: severing a head
        // or a torso outright is death, and a corpse publishes no row to read
        // the mask off.
        for part in [BodyPart::Head, BodyPart::Torso, BodyPart::Legs] {
            let mut marked = world.clone();
            marked.wounds[0].parts[part as usize].severed = true;
            assert_eq!(marked.pose(fighter).unwrap().severed_mask, 1 << part as u8);
        }

        // The arms are the case that moves both masks at once, because the grip
        // phase drops what a severed arm was holding.
        sever_arm(&mut world, 0, BodyPart::LeftArm);
        let pose = world.pose(fighter).unwrap();
        assert_eq!(pose.severed_mask, 1 << BodyPart::LeftArm as u8);
        assert_eq!(pose.equipment_mask, 0b010, "a severed shield arm kept its shield bit");
        sever_arm(&mut world, 0, BodyPart::RightArm);
        let pose = world.pose(fighter).unwrap();
        assert_eq!(pose.severed_mask,
                   (1 << BodyPart::LeftArm as u8) | (1 << BodyPart::RightArm as u8));
        assert_eq!(pose.equipment_mask, 0, "an armless body kept a weapon bit");
    }

    #[test]
    fn every_animation_hint_is_reachable() {
        // Idle and Braced. At construction every joint has arrived, so the only
        // thing separating the fighter's two arms is what they hold.
        let still = World::new(&Scenario::embodied_duel(), 1);
        assert_eq!(still.pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Braced, AnimationHint::Idle]);
        assert_eq!(still.pose(EntityId::new(1, 0)).unwrap().hints,
                   [AnimationHint::Idle; 2], "the brute has no shield to brace behind");

        // Chasing outranks Braced: a shield arm in motion is not holding still.
        let mut chasing = World::new(&Scenario::embodied_duel(), 1);
        chasing.submit(EntityId::new(0, 0), embodied_command());
        chasing.step();
        assert_eq!(chasing.pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Chasing; 2]);

        // Contact without Recoiling, which is the pair's whole distinction: a
        // braced sword resting inside a body with nothing closing resolves a
        // group that moves no hand, so the commit writes no joint.
        let mut resting = World::new(&fragile_scenario(&[]), 1000);
        brace_weapon(&mut resting, 0);
        resolve_closing(&mut resting, &[]);
        assert!(resting.contact_resolutions().iter().any(|row|
            row.fact.key.a == EntityId::new(0, 0) && row.fact.key.a_slot == 1),
            "the resting fixture keyed nothing against the sword arm");
        assert_eq!(resting.pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Braced, AnimationHint::Contact]);

        // Recoiling: the same two bodies actually closing, where the solve
        // hauls the hand and the commit writes it back.
        let mut clinch = clinch_world();
        step_into_contact(&mut clinch);
        assert_eq!(clinch.pose(EntityId::new(0, 0)).unwrap().hints[1],
                   AnimationHint::Recoiling);

        // Severed outranks everything, on the arm that is gone and on no other.
        let mut cut = World::new(&fragile_scenario(&[]), 1);
        sever_arm(&mut cut, 0, BodyPart::RightArm);
        assert_eq!(cut.pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Braced, AnimationHint::Severed]);
    }

    // ------------------------------------------- subject-scoped observation

    /// The fighter and the brute a step and a half apart, with the subject's
    /// eye dialled by hand.
    ///
    /// `perception 15` is the one value at which [`Stats::perception_noise`] is
    /// exactly zero, so a "sharp" world is not merely less blurred, it is
    /// ground truth -- which is what lets a noise test subtract two
    /// observations and get the error itself.
    fn eyed_world(subject: usize, perception: u8) -> World {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.stats[subject].perception = perception;
        world
    }

    #[test]
    fn an_articulated_observation_is_blank_for_a_stale_identity_and_a_corpse() {
        // The same four refusals `pose` answers `None` to, and they
        // have to be the same four: an observation is a pose with an eye in
        // front of it, and a corpse that published nothing to draw must not
        // publish something to fight.
        //
        // **A third case has gone with the legacy model.** This test also
        // asserted that a Legacy world observed a blank articulated block out of
        // columns it never allocated -- the strongest form of the claim, because
        // it was a world where the columns were empty rather than merely stale.
        // There is no legless world left to build, so what remains is a stale
        // handle and a corpse: both live worlds where the *slot* is wrong.

        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let fighter = EntityId::new(0, 0);
        assert!(world.observe(fighter).present(), "the fixture has no live fighter");
        assert_eq!(world.observe(EntityId::new(0, 1)), Observation::BLANK);
        assert_eq!(world.observe(EntityId::new(9, 0)), Observation::BLANK);

        world.wounds[0].blood = Fx::ZERO;
        assert!(world.wounds[0].is_dead());
        assert_eq!(world.observe(fighter), Observation::BLANK,
                   "an unreaped corpse observed itself");
    }

    #[test]
    fn an_articulated_observation_is_the_subjects_own_joints_exactly() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        // Off both axes, so a missing translation cannot pass by landing on a
        // zero component.
        world.pos[0] = Vec2::new(Fx::from_ratio(37, 4), Fx::from_ratio(13, 8));
        // The dimmest eye in the game, to prove the point: proprioception does
        // not degrade.
        world.stats[0].perception = 0;
        let fighter = EntityId::new(0, 0);
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        let obs = world.observe(fighter);

        assert_eq!((obs.tick, obs.subject, obs.body_position), (world.tick, fighter, body));
        assert_eq!(obs.body_yaw, world.body_yaw[0].angle);
        assert_eq!(obs.body_velocity, Vec3::new(world.vel[0].x, world.vel[0].y, Fx::ZERO));

        let spec = world.anatomy_spec(0).cloned().expect("articulated anatomy");
        let command = world.neutral_core(0);
        let targets = world.commanded_targets(0, &spec, &command);
        for limb in 0..2 {
            let arm = obs.arms[limb];
            assert_eq!(arm.hand, body + world.arms[0][limb].hand);
            assert_eq!(arm.target_hand, body + targets[limb]);
            // The one column that is deliberately not converted, matching
            // `PosedArm::velocity`. Asserted rather than left implicit, because
            // a later "make it all world space" would otherwise look harmless.
            assert_eq!(arm.velocity, world.arms[0][limb].linear_velocity);
            assert_eq!(arm.fatigue, world.arms[0][limb].fatigue);
            assert!(!arm.severed);
        }
        // The equipment code is the immutable **spec** row, not the carried
        // slot the grip indexes -- the two are different numbers here, which is
        // exactly why the wrong one would go unnoticed.
        assert_eq!(
            [obs.arms[0].equipment, obs.arms[1].equipment],
            [world.equipment_in_grip(0, 0).map(|item| item.id),
             world.equipment_in_grip(0, 1).map(|item| item.id)],
        );
        assert_eq!([obs.arms[0].equipment, obs.arms[1].equipment], [Some(2), Some(1)],
                   "the shield row is 2 and the sword row is 1");
        assert!(matches!(world.equipment_in_grip(0, 0).unwrap().geometry,
                         EquipmentGeometry::Shield { .. }));

        let stored = world.shield_pose[0].expect("the fighter carries a shield");
        assert_eq!(obs.shield, ObservedShield {
            present: true,
            centre: body + stored.centre,
            normal: stored.normal,
            half_width: stored.half_width,
            half_height: stored.half_height,
        });

        let state = world.wounds[0];
        assert_eq!(obs.blood_fraction, anatomy::blood_fraction(&state, &spec));
        assert_eq!(obs.shock, state.shock);
        for part in 0..BodyPart::COUNT {
            assert_eq!(obs.integrity_fraction[part], anatomy::part_fraction(&state, &spec, part));
            assert_eq!(obs.wound_fraction[part], anatomy::part_wound_fraction(&state, &spec, part));
        }
        assert_eq!(obs.severed_mask, 0);
    }

    #[test]
    fn an_articulated_observation_carries_the_subjects_reachable_weapon_geometry() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        world.pos[0] = Vec2::new(Fx::from_ratio(37, 4), Fx::from_ratio(13, 8));
        let fighter = EntityId::new(0, 0);
        let obs = world.observe(fighter);
        let spec = world.anatomy_spec(0).expect("the fighter has anatomy");
        let pose = world.pose(fighter).expect("the fighter has a pose");

        assert_eq!(
            (obs.standing_height, obs.arm_length, obs.hand_radius),
            (spec.standing_height, spec.arm_length, spec.hand_radius),
        );
        assert_eq!(obs.weapons, pose.weapons);
        assert_eq!(obs.weapons[0], None, "a shield was published as a segment");
        assert_eq!(
            obs.weapons[1].expect("the fighter carries a sword").hilt,
            obs.arms[1].hand,
            "the observed blade is not reachable from the observed hand",
        );
    }

    #[test]
    fn observing_weapon_geometry_does_not_change_the_world_hash() {
        let world = World::new(&Scenario::embodied_duel(), 17);
        let before = world.state_hash();
        let first = world.observe(EntityId::new(0, 0));
        let second = world.observe(EntityId::new(0, 0));
        assert_eq!(first.weapons, second.weapons);
        assert_eq!(world.state_hash(), before);
    }

    #[test]
    fn every_capability_bit_names_a_presence_fact() {
        use Observation as A;
        let capable = |world: &World, i: usize| world.observe(world.id_of(i)).capabilities;

        // A shield in the left hand and a sword in the right. Both grips are
        // occupied, only the sword is a weapon, and nothing binds two hands.
        let mut world = World::new(&fragile_scenario(&[]), 1);
        assert_eq!(capable(&world, 0),
                   A::MOVEMENT | A::TURNING | A::LEFT_GRIP | A::RIGHT_GRIP | A::RIGHT_WEAPON | A::SHIELD,
                   "a shield in a grip is not a weapon in it");

        // Legs are the movement pair and nothing else, and the pair moves
        // together because the model gives translation and turning one pool.
        let mut legless = world.clone();
        legless.wounds[0].parts[BodyPart::Legs as usize].severed = true;
        assert_eq!(capable(&legless, 0) & (A::MOVEMENT | A::TURNING), 0);
        assert_eq!(capable(&legless, 0) | A::MOVEMENT | A::TURNING, capable(&world, 0),
                   "severing the legs moved a bit that is not about legs");

        // A severed arm loses its grip, which is what makes an occupancy bit
        // strictly stronger than a severance bit: the shield goes with the arm.
        let mut armless = world.clone();
        sever_arm(&mut armless, 0, BodyPart::LeftArm);
        assert_eq!(capable(&armless, 0), A::MOVEMENT | A::TURNING | A::RIGHT_GRIP | A::RIGHT_WEAPON);
        sever_arm(&mut armless, 0, BodyPart::RightArm);
        assert_eq!(capable(&armless, 0), A::MOVEMENT | A::TURNING);

        // Released grips, with both arms intact: the four equipment bits are
        // about what is held and the movement pair is not.
        let mut empty = world.clone();
        let mut release = empty.neutral_core(0);
        release.grips = [GripRequest::Release; 2];
        assert!(matches!(
            empty.submit(EntityId::new(0, 0), crate::CommandV1::new(release)),
            crate::SubmitOutcome::Stored { rejection: None, .. }),
            "the release was refused, so the grips below are the ones it started with");
        empty.step();
        assert_eq!(capable(&empty, 0), A::MOVEMENT | A::TURNING);

        // The two-handed club: one item, both grips, and the weapon bit on the
        // owning arm only -- the same ownership the pose row draws.
        let both = World::new(&both_scenario(), 1);
        assert!(both.two_handed(1));
        assert_eq!(capable(&both, 1),
                   A::MOVEMENT | A::TURNING | A::LEFT_GRIP | A::RIGHT_GRIP | A::RIGHT_WEAPON | A::TWO_HANDED);
        assert_eq!(capable(&both, 1) & A::LEFT_WEAPON, 0, "one club was drawn from both hands");
        // And the one published equipment fact that deliberately does *not*
        // follow that ownership rule: both hands are on the haft, so both arms
        // report the item. Asserted here because it is the only place the grip
        // view and the collider view of the same club disagree on purpose.
        let held = both.observe(EntityId::new(1, 0));
        assert_eq!([held.arms[0].equipment, held.arms[1].equipment], [Some(4), Some(4)]);

        // And a left-hand weapon, which nothing above reaches: the fighter's
        // shield and sword swapped over.
        world.grips[0].swap(0, 1);
        world.shield_pose[0] = world.derive_shield_pose(0);
        assert_eq!(capable(&world, 0),
                   A::MOVEMENT | A::TURNING | A::LEFT_GRIP | A::RIGHT_GRIP | A::LEFT_WEAPON | A::SHIELD);

        // Every bit is a distinct power of two and none above seven is ever
        // set, which is the reference's "higher bits are zero in V1".
        let bits = [A::MOVEMENT, A::TURNING, A::LEFT_GRIP, A::RIGHT_GRIP,
                    A::LEFT_WEAPON, A::RIGHT_WEAPON, A::SHIELD, A::TWO_HANDED];
        assert_eq!(bits, core::array::from_fn(|bit| 1u32 << bit));
        for world in [&world, &both, &empty, &armless, &legless] {
            for i in 0..world.alive.len() {
                assert_eq!(world.observe(world.id_of(i)).capabilities & !0xff, 0);
            }
        }
    }

    #[test]
    fn the_articulated_opponent_list_is_the_nearest_six_enemies_in_sight() {
        let mut world = World::new(&crowded_scenario(), 1);
        let hero = EntityId::new(0, 0);
        // Far-sighted, so all seven enemies are in view and the cap is the only
        // thing that can drop one.
        world.stats[0].perception = 15;
        let obs = world.observe(hero);
        assert_eq!(obs.opponent_count as usize, MAX_OPPONENTS);
        assert_eq!(
            obs.opponents().iter().map(|foe| foe.id).collect::<Vec<_>>(),
            (1..=6).map(|i| EntityId::new(i, 0)).collect::<Vec<_>>(),
            "the six nearest enemies, nearest first"
        );
        // The ally stands nearer than any of them and is not an opponent.
        assert_eq!(world.faction[8], Faction::Heroes);
        assert!(obs.opponents().iter().all(|foe| foe.id != EntityId::new(8, 0)));
        // The seventh enemy is in sight and dropped by the cap, and its row is
        // the blank value throughout rather than a half-filled one.
        assert!((world.pos[7] - world.pos[0]).length() < world.stats[0].sight_range());

        // **A dim eye holds the same six rows, blurred rather than fewer**, and
        // that is the half of this claim that survives the legacy list. The
        // width here is a fixed wasm row stride before it is a percept, so
        // `Stats::tracked_contacts` -- which did narrow the legacy contact list,
        // and which this test used to check against it -- reaches nothing in this
        // block. The comparison is gone with the list; the property is asserted
        // on its own terms.
        world.stats[0].perception = 3;
        assert_eq!(world.stats[0].tracked_contacts(), 3, "a dim eye stopped being dim");
        let dim = world.observe(hero);
        assert_eq!(dim.opponent_count, 5, "five enemies inside a 7.8 unit sight range");
        for slot in dim.opponent_count as usize..MAX_OPPONENTS {
            assert_eq!(dim.opponents[slot], ObservedOpponent::BLANK,
                       "an unused row carried something");
        }
    }

    /// The last occlusion test in the repository, and that is worth knowing.
    ///
    /// **There was a family of them and it went with Legacy.**
    /// `a_foe_behind_one_tile_of_rock_is_not_a_contact`,
    /// `occlusion_applies_to_allies_too` and
    /// `on_an_open_floor_plan_every_contact_survives` were deleted in `4c84aba`
    /// -- "embodied 10: Legacy is gone, and no pin moved" -- together with
    /// `World::observe` and the `Contact` list they were written against. The
    /// two fixtures that served them outlived their callers as dead code until
    /// this session removed them: `peopled_world`, which could stand four or
    /// five bodies anywhere on a carved floor plan, and `by_distance_alone`,
    /// which recomputed the whole expected list by hand and compared it. This
    /// test is the articulated counterpart of the first of the three, and the
    /// note that stood here named that test as a live sibling -- which it has
    /// not been since `4c84aba`. It hand-rolls its plan off `fragile_scenario`
    /// for the same reason: the shared multi-body carved fixture is the one
    /// that went.
    ///
    /// **What is therefore unguarded, written down so the next person can decide
    /// to pay it rather than discover it.** Two claims `by_distance_alone`
    /// checked end to end have no successor:
    ///
    /// - **Ties broken on the entity index, through `observe`.**
    ///   `nearest_keeps_the_closest_in_order` asserts the rule of `Nearest` in
    ///   isolation, and no fixture in this file stands two enemies at equal
    ///   distance -- `crowded_scenario` spaces its seven strictly apart. So a
    ///   selection that sorted on distance alone, and whose order therefore
    ///   flipped with the slot order, would pass everything here.
    /// - **Selection on a carved plan holding more than two bodies.**
    ///   `crowded_scenario` holds nine, on open ground; this holds two, on a
    ///   carved one. Nothing holds several *and* a floor plan, which is the
    ///   case `peopled_world` existed for.
    ///
    /// Two things that look like gaps and are not, so neither gets re-added:
    /// there is no ally block in the articulated ABI at all, so
    /// `occlusion_applies_to_allies_too` has nothing to be the successor to;
    /// and `Stats::tracked_contacts` no longer narrows this list, because
    /// `MAX_OPPONENTS` is a fixed wasm row stride before it is a
    /// percept. `World::observe`'s own doc owns the first and
    /// `the_articulated_opponent_list_is_the_nearest_six_enemies_in_sight`
    /// carries the second.
    #[test]
    fn rock_stops_the_articulated_eye_too() {
        //           0123456789
        let rows = ["##########",
                    "#..#.....#",
                    "#........#",
                    "##########"];
        let mut scenario = fragile_scenario(&[]);
        scenario.dungeon = crate::dungeon::parse(&rows);
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(255, 100), Fx::from_ratio(15, 10));
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(475, 100), Fx::from_ratio(15, 10));
        let blocked = World::new(&scenario, 1);
        assert_eq!(blocked.observe(EntityId::new(0, 0)).opponent_count, 0,
                   "an enemy behind a pillar entered the articulated list");

        // The control, on the same span of floor with the pillar removed: a
        // fixture that could not see the brute anyway proves nothing.
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(255, 100), Fx::from_ratio(25, 10));
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(475, 100), Fx::from_ratio(25, 10));
        let open = World::new(&scenario, 1);
        assert_eq!(open.observe(EntityId::new(0, 0)).opponent_count, 1);
    }

    #[test]
    fn poor_perception_blurs_motion_without_inventing_severance() {
        // The brute is the subject: the fighter it is looking at carries both a
        // shield and a sword, so the categorical half of this test has
        // something to be wrong about.
        let mut sharp = eyed_world(1, 15);
        // An eighth of a unit apart and closing at a quarter per tick, which
        // puts `contact_timing` at exactly a half -- inside the interval where
        // it carries information. At the fixture's own spacing the formula
        // saturates at one, and a saturated column cannot show that it was
        // blurred.
        sharp.pos[0] = sharp.pos[1] + Vec2::new(Fx::from_ratio(-1, 8), Fx::ZERO);
        // Real motion to misjudge, written onto the column the observation
        // reads rather than coaxed out of a command.
        sharp.vel[0] = Vec2::new(Fx::from_ratio(1, 4), Fx::ZERO);
        let mut dim = sharp.clone();
        dim.stats[1].perception = 0;
        assert_eq!(sharp.stats[1].perception_noise(), Fx::ZERO, "the sharp eye is not exact");
        assert!(dim.stats[1].perception_noise() > Fx::ONE, "the dim eye is not blurred");

        let brute = EntityId::new(1, 0);
        let clean = sharp.observe(brute);
        let blurred = dim.observe(brute);
        let (clean, blurred) = (clean.opponents[0], blurred.opponents[0]);

        // The sharp eye is ground truth, which is what makes every difference
        // below attributable to the noise and nothing else.
        assert_eq!(clean.body_position, Vec3::new(sharp.pos[0].x, sharp.pos[0].y, Fx::ZERO));
        assert_eq!(clean.body_velocity, Vec3::new(sharp.vel[0].x, sharp.vel[0].y, Fx::ZERO));
        assert_eq!(clean.contact_timing, Fx::HALF, "the fixture is not inside the timing interval");

        // Measured: moved, in all three components of both vectors. Z has no
        // degree of freedom in the model and is blurred anyway, because the
        // draw order is an ABI and does not get to depend on which axes the
        // physics currently uses.
        for (name, a, b) in [
            ("position x", clean.body_position.x, blurred.body_position.x),
            ("position y", clean.body_position.y, blurred.body_position.y),
            ("position z", clean.body_position.z, blurred.body_position.z),
            ("velocity x", clean.body_velocity.x, blurred.body_velocity.x),
            ("velocity y", clean.body_velocity.y, blurred.body_velocity.y),
            ("velocity z", clean.body_velocity.z, blurred.body_velocity.z),
        ] {
            assert_ne!(a, b, "{name} arrived unblurred");
        }
        assert_ne!(clean.contact_timing, blurred.contact_timing, "timing arrived unblurred");

        // The three scales, over sixty-four seeds rather than over one draw. A
        // single sample cannot tell a quarter-sized error from a small draw of
        // a full-sized one, and asserting it on one world is how a scale
        // regression survives a year.
        //
        // The fixture is the *unmoved* one on purpose. Timing is computed from
        // the measured columns rather than from ground truth -- deliberately,
        // so a policy recomputing it from the published numbers gets the
        // published answer -- which means at a range where the formula is live,
        // the timing error is the position and velocity error propagated
        // through it and is bounded by nothing in particular. Two bodies a
        // stride and a half apart and standing still saturate it at one in both
        // worlds, so what is left of the difference is the timing draw alone.
        let noise = dim.stats[1].perception_noise();
        let moved = |a: Fx, b: Fx| (a - b).abs();
        let (mut worst_position, mut worst_velocity, mut worst_timing) =
            (Fx::ZERO, Fx::ZERO, Fx::ZERO);
        for seed in 1..=64u64 {
            let mut sharp = eyed_world(1, 15);
            sharp.seed = seed;
            let mut dim = sharp.clone();
            dim.stats[1].perception = 0;
            let clean = sharp.observe(brute).opponents[0];
            let blurred = dim.observe(brute).opponents[0];
            assert_eq!(clean.contact_timing, Fx::ONE, "the saturated fixture is not saturated");
            for (a, b) in [
                (clean.body_position.x, blurred.body_position.x),
                (clean.body_position.y, blurred.body_position.y),
                (clean.body_position.z, blurred.body_position.z),
            ] {
                worst_position = worst_position.max(moved(a, b));
            }
            for (a, b) in [
                (clean.body_velocity.x, blurred.body_velocity.x),
                (clean.body_velocity.y, blurred.body_velocity.y),
                (clean.body_velocity.z, blurred.body_velocity.z),
            ] {
                worst_velocity = worst_velocity.max(moved(a, b));
            }
            worst_timing = worst_timing.max(moved(clean.contact_timing, blurred.contact_timing));
        }
        // Bounded by the documented scale, and close enough to it that a
        // quarter mistaken for a whole would show. `Fx::EPSILON` of slack for
        // the truncation in one fixed-point multiply.
        for (name, worst, bound) in [
            ("position", worst_position, noise),
            ("velocity", worst_velocity, noise / 4),
            ("timing", worst_timing, noise / 8),
        ] {
            assert!(worst <= bound + Fx::EPSILON, "{name} error {worst} exceeded {bound}");
            assert!(worst * 4 > bound * 3, "{name} error never approached {bound}: {worst}");
        }

        // Categorical: identical, and not merely close.
        assert_eq!(clean.id, blurred.id);
        assert_eq!(clean.severed_mask, blurred.severed_mask);
        assert_eq!(clean.severed_mask, 0, "the fixture has nothing severed to preserve");
        assert_eq!(clean.weapons.map(|w| w.is_some()), blurred.weapons.map(|w| w.is_some()));
        assert_eq!(clean.weapons.map(|w| w.is_some()), [false, true]);
        assert_eq!(clean.shield.present, blurred.shield.present);
        assert!(clean.shield.present, "the fixture has no shield to preserve");
        assert_eq!(clean.body_yaw, blurred.body_yaw);
        assert_eq!(
            clean.regions.map(|region| (region.present, region.radius)),
            blurred.regions.map(|region| (region.present, region.radius)),
            "a blurred body changed shape",
        );
        assert_eq!((clean.shield.half_width, clean.shield.half_height),
                   (blurred.shield.half_width, blurred.shield.half_height));

        // And the subject's own half of the observation, which is exact whatever
        // the eye is: proprioception is free.
        let clean = sharp.observe(brute);
        let blurred = dim.observe(brute);
        assert_eq!(clean.capabilities, blurred.capabilities);
        assert_eq!(clean.arms, blurred.arms);
        assert_eq!(clean.body_position, blurred.body_position);
        assert_eq!(clean.body_velocity, blurred.body_velocity);
        assert_eq!(clean.severed_mask, blurred.severed_mask);
        assert_eq!(clean.integrity_fraction, blurred.integrity_fraction);
    }

    #[test]
    fn opponent_geometry_translates_rigidly_rather_than_shearing() {
        let sharp = eyed_world(1, 15);
        let mut dim = sharp.clone();
        dim.stats[1].perception = 0;
        let brute = EntityId::new(1, 0);
        let clean = sharp.observe(brute).opponents[0];
        let blurred = dim.observe(brute).opponents[0];

        let delta = blurred.body_position - clean.body_position;
        assert_ne!(delta, Vec3::ZERO, "the dim eye measured the body exactly");
        // Every point of the body moves by the *same* displacement. A per-point
        // draw would put an arm three feet from its own shoulder, which is not
        // what bad eyesight does to a silhouette.
        for part in 0..BodyPart::COUNT {
            let (a, b) = (clean.regions[part], blurred.regions[part]);
            assert_eq!(b.lower - a.lower, delta, "region {part} lower sheared");
            assert_eq!(b.upper - a.upper, delta, "region {part} upper sheared");
            assert_eq!((a.radius, a.present), (b.radius, b.present));
        }
        let sword = (clean.weapons[1].expect("a sword"), blurred.weapons[1].expect("a sword"));
        assert_eq!(sword.1.hilt - sword.0.hilt, delta, "the hilt sheared off the hand");
        assert_eq!(sword.1.tip - sword.0.tip, delta, "the blade changed length");
        assert_eq!(sword.0.radius, sword.1.radius);
        assert_eq!(blurred.shield.centre - clean.shield.centre, delta);
        assert_eq!(blurred.shield.normal, clean.shield.normal);

        // The rigidity is a claim about the *shape*, so check one internal
        // distance survives it outright rather than only the endpoints.
        let reach = |foe: &ObservedOpponent| foe.weapons[1].unwrap().tip - foe.regions[BodyPart::Head as usize].lower;
        assert_eq!(reach(&clean), reach(&blurred), "head to blade tip changed under noise");
    }

    #[test]
    fn the_noise_stream_draws_seven_per_row_whatever_geometry_is_absent() {
        // Two worlds identical except for what the *nearest* opponent is
        // holding. If the draw count depended on the geometry present, the row
        // behind it would land somewhere else -- so what one fighter perceives
        // would depend on what somebody else is carrying.
        let mut world = World::new(&crowded_scenario(), 1);
        world.stats[0].perception = 0;
        let mut disarmed = world.clone();
        disarmed.grips[1] = [GripState { equipment_slot: None }; 2];
        disarmed.shield_pose[1] = None;

        let hero = EntityId::new(0, 0);
        let armed = world.observe(hero);
        let bare = disarmed.observe(hero);
        assert_eq!(armed.opponent_count, bare.opponent_count);
        assert!(armed.opponent_count >= 2, "one row proves nothing about the row after it");

        // The control: the fixture really did remove geometry from row zero.
        assert_ne!(armed.opponents[0].weapons, bare.opponents[0].weapons);
        assert_ne!(armed.opponents[0].shield.present, bare.opponents[0].shield.present);
        assert_eq!(armed.opponents[0].body_position, bare.opponents[0].body_position,
                   "the row whose geometry changed also moved");

        // And every row after it is untouched, which is the seven-draw promise.
        for slot in 1..armed.opponent_count as usize {
            assert_eq!(armed.opponents[slot], bare.opponents[slot],
                       "row {slot} shifted when row zero lost its equipment");
        }
    }

    #[test]
    fn the_seven_perception_draws_are_the_documented_stream_in_order() {
        // **Nothing else pins the stream.** Its order and its scales are frozen
        // by the reference, no golden hash reaches it -- an observation is not
        // authoritative state -- and no policy consumes it yet, so a swapped
        // draw or an eighth draw would sit unnoticed until the day it froze by
        // accident. This reproduces the stream from `fx` and asserts the
        // published row against it term by term.
        let mut world = World::new(&crowded_scenario(), 1);
        world.stats[0].perception = 0;
        let subject = 0usize;
        let noise = world.stats[subject].perception_noise();
        let obs = world.observe(EntityId::new(0, 0));
        assert!(obs.opponent_count >= 2, "one row cannot show where the next row starts");

        let mut rng = Rng::from_stream(
            world.seed ^ ARTICULATED_OBSERVATION_DOMAIN,
            world.tick as u64,
            ((subject as u64) << 32) | world.generation[subject] as u64,
        );
        for slot in 0..obs.opponent_count as usize {
            let mut jitter = [Fx::ZERO; 7];
            for draw in jitter.iter_mut() {
                *draw = rng.signed_unit();
            }
            // Distinct, or a permutation of the seven would be invisible here.
            for a in 0..7 {
                for b in a + 1..7 {
                    assert_ne!(jitter[a], jitter[b], "draws {a} and {b} coincided");
                }
            }
            let row = obs.opponents[slot];
            let j = row.id.index as usize;
            // The Z term is the floor the body stands on plus its draw, and the
            // floor is written out although this fixture is flat: the formula
            // is what this test states, and a copy of it that omitted the term
            // would read as a claim that a perceived body is always at z = 0.
            assert_eq!(row.body_position, Vec3::new(
                world.pos[j].x + jitter[0] * noise,
                world.pos[j].y + jitter[1] * noise,
                world.ground_z[j] + jitter[2] * noise,
            ), "row {slot} position is not draws 0..3 at the full scale");
            assert_eq!(row.body_velocity, Vec3::new(
                world.vel[j].x + jitter[3] * noise / 4,
                world.vel[j].y + jitter[4] * noise / 4,
                jitter[5] * noise / 4,
            ), "row {slot} velocity is not draws 3..6 at a quarter scale");
            // Nothing is moving in the fixture, so the formula answers exactly
            // one and the whole of the difference is the seventh draw.
            assert_eq!(row.contact_timing, (Fx::ONE + jitter[6] * noise / 8).clamp(Fx::ZERO, Fx::ONE),
                       "row {slot} timing is not draw 6 at an eighth scale");
        }
    }

    #[test]
    fn contact_timing_is_one_unless_something_is_closing() {
        // Written on the velocity columns rather than driven by commands, for
        // the reason `resolve_closing` gives: this is about the formula, and a
        // stat-driven charge would be testing the actuator.
        let mut world = eyed_world(0, 15);
        let hero = EntityId::new(0, 0);
        let timing = |world: &World| world.observe(hero).opponents[0].contact_timing;

        // Standing still: nothing is closing, so exactly one.
        assert_eq!(timing(&world), Fx::ONE);
        // Separating: still one, and not a large number scaled down.
        world.vel[0] = Vec2::new(Fx::from_ratio(-1, 4), Fx::ZERO);
        assert_eq!(timing(&world), Fx::ONE);
        // Closing, from a unit and a half away: six ticks of approach, and the
        // clamp reads it as one. **The column saturates outside the last
        // stride** -- it is ticks-to-arrival capped at a tick, not a countdown
        // in seconds -- and pinning that here is what stops it being read as
        // the second thing.
        world.vel[0] = Vec2::new(Fx::from_ratio(1, 4), Fx::ZERO);
        assert_eq!(timing(&world), Fx::ONE);

        // Inside the last stride, where the number is informative. Eighths and
        // quarters throughout, because a tenth is not exact in 16.16 and the
        // assertion would be about rounding rather than about the formula.
        world.pos[1] = world.pos[0] + Vec2::new(Fx::from_ratio(1, 8), Fx::ZERO);
        assert_eq!(timing(&world), Fx::HALF);
        world.vel[0] = Vec2::new(Fx::HALF, Fx::ZERO);
        assert_eq!(timing(&world), Fx::from_ratio(1, 4));

        // Coincident bodies: the delta has no direction to close along, so the
        // dot product is zero and the formula answers one rather than zero.
        // The degenerate case is worth pinning because "already here" is the
        // reading somebody will expect.
        world.pos[1] = world.pos[0];
        assert_eq!(timing(&world), Fx::ONE);
    }

    /// A held command that turns an embodied body across its whole yaw range,
    /// so its hips have to chase and its twist saturates.
    fn turning_embodied_command(yaw: Angle) -> crate::CommandV1 {
        crate::CommandV1::new(CommandCoreV1 {
            move_dir: Vec2::ZERO,
            body_yaw: yaw,
            intent: Intent::Hold,
            arms: [ArmTarget {
                bearing: Angle::ZERO,
                height: crate::CombatHeight::MID,
                reach: Fx::HALF,
                effort: Fx::HALF,
            }; 2],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        })
    }

    /// A body whose feet are committed is visible as such to the body watching
    /// it, in the struct and in the column behind it.
    ///
    /// **The settled reading is taken first and it is half the test.** A step
    /// flag that was simply always set would satisfy the second half on its own,
    /// and the interesting failure here is not "no signal" but "a signal that
    /// never goes out" -- `step_left` runs down and the flag has to follow it.
    /// `embodied_duel` with the two bodies inside each other's sight.
    ///
    /// The shipped pair stands at `(7, 6)` and `(17, 10)`, ten and three
    /// quarters apart, which is outside the brute's eye -- the corpus closes
    /// that distance over the first hundred ticks and these tests are not about
    /// walking. Moved rather than stepped, so a test about perception does not
    /// depend on a hundred ticks of locomotion behaving.
    fn embodied_within_sight() -> Scenario {
        let mut scenario = Scenario::embodied_duel();
        scenario.units[1].spawn = Vec2::from_ints(11, 8);
        scenario
    }

    #[test]
    fn an_opponent_mid_step_is_visible_as_mid_step() {
        let mut world = World::new(&embodied_within_sight(), 1);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let brute = world.alive_ids(Faction::Monsters)[0];
        let watched = |world: &World| {
            let obs = world.observe(brute);
            let slot = obs.opponents().iter().position(|foe| foe.id == hero)
                .expect("the brute cannot see the hero it is standing in front of");
            (slot, obs.opponents[slot].stance)
        };

        let (slot, settled) = watched(&world);
        assert!(settled.present, "an embodied opponent came back with no stance");
        assert!(!settled.stepping, "a body that has not been asked to turn reads as mid-step");

        // Half a turn is four and a half budgets away, so the request is refused
        // on the first tick and arms a step.
        world.submit(hero, turning_embodied_command(Angle::HALF));
        world.step();
        let i = world.resolve(hero).expect("a live hero");
        assert!(world.stance[i].step_left > 0, "the fixture armed no step");

        let (again, stepping) = watched(&world);
        assert_eq!(again, slot, "the row moved and the columns below name the wrong body");
        assert!(stepping.stepping, "a body mid-step reads as settled");
        // Their twist, as a perception, is the same signed fraction the body
        // itself reads -- exact, because a twist is a silhouette.
        assert_eq!(stepping.twist_fraction,
                   world.observe(hero).stance.twist_fraction,
                   "the perceived twist is not the twist");

        // **The vector half of this test is gone.** It went on to assert that the
        // same two facts reached the feature vector at the index the embodied
        // block's layout named. There is no vector: it hung off the legacy
        // observation, nothing in the workspace read it, and it was deleted with
        // the model. What is asserted above is the percept itself, which is what
        // the vector was copying.
    }

    /// An observed body stands on the floor the posed body stands on, its own
    /// and everybody else's.
    ///
    /// **The correction this session made, asserted where it can be seen.**
    /// `observe` built the body origin as `(x, y, 0)` while
    /// `pose` used `ground_z`, so on a sculpted plan the observation
    /// and the pose disagreed about where a body was -- and *every* spatial
    /// column of the articulated block hangs off that origin, so a fighter on a
    /// hill read its own hands, its shield, and every opponent's capsule a
    /// hill's height out of place.
    ///
    /// It is asserted on `embodied_slope` because that is the only fixture in
    /// the repository with a hill in it. On every flat one the claim is true of
    /// the broken code as well, which is exactly why the correction moved no
    /// golden hash and why this test had to be written against the sculpted
    /// fixture to say anything at all.
    #[test]
    fn an_observed_body_stands_on_the_floor_the_posed_body_stands_on() {
        let scenario = Scenario::embodied_slope();
        let mut world = World::new(&scenario, 31);
        let ids = [world.alive_ids(Faction::Heroes)[0], world.alive_ids(Faction::Monsters)[0]];
        let mut highest = Fx::ZERO;
        let mut perceived = 0;
        let mut uphill = 0;
        // Walked toward each other over the hill, because the movement phase is
        // the only thing that resamples `ground_z` and a teleported body would
        // be standing on a height nothing had sampled.
        for _ in 0..240 {
            for (at, id) in ids.iter().enumerate() {
                let toward = if at == 0 { Fx::ONE } else { -Fx::ONE };
                let mut command = turning_embodied_command(Angle::ZERO);
                command.core.move_dir = Vec2::new(toward, Fx::ZERO);
                world.submit(*id, command);
            }
            world.step();
            for id in ids {
                let pose = world.pose(id).expect("a live body has a pose");
                let obs = world.observe(id);
                assert_eq!(obs.body_position, pose.body,
                           "the observed origin is not the posed one");
                highest = highest.max(pose.body.z);
                // And the same for a body seen from across the hill, allowing
                // the observer's own error and nothing else. `jitter` is a
                // fraction in `[-1, 1)`, so the whole of what the perceived
                // floor may differ from the true one by is the perception term
                // -- and before the correction the difference was the terrace
                // itself, which is larger than any eye in the game is wrong by.
                let noise = world.stats[world.resolve(id).expect("a live body")]
                    .perception_noise();
                for foe in obs.opponents() {
                    let theirs = world.pose(foe.id).expect("a live opponent");
                    assert!((foe.body_position.z - theirs.body.z).abs() <= noise,
                            "a perceived body is {:?} off the floor it stands on, \
                             against {noise:?} of noise",
                            foe.body_position.z - theirs.body.z);
                    if theirs.body.z.is_positive() { uphill += 1; }
                    perceived += 1;
                }
            }
        }
        assert!(highest > Fx::ZERO, "neither body ever left the floor");
        assert!(perceived > 0, "the two never saw each other, so half the claim is vacuous");
        // And a body that was *seen* stood above the floor rather than beside
        // the hill. `highest` says an observer climbed at some tick and
        // `perceived` says the two had each other in sight at some tick;
        // neither says the two ever coincided. Down on the flat both floors are
        // zero and `|dz| <= noise` is satisfied by any answer at all, so without
        // this the whole sweep could run on level ground and still pass. The
        // counter was incremented and never read, which is that hole with the
        // evidence for closing it already collected.
        assert!(uphill > 0, "no opponent was ever seen while standing above the floor");
    }

    /// The hips are published in the torso's frame, the twist is published over
    /// the budget, and the two are one scalar with opposite signs.
    ///
    /// **Three claims, none of them a restatement of the producer.** A body
    /// wound by hand to exactly the budget publishes exactly one, which is what
    /// says the divisor is `STANCE_TWIST_LIMIT_RAW` and not some other constant
    /// -- a divisor twice the budget would answer a half here and every other
    /// assertion in this file would still pass. The angle and the fraction agree
    /// in magnitude, which is what says the angle is measured from the torso: a
    /// hip bearing left in the world frame is an absolute heading with no
    /// relation to a twist at all. And the sign is asserted in both directions
    /// because the two fields deliberately disagree about it -- the fraction
    /// keeps `StanceState::twist`'s sign and the angle keeps the command
    /// frame's -- which is exactly the kind of thing that gets "tidied" into
    /// agreement by somebody who has not read why.
    ///
    /// **Wound by hand because the driver never sits at its limit**, and that is
    /// a property rather than a shortcut: the torso's *target* is clamped into
    /// the budget, so the integrator converges on a reachable angle instead of
    /// saturating against one. Driving `Angle::HALF` for forty ticks reaches
    /// 0.09 of the budget, not 1. The live pose is what the loop below is for.
    #[test]
    fn the_published_hips_are_the_torsos_and_the_twist_is_the_budgets() {
        let mut world = World::new(&embodied_within_sight(), 11);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let budget = actuator::STANCE_TWIST_LIMIT_RAW;
        let i = world.resolve(hero).expect("a live hero");

        // **The live pose first**, because the hand-wound cases below leave the
        // column in a state no driver produces, and anything asserted after one
        // of those is a claim about a fixture rather than about a fight.
        let mut moved = 0;
        for _ in 0..40 {
            world.submit(hero, turning_embodied_command(Angle::HALF));
            world.step();
            let stance = world.observe(hero).stance;
            // The torso measured from the hips, read out of the published
            // angle, against the same quantity read out of the published
            // fraction. One raw unit of angle: the fraction is a truncating
            // division by the budget and multiplying it back cannot recover the
            // unit it dropped.
            let from_angle = Angle::ZERO.delta(stance.hip_yaw);
            let from_fraction = (stance.twist_fraction * Fx::from_int(budget)).round_int();
            assert!((from_angle - from_fraction).abs() <= 1,
                    "the hips say {from_angle} raw of twist and the fraction says {from_fraction}");
            if from_angle != 0 { moved += 1; }
        }
        assert!(moved > 0, "the twist never left zero, so the agreement above is vacuous");

        for turn in [1, -1] {
            let wound = Angle::from_raw((turn * budget) as u16);
            world.stance[i].hip_yaw = world.body_yaw[i].angle - wound;
            let stance = world.observe(hero).stance;
            assert_eq!(stance.twist_fraction, Fx::from_int(turn),
                       "a body wound to its budget does not read as its budget");
            assert_eq!(Angle::ZERO.delta(stance.hip_yaw), turn * budget,
                       "the published hips are not the torso's frame");
            // Past the budget, which no driver produces and a hand-built world
            // can: the column saturates rather than leaving the interval.
            world.stance[i].hip_yaw = world.body_yaw[i].angle - wound - wound;
            assert_eq!(world.observe(hero).stance.twist_fraction,
                       Fx::from_int(turn), "twice the budget left the interval");
        }
    }

    /// The pelvis and the step are published over their own constants, and a
    /// body that has spent neither publishes exactly one of each.
    ///
    /// **Exactly one is the assertion**, and it is the only thing in the suite
    /// that reads either column's scale. A divisor that was not the standing
    /// pelvis, or not the step's own duration, answers something else here and
    /// passes everything else -- which is what a policy reading "how much of a
    /// step is left" would then be wrong about, silently, because the constants
    /// it would need to check are not exported to it.
    #[test]
    fn a_settled_pelvis_and_a_fresh_step_are_published_as_whole_ones() {
        let mut world = World::new(&embodied_within_sight(), 7);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let fresh = world.observe(hero).stance;
        assert_eq!(fresh.pelvis_fraction, Fx::ONE,
                   "a body standing square is not published at full height");
        assert_eq!(fresh.step_fraction, Fx::ZERO, "a settled body has a step running");

        // One tick of a request four and a half budgets away: refused, so a step
        // arms at its full duration.
        world.submit(hero, turning_embodied_command(Angle::HALF));
        world.step();
        let armed = world.observe(hero).stance;
        assert_eq!(armed.step_fraction, Fx::ONE, "a freshly armed step is not a whole step");
        assert!(armed.pelvis_fraction < Fx::ONE, "a wound torso cost the pelvis nothing");

        // And it runs down rather than sticking, reaching zero on the tick its
        // own duration says -- which is the other half of what makes the
        // divisor the duration and not merely a number the numerator reaches.
        let i = world.resolve(hero).expect("a live hero");
        let ticks = u32::from(actuator::STANCE_STEP_TICKS);
        for tick in 0..ticks {
            // A yaw the budget can already hold, so nothing re-arms.
            world.submit(hero, turning_embodied_command(world.body_yaw[i].angle));
            world.step();
            let running = world.observe(hero).stance;
            assert_eq!(running.step_fraction.is_zero(), tick + 1 >= ticks,
                       "the step is {:?} of the way through on tick {tick} of {ticks}",
                       running.step_fraction);
        }
    }

    /// The published elbow is half an arm's length from the origin it is
    /// measured from, which is what says that origin is the shoulder.
    ///
    /// **The magnitude is the assertion and it is not a restatement.** Nothing
    /// in `observed_stance` computes a length; what it does is subtract a
    /// shoulder and divide by `arm_length`. The elbow lies on the circle of
    /// radius `upper` about the shoulder by construction -- that is what
    /// `elbow_point` solves -- so a correctly-based column has magnitude
    /// `UPPER_ARM_FRACTION`, and one left in the body frame is a shoulder-height
    /// away and saturates the clamp instead. A body-frame elbow passes every
    /// other assertion in this file; this is the one it fails.
    #[test]
    fn a_published_elbow_is_half_an_arm_from_its_own_shoulder() {
        let mut world = World::new(&embodied_within_sight(), 5);
        // Both bodies, because the Fighter and the Brute differ in every
        // dimension this reads and a claim that holds for one shape is not a
        // claim -- the same rule `limb.rs`'s own sweeps follow.
        let ids = [world.alive_ids(Faction::Heroes)[0], world.alive_ids(Faction::Monsters)[0]];
        let upper = Fx::from_raw(crate::combat::limb::UPPER_ARM_FRACTION_RAW);
        let mut worst = 0i32;
        for tick in 0..60 {
            for id in ids { world.submit(id, turning_embodied_command(Angle::HALF)); }
            world.step();
            for id in ids {
                let stance = world.observe(id).stance;
                assert!(stance.present, "a body lost its legs at tick {tick}");
                for limb in 0..2 {
                    let span = stance.elbow[limb].length();
                    worst = worst.max((span - upper).abs().raw());
                    // Six raw units, measured across this sweep and exact from
                    // both sides: five fails and seven would pass on an error
                    // that had grown. Four of them are the slack
                    // `the_elbow_lies_on_both_link_circles` already measures on
                    // the circle itself; three per-axis truncations by an
                    // `arm_length` under one scale those up rather than adding
                    // to them, and the Fighter alone measures four while the
                    // pair measures six.
                    assert!((span - upper).abs() <= Fx::from_raw(6),
                            "tick {tick} arm {limb}: the elbow is {span:?} from its origin, \
                             not the upper link's {upper:?}");
                }
            }
        }
        assert!(worst > 0, "the sweep never moved the elbow off an exact half");
    }

    #[test]
    fn a_fight_that_runs_out_of_clock_is_decided_on_points() {
        // A draw was the honest answer while the clock was the only thing that
        // could end a fight neither side was winning, and it is the wrong answer
        // for a difficulty ladder: every step down the ladder converts a loss
        // into a timeout rather than into a defeat, and the bottom of the range
        // stops meaning "loses" and starts meaning "wanders off".
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let brute = w.alive_ids(Faction::Monsters)[0];

        // Level: nobody has touched anybody.
        assert_eq!(w.timeout(), Outcome::Draw);

        // Hurt the Brute and the fight is the hero's on points -- but it is
        // still not a *kill*, and the two have to stay distinguishable or
        // fitness cannot price them differently.
        //
        // Taken as **fractions of each bar** rather than as flat amounts, which
        // is what these were: 40 off a Brute and 60 off a Fighter said 30% and
        // 71% while the bars were 132 and 84, and said "both sides at zero,
        // therefore level, therefore a draw" the moment they became 18 and 12.
        // `health_fraction` is a ratio and clamps at zero, so a test that feeds
        // it absolute damage is a test written in units it does not use.
        // **Bled rather than de-`hp`-ed**, and only one of those is still
        // spellable. `health_fraction` scores a body with an anatomy row
        // through `anatomy::blood_fraction`; this note used to record that
        // subtracting from the legacy `hp` column instead left both sides at
        // full health and the timeout a draw, and that column has since gone.
        // The fraction taken is the same 30%.
        let b = w.resolve(brute).unwrap();
        let bled = w.wounds[b].blood * Fx::from_ratio(30, 100);
        w.wounds[b].blood -= bled;
        assert_eq!(w.timeout(), Outcome::Decision(Faction::Heroes));
        assert_eq!(w.timeout().winner(), Some(Faction::Heroes));
        assert!(!w.timeout().is_decisive());
        assert!(Outcome::HeroesWin.is_decisive());

        // ...and it swings back when the hero is the one bleeding.
        let h = w.resolve(hero).unwrap();
        let bled = w.wounds[h].blood * Fx::from_ratio(70, 100);
        w.wounds[h].blood -= bled;
        assert_eq!(w.timeout(), Outcome::Decision(Faction::Monsters));
    }

    // ------------------------------------------------------------------ sight

    #[test]
    fn nearest_keeps_the_closest_in_order() {
        let mut n = Nearest::new(3);
        for (d, i) in [(5, 0), (1, 1), (9, 2), (3, 3), (1, 4)] {
            n.offer(Fx::from_int(d), i);
        }
        let got: Vec<usize> = n.items().iter().map(|&(_, i)| i).collect();
        // 1@1 and 1@4 tie on distance; the lower index wins.
        assert_eq!(got, vec![1, 4, 3]);
    }

}
