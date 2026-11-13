import type { SkillChoices } from "../core/bodies/spec/body.ts";

/**
 * **A scoped character's skills from a setup link** (`<scope>.skills=straight-punch:drive,stomp:stomp`):
 * each skill it has by the variation it runs, none for an empty value; undefined where the link
 * names none, so its model's character's (`characterSkills`). A malformed pair is kept as written,
 * for the character's resolution to refuse with its reason (`resolveCharacterChecked`).
 */
export function readSkills(query: URLSearchParams, scope: string): SkillChoices | undefined {
  const text = query.get(`${scope}.skills`);
  if (text === null) return undefined;
  const skills: Record<string, string> = {};
  for (const pair of text.split(",").map((one) => one.trim()).filter(Boolean)) {
    const [skill = "", variation = ""] = pair.split(":");
    skills[skill.trim()] = variation.trim();
  }
  return Object.freeze(skills);
}

/** Writes `skills` as `scope`'s link parameter (`readSkills`); undefined removes it, the model's character's. */
export function writeSkills(query: URLSearchParams, scope: string, skills: SkillChoices | undefined): void {
  const key = `${scope}.skills`;
  if (skills === undefined) query.delete(key);
  else query.set(key, Object.entries(skills).map(([skill, variation]) => `${skill}:${variation}`).join(","));
}
