import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { AppKind, BuildResult, BuildSystem } from "../types.js";
import { run } from "../util/exec.js";
import { Workspace } from "../util/evidence.js";
import { detectToolchain, toolchainCommand } from "./toolchain.js";

export interface BuildSpec {
  /** Directory holding the (possibly modified) source to compile. */
  sourceDir: string;
  /** Source files to compile, relative to sourceDir. Used for the emcc path. */
  sources: string[];
  appKind: AppKind;
  buildSystem?: BuildSystem;
  /** Output basename inside the build dir. Defaults to "index". */
  outName?: string;
  /** Directories (relative to sourceDir) to preload into the virtual FS. */
  preload?: string[];
  /** Explicit --preload-file mappings, for example "src/assets/font.ttf@font.ttf". */
  preloadMap?: string[];
  /** Wrap a blocking main loop so it yields to the browser. */
  useAsyncify?: boolean;
  /** Image formats SDL2_image should decode. Defaults to png. */
  imageFormats?: string[];
  /** Directories to add to the include path (relative to sourceDir). */
  includeDirs?: string[];
  /** Extra emcc flags the agent wants to add. */
  extraFlags?: string[];
}

/** Compute the emscripten flags implied by the detected libraries. */
export function flagsFor(spec: BuildSpec, detectedLibs: string[] = []): string[] {
  const flags: string[] = ["-O2", "-sALLOW_MEMORY_GROWTH=1"];
  const libs = new Set(detectedLibs);

  if (spec.appKind === "sdl2" || libs.has("SDL2")) flags.push("-sUSE_SDL=2");
  if (libs.has("SDL2_image")) {
    const formats = (spec.imageFormats && spec.imageFormats.length ? spec.imageFormats : ["png"])
      .map((f) => `'${f}'`)
      .join(",");
    flags.push("-sUSE_SDL_IMAGE=2", `-sSDL2_IMAGE_FORMATS=[${formats}]`);
  }
  if (libs.has("SDL2_mixer")) flags.push("-sUSE_SDL_MIXER=2");
  if (libs.has("SDL2_ttf")) flags.push("-sUSE_SDL_TTF=2");
  if (spec.appKind === "raylib") {
    // raylib builds against GLFW/GLES under emscripten.
    flags.push("-sUSE_GLFW=3", "-DPLATFORM_WEB");
  }
  if (libs.has("OpenGL") && spec.appKind !== "raylib") flags.push("-sFULL_ES3=1");
  if (spec.useAsyncify) flags.push("-sASYNCIFY");

  for (const dir of spec.includeDirs ?? []) {
    flags.push(`-I${dir}`);
  }
  for (const dir of spec.preload ?? []) {
    flags.push("--preload-file", `${dir}@/${dir}`);
  }
  for (const mapping of spec.preloadMap ?? []) {
    flags.push("--preload-file", mapping);
  }
  if (spec.extraFlags) flags.push(...spec.extraFlags);
  return flags;
}

async function findArtifacts(outDir: string, outName: string): Promise<{
  js: string | null;
  wasm: string | null;
  data: string | null;
}> {
  const entries = existsSync(outDir) ? await readdir(outDir) : [];
  const pick = (ext: string) => {
    const exact = `${outName}${ext}`;
    if (entries.includes(exact)) return path.join(outDir, exact);
    const any = entries.find((e) => e.endsWith(ext));
    return any ? path.join(outDir, any) : null;
  };
  return { js: pick(".js"), wasm: pick(".wasm"), data: pick(".data") };
}

/**
 * Run the port build. The emcc path compiles the listed sources directly and
 * is the supported route for the MVP. Every command, with its exit code and
 * output tails, is recorded to the workspace evidence.
 */
export async function build(workspaceRoot: string, spec: BuildSpec, detectedLibs: string[] = []): Promise<BuildResult> {
  const ws = new Workspace(workspaceRoot);
  await ws.ensure();
  await mkdir(ws.buildDir, { recursive: true });

  const toolchain = await detectToolchain();
  if (toolchain.mode === "missing") {
    throw new Error(`no Emscripten toolchain available.\n${toolchain.installHint ?? ""}`);
  }

  const outName = spec.outName ?? "index";
  const flags = flagsFor(spec, detectedLibs);
  const compiler = spec.sources.some((s) => /\.(cc|cpp|cxx)$/i.test(s)) ? "em++" : "emcc";

  // Output is written relative to the source dir so --preload-file paths and
  // includes resolve naturally; we place it in the build dir via -o.
  const outFile = path.join(ws.buildDir, `${outName}.js`);
  const emccArgs = [...spec.sources, ...flags, "-o", outFile];

  const mountDir = spec.sourceDir;
  const { command, args } = toolchainCommand(toolchain, compiler, emccArgs, mountDir);

  const result = await run(command, args, { cwd: spec.sourceDir, timeoutMs: 10 * 60 * 1000 });
  await ws.record(`build:${compiler}`, result);

  const artifacts = await findArtifacts(ws.buildDir, outName);
  const ok = result.exitCode === 0 && artifacts.js !== null && artifacts.wasm !== null;

  const buildResult: BuildResult = {
    ok,
    outDir: ws.buildDir,
    jsFile: artifacts.js,
    wasmFile: artifacts.wasm,
    dataFile: artifacts.data,
    flags,
    usedAsyncify: Boolean(spec.useAsyncify),
    usedSetMainLoop: false,
    commands: ws.getCommands(),
  };
  await ws.writeJson("build.json", buildResult);
  return buildResult;
}
