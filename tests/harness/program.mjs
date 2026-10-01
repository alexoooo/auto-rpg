/**
 * One TypeScript program over the repository's sources, for the guards that need the checker: what
 * a name resolves to, not what a line looks like. Nothing is emitted, and no diagnostics are read:
 * `npm run check` owns those.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ROOT = path.resolve(import.meta.dirname, "../..").replaceAll("\\", "/");

const OPTIONS = {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true, allowImportingTsExtensions: true, resolveJsonModule: true, noEmit: true, skipLibCheck: true, types: [],
};

/** Every file under `directory` (repository-relative) whose name ends in `suffix`, repository-relative, forward slashes. */
export function sourcesUnder(directory, suffix, skip = () => false) {
  const out = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (skip(child)) continue;
      if (entry.isDirectory()) walk(child);
      else if (child.endsWith(suffix)) out.push(child);
    }
  };
  walk(directory);
  return out;
}

/**
 * A program over `files` (repository-relative), with `overlay`'s texts in place of, or beside, the
 * files on disk: a control gives the guard a tree with a known fault in it. `root` is where the
 * relative names resolve; a wholly virtual tree names a directory that does not exist.
 */
export function programOver(files, overlay = {}, root = ROOT) {
  const absolute = (file) => `${root}/${file}`;
  const texts = new Map(Object.entries(overlay).map(([file, text]) => [absolute(file).toLowerCase(), text]));
  const overlaid = (file) => texts.get(file.replaceAll("\\", "/").toLowerCase());
  const host = ts.createCompilerHost(OPTIONS, true);
  const onDisk = { fileExists: host.fileExists, readFile: host.readFile, getSourceFile: host.getSourceFile, directoryExists: host.directoryExists };
  host.fileExists = (file) => overlaid(file) !== undefined || onDisk.fileExists(file);
  host.readFile = (file) => overlaid(file) ?? onDisk.readFile(file);
  host.directoryExists = (directory) => {
    const prefix = `${directory.replaceAll("\\", "/").toLowerCase()}/`;
    return [...texts.keys()].some((file) => file.startsWith(prefix)) || onDisk.directoryExists(directory);
  };
  host.getSourceFile = (file, languageVersion, ...rest) => {
    const text = overlaid(file);
    return text === undefined ? onDisk.getSourceFile(file, languageVersion, ...rest) : ts.createSourceFile(file, text, languageVersion, true);
  };
  const program = ts.createProgram(files.map(absolute), OPTIONS, host);
  return {
    program, checker: program.getTypeChecker(),
    /** The program's own files among `files`' tree, each with its repository-relative name. */
    sources: () => program.getSourceFiles()
      .filter((source) => source.fileName.startsWith(`${root}/`) && !source.fileName.includes("/node_modules/"))
      .map((source) => ({ source, file: source.fileName.slice(root.length + 1) })),
  };
}
