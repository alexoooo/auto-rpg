export interface PowerSourceSpec {
  readonly id: string;
  readonly capacityJ: number;
  readonly maxOutputW: number;
}

export interface ConsumerSpec {
  readonly id: string;
  readonly drawW: number;
  readonly heatPerJ: number;
}

export interface ThermalSpec {
  readonly capacityJ: number;
  readonly coolingW: number;
  readonly maxHeatJ: number;
}

export interface MagazineSpec {
  readonly id: string;
  readonly capacity: number;
  readonly reloadS: number;
}

export interface ResourceRequest {
  readonly consumer: string;
  readonly priority: number;
  readonly declarationIndex: number;
}

export interface ResourceDecision {
  readonly consumer: string;
  readonly admitted: boolean;
  readonly reason: string | null;
}

export interface ResourceView {
  readonly chargeJ: number;
  readonly heatJ: number;
  readonly overheated: boolean;
  readonly ammunition: Readonly<Record<string, number>>;
  readonly reloadS: Readonly<Record<string, number>>;
}

const finitePositive = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be finite and positive`);
};

/** Fixed-step resources; shortfalls reject whole consumers instead of silently throttling all. */
export class ConstructResources {
  private readonly source: PowerSourceSpec;
  private readonly consumers: ReadonlyMap<string, ConsumerSpec>;
  private readonly thermal: ThermalSpec;
  private readonly magazines: ReadonlyMap<string, MagazineSpec>;
  private readonly ammo = new Map<string, number>();
  private readonly reload = new Map<string, number>();
  private charge: number;
  private heat = 0;

  constructor(
    source: PowerSourceSpec,
    consumers: readonly ConsumerSpec[],
    thermal: ThermalSpec,
    magazines: readonly MagazineSpec[],
  ) {
    finitePositive(source.capacityJ, `power source "${source.id}" capacityJ`);
    finitePositive(source.maxOutputW, `power source "${source.id}" maxOutputW`);
    finitePositive(thermal.capacityJ, "thermal capacityJ");
    finitePositive(thermal.coolingW, "thermal coolingW");
    finitePositive(thermal.maxHeatJ, "thermal maxHeatJ");
    this.source = source;
    this.consumers = new Map(consumers.map((consumer) => [consumer.id, consumer]));
    this.thermal = thermal;
    this.magazines = new Map(magazines.map((magazine) => [magazine.id, magazine]));
    if (this.consumers.size !== consumers.length) throw new Error("construct resource consumers have duplicate IDs");
    if (this.magazines.size !== magazines.length) throw new Error("construct magazines have duplicate IDs");
    this.charge = source.capacityJ;
    for (const consumer of consumers) {
      finitePositive(consumer.drawW, `consumer "${consumer.id}" drawW`);
      if (!Number.isFinite(consumer.heatPerJ) || consumer.heatPerJ < 0) {
        throw new Error(`consumer "${consumer.id}" heatPerJ must be finite and non-negative`);
      }
    }
    for (const magazine of magazines) {
      if (!Number.isInteger(magazine.capacity) || magazine.capacity <= 0) {
        throw new Error(`magazine "${magazine.id}" capacity must be a positive integer`);
      }
      finitePositive(magazine.reloadS, `magazine "${magazine.id}" reloadS`);
      this.ammo.set(magazine.id, magazine.capacity);
      this.reload.set(magazine.id, 0);
    }
  }

  get view(): ResourceView {
    return Object.freeze({
      chargeJ: this.charge,
      heatJ: this.heat,
      overheated: this.heat >= this.thermal.maxHeatJ,
      ammunition: Object.freeze(Object.fromEntries(this.ammo)),
      reloadS: Object.freeze(Object.fromEntries(this.reload)),
    });
  }

  step(dt: number, requests: readonly ResourceRequest[]): readonly ResourceDecision[] {
    this.advance(dt);
    return this.admit(dt, requests);
  }

  /** Passive time is a separate edge so capability derivation observes this tick's cooled/reloaded state. */
  advance(dt: number): void {
    finitePositive(dt, "resource dt");
    this.heat = Math.max(0, this.heat - this.thermal.coolingW * dt);
    for (const [id, time] of this.reload) this.reload.set(id, Math.max(0, time - dt));
  }

  admit(dt: number, requests: readonly ResourceRequest[]): readonly ResourceDecision[] {
    finitePositive(dt, "resource dt");
    const decisions: ResourceDecision[] = [];
    let watts = 0;
    let joules = 0;
    for (const request of [...requests].sort((a, b) => b.priority - a.priority ||
      a.declarationIndex - b.declarationIndex || a.consumer.localeCompare(b.consumer))) {
      const consumer = this.consumers.get(request.consumer);
      if (!consumer) {
        decisions.push({ consumer: request.consumer, admitted: false, reason: `missing consumer "${request.consumer}"` });
        continue;
      }
      const nextWatts = watts + consumer.drawW;
      const nextJoules = joules + consumer.drawW * dt;
      const thermalCost = consumer.drawW * dt * consumer.heatPerJ;
      let reason: string | null = null;
      if (nextWatts > this.source.maxOutputW) reason = "power output exhausted";
      else if (nextJoules > this.charge) reason = "power charge exhausted";
      else if (this.heat + thermalCost > this.thermal.maxHeatJ) reason = "thermal limit reached";
      if (reason) {
        decisions.push({ consumer: consumer.id, admitted: false, reason });
        continue;
      }
      watts = nextWatts;
      joules = nextJoules;
      this.heat += thermalCost;
      decisions.push({ consumer: consumer.id, admitted: true, reason: null });
    }
    this.charge -= joules;
    return decisions;
  }

  fire(magazineId: string): void {
    const spec = this.magazines.get(magazineId);
    if (!spec) throw new Error(`missing magazine "${magazineId}"`);
    const ammunition = this.ammo.get(magazineId) as number;
    const reload = this.reload.get(magazineId) as number;
    if (ammunition <= 0) throw new Error(`magazine "${magazineId}" has no ammunition`);
    if (reload > 0) throw new Error(`magazine "${magazineId}" is reloading for ${reload.toFixed(3)} s`);
    this.ammo.set(magazineId, ammunition - 1);
    this.reload.set(magazineId, spec.reloadS);
  }

  /** One transactional launcher edge: no ammunition is lost when power or heat refuses it. */
  fireWithCost(magazineId: string, energyJ: number, heatJ: number): void {
    finitePositive(energyJ, "shot energyJ");
    if (!Number.isFinite(heatJ) || heatJ < 0) throw new Error("shot heatJ must be finite and non-negative");
    const spec = this.magazines.get(magazineId);
    if (!spec) throw new Error(`missing magazine "${magazineId}"`);
    const ammunition = this.ammo.get(magazineId) as number;
    const reload = this.reload.get(magazineId) as number;
    if (ammunition <= 0) throw new Error(`magazine "${magazineId}" has no ammunition`);
    if (reload > 0) throw new Error(`magazine "${magazineId}" is reloading for ${reload.toFixed(3)} s`);
    if (energyJ > this.charge) throw new Error("power charge exhausted");
    if (this.heat + heatJ > this.thermal.maxHeatJ) throw new Error("thermal limit reached");
    this.ammo.set(magazineId, ammunition - 1);
    this.reload.set(magazineId, spec.reloadS);
    this.charge -= energyJ;
    this.heat += heatJ;
  }
}
