import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Write `bundle` as <basename>.<hash>.<ext> inside `dir`, returning that
// filename. Removes any siblings matching the same hashed-name pattern so
// successive rebuilds don't accumulate stale fingerprinted files in the
// output tree.
export async function writeHashedAsset(dir, basename, ext, bundle) {
  const hash = crypto.createHash("sha256").update(bundle).digest("hex").slice(0, 10);
  const name = `${basename}.${hash}.${ext}`;
  const pattern = new RegExp(`^${escapeRegExp(basename)}\\.[0-9a-f]+\\.${escapeRegExp(ext)}$`);

  await fs.mkdir(dir, { recursive: true });
  try {
    const entries = await fs.readdir(dir);
    await Promise.all(
      entries
        .filter(e => pattern.test(e) && e !== name)
        .map(e => fs.unlink(path.join(dir, e)).catch(() => {}))
    );
  } catch {}
  await fs.writeFile(path.join(dir, name), bundle);
  return name;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
