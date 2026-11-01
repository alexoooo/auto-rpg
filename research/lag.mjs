/**
 * **A world's lag** behind real time, read from its steps' times:
 * after step k, `lag = max(0, lag + t_k - dt)`, the world started at the step `from` with none.
 * A lag under one step is never seen, as the page draws a step behind the newest frame
 * (`src/worker/client.ts`).
 *
 * `times` is each step's wall time, ms; `dt` the step, ms. Returns the worst lag, ms, the step it
 * peaks at, the step its run began at (the last with no lag before it), and the steps over `dt`
 * in that run.
 */
export function lagOf(times, dt, from = 0) {
  let lag = 0, began = from, worst = { lag: 0, at: from, began: from };
  for (let k = from; k < times.length; k++) {
    if (lag === 0) began = k;
    lag = Math.max(0, lag + times[k] - dt);
    if (lag > worst.lag) worst = { lag, at: k, began };
  }
  return { ...worst, over: times.slice(worst.began, worst.at + 1).filter((t) => t > dt).length };
}
