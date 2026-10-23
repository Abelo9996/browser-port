import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VerifyResult } from "../types.js";
import { Workspace } from "../util/evidence.js";
import { serve } from "./serve.js";
import { run } from "../util/exec.js";

export interface VerifyOptions {
  mode?: "canvas" | "stdio";
  /** Seconds to observe a canvas app for frames. */
  observeSeconds?: number;
  /** Scripted key presses for a canvas app. */
  keys?: { key: string; afterMs: number }[];
  /** For stdio: a native binary and inputs to compare against. */
  stdio?: {
    nativeBinary?: string;
    cases: { input: string }[];
  };
  crossOriginIsolation?: boolean;
}

interface PlaywrightModule {
  chromium: {
    launch: (opts: { headless: boolean; args?: string[] }) => Promise<{
      newPage: () => Promise<Page>;
      close: () => Promise<void>;
    }>;
  };
}

interface Page {
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  waitForFunction: (fn: string, arg?: unknown, opts?: { timeout?: number }) => Promise<unknown>;
  evaluate: <T>(fn: string) => Promise<T>;
  screenshot: (opts: { path?: string }) => Promise<Buffer>;
  keyboard: { press: (key: string) => Promise<void> };
  on: (event: string, cb: (msg: { type: () => string; text: () => string }) => void) => void;
  waitForTimeout: (ms: number) => Promise<void>;
  $: (selector: string) => Promise<ElementHandle | null>;
}

interface ElementHandle {
  screenshot: (opts: { path?: string }) => Promise<Buffer>;
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    return (await import("playwright")) as unknown as PlaywrightModule;
  } catch {
    return null;
  }
}

const TIMED_OUT = Symbol("timed-out");

/**
 * Race a page operation against a deadline. A program with a blocking main loop
 * that never yields freezes the renderer, and then CDP calls (evaluate,
 * screenshot) queue behind the blocked thread forever. Guarding each call keeps
 * verify bounded so the caller gets an honest "did not run" instead of a hang.
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Open the packaged site in headless Chromium and gather evidence: console
 * errors, whether the canvas draws, frames per second, response to scripted
 * keys, and screenshots. For stdio programs it compares the browser output
 * against a native build for the same inputs.
 */
export async function verify(workspaceRoot: string, options: VerifyOptions = {}): Promise<VerifyResult> {
  const ws = new Workspace(workspaceRoot);
  await ws.ensure();
  const shotsDir = path.join(ws.evidenceDir, "screenshots");
  await mkdir(shotsDir, { recursive: true });

  const mode = options.mode ?? "canvas";
  const pw = await loadPlaywright();
  if (!pw) {
    const result: VerifyResult = {
      ok: false,
      mode,
      consoleErrors: [],
      screenshots: [],
      notes: ["Playwright is not installed. Run `npm i playwright` and `npx playwright install chromium` to enable verify."],
    };
    await ws.writeJson("verify.json", result);
    return result;
  }

  const server = await serve(ws.siteDir, { crossOriginIsolation: options.crossOriginIsolation });
  const browser = await pw.chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  const notes: string[] = [];

  // A program that pins the renderer's CPU in a non-yielding loop can make CDP
  // calls queue forever. A hard overall deadline guarantees verify returns, on
  // top of the per-call timeouts, so the port loop never hangs.
  const overallMs = ((options.observeSeconds ?? 3) + 60) * 1000;

  try {
    const work = mode === "stdio"
      ? verifyStdio(pw, browser, server.url, shotsDir, options, consoleErrors, notes)
      : verifyCanvas(pw, browser, server.url, shotsDir, options, consoleErrors, notes);
    const raced = await withTimeout(work, overallMs);
    const result: VerifyResult = raced === TIMED_OUT
      ? {
          ok: false,
          mode,
          consoleErrors,
          frames: 0,
          fps: 0,
          screenshots: [],
          notes: [...notes, `Verify exceeded its ${Math.round(overallMs / 1000)}s deadline; the program most likely runs a blocking loop that never yields to the browser.`],
        }
      : raced;
    await ws.writeJson("verify.json", result);
    return result;
  } finally {
    await withTimeout(browser.close().catch(() => undefined), 10000);
    await server.close().catch(() => undefined);
  }
}

// A fatal error stops the program: an uncaught JS exception or a wasm trap. A
// program's own logged "ERROR:" line (a missing optional asset, say) is not
// fatal if the frame loop keeps running, so it must not fail an otherwise
// playable port.
const FATAL_RE = /RuntimeError|unreachable|out of bounds|table index|\bAborted\b|uncaught|maximum call stack|cannot enlarge memory|segmentation|null function or function signature mismatch/i;

async function makePage(
  browser: { newPage: () => Promise<Page> },
  errors: string[],
  pageErrors: string[],
): Promise<Page> {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (msg: unknown) => {
    const text = String((msg as { text?: () => string }).text?.() ?? msg);
    pageErrors.push(text);
    errors.push(text);
  });
  return page;
}

