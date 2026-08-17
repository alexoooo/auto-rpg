// Inventory-phase documentation checks. Later documentation sessions extend
// this file; the Markdown readers below deliberately know nothing about the
// current document hierarchy beyond the contracts passed to them.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT_DOCUMENTS = ["DESIGN.md", "README.md", "AGENTS.md"];
const ARCHITECTURE_DOCUMENTS = [
  "overview.md", "simulation.md", "policy.md", "replay-hashing.md", "browser-runtime.md", "assets.md", "learning.md",
];
const DESIGN_DOCUMENTS = ["combat.md", "navigation-visibility.md", "presentation.md", "progression.md"];
const DECISION_DOCUMENTS = [
  "0001-deterministic-fixed-point.md", "0002-record-commands-in-replays.md", "0003-renderer-outside-sim.md",
];
const REFERENCE_DOCUMENTS = ["determinism.md", "commands.md", "hashes.md", "frame-abi.md"];
const DESIGN_COMPATIBILITY_ANCHORS = [
  "the-determinism-contract", "the-agent-boundary", "the-swing", "weight-momentum-and-inertia", "replays",
  "deliberate-non-choices", "the-floor-plan", "performance-notes", "art-direction",
  "rules-that-exist-for-termination-not-for-flavour", "open-questions",
];
const DESTINATIONS = new Set([
  "orientation", "architecture", "design", "decision", "reference", "evidence", "temporary plan",
]);
const STATUSES = new Set(["current", "historical", "stale", "duplicate"]);
const MOVE_PHASES = new Set(["keep root", "v2-04", "v2-05", "v2-06", "v2-10", "v2-11", "v2-16"]);
const ROLES = new Set(["Player", "Contributor", "Mechanics author", "Renderer author", "Policy researcher"]);
// `.claude` is agent scratch state, and agent worktrees live under it -- each one a
// full second copy of docs/. Without the skip, every DOC_CONTRACT marker in
// docs/reference/ is reported twice over: once as living outside docs/reference, and
// once as a duplicate of itself. Eighty-two failures, none of them real.
const SKIP_DIRS = new Set([".claude", ".git", ".tools", "node_modules", "target"]);
const ROOM_CONTRACT_MARKERS = new Map([
  ["room-asset-manifest", "manifest-semantics"],
  ["room-asset-coordinates", "coordinates-origins-and-sockets"],
  ["room-asset-reproducibility", "reproducibility-and-hashes"],
  ["room-asset-validation", "validation-and-budgets"],
  ["room-asset-disclosure", "authored-room-disclosure-mapping"],
  ["room-asset-loader-lifecycle", "loader-lifecycle-and-failure"],
]);

function structuredInboundLinks(value) {
  if (value === "none") return true;
  const token = "(?:`[^`]+`|\\[[^\\]]+\\]\\([^)]+\\))(?: \\(\\d+\\))?";
  return new RegExp(`^${token}(?:, ${token})*$`).test(value);
}

function walkMarkdown(dir, visit) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory() && SKIP_DIRS.has(item.name)) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walkMarkdown(file, visit);
    else if (item.isFile() && item.name.toLowerCase().endsWith(".md")) visit(file);
  }
}

function durableMarkdownFiles(root) {
  const result = [];
  walkMarkdown(root, (file) => {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (rel.startsWith("docs/plans/") || rel === "docs/documentation-inventory.md") return;
    result.push(file);
  });
  return result;
}

function movedDesignDestination(root, source, headingText) {
  if (!source || !source.startsWith("DESIGN.md#")) return null;
  const anchor = source.slice("DESIGN.md#".length);
  for (const file of durableMarkdownFiles(root)) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (!/^(docs\/(architecture|design|decisions|reference|performance)\/)/.test(rel)) continue;
    const markdown = fs.readFileSync(file, "utf8");
    if (headings(markdown).some((heading) => heading.anchor === anchor && heading.text === headingText)) return file;
    if (supersessionContent(markdown).some((content) => content.includes(`DESIGN.md#${anchor}`))) return file;
  }
  return null;
}

function supersessionContent(markdown) {
  const lines = markdown.split(/\r?\n/);
  const hs = headings(markdown);
  const result = [];
  for (const heading of hs.filter((candidate) => /^Superseded DESIGN\b/i.test(candidate.text))) {
    const next = hs.find((candidate) => candidate.line > heading.line && candidate.level <= heading.level);
    result.push(lines.slice(heading.line, next ? next.line - 1 : lines.length).join("\n"));
  }
  for (const paragraph of markdown.split(/(?:\r?\n){2,}/)) {
    if (/\bsupersed(?:e|es|ed|ing)\b/i.test(paragraph) && /DESIGN\.md#[\w-]+/.test(paragraph)) result.push(paragraph);
  }
  return result;
}

function inboundLinkIndex(root, rootHeadings) {
  const rootFiles = new Map(ROOT_DOCUMENTS.map((rel) => [path.resolve(root, rel), rel]));
  const index = new Map([...rootHeadings.keys()].map((source) => [source, new Map()]));
  const inventoryFile = path.resolve(root, "docs", "documentation-inventory.md");
  walkMarkdown(root, (file) => {
    const absolute = path.resolve(file);
    if (absolute === inventoryFile) return;
    const sourceLabel = path.relative(root, absolute).replaceAll("\\", "/");
    const markdown = fs.readFileSync(absolute, "utf8");
    for (const match of markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1].trim().replace(/^<|>$/g, "");
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const hash = href.indexOf("#");
      if (hash === -1) continue;
      const filePart = href.slice(0, hash).split("?", 1)[0];
      let anchor;
      try {
        anchor = decodeURIComponent(href.slice(hash + 1));
      } catch (_) {
        continue;
      }
      const targetFile = path.resolve(path.dirname(absolute), filePart || path.basename(absolute));
      const rootRel = rootFiles.get(targetFile);
      if (!rootRel) continue;
      const target = `${rootRel}#${anchor}`;
      const sources = index.get(target);
      if (sources) sources.set(sourceLabel, (sources.get(sourceLabel) || 0) + 1);
    }
  });
  return index;
}

