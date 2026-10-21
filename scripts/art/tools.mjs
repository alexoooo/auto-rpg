import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

export const ROOT = resolve(import.meta.dirname, "../..");
export const CACHE = join(ROOT, ".cache/art");
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");

/** A checked subprocess, with no shell interpretation of file paths. */
export function run(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: ROOT, windowsHide: true, ...options });
    let output = "";
    child.stdout?.on("data", bytes => { output += bytes; });
    child.stderr?.on("data", bytes => { output += bytes; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? accept(output) : reject(new Error(`${command} exited ${code}\n${output}`)));
  });
}

export const TOOL_RELEASES = {
  blender: {
    version: "4.5.12",
    win32: ["https://download.blender.org/release/Blender4.5/blender-4.5.12-windows-x64.zip", "317ef64e7a2c3cc79ec810c766ae9828aff865bea78039dc695b3f1118c34b4f"],
    linux: ["https://download.blender.org/release/Blender4.5/blender-4.5.12-linux-x64.tar.xz", "95e3a2dfedba3bd32ca54fc355eac6b15a11986954ccb02815a07535d0120a25"],
  },
  ktx: {
    version: "4.4.2",
    win32: ["https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Windows-x64.exe", "1f323b0fec19794f5e6c0425a61d4b1da396872a10be862d105f4f4b2d2957fe"],
    linux: ["https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2", "a8781bad05f9624edbf910b7f258cd0a4ba7d3e63b49ecc0a0ab440bf6a0a245"],
  },
  sevenZip: {
    version: "24.09",
    win32: ["https://www.7-zip.org/a/7z2409-x64.exe", "bdd1a33de78618d16ee4ce148b849932c05d0015491c34887846d431d29f308e"],
    extractor: ["https://github.com/ip7z/7zip/releases/download/24.09/7zr.exe", "d2c0045523cf053a6b43f9315e9672fc2535f06aeadd4ffa53c729cd8b2b6dfe"],
  },
};

async function download([url, sha]) {
  const file = join(CACHE, "downloads", sha);
  await mkdir(join(CACHE, "downloads"), { recursive: true });
  if (existsSync(file) && digest(await readFile(file)) === sha) return file;
  console.log(`Downloading ${new URL(url).pathname.split("/").at(-1)}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (digest(bytes) !== sha) throw new Error(`Tool checksum mismatch: ${url}`);
  await writeFile(file, bytes);
  return file;
}

/** Tools are extracted locally, never installed into the operating system. */
export async function tool(name) {
  if (process.arch !== "x64" || !["win32", "linux"].includes(process.platform)) throw new Error("Art tools support Windows x64 and Linux x64.");
  const release = TOOL_RELEASES[name], folder = join(CACHE, "tools", `${name}-${release.version}`);
  const executable = name === "blender" ? join(folder, `blender-${release.version}-${process.platform === "win32" ? "windows" : "linux"}-x64`, `blender${process.platform === "win32" ? ".exe" : ""}`)
    : join(folder, "bin", `ktx${process.platform === "win32" ? ".exe" : ""}`);
  const localBlender = join(ROOT, ".tools/blender-4.5.12", `blender-4.5.12-${process.platform === "win32" ? "windows" : "linux"}-x64`, `blender${process.platform === "win32" ? ".exe" : ""}`);
  const supplied = process.env[`ART_${name.toUpperCase()}`] ?? (name === "blender" && existsSync(localBlender) ? localBlender : undefined);
  if (supplied) {
    if (!(await run(supplied, ["--version"])).includes(release.version)) throw new Error(`${name} must be ${release.version}`);
    return supplied;
  }
  if (existsSync(executable)) return executable;
  const archive = await download(release[process.platform]);
  await mkdir(folder, { recursive: true });
  if (process.platform === "win32") {
    const sevenFolder = join(CACHE, "tools", "7zip"), seven = join(sevenFolder, "7z.exe");
    if (!existsSync(seven)) {
      const extractorBytes = await readFile(await download(TOOL_RELEASES.sevenZip.extractor));
      const extractor = join(CACHE, "tools", "7zr.exe");
      await writeFile(extractor, extractorBytes);
      await run(extractor, ["x", await download(TOOL_RELEASES.sevenZip.win32), `-o${sevenFolder}`, "-y"]);
    }
    await run(seven, ["x", archive, `-o${folder}`, "-y"]);
  } else {
    await run("tar", ["xf", archive, "-C", folder, ...(name === "ktx" ? ["--strip-components=1"] : [])]);
  }
  if (!existsSync(executable)) throw new Error(`Tool archive did not contain ${executable}`);
  return executable;
}
