import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  AppKind,
  Blocker,
  BuildSystem,
  DetectedLibrary,
  InspectReport,
  Language,
  Portability,
} from "../types.js";
import { run } from "../util/exec.js";
import { isAssetFile, isCodeFile, readIfExists, walk } from "../util/scan.js";

export interface InspectOptions {
  /** Where to clone into when the source is a URL. Defaults to a temp dir. */
  destDir?: string;
}

/** Resolve a GitHub URL or local path to a working directory on disk. */
export async function resolveSource(
  source: string,
  options: InspectOptions = {},
): Promise<{ resolvedPath: string; repo: { url: string; commit: string } | null }> {
  const isUrl = /^(https?:\/\/|git@)/.test(source);
  if (!isUrl) {
    const resolved = path.resolve(source);
    if (!existsSync(resolved)) throw new Error(`path does not exist: ${resolved}`);
    return { resolvedPath: resolved, repo: null };
  }
  const dest = options.destDir ?? (await mkdtemp(path.join(tmpdir(), "browser-port-clone-")));
  const clone = await run("git", ["clone", "--depth", "1", source, dest]);
  if (clone.exitCode !== 0) {
    throw new Error(`git clone failed: ${clone.stderr.trim() || clone.stdout.trim()}`);
  }
  const rev = await run("git", ["-C", dest, "rev-parse", "HEAD"]);
  return {
    resolvedPath: dest,
    repo: { url: source, commit: rev.stdout.trim() },
  };
}

interface LibRule {
  name: string;
  include: RegExp;
  flag?: string;
}