function parseInboundAccounting(value, root, errors, line) {
  if (value === "none") return new Map();
  const result = new Map();
  for (const token of value.split(", ")) {
    let label;
    let count;
    let match = /^`([^`]+)`(?: \((\d+)\))?$/.exec(token);
    if (match) {
      label = match[1];
      count = Number(match[2] || 1);
    } else {
      match = /^\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)(?: \((\d+)\))?$/.exec(token);
      if (!match) continue;
      label = path.relative(root, path.resolve(root, "docs", match[1])).replaceAll("\\", "/");
      count = Number(match[2] || 1);
    }
    if (result.has(label)) errors.push(`docs/documentation-inventory.md:${line}: inbound source ${label} is listed more than once`);
    result.set(label, count);
  }
  return result;
}

function sameAccounting(expected, actual) {
  if (expected.size !== actual.size) return false;
  for (const [label, count] of expected) {
    if (actual.get(label) !== count) return false;
  }
  return true;
}

function githubSlug(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function headings(markdown) {
  const counts = new Map();
  const result = [];
  let fenced = false;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = githubSlug(match[2]);
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    result.push({
      level: match[1].length,
      text: match[2],
      anchor: count === 0 ? base : `${base}-${count}`,
      line: index + 1,
    });
  }
  return result;
}

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let escaped = false;
  for (const char of line.trim().replace(/^\|/, "").replace(/\|$/, "")) {
    if (char === "|" && !escaped) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  cells.push(cell.trim());
  return cells;
}

function tables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const result = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[i + 1])) continue;
    const headers = splitTableRow(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j])) {
      const cells = splitTableRow(lines[j]);
      rows.push({ cells, line: j + 1 });
      j++;
    }
    result.push({ headers, rows, line: i + 1 });
    i = j - 1;
  }
  return result;
}

function inventoryRows(markdown, errors) {
  const required = ["Current source anchor", "Heading", "Destination", "Status", "Move phase", "Inbound links", "Audit note"];
  const rows = [];
  for (const table of tables(markdown)) {
    if (!table.headers.includes("Current source anchor")) continue;
    for (const header of required) {
      if (!table.headers.includes(header)) errors.push(`docs/documentation-inventory.md:${table.line}: missing table column ${header}`);
    }
    const indexes = Object.fromEntries(required.map((header) => [header, table.headers.indexOf(header)]));
    for (const row of table.rows) {
      if (row.cells.length !== table.headers.length) {
        errors.push(`docs/documentation-inventory.md:${row.line}: inventory row has ${row.cells.length} cells; expected ${table.headers.length}`);
        continue;
      }
      const value = (header) => indexes[header] === -1 ? "" : row.cells[indexes[header]].trim();
      const sourceCell = value("Current source anchor");
      const match = /\]\((?:\.\.\/)?(DESIGN|README|AGENTS)\.md#([^)]+)\)/.exec(sourceCell)
        || /(?:`)?(DESIGN|README|AGENTS)\.md#([\p{L}\p{N}_-]+)(?:`)?/u.exec(sourceCell);
      rows.push({
        source: match ? `${match[1]}.md#${decodeURIComponent(match[2])}` : null,
        sourceCell,
        heading: value("Heading"),
        destination: value("Destination"),
        status: value("Status"),
        movePhase: value("Move phase"),
        inboundLinks: value("Inbound links"),
        auditNote: value("Audit note"),
        line: row.line,
      });
    }
  }
  if (rows.length === 0) errors.push("docs/documentation-inventory.md: no inventory tables found");
  return rows;
}

function rootHeadingMap(root, errors) {
  const result = new Map();
  for (const rel of ROOT_DOCUMENTS) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      errors.push(`${rel}: root document is missing`);
      continue;
    }
    for (const heading of headings(fs.readFileSync(file, "utf8"))) {
      result.set(`${rel}#${heading.anchor}`, heading);
    }
  }
  return result;
}

function checkRolePaths(root, errors) {
  const mapFile = path.join(root, "docs", "README.md");
  if (!fs.existsSync(mapFile)) {
    errors.push("docs/README.md: documentation map is missing");
    return;
  }
  const markdown = fs.readFileSync(mapFile, "utf8");
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Read by role\s*$/.test(line));
  if (start === -1) {
    errors.push("docs/README.md: Read by role section is missing");
    return;
  }
  const found = new Set();
  for (let i = start + 1; i < lines.length && !/^##\s+/.test(lines[i]); i++) {
    const role = /^- \*\*([^*]+):\*\*/.exec(lines[i]);
    if (!role) continue;
    found.add(role[1]);
    const links = [...lines[i].matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
    if (links.length === 0) errors.push(`docs/README.md:${i + 1}: ${role[1]} role path has no links`);
    for (const href of links) {
      const hash = href.indexOf("#");
      if (hash === -1) {
        errors.push(`docs/README.md:${i + 1}: role link ${href} must name an existing anchor`);
        continue;
      }
      const target = path.resolve(path.dirname(mapFile), href.slice(0, hash));
      const anchor = decodeURIComponent(href.slice(hash + 1));
      if (!fs.existsSync(target)) {
        errors.push(`docs/README.md:${i + 1}: role link ${href} names a missing file`);
        continue;
      }
      const anchors = new Set(headings(fs.readFileSync(target, "utf8")).map((heading) => heading.anchor));
      if (!anchors.has(anchor)) errors.push(`docs/README.md:${i + 1}: role link ${href} names a missing anchor`);
    }
  }
  for (const role of ROLES) {
    if (!found.has(role)) errors.push(`docs/README.md: role path ${role} is missing`);
  }
  for (const role of found) {
    if (!ROLES.has(role)) errors.push(`docs/README.md: unknown role path ${role}`);
  }
}

function checkStandardHeader(file, rel, errors, allowedStatus = /^(current|proposed|historical)$/) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  if (!/^#\s+\S/.test(lines[0] || "")) errors.push(`${rel}: first line must be a document title`);
  const fields = ["Purpose", "Status", "Canonical source", "Update when"];
  let at = 1;
  while (at < lines.length && !lines[at].trim()) at++;
  for (const field of fields) {
    const match = new RegExp(`^\\*\\*${field}:\\*\\*\\s+(.+)$`).exec(lines[at] || "");
    if (!match) errors.push(`${rel}:${at + 1}: standard header must contain nonempty ${field} in order`);
    else if (field === "Status" && !allowedStatus.test(match[1])) {
      errors.push(`${rel}:${at + 1}: standard header has unknown Status ${match[1]}`);
    }
    at++;
  }
}

function checkLocalLinks(file, root, errors) {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  const markdown = fs.readFileSync(file, "utf8");
  for (const match of markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1].trim().replace(/^<|>$/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const hash = href.indexOf("#");
    const filePart = (hash === -1 ? href : href.slice(0, hash)).split("?", 1)[0];
    const target = path.resolve(path.dirname(file), filePart || path.basename(file));
    const line = markdown.slice(0, match.index).split(/\r?\n/).length;
    if (!fs.existsSync(target)) {
      errors.push(`${rel}:${line}: local link ${href} names a missing file`);
      continue;
    }
    if (hash === -1) continue;
    let anchor;
    try {
      anchor = decodeURIComponent(href.slice(hash + 1));
    } catch (_) {
      errors.push(`${rel}:${line}: local link ${href} has an invalid encoded anchor`);
      continue;
    }
    if (!anchor) {
      errors.push(`${rel}:${line}: local link ${href} has an empty anchor`);
      continue;
    }
    if (target.toLowerCase().endsWith(".md")) {
      const anchors = new Set(headings(fs.readFileSync(target, "utf8")).map((heading) => heading.anchor));
      if (!anchors.has(anchor)) errors.push(`${rel}:${line}: local link ${href} names a missing Markdown anchor`);
      continue;
    }
    const sourceLine = /^L(\d+)(?:-L(\d+))?$/.exec(anchor);
    if (!sourceLine) {
      errors.push(`${rel}:${line}: source link ${href} must use a Markdown anchor or GitHub Lx line anchor`);
      continue;
    }
    const lineCount = fs.readFileSync(target, "utf8").split(/\r?\n/).length;
    const first = Number(sourceLine[1]);
    const last = Number(sourceLine[2] || sourceLine[1]);
    if (first < 1 || last < first || last > lineCount) {
      errors.push(`${rel}:${line}: source link ${href} names lines outside a ${lineCount}-line file`);
    }
  }
}

function workspaceDependencyEdges(root, errors) {
  const workspace = fs.readFileSync(path.join(root, "Cargo.toml"), "utf8");
  const membersMatch = /members\s*=\s*\[([^\]]+)\]/s.exec(workspace);
  if (!membersMatch) {
    errors.push("Cargo.toml: cannot read workspace members for the architecture diagram");
    return new Set();
  }
  const members = [...membersMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const names = new Map();
  for (const member of members) {
    const manifest = fs.readFileSync(path.join(root, member, "Cargo.toml"), "utf8");
    const name = /^name\s*=\s*"([^"]+)"/m.exec(manifest);
    if (!name) errors.push(`${member}/Cargo.toml: package name is missing`);
    else names.set(name[1], { member, manifest });
  }
  const edges = new Set();
  for (const [name, value] of names) {
    let section = "";
    for (const raw of value.manifest.split(/\r?\n/)) {
      const heading = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
      if (heading) {
        section = heading[1];
        continue;
      }
      if (section !== "dependencies") continue;
      const dependency = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(raw);
      if (dependency && names.has(dependency[1])) edges.add(`${name}->${dependency[1]}`);
    }
  }
  return edges;
}

