import type { FighterView, HandView, Intent } from "./mind.ts";
import type { HandName } from "./hands.ts";

export const ACTION_TUNING = Object.freeze({
  restPointerX: 0,
  restPointerY: -1,
  azimuthMax: 1.30,
  elevationMax: 1.25,
  rollMin: -1.40,
  rollMax: 1.40,
  drawSeconds: 0.90,
  walkSpeed: 2.90,
  boutSeconds: 60,
  arrowSpeed: 48,
  gravity: 9.81,
  // Preserve the operation order of the physical definition without importing
  // mutable CONFIG into this Node-loadable module.
  tunedSwordReach: 0.45 + (0.19 / 2 + 0.84),
  tunedBareReach: 0.45,
  // Nearest-part measure when two ordinary bodies have just enough clearance
  // for a 0.72 m shoulder-to-shoulder punch. Below this they are genuinely
  // body-to-body rather than merely inside the sword's crowding distance.
  tunedBareCrowd: 0.24,
  bareStrikeRange: 0.72,
  duelistRangeSlack: 0.06,
});

export const bareCrowdDistance = (reach: number): number =>
  Math.max(0.18, ACTION_TUNING.tunedBareCrowd + (reach - ACTION_TUNING.tunedBareReach));
export const bareHoldDistance = (): number =>
  ACTION_TUNING.bareStrikeRange - ACTION_TUNING.duelistRangeSlack;

export const ACTION_STROKE_TIMING = Object.freeze({ chamber: 0.15, commit: 0.11, recover: 0.26 });
export type ActionStrokePhase = "chamber" | "commit" | "recover" | "complete";
export interface ActionStrokeReading { phase: ActionStrokePhase; fraction: number }
export function actionStrokeReading(elapsed: number): ActionStrokeReading {
  const chamberEnd = ACTION_STROKE_TIMING.chamber;
  const commitEnd = chamberEnd + ACTION_STROKE_TIMING.commit;
  const recoverEnd = commitEnd + ACTION_STROKE_TIMING.recover;
  if (elapsed < chamberEnd) return { phase: "chamber", fraction: clampAction(elapsed / chamberEnd, 0, 1) };
  if (elapsed < commitEnd) return { phase: "commit", fraction: clampAction((elapsed - chamberEnd) / ACTION_STROKE_TIMING.commit, 0, 1) };
  if (elapsed < recoverEnd) return { phase: "recover", fraction: clampAction((elapsed - commitEnd) / ACTION_STROKE_TIMING.recover, 0, 1) };
  return { phase: "complete", fraction: 1 };
}
export function actionStrokePose(reading: ActionStrokeReading,
  start: ActionAim, chamber: ActionAim, commit: ActionAim, guard: ActionAim): ActionAim {
  if (reading.phase === "chamber") return {
    pointerX: strokePoint(start.pointerX, chamber.pointerX, reading.fraction),
    pointerY: strokePoint(start.pointerY, chamber.pointerY, reading.fraction),
  };
  if (reading.phase === "commit") return {
    pointerX: strokePoint(chamber.pointerX, commit.pointerX, reading.fraction),
    pointerY: strokePoint(chamber.pointerY, commit.pointerY, reading.fraction),
  };
  return {
    pointerX: strokePoint(commit.pointerX, guard.pointerX, reading.fraction),
    pointerY: strokePoint(commit.pointerY, guard.pointerY, reading.fraction),
  };
}

export const ACTION_SHOT_TIMING = Object.freeze({ draw: 0.90, release: 1 / 240, cooldown: 0.30 });
export type ActionShotPhase = "draw" | "release" | "cooldown" | "complete";
export function actionShotPhase(elapsed: number): ActionShotPhase {
  if (elapsed < ACTION_SHOT_TIMING.draw) return "draw";
  if (elapsed < ACTION_SHOT_TIMING.draw + ACTION_SHOT_TIMING.release) return "release";
  if (elapsed < ACTION_SHOT_TIMING.draw + ACTION_SHOT_TIMING.release + ACTION_SHOT_TIMING.cooldown) return "cooldown";
  return "complete";
}

export const clampAction = (value: number, low = -1, high = 1): number =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : 0));

export function actionArrowLift(range: number): number {
  const flight = range / ACTION_TUNING.arrowSpeed;
  return ACTION_TUNING.gravity * flight * flight * 0.5;
}
export const actionArrowTargetY = (shoulderY: number, range: number): number =>
  shoulderY - 0.12 + actionArrowLift(range);

export function actionArcherAim(view: FighterView, hand: HandName, into: ActionAim): ActionAim {
  const range = actionDistance(view.self.shoulder, view.opponent.shoulder);
  return actionAimAt(view, { x: view.opponent.ground.x,
    y: actionArrowTargetY(view.opponent.shoulder.y, range), z: view.opponent.ground.z },
  into, hand, view.self.hands[hand].shoulder);
}

export function freshIntent(): Intent {
  return {
    forward: 0, strafe: 0, turn: 0, zoom: 1, driving: "primary",
    posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
    primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
    secondary: { pointerX: ACTION_TUNING.restPointerX, pointerY: ACTION_TUNING.restPointerY,
      roll: 0, wristBend: 0, thrust: false, guard: false },
  };
}

export type ActionPosture = "idle" | "close" | "cover" | "commit" | "recover" | "draw";

