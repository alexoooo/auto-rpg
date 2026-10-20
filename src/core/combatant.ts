import { buildBody } from "./build/build-body.ts";
import type { AssistCeiling } from "./control/assist.ts";
import type { MindConfig } from "./mind/config.ts";
import { builtAngles, createMind, type Minded, type MindWiring } from "./mind/minds.ts";
import { solidSenses, type SolidSense } from "./mind/object-senses.ts";
import type { Senses, SensesHub } from "./mind/senses.ts";
import { replayedBody, sheetLog, type SheetLog } from "./mind/sheets.ts";
import type { PhysicalBody } from "./physical-body.ts";
import type { Fighter } from "./rules/blows.ts";
import { createPool } from "./rules/pool.ts";
import { balanceCeiling, balancePercent, type Rulebook } from "./rules/rulebook.ts";
import type { BodySpec } from "./spec/body.ts";
import type { Vec3 } from "./spec/quantity.ts";
import type { World } from "./world.ts";
import { cos, sin } from "./math/real.ts";
import { recordingIdentity, requireRecordingIdentity, type RecordingIdentity } from "./recording.ts";

/** **What a fight enlists a body with**: who it is, its body, where it stands, and what drives it. */
interface Enlistment extends Pick<MindWiring, "name" | "orders" | "contactIdentity"> {
  readonly id: string;
  readonly side: string;
  /** Its body, with what it holds (`armedWith`). */
  readonly spec: BodySpec;
  /** Where its root stands, world. */
  readonly at: Vec3;
  /** Initial yaw in world space; zero faces +z. */
  readonly heading?: number;
  readonly rules: Rulebook;
  /** The fight's senses, which carry it (`SensesHub.add`). */
  readonly senses: SensesHub;
  /** Detached collision geometry its senses are granted; a provider refreshes doors or other changing solids. */
  readonly solids?: readonly SolidSense[] | (() => readonly SolidSense[]);
  /** Whether it is out of the fight, asked once a step for what it and the others sense. */
  out(): boolean;
  readonly mind: MindConfig;
  /** Its balance, per cent of its weight, in place of its character's (`AttributeSpec.balance`). */
  readonly balance?: number;
  /** Whether its mind's order sheets are written down (`SheetLog`); not unless asked. */
  readonly record?: boolean;
  /** Order sheets to play in place of its mind (`replayedBody`): its mind is not made. */
  readonly replay?: SheetLog;
  /** The host's immutable content fingerprint and complete fight recipe, required for persisted sheets. */
  readonly recording?: { readonly build: string; readonly context: unknown };
  /** What a per cent of balance is, in place of the rulebook's (`balancePercent`). */
  readonly percent?: AssistCeiling;
}

/** A body in a fight under its mind: what the blows read (`Fighter`), the mind, the config it was made from, and the body it drives. */
export interface Combatant extends Fighter {
  /** Detached perception used by identity-based orders and inspection. */
  senses(): Senses;
  readonly minded: Minded;
  /** The config its mind was made from: what an inspector shows of it (`mindInspector`). */
  readonly mind: MindConfig;
  readonly body: PhysicalBody;
  /** Its order sheets, as written or as played; null unless it was asked to record or replay. */
  readonly sheets: SheetLog | null;
}

/** The complete recording grant can be checked before a body or a world hook is installed. */
export function combatantRecordingIdentity(world: Pick<World, "hz" | "actuation"> & {
  readonly physics: Pick<World["physics"], "engine" | "revision" | "gravity">;
}, enlisting: Pick<Enlistment, "id" | "side" | "spec" | "at" | "heading" | "rules" | "balance" | "percent" | "recording">): RecordingIdentity {
  const { id, side, spec, rules } = enlisting, heading = enlisting.heading ?? 0;
  if (!Number.isFinite(heading)) throw new Error("invalid combatant heading");
  const assist = balanceCeiling(enlisting.balance ?? spec.attributes.balance.value, enlisting.percent ?? balancePercent(rules));
  return recordingIdentity(enlisting.recording?.build ?? "", "muscle-sheets/1", {
    context: enlisting.recording?.context, id, side, at: enlisting.at, heading, assist,
    body: JSON.parse(JSON.stringify(spec, (key, value: unknown) => key === "provenance" ? undefined : value)) as unknown,
    engine: world.physics.engine, revision: world.physics.revision, hz: world.hz, gravity: world.physics.gravity, actuation: world.actuation,
  });
}

/**
 * **One combatant**: its body built where it stands, in the posture its mind holds (`builtAngles`),
 * its pool under the fight's rules, carried by the fight's senses, and under the mind its config
 * makes, with the assist its balance gives, or played from its order sheets with no mind
 * (`replayedBody`). Every fight enlists its bodies here, in this order.
 */
export function enlist(world: World, enlisting: Enlistment): Combatant {
  const { id, side, spec, rules, mind } = enlisting;
  const heading = enlisting.heading ?? 0;
  if (!Number.isFinite(heading)) throw new Error("invalid combatant heading");
  const assist = balanceCeiling(enlisting.balance ?? spec.attributes.balance.value, enlisting.percent ?? balancePercent(rules));
  const identity = enlisting.record || enlisting.replay ? combatantRecordingIdentity(world, enlisting) : null;
  if (enlisting.replay) requireRecordingIdentity(enlisting.replay.identity, identity!);
  const built = buildBody(spec, world, { position: enlisting.at, joints: builtAngles(spec, mind),
    ...(heading ? { rotation: [0, sin(heading / 2), 0, cos(heading / 2)] as const } : {}) });
  const pool = createPool(spec, rules);
  // The mind is made after the senses carry its body; it is asked whether the body is down from the first step.
  let minded: Minded | null = null;
  const sensed = { id, side, built, out: enlisting.out, down: () => minded?.body.down ?? false };
  let source: readonly SolidSense[] | undefined, granted: readonly SolidSense[] | undefined;
  if (enlisting.solids) Object.defineProperty(sensed, "solids", { enumerable: true, get() {
    const current = typeof enlisting.solids === "function" ? enlisting.solids() : enlisting.solids;
    if (current !== source) { source = current; granted = current ? solidSenses(current) : undefined; }
    return granted;
  } });
  const senses = enlisting.senses.add(sensed);
  const sheets = enlisting.replay ?? (enlisting.record ? sheetLog(identity!) : null);
  minded = enlisting.replay ? { kind: "replay", body: replayedBody(built, world, enlisting.replay, { identity: identity!, senses, assist }), state: {} } : createMind(built, world, mind, {
    name: enlisting.name, senses, assist, orders: enlisting.orders,
    ...(enlisting.contactIdentity ? { contactIdentity: enlisting.contactIdentity } : {}),
  }, sheets ?? undefined);
  return { id, side, built, pool, minded, mind, senses, body: minded.body, muscles: minded.body.muscles, sheets };
}
