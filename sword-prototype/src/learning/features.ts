import { ACTION_TUNING, clampAction } from "../action-primitives.ts";
import { WEAPON_KINDS, isStriking, type WeaponKind } from "../hands.ts";
import type { BodyView, FighterView } from "../mind.ts";

export const FEATURE_VERSION = 2;
const handColumns = (owner: string, hand: string) => [
  ...WEAPON_KINDS.map((kind) => `${owner}_${hand}_kind_${kind}`),
  `${owner}_${hand}_lost`, `${owner}_${hand}_reach`, `${owner}_${hand}_tip_speed`,
];
export const FEATURE_COLUMNS = Object.freeze([
  "measure", "closing_rate", "self_vitality", "opponent_vitality",
  ...handColumns("self", "primary"), ...handColumns("self", "secondary"),
  ...handColumns("opponent", "primary"), ...handColumns("opponent", "secondary"),
  "threat_bearing", "threat_speed", "self_crouch", "self_trunk_lean", "self_trunk_twist", "clock_fraction",
]);
export const FEATURE_MIRROR_SIGN = Object.freeze(FEATURE_COLUMNS.map((name) =>
  name === "threat_bearing" || name === "self_trunk_twist" ? -1 : 1));

export interface FeatureHistory { measure: number; clock: number }
const oneHot = (kind: WeaponKind): number[] => WEAPON_KINDS.map((candidate) => candidate === kind ? 1 : 0);
const hands = (body: BodyView): number[] => (["primary", "secondary"] as const).flatMap((name) => {
  const hand = body.hands[name];
  return [...oneHot(hand.weapon), hand.lost ? 1 : 0, clampAction(hand.reach / 2, 0, 1), clampAction(hand.tipSpeed / 40, 0, 1)];
});

export function writeFeatures(view: FighterView, history?: FeatureHistory): number[] {
  const attached = Object.values(view.opponent.hands).filter((hand) => !hand.lost);
  const dangerous = attached.filter((hand) => isStriking(hand.weapon));
  const threat = (dangerous.length ? dangerous : attached).sort((a, b) => b.tipSpeed - a.tipSpeed)[0]
    ?? view.opponent.hands.primary;
  const dx = threat.tip.x - view.self.shoulder.x; const dz = threat.tip.z - view.self.shoulder.z;
  let bearing = Math.atan2(dx, dz) - view.self.facing;
  while (bearing > Math.PI) bearing -= Math.PI * 2; while (bearing < -Math.PI) bearing += Math.PI * 2;
  const closing = history && view.clock > history.clock ? clampAction((history.measure - view.measure) / (view.clock - history.clock) / ACTION_TUNING.walkSpeed) : 0;
  if (history) { history.measure = view.measure; history.clock = view.clock; }
  const threatSpeed = threat.tipSpeed;
  return [clampAction(view.measure / 4, 0, 1), closing, clampAction(view.self.vitality, 0, 1), clampAction(view.opponent.vitality, 0, 1),
    ...hands(view.self), ...hands(view.opponent), clampAction(bearing / Math.PI), clampAction(threatSpeed / 40, 0, 1),
    clampAction(view.self.crouch, 0, 1), clampAction(view.self.trunkLean), clampAction(view.self.trunkTwist),
    clampAction(view.clock / ACTION_TUNING.boutSeconds, 0, 1)];
}

/** Production owner of closing-rate history; one instance belongs to one mind. */
export class FeatureWriter {
  private history: FeatureHistory | undefined;
  write(view: FighterView): number[] {
    this.history ??= { measure: view.measure, clock: view.clock };
    return writeFeatures(view, this.history);
  }
  reset(): void { this.history = undefined; }
}

const mirrorBody = (body: BodyView): BodyView => ({ ...body,
  ground: { ...body.ground, x: -body.ground.x } as BodyView["ground"], shoulder: { ...body.shoulder, x: -body.shoulder.x } as BodyView["shoulder"],
  tip: { ...body.tip, x: -body.tip.x } as BodyView["tip"], facing: -body.facing, trunkTwist: -body.trunkTwist,
  hands: Object.fromEntries(Object.entries(body.hands).map(([name, hand]) => [name, { ...hand,
    shoulder: { ...hand.shoulder, x: -hand.shoulder.x }, tip: { ...hand.tip, x: -hand.tip.x }, outboard: -hand.outboard }])) as BodyView["hands"],
});
export function mirrorView(view: FighterView): FighterView { return { ...view, self: mirrorBody(view.self), opponent: mirrorBody(view.opponent) }; }
