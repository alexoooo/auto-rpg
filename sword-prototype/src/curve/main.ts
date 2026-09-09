/**
 * The curve page: pick runs on the left, see what they did on the right.
 * Session 02 of the learn set.
 *
 * ## What this file is allowed to do
 *
 * Fetch, click, and lay out. Every judgement it looks like it is making is made elsewhere: which
 * reader a file wants is `readRun`'s, what a column means is `series`', whether two series may
 * share an axis is `onePool`'s, and how a panel is drawn is `drawLines`'. That leaves this file
 * with no logic worth testing and none that a test could reach anyway, which is the arrangement
 * the session was designed around -- the Node runner has no DOM, so anything that has to be
 * checked lives where a test can see it.
 *
 * ## Two ways in, because there are two machines
 *
 * Under `npm run dev` the runs are served read-only from `tournaments/` by the plugin in
 * `vite.config.ts` and the list on the left comes from /runs/index.json. In the built page that
 * fetch fails -- the plugin has no `build` hook and deliberately does not -- and **that failure is
 * the signal**, not an error: the list becomes a drop zone and a file input, and a curve can be
 * shown on a machine that has never run the harness. Nothing is bundled and nothing is copied into
 * `public/`, because a run copied there would either be committed or make the page lie about which
 * file it is showing.
 *
 * ## Why the panels are not a fixed screen
 *
 * `PANELS` in `chart.ts` is a list, and a panel whose columns none of the loaded runs carry is not
 * drawn. A `train-ppo` log has no per-opponent margins and a league log has no collection clock,
 * so a page with a fixed set of charts would show half of them empty whichever kind was loaded --
 * and would have to be edited again the day Session 06 starts writing the stall columns. This way
 * the page grows a chart when the trainer grows a column.
 */
import { drawLines, PALETTE, PANELS, type Panel } from "./chart.ts";
import { columnsOf, onePool, readRun, series, type Run, type Series } from "./runs.ts";

/** One file the middleware offered, or one the person dropped. */
interface Listing {
  readonly path: string;
  readonly size: number;
  readonly mtime: number;
}

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`curve.html has no #${id}`);
  return node as T;
};

const runList = byId<HTMLDivElement>("runs");
const panelHost = byId<HTMLDivElement>("panels");
const status = byId<HTMLDivElement>("status");
const picker = byId<HTMLDivElement>("picker");
const fileInput = byId<HTMLInputElement>("file");

/** Every run the page has read, in the order it read them, which is what fixes the palette. */
const loaded = new Map<string, Run>();
const selected = new Set<string>();
let listing: Listing[] = [];

const bytes = (size: number): string =>
  size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} kB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;

const say = (text: string, bad = false): void => {
  status.textContent = text;
  status.classList.toggle("bad", bad);
};

// ------------------------------------------------------------------------------- reading a run

async function loadFromServer(path: string): Promise<void> {
  const response = await fetch(`/runs/${path}`);
  if (!response.ok) throw new Error(`${path}: the server said ${response.status}`);
  take(path, await response.text());
}

function take(name: string, text: string): void {
  const run = readRun(text, name);
  loaded.set(name, run);
  selected.add(name);
  const skipped = run.skipped > 0 ? ", last row half-written" : "";
  const resumed = run.resumes.length > 0 ? `, resumed ${run.resumes.length}x` : "";
  say(`${name}: ${run.kind}, ${run.iterations.length} iterations, ${run.ratings.length} ratings`
    + `${resumed}${skipped} -- ${run.pool.label}`);
}

/** Load a file, and say what went wrong in the page rather than in a console nobody is watching. */
async function open(path: string): Promise<void> {
  try {
    await loadFromServer(path);
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true);
  }
  render();
}

// -------------------------------------------------------------------------------- the run list

function renderRuns(): void {
  runList.textContent = "";
  const entries = [...listing];
  for (const name of loaded.keys()) {
    if (!entries.some((entry) => entry.path === name)) entries.push({ path: name, size: 0, mtime: 0 });
  }
  for (const entry of entries) {
    const row = document.createElement("label");
    row.className = "run";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = selected.has(entry.path);
    box.addEventListener("change", () => {
      if (!box.checked) {
        selected.delete(entry.path);
        render();
        return;
      }
      if (loaded.has(entry.path)) {
        selected.add(entry.path);
        render();
        return;
      }
      void open(entry.path);
    });
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.path;
    const meta = document.createElement("span");
    meta.className = "meta";
    const run = loaded.get(entry.path);
    meta.textContent = run !== undefined
      ? `${run.kind} ${run.iterations.length || run.ratings.length}`
      : entry.size > 0 ? bytes(entry.size) : "";
    row.appendChild(box);
    row.appendChild(name);
    row.appendChild(meta);
    runList.appendChild(row);
  }
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "no runs";
    runList.appendChild(empty);
  }
}

// ----------------------------------------------------------------------------------- the panels

