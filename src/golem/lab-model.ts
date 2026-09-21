/** Terminal-aware experimental exchange model; original published duel tables stay untouched. */
import type { FighterView, Mind } from "../mind.ts";
import { DUEL_OPTIONS, observe, stateKey, type DuelOption, type DuelReading } from "./duel-model.ts";
import { golemFencer, GOLEM_TACTICS_V2 } from "./tactics-v2.ts";

export interface ExchangeSample { state: string; option: DuelOption; next: string | null; reward: number }
interface Cell { n: number; reward: number; next: Record<string, number>; terminal: number }
export interface TerminalModel { version: 1; cells: Record<string, Cell>; priors: Record<string, Cell>; samples: number }
export function validateTerminalModel(model: TerminalModel): void {
  if (model.version !== 1 || !Number.isInteger(model.samples) || model.samples < 1) throw new Error("invalid terminal model");
  for (const cell of [...Object.values(model.cells), ...Object.values(model.priors)]) {
    const next = Object.values(cell.next);
    if (!Number.isInteger(cell.n) || cell.n < 1 || !Number.isFinite(cell.reward)
      || !Number.isInteger(cell.terminal) || cell.terminal < 0 || next.some((n) => !Number.isInteger(n) || n < 1)
      || next.reduce((a, b) => a + b, cell.terminal) !== cell.n) throw new Error("invalid terminal transition mass");
  }
}
export function exchangeState(reading: DuelReading, view: FighterView): string {
  return `${stateKey(observe(reading, view.opponent.reach))}/${Math.min(2, Math.floor(view.self.vitality * 3))}/${Math.min(2, Math.floor(view.opponent.vitality * 3))}`;
}
export function fitTerminalModel(rows: ExchangeSample[]): TerminalModel {
  const model: TerminalModel = { version: 1, cells: {}, priors: {}, samples: rows.length };
  if (!rows.length) throw new Error("no exchange samples");
  for (const r of rows) {
    if (!DUEL_OPTIONS.includes(r.option) || !Number.isFinite(r.reward)) throw new Error("invalid exchange sample");
    for (const [table, key] of [[model.cells, `${r.state}|${r.option}`], [model.priors, r.option]] as const) {
      const cell = table[key] ??= { n: 0, reward: 0, next: {}, terminal: 0 };
      cell.n++; cell.reward += r.reward;
      if (r.next === null) cell.terminal++; else cell.next[r.next] = (cell.next[r.next] ?? 0) + 1;
    }
  }
  return model;
}
const valueCaches = new WeakMap<TerminalModel, Map<string, number>>();
export function terminalOption(model: TerminalModel, state: string, available: readonly DuelOption[], horizon = 4): DuelOption {
  if (model.version !== 1 || !available.length) throw new Error("invalid terminal model or options");
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 8) throw new Error("invalid planning horizon");
  let cache = valueCaches.get(model);
  if (!cache) { cache = new Map(); valueCaches.set(model, cache); }
  const q = (s: string, option: DuelOption, depth: number): number => {
    const key = `${s}|${option}|${depth}`;
    if (cache.has(key)) return cache.get(key)!;
    const specific = model.cells[`${s}|${option}`], prior = model.priors[option];
    const value = (cell: Cell | undefined): number => {
      if (!cell) return 0;
      let total = cell.reward / cell.n;
      // Terminal mass deliberately has no successor value.
      if (depth > 1) for (const [next, count] of Object.entries(cell.next)) {
        total += 0.9 * count / cell.n * Math.max(...DUEL_OPTIONS.map((a) => q(next, a, depth - 1)));
      }
      return total;
    };
    const weight = specific ? specific.n / (specific.n + 8) : 0;
    const result = weight * value(specific) + (1 - weight) * value(prior);
    cache.set(key, result); return result;
  };
  return available.reduce((best, option) => q(state, option, horizon) > q(state, best, horizon) ? option : best);
}
export function terminalModelMind(model: TerminalModel, seed: number): Mind {
  validateTerminalModel(model);
  const executor = golemFencer(seed, GOLEM_TACTICS_V2, (available, reading, view) =>
    terminalOption(model, exchangeState(reading, view), available));
  return { name: "lab-terminal-planner", decide: (view, dt) => executor.decide(view, dt) };
}
