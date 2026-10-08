/**
 * The competency suite: today's skills judged by what a person's motion is judged by
 * (`docs/reference/competencies.md`). Each competency wraps a fixture that already exists; one job
 * is one trial in one world, and `competencyFigures` reads a competency's figure off its trials.
 * The guard is the defense probe's trial and the rise the recovery trial
 * (`research/control-foundation-trials.mjs`); the rest are `competencyTrial`'s.
 */
import { modelSpec } from "../src/core/models.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { aimOf } from "../src/core/skills/strikes.ts";
import { PLANTED_PUNCH_EXECUTION } from "../src/core/skills/combat.ts";
import { fastestHeld } from "../src/core/control/stance-envelope.ts";
import { HUMAN_PUNCH, punchStand } from "./punch-calibration.mjs";
import { frontKickStand } from "./front-kicks.mjs";
import { shove, walk, turn } from "./core-stance-trials.mjs";

/** The competencies, in the order the roadmap's ladder takes them up. */
export const COMPETENCIES = Object.freeze(["stand", "guard", "punch", "walk", "rise", "kick", "run"]);

/** When a punch or a kick is first ordered, s: the stands' own `view.time >= 2`. */
const ORDERED = 2;

/**
 * What each competency's trials ask: shoves in N s a kilogram of the body's own mass, from `ways`
 * directions, watched `watch` s; walks at each of `speeds`, m/s, at `ways` headings, and a half
 * turn at `turn`; punches thrown
 * `seconds` at the punch cell's `place` (x right, height, ahead, m) and at full reach
 * (`fullReach`), the target moved by up to `offset` m by the seed; kicks at the kick stand's
 * target likewise; falls from `ways` directions of `impulse` N s/kg, watched `watch` s. A place
 * and a kick's target are at x1 and go with a physique's size (`placed`), so each body meets the
 * task in its own proportions.
 */
export const COMPETENCY = Object.freeze({
  stand: Object.freeze({ levels: Object.freeze([0.2, 0.3, 0.4, 0.5, 0.6, 0.8]), ways: 8, watch: 10 }),
  walk: Object.freeze({ speeds: Object.freeze([0.3, 0.5, 0.7, 1.0, 1.4]), ways: 4,
    turn: Object.freeze({ speed: 0.3, rate: 2 }) }),
  punch: Object.freeze({ seconds: 8, place: Object.freeze([0.1, 1.55, 0.55]), offset: 0.02 }),
  kick: Object.freeze({ seconds: 24, height: 0.45, ahead: 0.45, offset: 0.02 }),
  rise: Object.freeze({ ways: 4, impulse: 1.5, watch: 40 }),
});

/**
 * The human figure each competency is held to, with its source; null where none is sourced
 * (`docs/reference/competencies.md#targets`).
 */
export const HUMAN_TARGETS = Object.freeze({
  stand: null,
  guard: null,
  punch: Object.freeze({ speed: HUMAN_PUNCH.speed, speedSD: HUMAN_PUNCH.speedSD, source: HUMAN_PUNCH.source }),
  walk: Object.freeze({ comfortable: 1.393, maximum: 2.533, slowestComfortable: 1.272, source: "doi:10.1093/ageing/26.1.15" }),
  rise: Object.freeze({ share: 1, source: "doi:10.1111/j.1532-5415.1997.tb03088.x" }),
  kick: Object.freeze({ speed: 7.7, speedSD: 1.2, source: "doi:10.3390/sports11080141" }),
  run: null,
});

/**
 * The pass thresholds, the owner's decision (`docs/reference/competencies.md#thresholds`): each
 * gate's figure and the least or most it may read; a null figure is reported and not gated. Never
 * lowered after a held-out run. A competency passes only where it meets them at every rate of
 * `RATES` (`competencyPasses`).
 */
export const THRESHOLDS = Object.freeze({
  stand: Object.freeze({ level: 0.5 }),
  guard: Object.freeze({ share: 0.95 }),
  punch: Object.freeze({ speed: HUMAN_PUNCH.speed - HUMAN_PUNCH.speedSD, latency: 0.5, share: 1, landed: 0.95 }),
  walk: Object.freeze({ speed: HUMAN_TARGETS.walk.slowestComfortable, share: 1 }),
  rise: Object.freeze({ share: 0.95, seconds: 6 }),
  kick: Object.freeze({ speed: HUMAN_TARGETS.kick.speed - HUMAN_TARGETS.kick.speedSD, latency: null, share: 1, landed: 0.95 }),
  run: null,
});

