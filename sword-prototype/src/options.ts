import { cutsBothWays, hasHeldWeapon, hasPoint, isShooting, isStriking, otherHand, type HandName, type Striker, type WeaponKind } from "./hands.ts";
import { ACTION_STROKE_TIMING, ACTION_TUNING, actionAimAt, actionArcherAim, actionCoverAt, actionDistance, actionShotPhase,
  actionStrokePose, actionStrokeReading, actionStrokeRoll, applyActionPosture, boundIntent, clampAction,
  freshIntent } from "./action-primitives.ts";
import type { FighterView, Intent, Mind } from "./mind.ts";

export type OptionName = "close" | "disengage" | "cover" | "cut" | "thrust" | "punch" | "shoot" | "recover";
export const OPTION_NAMES: readonly OptionName[] = Object.freeze(["close", "disengage", "cover", "cut", "thrust", "punch", "shoot", "recover"]);
export const ATTACK_OPTION_NAMES: readonly OptionName[] = Object.freeze(["cut", "thrust", "punch", "shoot"]);
export interface CombatOption { readonly name: OptionName; enter(view: FighterView): void; decide(view: FighterView, dt: number): Intent; done(view: FighterView): boolean }
const knownOption = (value: string): value is OptionName => (OPTION_NAMES as readonly string[]).includes(value);
const gap = (view: FighterView): number => actionDistance(view.self.shoulder, view.opponent.shoulder);
const threat = (view: FighterView) => {
  const { primary, secondary } = view.opponent.hands;
  const lead = !primary.lost && isStriking(primary.weapon);
  const off = !secondary.lost && isStriking(secondary.weapon);
  if (lead && off) return primary.tipSpeed >= secondary.tipSpeed ? primary : secondary;
  if (lead) return primary;
  if (off) return secondary;
  return primary.lost ? secondary : primary;
};
const handFor = (view: FighterView, accepts: (kind: WeaponKind) => boolean): HandName | null => {
  for (const name of ["primary", "secondary"] as const) if (!view.self.hands[name].lost && accepts(view.self.hands[name].weapon)) return name;
  return null;
};
const refuse = (name: OptionName, need: string): never => { throw new Error(`option "${name}" requires ${need}`); };
const turnToward = (view: FighterView): number => {
  const dx = view.opponent.ground.x - view.self.ground.x; const dz = view.opponent.ground.z - view.self.ground.z;
  let delta = Math.atan2(dx, dz) - view.self.facing;
  while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
  return clampAction(delta * 2.4);
};
const aimAt = (view: FighterView, intent: Intent, name: HandName, y = view.opponent.shoulder.y): void => {
  actionAimAt(view, { x: view.opponent.ground.x, y, z: view.opponent.ground.z }, intent[name], name,
    view.self.hands[name].shoulder);
};

