import { ACTION_TUNING, clampAction, selectThreat, blankThreat } from "../action-primitives.ts";
import { STRIKER_KINDS, WEAPON_KINDS, isStriking, type WeaponKind } from "../hands.ts";
import type { BodyView, FighterView } from "../mind.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, type HandActionName, type MovementName } from "../options.ts";

/**
 * `selectThreat` is declared in `action-primitives.ts` and re-exported here.
 *
 * The plan for this table asked for it to live in this file, and it cannot: the
 * cover skills need it, `action-primitives.ts` is what owns them, and that
 * module is already imported here -- so declaring it here would close a real
 * module cycle rather than an accidental one. It is re-exported so that the
 * feature writer, the motor skills and the tests all name one function through
 * whichever path they already had.
 */
export { selectThreat, type ThreatView } from "../action-primitives.ts";

export const FEATURE_VERSION = 4;
const handColumns = (owner: string, hand: string) => [
  ...WEAPON_KINDS.map((kind) => `${owner}_${hand}_kind_${kind}`), `${owner}_${hand}_lost`, `${owner}_${hand}_reach`, `${owner}_${hand}_tip_speed`,
];
const bodyColumns = (owner: string) => [`${owner}_collision_radius`, `${owner}_crown_height`, `${owner}_vital_height`];
const biteColumns = (owner: string) => [`${owner}_bite_reach`, `${owner}_bite_ready`, `${owner}_bite_active`];
/**
 * Every scale and clamp in the table, in one place, because a normalization
 * written at its use site is a normalization nobody can audit.
 *
 * All of them are constants of the *world* rather than of the tuning surface:
 * `AGENTS.md`'s rule is that a feature must not be normalized from a mutable
 * runtime balance constant, because the same frozen network would then mean two
 * different things either side of a console edit. `ACTION_TUNING` is frozen and
 * is the one exception the existing contract already makes -- `walkSpeed` and
 * `boutSeconds` were normalized from it in v3 and stay that way.
 *
 * | column group | divided by | clamped to |
 * |---|---|---|
 * | `measure` | 4 m | 0..1 |
 * | `usable_reach_margin` | 2 m | -1..1 |
 * | `radial_closing_rate` | `ACTION_TUNING.walkSpeed` | -1..1 |
 * | bearings and facing errors | pi | -1..1 |
 * | `*_reach` | 2 m | 0..1 |
 * | every speed and velocity component | `SPEED_SCALE` = 40 m/s | 0..1 / -1..1 |
 * | threat position in the local frame | `FRAME_SCALE` = 2 m | -1..1 |
 * | `threat_time_to_closest` | `HORIZON_SECONDS` = 1 s | 0..1 |
 * | `threat_closest_miss` | 2 m | 0..1 |
 * | collision radius | 1 m | 0..1 |
 * | crown and vital heights | `HEIGHT_SCALE` = 2.5 m | 0..1 |
 * | `clock_fraction` | `ACTION_TUNING.boutSeconds` | 0..1 |
 * | `persistence_age` | 0.8 s | 0..1 |
 * | both damage histories | `DAMAGE_MEMORY` = 3 s | 0..1 |
 *
 * 40 m/s is the v3 tip-speed scale kept unchanged, and it is deliberately below
 * a loosed arrow's 48: a shaft in flight saturates its velocity columns, which
 * is the honest thing for a quantity whose interesting range is a swung blade's.
 */
