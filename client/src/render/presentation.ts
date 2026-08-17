import {
  DUNGEON_OBJECT_HALF_X_RAW, DUNGEON_OBJECT_HALF_Y_RAW, DUNGEON_OBJECT_HP_RAW,
  DUNGEON_OBJECT_IDENTITY, DUNGEON_OBJECT_KIND, DUNGEON_OBJECT_MATERIAL_CODE,
  DUNGEON_OBJECT_MAX_HP_RAW, DUNGEON_OBJECT_PROGRESS_RAW, DUNGEON_OBJECT_STATE_FLAGS,
  DUNGEON_OBJECT_STRIDE, DUNGEON_OBJECT_X_RAW, DUNGEON_OBJECT_Y_RAW, DUNGEON_OBJECT_YAW_RAW,
  EVENT_ACTOR_INDEX, EVENT_AMOUNT, EVENT_AUX0, EVENT_AUX1, EVENT_KIND, EVENT_OTHER_INDEX,
  EVENT_STRIDE, EVENT_X, EVENT_Y, FURNITURE_KIND, FURNITURE_STATE, FURNITURE_STRIDE,
  FURNITURE_TX, FURNITURE_TY, HEADER_EVENT_COUNT, HEADER_LEN, HEADER_SHOT_COUNT,
  HEADER_UNIT_COUNT, MAP_TILE_MILLI, RAW_ANGLE_TURN, SHOT_FACTION, SHOT_HEADING_RAW, SHOT_STRIDE,
  SHOT_X, SHOT_Y, UNIT_ACTION_ARC_RAW, UNIT_ACTION_KIND, UNIT_ACTION_LENGTH,
  UNIT_ACTION_ROLE, UNIT_BLOCK_FLASH, UNIT_ENTITY_GENERATION, UNIT_ENTITY_INDEX,
  UNIT_FACING_RAW, UNIT_FACTION, UNIT_HIT_FLASH, UNIT_HP, UNIT_INTENT, UNIT_KIND,
  UNIT_LIMB_ANGLE_RAW, UNIT_LIMB_LINE_RAW, UNIT_LIMB_REACH, UNIT_LIMB_SPIN,
  UNIT_LIMB_SWING, UNIT_LIMB_SWING_LEFT, UNIT_MAX_HP, UNIT_PARRY_FLASH, UNIT_RADIUS,
  UNIT_SIGHT_RANGE, UNIT_SLOT,
  UNIT_SLOT0_ACTION, UNIT_SLOT1_ACTION, UNIT_STRIDE, UNIT_STRIDE_PHASE, UNIT_SWING_SPAN,
  UNIT_VISIBLE, UNIT_VX, UNIT_VY, UNIT_X, UNIT_Y,
} from "../protocol/abi.generated.js";
import type { SnapshotMessage } from "../protocol/messages.js";
import type { SnapshotView } from "../state/snapshot.js";

const TAU = Math.PI * 2;
const frozen = <T extends object>(value: T): Readonly<T> => Object.freeze(value);
const valueAt = (values: ArrayLike<number>, index: number): number => {
  const value = values[index];
  if (value === undefined || !Number.isFinite(value)) throw new RangeError(`missing presentation value ${index}`);
  return value;
};
const angle = (raw: number): number => raw / RAW_ANGLE_TURN * TAU;

export type PresentationUnit = Readonly<{
  key: string; index: number; generation: number;
  x: number; y: number; facing: number; radius: number; hp: number; maxHp: number;
  faction: number; kind: number; intent: number; visible: boolean;
  limbAngle: number; limbReach: number; limbSpin: number; actionLength: number;
  actionArc: number; hitFlash: number; blockFlash: number; parryFlash: number;
  limbSwing: number; limbSwingLeft: number; limbLine: number; actionKind: number;
  actionRole: number; slot: number; slot0Action: number; slot1Action: number;
  sightRange: number; vx: number; vy: number; stridePhase: number; swingSpan: number;
}>;

export type PresentationShot = Readonly<{
  key: string; x: number; y: number; heading: number; faction: number;
}>;

export type PresentationEvent = Readonly<{
  key: string; kind: number; x: number; y: number; amount: number;
  actorIndex: number; otherIndex: number; aux0: number; aux1: number;
}>;