/** Each option owns a short skill and has no authority below Intent. */
export function combatOption(requested: OptionName | string, preferred: HandName = "primary",
  start?: Readonly<{ pointerX: number; pointerY: number }>, initialShotRest = 0): CombatOption {
  if (!knownOption(requested)) throw new Error(`unknown option "${requested}" -- known options are ${OPTION_NAMES.join(", ")}`);
  const name = requested; const intent = freshIntent(); let started = 0; let elapsed = 0; let hand: HandName = "primary";
  let startX = 0; let startY = 0; let fromX = 0; let fromY = 0; let toX = 0; let toY = 0; let strokeRoll = 0;
  let strokePhase: "chamber" | "commit" | "recover" | "complete" = "chamber";
  let strokeElapsed = 0; let strokeEntry = true;
  let shotRest = Math.max(0, initialShotRest); let shotDrawn = -1; let shotReleasing = false; let shotComplete = false;
  const requireHand = (view: FighterView): void => {
    const accepts = name === "shoot" ? isShooting : name === "punch" ? (k: WeaponKind) => k === "empty"
      : name === "thrust" ? hasPoint : name === "cut" ? (k: WeaponKind) => isStriking(k) && k !== "empty" : () => true;
    const found = [preferred, otherHand(preferred)].find((candidate) =>
      !view.self.hands[candidate].lost && accepts(view.self.hands[candidate].weapon)) ?? null;
    if (found === null) {
      if (name === "shoot") refuse(name, "a bow"); if (name === "punch") refuse(name, "an empty hand");
      if (name === "thrust") refuse(name, "a pointed weapon"); if (name === "cut") refuse(name, "a held striking weapon");
      refuse(name, "an attached hand");
    }
    hand = found as HandName;
  };
  const reset = (): void => {
    const clean = freshIntent();
    intent.forward = clean.forward; intent.strafe = clean.strafe; intent.turn = clean.turn; intent.zoom = clean.zoom;
    intent.driving = hand; Object.assign(intent.posture, clean.posture);
    Object.assign(intent.primary, clean.primary); Object.assign(intent.secondary, clean.secondary);
  };
  return {
    name,
    enter(view) {
      requireHand(view); started = view.clock; elapsed = 0; strokePhase = "chamber"; strokeElapsed = 0; strokeEntry = true;
      shotDrawn = -1; shotReleasing = false; shotComplete = false;
      reset(); aimAt(view, intent, hand, view.opponent.shoulder.y + 0.20);
      startX = start?.pointerX ?? 0; startY = start?.pointerY ?? 0;
      fromX = clampAction(intent[hand].pointerX + 0.62 * view.self.hands[hand].outboard); fromY = clampAction(intent[hand].pointerY + 0.50);
      toX = clampAction(intent[hand].pointerX - 0.62 * view.self.hands[hand].outboard); toY = clampAction(intent[hand].pointerY - 0.50);
      strokeRoll = actionStrokeRoll(fromX, fromY, toX, toY, cutsBothWays(view.self.hands[hand].weapon), hand);
    },
    decide(view, dt) {
      elapsed += Math.max(0, dt); reset(); intent.turn = turnToward(view); const h = intent[hand];
      let actionPosture: "cover" | "commit" | "recover" | "draw" | "close" = "close";
      if (name === "close") intent.forward = 1;
      else if (name === "disengage") intent.forward = -0.8;
      else if (name === "cover") {
        actionCoverAt(view, threat(view), h, hand); h.guard = true;
      } else if (name === "cut" || name === "punch") {
        if (!strokeEntry) strokeElapsed += Math.max(0, dt);
        const offset = strokePhase === "commit" ? ACTION_STROKE_TIMING.chamber
          : strokePhase === "recover" ? ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit : 0;
        const stroke = actionStrokeReading(offset + strokeElapsed); h.roll = strokeRoll;
        const guard = { pointerX: 0, pointerY: 0 }; actionCoverAt(view, threat(view), guard, hand);
        if (strokeEntry) { startX = guard.pointerX; startY = guard.pointerY; }
        const reading = strokeEntry ? { phase: "chamber" as const, fraction: 0 }
          : { phase: strokePhase === "complete" ? "recover" as const : strokePhase,
              fraction: stroke.phase === strokePhase ? stroke.fraction : 1 };
        const pose = actionStrokePose(reading, { pointerX: startX, pointerY: startY },
          { pointerX: fromX, pointerY: fromY }, { pointerX: toX, pointerY: toY }, guard);
        h.pointerX = pose.pointerX; h.pointerY = pose.pointerY;
        if (strokeEntry) {
          h.guard = true;
        } else if (strokePhase === "chamber") {
          intent.forward = 0.35;
        } else if (strokePhase === "commit") {
          h.thrust = name === "punch"; intent.forward = 0.2;
        } else {
          h.guard = true;
        }
        actionPosture = strokeEntry ? "cover" : strokePhase === "recover" || strokePhase === "complete" ? "recover" : "commit";
        if (strokeEntry) {
          h.roll = strokeRoll; h.wristBend = 0.12; strokeEntry = false;
        } else if (stroke.phase !== strokePhase || stroke.fraction >= 1) {
          strokePhase = strokePhase === "chamber" ? "commit" : strokePhase === "commit" ? "recover" : "complete";
          strokeElapsed = 0;
        }
      } else if (name === "thrust") { aimAt(view, intent, hand); h.thrust = true; intent.forward = 0.2; }
      else if (name === "shoot") { const d = gap(view);
        const wasDrawing = shotDrawn >= 0;
        actionArcherAim(view, hand, intent[hand]);
        intent.forward = d < 3.2 ? -1 : d > 6 ? 1 : 0;
        if (shotReleasing) { shotReleasing = false; shotDrawn = -1; shotComplete = true; h.thrust = false; }
        else if (shotRest > 0) { shotRest -= Math.max(0, dt); h.thrust = false; }
        else {
          const bearing = Math.atan2(view.opponent.ground.x - view.self.ground.x,
            view.opponent.ground.z - view.self.ground.z);
          let delta = bearing - view.self.facing;
          while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) < 0.15) {
            shotDrawn = shotDrawn < 0 ? 0 : shotDrawn + Math.max(0, dt);
            if (actionShotPhase(shotDrawn) !== "draw") { shotReleasing = true; h.thrust = false; }
            else h.thrust = true;
          } else h.thrust = shotDrawn >= 0;
        }
        actionPosture = wasDrawing ? "draw" : d < 3.2 ? "cover" : "close";
      }
      else if (name === "recover") { aimAt(view, intent, hand); h.guard = true; }
      if (name === "cover" || name === "cut" || name === "punch" || name === "recover") {
        const spare = hand === "primary" ? "secondary" : "primary";
        if (!view.self.hands[spare].lost) {
          actionCoverAt(view, threat(view), intent[spare], spare);
          intent[spare].guard = true;
        }
      }
      if (name === "cover") actionPosture = "cover";
      else if (name === "thrust") actionPosture = "commit"; else if (name === "recover") actionPosture = "recover";
      applyActionPosture(view, actionPosture, intent, threat(view));
      if ((name === "cut" || name === "punch") && actionPosture === "cover") {
        intent[hand].roll = strokeRoll; intent[hand].wristBend = 0.12;
      }
      if (name === "shoot") {
        intent[hand].roll = 0; intent[hand].wristBend = 0; intent[hand].guard = false;
        const spare = otherHand(hand);
        if (!view.self.hands[spare].lost && view.self.hands[spare].weapon === "empty") {
          intent[spare].pointerX = ACTION_TUNING.restPointerX;
          intent[spare].pointerY = ACTION_TUNING.restPointerY;
          intent[spare].roll = 0; intent[spare].wristBend = 0;
          intent[spare].thrust = false; intent[spare].guard = false;
        }
      }
      // Legacy plans the spare hand after the body response. In particular, an
      // empty covering fist spends neither roll nor bend on the driving hand's
      // posture; preserving that order is observable in every hold frame.
      const spare = hand === "primary" ? "secondary" : "primary";
      if ((name === "cover" || name === "cut" || name === "punch" || name === "recover") &&
          !view.self.hands[spare].lost && view.self.hands[spare].weapon === "empty") {
        actionCoverAt(view, threat(view), intent[spare], spare);
        intent[spare].roll = 0; intent[spare].wristBend = 0.08; intent[spare].guard = true;
      }
      return boundIntent(intent);
    },
    done(view) {
      if (view.self.hands[hand].lost) return true;
      const age = Math.max(elapsed, view.clock - started);
      if (name === "close") return gap(view) <= view.self.hands[hand].reach + 0.12;
      if (name === "disengage") return gap(view) >= Math.max(0.9, view.self.hands[hand].reach - 0.05);
      if (name === "cover") return age >= 0.30; if (name === "shoot") return shotComplete;
      if (name === "cut" || name === "punch") return strokePhase === "complete"; return age >= (name === "recover" ? 0.26 : 0.18);
    },
  };
}