/**
 * The physics rates a competency must meet its thresholds at, Hz: the game's, and four times it as
 * the convergence check (AGENTS.md, Measurement). The owner's decision.
 */
export const RATES = Object.freeze([120, 480]);

const sum = (values) => values.reduce((a, b) => a + b, 0);
const distance = (a, b) => Math.sqrt(sum(a.map((v, i) => (v - b[i]) * (v - b[i]))));
const mean = (values) => values.length ? sum(values) / values.length : null;
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** The body's own mass, kg: its segments', with nothing held, with `physique` if given. */
export function bodyMass(model, physique) {
  return sum(modelSpec(model, physique).segments.map((segment) => segment.mass.value));
}

/**
 * How far ahead a target at (`x`, `height`) stands when `hand`'s strike point touches it with the
 * arm straight from the shoulder where the body is built, m: the shoulder's centre plus the arm's
 * length (shoulder to elbow to wrist to the strike point, in the reference pose), the rest of the
 * way forward. Null if the arm cannot reach that height and side. With `physique`, its body's arm.
 */
export function fullReach(model, hand, x, height, physique) {
  const spec = modelSpec(model, physique), centre = (name) => spec.joints.find((joint) => joint.name === name).centre.value;
  const shoulder = centre(`shoulder.${hand}`), elbow = centre(`elbow.${hand}`), wrist = centre(`wrist.${hand}`);
  const strike = rigidPoints(spec, spec.segments.find((segment) => segment.name === `hand.${hand}`)).get(aimOf(spec, hand)).value;
  const length = distance(shoulder, elbow) + distance(elbow, wrist) + distance(wrist, strike);
  const across = x - shoulder[0], up = height - shoulder[1], ahead = length * length - across * across - up * up;
  return ahead > 0 ? shoulder[2] + Math.sqrt(ahead) : null;
}

/** A length of `COMPETENCY`, m at x1, for a body of `physique`: times its size. */
const placed = (length, physique) => length * (physique?.size ?? 1);

/** A job's physique field: absent for the default, so a default job is the job it always was. */
const physiqueOf = (physique) => physique && Object.keys(physique).length ? { physique } : {};

/**
 * The jobs of `competency` (or of every competency) for `model` with `physique` (`Physique`; the
 * default if absent) holding `held`, seed `seed`; a cell no fixture covers is an `unsupported`
 * job, so it stays in every count.
 */
export function competencyJobs({ competency, model, held, seed, physique }) {
  const fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296, signed = fraction * 2 - 1;
  const common = { model, ...physiqueOf(physique), held, seed }, jobs = [];
  const wanted = (name) => competency === undefined || competency === name;
  if (wanted("stand")) {
    const { levels, ways, watch } = COMPETENCY.stand, mass = bodyMass(model, physique);
    for (const level of levels) for (let k = 0; k < ways; k++) jobs.push({ ...common, task: "competency", competency: "stand",
      level, impulse: level * mass, degrees: (k + fraction) * 360 / ways, watch });
  }
  if (wanted("guard")) for (const hands of ["left", "right", "both"]) for (const variant of ["predict", "pose"]) jobs.push({
    ...common, task: "defense", competency: "guard", hands, variant, offset: signed * 0.04, angleOffset: signed * 0.1,
    watchSeconds: 10, checkpointSeconds: 2.5, sampleHz: 120 });
  if (wanted("punch")) {
    const { place, offset } = COMPETENCY.punch, [x, height, ahead] = place.map((length) => placed(length, physique));
    if (held === "empty") for (const hand of ["left", "right"]) {
      const across = signed * offset, up = height - signed * offset, side = hand === "right" ? x : -x;
      const reach = fullReach(model, hand, side + across, up, physique);
      for (const [placement, mode] of [["place", "hit"], ["reach", "hit"], ["place", "miss"]]) jobs.push({ ...common,
        task: "competency", competency: "punch", hand, placement, mode, across, height: up, ahead: placement === "reach" ? reach : ahead });
    } else jobs.push({ ...common, task: "unsupported", competency: "punch", capability: "a blow with a held item is that item's competency" });
  }
  if (wanted("walk")) {
    const { speeds, ways, turn: { speed, rate } } = COMPETENCY.walk;
    for (const pace of speeds) for (let k = 0; k < ways; k++) jobs.push({ ...common, task: "competency", competency: "walk",
      trial: "walk", speed: pace, degrees: (k + fraction) * 360 / ways });
    for (const sense of [1, -1]) jobs.push({ ...common, task: "competency", competency: "walk", trial: "turn", speed, rate, sense });
  }
  if (wanted("rise")) {
    const { ways, impulse, watch } = COMPETENCY.rise;
    for (let k = 0; k < ways; k++) jobs.push({ ...common, task: "recovery", competency: "rise", recovery: "staged-rise",
      degrees: (k + fraction) * 360 / ways, impulse, watch });
  }
  if (wanted("kick")) {
    const { offset } = COMPETENCY.kick, height = placed(COMPETENCY.kick.height, physique), ahead = placed(COMPETENCY.kick.ahead, physique);
    for (const foot of ["left", "right"]) for (const mode of ["hit", "miss"]) jobs.push({ ...common, task: "competency",
      competency: "kick", foot, mode, height: height + signed * offset, ahead });
  }
  return jobs;
}

