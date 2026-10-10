const MODELS = ["workshop-fighter", "workshop-rogue"], LOADOUTS = ["empty", "club"];
const DIRECTIONS = Array.from({ length: 16 }, (_, k) => k * 22.5), CARDINAL = [0, 90, 180, 270];

/** Complete directional coverage, censored timings, and the owner's recovery acceptance thresholds. */
export function dynamicRiseQualification(rows) {
  const groups = MODELS.flatMap(model => LOADOUTS.map(held => {
    const selected = rows.filter(r => r.model === model && r.held === held);
    const complete = selected.length === DIRECTIONS.length && DIRECTIONS.every(degrees =>
      selected.filter(r => r.degrees === degrees).length === 1);
    const times = selected.map(r => r.success ? r.seconds : Infinity).sort((a, b) => a - b);
    const median = complete ? (times[7] + times[8]) / 2 : Infinity;
    const successes = selected.filter(r => r.success).length, falls = selected.filter(r => r.fell).length;
    const cardinal = CARDINAL.every(degrees => selected.some(r => r.degrees === degrees && r.success));
    return { model, held, trials: selected.length, falls, successes,
      median: Number.isFinite(median) ? median : null, complete, cardinal,
      pass: complete && falls === 16 && successes >= 15 && median <= 4 && cardinal };
  }));
  const successes = groups.reduce((sum, g) => sum + g.successes, 0);
  const complete = rows.length === 64 && groups.every(g => g.complete);
  return { target: { median: 4, deadline: 6, minimum: "61 of 64 overall, 15 of 16 per group, every cardinal direction" },
    groups, successes, trials: rows.length, complete,
    pass: complete && successes >= 61 && groups.every(g => g.pass) };
}
