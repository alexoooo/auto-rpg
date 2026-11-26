import type { BodyView } from "../../../control/body.ts";
import type { Senses } from "../../../core/bodies/senses.ts";
import { sameOrders, type Orders } from "../../orders.ts";

/** **How many control steps apart a mind deciding at `rate` Hz decides** at `hz`: the nearest whole number, at least 1; every step where it names no rate. */
export const everyOf = (rate: number | undefined, hz: number): number => rate === undefined ? 1 : Math.max(1, Math.round(hz / rate));

/**
 * When an Option Mind decides again: every `every`th control step on its phase, and at once on
 * the step its body is back from another holder, its orders change, an action of its skills
 * has ended, or its chooser's time to decide afresh unasked has come.
 */
export class Pace {
  /** The step it last decided on, the orders it decided on then, the last action ended then, and whether it has decided at all. */
  readonly state = { decided: 0, orders: null as Orders | null, ended: 0, begun: false };
  private readonly every: number;
  private readonly offset: number;
  private readonly orders: (senses: Senses) => Orders | null;

  /** A pace of every `every`th step, on the steps `phase` of the way through each run of them (`BodyHost.phase`), reading its orders through `orders`. */
  constructor(every: number, phase: number, orders: (senses: Senses) => Orders | null) {
    if (!Number.isInteger(every) || every < 1 || !(phase >= 0 && phase < 1)) throw new Error(`a mind decides every whole number of steps on a phase in [0, 1), not every ${every} on ${phase}`);
    this.every = every;
    this.offset = Math.floor(phase * every);
    this.orders = orders;
  }

  /**
   * The seconds since its last decision where one is due this step, else null. The first is `dt`.
   * `ended` is the last action its skills ended (`Ended.sequence`, 0 for none); `next`, when its
   * chooser next decides afresh unasked, s (`Chooser.next`). A mind that decides every step asks
   * for no orders here.
   */
  since(view: BodyView, dt: number, ended: number, next: number): number | null {
    if (this.every === 1) return dt;
    const state = this.state, step = Math.round(view.time / dt), every = this.every, orders = this.orders(view.senses);
    if (state.begun && !view.resumed && ((step - this.offset) % every + every) % every !== 0 && view.time < next && ended === state.ended && sameOrders(orders, state.orders)) return null;
    const since = state.begun ? (step - state.decided) * dt : dt;
    state.decided = step;
    // The orders are copied: their provider may hand the same object again with other words in it.
    state.orders = orders === null ? null : structuredClone(orders);
    state.ended = ended;
    state.begun = true;
    return since;
  }
}
