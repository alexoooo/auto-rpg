/**
 * **The documents hold together** (`tests/documents.test.mjs`), in two parts.
 *
 * - `brokenCitations`: every document a script, a test, a research script or the code cites by
 *   its repository path (a `docs/` Markdown file, with its `#anchor` if it names one), and every
 *   relative link of a Markdown file, resolves: the file exists and the anchor is one of its
 *   headings, slugged as GitHub slugs them (`anchorsOf`). A citation with `@commit` after the path
 *   is read as the path. A link to anything but Markdown checks only that the target exists.
 * - `commentMarks`: no comment in `src/` holds one of `MARKS`.
 *
 * Read from the text alone, without a parser, so the whole repository reads in well under a second.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..").replaceAll("\\", "/");
const CODE = /\.(?:ts|mts|mjs|js)$/;
/** The folders whose code's citations of documents are checked. */
const CITING = /^(?:src|scripts|tests|research)\//;
/** The folder whose comments are held to `MARKS`. */
const MARKED = /^src\//;

/**
 * What no comment in `src/` may hold: each a name and a pattern whose matches are the marks.
 * A commit hash is a run of 7 to 40 hex digits with a digit and a letter in it, so a word
 * spelled in a to f is not one.
 */
export const MARKS = Object.freeze([
  { name: "a date", pattern: /(?<![\w-])(?:19|20)\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\w])/g },
  { name: "a commit hash", pattern: /(?<![\w.-])(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![\w-])/g },
  { name: "a citation of a plan or an analysis", pattern: /docs\/(?:plans|analysis)\//g },
  { name: "the owner", pattern: /\b[Tt]he owner\b/g },
]);

/** A document cited by repository path from code: the path, an optional `@commit`, an optional anchor. */
const CITATION = /(?<![\w.-])docs\/[\w./-]*?\.md(?![\w])(?:@[0-9a-f]+)?(?:#([\p{L}\p{N}_-]+))?/gu;
/** An inline link's or image's target, `](target`, and a reference definition's, `[label]: target`. */
const INLINE_LINK = /\]\(\s*<?([^)\s>]+)/g;
const REFERENCE = /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)/;
/** A target with a scheme (`https:`, `mailto:`) or protocol-relative: not checked. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}\s+(.*?)\s*(?:\s#+)?\s*$/;
const HTML_ANCHOR = /<a\s[^>]*?\b(?:id|name)\s*=\s*["']([^"']+)["']/gi;

/** `heading` as GitHub's anchor for it: lowercase, letters, digits, `_`, `-` and spaces kept, spaces to hyphens. */
function slug(heading) {
  const text = heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "");
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replaceAll(" ", "-");
}

/** Each line of `markdown` with its fenced code blocks' lines blanked, so neither their links nor their headings count. */
function prose(markdown) {
  let fence = null;
  return markdown.split(/\r?\n/).map((line) => {
    const open = FENCE.exec(line);
    if (fence === null && open) { fence = open[1][0]; return ""; }
    if (fence !== null) { if (open && open[1][0] === fence) fence = null; return ""; }
    return line;
  });
}

/** The anchors `markdown`'s headings and HTML anchors give, a repeated heading's slug numbered `-1`, `-2` as GitHub does. */
export function anchorsOf(markdown) {
  const anchors = new Set(), counts = new Map();
  for (const line of prose(markdown)) {
    for (const [, id] of line.matchAll(HTML_ANCHOR)) anchors.add(id);
    const heading = HEADING.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    let anchor = base;
    if (anchors.has(base)) {
      let n = counts.get(base) ?? 0;
      do anchor = `${base}-${++n}`; while (anchors.has(anchor));
      counts.set(base, n);
    }
    anchors.add(anchor);
  }
  return anchors;
}

/** `text` with its code spans blanked to spaces, so a link written as code is not a link. */
const uncoded = (text) => text.replace(/(`+)[^`]*?\1/g, (span) => " ".repeat(span.length));

/**
 * **What `files` cite that is not there**: each a sentence naming the citing file and line, the
 * citation, and what is missing. `files` is every file of the tree, repository-relative; `read`
 * gives one's text.
 */
