/**
 * Drawing a run: axes, a path a series, a band where the row printed an error, and a readout.
 * Session 02 of the learn set.
 *
 * ## Why there is no chart library here
 *
 * The page draws six kinds of line and a band. A dependency for that would be a dependency this
 * directory's manifest, its lockfile, its build and its docs gate all have to learn about, in a
 * tree whose whole boundary rule is that it keeps its own -- and it would arrive with a layout
 * engine, a theme system and an animation loop for a job that is a `<path>` and a `<text>`. Inline
 * SVG has no build step, no version to pin and nothing to go stale, and the entire drawing surface
 * is `drawLines`.
 *
 * ## What this file is not allowed to know
 *
 * It takes `Series` values and draws them. It does not read a file, does not know what a column
 * means, and does not decide whether two series may share an axis -- `onePool` in `runs.ts` decides
 * that, this file asks it and prints the refusal where the chart would have been. The division is
 * the one the session was built on: everything that can be wrong in a way only a test can see is
 * in `runs.ts`, and everything here can be judged by looking at it.
 *
 * **A refusal is drawn rather than thrown**, which is the one piece of judgement this file does
 * carry. A panel that cannot be drawn because its series were rated on two pools has something to
 * say, and saying it in the panel's own frame -- beside the legend that names the runs -- is what
 * turns a rule into an explanation. An exception would reach the console, where the owner is not
 * looking.
 *
 * ## The palette is fixed by series order and not by name
 *
 * Six colours, assigned by position. A palette keyed on a run's name would give the same arm two
 * colours in two sessions depending on which file was opened first, and a legend read against a
 * chart from yesterday would be wrong in the way nobody checks. Position is stable within a page
 * load and obviously arbitrary, which is the honest arrangement: the legend is the key, and the
 * colour is only a way of telling one line from the next.
 */
import { onePool, type Pool, type Series } from "./runs.ts";

/**
 * Nine lines, in the order the page adds them; a tenth series repeats the first colour.
 *
 * Nine rather than six because the spread panel is one line an action axis and there are nine of
 * them, and a panel that runs out of colours halfway through is a panel whose legend has to be
 * read twice.
 */
export const PALETTE = [
  "#7fd4ff", "#ffc65a", "#8ce99a", "#ff8fa3", "#c0a6ff",
  "#ffd8a8", "#63e6be", "#f783ac", "#a5b4fc",
];

const NS = "http://www.w3.org/2000/svg";

const svgElement = (tag: string, attributes: Record<string, string | number>): SVGElement => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
};

/** The plot's inset: room for a y axis on the left and an iteration axis underneath. */
const MARGIN = { left: 58, right: 16, top: 12, bottom: 30 };

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Ticks a person reads: at most `wanted` of them, on a 1/2/5 step, covering the range.
 *
 * Not `range / wanted`, which produces axes labelled 0.0733, 0.1466 and so on -- correct, evenly
 * spaced and unreadable. The whole value of an axis is that a reader can place a point on it
 * without arithmetic.
 */
export function ticks(min: number, max: number, wanted: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const raw = (max - min) / Math.max(1, wanted);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= raw) ?? magnitude * 10;
  const out: number[] = [];
  for (let at = Math.ceil(min / step) * step; at <= max + step * 1e-9; at += step) out.push(at);
  return out;
}

const format = (value: number): string => {
  const size = Math.abs(value);
  if (size === 0) return "0";
  if (size >= 1000) return value.toFixed(0);
  if (size >= 10) return value.toFixed(1);
  if (size >= 1) return value.toFixed(2);
  return value.toFixed(size >= 0.01 ? 3 : 4);
};

/** How a series is placed on the y axis when several of them share a panel. */
export interface DrawOptions {
  readonly yLabel: string;
  /**
   * Give every series its own scale, drawn on a common 0-1 frame.
   *
   * The one panel that needs it holds KL, clip fraction, entropy and explained variance, whose
   * natural ranges differ by two orders of magnitude: on one axis the entropy is a line at the top
   * and the other three are a line at the bottom. With separate scales the shapes are comparable
   * and the numbers are not, so the y axis is deliberately left unlabelled and every value a
   * reader sees comes from the hover readout, which prints the real one.
   */
  readonly separateScales?: boolean;
}

