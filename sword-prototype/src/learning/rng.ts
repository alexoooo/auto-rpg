/** Small seeded generator used by every stochastic learning operation. */
export class SeededRng {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }
  next(): number { return this.nextU32() / 4294967296; }
  integer(limit: number): number {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error(`invalid random limit ${limit}`);
    return Math.floor(this.next() * limit);
  }
  chance(probability: number): boolean { return this.next() < probability; }
  signed(scale = 1): number { return (this.next() * 2 - 1) * scale; }
  normal(): number {
    const u = Math.max(Number.EPSILON, this.next()); const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  choose<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error("cannot choose from an empty array");
    return values[this.integer(values.length)] as T;
  }
}
