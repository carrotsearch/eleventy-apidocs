import { readFile } from "node:fs/promises";
import path from "node:path";

// Reads a user-supplied source file (navigation, logo, footer) relative to
// the consumer project's cwd. Returns null if the file is missing so a
// project without an optional input doesn't crash the build.
export async function loadSourceFile(relPath, format) {
  if (!relPath) {
    return null;
  }
  const abs = path.resolve(process.cwd(), relPath);
  try {
    const raw = await readFile(abs, "utf8");
    return format === "json" ? JSON.parse(raw) : raw;
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}