const SPEED_SCALE = 40;
const FRAME_SCALE = 2;
const HEIGHT_SCALE = 2.5;
const HORIZON_SECONDS = 1;
const DAMAGE_MEMORY = 3;
export const FEATURE_COLUMNS = Object.freeze([
  "measure", "usable_reach_margin", "radial_closing_rate", "facing_error", "self_vitality", "opponent_vitality",
  ...handColumns("self", "primary"), ...handColumns("self", "secondary"), ...handColumns("opponent", "primary"), ...handColumns("opponent", "secondary"),
  "threat_bearing", "threat_speed", ...STRIKER_KINDS.map((kind) => `threat_kind_${kind}`),
  "threat_local_right", "threat_local_up", "threat_local_forward",
  "threat_velocity_right", "threat_velocity_up", "threat_velocity_forward",
  "threat_time_to_closest", "threat_closest_miss",
  "self_crouch", "self_trunk_lean", "self_trunk_twist",
  "opponent_crouch", "opponent_trunk_lean", "opponent_trunk_twist",
  ...bodyColumns("self"), ...bodyColumns("opponent"), ...biteColumns("self"), ...biteColumns("opponent"),
  "clock_fraction",
  ...MOVEMENT_NAMES.map((name) => `current_movement_${name}`), ...HAND_ACTION_NAMES.map((name) => `current_action_${name}`),
  "persistence_age", "time_since_damage_dealt", "time_since_damage_received",
]);
/**
 * Which columns change sign under a mirror, and it is exactly the ones that name
 * a side.
 *
 * `threat_local_right` and `threat_velocity_right` are the two this session
 * adds, and they are why the mirror test had to be rewritten: mirroring twice
 * returns the input whatever sign these carry, so an involution check cannot
 * see a wrong one. The test that can is the one that builds the mirrored world
 * separately and compares.
 */
export const FEATURE_MIRROR_SIGN = Object.freeze(FEATURE_COLUMNS.map((name) =>
  name === "facing_error" || name === "threat_bearing" || name === "self_trunk_twist" ||
  name === "opponent_trunk_twist" || name === "threat_local_right" || name === "threat_velocity_right" ? -1 : 1));
/**
 * Which columns swap places under a mirror.
 *
 * Exactly one pair, and that is worth stating because "left/right-labelled
 * values swap" sounds like it should cover the hands: it does not. Hands are
 * labelled primary and secondary, which are not sides, and a mirrored fighter
 * still leads with the same hand. `current_movement_circle-left/right` is the
 * only pair in the table that names a direction of travel.
 *
 * **The checkable form of "not sides" is narrower than "no column carries one",
 * and the wider version was false.** Two columns carry a side and always did:
 * `threat_bearing` and `threat_local_right` read +0.25 and -0.25 across two worlds
 * that differ only in the x of the opponent's threatening hand, and
 * `FEATURE_MIRROR_SIGN` above lists them along with `facing_error` and the two
 * trunk twists. A note that said no column carries a side was contradicted by the
 * table two declarations up. It also rested on `HandView.outboard` being "the only
 * field that says which physical side a hand is on", which is not true either --
 * `outboard` is *derived* from the arm's geometry (`src/arm.ts`), so `shoulder.x`
 * and `tip.x` say it too, and `mirrorBody` negating all four together is that fact
 * written down.
 *
 * The true statement is about the hand *columns*: no column distinguishes which
 * physical side a given hand **slot** is on. `handColumns` writes a weapon
 * one-hot, `lost`, `reach` and `tip_speed`, all of them unsigned, and never
 * `outboard` or an x. So the same fighter built left-handed produces an identical
 * feature vector, swapping `primary`/`secondary` under a mirror would invent a
 * distinction the network cannot see, and `mirrorBody` keeping the slot keys while
 * negating the geometry is what makes a mirrored sample a genuine left-handed copy
 * of the same fighter rather than an invented second one --
 * `no_hand_column_carries_which_physical_side_a_slot_is_on` builds that pair of
 * bodies, asserts both facts, and goes red if a hand column carrying
 * `Math.sign(shoulder.x)` is added. Tactic v2's `EFFECTOR_NAMES` inherit it: an
 * effector head writes `primary`/`secondary`/`natural`, which name a *slot*, so a
 * mirror does not swap effectors. The same goes for `TARGET_NAMES`, which are
 * heights and a threat. **The decision did not move when the evidence for it
 * did.**
 *
 * **`slip-left` and `slip-right` are the pair that will need this treatment**,
 * and they are recorded here rather than implemented because nothing mirrors a
 * *label* today: `mirrorFeatures` and `mirrorView` both act on the input side,
 * `FEATURE_MIRROR_INDEX` is a table of input columns, and no network is ever run
 * on a mirrored fixture. They are two halves of one posture -- `applyTacticStance`
 * gives them `trunkTwist` -0.65 and +0.65 -- so whoever adds an output mirror
 * swaps them exactly as this table swaps `circle-left/right`, and swaps nothing
 * else in the stance table: `upright`, `compact` and `action-default` are
 * side-neutral, and `extended` already reads the acting hand's `outboard`, which
 * the mirror has already negated. Adding the machinery now would be a mirror
 * with no caller, which is the shape stage B's deleted `TacticDecision` was.
 */
