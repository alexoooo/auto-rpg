import { canonicalControlJson } from "./actions.ts";
import { canonicalBlueprintJson } from "./canonical.ts";
import type { SavedConstruct } from "./codec.ts";
import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "./integrity.ts";
import { canonicalProgramJson } from "./program.ts";

export const CONSTRUCT_MATCHUP_VERSION = 2 as const;

export interface ConstructInitialCondition {
  readonly lateralOffsetM: number;
  readonly separationOffsetM: number;
  readonly yawOffsetRad: number;
}

export interface ConstructSideIdentity {
  readonly faction: "left" | "right";
  readonly blueprintDigest: string;
  readonly controlDigest: string;
  readonly programDigest: string;
}

export interface ConstructMatchupIdentity {
  readonly version: 2;
  readonly left: ConstructSideIdentity;
  readonly right: ConstructSideIdentity;
  readonly mirrored: boolean;
  readonly seed: number;
  readonly arenaDigest: string;
  readonly configDigest: string;
  readonly boutCapSteps: number;
  readonly initialCondition: ConstructInitialCondition;
}

export interface ConstructBoutJob {
  readonly index: number;
  readonly matchup: ConstructMatchupIdentity;
  readonly matchupDigest: string;
  /** Canonical saved bytes, never a path interpreted by a worker. */
  readonly leftSavedJson: string;
  readonly rightSavedJson: string;
}

const digest = (value: string, field: string): string => {
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/i.test(value)) {
    throw new Error(`construct matchup field "${field}" must be a stable digest`);
  }
  return value;
};

const sideIdentity = (saved: SavedConstruct, faction: "left" | "right"): ConstructSideIdentity => Object.freeze({
  faction,
  blueprintDigest: digest(saved.digests.blueprint, `${faction}.blueprintDigest`),
  controlDigest: digest(saved.digests.control, `${faction}.controlDigest`),
  programDigest: digest(saved.digests.program, `${faction}.programDigest`),
});

const mixed = (seed: number, salt: number): number => {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
};
const signedUnit = (seed: number, salt: number): number => mixed(seed, salt) / 0xffff_ffff * 2 - 1;

/** Bounded, stateless initial-condition variation; mirroring reflects lateral and yaw signs. */
export function constructInitialCondition(seed: number, mirrored: boolean): ConstructInitialCondition {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("construct initial-condition seed must be an unsigned 32-bit integer");
  }
  const mirror = mirrored ? -1 : 1;
  return Object.freeze({
    lateralOffsetM: signedUnit(seed, 0x51ed270b) * 0.12 * mirror,
    separationOffsetM: signedUnit(seed, 0x9e3779b9) * 0.16,
    yawOffsetRad: signedUnit(seed, 0x85ebca6b) * 0.045 * mirror,
  });
}

export function validateConstructMatchup(value: ConstructMatchupIdentity): ConstructMatchupIdentity {
  if (value.version !== CONSTRUCT_MATCHUP_VERSION) {
    throw new Error(`construct matchup version ${JSON.stringify(value.version)} is unsupported`);
  }
  if (value.left.faction !== "left" || value.right.faction !== "right") {
    throw new Error("construct matchup factions must be left then right");
  }
  for (const [name, side] of [["left", value.left], ["right", value.right]] as const) {
    digest(side.blueprintDigest, `${name}.blueprintDigest`);
    digest(side.controlDigest, `${name}.controlDigest`);
    digest(side.programDigest, `${name}.programDigest`);
  }
  digest(value.arenaDigest, "arenaDigest");
  digest(value.configDigest, "configDigest");
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) {
    throw new Error("construct matchup seed must be an unsigned 32-bit integer");
  }
  if (!Number.isSafeInteger(value.boutCapSteps) || value.boutCapSteps <= 0) {
    throw new Error("construct matchup boutCapSteps must be a positive safe integer");
  }
  if (typeof value.mirrored !== "boolean") throw new Error("construct matchup mirrored must be boolean");
  const expected = constructInitialCondition(value.seed, value.mirrored);
  for (const field of ["lateralOffsetM", "separationOffsetM", "yawOffsetRad"] as const) {
    if (!Number.isFinite(value.initialCondition?.[field]) || value.initialCondition[field] !== expected[field]) {
      throw new Error(`construct matchup initialCondition.${field} does not match its seed/mirror contract`);
    }
  }
  return value;
}

