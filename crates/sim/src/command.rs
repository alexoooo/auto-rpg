use crate::entity::EntityId;
use fx::{Angle, Fx, Hash64, Vec2};

pub const SUBMITTED_COMMAND_LAYOUT_VERSION: u16 = 1;
pub const ARTICULATED_PAYLOAD_BYTES: usize = 51;

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

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct ArticulatedCommandV1 {
    pub move_dir: Vec2,
    pub body_yaw: Angle,
    pub intent: Intent,
    pub arms: [ArmTarget; 2],
    pub grips: [GripRequest; 2],
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SubmittedCommand { Legacy(Command), Articulated(ArticulatedCommandV1) }

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum CommandField {
    MoveX = 0, MoveY = 1, MoveMagnitude = 2,
    LeftHeight = 3, LeftReach = 4, LeftEffort = 5,
    RightHeight = 6, RightReach = 7, RightEffort = 8,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum CommandReject {
    WrongModel,
    StaleEntity,
    MissingEquipment { arm: LimbSlot, slot: u8 },
    OutOfRange(CommandField),
    UnknownLayout(u16),
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SubmitArticulatedOutcome {
    Stored { command: ArticulatedCommandV1, rejection: Option<CommandReject> },
    NotStored(CommandReject),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ArticulatedPayloadError {
    UnknownIntent(u8),
    UnknownGrip { arm: LimbSlot, value: u8 },
    NonCanonicalIntent,
    NonCanonicalGrip(LimbSlot),
    OutOfRange(CommandField),
}

impl ArticulatedCommandV1 {
    pub fn payload_bytes(self) -> [u8; ARTICULATED_PAYLOAD_BYTES] {
        let mut out = [0u8; ARTICULATED_PAYLOAD_BYTES];
        put_i32(&mut out, 0, self.move_dir.x.raw());
        put_i32(&mut out, 4, self.move_dir.y.raw());
        put_u16(&mut out, 8, self.body_yaw.raw());
        let (intent, target) = match self.intent {
            Intent::Hold => (0, EntityId::new(0, 0)),
            Intent::Attack(id) => (1, id),
            Intent::Flee => (2, EntityId::new(0, 0)),
        };
        out[10] = intent;
        put_u32(&mut out, 11, target.index);
        put_u32(&mut out, 15, target.generation);
        write_arm(&mut out, 19, self.arms[0]);
        write_arm(&mut out, 33, self.arms[1]);
        write_grip(&mut out, 47, self.grips[0]);
        write_grip(&mut out, 49, self.grips[1]);
        out
    }

    pub fn from_payload_bytes(bytes: &[u8; ARTICULATED_PAYLOAD_BYTES])
        -> Result<ArticulatedCommandV1, ArticulatedPayloadError>
    {
        Self::validate_payload_structure(bytes)?;
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
        })
    }

    pub fn validate_payload_structure(bytes: &[u8; ARTICULATED_PAYLOAD_BYTES])
        -> Result<(), ArticulatedPayloadError>
    {
        let target_zero = bytes[11..19].iter().all(|byte| *byte == 0);
        match bytes[10] {
            0 | 2 if !target_zero => return Err(ArticulatedPayloadError::NonCanonicalIntent),
            0..=2 => {}
            value => return Err(ArticulatedPayloadError::UnknownIntent(value)),
        }
        let _ = read_grip(bytes, 47, LimbSlot::LeftArm)?;
        let _ = read_grip(bytes, 49, LimbSlot::RightArm)?;
        Ok(())
    }
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
        // Appended after the intent block, so the bytes an `Order` contributes
        // are untouched. The limb command is the difference between a fight and
        // two people standing next to each other, so a replay that dropped it
        // would reproduce the walking and none of the swordplay.
        //
        // All three fields are hashed even though no single role reads all of
        // them, because the alternative is a hash whose shape depends on what
        // the limb happened to be holding -- and a replay that cannot tell
        // "attack" from "guard" apart reproduces the footwork and none of the
        // fight.
        h.write_u16(self.limb.angle.raw());
        h.write_i32(self.limb.reach.raw());
        h.write_u8(self.limb.strike.discriminant() as u8);
        // Appended after the limb block. A run in which the agent asked to change
        // what it was holding and one in which it did not are different runs,
        // and a replay that could not tell them apart would reproduce the
        // footwork and none of the loadout play -- the same argument the limb
        // block above makes one level down.
        h.write_u8(self.slot);
    }
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
        }
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
    fn articulated_command_v1_matches_the_documented_55_byte_fixture() {
        let payload = articulated_fixture().payload_bytes();
        let mut actual = [0u8; 55];
        actual[0..2].copy_from_slice(&1u16.to_le_bytes());
        actual[2] = 1;
        actual[4..].copy_from_slice(&payload);
        let expected: [u8; 55] = [
            0x01,0x00,0x01,0x00, 0x01,0x00,0x00,0x00, 0xfe,0xff,0xff,0xff,
            0x34,0x12,0x01, 0x44,0x33,0x22,0x11, 0x88,0x77,0x66,0x55,
            0x45,0x23, 0x00,0x40,0x00,0x00, 0x03,0x00,0x00,0x00,
            0x04,0x00,0x00,0x00, 0x56,0x34, 0x00,0xc0,0x00,0x00,
            0x05,0x00,0x00,0x00, 0x06,0x00,0x00,0x00, 0x02,0x01,0x01,0x00,
        ];
        assert_eq!(actual, expected);
        assert_eq!(ArticulatedCommandV1::from_payload_bytes(&payload), Ok(articulated_fixture()));
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

    #[test]
    fn limb_commands_reach_the_command_hash() {
        // Same shape as `goto_hashes_its_destination`, and for the same reason:
        // state the sim acts on but the hash ignores makes two different runs
        // indistinguishable to replay verification. Two swings in opposite
        // directions are about as different as two runs get.
        let hashed = |a: Command| {
            let mut h = Hash64::new();
            a.hash_into(&mut h);
            h.finish()
        };
        let target = EntityId::new(2, 0);
        let east = LimbCommand::new(Angle::ZERO, Fx::ONE);
        let west = LimbCommand::new(Angle::HALF, Fx::ONE);

        assert_ne!(
            hashed(Command::swinging(Vec2::ZERO, target, east)),
            hashed(Command::swinging(Vec2::ZERO, target, west)),
            "two opposite swings are indistinguishable to the state hash"
        );
        assert_ne!(
            hashed(Command::swinging(Vec2::ZERO, target, east)),
            hashed(Command::attacking(Vec2::ZERO, target)),
            "an extended blade hashes the same as a tucked one"
        );
        // The strike verb is the difference between a guard along a line and an
        // attack thrown through it, and only one of those can be punished.
        assert_ne!(
            hashed(Command::swinging(Vec2::ZERO, target, east)),
            hashed(Command::swinging(
                Vec2::ZERO,
                target,
                LimbCommand::attack(Angle::ZERO, Strike::Nearest)
            )),
            "a guard and a cut along the same line hash alike"
        );
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
