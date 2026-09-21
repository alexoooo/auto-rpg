import { replay } from "./environment.mjs";

/** Presentation-only mesh poses, not restorable physics snapshots. */
export async function exportPoses(record, { deadline = Infinity } = {}) {
  const env = await replay(record, 0, { deadline });
  try {
    const geometry = env.geometry(), frames = [env.pose()];
    for (const expected of record.steps) {
      if (Date.now() >= deadline) throw new Error("pose export deadline reached");
      const actual = env.step(expected.action);
      if (actual.trace !== expected.trace) throw new Error("pose reconstruction diverged");
      frames.push(env.pose());
    }
    return { version: 1, replayId: record.id, geometry, frames,
      description: "Recorded physical meshes, not decorative art. Playback has no physics authority." };
  } finally { env.close(); }
}