export function canonicalConstructMatchupJson(value: ConstructMatchupIdentity): string {
  validateConstructMatchup(value);
  return canonicalIntegrityJson(value as unknown as IntegrityValue);
}

export const constructMatchupDigest = (value: ConstructMatchupIdentity): string =>
  integrityDigest(canonicalConstructMatchupJson(value));

/** Saved bytes are rebuilt from each layer's own canonical contract. */
export function canonicalSavedConstructJson(saved: SavedConstruct): string {
  const canonical = {
    blueprint: JSON.parse(canonicalBlueprintJson(saved.blueprint)) as IntegrityValue,
    control: JSON.parse(canonicalControlJson(saved.control)) as IntegrityValue,
    digests: saved.digests,
    name: saved.name,
    program: JSON.parse(canonicalProgramJson(saved.program)) as IntegrityValue,
    version: saved.version,
  } satisfies IntegrityValue;
  return canonicalIntegrityJson(canonical);
}

export function createConstructMatchup(
  left: SavedConstruct,
  right: SavedConstruct,
  options: Readonly<{
    seed: number;
    mirrored: boolean;
    arenaDigest: string;
    configDigest: string;
    boutCapSteps: number;
  }>,
): ConstructMatchupIdentity {
  const matchup: ConstructMatchupIdentity = Object.freeze({
    version: CONSTRUCT_MATCHUP_VERSION,
    left: sideIdentity(left, "left"),
    right: sideIdentity(right, "right"),
    mirrored: options.mirrored,
    seed: options.seed,
    arenaDigest: options.arenaDigest,
    configDigest: options.configDigest,
    boutCapSteps: options.boutCapSteps,
    initialCondition: constructInitialCondition(options.seed, options.mirrored),
  });
  return validateConstructMatchup(matchup);
}

export function createConstructBoutJobs(
  left: SavedConstruct,
  right: SavedConstruct,
  seeds: readonly number[],
  options: Readonly<{
    mirrored: boolean;
    arenaDigest: string;
    configDigest: string;
    boutCapSteps: number;
  }>,
): readonly ConstructBoutJob[] {
  if (seeds.length === 0) throw new Error("construct batch requires at least one seed");
  if (new Set(seeds).size !== seeds.length) throw new Error("construct batch seeds contain a duplicate");
  const leftBytes = canonicalSavedConstructJson(left);
  const rightBytes = canonicalSavedConstructJson(right);
  const assignments = seeds.flatMap((seed) => [
    { left, right, leftBytes, rightBytes, seed, mirrored: false },
    ...(options.mirrored ? [{ left: right, right: left, leftBytes: rightBytes, rightBytes: leftBytes, seed, mirrored: true }] : []),
  ]);
  return Object.freeze(assignments.map((assignment, index) => {
    const matchup = createConstructMatchup(assignment.left, assignment.right, {
      seed: assignment.seed,
      mirrored: assignment.mirrored,
      arenaDigest: options.arenaDigest,
      configDigest: options.configDigest,
      boutCapSteps: options.boutCapSteps,
    });
    return Object.freeze({
      index,
      matchup,
      matchupDigest: constructMatchupDigest(matchup),
      leftSavedJson: assignment.leftBytes,
      rightSavedJson: assignment.rightBytes,
    });
  }));
}

export function constructBatchDigest(jobs: readonly ConstructBoutJob[]): string {
  if (jobs.length === 0) throw new Error("construct batch cannot digest zero jobs");
  jobs.forEach((job, index) => {
    if (job.index !== index) throw new Error(`construct batch job ${index} has index ${job.index}`);
    if (constructMatchupDigest(job.matchup) !== job.matchupDigest) {
      throw new Error(`construct batch job ${index} matchup digest does not match its identity`);
    }
  });
  return integrityDigest(canonicalIntegrityJson(jobs.map((job) => ({
    index: job.index,
    matchupDigest: job.matchupDigest,
  })) as unknown as IntegrityValue));
}
