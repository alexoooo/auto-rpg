use crate::entity::EntityId;
use fx::{Angle, Fx, Hash64, Vec2};

pub const SUBMITTED_COMMAND_LAYOUT_VERSION: u16 = 2;
/// Was 51 through layout 1. The two bytes appended are one [`ReleaseRequest`]
/// per arm; the payload was already fully packed, so a verb costs a byte and a
/// layout version and there was never a spare bit to put it in.
pub const ARTICULATED_PAYLOAD_BYTES: usize = 53;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct CombatHeight(Fx);

impl CombatHeight {
    pub const LOW: CombatHeight = CombatHeight(Fx::from_raw(16_384));
    pub const MID: CombatHeight = CombatHeight(Fx::from_raw(32_768));
    pub const HIGH: CombatHeight = CombatHeight(Fx::from_raw(49_152));

    pub const fn try_from_raw(raw: i32) -> Option<CombatHeight> {
        if raw >= 0 && raw <= Fx::ONE.raw() {
            Some(CombatHeight(Fx::from_raw(raw)))
        } else {
            None
        }
    }

    pub const fn raw(self) -> i32 { self.0.raw() }
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum LimbSlot { LeftArm = 0, RightArm = 1 }

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct ArmTarget {
    pub bearing: Angle,
    pub height: CombatHeight,
    pub reach: Fx,
    pub effort: Fx,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum GripRequest { Keep, Release, EquipSlot(u8) }

/// Whether an arm is asking to **loose** what it has drawn -- an arrow, and
/// later anything else that leaves the hand under tension.
///
/// **Named `Loose` and deliberately not `Release`**, because
/// [`GripRequest::Release`] already means "drop what you are holding" and sits
/// two fields away in the same struct. Two verbs called release, one of which
/// throws an arrow and the other of which puts the bow on the floor, is a trap
/// for the next reader and eventually for the next policy. `Loose` is also the
/// word the repository already uses for this: `EVENT_LOOSE` has been the frame
/// ABI's archer's-release row since long before this command could express one.
///
/// **This is a level, and the mechanic is an edge.** The command says what the
/// arm is asking for on this tick, and a policy that asks forever is asking on
/// every tick; [`ReleaseRequest::looses`] is the transition, and it is the only
/// thing a consumer should read. That mirrors [`Strike::None`] re-arming the
/// legacy hand, and it is the reason the rule lives here rather than being left
/// for step 3 to invent -- a level consumed as a level fires an arrow every tick
/// it is held.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum ReleaseRequest {
    /// Hold whatever is drawn. The default, and what every command that predates
    /// layout 2 means.
    #[default]
    Keep,
    /// Loose on this tick, if the arm has something drawn to loose.
    Loose,
}

impl ReleaseRequest {
    /// The **edge**: true only on the tick a held request becomes a loosed one.
    ///
    /// Asking to loose on a hundred consecutive ticks looses once, on the first.
    /// A consumer that tests `current == Loose` instead of calling this empties
    /// a quiver in under two seconds, which is exactly the bug this function
    /// exists to make hard to write.
    pub const fn looses(previous: ReleaseRequest, current: ReleaseRequest) -> bool {
        matches!((previous, current), (ReleaseRequest::Keep, ReleaseRequest::Loose))
    }

