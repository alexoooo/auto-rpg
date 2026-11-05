/** Two consecutive complete frames establish that the opening view is ready. */
export async function readyFrames(options: {
  signal: AbortSignal;
  frame(): void;
  ready(): boolean;
  next(): Promise<void>;
  clock(): number;
}): Promise<void> {
  const started = options.clock();
  // Bound a failed shader or resource wait in visible-tab time, milliseconds.
  const deadline = 30000;
  let complete = 0;
  while (complete < 2) {
    options.signal.throwIfAborted();
    await options.next();
    options.signal.throwIfAborted();
    if (options.clock() - started >= deadline) throw new Error("The opening view could not finish preparing. Please retry.");
    options.frame();
    complete = options.ready() ? complete + 1 : 0;
  }
}