export const FEATURE_MIRROR_INDEX = Object.freeze(FEATURE_COLUMNS.map((name) => {
  if (name === "current_movement_circle-left") return FEATURE_COLUMNS.indexOf("current_movement_circle-right");
  if (name === "current_movement_circle-right") return FEATURE_COLUMNS.indexOf("current_movement_circle-left");
  return FEATURE_COLUMNS.indexOf(name);
}));

export interface FeatureHistory {
  measure: number; clock: number; movement: MovementName; action: HandActionName; tacticSince: number;
  /**
   * Two clocks, not one. `time_since_damage` was a single field fed from the
   * opponent's vitality alone -- so it was time since damage *dealt*, wearing a
   * name that reads as time since damage taken, and a policy could not ask the
   * question that actually decides whether to disengage.
   */
  lastDealtAt: number; lastReceivedAt: number; selfVitality: number; opponentVitality: number;
}
const oneHot = (kind: WeaponKind): number[] => WEAPON_KINDS.map((candidate) => candidate === kind ? 1 : 0);
const hands = (body: BodyView): number[] => (["primary", "secondary"] as const).flatMap((name) => {
  const hand = body.hands[name];
  if (!hand) return [...oneHot("empty"), 1, 0, 0];
  return [...oneHot(hand.weapon), hand.lost ? 1 : 0, clampAction(hand.reach / 2, 0, 1), clampAction(hand.tipSpeed / SPEED_SCALE, 0, 1)];
});
const bodyShape = (body: BodyView): number[] => [clampAction(body.collisionRadius, 0, 1),
  clampAction(body.crownHeight / HEIGHT_SCALE, 0, 1), clampAction(body.vitalHeight / HEIGHT_SCALE, 0, 1)];
/** Zero on every column when the body has no jaws, which is not the same as a bite of reach zero. */
const bite = (body: BodyView): number[] => {
  const jaws = body.naturalAttacks?.bite;
  if (!jaws) return [0, 0, 0];
  return [clampAction(jaws.reach / 2, 0, 1), jaws.ready ? 1 : 0, jaws.active ? 1 : 0];
};
const relativeAngle = (x: number, z: number, facing: number): number => {
  let result = Math.atan2(x, z) - facing;
  while (result > Math.PI) result -= Math.PI * 2; while (result < -Math.PI) result += Math.PI * 2;
  return result;
};
const age = (clock: number, since: number): number => since < 0 ? 1 : clampAction((clock - since) / DAMAGE_MEMORY, 0, 1);
const initialHistory = (view: FighterView): FeatureHistory => ({ measure: view.measure, clock: view.clock, movement: "hold", action: "recover",
  tacticSince: view.clock, lastDealtAt: -1, lastReceivedAt: -1, selfVitality: view.self.vitality, opponentVitality: view.opponent.vitality });

/**
 * The observer's own right/up/forward, written into a module scratch.
 *
 * Right is `(cos f, 0, -sin f)` and forward is `(sin f, 0, cos f)`, which is the
 * same basis `actionAimAt` builds its `localX`/`localZ` from -- so a threat that
 * this reports as being on the local right is a threat the arm reaches for with
 * a positive cursor X, and the two cannot part company.
 */
