import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { Profile } from "../../skills/framework/profile.ts";
import type { Sites } from "./option.ts";
import type { Walker } from "./walk.ts";
import type { OptionRecord } from "./record.ts";

/** Construction protocol owned by the profile-based evaluation model. */
export const PROFILE_MODEL = "profiles/1";
export interface ProfileTables { readonly strikes: readonly Profile[]; readonly edges: readonly Profile[] }

/**
 * **What the profile model gives its compatible Option kinds** to make them from: its body's spec, the
 * world's rate (Hz) and the part lookup; the legs its body goes by (whose gaits its walks name), its
 * Options as its config names them, and the profile tables it predicts from (`ProfileTables`); what
 * the mind itself runs on: its walk and its Options' record of their tries (`OptionRecord`); and
 * the sites its options name (`Sites`, filled once every option is made). A kind builds anything
 * else it needs from these.
 */
export interface ProfileOptionContext {
  readonly spec: BodySpec;
  readonly hz: number;
  /** The rate its mind decides at, Hz (`OptionMindConfig.rate`); the world's unless given. */
  readonly rate?: number;
  /** The steps its body's command waits (`Body.delay`). */
  readonly delay: number;
  readonly parts: PartLookup;
  readonly legs: PartConfig;
  readonly guards?: readonly PartConfig[];
  /** Its mind's Options, as its config names them, in rank order. */
  readonly options: readonly PartConfig[];
  readonly tables: ProfileTables;
  readonly walk: Walker;
  readonly record: OptionRecord;
  readonly sites: Sites;
}