function fatalErrors(consoleErrors: string[], pageErrors: string[]): string[] {
  const set = new Set<string>(pageErrors);
  for (const e of consoleErrors) if (FATAL_RE.test(e)) set.add(e);
  return [...set];
}

/** Screenshot just the canvas element to a file, falling back to the full page. */
async function screenshotCanvas(page: Page, file: string): Promise<Buffer | null> {
  const el = await page.$("#canvas");
  if (el) return el.screenshot({ path: file });
  await page.screenshot({ path: file });
  return null;
}

/** Screenshot the canvas to memory for sampling. Returns PNG bytes, or null. */
async function canvasBuffer(page: Page): Promise<Buffer | null> {
  const el = await page.$("#canvas");
  const shot = await withTimeout((el ?? page).screenshot({}), 8000);
  return shot === TIMED_OUT ? null : shot;
}

async function verifyCanvas(
  _pw: PlaywrightModule,
  browser: { newPage: () => Promise<Page> },
  baseUrl: string,
  shotsDir: string,
  options: VerifyOptions,
  consoleErrors: string[],
  notes: string[],
): Promise<VerifyResult> {
  const pageErrors: string[] = [];
  const page = await makePage(browser, consoleErrors, pageErrors);
  const screenshots: string[] = [];
  const gotoResult = await withTimeout(page.goto(baseUrl, { waitUntil: "load", timeout: 25000 }).catch(() => null), 28000);
  if (gotoResult === TIMED_OUT) notes.push("Page did not finish loading within 28s.");

  const started = await withTimeout(
    page.waitForFunction("window.__bp && window.__bp.started === true", undefined, { timeout: 20000 }).then(() => true).catch(() => false),
    22000,
  );
  if (started !== true) notes.push("Runtime did not report started within 20s (a blocking loop that never yields to the browser looks like this).");

  // Fast wedge check: if a trivial evaluate does not return, the renderer's main
  // thread is pinned by a non-yielding loop. Bail now instead of grinding
  // through slow screenshot samples that would each time out.
  const probe = await withTimeout(page.evaluate<number>("1").then(() => true).catch(() => false), 4000);
  if (probe !== true) {
    notes.push("Renderer is unresponsive (a blocking loop that never yields to the browser); treating the run as not playable.");
    return {
      ok: false,
      mode: "canvas",
      consoleErrors,
      canvasNonBlank: false,
      fps: 0,
      frames: 0,
      durationMs: 0,
      screenshots: [],
      notes,
    };
  }

  // A canvas element screenshot composites the real rendered frame, which is a
  // reliable signal. Reading the WebGL buffer directly is not, because SDL does
  // not preserve the drawing buffer between frames.
  const startShot = await withTimeout(screenshotCanvas(page, path.join(shotsDir, "canvas-start.png")), 10000);
  const startBuf = startShot === TIMED_OUT ? null : startShot;
  screenshots.push(path.join(shotsDir, "canvas-start.png"));

  // Measure activity over the observation window. We track two independent
  // signals and accept either: the requestAnimationFrame counter (which
  // emscripten_set_main_loop drives) and pixel changes sampled from the canvas
  // (which also catches an ASYNCIFY + SDL_Delay loop that yields via setTimeout
  // rather than rAF). If reading the frame counter times out, the renderer is
  // wedged behind a blocking loop.
  const observeMs = (options.observeSeconds ?? 3) * 1000;
  const readFrames = async (): Promise<number> => {
    const r = await withTimeout(page.evaluate<number>("window.__bp.frames"), 5000);
    return r === TIMED_OUT ? NaN : r;
  };
  const framesBefore = await readFrames();
  const t0 = Date.now();

  // Sample the canvas a handful of times; "changed" if any sample differs from
  // the first (taken before any key). Nudge keys are pressed one per step,
  // interleaved with sampling, so a game gated on a start key begins and the
  // first moving frame is captured before a later key (for example a pause
  // toggle) can take effect.
  const keySteps = options.keys ?? [];
  const samples: (Buffer | null)[] = [startBuf];
  const sampleCount = Math.max(6, keySteps.length + 2);
  const interval = Math.max(200, Math.floor(observeMs / sampleCount));
  for (let i = 0; i < sampleCount; i++) {
    if (i < keySteps.length) await withTimeout(page.keyboard.press(keySteps[i]!.key), 5000);
    await page.waitForTimeout(interval);
    samples.push(await canvasBuffer(page));
  }
  const framesAfter = await readFrames();
  const elapsed = Date.now() - t0;
  const frozen = Number.isNaN(framesBefore) || Number.isNaN(framesAfter);
  if (frozen) notes.push("Renderer did not respond while observing frames; treating the run as not playable.");
  const frames = frozen ? 0 : framesAfter - framesBefore;
  // fps is only meaningful for a requestAnimationFrame-driven loop. An ASYNCIFY
  // loop that yields via setTimeout reports no rAF frames, so leave fps unset
  // rather than claim zero.
  const fps = frozen ? 0 : frames > 0 ? Math.round((frames / elapsed) * 1000 * 10) / 10 : undefined;

  const endBuf = samples[samples.length - 1] ?? startBuf;
  if (endBuf) await writeFile(path.join(shotsDir, "canvas-end.png"), endBuf);
  else await withTimeout(screenshotCanvas(page, path.join(shotsDir, "canvas-end.png")), 10000);
  screenshots.push(path.join(shotsDir, "canvas-end.png"));

  // Non-blank: a canvas sample either carries detail (a solid fill compresses
  // very small) or differs across samples.
  const SOLID_PNG_MAX = 2000;
  const present = samples.filter((s): s is Buffer => s !== null);
  let sampledChange = false;
  for (let i = 1; i < present.length; i++) if (!present[i]!.equals(present[0]!)) sampledChange = true;
  const hasContent = present.some((s) => s.length > SOLID_PNG_MAX);
  const canvasNonBlank = sampledChange || hasContent;
  if (sampledChange) notes.push("Canvas content changed across the observation window.");

  const errorsRead = await withTimeout(page.evaluate<string[]>("window.__bp.errors"), 5000);
  if (errorsRead !== TIMED_OUT) for (const e of errorsRead) if (!consoleErrors.includes(e)) consoleErrors.push(e);

  // Liveness, not a screenshot, is the real signal: a WebGL canvas clears its
  // drawing buffer after compositing, so a headless screenshot of a game that
  // is plainly running (hundreds of rAF frames, no errors) can still read as
  // blank. Require that it started, is advancing frames (rAF) or visibly
  // changing pixels (ASYNCIFY), and logged no errors. canvasNonBlank stays in
  // the report as supporting evidence.
  const drawing = frames > 0 || sampledChange;
  const fatal = fatalErrors(consoleErrors, pageErrors);
  if (consoleErrors.length > fatal.length) {
    notes.push(`Program logged ${consoleErrors.length - fatal.length} non-fatal error line(s); the frame loop kept running.`);
  }
  const ok = fatal.length === 0 && !frozen && started === true && drawing;
  return {
    ok,
    mode: "canvas",
    consoleErrors,
    canvasNonBlank,
    fps,
    frames,
    durationMs: elapsed,
    screenshots,
    keySteps: keySteps.map((k) => ({ key: k.key, afterMs: k.afterMs })),
    notes,
  };
}