const LOCAL = { right: 0, up: 0, forward: 0 };
const toLocal = (x: number, y: number, z: number, facing: number): typeof LOCAL => {
  const cos = Math.cos(facing); const sin = Math.sin(facing);
  LOCAL.right = x * cos - z * sin; LOCAL.up = y; LOCAL.forward = x * sin + z * cos;
  return LOCAL;
};
const threatScratch = blankThreat();

export function writeFeatures(view: FighterView, supplied?: FeatureHistory): number[] {
  const history = supplied ?? initialHistory(view);
  const threat = selectThreat(view, threatScratch);
  const threatBearing = relativeAngle(threat.tip.x - view.self.shoulder.x, threat.tip.z - view.self.shoulder.z, view.self.facing);
  const place = toLocal(threat.tip.x - view.self.shoulder.x, threat.tip.y - view.self.shoulder.y,
    threat.tip.z - view.self.shoulder.z, view.self.facing);
  const placeRight = place.right; const placeUp = place.up; const placeForward = place.forward;
  const motion = toLocal(threat.velocity.x, threat.velocity.y, threat.velocity.z, view.self.facing);
  const facingError = relativeAngle(view.opponent.ground.x - view.self.ground.x, view.opponent.ground.z - view.self.ground.z, view.self.facing);
  const closing = view.clock > history.clock ? clampAction((history.measure - view.measure) / (view.clock - history.clock) / ACTION_TUNING.walkSpeed) : 0;
  const offensiveReach = Math.max(0,
    ...Object.values(view.self.hands).filter((hand) => !hand.lost && isStriking(hand.weapon)).map((hand) => hand.reach),
    ...Object.values(view.self.naturalAttacks ?? {}).map((attack) => attack.reach));
  // Both clocks come from vitality deltas and nothing else. A combat event would
  // have been easier to read and would have granted the perception a privilege
  // no fighter has: knowing it was hit before it can see the wound.
  if (view.opponent.vitality < history.opponentVitality) history.lastDealtAt = view.clock;
  if (view.self.vitality < history.selfVitality) history.lastReceivedAt = view.clock;
  const values = [clampAction(view.measure / 4, 0, 1), clampAction((offensiveReach + (view.opponent.collisionRadius ?? 0) - view.measure) / 2), closing,
    clampAction(facingError / Math.PI), clampAction(view.self.vitality, 0, 1), clampAction(view.opponent.vitality, 0, 1),
    ...hands(view.self), ...hands(view.opponent), clampAction(threatBearing / Math.PI), clampAction(threat.tipSpeed / SPEED_SCALE, 0, 1),
    ...STRIKER_KINDS.map((kind) => threat.striker === kind ? 1 : 0),
    clampAction(placeRight / FRAME_SCALE), clampAction(placeUp / FRAME_SCALE), clampAction(placeForward / FRAME_SCALE),
    clampAction(motion.right / SPEED_SCALE), clampAction(motion.up / SPEED_SCALE), clampAction(motion.forward / SPEED_SCALE),
    clampAction(threat.timeToClosest / HORIZON_SECONDS, 0, 1), clampAction(threat.closestMiss / 2, 0, 1),
    clampAction(view.self.crouch, 0, 1), clampAction(view.self.trunkLean), clampAction(view.self.trunkTwist),
    clampAction(view.opponent.crouch, 0, 1), clampAction(view.opponent.trunkLean), clampAction(view.opponent.trunkTwist),
    ...bodyShape(view.self), ...bodyShape(view.opponent), ...bite(view.self), ...bite(view.opponent),
    clampAction(view.clock / ACTION_TUNING.boutSeconds, 0, 1), ...MOVEMENT_NAMES.map((name) => history.movement === name ? 1 : 0),
    ...HAND_ACTION_NAMES.map((name) => history.action === name ? 1 : 0), clampAction((view.clock - history.tacticSince) / 0.8, 0, 1),
    age(view.clock, history.lastDealtAt), age(view.clock, history.lastReceivedAt)];
  history.measure = view.measure; history.clock = view.clock;
  history.selfVitality = view.self.vitality; history.opponentVitality = view.opponent.vitality;
  return values;
}

