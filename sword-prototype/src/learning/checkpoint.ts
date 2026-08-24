import { FEATURE_COLUMNS, FEATURE_VERSION } from "./features.ts";
import { OPTION_NAMES } from "../options.ts";
import { Network } from "./network.ts";
import type { ActivationName, EdgeGene, NodeGene, NodeKind } from "./genome.ts";

const MAGIC = new Uint8Array([0x53, 0x57, 0x4e, 0x45, 0x41, 0x54, 0x43, 0x50]); // SWNEATCP
export const CHECKPOINT_SCHEMA = 1;
const MAX_NAMES = 1_024;
const MAX_NODES = 100_000;
const MAX_EDGES = 1_000_000;
const MAX_STRING_BYTES = 1_048_576;

export const ACTIVATION_NAMES: readonly ActivationName[] = Object.freeze(["identity", "tanh", "sigmoid"]);

export type ProvenanceValue = null | boolean | number | string | readonly ProvenanceValue[] |
  { readonly [name: string]: ProvenanceValue };

export interface CheckpointData {
  readonly schema?: number;
  readonly featureVersion: number;
  readonly featureNames: readonly string[];
  readonly optionNames: readonly string[];
  readonly nodes: readonly NodeGene[];
  readonly edges: readonly EdgeGene[];
  readonly provenance: Readonly<Record<string, ProvenanceValue>>;
}

export interface CheckpointContract {
  readonly featureVersion: number;
  readonly featureNames: readonly string[];
  readonly optionNames: readonly string[];
}

const RUNTIME_CONTRACT: CheckpointContract = {
  featureVersion: FEATURE_VERSION,
  featureNames: FEATURE_COLUMNS,
  optionNames: OPTION_NAMES,
};

const nodeKindByte = (kind: NodeKind): number => kind === "input" ? 0 : kind === "bias" ? 1 : kind === "hidden" ? 2 : 3;
const byteNodeKind = (value: number): NodeKind => {
  if (value === 0) return "input";
  if (value === 1) return "bias";
  if (value === 2) return "hidden";
  if (value === 3) return "output";
  throw new Error(`checkpoint node kind ${value} is unknown`);
};
const namedActivation = (value: string): ActivationName => {
  if (!(ACTIVATION_NAMES as readonly string[]).includes(value)) throw new Error(`checkpoint activation "${value}" is unknown`);
  return value as ActivationName;
};

class Writer {
  private readonly bytes: number[] = [];
  u8(value: number): void { this.bytes.push(value & 0xff); }
  u16(value: number): void { this.u8(value); this.u8(value >>> 8); }
  u32(value: number): void { this.u16(value); this.u16(value >>> 16); }
  f64(value: number): void {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    this.raw(bytes);
  }
  raw(values: Uint8Array): void { for (const value of values) this.bytes.push(value); }
  string(value: string): void {
    const encoded = new TextEncoder().encode(value);
    if (encoded.length > MAX_STRING_BYTES) throw new Error(`checkpoint string is too long (${encoded.length} bytes)`);
    this.u32(encoded.length); this.raw(encoded);
  }
  finish(): Uint8Array { return Uint8Array.from(this.bytes); }
}

class Reader {
  private offset = 0;
  private readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) { this.bytes = bytes; }
  private take(length: number, label: string): Uint8Array {
    if (length < 0 || this.offset + length > this.bytes.length) throw new Error(`checkpoint ends inside ${label}`);
    const result = this.bytes.subarray(this.offset, this.offset + length); this.offset += length; return result;
  }
  u8(label: string): number { return this.take(1, label)[0]!; }
  u16(label: string): number { const bytes = this.take(2, label); return bytes[0]! | bytes[1]! << 8; }
  u32(label: string): number {
    const bytes = this.take(4, label);
    return (bytes[0]! | bytes[1]! << 8 | bytes[2]! << 16 | bytes[3]! << 24) >>> 0;
  }
  f64(label: string): number {
    const bytes = this.take(8, label);
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, true);
  }
  string(label: string): string {
    const length = this.u32(`${label} length`);
    if (length > MAX_STRING_BYTES) throw new Error(`${label} is too long (${length} bytes)`);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(this.take(length, label)); }
    catch (error) { throw new Error(`${label} is not valid UTF-8`, { cause: error }); }
  }
  raw(length: number, label: string): Uint8Array { return this.take(length, label); }
  done(): boolean { return this.offset === this.bytes.length; }
  remaining(): number { return this.bytes.length - this.offset; }
}

