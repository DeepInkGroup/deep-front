import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { once } from "node:events";
import { Zip, ZipDeflate } from "fflate";

// NUL-separated output preserves spaces and Unicode on every platform.
// Read the working tree so this archive contains the modified edition.
let files;
try {
  files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).split("\0");
} catch {
  // Source downloads have no Git metadata and must still be buildable.
  const excluded = new Set([
    ".git",
    ".data",
    ".tmp",
    "node_modules",
    "static",
    "artifacts",
    "out",
    "build",
    "coverage",
    "test-results",
    ".aws",
    ".codex",
    ".agents",
  ]);
  async function walk(dir = ".") {
    const names = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (
        excluded.has(entry.name) ||
        entry.name.startsWith(".env") ||
        /\.(pem|key|log)$/.test(entry.name)
      )
        continue;
      const name = dir === "." ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) names.push(...(await walk(name)));
      else if (entry.isFile()) names.push(name);
    }
    return names;
  }
  files = await walk();
}
files = files.filter(
  (p) =>
    p &&
    !p.startsWith(".tmp/") &&
    !p.startsWith(".data/") &&
    !p.startsWith("static/") &&
    !/(^|\/)community\.sqlite(?:-wal|-shm|-journal)?$/.test(p) &&
    p !== ".env",
);
const output = createWriteStream("static/source.zip");
const finished = once(output, "finish");
const zip = new Zip((error, data, final) => {
  if (error) output.destroy(error);
  else {
    output.write(data);
    if (final) output.end();
  }
});
for (const name of [...new Set(files)]) {
  const info = await stat(name).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info?.isFile()) continue;
  const entry = new ZipDeflate(name, { level: 3 });
  zip.add(entry);
  entry.push(await readFile(name), true);
  if (output.writableNeedDrain) await once(output, "drain");
}
zip.end();
await finished;
console.log("Modified source archive: static/source.zip");