const boundsOf = (list: readonly Series[], separate: boolean): Bounds => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const entry of list) {
    for (const x of entry.x) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    if (separate) continue;
    const lows = entry.lo.length === entry.y.length ? entry.lo : entry.y;
    const highs = entry.hi.length === entry.y.length ? entry.hi : entry.y;
    for (let i = 0; i < entry.y.length; i += 1) {
      minY = Math.min(minY, lows[i]!);
      maxY = Math.max(maxY, highs[i]!);
    }
  }
  if (separate) {
    minY = 0;
    maxY = 1;
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  if (minY === maxY) {
    minY -= 0.5;
    maxY += 0.5;
  }
  const pad = (maxY - minY) * 0.06;
  return { minX, maxX: maxX === minX ? minX + 1 : maxX, minY: minY - pad, maxY: maxY + pad };
};

/** A series' own range, for the separate-scales panel. */
const rangeOf = (entry: Series): { low: number; high: number } => {
  let low = Infinity;
  let high = -Infinity;
  for (const value of entry.y) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (!Number.isFinite(low)) return { low: 0, high: 1 };
  return low === high ? { low: low - 0.5, high: high + 0.5 } : { low, high };
};

/**
 * Draw a panel, and return the pool every series in it was measured on.
 *
 * Returns null when it drew a refusal instead of a chart, which is the only outcome other than a
 * drawn panel: an empty set draws an empty frame and says so.
 */