export type ScriptedKind = "duelist" | "archer";
export interface ScriptedMetaMind extends Mind { readonly selected: OptionName; readonly entries: Readonly<Record<OptionName, number>> }
export function scriptedMetaMind(kind: ScriptedKind, seed = 0): ScriptedMetaMind {
  let state = seed >>> 0; const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0; let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  let current: CombatOption | null = null; let selected: OptionName = "recover"; let prefer: HandName = "primary";
  let previousIntent: Intent | null = null; let chosenHand: HandName = "primary";
  let attackFinished = false;
  let quiet = 0; let cooldown = 0; let sinceOpening = 0; let patience = 2.40;
  let circle = 1; let circleLeft = 1.2; let gapRate = 0; let lastGap = -1; let openingNow = false;
  if (kind === "archer") quiet = random() * 0.30;
  else {
    cooldown = 0.30 + random() * 0.80; sinceOpening = random() * 2.40;
    patience = 2.40 * (0.80 + random() * 0.40);
    circle = random() < 0.5 ? -1 : 1; circleLeft = 1.2 + random();
  }
  const entries = Object.fromEntries(OPTION_NAMES.map((n) => [n, 0])) as Record<OptionName, number>;
  const selectAttackHand = (view: FighterView): HandName => {
    const spare = otherHand(prefer); const able = (hand: HandName) =>
      !view.self.hands[hand].lost && isStriking(view.self.hands[hand].weapon);
    const steel = (hand: HandName) => able(hand) && hasHeldWeapon(view.self.hands[hand].weapon);
    if (steel(prefer)) return prefer; if (steel(spare)) return spare;
    if (able(prefer) && able(spare)) {
      const seen = threat(view).tip; const gap2 = (hand: HandName) => {
        const tip = view.self.hands[hand].tip; return (tip.x - seen.x) ** 2 + (tip.y - seen.y) ** 2 + (tip.z - seen.z) ** 2;
      };
      return gap2(prefer) >= gap2(spare) ? prefer : spare;
    }
    if (able(prefer)) return prefer; if (able(spare)) return spare;
    return view.self.hands[prefer].lost && !view.self.hands[spare].lost ? spare : prefer;
  };
  const choose = (view: FighterView): OptionName => {
    const distance = gap(view);
    if (kind === "archer") return handFor(view, isShooting) ? "shoot" : distance < 3.2 ? "disengage" : "cover";
    const attack = selectAttackHand(view); chosenHand = attack;
    if (view.self.hands[attack].lost || !isStriking(view.self.hands[attack].weapon)) return "cover";
    const bare = view.self.hands[attack].weapon === "empty";
    const strike = bare ? 0.72 : 1.48 + (view.self.hands[attack].reach - ACTION_TUNING.tunedSwordReach);
    return cooldown <= 0 && distance <= strike && (openingNow || sinceOpening > patience)
      ? bare ? "punch" : "cut" : "cover";
  };
  return { name: `scripted-meta-${kind}`, get selected() { return selected; }, entries,
    decide(view, dt) {
      const step = Math.max(0, dt);
      // A fighter can lose both arms without satisfying the bout's death rule.
      // There is then no legal option object to enter -- even recover needs a
      // hand to pose -- so remain inert just as the learned and random meta
      // controllers do at the same terminal capability boundary.
      if (!Object.values(view.self.hands).some((candidate) => !candidate.lost)) {
        current = null; selected = "recover"; previousIntent = freshIntent();
        return previousIntent;
      }
      if (kind === "duelist") {
        const seen = threat(view); const tipGap = Math.hypot(seen.tip.x - view.self.shoulder.x,
          seen.tip.y - view.self.shoulder.y, seen.tip.z - view.self.shoulder.z);
        if (lastGap >= 0 && step > 0) { const rate = (tipGap - lastGap) / step;
          gapRate += (rate - gapRate) * (1 - Math.exp(-12 * step)); }
        lastGap = tipGap;
        const blade = { x: seen.tip.x - seen.shoulder.x, y: seen.tip.y - seen.shoulder.y, z: seen.tip.z - seen.shoulder.z };
        const toward = { x: view.self.shoulder.x - view.opponent.shoulder.x,
          y: view.self.shoulder.y - view.opponent.shoulder.y, z: view.self.shoulder.z - view.opponent.shoulder.z };
        const inLine = (blade.x * toward.x + blade.y * toward.y + blade.z * toward.z) /
          ((Math.hypot(blade.x, blade.y, blade.z) || 1) * (Math.hypot(toward.x, toward.y, toward.z) || 1));
        openingNow = inLine < 0.30 || (seen.tipSpeed > 5 && gapRate > 0.6);
        sinceOpening = openingNow ? 0 : sinceOpening + step; cooldown -= step;
        circleLeft -= step; if (circleLeft <= 0) { circle = -circle; circleLeft = 1.2 + random(); }
      }
      const candidate = kind === "duelist" ? choose(view) : null;
      const interruptCover = current?.name === "cover" && candidate !== "cover";
      if (!current || current.done(view) || interruptCover) {
        selected = candidate ?? choose(view);
        if (kind === "duelist" && ["cut", "punch", "thrust"].includes(selected)) {
          patience = 2.40 * (0.80 + random() * 0.40); sinceOpening = 0;
        }
        current = combatOption(selected, chosenHand, previousIntent?.[chosenHand],
          kind === "archer" && selected === "shoot" ? quiet : 0);
        if (kind === "archer" && selected === "shoot") quiet = 0.30;
        current.enter(view);
        attackFinished = false; entries[selected] += 1;
      }
      const intent = current.decide(view, dt);
      if (kind === "duelist") {
        const attacker = intent.driving; const reach = view.self.hands[attacker].reach;
        const bare = view.self.hands[attacker].weapon === "empty";
        const hold = bare ? 0.78 : 1.40 + (reach - ACTION_TUNING.tunedSwordReach); const distance = gap(view);
        const feet = view.measure < 0.85 ? -0.8 : distance > hold + 0.06
          ? clampAction((distance - hold) * 1.6, 0, 1) : distance < hold - 0.06
            ? clampAction((distance - hold) * 1.6, -1, 0) : 0;
        intent.forward = intent.forward > 0 ? Math.max(feet, intent.forward) : feet;
        intent.strafe = circle * 0.55;
      }
      if (kind === "duelist" && !attackFinished && ["cut", "punch", "thrust"].includes(current.name) && current.done(view)) {
        cooldown = 0.30; prefer = otherHand(prefer); attackFinished = true;
      }
      previousIntent = intent;
      return boundIntent(intent);
    },
  };
}