export function brokenCitations(files, read) {
  const present = new Set(files);
  const folders = new Set();
  for (const file of present) for (let at = file.lastIndexOf("/"); at > 0; at = file.lastIndexOf("/", at - 1)) folders.add(file.slice(0, at));
  const anchors = new Map();
  const anchorsIn = (file) => { if (!anchors.has(file)) anchors.set(file, anchorsOf(read(file))); return anchors.get(file); };
  /** Why `target`, with `anchor`, does not resolve; null where it does. */
  const missing = (target, anchor) => {
    if (!present.has(target) && !folders.has(target.replace(/\/$/, ""))) return "which does not exist";
    if (anchor && target.endsWith(".md") && !anchorsIn(target).has(anchor)) return `which has no heading #${anchor}`;
    return null;
  };
  const broken = [];
  for (const file of files) {
    if (CITING.test(file) && CODE.test(file)) {
      read(file).split(/\r?\n/).forEach((line, i) => {
        for (const match of line.matchAll(CITATION)) {
          const target = match[0].replace(/[@#].*$/, "");
          const why = missing(target, match[1]);
          if (why) broken.push(`${file}:${i + 1} cites ${match[0]}, ${why}`);
        }
      });
    } else if (file.endsWith(".md")) {
      prose(read(file)).forEach((line, i) => {
        const text = uncoded(line), reference = REFERENCE.exec(text);
        const targets = [...text.matchAll(INLINE_LINK)].map((match) => match[1]);
        if (reference) targets.push(reference[1]);
        for (const link of targets) {
          if (EXTERNAL.test(link)) continue;
          const [where, anchor = ""] = link.replace(/\?[^#]*/, "").split("#");
          let decoded;
          try { decoded = decodeURIComponent(where); } catch { decoded = where; }
          const target = decoded === "" ? file
            : path.posix.normalize(decoded.startsWith("/") ? decoded.slice(1) || "." : path.posix.join(path.posix.dirname(file), decoded));
          const why = target === "." ? null : target.startsWith("../") ? "which is outside the repository" : missing(target, anchor && decodeURIComponent(anchor));
          if (why) broken.push(`${file}:${i + 1} links ${link}, ${why}`);
        }
      });
    }
  }
  return broken;
}

/**
 * The comments of `code`, a TypeScript or JavaScript file's text: each its text and the line it
 * starts on. Strings, template literals (their `${}` read as code) and regular expressions are
 * skipped; a `/` opens a regular expression where an operand may begin.
 */
export function commentsOf(code) {
  const comments = [], templates = [];
  let line = 1, i = 0, depth = 0, last = "";
  const KEYWORDS = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
  const advance = (to) => { for (; i < to; i++) if (code[i] === "\n") line++; };
  /** Scans a template literal's text from `i`, past its closing backtick or into its next `${`. */
  const template = () => {
    while (i < code.length) {
      const c = code[i];
      if (c === "\\") { advance(i + 2); continue; }
      if (c === "`") { advance(i + 1); return; }
      if (c === "$" && code[i + 1] === "{") { advance(i + 2); templates.push(depth); depth = 0; return; }
      advance(i + 1);
    }
  };
  while (i < code.length) {
    const c = code[i], next = code[i + 1];
    if (c === "/" && next === "/") {
      const end = code.indexOf("\n", i);
      comments.push({ text: code.slice(i, end < 0 ? code.length : end), line });
      i = end < 0 ? code.length : end;
    } else if (c === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2), stop = end < 0 ? code.length : end + 2;
      comments.push({ text: code.slice(i, stop), line });
      advance(stop);
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
      advance(j + 1); last = "a";
    } else if (c === "`") {
      advance(i + 1); template(); last = "a";
    } else if (c === "/") {
      const word = /[\w$]+$/.exec(last)?.[0];
      const operand = last === "" || /[(,=:[!&|?{};+\-*%<>~^]$/.test(last) || (word !== undefined && KEYWORDS.test(word));
      if (!operand) { advance(i + 1); last = "/"; continue; }
      let j = i + 1, inClass = false;
      while (j < code.length && code[j] !== "\n" && (inClass || code[j] !== "/")) {
        if (code[j] === "\\") j++;
        else if (code[j] === "[") inClass = true;
        else if (code[j] === "]") inClass = false;
        j++;
      }
      advance(j + 1); last = "a";
    } else if (c === "{") {
      depth++; advance(i + 1); last = "{";
    } else if (c === "}") {
      if (depth === 0 && templates.length) { depth = templates.pop(); advance(i + 1); template(); last = "a"; }
      else { depth--; advance(i + 1); last = "}"; }
    } else if (/\s/.test(c)) {
      advance(i + 1);
    } else {
      const word = /^[\w$]+/.exec(code.slice(i, i + 64));
      if (word) { last = word[0]; advance(i + word[0].length); }
      else { last = c; advance(i + 1); }
    }
  }
  return comments;
}

/**
 * **What the comments of `files` in `src/` hold that they may not**: each a sentence naming the
 * file and line, the mark and what matched. `read` gives a file's text.
 */
export function commentMarks(files, read, marks = MARKS) {
  const found = [];
  for (const file of files) {
    if (!MARKED.test(file) || !CODE.test(file)) continue;
    for (const comment of commentsOf(read(file))) {
      const lines = comment.text.split("\n");
      lines.forEach((text, k) => {
        for (const mark of marks) for (const match of text.matchAll(mark.pattern))
          found.push(`${file}:${comment.line + k} holds ${mark.name} in a comment: ${match[0]}`);
      });
    }
  }
  return found;
}

/** The repository's files, tracked or new, that are on disk: its broken citations and its comments' marks. */
export function repositoryDocuments() {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  const files = listed.split("\n").filter((file) => file && statSync(`${ROOT}/${file}`, { throwIfNoEntry: false })?.isFile());
  const texts = new Map();
  const read = (file) => {
    if (!texts.has(file)) texts.set(file, readFileSync(`${ROOT}/${file}`, "utf8"));
    return texts.get(file);
  };
  return { citations: brokenCitations(files, read), marks: commentMarks(files, read) };
}