    const fn wire(self) -> u8 {
        match self { ReleaseRequest::Keep => 0, ReleaseRequest::Loose => 1 }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct ArticulatedCommandV1 {
    pub move_dir: Vec2,
    pub body_yaw: Angle,
    pub intent: Intent,
    pub arms: [ArmTarget; 2],
    pub grips: [GripRequest; 2],
    /// Per arm rather than per body, and the alternative was measured against
    /// this one rather than assumed away: a single body-level flag is one byte
    /// cheaper and a two-handed bow is held by both arms anyway. It loses
    /// because a *binding* is not a body state -- [`crate::GripBinding::Both`]
    /// already says which arms hold an item, and the obvious second consumer of
    /// this verb is a one-handed thrown weapon, where "which hand let go" is the
    /// whole question. Widening a wire contract later costs another layout
    /// version; carrying two bytes now does not.
    pub releases: [ReleaseRequest; 2],
}

/// How wide an embodied payload is, and the reason it is a second constant
/// rather than a second reader of the first.
///
/// **Was 53 through layout 1, and the fork is what it was for.**
/// `ARTICULATED_PAYLOAD_BYTES` is read by `ARTICULATED_COMMAND_HASH`,
/// `EXACT_TRAJECTORY_STATE_DIGEST` and `LIFTED_COULOMB_SOLVER_DIGEST`; those
/// three have already moved together twice because a session appended one field
/// to that payload. Session 07 appended a swing plane per arm here and moved
/// none of them, because the two widths were never one constant.
pub const EMBODIED_PAYLOAD_BYTES: usize = 57;

/// Layout 2: the swing plane. Layout 1 was the fifty-three bytes the articulated
/// payload still is.
pub const EMBODIED_COMMAND_LAYOUT_VERSION: u16 = 2;

/// The embodied submission contract.
///
/// The `articulated` field is named rather than flattened so the fields sessions
/// 06 and 07 add sit *beside* the frozen grammar instead of inside a copy of it.
/// Session 07 is the one that cashed that in: [`EmbodiedCommandV1::swing_plane`]
/// sits next to `articulated` and the fifty-three bytes below it are still
/// written by the shared [`write_payload`], so "the first fifty-three bytes are
/// the articulated payload" stays true by construction rather than by two
/// structs happening to agree. Session 06's stance stayed derived, so it never
/// arrived here at all.
///
/// **The coordinate frame is the torso's, and no byte moved to make it so.**
/// `arms[..].bearing` and `move_dir` are read *relative to the torso*: `+x` is
/// forward, `+y` is body-left, and a zero bearing holds the arm directly ahead
/// at every yaw. Identical offsets can still mean different things, which is the
/// trap for a reader who diffs this byte table against
/// [`ArticulatedCommandV1`]'s and concludes the two are the same contract.
/// [`World::world_arm_target`] and [`World::world_move_dir`] are where the frame
/// is applied, and they are the only two places in the tick that know about it.
///
/// **That frame is a mechanic rather than a convention, and the argument is kept
/// here because the enum that carried it is gone.** The retired articulated
/// contract read a bearing absolutely -- *body yaw moves the shoulders, it does
/// not silently rewrite an absolute arm target* -- which was deliberate and had
/// a cost the source material does not pay: **turning the body did not carry the
/// sword**, so footwork and swing were two independent subsystems that happened
/// to share a shoulder. Reading from the torso couples them. Turning the hips
/// swings the weapon; reaching across the body costs bearing travel the torso
/// could have supplied for free; and a body that must turn to bring its weapon
/// round is a body whose stance can constrain its attack. Neither reading is
/// wrong -- an absolute bearing is stable under yaw and a relative one is stable
/// under the body -- which is why the choice is worth writing down rather than
/// inferring from the offsets.
///
/// [`World::world_arm_target`]: crate::World
/// [`World::world_move_dir`]: crate::World
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct EmbodiedCommandV1 {
    pub articulated: ArticulatedCommandV1,
    /// Which plane each arm folds its elbow into, about the shoulder-to-hand
    /// axis. Zero is the plane the elbow hung in before this field existed --
    /// below the line from shoulder to hand -- so a command that says nothing
    /// about the plane asks for exactly what the old default gave.
    pub swing_plane: [Angle; 2],
}

impl EmbodiedCommandV1 {
    /// An articulated command with the **neutral** plane on both arms.
    ///
    /// Kept as a one-argument constructor rather than widened to take the plane,
    /// because most of its callers are adapters wrapping an
    /// `ArticulatedCommandV1` that has no plane to give -- and an adapter forced
    /// to invent one would be inventing state. A caller that means a plane
    /// writes the field.
    pub const fn new(articulated: ArticulatedCommandV1) -> EmbodiedCommandV1 {
        EmbodiedCommandV1 { articulated, swing_plane: [Angle::ZERO; 2] }
    }

    /// The fifty-three shared bytes, then the two planes.
    ///
    /// Written through the shared grammar rather than beside a copy of it: the
    /// fork is about **width and ownership**, and an embodied writer that spelled
    /// out the first fifty-three offsets again would be a second place for one of
    /// them to drift.
    pub fn payload_bytes(self) -> [u8; EMBODIED_PAYLOAD_BYTES] {
        let mut out = [0u8; EMBODIED_PAYLOAD_BYTES];
        write_payload(&mut out, self.articulated);
        put_u16(&mut out, 53, self.swing_plane[0].raw());
        put_u16(&mut out, 55, self.swing_plane[1].raw());
        out
    }

    pub fn from_payload_bytes(bytes: &[u8; EMBODIED_PAYLOAD_BYTES])
        -> Result<EmbodiedCommandV1, ArticulatedPayloadError>
    {
        Self::validate_payload_structure(bytes)?;
        Ok(EmbodiedCommandV1 {
            articulated: read_payload(bytes)?,
            swing_plane: [
                Angle::from_raw(get_u16(bytes, 53)),
                Angle::from_raw(get_u16(bytes, 55)),
            ],
        })
    }

    /// The shared structural check, over the shared prefix, and **nothing for
    /// the plane** -- which is a decision rather than an omission.
    ///
    /// A structural check exists for a byte that has illegal values: an intent
    /// tag, a grip tag, a release verb. A raw `Angle` has none -- every one of
    /// the 65,536 bit patterns is a legal bearing -- so there is nothing here to
    /// refuse, and inventing a range would refuse a plane the actuator can hold.
    pub fn validate_payload_structure(bytes: &[u8; EMBODIED_PAYLOAD_BYTES])
        -> Result<(), ArticulatedPayloadError>
    {
        validate_payload_structure(bytes)
    }
}

/// What a submitted command is, tagged by the grammar that produced it.
///
/// The tag is the wire discriminant a replay stores: `2` embodied. It is frozen,
/// so a variant is appended and never renumbered -- **including the two that are
/// gone.** `0` was legacy and `1` was articulated, and neither is reused: a
/// decoder that met one would otherwise read an old record as a new grammar, so
/// both numbers stay retired and `codec.rs` refuses them by number in
/// `read_submitted_command`.
///
/// One variant, and it stays an enum for that reason. The tag is a wire fact
/// this type is the in-memory shape of; flattening it to the payload would put
/// the surviving number nowhere and leave the two retired ones with nothing to
/// be retired *from*.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SubmittedCommand {
    Embodied(EmbodiedCommandV1),
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SubmitEmbodiedOutcome {
    Stored { command: EmbodiedCommandV1, rejection: Option<CommandReject> },
    NotStored(CommandReject),
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum CommandField {
    MoveX = 0, MoveY = 1, MoveMagnitude = 2,
    LeftHeight = 3, LeftReach = 4, LeftEffort = 5,
    RightHeight = 6, RightReach = 7, RightEffort = 8,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum CommandReject {
    /// **Unproducible inside `sim` since the second body model was deleted**,
    /// and kept anyway because it is a wire failure code: `crates/web` maps it
    /// onto submission result `2` across the ABI, so removing the variant
    /// would renumber a published contract to delete an arm no caller can
    /// reach. Every submission path answered it when the world's grammar
    /// disagreed with the payload; there is one grammar now, so nothing
    /// disagrees.
    WrongModel,
    StaleEntity,
    MissingEquipment { arm: LimbSlot, slot: u8 },
    OutOfRange(CommandField),
    UnknownLayout(u16),
}


#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ArticulatedPayloadError {
    UnknownIntent(u8),
    UnknownGrip { arm: LimbSlot, value: u8 },
    NonCanonicalIntent,
    NonCanonicalGrip(LimbSlot),
    /// A release byte that is neither `Keep` nor `Loose`. Names the arm and the
    /// value, like [`ArticulatedPayloadError::UnknownGrip`], because a refusal
    /// that says only "invalid" leaves the caller guessing which of two arms it
    /// got wrong.
    UnknownRelease { arm: LimbSlot, value: u8 },
    OutOfRange(CommandField),
}

impl ArticulatedCommandV1 {
    pub fn payload_bytes(self) -> [u8; ARTICULATED_PAYLOAD_BYTES] {
        let mut out = [0u8; ARTICULATED_PAYLOAD_BYTES];
        write_payload(&mut out, self);
        out
    }

    pub fn from_payload_bytes(bytes: &[u8; ARTICULATED_PAYLOAD_BYTES])
        -> Result<ArticulatedCommandV1, ArticulatedPayloadError>
    {
        Self::validate_payload_structure(bytes)?;
        read_payload(bytes)
    }

    pub fn validate_payload_structure(bytes: &[u8; ARTICULATED_PAYLOAD_BYTES])
        -> Result<(), ArticulatedPayloadError>
    {
        validate_payload_structure(bytes)
    }
}

/// The fifty-three bytes both payload contracts begin with.
///
/// One implementation rather than two copies. The fork between the articulated
/// and embodied payloads is about **width and ownership**, not about arithmetic:
/// session 07 appended a swing plane after byte 52 and every offset below stayed
/// exactly where it is. Two copies of this grammar would be two places for a
/// field offset to drift, and the drift would be invisible until a pinned digest
/// moved on one side only.
///
/// It takes `&[u8]` rather than `&[u8; ARTICULATED_PAYLOAD_BYTES]` for that
/// reason and no other: the embodied writer hands it the first fifty-three bytes
/// of a fifty-seven-byte buffer, and a fixed-width signature here would have
/// forced a copy or a second grammar.
fn write_payload(out: &mut [u8], command: ArticulatedCommandV1) {
    let ArticulatedCommandV1 { move_dir, body_yaw, intent, arms, grips, releases } = command;
    put_i32(out, 0, move_dir.x.raw());
    put_i32(out, 4, move_dir.y.raw());
    put_u16(out, 8, body_yaw.raw());
    let (intent_tag, target) = match intent {
        Intent::Hold => (0, EntityId::new(0, 0)),
        Intent::Attack(id) => (1, id),
        Intent::Flee => (2, EntityId::new(0, 0)),
    };
    out[10] = intent_tag;
    put_u32(out, 11, target.index);
    put_u32(out, 15, target.generation);
    write_arm(out, 19, arms[0]);
    write_arm(out, 33, arms[1]);
    write_grip(out, 47, grips[0]);
    write_grip(out, 49, grips[1]);
    // Appended at the end so the fifty-one bytes above keep the offsets
    // every reader of layout 1 already knows. That does not make the change
    // compatible -- the width is in the digest and the layout version is
    // bumped -- it makes the diff readable.
    out[51] = releases[0].wire();
    out[52] = releases[1].wire();
}

fn read_payload(bytes: &[u8]) -> Result<ArticulatedCommandV1, ArticulatedPayloadError> {
    let move_dir = Vec2::new(Fx::from_raw(get_i32(bytes, 0)), Fx::from_raw(get_i32(bytes, 4)));
    validate_move(move_dir)?;
    let target = EntityId::new(get_u32(bytes, 11), get_u32(bytes, 15));
    let intent = match bytes[10] {
        0 => Intent::Hold,
        1 => Intent::Attack(target),
        2 => Intent::Flee,
        value => return Err(ArticulatedPayloadError::UnknownIntent(value)),
    };
    Ok(ArticulatedCommandV1 {
        move_dir,
        body_yaw: Angle::from_raw(get_u16(bytes, 8)),
        intent,
        arms: [read_arm(bytes, 19, true)?, read_arm(bytes, 33, false)?],
        grips: [read_grip(bytes, 47, LimbSlot::LeftArm)?, read_grip(bytes, 49, LimbSlot::RightArm)?],
        releases: [read_release(bytes, 51, LimbSlot::LeftArm)?,
                   read_release(bytes, 52, LimbSlot::RightArm)?],
    })
}

fn validate_payload_structure(bytes: &[u8]) -> Result<(), ArticulatedPayloadError> {
    let target_zero = bytes[11..19].iter().all(|byte| *byte == 0);
    match bytes[10] {
        0 | 2 if !target_zero => return Err(ArticulatedPayloadError::NonCanonicalIntent),
        0..=2 => {}
        value => return Err(ArticulatedPayloadError::UnknownIntent(value)),
    }
    let _ = read_grip(bytes, 47, LimbSlot::LeftArm)?;
    let _ = read_grip(bytes, 49, LimbSlot::RightArm)?;
    // Structural, like the grips beside it: a release byte this build does
    // not know is refused here rather than at `from_payload_bytes`, so the
    // boundary's cheap structure check answers it too and a malformed
    // command never reaches the range check.
    let _ = read_release(bytes, 51, LimbSlot::LeftArm)?;
    let _ = read_release(bytes, 52, LimbSlot::RightArm)?;
    Ok(())
}

pub(crate) fn validate_articulated(command: ArticulatedCommandV1) -> Result<(), CommandField> {
    validate_move(command.move_dir).map_err(|e| match e { ArticulatedPayloadError::OutOfRange(f) => f, _ => unreachable!() })?;
    for (arm, fields) in command.arms.into_iter().zip([
        [CommandField::LeftHeight, CommandField::LeftReach, CommandField::LeftEffort],
        [CommandField::RightHeight, CommandField::RightReach, CommandField::RightEffort],
    ]) {
        if !(0..=Fx::ONE.raw()).contains(&arm.height.raw()) { return Err(fields[0]); }
        if !(0..=Fx::ONE.raw()).contains(&arm.reach.raw()) { return Err(fields[1]); }
        if !(0..=Fx::ONE.raw()).contains(&arm.effort.raw()) { return Err(fields[2]); }
    }
    Ok(())
}

fn validate_move(move_dir: Vec2) -> Result<(), ArticulatedPayloadError> {
    let x = move_dir.x.raw();
    let y = move_dir.y.raw();
    if !(-65_536..=65_536).contains(&x) { return Err(ArticulatedPayloadError::OutOfRange(CommandField::MoveX)); }
    if !(-65_536..=65_536).contains(&y) { return Err(ArticulatedPayloadError::OutOfRange(CommandField::MoveY)); }
    let xx = i64::from(x) * i64::from(x);
    let yy = i64::from(y) * i64::from(y);
    if xx + yy > 65_536i64 * 65_536i64 { return Err(ArticulatedPayloadError::OutOfRange(CommandField::MoveMagnitude)); }
    Ok(())
}

fn write_arm(out: &mut [u8], at: usize, arm: ArmTarget) {
    put_u16(out, at, arm.bearing.raw()); put_i32(out, at + 2, arm.height.raw());
    put_i32(out, at + 6, arm.reach.raw()); put_i32(out, at + 10, arm.effort.raw());
}
fn read_arm(bytes: &[u8], at: usize, left: bool) -> Result<ArmTarget, ArticulatedPayloadError> {
    let fields = if left { [CommandField::LeftHeight, CommandField::LeftReach, CommandField::LeftEffort] }
        else { [CommandField::RightHeight, CommandField::RightReach, CommandField::RightEffort] };
    let height_raw = get_i32(bytes, at + 2);
    let height = CombatHeight::try_from_raw(height_raw).ok_or(ArticulatedPayloadError::OutOfRange(fields[0]))?;
    let reach = Fx::from_raw(get_i32(bytes, at + 6));
    if !(0..=Fx::ONE.raw()).contains(&reach.raw()) { return Err(ArticulatedPayloadError::OutOfRange(fields[1])); }
    let effort = Fx::from_raw(get_i32(bytes, at + 10));
    if !(0..=Fx::ONE.raw()).contains(&effort.raw()) { return Err(ArticulatedPayloadError::OutOfRange(fields[2])); }
    Ok(ArmTarget { bearing: Angle::from_raw(get_u16(bytes, at)), height, reach, effort })
}
fn write_grip(out: &mut [u8], at: usize, grip: GripRequest) {
    match grip { GripRequest::Keep => { out[at] = 0; out[at+1] = 0; }, GripRequest::Release => { out[at] = 1; out[at+1] = 0; }, GripRequest::EquipSlot(slot) => { out[at] = 2; out[at+1] = slot; } }
}
fn read_grip(bytes: &[u8], at: usize, arm: LimbSlot) -> Result<GripRequest, ArticulatedPayloadError> {
    match bytes[at] { 0 if bytes[at+1] == 0 => Ok(GripRequest::Keep), 1 if bytes[at+1] == 0 => Ok(GripRequest::Release), 2 => Ok(GripRequest::EquipSlot(bytes[at+1])), 0 | 1 => Err(ArticulatedPayloadError::NonCanonicalGrip(arm)), value => Err(ArticulatedPayloadError::UnknownGrip { arm, value }) }
}
fn read_release(bytes: &[u8], at: usize, arm: LimbSlot) -> Result<ReleaseRequest, ArticulatedPayloadError> {
    match bytes[at] {
        0 => Ok(ReleaseRequest::Keep),
        1 => Ok(ReleaseRequest::Loose),
        value => Err(ArticulatedPayloadError::UnknownRelease { arm, value }),
    }
}
fn put_u16(out: &mut [u8], at: usize, value: u16) { out[at..at+2].copy_from_slice(&value.to_le_bytes()); }
fn put_u32(out: &mut [u8], at: usize, value: u32) { out[at..at+4].copy_from_slice(&value.to_le_bytes()); }
fn put_i32(out: &mut [u8], at: usize, value: i32) { out[at..at+4].copy_from_slice(&value.to_le_bytes()); }
fn get_u16(bytes: &[u8], at: usize) -> u16 { u16::from_le_bytes(bytes[at..at+2].try_into().unwrap()) }
fn get_u32(bytes: &[u8], at: usize) -> u32 { u32::from_le_bytes(bytes[at..at+4].try_into().unwrap()) }
fn get_i32(bytes: &[u8], at: usize) -> i32 { i32::from_le_bytes(bytes[at..at+4].try_into().unwrap()) }

/// Whether a blade is being asked to attack, and from which side.
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

/// What an agent wants its limb to do.
///
/// The bearing is **absolute**, not relative to the body's facing. Two reasons,
/// and both bite immediately if you get it wrong: `facing` is derived from the
/// feet, so a facing-relative command would swing the blade bodily around every
/// time the character strafed; and absolute is exactly what a mouse bearing
/// gives you, so a human and a policy speak the same language here.
///
/// Which half of this struct is read depends on what the limb is holding, which
/// is the price of keeping one type at the boundary:
///
/// * A [`crate::Role::Guard`] limb reads `angle` and `reach` and ignores
///   `strike`. It is a braced guard, held wherever it is pointed.
/// * A [`crate::Role::Strike`] limb reads `angle` and `strike` and ignores
///   `reach`. `angle` is the line it guards along, and the line an attack is
///   thrown *through*; `reach` is not an agent's business, because a blade's
///   extension is decided by which phase of an attack it is in. Letting a policy
///   pin it at full extension forever is exactly how the blade became a stick
///   that dangled.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct LimbCommand {
    pub angle: Angle,
    /// Desired extension, **guard roles only**. Clamped to `0..=1` by the sim,
    /// so a policy handing back nonsense produces a tucked or a fully braced
    /// limb and never a panic.
    pub reach: Fx,
    /// Whether to attack along `angle`, **strike roles only**.
    pub strike: Strike,
}

impl LimbCommand {
    /// A limb held in against the body, pointing nowhere in particular.
    pub const TUCKED: LimbCommand = LimbCommand {
        angle: Angle::ZERO,
        reach: Fx::ZERO,
        strike: Strike::None,
    };

    /// A braced limb. A guard's whole vocabulary; for a blade this is a
    /// guard along `angle` that declines to attack, and therefore also the
    /// command that re-arms it.
    pub const fn new(angle: Angle, reach: Fx) -> LimbCommand {
        LimbCommand {
            angle,
            reach,
            strike: Strike::None,
        }
    }

    /// A blade asked to cut through `line`.
    pub const fn attack(line: Angle, strike: Strike) -> LimbCommand {
        LimbCommand {
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
/// A command persists until the agent's next decision tick, so a slow-witted
/// character keeps executing a stale plan while a sharp one re-plans up to 60
/// times a second. With the limb on the command that cuts deeper than it used to:
/// a stale plan is now a stale *swing*, still travelling.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct Command {
    /// Desired movement direction. Magnitude above 1 is clamped, so this is
    /// effectively "which way, and how hard".
    pub move_dir: Vec2,
    pub intent: Intent,
    /// Where to drive the limb. What it does with this depends on what it is
    /// holding -- see [`LimbCommand`].
    pub limb: LimbCommand,
    /// **Which loadout slot the agent wants in hand.**
    ///
    /// A *request*, not a fact, and three separate things can refuse it: the
    /// limb has to be at [`crate::Swing::Guard`] (asking mid-cut is ignored,
    /// which is what stops a swap being an escape hatch out of an attack that
    /// has already committed), the slot has to be one this fighter actually
    /// carries, and it has to differ from what is already in hand.
    ///
    /// Out-of-range values are ignored rather than clamped, for the reason
    /// [`crate::Loadout::slot`] gives: clamping would turn a policy's mistake
    /// into a deliberate-looking swap home that nobody asked for.
    pub slot: u8,
}

impl Command {
    pub const HOLD: Command = Command {
        move_dir: Vec2::ZERO,
        intent: Intent::Hold,
        slot: 0,
        limb: LimbCommand::TUCKED,
    };

    pub const fn moving(dir: Vec2) -> Command {
        Command {
            move_dir: dir,
            intent: Intent::Hold,
            slot: 0,
            limb: LimbCommand::TUCKED,
        }
    }

    /// Closes on a target with the limb tucked.
    ///
    /// Kept for the many call sites that only care about movement and
    /// targeting. It does **not** swing: damage is geometric, so an
    /// `Intent::Attack` with a tucked limb closes the distance and then stands
    /// there. Use [`Command::swinging`] to actually fight.
    pub const fn attacking(dir: Vec2, target: EntityId) -> Command {
        Command {
            move_dir: dir,
            intent: Intent::Attack(target),
            slot: 0,
            limb: LimbCommand::TUCKED,
        }
    }

    /// The full form: move, target, and drive the limb.
    pub const fn swinging(dir: Vec2, target: EntityId, limb: LimbCommand) -> Command {
        Command {
            move_dir: dir,
            intent: Intent::Attack(target),
            slot: 0,
            limb,
        }
    }

    // **`Command::hash_into` went with the column it was written for.** The
    // state hash wrote one of these per allocated slot, and the byte order it
    // used carried a real argument: the limb block was appended after the intent
    // block so that the bytes an `Order` contributes stayed untouched, and all
    // three limb fields were hashed even though no single role reads all of
    // them, because a hash whose *shape* depended on what the limb happened to
    // be holding cannot tell an attack from a guard. The column that held these
    // is gone -- nothing could write it once the legacy grammar and `submit`
    // went, so every body of every fight hashed `Command::HOLD` -- and a byte
    // grammar with no stream to write into is not a contract, it is a function.
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

/// What a faction is trying to *reach*, as opposed to what it is trying to do.
///
/// The second input channel, and shaped exactly like [`Order`] on purpose: set
/// by whoever is driving the sim, carried without interpretation, hashed beside
/// the orders, recorded in a replay. What it buys is a route -- the sim owns the
/// floor plan, so it is the only thing that can answer "which way round the
/// wall", and `Observation::nav_dir` is that answer.
///
/// **It is an input and not an inference, and that is the whole point.** The
/// obvious design is for the sim to notice that monsters want to reach heroes
/// and route them accordingly. That would change the behaviour of every
/// scenario the lab runs -- `duel`, `duel_of` and `skirmish` alike -- and with
/// it every recorded run, every measured win rate and every evolved genome, in
/// exchange for a convenience. Defaulting to [`Objective::None`] means a
/// scenario that has not asked for routing is bit-for-bit the scenario it was.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Objective {
    /// No route is computed and `nav_dir` is [`Vec2::ZERO`]. Every scenario
    /// that is not a dungeon.
    #[default]
    None,
    /// The faction's standing order's destination, when that order is an
    /// [`Order::Goto`]. Anything else routes nowhere.
    Order,
    /// Every living enemy, as one multi-source field -- so a hunter walks at
    /// whichever enemy is nearest *along the floor*, out of one search rather
    /// than one per quarry.
    Hunt,
}

impl Objective {
    pub const fn discriminant(self) -> usize {
        match self {
            Objective::None => 0,
            Objective::Order => 1,
            Objective::Hunt => 2,
        }
    }

    pub(crate) fn hash_into(self, h: &mut Hash64) {
        h.write_u8(self.discriminant() as u8);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::Fx;

    fn articulated_fixture() -> ArticulatedCommandV1 {
        ArticulatedCommandV1 {
            move_dir: Vec2::new(Fx::from_raw(1), Fx::from_raw(-2)),
            body_yaw: Angle::from_raw(0x1234),
            intent: Intent::Attack(EntityId::new(0x1122_3344, 0x5566_7788)),
            arms: [
                ArmTarget { bearing: Angle::from_raw(0x2345), height: CombatHeight::LOW, reach: Fx::from_raw(3), effort: Fx::from_raw(4) },
                ArmTarget { bearing: Angle::from_raw(0x3456), height: CombatHeight::HIGH, reach: Fx::from_raw(5), effort: Fx::from_raw(6) },
            ],
            grips: [GripRequest::EquipSlot(1), GripRequest::Release],
            // Asymmetric on purpose: a writer that filled both release bytes
            // from one arm, or a reader that read one twice, passes a fixture
            // where the two agree.
            releases: [ReleaseRequest::Keep, ReleaseRequest::Loose],
        }
    }

    /// A plane per arm and the two distinct, so a writer that filled both from
    /// one arm -- or a reader that read offset 53 twice -- cannot agree with
    /// itself by accident. Neither is a multiple of the other either, which is
    /// what stops a swapped pair passing.
    fn embodied_fixture() -> EmbodiedCommandV1 {
        EmbodiedCommandV1 {
            articulated: articulated_fixture(),
            swing_plane: [Angle::from_raw(0x4567), Angle::from_raw(0x89ab)],
        }
    }

    /// **The claim that replaced the fork's founding one.** Session 03 asserted
    /// that the two payloads were the same fifty-three bytes and said in its own
    /// doc comment that session 07 would stop that being true on purpose. It has:
    /// the embodied payload *begins* with the articulated one and the two
    /// contracts diverge after byte 52, where four bytes of swing plane the
    /// articulated grammar has no offsets for continue.
    ///
    /// Asserted over a fixture whose every field is distinct and asymmetric, so
    /// a writer that filled one contract from the other's offsets could not
    /// agree by accident.
    #[test]
    fn the_two_payload_contracts_share_a_prefix_and_diverge_after_byte_52() {
        let articulated = articulated_fixture();
        let embodied = embodied_fixture();
        assert_eq!(EMBODIED_PAYLOAD_BYTES, ARTICULATED_PAYLOAD_BYTES + 4);
        let bytes = embodied.payload_bytes();
        assert_eq!(&bytes[..ARTICULATED_PAYLOAD_BYTES], articulated.payload_bytes().as_slice());
        assert_eq!(&bytes[ARTICULATED_PAYLOAD_BYTES..], &[0x67, 0x45, 0xab, 0x89]);
    }

    #[test]
    fn an_embodied_payload_round_trips_through_its_own_reader() {
        let embodied = embodied_fixture();
        let bytes = embodied.payload_bytes();
        assert_eq!(EmbodiedCommandV1::from_payload_bytes(&bytes).unwrap(), embodied);
        // And the plane is not merely carried past the reader: a payload whose
        // planes were dropped would round-trip to `new`'s neutral pair, which
        // this fixture is chosen not to be.
        assert_ne!(embodied, EmbodiedCommandV1::new(articulated_fixture()));
    }

    /// A raw `Angle` has no illegal value, so **every** plane is accepted -- and
    /// that is asserted rather than left to be inferred from the absence of a
    /// check, because "no structural rule" and "a rule nobody wrote" look the
    /// same from the call site.
    #[test]
    fn no_swing_plane_is_structurally_illegal() {
        let mut bytes = embodied_fixture().payload_bytes();
        for raw in [0u16, 1, 0x7fff, 0x8000, 0xffff] {
            bytes[53..55].copy_from_slice(&raw.to_le_bytes());
            bytes[55..57].copy_from_slice(&raw.rotate_left(3).to_le_bytes());
            assert_eq!(EmbodiedCommandV1::validate_payload_structure(&bytes), Ok(()));
            let read = EmbodiedCommandV1::from_payload_bytes(&bytes).expect("a legal plane");
            assert_eq!(read.swing_plane[0], Angle::from_raw(raw));
            assert_eq!(read.swing_plane[1], Angle::from_raw(raw.rotate_left(3)));
        }
    }

    /// Both contracts refuse the same malformed byte for the same reason, which
    /// is what "same grammar, different width" has to mean if it means anything.
    ///
    /// The two arrays are now different lengths, so the malformed byte is written
    /// into each at the offset the shared grammar puts it -- 52 in both, because
    /// the divergence is entirely after it.
    #[test]
    fn both_payload_contracts_refuse_the_same_malformed_release_byte() {
        let mut narrow = articulated_fixture().payload_bytes();
        let mut wide = embodied_fixture().payload_bytes();
        narrow[52] = 7;
        wide[52] = 7;
        let articulated = ArticulatedCommandV1::validate_payload_structure(&narrow);
        let embodied = EmbodiedCommandV1::validate_payload_structure(&wide);
        assert_eq!(articulated, embodied);
        assert_eq!(
            articulated,
            Err(ArticulatedPayloadError::UnknownRelease { arm: LimbSlot::RightArm, value: 7 }),
        );
    }

    #[test]
    fn combat_height_accepts_every_in_range_raw_value_without_quantizing() {
        for raw in 0..=Fx::ONE.raw() {
            assert_eq!(CombatHeight::try_from_raw(raw).unwrap().raw(), raw);
        }
        assert_eq!(CombatHeight::try_from_raw(-1), None);
        assert_eq!(CombatHeight::try_from_raw(Fx::ONE.raw() + 1), None);
    }

    #[test]
    fn articulated_command_v1_matches_the_documented_57_byte_fixture() {
        // **Rewritten for layout 2, not re-recorded.** The first four bytes are
        // the envelope -- layout version, the articulated kind, one reserved
        // zero -- and the fifty-three after them are the payload. Two bytes
        // longer than layout 1's fifty-five, and the two are the release verbs
        // at the end; every other offset is where it was, which is what makes
        // this diff checkable by eye against the reference table.
        let payload = articulated_fixture().payload_bytes();
        let mut actual = [0u8; 57];
        actual[0..2].copy_from_slice(&SUBMITTED_COMMAND_LAYOUT_VERSION.to_le_bytes());
        actual[2] = 1;
        actual[4..].copy_from_slice(&payload);
        let expected: [u8; 57] = [
            0x02,0x00,0x01,0x00, 0x01,0x00,0x00,0x00, 0xfe,0xff,0xff,0xff,
            0x34,0x12,0x01, 0x44,0x33,0x22,0x11, 0x88,0x77,0x66,0x55,
            0x45,0x23, 0x00,0x40,0x00,0x00, 0x03,0x00,0x00,0x00,
            0x04,0x00,0x00,0x00, 0x56,0x34, 0x00,0xc0,0x00,0x00,
            0x05,0x00,0x00,0x00, 0x06,0x00,0x00,0x00, 0x02,0x01,0x01,0x00,
            0x00,0x01,
        ];
        assert_eq!(actual, expected);
        assert_eq!(ArticulatedCommandV1::from_payload_bytes(&payload), Ok(articulated_fixture()));
    }

    #[test]
    fn an_out_of_range_release_verb_is_refused_by_name() {
        // The refusal names the arm and the value, so a caller that got one of
        // two arms wrong is told which. Both arms are driven, because a decoder
        // that read byte 51 twice would refuse the left arm's value while
        // reporting the right arm's slot.
        let base = articulated_fixture().payload_bytes();
        for (at, arm) in [(51, LimbSlot::LeftArm), (52, LimbSlot::RightArm)] {
            let mut bad = base;
            bad[at] = 9;
            let expected = ArticulatedPayloadError::UnknownRelease { arm, value: 9 };
            assert_eq!(ArticulatedCommandV1::validate_payload_structure(&bad), Err(expected),
                       "byte {at} was not refused as {arm:?}'s release");
            assert_eq!(ArticulatedCommandV1::from_payload_bytes(&bad), Err(expected));
        }
        // And the two legal values are not refused, or the assertion above
        // would pass on a decoder that refused everything.
        for value in 0..=1u8 {
            let mut fine = base;
            fine[51] = value;
            fine[52] = value;
            assert!(ArticulatedCommandV1::validate_payload_structure(&fine).is_ok(),
                    "release verb {value} was refused");
        }
    }

    #[test]
    fn a_held_release_looses_once_rather_than_every_tick() {
        // **The edge, asserted before anything consumes it.** Step 3 spawns an
        // arrow from this transition; if it read the level instead it would
        // spawn one every tick the request was held, which is the whole reason
        // this rule is written down at the command layer now.
        use ReleaseRequest::{Keep, Loose};
        let held = [Keep, Loose, Loose, Loose, Keep, Loose, Keep];
        let loosed = held.windows(2).filter(|pair| ReleaseRequest::looses(pair[0], pair[1])).count();
        assert_eq!(loosed, 2, "a held request loosed once per tick instead of once per draw");

        // The four transitions spelled out, so a rule inverted in one direction
        // cannot be hidden by a sequence that happens to average out.
        assert!(ReleaseRequest::looses(Keep, Loose), "the draw did not loose");
        assert!(!ReleaseRequest::looses(Loose, Loose), "a held loose fired twice");
        assert!(!ReleaseRequest::looses(Loose, Keep), "letting go of the button loosed");
        assert!(!ReleaseRequest::looses(Keep, Keep), "an idle arm loosed");
    }

    #[test]
    fn the_exact_half_turn_delta_is_clockwise() {
        assert_eq!(Angle::HALF.delta(Angle::ZERO), -32_768);
    }

    #[test]
    fn unknown_tags_noncanonical_padding_and_ranges_are_distinct() {
        let base = articulated_fixture().payload_bytes();
        let mut bad = base;
        bad[10] = 9;
        bad[0..4].copy_from_slice(&(Fx::ONE.raw() + 1).to_le_bytes());
        assert_eq!(
            ArticulatedCommandV1::validate_payload_structure(&bad),
            Err(ArticulatedPayloadError::UnknownIntent(9))
        );
        let mut bad = base;
        bad[47] = 0;
        bad[48] = 1;
        assert_eq!(
            ArticulatedCommandV1::validate_payload_structure(&bad),
            Err(ArticulatedPayloadError::NonCanonicalGrip(LimbSlot::LeftArm))
        );
        let mut bad = base;
        bad[49] = 9;
        assert_eq!(
            ArticulatedCommandV1::validate_payload_structure(&bad),
            Err(ArticulatedPayloadError::UnknownGrip { arm: LimbSlot::RightArm, value: 9 })
        );
        let mut bad = base;
        bad[0..4].copy_from_slice(&(Fx::ONE.raw() + 1).to_le_bytes());
        bad[25..29].copy_from_slice(&(Fx::ONE.raw() + 1).to_le_bytes());
        assert_eq!(
            ArticulatedCommandV1::from_payload_bytes(&bad),
            Err(ArticulatedPayloadError::OutOfRange(CommandField::MoveX))
        );
    }

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

    // **`limb_commands_reach_the_command_hash` went with `Command::hash_into`.**
    // It asserted that two opposite swings, an extended blade against a tucked
    // one, and a guard against a cut along the same line all hashed apart --
    // the property that stops a replay reproducing the footwork and none of the
    // fight. The command it hashed is no longer in any hash stream, so the test
    // was checking a byte order nothing writes. `goto_hashes_its_destination`
    // below is the same claim about `Order`, which is still hashed.

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