function dependencyDiagramEdges(markdown, errors) {
  const blocks = [...markdown.matchAll(/```mermaid\s*\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
  const block = blocks.find((value) => ["fx", "sim", "policy", "lab", "web"].every((name) => new RegExp(`\\b${name}\\b`).test(value)));
  if (!block) {
    errors.push("docs/architecture/overview.md: crate dependency Mermaid diagram is missing");
    return new Set();
  }
  const edges = new Set();
  for (const line of block.split(/\r?\n/)) {
    if (!line.includes("-->")) continue;
    const nodes = line.split(/\s*-->\s*/).map((part) => /^\s*([A-Za-z_][A-Za-z0-9_-]*)/.exec(part)).filter(Boolean).map((match) => match[1]);
    for (let i = 0; i + 1 < nodes.length; i++) edges.add(`${nodes[i]}->${nodes[i + 1]}`);
  }
  return edges;
}

function checkProposedBoundaries(markdown, rel, errors) {
  const term = /\b(worker|babylon|articulated|learned|learning|neural(?:-network)?|mlp|webgpu|gpu|glb)\b/ig;
  // A term leaves this rule when it ships, and the document that owns it is the
  // one that gets to say so. `learning.md` joined the list on 2026-08-11: v2-19
  // landed a trained network and v2-ui-08 put its inference inside `web.wasm`,
  // so a page whose whole job is to state what learning exists could no longer
  // do it in sentences shaped like denials. `gpu`, `webgpu`, `mlp` and
  // `neural-network` are deliberately *not* granted there -- none of them ships,
  // and that page's "Still absent" section has to keep reading as absence.
  const shippedTerms = rel === "docs/architecture/browser-runtime.md"
    ? new Set(["worker", "babylon", "webgpu", "gpu"])
    : rel === "docs/architecture/assets.md"
      ? new Set(["gpu"])
    : rel === "docs/architecture/overview.md"
      ? new Set(["articulated", "learned", "learning"])
    : rel === "docs/architecture/policy.md"
      ? new Set(["articulated", "learned", "learning"])
    : rel === "docs/architecture/learning.md"
      ? new Set(["learned", "learning", "articulated"])
    : new Set();
  const lines = markdown.split(/\r?\n/);
  const proposed = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!/^>\s*\*\*Proposed by v2\b/i.test(lines[i])) continue;
    while (i < lines.length && /^>/.test(lines[i])) {
      proposed.add(i);
      i++;
    }
    i--;
  }
  let paragraph = [];
  let paragraphLine = 0;
  const inspect = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ");
    paragraph = [];
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      term.lastIndex = 0;
      for (const match of sentence.matchAll(term)) {
        if (shippedTerms.has(match[0].toLowerCase())) continue;
        if (match[0].toLowerCase() === "glb" && scopedCurrentRoomGlb(sentence, rel)) continue;
        const before = sentence.slice(0, match.index);
        const after = sentence.slice(match.index + match[0].length);
        const localBefore = before.split(/\bbut\b|\bhowever\b|;/i).pop();
        const absentBefore = /\b(no|not|without|future|later|when)\b|rather than|would hide/i.test(localBefore);
        const absentAfter = /^.{0,40}\b(does not|do not|is not|are not|is absent|are absent|would hide)\b/i.test(after);
        if (!absentBefore && !absentAfter) {
          errors.push(`${rel}:${paragraphLine}: ${match[0]} is an unboxed v2 term without a local absence or future contrast`);
        }
      }
    }
  };
  for (let i = 0; i < lines.length; i++) {
    if (proposed.has(i)) {
      inspect();
      continue;
    }
    const line = lines[i].replace(/^>\s?/, "");
    if (!line.trim() || /^```|^~~~/.test(line)) {
      inspect();
      continue;
    }
    if (/^# Learning status\s*$/.test(line)) continue;
    if (paragraph.length === 0) paragraphLine = i + 1;
    paragraph.push(line.trim());
  }
  inspect();
}

const ROOM_GLB_AUTHORITIES = new Set([
  "docs/architecture/assets.md",
  "docs/architecture/browser-runtime.md",
  "docs/reference/room-asset-contract.md",
  "docs/reference/renderer-contract.md",
  "docs/design/presentation.md",
  "docs/performance/v2-room-matrix.md",
  "docs/performance/evidence/2026-08-room-slice.md",
  "docs/decisions/0003-renderer-outside-sim.md",
  "docs/decisions/0003-reversible-presentation-engine.md",
  "docs/reference/combatant-asset-contract.md",
]);

function scopedCurrentRoomGlb(sentence, rel) {
  if (!ROOM_GLB_AUTHORITIES.has(rel)) return false;
  if (rel === "docs/reference/combatant-asset-contract.md") return true;
  if (/\b(combatant|rig|actor|articulated)\b/i.test(sentence)) return false;
  if ([
    "docs/reference/room-asset-contract.md",
    "docs/performance/v2-room-matrix.md",
    "docs/performance/evidence/2026-08-room-slice.md",
  ].includes(rel)) return true;
  return /\b(room|room-slice|authored|representative)\b/i.test(sentence);
}

function checkCurrentGlbClaims(root, files, errors) {
  for (const file of files) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const markdown = fs.readFileSync(file, "utf8");
    if (!/^\*\*Status:\*\*\s+current\s*$/mi.test(markdown)) continue;
    const lines = markdown.split(/\r?\n/);
    let fenced = false;
    let proposed = false;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      if (/^>\s*\*\*Proposed by v2\b/i.test(line)) proposed = true;
      else if (proposed && !/^>/.test(line)) proposed = false;
      if (proposed || !/\bGLB\b/i.test(line)) continue;
      for (const sentence of line.split(/(?<=[.!?])\s+/)) {
        if (!/\bGLB\b/i.test(sentence)) continue;
        const absent = /\b(no|not|without|future|later|proposed|absent)\b|rather than/i.test(sentence);
        if (!absent && !scopedCurrentRoomGlb(sentence, rel)) {
          errors.push(`${rel}:${index + 1}: current GLB claim is outside a room authority or names deferred combatant/rig work`);
        }
      }
    }
  }
}

function mermaidBlockCount(markdown) {
  return [...markdown.matchAll(/```mermaid\s*\r?\n[\s\S]*?```/g)].length;
}

