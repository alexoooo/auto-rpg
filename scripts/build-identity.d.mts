export function hashBuildInputs(root: string, files: readonly string[]): string;
export function currentBuildIdentity(): string;
export const BUILD_IDENTITY: string;
/** A build input as the file table holds it. */
export interface FileEntry {
  readonly hash: string;
  readonly imports?: readonly string[];
  readonly loads?: readonly string[];
  readonly computed?: number;
  readonly kinds?: readonly string[];
  readonly data?: Readonly<Record<string, string>>;
}
export type FileTable = Readonly<Record<string, FileEntry>>;
export function fileTable(): FileTable;
