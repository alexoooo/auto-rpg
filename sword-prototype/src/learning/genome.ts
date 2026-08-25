import { SeededRng } from "./rng.ts";

// Unexported since session 17 took its last outside reader: `NodeGene` below is
// the only one left, and `evaluation.ts` records why that is not a deletion.
type NodeKind = "input" | "bias" | "hidden" | "output";
export type ActivationName = "identity" | "tanh" | "sigmoid";
export interface NodeGene { id: number; kind: NodeKind; bias: number; activation: ActivationName }
export interface EdgeGene { innovation: number; from: number; to: number; weight: number; enabled: boolean; recurrent?: boolean }
export interface Genome { id: number; nodes: NodeGene[]; edges: EdgeGene[]; fitness: number; adjustedFitness: number; novelty: number }

export class InnovationTracker {
  private nextInnovation = 0; private nextNode: number; private edges = new Map<string, number>(); private splits = new Map<number, number>();
  constructor(firstNode: number, firstInnovation = 0) { this.nextNode = firstNode; this.nextInnovation = firstInnovation; }
  observe(edge: EdgeGene): void { this.edges.set(`${edge.from}:${edge.to}`, edge.innovation); this.nextInnovation = Math.max(this.nextInnovation, edge.innovation + 1); }
  observeSplit(innovation: number, node: number): void { this.splits.set(innovation, node); this.nextNode = Math.max(this.nextNode, node + 1); }
  edge(from: number, to: number): number {
    const key = `${from}:${to}`; const existing = this.edges.get(key);
    if (existing !== undefined) return existing;
    const innovation = this.nextInnovation++; this.edges.set(key, innovation); return innovation;
  }
  node(): number { return this.nextNode++; }
  split(innovation: number): number { const existing = this.splits.get(innovation); if (existing !== undefined) return existing;
    const node = this.node(); this.splits.set(innovation, node); return node; }
}

export function cloneGenome(genome: Genome, id = genome.id): Genome {
  return { ...genome, id, nodes: genome.nodes.map((node) => ({ ...node })), edges: genome.edges.map((edge) => ({ ...edge })) };
}

export function initialGenome(id: number, inputs: number, outputs: number, rng: SeededRng,
  innovations: InnovationTracker): Genome {
  const nodes: NodeGene[] = [];
  for (let i = 0; i < inputs; i += 1) nodes.push({ id: i, kind: "input", bias: 0, activation: "identity" });
  const bias = inputs; nodes.push({ id: bias, kind: "bias", bias: 0, activation: "identity" });
  for (let i = 0; i < outputs; i += 1) nodes.push({ id: bias + 1 + i, kind: "output", bias: rng.signed(0.2), activation: "tanh" });
  const edges: EdgeGene[] = [];
  for (let from = 0; from <= bias; from += 1) for (let out = 0; out < outputs; out += 1) {
    const to = bias + 1 + out; edges.push({ innovation: innovations.edge(from, to), from, to, weight: rng.signed(), enabled: true });
  }
  return { id, nodes, edges, fitness: 0, adjustedFitness: 0, novelty: 0 };
}

export const initialPopulation = (count: number, inputs: number, outputs: number, seed: number): Genome[] => {
  const rng = new SeededRng(seed); const innovations = new InnovationTracker(inputs + 1 + outputs);
  return Array.from({ length: count }, (_, id) => initialGenome(id, inputs, outputs, rng, innovations));
};

/** Research-v4 starts sparse; the shipped v2 probe keeps its historical dense initializer above. */
export function initialSparseGenome(id: number, inputs: number, outputs: number, rng: SeededRng,
  innovations: InnovationTracker): Genome {
  const genome = initialGenome(id, inputs, outputs, rng, innovations);
  const bias = inputs;
  genome.edges = genome.edges.filter((edge) => edge.from === bias ||
    ((edge.from * 0x9e3779b1 + edge.to * 0x85ebca6b + id) >>> 0) % Math.max(2, inputs) === 0);
  return genome;
}

export function hasCycle(genome: Pick<Genome, "nodes" | "edges">): boolean {
  const degree = new Map(genome.nodes.map((node) => [node.id, 0])); const next = new Map<number, number[]>();
  for (const edge of genome.edges) if (edge.enabled && !edge.recurrent) {
    if (!degree.has(edge.from) || !degree.has(edge.to)) return true;
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    const list = next.get(edge.from) ?? []; list.push(edge.to); next.set(edge.from, list);
  }
  const queue = [...degree].filter(([, value]) => value === 0).map(([id]) => id); let seen = 0;
  while (queue.length) { const id = queue.shift() as number; seen += 1;
    for (const to of next.get(id) ?? []) { const value = (degree.get(to) as number) - 1; degree.set(to, value); if (value === 0) queue.push(to); }
  }
  return seen !== degree.size;
}

