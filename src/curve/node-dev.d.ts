/**
 * The slice of Node this directory's dev-only middleware uses, declared because nothing else here
 * needs Node's types and nothing installs them. Session 02 of the learn set.
 *
 * **Why this file exists rather than a dependency.** `tsc --noEmit` covers `src` and
 * `vite.config.ts`, and the runs middleware in `vite.config.ts` reads a directory and streams a
 * file, which is four functions out of `node:fs`, `node:path` and `node:url`. This prototype has
 * no `@types/node` -- its manifest is three Babylon packages, TypeScript and Vite, and adding a
 * types package to a standalone experiment's lockfile to type four functions is a poor trade
 * against twenty lines that say exactly what is used. The declarations are deliberately narrow
 * for that reason: they are a statement of what the middleware touches, not an attempt at Node.
 *
 * **What that costs, said plainly.** These are hand-written and nothing checks them against the
 * runtime. A signature written wrong here compiles and fails in the dev server, which is the same
 * failure mode as any untyped call -- so keep them to the shapes the middleware actually calls,
 * and if a session needs more of Node than this, that is the session that should install the
 * types properly instead of growing this file.
 *
 * The declarations live under `src/curve/` because the middleware they serve exists for this
 * page and nothing else. If a second page ever needs Node in its config, move them somewhere
 * that says so.
 */

declare module "node:fs" {
  /** A readable stream, narrowed to the one thing the middleware does with it. */
  export function createReadStream(path: string): { pipe(destination: unknown): void };
}

declare module "node:fs/promises" {
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
  }
  export interface Stats {
    readonly size: number;
    readonly mtimeMs: number;
    isFile(): boolean;
  }
  export function readdir(
    path: string, options: { withFileTypes: true },
  ): Promise<Dirent[]>;
  export function stat(path: string): Promise<Stats>;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  /** The platform's separator. Load-bearing in the path check, which is why it is imported. */
  export const sep: string;
}

declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
}
