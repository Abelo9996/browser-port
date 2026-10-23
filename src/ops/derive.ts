import path from "node:path";
import { isCompilable, readIfExists } from "../util/scan.js";

/** The build plan derived from a project, used to drive the first build attempt. */
export interface DerivedPlan {
  /** Source files to compile, relative to the source root. */
  sources: string[];
  /** Directories (relative to the source root) to preload into the virtual FS. */
  preloadDirs: string[];
  /** Explicit src@dest preload mappings for bare asset files. */
  preloadMap: string[];
  /** Image formats SDL2_image must decode, derived from the assets referenced. */
  imageFormats: string[];
  /** Directories holding project headers, added to the include path. */
  includeDirs: string[];
  /** All compilable project sources, used by the retry ladder to add files. */
  allSources: string[];
  notes: string[];
}

const HEADER_EXT = new Set([".h", ".hpp", ".hxx", ".hh"]);

/** Directories whose presence usually means "game assets live here". */
const ASSET_DIR_NAMES = new Set([
  "assets", "asset", "res", "resources", "resource", "data",
  "img", "imgs", "image", "images", "gfx", "textures", "sprites",
  "fonts", "font", "sounds", "sound", "sfx", "music", "audio",
  "levels", "maps", "shaders",
]);

/**
 * Pull the source list out of a top-level CMakeLists.txt. Handles the common
 * `add_executable(name a.c b.c)` form. Returns null when the sources are hidden
 * behind variables or globs we cannot resolve statically, so the caller falls
 * back to following includes.
 */
export function parseCMakeSources(cmake: string): string[] | null {
  const m = cmake.match(/add_executable\s*\(([\s\S]*?)\)/i);
  if (!m) return null;
  const body = m[1]!;
  // Drop the target name (first token) and any generator keywords.
  const tokens = body
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !t.startsWith("${") && !/^(WIN32|MACOSX_BUNDLE|EXCLUDE_FROM_ALL)$/.test(t));
  const sources = tokens.filter((t) => isCompilable(t));
  return sources.length > 0 ? sources : null;
}

/** Follow local `#include "x.h"` edges from the entry file to sibling sources. */
async function sourcesByIncludes(
  resolvedPath: string,
  entryPoint: string,
  allSources: string[],
): Promise<string[]> {
  const byBasename = new Map<string, string[]>();
  for (const rel of allSources) {
    const base = path.basename(rel, path.extname(rel));
    const list = byBasename.get(base) ?? [];
    list.push(rel);
    byBasename.set(base, list);
  }

  const picked = new Set<string>([entryPoint]);
  const queue = [entryPoint];
  const includeRe = /#\s*include\s*"([^"]+)"/g;

  while (queue.length) {
    const rel = queue.shift()!;
    const content = await readIfExists(path.join(resolvedPath, rel));
    if (content === null) continue;
    let match: RegExpExecArray | null;
    while ((match = includeRe.exec(content)) !== null) {
      const header = match[1]!;
      const base = path.basename(header, path.extname(header));
      for (const candidate of byBasename.get(base) ?? []) {
        if (!picked.has(candidate)) {
          picked.add(candidate);
          queue.push(candidate);
        }
      }
    }
  }
  return [...picked];
}

const LOADER_RE =
  /\b(?:fopen|IMG_Load(?:Texture)?|IMG_LoadTexture_RW|Mix_LoadWAV|Mix_LoadMUS|Mix_LoadMUS_RW|TTF_OpenFont|SDL_LoadBMP|SDL_RWFromFile|stbi_load|LoadTexture|LoadImage|LoadSound|LoadMusicStream|LoadFont|LoadFontEx)\s*\(\s*"([^"]+)"/g;
const ANY_ASSET_RE = /"([^"\s]+\.(?:png|jpe?g|bmp|gif|tga|wav|ogg|mp3|flac|mod|xm|ttf|otf|fnt|tmx|glsl|vert|frag|dat|lvl|map))"/gi;

/**
 * Work out which asset directories and files the program loads, so they can be
 * preloaded into the Emscripten virtual filesystem. Uses both the known loader
 * calls and any string literal that looks like an asset path, then keeps only
 * the ones that actually exist on disk.
 */
