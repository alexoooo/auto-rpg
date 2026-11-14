import type { SkillChoices } from "../core/bodies/spec/body.ts";

/**
 * **A scoped character's skills from a setup link** (`<scope>.skills=straight-punch/drive,stomp/stomp`):
 * each `skill/variation` it holds, none for an empty value; undefined where the link names none,
 * so its character's (`Character.skills`). A malformed name is kept as written, for the
 * character's resolution to refuse with its reason (`resolveCharacterChecked`).
 */
export function readSkills(query: URLSearchParams, scope: string): SkillChoices | undefined {
  const text = query.get(`${scope}.skills`);
  if (text === null) return undefined;
  return Object.freeze(text.split(",").map((one) => one.trim()).filter(Boolean));
}

/** Writes `skills` as `scope`'s link parameter (`readSkills`); undefined removes it, its character's. */
export function writeSkills(query: URLSearchParams, scope: string, skills: SkillChoices | undefined): void {
  const key = `${scope}.skills`;
  if (skills === undefined) query.delete(key);
  else query.set(key, skills.join(","));
}
