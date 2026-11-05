/** A screen owns resources from acquisition until navigation, including incomplete loads. */
export function screenLifetime() {
  const abort = new AbortController();
  const cleanups: (() => void)[] = [];
  return {
    signal: abort.signal,
    own(cleanup: () => void): void {
      if (abort.signal.aborted) cleanup();
      else cleanups.push(cleanup);
    },
    dispose(): void {
      if (abort.signal.aborted) return;
      abort.abort();
      for (const cleanup of cleanups.reverse()) {
        try { cleanup(); } catch (error) { console.error(error); }
      }
      cleanups.length = 0;
    },
  };
}

export interface NavigationOptions { readonly replace?: boolean; readonly setup?: boolean }

/** The shell supplies navigation and a lifetime; the screen owns its presentation and world. */
export interface ScreenContext {
  readonly root: HTMLElement;
  readonly address: URL;
  readonly signal: AbortSignal;
  readonly autostart: boolean;
  readonly busy: boolean;
  own(cleanup: () => void): void;
  navigate(href: string, options?: NavigationOptions): void;
  replace(href: string | URL): void;
  remember(href: string): void;
  loading<T>(label: string, task: (stage: (label: string) => Promise<void>) => Promise<T>): Promise<T>;
}

/** Allow the loading overlay to paint before construction uses the main thread. */
export function paintLoading(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      cancelAnimationFrame(frame); clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(signal.reason);
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (document.hidden) timer = setTimeout(finish, 0);
    else frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
  });
}

/** Navigation releases the caller immediately while late results remain owned by their screen. */
export function screenTask<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => { signal.removeEventListener("abort", cancel); reject(signal.reason); };
    signal.addEventListener("abort", cancel, { once: true });
    pending.then(value => { signal.removeEventListener("abort", cancel); resolve(value); },
      error => { signal.removeEventListener("abort", cancel); reject(error); });
    if (signal.aborted) cancel();
  });
}
