import { inflateRawSync } from "node:zlib";

/** Return one exact member from the small, non-ZIP64 source archives we pin. */
export function zipMember(archive, wanted) {
  const minimum = Math.max(0, archive.length - 65_557);
  let end = -1;
  for (let at = archive.length - 22; at >= minimum; at -= 1) {
    if (archive.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) throw new Error("archive has no ZIP end-of-directory record");
  const entries = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index += 1) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error("archive central directory is malformed");
    const method = archive.readUInt16LE(at + 10);
    const compressed = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    if (name === wanted) {
      if (archive.readUInt32LE(localAt) !== 0x04034b50) throw new Error(`ZIP member ${wanted} has no local header`);
      const localName = archive.readUInt16LE(localAt + 26);
      const localExtra = archive.readUInt16LE(localAt + 28);
      const start = localAt + 30 + localName + localExtra;
      const payload = archive.subarray(start, start + compressed);
      const bytes = method === 0 ? payload : method === 8 ? inflateRawSync(payload) : null;
      if (!bytes || bytes.length !== size) throw new Error(`ZIP member ${wanted} has unsupported or invalid compression`);
      return bytes;
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`archive has no qualification source member "${wanted}"`);
}
