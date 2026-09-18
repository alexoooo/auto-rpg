import type { GolemSetup } from "../bout.ts";
import { defaultGolemSetup, describeGolemSetup, golemSetupRefusal } from "./build.ts";

/**
 * The named bodies, which are what an enemy *is*.
 *
 * A golem has no equipment: its weapons are its body, so picking an opponent is picking a build.
 * These twelve are the standing pool -- one slot moved at a time from the default where that is
 * the point (the wheel, the multileg, the plated trunk, the ram head), and the weapons of the
 * matchup set each in the default's hands.
 *
 * They lived in the tournament harness until 2026-09-18 and were the pool every rating in the
 * retired research record stood on. The harness is gone; the bodies are the good part of it and
 * are kept here, where the game can reach them.
 */
export interface NamedBuild {
  readonly name: string;
  readonly setup: GolemSetup;
}

const setup = (over: Partial<GolemSetup>): GolemSetup => ({ ...defaultGolemSetup(), ...over });

const both = (chain: string, terminal: string): Partial<GolemSetup> =>
  ({ primary: { chain, terminal }, secondary: { chain, terminal } });

export const NAMED_BUILDS: readonly NamedBuild[] = Object.freeze([
  { name: "default", setup: setup({}) },
  { name: "two-blades", setup: setup(both("wrist", "blade")) },
  { name: "mace", setup: setup({ primary: { chain: "wrist", terminal: "mace" } }) },
  { name: "maul", setup: setup(both("wrist", "maul")) },
  { name: "whip", setup: setup({ primary: { chain: "wrist", terminal: "whip" } }) },
  { name: "fists", setup: setup(both("wrist", "fist")) },
  // No weapons at all -- a head and a charge. It decided none of its screening bouts under the
  // old damage scale, which was a verdict on that scale rather than on the body.
  { name: "ram-capped", setup: setup({ head: "head.ram", ...both("none", "none") }) },
  { name: "ram-blade", setup: setup({ head: "head.ram" }) },
  { name: "wheel", setup: setup({ locomotion: "locomotion.wheel" }) },
  { name: "multileg", setup: setup({ locomotion: "locomotion.multileg" }) },
  { name: "plated", setup: setup({ torso: "torso.plated" }) },
  {
    name: "pitch-blade",
    setup: setup({
      primary: { chain: "pitch", terminal: "blade" },
      secondary: { chain: "pitch", terminal: "plate" },
    }),
  },
].map((build) => Object.freeze({ ...build, setup: Object.freeze(build.setup) })));

/**
 * Refuses at load rather than in a fight.
 *
 * A build the registry has stopped offering is a broken roster entry, and the place to find that
 * out is the first import, not the frame that tries to stand it up.
 */
for (const build of NAMED_BUILDS) {
  const refusal = golemSetupRefusal(build.setup);
  if (refusal !== null) throw new Error(`named build "${build.name}" is refused: ${refusal}`);
}

/** The build under a name, or null. Refuses rather than falling back to the default. */
export const namedBuild = (name: string): NamedBuild | null =>
  NAMED_BUILDS.find((build) => build.name === name) ?? null;

/** What a named build is made of, for a picker row or a wave caption. */
export const describeNamedBuild = (build: NamedBuild): string => describeGolemSetup(build.setup);
