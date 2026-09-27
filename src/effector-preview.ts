import { isCommandMind, type BodyMind, type CommandMind, type FighterView } from "./mind.ts";
import { copyBodyCommand, freshBodyCommand, intentToCommand } from "./body-command.ts";
import { applyEffectorTrajectory, effectorTrajectory } from "./effector-trajectories.ts";
import type { EffectorPreviewKind } from "./effector-preview-query.ts";
import type { Orders } from "./orders.ts";

/** Repeats one proposed arm trajectory over a policy; explicitly not an expert or a combat benchmark. */
export class EffectorPreviewMind implements CommandMind {
  readonly name: string;
  readonly obeysOrders: boolean | undefined;
  private readonly base: BodyMind;
  private readonly kind: EffectorPreviewKind;
  private elapsed = 0;
  private readonly out = freshBodyCommand();

  constructor(base: BodyMind, kind: EffectorPreviewKind) {
    this.base = base; this.kind = kind;
    this.name = `${base.name}+${kind}-preview`;
    this.obeysOrders = base.obeysOrders;
  }

  command(view: FighterView, dt: number, orders?: Orders | null) {
    if (isCommandMind(this.base)) copyBodyCommand(this.base.command(view, dt, orders), this.out);
    else intentToCommand(this.base.decide(view, dt, orders), this.out);
    // Physics-clock time only: pause freezes the demonstration too. Each two-second cycle has
    // a short lead-in, the 0.6 s trajectory, and a return to the base policy's own command.
    const phase = this.elapsed % 2 - .3;
    if (phase >= 0 && phase < .6) {
      const hand = Math.floor(this.elapsed / 2) % 2 === 0 ? "primary" : "secondary";
      applyEffectorTrajectory(this.out, view, effectorTrajectory(this.kind, hand), phase);
    }
    this.elapsed += dt;
    return this.out;
  }

  captureState(): Record<string, unknown> { return { base: this.base, elapsed: this.elapsed, out: this.out }; }
  restoreState(state: Record<string, unknown>): void { this.elapsed = state.elapsed as number; }
}
