import { DEFAULT_CHANNEL_FLAGS, setChannelFlags, type ChannelFlags } from "./body-command.ts";
import { CHANNELS_PARAM, channelFlagsFromSearch, channelSearch } from "./channel-query.ts";

/** Opt-in diagnostic, not a combat control. Applying it navigates because declarations are built once. */
export function configureChannelExperiments(): void {
  const flags = channelFlagsFromSearch(window.location.search);
  setChannelFlags(flags);
  if (!new URLSearchParams(window.location.search).has(CHANNELS_PARAM)) return;
  const panel = document.createElement("details");
  panel.id = "channel-experiments";
  Object.assign(panel.style, { position: "fixed", bottom: "8px", left: "8px", zIndex: "1000",
    padding: "8px", background: "#121820", color: "#eef2f6", font: "13px system-ui", maxWidth: "280px" });
  const summary = document.createElement("summary");
  summary.textContent = `Experimental controls: ${Object.keys(flags).filter(key => flags[key as keyof ChannelFlags]).join(", ") || "off"}`;
  panel.append(summary);
  const note = document.createElement("p");
  note.textContent = "Enables channels for command minds. Existing policies keep their usual commands. Applying starts a new page.";
  panel.append(note);
  const inputs = new Map<keyof ChannelFlags, HTMLInputElement>();
  for (const key of Object.keys(DEFAULT_CHANNEL_FLAGS) as (keyof ChannelFlags)[]) {
    const label = document.createElement("label");
    label.style.display = "block";
    const input = document.createElement("input");
    input.type = "checkbox"; input.checked = flags[key];
    inputs.set(key, input);
    label.append(input, ` ${key}`);
    panel.append(label);
  }
  const apply = document.createElement("button");
  apply.type = "button"; apply.textContent = "Apply and restart";
  apply.addEventListener("click", () => {
    const next = { ...flags };
    for (const [key, input] of inputs) next[key] = input.checked;
    window.location.assign(channelSearch(window.location.search, next) + window.location.hash);
  });
  panel.append(apply);
  // Do not turn a diagnostic click into an arena order; releases still clear existing gestures/keys.
  for (const name of ["pointerdown", "pointermove", "keydown"] as const) {
    panel.addEventListener(name, event => event.stopPropagation());
  }
  document.body.append(panel);
}
