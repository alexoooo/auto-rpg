import type { FromWorker, ToWorker, WorldInput } from "./protocol.ts";
import { teamStage, type Stage } from "./stage.ts";
import { duelStage } from "./duel-stage.ts";
import { cryptStage } from "./crypt-stage.ts";
import { pageMinds } from "./minds.ts";

/** The most real time one pass steps the world through, s: a frame of a screen at 30 fps. Behind it the world plays in slow motion. */
const CATCH_UP_SECONDS = 1 / 30;

/** How long the speed a frame reports is read over, ms. */
const SPEED_WINDOW_MS = 500;

/** Where a world's worker hears its page and answers: the worker's own scope, or one end of a channel. */
export interface Port {
  postMessage(message: FromWorker, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ToWorker>) => void): void;
  start?(): void;
}

/**
 * **A world's worker**: builds the stage its page asks for (`ToWorker`), and while it runs takes the
 * steps real time owes, a pass at a time, each pass at most `CATCH_UP_SECONDS` of them, sending
 * each step's frame as it is taken. A world that cannot keep real time falls behind it and plays in
 * slow motion; the page draws at its own rate from the frames it holds. A stage that holds itself
 * (`StageNews.held`) stops the world until the page runs it again. `close` ends the worker.
 */
export function serve(port: Port, close: () => void): void {
  let stage: Stage<unknown, WorldInput> | null = null, running = false, burden = 0, owed = 0, last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const marks: { real: number; world: number }[] = [];
  const fault = (error: unknown) => {
    running = false;
    clearTimeout(timer);
    port.postMessage({ kind: "fault", message: error instanceof Error ? error.message : String(error) }, []);
  };
  /** Take a step and send its frame; whether the stage holds there. */
  const step = (built: Stage<unknown, WorldInput>): boolean => {
    const started = performance.now();
    built.step();
    while (performance.now() - started < burden) { /* The burden: a step made slow on purpose. */ }
    const now = performance.now(), frame = built.frame();
    marks.push({ real: now, world: frame[0]! });
    while (now - marks[0]!.real > SPEED_WINDOW_MS) marks.shift();
    const span = now - marks[0]!.real;
    frame[2] = span > 0 ? Math.min(1, (frame[0]! - marks[0]!.world) * 1000 / span) : 1;
    frame[3] = now - started;
    const news = built.news();
    port.postMessage({ kind: "frame", frame, news }, [frame.buffer]);
    if (!news?.held) return false;
    running = false;
    return true;
  };
  const pass = () => {
    timer = undefined;
    if (!stage || !running || stage.over()) return;
    const dt = 1 / stage.hz, started = performance.now();
    owed = Math.min(owed + (started - last) / 1000, CATCH_UP_SECONDS);
    last = started;
    try {
      while (owed >= dt - 1e-9 && !stage.over()) {
        if (step(stage)) return;
        owed -= dt;
        // A pass that has taken a screen's frame gives the page's messages their turn.
        if (performance.now() - started >= CATCH_UP_SECONDS * 1000) { owed = 0; break; }
      }
    } catch (error) { fault(error); return; }
    timer = setTimeout(pass, Math.max(0, (dt - owed) * 1000));
  };
  const resume = () => {
    clearTimeout(timer);
    owed = 0; last = performance.now(); marks.length = 0;
    timer = setTimeout(pass, 0);
  };
  const build = (building: Promise<Stage<unknown, WorldInput>>) => building.then((built) => {
    stage = built;
    const frame = built.frame(), news = built.news();
    port.postMessage({ kind: "ready", hz: built.hz, roster: built.roster, frame }, [frame.buffer]);
    if (news) port.postMessage({ kind: "news", news }, []);
    if (running) resume();
  }, fault);
  port.addEventListener("message", ({ data }) => {
    switch (data.kind) {
      case "team":
        build(teamStage(data.recipe, data.aftermath, { minds: pageMinds }));
        return;
      case "duel":
        build(duelStage(data.start));
        return;
      case "crypt":
        build(cryptStage(data.start, { minds: pageMinds }));
        return;
      case "input":
        try {
          if (!stage) return;
          stage.input(data.input);
          const news = stage.news();
          if (news) port.postMessage({ kind: "news", news }, []);
        } catch (error) { fault(error); }
        return;
      case "tape":
        port.postMessage({ kind: "tape", tape: stage?.tape() ?? [] }, []);
        return;
      case "run":
        running = data.running;
        if (running) resume(); else clearTimeout(timer);
        return;
      case "step":
        try { for (let k = 0; k < data.steps && stage && !stage.over(); k++) if (step(stage)) break; } catch (error) { fault(error); return; }
        port.postMessage({ kind: "stepped" }, []);
        return;
      case "burden":
        burden = data.ms;
        return;
      case "stop":
        running = false;
        clearTimeout(timer);
        stage?.dispose();
        stage = null;
        close();
        return;
      default: {
        const never: never = data;
        fault(new Error(`unknown message ${JSON.stringify(never)}`));
      }
    }
  });
  port.start?.();
}
