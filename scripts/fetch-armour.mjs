import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zipMember } from "./zip-member.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const record = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour-sources.json"), "utf8"));
if (record.schema !== 2) throw new Error(`unsupported armour provenance schema ${record.schema}`);
const selectedIds = Array.isArray(record.selected) ? record.selected : [record.selected];
const sources = selectedIds.map((id) => {
  const source = record.sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`selected armour source "${id}" has no provenance row`);
  if (source.license !== "CC0-1.0") {
    throw new Error(`selected armour source "${id}" is ${source.license ?? "unlicensed"}, not CC0-1.0`);
  }
  if (source.licenseUrl !== "https://creativecommons.org/publicdomain/zero/1.0/") {
    throw new Error(`selected armour source "${id}" does not name the canonical CC0 1.0 license URL`);
  }
  if (!/^https:\/\//.test(source.officialPage ?? "")) {
    throw new Error(`selected armour source "${id}" has no official HTTPS source page`);
  }
  if (!/^[0-9a-f]{64}$/.test(source.archiveSha256 ?? "")) {
    throw new Error(`selected armour source "${id}" has no valid archive SHA-256`);
  }
  if (!["bundled-notice", "official-page"].includes(source.licenseEvidence)) {
    throw new Error(`selected armour source "${id}" has no recognized license evidence`);
  }
  return source;
});

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function verifyExtracts(source) {
  const extracts = Object.entries(source.extracts ?? {});
  if (extracts.length === 0) throw new Error(`selected armour source "${source.id}" has no pinned extracts`);
  for (const [filename, expected] of extracts) {
    if (!/^[0-9a-f]{64}$/.test(expected)) {
      throw new Error(`selected armour extract ${filename} has no valid SHA-256`);
    }
    const path = resolve(ROOT, source.extractRoot, filename);
    const bytes = await readFile(path).catch(() => null);
    if (!bytes) throw new Error(`missing selected armour extract ${path}`);
    const actual = digest(bytes);
    if (actual !== expected) {
      throw new Error(`armour extract ${filename} digest ${actual}; expected ${expected}`);
    }
    if (filename === "LICENSE.txt" && source.licenseEvidence === "bundled-notice") {
      const notice = bytes.toString("utf8");
      if (!notice.includes("CC0 1.0 Universal") ||
          !notice.includes("creativecommons.org/publicdomain/zero/1.0")) {
        throw new Error(`armour license extract ${filename} does not contain the pinned CC0 notice`);
      }
    }
  }
  if (source.licenseEvidence === "bundled-notice" && !("LICENSE.txt" in (source.extracts ?? {}))) {
    throw new Error(`selected armour source "${source.id}" has no pinned bundled license notice`);
  }
}

async function verifyQualificationCandidates(source, archive) {
  for (const candidate of source.qualificationCandidates ?? []) {
    if (!candidate.id || !candidate.sourceMember || !/^[0-9a-f]{64}$/.test(candidate.sourceMemberSha256 ?? "")) {
      throw new Error(`armour source "${source.id}" has an invalid qualification candidate`);
    }
    const memberDigest = digest(zipMember(archive, candidate.sourceMember));
    if (memberDigest !== candidate.sourceMemberSha256) {
      throw new Error(`qualification source member ${candidate.sourceMember} digest ${memberDigest}; expected ${candidate.sourceMemberSha256}`);
    }
    if (candidate.binaryMember || candidate.binaryMemberSha256) {
      if (!candidate.binaryMember || !/^[0-9a-f]{64}$/.test(candidate.binaryMemberSha256 ?? "")) {
        throw new Error(`qualification source "${candidate.id}" has an invalid binary member pin`);
      }
      const binaryDigest = digest(zipMember(archive, candidate.binaryMember));
      if (binaryDigest !== candidate.binaryMemberSha256) {
        throw new Error(`qualification binary member ${candidate.binaryMember} digest ${binaryDigest}; expected ${candidate.binaryMemberSha256}`);
      }
    }
    for (const [filename, expected] of Object.entries(candidate.extracts ?? {})) {
      if (!/^[0-9a-f]{64}$/.test(expected)) {
        throw new Error(`qualification extract ${candidate.id}/${filename} has no valid SHA-256`);
      }
      const path = resolve(ROOT, candidate.extractRoot, filename);
      const bytes = await readFile(path).catch(() => null);
      if (!bytes) throw new Error(`missing qualification extract ${path}`);
      const actual = digest(bytes);
      if (actual !== expected) {
        throw new Error(`qualification extract ${candidate.id}/${filename} digest ${actual}; expected ${expected}`);
      }
    }
  }
}

async function verifySource(source) {
  const path = resolve(ROOT, source.reviewFile);
  const bytes = await readFile(path).catch(() => null);
  if (!bytes) {
    const where = source.downloadUrl ?? source.downloadPage;
    throw new Error(`missing ${path} -- obtain "${source.title}" from ${where}`);
  }
  const actual = digest(bytes);
  if (actual !== source.archiveSha256) {
    throw new Error(`${source.title} digest ${actual}; expected ${source.archiveSha256}`);
  }
  await verifyExtracts(source);
  await verifyQualificationCandidates(source, bytes);
  console.log(`${source.title} and its selected extracts match their pins.`);
}

async function fetchSources() {
  // Itch provides a short-lived signed URL after its download-page handshake.
  // Refuse that source before writing another one, so this command cannot leave
  // a misleading half-fetched provenance set.
  for (const source of sources.filter((candidate) => !candidate.downloadUrl)) {
    const present = await readFile(resolve(ROOT, source.reviewFile)).catch(() => null);
    if (!present) {
      throw new Error(
        `armour:fetch cannot download "${source.title}" automatically; ` +
        `download it from ${source.downloadPage} to ${source.reviewFile}, then run this command again`,
      );
    }
  }

  for (const source of sources) {
    const output = resolve(ROOT, source.reviewFile);
    const present = await readFile(output).catch(() => null);
    if (!present && source.downloadUrl) {
      const response = await fetch(source.downloadUrl);
      if (!response.ok) throw new Error(`armour fetch failed: ${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = digest(bytes);
      if (actual !== source.archiveSha256) {
        throw new Error(`refusing ${source.title} digest ${actual}; expected ${source.archiveSha256}`);
      }
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes);
      console.log(`wrote ${output}`);
    }
    await verifySource(source);
  }
}

const main = process.argv.includes("--verify")
  ? () => Promise.all(sources.map(verifySource))
  : fetchSources;

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
