import type { CommandAckMessage, LegacyClientCommand } from "./protocol/messages.js";
import type { ClientDiagnostics, ClientSnapshot } from "./runtime/sim-client.js";
import type { PresentationSnapshot } from "./render/presentation.js";
import { copyPresentationSnapshot } from "./render/presentation.js";

export type BootstrapRenderer = Readonly<{
  acceptSnapshot: (snapshot: PresentationSnapshot, receivedAtMs: number) => void;
  clear: () => void;
  dispose: () => void;
}>;

export type BootstrapClient = {
  onSnapshot: ((snapshot: ClientSnapshot) => void) | null;
  onDiagnostics: ((diagnostics: ClientDiagnostics) => void) | null;
  onError: ((error: Error) => void) | null;
  init(seed: number): Promise<unknown>;
  reset(seed: number, paused?: boolean): Promise<unknown>;
  setPaused(paused: boolean): Promise<unknown>;
  command(command: LegacyClientCommand): Promise<CommandAckMessage>;
  diagnostics(): ClientDiagnostics;
  dispose(): void;
};

export type BootstrapOptions<TRenderer extends BootstrapRenderer> = Readonly<{
  client: BootstrapClient | null;
  createRenderer: (onTerminal: (error: Error) => void) => Promise<TRenderer>;
  seed: number;
  now?: () => number;
  stressSnapshot?: PresentationSnapshot;
  copySnapshot?: (snapshot: ClientSnapshot) => PresentationSnapshot;
  onDiagnostics?: (diagnostics: ClientDiagnostics) => void;
  onError?: (error: Error) => void;
  attachInput?: (
    application: V2Application<TRenderer>,
  ) => Promise<(() => void) | null> | (() => void) | null;
}>;

export class V2Application<TRenderer extends BootstrapRenderer> {
  readonly renderer: TRenderer;
  readonly client: BootstrapClient | null;
  #latest: PresentationSnapshot | null;
  #inputDisposer: (() => void) | null = null;
  #disposed = false;

  constructor(renderer: TRenderer, client: BootstrapClient | null, latest: PresentationSnapshot | null) {
    this.renderer = renderer;
    this.client = client;
    this.#latest = latest;
  }

  latestSnapshot(): PresentationSnapshot | null { return this.#latest; }
  setLatestSnapshot(snapshot: PresentationSnapshot | null): void { this.#latest = snapshot; }

  ownInput(dispose: () => void): void {
    if (this.#disposed) {
      dispose();
      return;
    }
    this.#inputDisposer?.();
    this.#inputDisposer = dispose;
  }

  async reset(seed: number, paused?: boolean): Promise<void> {
    const client = this.#requireClient();
    this.renderer.clear();
    this.#latest = null;
    await client.reset(seed, paused);
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.#requireClient().setPaused(paused);
  }

  async command(command: LegacyClientCommand): Promise<CommandAckMessage> {
    return this.#requireClient().command(command);
  }

  terminal(error: Error): void {
    if (this.#disposed) return;
    this.dispose();
    void error;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#inputDisposer?.();
    this.#inputDisposer = null;
    this.renderer.dispose();
    this.client?.dispose();
  }

  get disposed(): boolean { return this.#disposed; }

  #requireClient(): BootstrapClient {
    if (this.#disposed) throw new Error("v2 application is disposed");
    if (this.client === null) throw new Error("simulation controls are unavailable in synthetic stress mode");
    return this.client;
  }
}

export async function bootstrapV2<TRenderer extends BootstrapRenderer>(
  options: BootstrapOptions<TRenderer>,
): Promise<V2Application<TRenderer>> {
  const now = options.now ?? (() => performance.now());
  const copy = options.copySnapshot ?? ((snapshot: ClientSnapshot) =>
    copyPresentationSnapshot(snapshot.message, snapshot.view));
  let application: V2Application<TRenderer> | null = null;
  let renderer: TRenderer | null = null;
  let terminalError: Error | null = null;
  const terminal = (error: Error): void => {
    terminalError = error;
    options.onError?.(error);
    application?.terminal(error);
  };

  if (options.client !== null) {
    // These are installed before renderer creation and, critically, before init.
    options.client.onSnapshot = (snapshot) => {
      if (application === null || application.disposed) return;
      try {
        const copied = copy(snapshot);
        application.setLatestSnapshot(copied);
        application.renderer.acceptSnapshot(copied, now());
      } catch (error) {
        terminal(error instanceof Error ? error : new Error(String(error)));
      }
    };
    options.client.onDiagnostics = (diagnostics) => {
      options.onDiagnostics?.(diagnostics);
      if (diagnostics.terminal) terminal(new Error("simulation client became terminal"));
    };
    options.client.onError = (error) => options.onError?.(error);
  }

  try {
    renderer = await options.createRenderer(terminal);
    if (terminalError !== null) throw terminalError;
    application = new V2Application(renderer, options.client, null);
    if (options.stressSnapshot !== undefined) {
      application.setLatestSnapshot(options.stressSnapshot);
      renderer.acceptSnapshot(options.stressSnapshot, now());
    } else {
      if (options.client === null) throw new Error("real-worker mode requires a simulation client");
      await options.client.init(options.seed);
    }
    if (options.attachInput !== undefined) {
      const disposeInput = await options.attachInput(application);
      if (disposeInput !== null) application.ownInput(disposeInput);
    }
    if (terminalError !== null || application.disposed) {
      throw terminalError ?? new Error("v2 application became terminal during startup");
    }
    return application;
  } catch (error) {
    if (application !== null) application.dispose();
    else {
      renderer?.dispose();
      options.client?.dispose();
    }
    throw error;
  }
}