/** The jobs that stand once a cell, not once a seed: the run, which no skill does yet. */
export function competencyGaps({ competency, model, held, physique }) {
  return competency === undefined || competency === "run"
    ? [{ model, ...physiqueOf(physique), held, task: "unsupported", competency: "run", capability: "no run: the stance's walk is the only gait" }] : [];
}

/** Faults of a strike stand's qualification that count blows in its window; the suite counts blows itself. */
const WINDOW_FAULTS = Object.freeze(["fewer than three complete measured hand impacts", "fewer than three verified returns", "fewer than three clean impacts"]);
/** How long before a window's end a swing must begin to count as a blow, s: time for it to land. */
const LANDING = 0.5;

/** The times at which `phase` is entered, in a run of (time, phase) changes. */
const entries = (changes, phase) => changes.filter((c, i) => c.phase === phase && changes[i - 1]?.phase !== phase).map((c) => c.time);

/**
 * A strike stand's reading `r` as blows: each swing begun `LANDING` s before the window's end
 * (`end`, s) is a blow, landed when an eligible impact of its launch has a speed (`speedOf`). A
 * hit succeeds with no fault but the window's and a blow landed; a miss with no fault and no
 * contact. Its latency is the first contact's after the order, and each landing's after its chamber
 * began (`changes`).
 */
function blows(job, r, changes, end, speedOf) {
  const swings = entries(changes, "swing"), chambers = entries(changes, "chamber"), counted = swings.filter((t) => t <= end - LANDING).length;
  const landed = r.impacts.filter((e) => e.eligible && e.launch <= counted && speedOf(e) !== null);
  const faults = r.qualification.faults.filter((f) => !WINDOW_FAULTS.includes(f));
  const success = faults.length === 0 && (job.mode === "miss" ? r.impacts.length === 0 : landed.length > 0);
  return { success, faults, fell: r.fell, blows: counted, landed: job.mode === "miss" ? 0 : landed.length, contacts: r.impacts.length,
    speeds: landed.map(speedOf), speed: mean(landed.map(speedOf)), impulse: mean(landed.map((e) => e.impulse)),
    peakForce: mean(landed.map((e) => e.peakStepForce)),
    firstContactSeconds: r.impacts.length ? r.impacts[0].time - ORDERED : null,
    cycleSeconds: landed.map((e) => { const start = chambers.filter((t) => t <= e.time).at(-1); return start === undefined ? null : e.time - start; }),
    assist: r.assist };
}

async function punchTrial(job) {
  const { seconds } = COMPETENCY.punch;
  const s = await punchStand({ model: job.model, hand: job.hand, family: "cross", hz: job.hz, seconds,
    ahead: job.ahead, height: job.height, across: job.across, armExtension: 0.5, mode: job.mode, pad: { face: "compliant" },
    paths: { elbowExtension: 0.5 }, execution: PLANTED_PUNCH_EXECUTION, matchedFeedback: true, actuation: job.actuation, physique: job.physique });
  const changes = [];
  const hook = s.world.beforeStep(() => {
    const phase = s.skills.report.strike.phase;
    if (phase !== changes.at(-1)?.phase) changes.push({ time: s.world.time, phase });
  });
  try {
    s.step(Math.round(seconds * s.world.hz));
    const r = s.reading();
    return { status: "measured", outcome: { ...blows(job, r, changes, seconds, (e) => e.last10cmSpeed),
      effectiveMass: mean(r.impacts.filter((e) => e.eligible && e.effectiveMass !== null).map((e) => e.effectiveMass)), returned: r.cycles.returned[job.hand] },
    harness: r.harness, limits: ["the planted cross of the path fighter's combat skills", "a sliding, rotation-locked pad; impulse and force are reported, not gated"] };
  } finally { hook.dispose(); s.dispose(); }
}

