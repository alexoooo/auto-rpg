import { hasCycle, type ActivationName, type EdgeGene, type Genome, type NodeGene } from "./genome.ts";

const activate = (name: ActivationName, value: number): number => name === "identity" ? value : name === "tanh" ? Math.tanh(value) : 1 / (1 + Math.exp(-value));
export class Network {
  readonly nodes: readonly NodeGene[]; readonly edges: readonly EdgeGene[]; private order: readonly number[];
  constructor(genome: Pick<Genome, "nodes" | "edges">) {
    if (hasCycle(genome)) throw new Error("network contains a cycle");
    this.nodes = genome.nodes.map((node) => ({ ...node })); this.edges = genome.edges.filter((edge) => edge.enabled).map((edge) => ({ ...edge }));
    const degree = new Map(this.nodes.map((node) => [node.id, 0])); const outgoing = new Map<number, number[]>();
    for (const edge of this.edges) { degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1); const list = outgoing.get(edge.from) ?? []; list.push(edge.to); outgoing.set(edge.from, list); }
    const queue = [...degree].filter(([, d]) => d === 0).map(([id]) => id).sort((a, b) => a - b); const order: number[] = [];
    while (queue.length) { const id = queue.shift() as number; order.push(id); for (const to of outgoing.get(id) ?? []) { const d = (degree.get(to) as number) - 1; degree.set(to, d); if (d === 0) { queue.push(to); queue.sort((a, b) => a - b); } } }
    this.order = order;
  }
  run(input: readonly number[]): number[] {
    const inputs = this.nodes.filter((node) => node.kind === "input"); if (input.length !== inputs.length) throw new Error(`network expected ${inputs.length} inputs, got ${input.length}`);
    const value = new Map<number, number>(); inputs.forEach((node, index) => value.set(node.id, input[index] as number));
    for (const node of this.nodes) if (node.kind === "bias") value.set(node.id, 1);
    for (const id of this.order) { const node = this.nodes.find((candidate) => candidate.id === id) as NodeGene;
      if (node.kind === "input" || node.kind === "bias") continue;
      let sum = node.bias; for (const edge of this.edges) if (edge.to === id) sum += (value.get(edge.from) ?? 0) * edge.weight;
      value.set(id, activate(node.activation, sum));
    }
    return this.nodes.filter((node) => node.kind === "output").map((node) => value.get(node.id) ?? 0);
  }
}