async function verifyStdio(
  _pw: PlaywrightModule,
  browser: { newPage: () => Promise<Page> },
  baseUrl: string,
  shotsDir: string,
  options: VerifyOptions,
  consoleErrors: string[],
  notes: string[],
): Promise<VerifyResult> {
  const cases = options.stdio?.cases ?? [{ input: "" }];
  const comparisons: NonNullable<VerifyResult["stdioComparison"]> = [];
  const screenshots: string[] = [];
  const pageErrors: string[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    const page = await makePage(browser, consoleErrors, pageErrors);
    const encoded = Buffer.from(c.input, "utf8").toString("base64");
    await withTimeout(page.goto(`${baseUrl}?input=${encodeURIComponent(encoded)}`, { waitUntil: "load", timeout: 25000 }).catch(() => null), 28000);
    await withTimeout(
      page
        .waitForFunction("window.__bp && (window.__bp.exitCode !== null || window.__bp.started === true)", undefined, { timeout: 20000 })
        .catch(() => notes.push(`case ${i}: did not reach exit/start within 20s`)),
      22000,
    );
    // Give the program a moment to flush output after start.
    await page.waitForTimeout(500);
    const stdoutRead = await withTimeout(page.evaluate<string>("window.__bp.stdout"), 5000);
    const browserOutput = normalize(stdoutRead === TIMED_OUT ? "" : stdoutRead);

    let nativeOutput = "";
    if (options.stdio?.nativeBinary) {
      const res = await run(options.stdio.nativeBinary, [], { input: c.input, timeoutMs: 15000 });
      nativeOutput = normalize(res.stdout);
    }
    const shot = path.join(shotsDir, `stdio-case-${i}.png`);
    await withTimeout(page.screenshot({ path: shot }), 10000);
    screenshots.push(shot);

    comparisons.push({
      input: c.input,
      nativeOutput,
      browserOutput,
      match: options.stdio?.nativeBinary ? nativeOutput === browserOutput : browserOutput.length > 0,
    });
  }

  const fatal = fatalErrors(consoleErrors, pageErrors);
  const ok = fatal.length === 0 && comparisons.every((c) => c.match);
  return {
    ok,
    mode: "stdio",
    consoleErrors,
    screenshots,
    stdioComparison: comparisons,
    notes,
  };
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}
