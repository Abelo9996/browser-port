import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppKind, BuildResult, PortAttempt, PortResult, VerifyResult } from "../types.js";
import { inspect } from "./inspect.js";
import { derivePlan } from "./derive.js";
import { diagnoseBuild } from "./diagnose.js";
import { build, type BuildSpec } from "./build.js";
import { packageSite } from "./package.js";
import { verify } from "./verify.js";
import { yieldShimSource, yieldShimWrapFlags } from "./yieldshim.js";
import { Workspace } from "../util/evidence.js";
import { walk } from "../util/scan.js";

export interface PortOptions {
  /** Workspace directory. Defaults to .browser-port/<name> under the cwd. */
  outDir?: string;
  /** Maximum build/verify attempts before giving up. */
  maxAttempts?: number;
  /** Seconds to observe canvas frames during verify. */
  observeSeconds?: number;
  title?: string;
  /** Called with a human-readable line as each step happens. */
  onEvent?: (msg: string) => void;
}

const KNOWN_LIBS = new Set(["SDL2", "SDL2_image", "SDL2_mixer", "SDL2_ttf", "raylib", "OpenGL"]);
const LICENSE_NAMES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.md"];

function isUrl(source: string): boolean {
  return /^(https?:\/\/|git@)/.test(source);
}

function repoName(source: string): string {
  const base = source.replace(/\.git$/, "").replace(/\/+$/, "").split(/[/\\]/).pop() ?? "app";
  return base.replace(/[^A-Za-z0-9._-]/g, "-") || "app";
}

function lastStderr(b: BuildResult): string {
  const last = b.commands[b.commands.length - 1];
  if (!last) return "";
  return `${last.stderrTail}\n${last.stdoutTail}`.trim();
}

function pickScreenshot(v: VerifyResult | null): string | null {
  if (!v || v.screenshots.length === 0) return null;
  return v.screenshots[v.screenshots.length - 1] ?? null;
}

/**
 * The one-command port: inspect, derive the build plan, build with a bounded
 * retry ladder that reads each failure and applies a known fix, then package
 * and verify in headless Chrome. Returns a playable result, or an honest
 * not-supported with the blocker named.
 */