async function kickTrial(job) {
  const { seconds } = COMPETENCY.kick;
  const s = await frontKickStand({ model: job.model, held: job.held, foot: job.foot, hz: job.hz, seconds,
    height: job.height, ahead: job.ahead, mode: job.mode, actuation: job.actuation, physique: job.physique });
  try {
    s.step(s.seconds(seconds));
    const r = s.reading();
    return { status: "measured", outcome: { ...blows(job, r, r.phases, seconds, (e) => e.preImpact.speed), returned: r.report.returned[job.foot] },
      harness: r.harness, limits: ["the front kick of the path fighter's combat skills", "a sliding, rotation-locked pad; impulse and force are reported, not gated"] };
  } finally { s.dispose(); }
}

/** One trial of a competency that wraps a stand fixture; the guard and the rise are not here. */
export async function competencyTrial(job) {
  const { model, held, hz, actuation, physique } = job;
  switch (job.competency) {
    case "stand": {
      const r = await shove({ model, held, hz, actuation, physique, impulse: job.impulse, degrees: job.degrees, watch: job.watch });
      return { status: "measured", outcome: { ...r, success: !r.fell }, limits: ["a shove at the middle trunk's centre of mass, level"] };
    }
    case "walk": if (job.trial === "walk") {
      const r = await walk({ model, held, hz, actuation, physique, speed: job.speed, degrees: job.degrees });
      return { status: "measured", outcome: { ...r, success: !r.fell },
        limits: ["the stance's walk, asked a pace; no gait is chosen"] };
    } else {
      const r = await turn({ model, held, hz, actuation, physique, speed: job.speed, rate: job.rate, sense: job.sense });
      return { status: "measured", outcome: { ...r, success: !r.fell }, limits: ["half a turn walking"] };
    }
    case "punch": return punchTrial(job);
    case "kick": return kickTrial(job);
    default: throw new Error(`no competency trial for ${job.competency}`);
  }
}

/** What separates a competency's figures within a cell: the hand, foot, placement, mode or trial. */
export function competencyPart(job) {
  switch (job.competency) {
    case "punch": return job.task === "unsupported" ? "" : `${job.hand}/${job.placement}/${job.mode}`;
    case "kick": return `${job.foot}/${job.mode}`;
    case "walk": return job.trial;
    case "guard": return `${job.hands}/${job.variant}`;
    case "stand": case "rise": case "run": return "";
    default: throw new Error(`unknown competency ${job.competency}`);
  }
}

/**
 * A competency's figures over one cell's rows (one model, loadout and rate): counts are plain, and
 * the caller gives them their intervals. Each figure says whether it meets its threshold
 * (`THRESHOLDS`); a cell with an unsupported row meets nothing. The walk's figure is the speed
 * travelled: at each asked speed where no walk fell, as at every slower one, the slowest heading's
 * speed made along its way, and the best of those.
 */