const sameNames = (actual: readonly string[], expected: readonly string[], label: string): void => {
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error(`checkpoint ${label} do not exactly match the runtime ${label}`);
  }
};
const boundedCount = (count: number, maximum: number, label: string): number => {
  if (count > maximum) throw new Error(`checkpoint ${label} count ${count} exceeds ${maximum}`);
  return count;
};
const validId = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new Error(`checkpoint ${label} is out of bounds`);
};
const validateProvenance = (value: unknown, path = "provenance", seen = new Set<object>(), depth = 0): void => {
  if (depth > 64) throw new Error(`checkpoint ${path} is nested too deeply`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`checkpoint ${path} is non-finite`);
    return;
  }
  if (typeof value !== "object") throw new Error(`checkpoint ${path} has an unsupported value`);
  if (seen.has(value)) throw new Error(`checkpoint ${path} is cyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_EDGES) throw new Error(`checkpoint ${path} array is too large`);
    value.forEach((item, index) => validateProvenance(item, `${path}[${index}]`, seen, depth + 1));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`checkpoint ${path} is not plain data`);
    const entries = Object.entries(value);
    if (entries.length > MAX_NAMES) throw new Error(`checkpoint ${path} has too many fields`);
    for (const [name, item] of entries) validateProvenance(item, `${path}.${name}`, seen, depth + 1);
  }
  seen.delete(value);
};

function validateGraph(nodes: readonly NodeGene[], edges: readonly EdgeGene[]): void {
  if (nodes.length === 0 || nodes.length > MAX_NODES) throw new Error(`checkpoint node count ${nodes.length} is out of bounds`);
  if (edges.length > MAX_EDGES) throw new Error(`checkpoint edge count ${edges.length} is out of bounds`);
  const byId = new Map<number, NodeGene>();
  for (const node of nodes) {
    validId(node.id, "node id");
    if (byId.has(node.id)) throw new Error(`checkpoint has duplicate node id ${node.id}`);
    if (!(node.kind === "input" || node.kind === "bias" || node.kind === "hidden" || node.kind === "output")) {
      throw new Error(`checkpoint node ${node.id} has unknown kind ${String(node.kind)}`);
    }
    if (!Number.isFinite(node.bias)) throw new Error(`checkpoint node ${node.id} has non-finite bias`);
    if (!(ACTIVATION_NAMES as readonly string[]).includes(node.activation)) throw new Error(`checkpoint node ${node.id} has unknown activation ${node.activation}`);
    byId.set(node.id, node);
  }
  const innovations = new Set<number>();
  const connections = new Set<string>();
  const outgoing = new Map<number, number[]>();
  for (const edge of edges) {
    validId(edge.innovation, "innovation"); validId(edge.from, "edge source"); validId(edge.to, "edge target");
    if (innovations.has(edge.innovation)) throw new Error(`checkpoint has duplicate innovation ${edge.innovation}`);
    innovations.add(edge.innovation);
    if (!byId.has(edge.from) || !byId.has(edge.to)) throw new Error(`checkpoint edge ${edge.innovation} refers to a missing node`);
    const connection = `${edge.from}:${edge.to}`;
    if (connections.has(connection)) throw new Error(`checkpoint has duplicate connection ${connection}`);
    connections.add(connection);
    const source = byId.get(edge.from) as NodeGene; const target = byId.get(edge.to) as NodeGene;
    if (source.kind === "output" || target.kind === "input" || target.kind === "bias") {
      throw new Error(`checkpoint edge ${edge.innovation} violates node roles`);
    }
    if (!Number.isFinite(edge.weight)) throw new Error(`checkpoint edge ${edge.innovation} has non-finite weight`);
    if (typeof edge.enabled !== "boolean") throw new Error(`checkpoint edge ${edge.innovation} has an invalid enabled flag`);
    if (edge.enabled) {
      const targets = outgoing.get(edge.from) ?? []; targets.push(edge.to); outgoing.set(edge.from, targets);
    }
  }
  const state = new Map<number, 0 | 1 | 2>();
  const visit = (id: number): void => {
    if (state.get(id) === 1) throw new Error("checkpoint enabled graph contains a cycle");
    if (state.get(id) === 2) return;
    state.set(id, 1); for (const target of outgoing.get(id) ?? []) visit(target); state.set(id, 2);
  };
  for (const node of nodes) visit(node.id);
}

function validateData(data: CheckpointData, contract: CheckpointContract): void {
  if ((data.schema ?? CHECKPOINT_SCHEMA) !== CHECKPOINT_SCHEMA) throw new Error(`unsupported checkpoint schema ${data.schema}`);
  if (!Number.isInteger(data.featureVersion) || data.featureVersion < 0 || data.featureVersion > 0xffff) {
    throw new Error(`checkpoint feature version ${data.featureVersion} is out of bounds`);
  }
  if (data.featureVersion !== contract.featureVersion) {
    throw new Error(`checkpoint feature version ${data.featureVersion} does not match runtime ${contract.featureVersion}`);
  }
  if (data.featureNames.length > MAX_NAMES || data.optionNames.length > MAX_NAMES) throw new Error("checkpoint name count is out of bounds");
  sameNames(data.featureNames, contract.featureNames, "feature names");
  sameNames(data.optionNames, contract.optionNames, "option names");
  const inputs = data.nodes.filter((node) => node.kind === "input").length;
  const outputs = data.nodes.filter((node) => node.kind === "output").length;
  const biases = data.nodes.filter((node) => node.kind === "bias").length;
  if (inputs !== data.featureNames.length) throw new Error(`checkpoint has ${inputs} inputs for ${data.featureNames.length} features`);
  if (outputs !== data.optionNames.length + 1) throw new Error(`checkpoint has ${outputs} outputs; options plus persistence require ${data.optionNames.length + 1}`);
  if (biases !== 1) throw new Error(`checkpoint must contain exactly one bias node, got ${biases}`);
  validateGraph(data.nodes, data.edges); validateProvenance(data.provenance);
}

export class Checkpoint {
  readonly schema: number;
  readonly featureVersion: number;
  readonly featureNames: readonly string[];
  readonly optionNames: readonly string[];
  readonly nodes: readonly NodeGene[];
  readonly edges: readonly EdgeGene[];
  readonly provenance: Readonly<Record<string, ProvenanceValue>>;

  constructor(data: CheckpointData, contract: CheckpointContract = RUNTIME_CONTRACT) {
    validateData(data, contract);
    this.schema = data.schema ?? CHECKPOINT_SCHEMA;
    this.featureVersion = data.featureVersion;
    this.featureNames = Object.freeze([...data.featureNames]);
    this.optionNames = Object.freeze([...data.optionNames]);
    this.nodes = Object.freeze(data.nodes.map((node) => Object.freeze({ ...node })));
    this.edges = Object.freeze(data.edges.map((edge) => Object.freeze({ ...edge })));
    this.provenance = Object.freeze({ ...data.provenance });
  }

  toBytes(): Uint8Array {
    const writer = new Writer(); writer.raw(MAGIC); writer.u16(this.schema); writer.u16(this.featureVersion);
    writer.u16(this.featureNames.length); for (const name of this.featureNames) writer.string(name);
    writer.u16(this.optionNames.length); for (const name of this.optionNames) writer.string(name);
    writer.u32(this.nodes.length);
    for (const node of this.nodes) {
      writer.u32(node.id); writer.u8(nodeKindByte(node.kind)); writer.f64(node.bias); writer.string(node.activation);
    }
    writer.u32(this.edges.length);
    for (const edge of this.edges) {
      writer.u32(edge.innovation); writer.u32(edge.from); writer.u32(edge.to);
      writer.f64(edge.weight); writer.u8(edge.enabled ? 1 : 0);
    }
    writer.string(JSON.stringify(this.provenance));
    return writer.finish();
  }

  network(): Network {
    return new Network({ nodes: this.nodes.map((node) => ({ ...node })), edges: this.edges.map((edge) => ({ ...edge })) });
  }

  static fromBytes(bytes: Uint8Array, contract: CheckpointContract = RUNTIME_CONTRACT): Checkpoint {
    const reader = new Reader(bytes);
    const magic = reader.raw(MAGIC.length, "magic");
    if (magic.some((value, index) => value !== MAGIC[index])) throw new Error("checkpoint magic is invalid");
    const schema = reader.u16("schema");
    if (schema !== CHECKPOINT_SCHEMA) throw new Error(`unsupported checkpoint schema ${schema}`);
    const featureVersion = reader.u16("feature version");
    const readNames = (label: string): string[] => {
      const count = boundedCount(reader.u16(`${label} count`), MAX_NAMES, label);
      return Array.from({ length: count }, (_, index) => reader.string(`${label}[${index}]`));
    };
    const featureNames = readNames("feature names"); const optionNames = readNames("option names");
    const nodeCount = boundedCount(reader.u32("node count"), MAX_NODES, "node");
    const nodes: NodeGene[] = [];
    for (let index = 0; index < nodeCount; index += 1) nodes.push({
      id: reader.u32(`node ${index} id`), kind: byteNodeKind(reader.u8(`node ${index} kind`)),
      bias: reader.f64(`node ${index} bias`), activation: namedActivation(reader.string(`node ${index} activation`)),
    });
    const edgeCount = boundedCount(reader.u32("edge count"), MAX_EDGES, "edge");
    const edges: EdgeGene[] = [];
    for (let index = 0; index < edgeCount; index += 1) {
      const innovation = reader.u32(`edge ${index} innovation`); const source = reader.u32(`edge ${index} source`);
      const target = reader.u32(`edge ${index} target`); const weight = reader.f64(`edge ${index} weight`);
      const enabled = reader.u8(`edge ${index} enabled`);
      if (enabled > 1) throw new Error(`checkpoint edge ${innovation} enabled flag is invalid`);
      edges.push({ innovation, from: source, to: target, weight, enabled: enabled === 1 });
    }
    const provenanceText = reader.string("training provenance");
    if (!reader.done()) throw new Error(`checkpoint has ${reader.remaining()} trailing byte(s)`);
    let provenance: unknown;
    try { provenance = JSON.parse(provenanceText); }
    catch (error) { throw new Error("checkpoint training provenance is invalid JSON", { cause: error }); }
    if (provenance === null || Array.isArray(provenance) || typeof provenance !== "object") {
      throw new Error("checkpoint training provenance must be an object");
    }
    // Construction is deliberately last: malformed numbers, graph structure and extra
    // bytes must never escape as a partially usable inference network.
    return new Checkpoint({ schema, featureVersion, featureNames, optionNames, nodes, edges,
      provenance: provenance as Record<string, ProvenanceValue> }, contract);
  }
}
