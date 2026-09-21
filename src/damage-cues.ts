/** Presentation bookkeeping: every report is delivered, even at an identical timestamp. */
export interface DamageCue {
  key: string;
  name: string;
  damage: number;
  severed: boolean;
  blocked: boolean;
  age: number;
  point: { x: number; y: number; z: number };
}

export class DamageCues {
  readonly labels: DamageCue[] = [];
  add(cue: Omit<DamageCue, "age">): void {
    const existing = this.labels.find(item => item.key === cue.key && item.age <= .1
      && item.blocked === cue.blocked);
    if (existing) {
      existing.damage += cue.damage;
      existing.severed ||= cue.severed;
      return;
    }
    if (this.labels.length === 8) this.labels.shift();
    this.labels.push({ ...cue, point: { x: cue.point.x, y: cue.point.y, z: cue.point.z }, age: 0 });
  }
  update(dt: number): void {
    for (const cue of this.labels) cue.age += dt;
    for (let i = this.labels.length - 1; i >= 0; i--)
      if (this.labels[i].age >= .8) this.labels.splice(i, 1);
  }
  clear(): void { this.labels.length = 0; }
}