export async function port(source: string, options: PortOptions = {}): Promise<PortResult> {
  const emit = options.onEvent ?? (() => {});
  const name = repoName(source);
  const root = path.resolve(options.outDir ?? path.join(process.cwd(), ".browser-port", name));
  const ws = new Workspace(root);
  await ws.ensure();

  const notes: string[] = [];
  const base: PortResult = {
    ok: false,
    workspace: root,
    supported: true,
    blocker: null,
    attempts: [],
    siteDir: null,
    url: null,
    fps: null,
    screenshot: null,
    mode: "canvas",
    notes,
  };

  // Inspect (clones for URLs). Start from a clean clone directory.
  const cloneDest = path.join(root, "source");
  if (isUrl(source) && existsSync(cloneDest)) await rm(cloneDest, { recursive: true, force: true });
  emit(`inspect ${source}`);
  const report = await inspect(source, { destDir: isUrl(source) ? cloneDest : undefined });
  await ws.writeJson("inspect.json", report);
  const resolvedPath = report.resolvedPath;

  if (report.portability === "not-supported") {
    const b = report.blockers[0];
    const blocker = b ? `${b.what} ${b.fix}` : "Not supported.";
    emit(`not supported: ${blocker}`);
    return { ...base, supported: false, blocker, mode: report.appKind === "stdio" ? "stdio" : "canvas" };
  }

  const mode: "canvas" | "stdio" = report.appKind === "sdl2" || report.appKind === "raylib" ? "canvas" : "stdio";
  base.mode = mode;

  const allFiles = await walk(resolvedPath);
  const plan = await derivePlan(resolvedPath, { entryPoint: report.entryPoint, sourceFiles: report.sourceFiles }, allFiles);
  for (const n of plan.notes) notes.push(n);
  emit(`plan: ${plan.sources.length} source file(s), libs [${report.libraries.map((l) => l.name).join(", ") || "none"}]`);

  const libs = report.libraries.map((l) => l.name).filter((n) => KNOWN_LIBS.has(n));
  const appKind: AppKind = report.appKind === "unknown" ? "stdio" : report.appKind;
  const licenseRel = LICENSE_NAMES.find((n) => existsSync(path.join(resolvedPath, n)));

  const spec: BuildSpec = {
    sourceDir: resolvedPath,
    sources: [...plan.sources],
    appKind,
    preload: plan.preloadDirs,
    preloadMap: plan.preloadMap,
    imageFormats: plan.imageFormats,
    includeDirs: plan.includeDirs,
    useAsyncify: mode === "canvas" && report.usesBlockingMainLoop,
    extraFlags: [],
  };

  const maxAttempts = options.maxAttempts ?? 8;
  const attempts: PortAttempt[] = [];
  const applied = new Set<string>();
  let lastBuild: BuildResult | null = null;
  let lastVerify: VerifyResult | null = null;

  for (let n = 1; n <= maxAttempts; n++) {
    const sourcesComplete = spec.sources.length >= plan.allSources.length;
    emit(`build attempt ${n}: ${spec.sources.join(" ")}  [asyncify=${spec.useAsyncify ? "on" : "off"}]`);
    const b = await build(root, spec, libs);
    lastBuild = b;

    if (!b.ok) {
      const err = lastStderr(b);
      attempts.push({ n, fix: lastFix(applied), sources: [...spec.sources], libs: [...libs], flags: b.flags, asyncify: Boolean(spec.useAsyncify), phase: "build", ok: false, errorTail: err.slice(-800) });
      const fix = diagnoseBuild(err, { libs, sourcesComplete, extraFlags: spec.extraFlags ?? [] });
      if (!fix || applied.has(fix.id)) {
        emit(`build failed, no further fix`);
        return finishFail({ ...base }, attempts, "build did not succeed. Last error:\n" + err.slice(-400));
      }
      emit(`fix: ${fix.reason}`);
      applied.add(fix.id);
      if (fix.addLib && !libs.includes(fix.addLib)) libs.push(fix.addLib);
      if (fix.addFlags) spec.extraFlags = [...(spec.extraFlags ?? []), ...fix.addFlags];
      if (fix.compileAllSources) spec.sources = [...plan.allSources];
      continue;
    }

    emit(`build ok; package + verify`);
    await packageSite(root, b, { title: options.title ?? name, mode, licenseFile: licenseRel ? path.join(resolvedPath, licenseRel) : undefined });
    // Many games sit on a title screen until a confirm key. Send Enter then
    // Space, one per sample step, so a game gated on "press a key" starts and
    // its first moving frame is captured. Interleaving with sampling means a
    // later key that pauses (Space in some games) cannot erase the motion the
    // earlier key already produced.
    const v = await verify(root, {
      mode,
      observeSeconds: options.observeSeconds ?? 4,
      keys: mode === "canvas" ? [{ key: "Enter", afterMs: 0 }, { key: "Space", afterMs: 0 }] : undefined,
    });
    lastVerify = v;
    attempts.push({ n, fix: lastFix(applied), sources: [...spec.sources], libs: [...libs], flags: b.flags, asyncify: Boolean(spec.useAsyncify), phase: "verify", ok: v.ok, errorTail: v.ok ? "" : summarizeVerify(v) });

    if (v.ok) {
      base.ok = true;
      base.siteDir = ws.siteDir;
      base.fps = v.fps ?? null;
      base.screenshot = pickScreenshot(v);
      base.attempts = attempts;
      emit(`verified${v.fps != null ? ` at ${v.fps} fps` : ""}`);
      return base;
    }

    // A wasm trap (unreachable / out-of-bounds / abort) in an otherwise working
    // build is most often the 64 KB default stack overflowing. Give it room.
    const trapped = v.consoleErrors.some((e) => /unreachable|out of bounds|table index|Aborted\b|RuntimeError/i.test(e));
    if (trapped && !applied.has("stack-size")) {
      emit(`verify hit a wasm trap; retrying with a larger stack`);
      applied.add("stack-size");
      spec.extraFlags = [...(spec.extraFlags ?? []), "-sSTACK_SIZE=4194304"];
      continue;
    }

    // A canvas that started but never advanced a frame or changed a pixel is a
    // blocking loop that never yields to the browser (a bare while loop, or a
    // start screen that busy-polls events). Link a build-time yield shim that
    // makes each present and each idle event poll return control to the browser
    // via ASYNCIFY, without touching the game's source.
    const didNotRun = (v.frames ?? 0) === 0 && !v.canvasNonBlank;
    if (mode === "canvas" && didNotRun && !applied.has("yield-shim")) {
      emit(`verify saw a non-yielding loop; retrying with a build-time yield shim (ASYNCIFY + --wrap)`);
      applied.add("yield-shim");
      const shimPath = path.join(root, "build", "__bp_yield_shim.c");
      await mkdir(path.join(root, "build"), { recursive: true });
      await writeFile(shimPath, yieldShimSource());
      if (!spec.sources.includes(shimPath)) spec.sources = [...spec.sources, shimPath];
      spec.useAsyncify = true;
      spec.extraFlags = [...(spec.extraFlags ?? []), ...yieldShimWrapFlags()];
      notes.push("Linked a build-time yield shim (wasm-ld --wrap on SDL_PollEvent/SDL_RenderPresent/SDL_GL_SwapWindow/SDL_UpdateWindowSurface plus ASYNCIFY) so the blocking loop yields to the browser. The game source was not modified.");
      continue;
    }

    return finishFail({ ...base }, attempts, "built and packaged, but verification failed:\n" + summarizeVerify(v));
  }

  return finishFail({ ...base }, attempts, "exhausted build attempts without a working port.");

  function finishFail(r: PortResult, att: PortAttempt[], blocker: string): PortResult {
    r.ok = false;
    r.attempts = att;
    r.blocker = blocker;
    r.siteDir = lastBuild?.ok ? ws.siteDir : null;
    r.screenshot = pickScreenshot(lastVerify);
    r.fps = lastVerify?.fps ?? null;
    return r;
  }
}

function lastFix(applied: Set<string>): string | null {
  const arr = [...applied];
  return arr.length ? arr[arr.length - 1]! : null;
}

function summarizeVerify(v: VerifyResult): string {
  const parts: string[] = [];
  if (v.mode === "canvas") parts.push(`frames=${v.frames ?? 0}, fps=${v.fps ?? 0}, nonBlank=${v.canvasNonBlank ?? false}`);
  if (v.consoleErrors.length) parts.push(`console: ${v.consoleErrors.slice(0, 3).join(" | ")}`);
  if (v.notes.length) parts.push(v.notes.slice(0, 3).join(" | "));
  return parts.join("; ");
}