export function drawLines(
  svg: SVGSVGElement, list: readonly Series[], options: DrawOptions,
): Pool | null {
  while (svg.firstChild !== null) svg.removeChild(svg.firstChild);
  const box = svg.getBoundingClientRect();
  const width = Math.max(320, Math.round(box.width) || 900);
  const height = Math.max(160, Math.round(box.height) || 300);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const note = (text: string, klass: string): null => {
    const label = svgElement("text", { x: MARGIN.left, y: height / 2, class: klass });
    label.textContent = text;
    svg.appendChild(label);
    return null;
  };
  if (list.length === 0) return note("nothing selected", "empty");

  let pool: Pool;
  try {
    pool = onePool(list);
  } catch (error) {
    return note(error instanceof Error ? error.message : String(error), "refusal");
  }

  const separate = options.separateScales === true;
  const bounds = boundsOf(list, separate);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const atX = (x: number): number =>
    MARGIN.left + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * plotWidth;
  const atY = (y: number): number =>
    MARGIN.top + (1 - (y - bounds.minY) / (bounds.maxY - bounds.minY)) * plotHeight;

  const grid = svgElement("g", { class: "grid" });
  for (const value of ticks(bounds.minY, bounds.maxY, 5)) {
    const y = atY(value);
    if (y < MARGIN.top - 1 || y > MARGIN.top + plotHeight + 1) continue;
    grid.appendChild(svgElement("line", {
      x1: MARGIN.left, x2: MARGIN.left + plotWidth, y1: y, y2: y,
      class: Math.abs(value) < 1e-12 ? "zero" : "rule",
    }));
    if (separate) continue;
    const label = svgElement("text", { x: MARGIN.left - 6, y: y + 3, class: "tick y" });
    label.textContent = format(value);
    grid.appendChild(label);
  }
  for (const value of ticks(bounds.minX, bounds.maxX, 6)) {
    const x = atX(value);
    if (x < MARGIN.left - 1 || x > MARGIN.left + plotWidth + 1) continue;
    grid.appendChild(svgElement("line", {
      x1: x, x2: x, y1: MARGIN.top, y2: MARGIN.top + plotHeight, class: "rule",
    }));
    const label = svgElement("text", { x, y: height - 10, class: "tick x" });
    label.textContent = format(value);
    grid.appendChild(label);
  }
  const axis = svgElement("text", { x: 4, y: MARGIN.top + 10, class: "axis" });
  axis.textContent = separate ? "each on its own scale" : options.yLabel;
  grid.appendChild(axis);
  svg.appendChild(grid);

  // The band goes down first so that no line is hidden under a neighbour's shading.
  list.forEach((entry, index) => {
    if (entry.lo.length !== entry.y.length || entry.y.length === 0) return;
    const range = rangeOf(entry);
    const place = (value: number): number =>
      separate ? atY((value - range.low) / (range.high - range.low)) : atY(value);
    const forward = entry.x.map((x, i) => `${atX(x)},${place(entry.hi[i]!)}`);
    const back = entry.x.map((x, i) => `${atX(x)},${place(entry.lo[i]!)}`).reverse();
    svg.appendChild(svgElement("polygon", {
      points: [...forward, ...back].join(" "),
      fill: PALETTE[index % PALETTE.length]!,
      class: "band",
    }));
  });

  const points: { x: number; y: number; series: Series; index: number; colour: string }[] = [];
  list.forEach((entry, index) => {
    const colour = PALETTE[index % PALETTE.length]!;
    const range = rangeOf(entry);
    const place = (value: number): number =>
      separate ? atY((value - range.low) / (range.high - range.low)) : atY(value);
    const path = entry.x.map((x, i) => `${i === 0 ? "M" : "L"}${atX(x)} ${place(entry.y[i]!)}`);
    svg.appendChild(svgElement("path", { d: path.join(" "), stroke: colour, class: "line" }));
    entry.x.forEach((x, i) => {
      const cx = atX(x);
      const cy = place(entry.y[i]!);
      points.push({ x: cx, y: cy, series: entry, index: i, colour });
      const href = entry.link[i];
      if (href === null || href === undefined) return;
      // The watch link. Session 03 makes the arena honour `?snapshot=`; until it does the anchor
      // is written and the arena ignores it, which is deliberate -- the alternative is a page
      // that grows the link later and a session that cannot tell whether it was ever produced.
      const anchor = svgElement("a", { href, class: "watch" });
      anchor.setAttribute("target", "_blank");
      const marker = svgElement("circle", { cx, cy, r: 4.5, fill: colour, class: "snapshot" });
      const title = svgElement("title", {});
      title.textContent = `watch ${entry.at[i]} in the arena`;
      anchor.appendChild(marker);
      anchor.appendChild(title);
      svg.appendChild(anchor);
    });
  });

  // ------------------------------------------------------------------- the readout under a cursor
  const rule = svgElement("line", {
    y1: MARGIN.top, y2: MARGIN.top + plotHeight, x1: 0, x2: 0, class: "cursor hidden",
  });
  const dot = svgElement("circle", { cx: 0, cy: 0, r: 3.5, class: "cursor hidden" });
  const readout = svgElement("text", { x: 0, y: 0, class: "readout hidden" });
  svg.appendChild(rule);
  svg.appendChild(dot);
  svg.appendChild(readout);

  const surface = svgElement("rect", {
    x: MARGIN.left, y: MARGIN.top, width: plotWidth, height: plotHeight, class: "surface",
  });
  surface.addEventListener("pointermove", (event) => {
    const pointer = event as PointerEvent;
    const frame = svg.getBoundingClientRect();
    const x = ((pointer.clientX - frame.left) / frame.width) * width;
    const y = ((pointer.clientY - frame.top) / frame.height) * height;
    let best = points[0];
    let bestGap = Infinity;
    for (const candidate of points) {
      // Distance in both axes, so two runs crossing at one iteration can be told apart by
      // pointing at the line rather than only at the column.
      const gap = (candidate.x - x) ** 2 + (candidate.y - y) ** 2;
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    if (best === undefined) return;
    const entry = best.series;
    const value = entry.y[best.index]!;
    const band = entry.lo.length === entry.y.length
      ? ` +-${format((entry.hi[best.index]! - entry.lo[best.index]!) / 2)}`
      : "";
    readout.textContent = `${entry.run} ${entry.column} @ ${entry.at[best.index]}: `
      + `${format(value)}${band}`;
    readout.setAttribute("x", String(Math.min(best.x + 8, width - 8)));
    readout.setAttribute("y", String(Math.max(MARGIN.top + 12, best.y - 10)));
    readout.setAttribute("text-anchor", best.x > width * 0.6 ? "end" : "start");
    readout.setAttribute("fill", best.colour);
    rule.setAttribute("x1", String(best.x));
    rule.setAttribute("x2", String(best.x));
    dot.setAttribute("cx", String(best.x));
    dot.setAttribute("cy", String(best.y));
    dot.setAttribute("fill", best.colour);
    for (const node of [rule, dot, readout]) node.classList.remove("hidden");
  });
  surface.addEventListener("pointerleave", () => {
    for (const node of [rule, dot, readout]) node.classList.add("hidden");
  });
  svg.appendChild(surface);
  return pool;
}

// ----------------------------------------------------------------------------------- the panels

/** One panel: a title, an axis label, and the columns it asks each run for. */
export interface Panel {
  readonly title: string;
  readonly yLabel: string;
  /** Columns in `series`' spelling. A run that has none of them contributes no line. */
  readonly columns: readonly string[];
  /** Every column of a run whose name starts with this, for the per-opponent panels. */
  readonly family?: string;
  readonly separateScales?: boolean;
  /** What the panel is for, shown under its title. */
  readonly note: string;
}

/**
 * The panels the plan asked for, each one call to `drawLines`.
 *
 * They are a list rather than a screen of hand-placed charts because which ones have anything in
 * them is a property of the runs loaded: a `train-ppo` log has no `versus:` columns, a league log
 * has no `collectSeconds`, and the two engagement columns arrive whenever Session 06 starts
 * writing them. A panel whose columns no loaded run carries is not drawn at all, so the page grows
 * a chart the day the trainer grows a column and no session has to come back and add one.
 */
export const PANELS: readonly Panel[] = [
  {
    title: "bar margin against uniform",
    yLabel: "bar",
    columns: ["bar:uniform"],
    note: "the paired margin the set's criterion is taken on, with its 95 % band",
  },
  {
    title: "bar margin against golem-driver",
    yLabel: "bar",
    columns: ["bar:driver"],
    note: "the same against the hand-written reference, which is the mind to beat",
  },
  {
    title: "points a bout, by opponent",
    yLabel: "margin",
    columns: [],
    family: "versus:",
    note: "a league iteration's margin against each side it played that turn",
  },
  {
    title: "decided fraction",
    yLabel: "decided",
    columns: ["decided"],
    note: "how many bouts ended in a kill rather than on the clock",
  },
  {
    title: "stall and retreat",
    yLabel: "seconds a bout",
    columns: ["nearRangeStallSeconds", "retreatOutsideReachSeconds"],
    note: "the two habits the owner named; Session 06 is what makes a run write them",
  },
  {
    title: "penalty share",
    yLabel: "share of return",
    columns: ["penaltyShare"],
    note: "a run where a penalty dominated the return is a run to throw away",
  },
  {
    title: "logSigma per axis",
    yLabel: "log sigma",
    columns: [],
    family: "sigma:",
    note: "the spread the entropy bonus drifts; nine axes, one line each",
  },
  {
    title: "KL, clip, entropy, explained",
    yLabel: "",
    columns: ["kl", "clipFraction", "entropy", "explained"],
    separateScales: true,
    note: "four fit diagnostics whose ranges differ by two orders of magnitude, each on its own scale",
  },
  {
    title: "seconds an iteration",
    yLabel: "seconds",
    columns: ["seconds", "collectSeconds"],
    note: "wall clock, and the part of it collection paid for",
  },
  {
    title: "decisiveness probe",
    yLabel: "kill rate",
    columns: ["probe:killRate", "probe:maul", "probe:mace"],
    note: "a probe curve's kill rate against an idle dummy, whole pool and the two classes that finish",
  },
];
