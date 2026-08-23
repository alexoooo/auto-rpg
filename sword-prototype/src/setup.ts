import { POLICIES } from "./mind";
import {
  EQUIPMENT,
  UNITS,
  withControl,
  withEquipment,
  withPolicy,
  withUnit,
  type Control,
  type Matchup,
} from "./bout";
import type { Side } from "./physics";

/**
 * The screen before the fight.
 *
 * It lives inside the curtain that was already there rather than in a second
 * overlay of its own, which is the plan's instruction and is also the only way
 * the pause key keeps working: `Esc` has always raised `#curtain`, and a setup
 * screen somewhere else would have meant two things that cover the arena and a
 * rule about which of them wins.
 *
 * The two corners are generated from `UNITS` and `POLICIES` rather than written
 * out in `index.html`, so an option that exists is selectable and an option that
 * is selectable exists. Hand-written markup is how a picker ends up offering a
 * policy the code no longer has, and the failure is silent right up until
 * somebody selects it.
 *
 * This holds the live selection and `src/bout.ts` holds the rules that constrain
 * it -- notably that there is one of you, so taking a side gives the other back
 * to its policy. Two radio groups cannot express that between them, because
 * neither knows the other exists; `withControl` does, and `render` puts its
 * answer back into both groups. That is why every change re-reads the whole
 * screen from the matchup instead of trusting the control that was just
 * clicked.
 */
export class SetupScreen {
  private readonly host: HTMLElement;
  private matchup: Matchup;

  private readonly units: Record<Side, HTMLSelectElement>;
  private readonly policies: Record<Side, HTMLSelectElement>;
  private readonly hands: Record<"handA" | "handB", Record<Side, HTMLSelectElement>>;
  private readonly controls: Record<Side, HTMLInputElement[]>;

  constructor(host: HTMLElement, matchup: Matchup) {
    this.host = host;
    this.matchup = matchup;

    host.innerHTML = `${this.corner("left", "Left")}${this.corner("right", "Right")}`;

    const one = <T extends HTMLElement>(selector: string): T => {
      const found = host.querySelector<T>(selector);
      if (!found) throw new Error(`the setup screen is missing ${selector}`);
      return found;
    };
    const pick = <T extends HTMLElement>(field: string): Record<Side, T> => ({
      left: one<T>(`[data-side="left"][data-field="${field}"]`),
      right: one<T>(`[data-side="right"][data-field="${field}"]`),
    });

    this.units = pick<HTMLSelectElement>("unit");
    this.policies = pick<HTMLSelectElement>("policy");
    this.hands = {
      handA: pick<HTMLSelectElement>("handA"),
      handB: pick<HTMLSelectElement>("handB"),
    };
    this.controls = {
      left: [...host.querySelectorAll<HTMLInputElement>('[data-side="left"][data-field="control"]')],
      right: [...host.querySelectorAll<HTMLInputElement>('[data-side="right"][data-field="control"]')],
    };

    // One delegated listener rather than seven. The controls are built here and
    // never replaced -- `render` writes values into them -- so there is nothing
    // to rebind and nothing to leak.
    host.addEventListener("change", this.onChange);
    this.render();
  }

  /** What the Fight button should start. */
  get selection(): Matchup {
    return this.matchup;
  }

  /**
   * Put a matchup back on the screen.
   *
   * `Space` from a finished bout comes back here with the same one selected,
   * because the thing you want after a bout is the same bout again. Nothing else
   * edits the matchup, so this is usually a no-op -- and it is called anyway,
   * because "the screen happens to still have it" is not the same promise as
   * "the screen is showing what is about to be fought".
   */
  show(matchup: Matchup): void {
    this.matchup = matchup;
    this.render();
  }

  dispose(): void {
    this.host.removeEventListener("change", this.onChange);
  }

  private corner(side: Side, title: string): string {
    const options = (items: readonly { name: string; label: string }[]): string =>
      items.map((item) => `<option value="${item.name}">${item.label}</option>`).join("");

    // The policy picker stays enabled on the side a person is driving, and that
    // is not an oversight. Session 07 lets you leave a body mid-fight, and the
    // one you leave picks its policy back up -- so what is chosen here is what
    // that fighter becomes the moment you step out of it, which is worth being
    // able to set before you step in.
    return `
      <div class="corner">
        <div class="corner-title">${title}</div>
        <label class="field">
          <span class="field-name">Unit</span>
          <select data-side="${side}" data-field="unit">${options(UNITS)}</select>
        </label>
        <label class="field">
          <span class="field-name">Policy</span>
          <select data-side="${side}" data-field="policy">${options(POLICIES)}</select>
        </label>
        <label class="field">
          <span class="field-name">Hand A</span>
          <select data-side="${side}" data-field="handA">${options(EQUIPMENT)}</select>
        </label>
        <label class="field">
          <span class="field-name">Hand B</span>
          <select data-side="${side}" data-field="handB">${options(EQUIPMENT)}</select>
        </label>
        <div class="field">
          <span class="field-name">Control</span>
          <span class="choice">
            <label><input type="radio" name="control-${side}" value="mind"
              data-side="${side}" data-field="control" /> mind</label>
            <label><input type="radio" name="control-${side}" value="you"
              data-side="${side}" data-field="control" /> you</label>
          </span>
        </div>
      </div>
    `;
  }

  private readonly onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
    const side = target.dataset.side as Side | undefined;
    if (side !== "left" && side !== "right") return;

    switch (target.dataset.field) {
      case "unit":
        this.matchup = withUnit(this.matchup, side, target.value);
        break;
      case "handA":
      case "handB":
        // Straight through the reducer, club rule and all. The screen does not
        // know that choosing a club fills both hands; `render` below re-reads
        // every control from the matchup afterwards, which is the same
        // arrangement that lets `withControl` move the *other* corner.
        this.matchup = withEquipment(this.matchup, side, target.dataset.field, target.value);
        break;
      case "policy":
        this.matchup = withPolicy(this.matchup, side, target.value);
        break;
      case "control":
        this.matchup = withControl(this.matchup, side, target.value as Control);
        break;
      default:
        return;
    }
    this.render();
  };

  private render(): void {
    for (const side of ["left", "right"] as const) {
      const setup = this.matchup[side];
      this.units[side].value = setup.unit;
      this.policies[side].value = setup.policy;
      this.hands.handA[side].value = setup.handA;
      this.hands.handB[side].value = setup.handB;
      for (const button of this.controls[side]) button.checked = button.value === setup.control;
    }
  }
}