export function deriveAssets(
  referencedPaths: string[],
  /** Lowercased basename -> the real repo-relative path of that file. */
  fileByBasenameLower: Map<string, string>,
  topDirsLower: Set<string>,
): { preloadDirs: string[]; preloadMap: string[]; imageFormats: string[] } {
  const dirs = new Set<string>();
  const maps = new Set<string>();
  const formats = new Set<string>();

  for (const raw of referencedPaths) {
    const ref = raw.replace(/^\.\//, "");
    if (!ref || ref.includes("..")) continue;
    const ext = path.extname(ref).toLowerCase();
    if (ext === ".png") formats.add("png");
    if (ext === ".jpg" || ext === ".jpeg") formats.add("jpg");

    if (ref.includes("/")) {
      const top = ref.split("/")[0]!;
      if (topDirsLower.has(top.toLowerCase())) dirs.add(top);
    } else {
      // A bare filename: preload the real file at that virtual name so the
      // program's fopen("name") resolves from the working directory.
      const real = fileByBasenameLower.get(ref.toLowerCase());
      if (real) maps.add(`${real}@/${ref}`);
    }
  }

  return {
    preloadDirs: [...dirs].sort(),
    preloadMap: [...maps].sort(),
    imageFormats: [...formats].sort(),
  };
}

/** Build the plan for a resolved project directory. */
export async function derivePlan(
  resolvedPath: string,
  info: { entryPoint: string | null; sourceFiles: string[] },
  allFiles: string[],
): Promise<DerivedPlan> {
  const notes: string[] = [];
  const allSources = info.sourceFiles.filter(isCompilable);

  let sources: string[] = [];
  const cmakeRel = allFiles.find((f) => path.basename(f) === "CMakeLists.txt" && !f.includes("/"));
  if (cmakeRel) {
    const cmake = await readIfExists(path.join(resolvedPath, cmakeRel));
    const parsed = cmake ? parseCMakeSources(cmake) : null;
    if (parsed) {
      const resolved = parsed
        .map((s) => s.replace(/^\.\//, ""))
        .filter((s) => allSources.includes(s));
      if (resolved.length) {
        sources = resolved;
        notes.push(`Sources from CMakeLists.txt add_executable: ${resolved.join(", ")}`);
      }
    }
  }

  if (sources.length === 0 && info.entryPoint) {
    sources = await sourcesByIncludes(resolvedPath, info.entryPoint, allSources);
    notes.push(`Sources from ${info.entryPoint} and its local includes: ${sources.join(", ")}`);
  }
  if (sources.length === 0) sources = allSources;

  // Scan the chosen sources for asset references.
  const fileByBasenameLower = new Map<string, string>();
  for (const f of allFiles) {
    const base = path.basename(f).toLowerCase();
    if (!fileByBasenameLower.has(base)) fileByBasenameLower.set(base, f);
  }

  const referenced: string[] = [];
  for (const rel of sources) {
    const content = await readIfExists(path.join(resolvedPath, rel));
    if (content === null) continue;
    for (const re of [LOADER_RE, ANY_ASSET_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) referenced.push(m[1]!);
    }
  }

  // Preload any well-known asset directory that exists, plus referenced ones.
  const existingTopDirs = new Set<string>();
  for (const f of allFiles) {
    const top = f.split("/")[0]!;
    if (top !== f && ASSET_DIR_NAMES.has(top.toLowerCase())) existingTopDirs.add(top);
  }

  const assets = deriveAssets(referenced, fileByBasenameLower, new Set([...existingTopDirs].map((d) => d.toLowerCase())));
  const preloadDirs = new Set(assets.preloadDirs);
  for (const d of existingTopDirs) preloadDirs.add(d);

  // Add every directory that holds a project header to the include path, so
  // `#include "foo.h"` resolves no matter which subdirectory it lives in.
  const includeDirs = new Set<string>();
  for (const f of allFiles) {
    if (HEADER_EXT.has(path.extname(f).toLowerCase())) {
      const dir = path.dirname(f);
      includeDirs.add(dir === "." ? "." : dir);
    }
  }

  return {
    sources,
    preloadDirs: [...preloadDirs].sort(),
    preloadMap: assets.preloadMap,
    imageFormats: assets.imageFormats,
    includeDirs: [...includeDirs].sort(),
    allSources,
    notes,
  };
}