export type PresentationFurniture = Readonly<{
  key: string; kind: number; tx: number; ty: number; state: number;
}>;

export type PresentationDungeonObject = Readonly<{
  key: string; kind: number; identity: number; stateFlags: number;
  x: number; y: number; yawRaw: number; halfX: number; halfY: number;
  hp: number; maxHp: number; progress: number; materialCode: number;
}>;

export type PresentationSnapshot = Readonly<{
  epoch: number; tick: number; mapCols: number; mapRows: number; tileSize: number;
  mapRevision: number; visRevision: number; furnitureRevision: number; dungeonObjectRevision: number;
  map: readonly number[]; vis: readonly number[];
  units: readonly PresentationUnit[]; shots: readonly PresentationShot[];
  events: readonly PresentationEvent[]; furniture: readonly PresentationFurniture[];
  dungeonObjects: readonly PresentationDungeonObject[];
}>;

export type PresentationMetadata = Pick<SnapshotMessage,
  "epoch" | "tick" | "mapCols" | "mapRows" | "mapTileSizeMilli" |
  "mapRevision" | "visRevision" | "furnitureRevision" | "dungeonObjectRevision">;

export function copyPresentationSnapshot(message: PresentationMetadata, view: SnapshotView): PresentationSnapshot {
  const frame = view.frame;
  const unitCount = valueAt(frame, HEADER_UNIT_COUNT);
  const shotCount = valueAt(frame, HEADER_SHOT_COUNT);
  const eventCount = valueAt(frame, HEADER_EVENT_COUNT);
  if (![unitCount, shotCount, eventCount].every(Number.isInteger)) {
    throw new RangeError("presentation frame counts are not integers");
  }

  const units: PresentationUnit[] = [];
  for (let row = 0; row < unitCount; row++) {
    const at = HEADER_LEN + row * UNIT_STRIDE;
    const index = valueAt(frame, at + UNIT_ENTITY_INDEX);
    const generation = valueAt(frame, at + UNIT_ENTITY_GENERATION);
    const visible = valueAt(frame, at + UNIT_VISIBLE);
    if (visible !== 0 && visible !== 1) throw new RangeError(`invalid UNIT_VISIBLE value ${visible}`);
    units.push(frozen({
      key: `${index}:${generation}`, index, generation,
      x: valueAt(frame, at + UNIT_X), y: valueAt(frame, at + UNIT_Y),
      facing: angle(valueAt(frame, at + UNIT_FACING_RAW)), radius: valueAt(frame, at + UNIT_RADIUS),
      hp: valueAt(frame, at + UNIT_HP), maxHp: valueAt(frame, at + UNIT_MAX_HP),
      faction: valueAt(frame, at + UNIT_FACTION), kind: valueAt(frame, at + UNIT_KIND),
      intent: valueAt(frame, at + UNIT_INTENT), visible: visible === 1,
      limbAngle: angle(valueAt(frame, at + UNIT_LIMB_ANGLE_RAW)),
      limbReach: valueAt(frame, at + UNIT_LIMB_REACH), limbSpin: valueAt(frame, at + UNIT_LIMB_SPIN),
      actionLength: valueAt(frame, at + UNIT_ACTION_LENGTH),
      actionArc: angle(valueAt(frame, at + UNIT_ACTION_ARC_RAW)),
      hitFlash: valueAt(frame, at + UNIT_HIT_FLASH), blockFlash: valueAt(frame, at + UNIT_BLOCK_FLASH),
      parryFlash: valueAt(frame, at + UNIT_PARRY_FLASH), limbSwing: valueAt(frame, at + UNIT_LIMB_SWING),
      limbSwingLeft: valueAt(frame, at + UNIT_LIMB_SWING_LEFT),
      limbLine: angle(valueAt(frame, at + UNIT_LIMB_LINE_RAW)),
      actionKind: valueAt(frame, at + UNIT_ACTION_KIND), actionRole: valueAt(frame, at + UNIT_ACTION_ROLE),
      slot: valueAt(frame, at + UNIT_SLOT), slot0Action: valueAt(frame, at + UNIT_SLOT0_ACTION),
      slot1Action: valueAt(frame, at + UNIT_SLOT1_ACTION), sightRange: valueAt(frame, at + UNIT_SIGHT_RANGE),
      vx: valueAt(frame, at + UNIT_VX), vy: valueAt(frame, at + UNIT_VY),
      stridePhase: valueAt(frame, at + UNIT_STRIDE_PHASE), swingSpan: valueAt(frame, at + UNIT_SWING_SPAN),
    }));
  }

  const shots: PresentationShot[] = [];
  const shotBase = HEADER_LEN + unitCount * UNIT_STRIDE;
  for (let row = 0; row < shotCount; row++) {
    const at = shotBase + row * SHOT_STRIDE;
    shots.push(frozen({
      key: `${message.epoch}:${message.tick}:shot:${row}`,
      x: valueAt(frame, at + SHOT_X), y: valueAt(frame, at + SHOT_Y),
      heading: angle(valueAt(frame, at + SHOT_HEADING_RAW)), faction: valueAt(frame, at + SHOT_FACTION),
    }));
  }

  const events: PresentationEvent[] = [];
  const eventBase = shotBase + shotCount * SHOT_STRIDE;
  for (let row = 0; row < eventCount; row++) {
    const at = eventBase + row * EVENT_STRIDE;
    events.push(frozen({
      key: `${message.epoch}:${message.tick}:event:${row}`,
      kind: valueAt(frame, at + EVENT_KIND), x: valueAt(frame, at + EVENT_X),
      y: valueAt(frame, at + EVENT_Y), amount: valueAt(frame, at + EVENT_AMOUNT),
      actorIndex: valueAt(frame, at + EVENT_ACTOR_INDEX), otherIndex: valueAt(frame, at + EVENT_OTHER_INDEX),
      aux0: valueAt(frame, at + EVENT_AUX0), aux1: valueAt(frame, at + EVENT_AUX1),
    }));
  }

  const furniture: PresentationFurniture[] = [];
  for (let row = 0; row * FURNITURE_STRIDE < view.furniture.length; row++) {
    const at = row * FURNITURE_STRIDE;
    const kind = valueAt(view.furniture, at + FURNITURE_KIND);
    const tx = valueAt(view.furniture, at + FURNITURE_TX);
    const ty = valueAt(view.furniture, at + FURNITURE_TY);
    furniture.push(frozen({
      key: `${kind}:${tx}:${ty}`, kind, tx, ty,
      state: valueAt(view.furniture, at + FURNITURE_STATE),
    }));
  }

  const fixed = (word: number): number => (word | 0) / 65536;
  const dungeonObjects: PresentationDungeonObject[] = [];
  for (let row = 0; row * DUNGEON_OBJECT_STRIDE < view.dungeonObjects.length; row++) {
    const at = row * DUNGEON_OBJECT_STRIDE;
    const identity = valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_IDENTITY);
    dungeonObjects.push(frozen({
      key: `object:${identity}`,
      kind: valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_KIND), identity,
      stateFlags: valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_STATE_FLAGS),
      x: fixed(valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_X_RAW)),
      y: fixed(valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_Y_RAW)),
      yawRaw: valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_YAW_RAW),
      halfX: fixed(valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_HALF_X_RAW)),
      halfY: fixed(valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_HALF_Y_RAW)),
      hp: fixed(valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_HP_RAW)),
      maxHp: fixed(valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_MAX_HP_RAW)),
      progress: fixed(valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_PROGRESS_RAW)),
      materialCode: valueAt(view.dungeonObjects, at + DUNGEON_OBJECT_MATERIAL_CODE),
    }));
  }

  return frozen({
    epoch: message.epoch, tick: message.tick, mapCols: message.mapCols, mapRows: message.mapRows,
    tileSize: message.mapTileSizeMilli / MAP_TILE_MILLI,
    mapRevision: message.mapRevision, visRevision: message.visRevision,
    furnitureRevision: message.furnitureRevision,
    dungeonObjectRevision: message.dungeonObjectRevision,
    map: frozen(Array.from(view.map)), vis: frozen(Array.from(view.vis)),
    units: frozen(units), shots: frozen(shots), events: frozen(events), furniture: frozen(furniture),
    dungeonObjects: frozen(dungeonObjects),
  });
}
