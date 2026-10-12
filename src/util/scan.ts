import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "build", "dist", ".cache", "__pycache__"]);

/** Walk a directory tree, returning repo-relative file paths. */
export async function walk(root: string, maxFiles = 5000): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string): Promise<void> {
    if (out.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await recurse(full);
      } else if (entry.isFile()) {
        out.push(path.relative(root, full));
      }
    }
  }
  await recurse(root);
  return out;
}

export async function readIfExists(file: string, maxBytes = 2 * 1024 * 1024): Promise<string | null> {
  try {
    const info = await stat(file);
    if (info.size > maxBytes) {
      const buf = await readFile(file);
      return buf.subarray(0, maxBytes).toString("utf8");
    }
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

const CODE_EXT = new Set([".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".hxx"]);

export function isCodeFile(rel: string): boolean {
  return CODE_EXT.has(path.extname(rel).toLowerCase());
}

const ASSET_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tga", ".webp",
  ".wav", ".ogg", ".mp3", ".flac", ".mod", ".xm",
  ".ttf", ".otf", ".fnt",
  ".json", ".txt", ".map", ".tmx", ".dat", ".lvl",
  ".glsl", ".vert", ".frag",
]);

export function isAssetFile(rel: string): boolean {
  if (rel.toLowerCase().includes("license")) return false;
  return ASSET_EXT.has(path.extname(rel).toLowerCase());
}