/** Shared body response; callers choose the factual hand they consider the threat. */
export function applyActionPosture(
  view: FighterView,
  action: ActionPosture,
  into: Intent,
  threat: HandView,
): Intent {
  const dx = threat.tip.x - view.self.shoulder.x;
  const dy = threat.tip.y - view.self.shoulder.y;
  const dz = threat.tip.z - view.self.shoulder.z;
  const highThreat = dy > 0.12 && (Math.hypot(dx, dy, dz) < 1.15 || threat.tipSpeed > 8);
  into.posture.trunkLean = 0; into.posture.trunkTwist = 0; into.posture.crouch = 0;
  into.primary.wristBend = 0; into.secondary.wristBend = 0;
  if (action === "cover") {
    into.posture.crouch = highThreat ? 0.58 : 0.22;
    into.posture.trunkLean = highThreat ? -0.32 : -0.10;
    for (const name of ["primary", "secondary"] as const) {
      if (view.self.hands[name].lost) continue;
      into[name].roll = -view.self.hands[name].outboard * 0.35;
      into[name].wristBend = 0.08;
    }
  } else if (action === "commit") {
    into.posture.crouch = 0.12; into.posture.trunkLean = 0.30;
    into.posture.trunkTwist = view.self.hands[into.driving].outboard * 0.68;
    into.primary.wristBend = 0.12; into.secondary.wristBend = 0.12;
  } else if (action === "draw") {
    into.primary.roll = 0; into.secondary.roll = 0;
  } else {
    into.primary.roll = 0; into.secondary.roll = 0;
  }
  return into;
}

export const strokePoint = (from: number, to: number, fraction: number): number =>
  clampAction(from + (to - from) * clampAction(fraction, 0, 1));

export interface ActionPoint { x: number; y: number; z: number }
export const actionDistance = (a: ActionPoint, b: ActionPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export interface ActionAim { pointerX: number; pointerY: number }

/** Shared inverse of the arm's cursor mapping, kept free of mutable runtime config. */
export function actionAimAt(view: FighterView, target: ActionPoint, into: ActionAim,
  hand: HandName, from: ActionPoint = view.self.shoulder): ActionAim {
  const dx = target.x - from.x; const dy = target.y - from.y; const dz = target.z - from.z;
  const cos = Math.cos(view.self.facing); const sin = Math.sin(view.self.facing);
  const localX = dx * cos - dz * sin; const localZ = dx * sin + dz * cos;
  const length = Math.hypot(localX, dy, localZ);
  into.pointerX = clampAction(Math.atan2(localX, localZ) / (localX >= 0
    ? (hand === "primary" ? 1.30 : 1.15) : (hand === "primary" ? 1.15 : 1.30)));
  const angle = length > 1e-6 ? Math.asin(clampAction(dy / length)) : 0;
  into.pointerY = clampAction(angle / (angle >= 0 ? 1.25 : 1.05));
  return into;
}

/** The shared guard target: an extended point, otherwise the opponent's chest. */
export function actionCoverAt(view: FighterView, threat: HandView, into: ActionAim,
  hand: HandName, from: ActionPoint = view.self.hands[hand].shoulder,
  measuredTipGap?: number, measuredBodyGap?: number): ActionAim {
  const tipGap = measuredTipGap ?? Math.hypot(threat.tip.x - view.self.shoulder.x,
    threat.tip.y - view.self.shoulder.y, threat.tip.z - view.self.shoulder.z);
  const bodyGap = measuredBodyGap ?? Math.hypot(view.opponent.shoulder.x - view.self.shoulder.x,
    view.opponent.shoulder.y - view.self.shoulder.y, view.opponent.shoulder.z - view.self.shoulder.z);
  const target = tipGap < bodyGap ? threat.tip : { x: view.opponent.ground.x,
    y: view.opponent.shoulder.y, z: view.opponent.ground.z };
  return actionAimAt(view, target, into, hand, from);
}

const azimuth = (pointer: number, hand: "primary" | "secondary"): number => {
  const min = hand === "primary" ? -1.15 : -1.30;
  const max = hand === "primary" ? 1.30 : 1.15;
  return pointer >= 0 ? pointer * max : pointer * -min;
};
const elevation = (pointer: number): number => pointer >= 0 ? pointer * 1.25 : pointer * 1.05;
export function actionStrokeRoll(fromX: number, fromY: number, toX: number, toY: number,
  bothEdges: boolean, hand: "primary" | "secondary"): number {
  const da = azimuth(toX, hand) - azimuth(fromX, hand);
  const de = elevation(toY) - elevation(fromY);
  const mid = (elevation(toY) + elevation(fromY)) / 2;
  let roll = Math.atan2(-Math.cos(mid) * da, de);
  if (bothEdges) { while (roll > Math.PI / 2) roll -= Math.PI; while (roll < -Math.PI / 2) roll += Math.PI; }
  return clampAction(roll, ACTION_TUNING.rollMin, ACTION_TUNING.rollMax);
}

export function boundIntent(intent: Intent): Intent {
  intent.forward = clampAction(intent.forward); intent.strafe = clampAction(intent.strafe);
  intent.turn = clampAction(intent.turn); intent.zoom = clampAction(intent.zoom, 0.1, 4);
  intent.posture.trunkLean = clampAction(intent.posture.trunkLean);
  intent.posture.trunkTwist = clampAction(intent.posture.trunkTwist);
  intent.posture.crouch = clampAction(intent.posture.crouch, 0, 1);
  for (const name of ["primary", "secondary"] as const) {
    const hand = intent[name];
    hand.pointerX = clampAction(hand.pointerX); hand.pointerY = clampAction(hand.pointerY);
    hand.roll = clampAction(hand.roll, ACTION_TUNING.rollMin, ACTION_TUNING.rollMax);
    hand.wristBend = clampAction(hand.wristBend, 0, 1);
  }
  return intent;
}