export function addRecurrentEdgeMutation(genome: Genome, rng: SeededRng, innovations: InnovationTracker): boolean {
  const sources = genome.nodes.filter((node) => node.kind === "hidden" || node.kind === "output");
  const targets = genome.nodes.filter((node) => node.kind === "hidden" || node.kind === "output");
  const candidates = sources.flatMap((from) => targets.map((to) => [from.id, to.id] as const)).filter(([from, to]) =>
    !genome.edges.some((edge) => edge.from === from && edge.to === to));
  if (!candidates.length) return false;
  const [from, to] = rng.choose(candidates);
  genome.edges.push({ innovation: innovations.edge(from, to), from, to, weight: rng.signed(), enabled: true, recurrent: true });
  return true;
}

export function addEdgeMutation(genome: Genome, rng: SeededRng, innovations: InnovationTracker): boolean {
  const candidates: Array<[number, number]> = [];
  for (const from of genome.nodes) for (const to of genome.nodes) {
    if (from.id === to.id || to.kind === "input" || to.kind === "bias" || from.kind === "output") continue;
    if (genome.edges.some((edge) => edge.from === from.id && edge.to === to.id)) continue;
    const probe = { nodes: genome.nodes, edges: [...genome.edges, { innovation: -1, from: from.id, to: to.id, weight: 0, enabled: true }] };
    if (!hasCycle(probe)) candidates.push([from.id, to.id]);
  }
  if (!candidates.length) return false;
  const [from, to] = rng.choose(candidates); genome.edges.push({ innovation: innovations.edge(from, to), from, to, weight: rng.signed(), enabled: true }); return true;
}

export function addNodeMutation(genome: Genome, rng: SeededRng, innovations: InnovationTracker): boolean {
  // Splitting a delayed edge would silently turn its memory path into a same-step
  // feedback cycle. Recurrent structure grows only through the named mutation.
  const enabled = genome.edges.filter((candidate) => candidate.enabled && !candidate.recurrent);
  if (!enabled.length) return false; const edge = rng.choose(enabled);
  edge.enabled = false; const node = innovations.split(edge.innovation);
  if (!genome.nodes.some((candidate) => candidate.id === node)) genome.nodes.push({ id: node, kind: "hidden", bias: 0, activation: "tanh" });
  genome.edges.push({ innovation: innovations.edge(edge.from, node), from: edge.from, to: node, weight: 1, enabled: true });
  genome.edges.push({ innovation: innovations.edge(node, edge.to), from: node, to: edge.to, weight: edge.weight, enabled: true });
  return true;
}

export function innovationTrackerFor(population: readonly Genome[]): InnovationTracker {
  const nodes = population.flatMap((genome) => genome.nodes); const edges = population.flatMap((genome) => genome.edges);
  const tracker = new InnovationTracker(nodes.reduce((max, node) => Math.max(max, node.id + 1), 0),
    edges.reduce((max, edge) => Math.max(max, edge.innovation + 1), 0));
  for (const edge of edges) tracker.observe(edge);
  for (const genome of population) for (const disabled of genome.edges.filter((edge) => !edge.enabled)) {
    const split = genome.nodes.find((node) => node.kind === "hidden" &&
      genome.edges.some((edge) => edge.enabled && edge.from === disabled.from && edge.to === node.id) &&
      genome.edges.some((edge) => edge.enabled && edge.from === node.id && edge.to === disabled.to));
    if (split) tracker.observeSplit(disabled.innovation, split.id);
  }
  return tracker;
}

export function mutate(genome: Genome, rng: SeededRng, innovations: InnovationTracker): void {
  for (const edge of genome.edges) if (rng.chance(0.8)) edge.weight = rng.chance(0.1) ? rng.signed(2) : edge.weight + rng.normal() * 0.25;
  for (const node of genome.nodes) if ((node.kind === "hidden" || node.kind === "output") && rng.chance(0.25)) node.bias += rng.normal() * 0.2;
  if (rng.chance(0.08)) addNodeMutation(genome, rng, innovations);
  if (rng.chance(0.15)) addEdgeMutation(genome, rng, innovations);
  if (rng.chance(0.05)) addRecurrentEdgeMutation(genome, rng, innovations);
}

export function compatibilityDistance(a: Genome, b: Genome): number {
  const am = new Map(a.edges.map((edge) => [edge.innovation, edge])); const bm = new Map(b.edges.map((edge) => [edge.innovation, edge]));
  const all = new Set([...am.keys(), ...bm.keys()]); let disjoint = 0; let weights = 0; let matches = 0;
  for (const key of all) { const ae = am.get(key); const be = bm.get(key); if (!ae || !be) disjoint += 1; else { matches += 1; weights += Math.abs(ae.weight - be.weight); } }
  return disjoint / Math.max(1, a.edges.length, b.edges.length) + 0.4 * (matches ? weights / matches : 0);
}