const LIB_RULES: LibRule[] = [
  { name: "SDL2", include: /#\s*include\s*[<"](SDL2\/)?SDL\.h[>"]/ },
  { name: "SDL2_image", include: /#\s*include\s*[<"](SDL2\/)?SDL_image\.h[>"]/ },
  { name: "SDL2_mixer", include: /#\s*include\s*[<"](SDL2\/)?SDL_mixer\.h[>"]/ },
  { name: "SDL2_ttf", include: /#\s*include\s*[<"](SDL2\/)?SDL_ttf\.h[>"]/ },
  { name: "raylib", include: /#\s*include\s*[<"]raylib\.h[>"]/ },
  { name: "OpenGL", include: /#\s*include\s*[<"](GL\/gl\.h|OpenGL\/gl|GLES[23]?\/|SDL_opengl\.h)[>"]/ },
  { name: "pthreads", include: /#\s*include\s*[<"]pthread\.h[>"]/ },
  { name: "sockets", include: /#\s*include\s*[<"](sys\/socket\.h|arpa\/inet\.h|netinet\/)[>"]/ },
];

/**
 * Hard blockers: toolkits and native windowing layers that have no path through
 * Emscripten's browser runtime. When one of these matches, the honest answer is
 * "not supported", not "likely". OpenGL used through SDL2 or raylib is fine and
 * is deliberately not matched here; only the native windowing layers are.
 */
interface RefusalRule {
  id: string;
  what: string;
  reason: string;
  /** Matching any pattern triggers the refusal. */
  patterns: RegExp[];
}

const REFUSAL_RULES: RefusalRule[] = [
  {
    id: "qt",
    what: "Uses the Qt toolkit.",
    reason: "Qt draws through its own native windowing and has no Emscripten port in this tool. Not supported yet.",
    patterns: [/#\s*include\s*[<"]Qt[A-Za-z]/, /#\s*include\s*[<"]Q[A-Z][A-Za-z]*[>"]/, /\bQApplication\b/, /\bQGuiApplication\b/],
  },
  {
    id: "gtk",
    what: "Uses the GTK toolkit.",
    reason: "GTK draws through native windowing and has no Emscripten port in this tool. Not supported yet.",
    patterns: [/#\s*include\s*[<"]gtk\//, /#\s*include\s*[<"]gtk-[0-9]/, /\bgtk_init\s*\(/, /\bgtk_application_new\s*\(/],
  },
  {
    id: "wxwidgets",
    what: "Uses wxWidgets.",
    reason: "wxWidgets draws through native windowing and has no Emscripten port in this tool. Not supported yet.",
    patterns: [/#\s*include\s*[<"]wx\//, /\bwxIMPLEMENT_APP\b/, /\bwxApp\b/],
  },
  {
    id: "x11",
    what: "Uses X11 windowing directly.",
    reason: "Browsers have no X11 server. Port the windowing to SDL2 or raylib first. Not supported yet.",
    patterns: [/#\s*include\s*[<"]X11\//, /\bXOpenDisplay\s*\(/, /\bXCreateWindow\s*\(/],
  },
  {
    id: "glx",
    what: "Creates an OpenGL context through GLX.",
    reason: "GLX is native X11 OpenGL and does not exist in a browser. Use SDL2 or raylib for the window and GL context. Not supported yet.",
    patterns: [/#\s*include\s*[<"]GL\/glx\.h[>"]/, /\bglX[A-Z][A-Za-z]*\s*\(/],
  },
  {
    id: "wgl",
    what: "Creates an OpenGL context through WGL (Windows).",
    reason: "WGL is native Windows OpenGL and does not exist in a browser. Use SDL2 or raylib for the window and GL context. Not supported yet.",
    patterns: [/\bwglCreateContext\s*\(/, /\bwglMakeCurrent\s*\(/],
  },
  {
    id: "win32-gui",
    what: "Uses the native Win32 GUI.",
    reason: "The Win32 window API does not exist in a browser. Port the windowing to SDL2 or raylib first. Not supported yet.",
    patterns: [/\bWinMain\s*\(/, /\bCreateWindowEx[AW]?\s*\(/, /\bRegisterClassEx[AW]?\s*\(/],
  },
  {
    id: "cocoa-gl",
    what: "Uses Cocoa or native macOS OpenGL (AGL/CGL).",
    reason: "Cocoa and the native macOS GL layers do not exist in a browser. Use SDL2 or raylib. Not supported yet.",
    patterns: [/#\s*(include|import)\s*[<"]Cocoa\//, /#\s*include\s*[<"]OpenGL\/OpenGL\.h[>"]/, /\bNSApplication\b/, /\bCGLCreateContext\s*\(/],
  },
];

interface Detection {
  language: Language;
  buildSystem: BuildSystem;
  appKind: AppKind;
  libraries: DetectedLibrary[];
  assets: string[];
  entryPoint: string | null;
  sourceFiles: string[];
  usesBlockingMainLoop: boolean;
  usesFilesystemWrites: boolean;
  /** Hard blockers (toolkit or native windowing) that make the program unportable. */
  refusals: Blocker[];
  notes: string[];
}

/**
 * Pure detection over an already-resolved directory. Kept separate from IO so
 * it is directly unit-testable with a fixture tree.
 */
export async function detect(resolvedPath: string): Promise<Detection> {
  const files = await walk(resolvedPath);
  const codeFiles = files.filter(isCodeFile);
  const assets = files.filter(isAssetFile).slice(0, 200);
  const notes: string[] = [];

  let hasCpp = false;
  let hasC = false;
  for (const f of codeFiles) {
    const ext = path.extname(f).toLowerCase();
    if ([".cpp", ".cc", ".cxx", ".hpp", ".hxx"].includes(ext)) hasCpp = true;
    if ([".c"].includes(ext)) hasC = true;
  }
  const language: Language = hasCpp ? "cpp" : hasC ? "c" : "unknown";

  let buildSystem: BuildSystem = "unknown";
  if (files.some((f) => path.basename(f) === "CMakeLists.txt")) buildSystem = "cmake";
  else if (files.some((f) => /^(GNUmakefile|[Mm]akefile)$/.test(path.basename(f)))) buildSystem = "make";
  else if (codeFiles.length > 0) buildSystem = "plain";

  const libMatches = new Map<string, string>();
  const refusalMatches = new Map<string, string>();
  let usesBlockingMainLoop = false;
  let usesFilesystemWrites = false;
  let entryPoint: string | null = null;

  const mainRe = /\bint\s+main\s*\(/;
  const sdlMainLoopRe = /while\s*\([^)]*\)\s*\{[\s\S]*?SDL_(PollEvent|RenderPresent|GL_SwapWindow)/;
  const raylibMainLoopRe = /while\s*\(\s*!\s*WindowShouldClose\s*\(\s*\)\s*\)/;
  const fsWriteRe = /\b(fopen\s*\([^)]*["'][wa]\+?["']|fwrite\s*\(|ofstream|SDL_RWFromFile\s*\([^)]*["']w)/;

  for (const rel of codeFiles.slice(0, 400)) {
    const content = await readIfExists(path.join(resolvedPath, rel));
    if (content === null) continue;

    for (const rule of LIB_RULES) {
      if (!libMatches.has(rule.name) && rule.include.test(content)) {
        libMatches.set(rule.name, `included in ${rel}`);
      }
    }
    for (const rule of REFUSAL_RULES) {
      if (!refusalMatches.has(rule.id) && rule.patterns.some((p) => p.test(content))) {
        refusalMatches.set(rule.id, rel);
      }
    }
    if (!entryPoint && mainRe.test(content)) entryPoint = rel;
    if (sdlMainLoopRe.test(content) || raylibMainLoopRe.test(content)) usesBlockingMainLoop = true;
    if (fsWriteRe.test(content)) usesFilesystemWrites = true;
  }

  const libraries: DetectedLibrary[] = [...libMatches.entries()].map(([name, evidence]) => ({ name, evidence }));
  const refusals: Blocker[] = [...refusalMatches.entries()].map(([id, rel]) => {
    const rule = REFUSAL_RULES.find((r) => r.id === id)!;
    return { id: rule.id, what: `${rule.what} (${rel})`, fix: rule.reason };
  });

  let appKind: AppKind = "unknown";
  if (libMatches.has("SDL2")) appKind = "sdl2";
  else if (libMatches.has("raylib")) appKind = "raylib";
  else if (language !== "unknown") appKind = "stdio";

  if (usesFilesystemWrites) {
    notes.push("Program writes to the filesystem. In the browser this maps to Emscripten MEMFS or IDBFS; persistent data needs IDBFS and an explicit sync.");
  }

  return {
    language,
    buildSystem,
    appKind,
    libraries,
    assets,
    entryPoint,
    sourceFiles: codeFiles,
    usesBlockingMainLoop,
    usesFilesystemWrites,
    refusals,
    notes,
  };
}

function assessPortability(d: Detection): { portability: Portability; blockers: Blocker[] } {
  const blockers: Blocker[] = [];

  if (d.language === "unknown") {
    return {
      portability: "not-supported",
      blockers: [
        {
          id: "no-c-cpp",
          what: "No C or C++ source files were found.",
          fix: "This MVP ports C and C++ programs. Other languages are not supported yet.",
        },
      ],
    };
  }

  const libNames = new Set(d.libraries.map((l) => l.name));

  // Toolkit and native-windowing refusals, plus sockets and threads, have no
  // path through the one-command browser runtime. Report them as not-supported
  // rather than "likely" so the verdict is honest.
  const hardBlockers: Blocker[] = [...d.refusals];
  if (libNames.has("sockets")) {
    hardBlockers.push({
      id: "sockets",
      what: "Uses BSD sockets.",
      fix: "Browsers have no raw TCP or UDP. Move networking to WebSockets, or remove it for the port. Not supported yet.",
    });
  }
  if (libNames.has("pthreads")) {
    hardBlockers.push({
      id: "pthreads",
      what: "Uses threads (pthreads) without browser threading set up.",
      fix: "Browser threads need -pthread, a PTHREAD_POOL_SIZE, and COOP/COEP headers (SharedArrayBuffer), which the one-command path does not configure. Build single-threaded or set this up by hand. Not supported yet.",
    });
  }
  if (hardBlockers.length > 0) {
    return { portability: "not-supported", blockers: hardBlockers };
  }

  if (d.usesBlockingMainLoop) {
    blockers.push({
      id: "blocking-main-loop",
      what: "Uses a blocking main loop.",
      fix: "Convert to emscripten_set_main_loop, or build with -sASYNCIFY so the blocking loop yields to the browser.",
    });
  }
  if (d.usesFilesystemWrites) {
    blockers.push({
      id: "fs-writes",
      what: "Writes files at runtime.",
      fix: "Use IDBFS for persistence and call FS.syncfs, or accept that writes live only in memory for the session.",
    });
  }

  if (d.appKind === "stdio" && d.entryPoint === null) {
    return {
      portability: "not-supported",
      blockers: [
        {
          id: "no-entry-point",
          what: "No main() entry point was found, so this is a library rather than a runnable program.",
          fix: "Point browser-port at an application that has a main() function. Libraries are not ported on their own.",
        },
      ],
    };
  }

  const supported = d.appKind === "sdl2" || d.appKind === "raylib" || d.appKind === "stdio";
  if (!supported) {
    blockers.unshift({
      id: "unknown-app-kind",
      what: "Could not classify this as SDL2, raylib, or a stdin/stdout program.",
      fix: "This MVP supports SDL2, raylib, and plain stdio programs. Others are not supported yet.",
    });
    return { portability: "not-supported", blockers };
  }

  const portability: Portability = blockers.length === 0 ? "likely" : "needs-changes";
  return { portability, blockers };
}

export async function inspect(source: string, options: InspectOptions = {}): Promise<InspectReport> {
  const { resolvedPath, repo } = await resolveSource(source, options);
  const d = await detect(resolvedPath);
  const { portability, blockers } = assessPortability(d);

  return {
    source,
    resolvedPath,
    repo,
    language: d.language,
    buildSystem: d.buildSystem,
    appKind: d.appKind,
    libraries: d.libraries,
    assets: d.assets,
    entryPoint: d.entryPoint,
    sourceFiles: d.sourceFiles,
    usesBlockingMainLoop: d.usesBlockingMainLoop,
    portability,
    blockers,
    notes: d.notes,
  };
}
