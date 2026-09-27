/** Page-scoped experiments. Read before constructing any body; a new URL rebuilds the world. */
import { DEFAULT_CHANNEL_FLAGS, parseChannelFlags, type ChannelFlags } from "./body-command.ts";

export const CHANNELS_PARAM = "channels";

/** Missing means shipped defaults; an explicit empty value means all experiments off. */
export function channelFlagsFromSearch(search: string): ChannelFlags {
  const query = new URLSearchParams(search);
  if (!query.has(CHANNELS_PARAM)) return { ...DEFAULT_CHANNEL_FLAGS };
  if (query.getAll(CHANNELS_PARAM).length !== 1) throw new Error("channels must appear only once");
  const off = { ...DEFAULT_CHANNEL_FLAGS };
  for (const key of Object.keys(off) as (keyof ChannelFlags)[]) off[key] = false;
  return { ...off, ...parseChannelFlags(query.get(CHANNELS_PARAM)) };
}

/** Keep the screen, matchup, seed and other dials when switching experiments. */
export function channelSearch(search: string, flags: ChannelFlags): string {
  const query = new URLSearchParams(search);
  query.set(CHANNELS_PARAM, Object.keys(DEFAULT_CHANNEL_FLAGS).filter(key => flags[key as keyof ChannelFlags]).join(","));
  return `?${query}`;
}