export function crossover(fitter: Genome, other: Genome, rng: SeededRng, id: number): Genome {
  const otherEdges = new Map(other.edges.map((edge) => [edge.innovation, edge]));
  const sourceEdges = fitter.fitness === other.fitness ? [...fitter.edges,
    ...other.edges.filter((edge) => !fitter.edges.some((candidate) => candidate.innovation === edge.innovation))]
    .sort((a, b) => a.innovation - b.innovation) : fitter.edges;
  const edges = sourceEdges.map((edge) => {
    const peer = otherEdges.get(edge.innovation); const inherited = { ...(peer && rng.chance(0.5) ? peer : edge) };
    if (peer && (!edge.enabled || !peer.enabled)) inherited.enabled = !rng.chance(0.75);
    return inherited;
  });
  const nodeIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const otherNodes = new Map(other.nodes.map((node) => [node.id, node])); const fitterNodes = new Map(fitter.nodes.map((node) => [node.id, node]));
  const nodeSources = [...new Map([...fitter.nodes, ...other.nodes].map((node) => [node.id, node])).values()].sort((a, b) => a.id - b.id);
  const nodes = nodeSources.filter((node) => node.kind === "input" || node.kind === "bias" || node.kind === "output" || nodeIds.has(node.id))
    .map((node) => ({ ...((fitterNodes.has(node.id) && otherNodes.has(node.id) && rng.chance(0.5) ?
      otherNodes.get(node.id) : fitterNodes.get(node.id) ?? otherNodes.get(node.id)) as NodeGene) }));
  return { id, nodes, edges, fitness: 0, adjustedFitness: 0, novelty: 0 };
}

export function adaptiveCompatibilityThreshold(threshold: number, speciesCount: number,
  minimumSpecies = 6, maximumSpecies = 12, step = 0.1): number {
  if (![threshold, step].every(Number.isFinite) || threshold <= 0 || step <= 0 ||
      !Number.isSafeInteger(speciesCount) || speciesCount < 0 || minimumSpecies > maximumSpecies) {
    throw new Error("invalid adaptive speciation inputs");
  }
  if (speciesCount < minimumSpecies) return Math.max(step, threshold - step);
  if (speciesCount > maximumSpecies) return threshold + step;
  return threshold;
}

export interface Species { representative: Genome; members: Genome[] }
export function speciate(population: Genome[], threshold = 1.5): Species[] {
  const species: Species[] = [];
  for (const genome of population) { let home = species.find((candidate) => compatibilityDistance(genome, candidate.representative) < threshold);
    if (!home) { home = { representative: genome, members: [] }; species.push(home); } home.members.push(genome); }
  for (const group of species) for (const genome of group.members) genome.adjustedFitness = genome.fitness / group.members.length;
  return species;
}

export function speciesSelectionWeights(groups: readonly Species[]): number[] {
  const scores = groups.map((group) => group.members.reduce((sum, member) => sum + member.adjustedFitness, 0));
  const floor = Math.min(...scores); return scores.map((score) => score - floor + 0.0001);
}

export function breedGeneration(population: Genome[], seed: number, elite: number, innovations: InnovationTracker,
  compatibilityThreshold = 1.5): Genome[] {
  const rng = new SeededRng(seed); const groups = speciate(population, compatibilityThreshold); const next: Genome[] = [];
  population.sort((a, b) => b.fitness - a.fitness || a.id - b.id);
  while (next.length < Math.min(elite, population.length)) next.push(cloneGenome(population[next.length] as Genome, next.length));
  const weights = speciesSelectionWeights(groups); const pools = groups.map((group, index) => ({ group, weight: weights[index] as number }));
  while (next.length < population.length) {
    const total = pools.reduce((sum, pool) => sum + pool.weight, 0); let pick = rng.next() * total; let selected = pools[0] as (typeof pools)[number];
    for (const pool of pools) { pick -= pool.weight; if (pick <= 0) { selected = pool; break; } }
    const ranked = [...selected.group.members].sort((a, b) => b.fitness - a.fitness || a.id - b.id); const parent = rng.choose(ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2))));
    const mate = rng.choose(ranked); const child = crossover(parent.fitness >= mate.fitness ? parent : mate, parent.fitness >= mate.fitness ? mate : parent, rng, next.length);
    mutate(child, rng, innovations); next.push(child);
  }
  return next.slice(0, population.length);
}
