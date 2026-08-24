import { hasCycle, type ActivationName, type EdgeGene, type Genome, type NodeGene } from "./genome.ts";

const activate = (name: ActivationName, value: number): number => name === "identity" ? value :
  name === "tanh" ? Math.tanh(value) : 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, value))));

export class RecurrentNeatNetwork {
  private readonly nodes: readonly NodeGene[];
  private readonly edges: readonly EdgeGene[];
  private readonly order: readonly number[];
  private previous = new Map<number, number>();
  constructor(genome: Pick<Genome, "nodes" | "edges">) {
    this.nodes = genome.nodes.map((node) => Object.freeze({ ...node }));
    this.edges = genome.edges.filter((edge) => edge.enabled).map((edge) => Object.freeze({ ...edge }));
    if (hasCycle({ nodes: [...this.nodes], edges: [...this.edges] })) throw new Error("recurrent NEAT graph has an enabled cycle without an explicit delayed edge");
    const degree = new Map(this.nodes.map((node) => [node.id, 0])); const outgoing = new Map<number, number[]>();
    for (const edge of this.edges.filter((candidate) => !candidate.recurrent)) {
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
      const list = outgoing.get(edge.from) ?? []; list.push(edge.to); outgoing.set(edge.from, list);
    }
    const queue = [...this.nodes].filter((node) => degree.get(node.id) === 0).map((node) => node.id).sort((a, b) => a - b);
    const order: number[] = [];
    while (queue.length) {
      const id = queue.shift() as number; order.push(id);
      for (const target of (outgoing.get(id) ?? []).sort((a, b) => a - b)) {
        const next = (degree.get(target) as number) - 1; degree.set(target, next);
        if (next === 0) { queue.push(target); queue.sort((a, b) => a - b); }
      }
    }
    if (order.length !== this.nodes.length) throw new Error("recurrent NEAT topological ordering is incomplete");
    this.order = Object.freeze(order);
  }
  run(input: readonly number[]): number[] {
    const inputs = this.nodes.filter((node) => node.kind === "input").sort((a, b) => a.id - b.id);
    if (input.length !== inputs.length || input.some((value) => !Number.isFinite(value))) throw new Error(`recurrent NEAT requires ${inputs.length} finite inputs`);
    const values = new Map<number, number>(); inputs.forEach((node, index) => values.set(node.id, input[index] as number));
    for (const node of this.nodes.filter((candidate) => candidate.kind === "bias")) values.set(node.id, 1);
    const byId = new Map(this.nodes.map((node) => [node.id, node]));
    for (const id of this.order) {
      const node = byId.get(id) as NodeGene;
      if (node.kind === "input" || node.kind === "bias") continue;
      let total = node.bias;
      for (const edge of this.edges.filter((candidate) => candidate.to === id)) total += edge.weight *
        (edge.recurrent ? (this.previous.get(edge.from) ?? 0) : (values.get(edge.from) ?? 0));
      values.set(id, activate(node.activation, total));
    }
    this.previous = values;
    return this.nodes.filter((node) => node.kind === "output").sort((a, b) => a.id - b.id).map((node) => values.get(node.id) ?? 0);
  }
  reset(): void { this.previous.clear(); }
}
