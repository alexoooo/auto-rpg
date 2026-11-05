/**
 * The little of Node's `node:worker_threads` that the minds' threads use (`src/app/node/minds.ts`):
 * the project types the browser's library, not Node's, so these are declared here.
 */
declare module "node:worker_threads" {
  export interface MessagePort {
    postMessage(value: unknown, transferList?: readonly unknown[]): void;
    close(): void;
  }
  export class MessageChannel {
    readonly port1: MessagePort;
    readonly port2: MessagePort;
  }
  export class Worker {
    constructor(url: URL | string, options?: { readonly workerData?: unknown; readonly transferList?: readonly unknown[] });
    terminate(): Promise<number>;
    unref(): void;
  }
  export function receiveMessageOnPort(port: MessagePort): { readonly message: unknown } | undefined;
  export const workerData: unknown;
}
