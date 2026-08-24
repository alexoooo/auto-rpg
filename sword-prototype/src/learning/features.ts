import { ACTION_TUNING, clampAction } from "../action-primitives.ts";
import { WEAPON_KINDS, isStriking, type WeaponKind } from "../hands.ts";
import type { BodyView, FighterView } from "../mind.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, type HandActionName, type MovementName } from "../options.ts";

export const FEATURE_VERSION = 3;
const handColumns = (owner: string, hand: string) => [
  ...WEAPON_KINDS.map((kind) => `${owner}_${hand}_kind_${kind}`), `${owner}_${hand}_lost`, `${owner}_${hand}_reach`, `${owner}_${hand}_tip_speed`,
];
export const FEATURE_COLUMNS = Object.freeze([
  "measure", "usable_reach_margin", "radial_closing_rate", "facing_error", "self_vitality", "opponent_vitality",
  ...handColumns("self", "primary"), ...handColumns("self", "secondary"), ...handColumns("opponent", "primary"), ...handColumns("opponent", "secondary"),
  "threat_bearing", "threat_speed", "self_crouch", "self_trunk_lean", "self_trunk_twist", "clock_fraction",
  ...MOVEMENT_NAMES.map((name) => `current_movement_${name}`), ...HAND_ACTION_NAMES.map((name) => `current_action_${name}`),
  "persistence_age", "time_since_damage",
]);
export const FEATURE_MIRROR_SIGN = Object.freeze(FEATURE_COLUMNS.map((name) =>
  name === "facing_error" || name === "threat_bearing" || name === "self_trunk_twist" ? -1 : 1));
export const FEATURE_MIRROR_INDEX = Object.freeze(FEATURE_COLUMNS.map((name) => {
  if (name === "current_movement_circle-left") return FEATURE_COLUMNS.indexOf("current_movement_circle-right");
  if (name === "current_movement_circle-right") return FEATURE_COLUMNS.indexOf("current_movement_circle-left");
  return FEATURE_COLUMNS.indexOf(name);
}));

export interface FeatureHistory {
  measure: number; clock: number; movement: MovementName; action: HandActionName; tacticSince: number;
  lastDamageAt: number; opponentVitality: number;
}
const oneHot = (kind: WeaponKind): number[] => WEAPON_KINDS.map((candidate) => candidate === kind ? 1 : 0);
const hands = (body: BodyView): number[] => (["primary", "secondary"] as const).flatMap((name) => {
  const hand = body.hands[name];
  if (!hand) return [...oneHot("empty"), 1, 0, 0];
  return [...oneHot(hand.weapon), hand.lost ? 1 : 0, clampAction(hand.reach / 2, 0, 1), clampAction(hand.tipSpeed / 40, 0, 1)];
});
const relativeAngle = (x: number, z: number, facing: number): number => {
  let result = Math.atan2(x, z) - facing;
  while (result > Math.PI) result -= Math.PI * 2; while (result < -Math.PI) result += Math.PI * 2;
  return result;
};
const age = (clock: number, since: number): number => since < 0 ? 1 : clampAction((clock - since) / 3, 0, 1);
const initialHistory = (view: FighterView): FeatureHistory => ({ measure: view.measure, clock: view.clock, movement: "hold", action: "recover",
  tacticSince: view.clock, lastDamageAt: -1, opponentVitality: view.opponent.vitality });

export function writeFeatures(view: FighterView, supplied?: FeatureHistory): number[] {
  const history = supplied ?? initialHistory(view);
  const attached = Object.values(view.opponent.hands).filter((hand) => !hand.lost);
  const dangerous = attached.filter((hand) => isStriking(hand.weapon));
  const threat = (dangerous.length ? dangerous : attached).sort((a, b) => b.tipSpeed - a.tipSpeed)[0];
  const threatTip = threat?.tip ?? view.opponent.tip;
  const threatBearing = relativeAngle(threatTip.x - view.self.shoulder.x, threatTip.z - view.self.shoulder.z, view.self.facing);
  const facingError = relativeAngle(view.opponent.ground.x - view.self.ground.x, view.opponent.ground.z - view.self.ground.z, view.self.facing);
  const closing = view.clock > history.clock ? clampAction((history.measure - view.measure) / (view.clock - history.clock) / ACTION_TUNING.walkSpeed) : 0;
  const offensiveReach = Math.max(0,
    ...Object.values(view.self.hands).filter((hand) => !hand.lost && isStriking(hand.weapon)).map((hand) => hand.reach),
    ...Object.values(view.self.naturalAttacks ?? {}).map((attack) => attack.reach));
  if (view.opponent.vitality < history.opponentVitality) history.lastDamageAt = view.clock;
  const values = [clampAction(view.measure / 4, 0, 1), clampAction((offensiveReach + (view.opponent.collisionRadius ?? 0) - view.measure) / 2), closing,
    clampAction(facingError / Math.PI), clampAction(view.self.vitality, 0, 1), clampAction(view.opponent.vitality, 0, 1),
    ...hands(view.self), ...hands(view.opponent), clampAction(threatBearing / Math.PI), clampAction((threat?.tipSpeed ?? view.opponent.tipSpeed) / 40, 0, 1),
    clampAction(view.self.crouch, 0, 1), clampAction(view.self.trunkLean), clampAction(view.self.trunkTwist),
    clampAction(view.clock / ACTION_TUNING.boutSeconds, 0, 1), ...MOVEMENT_NAMES.map((name) => history.movement === name ? 1 : 0),
    ...HAND_ACTION_NAMES.map((name) => history.action === name ? 1 : 0), clampAction((view.clock - history.tacticSince) / 0.8, 0, 1),
    age(view.clock, history.lastDamageAt)];
  history.measure = view.measure; history.clock = view.clock; history.opponentVitality = view.opponent.vitality;
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

export function mirrorFeatures(features: readonly number[]): number[] {
  if (features.length !== FEATURE_COLUMNS.length) throw new Error(`feature mirror expected ${FEATURE_COLUMNS.length} columns, got ${features.length}`);
  return FEATURE_MIRROR_INDEX.map((source, index) => (features[source] as number) * (FEATURE_MIRROR_SIGN[index] as number));
}

const mirrorBody = (body: BodyView): BodyView => ({ ...body,
  ground: { ...body.ground, x: -body.ground.x } as BodyView["ground"], shoulder: { ...body.shoulder, x: -body.shoulder.x } as BodyView["shoulder"],
  tip: { ...body.tip, x: -body.tip.x } as BodyView["tip"], facing: -body.facing, trunkTwist: -body.trunkTwist,
  hands: Object.fromEntries(Object.entries(body.hands).map(([name, hand]) => [name, { ...hand,
    shoulder: { ...hand.shoulder, x: -hand.shoulder.x }, tip: { ...hand.tip, x: -hand.tip.x }, outboard: -hand.outboard }])) as BodyView["hands"],
});
export function mirrorView(view: FighterView): FighterView { return { ...view, self: mirrorBody(view.self), opponent: mirrorBody(view.opponent) }; }
