import { isStriking } from "../hands.ts";
import type { FighterView } from "../mind.ts";
import { attackOpportunity } from "./engagement.ts";

export const TACTICAL_TEACHER_VERSION = 1;
export interface TacticalLabel { readonly movement: string; readonly action: string; readonly persistence: number }

const incomingThreat = (view: FighterView): boolean => Object.values(view.opponent.hands).some((hand) =>
  !hand.lost && isStriking(hand.weapon) && hand.tipSpeed >= 4);

export function tacticalTeacher(view: FighterView): TacticalLabel {
  const naturalNames = Object.keys(view.self.naturalAttacks ?? {});
  const unknownNatural = naturalNames.find((name) => name !== "bite");
  if (unknownNatural) throw new Error(`tactical teacher does not know natural attack "${unknownNatural}"`);
  const hasHand = Object.values(view.self.hands).some((candidate) => !candidate.lost);
  if (!hasHand && naturalNames.length === 0) throw new Error(`tactical teacher cannot label unit "${view.self.unit}" with no published attack capability`);
  // A fist's published reach already ends at the contact surface. Adding the
  // opponent radius again teaches attacks while the shoulder is still outside
  // its anatomical range -- the exact orbiting label this teacher exists to avoid.
  const opportunities = attackOpportunity(view).filter((row) => row.viable && (row.striker !== "empty" ||
    view.measure <= Math.max(0, ...Object.values(view.self.hands).filter((candidate) => candidate.weapon === "empty" && !candidate.lost)
      .map((candidate) => candidate.reach))));
  const natural = opportunities.find((row) => row.key.startsWith("natural:"));
  const hand = opportunities.find((row) => row.key.startsWith("hand:"));
  const declaredBite = naturalNames.includes("bite");
  const ownReach = Math.max(0, ...Object.values(view.self.hands).filter((candidate) => !candidate.lost)
    .map((candidate) => candidate.reach), ...opportunities.map((row) => view.measure + row.rangeMargin));
  const crowded = view.measure < Math.max(0.28, ownReach * 0.36);
  const movement = crowded ? "disengage" : opportunities.length ? "hold" : "close";
  if (incomingThreat(view)) return Object.freeze({ movement: crowded ? "disengage" : movement,
    action: hasHand ? "cover" : "bite", persistence: 0.24 });
  if (natural) return Object.freeze({ movement, action: natural.key.slice("natural:".length), persistence: 0.40 });
  if (hand) {
    const weapon = hand.striker;
    const action = weapon === "bow" ? "shoot" : weapon === "empty" ? "punch" : "cut";
    return Object.freeze({ movement, action, persistence: action === "shoot" ? 0.70 : 0.42 });
  }
  return Object.freeze({ movement, action: hasHand ? "cover" : declaredBite ? "bite" : "recover", persistence: 0.24 });
}