/** Which columns of a run a panel wants, which is the intersection of what it asks and what it has. */
function columnsFor(panel: Panel, run: Run): string[] {
  const has = columnsOf(run);
  const wanted = panel.columns.filter((column) => has.includes(column));
  const family = panel.family;
  if (family === undefined) return wanted;
  return [...wanted, ...has.filter((column) => column.startsWith(family))];
}

function renderPanels(): void {
  panelHost.textContent = "";
  const runs = [...selected].map((name) => loaded.get(name)).filter((run): run is Run => run !== undefined);
  if (runs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "pick a run on the left.";
    panelHost.appendChild(empty);
    return;
  }
  for (const panel of PANELS) {
    const lines: Series[] = [];
    for (const run of runs) {
      for (const column of columnsFor(panel, run)) lines.push(series(run, column));
    }
    if (lines.length === 0) continue;
    panelHost.appendChild(buildPanel(panel, lines));
  }
}

function buildPanel(panel: Panel, lines: readonly Series[]): HTMLElement {
  const frame = document.createElement("section");
  frame.className = "panel";
  const title = document.createElement("h2");
  title.textContent = panel.title;
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = panel.note;
  frame.appendChild(title);
  frame.appendChild(note);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  svg.setAttribute("class", "chart");
  frame.appendChild(svg);

  const legend = document.createElement("div");
  legend.className = "legend";
  // Every entry names the run, the pool and the opponent, in that order. The pool is on every
  // line rather than once under the panel because a legend is what gets screenshotted, and a
  // rating whose pool travelled separately is a rating somebody will compare with the wrong one.
  lines.forEach((line, index) => {
    const entry = document.createElement("span");
    entry.className = "key";
    const swatch = document.createElement("i");
    swatch.style.background = PALETTE[index % PALETTE.length]!;
    entry.appendChild(swatch);
    const text = document.createElement("span");
    const against = line.opponent === "" ? "" : ` vs ${line.opponent}`;
    text.textContent = `${line.run} ${line.column}${against} -- ${line.pool.label}`;
    entry.appendChild(text);
    legend.appendChild(entry);
  });
  frame.appendChild(legend);

  // The pool check runs once here as well as inside `drawLines`, so the panel's frame can carry
  // the refusal in its own heading rather than only in the empty space where the chart was.
  try {
    onePool(lines);
  } catch (error) {
    frame.classList.add("refused");
    note.textContent = error instanceof Error ? error.message : String(error);
  }
  // The element has to be in the document before it has a width to draw into.
  queueMicrotask(() => {
    drawLines(svg, lines, { yLabel: panel.yLabel, separateScales: panel.separateScales === true });
  });
  return frame;
}

function render(): void {
  renderRuns();
  renderPanels();
}

// ----------------------------------------------------------------------------- the two ways in

/**
 * Which of the listed files this page offers, which is fewer than the middleware serves.
 *
 * The window onto `tournaments/` is deliberately wider than the list: a league arm's directory is
 * mostly pool-N.json and `league.json`, which are *weights* -- three quarters of a megabyte
 * apiece, one per snapshot -- and the arena needs to fetch them through the same window when
 * Session 03 lands. But none of them is a curve, so listing them here buries a dozen drawable
 * runs under a hundred and fifty files that answer a click with a parse error. Rows are what this
 * page draws, so it offers JSONL and Session 04's sweep manifest and nothing else.
 */
const drawable = (entry: Listing): boolean =>
  entry.path.endsWith(".jsonl") || entry.path.endsWith("/manifest.json")
  || entry.path === "manifest.json";

async function findRuns(): Promise<void> {
  try {
    const response = await fetch("/runs/index.json");
    if (!response.ok) throw new Error(String(response.status));
    const body: unknown = await response.json();
    const files = Array.isArray((body as { files?: unknown }).files)
      ? (body as { files: Listing[] }).files
      : [];
    listing = files.filter(drawable);
    picker.classList.add("quiet");
    say(`${files.length} files under tournaments/`);
  } catch {
    // Not an error. The built page has no middleware behind it by design, so this is how it finds
    // out it is the built page, and the drop zone is the answer rather than a fallback.
    picker.classList.remove("quiet");
    say("no run server here -- drop a log or a curve onto the page, or use the file button.");
  }
  render();
}

async function takeFiles(files: FileList | null): Promise<void> {
  if (files === null) return;
  for (const file of Array.from(files)) {
    try {
      take(file.name, await file.text());
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true);
    }
  }
  render();
}

fileInput.addEventListener("change", () => {
  void takeFiles(fileInput.files);
});
document.addEventListener("dragover", (event) => {
  event.preventDefault();
  picker.classList.add("over");
});
document.addEventListener("dragleave", () => picker.classList.remove("over"));
document.addEventListener("drop", (event) => {
  event.preventDefault();
  picker.classList.remove("over");
  void takeFiles(event.dataTransfer?.files ?? null);
});

// A chart is drawn into pixels, so it has to be drawn again when there are different pixels. The
// whole page is cheap to rebuild -- the runs are already parsed and in memory -- so there is no
// point being cleverer than this.
let resizing = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizing);
  resizing = window.setTimeout(render, 120);
});

void findRuns();
