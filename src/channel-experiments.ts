import { DEFAULT_CHANNEL_FLAGS, setChannelFlags, type ChannelFlags } from "./body-command.ts";
import { CHANNELS_PARAM, channelFlagsFromSearch, channelSearch } from "./channel-query.ts";
import { routeFor } from "./app-route.ts";
import { EFFECTOR_PREVIEWS, EFFECTOR_PREVIEW_PARAM, effectorPreviewFromSearch } from "./effector-preview-query.ts";

/** Opt-in diagnostic, not a combat control. Applying it navigates because declarations are built once. */
export function configureChannelExperiments(): void {
  const flags = channelFlagsFromSearch(window.location.search);
  setChannelFlags(flags);
  if (!new URLSearchParams(window.location.search).has(CHANNELS_PARAM)) return;
  const arena = routeFor(window.location.search) === "arena";
  const activePreview = arena ? effectorPreviewFromSearch(window.location.search) : null;
  const panel = document.createElement("details");
  panel.id = "channel-experiments";
  Object.assign(panel.style, { position: "fixed", bottom: "8px", left: "8px", zIndex: "1000",
    padding: "8px", background: "#121820", color: "#eef2f6", font: "13px system-ui", maxWidth: "280px" });
  const summary = document.createElement("summary");
  summary.textContent = `Experimental controls: ${Object.keys(flags).filter(key => flags[key as keyof ChannelFlags]).join(", ") || "off"}`;
  if (activePreview) summary.textContent += ` · left ${activePreview} preview`;
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
  let preview: HTMLSelectElement | null = null;
  if (arena) {
    const label = document.createElement("label");
    label.style.display = "block";
    label.textContent = "Left fighter proposal preview ";
    preview = document.createElement("select");
    for (const [value, text] of [["", "Off"], ...EFFECTOR_PREVIEWS.map(kind => [kind, kind])] as const) {
      const option = document.createElement("option"); option.value = value; option.textContent = text;
      preview.append(option);
    }
    preview.value = activePreview ?? "";
    label.append(preview); panel.append(label);
    const about = document.createElement("p");
    about.textContent = "Preview repeats one arm proposal over the selected policy, not an expert search. Enable effector and choose a human blade, fist or mace.";
    panel.append(about);
  }
  const apply = document.createElement("button");
  apply.type = "button"; apply.textContent = "Apply and restart";
  apply.addEventListener("click", () => {
    const next = { ...flags };
    for (const [key, input] of inputs) next[key] = input.checked;
    const query = new URLSearchParams(channelSearch(window.location.search, next));
    if (arena && next.effector && preview?.value) query.set(EFFECTOR_PREVIEW_PARAM, preview.value);
    else query.delete(EFFECTOR_PREVIEW_PARAM);
    window.location.assign(`?${query}` + window.location.hash);
  });
  panel.append(apply);
  // Do not turn a diagnostic click into an arena order; releases still clear existing gestures/keys.
  for (const name of ["pointerdown", "pointermove", "keydown"] as const) {
    panel.addEventListener(name, event => event.stopPropagation());
  }
  document.body.append(panel);
}