/** Production owner of temporal feature state; one instance belongs to one mind. */
export class FeatureWriter {
  private history: FeatureHistory | undefined;
  private pendingMovement: MovementName = "hold";
  private pendingAction: HandActionName = "recover";
  private pendingSince: number | null = null;
  setTactic(movement: MovementName, action: HandActionName, at: number): void {
    this.pendingMovement = movement; this.pendingAction = action; this.pendingSince = at;
    if (!this.history) return;
    if (this.history.movement !== movement || this.history.action !== action) this.history.tacticSince = at;
    this.history.movement = movement; this.history.action = action;
  }
  write(view: FighterView): number[] {
    if (!this.history) { this.history = initialHistory(view); this.history.movement = this.pendingMovement;
      this.history.action = this.pendingAction; this.history.tacticSince = this.pendingSince ?? view.clock; }
    return writeFeatures(view, this.history);
  }
  reset(): void { this.history = undefined; this.pendingMovement = "hold"; this.pendingAction = "recover"; this.pendingSince = null; }
}

/**
 * The sign table applied to a vector, with the `+ 0` that keeps a mirrored zero
 * a zero.
 *
 * `0 * -1` is `-0`, which equals `0` under `===` and is a *different value* to
 * `Object.is`, `assert.deepStrictEqual` and anything else that compares
 * component-wise. Nothing downstream can tell the two apart -- a network sees
 * one number and `JSON.stringify` writes `0` for both -- but the check that says
 * this table agrees with a separately mirrored world can, and it reported a
 * whole feature vector as wrong over a column that was exactly zero in both.
 * `-0 + 0` is `+0` and every other value is untouched, so this costs one add per
 * column and removes the only way that comparison can lie.
 *
 * It went unseen until v4 because every signed column in v3 happened to be
 * non-zero in the fixture that exercised it, which is the argument for a fixture
 * that drives the columns it is about rather than one that merely reaches them.
 */
export function mirrorFeatures(features: readonly number[]): number[] {
  if (features.length !== FEATURE_COLUMNS.length) throw new Error(`feature mirror expected ${FEATURE_COLUMNS.length} columns, got ${features.length}`);
  return FEATURE_MIRROR_INDEX.map((source, index) => (features[source] as number) * (FEATURE_MIRROR_SIGN[index] as number) + 0);
}

const mirrorBody = (body: BodyView): BodyView => ({ ...body,
  ground: { ...body.ground, x: -body.ground.x } as BodyView["ground"], shoulder: { ...body.shoulder, x: -body.shoulder.x } as BodyView["shoulder"],
  tip: { ...body.tip, x: -body.tip.x } as BodyView["tip"], facing: -body.facing, trunkTwist: -body.trunkTwist,
  hands: Object.fromEntries(Object.entries(body.hands).map(([name, hand]) => [name, { ...hand,
    shoulder: { ...hand.shoulder, x: -hand.shoulder.x }, tip: { ...hand.tip, x: -hand.tip.x },
    tipVelocity: { ...hand.tipVelocity, x: -hand.tipVelocity.x }, outboard: -hand.outboard }])) as BodyView["hands"],
});
/**
 * The mirrored world, built as a world rather than as a sign table.
 *
 * **Every directional field has to be named here.** The two spreads above and
 * below carry anything not named across *by reference and un-negated*, which is
 * silent: `projectiles` was added to the view this session and would have come
 * through the mirror pointing the same way it went in, so the mirrored world
 * would have disagreed with the sign table for a reason that has nothing to do
 * with the sign table. The array is rebuilt explicitly, and so is each shaft's
 * position and velocity.
 */
export function mirrorView(view: FighterView): FighterView {
  return { ...view, self: mirrorBody(view.self), opponent: mirrorBody(view.opponent),
    projectiles: view.projectiles.map((shot) => ({ ...shot,
      position: { ...shot.position, x: -shot.position.x } as FighterView["projectiles"][number]["position"],
      velocity: { ...shot.velocity, x: -shot.velocity.x } as FighterView["projectiles"][number]["velocity"] })) };
}