export interface CombatEvent { hand: HandName; weapon: Striker; damage: number; blocked: boolean }
export interface BehaviourRecord {
  rangeBins: [number, number, number, number]; options: Record<OptionName, number>; transitions: Record<string, number>;
  attackAttempts: Record<OptionName, number>; contacts: Record<HandName, number>; contactsByKind: Partial<Record<Striker, number>>;
  blocks: number; crouchTime: number; trunkTwistSignChanges: number; damage: number; vitality: number; win: boolean; seconds: number;
}
export function behaviourRecord(): BehaviourRecord {
  return { rangeBins: [0, 0, 0, 0], options: Object.fromEntries(OPTION_NAMES.map((n) => [n, 0])) as Record<OptionName, number>, transitions: {},
    attackAttempts: Object.fromEntries(OPTION_NAMES.map((n) => [n, 0])) as Record<OptionName, number>, contacts: { primary: 0, secondary: 0 }, contactsByKind: {},
    blocks: 0, crouchTime: 0, trunkTwistSignChanges: 0, damage: 0, vitality: 1, win: false, seconds: 0 };
}
export function recordCombatEvent(record: BehaviourRecord, event: CombatEvent): void {
  record.contacts[event.hand] += 1; record.contactsByKind[event.weapon] = (record.contactsByKind[event.weapon] ?? 0) + 1;
  record.damage += event.damage; if (event.blocked) record.blocks += 1;
}
export function recordBehaviourSample(record: BehaviourRecord, view: FighterView, option: OptionName | null, dt: number, previous: { option?: OptionName | null; twistSign?: number }): void {
  const bin = view.measure < 0.7 ? 0 : view.measure < 1.2 ? 1 : view.measure < 1.8 ? 2 : 3; record.rangeBins[bin] += dt;
  if (option) record.options[option] += dt;
  if (option && previous.option !== option && ATTACK_OPTION_NAMES.includes(option)) record.attackAttempts[option] += 1;
  if (option && previous.option && previous.option !== option) { const key = `${previous.option}->${option}`; record.transitions[key] = (record.transitions[key] ?? 0) + 1; }
  const sign = Math.sign(view.self.trunkTwist); if (previous.twistSign && sign && previous.twistSign !== sign) record.trunkTwistSignChanges += 1;
  previous.option = option; if (sign) previous.twistSign = sign; record.crouchTime += view.self.crouch * dt; record.vitality = view.self.vitality; record.seconds += dt;
}