function checkSubstantiveArchitecture(markdown, rel, requireSources, errors) {
  if (!headings(markdown).some((heading) => heading.level === 2)) errors.push(`${rel}: architecture document has no H2 section`);
  if (requireSources && !headings(markdown).some((heading) => heading.level === 2 && heading.text === "Source anchors")) {
    errors.push(`${rel}: current authority document requires a ## Source anchors section`);
  }
  let fenced = false;
  const prose = markdown.split(/\r?\n/).filter((line) => {
    const value = line.trim();
    if (/^```|^~~~/.test(value)) {
      fenced = !fenced;
      return false;
    }
    return !fenced && value && !/^#|^-\s|^>/.test(value)
      && !/^\*\*(Purpose|Status|Canonical source|Update when):\*\*/.test(value);
  });
  if (prose.length === 0) errors.push(`${rel}: architecture document has no substantive non-header prose`);
}

function requireSymbolAnchor(markdown, file, root, targetRel, symbol, description, errors) {
  const target = path.resolve(root, targetRel);
  for (const match of markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1];
    const hash = href.indexOf("#");
    if (hash === -1 || path.resolve(path.dirname(file), href.slice(0, hash)) !== target) continue;
    const anchor = /^L(\d+)(?:-L\d+)?$/.exec(href.slice(hash + 1));
    if (!anchor) continue;
    const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
    const at = Number(anchor[1]) - 1;
    const window = lines.slice(Math.max(0, at - 2), at + 3).join("\n");
    if (symbol.test(window)) return;
  }
  const rel = path.relative(root, file).replaceAll("\\", "/");
  errors.push(`${rel}: ${description} requires a #L source link whose line contains ${symbol}`);
}

function checkArchitecture(root) {
  const errors = [];
  const directory = path.join(root, "docs", "architecture");
  const diagramOwners = new Set(["overview.md", "simulation.md", "replay-hashing.md", "browser-runtime.md"]);
  let diagramTotal = 0;
  for (const name of ARCHITECTURE_DOCUMENTS) {
    const file = path.join(directory, name);
    const rel = `docs/architecture/${name}`;
    if (!fs.existsSync(file)) {
      errors.push(`${rel}: required architecture document is missing`);
      continue;
    }
    const markdown = fs.readFileSync(file, "utf8");
    checkStandardHeader(file, rel, errors);
    checkLocalLinks(file, root, errors);
    checkProposedBoundaries(markdown, rel, errors);
    checkSubstantiveArchitecture(markdown, rel, !new Set(["assets.md", "learning.md"]).has(name), errors);
    const diagrams = mermaidBlockCount(markdown);
    diagramTotal += diagrams;
    const expectedDiagrams = diagramOwners.has(name) ? 1 : 0;
    if (diagrams !== expectedDiagrams) errors.push(`${rel}: expected ${expectedDiagrams} Mermaid block, found ${diagrams}`);

    if (name === "simulation.md") {
      requireSymbolAnchor(markdown, file, root, "crates/sim/src/world.rs", /pub fn step\s*\(/, "World::step", errors);
    } else if (name === "policy.md") {
      requireSymbolAnchor(markdown, file, root, "crates/policy/src/lib.rs", /pub trait Policy\b/, "Policy trait", errors);
    } else if (name === "replay-hashing.md") {
      requireSymbolAnchor(markdown, file, root, "crates/sim/src/replay.rs", /pub struct Replay\b/, "Replay", errors);
      requireSymbolAnchor(markdown, file, root, "crates/sim/src/scenario.rs", /pub fn fingerprint\s*\(/, "Scenario::fingerprint", errors);
      requireSymbolAnchor(markdown, file, root, "crates/sim/src/world.rs", /pub fn state_hash\s*\(/, "World::state_hash", errors);
    } else if (name === "browser-runtime.md") {
      requireSymbolAnchor(markdown, file, root, "crates/web/src/lib.rs", /thread_local!\s*\{/, "thread_local publication pools", errors);
      requireSymbolAnchor(markdown, file, root, "crates/web/src/lib.rs", /fn write_frame\s*\(/, "Sim::write_frame", errors);
      requireSymbolAnchor(markdown, file, root, "crates/web/src/lib.rs", /pub extern "C" fn\s+\w+/, "wasm exports", errors);
    }
  }
  if (diagramTotal !== 4) errors.push(`docs/architecture/: expected exactly four Mermaid blocks, found ${diagramTotal}`);
  const overview = path.join(directory, "overview.md");
  if (fs.existsSync(overview)) {
    const expected = workspaceDependencyEdges(root, errors);
    const actual = dependencyDiagramEdges(fs.readFileSync(overview, "utf8"), errors);
    for (const edge of expected) if (!actual.has(edge)) errors.push(`docs/architecture/overview.md: dependency diagram is missing workspace edge ${edge}`);
    for (const edge of actual) if (!expected.has(edge)) errors.push(`docs/architecture/overview.md: dependency diagram has non-workspace edge ${edge}`);
  }
  return errors;
}

function localDestinationLinkResolves(root, fromFile, href) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  const hash = href.indexOf("#");
  const filePart = hash === -1 ? href : href.slice(0, hash);
  const target = path.resolve(path.dirname(fromFile), filePart || path.basename(fromFile));
  const rel = path.relative(root, target).replaceAll("\\", "/");
  if (rel.startsWith("docs/plans/") || !fs.existsSync(target) || path.resolve(target) === path.resolve(root, "DESIGN.md")) return false;
  if (hash === -1 || !target.toLowerCase().endsWith(".md")) return true;
  const anchor = href.slice(hash + 1);
  return headings(fs.readFileSync(target, "utf8")).some((heading) => heading.anchor === anchor);
}

function checkRootDesignCompatibility(root, errors) {
  const file = path.join(root, "DESIGN.md");
  const markdown = fs.readFileSync(file, "utf8");
  const lines = markdown.split(/\r?\n/);
  if (lines.length > 300 || markdown.length > 20000) errors.push("DESIGN.md: compatibility entry is not short");
  const hs = headings(markdown);
  for (const anchor of DESIGN_COMPATIBILITY_ANCHORS) {
    const heading = hs.find((candidate) => candidate.level === 2 && candidate.anchor === anchor);
    if (!heading) {
      errors.push(`DESIGN.md#${anchor}: former top-level compatibility H2 is missing`);
      continue;
    }
    const next = hs.find((candidate) => candidate.level === 2 && candidate.line > heading.line);
    const section = lines.slice(heading.line - 1, next ? next.line - 1 : lines.length).join("\n");
    const links = [...section.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
    if (!links.some((href) => localDestinationLinkResolves(root, file, href))) {
      errors.push(`DESIGN.md#${anchor}: compatibility section has no valid durable destination link`);
    }
  }
}

function checkDurablePlanAuthority(root, errors) {
  for (const file of durableMarkdownFiles(root)) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const markdown = fs.readFileSync(file, "utf8");
    const canonical = /^\*\*Canonical source:\*\*\s+(.+)$/m.exec(markdown);
    if (!canonical) continue;
    const links = [...canonical[1].matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
    if (links.length > 0 && links.every((href) => {
      const target = path.resolve(path.dirname(file), href.split("#", 1)[0]);
      return path.relative(root, target).replaceAll("\\", "/").startsWith("docs/plans/");
    })) {
      errors.push(`${rel}: canonical source depends only on temporary docs/plans`);
    }
    for (const paragraph of markdown.split(/(?:\r?\n){2,}/)) {
      if (/^>\s*\*\*Proposed by v2\b/im.test(paragraph)) continue;
      const paragraphLinks = [...paragraph.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
      const planLinks = paragraphLinks.filter((href) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
        const target = path.resolve(path.dirname(file), href.split("#", 1)[0]);
        return path.relative(root, target).replaceAll("\\", "/").startsWith("docs/plans/");
      });
      if (planLinks.length === 0) continue;
      const durableLinks = paragraphLinks.filter((href) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
        const target = path.resolve(path.dirname(file), href.split("#", 1)[0]);
        const targetRel = path.relative(root, target).replaceAll("\\", "/");
        return fs.existsSync(target) && !targetRel.startsWith("docs/plans/");
      });
      const visibleParagraph = paragraph.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      const explicitlyFuture = /\b(?:future|forward work|proposed|pending|roadmap|later|will be|not current)\b/i.test(visibleParagraph);
      if (!explicitlyFuture && durableLinks.length === 0) {
        const line = markdown.slice(0, markdown.indexOf(paragraph)).split(/\r?\n/).length;
        errors.push(`${rel}:${line}: shipped/current claim depends only on temporary docs/plans`);
      }
    }
  }
}

function checkHistoricalEvidence(root, errors) {
  const directory = path.join(root, "docs", "performance", "evidence");
  if (!fs.existsSync(directory)) return;
  walkMarkdown(directory, (file) => {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const markdown = fs.readFileSync(file, "utf8");
    checkStandardHeader(file, rel, errors);
    checkLocalLinks(file, root, errors);
    const status = /^\*\*Status:\*\*\s+(.+)$/m.exec(markdown);
    if (!status || !/historical/i.test(status[1])) return;
    const date = /\*\*Date:\*\*\s*([^\n]*\b20\d{2}\b[^\n]*)/i.exec(markdown);
    const hardware = /\*\*Hardware:\*\*\s*(\S[^\n]*)/i.exec(markdown);
    if (!date) errors.push(`${rel}: historical evidence must name a dated year`);
    if (!hardware) errors.push(`${rel}: historical evidence must name hardware`);
    if (!headings(markdown).some((heading) => heading.level === 2 && /^Method\b/i.test(heading.text))) {
      errors.push(`${rel}: historical evidence must include a ## Method section`);
    }
  });
}

function markdownLinks(markdown) {
  const links = [];
  let fenced = false;
  let offset = 0;
  for (const line of markdown.split(/(?<=\n)/)) {
    const body = line.replace(/\r?\n$/, "");
    if (/^\s*(```|~~~)/.test(body)) {
      fenced = !fenced;
      offset += line.length;
      continue;
    }
    if (!fenced) {
      for (const match of body.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
        links.push({
          href: match[2].trim().replace(/^<|>$/g, ""),
          line: markdown.slice(0, offset + match.index).split(/\r?\n/).length,
          text: match[1],
          body,
          column: match.index,
        });
      }
    }
    offset += line.length;
  }
  return links;
}

function markdownImages(markdown) {
  const images = [];
  let fenced = false;
  let offset = 0;
  for (const line of markdown.split(/(?<=\n)/)) {
    const body = line.replace(/\r?\n$/, "");
    if (/^\s*(```|~~~)/.test(body)) {
      fenced = !fenced;
      offset += line.length;
      continue;
    }
    if (!fenced) {
      for (const match of body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
        images.push({
          href: match[2].trim().replace(/^<|>$/g, ""),
          line: markdown.slice(0, offset + match.index).split(/\r?\n/).length,
          text: match[1],
          body,
          column: match.index,
        });
      }
    }
    offset += line.length;
  }
  return images;
}

function allMarkdownFiles(root) {
  const result = [];
  walkMarkdown(root, (file) => result.push(file));
  return result;
}

function enforcementMarkdownFiles(root) {
  const result = [];
  walkMarkdown(root, (file) => {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (!rel.startsWith("docs/plans/")) result.push(file);
  });
  return result;
}

// ------------------------------------------------------- source line anchors
//
// A `path#Lnnn` link used to be checked for range only: any line of the right
// file passed. So every anchor rotted the moment somebody inserted a line above
// it, silently, and the checker went on reporting a pass. This gate found
// twenty-three stale on the day it was written, and a twenty-fourth beside one
// of them: three sessions had each broken a handful by adding an import near the
// top of a file, and the nine test anchors in `v2-reference-matrix.md` were
// uniformly ten lines short for exactly that reason.
//
// What is checkable is the *claim the link makes*, and there are three shapes:
//
//   1. It names a symbol -- [`Sim::advance`](../../crates/web/src/lib.rs#L2933).
//      The leaf of that name has to be within `ANCHOR_CONTEXT` lines of the
//      anchor, or the link is pointing at something that is not what it says.
//   2. It names a file or a crate -- [`crates/web/src/lib.rs`](...#L10718) --
//      which is a pointer at a region, and there is nothing in the *text* to
//      check. The golden registry writes the subject in the row's first cell
//      instead (`` `LAB_HASH` ``, or failing that the pinned hex value), so a
//      link inside a table row is held to its row's subject. This is the shape
//      that reached `docs/reference/hashes.md`: twenty-seven anchors into the
//      exact lines that must not drift, none of them checked by their text.
//   3. Neither -- a bare region pointer with no subject anywhere. All that is
//      left is that the anchor lands somewhere a reader can recognise as the
//      *start* of something rather than in the middle of a sentence, which is
//      what `startsSomething` asks. It is the weakest of the three and it is
//      the one that caught ADR 0003's two anchors, mid-comment and blank.
//
// **What still walks through:** the leaf match is a mention and not a
// definition, so an anchor that lands on a *call* of the symbol it names passes.
// That is deliberate -- plenty of these links point at a call site on purpose --
// and it is why the gate is a rot detector and not a symbol resolver. It also
// says nothing about link text that is prose (`[the frame writer](...#L4090)`),
// because prose has no leaf; four links in the tree have that shape and they
// fall through to rule 3.
const ANCHOR_CONTEXT = 4;

// The identifier a symbol name ends in: `Sim::advance` -> `advance`,
// `thread_local!` -> `thread_local`, `ActorPresentation.#pose` -> `pose`.
// Anything that is not an identifier after that is not a symbol and is not
// checked, rather than being checked against a pattern that cannot match.
function symbolLeaf(value) {
  const leaf = value.replace(/\(\)$/, "").replace(/!$/, "").split(/::|->|\./).pop().replace(/^#/, "");
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(leaf) ? leaf : null;
}

// Whether a code span names the file it links into rather than a symbol inside
// it: a path, a file name (with or without a trailing `:line`), or a bare path
// component -- `fx` for `crates/fx/src/geom.rs`, `rules` for `rules.rs`.
// **Case sensitive on purpose**: `world` is `world.rs` and `World` is the type.
function namesItsTarget(value, targetRel) {
  if (/[\/\\]/.test(value)) return true;
  if (/\.[A-Za-z0-9]+(?::\d+)?$/.test(value)) return true;
  const parts = targetRel.split("/");
  return parts.includes(value) || parts[parts.length - 1].replace(/\.[^.]+$/, "") === value;
}

// What a table row says its anchors are about, read from the cells to the left
// of the link: the pin's name and the pin's value. **Either** satisfies the
// anchor, because a pin is written down two ways -- `const LAB_HASH: u64 = ...`
// names it, `assert_eq!(combat_geometry_digest(), 0x9d15_...)` does not name it
// and is still exactly where that number lives. Requiring the name would have
// rejected three correct registry rows.
//
// Rows only. On a prose line the nearest earlier code span belongs to a
// different clause: `[`World`](world.rs#L85), deterministic geometry in
// [`fx`](geom.rs#L92)` would otherwise demand `World` at the second anchor.
function tableRowSubjects(body, column) {
  if (!/^\s*\|/.test(body)) return [];
  const subjects = [];
  for (const match of body.slice(0, column).matchAll(/`([^`]+)`/g)) {
    const span = match[1].trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(span)) subjects.push({ kind: "symbol", value: span });
    else if (/^0x[0-9a-f]+$/i.test(span)) subjects.push({ kind: "hex", value: span });
  }
  return subjects;
}

// Rust and JavaScript both write long hash literals with `_` separators that the
// prose does not, so compare on the digits.
function hexNear(window, value) {
  const wanted = value.toLowerCase().replaceAll("_", "");
  return window.some((text) => [...text.matchAll(/0x[0-9a-f_]+/gi)]
    .some((match) => match[0].toLowerCase().replaceAll("_", "") === wanted));
}

function symbolNear(window, leaf) {
  const word = new RegExp(`\\b${leaf}\\b`);
  return window.some((text) => word.test(text));
}

// Rule 3 asks a question about syntax, so it is asked only of the languages
// whose syntax `startsSomething` actually models. Every `#L` target in the tree
// is one of these; a `.txt` or a `.csv` has no declarations to land on and is
// left to the range check alone rather than being judged against a grammar it
// does not have.
const STRUCTURED_SOURCE = /\.(?:rs|ts|tsx|js|mjs|cjs|jsx)$/i;

// Rule 3. A declaration, an attribute, or the first line of a comment block --
// anything whose line is the beginning of a thing rather than its middle. Line 1
// is always the head of a file.
function startsSomething(lines, index) {
  if (index === 0) return true;
  const text = (lines[index] || "").trim();
  if (!text) return false;
  const comment = /^(?:\/\/+!?|\/\*+|\*|#(?!\[)|<!--|--|;;)\s?/.exec(text);
  if (comment) {
    const inside = text.slice(comment[0].length);
    // A section head inside a doc block is the start of something even though
    // the line above it is also a comment: `//! # The frame buffer` is what
    // `frame-abi.md` points at, and `web/main.js` navigates by `// ---- draw`
    // banners the same way.
    if (/^#{1,6}\s+\S/.test(inside) || /^[-=*_]{4,}/.test(inside)) return true;
    return !/^(?:\/\/|\/\*|\*|#(?!\[)|<!--|--|;;)/.test((lines[index - 1] || "").trim());
  }
  return /^(?:#\[|@)/.test(text)
    || /^(?:(?:pub(?:\([^)]*\))?|export|default|declare|async|unsafe|extern(?:\s+"[^"]*")?|readonly|static|abstract|private|protected|public)\s+)*(?:const|let|var|function|class|interface|type|enum|struct|trait|impl|union|mod|fn|use|import|from|macro_rules!|namespace)\b/.test(text)
    || /^[A-Za-z_$][\w$]*!\s*[{([]/.test(text)
    || /^(?:test|describe|it|bench)\s*\(/.test(text)
    || /^[A-Za-z_$][\w$]*\s*[:=]\s*(?:function\b|\()/.test(text)
    || /^[A-Za-z_$#][\w$]*\s*(?:<[^>]*>)?\s*\([^;]*$/.test(text);
}

// Everything above, applied to one resolved `#L` link. Returns a complaint or
// null.
function staleSourceAnchor(target, targetRel, first, last, text, body, column) {
  const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
  const window = lines.slice(Math.max(0, first - 1 - ANCHOR_CONTEXT), Math.min(lines.length, last + ANCHOR_CONTEXT));
  const span = /^`([^`]+)`$/.exec(text.trim());
  const value = span ? span[1].trim() : null;
  if (value !== null && !namesItsTarget(value, targetRel)) {
    const leaf = symbolLeaf(value);
    if (leaf === null) return null;
    return symbolNear(window, leaf) ? null
      : `names \`${value}\`, but no \`${leaf}\` is within ${ANCHOR_CONTEXT} lines of ${targetRel}:${first}`;
  }
  const subjects = tableRowSubjects(body, column);
  if (subjects.length > 0) {
    if (subjects.some((subject) => subject.kind === "symbol" ? symbolNear(window, subject.value) : hexNear(window, subject.value))) {
      return null;
    }
    return `is the anchor for ${subjects.map((subject) => `\`${subject.value}\``).join(" / ")}, `
      + `none of which is within ${ANCHOR_CONTEXT} lines of ${targetRel}:${first}`;
  }
  if (!STRUCTURED_SOURCE.test(targetRel)) return null;
  return startsSomething(lines, first - 1) ? null
    : `points into the middle of ${targetRel}:${first} rather than at the start of a declaration, a comment block, or the file`;
}

function checkGlobalInternalLinks(root, files, errors) {
  for (const file of files) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const markdown = fs.readFileSync(file, "utf8");
    for (const { href, line, text, body, column } of [...markdownLinks(markdown), ...markdownImages(markdown)]) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const hash = href.indexOf("#");
      const filePart = (hash === -1 ? href : href.slice(0, hash)).split("?", 1)[0];
      const target = path.resolve(path.dirname(file), filePart || path.basename(file));
      if (!fs.existsSync(target)) {
        errors.push(`${rel}:${line}: internal link ${href} names a missing file`);
        continue;
      }
      if (hash === -1) continue;
      let anchor;
      try {
        anchor = decodeURIComponent(href.slice(hash + 1));
      } catch (_) {
        errors.push(`${rel}:${line}: internal link ${href} has an invalid encoded anchor`);
        continue;
      }
      const lineAnchor = /^L(\d+)(?:-L(\d+))?$/.exec(anchor);
      if (lineAnchor) {
        if (!fs.statSync(target).isFile()) {
          errors.push(`${rel}:${line}: line link ${href} does not target a file`);
          continue;
        }
        const lineCount = fs.readFileSync(target, "utf8").split(/\r?\n/).length;
        const first = Number(lineAnchor[1]);
        const last = Number(lineAnchor[2] || lineAnchor[1]);
        if (first < 1 || last < first || last > lineCount) {
          errors.push(`${rel}:${line}: line link ${href} is outside its target`);
          continue;
        }
        if (target.toLowerCase().endsWith(".md")) continue;
        const targetRel = path.relative(root, target).replaceAll("\\", "/");
        const stale = staleSourceAnchor(target, targetRel, first, last, text, body, column);
        if (stale) errors.push(`${rel}:${line}: source anchor ${href} ${stale}`);
      } else if (target.toLowerCase().endsWith(".md")) {
        const anchors = new Set(headings(fs.readFileSync(target, "utf8")).map((heading) => heading.anchor));
        if (!anchors.has(anchor)) errors.push(`${rel}:${line}: internal link ${href} names a missing anchor`);
      } else {
        errors.push(`${rel}:${line}: non-Markdown fragment ${href} must be a #L line anchor`);
      }
    }
  }
}

function checkRetiredPlanLinks(root, files, errors) {
  for (const file of files) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const markdown = fs.readFileSync(file, "utf8");
    for (const { href, line } of markdownLinks(markdown)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const target = path.resolve(path.dirname(file), href.split("#", 1)[0]);
      const targetRel = path.relative(root, target).replaceAll("\\", "/");
      if (!targetRel.startsWith("docs/plans/") || !fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
      if (/^\*\*Status:\*\*\s+retired\b/im.test(fs.readFileSync(target, "utf8"))) {
        errors.push(`${rel}:${line}: link ${href} targets a retired plan`);
      }
    }
  }
}

function checkContractMarkers(root, markerFiles, inboundFiles, errors) {
  const owners = new Map();
  const markers = [];
  for (const file of markerFiles) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const markdown = fs.readFileSync(file, "utf8");
    let fenced = false;
    const lines = markdown.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (/^\s*(```|~~~)/.test(lines[index])) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      const marker = /^\s*<!--\s*DOC_CONTRACT:\s*([a-z0-9][a-z0-9._-]*)\s*-->\s*$/i.exec(lines[index]);
      if (!marker) continue;
      const id = marker[1].toLowerCase();
      if (!rel.startsWith("docs/reference/")) errors.push(`${rel}:${index + 1}: DOC_CONTRACT markers may live only in docs/reference`);
      if (owners.has(id)) errors.push(`${rel}:${index + 1}: DOC_CONTRACT ${id} duplicates ${owners.get(id)}`);
      else owners.set(id, `${rel}:${index + 1}`);
      let following = index + 1;
      while (following < lines.length && !lines[following].trim()) following++;
      if (!/^#{1,6}\s+\S/.test(lines[following] || "")) {
        errors.push(`${rel}:${index + 1}: DOC_CONTRACT ${id} must bind to the following heading`);
      } else {
        const bound = headings(markdown).find((heading) => heading.line === following + 1);
        if (bound) markers.push({ id, file: path.resolve(file), rel, anchor: bound.anchor, line: index + 1 });
      }
    }
  }
  for (const marker of markers) {
    let inbound = false;
    for (const source of inboundFiles) {
      if (path.resolve(source) === marker.file) continue;
      for (const { href } of markdownLinks(fs.readFileSync(source, "utf8"))) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
        const hash = href.indexOf("#");
        if (hash === -1) continue;
        const target = path.resolve(path.dirname(source), href.slice(0, hash) || path.basename(source));
        let anchor;
        try {
          anchor = decodeURIComponent(href.slice(hash + 1));
        } catch (_) {
          continue;
        }
        if (target === marker.file && anchor === marker.anchor) {
          inbound = true;
          break;
        }
      }
      if (inbound) break;
    }
    if (!inbound) errors.push(`${marker.rel}:${marker.line}: DOC_CONTRACT ${marker.id} heading #${marker.anchor} has no external inbound Markdown link`);
  }
}

function checkContractConvention(root, errors) {
  const file = path.join(root, "docs", "README.md");
  if (!fs.existsSync(file)) return errors.push("docs/README.md: DOC_CONTRACT convention is missing");
  const markdown = fs.readFileSync(file, "utf8");
  for (const [label, pattern] of [
    ["marker syntax", /DOC_CONTRACT:/], ["reference-only scope", /only in `docs\/reference\//i],
    ["following-heading binding", /following\s+heading/i], ["contextual heading links", /contextual links?.*heading anchor/i],
  ]) if (!pattern.test(markdown)) errors.push(`docs/README.md: DOC_CONTRACT convention is missing ${label}`);
}

function checkRoomContractMarkers(root, errors) {
  const rel = "docs/reference/room-asset-contract.md";
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    errors.push(`${rel}: proposed room contract scaffold is missing`);
    return;
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  if (!/^\*\*Status:\*\*\s+current\s*$/mi.test(lines.join("\n"))) {
    errors.push(`${rel}: shipped room contract must have current status`);
  }
  const actual = new Map();
  for (let index = 0; index < lines.length; index++) {
    const marker = /^\s*<!--\s*DOC_CONTRACT:\s*([a-z0-9][a-z0-9._-]*)\s*-->\s*$/i.exec(lines[index]);
    if (!marker || !marker[1].startsWith("room-")) continue;
    let following = index + 1;
    while (following < lines.length && !lines[following].trim()) following++;
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[following] || "");
    actual.set(marker[1], heading ? githubSlug(heading[2]) : null);
  }
  for (const [id, anchor] of ROOM_CONTRACT_MARKERS) {
    if (!actual.has(id)) errors.push(`${rel}: required DOC_CONTRACT ${id} is missing`);
    else if (actual.get(id) !== anchor) errors.push(`${rel}: DOC_CONTRACT ${id} must bind to #${anchor}`);
  }
  for (const id of actual.keys()) {
    if (!ROOM_CONTRACT_MARKERS.has(id)) errors.push(`${rel}: unknown room DOC_CONTRACT ${id}`);
  }
}

function checkRoomMatrixScaffold(root, errors) {
  const rel = "docs/performance/v2-room-matrix.md";
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    errors.push(`${rel}: proposed room evidence matrix is missing`);
    return;
  }
  const markdown = fs.readFileSync(file, "utf8");
  for (const [label, pattern] of [
    ["five ordered slots", /\|\s*5\s*\|/],
    ["WebGPU threshold", /16\.67 ms/],
    ["WebGL2 threshold", /33\.33 ms/],
    ["Canvas p95 drift threshold", /0\.50 ms/],
    ["Canvas over-33-ms drift threshold", /0\.005/],
    ["exact floor capacities", /1,536 floor-source slots/],
    ["exact map byte count", /1,536 committed map bytes/],
    ["free-camera API", /createRoomReviewCamera\(scene, canvas, bounds, options\)/],
    ["schema-two build-input identity", /schema 2[\s\S]*buildInputsSha256/i],
    ["schema-two map identity", /roomStressMapSha256/],
    ["schema-two validator identity", /validatorSha256/],
    ["validator-report artifact", /Validator report/],
    ["lazy initial-closure rule", /initial static import closure/],
    ["enabled hidden instance sources", /enabled classic-instance sources/],
    ["exact room-camera query", /roomCamera=fixed\|free/],
  ]) if (!pattern.test(markdown)) errors.push(`${rel}: room matrix is missing ${label}`);
  const current = /^\*\*Status:\*\*\s+current\s*$/mi.test(markdown);
  if (!current) errors.push(`${rel}: automated room matrix must have current status`);
  const placeholder = /`ROOM_STRESS_MAP_SHA256`[^\n]*`PENDING_IMPLEMENTATION_LITERAL`/.test(markdown);
  if (current && placeholder) errors.push(`${rel}: current room matrix still contains the map-hash placeholder`);
  if (current && !/`ROOM_STRESS_MAP_SHA256`[^\n]*`[0-9a-f]{64}`/i.test(markdown)) {
    errors.push(`${rel}: current room matrix must record the 64-hex map hash literal`);
  }
}

function checkRoomImplementationDocs(root, errors) {
  const manifestFile = path.join(root, "tools", "art", "manifest.json");
  const sidecarFile = path.join(root, "web", "assets3d", "room_slice.json");
  const validatorFile = path.join(root, "web", "assets3d", "room_slice.validator.json");
  if (![manifestFile, sidecarFile, validatorFile].every(fs.existsSync)) return;
  let manifest, sidecar, validator;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    sidecar = JSON.parse(fs.readFileSync(sidecarFile, "utf8"));
    validator = JSON.parse(fs.readFileSync(validatorFile, "utf8"));
  } catch {
    errors.push("room documentation pins cannot be checked because an artifact manifest is invalid JSON");
    return;
  }
  const required = [
    ["build-input SHA-256", sidecar.buildInputsSha256],
    ["GLB SHA-256", manifest.outputs?.glb?.sha256],
    ["sidecar SHA-256", manifest.outputs?.sidecar?.sha256],
    ["validator SHA-256", manifest.outputs?.validator?.sha256],
    ["stress-map SHA-256", manifest.runtimeFixture?.mapSha256],
    ["payload byte count", Number(validator.payloadBytes).toLocaleString("en-US")],
    ["offline residency total", Number(validator.residency?.totalBytes).toLocaleString("en-US")],
    ["vertex count", Number(validator.counts?.vertices).toLocaleString("en-US")],
    ["triangle count", Number(validator.counts?.triangles).toLocaleString("en-US")],
  ];
  for (const rel of [
    "docs/reference/room-asset-contract.md",
    "docs/performance/v2-room-matrix.md",
    "docs/performance/evidence/2026-08-room-slice.md",
  ]) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const markdown = fs.readFileSync(file, "utf8");
    for (const [label, value] of required) {
      if (typeof value !== "string" || !value || !markdown.includes(value)) {
        errors.push(`${rel}: current automated room record is missing ${label}`);
      }
    }
  }
}

function checkCompletionChecklist(root, errors) {
  const file = path.join(root, "AGENTS.md");
  if (!fs.existsSync(file)) return errors.push("AGENTS.md: completion checklist is missing");
  const markdown = fs.readFileSync(file, "utf8");
  const hs = headings(markdown);
  const heading = hs.find((candidate) => candidate.level === 2 && candidate.anchor === "before-you-call-it-done");
  if (!heading) return errors.push("AGENTS.md: ## Before you call it done is missing");
  const next = hs.find((candidate) => candidate.line > heading.line && candidate.level <= heading.level);
  const section = markdown.split(/\r?\n/).slice(heading.line, next ? next.line - 1 : undefined).join("\n");
  for (const [label, pattern] of [
    ["cargo test gate", /cargo test/], ["wasm gate", /wasm_check\.js/], ["hash impact", /hash/i],
    ["ABI mirrors", /ABI|frame layout/i], ["documentation impact", /documentation impact|docs? impact/i],
    ["documentation checker", /node tools\/check_docs\.js/],
  ]) if (!pattern.test(section)) errors.push(`AGENTS.md#before-you-call-it-done: checklist is missing ${label}`);
}

function checkDiscoveredStandardHeaders(root, files, errors) {
  for (const file of files) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (/^docs\/(?:architecture|design|decisions|reference|performance)\/.+\.md$/i.test(rel)) {
      checkStandardHeader(file, rel, errors);
    }
  }
}

function checkResolvedHistoricalClaims(root, errors) {
  const required = [
    ["docs/reference/hashes.md", [/Scenario::fingerprint/i, /loadout/i, /omit/i], "scenario fingerprint loadout omission"],
    ["docs/decisions/0002-record-commands-in-replays.md", [/36-byte|36 byte/i, /two[- ]hand/i, /one limb|one-limb/i], "historical two-hand command correction"],
  ];
  for (const [rel, patterns, label] of required) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      errors.push(`${rel}: required durable ${label} record is missing`);
      continue;
    }
    const markdown = fs.readFileSync(file, "utf8");
    for (const pattern of patterns) if (!pattern.test(markdown)) errors.push(`${rel}: durable record is missing ${label}`);
  }
}

function checkEnforcement(root) {
  const errors = [];
  const files = enforcementMarkdownFiles(root);
  const allFiles = allMarkdownFiles(root);
  checkGlobalInternalLinks(root, files, errors);
  checkRetiredPlanLinks(root, files, errors);
  checkContractMarkers(root, allFiles, files, errors);
  checkContractConvention(root, errors);
  checkRoomContractMarkers(root, errors);
  checkRoomMatrixScaffold(root, errors);
  checkRoomImplementationDocs(root, errors);
  checkDiscoveredStandardHeaders(root, files, errors);
  checkCurrentGlbClaims(root, files, errors);
  checkResolvedHistoricalClaims(root, errors);
  checkCompletionChecklist(root, errors);
  return errors;
}

function checkDesignMigration(root) {
  const errors = [];
  const decisionDirectory = path.join(root, "docs", "decisions");
  const discoveredDecisions = fs.existsSync(decisionDirectory)
    ? fs.readdirSync(decisionDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => entry.name)
    : [];
  const referenceDirectory = path.join(root, "docs", "reference");
  const discoveredReferences = fs.existsSync(referenceDirectory)
    ? fs.readdirSync(referenceDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => entry.name)
    : [];
  for (const [directory, names] of [
    ["design", DESIGN_DOCUMENTS], ["decisions", [...new Set([...DECISION_DOCUMENTS, ...discoveredDecisions])]],
    ["reference", [...new Set([...REFERENCE_DOCUMENTS, ...discoveredReferences])]],
  ]) {
    for (const name of names) {
      const rel = `docs/${directory}/${name}`;
      const file = path.join(root, rel);
      if (!fs.existsSync(file)) {
        errors.push(`${rel}: required migrated document is missing`);
        continue;
      }
      checkStandardHeader(file, rel, errors);
      checkLocalLinks(file, root, errors);
    }
  }
  const inventoryFile = path.join(root, "docs", "documentation-inventory.md");
  if (fs.existsSync(inventoryFile)) {
    const rows = inventoryRows(fs.readFileSync(inventoryFile, "utf8"), errors);
    const rootAnchors = new Set(headings(fs.readFileSync(path.join(root, "DESIGN.md"), "utf8")).map((heading) => heading.anchor));
    for (const row of rows.filter((candidate) => candidate.source && candidate.source.startsWith("DESIGN.md#"))) {
      const anchor = row.source.slice("DESIGN.md#".length);
      if (!rootAnchors.has(anchor) && !movedDesignDestination(root, row.source, row.heading)) {
        errors.push(`${row.source}: moved design anchor has no durable destination declaration`);
      }
    }
  }
  checkRootDesignCompatibility(root, errors);
  checkDurablePlanAuthority(root, errors);
  checkHistoricalEvidence(root, errors);
  return errors;
}

function checkInventory(root) {
  const errors = [];
  const inventoryFile = path.join(root, "docs", "documentation-inventory.md");
  if (!fs.existsSync(inventoryFile)) return ["docs/documentation-inventory.md: inventory is missing"];
  const rows = inventoryRows(fs.readFileSync(inventoryFile, "utf8"), errors);
  const expected = rootHeadingMap(root, errors);
  const linkTargets = new Map(expected);
  for (const row of rows) {
    if (row.source && !linkTargets.has(row.source)) linkTargets.set(row.source, { text: row.heading, anchor: row.source.split("#")[1] });
  }
  const actualInbound = inboundLinkIndex(root, linkTargets);
  const counts = new Map();
  for (const row of rows) {
    if (!row.source) {
      errors.push(`docs/documentation-inventory.md:${row.line}: cannot read source anchor ${row.sourceCell}`);
      continue;
    }
    counts.set(row.source, (counts.get(row.source) || 0) + 1);
    const sourceHeading = expected.get(row.source);
    if (!sourceHeading && !movedDesignDestination(root, row.source, row.heading)) {
      errors.push(`docs/documentation-inventory.md:${row.line}: ${row.source} is neither a root heading nor a declared durable destination`);
    }
    else if (sourceHeading && row.heading !== sourceHeading.text) {
      errors.push(`docs/documentation-inventory.md:${row.line}: heading ${JSON.stringify(row.heading)} does not match source heading ${JSON.stringify(sourceHeading.text)}`);
    }
    if (!DESTINATIONS.has(row.destination)) errors.push(`docs/documentation-inventory.md:${row.line}: unknown destination class ${row.destination}`);
    if (!STATUSES.has(row.status)) errors.push(`docs/documentation-inventory.md:${row.line}: unknown inventory status ${row.status}`);
    if (!MOVE_PHASES.has(row.movePhase)) errors.push(`docs/documentation-inventory.md:${row.line}: unknown move phase ${row.movePhase}`);
    if (!structuredInboundLinks(row.inboundLinks)) {
      errors.push(`docs/documentation-inventory.md:${row.line}: inbound links must be none or structured backticked/link accounting`);
    } else {
      const claimed = parseInboundAccounting(row.inboundLinks, root, errors, row.line);
      const actual = actualInbound.get(row.source) || new Map();
      if (!sameAccounting(claimed, actual)) {
        const format = (accounting) => [...accounting].map(([label, count]) => `${label}:${count}`).join(", ") || "none";
        errors.push(
          `docs/documentation-inventory.md:${row.line}: inbound accounting is ${format(claimed)}; actual Markdown links are ${format(actual)}`,
        );
      }
    }
    if (!row.auditNote) errors.push(`docs/documentation-inventory.md:${row.line}: audit note is empty`);
  }
  for (const source of expected.keys()) {
    const count = counts.get(source) || 0;
    if (count !== 1) errors.push(`${source}: expected one inventory row, found ${count}`);
  }
  for (const [source, count] of counts) {
    if (count > 1) errors.push(`${source}: inventory source appears ${count} times`);
  }
  checkRolePaths(root, errors);
  return errors;
}

function main(argv) {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--inventory")) {
    console.error("usage: node tools/check_docs.js [--inventory]");
    process.exitCode = 2;
    return;
  }
  const root = path.resolve(__dirname, "..");
  const errors = checkInventory(root);
  if (argv.length === 0) errors.push(...checkArchitecture(root), ...checkDesignMigration(root), ...checkEnforcement(root));
  if (errors.length) {
    console.error(`documentation inventory check failed with ${errors.length} problem${errors.length === 1 ? "" : "s"}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log(argv.length === 0
      ? "documentation check passed: inventory and current architecture agree with their sources"
      : "documentation inventory check passed: root headings, destinations, classifications, and role paths agree");
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  checkArchitecture, checkDesignMigration, checkEnforcement, checkInventory,
  githubSlug, headings, inventoryRows, tables, markdownLinks, staleSourceAnchor,
};