export function competencyFigures(competency, rows) {
  const measured = rows.filter((r) => r.result.status === "measured"), unsupported = rows.length - measured.length;
  const outcome = (r) => r.result.outcome, threshold = THRESHOLDS[competency];
  const parts = new Map();
  for (const row of measured) {
    const part = competencyPart(row.job);
    if (!parts.has(part)) parts.set(part, []);
    parts.get(part).push(row);
  }
  const base = { competency, trials: rows.length, measured: measured.length, unsupported };
  if (!measured.length) return { ...base, meets: false };
  switch (competency) {
    case "stand": {
      const { levels } = COMPETENCY.stand, at = levels.map((level) => measured.filter((r) => r.job.level === level));
      const level = fastestHeld({ speeds: levels, ways: Math.min(...at.map((rs) => rs.length)), held: at.map((rs) => rs.filter((r) => outcome(r).success).length) });
      return { ...base, levels: levels.map((l, i) => ({ level: l, held: at[i].filter((r) => outcome(r).success).length, count: at[i].length,
        steps: mean(at[i].map((r) => outcome(r).steps)) })), level, meets: !unsupported && level >= threshold.level };
    }
    case "walk": {
      const walks = parts.get("walk") ?? [], turns = parts.get("turn") ?? [], { speeds } = COMPETENCY.walk;
      const at = speeds.map((speed) => walks.filter((r) => r.job.speed === speed));
      const upright = fastestHeld({ speeds, ways: Math.min(...at.map((rs) => rs.length)), held: at.map((rs) => rs.filter((r) => !outcome(r).fell).length) });
      const made = at.map((rs) => rs.length ? Math.min(...rs.map((r) => outcome(r).along)) : null);
      const travelled = made.filter((v, i) => speeds[i] <= upright && v !== null);
      const speed = Math.max(0, ...travelled);
      return { ...base, speeds: speeds.map((s, i) => ({ speed: s, held: at[i].filter((r) => !outcome(r).fell).length, count: at[i].length,
        fell: at[i].filter((r) => outcome(r).fell).length, along: mean(at[i].map((r) => outcome(r).along)), slowest: made[i] })),
        speed, upright, turns: { held: turns.filter((r) => outcome(r).success).length, count: turns.length },
        meets: !unsupported && speed >= threshold.speed && turns.every((r) => outcome(r).success) };
    }
    case "rise": {
      const fallen = measured.filter((r) => outcome(r).fell), risen = fallen.filter((r) => outcome(r).risen && outcome(r).up);
      const seconds = median(risen.map((r) => outcome(r).seconds));
      return { ...base, fallen: fallen.length, risen: risen.length, seconds, slowest: risen.length ? Math.max(...risen.map((r) => outcome(r).seconds)) : null,
        meets: !unsupported && fallen.length > 0 && risen.length >= threshold.share * fallen.length && seconds !== null && seconds <= threshold.seconds };
    }
    case "guard": {
      const figure = [...parts].map(([part, rs]) => ({ part, success: rs.filter((r) => outcome(r).success).length, count: rs.length,
        protectedImpulse: mean(rs.map((r) => outcome(r).protectedImpulse)), fell: rs.filter((r) => outcome(r).fell).length }));
      const predict = measured.filter((r) => r.job.variant === "predict");
      return { ...base, parts: figure, meets: !unsupported && predict.length > 0
        && predict.filter((r) => outcome(r).success).length >= threshold.share * predict.length };
    }
    case "punch": case "kick": {
      const figure = [...parts].map(([part, rs]) => {
        const speeds = rs.flatMap((r) => outcome(r).speeds), latency = rs.map((r) => outcome(r).firstContactSeconds).filter((t) => t !== null);
        const hit = rs[0].job.mode === "hit", success = rs.filter((r) => outcome(r).success).length;
        const blows = sum(rs.map((r) => outcome(r).blows)), landed = sum(rs.map((r) => outcome(r).landed));
        return { part, success, count: rs.length, ...(hit ? { blows: { landed, count: blows } } : {}),
          fell: rs.filter((r) => outcome(r).fell).length, speed: mean(speeds),
          slowest: speeds.length ? Math.min(...speeds) : null, firstContactSeconds: mean(latency),
          cycleSeconds: mean(rs.flatMap((r) => outcome(r).cycleSeconds).filter((t) => t !== null)),
          impulse: mean(rs.map((r) => outcome(r).impulse).filter((v) => v !== null)),
          meets: success >= threshold.share * rs.length && (!hit || blows > 0 && landed >= threshold.landed * blows && speeds.length > 0 && Math.min(...speeds) >= threshold.speed
            && (threshold.latency === null || latency.length === rs.length && Math.max(...latency) <= threshold.latency)) };
      });
      return { ...base, parts: figure, meets: !unsupported && figure.every((p) => p.meets) };
    }
    case "run": return { ...base, meets: false };
    default: throw new Error(`unknown competency ${competency}`);
  }
}

/**
 * Whether each competency passes, from its figures at several rates (`summarizeCompetencies`'
 * entries, from one run a rate): by competency, model, physique, loadout and actuation, it passes
 * where every rate of `RATES` is there and meets its threshold.
 */
export function competencyPasses(figures) {
  const groups = new Map();
  for (const { competency, model, physique, held, actuation, hz, meets } of figures) {
    const key = [competency, model, physique, held, actuation].join("/");
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(hz, meets);
  }
  return [...groups].map(([cell, rates]) => ({ cell, meets: Object.fromEntries([...rates].sort(([a], [b]) => a - b)),
    passes: RATES.every((hz) => rates.get(hz) === true) }));
}
